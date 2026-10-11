@echo off
rem Abre el tablero en este equipo: http://localhost:5500
cd /d "%~dp0"
set PUERTO=5500
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY (
  echo No se encontro Python. Instalalo desde https://www.python.org/downloads/ ^(marca "Add python.exe to PATH"^) o usa Live Server en VS Code.
  pause
  exit /b 1
)
echo Tablero en http://localhost:%PUERTO%  ^(cierra esta ventana para detenerlo^)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PUERTO%"
%PY% -m http.server %PUERTO%
pause
