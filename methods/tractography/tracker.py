"""
tracker.py — Deterministic streamline tractography (pure numpy).

Bidirectional EuDX-style tracking:
  - Trilinear interpolation for FA (scalar) and V1 (4D principal eigenvector)
  - Stop criteria: FA < threshold, curvature > max_angle, out of bounds
"""
import numpy as np


def _lerp_scalar(vol, fi, fj, fk):
    """Trilinear interpolation on a 3D float array. Returns None if out of bounds."""
    nx, ny, nz = vol.shape
    i0, j0, k0 = int(fi), int(fj), int(fk)
    i1, j1, k1 = i0 + 1, j0 + 1, k0 + 1
    if i0 < 0 or j0 < 0 or k0 < 0 or i1 >= nx or j1 >= ny or k1 >= nz:
        return None
    di, dj, dk = fi - i0, fj - j0, fk - k0
    return float(
        vol[i0, j0, k0] * (1-di)*(1-dj)*(1-dk) + vol[i1, j0, k0] * di*(1-dj)*(1-dk) +
        vol[i0, j1, k0] * (1-di)*dj*(1-dk)     + vol[i1, j1, k0] * di*dj*(1-dk)     +
        vol[i0, j0, k1] * (1-di)*(1-dj)*dk     + vol[i1, j0, k1] * di*(1-dj)*dk     +
        vol[i0, j1, k1] * (1-di)*dj*dk         + vol[i1, j1, k1] * di*dj*dk
    )


def _lerp_vec(vol4d, fi, fj, fk):
    """Trilinear interpolation on a (nx,ny,nz,3) vector field. Returns None if OOB."""
    nx, ny, nz = vol4d.shape[:3]
    i0, j0, k0 = int(fi), int(fj), int(fk)
    i1, j1, k1 = i0 + 1, j0 + 1, k0 + 1
    if i0 < 0 or j0 < 0 or k0 < 0 or i1 >= nx or j1 >= ny or k1 >= nz:
        return None
    di, dj, dk = fi - i0, fj - j0, fk - k0
    v = (
        vol4d[i0, j0, k0] * (1-di)*(1-dj)*(1-dk) + vol4d[i1, j0, k0] * di*(1-dj)*(1-dk) +
        vol4d[i0, j1, k0] * (1-di)*dj*(1-dk)     + vol4d[i1, j1, k0] * di*dj*(1-dk)     +
        vol4d[i0, j0, k1] * (1-di)*(1-dj)*dk     + vol4d[i1, j0, k1] * di*(1-dj)*dk     +
        vol4d[i0, j1, k1] * (1-di)*dj*dk         + vol4d[i1, j1, k1] * di*dj*dk
    )
    norm = np.linalg.norm(v)
    return v / norm if norm > 1e-8 else None


def _track_one_dir(v1, fa, seed, init_dir, step, fa_thresh, cos_thresh, max_steps):
    """
    Track from seed in one direction.
    Returns (list[ndarray(3)], list[float]) — voxel coordinates and FA values.
    """
    points, fa_vals = [], []
    pos = seed.copy().astype(float)
    direction = init_dir.copy()

    for _ in range(max_steps):
        fa_val = _lerp_scalar(fa, pos[0], pos[1], pos[2])
        if fa_val is None or fa_val < fa_thresh:
            break
        points.append(pos.copy())
        fa_vals.append(fa_val)

        v = _lerp_vec(v1, pos[0], pos[1], pos[2])
        if v is None:
            break
        if np.dot(v, direction) < 0:
            v = -v
        if np.dot(direction, v) < cos_thresh:
            break
        direction = v
        pos = pos + step * direction

    return points, fa_vals


def track(v1, fa, seeds, step=0.5, fa_thresh=0.2, max_angle_deg=60.0, max_steps=400, min_length=15.0):
    """
    Bidirectional deterministic tractography from seed points.

    Parameters
    ----------
    v1          : ndarray (nx, ny, nz, 3)  principal eigenvector field
    fa          : ndarray (nx, ny, nz)     fractional anisotropy
    seeds       : ndarray (N, 3)           seed coordinates in voxel space
    step        : float  step size in voxels
    fa_thresh   : float  stop threshold
    max_angle_deg : float  max turning angle per step
    max_steps   : int    max steps per half-streamline
    min_length  : float  minimum length in voxels (drop shorter streamlines)

    Returns
    -------
    streamlines : list of ndarray (n, 3)
    fa_along    : list of ndarray (n,)
    """
    cos_thresh = np.cos(np.radians(max_angle_deg))
    streamlines, fa_along = [], []

    for seed in seeds:
        seed = seed.astype(float)
        v0 = _lerp_vec(v1, seed[0], seed[1], seed[2])
        if v0 is None:
            continue

        fwd_pts, fwd_fa = _track_one_dir(v1, fa, seed,  v0, step, fa_thresh, cos_thresh, max_steps)
        bwd_pts, bwd_fa = _track_one_dir(v1, fa, seed, -v0, step, fa_thresh, cos_thresh, max_steps)

        if not fwd_pts and not bwd_pts:
            continue

        all_pts = list(reversed(bwd_pts)) + fwd_pts
        all_fa  = list(reversed(bwd_fa))  + fwd_fa

        if len(all_pts) < 2:
            continue

        pts_arr = np.array(all_pts)
        length = float(np.sum(np.linalg.norm(np.diff(pts_arr, axis=0), axis=1)))
        if length < min_length:
            continue

        streamlines.append(pts_arr)
        fa_along.append(np.array(all_fa))

    return streamlines, fa_along
