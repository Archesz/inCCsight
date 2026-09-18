// server.js — Local Express backend for inCCsight
const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')
const { spawn } = require('child_process')

const app  = express()
const PORT = Number(process.env.PORT) || 3001
// Bind to loopback by default so the API is not exposed to other machines on
// the network. Containerized/remote deployments can opt in with HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1'

// CORS — restrict to the local dev/prod origins. CORS is browser-enforced, so
// this stops arbitrary websites the user visits from reading responses off the
// local API. Override with ALLOWED_ORIGINS (comma-separated) when needed.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [
        'http://localhost:3000',  'http://127.0.0.1:3000',
        `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
      ]
app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// Host-header allowlist — blocks DNS-rebinding attacks, which slip past CORS by
// making a malicious request look same-origin to the browser. Only requests
// addressed to a loopback host are served. Extend via ALLOWED_HOSTS (comma-
// separated) for remote/containerized deployments, e.g. ALLOWED_HOSTS=my.host.
const ALLOWED_HOSTS = new Set([
    'localhost', '127.0.0.1', '[::1]', '::1',
    ...(process.env.ALLOWED_HOSTS
        ? process.env.ALLOWED_HOSTS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : []),
])
app.use((req, res, next) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase()
    if (!ALLOWED_HOSTS.has(host)) {
        return res.status(403).json({ error: 'Forbidden: host not allowed.' })
    }
    next()
})

const projectRoot = __dirname
const methodsDir  = path.join(projectRoot, 'methods')

// ── Python detection — prefer project venv, fall back to system Python ────────
function findPython() {
    const candidates = process.platform === 'win32'
        ? [
            path.join(methodsDir, 'venv', 'Scripts', 'python.exe'),
            path.join(methodsDir, 'roqs',  'venv', 'Scripts', 'python.exe'),
          ]
        : [
            path.join(methodsDir, 'venv', 'bin', 'python3'),
            path.join(methodsDir, 'venv', 'bin', 'python'),
            path.join(methodsDir, 'roqs',  'venv', 'bin', 'python3'),
          ]
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            console.log(`✔  Venv Python detected: ${p}`)
            return p
        }
    }
    const fallback = process.platform === 'win32' ? 'python' : 'python3'
    console.warn(`[WARNING] No venv found — using system Python: ${fallback}`)
    console.warn(`          Create methods/venv and install requirements if packages are missing.`)
    return fallback
}

const python = findPython()

// ── Allowed file extensions for /api/file ────────────────────────────────────
const ALLOWED_FILE_EXTS = new Set([
    '.nii', '.gz', '.png', '.jpg', '.jpeg',
])

// ── Path confinement — prevent arbitrary local-file read ─────────────────────
// A request may only reach files that resolve (after following symlinks and
// "..") under a known-safe root: the bundled data dir or a folder the user has
// explicitly added for analysis (recorded in groups.json). This neutralizes
// path traversal even if every other guard is bypassed.
function allowedRoots() {
    const roots = [path.join(projectRoot, 'data')]
    try {
        const groupsMap = JSON.parse(
            fs.readFileSync(path.join(methodsDir, 'csvs', 'groups.json'), 'utf8'))
        for (const folder of Object.keys(groupsMap)) roots.push(folder)
    } catch (_) { /* no groups yet — only the data dir is allowed */ }
    return roots
}

function realOrNull(p) {
    try { return fs.realpathSync(path.resolve(p)) } catch (_) { return null }
}

function isPathAllowed(filePath) {
    if (!filePath) return false
    const real = realOrNull(filePath)
    if (!real) return false               // path does not exist / cannot resolve
    const norm = s => (process.platform === 'win32' ? s.toLowerCase() : s)
    const target = norm(real)
    return allowedRoots().some(root => {
        const realRoot = realOrNull(root)
        if (!realRoot) return false
        const base = norm(realRoot)
        return target === base || target.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
    })
}

// ── Python dependency preflight ──────────────────────────────────────────────
// Import the packages the pipeline needs. If they're missing, the user ran the
// tool without setting up the Python environment — surface a clear, actionable
// message instead of a cryptic ModuleNotFoundError mid-pipeline.
const _PREFLIGHT_IMPORTS = 'import nibabel, numpy, pandas, scipy, skimage, dipy, PIL'

function envErrorMessage(detail) {
  const usingVenv = python !== 'python' && python !== 'python3'
  return (
    '\n[ERROR] Python environment is not ready — the analysis cannot run.\n\n' +
    'The pipeline needs Python packages that are not installed' +
    (usingVenv ? ' in methods/venv' : ' (no methods/venv was found, so the system Python is being used)') +
    '.\n' +
    (detail ? `  ↳ ${detail}\n` : '') +
    '\nFix it once by running the setup script from the project folder:\n' +
    '    Windows:        setup.bat\n' +
    '    Linux / macOS:  ./setup.sh\n' +
    'Then start the tool again (start.bat / ./start.sh). Setup creates\n' +
    'methods/venv and installs nibabel, torch, pandas and everything else.\n'
  )
}

// Returns a Promise<string|null>: an error message if the env is broken, else null.
function pythonPreflight(send) {
  return new Promise(resolve => {
    send({ text: 'Checking Python environment…\n' })
    let proc
    try {
      proc = spawn(python, ['-c', _PREFLIGHT_IMPORTS])
    } catch (e) {
      return resolve(envErrorMessage(e.message))
    }
    let err = ''
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', e => resolve(envErrorMessage(e.message)))
    proc.on('close', code => {
      if (code === 0) { send({ text: '✔ Python environment OK\n' }); resolve(null) }
      else {
        const firstLine = err.trim().split('\n').filter(Boolean).pop() || 'a required package is missing'
        resolve(envErrorMessage(firstLine))
      }
    })
  })
}

// ── SSE utility: stream a Python subprocess to the client ────────────────────
// If `preflight` is provided it runs first (after headers flush); when it
// returns an error string the subprocess is never spawned.
function spawnSSE(res, args, cwd, extraEnv = {}, preflight = null) {
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // disable buffering in proxies (nginx/CRA)
  res.flushHeaders()

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const run = () => {
    // PYTHONUNBUFFERED=1 + -u flag ensure real-time output through pipes
    // PYTHONIOENCODING=utf-8 prevents UnicodeEncodeError on Windows (pipe defaults to cp1252)
    const env  = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', ...extraEnv }
    const proc = spawn(python, ['-u', ...args], { cwd, env })

    proc.stdout.on('data', d => send({ text: d.toString() }))
    proc.stderr.on('data', d => send({ text: d.toString() }))
    proc.on('close', code => { send({ done: true, code }); res.end() })
    proc.on('error', err  => { send({ text: `[ERROR] ${err.message}\n`, done: true, code: 1 }); res.end() })

    // Kill process if client disconnects
    res.on('close', () => proc.kill())
  }

  if (preflight) {
    Promise.resolve(preflight(send)).then(errMsg => {
      if (errMsg) { send({ text: errMsg }); send({ done: true, code: 1 }); res.end() }
      else run()
    })
  } else {
    run()
  }
}

// ── POST /api/run-pipeline ────────────────────────────────────────────────────
app.post('/api/run-pipeline', (req, res) => {
  const { paths = [], groupsMap = {}, skipCnn = false, skipRoqs = false, cnnDevice = 'auto' } = req.body

  const groupsFile = path.join(methodsDir, 'csvs', 'groups.json')
  try { fs.writeFileSync(groupsFile, JSON.stringify(groupsMap, null, 2), 'utf-8') }
  catch (e) { console.warn('Could not save groups.json:', e.message) }

  const args = ['run.py', '-p', ...paths]
  if (skipCnn)   args.push('--skip-cnn')
  if (skipRoqs)  args.push('--skip-roqs')

  // CNN compute device preference (auto | cpu | gpu) — read by predict3D.py
  const device = ['auto', 'cpu', 'gpu'].includes(cnnDevice) ? cnnDevice : 'auto'
  spawnSSE(res, args, methodsDir, { INCCSIGHT_DEVICE: device }, pythonPreflight)
})

// ── POST /api/load-last ───────────────────────────────────────────────────────
app.post('/api/load-last', (req, res) => {
  const csvDir = path.join(methodsDir, 'csvs')
  spawnSSE(res, ['transformInJson.py'], csvDir, {}, pythonPreflight)
})

// ── POST /api/run-demo ────────────────────────────────────────────────────────
app.post('/api/run-demo', (req, res) => {
  const demoPath   = path.join(projectRoot, 'data', 'example')
  const groupsFile = path.join(methodsDir, 'csvs', 'groups.json')
  const groupsMap  = { [demoPath]: 'Demo' }
  try { fs.writeFileSync(groupsFile, JSON.stringify(groupsMap, null, 2), 'utf-8') }
  catch (e) { console.warn('Could not save groups.json:', e.message) }
  spawnSSE(res, ['run.py', '-p', demoPath], methodsDir, {}, pythonPreflight)
})

// ── GET /api/mydata ───────────────────────────────────────────────────────────
app.get('/api/mydata', (req, res) => {
  const candidates = [
    path.join(projectRoot, 'data',  'mydata.json'),          // new canonical location
    path.join(projectRoot, 'src', 'data', 'mydata.json'),    // legacy fallback
    path.join(methodsDir,  'csvs', 'mydata.json'),           // legacy fallback
  ]
  for (const loc of candidates) {
    if (fs.existsSync(loc)) return res.sendFile(loc)
  }
  res.status(404).json({ error: 'mydata.json not found. Run an analysis first.' })
})

// ── GET /api/file?path=<abs> — serve local files (images, NIfTI) ─────────────
app.get('/api/file', (req, res) => {
  const filePath = req.query.path
  if (!filePath)                return res.status(400).json({ error: 'Missing "path" parameter.' })
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED_FILE_EXTS.has(ext)) {
    return res.status(403).json({ error: `File type not allowed: ${ext}` })
  }
  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: 'Access denied: path is outside the allowed folders.' })
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' })
  res.sendFile(filePath)
})

// ── GET /api/exists?path=<abs> — check file existence ────────────────────────
app.get('/api/exists', (req, res) => {
  // isPathAllowed already requires the path to resolve to a real file under an
  // allowed root, so it doubles as the existence check (no arbitrary oracle).
  res.json({ exists: isPathAllowed(req.query.path) })
})

// ── POST /api/check-paths — verify that folders exist on disk ────────────────
app.post('/api/check-paths', (req, res) => {
  const { paths = [] } = req.body
  const results = paths.map(p => {
    let exists = false
    try { exists = Boolean(p && fs.existsSync(p) && fs.statSync(p).isDirectory()) } catch (_) {}
    return { path: p, exists }
  })
  res.json(results)
})

// ── POST /api/browse-folder — open native OS folder-picker dialog ─────────────
// Returns { path: "..." } on success, { path: "" } when user cancels,
// or { error: "..." } when the platform is not supported.
app.post('/api/browse-folder', (_req, res) => {
  const { execFile, exec } = require('child_process')

  if (process.platform === 'win32') {
    // PowerShell FolderBrowserDialog — works headless on Win10/11
    const ps = [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms;` +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog;` +
      `$d.Description = 'Select subject/group folder';` +
      `$d.ShowNewFolderButton = $false;` +
      `if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath } else { '' }`
    ]
    execFile('powershell.exe', ps, { timeout: 60000 }, (err, stdout) => {
      if (err) return res.json({ path: '' })
      res.json({ path: stdout.trim() })
    })

  } else if (process.platform === 'darwin') {
    // macOS: AppleScript
    exec(
      `osascript -e 'POSIX path of (choose folder with prompt "Select subject/group folder")'`,
      { timeout: 60000 },
      (err, stdout) => res.json({ path: err ? '' : stdout.trim().replace(/\/$/, '') })
    )

  } else {
    // Linux: try zenity, fall back to kdialog
    exec('which zenity', (e) => {
      if (!e) {
        exec('zenity --file-selection --directory --title="Select subject/group folder"',
          { timeout: 60000 },
          (err, stdout) => res.json({ path: err ? '' : stdout.trim() })
        )
      } else {
        exec('kdialog --getexistingdirectory .',
          { timeout: 60000 },
          (err, stdout) => {
            if (err) return res.status(501).json({ error: 'Install zenity or kdialog for folder picker support.' })
            res.json({ path: stdout.trim() })
          }
        )
      }
    })
  }
})

// ── GET /api/removed-subjects ─────────────────────────────────────────────────
app.get('/api/removed-subjects', (_req, res) => {
  const rmFile = path.join(methodsDir, 'csvs', 'removed_subjects.json')
  try {
    const data = JSON.parse(fs.readFileSync(rmFile, 'utf8'))
    res.json({ ids: data.ids || [] })
  } catch (_) {
    res.json({ ids: [] })
  }
})

// ── POST /api/remove-subjects — add IDs to removed list + re-run transform ───
app.post('/api/remove-subjects', (req, res) => {
  const { execSync } = require('child_process')
  const { ids = [] } = req.body
  const rmFile = path.join(methodsDir, 'csvs', 'removed_subjects.json')

  let current = { ids: [] }
  try { current = JSON.parse(fs.readFileSync(rmFile, 'utf8')) } catch (_) {}

  const newIds = [...new Set([...current.ids, ...ids])]
  try {
    fs.writeFileSync(rmFile, JSON.stringify({ ids: newIds }, null, 2), 'utf-8')
  } catch (e) {
    return res.status(500).json({ error: 'Could not write removed_subjects.json: ' + e.message })
  }

  try {
    execSync(`"${python}" -u transformInJson.py`, {
      cwd: path.join(methodsDir, 'csvs'),
      timeout: 30000,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    })
  } catch (e) {
    console.warn('[WARN] transformInJson.py failed after remove:', e.message)
  }

  res.json({ ids: newIds })
})

// ── POST /api/restore-subjects — remove IDs from removed list + re-run ────────
app.post('/api/restore-subjects', (req, res) => {
  const { execSync } = require('child_process')
  const { ids = [] } = req.body
  const rmFile = path.join(methodsDir, 'csvs', 'removed_subjects.json')

  let current = { ids: [] }
  try { current = JSON.parse(fs.readFileSync(rmFile, 'utf8')) } catch (_) {}

  const newIds = current.ids.filter(id => !ids.includes(id))
  try {
    fs.writeFileSync(rmFile, JSON.stringify({ ids: newIds }, null, 2), 'utf-8')
  } catch (e) {
    return res.status(500).json({ error: 'Could not write removed_subjects.json: ' + e.message })
  }

  try {
    execSync(`"${python}" -u transformInJson.py`, {
      cwd: path.join(methodsDir, 'csvs'),
      timeout: 30000,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    })
  } catch (e) {
    console.warn('[WARN] transformInJson.py failed after restore:', e.message)
  }

  res.json({ ids: newIds })
})

// ── CSV parser (BOM-safe, comma or semicolon, quoted fields) ─────────────────
function parseCsv(text) {
    text = text.replace(/^﻿/, '')
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const delim = lines[0].includes(';') ? ';' : ','
    function splitLine(line) {
        const cells = []
        let cur = '', inQ = false
        for (const ch of line) {
            if (ch === '"' && !inQ) { inQ = true; continue }
            if (ch === '"' &&  inQ) { inQ = false; continue }
            if (ch === delim && !inQ) { cells.push(cur.trim()); cur = ''; continue }
            cur += ch
        }
        cells.push(cur.trim())
        return cells
    }
    const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim())
    return lines.slice(1).map(line => {
        const cells = splitLine(line)
        const row = {}
        headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
        return row
    }).filter(row => Object.values(row).some(v => v !== ''))
}

const DEMOGRAPH_COLS = [
    'subject_id', 'age', 'sex', 'ethnicity', 'diagnosis',
    'disease_duration', 'medication', 'scanner', 'field_strength',
    'acquisition_date', 'weight_kg', 'height_cm',
]

// ── GET /api/demograph ────────────────────────────────────────────────────────
app.get('/api/demograph', (req, res) => {
    const groupsFile = path.join(methodsDir, 'csvs', 'groups.json')
    let groupsMap = {}
    try { groupsMap = JSON.parse(fs.readFileSync(groupsFile, 'utf8')) } catch (_) {}

    const allRows = []
    for (const [folderPath, groupName] of Object.entries(groupsMap)) {
        const csvPath = path.join(folderPath, 'demograph.csv')
        if (!fs.existsSync(csvPath)) continue
        try {
            const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
            rows.forEach(row => { row.group = groupName; allRows.push(row) })
        } catch (e) {
            console.warn(`[WARN] demograph.csv parse error at ${csvPath}:`, e.message)
        }
    }

    if (!allRows.length) {
        return res.status(404).json({ error: 'No demograph.csv found in any group folder.' })
    }

    const presentCols = DEMOGRAPH_COLS.filter(col =>
        col !== 'subject_id' &&
        allRows.some(r => r[col] !== undefined && r[col] !== '')
    )

    res.json({ rows: allRows, presentCols })
})

// ── GET /api/ping ─────────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }))

// ── Serve React build in production ───────────────────────────────────────────
// In development the CRA dev server (port 3000) handles the frontend.
// In production (Docker / npm run start:prod) Express serves the built React app.
if (process.env.NODE_ENV === 'production') {
  const buildDir = path.join(projectRoot, 'build')
  if (fs.existsSync(buildDir)) {
    app.use(express.static(buildDir))
    // Catch-all: React Router handles client-side navigation
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildDir, 'index.html'))
    })
    console.log(`✔  Serving React build from ${buildDir}`)
  } else {
    console.warn('[WARNING] build/ not found — run "npm run build" first.')
  }
}

const server = app.listen(PORT, HOST, () => {
  const shown = (HOST === '127.0.0.1' || HOST === '0.0.0.0' || HOST === '::') ? 'localhost' : HOST
  console.log(`✔  inCCsight server running at http://${shown}:${PORT}  (bound to ${HOST})`)
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖  Port ${PORT} is already in use.`)
    console.error(`   Run the following to free it and try again:\n`)
    console.error(`   powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force"\n`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})
