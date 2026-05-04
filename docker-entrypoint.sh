#!/bin/sh
# docker-entrypoint.sh — Container startup script
set -e

CKPT_DIR="/app/methods/CNNBased/peso"
CKPT_NAME="3DExperimentV2_ManualMask_FAepoch=362-val_loss=0.13.ckpt"
CKPT_FILE="$CKPT_DIR/$CKPT_NAME"

# ── Download model checkpoint if missing ─────────────────────────────────────
if [ ! -f "$CKPT_FILE" ]; then
    echo "[inCCsight] Model checkpoint not found — attempting download..."
    python /app/scripts/download_model.py --dest "$CKPT_FILE" || {
        echo "[WARNING] Checkpoint download failed."
        echo "          CNN 3D segmentation will be unavailable."
        echo "          Place the checkpoint manually at:"
        echo "          $CKPT_FILE"
    }
else
    echo "[inCCsight] Model checkpoint found: $CKPT_NAME"
fi

# ── Ensure output directories exist ──────────────────────────────────────────
mkdir -p /app/data
mkdir -p /app/methods/csvs

echo "[inCCsight] Starting server on port 3001..."
exec "$@"
