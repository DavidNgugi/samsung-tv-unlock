#!/usr/bin/env bash
# Install the Spotify bridge as a macOS launchd service so it survives reboots.
#
#   SPOTIFY_CLIENT_ID=xxxx tools/install-spotify-service.sh
#   tools/install-spotify-service.sh --uninstall
#
# Stop any foreground copy first, or port 8795 will fight.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.cleanmysamsungtv.spotify"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/CleanMySamsungTv"
PYTHON="${PYTHON:-$(command -v python3)}"
PORT="${PORT:-8795}"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

CLIENT_ID="${SPOTIFY_CLIENT_ID:-}"
if [ -z "$CLIENT_ID" ]; then
  read -r -p "Spotify Client ID: " CLIENT_ID
fi
[ -n "$CLIENT_ID" ] || { echo "a client id is required" >&2; exit 1; }
[ -x "$PYTHON" ] || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$(dirname "$PLIST")" "$LOGDIR"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$ROOT/tools/spotify_service.py</string>
    <string>--port</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict><key>SPOTIFY_CLIENT_ID</key><string>$CLIENT_ID</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/spotify.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/spotify.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"

sleep 1
if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
  echo "running on port $PORT"
  echo "login once: http://127.0.0.1:$PORT/login"
  echo "logs: $LOGDIR/spotify.log"
else
  echo "service loaded but not answering yet; check $LOGDIR/spotify.log" >&2
fi
