# Módulo futbol

Analiza la técnica de golpeo de balón usando visión artificial (MediaPipe Pose).  
Comparte base de datos y contrato de usuarios con el módulo salto.

---

## Arquitectura

```
modules/futbol/backend/
├── app.py                  # Flask entry point (puerto 5002, HTTPS)
├── config.py               # Variables de entorno, pesos del score compuesto
├── controllers/
│   ├── futbol_controller.py        # Pipeline principal de análisis
│   ├── futbol_db_controller.py     # Blueprint CRUD de golpeos
│   ├── usuario_controller.py       # Blueprint /api/usuarios (canónico)
│   └── usuarios_futbol_controller.py  # Blueprint legacy /api/usuarios_futbol (deprecado)
├── models/
│   ├── futbol_model.py     # Acceso a gestos_futbol + vistas v_golpeos
│   ├── usuarios_futbol_model.py  # Acceso a la tabla usuarios
│   └── video_processor.py  # Extracción de poses por frame con MediaPipe
└── services/
    ├── calculo_service.py          # Ángulos puntuales, estabilidad, score compuesto
    ├── impacto_service.py          # Detección de frame de impacto y velocidad del pie
    ├── cinematico_service.py       # Curvas angulares, fases del gesto, velocidades articulares
    ├── apoyo_service.py            # Estabilidad temporal del tronco y pierna de apoyo
    ├── interpretacion_service.py   # Alertas, clasificación y observaciones
    ├── analitica_service.py        # Fatiga, tendencia, comparativa, alertas avanzadas
    └── video_anotado_service.py    # Genera MP4 con overlay de esqueleto y ángulos
```

---

## Base de datos

BD unificada `bd_anim3d` (compartida con salto). Esquema table-per-class:

| Tabla            | Uso                                                |
|------------------|----------------------------------------------------|
| `usuarios`       | Jugador (alias, nombre_completo, altura_m, peso_kg)|
| `sesiones`       | Agrupación temporal de gestos por módulo           |
| `gestos`         | Registro base de cada gesto (módulo, fecha, FK usuario) |
| `gestos_futbol`  | Métricas específicas del golpeo (1:1 con `gestos`) |
| `gestos_curvas`  | Series angulares por frame (JSON)                  |
| `gestos_alertas` | Alertas biomecánicas normalizadas (1:N)            |
| `gestos_videos`  | Vídeo binario o ruta asociado al gesto             |
| `v_golpeos`      | Vista JOIN `gestos` + `gestos_futbol` (alias legacy) |

Ver esquema completo en [`scripts/README_BBDD_UNIFICADA.md`](../../scripts/README_BBDD_UNIFICADA.md).

---

## Arranque rápido

```powershell
# Desde la raíz del repositorio
$env:CORS_ORIGINS = "https://localhost:8443,https://127.0.0.1:8443"
cd modules\futbol\backend
python app.py          # Arranca en https://localhost:5002
```

Variables de entorno relevantes (`.env` o shell):

| Variable               | Por defecto | Descripción                          |
|------------------------|-------------|--------------------------------------|
| `FLASK_PORT`           | `5002`      | Puerto del backend                   |
| `FUTBOL_MODEL_PATH`    | —           | Ruta al modelo MediaPipe (opcional)  |
| `CORS_ORIGINS`         | localhost   | Orígenes permitidos por CORS         |
| `SCORE_PESO_VELOCIDAD` | `0.40`      | Peso velocidad en score compuesto    |
| `SCORE_PESO_ESTABILIDAD`| `0.25`     | Peso estabilidad en score compuesto  |
| `SCORE_PESO_CONFIANZA` | `0.20`      | Peso confianza en score compuesto    |
| `SCORE_PESO_CADERA`    | `0.15`      | Peso ángulo cadera en score compuesto|

---

## Endpoints

### Análisis

| Método | Ruta                          | Descripción                                 |
|--------|-------------------------------|---------------------------------------------|
| POST   | `/api/futbol/analizar`        | Analiza un vídeo de golpeo (form-data)      |
| POST   | `/api/futbol/video-anotado`   | Genera MP4 con overlay biomecánico          |
| GET    | `/api/golpeos/<id>/curvas`    | Series angulares del golpeo                 |

Parámetros de `/api/futbol/analizar`:

| Campo              | Tipo      | Descripción                          |
|--------------------|-----------|--------------------------------------|
| `video`            | file      | Vídeo (mp4/webm/mov/avi) — **obligatorio** |
| `id_usuario`       | int       | Si se indica, guarda el golpeo en BD |
| `guardar_bd`       | bool      | Forzar guardado aunque no haya usuario |
| `guardar_video_bd` | bool      | Persistir el vídeo en `gestos_videos` |
| `metodo_origen`    | string    | `ia_vivo` o `video_galeria`          |
| `incluir_landmarks`| bool      | Incluir landmarks por frame en respuesta |

Campos relevantes de la respuesta:

```json
{
  "angulo_cadera_deg": 142.3,
  "angulo_rodilla_deg": 98.7,
  "angulo_tobillo_deg": 115.2,
  "estabilidad_tronco": 87.4,
  "velocidad_pie_ms": 9.2,
  "score_compuesto": 74.5,
  "clasificacion": "tecnica_estable",
  "alertas": [],
  "observaciones": [],
  "fases": [],
  "curvas": {},
  "apoyo": { "score": 0.91 },
  "frame_impacto": 38
}
```

### Usuarios (canónico — compartido con salto)

| Método | Ruta                     | Descripción                 |
|--------|--------------------------|-----------------------------|
| GET    | `/api/usuarios`          | Lista paginada de usuarios  |
| POST   | `/api/usuarios`          | Crear usuario               |
| GET    | `/api/usuarios/<id>`     | Obtener usuario             |
| PUT    | `/api/usuarios/<id>`     | Actualizar usuario          |
| DELETE | `/api/usuarios/<id>`     | Eliminar usuario            |

### Analítica avanzada

| Método | Ruta                                       | Descripción                        |
|--------|--------------------------------------------|------------------------------------|
| GET    | `/api/usuarios/<id>/fatiga`                | Fatiga intra-sesión                |
| GET    | `/api/usuarios/<id>/tendencia`             | Tendencia histórica de métrica     |
| GET    | `/api/usuarios/<id>/comparativa`           | Comparativa entre sesiones         |
| GET    | `/api/usuarios/<id>/alertas_tendencia`     | Alertas de tendencia longitudinal  |
| GET    | `/api/usuarios/<id>/analitica_avanzada`    | Bloque completo: correlaciones, ranking, predicción |

### Rutas legacy (deprecadas — retirada 2026-08-01)

| Ruta legacy                                | Sustituta canónica                        |
|--------------------------------------------|-------------------------------------------|
| `/api/usuarios_futbol/<id>/fatiga`         | `/api/usuarios/<id>/fatiga`               |
| `/api/usuarios_futbol/<id>/tendencia`      | `/api/usuarios/<id>/tendencia`            |
| `/api/usuarios_futbol/<id>/comparativa`    | `/api/usuarios/<id>/comparativa`          |

Estas rutas devuelven cabeceras `Deprecation` y `Sunset: 2026-08-01`.

---

## Frontend

| Archivo                                   | Propósito                              |
|-------------------------------------------|----------------------------------------|
| `integration/web/futbol.html`             | Cámara, análisis, panel analítico      |
| `integration/web/futbol_videos.html`      | Biblioteca de vídeos y comparativas    |
| `integration/web/js/api_futbol.js`        | Llamadas al backend + render analítica |
| `integration/web/js/futbol.js`            | Flujo de grabación, resultados, comparativa 4 tiros |
| `integration/web/js/futbol_videos.js`     | Lógica de la biblioteca de vídeos      |

---

## Score compuesto (0–100)

Calculado en `services/calculo_service.py` usando pesos de `config.SCORE_PESOS_GOLPEO`:

```
score = Σ peso_i × normalizar(metrica_i, rango_min_i, rango_max_i) × 100
```

Métricas y pesos por defecto:

| Métrica               | Peso | Rango de normalización |
|-----------------------|------|------------------------|
| `velocidad_pie_ms`    | 0.40 | 2 – 18 m/s             |
| `estabilidad_tronco`  | 0.25 | 0.3 – 1.0              |
| `confianza`           | 0.20 | 0.5 – 1.0              |
| `angulo_cadera_deg`   | 0.15 | 90° – 160°             |

---

## Notas

- El modelo MediaPipe reutiliza `pose_landmarker_lite.task` del módulo salto.
- El backend de salto corre en puerto 5001, el sensor en 5000.
- Ver contrato completo de API en [`scripts/API_CONTRATOS.md`](../../scripts/API_CONTRATOS.md).
