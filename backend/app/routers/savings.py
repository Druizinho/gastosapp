from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from .. import crud_savings, schemas, bcv_service
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/savings",
    tags=["savings"],
)

@router.get("/", response_model=List[schemas.SavingGoalResponse])
async def read_saving_goals(
    is_completed: Optional[bool] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_savings.get_saving_goals(
        db, user_id=user_id, is_completed=is_completed, is_active=is_active
    )

@router.get("/summary", response_model=schemas.SavingSummaryResponse)
async def read_savings_summary(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    return await crud_savings.get_savings_summary(db, user_id=user_id)

@router.get("/{goal_id}", response_model=schemas.SavingGoalResponse)
async def read_saving_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_goal = await crud_savings.get_saving_goal(db, goal_id=goal_id, user_id=user_id)
    if not db_goal:
        raise HTTPException(status_code=404, detail="Meta de ahorro no encontrada")
    return db_goal

@router.post("/", response_model=schemas.SavingGoalResponse)
async def create_saving_goal(
    goal: schemas.SavingGoalCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    equivalents = None
    if goal.target_amount is not None:
        rates = await bcv_service.get_all_rates()
        currency_val = goal.currency.value if hasattr(goal.currency, "value") else str(goal.currency)
        equivalents = bcv_service.convert_amount(
            amount=goal.target_amount,
            currency=currency_val,
            rates=rates,
            manual_rate=goal.manual_rate
        )
    return await crud_savings.create_saving_goal(db=db, goal=goal, user_id=user_id, extra_data=equivalents)

@router.put("/{goal_id}", response_model=schemas.SavingGoalResponse)
async def update_saving_goal(
    goal_id: UUID,
    goal: schemas.SavingGoalUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    extra_data = None
    update_dict = goal.model_dump(exclude_unset=True)
    if 'target_amount' in update_dict or 'currency' in update_dict:
        if goal.target_amount is not None and goal.currency is not None:
            rates = await bcv_service.get_all_rates()
            curr = goal.currency.value if hasattr(goal.currency, "value") else str(goal.currency)
            extra_data = bcv_service.convert_amount(
                amount=goal.target_amount,
                currency=curr,
                rates=rates,
                manual_rate=goal.manual_rate
            )
        elif 'target_amount' in update_dict and goal.target_amount is None:
            extra_data = {
                "amount_usd": None,
                "amount_bs": None,
                "amount_eur": None,
                "amount_usdt": None,
                "rate_usd_bs": None,
                "rate_eur_bs": None,
                "rate_usdt_bs": None,
            }

    db_goal = await crud_savings.update_saving_goal(
        db, goal_id=goal_id, goal=goal, user_id=user_id, extra_data=extra_data
    )
    if not db_goal:
        raise HTTPException(status_code=404, detail="Meta de ahorro no encontrada")
    return db_goal

@router.delete("/{goal_id}")
async def delete_saving_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    success = await crud_savings.delete_saving_goal(db, goal_id=goal_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meta de ahorro no encontrada")
    return {"message": "Meta de ahorro eliminada exitosamente"}

@router.post("/{goal_id}/deposits", response_model=schemas.SavingGoalResponse)
async def add_saving_deposit(
    goal_id: UUID,
    deposit: schemas.SavingDepositCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    rates = await bcv_service.get_all_rates()
    currency_val = deposit.currency.value if hasattr(deposit.currency, "value") else str(deposit.currency)
    equivalents = bcv_service.convert_amount(
        amount=deposit.amount,
        currency=currency_val,
        rates=rates,
        manual_rate=deposit.manual_rate
    )
    db_goal = await crud_savings.add_saving_deposit(
        db=db,
        goal_id=goal_id,
        user_id=user_id,
        deposit=deposit,
        extra_data=equivalents
    )
    if not db_goal:
        raise HTTPException(status_code=404, detail="Meta de ahorro no encontrada")
    return db_goal

@router.put("/deposits/{deposit_id}", response_model=schemas.SavingGoalResponse)
async def update_saving_deposit(
    deposit_id: UUID,
    deposit_update: schemas.SavingDepositUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    equivalents = None
    if deposit_update.amount is not None and deposit_update.currency is not None:
        rates = await bcv_service.get_all_rates()
        curr_val = deposit_update.currency.value if hasattr(deposit_update.currency, "value") else str(deposit_update.currency)
        equivalents = bcv_service.convert_amount(
            amount=deposit_update.amount,
            currency=curr_val,
            rates=rates,
            manual_rate=deposit_update.manual_rate
        )
    db_goal = await crud_savings.update_saving_deposit(
        db=db,
        deposit_id=deposit_id,
        user_id=user_id,
        deposit_update=deposit_update,
        extra_data=equivalents
    )
    if not db_goal:
        raise HTTPException(status_code=404, detail="Aporte no encontrado")
    return db_goal


@router.delete("/deposits/{deposit_id}", response_model=schemas.SavingGoalResponse)
async def delete_saving_deposit(
    deposit_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    db_goal = await crud_savings.delete_saving_deposit(db, deposit_id=deposit_id, user_id=user_id)
    if not db_goal:
        raise HTTPException(status_code=404, detail="Aporte no encontrado")
    return db_goal
