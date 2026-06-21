#!/usr/bin/env bash
# Run the mini-agent web stack in development:
#   - backend: tsx watch on src/server.ts (auto-restarts on source change, no build step)
#   - frontend: vite dev server (proxies /api and /ws to the backend on :3210)
#
# Both run from source, so backend edits take effect on save without `npm run build`.
# Ctrl-C stops both cleanly.
set -euo pipefail

cd "$(dirname "$0")/.."

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3210}"
WORKSPACE="${WORKSPACE:-.}"

backend_pid=""
frontend_pid=""

cleanup() {
  trap - INT TERM EXIT
  [ -n "$backend_pid" ] && kill "$backend_pid" 2>/dev/null || true
  [ -n "$frontend_pid" ] && kill "$frontend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[dev-web] starting backend (tsx watch) on http://$HOST:$PORT"
npx tsx watch src/server.ts --workspace "$WORKSPACE" --host "$HOST" --port "$PORT" &
backend_pid=$!

echo "[dev-web] starting frontend (vite) on http://127.0.0.1:5173"
npm --prefix web-ui run dev &
frontend_pid=$!

# If either process exits, tear the whole stack down.
wait -n "$backend_pid" "$frontend_pid"
