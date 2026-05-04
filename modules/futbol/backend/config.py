# Constantes del modulo futbol

import os

FLASK_PORT: int = int(os.getenv("FUTBOL_PORT", "5002"))

_cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_origins_raw == "*":
    CORS_ORIGINS = "*"
else:
    CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

UPLOAD_FOLDER: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
EXTENSIONES_PERMITIDAS: set = {".mp4", ".webm", ".avi", ".mov"}
MAX_UPLOAD_MB: int = 100

MIN_DETECTION_CONFIDENCE: float = 0.5
MIN_TRACKING_CONFIDENCE: float = 0.5

# Ruta al modelo de MediaPipe.
# Por defecto se reutiliza el modelo del modulo salto.
MODEL_PATH: str = os.getenv(
    "FUTBOL_MODEL_PATH",
    os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "modules",
            "salto",
            "backend",
            "pose_landmarker_lite.task",
        )
    ),
)

_db_password = os.getenv("DB_PASSWORD")
if _db_password is None:
    raise RuntimeError(
        "Variable de entorno DB_PASSWORD no definida. "
        "Copia .env.example a .env y rellena tus credenciales de MySQL."
    )

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": _db_password,
    "database": os.getenv("DB_NAME", "bd_anim3d_saltos"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}
