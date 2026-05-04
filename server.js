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
