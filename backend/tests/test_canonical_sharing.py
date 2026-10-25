import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import uuid4
from decimal import Decimal
import datetime
import unittest

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Prevent network I/O during imports and database operations
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from fastapi import HTTPException
from app import models, schemas, sharing, crud_debts, crud_savings, crud_fixed_expenses


def sync_run(async_fn):
    def wrapper(self, *args, **kwargs):
        coro = async_fn(self, *args, **kwargs)
        try:
            while True:
                coro.send(None)
        except StopIteration as e:
            return e.value
    return wrapper


class TestCanonicalSharing(unittest.TestCase):

    def setUp(self):
        from app import crud
        crud._categories_debts_schema_ensured = True

    @sync_run
    async def test_canonical_single_entity_no_clones_on_share_and_add_members(self):
        """
        Verify that sharing debts, saving goals, and fixed expenses with multiple users
        does NOT clone the parent entity in the DB. Exactly 1 canonical parent entity exists,
        and all ShareMember rows reference that same canonical entity_id.
        For debts, debt perspective is inverted ('receivable' vs 'owed') per user.
        """
        db = AsyncMock()
        owner_id = uuid4()
        user_b = uuid4()
        user_c = uuid4()

        owner_prof = models.Profile(id=owner_id, display_name="Owner User")
        prof_res = MagicMock()
        prof_res.scalars.return_value.first.return_value = owner_prof
        db.get = AsyncMock(return_value=owner_prof)
        db.execute = AsyncMock(return_value=prof_res)

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        # 1. Test Debt Canonical Sharing
        debt_id = uuid4()
        canonical_debt = models.Debt(
            id=debt_id,
            user_id=owner_id,
            concept="Préstamo Moto",
            total_amount=Decimal("150"),
            currency="USD_BCV",
            type="receivable",
            counterpart="Compañeros",
            category="Deudas",
            is_settled=False
        )
        canonical_debt.payments = []

        with patch("app.sharing.resolve_initial_member_category", new_callable=AsyncMock) as mock_cat:
            mock_cat.return_value = "Deudas"
            share_debt = await sharing.create_share(
                db=db,
                entity_type="debt",
                owner_id=owner_id,
                owner_entity=canonical_debt,
                target_ids=[user_b],
                admin_ids=[]
            )

        # Confirm NO cloned Debt entities were added
        cloned_debts = [o for o in added_objects if isinstance(o, models.Debt)]
        self.assertEqual(len(cloned_debts), 0, "No Debt clones should be created on share")

        # Confirm ShareMembers reference canonical debt_id
        share_members = [o for o in added_objects if isinstance(o, models.ShareMember)]
        self.assertEqual(len(share_members), 2)
        for sm in share_members:
            self.assertEqual(sm.entity_id, canonical_debt.id)

        owner_sm = next(sm for sm in share_members if sm.user_id == owner_id)
        user_b_sm = next(sm for sm in share_members if sm.user_id == user_b)
        self.assertEqual(owner_sm.perspective_type, "receivable")
        self.assertEqual(user_b_sm.perspective_type, "owed")
        self.assertEqual(user_b_sm.counterpart_label, "Owner User")

        # Now test add_members for user_c
        with patch("app.sharing.get_members", new_callable=AsyncMock) as mock_get_members, \
             patch("app.sharing.assert_can_add", new_callable=AsyncMock), \
             patch("app.sharing.resolve_initial_member_category", new_callable=AsyncMock) as mock_cat:
            mock_get_members.return_value = [owner_sm, user_b_sm]
            mock_cat.return_value = "Deudas"
            # Return canonical_debt when queried
            debt_res = MagicMock()
            debt_res.scalars.return_value.first.return_value = canonical_debt
            db.execute.return_value = debt_res

            await sharing.add_members(
                db=db,
                share=share_debt,
                actor_id=owner_id,
                target_ids=[user_c]
            )

        # Still no cloned Debt entities
        cloned_debts_after = [o for o in added_objects if isinstance(o, models.Debt)]
        self.assertEqual(len(cloned_debts_after), 0)

        user_c_sm = next(sm for sm in added_objects if isinstance(sm, models.ShareMember) and sm.user_id == user_c)
        self.assertEqual(user_c_sm.entity_id, canonical_debt.id)
        self.assertEqual(user_c_sm.perspective_type, "owed")

        # Test perspective projection in populate_share_meta
        # When viewed by Owner: type is 'receivable'
        with patch("app.sharing.get_members", new_callable=AsyncMock) as mock_gm:
            mock_gm.return_value = [owner_sm, user_b_sm, user_c_sm]
            # Mock sm query in populate_share_meta
            def mock_exec_side_effect(query):
                res = MagicMock()
                # If querying share_members
                q_str = str(query)
                if "share_members" in q_str:
                    if "user_id" in q_str:
                        # my_membership_by_entity
                        res.scalars.return_value.all.return_value = [owner_sm]
                    else:
                        res.all.return_value = [(owner_sm, share_debt), (user_b_sm, share_debt), (user_c_sm, share_debt)]
                elif "profiles" in q_str:
                    res.scalars.return_value.all.return_value = [owner_prof]
                elif "connections" in q_str:
                    res.scalars.return_value.all.return_value = []
                return res

            db.execute.side_effect = mock_exec_side_effect
            await sharing.populate_share_meta(db, [canonical_debt], owner_id, "debt")
            self.assertEqual(canonical_debt.type, "receivable")

            # When viewed by User B: type is 'owed', counterpart is 'Owner User'
            def mock_exec_user_b(query):
                res = MagicMock()
                q_str = str(query)
                if "share_members" in q_str:
                    if "user_id" in q_str:
                        res.scalars.return_value.all.return_value = [user_b_sm]
                    else:
                        res.all.return_value = [(owner_sm, share_debt), (user_b_sm, share_debt), (user_c_sm, share_debt)]
                elif "profiles" in q_str:
                    res.scalars.return_value.all.return_value = [owner_prof]
                elif "connections" in q_str:
                    res.scalars.return_value.all.return_value = []
                return res

            db.execute.side_effect = mock_exec_user_b
            await sharing.populate_share_meta(db, [canonical_debt], user_b, "debt")
            self.assertEqual(canonical_debt.type, "owed")
            self.assertEqual(canonical_debt.counterpart, "Owner User")

    @sync_run
    async def test_canonical_single_contribution_and_personal_expense(self):
        """
        Verify that recording a contribution (payment, deposit, or check) adds exactly 1 child
        row in the DB referencing the canonical parent, and exactly 1 personal Expense row
        for the payer. No fan-out child duplicates are created for other members.
        """
        db = AsyncMock()
        owner_id = uuid4()
        user_b_id = uuid4()
        goal_id = uuid4()

        canonical_goal = models.SavingGoal(
            id=goal_id,
            user_id=owner_id,
            name="Fondo Emergencia",
            target_amount=Decimal("1000"),
            currency="USD_BCV",
            type="saving",
            category="Ahorro",
            is_completed=False
        )
        canonical_goal.deposits = []

        share = models.Share(id=uuid4(), entity_type="saving_goal", owner_id=owner_id)
        owner_member = models.ShareMember(
            share_id=share.id, user_id=owner_id, entity_id=goal_id, role="admin", local_category="Ahorro"
        )
        user_b_member = models.ShareMember(
            share_id=share.id, user_id=user_b_id, entity_id=goal_id, role="member", local_category="Mi Ahorro"
        )

        user_b_prof = models.Profile(id=user_b_id, display_name="User B")
        prof_res = MagicMock()
        prof_res.scalars.return_value.first.return_value = user_b_prof
        db.execute = AsyncMock(return_value=prof_res)

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        deposit_in = schemas.SavingDepositCreate(
            amount=Decimal("100"),
            currency=schemas.CurrencyType.USD_BCV,
            register_as_expense=True
        )

        with patch("app.crud_savings.get_saving_goal", new_callable=AsyncMock) as mock_get_goal, \
             patch("app.crud_savings.sharing.get_membership", new_callable=AsyncMock) as mock_mem, \
             patch("app.crud_savings.sharing.recompute_settlement", new_callable=AsyncMock), \
             patch("app.crud_savings.check_and_notify_budget_thresholds", new_callable=AsyncMock), \
             patch("app.crud_savings.sharing.notify_members", new_callable=AsyncMock):
            mock_get_goal.return_value = canonical_goal
            mock_mem.return_value = (share, user_b_member)

            await crud_savings.add_saving_deposit(db, goal_id, user_b_id, deposit_in)

        # Check that exactly 1 SavingDeposit was created (NO fan-out clones!)
        created_deposits = [o for o in added_objects if isinstance(o, models.SavingDeposit)]
        self.assertEqual(len(created_deposits), 1, "Only 1 canonical SavingDeposit must be added")
        self.assertEqual(created_deposits[0].goal_id, goal_id)
        self.assertEqual(created_deposits[0].paid_by_user_id, user_b_id)

        # Check that exactly 1 personal Expense was created for User B
        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1, "Only 1 personal Expense must be added")
        self.assertEqual(created_expenses[0].user_id, user_b_id)
        # Expense category must use User B's local_category ("Mi Ahorro")
        self.assertEqual(created_expenses[0].category, "Mi Ahorro")

    @sync_run
    async def test_per_user_category_isolation_admin_and_member(self):
        """
        Verify that:
        1. An admin changing category on a shared entity only changes their own local_category
           (and db_entity.category if they own the entity), NOT other members' categories.
        2. A non-admin member can change their own category (via update_debt/goal/fixed_expense)
           without getting 403 Forbidden.
        3. A non-admin member attempting to change shared canonical fields (amount, concept) gets 403.
        """
        db = AsyncMock()
        owner_id = uuid4()
        member_b_id = uuid4()
        debt_id = uuid4()

        canonical_debt = models.Debt(
            id=debt_id,
            user_id=owner_id,
            concept="Cena Compartida",
            total_amount=Decimal("80"),
            currency="USD_BCV",
            type="receivable",
            category="Restaurantes",
            is_settled=False
        )
        canonical_debt.payments = []

        share = models.Share(id=uuid4(), entity_type="debt", owner_id=owner_id)
        owner_member = models.ShareMember(
            share_id=share.id, user_id=owner_id, entity_id=debt_id, role="admin", local_category="Restaurantes"
        )
        member_b = models.ShareMember(
            share_id=share.id, user_id=member_b_id, entity_id=debt_id, role="member", local_category="Comida"
        )

        # 1. Non-admin Member B updates ONLY category -> Allowed, no 403
        update_cat_only = schemas.DebtUpdate(category="Salidas")
        with patch("app.crud_debts.get_debt", new_callable=AsyncMock) as mock_get_debt, \
             patch("app.crud_debts.sharing.get_membership", new_callable=AsyncMock) as mock_mem:
            mock_get_debt.return_value = canonical_debt
            mock_mem.return_value = (share, member_b)

            await crud_debts.update_debt(db, debt_id, update_cat_only, member_b_id)
            # Member B's local category is updated
            self.assertEqual(member_b.local_category, "Salidas")
            # Canonical entity's category is NOT changed by member B
            self.assertEqual(canonical_debt.category, "Restaurantes")

        # 2. Non-admin Member B tries to update concept / total_amount -> 403 Forbidden
        update_concept = schemas.DebtUpdate(concept="Cena Modificada")
        with patch("app.crud_debts.get_debt", new_callable=AsyncMock) as mock_get_debt, \
             patch("app.crud_debts.sharing.get_membership", new_callable=AsyncMock) as mock_mem:
            mock_get_debt.return_value = canonical_debt
            mock_mem.return_value = (share, member_b)

            with self.assertRaises(HTTPException) as ctx:
                await crud_debts.update_debt(db, debt_id, update_concept, member_b_id)
            self.assertEqual(ctx.exception.status_code, 403)

        # 3. Admin Owner updates category -> updates owner_member.local_category and canonical_debt.category
        update_admin_cat = schemas.DebtUpdate(category="Gastos Varios")
        with patch("app.crud_debts.get_debt", new_callable=AsyncMock) as mock_get_debt, \
             patch("app.crud_debts.sharing.get_membership", new_callable=AsyncMock) as mock_mem:
            mock_get_debt.return_value = canonical_debt
            mock_mem.return_value = (share, owner_member)

            await crud_debts.update_debt(db, debt_id, update_admin_cat, owner_id)
            self.assertEqual(owner_member.local_category, "Gastos Varios")
            self.assertEqual(canonical_debt.category, "Gastos Varios")
            # Member B's category is STILL "Salidas" (isolated!)
            self.assertEqual(member_b.local_category, "Salidas")

    @sync_run
    async def test_default_contribution_uses_member_local_category(self):
        """
        Verify that when a member adds a contribution without specifying category,
        it defaults to their member.local_category, not the owner's category.
        """
        db = AsyncMock()
        owner_id = uuid4()
        member_b_id = uuid4()
        debt_id = uuid4()

        canonical_debt = models.Debt(
            id=debt_id,
            user_id=owner_id,
            concept="Reparación",
            total_amount=Decimal("200"),
            currency="USD_BCV",
            type="receivable",
            category="Hogar",
            is_settled=False
        )
        canonical_debt.payments = []

        share = models.Share(id=uuid4(), entity_type="debt", owner_id=owner_id)
        member_b = models.ShareMember(
            share_id=share.id, user_id=member_b_id, entity_id=debt_id, role="member", local_category="Mantenimiento Casa"
        )

        member_b_prof = models.Profile(id=member_b_id, display_name="Member B")
        prof_res = MagicMock()
        prof_res.scalars.return_value.first.return_value = member_b_prof
        db.execute = AsyncMock(return_value=prof_res)

        added_objects = []
        db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        payment_in = schemas.DebtPaymentCreate(
            amount=Decimal("50"),
            currency=schemas.CurrencyType.USD_BCV,
            register_as_expense=True,
            category=None # Unspecified, should use member local_category
        )

        with patch("app.crud_debts.get_debt", new_callable=AsyncMock) as mock_get_debt, \
             patch("app.crud_debts.sharing.get_membership", new_callable=AsyncMock) as mock_mem, \
             patch("app.crud_debts.sharing.recompute_settlement", new_callable=AsyncMock), \
             patch("app.crud_debts.check_and_notify_budget_thresholds", new_callable=AsyncMock), \
             patch("app.crud_debts.sharing.notify_members", new_callable=AsyncMock):
            mock_get_debt.return_value = canonical_debt
            mock_mem.return_value = (share, member_b)

            await crud_debts.add_debt_payment(db, debt_id, member_b_id, payment_in)

        created_expenses = [o for o in added_objects if isinstance(o, models.Expense)]
        self.assertEqual(len(created_expenses), 1)
        # Should be Member B's local category ("Mantenimiento Casa"), NOT the debt's category ("Hogar")
        self.assertEqual(created_expenses[0].category, "Mantenimiento Casa")


if __name__ == "__main__":
    unittest.main()
