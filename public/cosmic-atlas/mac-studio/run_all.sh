#!/usr/bin/env bash
# Build from cached source data by default. Network refreshes are always explicit.
set -euo pipefail
ATLAS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ATLAS_SOURCE_DIR="${ATLAS_SOURCE_DIR:-$HOME/cosmic-atlas-catalogs}"
ATLAS_REPO="${ATLAS_REPO:-$(cd "$ATLAS_DIR/../.." && pwd)}"
PYTHON="${PYTHON:-$ATLAS_SOURCE_DIR/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then PYTHON=python3; fi
export ATLAS_SOURCE_DIR ATLAS_REPO
FETCH=0
OVERLAYS=""
SATELLITES=0
WEATHER=0
SMALLBODIES=0
for arg in "$@"; do
  case "$arg" in
    --fetch-catalogs) FETCH=1 ;;
    --overlays) OVERLAYS=all ;;
    --overlays=*) OVERLAYS="${arg#*=}" ;;
    --satellites) SATELLITES=1 ;;
    --weather) WEATHER=1 ;;
    --smallbodies) SMALLBODIES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
if [[ "$FETCH" == 1 ]]; then "$PYTHON" "$ATLAS_DIR/mac-studio/fetch_catalogs.py"; fi
if [[ -f "$ATLAS_SOURCE_DIR/galaxies.csv" ]]; then
  "$PYTHON" "$ATLAS_DIR/mac-studio/publish_catalogs.py"
fi
if [[ -d "$ATLAS_SOURCE_DIR/icecube-10yr/icecube_10year_ps/events" ]]; then
  "$PYTHON" "$ATLAS_DIR/mac-studio/build_targets.py" "$ATLAS_DIR"
else
  echo "SKIP targets: raw IceCube events unavailable; previous output preserved"
fi
if [[ -n "$OVERLAYS" ]]; then
  if [[ "$OVERLAYS" == all ]]; then
    "$PYTHON" "$ATLAS_DIR/mac-studio/build_overlays.py" "$ATLAS_DIR/data/overlays"
  else
    "$PYTHON" "$ATLAS_DIR/mac-studio/build_overlays.py" "$ATLAS_DIR/data/overlays" "--only=$OVERLAYS"
  fi
fi
# These independent products should still refresh while satellite fetching is suspended.
if [[ "$WEATHER" == 1 ]]; then "$PYTHON" "$ATLAS_DIR/mac-studio/fetch_weather.py"; fi
if [[ "$SMALLBODIES" == 1 ]]; then "$PYTHON" "$ATLAS_DIR/mac-studio/fetch_smallbodies.py"; fi
if [[ "$SATELLITES" == 1 ]]; then
  "$PYTHON" "$ATLAS_DIR/mac-studio/fetch_satellites.py"
fi
"$PYTHON" "$ATLAS_DIR/mac-studio/build_web_catalogs.py" "$ATLAS_DIR" --source-dir "$ATLAS_SOURCE_DIR" --fields
"$PYTHON" -m unittest discover -s "$ATLAS_DIR/tests" -p 'test_pipeline.py' -v
