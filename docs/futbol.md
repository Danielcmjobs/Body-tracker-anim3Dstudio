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

## Ampliaciones futuras

- Seguimiento del balon para evaluar punto de impacto.
- Clasificacion automatica de calidad del golpeo.
- Comparativa historica por usuario.
