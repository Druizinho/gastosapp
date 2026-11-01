import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

# Windows sandbox fix for proactor event loop
if sys.platform == "win32":
    try:
        from asyncio import proactor_events
        proactor_events.BaseProactorEventLoop._make_self_pipe = lambda s: (
            setattr(s, "_ssock", MagicMock()),
            setattr(s, "_csock", MagicMock()),
        )
        proactor_events.BaseProactorEventLoop._close_self_pipe = lambda s: None
        proactor_events.BaseProactorEventLoop._loop_self_reading = lambda s, f=None: None
    except Exception:
        pass

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import models, crud, sharing, schemas


class TestSharedCategories(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()
        self.owner_id = uuid.uuid4()
        self.non_owner_id = uuid.uuid4()

    # -------------------------------------------------------------------------
    # a) reset_default_categories resets ShareMember.local_category even when
    #    the old category string was NOT in the user's Category table.
    # -------------------------------------------------------------------------
    @patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock)
    @patch("app.crud.get_categories", new_callable=AsyncMock)
    async def test_reset_default_categories_resets_orphan_share_member_category(
        self, mock_get_categories, mock_ensure_schema
    ):
        mock_get_categories.return_value = []
        executed_stmts = []
        db = AsyncMock()
        db.add_all = MagicMock()
        db.commit = AsyncMock()

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            # Category table has NO categories (or only 'Sin Categoría')
            # simulating orphan category string in ShareMember/Expense/etc.
            res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        await crud.reset_default_categories(db, user_id=self.user_id, kind="expense")

        mock_ensure_schema.assert_awaited_once()

        stmt_texts = [str(s) for s in executed_stmts]

        # Verify UPDATE share_members is executed even with empty existing_names
        sm_updates = [s for s in executed_stmts if "UPDATE share_members" in str(s)]
        self.assertEqual(len(sm_updates), 1, "Expected exactly 1 UPDATE share_members statement")
        sm_stmt = sm_updates[0]

        # Verify that local_category is updated to 'Sin Categoría'
        self.assertIn("local_category", sm_stmt.compile().params)
        self.assertEqual(sm_stmt.compile().params.get("local_category"), "Sin Categoría")

        # Verify other entity updates also ran unconditionally
        self.assertTrue(any("UPDATE expenses" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE fixed_expenses" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE saving_goals" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE debts" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE debt_payments" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE saving_deposits" in s for s in stmt_texts))

    @patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock)
    @patch("app.crud.get_categories", new_callable=AsyncMock)
    async def test_reset_default_categories_income_resets_orphan_incomes(
        self, mock_get_categories, mock_ensure_schema
    ):
        mock_get_categories.return_value = []
        executed_stmts = []
        db = AsyncMock()
        db.add_all = MagicMock()
        db.commit = AsyncMock()

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        await crud.reset_default_categories(db, user_id=self.user_id, kind="income")

        stmt_texts = [str(s) for s in executed_stmts]
        # Incomes and estimated incomes must be updated even if existing_names is empty
        self.assertTrue(any("UPDATE estimated_incomes" in s for s in stmt_texts))
        self.assertTrue(any("UPDATE incomes" in s for s in stmt_texts))

    # -------------------------------------------------------------------------
    # b) Non-owner members default to 'Sin Categoría' and don't inherit creator's category
    # -------------------------------------------------------------------------
    async def test_non_owner_member_defaults_to_sin_categoria_in_populate_share_meta(self):
        db = AsyncMock()
        entity_id = uuid.uuid4()
        share_id = uuid.uuid4()

        # Entity created by owner with owner's category
        fe = models.FixedExpense(
            id=entity_id,
            user_id=self.owner_id,
            name="Internet Fibra",
            amount=50.0,
            category="Gastos del Creador",
        )

        share = models.Share(
            id=share_id,
            entity_type="fixed_expense",
            owner_id=self.owner_id,
        )

        owner_sm = models.ShareMember(
            share_id=share_id,
            user_id=self.owner_id,
            entity_id=entity_id,
            role="admin",
            local_category="Gastos del Creador",
        )

        # Non-owner member with local_category=None
        non_owner_sm = models.ShareMember(
            share_id=share_id,
            user_id=self.non_owner_id,
            entity_id=entity_id,
            role="member",
            local_category=None,
        )

        async def mock_execute(stmt, *args, **kwargs):
            res = MagicMock()
            stmt_str = str(stmt)
            if "FROM share_members" in stmt_str and "share_members.user_id =" in stmt_str:
                res.scalars.return_value.all.return_value = [non_owner_sm]
            elif "FROM share_members" in stmt_str and "share_members.share_id IN" in stmt_str:
                res.all.return_value = [(owner_sm, share), (non_owner_sm, share)]
            elif "FROM profiles" in stmt_str:
                p_owner = models.Profile(id=self.owner_id, display_name="Owner User")
                p_member = models.Profile(id=self.non_owner_id, display_name="Member User")
                res.scalars.return_value.all.return_value = [p_owner, p_member]
            elif "FROM connections" in stmt_str:
                res.scalars.return_value.all.return_value = []
            else:
                res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        enriched = await sharing.populate_share_meta(
            db=db,
            entities=[fe],
            user_id=self.non_owner_id,
            entity_type="fixed_expense",
        )

        self.assertEqual(len(enriched), 1)
        # Non-owner MUST NOT inherit creator's category; must strictly be 'Sin Categoría'
        self.assertEqual(enriched[0].category, "Sin Categoría")
        self.assertNotEqual(enriched[0].category, "Gastos del Creador")

    async def test_non_owner_member_with_whitespace_local_category_defaults_to_sin_categoria(self):
        db = AsyncMock()
        entity_id = uuid.uuid4()
        share_id = uuid.uuid4()

        debt = models.Debt(
            id=entity_id,
            user_id=self.owner_id,
            counterpart="Hermano",
            concept="Préstamo",
            total_amount=100.0,
            category="Deudas Familiares",
            type="receivable",
        )

        share = models.Share(
            id=share_id,
            entity_type="debt",
            owner_id=self.owner_id,
        )

        owner_sm = models.ShareMember(
            share_id=share_id,
            user_id=self.owner_id,
            entity_id=entity_id,
            role="admin",
            local_category="Deudas Familiares",
        )

        # Non-owner with empty/whitespace local_category
        non_owner_sm = models.ShareMember(
            share_id=share_id,
            user_id=self.non_owner_id,
            entity_id=entity_id,
            role="member",
            local_category="   ",
        )

        async def mock_execute(stmt, *args, **kwargs):
            res = MagicMock()
            stmt_str = str(stmt)
            if "FROM share_members" in stmt_str and "share_members.user_id =" in stmt_str:
                res.scalars.return_value.all.return_value = [non_owner_sm]
            elif "FROM share_members" in stmt_str and "share_members.share_id IN" in stmt_str:
                res.all.return_value = [(owner_sm, share), (non_owner_sm, share)]
            elif "FROM profiles" in stmt_str:
                res.scalars.return_value.all.return_value = []
            elif "FROM connections" in stmt_str:
                res.scalars.return_value.all.return_value = []
            else:
                res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        enriched = await sharing.populate_share_meta(
            db=db,
            entities=[debt],
            user_id=self.non_owner_id,
            entity_type="debt",
        )

        self.assertEqual(len(enriched), 1)
        self.assertEqual(enriched[0].category, "Sin Categoría")

    # -------------------------------------------------------------------------
    # c) delete_category reassigns FixedExpense and SavingGoal to 'Sin Categoría'
    #    instead of None.
    # -------------------------------------------------------------------------
    async def test_delete_category_reassigns_fixed_expense_and_saving_goal_to_sin_categoria(self):
        category_id = uuid.uuid4()
        user_id = self.user_id
        category_name = "Categoría Por Borrar"

        db = AsyncMock()
        mock_category = models.Category(
            id=category_id,
            user_id=user_id,
            name=category_name,
            icon="Package",
            color="#6366F1",
        )

        executed_stmts = []

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            # Category fetch
            res.scalars.return_value.first.return_value = mock_category
            res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        # Delete category with reassign_to=None
        result = await crud.delete_category(
            db=db,
            category_id=category_id,
            user_id=user_id,
            reassign_to=None,
        )

        self.assertTrue(result)

        # Inspect FixedExpense update statement
        fe_updates = [s for s in executed_stmts if "UPDATE fixed_expenses" in str(s)]
        self.assertEqual(len(fe_updates), 1)
        fe_params = fe_updates[0].compile().params
        self.assertEqual(
            fe_params.get("category"),
            "Sin Categoría",
            "FixedExpense should be reassigned to 'Sin Categoría', NOT None",
        )

        # Inspect SavingGoal update statement
        sg_updates = [s for s in executed_stmts if "UPDATE saving_goals" in str(s)]
        self.assertEqual(len(sg_updates), 1)
        sg_params = sg_updates[0].compile().params
        self.assertEqual(
            sg_params.get("category"),
            "Sin Categoría",
            "SavingGoal should be reassigned to 'Sin Categoría', NOT None",
        )

        # Inspect Expense update statement
        exp_updates = [s for s in executed_stmts if "UPDATE expenses" in str(s)]
        self.assertEqual(len(exp_updates), 1)
        exp_params = exp_updates[0].compile().params
        self.assertEqual(exp_params.get("category"), "Sin Categoría")

        # Inspect ShareMember update statement
        sm_updates = [s for s in executed_stmts if "UPDATE share_members" in str(s)]
        self.assertEqual(len(sm_updates), 1)
        sm_params = sm_updates[0].compile().params
        self.assertEqual(sm_params.get("local_category"), "Sin Categoría")

    async def test_delete_category_with_explicit_reassign_to(self):
        category_id = uuid.uuid4()
        user_id = self.user_id
        category_name = "Categoría Vieja"
        target_name = "Nueva Categoría"

        db = AsyncMock()
        mock_category = models.Category(
            id=category_id,
            user_id=user_id,
            name=category_name,
            icon="Package",
            color="#6366F1",
        )
        mock_target = models.Category(
            id=uuid.uuid4(),
            user_id=user_id,
            name=target_name,
            icon="Package",
            color="#10B981",
        )

        executed_stmts = []

        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            res = MagicMock()
            stmt_str = str(stmt)
            if "lower(categories.name)" in stmt_str:
                res.scalars.return_value.first.return_value = mock_target.id
            elif "FROM categories" in stmt_str:
                res.scalars.return_value.first.return_value = mock_category
            else:
                res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        result = await crud.delete_category(
            db=db,
            category_id=category_id,
            user_id=user_id,
            reassign_to=target_name,
        )

        self.assertTrue(result)

        fe_updates = [s for s in executed_stmts if "UPDATE fixed_expenses" in str(s)]
        self.assertEqual(len(fe_updates), 1)
        self.assertEqual(fe_updates[0].compile().params.get("category"), target_name)

        sg_updates = [s for s in executed_stmts if "UPDATE saving_goals" in str(s)]
        self.assertEqual(len(sg_updates), 1)
        self.assertEqual(sg_updates[0].compile().params.get("category"), target_name)

    async def test_populate_share_meta_owner_preserves_category(self):
        db = AsyncMock()
        entity_id = uuid.uuid4()
        share_id = uuid.uuid4()

        fe = models.FixedExpense(
            id=entity_id,
            user_id=self.owner_id,
            name="Luz y Agua",
            amount=30.0,
            category="Servicios Básicos",
        )

        share = models.Share(
            id=share_id,
            entity_type="fixed_expense",
            owner_id=self.owner_id,
        )

        owner_sm = models.ShareMember(
            share_id=share_id,
            user_id=self.owner_id,
            entity_id=entity_id,
            role="admin",
            local_category=None,
        )

        async def mock_execute(stmt, *args, **kwargs):
            res = MagicMock()
            stmt_str = str(stmt)
            if "FROM share_members" in stmt_str and "share_members.user_id =" in stmt_str:
                res.scalars.return_value.all.return_value = [owner_sm]
            elif "FROM share_members" in stmt_str and "share_members.share_id IN" in stmt_str:
                res.all.return_value = [(owner_sm, share)]
            elif "FROM profiles" in stmt_str:
                p_owner = models.Profile(id=self.owner_id, display_name="Owner User")
                res.scalars.return_value.all.return_value = [p_owner]
            else:
                res.scalars.return_value.all.return_value = []
            return res

        db.execute = AsyncMock(side_effect=mock_execute)

        enriched = await sharing.populate_share_meta(
            db=db,
            entities=[fe],
            user_id=self.owner_id,
            entity_type="fixed_expense",
        )

        self.assertEqual(len(enriched), 1)
        # Owner with local_category=None falls back to e.category
        self.assertEqual(enriched[0].category, "Servicios Básicos")

    @patch("app.crud.engine")
    async def test_ensure_categories_and_debts_schema_sql_statements(self, mock_engine):
        crud._categories_debts_schema_ensured = False

        executed_sql = []

        class MockConn:
            async def execute(self, stmt):
                executed_sql.append(str(stmt))

        class MockBeginContext:
            async def __aenter__(self):
                return MockConn()
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass

        mock_engine.begin.return_value = MockBeginContext()

        await crud.ensure_categories_and_debts_schema()

        # Check backfill query restricts to creator/owner
        self.assertTrue(
            any("sm.user_id = d.user_id" in sql for sql in executed_sql),
            "Debts backfill must check sm.user_id = d.user_id"
        )
        self.assertTrue(
            any("sm.user_id = sg.user_id" in sql for sql in executed_sql),
            "Saving goals backfill must check sm.user_id = sg.user_id"
        )
        self.assertTrue(
            any("sm.user_id = fe.user_id" in sql for sql in executed_sql),
            "Fixed expenses backfill must check sm.user_id = fe.user_id"
        )

        # Check non-owner cleanup query exists and sets 'Sin Categoría'
        self.assertTrue(
            any("sm.user_id != s.owner_id" in sql and "SET local_category = 'Sin Categoría'" in sql for sql in executed_sql),
            "Must sanitize non-owner rows to 'Sin Categoría'"
        )


if __name__ == "__main__":
    unittest.main()
