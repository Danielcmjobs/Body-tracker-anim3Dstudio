"""
Servicio de configuración en tiempo real para detección de balón.

Permite cambiar parámetros sin reiniciar el servidor.
Mantiene los valores en memoria con opción de persistencia en archivo.
"""

import json
import os
from pathlib import Path
from threading import Lock

# Configuración por defecto
SETTINGS_DEFAULTS = {
    "ball_detector_mode": "none",  # "none" | "heuristic" | "yolo_onnx"
    "ball_detector_enabled": False,
    "rgb_threshold": 35,  # umbral adaptativo base (será multiplicado)
    "motion_threshold": 12,  # velocidad mínima para considerar movimiento
    "frame_diff_threshold": 20,  # diferencia de frame anterior
    "confidence_threshold": 0.5,  # para YOLO
    "iou_threshold": 0.5,  # para YOLO
    "search_distance": 150,  # píxeles alrededor de los pies
}

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
                _settings.update(datos)
                print(f"[SettingsService] Configuración cargada desde {SETTINGS_FILE}")
        except Exception as e:
            print(f"[SettingsService] Error al cargar config: {e}")


def guardar_settings():
    """Guarda configuración en archivo."""
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(_settings, f, indent=2)
            print(f"[SettingsService] Configuración guardada en {SETTINGS_FILE}")
    except Exception as e:
        print(f"[SettingsService] Error al guardar config: {e}")


def obtener_setting(key):
    """Obtiene un parámetro específico de forma thread-safe."""
    with _lock:
        return _settings.get(key, SETTINGS_DEFAULTS.get(key))


def obtener_todos():
    """Retorna todos los settings actuales."""
    with _lock:
        return _settings.copy()


def actualizar_setting(key, value):
    """Actualiza un parámetro individual."""
    with _lock:
        if key in _settings:
            _settings[key] = value
            return True
        return False


def actualizar_varios(nuevos_settings):
    """Actualiza múltiples parámetros a la vez."""
    with _lock:
        count = 0
        for key, value in nuevos_settings.items():
            if key in _settings:
                _settings[key] = value
                count += 1
        return count


def resetear_settings():
    """Restaura configuración por defecto."""
    global _settings
    with _lock:
        _settings = SETTINGS_DEFAULTS.copy()


# Cargar settings al importar el módulo
cargar_settings()
