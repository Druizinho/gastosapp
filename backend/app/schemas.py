from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
import datetime
from uuid import UUID
from decimal import Decimal

class ExpenseBase(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Amount must be greater than 0")
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    date: Optional[datetime.date] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    description: Optional[str] = None
    category: Optional[str] = None
    date: Optional[datetime.date] = None

class ExpenseResponse(ExpenseBase):
    id: UUID
    date: datetime.date
    created_at: datetime.datetime
    
    model_config = ConfigDict(from_attributes=True)

class CategorySummary(BaseModel):
    category: str
    total: Decimal

class SummaryResponse(BaseModel):
    total_spent: Decimal
    total_this_month: Decimal
    by_category: List[CategorySummary]
