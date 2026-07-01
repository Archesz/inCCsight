import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FolderSelector from '../FolderSelector/FolderSelector'
import { TbPlus, TbAlertTriangle } from 'react-icons/tb'
import Question from '../Question/Question'
import SettingsPanel from '../Settings/SettingsPanel'
import { getSetting, apiBase } from '../../settings/settings'

// API base URL. In production the React build is served by the same Express
// server, so an empty string (relative URLs) hits the right origin. In dev the
// CRA dev-server proxy BUFFERS the SSE stream, so the live pipeline console and
// progress bar never update (they sit on "Starting…"). Talk to Express (:3001)
// directly in dev to bypass the proxy; REACT_APP_API_URL still overrides.
const API = apiBase()

// AbortSignal.timeout() is not available in Safari < 16.
// This helper creates a timeout signal compatible with all browsers.
function abortAfter(ms) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), ms)
    controller.signal.addEventListener('abort', () => clearTimeout(id))
    return controller.signal
}

// ── Available pipeline methods ────────────────────────────────────────────────
// ROQS and Watershed share the same script (roqs/main.py); selecting
// either one activates the full 2D pipeline.
const METHODS = [
    { id: 'roqs',      label: 'ROQS (2D)',      desc: 'Classic 2D ROQS segmentation' },
    { id: 'watershed', label: 'Watershed (2D)', desc: 'Watershed segmentation (runs together with ROQS)' },
    { id: 'cnn',       label: 'CNN (3D)',        desc: 'Volumetric 3D segmentation (requires PyTorch)' },
]

const questions = [
    { question: 'How do I add data?',            response: 'Paste the absolute path to each group folder (e.g. C:\\data\\controls). Each sub-folder should be a subject containing DTI files.' },
    { question: 'How do I add more groups?',     response: 'Click "+ Add group", give the group a name, and provide the corresponding folder path.' },
    { question: 'How do I compare groups?',      response: 'After analysis, the dashboard shows per-group tabs and a "Compare Groups" tab with side-by-side boxplots.' },
    { question: 'What are ROQS and CNN?',        response: 'ROQS produces 2D corpus callosum segmentation. CNN produces volumetric 3D segmentation. Selecting both runs the full pipeline.' },
    { question: 'What files are required?',      response: 'DTI data in NIfTI format (.nii / .nii.gz) with eigenvector/eigenvalue files: dti_L1–3, dti_V1–3.' },
]

// Message shown when the Express backend can't be reached.
const SERVER_UNREACHABLE =
    'Cannot reach the analysis server. Make sure inCCsight is running ' +
    '(run start.bat on Windows, ./start.sh on Linux/macOS, or `npm run dev`).'

function View({ type }) {
    const navigate = useNavigate()

    const [folderGroups, setFolderGroups] = useState([
        { id: 1, path: '', groupName: 'Group 1' }
    ])
    // set of selected methods (multi-select) — initialised from saved preferences
    const [selectedMethods, setSelectedMethods] = useState(() => new Set(getSetting('defaultMethods')))
    const [filter, setFilter] = useState('')
    const [error, setError]     = useState('')

    // Stable, render-independent counter for unique group ids.
    const nextIdRef = useRef(2)

    // Ping the backend; on failure set an inline error and return false.
    async function ensureServer() {
        try {
            const ping = await fetch(`${API}/api/ping`, { signal: abortAfter(3000) })
            if (!ping.ok) throw new Error()
            return true
        } catch {
            setError(SERVER_UNREACHABLE)
            return false
        }
    }

    // ── DOM helpers ────────────────────────────────────────────────────────

    function showLoading() {
        const log    = document.querySelector('#pipeline-log')
        const screen = document.querySelector('#loading-screen')
        if (log)    log.textContent = ''
        if (screen) screen.style.display = 'flex'
        // Reset progress bar
        const fill  = document.querySelector('#progress-bar-fill')
        const label = document.querySelector('#progress-label')
        if (fill)  fill.style.width = '0%'
        if (label) label.textContent = 'Starting…'
    }

    function hideLoading() {
        const screen = document.querySelector('#loading-screen')
        if (screen) {
            screen.style.display = 'none'
            const btn = screen.querySelector('#close-pipeline-btn')
            if (btn) btn.remove()
        }
    }

    function appendLog(text) {
        const log = document.querySelector('#pipeline-log')
        if (log) { log.textContent += text; log.scrollTop = log.scrollHeight }
    }

    function updateProgress(current, total, step) {
        const fill  = document.querySelector('#progress-bar-fill')
        const label = document.querySelector('#progress-label')
        if (fill && total > 0) {
            fill.style.width = `${Math.round((current / total) * 100)}%`
        }
        if (label) {
            label.textContent = total > 0
                ? `${step} (${current}/${total})`
                : step
        }
    }

    // ── SSE streaming ──────────────────────────────────────────────────────

    async function streamPipeline(endpoint, body) {
        showLoading()
        try {
            const response = await fetch(`${API}${endpoint}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    body ? JSON.stringify(body) : undefined,
            })

            if (!response.ok) {
                const text = await response.text().catch(() => '')
                throw new Error(`Server returned ${response.status}.\n${text}`)
            }

            const reader  = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer    = ''
            let navigated = false

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const msg = JSON.parse(line.slice(6))
                        if (msg.text) {
                            // Parse PROGRESS:current:total:step_name lines
                            const progMatch = msg.text.match(/PROGRESS:(\d+):(\d+):(.*)/)
                            if (progMatch) {
                                updateProgress(
                                    parseInt(progMatch[1], 10),
                                    parseInt(progMatch[2], 10),
                                    progMatch[3].trim()
                                )
                            }
                            appendLog(msg.text)
                        }
                        if (msg.done && !navigated) {
                            navigated = true
                            if (msg.code === 0) {
                                navigate('/Home', { state: { initialTab: 'qc' } })
                            } else {
                                appendLog('\n✖ Pipeline finished with errors. Check the log above.\n')
                                const screen = document.querySelector('#loading-screen')
                                if (screen && !screen.querySelector('#close-pipeline-btn')) {
                                    const btn = document.createElement('button')
                                    btn.id          = 'close-pipeline-btn'
                                    btn.textContent = 'Close'
                                    btn.onclick     = hideLoading
                                    screen.appendChild(btn)
                                }
                            }
                        }
                    } catch (_) {}
                }
            }
        } catch (err) {
            hideLoading()
            setError(`Could not connect to the server: ${err.message}`)
        }
    }

    // ── Group management ───────────────────────────────────────────────────

    function updateGroup(id, updates) {
        setFolderGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
    }

    function addGroup() {
        const id = nextIdRef.current++
        setFolderGroups(prev => [...prev, { id, path: '', groupName: `Group ${prev.length + 1}` }])
    }

    function removeGroup(id) {
        setFolderGroups(prev => prev.filter(g => g.id !== id))
    }

    // ── Pipeline actions ───────────────────────────────────────────────────

    async function startAnalyzes() {
        setError('')
        const valid = folderGroups.filter(g => g.path.trim())
        if (valid.length === 0) {
            setError('Enter at least one folder path before running the analysis.')
            return
        }

        // 1. Check that the Express server is running
        if (!await ensureServer()) return

        // 2. Verify that the paths exist on disk
        const paths = valid.map(g => g.path.trim())
        try {
            const checkRes = await fetch(`${API}/api/check-paths`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ paths }),
            })
            const checks  = await checkRes.json()
            const missing = checks.filter(c => !c.exists).map(c => c.path)
            if (missing.length > 0) {
                setError(
                    `These folders were not found on disk: ${missing.join(', ')}. ` +
                    'Check that each path is correct and the folder exists.'
                )
                return
            }
        } catch {
            // If check fails, continue anyway (non-blocking)
        }

        const groupsMap = {}
        valid.forEach(g => { groupsMap[g.path.trim()] = g.groupName.trim() || `Group ${g.id}` })

        // ROQS and Watershed use the same script; either one enables the 2D pipeline
        const skipRoqs = !selectedMethods.has('roqs') && !selectedMethods.has('watershed')
        const skipCnn  = !selectedMethods.has('cnn')

        // Tractography is deferred to a future version — always skip it for now.
        streamPipeline('/api/run-pipeline', { paths, groupsMap, skipCnn, skipRoqs, skipTract: true, cnnDevice: getSetting('cnnDevice') })
    }

    async function loadLast() {
        setError('')
        if (!await ensureServer()) return
        streamPipeline('/api/load-last', null)
    }

    async function runDemo() {
        setError('')
        if (!await ensureServer()) return
        streamPipeline('/api/run-demo', null)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (type === 'Input') {
        return (
            <>
                <span className='enter-name'>Select the folders to analyse — one per group.</span>

                {/* Group list */}
                <div className='folders-inputs'>
                    {folderGroups.map((g, idx) => (
                        <FolderSelector
                            key={g.id}
                            id={g.id}
                            path={g.path}
                            groupName={g.groupName}
                            colorIndex={idx}
                            onUpdate={updates => updateGroup(g.id, updates)}
                            onRemove={folderGroups.length > 1 ? () => removeGroup(g.id) : null}
                        />
                    ))}

                    <button className='add-btn' onClick={addGroup}>
                        <TbPlus className='add-icon' />
                        <span>Add group</span>
                    </button>
                </div>

                {/* Method selector — multi-select */}
                <div className='method-selector'>
                    <span className='method-label'>Segmentation methods</span>
                    <div className='method-pills'>
                        {METHODS.map(m => {
                            const checked = selectedMethods.has(m.id)
                            return (
                                <label
                                    key={m.id}
                                    className={`method-pill${checked ? ' active' : ''}`}
                                    title={m.desc}
                                >
                                    <input
                                        type='checkbox'
                                        checked={checked}
                                        onChange={() => {
                                            setSelectedMethods(prev => {
                                                const next = new Set(prev)
                                                next.has(m.id) ? next.delete(m.id) : next.add(m.id)
                                                return next
                                            })
                                        }}
                                        style={{ marginRight: 6 }}
                                    />
                                    {m.label}
                                </label>
                            )
                        })}
                    </div>
                </div>

                {/* Inline error banner */}
                {error && (
                    <div className='enter-error' role='alert'>
                        <TbAlertTriangle className='enter-error-icon' />
                        <span>{error}</span>
                    </div>
                )}

                {/* Action buttons */}
                <div className='row-btns'>
                    <div className='secondary-btns'>
                        <div className='btn-history' onClick={loadLast}>
                            <span>Last analysis</span>
                        </div>
                        <div className='btn-demo' onClick={runDemo}>
                            <span>Demo data</span>
                        </div>
                    </div>
                    <button className='btn-start' onClick={startAnalyzes}>
                        Run analysis
                    </button>
                </div>
            </>
        )
    }

    if (type === 'Help') {
        const filtered = questions.filter(q =>
            q.question.toLowerCase().includes(filter.toLowerCase()) ||
            q.response.toLowerCase().includes(filter.toLowerCase())
        )
        return (
            <div className='enter-question'>
                <div className='search-field'>
                    <span className='enter-name'>Frequently asked questions about the tool.</span>
                    <input
                        className='search-input'
                        placeholder='Search questions...'
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                <div className='questions-container'>
                    {filtered.map((q, i) => (
                        <Question key={i} question={q.question} response={q.response} />
                    ))}
                </div>
            </div>
        )
    }

    if (type === 'Settings') {
        return <SettingsPanel />
    }

    return <div className='news-container'><span>Coming soon</span></div>
}

export default View
