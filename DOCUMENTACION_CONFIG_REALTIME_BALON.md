# Módulo Fútbol — Documentación Operativa Consolidada

## 1. Alcance
Documento único del estado actual del módulo de fútbol:

- Configuración en tiempo real de detección de balón.
- Arquitectura funcional frontend–backend.
- Flujo operativo único por HTTPS.
- Refactor y endurecimiento aplicados en backend.
- Riesgos actuales y evolución recomendada.

---

## 2. Estado Actual

### 2.1 Operativo
- API de fútbol: análisis, usuarios, analítica avanzada y configuración dinámica.
- Frontend con panel de parámetros aplicados en caliente y sincronizados con la respuesta autoritativa del servidor.
- Detección en vivo optimizada para móvil, con semilla manual opcional por toque.

### 2.2 Decisión de rendimiento
La detección visual por clustering en vivo está desactivada para evitar congelamientos en móvil. En tiempo real se prioriza la detección por movimiento (diferencia de frames con umbral adaptativo).

Resultado:
- Mayor fluidez en tiempo real.
- Menor sensibilidad a balón completamente estático (mitigado con semilla manual).

---

## 3. Arquitectura Funcional

```text
[Panel de configuración]
      ↓
[integration/web/js/config_balon.js]
      ↓ REST (HTTPS)
[modules/futbol/backend/app.py -> /api/futbol/config]
      ↓
[modules/futbol/backend/services/settings_service.py]
      ↑
[integration/web/js/futbol_landmarks.js]   (lee config + semilla manual)
      ↑
[modules/futbol/backend/services/ball_detector_service.py]   (offline, releé settings)
```

Responsabilidad por capa:
- Panel: captura cambios de usuario.
- API: valida, sanitiza y persiste parámetros.
- Servicio de settings: estado en memoria thread-safe + persistencia JSON.
- Overlay: aplica cambios al siguiente frame.
- Detector ML offline: relee `ball_detector_mode`, `confidence_threshold` e `iou_threshold` en cada ejecución.

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

Acciones:
- Relee parámetros dinámicos (`configDinamica`).
- Registra semilla manual por toque (`touchstart`/`mousedown`) sobre los elementos `<video>` (no sobre el canvas), usando coordenadas normalizadas `0..1`.
- Aplica la semilla como ancla del ROI durante un TTL acotado (por defecto 8 frames). El TTL decrementa en todas las ramas de procesamiento.

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

### 7.3 Detector ML offline dinámico
- `services/ball_detector_service.py` — `ball_detector_mode`, `confidence_threshold` e `iou_threshold` se releen desde `settings_service` en cada `detectar_trayectoria`. Las variables de entorno `BALL_DETECTOR_*` se mantienen como fallback.

### 7.4 Estabilidad y recursos
- `models/db.py` — inicialización del pool MySQL thread-safe (`Lock` + double-check).
- `app.py` — limpieza de uploads tras `analizar_golpeo` y `video-anotado` (los archivos temporales ya no se acumulan en disco).
- Manejo uniforme de excepciones con `logger.exception` en controladores.

### 7.5 Selección manual de balón
- `futbol_landmarks.js` — `touchstart`/`mousedown` sobre los `<video>` (no canvas), coordenadas `0..1`, guardas para `videoWidth=0`, TTL del seed decrementa en todas las ramas.
- `css/salto.css` y `css/videos.css` — `touch-action: none` sobre `#vista-camara` y `.preview-video` para evitar scroll/zoom del navegador durante la captura.

### 7.6 Garantías
- Sin cambios de rutas API.
- Sin cambios de esquema de BD.
- Sin cambios del pipeline biomecánico.

---

## 8. Riesgos y Mitigaciones

1. Balón estático en vivo
   - Riesgo: sensibilidad reducida con detección por movimiento.
   - Mitigación: semilla manual por toque + heurística adaptativa por ROI.

2. Dependencia SSL local
   - Riesgo: backend no inicia sin certificados.
   - Mitigación: generar con `scripts/generate_cert.py`.

3. Ajuste agresivo de parámetros
   - Riesgo: pérdida de precisión en detección.
   - Mitigación: rangos validados en backend + UI con sliders acotados.

4. Persistencia de configuración
   - Riesgo: `config_dynamic.json` corrupto bloquearía carga.
   - Mitigación: `cargar_settings` captura excepciones y mantiene defaults.

5. Modo `yolo_onnx` activo sin modelo
   - Riesgo: el detector responde con `status:"disabled"` y trayectoria vacía.
   - Mitigación: `enabled()` valida existencia del modelo antes de inicializar la red.

---

## 9. Selección manual como semilla para tracking automático

Flujo híbrido en tiempo real:

- **Si el usuario toca el `<video>` de captura o vista previa,** el sistema registra la coordenada normalizada y la usa como semilla inicial del tracking.
- **Si no se detecta ningún toque,** se mantiene el flujo automático heurístico actual.
- Una vez fijada la posición inicial (manual o automática), el ROI de búsqueda se ancla a esa zona durante un TTL acotado (8 frames) y luego sigue el flujo normal.
- Si el tracker pierde el balón, vuelve al flujo automático; un nuevo toque permite re-sembrar.

Implementación real:
- Listeners en `videoLive` (`#vista-camara`) y `previewVideo` (`#preview-video`) en `integration/web/js/futbol_landmarks.js`.
- Coordenadas almacenadas como `{nx, ny}` en `0..1` para evitar desajustes por escalado responsive.
- TTL gestionado por `estado.manualSeed.ttl` y decrementado en todas las ramas de procesamiento.
- CSS `touch-action: none` evita conflictos con gestos del navegador.

Ventajas:
- Sin modo manual explícito: el toque es la activación.
- Robusto ante balón estático o parcialmente oculto.
- No rompe arquitectura ni contratos.

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
