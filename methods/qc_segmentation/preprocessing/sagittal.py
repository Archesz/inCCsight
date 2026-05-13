"""Mid-sagittal plane extraction from volumetric masks."""

import numpy as np
from scipy import ndimage as ndi


def find_mid_sagittal_slice(volume: np.ndarray, threshold: float | None = None) -> tuple[np.ndarray, int]:
    """Return the 2-D mid-sagittal slice and its index within *volume*.

    The mid-sagittal slice is the axial slice whose largest connected
    component has the greatest area.  When two segmentation methods produce
    slightly different extents this criterion is more robust than picking
    the geometrically central slice.

    Args:
        volume: 3-D binary mask with shape (S, H, W).
        threshold: Optional lower bound; voxels below this value are zeroed
            before processing.

    Returns:
        (slice_2d, slice_index) where *slice_2d* is the selected 2-D mask.

    Raises:
        ValueError: If no non-empty slice is found in *volume*.
    """
    if threshold is not None:
        volume = volume.copy()
        volume[volume < threshold] = 0

    best_slice = None
    best_index = None
    best_size = 0

    structure = np.ones((3, 3), dtype=int)
    for i in range(volume.shape[0]):
        labeled, n_features = ndi.label(volume[i], structure=structure)
        if n_features == 0:
            continue
        sizes = ndi.sum(volume[i], labeled, index=range(1, n_features + 1))
        max_size = float(np.max(sizes))
        if max_size > best_size:
            best_size = max_size
            best_index = i
            best_label = int(np.argmax(sizes)) + 1
            best_slice = (labeled == best_label).astype(volume.dtype)

    if best_slice is None:
        raise ValueError("No non-empty slice found in the provided volume.")

    return best_slice, best_index
