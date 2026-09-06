#!/bin/sh
# Restart the local dev server on port 8787 (used by tools/shots.mjs between review rounds).
cd "$(dirname "$0")/.." || exit 1
PID=$(lsof -nP -iTCP:8787 -sTCP:LISTEN -t 2>/dev/null)
[ -n "$PID" ] && kill "$PID" 2>/dev/null && sleep 1.5
AIRENA_DEV=1 AIRENA_SUB_MODELS=1 nohup node --env-file-if-exists=.env src/server/app.js > /tmp/airena-dev.log 2>&1 &
for i in $(seq 1 40); do sleep 0.25; curl -sf http://localhost:8787/api/health >/dev/null 2>&1 && { echo "dev server up on 8787"; exit 0; }; done
echo "dev server did not answer"; exit 1
