"""
Smoke tests for the CSV→JSON transform helpers.

Run with either:
    python -m pytest methods/tests
    python methods/tests/test_transform.py     (no pytest needed)

These cover the pure helper functions that shape data/mydata.json, so a
regression in name normalisation, number coercion or group resolution is
caught without running the whole (heavy) pipeline.
"""

import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CSVS = os.path.normpath(os.path.join(_HERE, "..", "csvs"))
sys.path.insert(0, _CSVS)

# transformInJson imports numpy/pandas at module load; that's fine inside the venv.
_spec = importlib.util.spec_from_file_location(
    "transformInJson", os.path.join(_CSVS, "transformInJson.py")
)
tij = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tij)


def test_safe_num():
    assert tij._safe_num("0.5") == 0.5
    assert tij._safe_num(None) is None
    assert tij._safe_num("not-a-number") is None
    assert tij._safe_num(float("nan")) is None
    assert tij._safe_num(1.234567) == 1.2346  # rounded to 4 dp


def test_normalize_name():
    assert tij.Subject._normalize_name("Subject_123") == "0000123"
    assert tij.Subject._normalize_name("42") == "0000042"
    assert tij.Subject._normalize_name("0001234") == "0001234"


def test_find_group():
    groups = {os.path.normpath("/data/controls"): "Controls"}
    # img_path lives inside <subject>/inCCsight/<file>, so the group folder is
    # two levels up from the file.
    img = os.path.normpath("/data/controls/subj01/inCCsight/midsagittal.png")
    assert tij._find_group(img, groups) == "Controls"
    assert tij._find_group("", groups) == ""
    assert tij._find_group(img, {}) == ""


def test_parse_list_cell():
    assert tij._parse_list_cell("[1, 2, 3]") == [1, 2, 3]
    assert tij._parse_list_cell("not a list") == []
    assert tij._parse_list_cell(42) == 42


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"[PASS] {name}")
            except AssertionError as exc:
                failures += 1
                print(f"[FAIL] {name}: {exc}")
    print(f"\n{'OK' if failures == 0 else 'FAILED'} — {failures} failure(s)")
    sys.exit(1 if failures else 0)
