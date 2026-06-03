#!/usr/bin/env bash
# scripts/build_package.sh
# Build the pip-installable wheel for inCCsight.
#
# Steps:
#   1. Build the React app  (npm run build → build/)
#   2. Copy the build output into inccsight/static/  (becomes package data)
#   3. Build the Python wheel  (python -m build → dist/)
#
# Usage:
#   bash scripts/build_package.sh            # full build
#   bash scripts/build_package.sh --no-npm   # skip React build (re-use existing build/)
#
# After this, install locally with:
#   pip install dist/inccsight-*.whl
# Or for development (editable, no wheel needed):
#   pip install -e .

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NO_NPM=false
for arg in "$@"; do [[ "$arg" == "--no-npm" ]] && NO_NPM=true; done

# ── Step 1: React build ───────────────────────────────────────────────────────
if [[ "$NO_NPM" == false ]]; then
    echo "[1/3] Building React app (npm run build)..."
    npm run build
else
    echo "[1/3] Skipping React build (--no-npm)"
fi

if [[ ! -f "build/index.html" ]]; then
    echo "[ERROR] build/index.html not found. Run without --no-npm or run npm run build first."
    exit 1
fi

# ── Step 2: Copy to package data ─────────────────────────────────────────────
echo "[2/3] Copying build/ -> inccsight/static/ ..."
rm -rf inccsight/static
cp -r build inccsight/static

# ── Step 3: Build Python wheel ────────────────────────────────────────────────
echo "[3/3] Building Python wheel (python -m build)..."
python -m build --wheel

echo ""
echo "[OK] Done. Wheel is in dist/"
ls -lh dist/*.whl
echo ""
echo "Install with:"
echo "  pip install dist/$(ls dist/*.whl | tail -1 | xargs basename)"
