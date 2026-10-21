"""
Módulo centralizado de manejo de zona horaria para GastosApp.
Venezuela opera en America/Caracas (UTC-4, sin horario de verano / DST).
Este módulo previene que los servidores en la nube (que operan en UTC) cambien de mes
o de fecha 4 horas antes de tiempo (a las 8:00 PM hora de Caracas).
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

VET_TZ = ZoneInfo("America/Caracas")

def vet_now() -> datetime:
    """Retorna el datetime actual consciente en la zona horaria de Venezuela."""
    return datetime.now(VET_TZ)

def vet_today() -> date:
    """Retorna la fecha actual en la zona horaria de Venezuela."""
    return datetime.now(VET_TZ).date()

def current_month_year_vet() -> str:
    """Retorna el string 'YYYY-MM' correspondiente al mes actual en Venezuela."""
    return datetime.now(VET_TZ).strftime("%Y-%m")
