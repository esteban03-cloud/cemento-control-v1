#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instala Node.js 24 o superior." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias…"
  npm install
fi

if [ ! -f web/dist/index.html ]; then
  echo "Compilando la interfaz…"
  npm run build
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Se creó .env. Puedes ajustar el puerto y el host allí."
fi

echo "Iniciando CementoControl en http://127.0.0.1:8787"
npm start
