from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
import datetime
from uuid import UUID
from decimal import Decimal

from enum import Enum

class CurrencyType(str, Enum):
    BS_USD = "BS_USD"
    BS_EUR = "BS_EUR"
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
    currency: CurrencyType = Field(default=CurrencyType.BS_USD)

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
