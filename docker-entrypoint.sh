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

# ── ViT Quality-Control model ─────────────────────────────────────────────────
# Normally baked into the image (see Dockerfile). If it is missing and
# INCCSIGHT_QC_MODEL_URL is set, download it; otherwise QC is skipped gracefully.
QC_DIR="/app/methods/models"
QC_NAME="vit_with_area_binary_best_combined_auc.pth"
QC_FILE="$QC_DIR/$QC_NAME"
mkdir -p "$QC_DIR"

if [ ! -f "$QC_FILE" ]; then
    if [ -n "$INCCSIGHT_QC_MODEL_URL" ]; then
        echo "[inCCsight] QC model not found — attempting download..."
        python /app/scripts/download_model.py --dest "$QC_FILE" --url "$INCCSIGHT_QC_MODEL_URL" || {
            echo "[WARNING] QC model download failed — quality scoring will be skipped."
        }
    else
        echo "[WARNING] QC model not found at $QC_FILE"
        echo "          Quality scoring will be skipped. Bake the .pth into the image"
        echo "          (methods/models/) or set INCCSIGHT_QC_MODEL_URL."
    fi
else
    echo "[inCCsight] QC model found: $QC_NAME"
fi

# ── Ensure output directories exist ──────────────────────────────────────────
mkdir -p /app/data
mkdir -p /app/methods/csvs

echo "[inCCsight] Starting server on port 3001..."
exec "$@"
