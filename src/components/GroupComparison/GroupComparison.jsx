import React, { useState } from 'react'
import Plot from 'react-plotly.js'
import './GroupComparison.scss'

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']
const SCALARS      = ['FA', 'MD', 'RD', 'AD']
const METHODS_SEG  = ['ROQS_scalar', 'Watershed_scalar', 'CNN_scalar']

// ── Coleta valores de um escalar para cada sujeito de um grupo ─────────────
function getValues(subjects, method, scalar) {
    return subjects
        .map(s => {
            const v = s?.[method]?.[scalar]
            return typeof v === 'number' ? v : parseFloat(v)
        })
        .filter(v => !isNaN(v))
}

// ── Estatísticas básicas ───────────────────────────────────────────────────
function stats(values) {
    if (!values.length) return { mean: null, std: null, n: 0 }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std  = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
    return { mean, std, n: values.length }
}

// ── Boxplot grouped por grupos para um escalar ─────────────────────────────
function ScalarBoxplot({ allSubjects, allGroups, scalar, segMethod }) {
    const traces = allGroups.map((group, gi) => {
        const subs   = allSubjects.filter(s => s.group === group)
        const values = getValues(subs, segMethod, scalar)
        return {
            type:   'box',
            y:      values,
            name:   group,
            boxmean: 'sd',
            marker:  { color: GROUP_COLORS[gi % GROUP_COLORS.length], opacity: 0.85 },
            line:    { width: 1.5 },
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                title:  { text: scalar, font: { size: 13, color: '#333' } },
                height: 260,
                margin: { t: 36, b: 36, l: 44, r: 10 },
                showlegend: false,
                yaxis:  { gridcolor: '#eee', zeroline: false },
                xaxis:  { showgrid: false },
                paper_bgcolor: 'transparent',
                plot_bgcolor:  '#fafbff',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Tabela de médias por grupo ─────────────────────────────────────────────
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
                                    const { mean, std } = stats(getValues(subs, segMethod, sc))
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

// ── Radar: média por grupo para todos os escalares ─────────────────────────
function GroupRadar({ allSubjects, allGroups, segMethod }) {
    const traces = allGroups.map((group, gi) => {
        const subs = allSubjects.filter(s => s.group === group)
        const r    = SCALARS.map(sc => {
            const { mean } = stats(getValues(subs, segMethod, sc))
            return mean ?? 0
        })
        return {
            type:  'scatterpolar',
            r:     [...r, r[0]],
            theta: [...SCALARS, SCALARS[0]],
            fill:  'toself',
            name:  group,
            line:  { color: GROUP_COLORS[gi % GROUP_COLORS.length] },
            fillcolor: GROUP_COLORS[gi % GROUP_COLORS.length] + '33',
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                polar:  { radialaxis: { visible: true, gridcolor: '#ddd' } },
                height: 320,
                margin: { t: 20, b: 20, l: 20, r: 20 },
                showlegend: true,
                legend: { orientation: 'h', y: -0.1 },
                paper_bgcolor: 'transparent',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Componente principal ───────────────────────────────────────────────────
function GroupComparison({ allSubjects, allGroups }) {
    const [segMethod, setSegMethod] = useState('ROQS_scalar')

    const hasGroups = allGroups.length >= 2

    if (!hasGroups) {
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
                        <button
                            key={m}
                            className={`gc-pill${segMethod === m ? ' active' : ''}`}
                            onClick={() => setSegMethod(m)}
                        >
                            {m.replace('_scalar', '')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Boxplots per scalar */}
            <div className='gc-boxplots'>
                {SCALARS.map(sc => (
                    <div key={sc} className='gc-box-cell'>
                        <ScalarBoxplot
                            allSubjects={allSubjects}
                            allGroups={allGroups}
                            scalar={sc}
                            segMethod={segMethod}
                        />
                    </div>
                ))}
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

            {/* Radar */}
            <div className='gc-section'>
                <span className='gc-section-title'>Mean profile per group (radar)</span>
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
