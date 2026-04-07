@echo off
REM ══════════════════════════════════════════════════════
REM  Configuración inicial del proyecto.
REM  Ejecutar UNA SOLA VEZ tras clonar el repositorio.
REM
REM  Lo que hace:
REM    1. Crea el entorno virtual (.venv)
REM    2. Instala todas las dependencias
REM    3. Crea el archivo .env a partir de .env.example
REM    4. Recuerda crear la base de datos MySQL
REM ══════════════════════════════════════════════════════

cd /d "%~dp0.."
set PROJECT_ROOT=%cd%

echo.
echo  === Jump Tracker - Configuracion inicial ===
echo.

REM ── 1. Crear entorno virtual ──
if exist "%PROJECT_ROOT%\.venv\Scripts\python.exe" (
    echo  [OK] Entorno virtual ya existe.
) else (
    echo  [1/3] Creando entorno virtual .venv ...
    python -m venv "%PROJECT_ROOT%\.venv"
    if errorlevel 1 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        echo          Asegurate de tener Python 3.10+ instalado y en el PATH.
        pause
        exit /b 1
    )
    echo  [OK] Entorno virtual creado.
)

set VENV_PYTHON="%PROJECT_ROOT%\.venv\Scripts\python.exe"

REM ── 2. Instalar dependencias ──
echo  [2/3] Instalando dependencias...
%VENV_PYTHON% -m pip install --upgrade pip --quiet
%VENV_PYTHON% -m pip install -r "%PROJECT_ROOT%\requirements.txt" --quiet
if errorlevel 1 (
    echo  [ERROR] Fallo al instalar dependencias.
    pause
    exit /b 1
)
echo  [OK] Dependencias instaladas.

REM ── 3. Crear .env si no existe ──
if exist "%PROJECT_ROOT%\.env" (
    echo  [OK] Archivo .env ya existe.
) else (
    echo  [3/3] Creando .env a partir de .env.example...
    copy "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\.env" >nul
    echo  [OK] Archivo .env creado.
    echo.
    echo  ************************************************************
    echo  *  IMPORTANTE: Abre .env y pon tu contrasena de MySQL      *
    echo  *  en la variable DB_PASSWORD antes de arrancar la app.    *
    echo  ************************************************************
)

echo.
echo  === Configuracion completada ===
echo.
echo  Pasos restantes:
echo    1. Edita .env con tu contrasena de MySQL
echo    2. Crea la base de datos:  mysql -u root -p ^< scripts\init_db.sql
echo    3. Arranca la app:         scripts\run_all.bat
echo.
pause
