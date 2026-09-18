"""
sync_drive_outputs.py — Copy per-subject inCCsight output folders from Google Drive.

Scans a Google Drive folder (recursively, any depth: e.g. <root>/<group>/<subject>/inCCsight
or <root>/<subject>/inCCsight) for folders named "inCCsight" and, for each one found, creates
<dest>/<subject-folder-name>/inCCsight locally and copies its full contents there.

This intentionally skips everything else in each subject's Drive folder — the raw NIfTI and
the DTI eigenvalue/eigenvector volumes (*_L1/_L2/_L3.nii.gz, *_V1/_V2/_V3.nii.gz, see
methods/shared/libcc/preprocess.py) live alongside "inCCsight", not inside it, so they are
never copied.

Requires rclone (https://rclone.org) configured with a Google Drive remote:
    rclone config
    # n) New remote
    # name> gdrive
    # Storage> drive
    # (leave client_id/client_secret blank to use rclone's own, or supply your own)
    # follow the browser prompt to authorize, accept the defaults for the rest

Usage:
    python scripts/sync_drive_outputs.py --remote gdrive --remote-path "Teste_InCCsight" --dest "D:/inccsight_data"
    python scripts/sync_drive_outputs.py --remote gdrive --remote-path "Teste_InCCsight" --dest ./data_local --dry-run

Safe to re-run: rclone copy only transfers files that are new or changed, so an interrupted
or repeated sync just picks up where it left off.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys


def _rclone_lsjson_dirs(remote, remote_path):
    cmd = ["rclone", "lsjson", f"{remote}:{remote_path}", "--dirs-only", "-R"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] rclone lsjson failed:\n{result.stderr}")
        sys.exit(1)
    return json.loads(result.stdout)


def find_inccsight_folders(remote, remote_path):
    entries = _rclone_lsjson_dirs(remote, remote_path)
    matches = []
    for entry in entries:
        path = entry["Path"].replace("\\", "/")
        if os.path.basename(path) == "inCCsight":
            matches.append(path)
    return sorted(matches)


def subject_name_for(inccsight_rel_path):
    parent = os.path.dirname(inccsight_rel_path)
    return os.path.basename(parent) if parent else os.path.basename(inccsight_rel_path)


def sync(remote, remote_path, dest, dry_run=False):
    print(f"[inCCsight] Scanning {remote}:{remote_path} for inCCsight folders...")
    inccsight_paths = find_inccsight_folders(remote, remote_path)

    if not inccsight_paths:
        print("[WARN] No 'inCCsight' folders found under that path. Check --remote-path.")
        return

    print(f"[inCCsight] Found {len(inccsight_paths)} subject(s).\n")

    seen_subjects = {}
    failures = []
    for i, rel_path in enumerate(inccsight_paths, 1):
        subject = subject_name_for(rel_path)
        if subject in seen_subjects:
            print(f"[WARN] Duplicate subject folder name '{subject}' "
                  f"({seen_subjects[subject]} and {rel_path}) - skipping the second one.")
            continue
        seen_subjects[subject] = rel_path

        local_inccsight_dir = os.path.join(dest, subject, "inCCsight")
        remote_src = f"{remote}:{remote_path}/{rel_path}"

        print(f"[{i}/{len(inccsight_paths)}] {subject}")
        print(f"    {remote_src}  ->  {local_inccsight_dir}")

        if dry_run:
            continue

        os.makedirs(local_inccsight_dir, exist_ok=True)
        result = subprocess.run(["rclone", "copy", remote_src, local_inccsight_dir, "--progress"])
        if result.returncode != 0:
            print(f"[ERROR] Failed to copy {subject}")
            failures.append(subject)

    if dry_run:
        print("\n[inCCsight] Dry run complete, nothing copied.")
    elif failures:
        print(f"\n[inCCsight] Done with errors. Failed subjects: {', '.join(failures)}")
        sys.exit(1)
    else:
        print(f"\n[inCCsight] Done. {len(seen_subjects)} subject(s) synced to {dest}")


def main():
    parser = argparse.ArgumentParser(
        description="Copy per-subject inCCsight output folders from Google Drive to a local folder."
    )
    parser.add_argument("--remote", default=os.environ.get("INCCSIGHT_DRIVE_REMOTE", "gdrive"),
                         help="rclone remote name, configured via `rclone config`. Default: gdrive "
                              "(or $INCCSIGHT_DRIVE_REMOTE)")
    parser.add_argument("--remote-path", required=True,
                         help="Path within the remote to the root folder holding subject data, "
                              "e.g. 'Teste_InCCsight'.")
    parser.add_argument("--dest", required=True,
                         help="Local destination folder; one subfolder per subject is created here.")
    parser.add_argument("--dry-run", action="store_true",
                         help="List what would be copied without copying anything.")
    args = parser.parse_args()

    if shutil.which("rclone") is None:
        print("[ERROR] rclone not found on PATH.")
        print("        Install it from https://rclone.org/downloads/ then run `rclone config`")
        print("        to set up a Google Drive remote before running this script.")
        sys.exit(1)

    os.makedirs(args.dest, exist_ok=True)
    sync(args.remote, args.remote_path, args.dest, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
