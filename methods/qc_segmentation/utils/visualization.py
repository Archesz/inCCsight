"""Plotting helpers for segmentation masks and curvature profiles."""

from __future__ import annotations

import numpy as np
import matplotlib.pyplot as plt
import scipy.interpolate as spline
from matplotlib.colors import ListedColormap


def plot_pipeline_steps(
    raw_slice: np.ndarray,
    mid_slice: np.ndarray,
    profile_png_path: str,
) -> None:
    """Show raw slice, mid-sagittal mask, and the saved profile plot side by side."""
    fig, axs = plt.subplots(1, 3, figsize=(15, 5))

    axs[0].imshow(raw_slice, cmap="gray")
    axs[0].set_title("Selected Slice")
    axs[0].axis("off")

    axs[1].imshow(mid_slice, cmap="gray")
    axs[1].set_title("Largest Component")
    axs[1].axis("off")

    profile_img = plt.imread(profile_png_path)
    axs[2].imshow(profile_img)
    axs[2].set_title("Curvature Profiles")
    axs[2].axis("off")

    plt.tight_layout()
    plt.show()


def plot_curvature_annotation(
    mask_2d: np.ndarray,
    tck,
    resolution: float,
    n_points: int,
    point_idx: int,
) -> None:
    """Visualise a single contour point with its anterior/posterior vectors.

    Args:
        mask_2d: 2-D binary mask.
        tck: Spline representation returned by ``scipy.interpolate.splprep``.
        resolution: Fractional arc-length radius for this annotation.
        n_points: Number of contour sample points.
        point_idx: Index of the contour point to annotate.
    """
    t_pivot = np.linspace(0, 1, n_points, endpoint=False)
    pivot = np.array(spline.splev(t_pivot, tck)).T
    anterior = np.array(spline.splev(np.mod(t_pivot + (1 - resolution), 1), tck)).T
    posterior = np.array(spline.splev(np.mod(t_pivot + resolution, 1), tck)).T

    sel_pivot = pivot[point_idx]
    sel_ant = anterior[point_idx]
    sel_post = posterior[point_idx]

    cmap = ListedColormap(["white", "orange"])
    plt.figure(figsize=(10, 10))
    plt.imshow(mask_2d, cmap=cmap)
    plt.scatter(sel_pivot[1], sel_pivot[0], color="red", s=50)
    plt.arrow(
        sel_pivot[1], sel_pivot[0],
        sel_ant[1] - sel_pivot[1], sel_ant[0] - sel_pivot[0],
        head_width=2, head_length=2, fc="blue", ec="blue",
    )
    plt.arrow(
        sel_pivot[1], sel_pivot[0],
        sel_post[1] - sel_pivot[1], sel_post[0] - sel_pivot[0],
        head_width=2, head_length=2, fc="green", ec="green",
    )
    plt.axis("off")
    plt.show()
