from pyDolarVenezuela.pages import BCV, ExchangeMonitor, CriptoDolar
from pyDolarVenezuela import Monitor

bcv = Monitor(BCV)
bcv_data = bcv.get_value_monitors()
print("BCV Data:", bcv_data)

try:
    ex = Monitor(ExchangeMonitor)
    ex_data = ex.get_value_monitors()
    print("ExchangeMonitor keys:", list(ex_data.keys()) if isinstance(ex_data, dict) else ex_data)
    if isinstance(ex_data, dict) and 'binance' in ex_data:
        print("Binance rate:", ex_data['binance'])
except Exception as e:
    print("ExchangeMonitor failed:", e)
    
try:
    cripto = Monitor(CriptoDolar)
    cr_data = cripto.get_value_monitors()
    print("CriptoDolar keys:", list(cr_data.keys()) if isinstance(cr_data, dict) else cr_data)
    if isinstance(cr_data, dict) and 'binance' in cr_data:
        print("Binance rate:", cr_data['binance'])
except Exception as e:
    print("CriptoDolar failed:", e)

