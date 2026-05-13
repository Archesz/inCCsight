"""
transformInJson.py — Convert segmentation CSV outputs to mydata.json.

Reads all CSV files produced by the ROQS, Watershed and CNN pipelines,
merges them into a list of subject dictionaries, and writes the result to
data/mydata.json at the project root.

A _metadata block is always embedded in the output, recording the software
version, run timestamp, active model checkpoint and key package versions.
This ensures every output file is traceable and reproducible.

Usage:
    python transformInJson.py
"""

import ast
import datetime
import importlib.metadata
import json
import math
import os
import re

import numpy as np
import pandas as pd


# ── Locate project directories ────────────────────────────────────────────────

_HERE        = os.path.dirname(os.path.abspath(__file__))          # methods/csvs/
_METHODS_DIR = os.path.dirname(_HERE)                              # methods/
_PROJECT_DIR = os.path.dirname(_METHODS_DIR)                       # project root
_CNN_DIR     = os.path.join(_METHODS_DIR, "CNNBased")
_OUTPUT_DIR  = os.path.join(_PROJECT_DIR, "data")
_OUTPUT_FILE = os.path.join(_OUTPUT_DIR, "mydata.json")

_GROUPS_FILE = os.path.join(_HERE, "groups.json")


# ── Group mapping ─────────────────────────────────────────────────────────────

def _load_groups_map() -> dict:
    if not os.path.exists(_GROUPS_FILE):
        return {}
    try:
        with open(_GROUPS_FILE, "r", encoding="utf-8") as f:
            groups_map = json.load(f)
        print(f"[OK] groups.json loaded: {len(groups_map)} group(s)", flush=True)
        return groups_map
    except Exception as exc:
        print(f"[WARNING] Could not read groups.json: {exc}", flush=True)
        return {}


def _find_group(img_path: str, groups_map: dict) -> str:
    """Determine a subject's group from its img_path and the groups map."""
    if not img_path or not groups_map:
        return ""
    subject_dir = os.path.normpath(os.path.dirname(os.path.dirname(img_path)))
    parent_dir  = os.path.normpath(os.path.dirname(subject_dir))
    for folder, group in groups_map.items():
        normed = os.path.normpath(folder)
        if normed in (subject_dir, parent_dir):
            return group
    return ""


# ── List parsing ──────────────────────────────────────────────────────────────

def _parse_list_cell(val):
    """Convert a CSV cell that contains a Python list string into a list."""
    if not isinstance(val, str):
        return val
    try:
        return ast.literal_eval(val)
    except (ValueError, SyntaxError):
        try:
            cleaned = re.sub(r"np\.float\d+\(([^)]+)\)", r"\1", val)
            return json.loads(cleaned.replace("'", '"'))
        except Exception:
            return []


def _df_parse_lists(df: pd.DataFrame) -> pd.DataFrame:
    return df.apply(lambda col: col.map(_parse_list_cell))


# ── Numeric helper ───────────────────────────────────────────────────────────
def _safe_num(val):
    """Return float or None; handles NaN / None gracefully."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


# ── NaN detection ─────────────────────────────────────────────────────────────

def _has_nan(subject: dict) -> bool:
    for val in subject.values():
        if isinstance(val, dict):
            for v2 in val.values():
                if isinstance(v2, list):
                    try:
                        if np.any(np.isnan(np.array(v2, dtype=float))):
                            return True
                    except (TypeError, ValueError):
                        pass
                else:
                    try:
                        if math.isnan(v2):
                            return True
                    except (TypeError, ValueError):
                        pass
        elif isinstance(val, list):
            try:
                if np.any(np.isnan(np.array(val, dtype=float))):
                    return True
            except (TypeError, ValueError):
                pass
    return False


# ── Subject class ─────────────────────────────────────────────────────────────

class Subject:
    def __init__(
        self,
        name,
        watershed_scalar,
        roqs_scalar,
        watershed_midlines,
        roqs_midlines,
        watershed_thickness,
        roqs_thickness,
        watershed_parcellation,
        roqs_parcellation,
        img_path="",
        roqs_qc_flag=None,
        roqs_qc_prob=None,
        watershed_qc_flag=None,
        watershed_qc_prob=None,
        cnn_qc_flag=None,
        cnn_qc_prob=None,
        cnn_parcellation=None,
        cnn_midlines=None,
        cnn_scalar=None,
        groups_map=None,
        roqs_shape=None,
        removed=False,
    ):
        self.name                  = self._normalize_name(str(name))
        self.watershed_scalar      = watershed_scalar
        self.roqs_scalar           = roqs_scalar
        self.watershed_midlines    = watershed_midlines
        self.roqs_midlines         = roqs_midlines
        self.watershed_thickness   = list(watershed_thickness)
        self.roqs_thickness        = list(roqs_thickness)
        self.watershed_parcellation = watershed_parcellation
        self.roqs_parcellation     = roqs_parcellation
        self.cnn_parcellation      = cnn_parcellation or {}
        self.cnn_midlines          = cnn_midlines or {}
        self.cnn_scalar            = cnn_scalar or {}
        self.img_path              = str(img_path) if img_path else ""
        self.roqs_qc_flag          = roqs_qc_flag
        self.roqs_qc_prob          = roqs_qc_prob
        self.watershed_qc_flag     = watershed_qc_flag
        self.watershed_qc_prob     = watershed_qc_prob
        self.cnn_qc_flag           = cnn_qc_flag
        self.cnn_qc_prob           = cnn_qc_prob
        self.group                 = _find_group(self.img_path, groups_map or {})
        self.roqs_shape            = roqs_shape or {}
        self.removed               = bool(removed)

    @staticmethod
    def _normalize_name(name: str) -> str:
        if name.startswith("Subject_"):
            name = name[len("Subject_"):]
        return name.zfill(7)

    @staticmethod
    def _safe_bool(val):
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return None
        return bool(val)

    @staticmethod
    def _safe_float(val):
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    def to_dict(self) -> dict:
        return {
            "Id":                    self.name,
            "removed":               self.removed,
            "img_path":              self.img_path,
            "group":                 self.group,
            "qc": {
                "ROQS":      {"flag": self._safe_bool(self.roqs_qc_flag),
                              "prob": self._safe_float(self.roqs_qc_prob)},
                "Watershed": {"flag": self._safe_bool(self.watershed_qc_flag),
                              "prob": self._safe_float(self.watershed_qc_prob)},
                "CNN":        {"flag": self._safe_bool(self.cnn_qc_flag),
                               "prob": self._safe_float(self.cnn_qc_prob)},
            },
            "Watershed_scalar":       dict(self.watershed_scalar),
            "ROQS_scalar":            dict(self.roqs_scalar),
            "CNN_scalar":             dict(self.cnn_scalar),
            "Watershed_midlines":     dict(self.watershed_midlines),
            "ROQS_midlines":          dict(self.roqs_midlines),
            "Watershed_thickness":    self.watershed_thickness,
            "ROQS_thickness":         self.roqs_thickness,
            "Watershed_parcellation": dict(self.watershed_parcellation),
            "ROQS_parcellation":      dict(self.roqs_parcellation),
            "CNN_parcellation":       dict(self.cnn_parcellation),
            "CNN_midlines":           dict(self.cnn_midlines),
            "ROQS_shape":             dict(self.roqs_shape),
        }


# ── CSV helpers ───────────────────────────────────────────────────────────────

def _drop_unnamed(df: pd.DataFrame) -> pd.DataFrame:
    unnamed = [c for c in df.columns if str(c).startswith("Unnamed")]
    return df.drop(columns=unnamed) if unnamed else df


def _read_csv(filename: str, required: bool = True) -> pd.DataFrame:
    try:
        return _drop_unnamed(pd.read_csv(filename, sep=";"))
    except FileNotFoundError:
        if required:
            print(f"\n[ERROR] File not found: {filename}")
            print("        Run the ROQS analysis before converting to JSON.")
            raise
        return pd.DataFrame()


# ── Metadata builder ──────────────────────────────────────────────────────────

def _build_metadata() -> dict:
    """Collect run provenance information for scientific reproducibility."""

    # Software version from package.json at project root
    version = "unknown"
    pkg_json = os.path.join(_PROJECT_DIR, "package.json")
    try:
        with open(pkg_json, "r", encoding="utf-8") as f:
            version = json.load(f).get("version", "unknown")
    except Exception:
        pass

    # Active CNN checkpoint
    checkpoint = "unknown"
    peso_dir = os.path.join(_CNN_DIR, "peso")
    if os.path.isdir(peso_dir):
        ckpts = [f for f in os.listdir(peso_dir) if f.endswith(".ckpt")]
        if ckpts:
            # Use the same one main3D.py selects
            preferred = "3DExperimentV2_ManualMask_FAepoch=362-val_loss=0.13.ckpt"
            checkpoint = preferred if preferred in ckpts else ckpts[0]

    # Key package versions
    packages = {}
    for pkg in ("torch", "monai", "dipy", "nibabel", "numpy",
                "scikit-image", "scikit-learn", "scipy", "pandas",
                "pytorch-lightning"):
        try:
            packages[pkg] = importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            packages[pkg] = "not installed"

    return {
        "inCCsight_version": version,
        "run_timestamp":     datetime.datetime.utcnow().isoformat() + "Z",
        "model_checkpoint":  checkpoint,
        "python_packages":   packages,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    groups_map = _load_groups_map()

    # ── Removed subjects list (optional — managed by QC panel) ──────────────
    _REMOVED_FILE = os.path.join(_HERE, "removed_subjects.json")
    _removed_ids: set = set()
    try:
        with open(_REMOVED_FILE, "r", encoding="utf-8") as f:
            _rm_data = json.load(f)
            _removed_ids = set(_rm_data.get("ids", []))
        if _removed_ids:
            print(f"[OK] removed_subjects.json: {len(_removed_ids)} subject(s) excluded from analysis", flush=True)
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"[WARNING] Could not read removed_subjects.json: {exc}", flush=True)

    # ── ViT QC scores (optional — produced by methods/qc/run_qc.py) ─────────
    _VIT_QC_FILE = os.path.join(_HERE, "vit_qc_scores.csv")
    _vit_qc_by_subject: dict = {}   # subject_name → {roqs_prob, roqs_flag, …}
    try:
        vit_qc_df = pd.read_csv(_VIT_QC_FILE)
        for _, row in vit_qc_df.iterrows():
            raw = str(row["subject"])
            if raw.startswith("Subject_"):
                raw = raw[len("Subject_"):]
            key = raw.zfill(7)
            _vit_qc_by_subject[key] = row.to_dict()
        print(f"[OK] vit_qc_scores.csv loaded: {len(_vit_qc_by_subject)} subject(s)", flush=True)
    except FileNotFoundError:
        print("[INFO] vit_qc_scores.csv not found — QC scores will be empty.", flush=True)
    except Exception as exc:
        print(f"[WARNING] Could not read vit_qc_scores.csv: {exc}", flush=True)

    # ── Read required CSVs ────────────────────────────────────────────────────
    roqs_scalar_raw = _read_csv("ROQS_scalar_statistics.csv")
    img_paths       = (roqs_scalar_raw["img_path"].tolist()
                       if "img_path" in roqs_scalar_raw.columns else [])
    roqs_qc_flags   = (roqs_scalar_raw["qc_flag"].tolist()
                       if "qc_flag" in roqs_scalar_raw.columns else [])
    roqs_qc_probs   = (roqs_scalar_raw["qc_prob"].tolist()
                       if "qc_prob" in roqs_scalar_raw.columns else [])

    # ── Shape metrics (new columns, optional for backward compat) ────────────
    _SHAPE_COLS = ["shape_area", "shape_cc_length", "shape_max_thickness",
                   "shape_mean_thickness", "shape_cci"]
    roqs_shape_rows = []
    if all(c in roqs_scalar_raw.columns for c in _SHAPE_COLS):
        for _, row in roqs_scalar_raw.iterrows():
            roqs_shape_rows.append({
                "area":            _safe_num(row["shape_area"]),
                "cc_length":       _safe_num(row["shape_cc_length"]),
                "max_thickness":   _safe_num(row["shape_max_thickness"]),
                "mean_thickness":  _safe_num(row["shape_mean_thickness"]),
                "cci":             _safe_num(row["shape_cci"]),
            })

    roqs_scalar     = roqs_scalar_raw.drop(
        columns=["img_path", "qc_flag", "qc_prob"] + _SHAPE_COLS, errors="ignore"
    )

    watershed_scalar_raw = _read_csv("Watershed_scalar_statistics.csv")
    water_qc_flags  = (watershed_scalar_raw["qc_flag"].tolist()
                       if "qc_flag" in watershed_scalar_raw.columns else [])
    water_qc_probs  = (watershed_scalar_raw["qc_prob"].tolist()
                       if "qc_prob" in watershed_scalar_raw.columns else [])
    watershed_scalar = watershed_scalar_raw.drop(
        columns=["img_path", "qc_flag", "qc_prob"], errors="ignore"
    )

    # CNN scalar lookup
    _cnn_scalar_by_name: dict = {}
    cnn_base_file = os.path.join(_HERE, "cnn_based.csv")
    try:
        cnn_base_raw = _drop_unnamed(pd.read_csv(cnn_base_file, sep=";"))
        if not cnn_base_raw.empty and "Names" in cnn_base_raw.columns:
            for _, row in cnn_base_raw.iterrows():
                key = str(row["Names"])
                _cnn_scalar_by_name[key] = {
                    k: v for k, v in row.items()
                    if k not in ("Names", "Time") and pd.notna(v)
                }
    except FileNotFoundError:
        pass

    # Midlines
    roqs_midlines      = _df_parse_lists(_read_csv("ROQS_scalar_midlines.csv"))
    watershed_midlines = _df_parse_lists(_read_csv("Watershed_scalar_midlines.csv"))

    # Thickness
    roqs_thickness      = _read_csv("ROQS_dict_thickness.csv")
    watershed_thickness = _read_csv("Watershed_dict_thickness.csv")

    # Parcellations
    roqs_parcellation      = _read_csv("ROQS_parcellation_statistics.csv")
    watershed_parcellation = _read_csv("Watershed_parcellation_statistics.csv")
    cnn_parcellation_df    = _read_csv("CNN_parcellation_statistics.csv", required=False)

    # CNN midlines (index_col=0 preserves subject names as index)
    cnn_mid_file = os.path.join(_HERE, "CNN_scalar_midlines.csv")
    try:
        cnn_midlines_df = _df_parse_lists(
            pd.read_csv(cnn_mid_file, sep=";", index_col=0)
        )
    except FileNotFoundError:
        cnn_midlines_df = pd.DataFrame()

    # Build name-keyed lookups
    _cnn_parc_by_name: dict = {}
    if not cnn_parcellation_df.empty and "Name" in cnn_parcellation_df.columns:
        for _, row in cnn_parcellation_df.iterrows():
            _cnn_parc_by_name[str(row["Name"])] = row.to_dict()

    _cnn_mid_by_name: dict = {}
    if not cnn_midlines_df.empty:
        for idx, row in cnn_midlines_df.iterrows():
            _cnn_mid_by_name[str(idx)] = row.to_dict()

    names = list(roqs_parcellation["Name"])

    # ── Build subjects ────────────────────────────────────────────────────────
    subjects_list = []
    for i, name in enumerate(names):
        # Normalise name the same way Subject does (strip Subject_ prefix, zfill 7)
        norm_name = str(name)
        if norm_name.startswith("Subject_"):
            norm_name = norm_name[len("Subject_"):]
        norm_name = norm_name.zfill(7)

        # ── ViT QC scores (override old SVM scores when available) ───────────
        vit_row = _vit_qc_by_subject.get(norm_name, {})

        def _vit(field, fallback):
            v = vit_row.get(field)
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return fallback
            return v

        roqs_flag   = _vit("roqs_flag",      roqs_qc_flags[i] if i < len(roqs_qc_flags) else None)
        roqs_prob   = _vit("roqs_prob",       roqs_qc_probs[i] if i < len(roqs_qc_probs) else None)
        water_flag  = _vit("watershed_flag",  water_qc_flags[i] if i < len(water_qc_flags) else None)
        water_prob  = _vit("watershed_prob",  water_qc_probs[i] if i < len(water_qc_probs) else None)
        cnn_flag    = _vit("cnn_flag",        None)
        cnn_prob    = _vit("cnn_prob",        None)

        sub = Subject(
            name,
            watershed_scalar.iloc[i],
            roqs_scalar.iloc[i],
            watershed_midlines.iloc[i],
            roqs_midlines.iloc[i],
            watershed_thickness.iloc[i],
            roqs_thickness.iloc[i],
            watershed_parcellation.iloc[i],
            roqs_parcellation.iloc[i],
            img_path          = img_paths[i] if i < len(img_paths) else "",
            roqs_qc_flag      = roqs_flag,
            roqs_qc_prob      = roqs_prob,
            watershed_qc_flag = water_flag,
            watershed_qc_prob = water_prob,
            cnn_qc_flag       = cnn_flag,
            cnn_qc_prob       = cnn_prob,
            cnn_parcellation  = _cnn_parc_by_name.get(str(name), {}),
            cnn_midlines      = _cnn_mid_by_name.get(str(name), {}),
            cnn_scalar        = _cnn_scalar_by_name.get(str(name), {}),
            groups_map        = groups_map,
            roqs_shape        = roqs_shape_rows[i] if i < len(roqs_shape_rows) else {},
            removed           = norm_name in _removed_ids,
        )
        subjects_list.append(sub.to_dict())

    # ── Remove subjects with NaN values (skip if already marked removed) ─────
    clean, nan_dropped = [], []
    for s in subjects_list:
        if not s.get("removed") and _has_nan(s):
            nan_dropped.append(s["Id"])
        else:
            clean.append(s)
    if nan_dropped:
        print(
            f"[WARNING] {len(nan_dropped)} subject(s) dropped due to NaN values: {nan_dropped}",
            flush=True,
        )
    subjects_list = clean

    # ── Assemble output with metadata ─────────────────────────────────────────
    metadata = _build_metadata()
    output = {
        "_metadata": metadata,
        "subjects":  subjects_list,
    }

    # ── Write JSON ────────────────────────────────────────────────────────────
    os.makedirs(_OUTPUT_DIR, exist_ok=True)
    with open(_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(
        f"[OK] {len(subjects_list)} subject(s) exported to {_OUTPUT_FILE}",
        flush=True,
    )
    print(f"[OK] Run timestamp: {metadata['run_timestamp']}", flush=True)
    print(f"[OK] Model checkpoint: {metadata['model_checkpoint']}", flush=True)


if __name__ == "__main__":
    main()
