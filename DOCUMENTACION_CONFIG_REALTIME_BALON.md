# Módulo Fútbol — Documentación Operativa Consolidada

> **Actualización 2026-05-19:** La detección de balón ha sido completamente eliminada del pipeline activo. El análisis es 100 % basado en landmarks corporales (MediaPipe). El servicio `ball_detector_service.py` y el panel `config_balon.js` siguen presentes en el código pero están inactivos (código durmiente).

## 1. Alcance
Documento único del estado actual del módulo de fútbol:

- Arquitectura funcional frontend–backend.
- Flujo operativo único por HTTPS.
- Refactor y endurecimiento aplicados en backend.
- Estado del código de detección de balón (durmiente).
- Riesgos actuales y evolución recomendada.

---

## 2. Estado Actual

### 2.1 Operativo
- API de fútbol: análisis, usuarios, analítica avanzada y configuración dinámica.
- Pipeline de análisis 100 % basado en landmarks corporales (MediaPipe Pose Landmarker, 33 landmarks).
- Frame de impacto detectado por pico de velocidad del tobillo; todos los ángulos y métricas derivados de articulaciones corporales.

### 2.2 Estado de la detección de balón
La detección de balón ha sido **completamente eliminada** del pipeline activo (2026-05-19):

- Los loops de render (`renderLiveLoop`, `renderPreviewLoop`) en `futbol_landmarks.js` solo llaman a `drawPose()`. No hay llamadas a `detectarBalon` ni `drawBall`.
- El controlador `futbol_controller.py` no importa `BallDetectorService`. Los pasos 9-10 (balon_ml, balon_trayectoria) han sido eliminados. Solo existen los pasos 1-8 (landmark-based).
- Los listeners de tap-to-seed (`touchstart`/`mousedown`) han sido eliminados de `futbol_landmarks.js`.
- La API pública `window.futbolLandmarksPreview` ya no expone `setBallTrajectory`.
- El overlay de círculo naranja no aparece ni en el stream en vivo ni en la previsualización.

Código durmiente (existe pero no se invoca):
- `ball_detector_service.py` — métodos `detectar_trayectoria` y `detectar_trayectoria_heuristica` presentes pero sin llamante.
- Funciones `detectarBalon`, `drawBall`, `crearEstadoBalon` en `futbol_landmarks.js` — definidas pero no llamadas.
- Panel `config_balon.js` — sigue cargando y llama a `actualizarConfiguracionEnVivo` (función aún definida), pero no tiene efecto real sobre el análisis.
- Endpoint `/api/futbol/config` y `settings_service.py` — operativos pero sus parámetros de balón no influyen en ninguna ejecución.

---

## 3. Arquitectura Funcional

```text
[Video (móvil o galería)]
      ↓ POST /api/futbol/analizar
[modules/futbol/backend/controllers/futbol_controller.py]
      ↓
[models/video_processor.py]   (landmarks por frame, OpenCV + MediaPipe)
      ↓
[services/impacto_service.py]      (frame de impacto, velocidad pie)
[services/cinematico_service.py]   (curvas angulares, fases, velocidades articulares)
[services/apoyo_service.py]        (estabilidad tronco/apoyo, asimetría)
[services/interpretacion_service.py] (alertas, clasificación, observaciones)
      ↓ JSON
[integration/web/js/futbol.js]     (muestra métricas + activa preview overlay)
[integration/web/js/futbol_landmarks.js]  (overlay esqueleto en live y preview)
```

Responsabilidad por capa:
- Backend: extrae landmarks con MediaPipe vía VideoProcessor, ejecuta pipeline de 8 pasos, devuelve métricas en JSON.
- Frontend: recibe JSON y renderiza paneles, gráficas Chart.js, visor 3D y overlay de esqueleto (canvas sobre `<video>`).
- `config_balon.js` / `settings_service.py`: siguen operativos (durmientes) pero sus parámetros no afectan ningún cálculo activo.

---

## 4. Ejecución Unificada (HTTPS)

Modo único de operación:
- Frontend HTTPS.
- Backends HTTPS.
- Certificados requeridos: `certs/cert.pem` y `certs/key.pem`.

Archivos de control:
- `scripts/run_all.bat`
- `scripts/https_server.py`
- `scripts/generate_cert.py`
- `integration/web/js/config.js`
- `modules/futbol/backend/app.py`

---

## 5. Configuración en Tiempo Real

### 5.1 Backend

Archivo: `modules/futbol/backend/services/settings_service.py`

Funciones públicas:
- `obtener_setting(key)` — lectura puntual thread-safe.
- `obtener_todos()` — snapshot completo (copia).
- `actualizar_setting(key, value)` — actualización individual sanitizada.
- `actualizar_varios(dict)` — actualización parcial (no resetea claves no provistas).
- `guardar_settings()` — persistencia en `config_dynamic.json`.
- `cargar_settings()` — carga al importar el módulo.
- `resetear_settings()` — restaurar defaults.

Helpers internos:
- `_sanitizar_parciales(datos)` — coerciona y valida solo las claves provistas.
- `_coercionar_bool / _coercionar_int / _coercionar_float` — con rangos.
- `_normalizar_modo(value)` — valida contra `_ALLOWED_MODES = {"none","heuristic","yolo_onnx"}`.

Claves soportadas (`SETTINGS_DEFAULTS`):

| Clave | Tipo | Rango | Default |
|---|---|---|---|
| `ball_detector_mode` | str | none / heuristic / yolo_onnx | `"heuristic"` |
| `ball_detector_enabled` | bool | — | `false` |
| `rgb_threshold` | int | ≥ 1 | `35` |
| `motion_threshold` | int | ≥ 1 | `12` |
| `frame_diff_threshold` | int | ≥ 1 | `20` |
| `confidence_threshold` | float | 0.0–1.0 | `0.5` |
| `iou_threshold` | float | 0.0–1.0 | `0.5` |
| `search_distance` | int | ≥ 0 | `150` |

Archivo: `modules/futbol/backend/app.py`

Endpoints:
- `GET  /api/futbol/config` → devuelve `{status, settings}`.
- `POST /api/futbol/config` (también `PUT`) → valida JSON, sanitiza, persiste, devuelve `{status, updated, settings}`. Códigos: `400` para `ValueError`, `500` para errores internos.

### 5.2 Frontend

Archivo: `integration/web/js/config_balon.js`

Acciones:
- Carga configuración inicial desde backend y notifica al overlay.
- Envía cambios al backend y actualiza el estado local con la respuesta autoritativa (`datos.settings`), no con los valores enviados.
- Notifica actualización en vivo al overlay tras carga y tras cada cambio.

Archivo: `integration/web/js/futbol_landmarks.js`

Acciones activas:
- Loop `renderLiveLoop`: detecta pose con MediaPipe y dibuja esqueleto en canvas sobre `#vista-camara`.
- Loop `renderPreviewLoop`: detecta pose con MediaPipe y dibuja esqueleto en canvas sobre `#preview-video`.
- API pública `window.futbolLandmarksPreview`: expone `setVideoBlob`, `set3DFrames`, `reset`. Sin `setBallTrajectory`.

Código durmiente (definido, no llamado):
- Funciones `detectarBalon`, `drawBall`, `crearEstadoBalon`, `actualizarConfiguracionEnVivo`.
- Variables `manualBallSeedLive`, `manualBallSeedPreview`, `ballStateLive`, `ballStatePreview` (inicializadas a `null`, sin listeners activos).

---

## 6. Contrato API (Configuración)

### 6.1 Obtener configuración
```http
GET /api/futbol/config
```

```json
{
  "status": "success",
  "settings": {
    "ball_detector_mode": "heuristic",
    "ball_detector_enabled": false,
    "rgb_threshold": 35,
    "motion_threshold": 12,
    "frame_diff_threshold": 20,
    "confidence_threshold": 0.5,
    "iou_threshold": 0.5,
    "search_distance": 150
  }
}
```

### 6.2 Actualizar configuración (parcial)
```http
POST /api/futbol/config
Content-Type: application/json
```

```json
{
  "rgb_threshold": 40,
  "motion_threshold": 15
}
```

```json
{
  "status": "success",
  "updated": 2,
  "settings": {
    "ball_detector_mode": "heuristic",
    "ball_detector_enabled": false,
    "rgb_threshold": 40,
    "motion_threshold": 15,
    "frame_diff_threshold": 20,
    "confidence_threshold": 0.5,
    "iou_threshold": 0.5,
    "search_distance": 150
  }
}
```

Notas:
- Las claves no incluidas en el body conservan su valor previo (no se resetean a default).
- Claves desconocidas se ignoran silenciosamente.
- Valores fuera de rango devuelven `400` con `{status:"error", message:"..."}`.

---

## 7. Refactor y Endurecimiento Aplicados

### 7.1 Validación y parsing (sin cambios de contrato)
Módulos compartidos:
- `modules/futbol/backend/utils/validators.py` — `parse_altura_m`, `parse_peso_kg`.
- `modules/futbol/backend/utils/form_parsing.py` — `parse_bool`.

Consumidores:
- `controllers/usuario_controller.py` — alta y edición usan `parse_altura_m`/`parse_peso_kg`.
- `controllers/usuarios_futbol_controller.py` (legacy) — sus `_validar_altura`/`_validar_peso` delegan en los validadores compartidos.
- `app.py` — `parse_bool` centralizado.

### 7.2 Configuración en tiempo real
- `services/settings_service.py` — validación estricta por clave, actualización parcial real (no resetea otras claves), snapshot inmutable en `obtener_todos`, carga inicial sanitizada.
- `app.py /api/futbol/config` — `400` para `ValueError`, `500` con logging para errores internos.
- `integration/web/js/config_balon.js` — usa `datos.settings` del servidor como autoridad; notifica al overlay también en la carga inicial.
- `integration/web/futbol.html` — eliminado el selector engañoso de `ball_detector_mode` en vivo (la detección en tiempo real es heurística por diseño).

### 7.3 Detector ML offline *(durmiente)*
- `services/ball_detector_service.py` — el servicio existe con métodos `detectar_trayectoria` (YOLO) y `detectar_trayectoria_heuristica`. Ninguno es llamado: `futbol_controller.py` no importa ni instancia `BallDetectorService`. Los pasos 9-10 del pipeline han sido eliminados.

### 7.4 Estabilidad y recursos
- `models/db.py` — inicialización del pool MySQL thread-safe (`Lock` + double-check).
- `app.py` — limpieza de uploads tras `analizar_golpeo` y `video-anotado` (los archivos temporales ya no se acumulan en disco).
- Manejo uniforme de excepciones con `logger.exception` en controladores.

### 7.5 Selección manual de balón *(eliminado)*
- Los listeners `touchstart`/`mousedown` sobre los `<video>` han sido eliminados de `futbol_landmarks.js`.
- Las variables `manualBallSeedLive` / `manualBallSeedPreview` quedan inicializadas a `null` sin listeners.
- El atributo CSS `touch-action: none` sobre `#vista-camara` y `.preview-video` se mantiene (neutro, no perjudica).

### 7.6 Garantías
- Sin cambios de rutas API.
- Sin cambios de esquema de BD.
- Sin cambios del pipeline biomecánico.

---

## 8. Riesgos y Mitigaciones

1. Dependencia SSL local
   - Riesgo: backend no inicia sin certificados.
   - Mitigación: generar con `scripts/generate_cert.py`.

2. Persistencia de configuración
   - Riesgo: `config_dynamic.json` corrupto bloquearía carga.
   - Mitigación: `cargar_settings` captura excepciones y mantiene defaults.

3. Código durmiente de detección de balón
   - Riesgo: reactivación accidental si alguien añade una llamada a `detectarBalon` o importa `BallDetectorService` sin contexto.
   - Mitigación: el código está inerte en la rama activa; si se requiere en el futuro, activar de forma explícita y validar con YOLO ONNX (ya scaffoldeado, necesita fichero de modelo + variable de entorno `BALL_DETECTOR_MODE=yolo_onnx`).

---

## 9. Selección manual de balón *(eliminada — referencia histórica)*

Esta funcionalidad fue implementada y posteriormente eliminada (2026-05-19) junto con toda la detección de balón del pipeline activo.

Contexto: la detección heurística por diferencia de frames (motion-diff) es incompatible con cámara de móvil en mano, ya que el movimiento del propio cámara genera falsos positivos en toda la imagen. La semilla manual no resolvía el problema raíz. La detección fiable requiere YOLO ONNX con un modelo entrenado en balón de fútbol, que sigue scaffoldeado en `ball_detector_service.py` para activación futura.

---

## 10. Referencias Clave

Backend:
- `modules/futbol/backend/app.py`
- `modules/futbol/backend/config.py`
- `modules/futbol/backend/services/settings_service.py`
- `modules/futbol/backend/services/ball_detector_service.py`
- `modules/futbol/backend/controllers/usuario_controller.py`
- `modules/futbol/backend/controllers/usuarios_futbol_controller.py` (legacy)
- `modules/futbol/backend/controllers/futbol_db_controller.py`
- `modules/futbol/backend/models/db.py`
- `modules/futbol/backend/models/futbol_model.py`
- `modules/futbol/backend/utils/validators.py`
- `modules/futbol/backend/utils/form_parsing.py`

Frontend:
- `integration/web/futbol.html`
- `integration/web/js/config_balon.js`
- `integration/web/js/futbol_landmarks.js`
- `integration/web/js/config.js`
- `integration/web/css/salto.css`
- `integration/web/css/videos.css`

Operación:
- `scripts/run_all.bat`
- `scripts/https_server.py`
- `scripts/generate_cert.py`

---

Actualizado: Mayo 2026
