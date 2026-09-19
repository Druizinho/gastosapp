import uuid
from datetime import date, datetime
from sqlalchemy import Column, String, Numeric, Date, DateTime, Boolean, UniqueConstraint, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from .database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default='#cbd5e1')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (UniqueConstraint('user_id', 'name', name='_user_category_uc'),)

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    amount = Column(Numeric(12, 4), nullable=False)
    description = Column(String, nullable=False)
    category = Column(String, nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    user_id = Column(UUID(as_uuid=True), nullable=False) # Enlaza cada gasto a un usuario en Supabase
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)

class FixedExpense(Base):
    __tablename__ = "fixed_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    category = Column(String, nullable=True)
    payment_day = Column(Numeric(2, 0), nullable=True)  # 1-31, optional
    is_active = Column(Boolean, nullable=False, server_default='true')
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Debt(Base):
    __tablename__ = "debts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    type = Column(String(12), nullable=False)  # 'owed' or 'receivable'
    counterpart = Column(String, nullable=False)
    concept = Column(String, nullable=False)
    total_amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    start_date = Column(Date, nullable=False, server_default=func.current_date())
    due_date = Column(Date, nullable=True)
    is_settled = Column(Boolean, nullable=False, server_default='false')
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    payments = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")


class DebtPayment(Base):
    __tablename__ = "debt_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    debt_id = Column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    payment_date = Column(Date, nullable=False, server_default=func.current_date())
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    debt = relationship("Debt", back_populates="payments")


class EstimatedIncome(Base):
    __tablename__ = "estimated_incomes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    expected_amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    payment_day = Column(Numeric(2, 0), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default='true')
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    
    checks = relationship("IncomeCheck", back_populates="income", cascade="all, delete-orphan")


class IncomeCheck(Base):
    __tablename__ = "income_checks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    income_id = Column(UUID(as_uuid=True), ForeignKey("estimated_incomes.id", ondelete="CASCADE"), nullable=False, index=True)
    month_year = Column(String(7), nullable=False, index=True)  # YYYY-MM
    real_amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    payment_date = Column(Date, nullable=False, server_default=func.current_date())
    is_partial = Column(Boolean, nullable=False, server_default='false')
    pending_date = Column(Date, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    income = relationship("EstimatedIncome", back_populates="checks")
