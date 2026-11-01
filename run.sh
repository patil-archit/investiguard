#!/usr/bin/env bash
# Build the React frontend if needed, then serve app + API at http://localhost:8765
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f frontend/dist/index.html ] || [ -n "$(find frontend/src -newer frontend/dist/index.html -print -quit)" ]; then
  (cd frontend && { [ -d node_modules ] || npm install --no-audit --no-fund; } && npm run build)
fi
exec .venv/bin/uvicorn server.api:app --port "${PORT:-8765}"
