#!/usr/bin/env bash
# Build, install and launch Clean Home in one step.
#
# Two traps this script exists to absorb:
#   1. tizen package -o is resolved from the CLI's own directory unless absolute.
#   2. tizen install fails silently when the .wgt path contains a space, and the
#      package is named after <name> in config.xml ("Clean Home.wgt").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${PROFILE:-peregrine-samsung}"
APP_ID="tvunlock02.Launcher"
OUT="$ROOT/build/launcher"
SAFE="$ROOT/build/CleanHome.wgt"
FAMILY_DIR="${CLEANHOME_FAMILY_DIR:-$HOME/Pictures/Clean Home/Family}"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/cleanhome-launcher.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$ROOT/apps/Launcher" "$STAGE/Launcher"
python3 "$ROOT/tools/prepare-family-wallpapers.py" --source "$FAMILY_DIR" --launcher "$STAGE/Launcher"

export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"

rm -rf "$OUT"
tizen package -t wgt -s "$PROFILE" -o "$OUT" -- "$STAGE/Launcher"

SRC="$(find "$OUT" -name '*.wgt' | head -1)"
[ -n "$SRC" ] || { echo "no .wgt produced" >&2; exit 1; }

cp "$SRC" "$SAFE"
echo "package: $SAFE ($(du -h "$SAFE" | cut -f1))"

tizen install -n "$SAFE"
tizen run -p "$APP_ID"
