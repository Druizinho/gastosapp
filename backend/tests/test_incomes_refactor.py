import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import date, datetime, timezone
import unittest
from uuid import UUID, uuid4
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Prevent network I/O during imports and database operations
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from app import models, schemas, crud, crud_incomes


def sync_run(async_fn):
    """Zero-socketpair coroutine driver for Windows sandbox execution."""
    def wrapper(self, *args, **kwargs):
        coro = async_fn(self, *args, **kwargs)
        try:
            while True:
                coro.send(None)
        except StopIteration as e:
            return e.value
    return wrapper


class MockResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def scalars(self):
        class ScalarMock:
            def __init__(self, items):
                self._items = items

            def all(self):
                return list(self._items)

            def first(self):
                return self._items[0] if self._items else None

            def unique(self):
                return self

        return ScalarMock(self._rows)

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._rows[0] if self._rows else None


class InMemoryIncomeStore:
    def __init__(self):
        self.estimated_incomes: dict[UUID, models.EstimatedIncome] = {}
        self.income_checks: dict[UUID, models.IncomeCheck] = {}
        self.incomes: dict[UUID, models.Income] = {}


class MockAsyncSession:
    def __init__(self, store: InMemoryIncomeStore):
        self.store = store

    def add(self, obj):
        if isinstance(obj, models.EstimatedIncome):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "checks", None) is None:
                obj.checks = []
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)
            self.store.estimated_incomes[obj.id] = obj
        elif isinstance(obj, models.IncomeCheck):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "incomes", None) is None:
                obj.incomes = []
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)
            self.store.income_checks[obj.id] = obj
            est = self.store.estimated_incomes.get(obj.income_id)
            if est:
                obj.income = est
                if getattr(est, "checks", None) is None:
                    est.checks = []
                if obj not in est.checks:
                    est.checks.append(obj)
        elif isinstance(obj, models.Income):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)
            self.store.incomes[obj.id] = obj
            if obj.income_check_id:
                chk = self.store.income_checks.get(obj.income_check_id)
                if chk:
                    obj.income_check = chk
                    if getattr(chk, "incomes", None) is None:
                        chk.incomes = []
                    if obj not in chk.incomes:
                        chk.incomes.append(obj)

    async def delete(self, obj):
        if isinstance(obj, models.Income):
            self.store.incomes.pop(obj.id, None)
            if obj.income_check_id:
                chk = self.store.income_checks.get(obj.income_check_id)
                if chk and getattr(chk, "incomes", None) and obj in chk.incomes:
                    chk.incomes.remove(obj)
        elif isinstance(obj, models.IncomeCheck):
            self.store.income_checks.pop(obj.id, None)
            est = self.store.estimated_incomes.get(obj.income_id)
            if est and getattr(est, "checks", None) and obj in est.checks:
                est.checks.remove(obj)
        elif isinstance(obj, models.EstimatedIncome):
            self.store.estimated_incomes.pop(obj.id, None)

    async def flush(self):
        for inc in self.store.incomes.values():
            if not getattr(inc, "id", None):
                inc.id = uuid4()
            if inc.income_check_id:
                chk = self.store.income_checks.get(inc.income_check_id)
                if chk:
                    inc.income_check = chk
                    if getattr(chk, "incomes", None) is None:
                        chk.incomes = []
                    if inc not in chk.incomes:
                        chk.incomes.append(inc)

    async def commit(self):
        await self.flush()

    async def refresh(self, obj):
        pass

    async def execute(self, stmt, *args, **kwargs):
        cds = getattr(stmt, "column_descriptions", [])
        entities = [cd.get("entity") for cd in cds]
        compiled = stmt.compile()
        params = compiled.params

        # 1. Income queries
        if entities == [models.Income]:
            results = list(self.store.incomes.values())
            # filter by income_check_id
            check_id = next((v for k, v in params.items() if "income_check_id" in k), None)
            if check_id:
                results = [i for i in results if i.income_check_id == check_id]
            # filter by user_id
            uid = next((v for k, v in params.items() if "user_id" in k), None)
            if uid:
                results = [i for i in results if i.user_id == uid]
            # filter by id
            iid = next((v for k, v in params.items() if (k.startswith("id_") or k == "id_1" or k == "id") and isinstance(v, UUID)), None)
            if iid:
                results = [i for i in results if i.id == iid]
            # filter by date_from / date_to
            date_from = next((v for k, v in params.items() if "date_1" in k or "date_from" in k), None)
            if date_from:
                results = [i for i in results if i.date >= date_from]
            date_to = next((v for k, v in params.items() if "date_2" in k or "date_to" in k), None)
            if date_to:
                results = [i for i in results if i.date <= date_to]

            # attach income_check relationships
            for inc in results:
                if inc.income_check_id:
                    chk = self.store.income_checks.get(inc.income_check_id)
                    if chk:
                        inc.income_check = chk
                        if chk.income_id:
                            chk.income = self.store.estimated_incomes.get(chk.income_id)

            # sort
            sql = str(stmt).lower()
            if "date desc" in sql or "date desc" in sql.replace('"', ''):
                results.sort(key=lambda x: (x.date, x.created_at or datetime.min), reverse=True)
            else:
                results.sort(key=lambda x: (x.date, x.created_at or datetime.min))
            return MockResult(results)

        # 2. IncomeCheck queries
        if entities == [models.IncomeCheck]:
            results = list(self.store.income_checks.values())
            cid = next((v for k, v in params.items() if (k.startswith("id_") or k == "id_1" or k == "id") and isinstance(v, UUID)), None)
            if cid:
                results = [c for c in results if c.id == cid]
            inc_id = next((v for k, v in params.items() if "income_id" in k), None)
            if inc_id:
                if isinstance(inc_id, (list, tuple, set)):
                    results = [c for c in results if c.income_id in inc_id]
                else:
                    results = [c for c in results if c.income_id == inc_id]
            my = next((v for k, v in params.items() if "month_year" in k), None)
            if my:
                results = [c for c in results if c.month_year == my]

            for c in results:
                if c.income_id:
                    c.income = self.store.estimated_incomes.get(c.income_id)
                c.incomes = [i for i in self.store.incomes.values() if i.income_check_id == c.id]
            return MockResult(results)

        # 3. EstimatedIncome queries
        if entities == [models.EstimatedIncome]:
            results = list(self.store.estimated_incomes.values())
            eid = next((v for k, v in params.items() if (k.startswith("id_") or k == "id_1" or k == "id") and isinstance(v, UUID)), None)
            if eid:
                results = [e for e in results if e.id == eid]
            uid = next((v for k, v in params.items() if "user_id" in k), None)
            if uid:
                results = [e for e in results if e.user_id == uid]
            act = next((v for k, v in params.items() if "is_active" in k), None)
            if act is not None:
                results = [e for e in results if e.is_active == act]

            for e in results:
                e.checks = [c for c in self.store.income_checks.values() if c.income_id == e.id]
            return MockResult(results)

        return MockResult([])


class TestIncomesRefactor(unittest.TestCase):

    def setUp(self):
        self.store = InMemoryIncomeStore()
        self.db = MockAsyncSession(self.store)
        self.user_id = uuid4()
        self.other_user_id = uuid4()

    @sync_run
    async def test_estimated_income_default_category(self):
        """create_estimated_income defaults category to 'Otros ingresos' if omitted or empty"""
        est_create = schemas.EstimatedIncomeCreate(
            name="Consultoría",
            expected_amount=Decimal("500"),
            currency=schemas.CurrencyType.USD_BCV,
            category=""
        )
        est = await crud_incomes.create_estimated_income(self.db, est_create, self.user_id)
        self.assertEqual(est.category, "Otros ingresos")

    @sync_run
    async def test_partial_check_accumulation(self):
        """
        Partial check accumulation:
        1. check_income with $40 (is_partial=True) -> IncomeCheck real_amount=40, is_partial=True, 1 Income row.
        2. check_income with $60 -> IncomeCheck real_amount=100, is_partial=False (40+60 >= 100), 2 Income rows.
        """
        est_create = schemas.EstimatedIncomeCreate(
            name="Sueldo Base",
            expected_amount=Decimal("100"),
            currency=schemas.CurrencyType.USD_BCV,
            category="Salario"
        )
        est = await crud_incomes.create_estimated_income(self.db, est_create, self.user_id)

        # 1st partial check: $40
        chk_create_1 = schemas.IncomeCheckCreate(
            month_year="2026-10",
            real_amount=Decimal("40"),
            currency=schemas.CurrencyType.USD_BCV,
            is_partial=True,
            notes="Primer abono"
        )
        extra_data_1 = {
            "amount_usd": Decimal("40"),
            "amount_bs": Decimal("4000"),
            "amount_eur": Decimal("38"),
            "amount_usdt": Decimal("40"),
            "rate_usd_bs": Decimal("100"),
            "rate_eur_bs": Decimal("105"),
            "rate_usdt_bs": Decimal("100"),
        }
        chk_1 = await crud_incomes.check_income(self.db, est.id, chk_create_1, self.user_id, extra_data=extra_data_1)
        self.assertIsNotNone(chk_1)
        self.assertEqual(chk_1.real_amount, Decimal("40"))
        self.assertTrue(chk_1.is_partial)

        # Verify 1 linked Income row
        linked_incomes = [i for i in self.store.incomes.values() if i.income_check_id == chk_1.id]
        self.assertEqual(len(linked_incomes), 1)
        self.assertEqual(linked_incomes[0].amount, Decimal("40"))
        self.assertEqual(linked_incomes[0].category, "Salario")
        self.assertIn("Primer abono", linked_incomes[0].description)

        # 2nd check: $60 (cumulative 100 >= expected 100)
        chk_create_2 = schemas.IncomeCheckCreate(
            month_year="2026-10",
            real_amount=Decimal("60"),
            currency=schemas.CurrencyType.USD_BCV,
            is_partial=True,  # sent as partial, but cumulative reaches 100 so it auto-completes
            notes="Segundo abono"
        )
        extra_data_2 = {
            "amount_usd": Decimal("60"),
            "amount_bs": Decimal("6000"),
            "amount_eur": Decimal("57"),
            "amount_usdt": Decimal("60"),
            "rate_usd_bs": Decimal("100"),
            "rate_eur_bs": Decimal("105"),
            "rate_usdt_bs": Decimal("100"),
        }
        chk_2 = await crud_incomes.check_income(self.db, est.id, chk_create_2, self.user_id, extra_data=extra_data_2)
        self.assertEqual(chk_2.id, chk_1.id)
        self.assertEqual(chk_2.real_amount, Decimal("100"))
        self.assertFalse(chk_2.is_partial, "Should auto-complete because 40 + 60 >= expected 100")
        self.assertIsNone(chk_2.pending_date)

        # Verify 2 linked Income rows exist
        linked_incomes = [i for i in self.store.incomes.values() if i.income_check_id == chk_1.id]
        self.assertEqual(len(linked_incomes), 2)
        total_income_amount = sum(i.amount for i in linked_incomes)
        self.assertEqual(total_income_amount, Decimal("100"))

    @sync_run
    async def test_update_and_delete_linked_income_recalculates_check(self):
        """
        Editing linked Income updates IncomeCheck.real_amount;
        Deleting one of two linked Incomes recalculates IncomeCheck;
        Deleting last linked Income deletes IncomeCheck (reverts to pending).
        """
        est_create = schemas.EstimatedIncomeCreate(
            name="Freelance Project",
            expected_amount=Decimal("200"),
            currency=schemas.CurrencyType.USD_BCV
        )
        est = await crud_incomes.create_estimated_income(self.db, est_create, self.user_id)

        # Add 2 partial checks: $50 and $50
        extra_50 = {
            "amount_usd": Decimal("50"),
            "amount_bs": Decimal("5000"),
            "amount_eur": Decimal("48"),
            "amount_usdt": Decimal("50"),
            "rate_usd_bs": Decimal("100"),
            "rate_eur_bs": Decimal("105"),
            "rate_usdt_bs": Decimal("100"),
        }
        chk = await crud_incomes.check_income(
            self.db, est.id,
            schemas.IncomeCheckCreate(month_year="2026-10", real_amount=Decimal("50"), currency=schemas.CurrencyType.USD_BCV, is_partial=True),
            self.user_id,
            extra_data=extra_50
        )
        chk = await crud_incomes.check_income(
            self.db, est.id,
            schemas.IncomeCheckCreate(month_year="2026-10", real_amount=Decimal("50"), currency=schemas.CurrencyType.USD_BCV, is_partial=True),
            self.user_id,
            extra_data=extra_50
        )
        self.assertEqual(chk.real_amount, Decimal("100"))

        linked_incomes = [i for i in self.store.incomes.values() if i.income_check_id == chk.id]
        self.assertEqual(len(linked_incomes), 2)
        inc_1, inc_2 = linked_incomes[0], linked_incomes[1]

        # 1. Update inc_1 from 50 to 75
        extra_75 = {
            "amount_usd": Decimal("75"),
            "amount_bs": Decimal("7500"),
            "amount_eur": Decimal("72"),
            "amount_usdt": Decimal("75"),
            "rate_usd_bs": Decimal("100"),
            "rate_eur_bs": Decimal("105"),
            "rate_usdt_bs": Decimal("100"),
        }
        upd = await crud_incomes.update_income(
            self.db,
            entry_id=inc_1.id,
            income_update=schemas.IncomeUpdate(amount=Decimal("75")),
            user_id=self.user_id,
            extra_data=extra_75
        )
        self.assertEqual(upd.amount, Decimal("75"))
        # Check that IncomeCheck recalculated: 75 + 50 = 125
        chk_refreshed = self.store.income_checks.get(chk.id)
        self.assertEqual(chk_refreshed.real_amount, Decimal("125"))

        # 2. Delete inc_1: IncomeCheck should recalculate to remaining inc_2 (50)
        del_1 = await crud_incomes.delete_income(self.db, entry_id=inc_1.id, user_id=self.user_id)
        self.assertTrue(del_1)
        chk_refreshed = self.store.income_checks.get(chk.id)
        self.assertIsNotNone(chk_refreshed)
        self.assertEqual(chk_refreshed.real_amount, Decimal("50"))

        # 3. Delete inc_2: Last linked income deleted -> IncomeCheck should be deleted (reverts to pending)
        del_2 = await crud_incomes.delete_income(self.db, entry_id=inc_2.id, user_id=self.user_id)
        self.assertTrue(del_2)
        self.assertNotIn(chk.id, self.store.income_checks, "IncomeCheck must be deleted when all linked incomes are deleted")

    @sync_run
    async def test_uncheck_income_deletes_check_and_linked_incomes(self):
        """uncheck_income deletes the IncomeCheck and ALL linked Income rows"""
        est = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(name="Dividendos", expected_amount=Decimal("300")),
            self.user_id
        )
        extra = {"amount_usd": Decimal("150"), "amount_bs": Decimal("15000")}
        chk = await crud_incomes.check_income(
            self.db, est.id,
            schemas.IncomeCheckCreate(month_year="2026-10", real_amount=Decimal("150"), is_partial=True),
            self.user_id,
            extra_data=extra
        )
        chk = await crud_incomes.check_income(
            self.db, est.id,
            schemas.IncomeCheckCreate(month_year="2026-10", real_amount=Decimal("150"), is_partial=False),
            self.user_id,
            extra_data=extra
        )
        self.assertEqual(len([i for i in self.store.incomes.values() if i.income_check_id == chk.id]), 2)

        uncheck_ok = await crud_incomes.uncheck_income(self.db, est.id, "2026-10", self.user_id)
        self.assertTrue(uncheck_ok)
        self.assertNotIn(chk.id, self.store.income_checks)
        self.assertEqual(len([i for i in self.store.incomes.values() if i.income_check_id == chk.id]), 0)

    @sync_run
    async def test_create_income_with_income_check_target(self):
        """
        create_income with income_check_target:
        - Creates or finds IncomeCheck
        - Links Income to IncomeCheck
        - Recalculates check totals
        - Populates estimated_income_id and estimated_income_name on Income
        """
        est = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(name="Bono Mensual", expected_amount=Decimal("80"), category="Bonos"),
            self.user_id
        )

        income_create = schemas.IncomeCreate(
            amount=Decimal("80"),
            description="Pago bono puntual",
            category="Bonos",
            date=date(2026, 10, 15),
            currency=schemas.CurrencyType.USD_BCV,
            income_check_target=schemas.IncomeCheckTarget(
                estimated_income_id=est.id,
                month_year="2026-10",
                is_partial=False
            )
        )
        extra = {
            "amount_usd": Decimal("80"),
            "amount_bs": Decimal("8000"),
            "amount_eur": Decimal("76"),
            "amount_usdt": Decimal("80"),
            "rate_usd_bs": Decimal("100"),
            "rate_eur_bs": Decimal("105"),
            "rate_usdt_bs": Decimal("100"),
        }

        real_inc = await crud_incomes.create_income(self.db, income=income_create, user_id=self.user_id, extra_data=extra)
        self.assertIsNotNone(real_inc)
        self.assertIsNotNone(real_inc.income_check_id)
        self.assertEqual(real_inc.estimated_income_id, est.id)
        self.assertEqual(real_inc.estimated_income_name, "Bono Mensual")

        chk = self.store.income_checks.get(real_inc.income_check_id)
        self.assertIsNotNone(chk)
        self.assertEqual(chk.real_amount, Decimal("80"))
        self.assertEqual(chk.month_year, "2026-10")
        self.assertFalse(chk.is_partial)

    @sync_run
    async def test_real_income_crud_and_user_isolation(self):
        """Test real income standalone CRUD, date filtering, and user ownership isolation"""
        inc_1 = await crud_incomes.create_income(
            self.db,
            schemas.IncomeCreate(
                amount=Decimal("120"),
                description="Venta de laptop",
                category="Ventas",
                date=date(2026, 10, 5),
                currency=schemas.CurrencyType.USD_BCV
            ),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("120"), "amount_bs": Decimal("12000")}
        )
        inc_2 = await crud_incomes.create_income(
            self.db,
            schemas.IncomeCreate(
                amount=Decimal("50"),
                description="Clase particular",
                category="Freelance",
                date=date(2026, 10, 20),
                currency=schemas.CurrencyType.USD_BCV
            ),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("50"), "amount_bs": Decimal("5000")}
        )

        # Get list for user
        incomes = await crud_incomes.get_incomes(self.db, user_id=self.user_id)
        self.assertEqual(len(incomes), 2)

        # Filter by date
        filtered = await crud_incomes.get_incomes(
            self.db, user_id=self.user_id, date_from=date(2026, 10, 10), date_to=date(2026, 10, 25)
        )
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0].id, inc_2.id)

        # User isolation: other user cannot see, read, update, or delete user_id's income
        other_incomes = await crud_incomes.get_incomes(self.db, user_id=self.other_user_id)
        self.assertEqual(len(other_incomes), 0)

        other_read = await crud_incomes.get_income(self.db, entry_id=inc_1.id, user_id=self.other_user_id)
        self.assertIsNone(other_read)

        other_update = await crud_incomes.update_income(
            self.db, entry_id=inc_1.id, income_update=schemas.IncomeUpdate(amount=Decimal("999")), user_id=self.other_user_id
        )
        self.assertIsNone(other_update)

        other_delete = await crud_incomes.delete_income(self.db, entry_id=inc_1.id, user_id=self.other_user_id)
        self.assertFalse(other_delete)

        # Successful delete by owner
        owner_delete = await crud_incomes.delete_income(self.db, entry_id=inc_1.id, user_id=self.user_id)
        self.assertTrue(owner_delete)
        self.assertIsNone(await crud_incomes.get_income(self.db, entry_id=inc_1.id, user_id=self.user_id))

    @sync_run
    async def test_get_summary_range_computes_income_totals_and_frozen_balance(self):
        """
        tests crud.get_summary_range verifying:
        - income_total_usd/bs/eur/usdt
        - balance_* = income_total_* - total_*
        - by_category and daily_avg_* strictly from expenses
        """
        db = AsyncMock()

        # Mock query results:
        # 1. Total expenses (total_bs, total_usd, total_eur, total_usdt)
        exp_totals = (Decimal("1500"), Decimal("30"), Decimal("27"), Decimal("30"))
        # 2. Total incomes (income_total_bs, income_total_usd, income_total_eur, income_total_usdt)
        inc_totals = (Decimal("5000"), Decimal("100"), Decimal("90"), Decimal("100"))
        # 3. By category (strictly expenses)
        cat_rows = [
            ("Comida", Decimal("1000"), Decimal("20"), Decimal("18"), Decimal("20")),
            ("Transporte", Decimal("500"), Decimal("10"), Decimal("9"), Decimal("10")),
        ]

        mock_exp_res = MagicMock()
        mock_exp_res.first.return_value = exp_totals

        mock_inc_res = MagicMock()
        mock_inc_res.first.return_value = inc_totals

        mock_cat_res = MagicMock()
        mock_cat_res.all.return_value = cat_rows

        executed_stmts = []
        async def mock_execute(stmt, *args, **kwargs):
            executed_stmts.append(stmt)
            if len(executed_stmts) == 1:
                return mock_exp_res
            elif len(executed_stmts) == 2:
                return mock_inc_res
            else:
                return mock_cat_res

        db.execute = AsyncMock(side_effect=mock_execute)

        user_id = uuid4()
        date_from = date(2026, 10, 1)
        date_to = date(2026, 10, 5)  # 5 days inclusive

        summary = await crud.get_summary_range(db, user_id=user_id, date_from=date_from, date_to=date_to)

        # 1. Verify expenses totals
        self.assertEqual(summary.total_bs, Decimal("1500"))
        self.assertEqual(summary.total_usd, Decimal("30"))
        self.assertEqual(summary.total_eur, Decimal("27"))
        self.assertEqual(summary.total_usdt, Decimal("30"))

        # 2. Verify income totals
        self.assertEqual(summary.income_total_bs, Decimal("5000"))
        self.assertEqual(summary.income_total_usd, Decimal("100"))
        self.assertEqual(summary.income_total_eur, Decimal("90"))
        self.assertEqual(summary.income_total_usdt, Decimal("100"))

        # 3. Verify balance_* = income_total_* - total_*
        self.assertEqual(summary.balance_bs, Decimal("5000") - Decimal("1500"))
        self.assertEqual(summary.balance_usd, Decimal("100") - Decimal("30"))
        self.assertEqual(summary.balance_eur, Decimal("90") - Decimal("27"))
        self.assertEqual(summary.balance_usdt, Decimal("100") - Decimal("30"))

        # 4. Verify daily_avg_* strictly from expenses
        self.assertEqual(summary.days_in_range, 5)
        self.assertEqual(summary.daily_avg_bs, Decimal("1500") / 5)
        self.assertEqual(summary.daily_avg_usd, Decimal("30") / 5)
        self.assertEqual(summary.daily_avg_eur, Decimal("27") / 5)
        self.assertEqual(summary.daily_avg_usdt, Decimal("30") / 5)

        # 5. Verify by_category strictly from expenses
        self.assertEqual(len(summary.by_category), 2)
        self.assertEqual(summary.by_category[0].category, "Comida")
        self.assertEqual(summary.by_category[0].total_usd, Decimal("20"))
        self.assertEqual(summary.by_category[1].category, "Transporte")
        self.assertEqual(summary.by_category[1].total_usd, Decimal("10"))

        # Verify underlying query entities
        self.assertIn("expenses", str(executed_stmts[0]).lower())
        self.assertIn("incomes", str(executed_stmts[1]).lower())
        self.assertIn("expenses.category", str(executed_stmts[2]).lower())

    @sync_run
    async def test_categories_kind_separation_and_delete_reassignment(self):
        """
        tests crud.get_categories, crud.create_category, and crud.delete_category:
        - isolating kind='expense' vs kind='income'
        - protecting 'Otros ingresos' and 'Sin Categoría'
        - reassigning Income/EstimatedIncome to 'Otros ingresos' on delete
        """
        user_id = self.user_id

        # 1. Protecting 'Sin Categoría' and 'Otros ingresos' on create_category
        with self.assertRaises(HTTPException) as cm_exp:
            await crud.create_category(
                self.db,
                schemas.CategoryCreate(name="Sin Categoría", kind="expense"),
                user_id=user_id
            )
        self.assertEqual(cm_exp.exception.status_code, 400)
        self.assertIn("Sin Categoría", cm_exp.exception.detail)

        with self.assertRaises(HTTPException) as cm_inc:
            await crud.create_category(
                self.db,
                schemas.CategoryCreate(name="Otros ingresos", kind="income"),
                user_id=user_id
            )
        self.assertEqual(cm_inc.exception.status_code, 400)
        self.assertIn("Otros ingresos", cm_inc.exception.detail)

        # 2. Successful creation isolating kinds
        mock_db_create = AsyncMock()
        mock_db_create.add = MagicMock()
        mock_exist_res = MagicMock()
        mock_exist_res.scalars.return_value.first.return_value = None
        mock_db_create.execute.return_value = mock_exist_res

        cat_income = await crud.create_category(
            mock_db_create,
            schemas.CategoryCreate(name="Honorarios", kind="income"),
            user_id=user_id
        )
        self.assertEqual(cat_income.name, "Honorarios")
        self.assertEqual(cat_income.kind, "income")

        cat_expense = await crud.create_category(
            mock_db_create,
            schemas.CategoryCreate(name="Transporte", kind="expense"),
            user_id=user_id
        )
        self.assertEqual(cat_expense.name, "Transporte")
        self.assertEqual(cat_expense.kind, "expense")

        # 3. Protecting 'Sin Categoría' and 'Otros ingresos' on delete_category
        with patch("app.crud.get_category", new_callable=AsyncMock) as mock_get_cat:
            mock_get_cat.return_value = models.Category(
                id=uuid4(), name="Sin Categoría", user_id=user_id
            )
            with self.assertRaises(HTTPException) as cm_del_exp:
                await crud.delete_category(self.db, category_id=uuid4(), user_id=user_id)
            self.assertEqual(cm_del_exp.exception.status_code, 400)
            self.assertIn("Sin Categoría", cm_del_exp.exception.detail)

            mock_get_cat.return_value = models.IncomeCategory(
                id=uuid4(), name="Otros ingresos", user_id=user_id
            )
            with self.assertRaises(HTTPException) as cm_del_inc:
                await crud.delete_category(self.db, category_id=uuid4(), user_id=user_id)
            self.assertEqual(cm_del_inc.exception.status_code, 400)
            self.assertIn("Otros ingresos", cm_del_inc.exception.detail)

        # 4. Deleting an income category reassigns Income and EstimatedIncome to 'Otros ingresos'
        del_db = AsyncMock()
        income_cat_to_delete = models.IncomeCategory(
            id=uuid4(), name="Consultoría", user_id=user_id
        )
        self.assertEqual(income_cat_to_delete.kind, "income")
        with patch("app.crud.get_category", new_callable=AsyncMock) as mock_get_cat:
            mock_get_cat.return_value = income_cat_to_delete
            del_ok = await crud.delete_category(del_db, category_id=income_cat_to_delete.id, user_id=user_id)
            self.assertTrue(del_ok)

            # Check that update queries were run against estimated_incomes and incomes targeting 'Otros ingresos'
            executed_stmts = [call[0][0] for call in del_db.execute.call_args_list if call[0]]
            stmt_texts = [str(s).lower() for s in executed_stmts]
            self.assertTrue(any("estimated_incomes" in s and "update" in s for s in stmt_texts))
            self.assertTrue(any("incomes" in s and "update" in s for s in stmt_texts))

            # Verify target reassign value is 'Otros ingresos'
            reassigned_values = []
            for s in executed_stmts:
                compiled = s.compile()
                for v in compiled.params.values():
                    if v == "Otros ingresos":
                        reassigned_values.append(v)
            self.assertGreaterEqual(len(reassigned_values), 2, "Both EstimatedIncome and Income updates must reassign to 'Otros ingresos'")

            del_db.delete.assert_called_once_with(income_cat_to_delete)
            del_db.commit.assert_called_once()

        # 5. Isolating kind in get_categories
        with patch("app.crud.ensure_categories_and_debts_schema", new_callable=AsyncMock):
            mock_inc_db = AsyncMock()
            inc_cat = models.IncomeCategory(id=uuid4(), name="Ventas", user_id=user_id)
            otros_cat = models.IncomeCategory(id=uuid4(), name="Otros ingresos", user_id=user_id)
            self.assertEqual(inc_cat.kind, "income")
            self.assertEqual(otros_cat.kind, "income")
            mock_inc_db.execute.side_effect = [
                MagicMock(scalars=lambda: MagicMock(all=lambda: [inc_cat, otros_cat])),
                MagicMock(all=lambda: [("Ventas", 2)]),
                MagicMock(all=lambda: [("Ventas", 3)]),
            ]
            cats_inc = await crud.get_categories(mock_inc_db, user_id=user_id, kind="income")
            v_cat = next(c for c in cats_inc if c.name == "Ventas")
            self.assertEqual(v_cat.income_count, 5)
            self.assertEqual(v_cat.expense_count, 0)
            self.assertEqual(v_cat.usage_count, 5)
            self.assertEqual(v_cat.kind, "income")

            mock_exp_db = AsyncMock()
            exp_cat = models.Category(id=uuid4(), name="Comida", user_id=user_id)
            sin_cat = models.Category(id=uuid4(), name="Sin Categoría", user_id=user_id)
            self.assertEqual(exp_cat.kind, "expense")
            self.assertEqual(sin_cat.kind, "expense")
            mock_exp_db.execute.side_effect = [
                MagicMock(scalars=lambda: MagicMock(all=lambda: [exp_cat, sin_cat])),
                MagicMock(all=lambda: [("Comida", 7)]),
                MagicMock(all=lambda: []),
                MagicMock(all=lambda: []),
                MagicMock(all=lambda: []),
                MagicMock(all=lambda: []),
                MagicMock(all=lambda: []),
            ]
            cats_exp = await crud.get_categories(mock_exp_db, user_id=user_id, kind="expense")
            c_cat = next(c for c in cats_exp if c.name == "Comida")
            self.assertEqual(c_cat.expense_count, 7)
            self.assertEqual(c_cat.income_count, 0)
            self.assertEqual(c_cat.usage_count, 7)
            self.assertEqual(c_cat.kind, "expense")

    @sync_run
    async def test_partial_status_becomes_true_when_income_reduced_or_deleted(self):
        """
        Verify partial status becomes True when a linked income is updated/deleted below expected_amount,
        and when create_income with income_check_target has is_partial=None.
        """
        est = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(
                name="Sueldo Quincenal",
                expected_amount=Decimal("100"),
                currency=schemas.CurrencyType.USD_BCV
            ),
            self.user_id
        )

        # 1. First partial income of $60 (is_partial=True)
        chk = await crud_incomes.check_income(
            self.db,
            est.id,
            schemas.IncomeCheckCreate(
                month_year="2026-10",
                real_amount=Decimal("60"),
                currency=schemas.CurrencyType.USD_BCV,
                is_partial=True
            ),
            self.user_id,
            extra_data={"amount_usd": Decimal("60"), "amount_bs": Decimal("6000")}
        )
        self.assertTrue(chk.is_partial)

        # 2. Second income of $40 -> cumulative reaches $100 -> auto-completes to False
        chk = await crud_incomes.check_income(
            self.db,
            est.id,
            schemas.IncomeCheckCreate(
                month_year="2026-10",
                real_amount=Decimal("40"),
                currency=schemas.CurrencyType.USD_BCV,
                is_partial=False
            ),
            self.user_id,
            extra_data={"amount_usd": Decimal("40"), "amount_bs": Decimal("4000")}
        )
        self.assertFalse(chk.is_partial, "Cumulative 100 >= 100 must set is_partial to False")

        linked = [i for i in self.store.incomes.values() if i.income_check_id == chk.id]
        self.assertEqual(len(linked), 2)
        inc_1, inc_2 = linked[0], linked[1]

        # 3. Update inc_2 down from $40 to $10 -> cumulative becomes $70 < $100 -> updates is_partial=True
        upd = await crud_incomes.update_income(
            self.db,
            entry_id=inc_2.id,
            income_update=schemas.IncomeUpdate(amount=Decimal("10")),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("10"), "amount_bs": Decimal("1000")}
        )
        self.assertEqual(upd.amount, Decimal("10"))
        chk_refreshed = self.store.income_checks.get(chk.id)
        self.assertEqual(chk_refreshed.real_amount, Decimal("70"))
        self.assertTrue(chk_refreshed.is_partial, "IncomeCheck should become partial=True when updated below expected")

        # 4. Update inc_2 back to $40 -> cumulative reaches $100 -> updates is_partial=False
        await crud_incomes.update_income(
            self.db,
            entry_id=inc_2.id,
            income_update=schemas.IncomeUpdate(amount=Decimal("40")),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("40"), "amount_bs": Decimal("4000")}
        )
        chk_refreshed = self.store.income_checks.get(chk.id)
        self.assertEqual(chk_refreshed.real_amount, Decimal("100"))
        self.assertFalse(chk_refreshed.is_partial, "IncomeCheck should auto-complete to is_partial=False")

        # 5. Delete inc_2 ($40) -> remaining inc_1 is $60 < $100 -> updates is_partial=True
        await crud_incomes.delete_income(self.db, entry_id=inc_2.id, user_id=self.user_id)
        chk_refreshed = self.store.income_checks.get(chk.id)
        self.assertIsNotNone(chk_refreshed)
        self.assertEqual(chk_refreshed.real_amount, Decimal("60"))
        self.assertTrue(chk_refreshed.is_partial, "IncomeCheck should become partial=True when deleted below expected")

        # 6. create_income with income_check_target and is_partial=None
        est2 = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(
                name="Proyecto Web",
                expected_amount=Decimal("300"),
                currency=schemas.CurrencyType.USD_BCV
            ),
            self.user_id
        )
        # First entry: $100 (< $300 expected) with is_partial=None
        inc_target_1 = schemas.IncomeCreate(
            amount=Decimal("100"),
            description="Abono web 1",
            currency=schemas.CurrencyType.USD_BCV,
            income_check_target=schemas.IncomeCheckTarget(
                estimated_income_id=est2.id,
                month_year="2026-10",
                is_partial=None
            )
        )
        real_1 = await crud_incomes.create_income(
            self.db,
            income=inc_target_1,
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("100"), "amount_bs": Decimal("10000")}
        )
        chk2 = self.store.income_checks.get(real_1.income_check_id)
        self.assertIsNotNone(chk2)
        self.assertEqual(chk2.real_amount, Decimal("100"))
        self.assertTrue(chk2.is_partial, "New check created with is_partial=None stays True when cumulative < expected")

        # Second entry: $200 (reaches $300 expected) with is_partial=None
        inc_target_2 = schemas.IncomeCreate(
            amount=Decimal("200"),
            description="Abono web 2",
            currency=schemas.CurrencyType.USD_BCV,
            income_check_target=schemas.IncomeCheckTarget(
                estimated_income_id=est2.id,
                month_year="2026-10",
                is_partial=None
            )
        )
        real_2 = await crud_incomes.create_income(
            self.db,
            income=inc_target_2,
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("200"), "amount_bs": Decimal("20000")}
        )
        chk2_refreshed = self.store.income_checks.get(real_1.income_check_id)
        self.assertEqual(chk2_refreshed.real_amount, Decimal("300"))
        self.assertFalse(chk2_refreshed.is_partial, "Check with is_partial=None auto-completes to False when cumulative >= expected")

    def test_populate_income_template_info_missing_greenlet_safety(self):
        """
        Verify _populate_income_template_info avoids accessing the descriptor
        when 'income_check' is not present in __dict__, preventing MissingGreenlet.
        """
        class MissingGreenletError(Exception):
            pass

        class MockDescriptor:
            def __get__(self, instance, owner=None):
                if instance is None:
                    return self
                raise MissingGreenletError("greenlet_spawn has not been called; can't call a greenlet-blocking function while not in a greenlet")

        class DummyIncome:
            income_check = MockDescriptor()
            def __init__(self):
                self.estimated_income_id = None
                self.estimated_income_name = None

        inc = DummyIncome()
        # In current code: getattr(inc, "income_check", None) will trigger MockDescriptor and raise MissingGreenletError!
        # In fixed code: inc.__dict__.get("income_check") returns None, no exception is raised.
        result = crud_incomes._populate_income_template_info(inc)
        self.assertIs(result, inc)
        self.assertIsNone(result.estimated_income_id)
        self.assertIsNone(result.estimated_income_name)

        # Also test when inc_check is in __dict__, but inc_check.income has an unloaded descriptor
        class DummyCheck:
            income = MockDescriptor()
            def __init__(self, tpl_id):
                self.income_id = tpl_id

        chk = DummyCheck(tpl_id=uuid4())
        inc2 = DummyIncome()
        inc2.__dict__["income_check"] = chk
        result2 = crud_incomes._populate_income_template_info(inc2)
        self.assertEqual(result2.estimated_income_id, chk.income_id)
        self.assertIsNone(result2.estimated_income_name)

    @sync_run
    async def test_create_income_with_income_check_target_partial(self):
        """
        create_income with income_check_target for a partial payment ($30 of $100 without pending_date):
        - succeeds
        - initializes real_amount with the income amount
        - sets is_partial=True on IncomeCheck
        - populates estimated_income_id and estimated_income_name on returned Income
        """
        est = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(
                name="Sueldo Base",
                expected_amount=Decimal("100"),
                currency=schemas.CurrencyType.USD_BCV,
                category="Salario"
            ),
            self.user_id
        )

        income_create = schemas.IncomeCreate(
            amount=Decimal("30"),
            description="Primer pago parcial",
            category="Salario",
            date=date(2026, 10, 15),
            currency=schemas.CurrencyType.USD_BCV,
            income_check_target=schemas.IncomeCheckTarget(
                estimated_income_id=est.id,
                month_year="2026-10",
                is_partial=True,
                pending_date=None
            )
        )
        extra = {
            "amount_usd": Decimal("30"),
            "amount_bs": Decimal("3000"),
            "rate_usd_bs": Decimal("100"),
        }

        real_inc = await crud_incomes.create_income(
            self.db,
            income=income_create,
            user_id=self.user_id,
            extra_data=extra
        )
        self.assertIsNotNone(real_inc)
        self.assertEqual(real_inc.amount, Decimal("30"))
        self.assertEqual(real_inc.estimated_income_id, est.id)
        self.assertEqual(real_inc.estimated_income_name, "Sueldo Base")

        chk = self.store.income_checks.get(real_inc.income_check_id)
        self.assertIsNotNone(chk)
        self.assertEqual(chk.real_amount, Decimal("30"))
        self.assertTrue(chk.is_partial)
        self.assertIsNone(chk.pending_date)

    @sync_run
    async def test_update_income_linked_reloads_cleanly_with_template_info(self):
        """
        update_income on a linked income reloads cleanly via get_income with
        estimated_income_id and estimated_income_name.
        """
        est = await crud_incomes.create_estimated_income(
            self.db,
            schemas.EstimatedIncomeCreate(
                name="Soporte Mensual",
                expected_amount=Decimal("200"),
                currency=schemas.CurrencyType.USD_BCV
            ),
            self.user_id
        )

        real_inc = await crud_incomes.create_income(
            self.db,
            schemas.IncomeCreate(
                amount=Decimal("100"),
                description="Pago soporte 1",
                currency=schemas.CurrencyType.USD_BCV,
                income_check_target=schemas.IncomeCheckTarget(
                    estimated_income_id=est.id,
                    month_year="2026-10",
                    is_partial=True
                )
            ),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("100"), "amount_bs": Decimal("10000")}
        )

        # Update the linked income
        updated = await crud_incomes.update_income(
            self.db,
            entry_id=real_inc.id,
            income_update=schemas.IncomeUpdate(amount=Decimal("150")),
            user_id=self.user_id,
            extra_data={"amount_usd": Decimal("150"), "amount_bs": Decimal("15000")}
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated.amount, Decimal("150"))
        self.assertEqual(updated.estimated_income_id, est.id)
        self.assertEqual(updated.estimated_income_name, "Soporte Mensual")


from fastapi.routing import APIRoute
from unittest.mock import AsyncMock, patch
from app.routers import incomes


class TestIncomesRouter(unittest.TestCase):

    def test_routes_declared_and_precedence(self):
        """
        Verify all routes exist on router and that /api/incomes/monthly/{month_year}
        is declared BEFORE /api/incomes/{income_id} to avoid path parameter shadowing.
        """
        routes = [r for r in incomes.router.routes if isinstance(r, APIRoute)]
        paths = [(r.path, tuple(sorted(r.methods))) for r in routes]

        # 1. Verify estimated-incomes routes exist
        self.assertIn(("/api/estimated-incomes/", ("POST",)), paths)
        self.assertIn(("/api/estimated-incomes/", ("GET",)), paths)
        self.assertIn(("/api/estimated-incomes/monthly/{month_year}", ("GET",)), paths)
        self.assertIn(("/api/estimated-incomes/{income_id}", ("GET",)), paths)
        self.assertIn(("/api/estimated-incomes/{income_id}", ("PUT",)), paths)
        self.assertIn(("/api/estimated-incomes/{income_id}", ("DELETE",)), paths)
        self.assertIn(("/api/estimated-incomes/{income_id}/checks", ("POST",)), paths)
        self.assertIn(("/api/estimated-incomes/{income_id}/checks/{month_year}", ("DELETE",)), paths)

        # 2. Verify backward-compatible aliases exist
        self.assertIn(("/api/incomes/monthly/{month_year}", ("GET",)), paths)
        self.assertIn(("/api/incomes/{income_id}/checks", ("POST",)), paths)
        self.assertIn(("/api/incomes/{income_id}/checks/{month_year}", ("DELETE",)), paths)

        # 3. Verify real incomes routes exist
        self.assertIn(("/api/incomes/", ("POST",)), paths)
        self.assertIn(("/api/incomes/", ("GET",)), paths)
        self.assertIn(("/api/incomes/{income_id}", ("GET",)), paths)
        self.assertIn(("/api/incomes/{income_id}", ("PUT",)), paths)
        self.assertIn(("/api/incomes/{income_id}", ("DELETE",)), paths)

        # 4. Critical Route Precedence:
        # /api/incomes/monthly/{month_year} MUST appear BEFORE /api/incomes/{income_id}
        idx_monthly = next(i for i, r in enumerate(routes) if r.path == "/api/incomes/monthly/{month_year}")
        idx_income_id = next(i for i, r in enumerate(routes) if r.path == "/api/incomes/{income_id}")
        self.assertLess(
            idx_monthly, idx_income_id,
            f"Precedence error: /api/incomes/monthly/{{month_year}} (idx {idx_monthly}) must be declared before /api/incomes/{{income_id}} (idx {idx_income_id})"
        )

    @sync_run
    async def test_router_handlers_with_bcv_conversion(self):
        store = InMemoryIncomeStore()
        db = MockAsyncSession(store)
        user_id = uuid4()

        with patch("app.bcv_service.get_all_rates", new_callable=AsyncMock) as mock_rates:
            mock_rates.return_value = {
                "usd_bs": Decimal("100"),
                "eur_bs": Decimal("105"),
                "usdt_bs": Decimal("100"),
            }

            # Handler: create_income
            income_in = schemas.IncomeCreate(
                amount=Decimal("150"),
                description="Servicio técnico",
                category="Freelance",
                currency=schemas.CurrencyType.USD_BCV
            )
            created = await incomes.create_income(income=income_in, db=db, user_id=user_id)
            self.assertEqual(created.amount, Decimal("150"))
            self.assertEqual(created.amount_usd, Decimal("150"))
            self.assertEqual(created.amount_bs, Decimal("15000"))

            # Handler: read_incomes
            list_res = await incomes.read_incomes(db=db, user_id=user_id)
            self.assertEqual(len(list_res), 1)

            # Handler: read_income
            single_res = await incomes.read_income(income_id=created.id, db=db, user_id=user_id)
            self.assertEqual(single_res.id, created.id)

            # Handler: update_income
            update_in = schemas.IncomeUpdate(description="Servicio especializado")
            updated = await incomes.update_income(income_id=created.id, income=update_in, db=db, user_id=user_id)
            self.assertEqual(updated.description, "Servicio especializado")

            # Handler: delete_income
            del_res = await incomes.delete_income(income_id=created.id, db=db, user_id=user_id)
            self.assertEqual(del_res, {"ok": True})


class TestIncomeCategoriesRefactor(unittest.TestCase):

    @sync_run
    async def test_create_category_instantiates_correct_model(self):
        user_id = uuid4()
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_db.execute = AsyncMock(return_value=MockResult([None]))

        income_cat = await crud.create_category(
            mock_db,
            schemas.CategoryCreate(name="Honorarios", kind="income"),
            user_id=user_id
        )
        self.assertTrue(isinstance(income_cat, models.IncomeCategory))
        self.assertEqual(income_cat.__tablename__, "income_categories")
        self.assertEqual(income_cat.kind, "income")

        expense_cat = await crud.create_category(
            mock_db,
            schemas.CategoryCreate(name="Transporte", kind="expense"),
            user_id=user_id
        )
        self.assertTrue(isinstance(expense_cat, models.Category))
        self.assertEqual(expense_cat.__tablename__, "categories")
        self.assertEqual(expense_cat.kind, "expense")

    @sync_run
    async def test_delete_category_with_income_kind_never_deletes_expense(self):
        user_id = uuid4()
        expense_cat_id = uuid4()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MockResult([]))
        db.delete = MagicMock()

        result = await crud.delete_category(db, category_id=expense_cat_id, user_id=user_id, kind="income")
        self.assertFalse(result)
        db.delete.assert_not_called()

    def test_categories_router_precedence(self):
        from app.routers import categories
        routes = [r for r in categories.router.routes if isinstance(r, APIRoute)]
        paths = [(r.path, tuple(sorted(r.methods))) for r in routes]

        # Verify income routes exist
        self.assertIn(("/api/categories/income", ("GET",)), paths)
        self.assertIn(("/api/categories/income", ("POST",)), paths)
        self.assertIn(("/api/categories/income/seed-defaults", ("POST",)), paths)
        self.assertIn(("/api/categories/income/{category_id}", ("PUT",)), paths)
        self.assertIn(("/api/categories/income/{category_id}", ("DELETE",)), paths)

        # Precedence check:
        # /api/categories/income routes MUST appear before /api/categories/{category_id}
        idx_income_get = next(i for i, r in enumerate(routes) if r.path == "/api/categories/income")
        idx_param_cat = next(i for i, r in enumerate(routes) if r.path == "/api/categories/{category_id}")
        self.assertLess(
            idx_income_get, idx_param_cat,
            f"Precedence error: /api/categories/income ({idx_income_get}) must be declared before /api/categories/{{category_id}} ({idx_param_cat})"
        )


if __name__ == "__main__":
    unittest.main()


