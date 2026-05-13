"""
run_qc.py — ViT-B/16 quality-control pass for all segmentation masks.

For every subject processed by the ROQS + CNN pipeline, this script:
  1. Locates segm_roqs.nii.gz, segm_watershed.nii.gz and segm_CNN.nii.gz
     inside the subject's  <subject>/inCCsight/  folder.
  2. Runs the trained ViT-B/16 + area model on each mask.
  3. Writes / updates  methods/csvs/vit_qc_scores.csv  with one row per
     subject and columns:
       subject, roqs_prob, roqs_flag, watershed_prob, watershed_flag,
       cnn_prob, cnn_flag

Usage:
    python qc/run_qc.py -p /data/group1 /data/group2
    python qc/run_qc.py -p /data/subject001          # single subject
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import tempfile
from pathlib import Path

# ── Bootstrap sys.path so qc_segmentation is importable from anywhere ─────────
_METHODS_DIR = Path(__file__).resolve().parent.parent   # methods/
if str(_METHODS_DIR) not in sys.path:
    sys.path.insert(0, str(_METHODS_DIR))

_CHECKPOINT = _METHODS_DIR / "models" / "vit_with_area_binary_best_combined_auc.pth"
_OUTPUT_CSV  = _METHODS_DIR / "csvs" / "vit_qc_scores.csv"
_PROB_THRESH = 0.5   # P(incorrect) > threshold  →  flag = True (bad segmentation)

METHODS = {
    "roqs":      "segm_roqs.nii.gz",
    "watershed": "segm_watershed.nii.gz",
    "cnn":       "cnnBased_midsagittal.nii.gz",   # CNN saves with this name
}


# ── helpers ────────────────────────────────────────────────────────────────────

def _is_subject_dir(path: Path) -> bool:
    return (path / "inCCsight").is_dir()


def _discover_subjects(parent_folders: list[str]) -> list[Path]:
    subjects: list[Path] = []
    for folder in parent_folders:
        p = Path(folder).resolve()
        if not p.is_dir():
            print(f"[WARN] Not a directory: {p}", flush=True)
            continue
        if _is_subject_dir(p):
            subjects.append(p)
        else:
            for child in sorted(p.iterdir()):
                if child.is_dir() and _is_subject_dir(child):
                    subjects.append(child)
    return subjects


# ── inference ─────────────────────────────────────────────────────────────────

def _load_model(device):
    """Load the ViTWithArea checkpoint once."""
    from qc_segmentation.models.vit import load_model
    return load_model(str(_CHECKPOINT), device)


def _score_nifti(nifti_path: Path, model, device, tmp_dir: Path) -> dict | None:
    """
    Return {prob_incorrect, prob_correct, area} for a single NIfTI mask,
    or None if inference fails.
    """
    try:
        import torch
        import numpy as np
        from PIL import Image
        from torchvision import transforms
        from qc_segmentation.dataset.builder import process_volume

        _tf = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std =[0.229, 0.224, 0.225]),
        ])

        png_path, _profiles, area = process_volume(
            nifti_path=nifti_path,
            output_dir=tmp_dir,
            label=0,
            csv_path=tmp_dir / "manifest.csv",
        )

        image  = Image.open(png_path).convert("RGB")
        img_t  = _tf(image).unsqueeze(0).to(device)
        area_t = torch.tensor([[area]], dtype=torch.float32).to(device)

        with torch.no_grad():
            logits = model(img_t, area_t)
            probs  = torch.softmax(logits, dim=1).squeeze().cpu().numpy()

        return {
            "prob_incorrect": float(probs[1]),
            "prob_correct":   float(probs[0]),
            "area":           float(area),
        }
    except Exception as exc:
        print(f"    [WARN] QC failed for {nifti_path.name}: {exc}", flush=True)
        return None


# ── main ───────────────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    import torch
    import pandas as pd

    if not _CHECKPOINT.exists():
        print(f"[ERROR] Model checkpoint not found: {_CHECKPOINT}", flush=True)
        sys.exit(1)

    device  = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[QC] Loading ViT model on {device} …", flush=True)
    model   = _load_model(device)

    subjects = _discover_subjects(args.path)
    if not subjects:
        print("[QC] No subject directories found.", flush=True)
        return

    print(f"[QC] Scoring {len(subjects)} subject(s) …", flush=True)
    rows: list[dict] = []

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for subj_dir in subjects:
            subj_name = subj_dir.name
            incc_dir  = subj_dir / "inCCsight"
            row: dict = {"subject": subj_name}

            for method_key, filename in METHODS.items():
                nifti = incc_dir / filename
                if not nifti.exists():
                    row[f"{method_key}_prob"] = None
                    row[f"{method_key}_flag"] = None
                    continue

                print(f"  > {subj_name} / {filename}", flush=True)
                result = _score_nifti(nifti, model, device, tmp_dir)
                if result:
                    p = result["prob_incorrect"]
                    row[f"{method_key}_prob"] = round(p, 4)
                    row[f"{method_key}_flag"] = bool(p > _PROB_THRESH)
                    status = "FAIL" if p > _PROB_THRESH else "PASS"
                    print(f"     P(incorrect)={p:.4f}  ->  QC {status}", flush=True)
                else:
                    row[f"{method_key}_prob"] = None
                    row[f"{method_key}_flag"] = None

            rows.append(row)

    if not rows:
        print("[QC] No results to save.", flush=True)
        return

    df = pd.DataFrame(rows, columns=[
        "subject",
        "roqs_prob",     "roqs_flag",
        "watershed_prob","watershed_flag",
        "cnn_prob",      "cnn_flag",
    ])

    _OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(_OUTPUT_CSV, index=False)
    print(f"[QC] Results saved → {_OUTPUT_CSV}", flush=True)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="ViT QC for CC segmentation masks")
    p.add_argument("-p", "--path", nargs="+", required=True,
                   help="Subject folder(s) or parent folder(s)")
    return p


if __name__ == "__main__":
    run(_build_parser().parse_args())
