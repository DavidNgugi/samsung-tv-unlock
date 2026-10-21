#!/usr/bin/env bash
# Back up everything this TV exposes to a normal developer connection.
#
#   tools/backup-tv.sh
#   TV_IP=192.168.1.20 DEST=~/Backups/... tools/backup-tv.sh
#
# Writes: API metadata, app list, caps/perf dumps, source tree, built .wgt,
# certificate profile and remote-control token, plus a RESTORE.md that states
# exactly what could NOT be captured.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
TV_IP="${TV_IP:-192.168.100.35}"
PROFILE="${PROFILE:-peregrine-samsung}"
STAMP="$(date +%Y-%m-%d-%H%M)"
DEST="${DEST:-$HOME/Backups/cleanmysamsungtv/$STAMP}"

mkdir -p "$DEST"/{tv,source,certs,remote}
chmod 700 "$DEST" "$DEST"/{certs,remote}

echo "backup: $DEST"

# --- helpers ---------------------------------------------------------------
probe() {
  # sdb shell hangs on this TV instead of failing; cap every call at 3 seconds.
  local out pid n
  out="$(mktemp)"
  "$@" >"$out" 2>&1 &
  pid=$!
  n=0
  while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 30 ]; do
    sleep 0.1
    n=$((n + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    echo "(no response after 3s)"
  else
    cat "$out"
  fi
  rm -f "$out"
}

# --- TV metadata -----------------------------------------------------------
curl -fsS --max-time 8 "http://$TV_IP:8001/api/v2/" > "$DEST/tv/api-v2.json" \
  || echo "api/v2 unreachable" > "$DEST/tv/api-v2.error"
python3 -m json.tool "$DEST/tv/api-v2.json" >/dev/null 2>&1 \
  && echo "  api/v2 ok" || echo "  api/v2 not valid JSON (check tv/)"

# --- dumps from the launcher ----------------------------------------------
for f in tv-apps.json caps.json perf.json; do
  [ -f "/tmp/$f" ] && cp "/tmp/$f" "$DEST/tv/$f" && echo "  $f"
done

# --- what the TV will not give us -----------------------------------------
{
  echo "# Access probe, $(date -u +%FT%TZ)"
  echo
  echo "## sdb shell"
  echo "command: sdb shell id"
  echo "output:"
  probe sdb shell id
  echo
  echo "## Home vconf keys"
  for k in db/appfw/home_appid db/appfw/startup_appid db/appfw/booting_appid_backup \
           db/appfw/first_screen_type db/appfw/auto_start; do
    printf '%s: ' "$k"
    probe sdb shell vconfget "$k"
  done
} > "$DEST/tv/access-probe.txt"

# --- source and build ------------------------------------------------------
tar --exclude=.git --exclude=build --exclude=node_modules \
    -czf "$DEST/source/working-tree-$STAMP.tar.gz" -C "$ROOT" .
git -C "$ROOT" log --oneline -20 > "$DEST/source/git-log.txt" 2>/dev/null || true
git -C "$ROOT" status --short > "$DEST/source/git-status.txt" 2>/dev/null || true
if [ -f "$ROOT/build/CleanHome.wgt" ]; then
  cp "$ROOT/build/CleanHome.wgt" "$DEST/source/" && echo "  built wgt"
fi

# --- credentials (keep local, mode 700) -----------------------------------
if [ -d "$HOME/SamsungCertificate/$PROFILE" ]; then
  cp -R "$HOME/SamsungCertificate/$PROFILE" "$DEST/certs/" && echo "  certificate"
else
  echo "certificate profile '$PROFILE' not found" > "$DEST/certs/MISSING.txt"
fi
if [ -d "$HOME/.samsung_tv_remote" ]; then
  cp -R "$HOME/.samsung_tv_remote" "$DEST/remote/" && echo "  remote token"
fi
if [ -f "$HOME/.tv-unlock-spotify.json" ]; then
  cp "$HOME/.tv-unlock-spotify.json" "$DEST/remote/spotify-token.json" && echo "  spotify token"
fi

# --- manifest --------------------------------------------------------------
cat > "$DEST/RESTORE.md" <<RESTORE_EOF
# Restore / reversal

Created: $STAMP
TV: $TV_IP

## What is in here

- tv/api-v2.json          model, firmware, DUID, network
- tv/tv-apps.json         installed app list at backup time
- tv/caps.json, perf.json launcher capability and frame data
- tv/access-probe.txt     proof of what the TV would not expose
- source/                 working tree, git log/status, built .wgt
- certs/                  Samsung certificate profile (keep private)
- remote/                 remote-control token, Spotify refresh token

## Tier 0 - always reversible

Uninstall the side-loaded launcher:

    tizen uninstall -p tvunlock02.Launcher

Samsung's Home is untouched by this app. Nothing else to restore.

## Tier 2 - Home replacement: NOT AVAILABLE on this TV

At backup time:

    sdb shell id            -> no response
    vconfget home_appid     -> no response

There is no shell and no readable Home state, so there is no verified baseline
and no restore path. Do not attempt to change Home, startup or boot values on
this set. This backup cannot make that reversible.

## Reinstall after a reset

1. Reconnect: sdb connect $TV_IP:26101
2. Restore the certificate profile from certs/ to ~/SamsungCertificate/
3. Rebuild/deploy: tools/setup.sh (or tools/deploy-launcher.sh with PROFILE)
4. Launch any app from the TV's app list (tv-apps.json records what existed)

## Not captured

- Picture/sound settings, channel list, Samsung account state: no public export.
- Launcher localStorage (dock order/theme): read it in the app or recreate it.
- Home/startup vconf: unreadable on this firmware.
RESTORE_EOF

# --- checksums -------------------------------------------------------------
( cd "$DEST" && find . -type f ! -name SHA256SUMS -print0 | sort -z | \
  xargs -0 shasum -a 256 > SHA256SUMS )
echo "  SHA256SUMS: $(wc -l < "$DEST/SHA256SUMS" | tr -d ' ') files"
echo "done: $DEST"
