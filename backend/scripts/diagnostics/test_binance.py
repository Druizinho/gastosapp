import httpx
import asyncio

async def get_binance_p2p_rate():
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
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        data = response.json()
        rates = [float(item['adv']['price']) for item in data.get('data', [])]
        print("Rates:", rates)
        if rates:
            return sum(rates) / len(rates)
        return None

if __name__ == "__main__":
    rate = asyncio.run(get_binance_p2p_rate())
    print("Avg Binance Rate:", rate)
