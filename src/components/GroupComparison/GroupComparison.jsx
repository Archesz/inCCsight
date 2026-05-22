import React, { useState } from 'react'
import Plot from 'react-plotly.js'
import './GroupComparison.scss'

const GROUP_COLORS  = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']
const SCALARS       = ['FA', 'MD', 'RD', 'AD']
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
        },
        {
            x: xArr, y: means,
            type: 'scatter', mode: 'lines',
            name, line: { color, width: 2.5 },
        },
    ]
}

const CHART_LAYOUT_BASE = {
    margin: { t: 12, b: 48, l: 56, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#fafbff',
    legend: { orientation: 'h', y: -0.32 },
}

// ── Distribution (box or violin) ──────────────────────────────────────────

function ScalarDistribution({ allSubjects, allGroups, scalar, segMethod, chartType }) {
    const traces = allGroups.map((group, gi) => {
        const values = getValues(allSubjects.filter(s => s.group === group), segMethod, scalar)
        const color  = GROUP_COLORS[gi % GROUP_COLORS.length]
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
        <Plot
            data={traces}
            layout={{
                title: { text: scalar, font: { size: 13, color: '#333' } },
                height: 260, margin: { t: 36, b: 36, l: 44, r: 10 },
                showlegend: false,
                yaxis: { gridcolor: '#eee', zeroline: false },
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
                            onClick={() => setScalar(sc)}>{sc}</button>
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
                    barmode: 'group', height: 300,
                    xaxis: { title: 'CC Region', gridcolor: '#eee' },
                    yaxis: { title: scalar, gridcolor: '#eee', zeroline: false },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }} useResizeHandler
            />
        </div>
    )
}

// ── Shape metrics (ROQS only) ─────────────────────────────────────────────

function ShapeMetrics({ allSubjects, allGroups }) {
    return (
        <div className='gc-shape-grid'>
            {SHAPE_METRICS.map(({ key, label }) => {
                const traces = allGroups.map((group, gi) => {
                    const color  = GROUP_COLORS[gi % GROUP_COLORS.length]
                    const values = allSubjects
                        .filter(s => s.group === group)
                        .map(s => s?.ROQS_shape?.[key])
                        .filter(v => typeof v === 'number' && !isNaN(v))
                    return {
                        type: 'violin', y: values, name: group,
                        box: { visible: true }, meanline: { visible: true },
                        marker: { color, opacity: 0.8 }, line: { color },
                        fillcolor: color + '44', showlegend: false,
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

// ── Radar ─────────────────────────────────────────────────────────────────

function GroupRadar({ allSubjects, allGroups, segMethod }) {
    const traces = allGroups.map((group, gi) => {
        const subs = allSubjects.filter(s => s.group === group)
        const r    = SCALARS.map(sc => calcStats(getValues(subs, segMethod, sc)).mean ?? 0)
        return {
            type: 'scatterpolar',
            r: [...r, r[0]], theta: [...SCALARS, SCALARS[0]],
            fill: 'toself', name: group,
            line: { color: GROUP_COLORS[gi % GROUP_COLORS.length] },
            fillcolor: GROUP_COLORS[gi % GROUP_COLORS.length] + '33',
        }
    })
    return (
        <Plot
            data={traces}
            layout={{
                polar: { radialaxis: { visible: true, gridcolor: '#ddd' } },
                height: 320, margin: { t: 20, b: 20, l: 20, r: 20 },
                showlegend: true, legend: { orientation: 'h', y: -0.1 },
                paper_bgcolor: 'transparent',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── Statistics table ──────────────────────────────────────────────────────

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
                </tbody>
            </table>
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────

function GroupComparison({ allSubjects, allGroups }) {
    const [segMethod, setSegMethod] = useState('ROQS_scalar')
    const [chartType, setChartType] = useState('box')

    if (allGroups.length < 2) {
        return (
            <div className='gc-empty'>
                <span>Add at least <strong>2 groups</strong> during analysis to enable comparison.</span>
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
                    {['box', 'violin'].map(t => (
                        <button key={t}
                            className={`gc-pill${chartType === t ? ' active' : ''}`}
                            onClick={() => setChartType(t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
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
                <span className='gc-section-title'>Scalar distributions</span>
                <div className='gc-boxplots'>
                    {SCALARS.map(sc => (
                        <div key={sc} className='gc-box-cell'>
                            <ScalarDistribution
                                allSubjects={allSubjects} allGroups={allGroups}
                                scalar={sc} segMethod={segMethod} chartType={chartType}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* CC Thickness Profile + Scalar along midline — side by side */}
            <div className='gc-section'>
                <div className='gc-profiles-row'>
                    <div className='gc-profile-cell'>
                        <span className='gc-section-title'>CC Thickness Profile</span>
                        <div className='gc-chart-card'>
                            <ThicknessProfile
                                allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                            />
                        </div>
                    </div>
                    <div className='gc-profile-cell'>
                        <span className='gc-section-title'>Scalar Profile along CC Midline</span>
                        <div className='gc-chart-card'>
                            <MidlineProfile
                                allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Parcellation by region */}
            <div className='gc-section'>
                <span className='gc-section-title'>Mean scalar per CC Region</span>
                <div className='gc-chart-card'>
                    <ParcellationBar
                        allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod}
                    />
                </div>
            </div>

            {/* Shape metrics */}
            <div className='gc-section'>
                <span className='gc-section-title'>
                    Shape Metrics
                    <span className='gc-badge'>ROQS</span>
                </span>
                <ShapeMetrics allSubjects={allSubjects} allGroups={allGroups} />
            </div>

            {/* Radar */}
            <div className='gc-section'>
                <span className='gc-section-title'>Mean scalar profile — radar</span>
                <div className='gc-radar-wrap'>
                    <GroupRadar allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod} />
                </div>
            </div>

            {/* Statistics table */}
            <div className='gc-section'>
                <span className='gc-section-title'>Statistics per group</span>
                <MeanTable allSubjects={allSubjects} allGroups={allGroups} segMethod={segMethod} />
            </div>

        </div>
    )
}

export default GroupComparison
