#!/usr/bin/env bash
# Serve the launcher locally and open it in the browser for fast UI iteration.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8090}"

# If the port is taken (an old preview, or something else), move to the next one.
while lsof -ti tcp:"$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

python3 "$ROOT/tools/preview_server.py" "$ROOT/apps/Launcher" "$PORT" &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT
sleep 0.7
URL="http://127.0.0.1:$PORT/"
echo "Clean Home preview: $URL"
echo "Edit apps/Launcher/* and refresh the browser. Ctrl+C stops the server."
open "$URL" 2>/dev/null || true
wait "$PID"
