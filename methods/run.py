"""
run.py — Full corpus callosum segmentation pipeline.

Given one or more folder paths, runs:
  1. ROQS  — 2D segmentation and CSV generation
  2. CNN   — volumetric 3D segmentation
  3. JSON  — converts CSVs to mydata.json (loaded by the interface)

Usage:
    # Parent folder with multiple subjects
    python run.py -p /data/control_group

    # Single subject (folder contains DTI files directly)
    python run.py -p /data/subject001

    # Multiple groups
    python run.py -p /data/control /data/patients

    # Skip CNN (run only ROQS + JSON conversion)
    python run.py -p /data/control --skip-cnn

Expected subject structure:
    subject_folder/
        dti_L1.nii.gz  (or .nii)
        dti_L2.nii.gz
        dti_L3.nii.gz
        dti_V1.nii.gz
        dti_V2.nii.gz
        dti_V3.nii.gz
"""

import argparse
import glob
import os
import subprocess
import sys
import time

# ── Base directories ──────────────────────────────────────────────────────────

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
ROQS_DIR  = os.path.join(BASE_DIR, "roqs")
CNN_DIR   = os.path.join(BASE_DIR, "CNNBased")
CSVS_DIR  = os.path.join(BASE_DIR, "csvs")
QC_DIR    = os.path.join(BASE_DIR, "qc")
TRACT_DIR = os.path.join(BASE_DIR, "tractography")
PYTHON    = sys.executable


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_subject_folder(path):
    """Return True if the folder contains DTI eigenvalue files directly."""
    for ext in (".nii.gz", ".nii"):
        if os.path.isfile(os.path.join(path, f"dti_L1{ext}")):
            return True
    return False


def resolve_subjects(folders):
    """Validate each path and return a clean list to pass to the pipeline."""
    valid = []
    for folder in folders:
        folder = os.path.abspath(folder)
        if not os.path.isdir(folder):
            print(f"[WARNING] Folder not found, skipping: {folder}", flush=True)
            continue
        if folder not in valid:
            valid.append(folder)
    return valid


def run_step(name, cmd, cwd):
    """Run a subprocess and relay its output line-by-line in real time."""
    print(f"\n{'-' * 60}", flush=True)
    print(f"  [{name}]", flush=True)
    print(f"  $ {' '.join(str(c) for c in cmd)}", flush=True)
    print(f"{'-' * 60}", flush=True)
    t0 = time.time()

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )

    for raw in proc.stdout:
        try:
            line = raw.decode("utf-8", errors="replace")
        except Exception:
            line = repr(raw)
        print(line, end="", flush=True)

    proc.wait()
    elapsed = time.time() - t0

    if proc.returncode != 0:
        print(f"\n[ERROR] {name} finished with code {proc.returncode}", flush=True)
        return False
    print(f"\n[OK] {name} completed in {elapsed:.1f}s", flush=True)
    return True


# ── Argument parsing ──────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Full ROQS + CNN + JSON pipeline")
parser.add_argument(
    "-p", "--path", nargs="+", required=True,
    help="Path(s) to subject folder(s) or parent folder containing multiple subjects"
)
parser.add_argument("--skip-cnn",  action="store_true", help="Skip CNN step")
parser.add_argument("--skip-roqs", action="store_true", help="Skip ROQS step")
parser.add_argument("--skip-qc",   action="store_true", help="Skip ViT QC step")
parser.add_argument("--skip-json", action="store_true", help="Skip JSON conversion step")
parser.add_argument("--skip-tract", action="store_true", help="Skip tractography step")
args = parser.parse_args()

# ── Resolve folders ───────────────────────────────────────────────────────────

print("\n" + "=" * 60, flush=True)
print("  inCCsight — Corpus Callosum Segmentation Pipeline", flush=True)
print("=" * 60, flush=True)

parent_folders = resolve_subjects(args.path)

if not parent_folders:
    print("[ERROR] No valid folders found.", flush=True)
    sys.exit(1)

# Count total subjects for progress reporting
total_subjects = 0
for folder in parent_folders:
    if is_subject_folder(folder):
        total_subjects += 1
    else:
        total_subjects += len([
            d for d in glob.glob(os.path.join(folder, "*"))
            if os.path.isdir(d)
        ])

print(f"\n  Folders to process ({len(parent_folders)}):", flush=True)
for f in parent_folders:
    print(f"    > {f}", flush=True)
print(f"  Estimated subjects: {total_subjects}", flush=True)
print(f"PROGRESS:0:{total_subjects}:Starting pipeline", flush=True)

# ── Step 1 — ROQS ─────────────────────────────────────────────────────────────

if not args.skip_roqs:
    print(f"PROGRESS:0:{total_subjects}:Running ROQS + Watershed 2D segmentation", flush=True)
    ok = run_step(
        "ROQS + Watershed — 2D Segmentation",
        [PYTHON, "main.py", "-p"] + parent_folders,
        cwd=ROQS_DIR
    )
    if not ok:
        print("\n[WARNING] ROQS + Watershed failed. Continuing anyway...", flush=True)
else:
    print("\n[--] ROQS + Watershed skipped (--skip-roqs)", flush=True)

# ── Step 2 — CNN ──────────────────────────────────────────────────────────────

if not args.skip_cnn:
    print(f"PROGRESS:0:{total_subjects}:Running CNN 3D segmentation", flush=True)
    ok = run_step(
        "CNN — Volumetric 3D Segmentation",
        [PYTHON, "main3D.py", "-p"] + parent_folders,
        cwd=CNN_DIR
    )
    if not ok:
        print("\n[WARNING] CNN failed. Continuing anyway...", flush=True)
else:
    print("\n[--] CNN skipped (--skip-cnn)", flush=True)

# ── Step 3 — ViT Quality Control ─────────────────────────────────────────────

if not args.skip_qc:
    print(f"PROGRESS:0:{total_subjects}:Running ViT quality control", flush=True)
    qc_ok = run_step(
        "ViT QC — Segmentation Quality Scoring",
        [PYTHON, "qc/run_qc.py", "-p"] + parent_folders,
        cwd=BASE_DIR
    )
    if not qc_ok:
        print("\n[WARNING] QC step failed. Continuing without QC scores…", flush=True)
else:
    print("\n[--] ViT QC skipped (--skip-qc)", flush=True)

# ── Step 4 — Tractography ────────────────────────────────────────────────────

if not args.skip_tract:
    print(f"PROGRESS:0:{total_subjects}:Running tractography", flush=True)
    ok = run_step(
        "Tractography — Probabilistic streamlines",
        [PYTHON, "main.py", "-p"] + parent_folders,
        cwd=TRACT_DIR
    )
    if not ok:
        print("\n[WARNING] Tractography failed. Continuing anyway...", flush=True)
else:
    print("\n[--] Tractography skipped (--skip-tract)", flush=True)

# ── Step 5 — JSON conversion ──────────────────────────────────────────────────

if not args.skip_json:
    print(f"PROGRESS:{total_subjects}:{total_subjects}:Converting CSV to JSON", flush=True)
    ok = run_step(
        "transformInJson — CSV to JSON",
        [PYTHON, "transformInJson.py"],
        cwd=CSVS_DIR
    )
    if not ok:
        print("\n[ERROR] JSON conversion failed.", flush=True)
        sys.exit(1)
else:
    print("\n[--] JSON conversion skipped (--skip-json)", flush=True)

# ── Done ──────────────────────────────────────────────────────────────────────

print(f"PROGRESS:{total_subjects}:{total_subjects}:Done", flush=True)
print("\n" + "=" * 60, flush=True)
print("  Pipeline complete.", flush=True)
print(f"  JSON output: {os.path.join(BASE_DIR, '..', 'data', 'mydata.json')}", flush=True)
print("=" * 60 + "\n", flush=True)
