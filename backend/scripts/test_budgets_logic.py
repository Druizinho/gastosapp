import asyncio
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app import crud_budgets, models, schemas

def test_currency_conversions():
    print("Testing currency conversions...")
    rates = {
        "usd_bs": Decimal("40.0"),
        "eur_bs": Decimal("44.0"),
        "usdt_bs": Decimal("48.0")
    }

    # 1. Short circuit same currency
    res = crud_budgets._convert_value_between_currencies(Decimal("100"), "USD_BCV", "USD_BCV", rates)
    assert res == Decimal("100"), f"Expected 100, got {res}"

    # 2. USD_BCV vs USD_CASH (should NOT be equal!)
    bcv_in_bs = crud_budgets._convert_value_between_currencies(Decimal("10"), "USD_BCV", "BS", rates)
    assert bcv_in_bs == Decimal("400"), f"Expected 400, got {bcv_in_bs}"

    cash_in_bs = crud_budgets._convert_value_between_currencies(Decimal("10"), "USD_CASH", "BS", rates)
    assert cash_in_bs == Decimal("480"), f"Expected 480, got {cash_in_bs}"

    # 3. Guard against 0 or None rates
    bad_rates = {"usd_bs": None, "eur_bs": Decimal("0"), "usdt_bs": None}
    safe_conv = crud_budgets._convert_value_between_currencies(Decimal("50"), "USD_BCV", "BS", bad_rates)
    assert safe_conv == Decimal("50"), f"Expected 50 on fallback, got {safe_conv}"

    # 4. _expense_amount_in_currency with mock expense
    class MockExpense:
        currency = "USD_CASH"
        amount = Decimal("20")
        amount_usd = Decimal("20")
        amount_eur = None
        amount_bs = Decimal("960")
        amount_usdt = Decimal("20")

    exp = MockExpense()
    # When target is USD_CASH
    exp_in_cash = crud_budgets._expense_amount_in_currency(exp, "USD_CASH", rates)
    assert exp_in_cash == Decimal("20")

    # When target is USD_BCV, it uses exp.amount_usd
    exp_in_bcv = crud_budgets._expense_amount_in_currency(exp, "USD_BCV", rates)
    assert exp_in_bcv == Decimal("20")

    # When target is USDT, uses amount_usdt
    exp_in_usdt = crud_budgets._expense_amount_in_currency(exp, "USDT", rates)
    assert exp_in_usdt == Decimal("20")

    print("All currency conversion tests passed!")

if __name__ == "__main__":
    test_currency_conversions()
