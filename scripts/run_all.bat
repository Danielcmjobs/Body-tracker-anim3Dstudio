@echo off
REM ══════════════════════════════════════════════════════
REM  Arranca todo el proyecto con un solo doble-clic:
REM    - Backend Salto    (puerto 5001)
REM    - Backend Futbol   (puerto 5002)
REM    - Backend Sensor   (puerto 5000)  [opcional]
REM    - Frontend web     (HTTPS puerto 8443)
REM ══════════════════════════════════════════════════════

cd /d "%~dp0.."
set PROJECT_ROOT=%cd%
set VENV_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe

echo.
echo  === Jump Tracker - Comprobaciones previas ===
echo.

REM ── Comprobar que el entorno virtual existe ──
if not exist "%VENV_PYTHON%" (
    echo  [ERROR] No se encontro el entorno virtual.
    echo          Ejecuta:  python -m venv .venv
    echo          Luego:    .\.venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

REM ── Comprobar que .env existe ──
if not exist "%PROJECT_ROOT%\.env" (
    if not exist "%PROJECT_ROOT%\modules\salto\backend\.env" (
        echo  [ERROR] Falta el archivo .env con la configuracion de base de datos.
        echo          Se admite en una de estas rutas:
        echo            - %PROJECT_ROOT%\.env
        echo            - %PROJECT_ROOT%\modules\salto\backend\.env
        echo          Puedes copiar la plantilla con:
        echo            copy .env.example .env
        pause
        exit /b 1
    )
)

REM ── Comprobar certificados HTTPS obligatorios ──
if not exist "%PROJECT_ROOT%\certs\cert.pem" (
    echo  [ERROR] Falta certs\cert.pem
    echo          Ejecuta: "%VENV_PYTHON%" scripts\generate_cert.py
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\certs\key.pem" (
    echo  [ERROR] Falta certs\key.pem
    echo          Ejecuta: "%VENV_PYTHON%" scripts\generate_cert.py
    pause
    exit /b 1
)

REM ── Comprobar DB_PASSWORD para evitar caidas silenciosas del backend ──
set ENV_FILE=%PROJECT_ROOT%\.env
if not exist "%ENV_FILE%" set ENV_FILE=%PROJECT_ROOT%\modules\salto\backend\.env
findstr /r /c:"^[ ]*DB_PASSWORD[ ]*=" "%ENV_FILE%" >nul
if errorlevel 1 (
    echo  [ERROR] No se encontro DB_PASSWORD en %ENV_FILE%
    echo          Define DB_PASSWORD en el .env antes de iniciar.
    pause
    exit /b 1
)

REM ── Comprobar dependencias criticas ──
"%VENV_PYTHON%" -c "import flask, cv2, mediapipe, mysql.connector, dotenv" 2>nul
if errorlevel 1 (
    echo  [AVISO] Faltan dependencias. Instalando...
    "%VENV_PYTHON%" -m pip install -r "%PROJECT_ROOT%\requirements.txt" --quiet
    if errorlevel 1 (
        echo  [ERROR] No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
    echo  [OK] Dependencias instaladas.
)

echo.
echo  === Jump Tracker - Iniciando servicios ===
echo.

REM ── CORS abierto en desarrollo (permite acceso desde movil en LAN) ──
set CORS_ORIGINS=*
echo  CORS_ORIGINS=*  ^(modo desarrollo: cualquier origen permitido^)
echo.

REM 1) Backend del salto (puerto 5001)
echo  [1/4] Backend Salto (puerto 5001)...
start "Backend Salto" cmd /k "cd /d %PROJECT_ROOT%\modules\salto\backend && set CORS_ORIGINS=%CORS_ORIGINS% && "%VENV_PYTHON%" app.py"

REM 2) Backend del futbol (puerto 5002)
echo  [2/4] Backend Futbol (puerto 5002)...
start "Backend Futbol" cmd /k "cd /d %PROJECT_ROOT%\modules\futbol\backend && set CORS_ORIGINS=%CORS_ORIGINS% && "%VENV_PYTHON%" app.py"

REM 3) Backend del sensor (puerto 5000) — no falla si no hay Arduino
echo  [3/4] Backend Sensor (puerto 5000)...
start "Backend Sensor" cmd /k "cd /d %PROJECT_ROOT%\modules\sensor\backend && set CORS_ORIGINS=%CORS_ORIGINS% && "%VENV_PYTHON%" app.py"

REM 4) Frontend web HTTPS (puerto 8443)
echo  [4/4] Frontend web HTTPS (puerto 8443)...
start "Frontend Web HTTPS" cmd /k "cd /d %PROJECT_ROOT% && "%VENV_PYTHON%" scripts\https_server.py"

echo.
echo  Todo listo. Abre https://localhost:8443 en el navegador.
echo  Cierra las ventanas de cmd para detener los servicios.
echo.
pause
