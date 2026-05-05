"""
SERVICIO — Analítica avanzada del rendimiento de golpeo.

- Detección de fatiga intra-sesión (ventana de 2h) basada en velocidad del pie.
- Tendencia histórica con regresión lineal.
- Comparativa de últimas N patadas.
"""

from __future__ import annotations

import math

from utils.session_utils import to_datetime, agrupar_sesiones


CAIDA_SIGNIFICATIVA_PCT = 10.0
UMBRAL_ESTANCADO_MS_SEMANA = 0.05  # m/s/semana


def _regresion_lineal(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    n = len(xs)
    if n == 0:
        return 0.0, 0.0, 0.0
    if n == 1:
        return 0.0, float(ys[0]), 1.0

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)

    if den == 0:
        pendiente = 0.0
        intercepto = mean_y
    else:
        pendiente = num / den
        intercepto = mean_y - pendiente * mean_x

    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (pendiente * x + intercepto)) ** 2 for x, y in zip(xs, ys))
    if ss_tot == 0:
        r2 = 1.0 if ss_res == 0 else 0.0
    else:
        r2 = max(0.0, min(1.0, 1.0 - ss_res / ss_tot))

    return float(pendiente), float(intercepto), float(r2)


def _valor_metrica(g: dict, metrica: str) -> float | None:
    if metrica == "velocidad_pie_ms":
        v = g.get("velocidad_pie_ms")
    else:
        v = g.get(metrica)
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    return v


def calcular_fatiga_intra_sesion(
    golpeos_ordenados: list[dict],
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Analiza la sesión más reciente (separación máx 2h entre golpeos).
    Calcula pendiente y caída porcentual de la métrica seleccionada.
    """
    base = {
        "pendiente": 0.0,
        "numero_golpeos": 0,
        "caida_porcentual": 0.0,
        "fatiga_significativa": False,
        "metrica": metrica,
        "sesion": None,
    }

    if not golpeos_ordenados:
        return base

    sesiones = agrupar_sesiones(golpeos_ordenados, campo_fecha="fecha_golpeo")
    if not sesiones:
        return base

    sesion = sesiones[-1]
    valores: list[float] = []
    for g in sesion:
        v = _valor_metrica(g, metrica)
        if v is not None:
            valores.append(v)

    if len(valores) < 2:
        return {**base, "numero_golpeos": len(valores)}

    xs = [float(i) for i in range(len(valores))]
    pendiente, _, _ = _regresion_lineal(xs, valores)

    primero = valores[0]
    ultimo = valores[-1]
    caida_pct = ((primero - ultimo) / primero) * 100.0 if primero > 0 else 0.0
    fatiga_sig = bool(pendiente < 0 and caida_pct > CAIDA_SIGNIFICATIVA_PCT)

    inicio = to_datetime(sesion[0].get("fecha_golpeo"))
    fin = to_datetime(sesion[-1].get("fecha_golpeo"))

    return {
        "pendiente": round(pendiente, 4),
        "numero_golpeos": len(valores),
        "caida_porcentual": round(caida_pct, 2),
        "fatiga_significativa": fatiga_sig,
        "metrica": metrica,
        "sesion": {
            "inicio": inicio.isoformat() if inicio else None,
            "fin": fin.isoformat() if fin else None,
        },
    }


def calcular_tendencia(
    golpeos_ordenados: list[dict],
    semanas_prediccion: float = 4.0,
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Regresión lineal de la métrica vs tiempo (semanas).
    """
    if not golpeos_ordenados:
        return _tendencia_vacia(metrica)

    puntos: list[tuple] = []  # (datetime, valor)
    for g in golpeos_ordenados:
        dt = to_datetime(g.get("fecha_golpeo"))
        if dt is None:
            continue
        v = _valor_metrica(g, metrica)
        if v is None:
            continue
        puntos.append((dt, v))

    if not puntos:
        return _tendencia_vacia(metrica)

    origen = puntos[0][0]
    xs = [max(0.0, (dt - origen).total_seconds() / 604800.0) for dt, _ in puntos]
    ys = [v for _, v in puntos]

    pendiente, intercepto, r2 = _regresion_lineal(xs, ys)
    pred_x = xs[-1] + semanas_prediccion
    pred = pendiente * pred_x + intercepto

    if pendiente > UMBRAL_ESTANCADO_MS_SEMANA:
        estado = "mejorando"
    elif pendiente < -UMBRAL_ESTANCADO_MS_SEMANA:
        estado = "empeorando"
    else:
        estado = "estancado"

    historial = []
    for (dt, v), x in zip(puntos, xs):
        historial.append({
            "fecha": dt.isoformat(),
            "valor": round(v, 3),
            "tendencia_valor": round(pendiente * x + intercepto, 3),
        })

    return {
        "pendiente": round(pendiente, 4),
        "r2": round(r2, 4),
        "prediccion_4_semanas": round(pred, 3),
        "estado": estado,
        "numero_golpeos": len(puntos),
        "historial": historial,
        "metrica": metrica,
        "unidad": "m/s" if metrica == "velocidad_pie_ms" else "",
    }


def calcular_comparativa(golpeos_recientes: list[dict], n: int = 4) -> dict:
    """
    Compara las últimas N patadas en métricas clave.
    """
    seleccion = golpeos_recientes[:n]

    items = []
    for g in seleccion:
        items.append({
            "id_golpeo": g.get("id_golpeo"),
            "fecha": _safe_iso(g.get("fecha_golpeo")),
            "velocidad_pie_ms": _safe_float(g.get("velocidad_pie_ms")),
            "angulo_cadera_deg": _safe_float(g.get("angulo_cadera_deg")),
            "angulo_rodilla_deg": _safe_float(g.get("angulo_rodilla_deg")),
            "angulo_tobillo_deg": _safe_float(g.get("angulo_tobillo_deg")),
            "estabilidad_tronco": _safe_float(g.get("estabilidad_tronco")),
            "clasificacion": g.get("clasificacion"),
        })

    return {"n": len(items), "golpeos": items}


def _tendencia_vacia(metrica: str) -> dict:
    return {
        "pendiente": 0.0,
        "r2": 0.0,
        "prediccion_4_semanas": 0.0,
        "estado": "sin_datos",
        "numero_golpeos": 0,
        "historial": [],
        "metrica": metrica,
        "unidad": "m/s" if metrica == "velocidad_pie_ms" else "",
    }


def _safe_float(v):
    if v is None:
        return None
    try:
        return round(float(v), 3)
    except (TypeError, ValueError):
        return None


def _safe_iso(v):
    dt = to_datetime(v)
    return dt.isoformat() if dt else (str(v) if v is not None else None)
