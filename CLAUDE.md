# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (React on :3000 + Express on :3001, concurrently)
npm run dev

# Express API only
npm run server

# Production build + serve (used by Docker)
npm run build && npm run start:prod

# React tests
npm test
```

Python pipeline (run from `methods/` with the venv active):
```bash
source venv/bin/activate          # Linux/macOS
# venv\Scripts\activate           # Windows

# Full pipeline on a folder
python run.py -p /path/to/group

# Skip individual steps
python run.py -p /path/to/group --skip-cnn
python run.py -p /path/to/group --skip-roqs

# Rebuild mydata.json from existing CSVs (no re-segmentation)
cd csvs && python transformInJson.py
```

## Architecture

### Two-process dev setup

`npm run dev` uses `concurrently` to run both servers. In development, React (`react-scripts`, port 3000) proxies API calls to Express (port 3001) via `"proxy"` in `package.json`. The Enter component calls Express directly at `http://localhost:3001` to bypass CRA's SSE buffering.

### Data flow

```
DTI NIfTI files
  → methods/run.py (orchestrator, emits PROGRESS:n:N:step to stdout)
    → roqs/main.py        → methods/csvs/*.csv
    → CNNBased/main3D.py  → methods/csvs/*.csv  +  subject/inCCsight/*.nii.gz
    → qc/run_qc.py        → methods/csvs/vit_qc_scores.csv
    → csvs/transformInJson.py → data/mydata.json
  ← GET /api/mydata serves data/mydata.json to React
```

`data/mydata.json` is the single source of truth for the dashboard. Schema:
```jsonc
{
  "_metadata": { "inCCsight_version", "run_timestamp", "model_checkpoint", "python_packages" },
  "subjects": [{
    "Id", "group", "img_path",
    "qc": { "ROQS": { "flag": bool, "prob": float }, "Watershed": {...} },
    "ROQS_scalar":        { "FA", "MD", "RD", "AD" },
    "Watershed_scalar":   { ... },
    "CNN_scalar":         { ... },
    "ROQS_midlines":      { "FA": [200 values], ... },
    "ROQS_thickness":     [200 values],
    "ROQS_parcellation":  { "Witelson_FA_P1": float, ... },
    "CNN_parcellation":   { ... },
    "ROQS_shape":         { "area", "cc_length", "max_thickness", "mean_thickness" }
  }]
}
```

### Express API (`server.js`)

| Endpoint | Purpose |
|---|---|
| `POST /api/run-pipeline` | Spawns `run.py`, streams stdout as SSE |
| `POST /api/load-last` | Re-runs `transformInJson.py` as SSE |
| `GET  /api/mydata` | Serves `data/mydata.json` |
| `GET  /api/file?path=` | Serves `.nii.gz` / `.png` from absolute path (allowlisted extensions) |
| `GET  /api/exists?path=` | Filesystem existence check |
| `POST /api/check-paths` | Batch directory existence check |
| `POST /api/browse-folder` | Native OS folder picker (zenity / AppleScript / PowerShell) |
| `POST /api/remove-subjects` | Adds IDs to `removed_subjects.json` + re-runs transform |
| `POST /api/restore-subjects` | Removes IDs from `removed_subjects.json` + re-runs transform |

SSE streams send `{ text: string }` lines and terminate with `{ done: true, code: number }`. Python is detected by scanning `methods/venv/` then falling back to system Python.

### Frontend (`src/`)

**Pages:**
- `src/pages/Home.jsx` — single Dashboard page; owns all state (`allSubjects`, `allGroups`, `activeTab`, `selectedId`); renders the topbar tabs and delegates to sub-components.

**Tab routing** (in `Home.jsx`): tabs are an inline array — `2D`, `3D`, `compare` (only when ≥ 2 groups), `qc`. The active tab drives which component renders in the main content area.

**Components:**
- `Enter/View.jsx` — landing page: folder path inputs, method selection, SSE progress bar. Parses `PROGRESS:n:N:step` lines to animate the bar.
- `View/View.jsx` — 2D/3D subject view; renders the subject banner (midsagittal image, QC badge, scalar/parcellation tables) and all chart components below.
- `GroupComparison/GroupComparison.jsx` — group comparison tab with scalar distributions (box/violin), thickness profiles, midline profiles, parcellation bar, shape metrics, radar.
- `QualityControl/QualityControl.jsx` — QC tab with per-subject pass/fail display and remove/restore.

**Graphs** (`src/graphs/`): each sub-folder is a self-contained chart component. The 3D pipeline is special:
- `Volume/VolumetricView.jsx` — Three.js WebGL viewer (OrbitControls, anatomical orientation labels, material/opacity/wireframe controls).
- `Volume/volumetric.worker.js` — Web Worker: NIfTI-1 parsing + Marching Cubes (via `isosurface`). Receives `ArrayBuffer`, returns `Float32Array` transferables (zero-copy). This keeps the UI thread free during surface extraction.

### Python pipeline (`methods/`)

- `shared/libcc/` is the **canonical shared library** used by both ROQS and CNN steps. Never duplicate logic from here into method-specific files.
- `run.py` is the orchestrator — it calls `roqs/main.py`, `CNNBased/main3D.py`, `qc/run_qc.py`, and `csvs/transformInJson.py` as subprocesses in sequence, emitting `PROGRESS:n:N:step` on stdout.
- `csvs/transformInJson.py` merges all CSVs, resolves group membership from `csvs/groups.json`, and writes `data/mydata.json`. It is also called synchronously by `/api/remove-subjects` and `/api/restore-subjects`.

### Key file paths

| Path | Purpose |
|---|---|
| `data/mydata.json` | Dashboard data output (canonical location) |
| `methods/csvs/groups.json` | `{ "/abs/path": "GroupName" }` — written by `/api/run-pipeline` before spawning Python |
| `methods/csvs/removed_subjects.json` | `{ "ids": [...] }` — subjects excluded from the dashboard |
| `methods/CNNBased/peso/*.ckpt` | CNN model checkpoint — not tracked in git |

## Adding a new dashboard tab

1. Create `src/components/MyFeature/MyFeature.jsx` (+ `.scss`).
2. Import it in `src/pages/Home.jsx`.
3. Add `{ id: 'myfeature', label: 'My Feature' }` to the tabs array in `Home.jsx` (conditionally if the tab should only appear when certain data exists).
4. Add a branch in the render block: `activeTab === 'myfeature' ? <MyFeature ... /> : ...`.

## Adding a new Express endpoint

Add the route in `server.js`. If it needs to stream Python output, use the existing `spawnSSE(res, args, cwd)` helper.

## Adding data to `mydata.json`

Modify `methods/csvs/transformInJson.py` — find the subject loop and add the new key to the subject dict. The new key will automatically be served via `GET /api/mydata`.
