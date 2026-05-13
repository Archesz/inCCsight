"""Shape-signature curvature profile extraction.

Implements the multi-resolution curvature profile used as ViT input.
Each profile captures local boundary curvature at a given spatial radius
along the contour of the segmentation mask.
"""

import numpy as np
import scipy.interpolate as spline
import scipy.ndimage as nima
from scipy.ndimage import label


def extract_profiles(
    mask_2d: np.ndarray,
    resolutions: np.ndarray,
    smoothness: int,
    n_points: int,
) -> tuple[np.ndarray, float]:
    """Compute multi-resolution curvature profiles for a 2-D binary mask.

    Args:
        mask_2d: 2-D binary segmentation mask.
        resolutions: 1-D array of fractional radii at which to sample curvature.
        smoothness: Spline smoothing factor *s* passed to ``scipy.interpolate.splprep``.
        n_points: Number of equally-spaced contour points to sample.

    Returns:
        (profiles, area) where *profiles* has shape (len(resolutions), n_points)
        and *area* is the pixel area of the largest component in the up-scaled mask.
    """
    tck, area = _fit_contour_spline(mask_2d, smoothness)
    profiles = np.empty((0, n_points))
    for radius in resolutions:
        profiles = np.vstack((profiles, _sample_curvature(tck, n_points, radius)))
    return profiles, area


def align_profiles(
    reference: np.ndarray,
    profiles: np.ndarray,
    n_points: int,
) -> np.ndarray:
    """Circularly align *profiles* to minimise distance from *reference*.

    Args:
        reference: Reference profile array (R, n_points).
        profiles: Profiles to align, shape (1, R, n_points).
        n_points: Number of contour points.

    Returns:
        Aligned profiles with the same shape as *profiles*.
    """
    diffs = [
        float(np.abs(np.sum((reference - np.roll(profiles[0], shift)) ** 2)))
        for shift in range(n_points)
    ]
    best_shift = int(np.argmin(diffs))
    return np.apply_along_axis(np.roll, 1, profiles, best_shift)


def _sample_curvature(tck, n_points: int, radius: float) -> np.ndarray:
    """Sample curvature angles at *n_points* equally-spaced positions for one radius."""
    t_pivot = np.linspace(0, 1, n_points, endpoint=False)
    pivot = _eval_spline(tck, t_pivot)
    anterior = _eval_spline(tck, np.mod(t_pivot + (1 - radius), 1))
    posterior = _eval_spline(tck, np.mod(t_pivot + radius, 1))
    return _compute_angles(pivot, anterior, posterior)


def _eval_spline(tck, t: np.ndarray) -> np.ndarray:
    """Evaluate the parametric spline at parameter values *t*, returning (2, N)."""
    y, x = spline.splev(t, tck)
    return np.vstack((y, x))


def _compute_angles(
    pivot: np.ndarray,
    anterior: np.ndarray,
    posterior: np.ndarray,
) -> np.ndarray:
    """Compute signed curvature angles (degrees) at each pivot point."""
    ap = anterior - pivot
    pp = posterior - pivot
    ang = np.arctan2(pp[1], pp[0]) - np.arctan2(ap[1], ap[0])

    discontinuous = np.abs(ang - np.roll(ang, 1)) > np.pi
    starts = np.where(discontinuous)[0][::2]
    ends = np.where(discontinuous)[0][1::2]

    corrections = np.zeros_like(ang)
    for s, e in zip(starts, ends):
        correction = -2 * np.pi if (ang[s] - np.roll(ang, 1)[s]) > np.pi else 2 * np.pi
        corrections[s:e] = correction

    return (ang + corrections) * 180 / np.pi


def _fit_contour_spline(mask_2d: np.ndarray, smoothness: int):
    """Up-scale mask, extract ordered contour sequence, and fit a closed spline."""
    nz = np.nonzero(mask_2d)
    x1, x2 = int(np.amin(nz[0])), int(np.amax(nz[0]))
    y1, y2 = int(np.amin(nz[1])), int(np.amax(nz[1]))

    crop = mask_2d[x1 - 5:x2 + 5, y1 - 5:y2 + 5]
    up_shape = [4 * crop.shape[0], 4 * crop.shape[1]]
    up = _resize_nearest(crop, up_shape).astype(bool)

    labeled, n_features = label(up)
    largest_label = max(range(1, n_features + 1), key=lambda lbl: (labeled == lbl).sum())
    up = labeled == largest_label
    area = float(np.sum(up))

    dilated = nima.binary_dilation(up).astype(up.dtype)
    contour = np.logical_xor(dilated, up)

    seq = _contour_sequence(contour)
    tck, _ = spline.splprep(seq, k=5, s=smoothness)
    return tck, area


def _resize_nearest(img: np.ndarray, shape: list[int]) -> np.ndarray:
    """Resize *img* to *shape* using nearest-neighbour interpolation."""
    y, x = np.indices(shape)
    x = x / (shape[1] / img.shape[-1])
    y = y / (shape[0] / img.shape[-2])
    return img[y.astype(int), x.astype(int)]


def _contour_sequence(edge: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Walk the contour pixel graph and return an ordered (row, col) sequence.

    Traverses the 8-connected contour graph starting from the first nonzero
    pixel, returning to it to close the loop.  Bounds checking prevents index
    errors for pixels on the array border.
    """
    dy = np.array([-1, 0, 1, 1, 1, 0, -1, -1])
    dx = np.array([-1, -1, -1, 0, 1, 1, 1, 0])

    def get_neighbors(node):
        rows = node[0] + dy
        cols = node[1] + dx
        valid = (rows >= 0) & (rows < edge.shape[0]) & (cols >= 0) & (cols < edge.shape[1])
        rows, cols = rows[valid], cols[valid]
        hit = edge[rows, cols].astype(bool)
        return list(zip(rows[hit].tolist(), cols[hit].tolist()))

    Y_arr, X_arr = edge.nonzero()
    graph = {(int(y), int(x)): get_neighbors((int(y), int(x)))
             for y, x in zip(Y_arr, X_arr)}

    first_el = (int(Y_arr[0]), int(X_arr[0]))
    seq = [first_el]
    ext_el = first_el
    act_el = graph[ext_el][0]

    while (first_el != ext_el) or (len(seq) == 1):
        neighbors_arr = np.array(graph[ext_el])
        not_act = np.where(neighbors_arr != np.array(act_el))
        ind_uq = np.unique(not_act[0])

        if len(ind_uq) == 0:
            break
        elif len(ind_uq) == 1:
            ind = int(ind_uq[0])
        else:
            dists = [
                (graph[ext_el][i][0] - ext_el[0]) ** 2 + (graph[ext_el][i][1] - ext_el[1]) ** 2
                for i in ind_uq
            ]
            ind = int(ind_uq[int(np.argmin(dists))])

        act_el = ext_el
        ext_el = graph[act_el][ind]
        seq.append(ext_el)

    rows, cols = zip(*seq)
    return np.array(rows), np.array(cols)
