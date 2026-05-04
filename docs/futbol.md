# Modulo futbol

## Objetivo

Analizar la tecnica de golpeo de balon a partir de video, usando landmarks corporales.

## Flujo de datos

```
Video (movil o galeria)
      -> MediaPipe PoseLandmarker
      -> Calculo biomecanico (angulos + estabilidad)
      -> API REST (JSON)
```

## Metricas base

- Angulo de cadera, rodilla y tobillo de la pierna de golpeo.
- Identificacion de pierna de apoyo y pierna de golpeo.
- Estabilidad del tronco (variacion del centro de hombros).
- Confianza de deteccion.

## Usuarios y guardado

- CRUD de usuarios compartido con el resto del proyecto (tabla `usuarios`).
- El analisis del golpeo puede guardarse en BD cuando se selecciona un usuario.
- El video es opcional: se puede guardar solo los datos o datos + video.

## API REST (futbol)

### Usuarios

- `GET /api/usuarios` -> Lista usuarios (soporta paginado con `paginado=1`).
- `POST /api/usuarios` -> Crea usuario (`alias`, `nombre_completo`, `altura_m`, `peso_kg` opcional).
- `GET /api/usuarios/<id>` -> Obtiene usuario.
- `PUT /api/usuarios/<id>` -> Actualiza usuario.
- `DELETE /api/usuarios/<id>` -> Elimina usuario.
- `GET /api/usuarios/<id>/golpeos` -> Golpeos del usuario.

### Golpeos

- `POST /api/futbol/analizar` -> Analiza video y opcionalmente guarda en BD.
- `GET /api/golpeos` -> Lista golpeos.
- `GET /api/golpeos/<id>` -> Obtiene golpeo.
- `DELETE /api/golpeos/<id>` -> Elimina golpeo.

### Videos

- `GET /api/videos` -> Biblioteca de videos guardados (filtro `id_usuario`).
- `GET /api/videos/<id>/stream` -> Streaming del video guardado.

## Base de datos

Tabla `golpes_futbol`:

- `id_golpeo`, `id_usuario` (FK), `angulo_cadera_deg`, `angulo_rodilla_deg`, `angulo_tobillo_deg`.
- `estabilidad_tronco`, `pierna_golpeo`, `pierna_apoyo`, `confianza`, `metodo_origen`, `fecha_golpeo`.
- `video_blob`, `video_nombre`, `video_mime` para almacenamiento opcional de video.

## Ampliaciones futuras

- Seguimiento del balon para evaluar punto de impacto.
- Clasificacion automatica de calidad del golpeo.
- Comparativa historica por usuario.
