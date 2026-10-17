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
    notify_fixed_expenses = Column(Boolean, nullable=False, server_default='true')
    notify_debts = Column(Boolean, nullable=False, server_default='true')
    notify_incomes = Column(Boolean, nullable=False, server_default='true')
    notify_inactivity = Column(Boolean, nullable=False, server_default='true')
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
    last_paid_month = Column(String(7), nullable=True)  # YYYY-MM (legacy, kept for compat)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deactivated_at = Column(DateTime(timezone=True), nullable=True)

    # Attributes populated dynamically for shared fixed expenses
    is_shared = False
    share_id = None
    my_role = None
    shared_members = []
    shared_partner_name = None
    shared_by = None

    checks = relationship("FixedExpenseCheck", back_populates="fixed_expense", cascade="all, delete-orphan")


class FixedExpenseCheck(Base):
    __tablename__ = "fixed_expense_checks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fixed_expense_id = Column(UUID(as_uuid=True), ForeignKey("fixed_expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    month_year = Column(String(7), nullable=False, index=True)  # YYYY-MM
    paid_amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    paid_date = Column(Date, nullable=False, server_default=func.current_date())
    create_expense = Column(Boolean, nullable=False, server_default='false')
    expense_id = Column(UUID(as_uuid=True), nullable=True)  # ref to Expense if created
    notes = Column(String, nullable=True)
    paid_by_name = Column(String, nullable=True)
    paid_by_user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    sync_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    mirror_check_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    fixed_expense = relationship("FixedExpense", back_populates="checks")

    __table_args__ = (UniqueConstraint('fixed_expense_id', 'month_year', name='_fixed_expense_month_uc'),)


class SharedFixedExpense(Base):
    __tablename__ = "shared_fixed_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fixed_expense_id = Column(UUID(as_uuid=True), ForeignKey("fixed_expenses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    mirror_expense_id = Column(UUID(as_uuid=True), ForeignKey("fixed_expenses.id", ondelete="CASCADE"), nullable=True, index=True)
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
    
    # Attributes populated dynamically for shared debts
    is_shared = False
    share_id = None
    my_role = None
    shared_members = []
    shared_partner_name = None
    shared_by = None

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
    paid_by_name = Column(String, nullable=True)
    paid_by_user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    sync_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    mirror_payment_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    debt = relationship("Debt", back_populates="payments")


class SharedDebt(Base):
    __tablename__ = "shared_debts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    debt_id = Column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    mirror_debt_id = Column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    fcm_token = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    type = Column(String, nullable=False)
    is_read = Column(Boolean, nullable=False, server_default='false')
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Connection(Base):
    __tablename__ = "connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(10), nullable=False, server_default='pending') # 'pending', 'accepted', 'rejected'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('requester_id', 'receiver_id', name='_connection_unique'),
    )


class SavingGoal(Base):
    __tablename__ = "saving_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    target_amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    target_date = Column(Date, nullable=True)
    category = Column(String(100), nullable=True)
    color = Column(String(20), default='#10B981')
    icon = Column(String(50), default='piggy-bank')
    is_completed = Column(Boolean, nullable=False, server_default='false')
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default='true')
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Attributes populated dynamically for shared saving goals
    is_shared = False
    share_id = None
    my_role = None
    shared_members = []
    shared_partner_name = None
    shared_by = None

    deposits = relationship("SavingDeposit", back_populates="goal", cascade="all, delete-orphan")


class SavingDeposit(Base):
    __tablename__ = "saving_deposits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("saving_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), nullable=False, default='BS')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
    deposit_date = Column(Date, nullable=False, server_default=func.current_date())
    note = Column(String, nullable=True)
    create_expense = Column(Boolean, nullable=False, server_default='false')
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True)
    paid_by_name = Column(String, nullable=True)
    paid_by_user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    sync_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    mirror_deposit_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    goal = relationship("SavingGoal", back_populates="deposits")


class SharedSavingGoal(Base):
    __tablename__ = "shared_saving_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("saving_goals.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    mirror_goal_id = Column(UUID(as_uuid=True), ForeignKey("saving_goals.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Share(Base):
    __tablename__ = "shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(20), nullable=False) # 'debt', 'fixed_expense', 'saving_goal'
    owner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    members = relationship("ShareMember", back_populates="share", cascade="all, delete-orphan")


class ShareMember(Base):
    __tablename__ = "share_members"

    share_id = Column(UUID(as_uuid=True), ForeignKey("shares.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    role = Column(String(10), nullable=False, default="member") # 'admin', 'member'
    added_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    share = relationship("Share", back_populates="members")
    profile = relationship("Profile", foreign_keys=[user_id])

