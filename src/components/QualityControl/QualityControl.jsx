import React, { useState, useMemo, useCallback } from 'react'
import './QualityControl.scss'

const API      = 'http://localhost:3001'
const SCALARS  = ['FA', 'MD', 'RD', 'AD']
const METHODS  = ['ROQS', 'Watershed', 'CNN']

// ── helpers ───────────────────────────────────────────────────────────────────

function dirname(p) {
    if (!p) return ''
    return p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
}

function imgPathForMethod(subject, method) {
    if (!subject.img_path) return null
    const dir = dirname(subject.img_path)
    if (method === 'ROQS')      return subject.img_path
    if (method === 'Watershed') return dir + '/midsagittal_watershed.png'
    if (method === 'CNN')       return dir + '/cnnBased_midsagittal.png'
    return subject.img_path
}

// CSV cell escaping (RFC 4180)
function csvCell(v) {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Build a CSV with metadata for removed subjects (QC flags + scalars)
function downloadRemovedCsv(subjects) {
    if (!subjects.length) return
    const cols = [
        'Id', 'group', 'img_path',
        'ROQS_qc_flag',      'ROQS_qc_prob',
        'Watershed_qc_flag', 'Watershed_qc_prob',
        'ROQS_FA',      'ROQS_MD',      'ROQS_RD',      'ROQS_AD',
        'Watershed_FA', 'Watershed_MD', 'Watershed_RD', 'Watershed_AD',
        'CNN_FA',       'CNN_MD',       'CNN_RD',       'CNN_AD',
    ]
    const rows = subjects.map(s => [
        s.Id,
        s.group ?? '',
        s.img_path ?? '',
        s.qc?.ROQS?.flag      ?? '',
        s.qc?.ROQS?.prob      ?? '',
        s.qc?.Watershed?.flag ?? '',
        s.qc?.Watershed?.prob ?? '',
        s.ROQS_scalar?.FA      ?? '',
        s.ROQS_scalar?.MD      ?? '',
        s.ROQS_scalar?.RD      ?? '',
        s.ROQS_scalar?.AD      ?? '',
        s.Watershed_scalar?.FA ?? '',
        s.Watershed_scalar?.MD ?? '',
        s.Watershed_scalar?.RD ?? '',
        s.Watershed_scalar?.AD ?? '',
        s.CNN_scalar?.FA       ?? '',
        s.CNN_scalar?.MD       ?? '',
        s.CNN_scalar?.RD       ?? '',
        s.CNN_scalar?.AD       ?? '',
    ].map(csvCell).join(','))

    const csv = '﻿' + [cols.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `removed_subjects_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

// Build a CSV for the Method Overview table
function downloadOverviewCsv(subjects) {
    if (!subjects.length) return
    const cols = [
        'Id', 'group',
        'ROQS_flag', 'ROQS_prob',
        'Watershed_flag', 'Watershed_prob',
        'CNN_flag', 'CNN_prob',
        'failed_methods', 'status',
    ]
    const rows = subjects.map(s => {
        const failed = METHODS.filter(m => s.qc?.[m]?.flag === true)
        return [
            s.Id,
            s.group ?? '',
            s.qc?.ROQS?.flag      != null ? (s.qc.ROQS.flag      ? 'FAIL' : 'PASS') : '',
            s.qc?.ROQS?.prob      != null ? s.qc.ROQS.prob.toFixed(4)               : '',
            s.qc?.Watershed?.flag != null ? (s.qc.Watershed.flag ? 'FAIL' : 'PASS') : '',
            s.qc?.Watershed?.prob != null ? s.qc.Watershed.prob.toFixed(4)           : '',
            s.qc?.CNN?.flag       != null ? (s.qc.CNN.flag       ? 'FAIL' : 'PASS') : '',
            s.qc?.CNN?.prob       != null ? s.qc.CNN.prob.toFixed(4)                 : '',
            failed.join(';') || 'none',
            s.removed ? 'removed' : failed.length ? 'flagged' : 'ok',
        ].map(csvCell).join(',')
    })

    const csv = '﻿' + [cols.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `qc_method_overview_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

function computeZScores(subjects, scalar, methodKey) {
    const vals = subjects.map(s => {
        const v = parseFloat(s[methodKey]?.[scalar])
        return isNaN(v) ? null : v
    })
    const valid = vals.filter(v => v !== null)
    if (valid.length < 2) return Object.fromEntries(subjects.map(s => [s['Id'], null]))
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length
    const std  = Math.sqrt(valid.reduce((a, v) => a + (v - mean) ** 2, 0) / valid.length)
    const result = {}
    subjects.forEach((s, i) => {
        result[s['Id']] = vals[i] === null ? null : (std > 0 ? (vals[i] - mean) / std : 0)
    })
    return result
}

// ── SubjectCard ───────────────────────────────────────────────────────────────

function SubjectCard({ subject, method, flagShape, flagZ, zVal, prob, isSelected, onToggle, isRemoved }) {
    const [imgErr, setImgErr] = useState(false)
    const imgPath = imgPathForMethod(subject, method)
    const flagged = flagShape || flagZ

    return (
        <div
            className={[
                'qcc',
                flagged   ? 'qcc--flagged'   : '',
                isSelected ? 'qcc--selected'  : '',
                isRemoved  ? 'qcc--removed'   : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !isRemoved && onToggle(subject['Id'])}
            title={isRemoved ? subject['Id'] : undefined}
        >
            {/* image */}
            <div className='qcc-img'>
                {imgPath && !imgErr
                    ? <img
                        src={`${API}/api/file?path=${encodeURIComponent(imgPath)}`}
                        alt={subject['Id']}
                        onError={() => setImgErr(true)}
                      />
                    : <div className='qcc-no-img'>{isRemoved ? '×' : '—'}</div>
                }
            </div>

            {/* info */}
            <div className='qcc-info'>
                <span className='qcc-id'>{subject['Id']}</span>
                {subject.group && <span className='qcc-group'>{subject.group}</span>}

                <div className='qcc-flags'>
                    {prob != null && (
                        <span className={`qcc-tag shape-${flagShape ? 'fail' : 'pass'}`}>
                            {flagShape ? '✕' : '✓'} Shape {(prob * 100).toFixed(0)}%
                        </span>
                    )}
                    {zVal != null && (
                        <span className={`qcc-tag z-${flagZ ? 'fail' : 'pass'}`}>
                            {flagZ ? '✕' : '✓'} Z{zVal >= 0 ? '+' : ''}{zVal.toFixed(2)}
                        </span>
                    )}
                </div>

                {!isRemoved && (
                    <input
                        type='checkbox'
                        className='qcc-check'
                        checked={isSelected}
                        onChange={() => onToggle(subject['Id'])}
                        onClick={e => e.stopPropagation()}
                    />
                )}
            </div>
        </div>
    )
}

// ── MethodOverview ────────────────────────────────────────────────────────────

function MethodOverview({ activeSubjects, removedSubjects }) {
    const [filter, setFilter] = useState('all')  // 'all' | 'failed'

    const allShown    = useMemo(() => [...activeSubjects, ...removedSubjects], [activeSubjects, removedSubjects])
    const failedCount = useMemo(() => allShown.filter(s => METHODS.some(m => s.qc?.[m]?.flag === true)).length, [allShown])

    const displayed = useMemo(() =>
        filter === 'failed'
            ? allShown.filter(s => METHODS.some(m => s.qc?.[m]?.flag === true))
            : allShown,
        [allShown, filter]
    )

    return (
        <div className='qco-wrap'>

            {/* toolbar */}
            <div className='qco-toolbar'>
                <div className='qcc-method-tabs'>
                    <button
                        className={`qcc-mtab${filter === 'all' ? ' active' : ''}`}
                        onClick={() => setFilter('all')}
                    >All subjects ({allShown.length})</button>
                    <button
                        className={`qcc-mtab${filter === 'failed' ? ' active' : ''}`}
                        onClick={() => setFilter('failed')}
                    >Any failure ({failedCount})</button>
                </div>
                <button
                    className='qcg-download-btn'
                    style={{ marginLeft: 'auto' }}
                    onClick={() => downloadOverviewCsv(displayed)}
                    title='Download CSV with per-subject QC flags for all methods'
                >⬇ Download CSV</button>
            </div>

            {/* explanation */}
            <p className='qco-hint'>
                Each cell shows the ViT shape-QC result per method.&nbsp;
                <strong>FAIL</strong> = shape probability above threshold (likely poor segmentation).
                The <em>prob</em> column is the raw model output (0 = perfect shape, 1 = likely fail).
            </p>

            {displayed.length === 0 ? (
                <div className='qc-empty'>No subjects match the current filter.</div>
            ) : (
                <div className='qco-table-wrap'>
                    <table className='qco-table'>
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Group</th>
                                {METHODS.map(m => (
                                    <th key={m}>
                                        {m}
                                        <span className='qco-th-sub'> flag · prob</span>
                                    </th>
                                ))}
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayed.map(s => {
                                const failed = METHODS.filter(m => s.qc?.[m]?.flag === true)
                                const anyFail = failed.length > 0
                                return (
                                    <tr
                                        key={s.Id}
                                        className={[
                                            anyFail     ? 'qco-row--fail' : '',
                                            s.removed   ? 'qco-row--rm'   : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <td className='qco-id'>{s.Id ?? s['Id']}</td>
                                        <td>{s.group ?? '—'}</td>
                                        {METHODS.map(m => {
                                            const flag = s.qc?.[m]?.flag
                                            const prob = s.qc?.[m]?.prob
                                            if (flag == null) {
                                                return <td key={m} className='qco-nd'>—</td>
                                            }
                                            return (
                                                <td key={m} className={`qco-cell qco-cell--${flag ? 'fail' : 'pass'}`}>
                                                    {flag ? '✕ FAIL' : '✓ PASS'}
                                                    {prob != null &&
                                                        <span className='qco-prob'> {(prob * 100).toFixed(0)}%</span>
                                                    }
                                                </td>
                                            )
                                        })}
                                        <td>
                                            {s.removed
                                                ? <span className='qco-badge qco-badge--rm'>Removed</span>
                                                : anyFail
                                                ? <span className='qco-badge qco-badge--fail'>
                                                    {failed.join(', ')}
                                                  </span>
                                                : <span className='qco-badge qco-badge--pass'>OK</span>
                                            }
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QualityControl({ allSubjects, onReload }) {
    const [viewMode,   setViewMode]   = useState('cards')   // 'cards' | 'overview'
    const [method,     setMethod]     = useState('ROQS')
    const [threshold,  setThreshold]  = useState(0.5)
    const [scalar,     setScalar]     = useState('FA')
    const [zThresh,    setZThresh]    = useState(2.0)
    const [perGroup,   setPerGroup]   = useState(false)
    const [selected,   setSelected]   = useState(new Set())
    const [loading,    setLoading]    = useState(false)

    const methodKey = `${method}_scalar`

    // Split active / removed
    const activeSubjects  = useMemo(() => allSubjects.filter(s => !s.removed), [allSubjects])
    const removedSubjects = useMemo(() => allSubjects.filter(s =>  s.removed), [allSubjects])

    // Z-scores — recomputed per group or globally on active subjects
    const zScores = useMemo(() => {
        const groups = [...new Set(activeSubjects.map(s => s.group || ''))]
        if (perGroup && groups.some(g => g !== '')) {
            const result = {}
            for (const g of groups) {
                const grp = activeSubjects.filter(s => (s.group || '') === g)
                Object.assign(result, computeZScores(grp, scalar, methodKey))
            }
            return result
        }
        return computeZScores(activeSubjects, scalar, methodKey)
    }, [activeSubjects, scalar, methodKey, perGroup])

    // Flag helpers
    const shapeProb  = useCallback(s => s.qc?.[method]?.prob ?? null,        [method])
    const isShape    = useCallback(s => { const p = shapeProb(s); return p != null && p > threshold }, [shapeProb, threshold])
    const isZOut     = useCallback(s => { const z = zScores[s['Id']]; return z != null && Math.abs(z) > zThresh }, [zScores, zThresh])
    const isFlagged  = useCallback(s => isShape(s) || isZOut(s),             [isShape, isZOut])

    const flaggedActive = activeSubjects.filter(isFlagged)
    const passActive    = activeSubjects.filter(s => !isFlagged(s))

    // Selection helpers
    const toggleSelect  = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    const selectFlagged = () => setSelected(new Set(flaggedActive.map(s => s['Id'])))
    const selectAll     = () => setSelected(new Set(activeSubjects.map(s => s['Id'])))
    const unselectAll   = () => setSelected(new Set())

    // API helpers
    async function _post(endpoint, ids) {
        setLoading(true)
        try {
            await fetch(`${API}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            })
            onReload?.()
            setSelected(new Set())
        } catch (e) {
            alert(`Request failed: ${e.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleRemove       = () => _post('/api/remove-subjects',  [...selected])
    const handleRestoreAll   = () => _post('/api/restore-subjects', removedSubjects.map(s => s['Id']))
    const handleRestoreOne   = id => _post('/api/restore-subjects', [id])

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className='qc-root'>

            {/* ── Controls bar ──────────────────────────────────────────── */}
            <div className='qc-ctrl-bar'>

                {/* View mode toggle */}
                <div className='qcc-group'>
                    <span className='qcc-label'>View</span>
                    <div className='qcc-method-tabs'>
                        <button
                            className={`qcc-mtab${viewMode === 'cards' ? ' active' : ''}`}
                            onClick={() => setViewMode('cards')}
                        >Cards</button>
                        <button
                            className={`qcc-mtab${viewMode === 'overview' ? ' active' : ''}`}
                            onClick={() => setViewMode('overview')}
                            title='Table showing QC results for all methods at once'
                        >Method Overview</button>
                    </div>
                </div>

                {/* Method selector (cards mode only) */}
                {viewMode === 'cards' && <>
                    <div className='qcc-group'>
                        <span className='qcc-label'>Method</span>
                        <div className='qcc-method-tabs'>
                            {METHODS.map(m => (
                                <button
                                    key={m}
                                    className={`qcc-mtab${method === m ? ' active' : ''}`}
                                    onClick={() => setMethod(m)}
                                >{m}</button>
                            ))}
                        </div>
                    </div>

                    <div className='qcc-group'>
                        <span className='qcc-label'>Shape threshold: <strong>{threshold.toFixed(2)}</strong></span>
                        <input
                            type='range' min='0' max='1' step='0.01'
                            value={threshold}
                            onChange={e => setThreshold(+e.target.value)}
                            className='qcc-slider'
                        />
                    </div>

                    <div className='qcc-group'>
                        <span className='qcc-label'>Z-score scalar</span>
                        <select
                            value={scalar}
                            onChange={e => setScalar(e.target.value)}
                            className='qcc-select'
                        >
                            {SCALARS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className='qcc-group'>
                        <span className='qcc-label'>Z-score threshold: <strong>±{zThresh.toFixed(1)}</strong></span>
                        <input
                            type='range' min='1' max='4' step='0.1'
                            value={zThresh}
                            onChange={e => setZThresh(+e.target.value)}
                            className='qcc-slider'
                        />
                    </div>

                    <div className='qcc-group qcc-group--check'>
                        <label className='qcc-check-label'>
                            <input
                                type='checkbox'
                                checked={perGroup}
                                onChange={e => setPerGroup(e.target.checked)}
                            />
                            Z-score per group
                        </label>
                    </div>
                </>}

            </div>

            {/* ── Stats row ─────────────────────────────────────────────── */}
            <div className='qc-stats-bar'>
                <div className='qcs'>
                    <span className='qcs-val'>{activeSubjects.length}</span>
                    <span className='qcs-lbl'>Active</span>
                </div>
                {viewMode === 'cards' && <>
                    <div className='qcs qcs--flag'>
                        <span className='qcs-val'>{flaggedActive.length}</span>
                        <span className='qcs-lbl'>Flagged</span>
                    </div>
                    <div className='qcs qcs--shape'>
                        <span className='qcs-val'>{activeSubjects.filter(isShape).length}</span>
                        <span className='qcs-lbl'>Abnormal Shape</span>
                    </div>
                    <div className='qcs qcs--z'>
                        <span className='qcs-val'>{activeSubjects.filter(isZOut).length}</span>
                        <span className='qcs-lbl'>{scalar} Outlier</span>
                    </div>
                </>}
                {viewMode === 'overview' && <>
                    {METHODS.map(m => {
                        const n = allSubjects.filter(s => s.qc?.[m]?.flag === true).length
                        return (
                            <div key={m} className='qcs qcs--flag'>
                                <span className='qcs-val'>{n}</span>
                                <span className='qcs-lbl'>{m} FAIL</span>
                            </div>
                        )
                    })}
                    <div className='qcs qcs--flag'>
                        <span className='qcs-val'>
                            {allSubjects.filter(s => METHODS.some(m => s.qc?.[m]?.flag === true)).length}
                        </span>
                        <span className='qcs-lbl'>Any Failure</span>
                    </div>
                </>}
                {removedSubjects.length > 0 && (
                    <div className='qcs qcs--rm'>
                        <span className='qcs-val'>{removedSubjects.length}</span>
                        <span className='qcs-lbl'>Removed</span>
                    </div>
                )}
            </div>

            {/* ── Overview mode ─────────────────────────────────────────── */}
            {viewMode === 'overview' && (
                <MethodOverview
                    activeSubjects={activeSubjects}
                    removedSubjects={removedSubjects}
                />
            )}

            {/* ── Cards mode ────────────────────────────────────────────── */}
            {viewMode === 'cards' && <>

                {/* Action bar */}
                <div className='qc-action-bar'>
                    <div className='qca-sel'>
                        <button className='qca-btn ghost' onClick={selectFlagged}>
                            Select Flagged ({flaggedActive.length})
                        </button>
                        <button className='qca-btn ghost' onClick={selectAll}>
                            Select All
                        </button>
                        <button className='qca-btn ghost' onClick={unselectAll} disabled={!selected.size}>
                            Unselect All
                        </button>
                    </div>
                    <div className='qca-act'>
                        <button
                            className='qca-btn danger'
                            onClick={handleRemove}
                            disabled={!selected.size || loading}
                        >
                            {loading ? 'Processing…' : `Remove Selected (${selected.size})`}
                        </button>
                        {removedSubjects.length > 0 && (
                            <button
                                className='qca-btn restore'
                                onClick={handleRestoreAll}
                                disabled={loading}
                            >
                                Restore All ({removedSubjects.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* Subject grid */}
                <div className='qc-grid-area'>

                    {flaggedActive.length > 0 && (
                        <section className='qcg-section'>
                            <div className='qcg-section-hd qcg-section-hd--flag'>
                                Flagged — {flaggedActive.length} subject{flaggedActive.length !== 1 ? 's' : ''}
                                <span className='qcg-hint'>click to select / deselect</span>
                            </div>
                            <div className='qcg'>
                                {flaggedActive.map(s => (
                                    <SubjectCard
                                        key={s['Id']}
                                        subject={s}
                                        method={method}
                                        flagShape={isShape(s)}
                                        flagZ={isZOut(s)}
                                        zVal={zScores[s['Id']] ?? null}
                                        prob={shapeProb(s)}
                                        isSelected={selected.has(s['Id'])}
                                        onToggle={toggleSelect}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {passActive.length > 0 && (
                        <section className='qcg-section'>
                            <div className='qcg-section-hd qcg-section-hd--pass'>
                                Pass — {passActive.length} subject{passActive.length !== 1 ? 's' : ''}
                            </div>
                            <div className='qcg'>
                                {passActive.map(s => (
                                    <SubjectCard
                                        key={s['Id']}
                                        subject={s}
                                        method={method}
                                        flagShape={isShape(s)}
                                        flagZ={isZOut(s)}
                                        zVal={zScores[s['Id']] ?? null}
                                        prob={shapeProb(s)}
                                        isSelected={selected.has(s['Id'])}
                                        onToggle={toggleSelect}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {removedSubjects.length > 0 && (
                        <section className='qcg-section'>
                            <div className='qcg-section-hd qcg-section-hd--rm'>
                                <span>Removed from Analysis — {removedSubjects.length} subject{removedSubjects.length !== 1 ? 's' : ''}</span>
                                <button
                                    className='qcg-download-btn'
                                    onClick={() => downloadRemovedCsv(removedSubjects)}
                                    title='Download a CSV with the removed subjects + their QC flags and scalars'
                                >
                                    ⬇ Download CSV
                                </button>
                            </div>
                            <div className='qcg'>
                                {removedSubjects.map(s => (
                                    <div key={s['Id']} className='qcc qcc--removed'>
                                        <div className='qcc-img'>
                                            <div className='qcc-no-img'>×</div>
                                        </div>
                                        <div className='qcc-info'>
                                            <span className='qcc-id'>{s['Id']}</span>
                                            {s.group && <span className='qcc-group'>{s.group}</span>}
                                            <button
                                                className='qcc-restore-btn'
                                                onClick={() => handleRestoreOne(s['Id'])}
                                                disabled={loading}
                                            >Restore</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {activeSubjects.length === 0 && removedSubjects.length === 0 && (
                        <div className='qc-empty'>No subject data available. Run an analysis first.</div>
                    )}

                </div>
            </>}
        </div>
    )
}
