import React, { useMemo } from 'react'
import Plot from 'react-plotly.js'
import './DemographicsDashboard.scss'

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']

const COL_META = {
    age:              { type: 'numeric',     label: 'Age',              unit: 'years' },
    sex:              { type: 'categorical', label: 'Sex'                             },
    ethnicity:        { type: 'categorical', label: 'Ethnicity'                       },
    diagnosis:        { type: 'categorical', label: 'Diagnosis'                       },
    disease_duration: { type: 'numeric',     label: 'Disease Duration', unit: 'years' },
    medication:       { type: 'categorical', label: 'Medication'                      },
    scanner:          { type: 'categorical', label: 'Scanner'                         },
    field_strength:   { type: 'categorical', label: 'Field Strength'                  },
    acquisition_date: { type: 'date',        label: 'Acquisition Date'                },
    weight_kg:        { type: 'numeric',     label: 'Weight',           unit: 'kg'    },
    height_cm:        { type: 'numeric',     label: 'Height',           unit: 'cm'    },
}

const SECTIONS = [
    { id: 'demographics', title: 'Demographics', cols: ['age', 'sex', 'ethnicity']                         },
    { id: 'clinical',     title: 'Clinical',      cols: ['diagnosis', 'disease_duration', 'medication']    },
    { id: 'acquisition',  title: 'Acquisition',   cols: ['scanner', 'field_strength', 'acquisition_date'] },
    { id: 'anthro',       title: 'Anthropometric', cols: ['weight_kg', 'height_cm']                        },
]

const LAYOUT_BASE = {
    margin:        { t: 16, b: 52, l: 56, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor:  '#fafbff',
    legend:        { orientation: 'h', y: -0.38 },
    font:          { size: 12 },
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function uniqueVals(rows, col) {
    return [...new Set(rows.map(r => r[col]).filter(v => v && v !== ''))].sort()
}

function isFullWidth(col, rows) {
    if (col === 'acquisition_date') return true
    const meta = COL_META[col]
    if (meta?.type === 'categorical') return uniqueVals(rows, col).length > 5
    return false
}

// ── Violin chart for numeric columns ─────────────────────────────────────────

function NumericChart({ rows, col, groups }) {
    const meta  = COL_META[col]
    const multi = groups.length > 1

    const traces = groups.map((group, gi) => {
        const vals = rows
            .filter(r => r.group === group)
            .map(r => parseFloat(r[col]))
            .filter(v => !isNaN(v))
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type:      'violin',
            y:         vals,
            name:      group,
            box:       { visible: true },
            meanline:  { visible: true },
            marker:    { color, opacity: 0.8 },
            line:      { color },
            fillcolor: color + '44',
            showlegend: multi,
        }
    })

    if (traces.every(t => !t.y.length)) {
        return <div className='dm-no-data'>No data available.</div>
    }

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                height: 280,
                yaxis: { title: meta.unit || '', gridcolor: '#eee', zeroline: false },
                xaxis: { showgrid: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Grouped bar chart for categorical columns ─────────────────────────────────

function CategoricalChart({ rows, col, groups }) {
    const cats  = uniqueVals(rows, col)
    const multi = groups.length > 1

    if (!cats.length) return <div className='dm-no-data'>No data available.</div>

    const traces = groups.map((group, gi) => {
        const groupRows = rows.filter(r => r.group === group)
        const color     = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type:   'bar',
            x:      cats,
            y:      cats.map(cat => groupRows.filter(r => r[col] === cat).length),
            name:   group,
            marker: { color, opacity: 0.85 },
            showlegend: multi,
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                barmode: 'group',
                height:  260,
                xaxis:   { gridcolor: '#eee', automargin: true },
                yaxis:   { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Year histogram for date columns ───────────────────────────────────────────

function DateChart({ rows, col, groups }) {
    const multi  = groups.length > 1

    const traces = groups.map((group, gi) => {
        const years = rows
            .filter(r => r.group === group)
            .map(r => { const d = new Date(r[col]); return isNaN(d.getTime()) ? null : d.getFullYear() })
            .filter(Boolean)
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type:   'histogram',
            x:      years,
            name:   group,
            marker: { color, opacity: 0.75 },
            autobinx: true,
            showlegend: multi,
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                barmode: 'overlay',
                height:  240,
                xaxis:   { title: 'Year', gridcolor: '#eee', dtick: 1 },
                yaxis:   { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Height × Weight scatter with BMI iso-lines ────────────────────────────────

function BmiScatter({ rows, groups }) {
    const traces = groups.map((group, gi) => {
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        const pts   = rows
            .filter(r => r.group === group)
            .map(r => {
                const w = parseFloat(r.weight_kg)
                const h = parseFloat(r.height_cm)
                if (isNaN(w) || isNaN(h) || h <= 0) return null
                const bmi = w / ((h / 100) ** 2)
                return { h, w, bmi, id: r.subject_id || '' }
            })
            .filter(Boolean)
        return {
            type: 'scatter', mode: 'markers',
            x:    pts.map(p => p.h),
            y:    pts.map(p => p.w),
            text: pts.map(p => `${p.id}<br>BMI: ${p.bmi.toFixed(1)}`),
            hoverinfo: 'text',
            name:   group,
            marker: { color, size: 8, opacity: 0.75 },
        }
    })

    // ISO-BMI reference lines
    const H = [140, 210]
    ;[
        { bmi: 18.5, label: 'BMI 18.5 — Underweight', color: '#74b9ff' },
        { bmi: 25,   label: 'BMI 25 — Overweight',    color: '#fdcb6e' },
        { bmi: 30,   label: 'BMI 30 — Obese',         color: '#e17055' },
    ].forEach(({ bmi, label, color }) => {
        traces.push({
            type: 'scatter', mode: 'lines',
            x: H, y: H.map(h => bmi * ((h / 100) ** 2)),
            name:      label,
            line:      { color, dash: 'dot', width: 1.5 },
            hoverinfo: 'name',
        })
    })

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                height: 340,
                legend: { orientation: 'h', y: -0.28 },
                xaxis:  { title: 'Height (cm)', gridcolor: '#eee', zeroline: false },
                yaxis:  { title: 'Weight (kg)', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Main component ────────────────────────────────────────────────────────────

function DemographicsDashboard({ rows, presentCols }) {
    const groups = useMemo(
        () => [...new Set(rows.map(r => r.group).filter(Boolean))],
        [rows]
    )

    const n = rows.length

    const completeness = useMemo(() => presentCols.map(col => {
        const present = rows.filter(r => r[col] !== undefined && r[col] !== '').length
        return { col, present, total: n, pct: n ? Math.round(present / n * 100) : 0 }
    }), [rows, presentCols, n])

    const avgCompleteness = completeness.length
        ? Math.round(completeness.reduce((s, c) => s + c.pct, 0) / completeness.length)
        : 0

    const hasBmi = presentCols.includes('weight_kg') && presentCols.includes('height_cm')

    function renderChart(col) {
        const meta = COL_META[col]
        if (!meta) return null
        if (meta.type === 'numeric')     return <NumericChart     rows={rows} col={col} groups={groups} />
        if (meta.type === 'categorical') return <CategoricalChart rows={rows} col={col} groups={groups} />
        if (meta.type === 'date')        return <DateChart        rows={rows} col={col} groups={groups} />
        return null
    }

    return (
        <div className='dm-container'>

            {/* Summary KPIs */}
            <div className='dm-kpi-row'>
                <div className='dm-kpi-card'>
                    <span className='dm-kpi-val'>{n}</span>
                    <span className='dm-kpi-label'>Subjects</span>
                </div>
                <div className='dm-kpi-card'>
                    <span className='dm-kpi-val'>{groups.length}</span>
                    <span className='dm-kpi-label'>Groups</span>
                </div>
                <div className='dm-kpi-card'>
                    <span className='dm-kpi-val'>{presentCols.length}</span>
                    <span className='dm-kpi-label'>Columns detected</span>
                </div>
                <div className='dm-kpi-card'>
                    <span className='dm-kpi-val'>{avgCompleteness}%</span>
                    <span className='dm-kpi-label'>Avg completeness</span>
                </div>
            </div>

            {/* Group legend */}
            {groups.length > 1 && (
                <div className='dm-legend'>
                    {groups.map((g, i) => (
                        <div key={g} className='dm-legend-item'>
                            <span className='dm-dot' style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                            {g}
                        </div>
                    ))}
                </div>
            )}

            {/* Data completeness */}
            <div className='dm-section'>
                <span className='dm-section-title'>Data Completeness</span>
                <div className='dm-completeness-grid'>
                    {completeness.map(({ col, present, total, pct }) => (
                        <div key={col} className='dm-completeness-row'>
                            <span className='dm-col-label'>{COL_META[col]?.label || col}</span>
                            <div className='dm-bar-track'>
                                <div
                                    className='dm-bar-fill'
                                    style={{
                                        width:      `${pct}%`,
                                        background: pct >= 80 ? '#4C6EF5' : pct >= 50 ? '#FFA15A' : '#EF553B',
                                    }}
                                />
                            </div>
                            <span className='dm-col-pct'>{pct}%</span>
                            <span className='dm-col-count'>{present}/{total}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart sections */}
            {SECTIONS.map(section => {
                const activeCols = section.cols.filter(c => presentCols.includes(c))
                if (!activeCols.length) return null
                return (
                    <div key={section.id} className='dm-section'>
                        <span className='dm-section-title'>{section.title}</span>
                        <div className='dm-charts-grid'>
                            {activeCols.map(col => {
                                const full = isFullWidth(col, rows) || activeCols.length === 1
                                const meta = COL_META[col]
                                const title = meta
                                    ? `${meta.label}${meta.unit ? ` (${meta.unit})` : ''}`
                                    : col
                                return (
                                    <div key={col} className={`dm-chart-card${full ? ' dm-chart-card--full' : ''}`}>
                                        <span className='dm-chart-title'>{title}</span>
                                        {renderChart(col)}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            {/* Body composition — only when both weight and height are present */}
            {hasBmi && (
                <div className='dm-section'>
                    <span className='dm-section-title'>Body Composition</span>
                    <div className='dm-charts-grid'>
                        <div className='dm-chart-card dm-chart-card--full'>
                            <span className='dm-chart-title'>Weight × Height with BMI iso-lines</span>
                            <BmiScatter rows={rows} groups={groups} />
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

export default DemographicsDashboard
