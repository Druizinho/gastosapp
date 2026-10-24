from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator
from typing import Optional, List, Any
import datetime
from uuid import UUID
from decimal import Decimal

from enum import Enum

class ShareRole(str, Enum):
    admin = "admin"
    member = "member"

class ShareMemberOut(BaseModel):
    user_id: UUID
    name: str
    role: ShareRole
    avatar_url: Optional[str] = None
    is_me: bool = False
    is_owner: bool = False
    is_my_pana: bool = False
    pana_request_pending: bool = False

    model_config = ConfigDict(from_attributes=True)

class ShareInfoOut(BaseModel):
    share_id: UUID
    entity_type: str
    my_role: ShareRole
    owner_id: UUID
    members: List[ShareMemberOut]

class ShareMembersAdd(BaseModel):
    user_ids: List[UUID] = Field(..., min_length=1)
    admin_ids: List[UUID] = []

class ShareRoleUpdate(BaseModel):
    role: ShareRole

class CurrencyType(str, Enum):
    USD_BCV = "USD_BCV"
    EUR_BCV = "EUR_BCV"
    BS = "BS"
    USDT = "USDT"
    USD_CASH = "USD_CASH"

class ProfileResponse(BaseModel):
    id: UUID
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    notify_fixed_expenses: bool = True
    notify_debts: bool = True
    notify_incomes: bool = True
    notify_inactivity: bool = True
    updated_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    notify_fixed_expenses: Optional[bool] = None
    notify_debts: Optional[bool] = None
    notify_incomes: Optional[bool] = None
    notify_inactivity: Optional[bool] = None

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1)
    color: Optional[str] = Field(default="#6366F1")
    icon: Optional[str] = Field(default="Package")

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    usage_count: int = 0
    expense_count: int = 0
    fixed_count: int = 0
    debt_count: int = 0
    saving_count: int = 0
    budget_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)

class ExpenseBase(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Amount must be greater than 0")
    description: str = Field(..., min_length=1)
    category: Optional[str] = Field(default="Sin Categoría")
    date: Optional[datetime.date] = None
    currency: CurrencyType = Field(default=CurrencyType.BS)

    @field_validator("category", mode="before")
    @classmethod
    def default_empty_category(cls, v):
        if not v or not str(v).strip():
            return "Sin Categoría"
        return str(v).strip()

class ExpenseCreate(ExpenseBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0, description="Optional manual exchange rate if API fails")

class ExpenseUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    description: Optional[str] = None
    category: Optional[str] = None
    date: Optional[datetime.date] = None
    currency: Optional[CurrencyType] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class ExpenseResponse(ExpenseBase):
    id: UUID
    user_id: UUID
    date: datetime.date
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    
    model_config = ConfigDict(from_attributes=True)

class ExchangeRateResponse(BaseModel):
    usd_bs: Optional[Decimal] = None
    eur_bs: Optional[Decimal] = None
    usdt_bs: Optional[Decimal] = None
    last_updated: Optional[datetime.datetime] = None

class CategorySummary(BaseModel):
    category: str
    total_bs: Decimal
    total_usd: Decimal
    total_eur: Decimal
    total_usdt: Decimal

class SummaryResponse(BaseModel):
    total_spent_bs: Decimal
    total_spent_usd: Decimal
    total_spent_eur: Decimal
    total_spent_usdt: Decimal
    total_this_month_bs: Decimal
    total_this_month_usd: Decimal
    total_this_month_eur: Decimal
    total_this_month_usdt: Decimal
    by_category: List[CategorySummary]

class RangeSummaryResponse(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    days_in_range: int
    total_bs: Decimal
    total_usd: Decimal
    total_eur: Decimal
    total_usdt: Decimal
    daily_avg_bs: Decimal
    daily_avg_usd: Decimal
    daily_avg_eur: Decimal
    daily_avg_usdt: Decimal
    by_category: List[CategorySummary]

# Fixed Expenses Schemas

class FixedExpenseBase(BaseModel):
    name: str = Field(..., min_length=1)
    amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    category: Optional[str] = None
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: bool = True
    notes: Optional[str] = None

class FixedExpenseCreate(FixedExpenseBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    shared_with: Optional[UUID] = None
    shared_with_ids: List[UUID] = []
    admin_ids: List[UUID] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids") or []
            if sw and sw not in sw_ids:
                data["shared_with_ids"] = [sw] + sw_ids
        return data

class FixedExpenseUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    category: Optional[str] = None
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    shared_with: Optional[UUID] = None
    shared_with_ids: Optional[List[UUID]] = None
    admin_ids: Optional[List[UUID]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids")
            if sw and not sw_ids:
                data["shared_with_ids"] = [sw]
        return data

# Fixed Expense Check Schemas

class FixedExpenseCheckBase(BaseModel):
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    paid_amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    paid_date: Optional[datetime.date] = None
    create_expense: bool = False
    notes: Optional[str] = None

class FixedExpenseCheckCreate(FixedExpenseCheckBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    paid_by_name: Optional[str] = None

class FixedExpenseCheckUpdate(BaseModel):
    paid_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    paid_date: Optional[datetime.date] = None
    notes: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class FixedExpenseCheckResponse(FixedExpenseCheckBase):
    id: UUID
    fixed_expense_id: UUID
    created_at: datetime.datetime
    expense_id: Optional[UUID] = None
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    paid_by_name: Optional[str] = None
    paid_by_user_id: Optional[UUID] = None
    sync_id: Optional[UUID] = None
    can_edit: bool = True
    mirror_check_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class FixedExpenseResponse(FixedExpenseBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    deactivated_at: Optional[datetime.datetime] = None
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    last_paid_month: Optional[str] = None
    is_shared: bool = False
    share_id: Optional[UUID] = None
    my_role: Optional[ShareRole] = None
    shared_members: List[ShareMemberOut] = []
    shared_partner_name: Optional[str] = None
    shared_by: Optional[str] = None
    checks: List[FixedExpenseCheckResponse] = []

    model_config = ConfigDict(from_attributes=True)

class FixedExpenseSummary(BaseModel):
    total_active: int
    total_paid: int
    total_pending: int
    total_bs: Decimal
    total_usd: Decimal
    total_eur: Decimal
    total_usdt: Decimal

# Debt Schemas

class DebtPaymentBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    payment_date: Optional[datetime.date] = None
    note: Optional[str] = None
    category: Optional[str] = None

class DebtPaymentCreate(DebtPaymentBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    register_as_expense: bool = False
    create_expense: Optional[bool] = None

class DebtPaymentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    payment_date: Optional[datetime.date] = None
    note: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    category: Optional[str] = None
    register_as_expense: Optional[bool] = None
    create_expense: Optional[bool] = None

class DebtPaymentResponse(DebtPaymentBase):
    id: UUID
    debt_id: UUID
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    paid_by_name: Optional[str] = None
    paid_by_user_id: Optional[UUID] = None
    sync_id: Optional[UUID] = None
    can_edit: bool = True
    create_expense: bool = False
    expense_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class DebtBase(BaseModel):
    type: str = Field(..., pattern="^(owed|receivable)$")
    counterpart: str = Field(..., min_length=1)
    concept: str = Field(..., min_length=1)
    total_amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    category: Optional[str] = None
    start_date: Optional[datetime.date] = None
    due_date: Optional[datetime.date] = None
    is_settled: bool = False
    notes: Optional[str] = None

class DebtCreate(DebtBase):
    shared_with: Optional[UUID] = None
    shared_with_ids: List[UUID] = []
    admin_ids: List[UUID] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids") or []
            if sw and sw not in sw_ids:
                data["shared_with_ids"] = [sw] + sw_ids
        return data

class DebtUpdate(BaseModel):
    counterpart: Optional[str] = None
    concept: Optional[str] = None
    total_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    category: Optional[str] = None
    due_date: Optional[datetime.date] = None
    is_settled: Optional[bool] = None
    notes: Optional[str] = None
    shared_with: Optional[UUID] = None
    shared_with_ids: Optional[List[UUID]] = None
    admin_ids: Optional[List[UUID]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids")
            if sw and not sw_ids:
                data["shared_with_ids"] = [sw]
        return data

class DebtResponse(DebtBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    payments: List[DebtPaymentResponse] = []
    is_shared: bool = False
    share_id: Optional[UUID] = None
    my_role: Optional[ShareRole] = None
    shared_members: List[ShareMemberOut] = []
    shared_partner_name: Optional[str] = None
    shared_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# Estimated Income Schemas

class EstimatedIncomeBase(BaseModel):
    name: str = Field(..., min_length=1)
    expected_amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: bool = True
    notes: Optional[str] = None

class EstimatedIncomeCreate(EstimatedIncomeBase):
    pass

class EstimatedIncomeUpdate(BaseModel):
    name: Optional[str] = None
    expected_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class IncomeCheckBase(BaseModel):
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    real_amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    payment_date: Optional[datetime.date] = None
    is_partial: bool = False
    pending_date: Optional[datetime.date] = None
    notes: Optional[str] = None

class IncomeCheckCreate(IncomeCheckBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class IncomeCheckResponse(IncomeCheckBase):
    id: UUID
    income_id: UUID
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)

class EstimatedIncomeResponse(EstimatedIncomeBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    checks: List[IncomeCheckResponse] = []

    model_config = ConfigDict(from_attributes=True)

class PushSubscriptionCreate(BaseModel):
    fcm_token: str

class PushSubscriptionResponse(PushSubscriptionCreate):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    body: str
    type: str
    is_read: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class UserSearchResult(BaseModel):
    id: UUID
    display_name: str
    email: str

class ConnectionRequest(BaseModel):
    email: str

class ConnectionResponse(BaseModel):
    id: UUID
    requester_id: UUID
    receiver_id: UUID
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    
    # Extra fields populated for frontend
    partner_id: UUID
    partner_name: str
    is_requester: bool

    model_config = ConfigDict(from_attributes=True)


class SharedFixedExpenseBrief(BaseModel):
    id: UUID
    name: str
    amount: Decimal
    currency: str
    category: Optional[str] = None
    payment_day: Optional[int] = None
    is_active: bool = True
    is_paid_this_month: bool = False
    paid_by_name: Optional[str] = None
    paid_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []


class SharedDebtBrief(BaseModel):
    id: UUID
    concept: str
    counterpart: str
    total_amount: Decimal
    remaining_amount: Decimal
    currency: str
    type: str
    is_settled: bool
    paid_percentage: float
    last_payment_by: Optional[str] = None
    last_payment_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []


class SharedSavingGoalBrief(BaseModel):
    id: UUID
    name: str
    target_amount: Optional[Decimal] = None
    type: str = 'saving'
    current_amount: Decimal
    currency: str
    category: Optional[str] = None
    color: Optional[str] = '#10B981'
    icon: Optional[str] = 'piggy-bank'
    is_completed: bool
    progress_percentage: float
    last_deposit_by: Optional[str] = None
    last_deposit_amount: Optional[Decimal] = None
    last_deposit_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []


class PanaSummary(BaseModel):
    id: UUID
    partner_id: UUID
    partner_name: str
    partner_email: Optional[str] = None
    status: str
    created_at: datetime.datetime
    shared_fixed_expenses_count: int = 0
    pending_fixed_expenses_this_month: int = 0
    shared_debts_count: int = 0
    total_debts_remaining: Decimal = Decimal(0)
    debts_currency_summary: dict = {}
    shared_saving_goals_count: int = 0


class PanasGlobalOverview(BaseModel):
    panas: List[PanaSummary]
    total_active_panas: int
    total_shared_fixed_expenses: int
    pending_shared_fixed_expenses_this_month: int
    total_shared_debts: int
    shared_debts_remaining_by_currency: dict
    total_shared_saving_goals: int = 0


class PanaDetail(BaseModel):
    connection_id: UUID
    partner_id: UUID
    partner_name: str
    partner_email: Optional[str] = None
    shared_fixed_expenses: List[SharedFixedExpenseBrief]
    shared_debts: List[SharedDebtBrief]
    shared_saving_goals: List[SharedSavingGoalBrief] = []


# Saving Goals Schemas

class SavingDepositBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    deposit_date: Optional[datetime.date] = None
    note: Optional[str] = None

class SavingDepositCreate(SavingDepositBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    register_as_expense: bool = False

class SavingDepositUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    deposit_date: Optional[datetime.date] = None
    note: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class SavingDepositResponse(SavingDepositBase):
    id: UUID
    goal_id: UUID
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    create_expense: bool = False
    expense_id: Optional[UUID] = None
    paid_by_name: Optional[str] = None
    paid_by_user_id: Optional[UUID] = None
    sync_id: Optional[UUID] = None
    can_edit: bool = True
    mirror_deposit_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class SavingGoalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default='saving')
    target_amount: Optional[Decimal] = Field(None, gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    target_date: Optional[datetime.date] = None
    category: Optional[str] = None
    color: Optional[str] = '#10B981'
    icon: Optional[str] = 'piggy-bank'
    notes: Optional[str] = None
    is_active: bool = True

class SavingGoalCreate(SavingGoalBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    shared_with: Optional[UUID] = None
    shared_with_ids: List[UUID] = []
    admin_ids: List[UUID] = []

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids") or []
            if sw and sw not in sw_ids:
                data["shared_with_ids"] = [sw] + sw_ids
        return data

class SavingGoalUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    target_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    target_date: Optional[datetime.date] = None
    category: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_completed: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    shared_with: Optional[UUID] = None
    shared_with_ids: Optional[List[UUID]] = None
    admin_ids: Optional[List[UUID]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_shared_with(cls, data: Any):
        if isinstance(data, dict):
            sw = data.get("shared_with")
            sw_ids = data.get("shared_with_ids")
            if sw and not sw_ids:
                data["shared_with_ids"] = [sw]
        return data

class SavingGoalResponse(SavingGoalBase):
    id: UUID
    user_id: UUID
    is_completed: bool = False
    completed_at: Optional[datetime.datetime] = None
    is_active: bool = True
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None
    deposits: List[SavingDepositResponse] = []
    is_shared: bool = False
    share_id: Optional[UUID] = None
    my_role: Optional[ShareRole] = None
    shared_members: List[ShareMemberOut] = []
    shared_partner_name: Optional[str] = None
    shared_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class SavingSummaryResponse(BaseModel):
    total_goals: int
    active_goals: int
    completed_goals: int
    total_saved_bs: Decimal
    total_saved_usd: Decimal
    total_saved_eur: Decimal
    total_saved_usdt: Decimal


# Budgets schemas

class BudgetIncomeMode(str, Enum):
    manual = "manual"
    single_income = "single_income"
    all_incomes = "all_incomes"

class BudgetTrafficLight(str, Enum):
    green = "green"
    yellow = "yellow"
    red = "red"

class BudgetCategoryLimitInput(BaseModel):
    category_name: str = Field(..., min_length=1)
    limit_amount: Decimal = Field(..., ge=0)
    currency: CurrencyType = Field(default=CurrencyType.USD_BCV)

class MonthlyBudgetUpsert(BaseModel):
    currency: CurrencyType = Field(default=CurrencyType.USD_BCV)
    income_mode: BudgetIncomeMode = Field(default=BudgetIncomeMode.manual)
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = Field(None, ge=0)
    category_limits: Optional[List[BudgetCategoryLimitInput]] = None

class BudgetCategorySummaryOut(BaseModel):
    category_name: str
    limit_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal = Decimal("0")
    currency: CurrencyType = CurrencyType.USD_BCV
    spent_percentage: float
    traffic_light: BudgetTrafficLight
    spent_usd: Decimal = Decimal("0")
    spent_bs: Decimal = Decimal("0")
    spent_eur: Decimal = Decimal("0")
    spent_usdt: Decimal = Decimal("0")
    limit_usd: Decimal = Decimal("0")
    limit_bs: Decimal = Decimal("0")
    limit_eur: Decimal = Decimal("0")
    limit_usdt: Decimal = Decimal("0")
    also_in_budgets: List[str] = []
    is_inherited: bool = False
    needs_limit: bool = False

    model_config = ConfigDict(from_attributes=True)

class CategoryMonthSpendOut(BaseModel):
    category_name: str
    spent_usd: Decimal = Decimal("0")
    spent_bs: Decimal = Decimal("0")
    spent_eur: Decimal = Decimal("0")
    spent_usdt: Decimal = Decimal("0")

    model_config = ConfigDict(from_attributes=True)

class SingleBudgetOut(BaseModel):
    id: UUID
    name: str
    month_year: str
    currency: CurrencyType = CurrencyType.USD_BCV
    income_mode: BudgetIncomeMode = BudgetIncomeMode.manual
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = None
    effective_global_limit: Optional[Decimal] = None
    global_limit_usd: Optional[Decimal] = None
    global_limit_bs: Optional[Decimal] = None
    global_limit_eur: Optional[Decimal] = None
    global_limit_usdt: Optional[Decimal] = None
    total_spent_budget_currency: Decimal = Decimal("0")
    total_spent_usd: Decimal = Decimal("0")
    total_spent_bs: Decimal = Decimal("0")
    total_spent_eur: Decimal = Decimal("0")
    total_spent_usdt: Decimal = Decimal("0")
    global_spent_percentage: float = 0.0
    global_traffic_light: BudgetTrafficLight = BudgetTrafficLight.green
    is_confirmed: bool = False
    is_primary: bool = False
    allocated_budget_currency: Decimal = Decimal("0")
    allocated_usd: Decimal = Decimal("0")
    allocated_bs: Decimal = Decimal("0")
    allocated_eur: Decimal = Decimal("0")
    allocated_usdt: Decimal = Decimal("0")
    category_limits: List[BudgetCategorySummaryOut] = []
    categories_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class MonthlyBudgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    currency: CurrencyType = Field(default=CurrencyType.USD_BCV)
    income_mode: BudgetIncomeMode = Field(default=BudgetIncomeMode.manual)
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = Field(None, ge=0)
    is_primary: Optional[bool] = False
    categories: Optional[List[str]] = None

class MonthlyBudgetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    currency: Optional[CurrencyType] = None
    income_mode: Optional[BudgetIncomeMode] = None
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = Field(None, ge=0)
    is_primary: Optional[bool] = None
    categories: Optional[List[str]] = None

class MonthlyBudgetResponse(BaseModel):
    id: Optional[UUID] = None
    name: Optional[str] = None
    month_year: str
    currency: CurrencyType = Field(default=CurrencyType.USD_BCV)
    income_mode: BudgetIncomeMode = Field(default=BudgetIncomeMode.manual)
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = None
    effective_global_limit: Optional[Decimal] = None
    global_limit_usd: Optional[Decimal] = None
    global_limit_bs: Optional[Decimal] = None
    global_limit_eur: Optional[Decimal] = None
    global_limit_usdt: Optional[Decimal] = None
    total_spent_budget_currency: Decimal = Decimal("0")
    total_spent_usd: Decimal = Decimal("0")
    total_spent_bs: Decimal = Decimal("0")
    total_spent_eur: Decimal = Decimal("0")
    total_spent_usdt: Decimal = Decimal("0")
    global_spent_percentage: float = 0.0
    global_traffic_light: BudgetTrafficLight = BudgetTrafficLight.green
    is_confirmed: bool = False
    allocated_budget_currency: Decimal = Decimal("0")
    allocated_usd: Decimal = Decimal("0")
    allocated_bs: Decimal = Decimal("0")
    allocated_eur: Decimal = Decimal("0")
    allocated_usdt: Decimal = Decimal("0")
    category_limits: List[BudgetCategorySummaryOut] = []
    unbudgeted_spent_budget_currency: Decimal = Decimal("0")
    unbudgeted_spent_usd: Decimal = Decimal("0")
    unbudgeted_spent_bs: Decimal = Decimal("0")
    unbudgeted_spent_eur: Decimal = Decimal("0")
    unbudgeted_spent_usdt: Decimal = Decimal("0")
    unbudgeted_categories: List[str] = []
    exists: bool = False
    budgets: List[SingleBudgetOut] = []
    available_categories: List[str] = []
    category_spending: List[CategoryMonthSpendOut] = []

    model_config = ConfigDict(from_attributes=True)

