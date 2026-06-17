import React, { useState, useEffect } from 'react'

import TableSegmentation   from '../../graphs/Table/TableSegmentation'
import TableParcellation   from '../../graphs/Table/TableParcellation'
import BoxplotSegmentation from '../../graphs/Boxplot/BoxplotSegmentation'
import BoxplotParcellation from '../../graphs/Boxplot/BoxplotParcellation'
import Scatter             from '../../graphs/Scatter/Scatter'
import Midline             from '../../graphs/Line/Midline'
import VolumetricView      from '../../graphs/Volume/VolumetricView'
import { RadarBySegmentation, RadarByParcellation } from '../../graphs/Radar/Radar'
import BubblePlot         from '../../graphs/BubblePlot/BubblePlot'

import '../../styles/home.scss'

const API = process.env.REACT_APP_API_URL || ''

const SCALARS   = ['FA', 'MD', 'RD', 'AD']
const SEG_KEYS  = [
    { key: 'ROQS_scalar',      label: 'ROQS'      },
    { key: 'Watershed_scalar', label: 'Watershed'  },
    { key: 'CNN_scalar',       label: 'CNN'        },
]

// ── Utilities ─────────────────────────────────────────────────────────────────
function dirname(p) {
    return p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
}

function meanOf(data, methodKey, scalar) {
    const vals = data
        .map(s => s[methodKey]?.[scalar])
        .filter(v => v != null && !isNaN(Number(v)))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length
}

function fmt(v, decimals = 6) {
    if (v == null) return '—'
    return Number(v).toFixed(decimals)
}

// ── Image path per method ─────────────────────────────────────────────────────
function imgPathForMethod(subject, method) {
    if (!subject.img_path) return null
    const dir = dirname(subject.img_path)
    if (method === 'ROQS')      return subject.img_path
    if (method === 'Watershed') return dir + '/midsagittal_watershed.png'
    if (method === 'CNN')       return dir + '/cnnBased_midsagittal.png'
    return subject.img_path
}

const PARC_METHODS = ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']
const PARC_PARTS   = ['P1', 'P2', 'P3', 'P4', 'P5']

// ── Asymmetry Index helper ────────────────────────────────────────────────────
// AI = (anterior − posterior) / (anterior + posterior), range −1..+1
// Anterior = mean(P1, P2) FA; Posterior = mean(P4, P5) FA
// Source: Witelson 1989; Hofer & Frahm 2006
function calcAsymmetryIndex(parcellation, method) {
    const k = (part) => `Witelson_FA_${part}`
    const p = parcellation || {}
    const ant = ((p[k('P1')] || 0) + (p[k('P2')] || 0)) / 2
    const pos = ((p[k('P4')] || 0) + (p[k('P5')] || 0)) / 2
    if (!ant || !pos) return null
    return (ant - pos) / (ant + pos)
}

// ── Subject banner ────────────────────────────────────────────────────────────
function SubjectBanner({ subject, onDeselect }) {
    const [imgMethod,   setImgMethod]   = useState('ROQS')
    const [imgErrors,   setImgErrors]   = useState({})
    const [parcMethod,  setParcMethod]  = useState('Witelson')
    const [parcScalar,  setParcScalar]  = useState('FA')

    const qc      = subject.qc || {}
    const hasCNN  = Object.keys(subject.CNN_scalar  || {}).length > 0
    const hasCNNP = Object.keys(subject.CNN_parcellation || {}).length > 0

    const imgPath   = imgPathForMethod(subject, imgMethod)
    const imgFailed = imgErrors[imgMethod]

    const subjectPath = subject.img_path ? dirname(dirname(subject.img_path)) : null

    // Build parcellation key: e.g. "Witelson_FA_P1"
    const parcKey = (part) => `${parcMethod}_${parcScalar}_${part}`

    return (
        <div className='subject-banner'>

            {/* ── Left panel: image + method tabs ──────────────────────── */}
            <div className='sb-left'>
                <div className='sb-img-tabs'>
                    {['ROQS', 'Watershed', 'CNN'].map(m => (
                        <button
                            key={m}
                            className={`sb-img-tab${imgMethod === m ? ' active' : ''}`}
                            onClick={() => setImgMethod(m)}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className='sb-image'>
                    {imgPath && !imgFailed
                        ? <img
                            src={`${API}/api/file?path=${encodeURIComponent(imgPath)}`}
                            alt={`${imgMethod} segmentation`}
                            onError={() => setImgErrors(prev => ({ ...prev, [imgMethod]: true }))}
                          />
                        : <span className='sb-no-img'>
                            {imgMethod === 'CNN' ? 'CNN: no 2D image' : 'Image not available'}
                          </span>
                    }
                </div>
            </div>

            {/* ── Right panel: data ──────────────────────────────────── */}
            <div className='sb-info'>

                {/* Header */}
                <div className='sb-header'>
                    <span className='sb-id'>Subject {subject['Id']}</span>
                    {subject.group && <span className='sb-group'>{subject.group}</span>}
                    <button className='sb-close' onClick={onDeselect} title='Back to all'>×</button>
                </div>

                {subjectPath && (
                    <div className='sb-path' title={subjectPath}>{subjectPath}</div>
                )}

                {/* QC — only shown when real data is present */}
                {(qc.ROQS?.flag != null || qc.Watershed?.flag != null || qc.CNN?.flag != null) && (
                    <div className='sb-qc-row'>
                        {[
                            { method: 'ROQS',      q: qc.ROQS      },
                            { method: 'Watershed', q: qc.Watershed },
                            { method: 'CNN',       q: qc.CNN        },
                        ].map(({ method, q }) => {
                            if (!q || q.flag == null) return null
                            const cls   = q.flag === true ? 'fail' : 'pass'
                            const label = q.flag === true ? 'FAIL' : 'PASS'
                            return (
                                <div key={method} className='sb-qc-item'>
                                    <span className='sqc-method'>{method}</span>
                                    <span className={`sqc-badge ${cls}`}>{label}</span>
                                    {q.prob != null && (
                                        <span className='sqc-prob'
                                              title='P(incorrect) — ViT-B/16 quality model'>
                                            {(q.prob * 100).toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Scalars + Parcellation side by side */}
                <div className='sb-row'>

                    {/* Scalars */}
                    <div className='sb-section'>
                        <span className='sb-section-title'>Scalars</span>
                        <table className='sb-table'>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>ROQS</th>
                                    <th>Watershed</th>
                                    {hasCNN && <th>CNN</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {SCALARS.map(sc => (
                                    <tr key={sc}>
                                        <td className='sbt-label'>{sc}</td>
                                        <td>{fmt(subject.ROQS_scalar?.[sc], 4)}</td>
                                        <td>{fmt(subject.Watershed_scalar?.[sc], 4)}</td>
                                        {hasCNN && <td>{fmt(subject.CNN_scalar?.[sc], 4)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Parcellation */}
                    <div className='sb-section'>
                        <div className='sb-section-header'>
                            <span className='sb-section-title'>Parcellation</span>
                            <div className='sb-parc-selects'>
                                <select
                                    value={parcMethod}
                                    onChange={e => setParcMethod(e.target.value)}
                                    title='Parcellation method'
                                >
                                    {PARC_METHODS.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={parcScalar}
                                    onChange={e => setParcScalar(e.target.value)}
                                    title='Scalar'
                                >
                                    {SCALARS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <table className='sb-table'>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>ROQS</th>
                                    <th>Watershed</th>
                                    {hasCNNP && <th>CNN</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {PARC_PARTS.map(part => (
                                    <tr key={part}>
                                        <td className='sbt-label'>{part}</td>
                                        <td>{fmt(subject.ROQS_parcellation?.[parcKey(part)], 4)}</td>
                                        <td>{fmt(subject.Watershed_parcellation?.[parcKey(part)], 4)}</td>
                                        {hasCNNP && <td>{fmt(subject.CNN_parcellation?.[parcKey(part)], 4)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>

                {/* ── Shape Metrics + Asymmetry Index ─────────────────── */}
                {(() => {
                    const shape = subject.ROQS_shape || {}
                    const ai    = calcAsymmetryIndex(subject.ROQS_parcellation, 'ROQS')
                    const hasShape = Object.keys(shape).length > 0
                    if (!hasShape && ai == null) return null

                    return (
                        <div className='sb-morpho-row'>
                            {hasShape && (<>
                                <div className='sb-morpho-item'>
                                    <span className='sbm-label'>Area</span>
                                    <span className='sbm-value'>{shape.area ?? '—'}</span>
                                    <span className='sbm-unit'>voxels</span>
                                </div>
                                <div className='sb-morpho-item'>
                                    <span className='sbm-label'>Length</span>
                                    <span className='sbm-value'>{shape.cc_length ?? '—'}</span>
                                    <span className='sbm-unit'>cols</span>
                                </div>
                                <div className='sb-morpho-item'>
                                    <span className='sbm-label'>Max thick.</span>
                                    <span className='sbm-value'>{shape.max_thickness ?? '—'}</span>
                                </div>
                                <div className='sb-morpho-item'>
                                    <span className='sbm-label'>Mean thick.</span>
                                    <span className='sbm-value'>{shape.mean_thickness ?? '—'}</span>
                                </div>
                                <div className='sb-morpho-item'>
                                    <span className='sbm-label'>CCI</span>
                                    <span className='sbm-value'>{shape.cci ?? '—'}</span>
                                    <span className='sbm-unit' title='Corpus Callosum Index: max_thickness / length'>ⓘ</span>
                                </div>
                            </>)}
                        </div>
                    )
                })()}


            </div>
        </div>
    )
}

// ── KPI overview cards ────────────────────────────────────────────────────────
function KPIRow({ data, method }) {
    const COLORS = {
        FA: '#4C6EF5', MD: '#00C896', RD: '#EF553B', AD: '#AB63FA',
    }

    return (
        <div className='kpi-row'>
            {SCALARS.map(sc => {
                const val = meanOf(data, method, sc)
                return (
                    <div key={sc} className='kpi-card' style={{ borderTopColor: COLORS[sc] }}>
                        <span className='kpi-label'>{sc} — Mean</span>
                        <span className='kpi-value'>{fmt(val, 6)}</span>
                        <span className='kpi-sub'>
                            {data.length} subject{data.length !== 1 ? 's' : ''}
                            {' · '}
                            {SEG_KEYS.find(m => m.key === method)?.label}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

// ── Check for available CNN subjects ─────────────────────────────────────────
function useCNNSubjects(data) {
    const [cnnSubjects, setCnnSubjects] = useState([])
    useEffect(() => {
        let cancelled = false
        async function check() {
            const results = []
            for (const s of data) {
                if (!s.img_path) continue
                const cnnPath = dirname(s.img_path) + '/cnnBased.nii.gz'
                try {
                    const res  = await fetch(`${API}/api/exists?path=${encodeURIComponent(cnnPath)}`)
                    const json = await res.json()
                    if (json.exists) results.push({ id: s['Id'], cnnPath })
                } catch (_) {}
            }
            if (!cancelled) setCnnSubjects(results)
        }
        check()
        return () => { cancelled = true }
    }, [data])
    return cnnSubjects
}

// ── Card wrapper with title ───────────────────────────────────────────────────
function Card({ title, controls, children, collapsible = false, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className='dash-card'>
            <div
                className={`dc-header${collapsible ? ' dc-header--collapsible' : ''}`}
                onClick={collapsible ? () => setOpen(v => !v) : undefined}
            >
                <span className='dc-title'>
                    {collapsible && (
                        <span className='dc-collapse-arrow'>{open ? '▾' : '▸'}</span>
                    )}
                    {title}
                </span>
                {controls && <div className='dc-controls'>{controls}</div>}
            </div>
            {open && <div className='dc-body'>{children}</div>}
        </div>
    )
}

// ── Main view component ───────────────────────────────────────────────────────
function View({ view, data, selectedId, onDeselect }) {
    const [kpiMethod,       setKpiMethod]       = useState('ROQS_scalar')
    const [selectedCNNIdx,  setSelectedCNNIdx]  = useState(0)
    const cnnSubjects = useCNNSubjects(data)

    if (!data || data.length === 0) {
        return (
            <div className='view-wrap'>
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7a849e', fontSize: '15px' }}>
                    No subjects to display.
                </div>
            </div>
        )
    }

    // ── 2D View ───────────────────────────────────────────────────────────
    if (view === '2D') {
        const selectedSubject = selectedId ? data.find(s => s['Id'] === selectedId) || data[0] : null

        const methodControls = (
            <>
                {SEG_KEYS.map(m => (
                    <button
                        key={m.key}
                        className={`method-pill${kpiMethod === m.key ? ' active' : ''}`}
                        onClick={() => setKpiMethod(m.key)}
                    >
                        {m.label}
                    </button>
                ))}
            </>
        )

        return (
            <div className='view-wrap'>

                {/* Subject banner */}
                {selectedSubject && (
                    <SubjectBanner
                        subject={selectedSubject}
                        onDeselect={onDeselect}
                    />
                )}

                {/* KPI Overview */}
                <Card title='Overview — Mean per Scalar' controls={methodControls}>
                    <KPIRow data={data} method={kpiMethod} />
                </Card>

                {/* Data tables — side by side */}
                <div className='two-col'>
                    <Card title='Segmentation Table'>
                        <TableSegmentation data={data} type='2D' />
                    </Card>
                    <Card title='Parcellation Table'>
                        <TableParcellation data={data} type='2D' />
                    </Card>
                </div>

                {/* Row 3 — Midline | Bubble Plot */}
                <div className='two-col'>
                    <Card title='Midline Profile Along the Corpus Callosum'>
                        <Midline data={data} />
                    </Card>

                    {/* Row 7 — Scatter + histograms */}
                    <Card title='Scalar Correlation'>
                        <Scatter data={data} />
                    </Card>

                </div>

                {/* Row 4 — Segmentation Boxplot (full width) */}
                <Card title='Distributions — Scalars by Segmentation Method'>
                    <BoxplotSegmentation data={data} />
                </Card>

                {/* Row 5 — Parcellation Boxplot (full width) */}
                <Card title='Distributions — Parcellation by Part'>
                    <BoxplotParcellation data={data} />
                </Card>

                {/* Row 6 — Radar charts side by side */}
                <div className='two-col'>
                    <Card title='Segmentations by Parcellation'>
                        <RadarBySegmentation data={data} />
                    </Card>
                    <Card title='Parcellations by Segmentation'>
                        <RadarByParcellation data={data} />
                    </Card>
                </div>


            </div>
        )
    }

    // ── 3D View ───────────────────────────────────────────────────────────
    if (view === '3D') {
        const selectedCNN = cnnSubjects[selectedCNNIdx] || null

        return (
            <div className='view-wrap'>

                {/* CNN tables */}
                <Card title='Segmentation Table — CNN-Based'>
                    <TableSegmentation data={data} type='3D' />
                </Card>

                <Card title='Parcellation Table — CNN-Based'>
                    <TableParcellation data={data} type='3D' />
                </Card>

                {/* Volumetric viewer */}
                <Card title='3D Volumetric Viewer'>
                    <div className='area-volumetric'>
                        <div className='cnn-subject-list'>
                            <span className='cnn-list-title'>CNN Subjects</span>
                            {cnnSubjects.length === 0 ? (
                                <span className='cnn-empty'>
                                    No CNN data found.<br />
                                    Run the CNN pipeline first.
                                </span>
                            ) : (
                                cnnSubjects.map((s, i) => (
                                    <div
                                        key={s.id}
                                        className={`cnn-subject-card${selectedCNNIdx === i ? ' selected' : ''}`}
                                        onClick={() => setSelectedCNNIdx(i)}
                                    >
                                        {s.id}
                                    </div>
                                ))
                            )}
                        </div>
                        <div className='cnn-viewer'>
                            {selectedCNN
                                ? <VolumetricView filePath={selectedCNN.cnnPath} />
                                : <div className='cnn-no-subject'>
                                    <span>Select a subject from the list to visualise the corpus callosum in 3D.</span>
                                  </div>
                            }
                        </div>
                    </div>
                </Card>

            </div>
        )
    }

    return null
}

export default View
