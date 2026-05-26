"""
tracker.py — Probabilistic streamline tractography (numba-accelerated).

Each step:
  1. Trilinearly interpolate FA at the current position
  2. Stop if FA < threshold or out of bounds
  3. Trilinearly interpolate v1 (principal eigenvector)
  4. Resolve sign against the previous direction
  5. Sample a perturbed direction from a Gaussian on the tangent plane
     of v1, with σ ∝ (1 − FA)  →  highly anisotropic voxels stay tight,
     low-FA voxels sample broadly
  6. Stop if curvature > max_angle
  7. Step `step` voxels in the sampled direction

Behaviour control:
  - sigma_scale = 0          → deterministic EuDX (back-compat)
  - sigma_scale > 0          → probabilistic; combine with samples_per_seed > 1
  - samples_per_seed = K     → K distinct streamlines per seed, each sampling
                                a different realisation of the orientation pdf

Numba is optional: when missing, the @njit decorator becomes a no-op and the
code runs in pure Python (much slower but functionally identical).
"""
import numpy as np

try:
    from numba import njit
    _HAS_NUMBA = True
except ImportError:                                      # pragma: no cover
    _HAS_NUMBA = False
    def njit(*args, **kwargs):
        """Identity decorator when numba is unavailable."""
        if args and callable(args[0]):
            return args[0]
        def _wrap(fn): return fn
        return _wrap


# ── Trilinear interpolation ──────────────────────────────────────────────────

@njit(cache=True, fastmath=True)
def _lerp_scalar(vol, fi, fj, fk):
    """Sample a 3D scalar volume at fractional voxel (fi, fj, fk).

    Returns -1.0 as the out-of-bounds sentinel (FA is always non-negative).
    """
    nx, ny, nz = vol.shape
    i0 = int(fi); j0 = int(fj); k0 = int(fk)
    i1 = i0 + 1; j1 = j0 + 1; k1 = k0 + 1
    if i0 < 0 or j0 < 0 or k0 < 0 or i1 >= nx or j1 >= ny or k1 >= nz:
        return -1.0
    di = fi - i0; dj = fj - j0; dk = fk - k0
    return (
        vol[i0, j0, k0] * (1-di)*(1-dj)*(1-dk) + vol[i1, j0, k0] * di*(1-dj)*(1-dk) +
        vol[i0, j1, k0] * (1-di)*dj*(1-dk)     + vol[i1, j1, k0] * di*dj*(1-dk)     +
        vol[i0, j0, k1] * (1-di)*(1-dj)*dk     + vol[i1, j0, k1] * di*(1-dj)*dk     +
        vol[i0, j1, k1] * (1-di)*dj*dk         + vol[i1, j1, k1] * di*dj*dk
    )


@njit(cache=True, fastmath=True)
def _lerp_vec(vol4d, fi, fj, fk, out):
    """Sample a (nx,ny,nz,3) vector field; write the unit vector into out[3].

    Returns the magnitude before normalization (0.0 if OOB or zero vector).
    """
    nx, ny, nz = vol4d.shape[0], vol4d.shape[1], vol4d.shape[2]
    i0 = int(fi); j0 = int(fj); k0 = int(fk)
    i1 = i0 + 1; j1 = j0 + 1; k1 = k0 + 1
    if i0 < 0 or j0 < 0 or k0 < 0 or i1 >= nx or j1 >= ny or k1 >= nz:
        out[0] = 0.0; out[1] = 0.0; out[2] = 0.0
        return 0.0
    di = fi - i0; dj = fj - j0; dk = fk - k0
    w000 = (1-di)*(1-dj)*(1-dk); w100 = di*(1-dj)*(1-dk)
    w010 = (1-di)*dj*(1-dk);     w110 = di*dj*(1-dk)
    w001 = (1-di)*(1-dj)*dk;     w101 = di*(1-dj)*dk
    w011 = (1-di)*dj*dk;         w111 = di*dj*dk
    for c in range(3):
        out[c] = (
            vol4d[i0, j0, k0, c] * w000 + vol4d[i1, j0, k0, c] * w100 +
            vol4d[i0, j1, k0, c] * w010 + vol4d[i1, j1, k0, c] * w110 +
            vol4d[i0, j0, k1, c] * w001 + vol4d[i1, j0, k1, c] * w101 +
            vol4d[i0, j1, k1, c] * w011 + vol4d[i1, j1, k1, c] * w111
        )
    n = np.sqrt(out[0]*out[0] + out[1]*out[1] + out[2]*out[2])
    if n > 1e-8:
        out[0] /= n; out[1] /= n; out[2] /= n
    return n


# ── Direction sampling ──────────────────────────────────────────────────────

@njit(cache=True, fastmath=True)
def _perturb_direction(v_mean, fa, sigma_scale, out):
    """Sample a unit direction near v_mean.

    Builds an orthonormal basis (v_mean, t1, t2) and perturbs in the
    (t1, t2) tangent plane with Gaussian noise of std σ = sigma_scale·(1−FA).
    A sigma_scale of 0 returns v_mean unchanged (deterministic).
    """
    if sigma_scale <= 0.0:
        out[0] = v_mean[0]; out[1] = v_mean[1]; out[2] = v_mean[2]
        return

    # Pick an axis poorly aligned with v_mean (smallest |component|)
    ax = abs(v_mean[0]); ay = abs(v_mean[1]); az = abs(v_mean[2])
    if ax <= ay and ax <= az:
        tx = 1.0; ty = 0.0; tz = 0.0
    elif ay <= az:
        tx = 0.0; ty = 1.0; tz = 0.0
    else:
        tx = 0.0; ty = 0.0; tz = 1.0

    # t1 = v_mean × t, normalized
    t1x = v_mean[1]*tz - v_mean[2]*ty
    t1y = v_mean[2]*tx - v_mean[0]*tz
    t1z = v_mean[0]*ty - v_mean[1]*tx
    n1 = np.sqrt(t1x*t1x + t1y*t1y + t1z*t1z)
    if n1 < 1e-8:
        out[0] = v_mean[0]; out[1] = v_mean[1]; out[2] = v_mean[2]
        return
    t1x /= n1; t1y /= n1; t1z /= n1
    # t2 = v_mean × t1  (already unit because v_mean and t1 are)
    t2x = v_mean[1]*t1z - v_mean[2]*t1y
    t2y = v_mean[2]*t1x - v_mean[0]*t1z
    t2z = v_mean[0]*t1y - v_mean[1]*t1x

    # σ shrinks with FA — saturate to [0,1] just in case
    fa_c = fa
    if fa_c < 0.0: fa_c = 0.0
    if fa_c > 1.0: fa_c = 1.0
    sigma = sigma_scale * (1.0 - fa_c)

    a = np.random.normal(0.0, sigma)
    b = np.random.normal(0.0, sigma)

    dx = v_mean[0] + a*t1x + b*t2x
    dy = v_mean[1] + a*t1y + b*t2y
    dz = v_mean[2] + a*t1z + b*t2z
    n = np.sqrt(dx*dx + dy*dy + dz*dz)
    if n < 1e-8:
        out[0] = v_mean[0]; out[1] = v_mean[1]; out[2] = v_mean[2]
        return
    out[0] = dx/n; out[1] = dy/n; out[2] = dz/n


# ── One-sided streamline ────────────────────────────────────────────────────

@njit(cache=True, fastmath=True)
def _track_one_dir(v1, fa, seed_x, seed_y, seed_z, dir_x, dir_y, dir_z,
                   step, fa_thresh, cos_thresh, max_steps, sigma_scale,
                   out_points, out_fa):
    """Track from (seed_x,y,z) along (dir_x,y,z). Returns the number of points written."""
    pos_x = seed_x; pos_y = seed_y; pos_z = seed_z

    v_buf = np.empty(3, dtype=np.float32)
    d_buf = np.empty(3, dtype=np.float32)

    n = 0
    cap = out_points.shape[0]
    for _ in range(max_steps):
        if n >= cap:
            break
        fa_val = _lerp_scalar(fa, pos_x, pos_y, pos_z)
        if fa_val < 0.0 or fa_val < fa_thresh:
            break

        out_points[n, 0] = pos_x
        out_points[n, 1] = pos_y
        out_points[n, 2] = pos_z
        out_fa[n] = fa_val
        n += 1

        norm = _lerp_vec(v1, pos_x, pos_y, pos_z, v_buf)
        if norm <= 0.0:
            break

        # Resolve eigenvector sign vs the previous step
        if v_buf[0]*dir_x + v_buf[1]*dir_y + v_buf[2]*dir_z < 0.0:
            v_buf[0] = -v_buf[0]; v_buf[1] = -v_buf[1]; v_buf[2] = -v_buf[2]

        _perturb_direction(v_buf, fa_val, sigma_scale, d_buf)

        # Curvature gate against the direction we actually moved last
        if dir_x*d_buf[0] + dir_y*d_buf[1] + dir_z*d_buf[2] < cos_thresh:
            break

        dir_x = d_buf[0]; dir_y = d_buf[1]; dir_z = d_buf[2]
        pos_x += step * dir_x
        pos_y += step * dir_y
        pos_z += step * dir_z

    return n


# ── Public entry point ──────────────────────────────────────────────────────

def track(v1, fa, seeds, *,
          step=0.5, fa_thresh=0.15, max_angle_deg=65.0, max_steps=400,
          min_length=15.0, samples_per_seed=10, sigma_scale=0.6, rng_seed=42):
    """
    Bidirectional probabilistic streamline tractography.

    Parameters
    ----------
    v1               : ndarray (nx, ny, nz, 3)   principal eigenvector field
    fa               : ndarray (nx, ny, nz)      fractional anisotropy
    seeds            : ndarray (N, 3)            seed coordinates in voxel space
    step             : float  step size in voxels (default 0.5)
    fa_thresh        : float  stop threshold on FA  (default 0.15)
    max_angle_deg    : float  max turning angle per step (default 65°)
    max_steps        : int    max steps per half-streamline
    min_length       : float  drop streamlines shorter than this (voxels)
    samples_per_seed : int    streamlines per seed — each is a fresh sample of
                              the orientation distribution. Use 1 for deterministic.
    sigma_scale      : float  σ of the direction perturbation at FA=0.
                              Roughly: 0 = deterministic, 0.4 = mild,
                              0.6 = moderate, 0.8 = aggressive (default 0.6).
    rng_seed         : int    seed for reproducibility (NumPy global state).

    Returns
    -------
    streamlines : list of ndarray (n, 3)
    fa_along    : list of ndarray (n,)
    """
    # Numba is picky about types/layout
    v1    = np.ascontiguousarray(v1,    dtype=np.float32)
    fa    = np.ascontiguousarray(fa,    dtype=np.float32)
    seeds = np.ascontiguousarray(seeds, dtype=np.float32)

    # Reproducibility — Numba uses NumPy's global RNG state inside @njit
    np.random.seed(rng_seed)

    cos_thresh = float(np.cos(np.radians(max_angle_deg)))

    # Preallocated buffers reused across all (seed, sample) attempts
    fwd_pts = np.empty((max_steps, 3), dtype=np.float32)
    fwd_fa  = np.empty( max_steps,     dtype=np.float32)
    bwd_pts = np.empty((max_steps, 3), dtype=np.float32)
    bwd_fa  = np.empty( max_steps,     dtype=np.float32)
    v0      = np.empty(3,              dtype=np.float32)

    streamlines = []
    fa_along    = []

    for seed in seeds:
        # Initial direction at the seed (used to orient both halves)
        if _lerp_vec(v1, seed[0], seed[1], seed[2], v0) <= 0.0:
            continue
        v0_x = float(v0[0]); v0_y = float(v0[1]); v0_z = float(v0[2])

        for _ in range(samples_per_seed):
            n_fwd = _track_one_dir(
                v1, fa, seed[0], seed[1], seed[2],  v0_x,  v0_y,  v0_z,
                step, fa_thresh, cos_thresh, max_steps, sigma_scale,
                fwd_pts, fwd_fa,
            )
            n_bwd = _track_one_dir(
                v1, fa, seed[0], seed[1], seed[2], -v0_x, -v0_y, -v0_z,
                step, fa_thresh, cos_thresh, max_steps, sigma_scale,
                bwd_pts, bwd_fa,
            )

            total = n_fwd + n_bwd
            if total < 2:
                continue

            # Concatenate: reversed backward half (drop duplicated seed) + forward
            if n_bwd > 1:
                bwd_part = bwd_pts[1:n_bwd][::-1]
                bwd_fa_part = bwd_fa[1:n_bwd][::-1]
            else:
                bwd_part    = bwd_pts[:0]
                bwd_fa_part = bwd_fa[:0]

            pts = np.concatenate([bwd_part, fwd_pts[:n_fwd]], axis=0)
            fas = np.concatenate([bwd_fa_part, fwd_fa[:n_fwd]], axis=0)

            length = float(np.sum(np.linalg.norm(np.diff(pts, axis=0), axis=1)))
            if length < min_length:
                continue

            streamlines.append(pts.copy())
            fa_along.append(fas.copy())

    return streamlines, fa_along
