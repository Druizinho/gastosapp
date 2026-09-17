from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
import datetime
from uuid import UUID
from decimal import Decimal

from enum import Enum

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
    updated_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1)
    color: Optional[str] = Field(default="#cbd5e1")

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    
    model_config = ConfigDict(from_attributes=True)

class ExpenseBase(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Amount must be greater than 0")
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    date: Optional[datetime.date] = None
    currency: CurrencyType = Field(default=CurrencyType.BS)

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

class FixedExpenseUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    category: Optional[str] = None
    payment_day: Optional[int] = Field(None, ge=1, le=31)
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    manual_rate: Optional[Decimal] = Field(None, gt=0)

class FixedExpenseResponse(FixedExpenseBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    amount_usd: Optional[Decimal] = None
    amount_bs: Optional[Decimal] = None
    amount_eur: Optional[Decimal] = None
    amount_usdt: Optional[Decimal] = None
    rate_usd_bs: Optional[Decimal] = None
    rate_eur_bs: Optional[Decimal] = None
    rate_usdt_bs: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)

class FixedExpenseSummary(BaseModel):
    total_active: int
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

class DebtPaymentCreate(DebtPaymentBase):
    manual_rate: Optional[Decimal] = Field(None, gt=0)

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

    model_config = ConfigDict(from_attributes=True)

class DebtBase(BaseModel):
    type: str = Field(..., pattern="^(owed|receivable)$")
    counterpart: str = Field(..., min_length=1)
    concept: str = Field(..., min_length=1)
    total_amount: Decimal = Field(..., gt=0)
    currency: CurrencyType = Field(default=CurrencyType.BS)
    start_date: Optional[datetime.date] = None
    due_date: Optional[datetime.date] = None
    is_settled: bool = False
    notes: Optional[str] = None

class DebtCreate(DebtBase):
    pass

class DebtUpdate(BaseModel):
    counterpart: Optional[str] = None
    concept: Optional[str] = None
    total_amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[CurrencyType] = None
    due_date: Optional[datetime.date] = None
    is_settled: Optional[bool] = None
    notes: Optional[str] = None

class DebtResponse(DebtBase):
    id: UUID
    user_id: UUID
    created_at: datetime.datetime
    payments: List[DebtPaymentResponse] = []

    model_config = ConfigDict(from_attributes=True)

