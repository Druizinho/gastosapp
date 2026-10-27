from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import extract, func, case, text
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from typing import Optional, List
from datetime import date
from uuid import UUID
from . import models, schemas
from .database import engine
from decimal import Decimal
from .crud_budgets import check_and_notify_budget_thresholds

async def create_expense(db: AsyncSession, expense: schemas.ExpenseCreate, user_id: UUID, extra_data: dict = None):
    data = expense.model_dump(exclude_unset=True)
    if 'manual_rate' in data:
        del data['manual_rate']
    if extra_data:
        data.update(extra_data)
        
    db_expense = models.Expense(**data, user_id=user_id)
    if not db_expense.category or not db_expense.category.strip():
        db_expense.category = "Sin Categoría"
    if not db_expense.date:
        db_expense.date = date.today()
        
    db.add(db_expense)
    await db.commit()
    await db.refresh(db_expense)
    await check_and_notify_budget_thresholds(db, user_id, db_expense.date, allow_notify=True)
    return db_expense

async def get_expenses(db: AsyncSession, user_id: UUID, skip: int = 0, limit: int = 100, date_from: date = None, date_to: date = None):
    query = select(models.Expense).filter(models.Expense.user_id == user_id)
    
    if date_from:
        query = query.filter(models.Expense.date >= date_from)
    if date_to:
        query = query.filter(models.Expense.date <= date_to)
    
    query = query.order_by(models.Expense.date.desc(), models.Expense.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

async def get_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    result = await db.execute(select(models.Expense).filter(models.Expense.id == expense_id, models.Expense.user_id == user_id))
    return result.scalars().first()

async def update_expense(db: AsyncSession, expense_id: UUID, expense: schemas.ExpenseUpdate, user_id: UUID, extra_data: dict = None):
    db_expense = await get_expense(db, expense_id, user_id)
    if not db_expense:
        return None
    
    update_data = expense.model_dump(exclude_unset=True)
    if 'manual_rate' in update_data:
        del update_data['manual_rate']
    if 'category' in update_data and (not update_data['category'] or not update_data['category'].strip()):
        update_data['category'] = "Sin Categoría"
    if extra_data:
        update_data.update(extra_data)
        
    for key, value in update_data.items():
        setattr(db_expense, key, value)
        
    await db.commit()
    await db.refresh(db_expense)
    await check_and_notify_budget_thresholds(db, user_id, db_expense.date, allow_notify=True)
    return db_expense

async def delete_expense(db: AsyncSession, expense_id: UUID, user_id: UUID):
    db_expense = await get_expense(db, expense_id, user_id)
    if not db_expense:
        return False
    
    exp_date = db_expense.date
    await db.delete(db_expense)
    await db.commit()
    await check_and_notify_budget_thresholds(db, user_id, exp_date, allow_notify=False)
    return True

async def get_summary(db: AsyncSession, user_id: UUID):
    # Base query helpers
    def sum_cols():
        return [
            func.coalesce(func.sum(models.Expense.amount_bs), 0),
            func.coalesce(func.sum(models.Expense.amount_usd), 0),
            func.coalesce(func.sum(models.Expense.amount_eur), 0),
            func.coalesce(func.sum(models.Expense.amount_usdt), 0)
        ]

    def income_sum_cols():
        return [
            func.coalesce(func.sum(models.Income.amount_bs), 0),
            func.coalesce(func.sum(models.Income.amount_usd), 0),
            func.coalesce(func.sum(models.Income.amount_eur), 0),
            func.coalesce(func.sum(models.Income.amount_usdt), 0)
        ]
        
    # Total spent
    total_result = await db.execute(select(*sum_cols()).filter(models.Expense.user_id == user_id))
    total_bs, total_usd, total_eur, total_usdt = total_result.first()

    # Total this month
    today = date.today()
    month_result = await db.execute(
        select(*sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(extract('year', models.Expense.date) == today.year)
        .filter(extract('month', models.Expense.date) == today.month)
    )
    month_bs, month_usd, month_eur, month_usdt = month_result.first()

    # Total income (all-time)
    income_total_result = await db.execute(
        select(*income_sum_cols()).filter(models.Income.user_id == user_id)
    )
    income_total_bs, income_total_usd, income_total_eur, income_total_usdt = income_total_result.first()

    # Total income this month
    income_month_result = await db.execute(
        select(*income_sum_cols())
        .filter(models.Income.user_id == user_id)
        .filter(extract('year', models.Income.date) == today.year)
        .filter(extract('month', models.Income.date) == today.month)
    )
    income_month_bs, income_month_usd, income_month_eur, income_month_usdt = income_month_result.first()

    # By category (strictly from models.Expense)
    category_result = await db.execute(
        select(models.Expense.category, *sum_cols())
        .filter(models.Expense.user_id == user_id)
        .group_by(models.Expense.category)
    )
    
    by_category = []
    for row in category_result.all():
        by_category.append(schemas.CategorySummary(
            category=row[0],
            total_bs=row[1],
            total_usd=row[2],
            total_eur=row[3],
            total_usdt=row[4]
        ))

    return schemas.SummaryResponse(
        total_spent_bs=total_bs,
        total_spent_usd=total_usd,
        total_spent_eur=total_eur,
        total_spent_usdt=total_usdt,
        total_this_month_bs=month_bs,
        total_this_month_usd=month_usd,
        total_this_month_eur=month_eur,
        total_this_month_usdt=month_usdt,
        income_total_bs=income_total_bs,
        income_total_usd=income_total_usd,
        income_total_eur=income_total_eur,
        income_total_usdt=income_total_usdt,
        income_this_month_bs=income_month_bs,
        income_this_month_usd=income_month_usd,
        income_this_month_eur=income_month_eur,
        income_this_month_usdt=income_month_usdt,
        balance_bs=income_total_bs - total_bs,
        balance_usd=income_total_usd - total_usd,
        balance_eur=income_total_eur - total_eur,
        balance_usdt=income_total_usdt - total_usdt,
        balance_this_month_bs=income_month_bs - month_bs,
        balance_this_month_usd=income_month_usd - month_usd,
        balance_this_month_eur=income_month_eur - month_eur,
        balance_this_month_usdt=income_month_usdt - month_usdt,
        by_category=by_category
    )

async def get_summary_range(db: AsyncSession, user_id: UUID, date_from: date, date_to: date):
    """Calcula totales y desglose por categoría para un rango de fechas arbitrario."""
    def sum_cols():
        return [
            func.coalesce(func.sum(models.Expense.amount_bs), 0),
            func.coalesce(func.sum(models.Expense.amount_usd), 0),
            func.coalesce(func.sum(models.Expense.amount_eur), 0),
            func.coalesce(func.sum(models.Expense.amount_usdt), 0)
        ]

    def income_sum_cols():
        return [
            func.coalesce(func.sum(models.Income.amount_bs), 0),
            func.coalesce(func.sum(models.Income.amount_usd), 0),
            func.coalesce(func.sum(models.Income.amount_eur), 0),
            func.coalesce(func.sum(models.Income.amount_usdt), 0)
        ]

    # Totales del rango (expenses)
    total_result = await db.execute(
        select(*sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(models.Expense.date >= date_from)
        .filter(models.Expense.date <= date_to)
    )
    total_bs, total_usd, total_eur, total_usdt = total_result.first()

    # Totales del rango (incomes)
    income_result = await db.execute(
        select(*income_sum_cols())
        .filter(models.Income.user_id == user_id)
        .filter(models.Income.date >= date_from)
        .filter(models.Income.date <= date_to)
    )
    income_total_bs, income_total_usd, income_total_eur, income_total_usdt = income_result.first()

    # Por categoría (strictly from models.Expense)
    category_result = await db.execute(
        select(models.Expense.category, *sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(models.Expense.date >= date_from)
        .filter(models.Expense.date <= date_to)
        .group_by(models.Expense.category)
    )

    by_category = []
    for row in category_result.all():
        by_category.append(schemas.CategorySummary(
            category=row[0],
            total_bs=row[1],
            total_usd=row[2],
            total_eur=row[3],
            total_usdt=row[4]
        ))

    days_in_range = max((date_to - date_from).days + 1, 1)  # mínimo 1 para evitar div/0

    return schemas.RangeSummaryResponse(
        date_from=date_from,
        date_to=date_to,
        days_in_range=days_in_range,
        total_bs=total_bs,
        total_usd=total_usd,
        total_eur=total_eur,
        total_usdt=total_usdt,
        daily_avg_bs=total_bs / days_in_range,
        daily_avg_usd=total_usd / days_in_range,
        daily_avg_eur=total_eur / days_in_range,
        daily_avg_usdt=total_usdt / days_in_range,
        income_total_bs=income_total_bs,
        income_total_usd=income_total_usd,
        income_total_eur=income_total_eur,
        income_total_usdt=income_total_usdt,
        balance_bs=income_total_bs - total_bs,
        balance_usd=income_total_usd - total_usd,
        balance_eur=income_total_eur - total_eur,
        balance_usdt=income_total_usdt - total_usdt,
        by_category=by_category
    )

# Category CRUD, Defaults & Migrations

DEFAULT_CATEGORIES = [
    {"name": "Alimentación", "icon": "Utensils", "color": "#F59E0B"},
    {"name": "Transporte", "icon": "Car", "color": "#3B82F6"},
    {"name": "Vivienda", "icon": "Home", "color": "#8B5CF6"},
    {"name": "Servicios", "icon": "Zap", "color": "#06B6D4"},
    {"name": "Salud", "icon": "HeartPulse", "color": "#EF4444"},
    {"name": "Ocio", "icon": "Tv", "color": "#EC4899"},
    {"name": "Compras", "icon": "ShoppingCart", "color": "#10B981"},
    {"name": "Educación", "icon": "GraduationCap", "color": "#6366F1"},
    {"name": "Gastos Fijos", "icon": "Receipt", "color": "#14B8A6"},
    {"name": "Deudas", "icon": "CreditCard", "color": "#F97316"},
    {"name": "Ahorro", "icon": "PiggyBank", "color": "#22C55E"},
    {"name": "Proyectos", "icon": "FolderKanban", "color": "#3B82F6"},
    {"name": "Sin Categoría", "icon": "HelpCircle", "color": "#64748B"},
]

DEFAULT_INCOME_CATEGORIES = [
    {"name": "Salario", "icon": "Briefcase", "color": "#10B981"},
    {"name": "Freelance", "icon": "Monitor", "color": "#3B82F6"},
    {"name": "Ventas", "icon": "ShoppingBag", "color": "#F59E0B"},
    {"name": "Otros ingresos", "icon": "Wallet", "color": "#64748B"},
]

_categories_debts_schema_ensured = False

async def ensure_categories_and_debts_schema() -> None:
    global _categories_debts_schema_ensured
    if _categories_debts_schema_ensured:
        return

    statements = [
        # 1. categories columns
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'Package'",
        # 2. debts columns
        "ALTER TABLE debts ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Deudas'",
        # 3. debt_payments columns
        "ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS category VARCHAR(100)",
        "ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS create_expense BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS expense_id UUID",
        # 4. estimated_incomes columns
        "ALTER TABLE estimated_incomes ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Otros ingresos'",
        "ALTER TABLE estimated_incomes ALTER COLUMN category SET DEFAULT 'Otros ingresos'",
        # 5. saving_goals columns
        "ALTER TABLE saving_goals ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Ahorro'",
        # 6. saving_deposits columns
        "ALTER TABLE saving_deposits ADD COLUMN IF NOT EXISTS category VARCHAR(100)",
        "ALTER TABLE saving_deposits ADD COLUMN IF NOT EXISTS create_expense BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE saving_deposits ADD COLUMN IF NOT EXISTS expense_id UUID",
        # 7. fixed_expenses columns
        "ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Gastos Fijos'",
        # 8. share_members columns for localized per-user settings
        "ALTER TABLE share_members ADD COLUMN IF NOT EXISTS local_category VARCHAR(100)",
        "ALTER TABLE share_members ADD COLUMN IF NOT EXISTS perspective_type VARCHAR(20)",
        "ALTER TABLE share_members ADD COLUMN IF NOT EXISTS counterpart_label VARCHAR(200)",
        # Drop UNIQUE constraint on share_members(entity_id) if it exists
        """
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_name = 'share_members'
                  AND tc.constraint_type = 'UNIQUE'
                  AND ccu.column_name = 'entity_id'
            ) LOOP
                EXECUTE 'ALTER TABLE share_members DROP CONSTRAINT ' || quote_ident(r.constraint_name);
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # Consolidate legacy clone shares so member entity_id matches the canonical share entity_id
        """
        DO $$
        DECLARE
            r RECORD;
            canon_id UUID;
        BEGIN
            -- (a) Backfill local_category and debt perspective on share_members from current entities
            UPDATE share_members sm
            SET local_category = d.category,
                perspective_type = COALESCE(sm.perspective_type, d.type),
                counterpart_label = COALESCE(sm.counterpart_label, d.counterpart)
            FROM debts d
            WHERE sm.entity_id = d.id
              AND (sm.local_category IS NULL OR sm.perspective_type IS NULL);

            UPDATE share_members sm
            SET local_category = sg.category
            FROM saving_goals sg
            WHERE sm.entity_id = sg.id
              AND sm.local_category IS NULL;

            UPDATE share_members sm
            SET local_category = fe.category
            FROM fixed_expenses fe
            WHERE sm.entity_id = fe.id
              AND sm.local_category IS NULL;

            -- (b) Loop over shares having multiple distinct entity_id
            FOR r IN (
                SELECT sm.share_id, s.entity_type, s.owner_id
                FROM share_members sm
                JOIN shares s ON sm.share_id = s.id
                GROUP BY sm.share_id, s.entity_type, s.owner_id
                HAVING COUNT(DISTINCT sm.entity_id) > 1
            ) LOOP
                -- Determine canon_id: owner's entity_id first, fallback to earliest joined_at
                SELECT entity_id INTO canon_id
                FROM share_members
                WHERE share_id = r.share_id
                ORDER BY (user_id = r.owner_id) DESC, joined_at ASC
                LIMIT 1;

                IF canon_id IS NOT NULL THEN
                    -- (c) Copy expense_id and create_expense from cloned child rows to canonical child row
                    IF r.entity_type = 'debt' THEN
                        UPDATE debt_payments canon_dp
                        SET expense_id = clone_dp.expense_id,
                            create_expense = clone_dp.create_expense
                        FROM debt_payments clone_dp
                        WHERE canon_dp.debt_id = canon_id
                          AND clone_dp.debt_id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id)
                          AND canon_dp.sync_id IS NOT NULL
                          AND canon_dp.sync_id = clone_dp.sync_id
                          AND canon_dp.expense_id IS NULL
                          AND clone_dp.expense_id IS NOT NULL;

                        -- (d) Delete non-canonical cloned parent rows (cascades to payments)
                        DELETE FROM debts
                        WHERE id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id);

                    ELSIF r.entity_type = 'saving_goal' THEN
                        UPDATE saving_deposits canon_sd
                        SET expense_id = clone_sd.expense_id,
                            create_expense = clone_sd.create_expense
                        FROM saving_deposits clone_sd
                        WHERE canon_sd.goal_id = canon_id
                          AND clone_sd.goal_id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id)
                          AND canon_sd.sync_id IS NOT NULL
                          AND canon_sd.sync_id = clone_sd.sync_id
                          AND canon_sd.expense_id IS NULL
                          AND clone_sd.expense_id IS NOT NULL;

                        DELETE FROM saving_goals
                        WHERE id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id);

                    ELSIF r.entity_type = 'fixed_expense' THEN
                        UPDATE fixed_expense_checks canon_fec
                        SET expense_id = clone_fec.expense_id
                        FROM fixed_expense_checks clone_fec
                        WHERE canon_fec.fixed_expense_id = canon_id
                          AND clone_fec.fixed_expense_id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id)
                          AND canon_fec.sync_id IS NOT NULL
                          AND canon_fec.sync_id = clone_fec.sync_id
                          AND canon_fec.expense_id IS NULL
                          AND clone_fec.expense_id IS NOT NULL;

                        DELETE FROM fixed_expenses
                        WHERE id IN (SELECT entity_id FROM share_members WHERE share_id = r.share_id AND entity_id != canon_id);
                    END IF;

                    -- (e) Point all share_members to canon_id
                    UPDATE share_members
                    SET entity_id = canon_id
                    WHERE share_id = r.share_id;
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # 9. Migrate legacy categories rows where color holds an icon name
        """
        UPDATE categories 
        SET icon = color 
        WHERE (icon IS NULL OR icon = 'Package' OR icon = '') 
          AND color IS NOT NULL 
          AND color NOT LIKE '#%'
        """,
        # 9. Normalize category colors
        """
        UPDATE categories 
        SET color = CASE 
            WHEN lower(name) = 'alimentación' OR lower(color) = 'utensils' THEN '#F59E0B'
            WHEN lower(name) = 'transporte' OR lower(color) = 'car' THEN '#3B82F6'
            WHEN lower(name) = 'vivienda' OR lower(color) = 'home' THEN '#8B5CF6'
            WHEN lower(name) = 'servicios' OR lower(color) = 'zap' THEN '#06B6D4'
            WHEN lower(name) = 'salud' OR lower(color) = 'heartpulse' THEN '#EF4444'
            WHEN lower(name) = 'ocio' OR lower(color) = 'tv' THEN '#EC4899'
            WHEN lower(name) = 'compras' OR lower(color) = 'shoppingcart' THEN '#10B981'
            WHEN lower(name) = 'educación' OR lower(color) = 'graduationcap' THEN '#6366F1'
            WHEN lower(name) = 'gastos fijos' OR lower(color) = 'receipt' THEN '#14B8A6'
            WHEN lower(name) = 'deudas' OR lower(color) = 'creditcard' THEN '#F97316'
            WHEN lower(name) = 'ahorro' OR lower(color) = 'piggybank' THEN '#22C55E'
            WHEN lower(name) = 'proyectos' OR lower(color) = 'folderkanban' THEN '#3B82F6'
            WHEN lower(name) = 'ingresos' OR lower(color) = 'wallet' THEN '#10B981'
            ELSE '#6366F1'
        END
        WHERE color IS NULL OR color NOT LIKE '#%'
        """,
        "UPDATE categories SET icon = 'Package' WHERE icon IS NULL OR icon = ''",
        # 10. Heal existing USD_CASH records across tables
        """
        UPDATE expenses
        SET 
            amount_bs = ROUND(amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE fixed_expenses
        SET 
            amount_bs = ROUND(amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE debt_payments
        SET 
            amount_bs = ROUND(amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE saving_deposits
        SET 
            amount_bs = ROUND(amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((amount * GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE saving_goals
        SET 
            amount_bs = ROUND(target_amount * GREATEST(COALESCE(amount_bs / NULLIF(target_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((target_amount * GREATEST(COALESCE(amount_bs / NULLIF(target_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((target_amount * GREATEST(COALESCE(amount_bs / NULLIF(target_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((target_amount * GREATEST(COALESCE(amount_bs / NULLIF(target_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND target_amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(target_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE fixed_expense_checks
        SET 
            amount_bs = ROUND(paid_amount * GREATEST(COALESCE(amount_bs / NULLIF(paid_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((paid_amount * GREATEST(COALESCE(amount_bs / NULLIF(paid_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((paid_amount * GREATEST(COALESCE(amount_bs / NULLIF(paid_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((paid_amount * GREATEST(COALESCE(amount_bs / NULLIF(paid_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND paid_amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(paid_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        """
        UPDATE income_checks
        SET 
            amount_bs = ROUND(real_amount * GREATEST(COALESCE(amount_bs / NULLIF(real_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)), 4),
            amount_usd = CASE 
                WHEN rate_usd_bs IS NOT NULL AND rate_usd_bs > 0 
                THEN ROUND((real_amount * GREATEST(COALESCE(amount_bs / NULLIF(real_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usd_bs, 4)
                ELSE amount_usd 
            END,
            amount_eur = CASE 
                WHEN rate_eur_bs IS NOT NULL AND rate_eur_bs > 0 
                THEN ROUND((real_amount * GREATEST(COALESCE(amount_bs / NULLIF(real_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_eur_bs, 4)
                ELSE amount_eur 
            END,
            amount_usdt = CASE 
                WHEN rate_usdt_bs IS NOT NULL AND rate_usdt_bs > 0 
                THEN ROUND((real_amount * GREATEST(COALESCE(amount_bs / NULLIF(real_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0))) / rate_usdt_bs, 4)
                ELSE amount_usdt 
            END
        WHERE currency = 'USD_CASH' 
          AND real_amount > 0 
          AND GREATEST(COALESCE(amount_bs / NULLIF(real_amount, 0), 0), COALESCE(rate_usd_bs, 0), COALESCE(rate_eur_bs, 0), COALESCE(rate_usdt_bs, 0)) > 0
        """,
        # 11. Incomes table, indexes, and RLS policy
        """
        CREATE TABLE IF NOT EXISTS incomes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            amount NUMERIC(12, 4) NOT NULL CHECK (amount > 0),
            currency VARCHAR(10) NOT NULL DEFAULT 'BS',
            amount_usd NUMERIC(12, 4),
            amount_bs NUMERIC(12, 4),
            amount_eur NUMERIC(12, 4),
            amount_usdt NUMERIC(12, 4),
            rate_usd_bs NUMERIC(12, 4),
            rate_eur_bs NUMERIC(12, 4),
            rate_usdt_bs NUMERIC(12, 4),
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            category TEXT NOT NULL DEFAULT 'Otros ingresos',
            description TEXT NOT NULL,
            income_check_id UUID REFERENCES income_checks(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_incomes_user_id_date ON incomes(user_id, date)",
        "CREATE INDEX IF NOT EXISTS ix_incomes_income_check_id ON incomes(income_check_id)",
        "ALTER TABLE incomes ENABLE ROW LEVEL SECURITY",
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'incomes' AND policyname = 'Users can manage their own incomes'
            ) THEN
                CREATE POLICY "Users can manage their own incomes" ON incomes
                    FOR ALL USING (auth.uid() = user_id)
                    WITH CHECK (auth.uid() = user_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # 12. Create income_categories table, index, RLS, and policy
        """
        CREATE TABLE IF NOT EXISTS income_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color VARCHAR(20) DEFAULT '#10B981',
            icon VARCHAR(50) DEFAULT 'Wallet',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
            CONSTRAINT _user_income_category_uc UNIQUE (user_id, name)
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_income_categories_user ON income_categories(user_id);
        """,
        """
        ALTER TABLE income_categories ENABLE ROW LEVEL SECURITY;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'income_categories' AND policyname = 'Users can manage their own income_categories'
            ) THEN
                CREATE POLICY "Users can manage their own income_categories" ON income_categories
                    FOR ALL USING (auth.uid() = user_id)
                    WITH CHECK (auth.uid() = user_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # 13. Clean up legacy kind column from categories and migrate income categories
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'categories' AND column_name = 'kind'
            ) THEN
                INSERT INTO income_categories (id, user_id, name, color, icon, created_at)
                SELECT c.id, c.user_id, c.name, COALESCE(c.color, '#10B981'), COALESCE(c.icon, 'Wallet'), COALESCE(c.created_at, timezone('utc', now()))
                FROM categories c
                WHERE c.kind = 'income'
                  AND (
                      lower(btrim(c.name)) IN ('salario', 'freelance', 'ventas', 'otros ingresos')
                      OR NOT EXISTS (
                          SELECT 1 FROM categories e
                          WHERE e.user_id = c.user_id
                            AND e.kind = 'expense'
                            AND lower(btrim(e.name)) = lower(btrim(c.name))
                      )
                  )
                ON CONFLICT (user_id, name) DO NOTHING;

                DELETE FROM categories WHERE kind = 'income';

                DROP INDEX IF EXISTS idx_categories_user_kind;
                DROP INDEX IF EXISTS ix_categories_user_kind;

                BEGIN
                    ALTER TABLE categories DROP CONSTRAINT IF EXISTS _user_category_uc;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;

                ALTER TABLE categories DROP COLUMN IF EXISTS kind CASCADE;

                BEGIN
                    ALTER TABLE categories ADD CONSTRAINT _user_category_uc UNIQUE (user_id, name);
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            ELSE
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE table_name = 'categories' AND constraint_name = '_user_category_uc'
                ) THEN
                    BEGIN
                        ALTER TABLE categories ADD CONSTRAINT _user_category_uc UNIQUE (user_id, name);
                    EXCEPTION WHEN OTHERS THEN
                        NULL;
                    END;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # 13c. Seed DEFAULT_INCOME_CATEGORIES across profiles in income_categories
        """
        DO $$
        DECLARE
            inc_cat RECORD;
        BEGIN
            FOR inc_cat IN
                SELECT * FROM (VALUES
                    ('Salario', 'Briefcase', '#10B981'),
                    ('Freelance', 'Monitor', '#3B82F6'),
                    ('Ventas', 'ShoppingBag', '#F59E0B'),
                    ('Otros ingresos', 'Wallet', '#64748B')
                ) AS v(name, icon, color)
            LOOP
                INSERT INTO income_categories (id, user_id, name, icon, color, created_at)
                SELECT gen_random_uuid(), p.id, inc_cat.name, inc_cat.icon, inc_cat.color, timezone('utc', now())
                FROM profiles p
                WHERE NOT EXISTS (
                    SELECT 1 FROM income_categories ic
                    WHERE ic.user_id = p.id
                      AND lower(btrim(ic.name)) = lower(inc_cat.name)
                );
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
        """,
        # 14. Reassign estimated_incomes.category and delete unused 'Ingresos' expense category
        """
        UPDATE estimated_incomes ei
        SET category = 'Otros ingresos'
        WHERE category IS NULL 
           OR btrim(category) = '' 
           OR lower(btrim(category)) = 'ingresos'
           OR (
               EXISTS (
                   SELECT 1 FROM categories c 
                   WHERE c.user_id = ei.user_id 
                     AND lower(btrim(c.name)) = lower(btrim(ei.category))
               )
               AND NOT EXISTS (
                   SELECT 1 FROM income_categories ic 
                   WHERE ic.user_id = ei.user_id 
                     AND lower(btrim(ic.name)) = lower(btrim(ei.category))
               )
           )
        """,
        """
        DELETE FROM categories c
        WHERE lower(btrim(c.name)) = 'ingresos'
          AND NOT EXISTS (
              SELECT 1 FROM expenses e 
              WHERE e.user_id = c.user_id 
                AND lower(btrim(e.category)) = 'ingresos'
          )
        """,
        # 15. Idempotent backfill of income_checks -> incomes
        """
        INSERT INTO incomes (
            id,
            user_id,
            amount,
            currency,
            amount_usd,
            amount_bs,
            amount_eur,
            amount_usdt,
            rate_usd_bs,
            rate_eur_bs,
            rate_usdt_bs,
            date,
            category,
            description,
            income_check_id,
            created_at
        )
        SELECT
            gen_random_uuid(),
            ei.user_id,
            ic.real_amount,
            ic.currency,
            ic.amount_usd,
            ic.amount_bs,
            ic.amount_eur,
            ic.amount_usdt,
            ic.rate_usd_bs,
            ic.rate_eur_bs,
            ic.rate_usdt_bs,
            COALESCE(ic.payment_date, CURRENT_DATE),
            COALESCE(NULLIF(btrim(ei.category), ''), 'Otros ingresos'),
            COALESCE(NULLIF(btrim(ic.notes), ''), ei.name),
            ic.id,
            COALESCE(ic.created_at, timezone('utc', now()))
        FROM income_checks ic
        JOIN estimated_incomes ei ON ei.id = ic.income_id
        WHERE ic.real_amount > 0
          AND NOT EXISTS (
              SELECT 1 FROM incomes i WHERE i.income_check_id = ic.id
          )
        """,
    ]

    for stmt in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            # Table might not exist yet or dialect variance; do not abort other statements
            pass

    # Foreign key for debt_payments.expense_id
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'fk_debt_payments_expense_id'
                    ) THEN
                        ALTER TABLE debt_payments 
                        ADD CONSTRAINT fk_debt_payments_expense_id 
                        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))
    except Exception:
        pass

    # Foreign key for saving_deposits.expense_id
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'fk_saving_deposits_expense_id'
                    ) THEN
                        ALTER TABLE saving_deposits 
                        ADD CONSTRAINT fk_saving_deposits_expense_id 
                        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))
    except Exception:
        pass

    _categories_debts_schema_ensured = True

# Alias for schema initialization
ensure_incomes_and_categories_schema = ensure_categories_and_debts_schema

def _normalize_category_instance(cat) -> None:
    if not cat.icon or cat.icon.strip() == "":
        if cat.color and not cat.color.startswith("#"):
            cat.icon = cat.color
        else:
            cat.icon = "Wallet" if isinstance(cat, models.IncomeCategory) else "Package"
    if not cat.color or not cat.color.startswith("#"):
        name_lower = (cat.name or "").strip().lower()
        color_lower = (cat.color or "").strip().lower()
        mapping = {
            "alimentación": "#F59E0B",
            "utensils": "#F59E0B",
            "transporte": "#3B82F6",
            "car": "#3B82F6",
            "vivienda": "#8B5CF6",
            "home": "#8B5CF6",
            "servicios": "#06B6D4",
            "zap": "#06B6D4",
            "salud": "#EF4444",
            "heartpulse": "#EF4444",
            "ocio": "#EC4899",
            "tv": "#EC4899",
            "compras": "#10B981",
            "shoppingcart": "#10B981",
            "educación": "#6366F1",
            "graduationcap": "#6366F1",
            "gastos fijos": "#14B8A6",
            "receipt": "#14B8A6",
            "deudas": "#F97316",
            "creditcard": "#F97316",
            "ahorro": "#22C55E",
            "piggybank": "#22C55E",
            "proyectos": "#3B82F6",
            "folderkanban": "#3B82F6",
            "ingresos": "#10B981",
            "salario": "#10B981",
            "briefcase": "#10B981",
            "freelance": "#3B82F6",
            "monitor": "#3B82F6",
            "ventas": "#F59E0B",
            "shoppingbag": "#F59E0B",
            "otros ingresos": "#64748B",
            "wallet": "#64748B",
            "sin categoría": "#64748B",
            "helpcircle": "#64748B",
        }
        default_color = "#10B981" if isinstance(cat, models.IncomeCategory) else "#6366F1"
        cat.color = mapping.get(name_lower, mapping.get(color_lower, default_color))

async def seed_default_categories(db: AsyncSession, user_id: UUID, only_if_empty: bool = False, kind: str = "expense") -> List:
    if kind == "income":
        res = await db.execute(
            select(models.IncomeCategory)
            .where(models.IncomeCategory.user_id == user_id)
            .order_by(models.IncomeCategory.created_at.asc())
        )
        existing = res.scalars().all()
        if only_if_empty and len(existing) > 0:
            return existing

        existing_names = {c.name.strip().lower() for c in existing}
        to_add = []
        for item in DEFAULT_INCOME_CATEGORIES:
            if item["name"].strip().lower() not in existing_names:
                to_add.append(
                    models.IncomeCategory(
                        user_id=user_id,
                        name=item["name"],
                        icon=item["icon"],
                        color=item["color"]
                    )
                )
        if to_add:
            try:
                db.add_all(to_add)
                await db.commit()
            except IntegrityError:
                await db.rollback()
            except Exception:
                await db.rollback()
                raise

        res = await db.execute(
            select(models.IncomeCategory)
            .where(models.IncomeCategory.user_id == user_id)
            .order_by(models.IncomeCategory.created_at.asc())
        )
        return res.scalars().all()

    res = await db.execute(
        select(models.Category)
        .where(models.Category.user_id == user_id)
        .order_by(models.Category.created_at.asc())
    )
    existing = res.scalars().all()
    if only_if_empty and len(existing) > 0:
        return existing
        
    existing_names = {c.name.strip().lower() for c in existing}
    to_add = []
    for item in DEFAULT_CATEGORIES:
        if item["name"].strip().lower() not in existing_names:
            to_add.append(
                models.Category(
                    user_id=user_id,
                    name=item["name"],
                    icon=item["icon"],
                    color=item["color"]
                )
            )
            
    if to_add:
        try:
            db.add_all(to_add)
            await db.commit()
        except IntegrityError:
            await db.rollback()
        except Exception:
            await db.rollback()
            raise

    res = await db.execute(
        select(models.Category)
        .where(models.Category.user_id == user_id)
        .order_by(models.Category.created_at.asc())
    )
    return res.scalars().all()

async def get_categories(db: AsyncSession, user_id: UUID, kind: str = "expense"):
    await ensure_categories_and_debts_schema()

    if kind == "income":
        result = await db.execute(
            select(models.IncomeCategory)
            .filter(models.IncomeCategory.user_id == user_id)
            .order_by(models.IncomeCategory.created_at.asc())
        )
        cats = list(result.scalars().all())
        if not cats:
            cats = list(await seed_default_categories(db, user_id=user_id, only_if_empty=True, kind="income"))

        has_otros = any((c.name or "").strip().lower() == "otros ingresos" for c in cats)
        if not has_otros:
            db_otros = models.IncomeCategory(
                user_id=user_id,
                name="Otros ingresos",
                icon="Wallet",
                color="#64748B"
            )
            db.add(db_otros)
            try:
                await db.commit()
                await db.refresh(db_otros)
                cats.append(db_otros)
            except IntegrityError:
                await db.rollback()

        for cat in cats:
            _normalize_category_instance(cat)

        est_counts = {}
        try:
            est_res = await db.execute(
                select(models.EstimatedIncome.category, func.count(models.EstimatedIncome.id))
                .where(models.EstimatedIncome.user_id == user_id)
                .group_by(models.EstimatedIncome.category)
            )
            est_counts = {row[0].strip().lower(): row[1] for row in est_res.all() if row[0]}
        except Exception:
            await db.rollback()

        real_inc_counts = {}
        try:
            real_res = await db.execute(
                select(models.Income.category, func.count(models.Income.id))
                .where(models.Income.user_id == user_id)
                .group_by(models.Income.category)
            )
            real_inc_counts = {row[0].strip().lower(): row[1] for row in real_res.all() if row[0]}
        except Exception:
            await db.rollback()

        for cat in cats:
            k = (cat.name or "").strip().lower()
            tot = est_counts.get(k, 0) + real_inc_counts.get(k, 0)
            cat.expense_count = 0
            cat.fixed_count = 0
            cat.debt_count = 0
            cat.saving_count = 0
            cat.budget_count = 0
            cat.income_count = tot
            cat.usage_count = tot

        return cats

    result = await db.execute(
        select(models.Category)
        .filter(models.Category.user_id == user_id)
        .order_by(models.Category.created_at.asc())
    )
    cats = list(result.scalars().all())
    if not cats:
        cats = list(await seed_default_categories(db, user_id=user_id, only_if_empty=True, kind="expense"))

    has_sin_cat = any((c.name or "").strip().lower() == "sin categoría" for c in cats)
    if not has_sin_cat:
        db_sin_cat = models.Category(
            user_id=user_id,
            name="Sin Categoría",
            icon="HelpCircle",
            color="#64748B"
        )
        db.add(db_sin_cat)
        try:
            await db.commit()
            await db.refresh(db_sin_cat)
            cats.append(db_sin_cat)
        except IntegrityError:
            await db.rollback()

    for cat in cats:
        _normalize_category_instance(cat)

    # Grouped counts across tables for expense categories
    exp_counts = {}
    try:
        exp_res = await db.execute(
            select(models.Expense.category, func.count(models.Expense.id))
            .where(models.Expense.user_id == user_id)
            .group_by(models.Expense.category)
        )
        exp_counts = {row[0].strip().lower(): row[1] for row in exp_res.all() if row[0]}
    except Exception:
        await db.rollback()

    shared_subquery = select(models.ShareMember.entity_id).where(models.ShareMember.user_id == user_id)

    fe_counts = {}
    try:
        fe_res = await db.execute(
            select(models.FixedExpense.category, func.count(models.FixedExpense.id))
            .where(
                models.FixedExpense.user_id == user_id,
                ~models.FixedExpense.id.in_(shared_subquery)
            )
            .group_by(models.FixedExpense.category)
        )
        fe_counts = {row[0].strip().lower(): row[1] for row in fe_res.all() if row[0]}
    except Exception:
        await db.rollback()

    debt_counts = {}
    try:
        debt_res = await db.execute(
            select(models.Debt.category, func.count(models.Debt.id))
            .where(
                models.Debt.user_id == user_id,
                ~models.Debt.id.in_(shared_subquery)
            )
            .group_by(models.Debt.category)
        )
        debt_counts = {row[0].strip().lower(): row[1] for row in debt_res.all() if row[0]}
    except Exception:
        await db.rollback()

    saving_counts = {}
    try:
        saving_res = await db.execute(
            select(models.SavingGoal.category, func.count(models.SavingGoal.id))
            .where(
                models.SavingGoal.user_id == user_id,
                ~models.SavingGoal.id.in_(shared_subquery)
            )
            .group_by(models.SavingGoal.category)
        )
        saving_counts = {row[0].strip().lower(): row[1] for row in saving_res.all() if row[0]}
    except Exception:
        await db.rollback()

    budget_counts = {}
    try:
        budget_res = await db.execute(
            select(models.BudgetCategoryLimit.category_name, func.count(models.BudgetCategoryLimit.id))
            .join(models.MonthlyBudget, models.BudgetCategoryLimit.budget_id == models.MonthlyBudget.id)
            .where(models.MonthlyBudget.user_id == user_id)
            .group_by(models.BudgetCategoryLimit.category_name)
        )
        budget_counts = {row[0].strip().lower(): row[1] for row in budget_res.all() if row[0]}
    except Exception:
        await db.rollback()

    try:
        sm_res = await db.execute(
            select(models.Share.entity_type, models.ShareMember.local_category, func.count(models.ShareMember.share_id))
            .join(models.Share, models.ShareMember.share_id == models.Share.id)
            .where(models.ShareMember.user_id == user_id)
            .where(models.ShareMember.local_category.isnot(None))
            .group_by(models.Share.entity_type, models.ShareMember.local_category)
        )
        for ent_type, loc_cat, cnt in sm_res.all():
            if not loc_cat:
                continue
            cat_key = loc_cat.strip().lower()
            if ent_type == "fixed_expense":
                fe_counts[cat_key] = fe_counts.get(cat_key, 0) + cnt
            elif ent_type == "debt":
                debt_counts[cat_key] = debt_counts.get(cat_key, 0) + cnt
            elif ent_type == "saving_goal":
                saving_counts[cat_key] = saving_counts.get(cat_key, 0) + cnt
    except Exception:
        await db.rollback()

    for cat in cats:
        k = (cat.name or "").strip().lower()
        ec = exp_counts.get(k, 0)
        fc = fe_counts.get(k, 0)
        dc = debt_counts.get(k, 0)
        sc = saving_counts.get(k, 0)
        bc = budget_counts.get(k, 0)
        cat.expense_count = ec
        cat.fixed_count = fc
        cat.debt_count = dc
        cat.saving_count = sc
        cat.budget_count = bc
        cat.income_count = 0
        cat.usage_count = ec + fc + dc + sc

    return cats

async def get_category(db: AsyncSession, category_id: UUID, user_id: UUID, kind: Optional[str] = None):
    cat = None
    if kind == "income":
        result = await db.execute(
            select(models.IncomeCategory).filter(
                models.IncomeCategory.id == category_id,
                models.IncomeCategory.user_id == user_id
            )
        )
        cat = result.scalars().first()
    elif kind == "expense":
        result = await db.execute(
            select(models.Category).filter(
                models.Category.id == category_id,
                models.Category.user_id == user_id
            )
        )
        cat = result.scalars().first()
    else:
        result = await db.execute(
            select(models.Category).filter(
                models.Category.id == category_id,
                models.Category.user_id == user_id
            )
        )
        cat = result.scalars().first()
        if not cat:
            result = await db.execute(
                select(models.IncomeCategory).filter(
                    models.IncomeCategory.id == category_id,
                    models.IncomeCategory.user_id == user_id
                )
            )
            cat = result.scalars().first()

    if cat:
        _normalize_category_instance(cat)
    return cat

async def create_category(db: AsyncSession, category: schemas.CategoryCreate, user_id: UUID, kind_override: Optional[str] = None):
    raw_kind = getattr(category, "kind", "expense")
    kind = kind_override or getattr(raw_kind, "value", raw_kind) or "expense"
    norm_name = category.name.strip()

    if kind == "expense" and norm_name.lower() == "sin categoría":
        raise HTTPException(
            status_code=400,
            detail="La categoría 'Sin Categoría' es del sistema y se gestiona automáticamente."
        )
    if kind == "income" and norm_name.lower() == "otros ingresos":
        raise HTTPException(
            status_code=400,
            detail="La categoría 'Otros ingresos' es del sistema y se gestiona automáticamente."
        )

    if kind == "income":
        existing = await db.execute(
            select(models.IncomeCategory.id).where(
                models.IncomeCategory.user_id == user_id,
                func.lower(models.IncomeCategory.name) == func.lower(norm_name)
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    else:
        existing = await db.execute(
            select(models.Category.id).where(
                models.Category.user_id == user_id,
                func.lower(models.Category.name) == func.lower(norm_name)
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    cat_data = category.model_dump()
    cat_data["name"] = norm_name
    cat_data.pop("kind", None)

    raw_color = cat_data.get("color")
    raw_icon = cat_data.get("icon")
    default_icon = "Wallet" if kind == "income" else "Package"
    default_color = "#10B981" if kind == "income" else "#6366F1"

    if raw_color and not raw_color.startswith("#"):
        if not raw_icon or raw_icon in ("Package", "Wallet"):
            cat_data["icon"] = raw_color
        cat_data["color"] = default_color
    elif not raw_icon:
        cat_data["icon"] = default_icon

    if not cat_data.get("color") or not cat_data["color"].startswith("#"):
        cat_data["color"] = default_color

    if kind == "income":
        db_category = models.IncomeCategory(
            user_id=user_id,
            name=norm_name,
            color=cat_data["color"],
            icon=cat_data["icon"]
        )
    else:
        db_category = models.Category(
            **cat_data,
            user_id=user_id
        )

    db.add(db_category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    await db.refresh(db_category)
    _normalize_category_instance(db_category)
    return db_category

async def update_category(db: AsyncSession, category_id: UUID, category_update: schemas.CategoryCreate, user_id: UUID, kind: Optional[str] = None):
    db_category = await get_category(db, category_id, user_id, kind=kind)
    if not db_category:
        return None
    
    old_name = db_category.name
    new_name = category_update.name.strip()
    cat_kind = getattr(db_category, "kind", "expense")

    if cat_kind == "expense":
        if old_name.strip().lower() == "sin categoría":
            raise HTTPException(status_code=400, detail="La categoría 'Sin Categoría' es del sistema y no puede ser modificada.")
        if new_name.lower() == "sin categoría" and old_name.lower() != "sin categoría":
            raise HTTPException(status_code=400, detail="No puedes renombrar una categoría a 'Sin Categoría'.")
    elif cat_kind == "income":
        if old_name.strip().lower() == "otros ingresos":
            raise HTTPException(status_code=400, detail="La categoría 'Otros ingresos' es del sistema y no puede ser modificada.")
        if new_name.lower() == "otros ingresos" and old_name.lower() != "otros ingresos":
            raise HTTPException(status_code=400, detail="No puedes renombrar una categoría a 'Otros ingresos'.")

    if old_name.lower() != new_name.lower():
        if cat_kind == "income":
            existing = await db.execute(
                select(models.IncomeCategory.id).where(
                    models.IncomeCategory.user_id == user_id,
                    func.lower(models.IncomeCategory.name) == func.lower(new_name),
                    models.IncomeCategory.id != category_id
                )
            )
            if existing.scalars().first():
                raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
        else:
            existing = await db.execute(
                select(models.Category.id).where(
                    models.Category.user_id == user_id,
                    func.lower(models.Category.name) == func.lower(new_name),
                    models.Category.id != category_id
                )
            )
            if existing.scalars().first():
                raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    
    update_data = category_update.model_dump(exclude_unset=True)
    update_data["name"] = new_name
    update_data.pop("kind", None)

    default_icon = "Wallet" if cat_kind == "income" else "Package"
    default_color = "#10B981" if cat_kind == "income" else "#6366F1"

    raw_color = update_data.get("color")
    raw_icon = update_data.get("icon")
    if raw_color and not raw_color.startswith("#"):
        if not raw_icon or raw_icon in ("Package", "Wallet"):
            update_data["icon"] = raw_color
        update_data["color"] = default_color
    elif not raw_icon and "icon" in update_data:
        update_data["icon"] = default_icon

    for key, value in update_data.items():
        if key != "kind":
            setattr(db_category, key, value)
        
    if old_name != new_name:
        if cat_kind == "income":
            # 1. Update estimated incomes
            await db.execute(
                models.EstimatedIncome.__table__.update()
                .where(models.EstimatedIncome.user_id == user_id)
                .where(models.EstimatedIncome.category == old_name)
                .values(category=new_name)
            )

            # 2. Update real incomes
            await db.execute(
                models.Income.__table__.update()
                .where(models.Income.user_id == user_id)
                .where(models.Income.category == old_name)
                .values(category=new_name)
            )
        else:
            # 1. Update expenses that used the old category name
            await db.execute(
                models.Expense.__table__.update()
                .where(models.Expense.user_id == user_id)
                .where(models.Expense.category == old_name)
                .values(category=new_name)
            )

            # 2. Update fixed expenses
            await db.execute(
                models.FixedExpense.__table__.update()
                .where(models.FixedExpense.user_id == user_id)
                .where(models.FixedExpense.category == old_name)
                .values(category=new_name)
            )

            # 3. Update saving goals
            await db.execute(
                models.SavingGoal.__table__.update()
                .where(models.SavingGoal.user_id == user_id)
                .where(models.SavingGoal.category == old_name)
                .values(category=new_name)
            )

            # 4. Update debts
            await db.execute(
                models.Debt.__table__.update()
                .where(models.Debt.user_id == user_id)
                .where(models.Debt.category == old_name)
                .values(category=new_name)
            )

            # 5. Update debt payments belonging to user's debts
            user_debt_ids_res = await db.execute(
                select(models.Debt.id).where(models.Debt.user_id == user_id)
            )
            user_debt_ids = user_debt_ids_res.scalars().all()
            if user_debt_ids:
                await db.execute(
                    models.DebtPayment.__table__.update()
                    .where(models.DebtPayment.debt_id.in_(user_debt_ids))
                    .where(models.DebtPayment.category == old_name)
                    .values(category=new_name)
                )

            # 6. Update saving deposits
            user_goal_ids_res = await db.execute(
                select(models.SavingGoal.id).where(models.SavingGoal.user_id == user_id)
            )
            user_goal_ids = user_goal_ids_res.scalars().all()
            if user_goal_ids:
                await db.execute(
                    models.SavingDeposit.__table__.update()
                    .where(models.SavingDeposit.goal_id.in_(user_goal_ids))
                    .where(models.SavingDeposit.category == old_name)
                    .values(category=new_name)
                )

            # 7. Update share_members local_category for this user
            await db.execute(
                models.ShareMember.__table__.update()
                .where(models.ShareMember.user_id == user_id)
                .where(models.ShareMember.local_category == old_name)
                .values(local_category=new_name)
            )

            # 8. Synchronize BudgetCategoryLimit for user's budgets
            user_budgets_res = await db.execute(
                select(models.MonthlyBudget.id).where(models.MonthlyBudget.user_id == user_id)
            )
            user_budget_ids = user_budgets_res.scalars().all()
            if user_budget_ids:
                existing_new_limits = await db.execute(
                    select(models.BudgetCategoryLimit.budget_id)
                    .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                    .where(models.BudgetCategoryLimit.category_name == new_name)
                )
                budgets_with_new = set(existing_new_limits.scalars().all())
                budgets_to_rename = [b_id for b_id in user_budget_ids if b_id not in budgets_with_new]

                if budgets_to_rename:
                    await db.execute(
                        models.BudgetCategoryLimit.__table__.update()
                        .where(models.BudgetCategoryLimit.budget_id.in_(budgets_to_rename))
                        .where(models.BudgetCategoryLimit.category_name == old_name)
                        .values(category_name=new_name)
                    )
                if budgets_with_new:
                    await db.execute(
                        models.BudgetCategoryLimit.__table__.delete()
                        .where(models.BudgetCategoryLimit.budget_id.in_(list(budgets_with_new)))
                        .where(models.BudgetCategoryLimit.category_name == old_name)
                    )
        
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    await db.refresh(db_category)
    _normalize_category_instance(db_category)
    return db_category

async def delete_category(db: AsyncSession, category_id: UUID, user_id: UUID, reassign_to: Optional[str] = None, kind: Optional[str] = None):
    db_category = await get_category(db, category_id, user_id, kind=kind)
    if not db_category:
        return False
    
    category_name = db_category.name
    cat_kind = getattr(db_category, "kind", "expense")
    system_fallback = "Otros ingresos" if cat_kind == "income" else "Sin Categoría"

    if cat_kind == "expense" and category_name.strip().lower() == "sin categoría":
        raise HTTPException(status_code=400, detail="La categoría 'Sin Categoría' es del sistema y no puede ser eliminada.")
    if cat_kind == "income" and category_name.strip().lower() == "otros ingresos":
        raise HTTPException(status_code=400, detail="La categoría 'Otros ingresos' es del sistema y no puede ser eliminada.")
    
    if reassign_to:
        reassign_to = reassign_to.strip()
        if reassign_to.lower() == category_name.lower():
            raise HTTPException(status_code=400, detail="No se puede reasignar a la categoría que se está eliminando")
        if reassign_to != system_fallback:
            if cat_kind == "income":
                val_res = await db.execute(
                    select(models.IncomeCategory.id).where(
                        models.IncomeCategory.user_id == user_id,
                        func.lower(models.IncomeCategory.name) == func.lower(reassign_to)
                    )
                )
                if not val_res.scalars().first():
                    raise HTTPException(status_code=400, detail=f"La categoría de destino '{reassign_to}' no existe")
            else:
                val_res = await db.execute(
                    select(models.Category.id).where(
                        models.Category.user_id == user_id,
                        func.lower(models.Category.name) == func.lower(reassign_to)
                    )
                )
                if not val_res.scalars().first():
                    raise HTTPException(status_code=400, detail=f"La categoría de destino '{reassign_to}' no existe")

    target_category = reassign_to if reassign_to else system_fallback

    if cat_kind == "income":
        # 1. Reassign estimated incomes
        await db.execute(
            models.EstimatedIncome.__table__.update()
            .where(models.EstimatedIncome.user_id == user_id)
            .where(models.EstimatedIncome.category == category_name)
            .values(category=target_category)
        )
        # 2. Reassign real incomes
        await db.execute(
            models.Income.__table__.update()
            .where(models.Income.user_id == user_id)
            .where(models.Income.category == category_name)
            .values(category=target_category)
        )
    else:
        # 1. Reassign expenses
        await db.execute(
            models.Expense.__table__.update()
            .where(models.Expense.user_id == user_id)
            .where(models.Expense.category == category_name)
            .values(category=target_category)
        )

        # 2. Reassign fixed expenses
        await db.execute(
            models.FixedExpense.__table__.update()
            .where(models.FixedExpense.user_id == user_id)
            .where(models.FixedExpense.category == category_name)
            .values(category=reassign_to if reassign_to else None)
        )

        # 3. Reassign saving goals
        await db.execute(
            models.SavingGoal.__table__.update()
            .where(models.SavingGoal.user_id == user_id)
            .where(models.SavingGoal.category == category_name)
            .values(category=reassign_to if reassign_to else None)
        )

        # 4. Reassign debts
        await db.execute(
            models.Debt.__table__.update()
            .where(models.Debt.user_id == user_id)
            .where(models.Debt.category == category_name)
            .values(category=target_category)
        )

        # 5. Reassign debt payments belonging to user's debts
        user_debt_ids_res = await db.execute(
            select(models.Debt.id).where(models.Debt.user_id == user_id)
        )
        user_debt_ids = user_debt_ids_res.scalars().all()
        if user_debt_ids:
            await db.execute(
                models.DebtPayment.__table__.update()
                .where(models.DebtPayment.debt_id.in_(user_debt_ids))
                .where(models.DebtPayment.category == category_name)
                .values(category=target_category)
            )

        # 6. Reassign saving deposits
        user_goal_ids_res = await db.execute(
            select(models.SavingGoal.id).where(models.SavingGoal.user_id == user_id)
        )
        user_goal_ids = user_goal_ids_res.scalars().all()
        if user_goal_ids:
            await db.execute(
                models.SavingDeposit.__table__.update()
                .where(models.SavingDeposit.goal_id.in_(user_goal_ids))
                .where(models.SavingDeposit.category == category_name)
                .values(category=reassign_to if reassign_to else None)
            )

        # 7. Reassign share_members local_category for this user
        await db.execute(
            models.ShareMember.__table__.update()
            .where(models.ShareMember.user_id == user_id)
            .where(models.ShareMember.local_category == category_name)
            .values(local_category=reassign_to if reassign_to else None)
        )

        # 8. Reassign BudgetCategoryLimit
        user_budgets_res = await db.execute(
            select(models.MonthlyBudget.id).where(models.MonthlyBudget.user_id == user_id)
        )
        user_budget_ids = user_budgets_res.scalars().all()
        if user_budget_ids:
            if reassign_to and reassign_to != "Sin Categoría":
                existing_target_limits = await db.execute(
                    select(models.BudgetCategoryLimit.budget_id)
                    .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                    .where(models.BudgetCategoryLimit.category_name == target_category)
                )
                budgets_with_target = set(existing_target_limits.scalars().all())
                budgets_to_reassign = [b_id for b_id in user_budget_ids if b_id not in budgets_with_target]

                if budgets_to_reassign:
                    await db.execute(
                        models.BudgetCategoryLimit.__table__.update()
                        .where(models.BudgetCategoryLimit.budget_id.in_(budgets_to_reassign))
                        .where(models.BudgetCategoryLimit.category_name == category_name)
                        .values(category_name=target_category)
                    )
                if budgets_with_target:
                    await db.execute(
                        models.BudgetCategoryLimit.__table__.delete()
                        .where(models.BudgetCategoryLimit.budget_id.in_(list(budgets_with_target)))
                        .where(models.BudgetCategoryLimit.category_name == category_name)
                    )
            else:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.delete()
                    .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                    .where(models.BudgetCategoryLimit.category_name == category_name)
                )

    await db.delete(db_category)
    await db.commit()
    return True
