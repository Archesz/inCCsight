import React, { useState, useMemo } from 'react'
import Plot from 'react-plotly.js'
import './GroupComparison.scss'
import InfoTool from '../InfoTool/InfoTool'

const GROUP_COLORS  = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']
const SCALARS       = ['FA', 'MD', 'RD', 'AD']

// DTI scalar physical units — FA is dimensionless, diffusivities are in mm²/s
const SCALAR_UNITS  = { FA: '', MD: 'mm²/s', RD: 'mm²/s', AD: 'mm²/s' }
const scalarLabel   = s => (SCALAR_UNITS[s] ? `${s} (${SCALAR_UNITS[s]})` : s)
const METHODS_SEG   = ['ROQS_scalar', 'Watershed_scalar', 'CNN_scalar']
const PARC_METHODS  = ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']
const SHAPE_METRICS = [
    { key: 'area',           label: 'Area (px²)'     },
    { key: 'cc_length',      label: 'Length (px)'    },
    { key: 'max_thickness',  label: 'Max Thickness'  },
    { key: 'mean_thickness', label: 'Mean Thickness' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function getValues(subjects, method, scalar) {
    return subjects
        .map(s => { const v = s?.[method]?.[scalar]; return typeof v === 'number' ? v : parseFloat(v) })
        .filter(v => !isNaN(v))
}

function calcStats(values) {
    if (!values.length) return { mean: null, std: null, n: 0 }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std  = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
    return { mean, std, n: values.length }
}

function profileStats(profiles, length) {
    return Array.from({ length }, (_, i) => {
        const vals = profiles.map(p => p[i]).filter(v => typeof v === 'number' && !isNaN(v))
        if (!vals.length) return { mean: NaN, std: 0 }
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
        return { mean, std }
    })
}

function bandTraces(xArr, stats, color, name) {
    const means = stats.map(s => s.mean)
    const upper = stats.map(s => s.mean + s.std)
    const lower = stats.map(s => s.mean - s.std)
    return [
        {
            x: [...xArr, ...xArr.slice().reverse()],
            y: [...upper, ...lower.reverse()],
            fill: 'toself', fillcolor: color + '25',
            line: { color: 'transparent' },
            showlegend: false, hoverinfo: 'skip', type: 'scatter',
            // Share the group's legendgroup so hiding the group via the legend
            // also hides its ± std shaded band.
            legendgroup: name,
        },
        {
            x: xArr, y: means,
            type: 'scatter', mode: 'lines',
            name, legendgroup: name, line: { color, width: 2.5 },
        },
    ]
}

// CSV cell escaping (RFC 4180)
function csvCell(v) {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CHART_LAYOUT_BASE = {
    margin: { t: 12, b: 48, l: 56, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#fafbff',
    legend: { orientation: 'h', y: -0.32, groupclick: 'togglegroup' },
}

// ── Distribution (box, violin, or grouped bar) ────────────────────────────

function ScalarDistribution({ allSubjects, allGroups, scalar, segMethod, chartType, yRange, normalize, normFactor }) {
    // If normalize=true, map each value to [0,1] within its scalar's global range
    const applyNorm = v => {
        if (!normalize || !normFactor) return v
        const { mn, mx } = normFactor
        return mx === mn ? 0 : (v - mn) / (mx - mn)
    }

    const traces = allGroups.map((group, gi) => {
        const raw    = getValues(allSubjects.filter(s => s.group === group), segMethod, scalar)
        const values = raw.map(applyNorm)
        const color  = GROUP_COLORS[gi % GROUP_COLORS.length]
        if (chartType === 'violin') {
            return {
                type: 'violin', y: values, name: group,
                box: { visible: true }, meanline: { visible: true },
                marker: { color, opacity: 0.8 }, line: { color },
                fillcolor: color + '44', showlegend: false,
            }
        }
        if (chartType === 'bar') {
            const { mean, std } = calcStats(values)
            return {
                type: 'bar', name: group,
                x: [group], y: [mean ?? 0],
                error_y: { type: 'data', array: [std ?? 0], visible: true, color, thickness: 2 },
                marker: { color, opacity: 0.85 },
            }
        }
        return {
            type: 'box', y: values, name: group,
            boxmean: 'sd',
            marker: { color, opacity: 0.85 }, line: { width: 1.5 },
        }
    })

    const effectiveRange = normalize ? [0, 1] : yRange

    return (
        <Plot
            data={traces}
            layout={{
                title: { text: scalar, font: { size: 13, color: '#333' } },
                height: 260, margin: { t: 36, b: 36, l: 44, r: 10 },
                showlegend: false,
                barmode: chartType === 'bar' ? 'group' : undefined,
                yaxis: {
                    gridcolor: '#eee', zeroline: false,
                    ...(effectiveRange ? { range: effectiveRange } : {}),
                    ...(normalize ? { title: { text: 'normalized [0–1]', font: { size: 9, color: '#aaa' } } } : {}),
                },
                xaxis: { showgrid: false },
                paper_bgcolor: 'transparent', plot_bgcolor: '#fafbff',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── CC Thickness Profile ──────────────────────────────────────────────────

function ThicknessProfile({ allSubjects, allGroups, segMethod }) {
    const thicknessKey = segMethod.replace('_scalar', '_thickness')
    const xArr = Array.from({ length: 200 }, (_, i) => i + 1)
    const traces = []

    allGroups.forEach((group, gi) => {
        const color    = GROUP_COLORS[gi % GROUP_COLORS.length]
        const profiles = allSubjects
            .filter(s => s.group === group)
            .map(s => s?.[thicknessKey])
            .filter(p => Array.isArray(p) && p.length === 200)
        if (!profiles.length) return
        traces.push(...bandTraces(xArr, profileStats(profiles, 200), color, group))
    })

    if (!traces.length) return (
        <div className='gc-no-data'>Thickness data not available for this method.</div>
    )

    return (
        <Plot
            data={traces}
            layout={{
                ...CHART_LAYOUT_BASE, height: 290,
                xaxis: { title: 'Position along CC (posterior → anterior)', gridcolor: '#eee', zeroline: false },
                yaxis: { title: 'Thickness (mm)', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── Scalar along CC midline ───────────────────────────────────────────────

function MidlineProfile({ allSubjects, allGroups, segMethod }) {
    const [scalar, setScalar] = useState('FA')
    const midlineKey = segMethod.replace('_scalar', '_midlines')
    const traces = []

    allGroups.forEach((group, gi) => {
        const color    = GROUP_COLORS[gi % GROUP_COLORS.length]
        const profiles = allSubjects
            .filter(s => s.group === group)
            .map(s => s?.[midlineKey]?.[scalar])
            .filter(p => Array.isArray(p) && p.length > 0)
        if (!profiles.length) return
        const n    = Math.min(...profiles.map(p => p.length), 200)
        const xArr = Array.from({ length: n }, (_, i) => i + 1)
        traces.push(...bandTraces(xArr, profileStats(profiles, n), color, group))
    })

    return (
        <div>
            <div className='gc-chart-controls'>
                {SCALARS.map(sc => (
                    <button key={sc}
                        className={`gc-pill-sm${scalar === sc ? ' active' : ''}`}
                        onClick={() => setScalar(sc)}>{sc}</button>
                ))}
            </div>
            <Plot
                data={traces}
                layout={{
                    ...CHART_LAYOUT_BASE, height: 290,
                    xaxis: { title: 'Position along CC', gridcolor: '#eee', zeroline: false },
                    yaxis: { title: scalar, gridcolor: '#eee', zeroline: false },
                    annotations: !traces.length ? [{
                        text: 'No data', xref: 'paper', yref: 'paper',
                        x: 0.5, y: 0.5, showarrow: false,
                        font: { size: 14, color: '#bbb' },
                    }] : [],
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }} useResizeHandler
            />
        </div>
    )
}

// ── Parcellation by CC region ─────────────────────────────────────────────

function ParcellationBar({ allSubjects, allGroups, segMethod }) {
    const [scalar,     setScalar]     = useState('FA')
    const [parcMethod, setParcMethod] = useState('Witelson')
    const parcKey = segMethod.replace('_scalar', '_parcellation')
    const regions = ['P1', 'P2', 'P3', 'P4', 'P5']

    const traces = allGroups.map((group, gi) => {
        const subs = allSubjects.filter(s => s.group === group)
        const y = regions.map(region => {
            const key  = `${parcMethod}_${scalar}_${region}`
            const vals = subs
                .map(s => { const v = s?.[parcKey]?.[key]; return typeof v === 'number' ? v : parseFloat(v) })
                .filter(v => !isNaN(v) && v !== 0)
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
        })
        const err = regions.map(region => {
            const key  = `${parcMethod}_${scalar}_${region}`
            const vals = subs
                .map(s => { const v = s?.[parcKey]?.[key]; return typeof v === 'number' ? v : parseFloat(v) })
                .filter(v => !isNaN(v) && v !== 0)
            if (!vals.length) return 0
            const m = vals.reduce((a, b) => a + b, 0) / vals.length
            return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length)
        })
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type: 'bar', x: regions, y,
            error_y: { type: 'data', array: err, visible: true },
            name: group,
            marker: { color, opacity: 0.85 },
        }
    })

    return (
        <div>
            <div className='gc-chart-controls'>
                <div className='gc-picker-group'>
                    {SCALARS.map(sc => (
                        <button key={sc}
                            className={`gc-pill-sm${scalar === sc ? ' active' : ''}`}
                            onClick={() => setScalar(sc)}>{scalarLabel(sc)}</button>
                    ))}
                </div>
                <div className='gc-picker-group'>
                    {PARC_METHODS.map(pm => (
                        <button key={pm}
                            className={`gc-pill-sm${parcMethod === pm ? ' active' : ''}`}
                            onClick={() => setParcMethod(pm)}>{pm}</button>
                    ))}
                </div>
            </div>
            <Plot
                data={traces}
                layout={{
                    ...CHART_LAYOUT_BASE,
                    barmode: 'group', height: 360,
                    margin: { t: 12, b: 52, l: 52, r: 12 },
                    xaxis: { title: 'CC Region', gridcolor: '#eee' },
                    yaxis: { title: scalar, gridcolor: '#eee', zeroline: false },
                    bargap: 0.25, bargroupgap: 0.08,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }} useResizeHandler
            />
        </div>
    )
}

// ── Shape metrics (ROQS only) ─────────────────────────────────────────────

function ShapeMetrics({ allSubjects, allGroups, chartType }) {
    return (
        <div className='gc-shape-grid'>
            {SHAPE_METRICS.map(({ key, label }) => {
                const traces = allGroups.map((group, gi) => {
                    const color  = GROUP_COLORS[gi % GROUP_COLORS.length]
                    const values = allSubjects
                        .filter(s => s.group === group)
                        .map(s => s?.ROQS_shape?.[key])
                        .filter(v => typeof v === 'number' && !isNaN(v))
                    if (chartType === 'violin') {
                        return {
                            type: 'violin', y: values, name: group,
                            box: { visible: true }, meanline: { visible: true },
                            marker: { color, opacity: 0.8 }, line: { color },
                            fillcolor: color + '44', showlegend: false,
                        }
                    }
                    return {
                        type: 'box', y: values, name: group,
                        boxmean: 'sd',
                        marker: { color, opacity: 0.85 }, line: { width: 1.5 },
                    }
                })
                return (
                    <div key={key} className='gc-box-cell'>
                        <Plot
                            data={traces}
                            layout={{
                                title: { text: label, font: { size: 12, color: '#333' } },
                                height: 230, margin: { t: 36, b: 36, l: 44, r: 10 },
                                showlegend: false,
                                yaxis: { gridcolor: '#eee', zeroline: false },
                                xaxis: { showgrid: false },
                                paper_bgcolor: 'transparent', plot_bgcolor: '#fafbff',
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%' }} useResizeHandler
                        />
                    </div>
                )
            })}
        </div>
    )
}

// ── Per-subject values table ───────────────────────────────────────────────

function SubjectTable({ allSubjects, allGroups, segMethod }) {
    const [sortBy, setSortBy] = useState('group')

    const sorted = [...allSubjects].sort((a, b) => {
        if (sortBy === 'group') return (a.group ?? '').localeCompare(b.group ?? '')
        const va = parseFloat(a?.[segMethod]?.[sortBy])
        const vb = parseFloat(b?.[segMethod]?.[sortBy])
        if (isNaN(va) && isNaN(vb)) return 0
        if (isNaN(va)) return 1
        if (isNaN(vb)) return -1
        return vb - va
    })

    function downloadCsv() {
        const methodLabel = segMethod.replace('_scalar', '')
        const cols = ['Subject', 'Group', ...SCALARS]
        const rows = sorted.map(s => [
            s.Id ?? s['Id'],
            s.group ?? '',
            ...SCALARS.map(sc => {
                const v = s?.[segMethod]?.[sc]
                const n = typeof v === 'number' ? v : parseFloat(v)
                return !isNaN(n) ? n.toFixed(6) : ''
            }),
        ].map(csvCell).join(','))

        const csv = '﻿' + [cols.join(','), ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `subjects_${methodLabel}_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
    }

    return (
        <div>
            <div className='gc-table-toolbar'>
                <span className='gc-table-sort-label'>Sort by:</span>
                {['group', ...SCALARS].map(col => (
                    <button key={col}
                        className={`gc-pill-sm${sortBy === col ? ' active' : ''}`}
                        onClick={() => setSortBy(col)}
                    >{col === 'group' ? 'Group' : col}</button>
                ))}
                <button className='gc-download-btn' onClick={downloadCsv} title='Download CSV'>
                    ⬇ CSV
                </button>
            </div>

            <div className='gc-table-wrap'>
                <table className='gc-table'>
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Group</th>
                            {SCALARS.map(sc => <th key={sc}>{sc}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(s => {
                            const id   = s.Id ?? s['Id']
                            const gIdx = allGroups.indexOf(s.group)
                            const color = GROUP_COLORS[gIdx >= 0 ? gIdx % GROUP_COLORS.length : 0]
                            return (
                                <tr key={id}>
                                    <td style={{ fontWeight: 700, fontSize: 12 }}>{id}</td>
                                    <td>
                                        <span className='gc-dot' style={{ background: gIdx >= 0 ? color : '#ccc' }} />
                                        {s.group ?? '—'}
                                    </td>
                                    {SCALARS.map(sc => {
                                        const v = s?.[segMethod]?.[sc]
                                        const n = typeof v === 'number' ? v : parseFloat(v)
                                        return (
                                            <td key={sc} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                                {!isNaN(n) ? n.toFixed(4) : '—'}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ── Statistics table (group means + overall) ──────────────────────────────

function MeanTable({ allSubjects, allGroups, segMethod }) {
    return (
        <div className='gc-table-wrap'>
            <table className='gc-table'>
                <thead>
                    <tr>
                        <th>Group</th>
                        <th>N</th>
                        {SCALARS.map(s => (
                            <th key={s}>{s} <span className='th-sub'>mean ± sd</span></th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {allGroups.map((group, gi) => {
                        const subs  = allSubjects.filter(s => s.group === group)
                        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
                        return (
                            <tr key={group}>
                                <td>
                                    <span className='gc-dot' style={{ background: color }} />
                                    {group}
                                </td>
                                <td>{subs.length}</td>
                                {SCALARS.map(sc => {
                                    const { mean, std } = calcStats(getValues(subs, segMethod, sc))
                                    return (
                                        <td key={sc}>
                                            {mean !== null
                                                ? `${mean.toFixed(4)} ± ${std.toFixed(4)}`
                                                : '—'}
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}

                    {/* Overall CC mean row — across all subjects */}
                    <tr className='gc-table-total'>
                        <td><strong>Overall CC mean</strong></td>
                        <td><strong>{allSubjects.length}</strong></td>
                        {SCALARS.map(sc => {
                            const { mean, std } = calcStats(getValues(allSubjects, segMethod, sc))
                            return (
                                <td key={sc}>
                                    <strong>
                                        {mean !== null
                                            ? `${mean.toFixed(4)} ± ${std.toFixed(4)}`
                                            : '—'}
                                    </strong>
                                </td>
                            )
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────

function GroupComparison({ allSubjects, allGroups }) {
    const [segMethod,       setSegMethod]       = useState('ROQS_scalar')
    const [chartType,       setChartType]       = useState('box')
    const [normalize,       setNormalize]       = useState(false)

    // ── Per-scalar Y-axis ranges — computed across ALL methods so scale is stable when switching ──
    const yRanges = useMemo(() => Object.fromEntries(SCALARS.map(sc => {
        const vals = METHODS_SEG.flatMap(method =>
            allSubjects.map(s => { const v = s?.[method]?.[sc]; return typeof v === 'number' ? v : parseFloat(v) })
        ).filter(v => !isNaN(v))
        if (!vals.length) return [sc, null]
        const mn = Math.min(...vals), mx = Math.max(...vals)
        const pad = (mx - mn) * 0.15 || 0.01
        return [sc, [mn - pad, mx + pad]]
    })), [allSubjects])

    // ── Min/max per scalar (for 0–1 normalization) ──────────────────────────
    const normFactors = useMemo(() => Object.fromEntries(SCALARS.map(sc => {
        const vals = METHODS_SEG.flatMap(method =>
            allSubjects.map(s => { const v = s?.[method]?.[sc]; return typeof v === 'number' ? v : parseFloat(v) })
        ).filter(v => !isNaN(v))
        if (!vals.length) return [sc, null]
        return [sc, { mn: Math.min(...vals), mx: Math.max(...vals) }]
    })), [allSubjects])

    if (allGroups.length < 2) {
        return (
            <div className='gc-empty'>
                {allGroups.length === 1
                    ? <span>
                        Showing only group <strong>{allGroups[0]}</strong>.
                        Select <strong>All</strong> in the sidebar to compare all groups.
                      </span>
                    : <span>Add at least <strong>2 groups</strong> during analysis to enable comparison.</span>
                }
            </div>
        )
    }

    return (
        <div className='gc-container'>

            {/* Controls */}
            <div className='gc-controls'>
                <span className='gc-title'>Group Comparison</span>
                <div className='gc-seg-picker'>
                    <label>Method:</label>
                    {METHODS_SEG.map(m => (
                        <button key={m}
                            className={`gc-pill${segMethod === m ? ' active' : ''}`}
                            onClick={() => setSegMethod(m)}>
                            {m.replace('_scalar', '')}
                        </button>
                    ))}
                </div>
                <div className='gc-seg-picker'>
                    <label>Chart:</label>
                    {[
                        { id: 'box',    label: 'Box'    },
                        { id: 'violin', label: 'Violin' },
                        { id: 'bar',    label: 'Bar'    },
                    ].map(({ id, label }) => (
                        <button key={id}
                            className={`gc-pill${chartType === id ? ' active' : ''}`}
                            onClick={() => setChartType(id)}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className='gc-seg-picker'>
                    <label>Scale:</label>
                    <button
                        className={`gc-pill${!normalize ? ' active' : ''}`}
                        onClick={() => setNormalize(false)}
                        title='Raw values with fixed per-scalar Y range'>
                        Raw
                    </button>
                    <button
                        className={`gc-pill${normalize ? ' active' : ''}`}
                        onClick={() => setNormalize(true)}
                        title='Min-max normalize each scalar to [0–1] so all 4 charts share the same Y axis'>
                        Normalize [0–1]
                    </button>
                </div>
            </div>

            {/* Group legend */}
            <div className='gc-legend'>
                {allGroups.map((g, i) => (
                    <span key={g} className='gc-legend-item'>
                        <span className='gc-dot' style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                        {g}
                    </span>
                ))}
            </div>

            {/* Scalar distributions */}
            <div className='gc-section'>
                <span className='gc-section-title'>
                    Scalar distributions
                    <InfoTool text='One chart per scalar (FA, MD, RD, AD) showing its distribution across groups. Each colour is a group (see the legend above). Use the Method, Chart and Scale controls at the top to switch segmentation method, box/violin/bar and raw vs. normalized [0–1] values.' />
                </span>
                <div className='gc-boxplots'>
                    {SCALARS.map(sc => (
                        <div key={sc} className='gc-box-cell'>
                            <ScalarDistribution
                                allSubjects={allSubjects} allGroups={allGroups}
                                scalar={sc} segMethod={segMethod} chartType={chartType}
                                yRange={yRanges[sc]}
                                normalize={normalize} normFactor={normFactors[sc]}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Per-subject values table */}
            <div className='gc-section'>
                <span className='gc-section-title'>
                    Per-subject scalar values
                    <InfoTool text='Raw scalar values of every subject. Sort by group or by any scalar, and download the data as CSV.' />
                </span>
                <div className='gc-chart-card'>
                    <SubjectTable
                        allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                    />
                </div>
            </div>

            {/* CC Thickness Profile + Scalar along midline — side by side */}
            <div className='gc-section'>
                <div className='gc-profiles-row'>
                    <div className='gc-profile-cell'>
                        <span className='gc-section-title'>
                            CC Thickness Profile
                            <InfoTool text='Mean CC thickness along its length (posterior → anterior) per group; the shaded band is ±1 SD. Click the colours in the legend to hide or show each group.' />
                        </span>
                        <div className='gc-chart-card'>
                            <ThicknessProfile
                                allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                            />
                        </div>
                    </div>
                    <div className='gc-profile-cell'>
                        <span className='gc-section-title'>
                            Scalar Profile along CC Midline
                            <InfoTool text='Mean value of the selected scalar sampled along the CC midline per group; the shaded band is ±1 SD. Pick the scalar with the buttons above. Click the colours in the legend to hide or show each group.' />
                        </span>
                        <div className='gc-chart-card'>
                            <MidlineProfile
                                allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Parcellation by region + Statistics table — side by side */}
            <div className='gc-section'>
                <div className='gc-parc-stats-row'>
                    <div className='gc-parc-cell'>
                        <span className='gc-section-title'>
                            Mean scalar per CC Region
                            <InfoTool text='Grouped bars of the mean scalar per callosal region (P1–P5) for each group; error bars are ±1 SD. Choose scalar and parcellation scheme with the buttons above. Click the colours in the legend to hide or show each group.' />
                        </span>
                        <div className='gc-chart-card'>
                            <ParcellationBar
                                allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                            />
                        </div>
                    </div>
                    <div className='gc-stats-cell'>
                        <span className='gc-section-title'>
                            CC scalar statistics per group
                            <InfoTool text='Mean ± standard deviation of each scalar per group, plus an overall row across all subjects. FA is dimensionless; MD, RD and AD are in mm²/s.' />
                        </span>
                        <MeanTable
                            allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                        />
                    </div>
                </div>
            </div>

            {/* Shape metrics */}
            <div className='gc-section'>
                <span className='gc-section-title'>
                    Shape Metrics
                    <span className='gc-badge'>ROQS</span>
                    <InfoTool text='Morphological metrics of the CC (area, length, max and mean thickness) per group, from the ROQS segmentation. Box/violin follows the Chart selector above.' />
                </span>
                <ShapeMetrics allSubjects={allSubjects} allGroups={allGroups} chartType={chartType} />
            </div>

        </div>
    )
}

export default GroupComparison
