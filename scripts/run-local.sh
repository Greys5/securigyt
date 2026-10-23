#!/bin/sh
set -eu

if [ ! -x .venv/bin/python ]; then
  echo "Python virtual environment missing. Run: uv venv --python 3.15.1 .venv && uv pip install --python .venv/bin/python -r backend/requirements.txt" >&2
  exit 1
fi

.venv/bin/python -m uvicorn backend.api:app --host 127.0.0.1 --port "${PYTHON_BACKEND_PORT:-8000}" &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM

tries=0
until /usr/bin/curl --silent --fail "http://127.0.0.1:${PYTHON_BACKEND_PORT:-8000}/health" >/dev/null; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid" || true
    echo "Python backend failed to start" >&2
    exit 1
  fi
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "Python backend did not become ready" >&2
    exit 1
  fi
  sleep 0.2
done

if [ "${1:-dev}" = "dev" ]; then
  ./node_modules/.bin/next dev
else
  ./node_modules/.bin/next start
fi
