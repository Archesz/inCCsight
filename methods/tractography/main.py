"""
main.py — Tractography pipeline entry point.

For each subject folder:
  1. Load eigenvalues (L1/L2/L3) and compute FA
  2. Load principal eigenvector (V1)
  3. Build CC mask — prefer cnnBased.nii.gz, fallback to FA threshold
  4. Seed uniformly from mask voxels (with sub-voxel jitter)
  5. Run bidirectional probabilistic tracking (numba-accelerated)
  6. Filter callosal streamlines (endpoints span midsagittal plane)
  7. Assign Witelson regions (5 regions along AP axis)
  8. Save tracts.json and tract_stats.csv per subject

Usage:
    python main.py -p /data/group_folder \\
        [--max-seeds 2000] [--samples-per-seed 10] [--sigma-scale 0.6]
"""
import argparse
import csv
import glob
import json
import os
import sys
import time

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


def _filter_callosal(streamlines, fa_along, nx, mask, margin=5):
    """Keep streamlines that:
      1. Have endpoints straddling the midsagittal plane (x-axis), AND
      2. Have their midpoint inside (or within 2 voxels of) the CC mask.

    The midpoint check removes anatomically implausible streamlines that start
    inside the CC but then diverge toward the brainstem or cerebellum.
    """
    mid = nx / 2.0
    mx, my, mz = mask.shape
    sl_out, fa_out = [], []
    for sl, fa_v in zip(streamlines, fa_along):
        # --- criterion 1: endpoints span the midline ---
        xs = [sl[0, 0], sl[-1, 0]]
        if not (min(xs) < mid - margin and max(xs) > mid + margin):
            continue
        # --- criterion 2: midpoint lies in the CC mask ---
        mid_pt = sl[len(sl) // 2]
        ix = int(np.clip(np.round(mid_pt[0]), 0, mx - 1))
        iy = int(np.clip(np.round(mid_pt[1]), 0, my - 1))
        iz = int(np.clip(np.round(mid_pt[2]), 0, mz - 1))
        if not mask[ix, iy, iz]:
            continue
        sl_out.append(sl)
        fa_out.append(fa_v)
    return sl_out, fa_out


def _assign_witelson(streamlines, ny):          # ny kept for API compatibility but unused
    """Assign each streamline to Witelson region 1–5.

    Normalises by the CC's own AP (Y) extent — the same approach used by the
    3D surface parcellation in the browser — so all 5 regions are always
    populated and the colour assignment is consistent between surface and tracts.

    This matches the spirit of Witelson (1989), which divides the CC into
    fractions of its *own* anterior-to-posterior length, not the image extent.
    """
    if not streamlines:
        return []
    all_y = np.concatenate([sl[:, 1] for sl in streamlines])
    y_min, y_max = float(all_y.min()), float(all_y.max())
    y_range = y_max - y_min or 1.0

    regions = []
    for sl in streamlines:
        f = (float(np.mean(sl[:, 1])) - y_min) / y_range
        if   f < 1/3: reg = 1
        elif f < 1/2: reg = 2
        elif f < 2/3: reg = 3
        elif f < 4/5: reg = 4
        else:         reg = 5
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


def process_subject(subj_folder, max_seeds=2000, samples_per_seed=10,
                    sigma_scale=0.4, fa_thresh=0.15, max_angle=55.0,
                    max_save_streamlines=10000):
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
    print(f"    [track] {n} seeds x {samples_per_seed} samples "
          f"(sigma={sigma_scale}, FA>={fa_thresh}, max_angle={max_angle}deg, "
          f"min_length=25vox, midpoint_mask_filter=ON) / "
          f"{len(mask_vox)} mask voxels", flush=True)

    t0 = time.time()
    streamlines, fa_along = track(
        v1, fa, seeds,
        fa_thresh=fa_thresh,
        max_angle_deg=max_angle,
        samples_per_seed=samples_per_seed,
        sigma_scale=sigma_scale,
    )
    dt = time.time() - t0
    print(f"    [track] {len(streamlines)} raw streamlines in {dt:.1f}s "
          f"({len(streamlines)/max(dt, 1e-6):.0f}/s)", flush=True)

    streamlines, fa_along = _filter_callosal(streamlines, fa_along, nx, mask)
    print(f"    [track] {len(streamlines)} callosal streamlines", flush=True)

    if not streamlines:
        print(f"    [WARN] no callosal streamlines", flush=True)
        return None

    regions = _assign_witelson(streamlines, ny)
    stats = _stats(streamlines, fa_along, regions)
    stats['subject'] = name

    # Stats are computed on ALL surviving streamlines; the JSON we ship to the
    # frontend is capped so the browser stays responsive on the volumetric view.
    n_total = len(streamlines)
    if n_total > max_save_streamlines:
        sel = np.random.default_rng(7).choice(n_total, max_save_streamlines, replace=False)
        sel.sort()
        streamlines_vis = [streamlines[i] for i in sel]
        fa_along_vis    = [fa_along[i]    for i in sel]
        regions_vis     = [regions[i]     for i in sel]
        print(f"    [save] sub-sampled {max_save_streamlines}/{n_total} "
              f"streamlines for visualization", flush=True)
    else:
        streamlines_vis = streamlines
        fa_along_vis    = fa_along
        regions_vis     = regions

    tracts_path = os.path.join(subj_folder, 'tracts.json')
    with open(tracts_path, 'w') as f:
        json.dump({
            'nx': int(nx), 'ny': int(ny), 'nz': int(nz),
            'dx': float(dx), 'dy': float(dy), 'dz': float(dz),
            'streamlines': [sl.tolist() for sl in streamlines_vis],
            'fa_along':    [fa.tolist() for fa in fa_along_vis],
            'regions':     regions_vis,
        }, f, separators=(',', ':'))
    print(f"    [save] tracts.json ({len(streamlines_vis)} streamlines)", flush=True)

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
    parser = argparse.ArgumentParser(description='Probabilistic tractography pipeline')
    parser.add_argument('-p', '--path', nargs='+', required=True)
    parser.add_argument('--max-seeds',        type=int,   default=2000,
                        help='Maximum number of unique seed voxels to sample (default: 2000)')
    parser.add_argument('--samples-per-seed', type=int,   default=10,
                        help='Probabilistic samples per seed (default: 10). Use 1 for deterministic.')
    parser.add_argument('--sigma-scale',      type=float, default=0.4,
                        help='Tangent-plane perturbation sigma at FA=0 (default: 0.4). 0 = deterministic.')
    parser.add_argument('--fa-thresh',        type=float, default=0.15,
                        help='Minimum FA to keep tracking (default: 0.15)')
    parser.add_argument('--max-angle',        type=float, default=55.0,
                        help='Maximum curvature per step, degrees (default: 55)')
    parser.add_argument('--max-save-streamlines', type=int, default=10000,
                        help='Cap streamlines written to tracts.json (default: 10000). '
                             'Stats are still computed on the full set.')
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
        process_subject(
            subj,
            max_seeds=args.max_seeds,
            samples_per_seed=args.samples_per_seed,
            sigma_scale=args.sigma_scale,
            fa_thresh=args.fa_thresh,
            max_angle=args.max_angle,
            max_save_streamlines=args.max_save_streamlines,
        )
        done += 1
        print(f"PROGRESS:{done}:{total}:Tractography", flush=True)

    print(f"\n[OK] Tractography done ({done}/{total} subjects)", flush=True)
    print(f"PROGRESS:{total}:{total}:Tractography complete", flush=True)


if __name__ == '__main__':
    main()
