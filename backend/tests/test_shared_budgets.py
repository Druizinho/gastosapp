import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import date, datetime, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@127.0.0.1/db"
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None

from fastapi import HTTPException
from app import models, schemas, sharing, crud_budgets, crud_connections


def sync_run(async_fn):
    def wrapper(self, *args, **kwargs):
        coro = async_fn(self, *args, **kwargs)
        try:
            while True:
                coro.send(None)
        except StopIteration as e:
            return e.value
    return wrapper


class InMemoryDB:
    def __init__(self):
        self.profiles: dict[UUID, models.Profile] = {}
        self.connections: list[models.Connection] = []
        self.budgets: list[models.MonthlyBudget] = []
        self.category_limits: list[models.BudgetCategoryLimit] = []
        self.expenses: list[models.Expense] = []
        self.categories: list[models.Category] = []
        self.shares: list[models.Share] = []
        self.share_members: list[models.ShareMember] = []

    def add_user(self, user_id: UUID, display_name: str, email: str = "") -> models.Profile:
        p = models.Profile(id=user_id, display_name=display_name)
        p.avatar_url = None
        self.profiles[user_id] = p
        return p

    def add_connection(self, req_id: UUID, rec_id: UUID, status: str = "accepted") -> models.Connection:
        c = models.Connection(
            id=uuid4(),
            requester_id=req_id,
            receiver_id=rec_id,
            status=status,
            created_at=datetime.now(timezone.utc)
        )
        self.connections.append(c)
        return c


class FakeAsyncSession:
    def __init__(self, db_store: InMemoryDB):
        self.store = db_store
        self.autoflush = False
        self.expire_on_commit = False

    def expire_all(self):
        for b in self.store.budgets:
            object.__setattr__(b, "_is_expired", True)

    def add(self, obj):
        if isinstance(obj, models.MonthlyBudget):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if not hasattr(obj, "category_limits") or obj.category_limits is None:
                obj.category_limits = []
            if obj not in self.store.budgets:
                self.store.budgets.append(obj)
        elif isinstance(obj, models.BudgetCategoryLimit):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if obj not in self.store.category_limits:
                self.store.category_limits.append(obj)
            b = next((b for b in self.store.budgets if b.id == obj.budget_id), None)
            if b:
                if not hasattr(b, "category_limits") or b.category_limits is None:
                    b.category_limits = []
                if obj not in b.category_limits:
                    b.category_limits.append(obj)
        elif isinstance(obj, models.Share):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if not hasattr(obj, "members") or obj.members is None:
                obj.members = []
            if obj not in self.store.shares:
                self.store.shares.append(obj)
        elif isinstance(obj, models.ShareMember):
            if obj not in self.store.share_members:
                self.store.share_members.append(obj)
            s = next((s for s in self.store.shares if s.id == obj.share_id), None)
            if s:
                if not hasattr(s, "members") or s.members is None:
                    s.members = []
                if obj not in s.members:
                    s.members.append(obj)
                obj.share = s
            obj.profile = self.store.profiles.get(obj.user_id)
        elif isinstance(obj, models.Expense):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if obj not in self.store.expenses:
                self.store.expenses.append(obj)
        elif isinstance(obj, models.Category):
            if not getattr(obj, "id", None):
                obj.id = uuid4()
            if obj not in self.store.categories:
                self.store.categories.append(obj)

    async def delete(self, obj):
        if isinstance(obj, models.MonthlyBudget):
            if obj in self.store.budgets:
                self.store.budgets.remove(obj)
            self.store.category_limits = [cl for cl in self.store.category_limits if cl.budget_id != obj.id]
        elif isinstance(obj, models.Share):
            if obj in self.store.shares:
                self.store.shares.remove(obj)
            self.store.share_members = [sm for sm in self.store.share_members if sm.share_id != obj.id]
        elif isinstance(obj, models.ShareMember):
            if obj in self.store.share_members:
                self.store.share_members.remove(obj)
            s = next((s for s in self.store.shares if s.id == obj.share_id), None)
            if s and hasattr(s, "members") and obj in s.members:
                s.members.remove(obj)
        elif isinstance(obj, models.BudgetCategoryLimit):
            if obj in self.store.category_limits:
                self.store.category_limits.remove(obj)
            b = next((b for b in self.store.budgets if b.id == obj.budget_id), None)
            if b and hasattr(b, "category_limits") and obj in b.category_limits:
                b.category_limits.remove(obj)

    async def get(self, model_cls, entity_id):
        if model_cls == models.MonthlyBudget:
            b = next((b for b in self.store.budgets if b.id == entity_id), None)
            if b:
                object.__setattr__(b, "_is_expired", False)
            return b
        elif model_cls == models.Profile:
            return self.store.profiles.get(entity_id)
        elif model_cls == models.Share:
            return next((s for s in self.store.shares if s.id == entity_id), None)
        return None

    async def flush(self):
        for b in self.store.budgets:
            b_dict = object.__getattribute__(b, "__dict__")
            if not b_dict.get("id"):
                b.id = uuid4()
            for cl in (b_dict.get("category_limits") or []):
                if isinstance(cl, models.BudgetCategoryLimit) and cl not in self.store.category_limits:
                    if not getattr(cl, "id", None):
                        cl.id = uuid4()
                    if not getattr(cl, "budget_id", None):
                        cl.budget_id = b.id
                    self.store.category_limits.append(cl)
        for s in self.store.shares:
            if not getattr(s, "id", None):
                s.id = uuid4()

    async def commit(self):
        await self.flush()
        if self.expire_on_commit:
            self.expire_all()

    async def rollback(self):
        pass

    async def execute(self, stmt, *args, **kwargs):
        # 1. Raw SQL query handling (auth.users)
        if hasattr(stmt, "text"):
            raw_sql = str(stmt.text).lower()
            params = args[0] if args and isinstance(args[0], dict) else kwargs
            if "auth.users" in raw_sql:
                res = MagicMock()
                pid = params.get("pid")
                pids = params.get("pids")
                if pid:
                    prof = self.store.profiles.get(pid)
                    email = f"{prof.display_name.lower().replace(' ', '')}@example.com" if prof else None
                    row = MagicMock(email=email)
                    res.first.return_value = row
                    return res
                if pids:
                    rows = []
                    for p in pids:
                        prof = self.store.profiles.get(p)
                        email = f"{prof.display_name.lower().replace(' ', '')}@example.com" if prof else None
                        rows.append(MagicMock(id=p, email=email))
                    res.all.return_value = rows
                    return res
            res = MagicMock()
            res.all.return_value = []
            res.first.return_value = None
            return res

        cds = getattr(stmt, "column_descriptions", [])
        entities = [cd.get("entity") for cd in cds]
        names = [cd.get("name") for cd in cds]
        compiled = stmt.compile()
        params = compiled.params
        sql = str(stmt).lower()

        res = MagicMock()
        res.scalars.return_value.all.return_value = []
        res.scalars.return_value.first.return_value = None
        res.scalars.return_value.unique.return_value.all.return_value = []
        res.all.return_value = []
        res.first.return_value = None
        res.scalar.return_value = None
        res.scalar_one_or_none.return_value = None

        # Prior month query
        if names == ["month_year"] or "month_year <" in sql:
            uid = next((v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)), None)
            my = next((v for k, v in params.items() if "month_year" in k and isinstance(v, str)), None)
            prior_months = []
            for b in self.store.budgets:
                b_uid = object.__getattribute__(b, "__dict__").get("user_id")
                b_my = object.__getattribute__(b, "__dict__").get("month_year")
                if (not uid or b_uid == uid) and (not my or (b_my and b_my < my)):
                    prior_months.append(b_my)
            max_m = max(prior_months) if prior_months else None
            res.scalar_one_or_none.return_value = max_m
            res.scalar.return_value = max_m
            res.scalars.return_value.first.return_value = max_m
            res.scalars.return_value.all.return_value = [max_m] if max_m else []
            return res

        # Category query
        if names == ["name"] and "categories" in sql:
            uid = next((v for k, v in params.items() if "user_id" in k), None)
            cats = [c.name for c in self.store.categories if not uid or c.user_id == uid]
            if not cats:
                cats = ["Comida", "Casa", "Transporte", "Ahorro", "Deudas", "Proyectos"]
            res.scalars.return_value.all.return_value = cats
            res.scalars.return_value.first.return_value = cats[0] if cats else None
            return res

        # Expense query
        if entities == [models.Expense]:
            uid = next((v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)), None)
            exps = [e for e in self.store.expenses if not uid or e.user_id == uid]
            res.scalars.return_value.all.return_value = exps
            res.scalars.return_value.first.return_value = exps[0] if exps else None
            return res

        # Connection query
        if entities == [models.Connection]:
            target_uids = [v for k, v in params.items() if isinstance(v, UUID)]
            conns = [c for c in self.store.connections if c.status == "accepted"]
            if target_uids:
                conns = [c for c in conns if c.requester_id in target_uids or c.receiver_id in target_uids]
            res.scalars.return_value.all.return_value = conns
            res.scalars.return_value.first.return_value = conns[0] if conns else None
            return res

        # Profile query
        if entities == [models.Profile]:
            target_ids = []
            for k, v in params.items():
                if isinstance(v, (list, tuple, set)):
                    target_ids.extend(v)
                elif isinstance(v, UUID):
                    target_ids.append(v)
            profs = list(self.store.profiles.values())
            if target_ids:
                profs = [p for p in profs if p.id in target_ids]
            res.scalars.return_value.all.return_value = profs
            res.scalars.return_value.first.return_value = profs[0] if profs else None
            return res

        # MonthlyBudget query
        if entities == [models.MonthlyBudget]:
            uid = next((v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)), None)
            my = next((v for k, v in params.items() if "month_year" in k and isinstance(v, str)), None)
            bname = next((v for k, v in params.items() if "name" in k and isinstance(v, str)), None)
            bid = None
            not_bid = None
            for k, v in params.items():
                if isinstance(v, UUID) and not any(p in k for p in ("user", "share", "owner", "income", "partner")):
                    if "!=" in sql or "<>" in sql:
                        not_bid = v
                    else:
                        bid = v
            is_prim = next((v for k, v in params.items() if "is_primary" in k), None)

            def _get_val(obj, attr):
                d = object.__getattribute__(obj, "__dict__")
                if attr in d:
                    return d[attr]
                try:
                    return object.__getattribute__(obj, attr)
                except AttributeError:
                    return None

            matched = list(self.store.budgets)
            if uid:
                matched = [b for b in matched if _get_val(b, "user_id") == uid]
            if my:
                matched = [b for b in matched if _get_val(b, "month_year") == my]
            if bname:
                matched = [b for b in matched if (_get_val(b, "name") or "").strip().lower() == bname.strip().lower()]
            if bid:
                matched = [b for b in matched if _get_val(b, "id") == bid]
            if not_bid:
                matched = [b for b in matched if _get_val(b, "id") != not_bid]
            if is_prim is not None:
                matched = [b for b in matched if bool(_get_val(b, "is_primary")) == bool(is_prim)]

            matched.sort(key=lambda b: (not bool(_get_val(b, "is_primary")), (_get_val(b, "name") or "").lower()))
            for b in matched:
                object.__setattr__(b, "_is_expired", False)
                if not hasattr(b, "category_limits") or b.category_limits is None:
                    b.category_limits = [cl for cl in self.store.category_limits if cl.budget_id == b.id]

            res.scalars.return_value.all.return_value = matched
            res.scalars.return_value.first.return_value = matched[0] if matched else None
            return res

        # Query 2: select(models.Share, models.ShareMember.entity_id) - from get_pana_details
        if "entity_id" in names and models.Share in entities:
            uids = [v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)]
            outer_uid = uids[0] if uids else None
            partner_uid = uids[1] if len(uids) > 1 else None

            matched_pairs = []
            for s in self.store.shares:
                s_mems = [sm for sm in self.store.share_members if sm.share_id == s.id]
                s.members = s_mems
                for sm in s_mems:
                    sm.profile = self.store.profiles.get(sm.user_id)

                if partner_uid and not any(m.user_id == partner_uid for m in s_mems):
                    continue
                if outer_uid and not any(m.user_id == outer_uid for m in s_mems):
                    continue

                for sm in s_mems:
                    if outer_uid and sm.user_id == outer_uid:
                        matched_pairs.append((s, sm.entity_id))

            res.all.return_value = matched_pairs
            res.first.return_value = matched_pairs[0] if matched_pairs else None
            return res

        # Query 3: select(models.ShareMember, models.Share) - from sharing.py
        if entities == [models.ShareMember, models.Share]:
            share_ids = []
            for k, v in params.items():
                if "share_id" in k:
                    if isinstance(v, (list, tuple, set)):
                        share_ids.extend(v)
                    elif isinstance(v, UUID):
                        share_ids.append(v)

            matched_pairs = []
            for s in self.store.shares:
                if share_ids and s.id not in share_ids:
                    continue
                s_mems = [sm for sm in self.store.share_members if sm.share_id == s.id]
                s.members = s_mems
                for sm in s_mems:
                    sm.profile = self.store.profiles.get(sm.user_id)
                    sm.share = s
                    matched_pairs.append((sm, s))

            res.all.return_value = matched_pairs
            res.first.return_value = matched_pairs[0] if matched_pairs else None
            return res

        # Query 1: select(models.Share, models.ShareMember) - from get_panas_overview
        if entities == [models.Share, models.ShareMember]:
            uids = [v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)]
            target_uid = uids[0] if uids else None

            matched_pairs = []
            for s in self.store.shares:
                s_mems = [sm for sm in self.store.share_members if sm.share_id == s.id]
                s.members = s_mems
                for sm in s_mems:
                    sm.profile = self.store.profiles.get(sm.user_id)

                if target_uid and not any(m.user_id == target_uid for m in s_mems):
                    continue

                for sm in s_mems:
                    matched_pairs.append((s, sm))

            res.all.return_value = matched_pairs
            res.first.return_value = matched_pairs[0] if matched_pairs else None
            return res

        # Single Share query
        if entities == [models.Share]:
            owner_not_uid = None
            owner_uid = None
            for k, v in params.items():
                if "owner_id" in k and isinstance(v, UUID):
                    if "!=" in sql or "<>" in sql:
                        owner_not_uid = v
                    else:
                        owner_uid = v

            shares = list(self.store.shares)
            if owner_not_uid:
                shares = [s for s in shares if s.owner_id != owner_not_uid]
            if owner_uid:
                shares = [s for s in shares if s.owner_id == owner_uid]

            # Check if filtered by user_id in subquery
            uid = next((v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)), None)
            if uid:
                shares = [s for s in shares if any(sm.user_id == uid for sm in self.store.share_members if sm.share_id == s.id)]

            # Check entity_id filter
            eid = next((v for k, v in params.items() if "entity_id" in k and isinstance(v, UUID)), None)
            if eid:
                shares = [s for s in shares if any(sm.entity_id == eid for sm in self.store.share_members if sm.share_id == s.id)]

            for s in shares:
                s.members = [sm for sm in self.store.share_members if sm.share_id == s.id]
                for sm in s.members:
                    sm.profile = self.store.profiles.get(sm.user_id)

            res.scalars.return_value.all.return_value = shares
            res.scalars.return_value.unique.return_value.all.return_value = shares
            res.scalars.return_value.first.return_value = shares[0] if shares else None
            return res

        # Single ShareMember query
        if entities == [models.ShareMember] or any(cd.get("type") == models.ShareMember for cd in cds) or "share_members" in sql:
            share_id_param = next((v for k, v in params.items() if "share_id" in k), None)
            entity_ids = []
            for k, v in params.items():
                if "entity_id" in k:
                    if isinstance(v, (list, tuple, set)):
                        entity_ids.extend(v)
                    elif isinstance(v, UUID):
                        entity_ids.append(v)
            user_id_param = next((v for k, v in params.items() if "user_id" in k and isinstance(v, UUID)), None)
            owner_id_param = next((v for k, v in params.items() if "owner_id" in k and isinstance(v, UUID)), None)

            matched_sms = list(self.store.share_members)
            if share_id_param:
                if isinstance(share_id_param, (list, tuple, set)):
                    matched_sms = [sm for sm in matched_sms if sm.share_id in share_id_param]
                else:
                    matched_sms = [sm for sm in matched_sms if sm.share_id == share_id_param]
            if entity_ids:
                matched_sms = [sm for sm in matched_sms if sm.entity_id in entity_ids]
            if user_id_param:
                matched_sms = [sm for sm in matched_sms if sm.user_id == user_id_param]
            if owner_id_param:
                matched_sms = [sm for sm in matched_sms if any(s.id == sm.share_id and s.owner_id == owner_id_param for s in self.store.shares)]

            for sm in matched_sms:
                sm.profile = self.store.profiles.get(sm.user_id)
                sm.share = next((s for s in self.store.shares if s.id == sm.share_id), None)

            res.scalars.return_value.all.return_value = matched_sms
            res.scalars.return_value.first.return_value = matched_sms[0] if matched_sms else None
            return res

        return res


from sqlalchemy.exc import MissingGreenlet

_orig_budget_getattribute = models.MonthlyBudget.__getattribute__

def _monitored_budget_getattribute(self, name):
    if name in ("month_year", "name", "currency", "category_limits", "is_primary", "income_mode"):
        try:
            if object.__getattribute__(self, "_is_expired"):
                raise MissingGreenlet(f"greenlet_spawn has not been called; can't call await_only() here when accessing {name}")
        except AttributeError:
            pass
    return _orig_budget_getattribute(self, name)

models.MonthlyBudget.__getattribute__ = _monitored_budget_getattribute


class TestSharedBudgets(unittest.TestCase):

    def setUp(self):
        crud_budgets._schema_ensured = True
        self.store = InMemoryDB()
        self.db = FakeAsyncSession(self.store)

        self.user_a = uuid4()
        self.user_b = uuid4()

        self.store.add_user(self.user_a, "User Alpha", "alpha@example.com")
        self.store.add_user(self.user_b, "User Beta", "beta@example.com")
        self.store.add_connection(self.user_a, self.user_b, "accepted")

    def _setup_primary_budget(self, user_id: UUID, month_year: str, global_limit: Decimal, cats: dict[str, Decimal]):
        b = models.MonthlyBudget(
            id=uuid4(),
            user_id=user_id,
            month_year=month_year,
            name="Presupuesto Principal",
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=global_limit,
            effective_global_limit=global_limit,
            is_confirmed=True,
            is_primary=True,
            notified_month_start=True
        )
        b.category_limits = []
        self.db.add(b)
        for cat_name, limit_amt in cats.items():
            cl = models.BudgetCategoryLimit(
                id=uuid4(),
                budget_id=b.id,
                category_name=cat_name,
                limit_amount=limit_amt,
                currency="USD_BCV"
            )
            self.db.add(cl)
        return b

    def _setup_sub_budget(self, user_id: UUID, month_year: str, name: str, cat_names: list[str]):
        b = models.MonthlyBudget(
            id=uuid4(),
            user_id=user_id,
            month_year=month_year,
            name=name,
            currency="USD_BCV",
            income_mode="manual",
            manual_global_limit=None,
            effective_global_limit=None,
            is_confirmed=True,
            is_primary=False,
            notified_month_start=True
        )
        b.category_limits = []
        self.db.add(b)
        for cname in cat_names:
            cl = models.BudgetCategoryLimit(
                id=uuid4(),
                budget_id=b.id,
                category_name=cname,
                limit_amount=Decimal("0"),
                currency="USD_BCV"
            )
            self.db.add(cl)
        return b

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_01_sharing_primary_budget_raises_http_400(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        month_year = "2026-10"

        # 1. create_monthly_budget with is_primary=True and shared_with_ids
        payload_create = schemas.MonthlyBudgetCreate(
            name="Presupuesto Principal",
            is_primary=True,
            shared_with_ids=[self.user_b]
        )
        with self.assertRaises(HTTPException) as cm:
            await crud_budgets.create_monthly_budget(self.db, self.user_a, month_year, payload_create)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("El Presupuesto Principal no se puede compartir", cm.exception.detail)

        # 2. update_monthly_budget_by_id on an existing primary budget with shared_with_ids
        primary_b = self._setup_primary_budget(self.user_a, month_year, Decimal("1000"), {"Comida": Decimal("200")})
        payload_update = schemas.MonthlyBudgetUpdate(
            shared_with_ids=[self.user_b]
        )
        with self.assertRaises(HTTPException) as cm2:
            await crud_budgets.update_monthly_budget_by_id(self.db, self.user_a, primary_b.id, payload_update)
        self.assertEqual(cm2.exception.status_code, 400)
        self.assertIn("El Presupuesto Principal no se puede compartir", cm2.exception.detail)

        # 3. set_primary_monthly_budget on a shared sub-budget raises 400
        sub_b = self._setup_sub_budget(self.user_a, month_year, "Viaje", ["Comida"])
        share = await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_b,
            target_ids=[self.user_b],
            admin_ids=[]
        )
        with self.assertRaises(HTTPException) as cm3:
            await crud_budgets.set_primary_monthly_budget(self.db, self.user_a, sub_b.id)
        self.assertEqual(cm3.exception.status_code, 400)
        self.assertIn("El Presupuesto Principal no se puede compartir; deja de compartir este grupo", cm3.exception.detail)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_02_shared_sub_budget_read_only_with_inherited_limits_and_untouched_pana_totals(
        self, mock_notify, mock_rates
    ):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        month_year = "2026-10"

        # User A setup: Primary limit 1000, Comida: 200, Casa: 500
        owner_prim = self._setup_primary_budget(
            self.user_a, month_year, Decimal("1000"), {"Comida": Decimal("200"), "Casa": Decimal("500")}
        )
        # User A expenses: Comida $50, Casa $100 -> Total spent $150
        exp_a1 = models.Expense(
            id=uuid4(), user_id=self.user_a, category="Comida", amount=Decimal("50"), currency="USD_BCV",
            amount_usd=Decimal("50"), date=date(2026, 10, 5)
        )
        exp_a2 = models.Expense(
            id=uuid4(), user_id=self.user_a, category="Casa", amount=Decimal("100"), currency="USD_BCV",
            amount_usd=Decimal("100"), date=date(2026, 10, 10)
        )
        self.db.add(exp_a1)
        self.db.add(exp_a2)

        # User A creates Sub-budget "Viaje Mérida" (categories: Comida, Casa) shared with User B
        sub_a = self._setup_sub_budget(self.user_a, month_year, "Viaje Mérida", ["Comida", "Casa"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_a,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # User B setup: Primary limit 500, Comida: 300, Transporte: 200
        pana_prim = self._setup_primary_budget(
            self.user_b, month_year, Decimal("500"), {"Comida": Decimal("300"), "Transporte": Decimal("200")}
        )
        # User B expenses: Comida $20 -> Total spent $20
        exp_b1 = models.Expense(
            id=uuid4(), user_id=self.user_b, category="Comida", amount=Decimal("20"), currency="USD_BCV",
            amount_usd=Decimal("20"), date=date(2026, 10, 7)
        )
        self.db.add(exp_b1)

        # Pana (User B) calls get_monthly_budget_view
        pana_view = await crud_budgets.get_monthly_budget_view(self.db, self.user_b, month_year)

        # 1. Pana's own primary budget totals remain strictly untouched!
        self.assertEqual(len(pana_view.budgets), 1)
        self.assertTrue(pana_view.budgets[0].is_primary)
        self.assertEqual(pana_view.effective_global_limit, Decimal("500.00"))
        self.assertEqual(pana_view.total_spent_usd, Decimal("20.00"))
        self.assertEqual(pana_view.allocated_usd, Decimal("500.00"))  # 300 + 200

        # 2. Shared sub-budget appears in shared_with_me_budgets
        self.assertEqual(len(pana_view.shared_with_me_budgets), 1)
        shared_sb = pana_view.shared_with_me_budgets[0]

        self.assertEqual(shared_sb.name, "Viaje Mérida")
        self.assertTrue(shared_sb.is_shared)
        self.assertTrue(shared_sb.is_read_only)
        self.assertEqual(shared_sb.my_role, schemas.ShareRole.member)
        self.assertEqual(shared_sb.owner_id, self.user_a)
        self.assertEqual(shared_sb.shared_by, "User Alpha")

        # 3. Inherited category limits match User A's Primary Budget: Comida $200, Casa $500
        cat_limits_map = {cl.category_name: cl for cl in shared_sb.category_limits}
        self.assertIn("Comida", cat_limits_map)
        self.assertIn("Casa", cat_limits_map)
        self.assertEqual(cat_limits_map["Comida"].limit_amount, Decimal("200.00"))
        self.assertEqual(cat_limits_map["Casa"].limit_amount, Decimal("500.00"))

        # 4. Spending reflects User A's spending: Comida $50, Casa $100 -> Total $150
        self.assertEqual(cat_limits_map["Comida"].spent_amount, Decimal("50.00"))
        self.assertEqual(cat_limits_map["Casa"].spent_amount, Decimal("100.00"))
        self.assertEqual(shared_sb.total_spent_usd, Decimal("150.00"))

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_03_mutual_sharing_terminates_without_recursion(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        month_year = "2026-10"

        # User A has Primary + Sub-budget A1 shared with User B
        self._setup_primary_budget(self.user_a, month_year, Decimal("1000"), {"Comida": Decimal("200")})
        sub_a = self._setup_sub_budget(self.user_a, month_year, "Sub A1", ["Comida"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_a,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # User B has Primary + Sub-budget B1 shared with User A
        self._setup_primary_budget(self.user_b, month_year, Decimal("800"), {"Transporte": Decimal("150")})
        sub_b = self._setup_sub_budget(self.user_b, month_year, "Sub B1", ["Transporte"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_b,
            owner_entity=sub_b,
            target_ids=[self.user_a],
            admin_ids=[]
        )

        # Mutual queries must terminate cleanly without RecursionError!
        view_a = await crud_budgets.get_monthly_budget_view(self.db, self.user_a, month_year)
        self.assertEqual(len(view_a.budgets), 2)  # Primary + Sub A1
        self.assertEqual(len(view_a.shared_with_me_budgets), 1)  # Sub B1
        self.assertEqual(view_a.shared_with_me_budgets[0].name, "Sub B1")
        self.assertTrue(view_a.shared_with_me_budgets[0].is_read_only)

        view_b = await crud_budgets.get_monthly_budget_view(self.db, self.user_b, month_year)
        self.assertEqual(len(view_b.budgets), 2)  # Primary + Sub B1
        self.assertEqual(len(view_b.shared_with_me_budgets), 1)  # Sub A1
        self.assertEqual(view_b.shared_with_me_budgets[0].name, "Sub A1")
        self.assertTrue(view_b.shared_with_me_budgets[0].is_read_only)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_04_permissions_role_promotion_and_owner_preservation_on_leave(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        month_year = "2026-10"

        self._setup_primary_budget(self.user_a, month_year, Decimal("1000"), {"Comida": Decimal("200")})
        sub_a = self._setup_sub_budget(self.user_a, month_year, "Proyecto Alpha", ["Comida"])
        share = await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_a,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # 1. Non-owner User B cannot edit owner's sub-budget (returns 404)
        with self.assertRaises(HTTPException) as cm:
            await crud_budgets.update_monthly_budget_by_id(
                self.db, self.user_b, sub_a.id, schemas.MonthlyBudgetUpdate(name="Hack Name")
            )
        self.assertEqual(cm.exception.status_code, 404)

        # 2. Non-owner User B cannot delete owner's sub-budget (returns 404)
        with self.assertRaises(HTTPException) as cm2:
            await crud_budgets.delete_monthly_budget_by_id(self.db, self.user_b, sub_a.id)
        self.assertEqual(cm2.exception.status_code, 404)

        # 3. Role promotion to admin raises 400 for sub_budget
        member_a = next(m for m in self.store.share_members if m.user_id == self.user_a)
        member_b = next(m for m in self.store.share_members if m.user_id == self.user_b)
        with self.assertRaises(HTTPException) as cm3:
            sharing.assert_can_change_role(share, member_a, member_b, "admin")
        self.assertEqual(cm3.exception.status_code, 400)
        self.assertIn("Los sub-presupuestos compartidos son de solo lectura", cm3.exception.detail)

        # 4. When User B leaves via remove_member, sub_budget.user_id remains User A
        await sharing.remove_member(self.db, share, self.user_b)
        self.assertEqual(sub_a.user_id, self.user_a)

        # 5. When User A leaves (or share deleted), sub_budget.user_id remains User A (never transferred)
        share2 = await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_a,
            target_ids=[self.user_b],
            admin_ids=[]
        )
        await sharing.remove_member(self.db, share2, self.user_a)
        self.assertEqual(sub_a.user_id, self.user_a)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_05_month_rollover_rebinds_share_member_entity_id(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        oct_month = "2026-10"
        nov_month = "2026-11"

        # Setup October: Primary Budget + Sub-Budget "Mercado"
        self._setup_primary_budget(self.user_a, oct_month, Decimal("1000"), {"Comida": Decimal("300")})
        oct_sub = self._setup_sub_budget(self.user_a, oct_month, "Mercado", ["Comida"])
        oct_sub_id = oct_sub.id

        share = await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=oct_sub,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        sm_owner = next(m for m in self.store.share_members if m.user_id == self.user_a)
        sm_pana = next(m for m in self.store.share_members if m.user_id == self.user_b)
        self.assertEqual(sm_owner.entity_id, oct_sub_id)
        self.assertEqual(sm_pana.entity_id, oct_sub_id)

        # Rollover to November 2026 for User A
        cloned_nov = await crud_budgets.get_or_clone_monthly_budgets(self.db, self.user_a, nov_month)
        nov_sub = next(b for b in cloned_nov if not b.is_primary and b.name == "Mercado")
        self.assertNotEqual(nov_sub.id, oct_sub_id)

        # ShareMember entity_id MUST be rebound to nov_sub.id
        self.assertEqual(sm_owner.entity_id, nov_sub.id)
        self.assertEqual(sm_pana.entity_id, nov_sub.id)

        # Pana (User B) view in November reflects the shared sub-budget for November
        self._setup_primary_budget(self.user_b, nov_month, Decimal("500"), {"Comida": Decimal("200")})

        pana_nov_view = await crud_budgets.get_monthly_budget_view(self.db, self.user_b, nov_month)
        self.assertEqual(len(pana_nov_view.shared_with_me_budgets), 1)
        self.assertEqual(pana_nov_view.shared_with_me_budgets[0].id, nov_sub.id)
        self.assertEqual(pana_nov_view.shared_with_me_budgets[0].month_year, nov_month)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_06_connections_overview_and_detail_integration(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        now = datetime.now(timezone.utc)
        current_month = f"{now.year}-{now.month:02d}"

        # Setup primary & sub-budget for current month
        self._setup_primary_budget(self.user_a, current_month, Decimal("1000"), {"Comida": Decimal("300")})
        sub_a = self._setup_sub_budget(self.user_a, current_month, "Compartido Casa", ["Comida"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=sub_a,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # 1. get_panas_overview shows shared_sub_budgets_count
        overview = await crud_connections.get_panas_overview(self.db, self.user_a)
        self.assertEqual(len(overview.panas), 1)
        self.assertEqual(overview.panas[0].shared_sub_budgets_count, 1)

        # 2. get_pana_details returns SharedSubBudgetBrief
        detail = await crud_connections.get_pana_details(self.db, self.user_a, self.user_b)
        self.assertIsNotNone(detail)
        self.assertEqual(len(detail.shared_sub_budgets), 1)
        brief = detail.shared_sub_budgets[0]
        self.assertEqual(brief.name, "Compartido Casa")
        self.assertTrue(brief.is_mine)
        self.assertEqual(brief.owner_name, "Tú")
        self.assertEqual(brief.members_count, 2)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_07_add_pana_to_existing_sub_budget_via_update_succeeds(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        month_year = "2026-10"

        # 1. User A creates primary and sub-budget WITHOUT Panas (shared_with_ids=None)
        self._setup_primary_budget(self.user_a, month_year, Decimal("1000"), {"Comida": Decimal("200")})
        sub_a = self._setup_sub_budget(self.user_a, month_year, "Salidas", ["Comida"])

        initial_view = await crud_budgets.get_monthly_budget_view(self.db, self.user_a, month_year)
        sb_initial = next(b for b in initial_view.budgets if b.id == sub_a.id)
        self.assertFalse(sb_initial.is_shared)

        # 2. Update sub-budget to add User B as Pana (shared_with_ids=[self.user_b])
        update_payload = schemas.MonthlyBudgetUpdate(
            shared_with_ids=[self.user_b]
        )
        updated_view = await crud_budgets.update_monthly_budget_by_id(
            self.db, self.user_a, sub_a.id, update_payload
        )

        # Verify: succeeds without MissingGreenlet and returns is_shared=True with both members
        sb_updated = next(b for b in updated_view.budgets if b.id == sub_a.id)
        self.assertTrue(sb_updated.is_shared)
        self.assertEqual(len(sb_updated.shared_members), 2)
        member_ids = {m.user_id for m in sb_updated.shared_members}
        self.assertEqual(member_ids, {self.user_a, self.user_b})
        self.assertEqual(sb_updated.my_role, schemas.ShareRole.admin)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_08_update_cloned_sub_budget_in_new_month_adds_second_pana(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        oct_month = "2026-10"
        nov_month = "2026-11"

        # User C
        user_c = uuid4()
        self.store.add_user(user_c, "User Charlie", "charlie@example.com")
        self.store.add_connection(self.user_a, user_c, "accepted")

        # In October, User A has primary & sub-budget "Viaje" shared with User B
        self._setup_primary_budget(self.user_a, oct_month, Decimal("1000"), {"Comida": Decimal("200")})
        oct_sub = self._setup_sub_budget(self.user_a, oct_month, "Viaje", ["Comida"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=oct_sub,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # User A advances to November: cloned sub-budget created
        cloned_nov = await crud_budgets.get_or_clone_monthly_budgets(self.db, self.user_a, nov_month)
        nov_sub = next(b for b in cloned_nov if not b.is_primary and b.name == "Viaje")
        self.assertNotEqual(nov_sub.id, oct_sub.id)

        # User A updates the cloned sub-budget to add User C (now [user_b, user_c])
        update_payload = schemas.MonthlyBudgetUpdate(
            shared_with_ids=[self.user_b, user_c]
        )
        updated_view = await crud_budgets.update_monthly_budget_by_id(
            self.db, self.user_a, nov_sub.id, update_payload
        )

        # Verify only 1 Share object exists for this sub-budget
        sub_shares = [s for s in self.store.shares if s.entity_type == "sub_budget"]
        self.assertEqual(len(sub_shares), 1)

        # Verify members: User A, User B, User C
        share_mems = [sm for sm in self.store.share_members if sm.share_id == sub_shares[0].id]
        self.assertEqual(len(share_mems), 3)
        self.assertEqual({sm.user_id for sm in share_mems}, {self.user_a, self.user_b, user_c})
        for sm in share_mems:
            self.assertEqual(sm.entity_id, nov_sub.id)

        # Verify view response
        nov_sb_view = next(b for b in updated_view.budgets if b.id == nov_sub.id)
        self.assertTrue(nov_sb_view.is_shared)
        self.assertEqual(len(nov_sb_view.shared_members), 3)

    @sync_run
    @patch("app.crud_budgets.bcv_service.get_all_rates", new_callable=AsyncMock)
    @patch("app.crud_budgets.send_notification_to_user", new_callable=AsyncMock)
    async def test_09_nested_auto_clone_when_pana_views_uninitialized_month(self, mock_notify, mock_rates):
        mock_rates.return_value = {"usd_bs": Decimal("50"), "eur_bs": Decimal("55"), "usdt_bs": Decimal("60")}
        oct_month = "2026-10"
        nov_month = "2026-11"

        # User A has primary & sub-budget "Paseo" in October shared with User B
        self._setup_primary_budget(self.user_a, oct_month, Decimal("1000"), {"Comida": Decimal("200")})
        oct_sub = self._setup_sub_budget(self.user_a, oct_month, "Paseo", ["Comida"])
        await sharing.create_share(
            db=self.db,
            entity_type="sub_budget",
            owner_id=self.user_a,
            owner_entity=oct_sub,
            target_ids=[self.user_b],
            admin_ids=[]
        )

        # User B has primary budget in October
        self._setup_primary_budget(self.user_b, oct_month, Decimal("800"), {"Comida": Decimal("150")})

        # Neither User A nor User B has initialized November 2026!
        # Now User B requests monthly budget view for November 2026:
        pana_view = await crud_budgets.get_monthly_budget_view(self.db, self.user_b, nov_month)

        # Verify succeeds without MissingGreenlet
        self.assertIsNotNone(pana_view)
        self.assertEqual(len(pana_view.shared_with_me_budgets), 1)
        shared_sb = pana_view.shared_with_me_budgets[0]
        self.assertEqual(shared_sb.name, "Paseo")
        self.assertEqual(shared_sb.month_year, nov_month)
        self.assertTrue(shared_sb.is_shared)
        self.assertTrue(shared_sb.is_read_only)

        # Verify NO synthetic "Sin Categoría" row was persisted into category_limits
        persisted_cats = [cl.category_name for cl in self.store.category_limits]
        self.assertNotIn("Sin Categoría", persisted_cats)
        for cl in self.store.category_limits:
            self.assertNotEqual(cl.category_name.strip().lower(), "sin categoría")


if __name__ == "__main__":
    unittest.main()
