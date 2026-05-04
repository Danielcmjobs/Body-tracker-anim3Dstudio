# Modulo futbol

Este modulo analiza la tecnica de golpeo de balon usando vision artificial.

## Arquitectura

- **Backend**: Flask + MediaPipe Pose para extraer landmarks corporales.
- **Servicios**: calculo de angulos (cadera, rodilla, tobillo) y estabilidad del tronco.
- **BD**: tabla `golpes_futbol` para almacenar resultados por usuario.

## Endpoints principales

- `POST /api/futbol/analizar`
  - Form-data: `video` (obligatorio), `incluir_landmarks` (opcional),
    `id_usuario` (opcional), `guardar_bd` (opcional).
- `POST /api/futbol/guardar`
  - JSON con `id_usuario` y metricas calculadas.
- `GET /api/futbol/usuario/<id>`
  - Devuelve golpes guardados para un usuario.

## Frontend

El frontend del modulo se encuentra en [integration/web/futbol.html](integration/web/futbol.html).

## Arranque rapido

```powershell
cd modules\futbol\backend
python app.py
```

## Tabla golpes_futbol (MySQL)

```sql
CREATE TABLE golpes_futbol (
    id_golpeo INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    angulo_cadera_deg FLOAT,
    angulo_rodilla_deg FLOAT,
    angulo_tobillo_deg FLOAT,
    estabilidad_tronco FLOAT,
    pierna_golpeo VARCHAR(20),
    pierna_apoyo VARCHAR(20),
    confianza FLOAT,
    fecha_golpeo DATETIME,
    CONSTRAINT fk_golpeo_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE
);
```

## Notas

- Por defecto se reutiliza el modelo `pose_landmarker_lite.task` del modulo salto.
- Puedes sobrescribirlo con `FUTBOL_MODEL_PATH` en el `.env`.
