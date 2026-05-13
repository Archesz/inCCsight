"""ETL: volumetric NIfTI masks → curvature-profile PNG images.

Each input file goes through three steps:
  1. Load the 3-D mask and extract the mid-sagittal slice.
  2. Compute multi-resolution curvature profiles.
  3. Render the overlaid profiles as a 224×224 PNG and write it to disk.

A CSV manifest is appended with (image_path, area) for every processed file.
"""

from __future__ import annotations

import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import nibabel as nib
import numpy as np
import pandas as pd

from qc_segmentation import config
from qc_segmentation.features.curvature import extract_profiles
from qc_segmentation.preprocessing.sagittal import find_mid_sagittal_slice


def process_volume(
    nifti_path: str | Path,
    output_dir: str | Path,
    label: int,
    profile_low: int = config.PROFILE_LOW,
    profile_high: int = config.PROFILE_HIGH,
    threshold: float | None = None,
    csv_path: str | Path = "manifest.csv",
    image_size: int = config.IMAGE_SIZE,
    image_dpi: int = config.IMAGE_DPI,
) -> tuple[Path, np.ndarray, float]:
    """Process one volumetric mask and save its curvature-profile PNG.

    Args:
        nifti_path: Path to the ``.nii`` / ``.nii.gz`` segmentation mask.
        output_dir: Destination directory for the PNG image.
        label: Class label used to organise output sub-folders (0 or 1).
        profile_low: First resolution index to include in the plot.
        profile_high: One-past-last resolution index to include.
        threshold: Optional intensity threshold applied before slice extraction.
        csv_path: Path to the running CSV manifest.
        image_size: Output image side length in pixels (square).
        image_dpi: DPI used when saving the figure.

    Returns:
        (output_png_path, profiles, area) where *profiles* has shape
        (n_resolutions, n_points) and *area* is the contour pixel area used
        as auxiliary feature by the ViT model.

    Raises:
        ValueError: If the volume contains no valid segmentation.
    """
    nifti_path = Path(nifti_path)
    output_dir = Path(output_dir) / str(label)
    output_dir.mkdir(parents=True, exist_ok=True)

    volume = nib.load(str(nifti_path)).get_fdata()
    mid_slice, _ = find_mid_sagittal_slice(volume, threshold=threshold)

    resolutions = np.arange(config.RESOLS_INF, config.RESOLS_SUP, config.RESOLS_STEP)
    resolutions = np.insert(resolutions, 0, config.FIT_RES)

    profiles, area = extract_profiles(
        mid_slice, resolutions, config.SMOOTHNESS, config.POINTS
    )

    png_path = _save_profile_plot(
        profiles,
        profile_low,
        profile_high,
        output_dir,
        stem=f"{nifti_path.parent.name}_{nifti_path.stem}",
        image_size=image_size,
        dpi=image_dpi,
    )

    _append_manifest(csv_path, png_path, area)

    return png_path, profiles, area


def process_directory(
    images_dir: str | Path,
    output_dir: str | Path,
    label: int,
    glob_pattern: str = "**/*.nii.gz",
    **kwargs,
) -> list[Path]:
    """Process all NIfTI files found under *images_dir*.

    Args:
        images_dir: Root directory to search for NIfTI files.
        output_dir: Destination directory for PNG images.
        label: Class label applied to every file in this directory.
        glob_pattern: ``Path.glob`` pattern used to discover files.
        **kwargs: Forwarded verbatim to :func:`process_volume`.

    Returns:
        List of successfully written PNG paths.
    """
    images_dir = Path(images_dir)
    results: list[Path] = []

    for nifti_path in sorted(images_dir.glob(glob_pattern)):
        try:
            png_path, _, _area = process_volume(nifti_path, output_dir, label, **kwargs)
            results.append(png_path)
        except ZeroDivisionError:
            warnings.warn(f"ZeroDivisionError — skipping {nifti_path}")
        except Exception as exc:
            warnings.warn(f"Failed to process {nifti_path}: {exc}")

    return results


def _save_profile_plot(
    profiles: np.ndarray,
    low: int,
    high: int,
    output_dir: Path,
    stem: str,
    image_size: int,
    dpi: int,
) -> Path:
    """Render resolution profiles[low:high] as a square PNG and return its path."""
    figsize = (image_size / dpi, image_size / dpi)
    fig, ax = plt.subplots(figsize=figsize)

    for idx in range(low, high):
        x = np.arange(1, profiles.shape[1] + 1)
        ax.plot(x, profiles[idx, :])

    ax.axis("off")
    ax.margins(x=0)
    fig.tight_layout(pad=0)

    output_path = output_dir / f"{stem}.png"
    fig.savefig(str(output_path), format="png", dpi=dpi, bbox_inches="tight", pad_inches=-0.1)
    plt.close(fig)

    return output_path


def _append_manifest(csv_path: str | Path, image_path: Path, area: float) -> None:
    """Append a single (image_path, area) row to the CSV manifest."""
    csv_path = Path(csv_path)
    row = pd.DataFrame([[str(image_path), area]], columns=["image_path", "area"])
    row.to_csv(csv_path, mode="a", header=not csv_path.exists(), index=False)
