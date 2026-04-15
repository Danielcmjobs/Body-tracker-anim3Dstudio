# Módulo 1 — Sensor de distancia HC-SR04

Parte del proyecto **body-tracking-anim3d**.

Este módulo expone una API REST mínima con la última medición del sensor por puerto serie.

## Estructura

```
sensor/
├── arduino/
│   └── sensor_distancia/
│       ├── sensor_distancia.ino
│       └── README.md
└── backend/
    ├── app.py
    ├── main.py
    ├── config.py
    ├── controllers/
    ├── models/
    └── views/
```

## Ejecución del backend

Desde la raíz del proyecto:

```powershell
cd modules\sensor\backend
python app.py
```

Comportamiento de protocolo:

- Si existen certificados en `certs/cert.pem` y `certs/key.pem`, arranca en HTTPS.
- Si no existen, arranca en HTTP.

Endpoint principal:

```text
GET /distancia
```

Ejemplo de respuesta:

```json
{ "valor": 23.45, "unidad": "cm", "raw": "Distancia: 23.45 cm", "timestamp": "2026-03-18T10:30:00+00:00" }
```

## Uso con frontend

El frontend integrado está en `integration/web/arduino.html` y consume este endpoint en polling.

Para levantar todo el entorno integrado, usa `scripts/run_all.bat` desde la raíz.

## Estado

- [x] Sketch Arduino funcional
- [x] Backend MVC funcional
- [x] API REST expuesta (`GET /distancia`)
- [x] Integración con frontend unificado en `integration/web/`
