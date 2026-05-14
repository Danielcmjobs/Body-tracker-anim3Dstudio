# Documentación: Configuración en Tiempo Real — Detección de Balón (Fútbol)

## 1. Objetivo
Permitir que el usuario ajuste los parámetros de la detección de balón **en tiempo real**, durante el uso de la app, sin recargar, reiniciar ni regrabar. Los cambios se aplican de inmediato tanto en la grabación como en el replay.

---

## 2. Arquitectura General

```
[Panel Web (sliders)]
      ↓
[config_balon.js]
      ↓ (API REST)
[Flask backend: /api/futbol/config]
      ↓
[settings_service.py (memoria + disco)]
      ↑
[futbol_landmarks.js] ← notificación directa (window)
```

---

## 3. Backend

### a) `services/settings_service.py`
- Gestiona la configuración en memoria (thread-safe, Lock).
- Persiste cambios en `config_dynamic.json`.
- Funciones:
  - `obtener_todos()`: Devuelve todos los parámetros actuales.
  - `actualizar_varios(dict)`: Actualiza varios parámetros a la vez.
  - `guardar_settings()`: Persiste en disco.

### b) Endpoints en `app.py`
- `GET /api/futbol/config` — Devuelve la configuración actual.
- `POST /api/futbol/config` — Actualiza parámetros en caliente (JSON).

---

## 4. Frontend

### a) Panel de Configuración en `futbol.html`
- Panel expandible con sliders y selectores para:
  - Modo de detección (`none`, `heuristic`, `yolo_onnx`)
  - Umbral RGB
  - Velocidad mínima
  - Rango de búsqueda
  - Confianza YOLO
- Feedback visual inmediato (“✓ Configuración actualizada”).

### b) `js/config_balon.js`
- Carga la configuración del backend al iniciar.
- Escucha cambios de sliders y envía los nuevos valores al backend.
- Notifica a `futbol_landmarks.js` para aplicar los cambios en vivo (usa `window.actualizarConfiguracionEnVivo`).

### c) `js/futbol_landmarks.js`
- Lee la configuración dinámica en cada frame.
- La función `actualizarConfiguracionEnVivo` resetea el estado de la detección para que los cambios sean inmediatos.
- Se expone en `window` para comunicación con otros scripts.

### d) CSS
- Sliders y panel con estilos modernos en `componentes.css`.

---

## 5. Flujo de Uso

1. El usuario ajusta cualquier parámetro en el panel.
2. El cambio se envía al backend y se guarda.
3. El frontend notifica a la lógica de overlay (detección en vivo).
4. El siguiente frame ya usa los nuevos parámetros, sin recargar ni perder el estado.
5. El usuario puede ajustar parámetros durante grabación, replay o análisis, y ver el efecto inmediato.

---

## 6. Archivos Clave

- `modules/futbol/backend/services/settings_service.py`
- `modules/futbol/backend/app.py`
- `integration/web/futbol.html`
- `integration/web/js/config_balon.js`
- `integration/web/js/futbol_landmarks.js`
- `integration/web/css/componentes.css`

---

## 7. Ejemplo de Uso de la API

### Obtener configuración actual
```http
GET /api/futbol/config
```
Respuesta:
```json
{
  "status": "success",
  "settings": {
    "ball_detector_mode": "heuristic",
    "rgb_threshold": 35,
    ...
  }
}
```

### Actualizar configuración
```http
POST /api/futbol/config
Content-Type: application/json
{
  "rgb_threshold": 40,
  "motion_threshold": 15
}
```
Respuesta:
```json
{
  "status": "success",
  "updated": 2,
  "settings": { ... }
}
```

---

## 8. Ventajas
- Cambios en tiempo real, sin recargar ni regrabar.
- Persistencia automática.
- Modularidad y fácil mantenimiento.
- Feedback visual inmediato.

---

## 9. Notas Técnicas
- El sistema es thread-safe en backend.
- Los cambios se aplican al siguiente frame en frontend.
- El panel puede ampliarse fácilmente para más parámetros.

---

**Desarrollado: Mayo 2026**
