"""
download_model.py — Download the CNN model checkpoint if not already present.

Usage:
    python scripts/download_model.py [--dest <path>]

The checkpoint URL can be set via the INCCSIGHT_MODEL_URL environment variable,
or by updating MODEL_URL below once the file is hosted (GitHub Release, HuggingFace, etc.).
"""

import argparse
import os
import sys
import urllib.request

# ── Configuration ─────────────────────────────────────────────────────────────

CHECKPOINT_NAME = "3DExperimentV2_ManualMask_FAepoch=362-val_loss=0.13.ckpt"

# Set MODEL_URL to the hosted URL of the checkpoint file.
# Options:
#   - GitHub Release asset:  https://github.com/<user>/inCCsight/releases/download/v1.0/<name>.ckpt
#   - HuggingFace:           https://huggingface.co/<user>/inccsight/resolve/main/<name>.ckpt
#   - Google Drive (direct): https://drive.google.com/uc?export=download&id=<file_id>
MODEL_URL = os.environ.get(
    "INCCSIGHT_MODEL_URL",
    ""   # <-- fill in once the checkpoint is hosted publicly
)

_HERE        = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR = os.path.dirname(_HERE)
DEFAULT_DEST = os.path.join(_PROJECT_DIR, "methods", "CNNBased", "peso", CHECKPOINT_NAME)


# ── Download helper ───────────────────────────────────────────────────────────

def _progress(block_num, block_size, total_size):
    downloaded = block_num * block_size
    if total_size > 0:
        pct = min(100, downloaded * 100 // total_size)
        mb  = downloaded / 1_048_576
        total_mb = total_size / 1_048_576
        print(f"\r  {pct:3d}%  {mb:.1f} / {total_mb:.1f} MB", end="", flush=True)
    else:
        mb = downloaded / 1_048_576
        print(f"\r  {mb:.1f} MB downloaded", end="", flush=True)


def download(dest: str, url: str = ""):
    url = url or MODEL_URL
    if not url:
        print("[ERROR] No download URL configured.")
        print("        Pass --url, set INCCSIGHT_MODEL_URL (CNN checkpoint) /")
        print("        INCCSIGHT_QC_MODEL_URL (QC model), or edit MODEL_URL.")
        sys.exit(1)

    os.makedirs(os.path.dirname(dest), exist_ok=True)

    print(f"[inCCsight] Downloading model...")
    print(f"  URL:  {url}")
    print(f"  Dest: {dest}")

    try:
        urllib.request.urlretrieve(url, dest, reporthook=_progress)
        print(f"\n[OK] Model saved to {dest}")
    except Exception as exc:
        print(f"\n[ERROR] Download failed: {exc}")
        # Remove partial file
        if os.path.exists(dest):
            os.remove(dest)
        sys.exit(1)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Download an inCCsight model file")
    parser.add_argument("--dest", default=DEFAULT_DEST,
                        help=f"Destination path (default: {DEFAULT_DEST})")
    parser.add_argument("--url", default="",
                        help="Source URL (overrides INCCSIGHT_MODEL_URL / MODEL_URL)")
    args = parser.parse_args()

    if os.path.isfile(args.dest):
        print(f"[OK] Model already present: {args.dest}")
        return

    download(args.dest, args.url)


if __name__ == "__main__":
    main()
