"""
main.py — Tractography pipeline entry point.

For each subject folder:
  1. Load eigenvalues (L1/L2/L3) and compute FA
  2. Load principal eigenvector (V1)
  3. Build CC mask — prefer cnnBased.nii.gz, fallback to FA threshold
  4. Seed uniformly from mask voxels
  5. Run bidirectional deterministic tracking
  6. Filter callosal streamlines (endpoints span midsagittal plane)
  7. Assign Witelson regions (5 regions along AP axis)
  8. Save tracts.json and tract_stats.csv per subject

Usage:
    python main.py -p /data/group_folder [--max-seeds 600]
"""
import argparse
import csv
import glob
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import nibabel as nib
except ImportError:
    print("[ERROR] nibabel is required for tractography.", flush=True)
    sys.exit(1)

from tracker import track

# ── Witelson 5-region AP bounds (fractions of ny) ────────────────────────────
_W_BOUNDS = [0.0, 1/3, 1/2, 2/3, 4/5, 1.0]


def _find_nii(folder, stem):
    for ext in ('.nii.gz', '.nii'):
        p = os.path.join(folder, f'{stem}{ext}')
        if os.path.isfile(p):
            return p
    return None


def _load_vol(path):
    img = nib.load(path)
    data = img.get_fdata(dtype=np.float32)
    return data, img.affine, img.header


def _voxel_size(header):
    z = header.get_zooms()
    return tuple(float(z[i]) if i < len(z) else 1.0 for i in range(3))


def _compute_fa(l1, l2, l3):
    md = (l1 + l2 + l3) / 3.0
    num = np.sqrt(0.5 * ((l1 - md)**2 + (l2 - md)**2 + (l3 - md)**2))
    den = np.sqrt(l1**2 + l2**2 + l3**2 + 1e-10)
    return np.clip(num / den, 0.0, 1.0)


def _build_mask(subj_folder, fa, nx):
    """CNN mask preferred; fallback to FA > 0.25 in central x-band."""
    cnn = _find_nii(subj_folder, 'cnnBased')
    if cnn:
        try:
            mask_data = nib.load(cnn).get_fdata(dtype=np.float32)
            mask = mask_data > 0.5
            if mask.sum() > 50:
                print(f"    [mask] CNN — {mask.sum()} voxels", flush=True)
                return mask
        except Exception as e:
            print(f"    [mask] CNN load failed: {e}", flush=True)
    print(f"    [mask] FA threshold fallback", flush=True)
    m = np.zeros(fa.shape, dtype=bool)
    x0, x1 = int(nx * 0.4), int(nx * 0.6)
    m[x0:x1] = fa[x0:x1] > 0.25
    return m


def _filter_callosal(streamlines, fa_along, nx, margin=5):
    """Keep streamlines whose endpoints straddle the midsagittal plane."""
    mid = nx / 2.0
    sl_out, fa_out = [], []
    for sl, fa_v in zip(streamlines, fa_along):
        xs = [sl[0, 0], sl[-1, 0]]
        if min(xs) < mid - margin and max(xs) > mid + margin:
            sl_out.append(sl)
            fa_out.append(fa_v)
    return sl_out, fa_out


def _assign_witelson(streamlines, ny):
    """Assign each streamline to Witelson region 1–5 by mean AP (y) coordinate."""
    bounds = [b * ny for b in _W_BOUNDS]
    regions = []
    for sl in streamlines:
        my = float(np.mean(sl[:, 1]))
        reg = 5
        for r, (lo, hi) in enumerate(zip(bounds[:-1], bounds[1:])):
            if lo <= my < hi:
                reg = r + 1
                break
        regions.append(reg)
    return regions


def _stats(streamlines, fa_along, regions):
    s = {'total_streamlines': len(streamlines)}
    if not streamlines:
        return s
    lengths = [float(np.sum(np.linalg.norm(np.diff(sl, axis=0), axis=1))) for sl in streamlines]
    s['mean_length_vox'] = round(float(np.mean(lengths)), 3)
    s['std_length_vox']  = round(float(np.std(lengths)),  3)
    s['mean_fa']         = round(float(np.mean([np.mean(f) for f in fa_along])), 4)
    for r in range(1, 6):
        idxs = [i for i, reg in enumerate(regions) if reg == r]
        s[f'W{r}_count']   = len(idxs)
        s[f'W{r}_mean_fa'] = round(float(np.mean([np.mean(fa_along[i]) for i in idxs])), 4) if idxs else None
    return s


def process_subject(subj_folder, max_seeds=600):
    name = os.path.basename(subj_folder)
    print(f"  {name}", flush=True)

    l1_p = _find_nii(subj_folder, 'dti_L1')
    v1_p = _find_nii(subj_folder, 'dti_V1')
    if not l1_p or not v1_p:
        print(f"    [SKIP] dti_L1 or dti_V1 missing", flush=True)
        return None

    l1, _, header = _load_vol(l1_p)
    l2_p = _find_nii(subj_folder, 'dti_L2')
    l3_p = _find_nii(subj_folder, 'dti_L3')
    l2 = _load_vol(l2_p)[0] if l2_p else np.zeros_like(l1)
    l3 = _load_vol(l3_p)[0] if l3_p else np.zeros_like(l1)

    v1_data = nib.load(v1_p).get_fdata(dtype=np.float32)
    if v1_data.ndim != 4 or v1_data.shape[3] < 3:
        print(f"    [SKIP] dti_V1 unexpected shape {v1_data.shape}", flush=True)
        return None
    v1 = v1_data[:, :, :, :3]

    nx, ny, nz = l1.shape
    dx, dy, dz = _voxel_size(header)
    fa = _compute_fa(l1, l2, l3)

    mask = _build_mask(subj_folder, fa, nx)
    mask_vox = np.argwhere(mask)
    if len(mask_vox) == 0:
        print(f"    [SKIP] empty mask", flush=True)
        return None

    rng = np.random.default_rng(42)
    n = min(max_seeds, len(mask_vox))
    seeds = mask_vox[rng.choice(len(mask_vox), n, replace=False)].astype(float)
    seeds += rng.uniform(-0.4, 0.4, seeds.shape)
    print(f"    [track] {n} seeds / {len(mask_vox)} mask voxels", flush=True)

    streamlines, fa_along = track(v1, fa, seeds)
    print(f"    [track] {len(streamlines)} raw streamlines", flush=True)

    streamlines, fa_along = _filter_callosal(streamlines, fa_along, nx)
    print(f"    [track] {len(streamlines)} callosal streamlines", flush=True)

    if not streamlines:
        print(f"    [WARN] no callosal streamlines", flush=True)
        return None

    regions = _assign_witelson(streamlines, ny)
    stats = _stats(streamlines, fa_along, regions)
    stats['subject'] = name

    tracts_path = os.path.join(subj_folder, 'tracts.json')
    with open(tracts_path, 'w') as f:
        json.dump({
            'nx': int(nx), 'ny': int(ny), 'nz': int(nz),
            'dx': float(dx), 'dy': float(dy), 'dz': float(dz),
            'streamlines': [sl.tolist() for sl in streamlines],
            'fa_along':    [fa.tolist() for fa in fa_along],
            'regions':     regions,
        }, f, separators=(',', ':'))
    print(f"    [save] tracts.json ({len(streamlines)} streamlines)", flush=True)

    csv_path = os.path.join(subj_folder, 'tract_stats.csv')
    row = {k: v for k, v in stats.items() if k != 'subject'}
    with open(csv_path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        w.writeheader()
        w.writerow(row)

    return stats


def is_subject_folder(path):
    for ext in ('.nii.gz', '.nii'):
        if os.path.isfile(os.path.join(path, f'dti_L1{ext}')):
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description='Deterministic tractography pipeline')
    parser.add_argument('-p', '--path', nargs='+', required=True)
    parser.add_argument('--max-seeds', type=int, default=600)
    args = parser.parse_args()

    subjects = []
    for root in args.path:
        root = os.path.abspath(root)
        if not os.path.isdir(root):
            print(f"[WARN] not a directory: {root}", flush=True)
            continue
        if is_subject_folder(root):
            subjects.append(root)
        else:
            subjects.extend(sorted(
                d for d in glob.glob(os.path.join(root, '*'))
                if os.path.isdir(d) and is_subject_folder(d)
            ))

    total = len(subjects)
    print(f"\n  Tractography — {total} subject(s)", flush=True)
    print(f"PROGRESS:0:{total}:Tractography", flush=True)

    done = 0
    for subj in subjects:
        process_subject(subj, args.max_seeds)
        done += 1
        print(f"PROGRESS:{done}:{total}:Tractography", flush=True)

    print(f"\n[OK] Tractography done ({done}/{total} subjects)", flush=True)
    print(f"PROGRESS:{total}:{total}:Tractography complete", flush=True)


if __name__ == '__main__':
    main()
