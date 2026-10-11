#!/bin/sh
# Abre el tablero en este equipo: http://localhost:5500
cd "$(dirname "$0")"
PUERTO=5500
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then echo "No se encontró Python. Instálalo o usa Live Server en VS Code."; exit 1; fi
echo "Tablero en http://localhost:$PUERTO  (Ctrl+C para detenerlo)"
( sleep 2; (command -v open >/dev/null && open "http://localhost:$PUERTO") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PUERTO") ) >/dev/null 2>&1 &
"$PY" -m http.server "$PUERTO"
