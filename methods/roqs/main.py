"""
main.py — ROQS 2D segmentation entry point.

Accepts one or more folder paths (parent or single-subject) and runs the
full ROQS + Watershed 2D segmentation pipeline on every detected subject.
"""

import argparse
import glob
import os
import sys
import warnings

warnings.filterwarnings("ignore")

# ── Shared library path (consolidated libcc) ──────────────────────────────────
_SHARED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shared")
if _SHARED_DIR not in sys.path:
    sys.path.insert(0, _SHARED_DIR)

import segmentation as sg


def is_subject_folder(path):
    """Return True if path directly contains DTI eigenvalue files."""
    for ext in (".nii.gz", ".nii"):
        if os.path.isfile(os.path.join(path, f"dti_L1{ext}")):
            return True
    return False


parser = argparse.ArgumentParser(description="ROQS 2D segmentation pipeline")
parser.add_argument("-p", "--parent", nargs="*", dest="parents",
                    help="Path(s) to subject folder(s) or parent folder(s)")
args = parser.parse_args()

folder_mri = args.parents or []

all_subjects = []
for folder in folder_mri:
    if is_subject_folder(folder):
        all_subjects.append(folder)
    else:
        for subject in glob.glob(os.path.join(folder, "*")):
            if os.path.isdir(subject):
                all_subjects.append(subject)

total = len(all_subjects)
print(f"[ROQS] Found {total} subject(s) to process.", flush=True)

for i, subj in enumerate(all_subjects, 1):
    print(f"PROGRESS:{i}:{total}:ROQS {os.path.basename(subj)}", flush=True)

sg.get_segm(all_subjects)
