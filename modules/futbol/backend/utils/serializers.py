"""
Utilidades de serializacion.
"""

from decimal import Decimal


def normalizar_float(valor):
    if valor is None:
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None
