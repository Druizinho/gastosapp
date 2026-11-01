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
    local_category: Optional[str] = None

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

class ShareLocalCategoryUpdate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)

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
    notify_budgets: bool = True
    notify_panas: bool = True
    updated_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    notify_fixed_expenses: Optional[bool] = None
    notify_debts: Optional[bool] = None
    notify_incomes: Optional[bool] = None
    notify_inactivity: Optional[bool] = None
    notify_budgets: Optional[bool] = None
    notify_panas: Optional[bool] = None

class CategoryKind(str, Enum):
    expense = "expense"
    income = "income"

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1)
    color: Optional[str] = Field(default="#6366F1")
    icon: Optional[str] = Field(default="Package")
    kind: CategoryKind = Field(default=CategoryKind.expense)

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: UUID
    user_id: UUID
    kind: CategoryKind = Field(default=CategoryKind.expense)
    created_at: datetime.datetime
    usage_count: int = 0
    expense_count: int = 0
    fixed_count: int = 0
    debt_count: int = 0
    saving_count: int = 0
    budget_count: int = 0
    income_count: int = 0
    
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
    rate_date: Optional[datetime.date] = None
    is_historical: bool = False

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
    income_total_bs: Decimal = Decimal("0")
    income_total_usd: Decimal = Decimal("0")
    income_total_eur: Decimal = Decimal("0")
    income_total_usdt: Decimal = Decimal("0")
    income_this_month_bs: Decimal = Decimal("0")
    income_this_month_usd: Decimal = Decimal("0")
    income_this_month_eur: Decimal = Decimal("0")
    income_this_month_usdt: Decimal = Decimal("0")
    balance_bs: Decimal = Decimal("0")
    balance_usd: Decimal = Decimal("0")
    balance_eur: Decimal = Decimal("0")
    balance_usdt: Decimal = Decimal("0")
    balance_this_month_bs: Decimal = Decimal("0")
    balance_this_month_usd: Decimal = Decimal("0")
    balance_this_month_eur: Decimal = Decimal("0")
    balance_this_month_usdt: Decimal = Decimal("0")
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
    income_total_bs: Decimal = Decimal("0")
    income_total_usd: Decimal = Decimal("0")
    income_total_eur: Decimal = Decimal("0")
    income_total_usdt: Decimal = Decimal("0")
    balance_bs: Decimal = Decimal("0")
    balance_usd: Decimal = Decimal("0")
    balance_eur: Decimal = Decimal("0")
    balance_usdt: Decimal = Decimal("0")
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
    category: Optional[str] = None

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
    transaction_type: str = Field(default='payment', pattern="^(payment|increase)$")
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
    transaction_type: Optional[str] = Field(None, pattern="^(payment|increase)$")
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
    category: Optional[str] = Field(default="Otros ingresos")
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: bool = True
    notes: Optional[str] = None

    @field_validator("category", mode="before")
    @classmethod
    def default_empty_category(cls, v):
        if not v or not str(v).strip():
            return "Otros ingresos"
        return str(v).strip()

class EstimatedIncomeCreate(EstimatedIncomeBase):
    pass

class EstimatedIncomeUpdate(BaseModel):
    name: Optional[str] = None
    expected_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    category: Optional[str] = None
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

# Real Income Schemas

class IncomeCheckTarget(BaseModel):
    estimated_income_id: UUID
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    is_partial: Optional[bool] = None
    pending_date: Optional[datetime.date] = None

class IncomeBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    description: str = Field(..., min_length=1)
    category: Optional[str] = Field(default="Otros ingresos")
    date: Optional[datetime.date] = None
    currency: CurrencyType = Field(default=CurrencyType.BS)

    @field_validator("category", mode="before")
    @classmethod
    def default_empty_category(cls, v):
        if not v or not str(v).strip():
            return "Otros ingresos"
        return str(v).strip()

class IncomeCreate(IncomeBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    income_check_target: Optional[IncomeCheckTarget] = None
    estimated_income_id: Optional[UUID] = None
    month_year: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")

class IncomeUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    description: Optional[str] = None
    category: Optional[str] = None
    date: Optional[datetime.date] = None
    currency: Optional[CurrencyType] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class IncomeResponse(IncomeBase):
    id: UUID
    user_id: UUID
    date: datetime.date
    created_at: datetime.datetime
    income_check_id: Optional[UUID] = None
    estimated_income_id: Optional[UUID] = None
    estimated_income_name: Optional[str] = None
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None

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
    url: Optional[str] = "/"
    is_resolved: bool = False
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
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
    partner_avatar_url: Optional[str] = None
    is_requester: bool

    model_config = ConfigDict(from_attributes=True)


class SharedFixedExpenseBrief(BaseModel):
    id: UUID
    name: str
    amount: Decimal = Decimal(0)
    currency: str = "BS"
    category: Optional[str] = None
    payment_day: Optional[int] = None
    is_active: bool = True
    is_paid_this_month: bool = False
    paid_by_name: Optional[str] = None
    paid_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("name", mode="before")
    @classmethod
    def _val_name(cls, v: Any) -> Any:
        return "" if v is None else str(v)

    @field_validator("amount", mode="before")
    @classmethod
    def _val_amount(cls, v: Any) -> Any:
        return Decimal(0) if v is None else v

    @field_validator("currency", mode="before")
    @classmethod
    def _val_currency(cls, v: Any) -> Any:
        return "BS" if v is None else v

    @field_validator("payment_day", mode="before")
    @classmethod
    def _val_payment_day(cls, v: Any) -> Any:
        if v is None:
            return None
        try:
            val = int(float(str(v)))
            return val if 1 <= val <= 31 else None
        except Exception:
            return None

    @field_validator("paid_date", mode="before")
    @classmethod
    def _val_paid_date(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, datetime.datetime):
            return v.date()
        if isinstance(v, datetime.date):
            return v
        if isinstance(v, str):
            try:
                return datetime.date.fromisoformat(v[:10])
            except Exception:
                return None
        return None

    @field_validator("is_active", mode="before")
    @classmethod
    def _val_is_active(cls, v: Any) -> Any:
        return True if v is None else v

    @field_validator("is_paid_this_month", mode="before")
    @classmethod
    def _val_is_paid_this_month(cls, v: Any) -> Any:
        return False if v is None else v

    @field_validator("members_count", mode="before")
    @classmethod
    def _val_members_count(cls, v: Any) -> Any:
        return 2 if v is None else v

    @field_validator("member_names", mode="before")
    @classmethod
    def _val_member_names(cls, v: Any) -> Any:
        return [] if v is None else v


class SharedDebtBrief(BaseModel):
    id: UUID
    concept: str
    counterpart: str
    total_amount: Decimal = Decimal(0)
    remaining_amount: Decimal = Decimal(0)
    currency: str = "BS"
    type: str = "owed"
    is_settled: bool = False
    paid_percentage: float = 0.0
    last_payment_by: Optional[str] = None
    last_payment_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("concept", "counterpart", mode="before")
    @classmethod
    def _val_debt_strings(cls, v: Any) -> Any:
        return "" if v is None else str(v)

    @field_validator("last_payment_date", mode="before")
    @classmethod
    def _val_last_payment_date(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, datetime.datetime):
            return v.date()
        if isinstance(v, datetime.date):
            return v
        if isinstance(v, str):
            try:
                return datetime.date.fromisoformat(v[:10])
            except Exception:
                return None
        return None

    @field_validator("total_amount", "remaining_amount", mode="before")
    @classmethod
    def _val_amounts(cls, v: Any) -> Any:
        return Decimal(0) if v is None else v

    @field_validator("currency", mode="before")
    @classmethod
    def _val_currency(cls, v: Any) -> Any:
        return "BS" if v is None else v

    @field_validator("type", mode="before")
    @classmethod
    def _val_type(cls, v: Any) -> Any:
        return "owed" if v is None else v

    @field_validator("is_settled", mode="before")
    @classmethod
    def _val_is_settled(cls, v: Any) -> Any:
        return False if v is None else v

    @field_validator("paid_percentage", mode="before")
    @classmethod
    def _val_paid_percentage(cls, v: Any) -> Any:
        return 0.0 if v is None else v

    @field_validator("members_count", mode="before")
    @classmethod
    def _val_members_count(cls, v: Any) -> Any:
        return 2 if v is None else v

    @field_validator("member_names", mode="before")
    @classmethod
    def _val_member_names(cls, v: Any) -> Any:
        return [] if v is None else v


class SharedSavingGoalBrief(BaseModel):
    id: UUID
    name: str
    target_amount: Optional[Decimal] = None
    type: str = 'saving'
    current_amount: Decimal = Decimal(0)
    currency: str = "BS"
    category: Optional[str] = None
    color: Optional[str] = '#10B981'
    icon: Optional[str] = 'piggy-bank'
    is_completed: bool = False
    progress_percentage: float = 0.0
    last_deposit_by: Optional[str] = None
    last_deposit_amount: Optional[Decimal] = None
    last_deposit_date: Optional[datetime.date] = None
    members_count: int = 2
    member_names: List[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("name", mode="before")
    @classmethod
    def _val_goal_name(cls, v: Any) -> Any:
        return "" if v is None else str(v)

    @field_validator("last_deposit_date", mode="before")
    @classmethod
    def _val_last_deposit_date(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, datetime.datetime):
            return v.date()
        if isinstance(v, datetime.date):
            return v
        if isinstance(v, str):
            try:
                return datetime.date.fromisoformat(v[:10])
            except Exception:
                return None
        return None

    @field_validator("type", mode="before")
    @classmethod
    def _val_type(cls, v: Any) -> Any:
        return "saving" if v is None else v

    @field_validator("current_amount", mode="before")
    @classmethod
    def _val_current_amount(cls, v: Any) -> Any:
        return Decimal(0) if v is None else v

    @field_validator("currency", mode="before")
    @classmethod
    def _val_currency(cls, v: Any) -> Any:
        return "BS" if v is None else v

    @field_validator("color", mode="before")
    @classmethod
    def _val_color(cls, v: Any) -> Any:
        return "#10B981" if v is None else v

    @field_validator("icon", mode="before")
    @classmethod
    def _val_icon(cls, v: Any) -> Any:
        return "piggy-bank" if v is None else v

    @field_validator("is_completed", mode="before")
    @classmethod
    def _val_is_completed(cls, v: Any) -> Any:
        return False if v is None else v

    @field_validator("progress_percentage", mode="before")
    @classmethod
    def _val_progress_percentage(cls, v: Any) -> Any:
        return 0.0 if v is None else v

    @field_validator("members_count", mode="before")
    @classmethod
    def _val_members_count(cls, v: Any) -> Any:
        return 2 if v is None else v

    @field_validator("member_names", mode="before")
    @classmethod
    def _val_member_names(cls, v: Any) -> Any:
        return [] if v is None else v


class SharedSubBudgetBrief(BaseModel):
    id: UUID
    name: str
    month_year: str
    currency: str = "USD_BCV"
    effective_global_limit: float = 0.0
    total_spent_budget_currency: float = 0.0
    global_spent_percentage: float = 0.0
    global_traffic_light: str = "green"
    categories_count: int = 0
    is_mine: bool = True
    owner_name: Optional[str] = None
    members_count: int = 1
    member_names: List[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("currency", mode="before")
    @classmethod
    def _val_currency(cls, v: Any) -> Any:
        return "USD_BCV" if v is None else v

    @field_validator("effective_global_limit", "total_spent_budget_currency", "global_spent_percentage", mode="before")
    @classmethod
    def _val_floats(cls, v: Any) -> Any:
        return 0.0 if v is None else v

    @field_validator("global_traffic_light", mode="before")
    @classmethod
    def _val_traffic_light(cls, v: Any) -> Any:
        return "green" if v is None else v

    @field_validator("categories_count", mode="before")
    @classmethod
    def _val_categories_count(cls, v: Any) -> Any:
        return 0 if v is None else v

    @field_validator("is_mine", mode="before")
    @classmethod
    def _val_is_mine(cls, v: Any) -> Any:
        return True if v is None else v

    @field_validator("members_count", mode="before")
    @classmethod
    def _val_members_count(cls, v: Any) -> Any:
        return 1 if v is None else v

    @field_validator("member_names", mode="before")
    @classmethod
    def _val_member_names(cls, v: Any) -> Any:
        return [] if v is None else v


class PanaSummary(BaseModel):
    id: UUID
    partner_id: UUID
    partner_name: str
    partner_avatar_url: Optional[str] = None
    partner_email: Optional[str] = None
    status: str
    created_at: datetime.datetime
    shared_fixed_expenses_count: int = 0
    pending_fixed_expenses_this_month: int = 0
    shared_debts_count: int = 0
    total_debts_remaining: Decimal = Decimal(0)
    debts_currency_summary: dict = {}
    shared_saving_goals_count: int = 0
    shared_sub_budgets_count: int = 0


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
    partner_avatar_url: Optional[str] = None
    partner_email: Optional[str] = None
    shared_fixed_expenses: List[SharedFixedExpenseBrief] = []
    shared_debts: List[SharedDebtBrief] = []
    shared_saving_goals: List[SharedSavingGoalBrief] = []
    shared_sub_budgets: List[SharedSubBudgetBrief] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("shared_fixed_expenses", "shared_debts", "shared_saving_goals", "shared_sub_budgets", mode="before")
    @classmethod
    def _val_detail_lists(cls, v: Any) -> Any:
        return [] if v is None else v


# Saving Goals Schemas

class SavingDepositBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    transaction_type: str = Field(default='deposit', pattern="^(deposit|withdrawal)$")
    deposit_date: Optional[datetime.date] = None
    note: Optional[str] = None
    category: Optional[str] = None

class SavingDepositCreate(SavingDepositBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    register_as_expense: bool = False

class SavingDepositUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    transaction_type: Optional[str] = Field(None, pattern="^(deposit|withdrawal)$")
    deposit_date: Optional[datetime.date] = None
    note: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)
    category: Optional[str] = None
    register_as_expense: Optional[bool] = None

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
    is_shared: bool = False
    share_id: Optional[UUID] = None
    my_role: Optional[ShareRole] = None
    shared_members: List[ShareMemberOut] = []
    shared_partner_name: Optional[str] = None
    shared_by: Optional[str] = None
    owner_id: Optional[UUID] = None
    is_read_only: bool = False

    model_config = ConfigDict(from_attributes=True)

class MonthlyBudgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    currency: CurrencyType = Field(default=CurrencyType.USD_BCV)
    income_mode: BudgetIncomeMode = Field(default=BudgetIncomeMode.manual)
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = Field(None, ge=0)
    is_primary: Optional[bool] = False
    categories: Optional[List[str]] = None
    shared_with_ids: Optional[List[UUID]] = None

class MonthlyBudgetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    currency: Optional[CurrencyType] = None
    income_mode: Optional[BudgetIncomeMode] = None
    linked_income_id: Optional[UUID] = None
    manual_global_limit: Optional[Decimal] = Field(None, ge=0)
    is_primary: Optional[bool] = None
    categories: Optional[List[str]] = None
    shared_with_ids: Optional[List[UUID]] = None

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
    shared_with_me_budgets: List[SingleBudgetOut] = []
    available_categories: List[str] = []
    category_spending: List[CategoryMonthSpendOut] = []

    model_config = ConfigDict(from_attributes=True)

