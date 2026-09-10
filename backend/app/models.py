import uuid
from datetime import date, datetime
from sqlalchemy import Column, String, Numeric, Date, DateTime, UniqueConstraint
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
    currency = Column(String(10), nullable=False, default='BS_USD')
    amount_usd = Column(Numeric(12, 4), nullable=True)
    amount_bs = Column(Numeric(12, 4), nullable=True)
    amount_eur = Column(Numeric(12, 4), nullable=True)
    amount_usdt = Column(Numeric(12, 4), nullable=True)
    rate_usd_bs = Column(Numeric(12, 4), nullable=True)
    rate_eur_bs = Column(Numeric(12, 4), nullable=True)
    rate_usdt_bs = Column(Numeric(12, 4), nullable=True)
