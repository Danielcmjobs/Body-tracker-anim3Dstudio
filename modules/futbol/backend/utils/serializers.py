"""
Utilidades de serializacion.
"""

from decimal import Decimal


# Convierte valores a float seguro para JSON/DB.
def normalizar_float(valor):
    if valor is None:
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None
