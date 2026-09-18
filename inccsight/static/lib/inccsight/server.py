"""
FastAPI app for inCCsight.

Path resolution strategy
------------------------
PACKAGE_DIR  — directory of *this* file (.../site-packages/inccsight/ or repo/inccsight/)
PROJECT_ROOT — where analysis data lives; resolved as follows:
  1. $INCCSIGHT_PROJECT env var (explicit override)
  2. Parent of PACKAGE_DIR if it contains a methods/ folder  (dev / repo mode)
  3. Current working directory (pip-installed: user cd's to their project)

STATIC_DIR — where to serve the pre-built React app from:
  1. PACKAGE_DIR/static/      (populated by the build script before pip install)
  2. PROJECT_ROOT/build/      (fallback for developers running npm run build locally)
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# ── Path resolution ────────────────────────────────────────────────────────────

PACKAGE_DIR = Path(__file__).parent.resolve()


def _resolve_project_root() -> Path:
    if env := os.environ.get('INCCSIGHT_PROJECT'):
        return Path(env).resolve()
    parent = PACKAGE_DIR.parent
    if (parent / 'methods').exists():   # running from repo checkout
        return parent
    return Path.cwd()                   # pip-installed: user runs from project dir


def _resolve_static_dir() -> Path | None:
    pkg_static = PACKAGE_DIR / 'static'
    if (pkg_static / 'index.html').exists():
        return pkg_static               # bundled inside the wheel
    build = _resolve_project_root() / 'build'
    if (build / 'index.html').exists():
        return build                    # dev: npm run build already done
    return None


PROJECT_ROOT = _resolve_project_root()
METHODS_DIR  = PROJECT_ROOT / 'methods'
DATA_DIR     = PROJECT_ROOT / 'data'

ALLOWED_FILE_EXTS = {'.nii', '.gz', '.png', '.jpg', '.jpeg'}

DEMOGRAPH_COLS = [
    'subject_id', 'age', 'sex', 'ethnicity', 'diagnosis',
    'disease_duration', 'medication', 'scanner', 'field_strength',
    'acquisition_date', 'weight_kg', 'height_cm',
]

# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(title='inCCsight API', version='0.2.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Request body schemas ───────────────────────────────────────────────────────

class RunPipelineBody(BaseModel):
    paths:     list[str]       = []
    groupsMap: dict[str, str]  = {}
    skipCnn:   bool            = False
    skipRoqs:  bool            = False
    skipTract: bool            = False

class CheckPathsBody(BaseModel):
    paths: list[str] = []

class SubjectIdsBody(BaseModel):
    ids: list[str] = []

# ── Internal helpers ───────────────────────────────────────────────────────────

def _python() -> str:
    return sys.executable


async def _stream_subprocess(args: list[str], cwd: Path):
    env = {**os.environ, 'PYTHONUNBUFFERED': '1', 'PYTHONIOENCODING': 'utf-8'}
    proc = await asyncio.create_subprocess_exec(
        *args, cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    assert proc.stdout is not None
    async for raw in proc.stdout:
        yield {'data': json.dumps({'text': raw.decode('utf-8', errors='replace')})}
    await proc.wait()
    yield {'data': json.dumps({'done': True, 'code': proc.returncode})}


def _parse_csv(text: str) -> list[dict]:
    text = text.lstrip('﻿')
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        return []
    delim = ';' if ';' in lines[0] else ','
    reader = csv.DictReader(io.StringIO('\n'.join(lines)), delimiter=delim)
    rows = []
    for row in reader:
        norm = {k.lower().strip(): v.strip() for k, v in row.items()}
        if any(v for v in norm.values()):
            rows.append(norm)
    return rows


def _run_transform(cwd: Path) -> None:
    try:
        subprocess.run(
            [_python(), '-u', 'transformInJson.py'], cwd=str(cwd), timeout=30,
            env={**os.environ, 'PYTHONUNBUFFERED': '1', 'PYTHONIOENCODING': 'utf-8'},
            check=False,
        )
    except Exception as exc:
        print(f'[WARN] transformInJson.py failed: {exc}')


def _browse_sync() -> str:
    plat = platform.system()
    try:
        if plat == 'Windows':
            ps = (
                'Add-Type -AssemblyName System.Windows.Forms;'
                '$d = New-Object System.Windows.Forms.FolderBrowserDialog;'
                '$d.Description = "Select subject/group folder";'
                '$d.ShowNewFolderButton = $false;'
                'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK)'
                '{ $d.SelectedPath } else { "" }'
            )
            r = subprocess.run(
                ['powershell', '-NoProfile', '-NonInteractive', '-Command', ps],
                capture_output=True, text=True, timeout=60,
            )
            return r.stdout.strip()
        elif plat == 'Darwin':
            r = subprocess.run(
                ['osascript', '-e',
                 'POSIX path of (choose folder with prompt "Select subject/group folder")'],
                capture_output=True, text=True, timeout=60,
            )
            return r.stdout.strip().rstrip('/')
        else:
            for cmd in [
                ['zenity', '--file-selection', '--directory',
                 '--title=Select subject/group folder'],
                ['kdialog', '--getexistingdirectory', '.'],
            ]:
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                    if r.returncode == 0:
                        return r.stdout.strip()
                except FileNotFoundError:
                    continue
    except Exception:
        pass
    return ''

# ── API endpoints ──────────────────────────────────────────────────────────────

@app.get('/api/ping')
async def ping():
    return {'ok': True}


@app.post('/api/run-pipeline')
async def run_pipeline(body: RunPipelineBody):
    groups_file = METHODS_DIR / 'csvs' / 'groups.json'
    try:
        groups_file.write_text(json.dumps(body.groupsMap, indent=2), encoding='utf-8')
    except Exception as exc:
        print(f'[WARN] Could not save groups.json: {exc}')
    args = [_python(), '-u', 'run.py', '-p', *body.paths]
    if body.skipCnn:   args.append('--skip-cnn')
    if body.skipRoqs:  args.append('--skip-roqs')
    if body.skipTract: args.append('--skip-tract')
    return EventSourceResponse(_stream_subprocess(args, METHODS_DIR))


@app.post('/api/load-last')
async def load_last():
    return EventSourceResponse(
        _stream_subprocess([_python(), '-u', 'transformInJson.py'], METHODS_DIR / 'csvs')
    )


@app.get('/api/mydata')
async def mydata():
    for loc in [
        DATA_DIR / 'mydata.json',
        PROJECT_ROOT / 'src' / 'data' / 'mydata.json',
        METHODS_DIR / 'csvs' / 'mydata.json',
    ]:
        if loc.exists():
            return FileResponse(str(loc), media_type='application/json')
    raise HTTPException(404, 'mydata.json not found. Run an analysis first.')


@app.get('/api/file')
async def serve_file(path: str = Query(...)):
    p = Path(path)
    if p.suffix.lower() not in ALLOWED_FILE_EXTS:
        raise HTTPException(403, f'File type not allowed: {p.suffix}')
    if not p.exists():
        raise HTTPException(404, 'File not found.')
    return FileResponse(str(p))


@app.get('/api/exists')
async def file_exists(path: str = Query(...)):
    return {'exists': bool(path and Path(path).exists())}


@app.post('/api/check-paths')
async def check_paths(body: CheckPathsBody):
    results = []
    for p in body.paths:
        try:
            exists = bool(p and Path(p).exists() and Path(p).is_dir())
        except Exception:
            exists = False
        results.append({'path': p, 'exists': exists})
    return results


@app.post('/api/browse-folder')
async def browse_folder():
    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(None, _browse_sync)
    return {'path': path}


@app.get('/api/removed-subjects')
async def get_removed():
    rm_file = METHODS_DIR / 'csvs' / 'removed_subjects.json'
    try:
        data = json.loads(rm_file.read_text(encoding='utf-8'))
        return {'ids': data.get('ids', [])}
    except Exception:
        return {'ids': []}


@app.post('/api/remove-subjects')
async def remove_subjects(body: SubjectIdsBody):
    rm_file = METHODS_DIR / 'csvs' / 'removed_subjects.json'
    current: dict = {'ids': []}
    try:
        current = json.loads(rm_file.read_text(encoding='utf-8'))
    except Exception:
        pass
    seen: set = set()
    new_ids = []
    for i in (current.get('ids', []) + body.ids):
        if i not in seen:
            seen.add(i); new_ids.append(i)
    try:
        rm_file.write_text(json.dumps({'ids': new_ids}, indent=2), encoding='utf-8')
    except Exception as exc:
        raise HTTPException(500, f'Could not write removed_subjects.json: {exc}')
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_transform, METHODS_DIR / 'csvs')
    return {'ids': new_ids}


@app.post('/api/restore-subjects')
async def restore_subjects(body: SubjectIdsBody):
    rm_file = METHODS_DIR / 'csvs' / 'removed_subjects.json'
    current: dict = {'ids': []}
    try:
        current = json.loads(rm_file.read_text(encoding='utf-8'))
    except Exception:
        pass
    to_restore = set(body.ids)
    new_ids = [i for i in current.get('ids', []) if i not in to_restore]
    try:
        rm_file.write_text(json.dumps({'ids': new_ids}, indent=2), encoding='utf-8')
    except Exception as exc:
        raise HTTPException(500, f'Could not write removed_subjects.json: {exc}')
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_transform, METHODS_DIR / 'csvs')
    return {'ids': new_ids}


@app.get('/api/demograph')
async def demograph():
    groups_file = METHODS_DIR / 'csvs' / 'groups.json'
    try:
        groups_map: dict[str, str] = json.loads(groups_file.read_text(encoding='utf-8'))
    except Exception:
        groups_map = {}
    all_rows: list[dict] = []
    for folder_path, group_name in groups_map.items():
        csv_path = Path(folder_path) / 'demograph.csv'
        if not csv_path.exists():
            continue
        try:
            rows = _parse_csv(csv_path.read_text(encoding='utf-8', errors='replace'))
            for row in rows:
                row['group'] = group_name
            all_rows.extend(rows)
        except Exception as exc:
            print(f'[WARN] demograph.csv parse error at {csv_path}: {exc}')
    if not all_rows:
        raise HTTPException(404, 'No demograph.csv found in any group folder.')
    present_cols = [
        col for col in DEMOGRAPH_COLS
        if col != 'subject_id' and any(r.get(col, '') for r in all_rows)
    ]
    all_keys: set[str] = set()
    for r in all_rows:
        all_keys.update(r.keys())
    extra_cols = sorted(all_keys - set(DEMOGRAPH_COLS) - {'group'})
    return {'rows': all_rows, 'presentCols': present_cols + extra_cols}


@app.get('/api/tracts')
async def tracts(path: str = Query(...)):
    p = Path(path)
    if p.name != 'tracts.json':
        raise HTTPException(403, 'Only tracts.json files are served by this endpoint.')
    if not p.exists():
        raise HTTPException(404, 'tracts.json not found.')
    return FileResponse(str(p), media_type='application/json')


# ── Static React serving ───────────────────────────────────────────────────────

def mount_static() -> bool:
    """Mount the pre-built React app. Returns True if static files were found."""
    static_root = _resolve_static_dir()
    if static_root is None:
        print('[WARNING] No React build found.')
        print('          Run: npm run build   (then copy build/ to inccsight/static/ for pip packaging)')
        return False

    js_css = static_root / 'static'
    if js_css.exists():
        app.mount('/static', StaticFiles(directory=str(js_css)), name='react-static')

    @app.get('/{full_path:path}')
    async def serve_spa(full_path: str):
        return FileResponse(str(static_root / 'index.html'))

    print(f'[OK] Serving React app from {static_root}')
    return True
