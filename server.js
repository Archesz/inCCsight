// server.js — Local Express backend for inCCsight
const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')
const { spawn } = require('child_process')

const app  = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

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

// ── SSE utility: stream a Python subprocess to the client ────────────────────
function spawnSSE(res, args, cwd) {
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // disable buffering in proxies (nginx/CRA)
  res.flushHeaders()

  // PYTHONUNBUFFERED=1 + -u flag ensure real-time output through pipes
  // PYTHONIOENCODING=utf-8 prevents UnicodeEncodeError on Windows (pipe defaults to cp1252)
  const env  = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
  const proc = spawn(python, ['-u', ...args], { cwd, env })

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`)

  proc.stdout.on('data', d => send({ text: d.toString() }))
  proc.stderr.on('data', d => send({ text: d.toString() }))
  proc.on('close', code => { send({ done: true, code }); res.end() })
  proc.on('error', err  => { send({ text: `[ERROR] ${err.message}\n`, done: true, code: 1 }); res.end() })

  // Kill process if client disconnects
  res.on('close', () => proc.kill())
}

// ── POST /api/run-pipeline ────────────────────────────────────────────────────
app.post('/api/run-pipeline', (req, res) => {
  const { paths = [], groupsMap = {}, skipCnn = false, skipRoqs = false } = req.body

  const groupsFile = path.join(methodsDir, 'csvs', 'groups.json')
  try { fs.writeFileSync(groupsFile, JSON.stringify(groupsMap, null, 2), 'utf-8') }
  catch (e) { console.warn('Could not save groups.json:', e.message) }

  const args = ['run.py', '-p', ...paths]
  if (skipCnn)  args.push('--skip-cnn')
  if (skipRoqs) args.push('--skip-roqs')

  spawnSSE(res, args, methodsDir)
})

// ── POST /api/load-last ───────────────────────────────────────────────────────
app.post('/api/load-last', (req, res) => {
  const csvDir = path.join(methodsDir, 'csvs')
  spawnSSE(res, ['transformInJson.py'], csvDir)
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
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' })
  res.sendFile(filePath)
})

// ── GET /api/exists?path=<abs> — check file existence ────────────────────────
app.get('/api/exists', (req, res) => {
  const filePath = req.query.path
  res.json({ exists: Boolean(filePath && fs.existsSync(filePath)) })
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

const server = app.listen(PORT, () => {
  console.log(`✔  inCCsight server running at http://localhost:${PORT}`)
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
