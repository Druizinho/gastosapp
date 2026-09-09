import httpx
from pyDolarVenezuela.pages import BCV
from pyDolarVenezuela import Monitor
from cachetools import TTLCache
import asyncio
from decimal import Decimal

# Cache for 30 minutes (1800 seconds)
rates_cache = TTLCache(maxsize=1, ttl=1800)

async def get_bcv_rates():
    try:
        # PyDolarVenezuela is synchronous but we can run it here
        bcv = Monitor(BCV)
        data = bcv.get_all_monitors()
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
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            data = response.json()
            rates = [Decimal(str(item['adv']['price'])) for item in data.get('data', [])]
            if rates:
                return sum(rates) / len(rates)
    except Exception as e:
        print("Error fetching Binance:", e)
    return None

async def get_all_rates():
    if 'rates' in rates_cache:
        return rates_cache['rates']
    
    usd_bcv, eur_bcv = await get_bcv_rates()
    usdt_binance = await get_binance_rate()
    
    rates = {
        "usd_bs": usd_bcv,
        "eur_bs": eur_bcv,
        "usdt_bs": usdt_binance
    }
    rates_cache['rates'] = rates
    return rates

def convert_amount(amount: Decimal, currency: str, rates: dict, manual_rate: Decimal = None):
    amount_usd = None
    amount_bs = None
    amount_eur = None
    amount_usdt = None
    
    usd_bs = rates.get("usd_bs")
    eur_bs = rates.get("eur_bs")
    usdt_bs = rates.get("usdt_bs")
    
    if manual_rate:
        if not usd_bs: usd_bs = manual_rate
        if not usdt_bs: usdt_bs = manual_rate
        if not eur_bs: eur_bs = manual_rate * Decimal('1.05')
        
    if currency == 'BS_USD':
        amount_bs = amount
        if usd_bs: amount_usd = amount / usd_bs
        if eur_bs: amount_eur = amount / eur_bs
        if usdt_bs: amount_usdt = amount / usdt_bs
    elif currency == 'BS_EUR':
        amount_bs = amount
        if eur_bs: amount_eur = amount / eur_bs
        if usd_bs: amount_usd = amount / usd_bs
        if usdt_bs: amount_usdt = amount / usdt_bs
    elif currency == 'USDT':
        amount_usdt = amount
        if usdt_bs:
            amount_bs = amount * usdt_bs
            if usd_bs: amount_usd = amount_bs / usd_bs
            if eur_bs: amount_eur = amount_bs / eur_bs
    elif currency == 'USD_CASH':
        amount_usd = amount
        if usd_bs:
            amount_bs = amount * usd_bs
            if eur_bs: amount_eur = amount_bs / eur_bs
            if usdt_bs: amount_usdt = amount_bs / usdt_bs

    return {
        "amount_usd": amount_usd,
        "amount_bs": amount_bs,
        "amount_eur": amount_eur,
        "amount_usdt": amount_usdt,
        "rate_usd_bs": usd_bs,
        "rate_eur_bs": eur_bs,
        "rate_usdt_bs": usdt_bs
    }
