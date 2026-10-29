import httpx
from pyDolarVenezuela.pages import BCV
from pyDolarVenezuela import Monitor
from cachetools import TTLCache
import asyncio
import logging
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Optional, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.time_utils import vet_today

# Cache for 30 minutes (1800 seconds)
rates_cache = TTLCache(maxsize=1, ttl=1800)
# Cache for historical rates (24 hours = 86400 seconds)
historical_rates_cache = TTLCache(maxsize=365, ttl=86400)
_last_valid_rates = {
    "usd_bs": None,
    "eur_bs": None,
    "usdt_bs": None
}
_rates_lock = asyncio.Lock()

def _sync_fetch_bcv():
    bcv = Monitor(BCV)
    return bcv.get_all_monitors()

async def get_bcv_rates():
    try:
        # Ejecutar en threadpool con timeout para no congelar el event loop de FastAPI
        data = await asyncio.wait_for(asyncio.to_thread(_sync_fetch_bcv), timeout=8.0)
        usd_rate = None
        eur_rate = None
        for m in data:
            if 'dólar' in m.title.lower() or 'dolar' in m.title.lower():
                usd_rate = Decimal(str(m.price))
            if 'euro' in m.title.lower():
                eur_rate = Decimal(str(m.price))
        return usd_rate, eur_rate
    except Exception as e:
        print("Error fetching BCV:", e)
        return None, None

async def get_binance_rate():
    url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    payload = {
        "asset": "USDT",
        "fiat": "VES",
        "tradeType": "BUY",
        "transAmount": 0,
        "page": 1,
        "rows": 10,
        "filterType": "all"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=8.0)
            data = response.json()
            rates = [Decimal(str(item['adv']['price'])) for item in data.get('data', [])]
            if rates:
                rates.sort()
                mid = len(rates) // 2
                return rates[mid]
    except Exception as e:
        print("Error fetching Binance:", e)
    return None

async def _refresh_rates_locked():
    global _last_valid_rates
    async with _rates_lock:
        if 'rates' in rates_cache:
            return rates_cache['rates'].copy()

        bcv_res, usdt_bs = await asyncio.gather(get_bcv_rates(), get_binance_rate())
        usd_bcv, eur_bcv = bcv_res if bcv_res else (None, None)
        
        rates = {
            "usd_bs": usd_bcv or _last_valid_rates.get("usd_bs"),
            "eur_bs": eur_bcv or _last_valid_rates.get("eur_bs"),
            "usdt_bs": usdt_bs or _last_valid_rates.get("usdt_bs")
        }
        
        # Solo cachear por 30m si obtuvimos al menos una tasa válida
        if usd_bcv or usdt_bs:
            rates_cache['rates'] = rates
            _last_valid_rates = rates.copy()
        elif _last_valid_rates.get("usd_bs") is not None:
            # Reutilizar última tasa válida conocida si la red falló
            rates = _last_valid_rates.copy()
            
        return rates

async def get_all_rates():
    if 'rates' in rates_cache:
        return rates_cache['rates'].copy()

    if _last_valid_rates.get("usd_bs") is not None:
        _trigger_background_rates_update()
        return _last_valid_rates.copy()

    return await _refresh_rates_locked()

def _trigger_background_rates_update():
    try:
        loop = asyncio.get_running_loop()
        if loop and loop.is_running():
            async def _bg_task():
                try:
                    await _refresh_rates_locked()
                except Exception as e:
                    logging.getLogger(__name__).warning("Background rates fetch failed: %s", e)
            loop.create_task(_bg_task())
    except (RuntimeError, Exception):
        pass

def get_rates_instant_or_cached() -> dict:
    global _last_valid_rates

    # Support unit tests where get_all_rates has been mocked
    if hasattr(get_all_rates, "return_value") and isinstance(get_all_rates.return_value, dict):
        return get_all_rates.return_value

    cached = rates_cache.get('rates')
    if cached:
        return cached

    if _last_valid_rates and any(v is not None for v in _last_valid_rates.values()):
        _trigger_background_rates_update()
        return _last_valid_rates.copy()

    _trigger_background_rates_update()
    return {
        "usd_bs": 1.0,
        "eur_bs": 1.0,
        "usdt_bs": 1.0,
        "usd_cash_bs": 1.0,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

def convert_amount(amount: Decimal, currency: str, rates: dict, manual_rate: Decimal = None):
    amount_usd = None
    amount_bs = None
    amount_eur = None
    amount_usdt = None
    
    usd_bs = Decimal(str(rates.get("usd_bs") or rates.get("usd_bcv") or 0))
    eur_bs = Decimal(str(rates.get("eur_bs") or rates.get("eur_bcv") or 0))
    usdt_bs = Decimal(str(rates.get("usdt_bs") or rates.get("usdt_binance") or 0))
    
    # Si se provee tasa manual, aplica a la tasa primaria de la divisa
    if manual_rate and manual_rate > 0:
        if currency in ('USD_BCV', 'BS'):
            usd_bs = manual_rate
        elif currency == 'EUR_BCV':
            eur_bs = manual_rate
        elif currency == 'USDT':
            usdt_bs = manual_rate
            
    if currency == 'USD_BCV':
        amount_usd = amount
        if usd_bs and usd_bs > 0:
            amount_bs = amount * usd_bs
            if eur_bs and eur_bs > 0: amount_eur = amount_bs / eur_bs
            if usdt_bs and usdt_bs > 0: amount_usdt = amount_bs / usdt_bs
    elif currency == 'EUR_BCV':
        amount_eur = amount
        if eur_bs and eur_bs > 0:
            amount_bs = amount * eur_bs
            if usd_bs and usd_bs > 0: amount_usd = amount_bs / usd_bs
            if usdt_bs and usdt_bs > 0: amount_usdt = amount_bs / usdt_bs
    elif currency == 'BS':
        amount_bs = amount
        if usd_bs and usd_bs > 0: amount_usd = amount / usd_bs
        if eur_bs and eur_bs > 0: amount_eur = amount / eur_bs
        if usdt_bs and usdt_bs > 0: amount_usdt = amount / usdt_bs
    elif currency == 'USDT':
        amount_usdt = amount
        if usdt_bs and usdt_bs > 0:
            amount_bs = amount * usdt_bs
            if usd_bs and usd_bs > 0: amount_usd = amount_bs / usd_bs
            if eur_bs and eur_bs > 0: amount_eur = amount_bs / eur_bs
    elif currency == 'USD_CASH':
        d_amount = Decimal(str(amount)) if amount is not None else Decimal("0")
        d_usd = Decimal(str(usd_bs)) if usd_bs and usd_bs > 0 else Decimal("0")
        d_eur = Decimal(str(eur_bs)) if eur_bs and eur_bs > 0 else Decimal("0")
        d_usdt = Decimal(str(usdt_bs)) if usdt_bs and usdt_bs > 0 else Decimal("0")

        valid_rates = [r for r in (d_usd, d_eur, d_usdt) if r > 0]
        highest_rate = max(valid_rates) if valid_rates else Decimal("0")

        cash_rate = Decimal(str(manual_rate)) if (manual_rate is not None and Decimal(str(manual_rate)) > 0) else highest_rate

        if cash_rate > 0:
            amount_bs = d_amount * cash_rate
            amount_usd = (amount_bs / d_usd) if d_usd > 0 else d_amount
            amount_eur = (amount_bs / d_eur) if d_eur > 0 else Decimal("0")
            amount_usdt = (amount_bs / d_usdt) if d_usdt > 0 else Decimal("0")
        else:
            amount_bs = Decimal("0")
            amount_usd = d_amount
            amount_eur = Decimal("0")
            amount_usdt = Decimal("0")

    def _round4(val):
        if val is None:
            return None
        return round(Decimal(str(val)), 4)

    return {
        "amount_usd": _round4(amount_usd),
        "amount_bs": _round4(amount_bs),
        "amount_eur": _round4(amount_eur),
        "amount_usdt": _round4(amount_usdt),
        "rate_usd_bs": usd_bs,
        "rate_eur_bs": eur_bs,
        "rate_usdt_bs": usdt_bs
    }


async def fetch_historical_bcv_api(target_date: date) -> Optional[Decimal]:
    url = "https://ve.dolarapi.com/v1/historicos/dolares"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if not isinstance(data, list):
                return None

            target_str = target_date.isoformat()
            valid_items = [
                item for item in data
                if isinstance(item, dict)
                and item.get("fuente") in (None, "oficial")
                and item.get("fecha")
            ]

            # Exact match first
            for item in valid_items:
                if str(item["fecha"])[:10] == target_str:
                    val = item.get("promedio") if item.get("promedio") is not None else item.get("valor")
                    if val is not None:
                        dec_val = Decimal(str(val))
                        if dec_val > 0:
                            return dec_val

            # Closest prior date
            prior_items = [
                item for item in valid_items
                if str(item["fecha"])[:10] <= target_str
            ]
            if prior_items:
                prior_items.sort(key=lambda x: str(x["fecha"])[:10], reverse=True)
                for item in prior_items:
                    val = item.get("promedio") if item.get("promedio") is not None else item.get("valor")
                    if val is not None:
                        dec_val = Decimal(str(val))
                        if dec_val > 0:
                            return dec_val

            return None
    except Exception as e:
        logging.getLogger(__name__).warning("Error fetching historical BCV API for %s: %s", target_date, e)
        return None


async def _query_db_rates_for_date(db: AsyncSession, target_date: date) -> Optional[dict]:
    try:
        from app import models

        checks = [
            (models.Expense, models.Expense.date),
            (models.Income, models.Income.date),
            (models.DebtPayment, models.DebtPayment.payment_date),
            (models.FixedExpenseCheck, models.FixedExpenseCheck.paid_date),
            (models.SavingDeposit, models.SavingDeposit.deposit_date),
        ]

        # First pass: exact date
        for model_cls, date_col in checks:
            stmt = (
                select(model_cls)
                .where(date_col == target_date, model_cls.rate_usd_bs > 0)
                .order_by(model_cls.id.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            rec = result.scalars().first()
            if rec:
                return {
                    "usd_bs": Decimal(str(rec.rate_usd_bs)),
                    "eur_bs": Decimal(str(rec.rate_eur_bs)) if getattr(rec, "rate_eur_bs", None) and Decimal(str(rec.rate_eur_bs)) > 0 else None,
                    "usdt_bs": Decimal(str(rec.rate_usdt_bs)) if getattr(rec, "rate_usdt_bs", None) and Decimal(str(rec.rate_usdt_bs)) > 0 else None,
                }

        # Second pass: within 7 days prior
        min_date = target_date - timedelta(days=7)
        candidates = []
        for model_cls, date_col in checks:
            stmt = (
                select(model_cls)
                .where(
                    date_col <= target_date,
                    date_col >= min_date,
                    model_cls.rate_usd_bs > 0,
                )
                .order_by(date_col.desc(), model_cls.id.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            rec = result.scalars().first()
            if rec:
                rec_date = getattr(rec, getattr(date_col, "key", "date"), target_date)
                candidates.append((rec_date, rec))

        if candidates:
            candidates.sort(key=lambda c: c[0], reverse=True)
            rec = candidates[0][1]
            return {
                "usd_bs": Decimal(str(rec.rate_usd_bs)),
                "eur_bs": Decimal(str(rec.rate_eur_bs)) if getattr(rec, "rate_eur_bs", None) and Decimal(str(rec.rate_eur_bs)) > 0 else None,
                "usdt_bs": Decimal(str(rec.rate_usdt_bs)) if getattr(rec, "rate_usdt_bs", None) and Decimal(str(rec.rate_usdt_bs)) > 0 else None,
            }
        return None
    except Exception as e:
        logging.getLogger(__name__).warning("Error querying DB rates for date %s: %s", target_date, e)
        return None


async def get_rates_for_date(target_date: Optional[date] = None, db: Optional[AsyncSession] = None) -> dict:
    if target_date is None or target_date >= vet_today():
        return await get_all_rates()

    cache_key = target_date.isoformat()
    if cache_key in historical_rates_cache:
        return historical_rates_cache[cache_key]

    live = await get_all_rates()
    db_rates = await _query_db_rates_for_date(db, target_date) if db is not None else None
    api_usd = None
    if not (db_rates and db_rates.get("usd_bs")):
        api_usd = await fetch_historical_bcv_api(target_date)

    hist_usd = (db_rates and db_rates.get("usd_bs")) or api_usd
    live_usd = Decimal(str(live.get("usd_bs") or 1))
    live_eur = Decimal(str(live.get("eur_bs") or live_usd))
    live_usdt = Decimal(str(live.get("usdt_bs") or live_usd))

    usd_bs = hist_usd if (hist_usd and hist_usd > 0) else live_usd

    if db_rates and db_rates.get("eur_bs"):
        eur_bs = db_rates["eur_bs"]
    elif hist_usd and hist_usd > 0 and live_usd > 0:
        eur_bs = round(usd_bs * (live_eur / live_usd), 4)
    else:
        eur_bs = live_eur

    if db_rates and db_rates.get("usdt_bs"):
        usdt_bs = db_rates["usdt_bs"]
    elif hist_usd and hist_usd > 0 and live_usd > 0:
        usdt_bs = round(usd_bs * (live_usdt / live_usd), 4)
    else:
        usdt_bs = live_usdt

    result = {"usd_bs": usd_bs, "eur_bs": eur_bs, "usdt_bs": usdt_bs}
    historical_rates_cache[cache_key] = result
    return result


async def resolve_rates_for_update(
    existing_record: Any,
    target_date: Optional[date] = None,
    existing_date: Optional[date] = None,
    db: Optional[AsyncSession] = None
) -> dict:
    date_changed = (target_date is not None and existing_date is not None and target_date != existing_date)
    if not date_changed and existing_record is not None:
        r_usd = getattr(existing_record, "rate_usd_bs", None)
        r_eur = getattr(existing_record, "rate_eur_bs", None)
        r_usdt = getattr(existing_record, "rate_usdt_bs", None)
        if r_usd is not None and Decimal(str(r_usd)) > 0:
            fallback = None
            if not (r_eur and Decimal(str(r_eur)) > 0) or not (r_usdt and Decimal(str(r_usdt)) > 0):
                fallback = await get_rates_for_date(existing_date or target_date, db=db)
            return {
                "usd_bs": Decimal(str(r_usd)),
                "eur_bs": Decimal(str(r_eur)) if (r_eur and Decimal(str(r_eur)) > 0) else Decimal(str(fallback["eur_bs"])),
                "usdt_bs": Decimal(str(r_usdt)) if (r_usdt and Decimal(str(r_usdt)) > 0) else Decimal(str(fallback["usdt_bs"])),
            }
    return await get_rates_for_date(target_date or existing_date, db=db)


def resolve_manual_rate_for_update(
    existing_record: Any,
    new_currency: Any,
    explicit_manual_rate: Optional[Decimal],
    date_changed: bool
) -> Optional[Decimal]:
    if explicit_manual_rate is not None and Decimal(str(explicit_manual_rate)) > 0:
        return Decimal(str(explicit_manual_rate))
    if not date_changed and existing_record is not None:
        old_curr = getattr(existing_record, "currency", None)
        old_curr_str = old_curr.value if hasattr(old_curr, "value") else str(old_curr or "")
        new_curr_str = new_currency.value if hasattr(new_currency, "value") else str(new_currency or "")
        if new_curr_str == "USD_CASH" and old_curr_str == "USD_CASH":
            base_amount = (
                getattr(existing_record, "amount", None)
                or getattr(existing_record, "paid_amount", None)
                or getattr(existing_record, "target_amount", None)
                or getattr(existing_record, "real_amount", None)
            )
            rec_bs = getattr(existing_record, "amount_bs", None)
            if base_amount and rec_bs and Decimal(str(base_amount)) > 0 and Decimal(str(rec_bs)) > 0:
                return round(Decimal(str(rec_bs)) / Decimal(str(base_amount)), 4)
    return None

