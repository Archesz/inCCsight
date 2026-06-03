#!/usr/bin/env python3
"""
server.py — FastAPI backend for inCCsight
Drop-in replacement for server.js (Express).  Same port, same endpoints,
same SSE streaming — no Node.js required at runtime.

Usage
-----
Development  (React dev server on :3000 proxies /api to here):
    python server.py

Production   (FastAPI also serves the pre-built React app):
    python server.py --prod

Custom port:
    python server.py --port 3001
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

# ── Dependency check ──────────────────────────────────────────────────────────
_MISSING = []
try:
    import uvicorn                                          # noqa: F401
except ImportError:
    _MISSING.append('uvicorn[standard]')
try:
    from fastapi import FastAPI, HTTPException, Query       # noqa: F401
    from fastapi.middleware.cors import CORSMiddleware      # noqa: F401
    from fastapi.responses import FileResponse              # noqa: F401
    from fastapi.staticfiles import StaticFiles             # noqa: F401
    from pydantic import BaseModel                          # noqa: F401
except ImportError:
    _MISSING.append('fastapi')
try:
    from sse_starlette.sse import EventSourceResponse       # noqa: F401
except ImportError:
    _MISSING.append('sse-starlette')

if _MISSING:
    print('\n[ERROR] Missing Python dependencies for the inCCsight server:\n')
    print(f"   pip install {' '.join(_MISSING)}\n")
    sys.exit(1)

import uvicorn  # noqa: E402 (re-import after check)
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# ── Paths ──────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.resolve()
METHODS_DIR  = PROJECT_ROOT / 'methods'
DATA_DIR     = PROJECT_ROOT / 'data'
BUILD_DIR    = PROJECT_ROOT / 'build'

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

# ── Helpers ────────────────────────────────────────────────────────────────────

def _python() -> str:
    """Return the active Python interpreter.

    When the user activates (or installs into) a venv before running this
    server, sys.executable already points to the venv Python — so spawned
    analysis scripts inherit the same environment automatically.  This is
    simpler and more reliable than the Node.js findPython() approach.
    """
    return sys.executable


async def _stream_subprocess(args: list[str], cwd: Path):
    """Async generator that yields SSE events from a subprocess.

    stdout and stderr are merged (STDOUT redirect) so the client receives
    interleaved output in real time, matching the Express SSE behaviour.
    """
    env = {**os.environ, 'PYTHONUNBUFFERED': '1', 'PYTHONIOENCODING': 'utf-8'}
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,   # merge stderr → stdout
        env=env,
    )
    assert proc.stdout is not None
    async for raw in proc.stdout:
        yield {'data': json.dumps({'text': raw.decode('utf-8', errors='replace')})}
    await proc.wait()
    yield {'data': json.dumps({'done': True, 'code': proc.returncode})}


def _parse_csv(text: str) -> list[dict]:
    """Parse CSV with BOM stripping and auto-detection of , vs ; delimiter."""
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
    """Synchronously run transformInJson.py (used after remove/restore)."""
    try:
        subprocess.run(
            [_python(), '-u', 'transformInJson.py'],
            cwd=str(cwd),
            timeout=30,
            env={**os.environ, 'PYTHONUNBUFFERED': '1', 'PYTHONIOENCODING': 'utf-8'},
            check=False,
        )
    except Exception as exc:
        print(f'[WARN] transformInJson.py failed after remove/restore: {exc}')


def _browse_sync() -> str:
    """Open the native OS folder-picker dialog synchronously.

    Mirrors the server.js /api/browse-folder logic per platform.
    """
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

        else:  # Linux
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
            return ''

    except Exception:
        return ''

# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get('/api/ping')
async def ping():
    return {'ok': True}


# ── POST /api/run-pipeline ────────────────────────────────────────────────────
@app.post('/api/run-pipeline')
async def run_pipeline(body: RunPipelineBody):
    groups_file = METHODS_DIR / 'csvs' / 'groups.json'
    try:
        groups_file.write_text(
            json.dumps(body.groupsMap, indent=2), encoding='utf-8'
        )
    except Exception as exc:
        print(f'[WARN] Could not save groups.json: {exc}')

    args = [_python(), '-u', 'run.py', '-p', *body.paths]
    if body.skipCnn:   args.append('--skip-cnn')
    if body.skipRoqs:  args.append('--skip-roqs')
    if body.skipTract: args.append('--skip-tract')

    return EventSourceResponse(_stream_subprocess(args, METHODS_DIR))


# ── POST /api/load-last ───────────────────────────────────────────────────────
@app.post('/api/load-last')
async def load_last():
    return EventSourceResponse(
        _stream_subprocess([_python(), '-u', 'transformInJson.py'],
                           METHODS_DIR / 'csvs')
    )


# ── GET /api/mydata ───────────────────────────────────────────────────────────
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


# ── GET /api/file?path=<abs> ─────────────────────────────────────────────────
@app.get('/api/file')
async def serve_file(path: str = Query(...)):
    p = Path(path)
    if p.suffix.lower() not in ALLOWED_FILE_EXTS:
        raise HTTPException(403, f'File type not allowed: {p.suffix}')
    if not p.exists():
        raise HTTPException(404, 'File not found.')
    return FileResponse(str(p))


# ── GET /api/exists?path=<abs> ───────────────────────────────────────────────
@app.get('/api/exists')
async def file_exists(path: str = Query(...)):
    return {'exists': bool(path and Path(path).exists())}


# ── POST /api/check-paths ────────────────────────────────────────────────────
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


# ── POST /api/browse-folder ──────────────────────────────────────────────────
@app.post('/api/browse-folder')
async def browse_folder():
    # Run the blocking native dialog in the thread pool so uvicorn stays async
    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(None, _browse_sync)
    return {'path': path}


# ── GET /api/removed-subjects ────────────────────────────────────────────────
@app.get('/api/removed-subjects')
async def get_removed():
    rm_file = METHODS_DIR / 'csvs' / 'removed_subjects.json'
    try:
        data = json.loads(rm_file.read_text(encoding='utf-8'))
        return {'ids': data.get('ids', [])}
    except Exception:
        return {'ids': []}


# ── POST /api/remove-subjects ────────────────────────────────────────────────
@app.post('/api/remove-subjects')
async def remove_subjects(body: SubjectIdsBody):
    rm_file = METHODS_DIR / 'csvs' / 'removed_subjects.json'
    current: dict = {'ids': []}
    try:
        current = json.loads(rm_file.read_text(encoding='utf-8'))
    except Exception:
        pass

    # Deduplicate while preserving order
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


# ── POST /api/restore-subjects ───────────────────────────────────────────────
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


# ── GET /api/demograph ────────────────────────────────────────────────────────
@app.get('/api/demograph')
async def demograph():
    groups_file = METHODS_DIR / 'csvs' / 'groups.json'
    try:
        groups_map: dict[str, str] = json.loads(
            groups_file.read_text(encoding='utf-8')
        )
    except Exception:
        groups_map = {}

    all_rows: list[dict] = []
    for folder_path, group_name in groups_map.items():
        csv_path = Path(folder_path) / 'demograph.csv'
        if not csv_path.exists():
            continue
        try:
            rows = _parse_csv(
                csv_path.read_text(encoding='utf-8', errors='replace')
            )
            for row in rows:
                row['group'] = group_name
            all_rows.extend(rows)
        except Exception as exc:
            print(f'[WARN] demograph.csv parse error at {csv_path}: {exc}')

    if not all_rows:
        raise HTTPException(
            404, 'No demograph.csv found in any group folder.'
        )

    # Known columns that are actually present
    present_cols = [
        col for col in DEMOGRAPH_COLS
        if col != 'subject_id'
        and any(r.get(col, '') for r in all_rows)
    ]

    # Also expose any extra (unknown) columns so the frontend can offer
    # them in the Custom Columns panel of DemographicsDashboard
    all_keys: set[str] = set()
    for r in all_rows:
        all_keys.update(r.keys())
    extra_cols = sorted(all_keys - set(DEMOGRAPH_COLS) - {'group'})
    present_cols = present_cols + extra_cols

    return {'rows': all_rows, 'presentCols': present_cols}


# ── GET /api/tracts?path=<abs> ───────────────────────────────────────────────
@app.get('/api/tracts')
async def tracts(path: str = Query(...)):
    p = Path(path)
    if p.name != 'tracts.json':
        raise HTTPException(
            403, 'Only tracts.json files are served by this endpoint.'
        )
    if not p.exists():
        raise HTTPException(404, 'tracts.json not found.')
    return FileResponse(str(p), media_type='application/json')


# ── Static React build (production mode) ─────────────────────────────────────

def _mount_react_build() -> None:
    """Serve the pre-built React app so Node.js is not needed at all."""
    if not BUILD_DIR.exists():
        print(
            '[WARNING] build/ not found — run "npm run build" first, '
            'or start without --prod to use the CRA dev server.'
        )
        return

    # /static/** → React's hashed JS/CSS chunks
    static_dir = BUILD_DIR / 'static'
    if static_dir.exists():
        app.mount('/static', StaticFiles(directory=str(static_dir)), name='react-static')

    # Everything else → index.html (React Router handles client-side nav)
    @app.get('/{full_path:path}')
    async def serve_spa(full_path: str):
        return FileResponse(str(BUILD_DIR / 'index.html'))

    print(f'[OK] Serving React build from {BUILD_DIR}')


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='inCCsight local server (FastAPI/uvicorn)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        '--prod', action='store_true',
        help='Also serve the pre-built React app (production mode)',
    )
    parser.add_argument(
        '--port', type=int, default=3001,
        help='Port to listen on (default: 3001)',
    )
    args = parser.parse_args()

    if args.prod:
        _mount_react_build()

    print(f'[OK] inCCsight server (Python/FastAPI) running at http://localhost:{args.port}')
    uvicorn.run(app, host='localhost', port=args.port, log_level='warning')
