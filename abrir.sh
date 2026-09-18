#!/usr/bin/env sh
# Abre el HTML Container en un servidor local.
# Uso:  ./abrir.sh [puerto]        (por defecto 8080)
set -e
PUERTO="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "  HTML Container"
echo "  ---------------"
echo "  Abre esta dirección en tu navegador:"
echo ""
echo "      http://localhost:${PUERTO}/"
echo ""
echo "  (Ctrl+C para parar el servidor)"
echo ""

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PUERTO"
elif command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer "$PUERTO"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PUERTO" .
else
  echo "No he encontrado python3 ni npx. Instala uno de los dos, o sube la carpeta a cualquier hosting estático."
  exit 1
fi
