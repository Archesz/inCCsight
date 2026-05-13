"""Train / validation / test split for an image-folder dataset.

Expects the standard layout produced by :mod:`qc_segmentation.dataset.builder`:

    output_dir/
        0/   ← class 0 PNGs
        1/   ← class 1 PNGs
        ...

A fraction *split_ratio* of the images in each class is moved out of *train*
and divided equally between *validation* and *test*.
"""

from __future__ import annotations

import random
import shutil
from pathlib import Path

from qc_segmentation import config


def split_dataset(
    train_dir: str | Path,
    output_dir: str | Path,
    split_ratio: float = config.SPLIT_RATIO,
    random_seed: int = config.RANDOM_SEED,
) -> dict[str, dict[str, int]]:
    """Move a fraction of training images to validation and test splits.

    Args:
        train_dir: Directory that contains per-class sub-folders with PNGs.
        output_dir: Parent directory where *validation/* and *test/* will be
            created alongside the existing *train/* folder.
        split_ratio: Total fraction of images to hold out (split equally
            between validation and test).
        random_seed: Seed for reproducible sampling.

    Returns:
        Nested dict ``{split: {class: n_images}}`` reporting how many images
        ended up in each split per class.
    """
    random.seed(random_seed)
    train_dir = Path(train_dir)
    output_dir = Path(output_dir)

    val_dir = output_dir / "validation"
    test_dir = output_dir / "test"

    stats: dict[str, dict[str, int]] = {"train": {}, "validation": {}, "test": {}}

    for class_dir in sorted(train_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        cls = class_dir.name

        images = [p for p in class_dir.iterdir() if p.is_file()]
        n_hold = max(1, int(len(images) * split_ratio))
        held_out = random.sample(images, min(n_hold, len(images)))

        half = len(held_out) // 2
        val_images = held_out[:half]
        test_images = held_out[half:]

        for dest_root, subset in [(val_dir, val_images), (test_dir, test_images)]:
            dest = dest_root / cls
            dest.mkdir(parents=True, exist_ok=True)
            for src in subset:
                shutil.move(str(src), dest / src.name)

        stats["train"][cls] = len(images) - len(held_out)
        stats["validation"][cls] = len(val_images)
        stats["test"][cls] = len(test_images)

    return stats


def update_manifest_paths(
    csv_path: str | Path,
    dataset_root: str | Path,
) -> None:
    """Update image paths in the CSV manifest after a split.

    After :func:`split_dataset` moves files, the manifest paths still point to
    the original *train* locations.  This function walks *dataset_root* to find
    each image's new location and rewrites the CSV in place.

    Args:
        csv_path: Path to the manifest CSV produced by the builder.
        dataset_root: Root directory that contains *train/*, *validation/*, and
            *test/* sub-trees.
    """
    import pandas as pd

    csv_path = Path(csv_path)
    dataset_root = Path(dataset_root)
    df = pd.read_csv(csv_path)

    splits = ["train", "validation", "test"]

    def _find_new_path(row: pd.Series) -> str:
        old = Path(row["image_path"])
        cls = old.parent.name
        for split in splits:
            candidate = dataset_root / split / cls / old.name
            if candidate.exists():
                return str(candidate)
        return row["image_path"]

    df["image_path"] = df.apply(_find_new_path, axis=1)
    df.to_csv(csv_path, index=False)
