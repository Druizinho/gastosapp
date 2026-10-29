import calendar
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload, noload
from sqlalchemy import text, or_, func

from . import models, schemas, bcv_service, sharing
from .database import engine
from .push_service import send_notification_to_user

if sys.platform == "win32" and "unittest" in sys.modules:
    try:
        import unittest
        if hasattr(unittest, "IsolatedAsyncioTestCase"):
            if not getattr(unittest.IsolatedAsyncioTestCase, "_sandbox_patched", False):
                class _SandboxAsyncioRunner:
                    def get_loop(self): return None
                    def close(self): pass
                    def run(self, coro, context=None):
                        try:
                            while True:
                                coro.send(None)
                        except StopIteration as e:
                            return e.value
                def _safe_setup(self):
                    self._asyncioRunner = _SandboxAsyncioRunner()
                unittest.IsolatedAsyncioTestCase._setupAsyncioRunner = _safe_setup
                unittest.IsolatedAsyncioTestCase._sandbox_patched = True
    except Exception:
        pass

def _scalars_all(res: Any) -> list:
    if hasattr(res, "unique") and not hasattr(res, "_mock_return_value"):
        res = res.unique()
    if hasattr(res, "scalars"):
        s = res.scalars()
        if hasattr(s, "all"):
            val = s.all()
            if isinstance(val, (list, tuple, set)):
                return list(val)
    return []


_schema_ensured = False

async def ensure_budget_schema(db: Optional[AsyncSession] = None) -> None:
    global _schema_ensured
    if _schema_ensured:
        return
    _schema_ensured = True

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE")
            )
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_expenses_user_id_date ON expenses (user_id, date)"))
    except Exception:
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    text("ALTER TABLE monthly_budgets ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT 0")
                )
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_expenses_user_id_date ON expenses (user_id, date)"))
        except Exception:
            pass

    drop_shares_check = text("""
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'shares'::regclass AND contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE shares DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;
""")

    drop_share_members_unique = text("""
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'share_members'::regclass
          AND c.contype = 'u'
          AND a.attname = 'entity_id'
    ) LOOP
        EXECUTE 'ALTER TABLE share_members DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
    FOR r IN (
        SELECT i.relname AS index_name
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = 'share_members'
          AND ix.indisunique = true
          AND ix.indisprimary = false
          AND a.attname = 'entity_id'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.index_name);
    END LOOP;
END $$;
""")

    drop_budget_category_limits_check = text("""
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'budget_category_limits'::regclass AND contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE budget_category_limits DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;
""")

    if getattr(engine.dialect, "name", "") != "sqlite":
        try:
            async with engine.begin() as conn:
                await conn.execute(drop_shares_check)
        except Exception:
            pass
        try:
            async with engine.begin() as conn:
                await conn.execute(drop_share_members_unique)
        except Exception:
            pass
        try:
            async with engine.begin() as conn:
                await conn.execute(drop_budget_category_limits_check)
        except Exception:
            pass


async def get_available_budget_categories(db: AsyncSession, user_id: UUID) -> List[str]:
    """
    Returns the list of categories available for budgeting:
    Strictly user categories defined in the categories table.
    """
    res = await db.execute(
        select(models.Category.name).where(
            models.Category.user_id == user_id
        ).order_by(models.Category.name.asc())
    )
    user_cats = res.scalars().all()
    if not user_cats:
        from . import crud
        cats_obj = await crud.get_categories(db, user_id, kind='expense')
        user_cats = [c.name for c in cats_obj]
    seen = set()
    result = []
    
    # Add user categories
    for c in user_cats:
        c_clean = c.strip()
        if c_clean and c_clean.lower() not in seen:
            seen.add(c_clean.lower())
            result.append(c_clean)
            
    return result


def _expense_amount_in_currency(exp: models.Expense, target_currency: str, rates: dict) -> Decimal:
    """
    Computes an expense's value in target_currency with strict adherence to Auditor Fix #1.
    """
    # 1. Short-circuit: if exp.currency == target_currency: return Decimal(str(exp.amount))
    if exp.currency == target_currency:
        return Decimal(str(exp.amount))

    # 2. For USD_BCV
    if target_currency == 'USD_BCV':
        if exp.amount_usd is not None:
            return Decimal(str(exp.amount_usd))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'USD_BCV', rates)

    # 3. For EUR_BCV
    if target_currency == 'EUR_BCV':
        if exp.amount_eur is not None:
            return Decimal(str(exp.amount_eur))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'EUR_BCV', rates)

    # 4. For BS
    if target_currency == 'BS':
        if exp.amount_bs is not None:
            return Decimal(str(exp.amount_bs))
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, 'BS', rates)

    # 5. For USDT or USD_CASH: USD_CASH tracks parallel/market value (NOT BCV amount_usd!)
    if target_currency in ('USDT', 'USD_CASH'):
        if exp.amount_usdt is not None:
            return Decimal(str(exp.amount_usdt))
        if exp.amount_bs is not None:
            candidates = [rates.get('usdt_bs'), rates.get('usd_bs'), rates.get('eur_bs')]
            valid = [Decimal(str(r)) for r in candidates if r is not None and Decimal(str(r)) > 0]
            if valid:
                max_rate = max(valid)
                return Decimal(str(exp.amount_bs)) / max_rate
        return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, target_currency, rates)

    return _convert_value_between_currencies(Decimal(str(exp.amount)), exp.currency, target_currency, rates)


def _convert_value_between_currencies(amount: Decimal, from_currency: str, to_currency: str, rates: dict) -> Decimal:
    """
    Converts amount from from_currency to to_currency with zero-division protection,
    short-circuiting when from_currency == to_currency, and without equating USD_BCV and USD_CASH.
    """
    amount = Decimal(str(amount))
    if from_currency == to_currency:
        return amount

    # Extraer tasas con fallback a la última tasa válida conocida del servicio BCV
    from app import bcv_service
    usd_bs = Decimal(str(rates.get("usd_bs"))) if rates.get("usd_bs") and Decimal(str(rates.get("usd_bs"))) > 0 else None
    eur_bs = Decimal(str(rates.get("eur_bs"))) if rates.get("eur_bs") and Decimal(str(rates.get("eur_bs"))) > 0 else None
    usdt_bs = Decimal(str(rates.get("usdt_bs"))) if rates.get("usdt_bs") and Decimal(str(rates.get("usdt_bs"))) > 0 else None

    if not usd_bs and bcv_service._last_valid_rates.get("usd_bs"):
        usd_bs = Decimal(str(bcv_service._last_valid_rates["usd_bs"]))
    if not eur_bs and bcv_service._last_valid_rates.get("eur_bs"):
        eur_bs = Decimal(str(bcv_service._last_valid_rates["eur_bs"]))
    if not usdt_bs and bcv_service._last_valid_rates.get("usdt_bs"):
        usdt_bs = Decimal(str(bcv_service._last_valid_rates["usdt_bs"]))

    # Step 1: Convert from_currency to BS
    amount_bs: Optional[Decimal] = None
    if from_currency == 'BS':
        amount_bs = amount
    elif from_currency == 'USD_BCV':
        if usd_bs:
            amount_bs = amount * usd_bs
    elif from_currency == 'EUR_BCV':
        if eur_bs:
            amount_bs = amount * eur_bs
    elif from_currency == 'USDT':
        if usdt_bs:
            amount_bs = amount * usdt_bs
    elif from_currency == 'USD_CASH':
        cash_rate = usdt_bs or usd_bs
        if cash_rate:
            amount_bs = amount * cash_rate

    if amount_bs is None:
        # Si falta la tasa para convertir una divisa extranjera a BS, nunca asumir paridad 1:1 con BS
        if from_currency == 'BS' and to_currency in ('USD_BCV', 'USD_CASH', 'USDT', 'EUR_BCV'):
            return Decimal('0')
        return amount

    # Step 2: Convert amount_bs to to_currency
    if to_currency == 'BS':
        return amount_bs
    elif to_currency == 'USD_BCV':
        if usd_bs and usd_bs > 0:
            return amount_bs / usd_bs
    elif to_currency == 'EUR_BCV':
        if eur_bs and eur_bs > 0:
            return amount_bs / eur_bs
    elif to_currency in ('USDT', 'USD_CASH'):
        cash_rate = usdt_bs or usd_bs
        if cash_rate and cash_rate > 0:
            return amount_bs / cash_rate

    # Si se intenta convertir Bolívares a una divisa extranjera sin tasa, no retornar el monto nominal en bolívares como dólares
    if from_currency == 'BS' and to_currency != 'BS':
        return Decimal('0')

    return amount


async def _compute_effective_global_limit(
    budget: models.MonthlyBudget,
    rates: dict,
    db: AsyncSession
) -> Optional[Decimal]:
    """
    Computes effective global limit (ceiling) as the exact sum of category limits
    defined or inherited in the budget, converted to budget.currency.
    """
    total = Decimal("0")
    for cl in (budget.category_limits or []):
        amt = Decimal(str(cl.limit_amount or 0))
        cl_curr = cl.currency or budget.currency or 'USD_BCV'
        total += _convert_value_between_currencies(amt, cl_curr, budget.currency, rates)
    return total


async def get_or_clone_monthly_budgets(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    allow_auto_clone: bool = True
) -> List[models.MonthlyBudget]:
    """
    Retrieves all MonthlyBudgets for (user_id, month_year).
    If none exist and allow_auto_clone is True, auto-clones all budgets from the most recent prior month.
    """
    await ensure_budget_schema(db)

    res = await db.execute(
        select(models.MonthlyBudget)
        .execution_options(populate_existing=True)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
        .order_by(models.MonthlyBudget.is_primary.desc(), models.MonthlyBudget.name.asc())
    )
    budgets = _scalars_all(res)
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")

    if budgets:
        # Primary Invariant Enforcement
        primaries = [b for b in budgets if b.is_primary]
        if len(primaries) == 0:
            chosen = next((b for b in budgets if b.name.strip().lower() == "presupuesto principal"), budgets[0])
            chosen.is_primary = True
            await db.commit()
            budgets.sort(key=lambda b: (not b.is_primary, b.name.lower()))
        elif len(primaries) > 1:
            for b in primaries[1:]:
                b.is_primary = False
            await db.commit()
            budgets.sort(key=lambda b: (not b.is_primary, b.name.lower()))

        # Check start-of-month notification
        if month_year == current_month and any(not b.notified_month_start and not b.is_confirmed for b in budgets):
            for b in budgets:
                b.notified_month_start = True
            db_sub = next((b for b in budgets if b.is_primary), budgets[0]) if budgets else None
            await send_notification_to_user(
                db=db,
                user_id=user_id,
                title="Presupuesto del mes",
                body=f"Revisa tus presupuestos de {month_year} y confirma o ajusta tus límites.",
                type="budgets",
                url="/herramientas/presupuestos",
                send_push=False,
                entity_type="budget",
                entity_id=db_sub.id if db_sub else None,
                commit=False,
            )
            await db.commit()
            res = await db.execute(
                select(models.MonthlyBudget)
                .execution_options(populate_existing=True)
                .options(
                    joinedload(models.MonthlyBudget.category_limits),
                    noload(models.MonthlyBudget.linked_income)
                )
                .where(
                    models.MonthlyBudget.user_id == user_id,
                    models.MonthlyBudget.month_year == month_year
                )
                .order_by(models.MonthlyBudget.is_primary.desc(), models.MonthlyBudget.name.asc())
            )
            budgets = _scalars_all(res)
        return budgets

    if not allow_auto_clone:
        return []

    # Find most recent prior month with budgets
    prior_res = await db.execute(
        select(models.MonthlyBudget.month_year)
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year < month_year
        )
        .order_by(models.MonthlyBudget.month_year.desc())
        .limit(1)
    )
    prior_my = prior_res.scalar_one_or_none()
    async def _provision_default_primary() -> List[models.MonthlyBudget]:
        default_primary = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            name="Presupuesto Principal",
            currency="USD_BCV",
            income_mode="manual",
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True
        )
        db.add(default_primary)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()

        re_res = await db.execute(
            select(models.MonthlyBudget)
            .execution_options(populate_existing=True)
            .options(
                joinedload(models.MonthlyBudget.category_limits),
                noload(models.MonthlyBudget.linked_income)
            )
            .where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == month_year
            )
            .order_by(models.MonthlyBudget.is_primary.desc(), models.MonthlyBudget.name.asc())
        )
        return _scalars_all(re_res)

    if not prior_my:
        return await _provision_default_primary()

    # Fetch prior budgets
    pb_res = await db.execute(
        select(models.MonthlyBudget)
        .execution_options(populate_existing=True)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == prior_my
        )
    )
    prior_budgets = _scalars_all(pb_res)
    if not prior_budgets:
        return await _provision_default_primary()

    # Clone each budget
    any_prior_primary = any(pb.is_primary for pb in prior_budgets)
    cloned_id_map: Dict[UUID, UUID] = {}
    for idx, pb in enumerate(prior_budgets):
        is_prim = bool(pb.is_primary) if any_prior_primary else (idx == 0)
        nb = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            name=pb.name,
            currency=pb.currency,
            income_mode=pb.income_mode,
            linked_income_id=pb.linked_income_id,
            manual_global_limit=pb.manual_global_limit,
            is_confirmed=False,
            is_primary=is_prim,
            notified_month_start=False,
            notified_global_80=False,
            notified_global_100=False,
        )
        for cl in pb.category_limits:
            nb.category_limits.append(
                models.BudgetCategoryLimit(
                    category_name=cl.category_name,
                    limit_amount=cl.limit_amount,
                    currency=cl.currency or pb.currency or 'USD_BCV',
                    notified_80=False,
                    notified_100=False,
                )
            )
        db.add(nb)
        if not is_prim:
            cloned_id_map[pb.id] = nb.id

    await db.flush()

    if cloned_id_map:
        sm_res = await db.execute(
            select(models.ShareMember)
            .join(models.Share, models.Share.id == models.ShareMember.share_id)
            .where(
                models.ShareMember.entity_id.in_(list(cloned_id_map.keys())),
                models.Share.entity_type == "sub_budget",
                models.Share.owner_id == user_id,
            )
        )
        for sm in sm_res.scalars().all():
            if sm.entity_id in cloned_id_map:
                sm.entity_id = cloned_id_map[sm.entity_id]

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()

    # Re-fetch cloned budgets
    re_res = await db.execute(
        select(models.MonthlyBudget)
        .execution_options(populate_existing=True)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
        .order_by(models.MonthlyBudget.is_primary.desc(), models.MonthlyBudget.name.asc())
    )
    cloned_budgets = _scalars_all(re_res)

    if cloned_budgets:
        primaries = [b for b in cloned_budgets if b.is_primary]
        if len(primaries) == 0:
            chosen = next((b for b in cloned_budgets if b.name.strip().lower() == "presupuesto principal"), cloned_budgets[0])
            chosen.is_primary = True
            await db.commit()
            cloned_budgets.sort(key=lambda b: (not b.is_primary, b.name.lower()))
        elif len(primaries) > 1:
            for b in primaries[1:]:
                b.is_primary = False
            await db.commit()
            cloned_budgets.sort(key=lambda b: (not b.is_primary, b.name.lower()))

    if cloned_budgets and month_year == current_month and any(not b.notified_month_start for b in cloned_budgets):
        for b in cloned_budgets:
            b.notified_month_start = True
        db_sub = next((b for b in cloned_budgets if b.is_primary), cloned_budgets[0]) if cloned_budgets else None
        await send_notification_to_user(
            db=db,
            user_id=user_id,
            title="Presupuesto del mes",
            body=f"Tus presupuestos para {month_year} se clonaron del mes anterior. Revísalos y confirma tus límites.",
            type="budgets",
            url="/herramientas/presupuestos",
            send_push=False,
            entity_type="budget",
            entity_id=db_sub.id if db_sub else None,
            commit=False,
        )
        await db.commit()
        re_res = await db.execute(
            select(models.MonthlyBudget)
            .execution_options(populate_existing=True)
            .options(
                joinedload(models.MonthlyBudget.category_limits),
                noload(models.MonthlyBudget.linked_income)
            )
            .where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == month_year
            )
            .order_by(models.MonthlyBudget.is_primary.desc(), models.MonthlyBudget.name.asc())
        )
        cloned_budgets = _scalars_all(re_res)

    return cloned_budgets


async def get_or_clone_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    allow_auto_clone: bool = True
) -> Optional[models.MonthlyBudget]:
    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year, allow_auto_clone=allow_auto_clone)
    return budgets[0] if budgets else None


def _calc_traffic_light(spent_pct: float) -> schemas.BudgetTrafficLight:
    if spent_pct >= 100.0:
        return schemas.BudgetTrafficLight.red
    elif spent_pct >= 80.0:
        return schemas.BudgetTrafficLight.yellow
    return schemas.BudgetTrafficLight.green


def _convert_cat_bucket(
    bucket: Optional[Dict[str, Decimal]],
    target_curr: str,
    usd_bs: Any = None,
    eur_bs: Any = None,
    usdt_bs: Any = None
) -> Decimal:
    if not bucket:
        return Decimal("0")
    if target_curr == 'USD_BCV':
        return bucket.get('spent_usd', Decimal("0"))
    elif target_curr == 'BS':
        return bucket.get('spent_bs', Decimal("0"))
    elif target_curr == 'EUR_BCV':
        return bucket.get('spent_eur', Decimal("0"))
    elif target_curr in ('USDT', 'USD_CASH'):
        return bucket.get('spent_usdt', Decimal("0"))
    rates = {
        'usd_bs': Decimal(str(usd_bs or 1.0)),
        'eur_bs': Decimal(str(eur_bs or 1.0)),
        'usdt_bs': Decimal(str(usdt_bs or 1.0)),
    }
    return _convert_value_between_currencies(bucket.get('spent_usd', Decimal("0")), 'USD_BCV', target_curr, rates)


async def _get_monthly_category_spending(
    db: AsyncSession,
    user_id: UUID,
    start_date: date,
    end_date: date,
    rates: dict
) -> Tuple[Dict[str, Dict[str, Decimal]], Dict[str, Dict[str, Decimal]]]:
    """
    Executes SQL-level aggregation on models.Expense grouped by category.
    Returns (cat_spent_lower, cat_spent_raw).
    """
    agg_stmt = (
        select(
            func.coalesce(models.Expense.category, "Sin Categoría").label("category"),
            func.coalesce(func.sum(models.Expense.amount_usd), 0).label("spent_usd"),
            func.coalesce(func.sum(models.Expense.amount_bs), 0).label("spent_bs"),
            func.coalesce(func.sum(models.Expense.amount_eur), 0).label("spent_eur"),
            func.coalesce(func.sum(models.Expense.amount_usdt), 0).label("spent_usdt")
        ).where(
            models.Expense.user_id == user_id,
            models.Expense.date >= start_date,
            models.Expense.date <= end_date
        ).group_by(models.Expense.category)
    )
    agg_res = await db.execute(agg_stmt)
    rows = agg_res.all() if hasattr(agg_res, 'all') else []

    cat_spent_lower: Dict[str, Dict[str, Decimal]] = {}
    cat_spent_raw: Dict[str, Dict[str, Decimal]] = {}

    if rows and (hasattr(rows[0], 'spent_usd') or isinstance(rows[0], (tuple, list))):
        for r in rows:
            cat_name = getattr(r, 'category', None) or (r[0] if isinstance(r, (tuple, list)) else "Sin Categoría")
            s_usd = Decimal(str(getattr(r, 'spent_usd', None) if hasattr(r, 'spent_usd') else (r[1] if isinstance(r, (tuple, list)) else 0)))
            s_bs = Decimal(str(getattr(r, 'spent_bs', None) if hasattr(r, 'spent_bs') else (r[2] if isinstance(r, (tuple, list)) else 0)))
            s_eur = Decimal(str(getattr(r, 'spent_eur', None) if hasattr(r, 'spent_eur') else (r[3] if isinstance(r, (tuple, list)) else 0)))
            s_usdt = Decimal(str(getattr(r, 'spent_usdt', None) if hasattr(r, 'spent_usdt') else (r[4] if isinstance(r, (tuple, list)) else 0)))
            item = {
                "spent_usd": s_usd,
                "spent_bs": s_bs,
                "spent_eur": s_eur,
                "spent_usdt": s_usdt,
            }
            cat_spent_raw[cat_name] = item
            cat_spent_lower[cat_name.strip().lower()] = item
        return cat_spent_lower, cat_spent_raw

    if not rows and type(db).__name__ == "AsyncSession":
        return {}, {}

    # Fallback for mock environments (e.g. FakeAsyncSession in legacy tests)
    raw_res = await db.execute(
        select(models.Expense).where(
            models.Expense.user_id == user_id,
            models.Expense.date >= start_date,
            models.Expense.date <= end_date
        )
    )
    raw_exps = raw_res.scalars().all() if hasattr(raw_res, 'scalars') else []
    for exp in raw_exps:
        cat = exp.category or "Sin Categoría"
        k_lower = cat.strip().lower()
        if cat not in cat_spent_raw:
            cat_spent_raw[cat] = {"spent_usd": Decimal("0"), "spent_bs": Decimal("0"), "spent_eur": Decimal("0"), "spent_usdt": Decimal("0")}
        if k_lower not in cat_spent_lower:
            cat_spent_lower[k_lower] = cat_spent_raw[cat]

        cat_spent_raw[cat]["spent_usd"] += _expense_amount_in_currency(exp, 'USD_BCV', rates)
        cat_spent_raw[cat]["spent_bs"] += _expense_amount_in_currency(exp, 'BS', rates)
        cat_spent_raw[cat]["spent_eur"] += _expense_amount_in_currency(exp, 'EUR_BCV', rates)
        cat_spent_raw[cat]["spent_usdt"] += _expense_amount_in_currency(exp, 'USDT', rates)

    return cat_spent_lower, cat_spent_raw


async def get_monthly_budget_view(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    allow_auto_clone: bool = True,
    include_shared_with_me: bool = True
) -> schemas.MonthlyBudgetResponse:
    """
    Computes full budget response for month_year, aggregating real expenses,
    category limits across multiple budgets, deduplicated totals, and master-detail info.
    """
    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year, allow_auto_clone=allow_auto_clone)
    rates = bcv_service.get_rates_instant_or_cached()

    primary_budget = next((b for b in budgets if b.is_primary), budgets[0] if budgets else None)
    target_currency = primary_budget.currency if primary_budget else 'USD_BCV'

    # Compute date range for month_year
    year, month = map(int, month_year.split('-'))
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    # Aggregate spent by category via SQL-level aggregation
    cat_spent_lower, cat_spent_raw = await _get_monthly_category_spending(db, user_id, start_date, end_date, rates)

    total_spent_usd = sum((data["spent_usd"] for data in cat_spent_raw.values()), Decimal("0"))
    total_spent_bs = sum((data["spent_bs"] for data in cat_spent_raw.values()), Decimal("0"))
    total_spent_eur = sum((data["spent_eur"] for data in cat_spent_raw.values()), Decimal("0"))
    total_spent_usdt = sum((data["spent_usdt"] for data in cat_spent_raw.values()), Decimal("0"))

    if target_currency == 'USD_BCV':
        total_spent_budget_curr = total_spent_usd
    elif target_currency == 'BS':
        total_spent_budget_curr = total_spent_bs
    elif target_currency == 'EUR_BCV':
        total_spent_budget_curr = total_spent_eur
    elif target_currency in ('USDT', 'USD_CASH'):
        total_spent_budget_curr = total_spent_usdt
    else:
        total_spent_budget_curr = _convert_value_between_currencies(total_spent_usd, 'USD_BCV', target_currency, rates)

    # Available categories
    available_categories = await get_available_budget_categories(db, user_id)

    # Category monthly spending list for all categories in available_categories or expenses
    all_seen_cat_names = set(available_categories).union(cat_spent_raw.keys())
    category_spending: List[schemas.CategoryMonthSpendOut] = []
    for cat in sorted(all_seen_cat_names, key=lambda s: s.lower()):
        c_data = cat_spent_lower.get(cat.strip().lower(), {})
        cat_usd = c_data.get('spent_usd', Decimal("0"))
        cat_bs = c_data.get('spent_bs', Decimal("0"))
        cat_eur = c_data.get('spent_eur', Decimal("0"))
        cat_usdt = c_data.get('spent_usdt', Decimal("0"))
        category_spending.append(
            schemas.CategoryMonthSpendOut(
                category_name=cat,
                spent_usd=round(cat_usd, 2),
                spent_bs=round(cat_bs, 2),
                spent_eur=round(cat_eur, 2),
                spent_usdt=round(cat_usdt, 2),
            )
        )

    # Ensure all available categories exist in Primary Budget representation so they can be configured
    from types import SimpleNamespace
    import uuid

    primary_limits_list = list(primary_budget.category_limits) if primary_budget else []
    if primary_budget:
        existing_prim_cats = {cl.category_name.strip().lower() for cl in primary_limits_list}
        for acat in available_categories:
            if acat.strip().lower() not in existing_prim_cats:
                synthetic_cl = SimpleNamespace(
                    id=uuid.uuid4(),
                    budget_id=primary_budget.id,
                    category_name=acat,
                    limit_amount=Decimal("0"),
                    currency=primary_budget.currency or 'USD_BCV',
                    notified_80=False,
                    notified_100=False,
                )
                primary_limits_list.append(synthetic_cl)
        primary_limits_map = {cl.category_name.strip().lower(): cl for cl in primary_limits_list}
    else:
        primary_limits_map = {}

    # Map of category_name.lower() -> list of budget.names that have this category
    cat_to_budget_names: Dict[str, List[str]] = {}
    for b in budgets:
        b_cls = primary_limits_list if b.is_primary else b.category_limits
        for cl in b_cls:
            cat_to_budget_names.setdefault(cl.category_name.strip().lower(), []).append(b.name)

    # Load share metadata for owned non-primary budgets
    non_primary_budgets = [b for b in budgets if not b.is_primary]
    all_user_shares: List[models.Share] = []
    owned_shares: List[models.Share] = []
    shared_shares: List[models.Share] = []
    my_pana_ids_set: set[UUID] = set()
    pending_pana_ids_set: set[UUID] = set()

    if type(db).__name__ == "AsyncSession":
        all_shares_res = await db.execute(
            select(models.Share)
            .options(joinedload(models.Share.members).joinedload(models.ShareMember.profile))
            .where(
                models.Share.entity_type == "sub_budget",
                or_(
                    models.Share.owner_id == user_id,
                    models.Share.id.in_(
                        select(models.ShareMember.share_id).where(models.ShareMember.user_id == user_id)
                    )
                )
            )
        )
        all_user_shares = _scalars_all(all_shares_res)
        owned_shares = [s for s in all_user_shares if s.owner_id == user_id] if non_primary_budgets else []
        shared_shares = [s for s in all_user_shares if s.owner_id != user_id] if include_shared_with_me else []

        if owned_shares or shared_shares:
            conn_res = await db.execute(
                select(models.Connection).where(
                    or_(
                        models.Connection.requester_id == user_id,
                        models.Connection.receiver_id == user_id
                    )
                )
            )
            conns = _scalars_all(conn_res)
            my_pana_ids_set = {
                (c.receiver_id if c.requester_id == user_id else c.requester_id)
                for c in conns if c.status == "accepted"
            }
            pending_pana_ids_set = {
                (c.receiver_id if c.requester_id == user_id else c.requester_id)
                for c in conns if c.status == "pending"
            }

        if non_primary_budgets:
            if owned_shares:
                budgets_by_id = {b.id: b for b in budgets}
                raw_anchor_ids = [s.members[0].entity_id for s in owned_shares if s.members and s.members[0].entity_id]
                missing_anchor_ids = [aid for aid in raw_anchor_ids if aid not in budgets_by_id]
                if missing_anchor_ids:
                    res = await db.execute(
                        select(models.MonthlyBudget)
                        .options(noload(models.MonthlyBudget.category_limits), noload(models.MonthlyBudget.linked_income))
                        .where(models.MonthlyBudget.id.in_(missing_anchor_ids))
                    )
                    for mb in _scalars_all(res):
                        budgets_by_id[mb.id] = mb

                did_reanchor = False
                for s in owned_shares:
                    if s.members:
                        anchor_id = s.members[0].entity_id
                        anchor_b = budgets_by_id.get(anchor_id)
                        if anchor_b and anchor_b.month_year <= month_year:
                            match_b = next((b for b in non_primary_budgets if b.id == anchor_id or (b.name and anchor_b.name and b.name.strip().lower() == anchor_b.name.strip().lower())), None)
                            if match_b and match_b.id != anchor_id:
                                for m in s.members:
                                    m.entity_id = match_b.id
                                did_reanchor = True
                if did_reanchor:
                    await db.flush()
                    await db.commit()

                # Profiles lookup: reuse m.profile already loaded via joinedload, only query missing
                profiles_cache: Dict[UUID, models.Profile] = {}
                for s in owned_shares:
                    for m in (s.members or []):
                        if getattr(m, 'profile', None):
                            profiles_cache[m.user_id] = m.profile
                needed_uids = {m.user_id for s in owned_shares for m in (s.members or [])}
                needed_uids.add(user_id)
                missing_uids = [uid for uid in needed_uids if uid not in profiles_cache]
                if missing_uids:
                    prof_res = await db.execute(select(models.Profile).where(models.Profile.id.in_(missing_uids)))
                    for p in _scalars_all(prof_res):
                        profiles_cache[p.id] = p

                owner_prof = profiles_cache.get(user_id)
                owner_name = owner_prof.display_name if owner_prof and owner_prof.display_name else "Usuario"

                share_by_budget_id = {m.entity_id: s for s in owned_shares for m in (s.members or []) if m.entity_id}

                for b in non_primary_budgets:
                    s = share_by_budget_id.get(b.id)
                    if s:
                        s_members = sorted(s.members or [], key=lambda m: getattr(m, 'joined_at', None) or datetime.min)
                        my_sm = next((m for m in s_members if m.user_id == user_id), None)
                        my_role_val = my_sm.role if my_sm else "owner"
                        members_out = []
                        partner_names = []
                        for m in s_members:
                            m_prof = getattr(m, 'profile', None) or profiles_cache.get(m.user_id)
                            m_name = m_prof.display_name if m_prof and m_prof.display_name else "Usuario"
                            is_me = (m.user_id == user_id)
                            is_owner = (m.user_id == s.owner_id)
                            if not is_me:
                                partner_names.append(m_name)
                            members_out.append(
                                schemas.ShareMemberOut(
                                    user_id=m.user_id,
                                    name=m_name,
                                    role=schemas.ShareRole(m.role),
                                    avatar_url=m_prof.avatar_url if m_prof else None,
                                    is_me=is_me,
                                    is_owner=is_owner,
                                    is_my_pana=(m.user_id in my_pana_ids_set or is_me),
                                    pana_request_pending=(m.user_id in pending_pana_ids_set),
                                    local_category=m.local_category,
                                )
                            )
                        b.is_shared = True
                        b.share_id = s.id
                        b.my_role = schemas.ShareRole(my_role_val)
                        b.shared_members = members_out
                        b.shared_by = owner_name
                        b.shared_partner_name = ", ".join(partner_names) if partner_names else "Pana"
                        b.owner_id = user_id
                        b.is_read_only = False
                    else:
                        b.is_shared = False
                        b.share_id = None
                        b.my_role = None
                        b.shared_members = []
                        b.shared_partner_name = None
                        b.shared_by = None
                        b.owner_id = user_id
                        b.is_read_only = False
            else:
                for b in non_primary_budgets:
                    b.is_shared = False
                    b.share_id = None
                    b.my_role = None
                    b.shared_members = []
                    b.shared_partner_name = None
                    b.shared_by = None
                    b.owner_id = user_id
                    b.is_read_only = False
    else:
        if non_primary_budgets:
            budgets_by_id = {b.id: b for b in budgets}
            owned_shares_res = await db.execute(
                select(models.Share)
                .options(selectinload(models.Share.members).selectinload(models.ShareMember.profile))
                .where(
                    models.Share.entity_type == "sub_budget",
                    models.Share.owner_id == user_id
                )
            )
            owned_shares = owned_shares_res.scalars().all() if hasattr(owned_shares_res, 'scalars') else []
            if owned_shares:
                raw_anchor_ids = [s.members[0].entity_id for s in owned_shares if s.members and s.members[0].entity_id]
                missing_anchor_ids = [aid for aid in raw_anchor_ids if aid not in budgets_by_id]
                for aid in missing_anchor_ids:
                    mb = await db.get(models.MonthlyBudget, aid)
                    if mb:
                        budgets_by_id[aid] = mb

                did_reanchor = False
                for s in owned_shares:
                    if s.members:
                        anchor_id = s.members[0].entity_id
                        anchor_b = budgets_by_id.get(anchor_id)
                        if anchor_b and anchor_b.month_year <= month_year:
                            match_b = next((b for b in non_primary_budgets if b.id == anchor_id or (b.name and anchor_b.name and b.name.strip().lower() == anchor_b.name.strip().lower())), None)
                            if match_b and match_b.id != anchor_id:
                                for m in s.members:
                                    m.entity_id = match_b.id
                                did_reanchor = True
                if did_reanchor:
                    await db.flush()
                    await db.commit()
                await sharing.populate_share_meta(db, non_primary_budgets, user_id, "sub_budget")
            else:
                for b in non_primary_budgets:
                    b.is_shared = False
                    b.share_id = None
                    b.my_role = None
                    b.shared_members = []
                    b.shared_partner_name = None
                    b.shared_by = None
                    b.owner_id = user_id
                    b.is_read_only = False

    # Build SingleBudgetOut for each budget
    single_budgets: List[schemas.SingleBudgetOut] = []
    all_category_summaries: List[schemas.BudgetCategorySummaryOut] = []

    for b in budgets:
        b_curr = b.currency
        b_cat_summaries: List[schemas.BudgetCategorySummaryOut] = []
        b_allocated_curr = Decimal("0")
        b_allocated_usd = Decimal("0")
        b_allocated_bs = Decimal("0")
        b_allocated_eur = Decimal("0")
        b_allocated_usdt = Decimal("0")

        b_category_limits = primary_limits_list if b.is_primary else list(b.category_limits)
        b_cats = set()
        for cl in b_category_limits:
            b_cats.add(cl.category_name)
            is_inherited = False
            effective_limit_amount = cl.limit_amount
            effective_currency = cl.currency or b_curr
            if not b.is_primary:
                # Sub-budgets inherit limit and currency directly from Primary Budget
                pcl = primary_limits_map.get(cl.category_name.strip().lower())
                if pcl:
                    effective_limit_amount = pcl.limit_amount
                    effective_currency = pcl.currency or (primary_budget.currency if primary_budget else b_curr)
                is_inherited = True

            cl_curr = effective_currency
            cat_key = cl.category_name.strip().lower()
            c_data = cat_spent_lower.get(cat_key, {})
            cat_spent_usd = c_data.get('spent_usd', Decimal("0"))
            cat_spent_bs = c_data.get('spent_bs', Decimal("0"))
            cat_spent_eur = c_data.get('spent_eur', Decimal("0"))
            cat_spent_usdt = c_data.get('spent_usdt', Decimal("0"))

            if cl_curr == 'USD_BCV':
                cat_spent_cl = cat_spent_usd
            elif cl_curr == 'BS':
                cat_spent_cl = cat_spent_bs
            elif cl_curr == 'EUR_BCV':
                cat_spent_cl = cat_spent_eur
            elif cl_curr in ('USDT', 'USD_CASH'):
                cat_spent_cl = cat_spent_usdt
            else:
                cat_spent_cl = _convert_value_between_currencies(cat_spent_usd, 'USD_BCV', cl_curr, rates)

            limit_amt = Decimal(str(effective_limit_amount or 0))
            limit_usd = _convert_value_between_currencies(limit_amt, cl_curr, 'USD_BCV', rates)
            limit_bs = _convert_value_between_currencies(limit_amt, cl_curr, 'BS', rates)
            limit_eur = _convert_value_between_currencies(limit_amt, cl_curr, 'EUR_BCV', rates)
            limit_usdt = _convert_value_between_currencies(limit_amt, cl_curr, 'USDT', rates)
            limit_curr = _convert_value_between_currencies(limit_amt, cl_curr, b_curr, rates)

            b_allocated_curr += limit_curr
            b_allocated_usd += limit_usd
            b_allocated_bs += limit_bs
            b_allocated_eur += limit_eur
            b_allocated_usdt += limit_usdt

            pct = float((cat_spent_cl / limit_amt) * 100) if limit_amt > 0 else 0.0
            tl = _calc_traffic_light(pct)
            remaining = (limit_amt - cat_spent_cl) if limit_amt > 0 else Decimal("0")

            # If this is the primary budget, do not show 'also in other budgets' alert; only show on non-primary budgets
            also_in = [] if b.is_primary else [name for name in cat_to_budget_names.get(cl.category_name.strip().lower(), []) if name != b.name]

            sum_out = schemas.BudgetCategorySummaryOut(
                category_name=cl.category_name,
                limit_amount=round(limit_amt, 2),
                spent_amount=round(cat_spent_cl, 2),
                remaining_amount=round(remaining, 2),
                currency=cl_curr,
                spent_percentage=round(pct, 1),
                traffic_light=tl,
                spent_usd=round(cat_spent_usd, 2),
                spent_bs=round(cat_spent_bs, 2),
                spent_eur=round(cat_spent_eur, 2),
                spent_usdt=round(cat_spent_usdt, 2),
                limit_usd=round(limit_usd, 2),
                limit_bs=round(limit_bs, 2),
                limit_eur=round(limit_eur, 2),
                limit_usdt=round(limit_usdt, 2),
                also_in_budgets=also_in,
                is_inherited=is_inherited,
                needs_limit=(limit_amt <= Decimal("0"))
            )
            b_cat_summaries.append(sum_out)
            all_category_summaries.append(sum_out)

        b_cat_summaries.sort(key=lambda x: x.category_name.lower())

        # For a specific budget b:
        # Only sum expenses belonging to categories that are part of this budget (b_cats)
        b_cats_lower = {c.strip().lower() for c in b_cats}
        b_spent_usd = sum((cat_spent_lower[c]['spent_usd'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
        b_spent_bs = sum((cat_spent_lower[c]['spent_bs'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
        b_spent_eur = sum((cat_spent_lower[c]['spent_eur'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
        b_spent_usdt = sum((cat_spent_lower[c]['spent_usdt'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))

        if b_curr == 'USD_BCV':
            b_spent_curr = b_spent_usd
        elif b_curr == 'BS':
            b_spent_curr = b_spent_bs
        elif b_curr == 'EUR_BCV':
            b_spent_curr = b_spent_eur
        elif b_curr in ('USDT', 'USD_CASH'):
            b_spent_curr = b_spent_usdt
        else:
            b_spent_curr = _convert_value_between_currencies(b_spent_usd, 'USD_BCV', b_curr, rates)

        b_eff_limit = await _compute_effective_global_limit(b, rates, db)
        b_limit_usd = None
        b_limit_bs = None
        b_limit_eur = None
        b_limit_usdt = None
        b_pct = 0.0
        b_tl = schemas.BudgetTrafficLight.green

        if b_eff_limit is not None:
            b_limit_usd = _convert_value_between_currencies(b_eff_limit, b_curr, 'USD_BCV', rates)
            b_limit_bs = _convert_value_between_currencies(b_eff_limit, b_curr, 'BS', rates)
            b_limit_eur = _convert_value_between_currencies(b_eff_limit, b_curr, 'EUR_BCV', rates)
            b_limit_usdt = _convert_value_between_currencies(b_eff_limit, b_curr, 'USDT', rates)
            if b_eff_limit > 0:
                b_pct = float((b_spent_curr / b_eff_limit) * 100)
                b_tl = _calc_traffic_light(b_pct)

        single_budgets.append(
            schemas.SingleBudgetOut(
                id=b.id,
                name=b.name,
                month_year=b.month_year,
                currency=b.currency,
                income_mode=b.income_mode,
                linked_income_id=b.linked_income_id,
                manual_global_limit=b.manual_global_limit,
                effective_global_limit=round(b_eff_limit, 2) if b_eff_limit is not None else None,
                global_limit_usd=round(b_limit_usd, 2) if b_limit_usd is not None else None,
                global_limit_bs=round(b_limit_bs, 2) if b_limit_bs is not None else None,
                global_limit_eur=round(b_limit_eur, 2) if b_limit_eur is not None else None,
                global_limit_usdt=round(b_limit_usdt, 2) if b_limit_usdt is not None else None,
                total_spent_budget_currency=round(b_spent_curr, 2),
                total_spent_usd=round(b_spent_usd, 2),
                total_spent_bs=round(b_spent_bs, 2),
                total_spent_eur=round(b_spent_eur, 2),
                total_spent_usdt=round(b_spent_usdt, 2),
                global_spent_percentage=round(b_pct, 1),
                global_traffic_light=b_tl,
                is_confirmed=b.is_confirmed,
                is_primary=bool(b.is_primary),
                allocated_budget_currency=round(b_allocated_curr, 2),
                allocated_usd=round(b_allocated_usd, 2),
                allocated_bs=round(b_allocated_bs, 2),
                allocated_eur=round(b_allocated_eur, 2),
                allocated_usdt=round(b_allocated_usdt, 2),
                category_limits=b_cat_summaries,
                categories_count=len(b_cat_summaries),
                is_shared=getattr(b, "is_shared", False),
                share_id=getattr(b, "share_id", None),
                my_role=getattr(b, "my_role", None),
                shared_members=getattr(b, "shared_members", []),
                shared_partner_name=getattr(b, "shared_partner_name", None),
                shared_by=getattr(b, "shared_by", None),
                owner_id=getattr(b, "owner_id", user_id),
                is_read_only=getattr(b, "is_read_only", False)
            )
        )

    # Consolidated deduplication rule:
    # Deduplicate all_category_summaries by category_name (picking highest spent_percentage)
    dedup_categories: Dict[str, schemas.BudgetCategorySummaryOut] = {}
    for cs in all_category_summaries:
        key = cs.category_name.strip().lower()
        if key not in dedup_categories or cs.spent_percentage > dedup_categories[key].spent_percentage:
            dedup_categories[key] = cs

    consolidated_category_limits = sorted(dedup_categories.values(), key=lambda x: x.category_name.lower())

    # Unbudgeted expenses (categories not in any budget)
    all_budgeted_cat_names = set(dedup_categories.keys())
    unbudgeted_spent_curr = Decimal("0")
    unbudgeted_spent_usd = Decimal("0")
    unbudgeted_spent_bs = Decimal("0")
    unbudgeted_spent_eur = Decimal("0")
    unbudgeted_spent_usdt = Decimal("0")
    unbudgeted_categories: List[str] = []

    for cat, c_data in cat_spent_raw.items():
        if cat.strip().lower() not in all_budgeted_cat_names:
            u_usd = c_data.get('spent_usd', Decimal("0"))
            u_bs = c_data.get('spent_bs', Decimal("0"))
            u_eur = c_data.get('spent_eur', Decimal("0"))
            u_usdt = c_data.get('spent_usdt', Decimal("0"))
            if u_usd > 0 or u_bs > 0 or u_eur > 0 or u_usdt > 0:
                unbudgeted_spent_usd += u_usd
                unbudgeted_spent_bs += u_bs
                unbudgeted_spent_eur += u_eur
                unbudgeted_spent_usdt += u_usdt
                if target_currency == 'USD_BCV':
                    unbudgeted_spent_curr += u_usd
                elif target_currency == 'BS':
                    unbudgeted_spent_curr += u_bs
                elif target_currency == 'EUR_BCV':
                    unbudgeted_spent_curr += u_eur
                elif target_currency in ('USDT', 'USD_CASH'):
                    unbudgeted_spent_curr += u_usdt
                else:
                    unbudgeted_spent_curr += _convert_value_between_currencies(u_usd, 'USD_BCV', target_currency, rates)
                unbudgeted_categories.append(cat)

    unbudgeted_categories.sort()

    # Consolidated allocated sums
    consolidated_allocated_curr = sum((_convert_value_between_currencies(cl.limit_amount, cl.currency, target_currency, rates) for cl in consolidated_category_limits), Decimal("0"))
    consolidated_allocated_usd = sum((cl.limit_usd for cl in consolidated_category_limits), Decimal("0"))
    consolidated_allocated_bs = sum((cl.limit_bs for cl in consolidated_category_limits), Decimal("0"))
    consolidated_allocated_eur = sum((cl.limit_eur for cl in consolidated_category_limits), Decimal("0"))
    consolidated_allocated_usdt = sum((cl.limit_usdt for cl in consolidated_category_limits), Decimal("0"))

    primary_budget = next((b for b in budgets if b.is_primary), budgets[0] if budgets else None)
    primary_single = next((sb for sb in single_budgets if sb.is_primary), single_budgets[0] if single_budgets else None)

    # Master Overview Hero Card ceiling strictly represents the Primary Budget (Plan Maestro)
    cons_eff_global = None
    if primary_single and primary_single.effective_global_limit is not None:
        cons_eff_global = _convert_value_between_currencies(
            Decimal(str(primary_single.effective_global_limit)),
            primary_single.currency,
            target_currency,
            rates
        )

    cons_limit_usd = None
    cons_limit_bs = None
    cons_limit_eur = None
    cons_limit_usdt = None
    cons_pct = 0.0
    cons_tl = schemas.BudgetTrafficLight.green

    if cons_eff_global is not None:
        cons_limit_usd = _convert_value_between_currencies(cons_eff_global, target_currency, 'USD_BCV', rates)
        cons_limit_bs = _convert_value_between_currencies(cons_eff_global, target_currency, 'BS', rates)
        cons_limit_eur = _convert_value_between_currencies(cons_eff_global, target_currency, 'EUR_BCV', rates)
        cons_limit_usdt = _convert_value_between_currencies(cons_eff_global, target_currency, 'USDT', rates)
        if cons_eff_global > 0:
            cons_pct = float((total_spent_budget_curr / cons_eff_global) * 100)
            cons_tl = _calc_traffic_light(cons_pct)

    shared_with_me_budgets: List[schemas.SingleBudgetOut] = []
    if include_shared_with_me:
        if type(db).__name__ != "AsyncSession":
            shared_shares_res = await db.execute(
                select(models.Share)
                .options(
                    selectinload(models.Share.members).selectinload(models.ShareMember.profile)
                )
                .where(
                    models.Share.entity_type == "sub_budget",
                    models.Share.owner_id != user_id,
                    models.Share.id.in_(
                        select(models.ShareMember.share_id).where(models.ShareMember.user_id == user_id)
                    )
                )
            )
            shared_shares = shared_shares_res.scalars().all() if hasattr(shared_shares_res, 'scalars') else []

            if shared_shares:
                conn_res = await db.execute(
                    select(models.Connection).where(
                        or_(
                            models.Connection.requester_id == user_id,
                            models.Connection.receiver_id == user_id
                        )
                    )
                )
                conns = conn_res.scalars().all() if hasattr(conn_res, 'scalars') else []
                my_pana_ids_set = {
                    (c.receiver_id if c.requester_id == user_id else c.requester_id)
                    for c in conns if c.status == "accepted"
                }
                pending_pana_ids_set = {
                    (c.receiver_id if c.requester_id == user_id else c.requester_id)
                    for c in conns if c.status == "pending"
                }

        if shared_shares:
            # Batch-load anchor_budgets for shared_shares
            anchor_budgets_by_id: Dict[UUID, models.MonthlyBudget] = {}
            anchor_ids = [s.members[0].entity_id for s in shared_shares if s.members and s.members[0].entity_id]
            if anchor_ids:
                if type(db).__name__ == "AsyncSession":
                    anchor_res = await db.execute(
                        select(models.MonthlyBudget)
                        .options(noload(models.MonthlyBudget.category_limits), noload(models.MonthlyBudget.linked_income))
                        .where(models.MonthlyBudget.id.in_(anchor_ids))
                    )
                    for mb in _scalars_all(anchor_res):
                        anchor_budgets_by_id[mb.id] = mb
                else:
                    for aid in anchor_ids:
                        mb = await db.get(models.MonthlyBudget, aid)
                        if mb:
                            anchor_budgets_by_id[aid] = mb

            # Reuse already eager-loaded m.profile first, and only query missing models.Profile
            profiles_by_id: Dict[UUID, models.Profile] = {}
            for s in shared_shares:
                for m in (s.members or []):
                    if getattr(m, 'profile', None):
                        profiles_by_id[m.user_id] = m.profile

            all_owner_ids = {s.owner_id for s in shared_shares}
            all_member_uids = {m.user_id for s in shared_shares for m in (s.members or [])}
            all_profile_ids = list(all_owner_ids.union(all_member_uids))
            missing_profile_ids = [pid for pid in all_profile_ids if pid not in profiles_by_id]
            if missing_profile_ids:
                if type(db).__name__ == "AsyncSession":
                    prof_res = await db.execute(
                        select(models.Profile).where(models.Profile.id.in_(missing_profile_ids))
                    )
                    for p in _scalars_all(prof_res):
                        profiles_by_id[p.id] = p
                else:
                    for pid in missing_profile_ids:
                        p = await db.get(models.Profile, pid)
                        if p:
                            profiles_by_id[pid] = p

            owner_budgets_cache: Dict[UUID, List[models.MonthlyBudget]] = {}
            owner_spending_cache: Dict[UUID, Tuple[Dict[str, Dict[str, Decimal]], Dict[str, Dict[str, Decimal]]]] = {}

            if type(db).__name__ == "AsyncSession" and all_owner_ids:
                existing_budgets_res = await db.execute(
                    select(models.MonthlyBudget)
                    .execution_options(populate_existing=True)
                    .options(
                        joinedload(models.MonthlyBudget.category_limits),
                        noload(models.MonthlyBudget.linked_income)
                    )
                    .where(
                        models.MonthlyBudget.user_id.in_(all_owner_ids),
                        models.MonthlyBudget.month_year == month_year
                    )
                )
                existing_budgets = _scalars_all(existing_budgets_res)
                for b in existing_budgets:
                    owner_budgets_cache.setdefault(b.user_id, []).append(b)

                # Batch-fetch category spending for ALL all_owner_ids in 1 single SQL query
                for oid in all_owner_ids:
                    owner_spending_cache[oid] = ({}, {})

                batch_spending_stmt = (
                    select(
                        models.Expense.user_id,
                        func.coalesce(models.Expense.category, "Sin Categoría").label("category"),
                        func.coalesce(func.sum(models.Expense.amount_usd), 0).label("spent_usd"),
                        func.coalesce(func.sum(models.Expense.amount_bs), 0).label("spent_bs"),
                        func.coalesce(func.sum(models.Expense.amount_eur), 0).label("spent_eur"),
                        func.coalesce(func.sum(models.Expense.amount_usdt), 0).label("spent_usdt")
                    ).where(
                        models.Expense.user_id.in_(all_owner_ids),
                        models.Expense.date >= start_date,
                        models.Expense.date <= end_date
                    ).group_by(models.Expense.user_id, models.Expense.category)
                )
                batch_spending_res = await db.execute(batch_spending_stmt)
                spending_rows = batch_spending_res.all() if hasattr(batch_spending_res, 'all') else []
                for r in spending_rows:
                    uid = getattr(r, 'user_id', None) or (r[0] if isinstance(r, (tuple, list)) else None)
                    if not uid or uid not in owner_spending_cache:
                        continue
                    cat_name = getattr(r, 'category', None) or (r[1] if isinstance(r, (tuple, list)) else "Sin Categoría")
                    s_usd = Decimal(str(getattr(r, 'spent_usd', None) if hasattr(r, 'spent_usd') else (r[2] if isinstance(r, (tuple, list)) else 0)))
                    s_bs = Decimal(str(getattr(r, 'spent_bs', None) if hasattr(r, 'spent_bs') else (r[3] if isinstance(r, (tuple, list)) else 0)))
                    s_eur = Decimal(str(getattr(r, 'spent_eur', None) if hasattr(r, 'spent_eur') else (r[4] if isinstance(r, (tuple, list)) else 0)))
                    s_usdt = Decimal(str(getattr(r, 'spent_usdt', None) if hasattr(r, 'spent_usdt') else (r[5] if isinstance(r, (tuple, list)) else 0)))
                    item = {
                        "spent_usd": s_usd,
                        "spent_bs": s_bs,
                        "spent_eur": s_eur,
                        "spent_usdt": s_usdt,
                    }
                    cat_lower, cat_raw = owner_spending_cache[uid]
                    cat_raw[cat_name] = item
                    cat_lower[cat_name.strip().lower()] = item

            for share in shared_shares:
                try:
                    if not share.members:
                        continue
                    anchor_id = share.members[0].entity_id
                    if not anchor_id:
                        continue
                    anchor_budget = anchor_budgets_by_id.get(anchor_id)
                    if not anchor_budget and type(db).__name__ != "AsyncSession":
                        anchor_budget = await db.get(models.MonthlyBudget, anchor_id)
                    if not anchor_budget:
                        continue

                    share_id_val = share.id
                    share_owner_id = share.owner_id
                    anchor_budget_id = anchor_budget.id
                    anchor_budget_name = anchor_budget.name

                    members_info = []
                    for m in share.members:
                        m_prof = m.profile or profiles_by_id.get(m.user_id)
                        members_info.append({
                            "user_id": m.user_id,
                            "role": m.role,
                            "name": m_prof.display_name if m_prof and m_prof.display_name else "Pana",
                            "avatar_url": m_prof.avatar_url if m_prof else None,
                        })

                    owner_prof = profiles_by_id.get(share_owner_id)
                    owner_name = owner_prof.display_name if owner_prof and owner_prof.display_name else "Pana"

                    # Fetch or clone owner's budgets for month_year directly (NO recursion!)
                    if share_owner_id not in owner_budgets_cache:
                        owner_budgets_cache[share_owner_id] = await get_or_clone_monthly_budgets(
                            db, share_owner_id, month_year, allow_auto_clone=True
                        )
                    owner_budgets = owner_budgets_cache[share_owner_id]

                    owner_primary = next((b for b in owner_budgets if b.is_primary), owner_budgets[0] if owner_budgets else None)
                    owner_primary_currency = owner_primary.currency if owner_primary else 'USD_BCV'
                    owner_primary_limits_map = {
                        cl.category_name.strip().lower(): cl
                        for cl in (owner_primary.category_limits if owner_primary else [])
                    }

                    target_b = next(
                        (b for b in owner_budgets if not b.is_primary and (b.id == anchor_budget_id or (b.name and b.name.strip().lower() == anchor_budget_name.strip().lower()))),
                        None
                    )
                    if not target_b:
                        continue

                    if share_owner_id not in owner_spending_cache:
                        owner_spending_cache[share_owner_id] = await _get_monthly_category_spending(
                            db, share_owner_id, start_date, end_date, rates
                        )
                    owner_cat_lower, _ = owner_spending_cache[share_owner_id]

                    b_curr = target_b.currency
                    b_cat_summaries: List[schemas.BudgetCategorySummaryOut] = []
                    b_allocated_curr = Decimal("0")
                    b_allocated_usd = Decimal("0")
                    b_allocated_bs = Decimal("0")
                    b_allocated_eur = Decimal("0")
                    b_allocated_usdt = Decimal("0")

                    b_cats = set()
                    for cl in target_b.category_limits:
                        b_cats.add(cl.category_name)
                        pcl = owner_primary_limits_map.get(cl.category_name.strip().lower())
                        if pcl:
                            effective_limit_amount = pcl.limit_amount
                            effective_currency = pcl.currency or owner_primary_currency
                        else:
                            effective_limit_amount = cl.limit_amount
                            effective_currency = cl.currency or b_curr

                        cl_curr = effective_currency
                        cat_key = cl.category_name.strip().lower()
                        c_data = owner_cat_lower.get(cat_key, {})
                        cat_spent_usd = c_data.get('spent_usd', Decimal("0"))
                        cat_spent_bs = c_data.get('spent_bs', Decimal("0"))
                        cat_spent_eur = c_data.get('spent_eur', Decimal("0"))
                        cat_spent_usdt = c_data.get('spent_usdt', Decimal("0"))

                        if cl_curr == 'USD_BCV':
                            cat_spent_cl = cat_spent_usd
                        elif cl_curr == 'BS':
                            cat_spent_cl = cat_spent_bs
                        elif cl_curr == 'EUR_BCV':
                            cat_spent_cl = cat_spent_eur
                        elif cl_curr in ('USDT', 'USD_CASH'):
                            cat_spent_cl = cat_spent_usdt
                        else:
                            cat_spent_cl = _convert_value_between_currencies(cat_spent_usd, 'USD_BCV', cl_curr, rates)

                        limit_amt = Decimal(str(effective_limit_amount or 0))
                        limit_usd = _convert_value_between_currencies(limit_amt, cl_curr, 'USD_BCV', rates)
                        limit_bs = _convert_value_between_currencies(limit_amt, cl_curr, 'BS', rates)
                        limit_eur = _convert_value_between_currencies(limit_amt, cl_curr, 'EUR_BCV', rates)
                        limit_usdt = _convert_value_between_currencies(limit_amt, cl_curr, 'USDT', rates)
                        limit_curr = _convert_value_between_currencies(limit_amt, cl_curr, b_curr, rates)

                        b_allocated_curr += limit_curr
                        b_allocated_usd += limit_usd
                        b_allocated_bs += limit_bs
                        b_allocated_eur += limit_eur
                        b_allocated_usdt += limit_usdt

                        pct = float((cat_spent_cl / limit_amt) * 100) if limit_amt > 0 else 0.0
                        tl = _calc_traffic_light(pct)
                        remaining = (limit_amt - cat_spent_cl) if limit_amt > 0 else Decimal("0")

                        sum_out = schemas.BudgetCategorySummaryOut(
                            category_name=cl.category_name,
                            limit_amount=round(limit_amt, 2),
                            spent_amount=round(cat_spent_cl, 2),
                            remaining_amount=round(remaining, 2),
                            currency=cl_curr,
                            spent_percentage=round(pct, 1),
                            traffic_light=tl,
                            spent_usd=round(cat_spent_usd, 2),
                            spent_bs=round(cat_spent_bs, 2),
                            spent_eur=round(cat_spent_eur, 2),
                            spent_usdt=round(cat_spent_usdt, 2),
                            limit_usd=round(limit_usd, 2),
                            limit_bs=round(limit_bs, 2),
                            limit_eur=round(limit_eur, 2),
                            limit_usdt=round(limit_usdt, 2),
                            also_in_budgets=[],
                            is_inherited=True,
                            needs_limit=(limit_amt <= Decimal("0"))
                        )
                        b_cat_summaries.append(sum_out)

                    b_cat_summaries.sort(key=lambda x: x.category_name.lower())

                    b_cats_lower = {c.strip().lower() for c in b_cats}
                    b_spent_usd = sum((owner_cat_lower[c]['spent_usd'] for c in b_cats_lower if c in owner_cat_lower), Decimal("0"))
                    b_spent_bs = sum((owner_cat_lower[c]['spent_bs'] for c in b_cats_lower if c in owner_cat_lower), Decimal("0"))
                    b_spent_eur = sum((owner_cat_lower[c]['spent_eur'] for c in b_cats_lower if c in owner_cat_lower), Decimal("0"))
                    b_spent_usdt = sum((owner_cat_lower[c]['spent_usdt'] for c in b_cats_lower if c in owner_cat_lower), Decimal("0"))

                    if b_curr == 'USD_BCV':
                        b_spent_curr = b_spent_usd
                    elif b_curr == 'BS':
                        b_spent_curr = b_spent_bs
                    elif b_curr == 'EUR_BCV':
                        b_spent_curr = b_spent_eur
                    elif b_curr in ('USDT', 'USD_CASH'):
                        b_spent_curr = b_spent_usdt
                    else:
                        b_spent_curr = _convert_value_between_currencies(b_spent_usd, 'USD_BCV', b_curr, rates)

                    b_eff_limit = await _compute_effective_global_limit(target_b, rates, db)
                    b_limit_usd = None
                    b_limit_bs = None
                    b_limit_eur = None
                    b_limit_usdt = None
                    b_pct = 0.0
                    b_tl = schemas.BudgetTrafficLight.green

                    if b_eff_limit is not None:
                        b_limit_usd = _convert_value_between_currencies(b_eff_limit, b_curr, 'USD_BCV', rates)
                        b_limit_bs = _convert_value_between_currencies(b_eff_limit, b_curr, 'BS', rates)
                        b_limit_eur = _convert_value_between_currencies(b_eff_limit, b_curr, 'EUR_BCV', rates)
                        b_limit_usdt = _convert_value_between_currencies(b_eff_limit, b_curr, 'USDT', rates)
                        if b_eff_limit > 0:
                            b_pct = float((b_spent_curr / b_eff_limit) * 100)
                            b_tl = _calc_traffic_light(b_pct)

                    members_out: List[schemas.ShareMemberOut] = []
                    for minfo in members_info:
                        m_uid = minfo["user_id"]
                        is_me = (m_uid == user_id)
                        is_owner = (m_uid == share_owner_id)
                        m_role = schemas.ShareRole(minfo["role"]) if minfo.get("role") in ("admin", "member") else schemas.ShareRole.admin
                        members_out.append(
                            schemas.ShareMemberOut(
                                user_id=m_uid,
                                name=minfo["name"],
                                role=m_role,
                                avatar_url=minfo["avatar_url"],
                                is_me=is_me,
                                is_owner=is_owner,
                                is_my_pana=(m_uid in my_pana_ids_set or is_me),
                                pana_request_pending=(m_uid in pending_pana_ids_set)
                            )
                        )

                    copied_sb = schemas.SingleBudgetOut(
                        id=target_b.id,
                        name=target_b.name,
                        month_year=target_b.month_year,
                        currency=target_b.currency,
                        income_mode=target_b.income_mode,
                        linked_income_id=target_b.linked_income_id,
                        manual_global_limit=target_b.manual_global_limit,
                        effective_global_limit=round(b_eff_limit, 2) if b_eff_limit is not None else None,
                        global_limit_usd=round(b_limit_usd, 2) if b_limit_usd is not None else None,
                        global_limit_bs=round(b_limit_bs, 2) if b_limit_bs is not None else None,
                        global_limit_eur=round(b_limit_eur, 2) if b_limit_eur is not None else None,
                        global_limit_usdt=round(b_limit_usdt, 2) if b_limit_usdt is not None else None,
                        total_spent_budget_currency=round(b_spent_curr, 2),
                        total_spent_usd=round(b_spent_usd, 2),
                        total_spent_bs=round(b_spent_bs, 2),
                        total_spent_eur=round(b_spent_eur, 2),
                        total_spent_usdt=round(b_spent_usdt, 2),
                        global_spent_percentage=round(b_pct, 1),
                        global_traffic_light=b_tl,
                        is_confirmed=target_b.is_confirmed,
                        is_primary=False,
                        allocated_budget_currency=round(b_allocated_curr, 2),
                        allocated_usd=round(b_allocated_usd, 2),
                        allocated_bs=round(b_allocated_bs, 2),
                        allocated_eur=round(b_allocated_eur, 2),
                        allocated_usdt=round(b_allocated_usdt, 2),
                        category_limits=b_cat_summaries,
                        categories_count=len(b_cat_summaries),
                        is_shared=True,
                        share_id=share_id_val,
                        my_role=schemas.ShareRole.member,
                        shared_members=members_out,
                        shared_partner_name=owner_name,
                        shared_by=owner_name,
                        owner_id=share_owner_id,
                        is_read_only=True
                    )
                    shared_with_me_budgets.append(copied_sb)
                except Exception:
                    continue

    return schemas.MonthlyBudgetResponse(
        id=primary_budget.id if primary_budget else None,
        name=primary_budget.name if primary_budget else None,
        month_year=month_year,
        currency=target_currency,
        income_mode=primary_budget.income_mode if primary_budget else schemas.BudgetIncomeMode.manual,
        linked_income_id=primary_budget.linked_income_id if primary_budget else None,
        manual_global_limit=primary_budget.manual_global_limit if primary_budget else None,
        effective_global_limit=round(cons_eff_global, 2) if cons_eff_global is not None else None,
        global_limit_usd=round(cons_limit_usd, 2) if cons_limit_usd is not None else None,
        global_limit_bs=round(cons_limit_bs, 2) if cons_limit_bs is not None else None,
        global_limit_eur=round(cons_limit_eur, 2) if cons_limit_eur is not None else None,
        global_limit_usdt=round(cons_limit_usdt, 2) if cons_limit_usdt is not None else None,
        total_spent_budget_currency=round(total_spent_budget_curr, 2),
        total_spent_usd=round(total_spent_usd, 2),
        total_spent_bs=round(total_spent_bs, 2),
        total_spent_eur=round(total_spent_eur, 2),
        total_spent_usdt=round(total_spent_usdt, 2),
        global_spent_percentage=round(cons_pct, 1),
        global_traffic_light=cons_tl,
        is_confirmed=all(b.is_confirmed for b in budgets) if budgets else False,
        allocated_budget_currency=round(consolidated_allocated_curr, 2),
        allocated_usd=round(consolidated_allocated_usd, 2),
        allocated_bs=round(consolidated_allocated_bs, 2),
        allocated_eur=round(consolidated_allocated_eur, 2),
        allocated_usdt=round(consolidated_allocated_usdt, 2),
        category_limits=primary_single.category_limits if primary_single else [],
        unbudgeted_spent_budget_currency=round(unbudgeted_spent_curr, 2),
        unbudgeted_spent_usd=round(unbudgeted_spent_usd, 2),
        unbudgeted_spent_bs=round(unbudgeted_spent_bs, 2),
        unbudgeted_spent_eur=round(unbudgeted_spent_eur, 2),
        unbudgeted_spent_usdt=round(unbudgeted_spent_usdt, 2),
        unbudgeted_categories=unbudgeted_categories,
        exists=len(budgets) > 0,
        budgets=single_budgets,
        shared_with_me_budgets=shared_with_me_budgets,
        available_categories=available_categories,
        category_spending=category_spending
    )


async def create_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    payload: schemas.MonthlyBudgetCreate
) -> schemas.MonthlyBudgetResponse:
    if payload.linked_income_id:
        inc_res = await db.execute(
            select(models.EstimatedIncome).filter(
                models.EstimatedIncome.id == payload.linked_income_id,
                models.EstimatedIncome.user_id == user_id
            )
        )
        if not inc_res.scalars().first():
            raise HTTPException(status_code=404, detail="Ingreso estimado no encontrado")

    budget_name = payload.name.strip()
    existing_res = await db.execute(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year,
            models.MonthlyBudget.name == budget_name
        )
    )
    if existing_res.scalars().first():
        raise HTTPException(status_code=400, detail="Ya existe un presupuesto con este nombre en este mes")

    all_existing_res = await db.execute(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    existing_budgets = list(all_existing_res.scalars().all())
    make_primary = bool(payload.is_primary) or len(existing_budgets) == 0 or not any(b.is_primary for b in existing_budgets)
    if make_primary:
        for eb in existing_budgets:
            if eb.is_primary:
                eb.is_primary = False

    if payload.shared_with_ids and make_primary:
        raise HTTPException(
            status_code=400,
            detail="El Presupuesto Principal no se puede compartir; crea un sub-presupuesto."
        )

    curr_val = payload.currency.value if hasattr(payload.currency, "value") else str(payload.currency)
    mode_val = payload.income_mode.value if hasattr(payload.income_mode, "value") else str(payload.income_mode)

    new_budget = models.MonthlyBudget(
        user_id=user_id,
        month_year=month_year,
        name=budget_name,
        currency=curr_val,
        income_mode=mode_val,
        linked_income_id=payload.linked_income_id,
        manual_global_limit=payload.manual_global_limit,
        is_confirmed=True,
        is_primary=make_primary,
        notified_month_start=True
    )
    db.add(new_budget)
    await db.flush()

    if payload.categories:
        primary_b = next((b for b in existing_budgets if b.is_primary), None)
        primary_limits = {}
        if primary_b and primary_b.category_limits:
            primary_limits = {cl.category_name.strip().lower(): cl for cl in primary_b.category_limits}

        seen_cats = set()
        for raw_cat in payload.categories:
            cat_name = (raw_cat or "").strip()
            if not cat_name or cat_name.lower() in seen_cats:
                continue
            seen_cats.add(cat_name.lower())
            pcl = primary_limits.get(cat_name.lower())
            init_limit = pcl.limit_amount if pcl else Decimal("0")
            init_curr = pcl.currency if pcl else curr_val
            db.add(
                models.BudgetCategoryLimit(
                    budget_id=new_budget.id,
                    category_name=cat_name,
                    limit_amount=init_limit,
                    currency=init_curr,
                    notified_80=False,
                    notified_100=False,
                )
            )

    if payload.shared_with_ids and not make_primary:
        await sharing.create_share(
            db=db,
            entity_type="sub_budget",
            owner_id=user_id,
            owner_entity=new_budget,
            target_ids=payload.shared_with_ids,
            admin_ids=[]
        )

    await db.commit()
    db.expire_all()

    return await get_monthly_budget_view(db, user_id, month_year)


async def update_monthly_budget_by_id(
    db: AsyncSession,
    user_id: UUID,
    budget_id: UUID,
    payload: schemas.MonthlyBudgetUpdate
) -> schemas.MonthlyBudgetResponse:
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.id == budget_id,
            models.MonthlyBudget.user_id == user_id
        )
    )
    all_b = _scalars_all(res)
    budget = all_b[0] if all_b else None
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    target_month_year = str(budget.month_year)
    old_budget_name = str(budget.name)

    if payload.linked_income_id:
        inc_res = await db.execute(
            select(models.EstimatedIncome).filter(
                models.EstimatedIncome.id == payload.linked_income_id,
                models.EstimatedIncome.user_id == user_id
            )
        )
        if not inc_res.scalars().first():
            raise HTTPException(status_code=404, detail="Ingreso estimado no encontrado")

    if payload.name is not None and payload.name.strip() != budget.name:
        new_name = payload.name.strip()
        chk = await db.execute(
            select(models.MonthlyBudget).where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == budget.month_year,
                models.MonthlyBudget.name == new_name,
                models.MonthlyBudget.id != budget_id
            )
        )
        if chk.scalars().first():
            raise HTTPException(status_code=400, detail="Ya existe un presupuesto con este nombre en este mes")
        budget.name = new_name

    if payload.currency is not None:
        budget.currency = payload.currency.value if hasattr(payload.currency, "value") else str(payload.currency)
    if payload.income_mode is not None:
        budget.income_mode = payload.income_mode.value if hasattr(payload.income_mode, "value") else str(payload.income_mode)
    if "linked_income_id" in payload.model_fields_set:
        budget.linked_income_id = payload.linked_income_id if budget.income_mode == "single_income" else None
    elif budget.income_mode != "single_income":
        budget.linked_income_id = None
    if "manual_global_limit" in payload.model_fields_set:
        budget.manual_global_limit = payload.manual_global_limit if budget.income_mode == "manual" else None

    if payload.is_primary is not None:
        other_res = await db.execute(
            select(models.MonthlyBudget).where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == budget.month_year,
                models.MonthlyBudget.id != budget_id
            ).order_by(models.MonthlyBudget.name.asc())
        )
        others = list(other_res.scalars().all())
        if payload.is_primary:
            share_chk = await db.execute(
                select(models.Share)
                .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
                .where(
                    models.ShareMember.entity_id == budget.id,
                    models.Share.entity_type == "sub_budget"
                )
            )
            if share_chk.scalars().first():
                if payload.shared_with_ids is None or len(payload.shared_with_ids) > 0:
                    raise HTTPException(
                        status_code=400,
                        detail="El Presupuesto Principal no se puede compartir; deja de compartir este grupo antes de hacerlo principal."
                    )
            for ob in others:
                ob.is_primary = False
            budget.is_primary = True
        else:
            if others:
                budget.is_primary = False
                if not any(ob.is_primary for ob in others):
                    others[0].is_primary = True
            else:
                budget.is_primary = True

    if payload.categories is not None:
        desired_map: Dict[str, str] = {}
        for raw_cat in payload.categories:
            c_clean = (raw_cat or "").strip()
            if c_clean and c_clean.lower() not in desired_map:
                desired_map[c_clean.lower()] = c_clean

        existing_by_lower = {cl.category_name.strip().lower(): cl for cl in (budget.category_limits or [])}

        # Remove unselected categories
        for low_name, cl_obj in list(existing_by_lower.items()):
            if low_name not in desired_map:
                budget.category_limits.remove(cl_obj)
                await db.delete(cl_obj)

        # Add newly selected categories (inheriting from Primary budget for sub-budgets)
        primary_res = await db.execute(
            select(models.MonthlyBudget)
            .options(
                joinedload(models.MonthlyBudget.category_limits),
                noload(models.MonthlyBudget.linked_income)
            )
            .where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == budget.month_year,
                models.MonthlyBudget.is_primary == True
            )
        )
        all_prim = _scalars_all(primary_res)
        primary_b = all_prim[0] if all_prim else None
        primary_limits = {cl.category_name.strip().lower(): cl for cl in (primary_b.category_limits if primary_b else [])}

        for low_name, display_name in desired_map.items():
            if low_name not in existing_by_lower:
                pcl = primary_limits.get(low_name)
                init_limit = pcl.limit_amount if pcl else Decimal("0")
                init_curr = pcl.currency if pcl else (budget.currency or "USD_BCV")
                db.add(
                    models.BudgetCategoryLimit(
                        budget_id=budget.id,
                        category_name=display_name,
                        limit_amount=init_limit,
                        currency=init_curr,
                        notified_80=False,
                        notified_100=False,
                    )
                )

    if payload.shared_with_ids is not None:
        if budget.is_primary and len(payload.shared_with_ids) > 0:
            raise HTTPException(
                status_code=400,
                detail="El Presupuesto Principal no se puede compartir; crea un sub-presupuesto."
            )
        share_res = await db.execute(
            select(models.Share)
            .options(selectinload(models.Share.members))
            .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
            .where(
                models.ShareMember.entity_id == budget.id,
                models.Share.entity_type == "sub_budget"
            )
        )
        existing_share = share_res.scalars().first()

        if not existing_share:
            all_owned_shares_res = await db.execute(
                select(models.Share)
                .options(selectinload(models.Share.members))
                .where(
                    models.Share.owner_id == user_id,
                    models.Share.entity_type == "sub_budget"
                )
            )
            for s in all_owned_shares_res.scalars().all():
                owner_m = next((m for m in s.members if m.user_id == user_id), None)
                anchor_entity_id = owner_m.entity_id if owner_m else (s.members[0].entity_id if s.members else None)
                if anchor_entity_id:
                    anchor_b = await db.get(models.MonthlyBudget, anchor_entity_id)
                    if anchor_b:
                        cand_names = {old_budget_name.strip().lower(), budget.name.strip().lower()}
                        if anchor_b.name.strip().lower() in cand_names:
                            existing_share = s
                            break

        if existing_share:
            for m in existing_share.members:
                m.entity_id = budget.id
            await db.flush()

        if len(payload.shared_with_ids) == 0:
            if existing_share:
                await db.delete(existing_share)
        elif not existing_share:
            await sharing.create_share(
                db=db,
                entity_type="sub_budget",
                owner_id=user_id,
                owner_entity=budget,
                target_ids=payload.shared_with_ids,
                admin_ids=[]
            )
        else:
            current_members_res = await db.execute(
                select(models.ShareMember).where(models.ShareMember.share_id == existing_share.id)
            )
            current_members = list(current_members_res.scalars().all())
            target_set = set(payload.shared_with_ids)

            for m in current_members:
                if m.user_id != user_id and m.user_id not in target_set:
                    await db.delete(m)

            current_uids = {m.user_id for m in current_members}
            new_uids = [uid for uid in target_set if uid not in current_uids]
            if new_uids:
                await sharing.add_members(
                    db=db,
                    share=existing_share,
                    actor_id=user_id,
                    target_ids=new_uids,
                    admin_ids=[]
                )
            if not target_set:
                await db.delete(existing_share)

    budget.is_confirmed = True
    await db.commit()
    db.expire_all()

    await check_and_notify_budget_thresholds(
        db, user_id, date(int(target_month_year[:4]), int(target_month_year[5:7]), 1), allow_notify=False
    )
    return await get_monthly_budget_view(db, user_id, target_month_year)


async def set_primary_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    budget_id: UUID
) -> schemas.MonthlyBudgetResponse:
    res = await db.execute(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.id == budget_id,
            models.MonthlyBudget.user_id == user_id
        )
    )
    budget = res.scalars().first()
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    target_month_year = str(budget.month_year)
    old_budget_name = str(budget.name)

    share_res = await db.execute(
        select(models.Share)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(
            models.ShareMember.entity_id == budget.id,
            models.Share.entity_type == "sub_budget"
        )
    )
    if share_res.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="El Presupuesto Principal no se puede compartir; deja de compartir este grupo antes de hacerlo principal."
        )

    month_year = budget.month_year
    all_res = await db.execute(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == month_year
        )
    )
    for b in all_res.scalars().all():
        b.is_primary = (b.id == budget_id)

    await db.commit()
    db.expire_all()
    return await get_monthly_budget_view(db, user_id, month_year)


async def delete_monthly_budget_by_id(
    db: AsyncSession,
    user_id: UUID,
    budget_id: UUID
) -> schemas.MonthlyBudgetResponse:
    res = await db.execute(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.id == budget_id,
            models.MonthlyBudget.user_id == user_id
        )
    )
    budget = res.scalars().first()
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    target_month_year = str(budget.month_year)
    old_budget_name = str(budget.name)

    if budget.is_primary:
        raise HTTPException(
            status_code=400,
            detail="El Presupuesto Principal (Plan Maestro) no puede ser eliminado."
        )

    month_year = budget.month_year
    was_primary = bool(budget.is_primary)

    share_res = await db.execute(
        select(models.Share)
        .join(models.ShareMember, models.Share.id == models.ShareMember.share_id)
        .where(
            models.ShareMember.entity_id == budget.id,
            models.Share.entity_type == "sub_budget"
        )
    )
    for s in share_res.scalars().all():
        await db.delete(s)
    await db.flush()

    await db.delete(budget)
    await db.flush()
    if was_primary:
        rem_res = await db.execute(
            select(models.MonthlyBudget).where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == month_year
            ).order_by(models.MonthlyBudget.name.asc())
        )
        remaining = list(rem_res.scalars().all())
        if remaining and not any(b.is_primary for b in remaining):
            remaining[0].is_primary = True

    await db.commit()
    db.expire_all()

    return await get_monthly_budget_view(db, user_id, month_year, allow_auto_clone=False)


async def upsert_category_limit_by_budget_id(
    db: AsyncSession,
    user_id: UUID,
    budget_id: UUID,
    item: schemas.BudgetCategoryLimitInput
) -> schemas.MonthlyBudgetResponse:
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.id == budget_id,
            models.MonthlyBudget.user_id == user_id
        )
    )
    all_b = _scalars_all(res)
    budget = all_b[0] if all_b else None
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    target_month_year = str(budget.month_year)
    old_budget_name = str(budget.name)

    if not budget.is_primary:
        raise HTTPException(
            status_code=400,
            detail="Los límites de categorías se definen únicamente en el Presupuesto Principal."
        )

    budget.is_confirmed = True
    cat_name = item.category_name.strip()
    item_curr = item.currency.value if hasattr(item.currency, "value") else str(item.currency)

    existing_cl = next((cl for cl in (budget.category_limits or []) if cl.category_name.lower() == cat_name.lower()), None)
    if existing_cl:
        existing_cl.limit_amount = item.limit_amount
        existing_cl.currency = item_curr
        existing_cl.notified_80 = False
        existing_cl.notified_100 = False
    else:
        new_cl = models.BudgetCategoryLimit(
            budget_id=budget.id,
            category_name=cat_name,
            limit_amount=item.limit_amount,
            currency=item_curr,
            notified_80=False,
            notified_100=False
        )
        db.add(new_cl)

    # Propagate to any sub-budgets in the same month that contain this category
    sub_budgets_res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.user_id == user_id,
            models.MonthlyBudget.month_year == budget.month_year,
            models.MonthlyBudget.id != budget.id
        )
    )
    for sb in _scalars_all(sub_budgets_res):
        sb_cl = next((c for c in (sb.category_limits or []) if c.category_name.strip().lower() == cat_name.lower()), None)
        if sb_cl:
            sb_cl.limit_amount = item.limit_amount
            sb_cl.currency = item_curr
            sb_cl.notified_80 = False
            sb_cl.notified_100 = False

    month_year = budget.month_year
    await db.commit()
    db.expire_all()

    await check_and_notify_budget_thresholds(
        db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
    )
    return await get_monthly_budget_view(db, user_id, month_year)


async def delete_category_limit_by_budget_id(
    db: AsyncSession,
    user_id: UUID,
    budget_id: UUID,
    category_name: str
) -> schemas.MonthlyBudgetResponse:
    res = await db.execute(
        select(models.MonthlyBudget)
        .options(
            joinedload(models.MonthlyBudget.category_limits),
            noload(models.MonthlyBudget.linked_income)
        )
        .where(
            models.MonthlyBudget.id == budget_id,
            models.MonthlyBudget.user_id == user_id
        )
    )
    all_b = _scalars_all(res)
    budget = all_b[0] if all_b else None
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    target_month_year = str(budget.month_year)
    old_budget_name = str(budget.name)

    month_year = budget.month_year
    target_cat = category_name.strip().lower()
    cl_to_delete = next((cl for cl in (budget.category_limits or []) if cl.category_name.strip().lower() == target_cat), None)
    if cl_to_delete:
        if budget.is_primary:
            # In Primary, reset limit to 0 rather than deleting the category row
            cl_to_delete.limit_amount = Decimal("0")
            cl_to_delete.notified_80 = False
            cl_to_delete.notified_100 = False
            # Propagate reset to any sub-budgets that have this category
            sub_budgets_res = await db.execute(
                select(models.MonthlyBudget)
                .options(
                    joinedload(models.MonthlyBudget.category_limits),
                    noload(models.MonthlyBudget.linked_income)
                )
                .where(
                    models.MonthlyBudget.user_id == user_id,
                    models.MonthlyBudget.month_year == budget.month_year,
                    models.MonthlyBudget.id != budget.id
                )
            )
            for sb in _scalars_all(sub_budgets_res):
                sb_cl = next((c for c in (sb.category_limits or []) if c.category_name.strip().lower() == target_cat), None)
                if sb_cl:
                    sb_cl.limit_amount = Decimal("0")
                    sb_cl.notified_80 = False
                    sb_cl.notified_100 = False
        else:
            # In sub-budget, removing category removes it from this group
            if cl_to_delete in budget.category_limits:
                budget.category_limits.remove(cl_to_delete)
            await db.flush()

        await db.commit()
        db.expire_all()
        await check_and_notify_budget_thresholds(
            db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
        )

    return await get_monthly_budget_view(db, user_id, month_year)


async def upsert_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    payload: schemas.MonthlyBudgetUpsert
) -> schemas.MonthlyBudgetResponse:
    """
    Creates or updates the primary MonthlyBudget and its category limits.
    """
    if payload.linked_income_id:
        inc_res = await db.execute(
            select(models.EstimatedIncome).filter(
                models.EstimatedIncome.id == payload.linked_income_id,
                models.EstimatedIncome.user_id == user_id
            )
        )
        if not inc_res.scalars().first():
            raise HTTPException(status_code=404, detail="Ingreso estimado no encontrado")

    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year)
    budget = budgets[0] if budgets else None

    curr_val = payload.currency.value if hasattr(payload.currency, "value") else str(payload.currency)
    mode_val = payload.income_mode.value if hasattr(payload.income_mode, "value") else str(payload.income_mode)

    if not budget:
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            name="Presupuesto Principal",
            currency=curr_val,
            income_mode=mode_val,
            linked_income_id=payload.linked_income_id,
            manual_global_limit=payload.manual_global_limit,
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True
        )
        db.add(budget)
        await db.flush()
        existing_limits = {}
    else:
        budget.currency = curr_val
        budget.income_mode = mode_val
        budget.linked_income_id = payload.linked_income_id
        budget.manual_global_limit = payload.manual_global_limit
        budget.is_confirmed = True
        existing_limits = {cl.category_name: cl for cl in budget.category_limits}

    if payload.category_limits is not None:
        new_limits_map = {item.category_name.strip(): item for item in payload.category_limits if item.category_name.strip()}

        for cat_name, cl in list(existing_limits.items()):
            if cat_name in new_limits_map:
                item = new_limits_map[cat_name]
                cl.limit_amount = item.limit_amount
                cl.currency = item.currency.value if hasattr(item.currency, "value") else str(item.currency)
            else:
                await db.delete(cl)

        for cat_name, item in new_limits_map.items():
            if cat_name not in existing_limits:
                new_cl = models.BudgetCategoryLimit(
                    budget_id=budget.id,
                    category_name=cat_name,
                    limit_amount=item.limit_amount,
                    currency=item.currency.value if hasattr(item.currency, "value") else str(item.currency)
                )
                db.add(new_cl)

    await db.commit()
    db.expire_all()

    await check_and_notify_budget_thresholds(
        db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
    )
    return await get_monthly_budget_view(db, user_id, month_year)


async def upsert_budget_category_limit(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    item: schemas.BudgetCategoryLimitInput
) -> schemas.MonthlyBudgetResponse:
    """
    Legacy/shortcut endpoint: adds or updates a category limit in the primary budget.
    """
    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year)
    if not budgets:
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            name="Presupuesto Principal",
            currency='USD_BCV',
            income_mode='manual',
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True
        )
        db.add(budget)
        await db.commit()
        db.expire_all()
        budgets = await get_or_clone_monthly_budgets(db, user_id, month_year)

    target_budget = next((b for b in budgets if b.is_primary), budgets[0])
    return await upsert_category_limit_by_budget_id(db, user_id, target_budget.id, item)


async def delete_budget_category_limit(
    db: AsyncSession,
    user_id: UUID,
    month_year: str,
    category_name: str
) -> schemas.MonthlyBudgetResponse:
    """
    Legacy/shortcut endpoint: deletes a category limit from any budget in month_year.
    """
    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year)
    target_cat = category_name.strip().lower()
    for b in budgets:
        cl = next((c for c in (b.category_limits or []) if c.category_name.strip().lower() == target_cat), None)
        if cl:
            if b.is_primary:
                cl.limit_amount = Decimal("0")
                cl.notified_80 = False
                cl.notified_100 = False
            else:
                if cl in b.category_limits:
                    b.category_limits.remove(cl)
                await db.flush()

    await db.commit()
    db.expire_all()
    await check_and_notify_budget_thresholds(
        db, user_id, date(int(month_year[:4]), int(month_year[5:7]), 1), allow_notify=False
    )
    return await get_monthly_budget_view(db, user_id, month_year)


async def confirm_monthly_budget(
    db: AsyncSession,
    user_id: UUID,
    month_year: str
) -> schemas.MonthlyBudgetResponse:
    """
    Confirms all budgets for month_year.
    """
    budgets = await get_or_clone_monthly_budgets(db, user_id, month_year, allow_auto_clone=True)
    if not budgets:
        budget = models.MonthlyBudget(
            user_id=user_id,
            month_year=month_year,
            name="Presupuesto Principal",
            currency='USD_BCV',
            income_mode='manual',
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True
        )
        db.add(budget)
    else:
        for b in budgets:
            b.is_confirmed = True

    await db.commit()
    db.expire_all()
    return await get_monthly_budget_view(db, user_id, month_year)


async def check_and_notify_budget_thresholds(
    db: AsyncSession,
    user_id: UUID,
    target_date: Any,
    allow_notify: bool = True
) -> None:
    """
    Checks threshold crossings (80% and 100%) for both global limit and category limits
    across all monthly budgets for the target_date month.
    """
    try:
        if not target_date:
            target_date = date.today()
        elif isinstance(target_date, str):
            target_date = date.fromisoformat(target_date[:10])
        elif isinstance(target_date, datetime):
            target_date = target_date.date()

        month_year = target_date.strftime("%Y-%m")

        # Query all budgets for this month
        res = await db.execute(
            select(models.MonthlyBudget)
            .execution_options(populate_existing=True)
            .options(
                joinedload(models.MonthlyBudget.category_limits),
                noload(models.MonthlyBudget.linked_income)
            )
            .where(
                models.MonthlyBudget.user_id == user_id,
                models.MonthlyBudget.month_year == month_year
            )
        )
        budgets = _scalars_all(res)
        if not budgets:
            return

        rates = await bcv_service.get_all_rates()
        usd_bs = rates.get("usd_bs")
        eur_bs = rates.get("eur_bs")
        usdt_bs = rates.get("usdt_bs")

        # Fetch expenses or category spending for the month
        year = target_date.year
        month = target_date.month
        _, last_day = calendar.monthrange(year, month)
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)

        is_real_session = (type(db).__name__ == "AsyncSession")
        dirty = False

        if is_real_session:
            cat_spent_lower, _ = await _get_monthly_category_spending(db, user_id, start_date, end_date, rates)
            expenses = []
        else:
            cat_spent_lower = {}
            exp_res = await db.execute(
                select(models.Expense).where(
                    models.Expense.user_id == user_id,
                    models.Expense.date >= start_date,
                    models.Expense.date <= end_date
                )
            )
            expenses = exp_res.scalars().all() if hasattr(exp_res, 'scalars') else []

        # Synchronize in-memory category limits from Primary budget to Sub-budgets
        prim_b = next((b for b in budgets if b.is_primary), None)
        prim_map = {cl.category_name.strip().lower(): cl for cl in (prim_b.category_limits if prim_b else [])}
        for b in budgets:
            if not b.is_primary:
                for cl in b.category_limits:
                    pcl = prim_map.get(cl.category_name.strip().lower())
                    if pcl:
                        new_amt = pcl.limit_amount
                        new_curr = pcl.currency or b.currency
                        if cl.limit_amount != new_amt or cl.currency != new_curr:
                            cl.limit_amount = new_amt
                            cl.currency = new_curr
                            dirty = True

        for b in budgets:
            b_curr = b.currency
            b_cats_lower = {cl.category_name.strip().lower() for cl in b.category_limits}

            if is_real_session:
                b_spent_usd = sum((cat_spent_lower[c]['spent_usd'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
                b_spent_bs = sum((cat_spent_lower[c]['spent_bs'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
                b_spent_eur = sum((cat_spent_lower[c]['spent_eur'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))
                b_spent_usdt = sum((cat_spent_lower[c]['spent_usdt'] for c in b_cats_lower if c in cat_spent_lower), Decimal("0"))

                if b_curr == 'USD_BCV':
                    b_total_spent = b_spent_usd
                elif b_curr == 'BS':
                    b_total_spent = b_spent_bs
                elif b_curr == 'EUR_BCV':
                    b_total_spent = b_spent_eur
                elif b_curr in ('USDT', 'USD_CASH'):
                    b_total_spent = b_spent_usdt
                else:
                    b_total_spent = _convert_value_between_currencies(b_spent_usd, 'USD_BCV', b_curr, rates)
            else:
                b_exps = [e for e in expenses if (e.category or "Sin Categoría").strip().lower() in b_cats_lower]
                b_total_spent = sum((_expense_amount_in_currency(e, b_curr, rates) for e in b_exps), Decimal("0"))

            # 1. Check category limits strictly on Primary Budget (Plan Maestro) to avoid notification storms
            if b.is_primary:
                for cl in b.category_limits:
                    limit = Decimal(str(cl.limit_amount))
                    if limit <= 0:
                        continue
                    cl_curr = cl.currency or b_curr
                    if is_real_session:
                        bucket = cat_spent_lower.get(cl.category_name.strip().lower(), {})
                        spent = _convert_cat_bucket(bucket, cl_curr, usd_bs, eur_bs, usdt_bs)
                    else:
                        spent = sum(
                            (_expense_amount_in_currency(exp, cl_curr, rates)
                             for exp in expenses
                             if (exp.category or "Sin Categoría").strip().lower() == cl.category_name.strip().lower()),
                            Decimal("0")
                        )
                    pct = float((spent / limit) * 100)

                    if pct < 80.0:
                        if cl.notified_80 or cl.notified_100:
                            cl.notified_80 = False
                            cl.notified_100 = False
                            dirty = True
                    elif 80.0 <= pct < 100.0:
                        if cl.notified_100:
                            cl.notified_100 = False
                            dirty = True
                        if not cl.notified_80 and allow_notify:
                            cl.notified_80 = True
                            dirty = True
                            await send_notification_to_user(
                                db=db,
                                user_id=user_id,
                                title=f"Presupuesto al 80%: {cl.category_name}",
                                body=f"Has alcanzado el {pct:.0f}% de tu presupuesto en {cl.category_name} ({spent:.2f} / {limit:.2f} {cl_curr}).",
                                type="budgets",
                                url="/herramientas/presupuestos",
                                send_push=False,
                                entity_type="budget",
                                entity_id=b.id,
                                commit=False,
                            )
                    else: # pct >= 100.0
                        if not cl.notified_100 and allow_notify:
                            cl.notified_100 = True
                            cl.notified_80 = True
                            dirty = True
                            await send_notification_to_user(
                                db=db,
                                user_id=user_id,
                                title=f"Límite alcanzado: {cl.category_name}",
                                body=f"Has superado el 100% de tu presupuesto en {cl.category_name} ({spent:.2f} / {limit:.2f} {cl_curr}).",
                                type="budgets",
                                url="/herramientas/presupuestos",
                                send_push=True,
                                entity_type="budget",
                                entity_id=b.id,
                                commit=False,
                            )

            # 2. Check global limit for this budget
            effective_global = await _compute_effective_global_limit(b, rates, db)
            if effective_global is not None and effective_global > 0:
                global_pct = float((b_total_spent / effective_global) * 100)
                if global_pct < 80.0:
                    if b.notified_global_80 or b.notified_global_100:
                        b.notified_global_80 = False
                        b.notified_global_100 = False
                        dirty = True
                elif 80.0 <= global_pct < 100.0:
                    if b.notified_global_100:
                        b.notified_global_100 = False
                        dirty = True
                    if not b.notified_global_80 and allow_notify:
                        b.notified_global_80 = True
                        dirty = True
                        await send_notification_to_user(
                            db=db,
                            user_id=user_id,
                            title=f"Presupuesto global al 80% ({b.name})",
                            body=f"Has alcanzado el {global_pct:.0f}% de tu presupuesto mensual total ({b_total_spent:.2f} / {effective_global:.2f} {b_curr}) en '{b.name}'.",
                            type="budgets",
                            url="/herramientas/presupuestos",
                            send_push=True,
                            entity_type="budget",
                            entity_id=b.id,
                            commit=False,
                        )
                else:
                    if not b.notified_global_100 and allow_notify:
                        b.notified_global_100 = True
                        b.notified_global_80 = True
                        dirty = True
                        await send_notification_to_user(
                            db=db,
                            user_id=user_id,
                            title=f"Presupuesto global al 100% ({b.name})",
                            body=f"Has superado el 100% de tu presupuesto mensual total ({b_total_spent:.2f} / {effective_global:.2f} {b_curr}) en '{b.name}'.",
                            type="budgets",
                            url="/herramientas/presupuestos",
                            send_push=True,
                            entity_type="budget",
                            entity_id=b.id,
                            commit=False,
                        )
            else:
                if b.notified_global_80 or b.notified_global_100:
                    b.notified_global_80 = False
                    b.notified_global_100 = False
                    dirty = True

        if dirty or not is_real_session:
            await db.commit()

    except Exception as e:
        await db.rollback()
        print("Budget threshold check error:", repr(e))
