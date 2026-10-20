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

    # By category
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

    # Totales del rango
    total_result = await db.execute(
        select(*sum_cols())
        .filter(models.Expense.user_id == user_id)
        .filter(models.Expense.date >= date_from)
        .filter(models.Expense.date <= date_to)
    )
    total_bs, total_usd, total_eur, total_usdt = total_result.first()

    # Por categoría
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
]

_categories_debts_schema_ensured = False

async def ensure_categories_and_debts_schema() -> None:
    global _categories_debts_schema_ensured
    if _categories_debts_schema_ensured:
        return
    try:
        async with engine.begin() as conn:
            # 1. categories columns
            await conn.execute(
                text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'Package'")
            )
            # 2. debts columns
            await conn.execute(
                text("ALTER TABLE debts ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Deudas'")
            )
            # 3. debt_payments columns
            await conn.execute(
                text("ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS category VARCHAR(100)")
            )
            await conn.execute(
                text("ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS create_expense BOOLEAN NOT NULL DEFAULT FALSE")
            )
            await conn.execute(
                text("ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL")
            )
            # 4. Migrate legacy categories rows where color holds an icon name
            await conn.execute(
                text("""
                    UPDATE categories 
                    SET icon = color 
                    WHERE (icon IS NULL OR icon = 'Package' OR icon = '') 
                      AND color IS NOT NULL 
                      AND color NOT LIKE '#%'
                """)
            )
            await conn.execute(
                text("""
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
                        ELSE '#6366F1'
                    END
                    WHERE color IS NULL OR color NOT LIKE '#%'
                """)
            )
            await conn.execute(
                text("UPDATE categories SET icon = 'Package' WHERE icon IS NULL OR icon = ''")
            )
        _categories_debts_schema_ensured = True
    except Exception as e:
        print(f"Aviso asegurando esquema de categorías y deudas: {e}")

def _normalize_category_instance(cat: models.Category) -> None:
    if not cat.icon or cat.icon.strip() == "":
        if cat.color and not cat.color.startswith("#"):
            cat.icon = cat.color
        else:
            cat.icon = "Package"
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
        }
        cat.color = mapping.get(name_lower, mapping.get(color_lower, "#6366F1"))

async def seed_default_categories(db: AsyncSession, user_id: UUID, only_if_empty: bool = False) -> List[models.Category]:
    res = await db.execute(select(models.Category).where(models.Category.user_id == user_id).order_by(models.Category.created_at.asc()))
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
        select(models.Category).where(models.Category.user_id == user_id).order_by(models.Category.created_at.asc())
    )
    return res.scalars().all()

async def get_categories(db: AsyncSession, user_id: UUID):
    result = await db.execute(
        select(models.Category).filter(models.Category.user_id == user_id).order_by(models.Category.created_at.asc())
    )
    cats = list(result.scalars().all())
    if not cats:
        cats = list(await seed_default_categories(db, user_id=user_id, only_if_empty=True))

    for cat in cats:
        _normalize_category_instance(cat)

    # Grouped counts across 5 tables (no N+1 queries)
    exp_res = await db.execute(
        select(models.Expense.category, func.count(models.Expense.id))
        .where(models.Expense.user_id == user_id)
        .group_by(models.Expense.category)
    )
    exp_counts = {row[0].strip().lower(): row[1] for row in exp_res.all() if row[0]}

    fe_res = await db.execute(
        select(models.FixedExpense.category, func.count(models.FixedExpense.id))
        .where(models.FixedExpense.user_id == user_id)
        .group_by(models.FixedExpense.category)
    )
    fe_counts = {row[0].strip().lower(): row[1] for row in fe_res.all() if row[0]}

    debt_res = await db.execute(
        select(models.Debt.category, func.count(models.Debt.id))
        .where(models.Debt.user_id == user_id)
        .group_by(models.Debt.category)
    )
    debt_counts = {row[0].strip().lower(): row[1] for row in debt_res.all() if row[0]}

    saving_res = await db.execute(
        select(models.SavingGoal.category, func.count(models.SavingGoal.id))
        .where(models.SavingGoal.user_id == user_id)
        .group_by(models.SavingGoal.category)
    )
    saving_counts = {row[0].strip().lower(): row[1] for row in saving_res.all() if row[0]}

    budget_res = await db.execute(
        select(models.BudgetCategoryLimit.category_name, func.count(models.BudgetCategoryLimit.id))
        .join(models.MonthlyBudget, models.BudgetCategoryLimit.budget_id == models.MonthlyBudget.id)
        .where(models.MonthlyBudget.user_id == user_id)
        .group_by(models.BudgetCategoryLimit.category_name)
    )
    budget_counts = {row[0].strip().lower(): row[1] for row in budget_res.all() if row[0]}

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
        cat.usage_count = ec + fc + dc + sc

    return cats

async def get_category(db: AsyncSession, category_id: UUID, user_id: UUID):
    result = await db.execute(select(models.Category).filter(models.Category.id == category_id, models.Category.user_id == user_id))
    cat = result.scalars().first()
    if cat:
        _normalize_category_instance(cat)
    return cat

async def create_category(db: AsyncSession, category: schemas.CategoryCreate, user_id: UUID):
    norm_name = category.name.strip()
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

    raw_color = cat_data.get("color")
    raw_icon = cat_data.get("icon")
    if raw_color and not raw_color.startswith("#"):
        if not raw_icon or raw_icon == "Package":
            cat_data["icon"] = raw_color
        cat_data["color"] = "#6366F1"
    elif not raw_icon:
        cat_data["icon"] = "Package"

    db_category = models.Category(**cat_data, user_id=user_id)
    db.add(db_category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    await db.refresh(db_category)
    _normalize_category_instance(db_category)
    return db_category

async def update_category(db: AsyncSession, category_id: UUID, category_update: schemas.CategoryCreate, user_id: UUID):
    db_category = await get_category(db, category_id, user_id)
    if not db_category:
        return None
    
    old_name = db_category.name
    new_name = category_update.name.strip()

    if old_name.lower() != new_name.lower():
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

    raw_color = update_data.get("color")
    raw_icon = update_data.get("icon")
    if raw_color and not raw_color.startswith("#"):
        if not raw_icon or raw_icon == "Package":
            update_data["icon"] = raw_color
        update_data["color"] = "#6366F1"
    elif not raw_icon and "icon" in update_data:
        update_data["icon"] = "Package"

    for key, value in update_data.items():
        setattr(db_category, key, value)
        
    if old_name != new_name:
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

        # 6. Synchronize BudgetCategoryLimit for user's budgets
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

async def delete_category(db: AsyncSession, category_id: UUID, user_id: UUID, reassign_to: Optional[str] = None):
    db_category = await get_category(db, category_id, user_id)
    if not db_category:
        return False
    
    category_name = db_category.name
    
    if reassign_to:
        reassign_to = reassign_to.strip()
        if reassign_to.lower() == category_name.lower():
            raise HTTPException(status_code=400, detail="No se puede reasignar a la categoría que se está eliminando")
        if reassign_to != "Sin Categoría":
            val_res = await db.execute(
                select(models.Category.id).where(
                    models.Category.user_id == user_id,
                    func.lower(models.Category.name) == func.lower(reassign_to)
                )
            )
            if not val_res.scalars().first():
                raise HTTPException(status_code=400, detail=f"La categoría de destino '{reassign_to}' no existe")

    target_category = reassign_to if reassign_to else "Sin Categoría"

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

    # 6. Synchronize BudgetCategoryLimit rows
    user_budgets_res = await db.execute(
        select(models.MonthlyBudget.id).where(models.MonthlyBudget.user_id == user_id)
    )
    user_budget_ids = user_budgets_res.scalars().all()
    if user_budget_ids:
        if reassign_to:
            existing_target_limits = await db.execute(
                select(models.BudgetCategoryLimit.budget_id)
                .where(models.BudgetCategoryLimit.budget_id.in_(user_budget_ids))
                .where(models.BudgetCategoryLimit.category_name == reassign_to)
            )
            budgets_with_target = set(existing_target_limits.scalars().all())
            budgets_to_reassign = [b_id for b_id in user_budget_ids if b_id not in budgets_with_target]

            if budgets_to_reassign:
                await db.execute(
                    models.BudgetCategoryLimit.__table__.update()
                    .where(models.BudgetCategoryLimit.budget_id.in_(budgets_to_reassign))
                    .where(models.BudgetCategoryLimit.category_name == category_name)
                    .values(category_name=reassign_to)
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
