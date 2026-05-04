"""
main3D.py — CNN volumetric 3D segmentation entry point.

Loads the pre-trained UNet checkpoint and runs sliding-window inference
on every detected subject folder.
"""

import argparse
import glob
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

# ── Shared library path (consolidated libcc) ──────────────────────────────────
_SHARED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shared")
if _SHARED_DIR not in sys.path:
    sys.path.insert(0, _SHARED_DIR)

from unet_module import LightningMRICCv2
from predict3D import test_predict
from script import rename_files

# ── Model checkpoint ──────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_CHECKPOINT = os.path.join(
    _HERE, "peso",
    "3DExperimentV2_ManualMask_FAepoch=362-val_loss=0.13.ckpt"
)

if not os.path.isfile(_CHECKPOINT):
    print(f"[ERROR] Model checkpoint not found: {_CHECKPOINT}", flush=True)
    sys.exit(1)

print(f"[CNN] Loading checkpoint: {os.path.basename(_CHECKPOINT)}", flush=True)
model = LightningMRICCv2.load_from_checkpoint(_CHECKPOINT).eval().cpu()

# ── Argument parsing ──────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="CNN 3D segmentation pipeline")
parser.add_argument("-p", "--parent", nargs="*", dest="parents",
                    help="Path(s) to subject folder(s) or parent folder(s)")
args = parser.parse_args()

folder_mri = args.parents or []


def is_subject_folder(path):
    """Return True if path directly contains DTI eigenvalue files."""
    for ext in (".nii.gz", ".nii"):
        if os.path.isfile(os.path.join(path, f"dti_L1{ext}")):
            return True
    return False


# Rename files to expected convention
for folder in folder_mri:
    rename_files(folder)

all_subjects = []
for folder in folder_mri:
    if is_subject_folder(folder):
        all_subjects.append(folder)
    else:
        for subject in glob.glob(os.path.join(folder, "*")):
            if os.path.isdir(subject):
                all_subjects.append(subject)

total = len(all_subjects)
print(f"[CNN] Found {total} subject(s) to process.", flush=True)
print(f"[CNN] Checkpoint: {os.path.basename(_CHECKPOINT)}", flush=True)

for i, subj in enumerate(all_subjects, 1):
    print(f"PROGRESS:{i}:{total}:CNN {os.path.basename(subj)}", flush=True)

t0 = time.time()
test_predict(model, all_subjects)
elapsed = time.time() - t0

print(f"[CNN] Total processing time: {elapsed:.2f}s", flush=True)
