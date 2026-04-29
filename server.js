// server.js — Backend local que substitui o processo principal do Electron
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
const python      = process.platform === 'win32' ? 'python' : 'python3'

// ── Utilitário: stream SSE de um processo Python ───────────────────────────
function spawnSSE(res, args, cwd) {
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // desativa buffer em proxies (nginx/CRA)
  res.flushHeaders()

  // PYTHONUNBUFFERED=1 + flag -u garantem output em tempo real mesmo via pipe
  const env  = { ...process.env, PYTHONUNBUFFERED: '1' }
  const proc = spawn(python, ['-u', ...args], { cwd, env })

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`)

  proc.stdout.on('data', d => send({ text: d.toString() }))
  proc.stderr.on('data', d => send({ text: d.toString() }))
  proc.on('close', code => { send({ done: true, code }); res.end() })
  proc.on('error', err  => { send({ text: `[ERRO] ${err.message}\n`, done: true, code: 1 }); res.end() })

  // Encerra o processo se o cliente desconectar
  res.on('close', () => proc.kill())
}

// ── POST /api/run-pipeline ─────────────────────────────────────────────────
app.post('/api/run-pipeline', (req, res) => {
  const { paths = [], groupsMap = {}, skipCnn = false, skipRoqs = false } = req.body

  const groupsFile = path.join(methodsDir, 'csvs', 'groups.json')
  try { fs.writeFileSync(groupsFile, JSON.stringify(groupsMap, null, 2), 'utf-8') }
  catch (e) { console.warn('Não foi possível salvar groups.json:', e.message) }

  const args = ['run.py', '-p', ...paths]
  if (skipCnn)  args.push('--skip-cnn')
  if (skipRoqs) args.push('--skip-roqs')

  spawnSSE(res, args, methodsDir)
})

// ── POST /api/load-last ────────────────────────────────────────────────────
app.post('/api/load-last', (req, res) => {
  const csvDir = path.join(methodsDir, 'csvs')
  spawnSSE(res, ['transformInJson.py'], csvDir)
})

// ── GET /api/mydata ────────────────────────────────────────────────────────
app.get('/api/mydata', (req, res) => {
  const candidates = [
    path.join(projectRoot, 'src', 'data', 'mydata.json'),
    path.join(methodsDir,  'csvs', 'mydata.json'),
  ]
  for (const loc of candidates) {
    if (fs.existsSync(loc)) return res.sendFile(loc)
  }
  res.status(404).json({ error: 'mydata.json não encontrado. Execute uma análise primeiro.' })
})

// ── GET /api/file?path=<abs> — serve qualquer arquivo do sistema local ─────
app.get('/api/file', (req, res) => {
  const filePath = req.query.path
  if (!filePath)               return res.status(400).json({ error: 'Parâmetro "path" obrigatório.' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado.' })
  res.sendFile(filePath)
})

// ── GET /api/exists?path=<abs> — verifica existência ──────────────────────
app.get('/api/exists', (req, res) => {
  const filePath = req.query.path
  res.json({ exists: Boolean(filePath && fs.existsSync(filePath)) })
})

// ── POST /api/check-paths — verifica se pastas existem no disco ───────────
app.post('/api/check-paths', (req, res) => {
  const { paths = [] } = req.body
  const results = paths.map(p => {
    let exists = false
    try { exists = Boolean(p && fs.existsSync(p) && fs.statSync(p).isDirectory()) } catch (_) {}
    return { path: p, exists }
  })
  res.json(results)
})

// ── GET /api/ping ──────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }))

const server = app.listen(PORT, () => {
  console.log(`✔  inCCsight server rodando em http://localhost:${PORT}`)
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖  Porta ${PORT} já está em uso.`)
    console.error(`   Execute o comando abaixo para liberar e tente novamente:\n`)
    console.error(`   powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force"\n`)
  } else {
    console.error('Erro ao iniciar servidor:', err.message)
  }
  process.exit(1)
})
