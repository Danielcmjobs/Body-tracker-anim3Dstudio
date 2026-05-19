"""
Servicio de configuración en tiempo real para detección de balón.

Permite cambiar parámetros sin reiniciar el servidor.
Mantiene los valores en memoria con opción de persistencia en archivo.
"""

import json
import os
from pathlib import Path
from threading import Lock

# Configuración por defecto.
# La detección en vivo usa heurística por movimiento; ball_detector_mode queda
# como valor descriptivo/compatibilidad, no como selector operativo en el overlay.
SETTINGS_DEFAULTS = {
    "ball_detector_mode": "heuristic",
    "ball_detector_enabled": True,
    "rgb_threshold": 35,
    "motion_threshold": 12,
    "frame_diff_threshold": 20,
    "confidence_threshold": 0.5,
    "iou_threshold": 0.5,
    "search_distance": 150,
}

_ALLOWED_MODES = {"none", "heuristic", "yolo_onnx"}

# Estado global (thread-safe)
_settings = SETTINGS_DEFAULTS.copy()
_lock = Lock()

# Ruta del archivo de persistencia (opcional)
SETTINGS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "config_dynamic.json"
)


def cargar_settings():
    """Carga configuración desde archivo si existe."""
    global _settings
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                datos = json.load(f)
            parciales = _sanitizar_parciales(datos)
            _settings.update(parciales)
            print(f"[SettingsService] Configuración cargada desde {SETTINGS_FILE}")
        except Exception as e:
            print(f"[SettingsService] Error al cargar config: {e}")


def guardar_settings():
    """Guarda configuración en archivo."""
    try:
        snapshot = obtener_todos()
        with open(SETTINGS_FILE, "w") as f:
            json.dump(snapshot, f, indent=2)
            print(f"[SettingsService] Configuración guardada en {SETTINGS_FILE}")
    except Exception as e:
        print(f"[SettingsService] Error al guardar config: {e}")


def obtener_setting(key):
    """Obtiene un parámetro específico de forma thread-safe."""
    with _lock:
        return _settings.get(key, SETTINGS_DEFAULTS.get(key))


def obtener_todos():
    """Retorna todos los settings actuales (copia inmutable)."""
    with _lock:
        return dict(_settings)


def actualizar_setting(key, value):
    """Actualiza un parámetro individual."""
    with _lock:
        if key not in _settings:
            return False
        parcial = _sanitizar_parciales({key: value})
        if not parcial:
            return False
        _settings.update(parcial)
        return True


def actualizar_varios(nuevos_settings):
    """Actualiza múltiples parámetros a la vez. Solo aplica las claves provistas."""
    with _lock:
        parciales = _sanitizar_parciales(nuevos_settings)
        count = 0
        for key, value in parciales.items():
            if _settings.get(key) != value:
                _settings[key] = value
                count += 1
        return count


def resetear_settings():
    """Restaura configuración por defecto."""
    global _settings
    with _lock:
        _settings = SETTINGS_DEFAULTS.copy()


def _coercionar_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "si", "yes", "on"}
    raise ValueError("Valor booleano inválido")


def _coercionar_int(value, nombre: str, minimo: int | None = None, maximo: int | None = None):
    try:
        numero = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{nombre} debe ser un entero") from exc
    if minimo is not None and numero < minimo:
        raise ValueError(f"{nombre} debe ser >= {minimo}")
    if maximo is not None and numero > maximo:
        raise ValueError(f"{nombre} debe ser <= {maximo}")
    return numero


def _coercionar_float(value, nombre: str, minimo: float | None = None, maximo: float | None = None):
    try:
        numero = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{nombre} debe ser un número") from exc
    if minimo is not None and numero < minimo:
        raise ValueError(f"{nombre} debe ser >= {minimo}")
    if maximo is not None and numero > maximo:
        raise ValueError(f"{nombre} debe ser <= {maximo}")
    return numero


def _normalizar_modo(value):
    modo = str(value if value is not None else "heuristic").strip().lower()
    if modo not in _ALLOWED_MODES:
        raise ValueError(f"ball_detector_mode inválido. Usa: {', '.join(sorted(_ALLOWED_MODES))}")
    return modo


def _sanitizar_parciales(datos):
    """Sanitiza solo las claves provistas en `datos`. No introduce valores por defecto.

    Devuelve un dict con únicamente las claves válidas (presentes en SETTINGS_DEFAULTS)
    correctamente coercionadas. Lanza ValueError si algún valor es inválido.
    """
    if not isinstance(datos, dict):
        raise ValueError("Se esperaba un objeto JSON con la configuración")

    sanitizados: dict = {}
    for key, value in datos.items():
        if key not in SETTINGS_DEFAULTS:
            # Ignora claves desconocidas silenciosamente para no romper compatibilidad
            continue
        if key == "ball_detector_mode":
            sanitizados[key] = _normalizar_modo(value)
        elif key == "ball_detector_enabled":
            sanitizados[key] = _coercionar_bool(value)
        elif key in {"rgb_threshold", "motion_threshold", "frame_diff_threshold", "search_distance"}:
            minimo = 0 if key == "search_distance" else 1
            sanitizados[key] = _coercionar_int(value, key, minimo=minimo)
        elif key in {"confidence_threshold", "iou_threshold"}:
            sanitizados[key] = _coercionar_float(value, key, minimo=0.0, maximo=1.0)
    return sanitizados


def _sanitizar_settings(datos):
    """[DEPRECATED] Devuelve un snapshot completo combinando defaults + parciales.

    Conservado por compatibilidad. Para actualizaciones use `_sanitizar_parciales`.
    """
    base = SETTINGS_DEFAULTS.copy()
    try:
        base.update(_sanitizar_parciales(datos))
    except ValueError:
        return SETTINGS_DEFAULTS.copy()
    return base


# Cargar settings al importar el módulo
cargar_settings()
