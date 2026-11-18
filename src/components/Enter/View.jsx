import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FolderSelector from '../FolderSelector/FolderSelector'
import { TbPlus, TbAlertTriangle, TbCircleCheck, TbCircleX, TbX } from 'react-icons/tb'
import HelpPanel from '../Help/HelpPanel'
import ContributePanel from '../Contribute/ContributePanel'
import SettingsPanel from '../Settings/SettingsPanel'
import { getSetting, apiBase } from '../../settings/settings'
import { t } from '../../settings/i18n'

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
    const [skipProcessed, setSkipProcessed] = useState(false)
    const [error, setError]     = useState('')

    // Stable, render-independent counter for unique group ids.
    const nextIdRef = useRef(2)

    // "Open existing analysis" panel — check which subjects already have
    // processed data (an inCCsight/ folder) without re-running the pipeline.
    const [showExistingPanel, setShowExistingPanel] = useState(false)
    const [existingPath, setExistingPath]           = useState('')
    const [checkingSubjects, setCheckingSubjects]   = useState(false)
    const [subjectsResult, setSubjectsResult]       = useState(null) // { processed: [], unprocessed: [] }
    const [existingError, setExistingError]         = useState('')

    // Subject preview (legacy per-subject data — images + roqs_based.csv)
    const [previewSubject, setPreviewSubject] = useState(null) // { id, path }
    const [previewData, setPreviewData]       = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)

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

    // Closing or reloading the tab cancels the running analysis on the server,
    // so ask the browser to confirm first while one is in progress.
    function warnBeforeUnload(e) {
        e.preventDefault()
        e.returnValue = ''
    }

    async function streamPipeline(endpoint, body) {
        showLoading()
        window.addEventListener('beforeunload', warnBeforeUnload)
        try {
            const response = await fetch(`${API}${endpoint}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    body ? JSON.stringify(body) : undefined,
            })

            if (response.status === 409) {
                // Another analysis is already running (e.g. in another tab).
                const data = await response.json().catch(() => ({}))
                hideLoading()
                setError(data.error || 'Another analysis is already running.')
                return
            }
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
        } finally {
            window.removeEventListener('beforeunload', warnBeforeUnload)
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

        streamPipeline('/api/run-pipeline', {
            paths, groupsMap, skipCnn, skipRoqs, skipProcessed,
            cnnDevice: getSetting('cnnDevice'),
        })
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

    // ── Open existing analysis (check only, no pipeline run) ──────────────

    async function browseExistingFolder() {
        try {
            const res  = await fetch(`${API}/api/browse-folder`, { method: 'POST' })
            const data = await res.json()
            if (data.error) {
                setExistingError(data.error)
            } else if (data.path) {
                setExistingPath(data.path)
            }
        } catch {
            setExistingError('Could not open folder picker. Make sure the server is running.')
        }
    }

    async function checkExistingSubjects() {
        const p = existingPath.trim()
        setExistingError('')
        if (!p) {
            setExistingError('Enter or browse to a folder path first.')
            return
        }
        if (!await ensureServer()) return

        setCheckingSubjects(true)
        setSubjectsResult(null)
        try {
            const res  = await fetch(`${API}/api/check-subjects?path=${encodeURIComponent(p)}`)
            const data = await res.json()
            if (data.error) {
                setExistingError(data.error)
            } else {
                setSubjectsResult(data)
            }
        } catch (err) {
            setExistingError(`Could not check subjects: ${err.message}`)
        } finally {
            setCheckingSubjects(false)
        }
    }

    async function openSubjectPreview(subject) {
        setPreviewSubject(subject)
        setPreviewData(null)
        setPreviewLoading(true)
        try {
            const res  = await fetch(`${API}/api/subject-preview?path=${encodeURIComponent(subject.path)}`)
            const data = await res.json()
            if (data.error) {
                setExistingError(data.error)
                setPreviewSubject(null)
            } else {
                setPreviewData(data)
            }
        } catch (err) {
            setExistingError(`Could not load subject preview: ${err.message}`)
            setPreviewSubject(null)
        } finally {
            setPreviewLoading(false)
        }
    }

    function closeSubjectPreview() {
        setPreviewSubject(null)
        setPreviewData(null)
    }

    // FA is a 0-1 ratio; MD/RD/AD are ~1e-3 diffusivities — format accordingly.
    function fmtScalar(scalar, val) {
        if (val === null || val === undefined) return '—'
        return scalar === 'FA' ? val.toFixed(3) : val.toExponential(2)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (type === 'Input') {
        return (
            <>
                <span className='enter-name'>{t('enter.selectFolders')}</span>

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
                        <span>{t('enter.addGroup')}</span>
                    </button>
                </div>

                {/* Method selector — multi-select */}
                <div className='method-selector'>
                    <span className='method-label'>{t('enter.segMethods')}</span>
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

                {/* Pipeline options */}
                <div className='method-selector'>
                    <span className='method-label'>{t('enter.pipelineOptions')}</span>
                    <div className='method-pills'>
                        <label
                            className={`method-pill${skipProcessed ? ' active' : ''}`}
                            title={t('enter.skipProcessedDesc')}
                        >
                            <input
                                type='checkbox'
                                checked={skipProcessed}
                                onChange={e => setSkipProcessed(e.target.checked)}
                                style={{ marginRight: 6 }}
                            />
                            {t('enter.skipProcessed')}
                        </label>
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
                            <span>{t('enter.lastAnalysis')}</span>
                        </div>
                        <div className='btn-demo' onClick={runDemo}>
                            <span>{t('enter.demoData')}</span>
                        </div>
                        <div className='btn-existing' onClick={() => setShowExistingPanel(v => !v)}>
                            <span>{t('enter.openExisting')}</span>
                        </div>
                    </div>
                    <button className='btn-start' onClick={startAnalyzes}>
                        {t('enter.runAnalysis')}
                    </button>
                </div>

                {/* Open existing analysis — check which subjects already have processed data */}
                {showExistingPanel && (
                    <div className='existing-analysis-panel'>
                        <span className='panel-title'>{t('enter.openExisting')}</span>
                        <span className='panel-desc'>{t('enter.openExistingDesc')}</span>

                        <div className='existing-path-row'>
                            <input
                                type='text'
                                className='existing-path-input'
                                placeholder={t('enter.folderPathBrowse')}
                                value={existingPath}
                                onChange={e => setExistingPath(e.target.value)}
                            />
                            <button className='browse-btn-small' onClick={browseExistingFolder}>
                                {t('enter.browse')}
                            </button>
                            <button
                                className='check-btn'
                                onClick={checkExistingSubjects}
                                disabled={checkingSubjects}
                            >
                                {checkingSubjects ? t('enter.checking') : t('enter.check')}
                            </button>
                        </div>

                        {existingError && (
                            <div className='enter-error' role='alert'>
                                <TbAlertTriangle className='enter-error-icon' />
                                <span>{existingError}</span>
                            </div>
                        )}

                        {subjectsResult && (
                            <div className='subjects-check-results'>
                                <div className='subjects-col processed'>
                                    <span className='col-title'>
                                        <TbCircleCheck /> {t('enter.processed')} ({subjectsResult.processed.length})
                                    </span>
                                    <ul>
                                        {subjectsResult.processed.map(s => (
                                            <li
                                                key={s.path}
                                                className='clickable'
                                                title={`${s.path}\n(${t('enter.clickToPreview')})`}
                                                onClick={() => openSubjectPreview(s)}
                                            >
                                                {s.id}
                                            </li>
                                        ))}
                                        {subjectsResult.processed.length === 0 && (
                                            <li className='empty'>{t('enter.noneFound')}</li>
                                        )}
                                    </ul>
                                </div>
                                <div className='subjects-col unprocessed'>
                                    <span className='col-title'>
                                        <TbCircleX /> {t('enter.notProcessed')} ({subjectsResult.unprocessed.length})
                                    </span>
                                    <ul>
                                        {subjectsResult.unprocessed.map(s => (
                                            <li key={s.path} title={s.path}>{s.id}</li>
                                        ))}
                                        {subjectsResult.unprocessed.length === 0 && (
                                            <li className='empty'>{t('enter.noneFound')}</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {previewSubject && (
                            <div className='subject-preview'>
                                <div className='subject-preview-header'>
                                    <span className='preview-title'>Subject {previewSubject.id}</span>
                                    <button className='preview-close' onClick={closeSubjectPreview} title='Close'>
                                        <TbX />
                                    </button>
                                </div>

                                {previewLoading && <span className='preview-loading'>Loading…</span>}

                                {previewData && (
                                    <>
                                        <div className='preview-images'>
                                            {previewData.images.roqs && (
                                                <div className='preview-image-card'>
                                                    <span>ROQS</span>
                                                    <img src={previewData.images.roqs} alt='ROQS midsagittal' />
                                                </div>
                                            )}
                                            {previewData.images.watershed && (
                                                <div className='preview-image-card'>
                                                    <span>Watershed</span>
                                                    <img src={previewData.images.watershed} alt='Watershed midsagittal' />
                                                </div>
                                            )}
                                            {previewData.images.cnn && (
                                                <div className='preview-image-card'>
                                                    <span>CNN</span>
                                                    <img src={previewData.images.cnn} alt='CNN midsagittal' />
                                                </div>
                                            )}
                                            {Object.keys(previewData.images).length === 0 && (
                                                <span className='preview-warning'>No midsagittal images found.</span>
                                            )}
                                        </div>

                                        {previewData.scalar ? (
                                            <>
                                                <span className='preview-subtitle'>ROQS whole-CC scalar (mean ± std)</span>
                                                <table className='preview-table'>
                                                    <thead>
                                                        <tr><th></th><th>FA</th><th>MD</th><th>RD</th><th>AD</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td>mean ± std</td>
                                                            {['FA', 'MD', 'RD', 'AD'].map(s => (
                                                                <td key={s}>
                                                                    {fmtScalar(s, previewData.scalar[s].mean)} ± {fmtScalar(s, previewData.scalar[s].std)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>

                                                <span className='preview-subtitle'>Witelson parcellation (5 sub-regions)</span>
                                                <table className='preview-table'>
                                                    <thead>
                                                        <tr><th></th>{['P1', 'P2', 'P3', 'P4', 'P5'].map(r => <th key={r}>{r}</th>)}</tr>
                                                    </thead>
                                                    <tbody>
                                                        {['FA', 'MD', 'RD', 'AD'].map(s => (
                                                            <tr key={s}>
                                                                <td>{s}</td>
                                                                {['P1', 'P2', 'P3', 'P4', 'P5'].map(r => (
                                                                    <td key={r}>
                                                                        {fmtScalar(s, previewData.parcellation.Witelson[r][s])}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </>
                                        ) : (
                                            <span className='preview-warning'>
                                                No roqs_based.csv found for this subject — only images available.
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </>
        )
    }

    if (type === 'Help') {
        return <HelpPanel />
    }

    if (type === 'Github') {
        return <ContributePanel />
    }

    if (type === 'Settings') {
        return <SettingsPanel />
    }

    return <div className='news-container'><span>Coming soon</span></div>
}

export default View
