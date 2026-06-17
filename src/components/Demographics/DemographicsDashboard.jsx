import React, { useMemo, useState, useEffect, useCallback } from 'react'
import Plot from 'react-plotly.js'
import './DemographicsDashboard.scss'

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']

// ── Known column metadata ─────────────────────────────────────────────────────
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

// ── DTI columns synthesized from analyzed subjects ────────────────────────────
const DTI_METHODS = [
    { key: 'ROQS_scalar',      label: 'ROQS' },
    { key: 'Watershed_scalar', label: 'Watershed' },
    { key: 'CNN_scalar',       label: 'CNN' },
]
const DTI_SCALARS = ['FA', 'MD', 'RD', 'AD']

function parseDtiCol(col) {
    for (const method of DTI_METHODS) {
        for (const scalar of DTI_SCALARS) {
            if (col === `${method.label}_${scalar}`) {
                return { methodKey: method.key, scalar, label: `${method.label} ${scalar}` }
            }
        }
    }
    return null
}

const STORAGE_KEY = 'inccsight.demograph.panels'

const LAYOUT_BASE = {
    margin:        { t: 10, b: 48, l: 56, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor:  '#fafbff',
    font:          { size: 12 },
}
const PLOT_CONFIG = { displayModeBar: false, responsive: true }

const PANEL_TYPES = [
    { value: 'distribution', label: 'Distribution' },
    { value: 'scatter',      label: 'Scatter' },
    { value: 'bar',          label: 'Bar' },
    { value: 'table',        label: 'Table' },
]
const VIZ_SUBTYPES = [
    { value: 'violin',    label: 'Violin' },
    { value: 'box',       label: 'Box' },
    { value: 'histogram', label: 'Histogram' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v) {
    if (v === '' || v == null) return NaN
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
}
// Normalize a subject ID for cross-matching demograph.csv with analyzed subjects.
// The pipeline zero-pads numeric folder names (e.g. "530" -> "0000530" via zfill),
// so strip leading zeros for purely-numeric IDs while leaving other IDs untouched.
function normId(v) {
    const s = String(v ?? '').trim()
    return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN }
function stdDev(a) {
    if (a.length < 2) return 0
    const m = mean(a)
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
}
function pearson(pairs) {
    const n = pairs.length
    if (n < 2) return NaN
    const mx = mean(pairs.map(p => p[0]))
    const my = mean(pairs.map(p => p[1]))
    let sxy = 0, sxx = 0, syy = 0
    for (const [x, y] of pairs) {
        const dx = x - mx, dy = y - my
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy
    }
    const d = Math.sqrt(sxx * syy)
    return d === 0 ? NaN : sxy / d
}
function linfit(pairs) {
    if (pairs.length < 2) return null
    const mx = mean(pairs.map(p => p[0]))
    const my = mean(pairs.map(p => p[1]))
    let sxy = 0, sxx = 0
    for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2 }
    if (sxx === 0) return null
    const a = sxy / sxx
    return { a, b: my - a * mx }
}
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function autoDetectType(rows, col) {
    const vals = rows.map(r => r[col]).filter(v => v !== '' && v != null)
    if (!vals.length) return 'categorical'
    const nums = vals.filter(v => !isNaN(Number(v)))
    return nums.length / vals.length > 0.8 ? 'numeric' : 'categorical'
}

function quantile(sorted, p) {
    if (!sorted.length) return NaN
    const idx = (sorted.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Categories of the color-by column, in stable order, each with its color.
function colorCategories(data, colorBy) {
    const keyOf = r => {
        const raw = colorBy === 'group' ? r.group : r[colorBy]
        const s = String(raw ?? '').trim()
        return s === '' ? '—' : s
    }
    const cats = [...new Set(data.map(keyOf))]
    return { keyOf, cats }
}

// ── Mini stats bar (n, mean ± std per color category) ────────────────────────
function StatsBar({ data, col, keyOf, cats }) {
    const items = cats.map((cat, ci) => {
        const vals = data.filter(r => keyOf(r) === cat).map(r => toNum(r[col])).filter(Number.isFinite)
        return {
            cat,
            color: GROUP_COLORS[ci % GROUP_COLORS.length],
            n: vals.length,
            mean: mean(vals),
            std: stdDev(vals),
        }
    })
    return (
        <div className='dm-stats-bar'>
            {items.map(s => (
                <div key={s.cat} className='dm-stats-item'>
                    <span className='dm-stats-dot' style={{ background: s.color }} />
                    <span className='dm-stats-cat'>{s.cat}</span>
                    <span className='dm-stats-val'>n={s.n}</span>
                    <span className='dm-stats-val'>{fmt(s.mean, 2)} ± {fmt(s.std, 2)}</span>
                </div>
            ))}
        </div>
    )
}

// ── Categorical count bar (shared by Distribution + Bar panels) ───────────────
function CategoricalCountChart({ data, xCol, keyOf, cats }) {
    const xCats = [...new Set(
        data.map(r => String(r[xCol] ?? '').trim()).filter(v => v !== '')
    )].sort()
    if (!xCats.length) return <div className='dm-no-data'>No data available.</div>

    const traces = cats.map((cat, ci) => {
        const catRows = data.filter(r => keyOf(r) === cat)
        return {
            type: 'bar',
            x: xCats,
            y: xCats.map(xc => catRows.filter(r => String(r[xCol] ?? '').trim() === xc).length),
            name: cat,
            marker: { color: GROUP_COLORS[ci % GROUP_COLORS.length], opacity: 0.85 },
            showlegend: cats.length > 1,
        }
    })
    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                barmode: 'group',
                height: 280,
                legend: { orientation: 'h', y: -0.25 },
                xaxis: { automargin: true, showgrid: false },
                yaxis: { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={PLOT_CONFIG}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Distribution panel body ───────────────────────────────────────────────────
function DistributionBody({ data, xCol, colorBy, vizSubtype, isNumeric, axisTitle }) {
    const { keyOf, cats } = colorCategories(data, colorBy)

    if (!isNumeric) {
        return <CategoricalCountChart data={data} xCol={xCol} keyOf={keyOf} cats={cats} />
    }

    const multi = cats.length > 1
    let traces

    if (vizSubtype === 'histogram') {
        traces = cats.map((cat, ci) => {
            const vals = data.filter(r => keyOf(r) === cat).map(r => toNum(r[xCol])).filter(Number.isFinite)
            return {
                type: 'histogram',
                x: vals,
                name: cat,
                marker: { color: GROUP_COLORS[ci % GROUP_COLORS.length], opacity: 0.8 },
                showlegend: multi,
            }
        })
    } else if (vizSubtype === 'box') {
        traces = cats.map((cat, ci) => {
            const vals = data.filter(r => keyOf(r) === cat).map(r => toNum(r[xCol])).filter(Number.isFinite)
            const color = GROUP_COLORS[ci % GROUP_COLORS.length]
            return {
                type: 'box',
                y: vals,
                name: cat,
                boxmean: 'sd',
                boxpoints: 'all',
                jitter: 0.4,
                pointpos: 0,
                marker: { color, opacity: 0.8, size: 5 },
                line: { color },
                showlegend: multi,
            }
        })
    } else {
        traces = cats.map((cat, ci) => {
            const vals = data.filter(r => keyOf(r) === cat).map(r => toNum(r[xCol])).filter(Number.isFinite)
            const color = GROUP_COLORS[ci % GROUP_COLORS.length]
            return {
                type: 'violin',
                y: vals,
                name: cat,
                box: { visible: true },
                meanline: { visible: true },
                points: 'all',
                jitter: 0.35,
                pointpos: 0,
                marker: { color, opacity: 0.7, size: 5 },
                line: { color },
                fillcolor: color + '33',
                showlegend: multi,
            }
        })
    }

    const empty = vizSubtype === 'histogram'
        ? traces.every(t => !t.x.length)
        : traces.every(t => !t.y.length)
    if (empty) return <div className='dm-no-data'>No data available.</div>

    const isHist = vizSubtype === 'histogram'
    return (
        <>
            <Plot
                data={traces}
                layout={{
                    ...LAYOUT_BASE,
                    barmode: isHist ? 'overlay' : undefined,
                    height: 300,
                    legend: { orientation: 'h', y: -0.22 },
                    xaxis: isHist
                        ? { title: axisTitle, gridcolor: '#eee', zeroline: false }
                        : { showgrid: false },
                    yaxis: isHist
                        ? { title: 'Count', gridcolor: '#eee', zeroline: false }
                        : { title: axisTitle, gridcolor: '#eee', zeroline: false },
                }}
                config={PLOT_CONFIG}
                style={{ width: '100%' }}
                useResizeHandler
            />
            <StatsBar data={data} col={xCol} keyOf={keyOf} cats={cats} />
        </>
    )
}

// ── Scatter panel body ────────────────────────────────────────────────────────
function ScatterBody({ data, xCol, yCol, colorBy, xTitle, yTitle }) {
    const { keyOf, cats } = colorCategories(data, colorBy)

    const points = data
        .map(r => ({
            x: toNum(r[xCol]),
            y: toNum(r[yCol]),
            id: r.subject_id ?? '',
            cat: keyOf(r),
        }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))

    if (points.length < 2) {
        return <div className='dm-no-data'>Not enough subjects with both values.</div>
    }

    const pairs = points.map(p => [p.x, p.y])
    const r = pearson(pairs)
    const fit = points.length >= 5 ? linfit(pairs) : null

    const traces = cats
        .map((cat, ci) => {
            const pts = points.filter(p => p.cat === cat)
            if (!pts.length) return null
            return {
                type: 'scatter',
                mode: 'markers',
                name: cat,
                x: pts.map(p => p.x),
                y: pts.map(p => p.y),
                text: pts.map(p => String(p.id)),
                hovertemplate: '%{text}<br>%{x}, %{y}<extra></extra>',
                marker: { size: 9, color: GROUP_COLORS[ci % GROUP_COLORS.length], opacity: 0.85 },
                showlegend: cats.length > 1,
            }
        })
        .filter(Boolean)

    if (fit) {
        const xs = points.map(p => p.x)
        const xMin = Math.min(...xs)
        const xMax = Math.max(...xs)
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'linear fit',
            x: [xMin, xMax],
            y: [fit.a * xMin + fit.b, fit.a * xMax + fit.b],
            line: { color: '#1F2C56', dash: 'dash', width: 2 },
            hoverinfo: 'skip',
            showlegend: false,
        })
    }

    return (
        <>
            <Plot
                data={traces}
                layout={{
                    ...LAYOUT_BASE,
                    height: 320,
                    legend: { orientation: 'h', y: -0.25 },
                    xaxis: { title: xTitle, gridcolor: '#eee', zeroline: false },
                    yaxis: { title: yTitle, gridcolor: '#eee', zeroline: false },
                }}
                config={PLOT_CONFIG}
                style={{ width: '100%' }}
                useResizeHandler
            />
            <div className='dm-stats-bar'>
                <div className='dm-stats-item'>
                    <span className='dm-stats-val'>n = {points.length}</span>
                </div>
                {points.length >= 5 && (
                    <div className='dm-stats-item'>
                        <span className='dm-stats-val'>Pearson r = {fmt(r, 3)}</span>
                    </div>
                )}
                {fit && (
                    <div className='dm-stats-item'>
                        <span className='dm-stats-val'>slope = {fmt(fit.a, 4)}</span>
                    </div>
                )}
            </div>
        </>
    )
}

// ── Bar panel body ────────────────────────────────────────────────────────────
function BarBody({ data, xCol, colorBy, isNumeric, label }) {
    const { keyOf, cats } = colorCategories(data, colorBy)

    if (!isNumeric) {
        return <CategoricalCountChart data={data} xCol={xCol} keyOf={keyOf} cats={cats} />
    }

    // Numeric column: bin into quartiles and count per quartile.
    const allVals = data.map(r => toNum(r[xCol])).filter(Number.isFinite)
    if (!allVals.length) return <div className='dm-no-data'>No data available.</div>

    const sorted = [...allVals].sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25)
    const q2 = quantile(sorted, 0.50)
    const q3 = quantile(sorted, 0.75)

    const binOf = v => {
        if (v <= q1) return 0
        if (v <= q2) return 1
        if (v <= q3) return 2
        return 3
    }
    const binLabels = [
        `Q1 (≤ ${fmt(q1, 1)})`,
        `Q2 (${fmt(q1, 1)}–${fmt(q2, 1)})`,
        `Q3 (${fmt(q2, 1)}–${fmt(q3, 1)})`,
        `Q4 (> ${fmt(q3, 1)})`,
    ]

    const traces = cats.map((cat, ci) => {
        const counts = [0, 0, 0, 0]
        for (const row of data) {
            if (keyOf(row) !== cat) continue
            const v = toNum(row[xCol])
            if (Number.isFinite(v)) counts[binOf(v)] += 1
        }
        return {
            type: 'bar',
            x: binLabels,
            y: counts,
            name: cat,
            marker: { color: GROUP_COLORS[ci % GROUP_COLORS.length], opacity: 0.85 },
            showlegend: cats.length > 1,
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                barmode: 'group',
                height: 280,
                legend: { orientation: 'h', y: -0.25 },
                xaxis: { title: `${label} quartiles`, automargin: true, showgrid: false },
                yaxis: { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={PLOT_CONFIG}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Table panel body ──────────────────────────────────────────────────────────
const TABLE_PAGE_SIZE = 20

function TableBody({ rows, presentCols, labelOf }) {
    const [sortCol, setSortCol] = useState(null)
    const [sortDir, setSortDir] = useState('asc')
    const [page, setPage]       = useState(0)

    const columns = useMemo(() => {
        const base = ['subject_id', 'group']
        return [...base, ...presentCols.filter(c => !base.includes(c))]
    }, [presentCols])

    const sortedRows = useMemo(() => {
        if (!sortCol) return rows
        const dir = sortDir === 'asc' ? 1 : -1
        return [...rows].sort((a, b) => {
            const va = a[sortCol], vb = b[sortCol]
            const na = toNum(va), nb = toNum(vb)
            if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir
            return String(va ?? '').localeCompare(String(vb ?? '')) * dir
        })
    }, [rows, sortCol, sortDir])

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / TABLE_PAGE_SIZE))
    const safePage   = Math.min(page, totalPages - 1)
    const pageRows   = sortedRows.slice(safePage * TABLE_PAGE_SIZE, (safePage + 1) * TABLE_PAGE_SIZE)

    function handleSort(col) {
        if (sortCol === col) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortCol(col)
            setSortDir('asc')
        }
        setPage(0)
    }

    if (!rows.length) return <div className='dm-no-data'>No data available.</div>

    return (
        <div className='dm-table-wrap'>
            <div className='dm-table-scroll'>
                <table className='dm-table'>
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th key={col} onClick={() => handleSort(col)}>
                                    {labelOf(col)}
                                    {sortCol === col && (
                                        <span className='dm-sort-arrow'>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.map((row, ri) => (
                            <tr key={`${row.subject_id ?? ri}-${ri}`}>
                                {columns.map(col => (
                                    <td key={col}>{String(row[col] ?? '')}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className='dm-pager'>
                <button
                    className='dm-pager-btn'
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                >‹ Prev</button>
                <span className='dm-pager-info'>Page {safePage + 1} of {totalPages} · {sortedRows.length} rows</span>
                <button
                    className='dm-pager-btn'
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                >Next ›</button>
            </div>
        </div>
    )
}

// ── Panel card (header controls + chart body) ─────────────────────────────────
function PanelCard({ panel, ctx, onChange, onRemove }) {
    const {
        rows, data, presentCols, scatterCols,
        numericCols, colorByOptions, colTypeOf, labelOf, axisTitleOf,
    } = ctx

    // Sanitize stored config against currently available columns.
    const xOptions = panel.type === 'scatter' ? scatterCols : presentCols
    const xCol = xOptions.includes(panel.xCol) ? panel.xCol : (xOptions[0] ?? '')
    const yCol = scatterCols.includes(panel.yCol) ? panel.yCol : (scatterCols[0] ?? '')
    const colorBy = colorByOptions.includes(panel.colorBy) ? panel.colorBy : 'group'
    const vizSubtype = VIZ_SUBTYPES.some(v => v.value === panel.vizSubtype) ? panel.vizSubtype : 'violin'

    function handleTypeChange(nextType) {
        const patch = { type: nextType }
        if (nextType === 'scatter') {
            if (!scatterCols.includes(panel.xCol)) patch.xCol = numericCols[0] ?? scatterCols[0] ?? ''
            if (!scatterCols.includes(panel.yCol)) {
                const fallback = scatterCols.find(c => c !== (patch.xCol ?? panel.xCol))
                patch.yCol = fallback ?? scatterCols[0] ?? ''
            }
        } else if (nextType !== 'table') {
            if (!presentCols.includes(panel.xCol)) patch.xCol = presentCols[0] ?? ''
        }
        onChange(patch)
    }

    function renderBody() {
        if (panel.type === 'table') {
            return <TableBody rows={rows} presentCols={presentCols} labelOf={labelOf} />
        }
        if (!xCol) return <div className='dm-no-data'>No columns available.</div>

        if (panel.type === 'scatter') {
            if (!yCol) return <div className='dm-no-data'>No Y column available.</div>
            return (
                <ScatterBody
                    data={data}
                    xCol={xCol}
                    yCol={yCol}
                    colorBy={colorBy}
                    xTitle={axisTitleOf(xCol)}
                    yTitle={axisTitleOf(yCol)}
                />
            )
        }
        if (panel.type === 'bar') {
            return (
                <BarBody
                    data={data}
                    xCol={xCol}
                    colorBy={colorBy}
                    isNumeric={colTypeOf(xCol) === 'numeric'}
                    label={labelOf(xCol)}
                />
            )
        }
        // distribution
        return (
            <DistributionBody
                data={data}
                xCol={xCol}
                colorBy={colorBy}
                vizSubtype={vizSubtype}
                isNumeric={colTypeOf(xCol) === 'numeric'}
                axisTitle={axisTitleOf(xCol)}
            />
        )
    }

    const isFull = panel.width === 'full'

    return (
        <div className={`dm-panel${isFull ? ' dm-panel--full' : ''}`}>
            <div className='dm-panel-header'>
                <div className='dm-panel-controls'>
                    <select
                        className='dm-select'
                        title='Panel type'
                        value={panel.type}
                        onChange={e => handleTypeChange(e.target.value)}
                    >
                        {PANEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>

                    {panel.type !== 'table' && (
                        <select
                            className='dm-select'
                            title={panel.type === 'scatter' ? 'X axis column' : 'Column'}
                            value={xCol}
                            onChange={e => onChange({ xCol: e.target.value })}
                        >
                            {xOptions.map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                        </select>
                    )}

                    {panel.type === 'scatter' && (
                        <select
                            className='dm-select'
                            title='Y axis column'
                            value={yCol}
                            onChange={e => onChange({ yCol: e.target.value })}
                        >
                            {scatterCols.map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                        </select>
                    )}

                    {panel.type === 'distribution' && (
                        <select
                            className='dm-select'
                            title='Visualization'
                            value={vizSubtype}
                            onChange={e => onChange({ vizSubtype: e.target.value })}
                        >
                            {VIZ_SUBTYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                        </select>
                    )}

                    {panel.type !== 'table' && (
                        <select
                            className='dm-select'
                            title='Color by'
                            value={colorBy}
                            onChange={e => onChange({ colorBy: e.target.value })}
                        >
                            {colorByOptions.map(c => (
                                <option key={c} value={c}>
                                    {c === 'group' ? 'Color: group' : `Color: ${labelOf(c)}`}
                                </option>
                            ))}
                        </select>
                    )}

                    <button
                        className='dm-width-btn'
                        title={isFull ? 'Make half width' : 'Make full width'}
                        onClick={() => onChange({ width: isFull ? 'half' : 'full' })}
                    >
                        {isFull ? '⊟' : '⊞'}
                    </button>
                </div>
                <button className='dm-close-btn' title='Remove panel' onClick={onRemove}>×</button>
            </div>
            <div className='dm-panel-body'>
                {renderBody()}
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
function DemographicsDashboard({ rows, presentCols, subjects = [], onReload }) {
    const [reloading, setReloading] = useState(false)

    const groups = useMemo(
        () => [...new Set(rows.map(r => r.group).filter(Boolean))],
        [rows]
    )

    // ── Cross-matching with analyzed subjects ─────────────────────────────────
    const subjectById = useMemo(
        () => new Map(subjects.map(s => [normId(s.Id), s])),
        [subjects]
    )
    const hasMatches = useMemo(
        () => rows.some(r => subjectById.has(normId(r.subject_id))),
        [rows, subjectById]
    )

    // DTI columns: only expose method×scalar combos with at least one non-null
    // value among matched subjects.
    const dtiCols = useMemo(() => {
        if (!hasMatches) return []
        const cols = []
        for (const method of DTI_METHODS) {
            for (const scalar of DTI_SCALARS) {
                const hasValue = rows.some(r => {
                    const sub = subjectById.get(normId(r.subject_id))
                    const raw = sub?.[method.key]?.[scalar]
                    const v = typeof raw === 'number' ? raw : toNum(raw)
                    return Number.isFinite(v)
                })
                if (hasValue) cols.push(`${method.label}_${scalar}`)
            }
        }
        return cols
    }, [rows, subjectById, hasMatches])

    // Enriched rows: demographic columns + flattened DTI values.
    const data = useMemo(() => rows.map(r => {
        const sub = subjectById.get(normId(r.subject_id))
        const enriched = { ...r }
        for (const col of dtiCols) {
            const { methodKey, scalar } = parseDtiCol(col)
            const raw = sub?.[methodKey]?.[scalar]
            enriched[col] = typeof raw === 'number' ? raw : toNum(raw)
        }
        return enriched
    }), [rows, subjectById, dtiCols])

    // ── Column typing / labeling ──────────────────────────────────────────────
    const colTypeOf = useCallback(col => {
        if (parseDtiCol(col)) return 'numeric'
        const meta = COL_META[col]
        if (meta) return meta.type
        return autoDetectType(rows, col)
    }, [rows])

    const labelOf = useCallback(col => {
        const dti = parseDtiCol(col)
        if (dti) return dti.label
        if (col === 'subject_id') return 'Subject ID'
        if (col === 'group') return 'Group'
        return COL_META[col]?.label || col
    }, [])

    const axisTitleOf = useCallback(col => {
        const unit = COL_META[col]?.unit
        return unit ? `${labelOf(col)} (${unit})` : labelOf(col)
    }, [labelOf])

    const numericCols     = useMemo(() => presentCols.filter(c => colTypeOf(c) === 'numeric'),     [presentCols, colTypeOf])
    const categoricalCols = useMemo(() => presentCols.filter(c => colTypeOf(c) === 'categorical'), [presentCols, colTypeOf])
    const colorByOptions  = useMemo(() => ['group', ...categoricalCols],                            [categoricalCols])
    const scatterCols     = useMemo(() => [...presentCols, ...dtiCols],                             [presentCols, dtiCols])

    // ── Panel state (persisted) ───────────────────────────────────────────────
    const defaultPanels = useMemo(() => {
        const panels = []
        if (numericCols.length) {
            panels.push({
                id: makeId(), type: 'distribution', xCol: numericCols[0],
                yCol: '', colorBy: 'group', vizSubtype: 'violin', width: 'half',
            })
        }
        if (categoricalCols.length) {
            panels.push({
                id: makeId(), type: 'bar', xCol: categoricalCols[0],
                yCol: '', colorBy: 'group', vizSubtype: 'violin', width: 'half',
            })
        }
        return panels
    }, [numericCols, categoricalCols])

    const [charts, setCharts] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) return parsed
            }
        } catch (_) {}
        return null
    })

    const panels = charts !== null ? charts : defaultPanels

    useEffect(() => {
        if (charts === null) return
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(charts)) } catch (_) {}
    }, [charts])

    const updatePanel = useCallback((id, patch) => {
        setCharts(panels.map(p => (p.id === id ? { ...p, ...patch } : p)))
    }, [panels])

    const removePanel = useCallback(id => {
        setCharts(panels.filter(p => p.id !== id))
    }, [panels])

    const addPanel = useCallback(() => {
        const xCol = numericCols[0] ?? presentCols[0] ?? ''
        setCharts([
            ...panels,
            {
                id: makeId(), type: 'distribution', xCol,
                yCol: '', colorBy: 'group', vizSubtype: 'violin', width: 'half',
            },
        ])
    }, [panels, numericCols, presentCols])

    function handleReload() {
        setReloading(true)
        Promise.resolve(onReload?.()).finally(() => setReloading(false))
    }

    const ctx = {
        rows, data, presentCols, dtiCols, scatterCols,
        numericCols, categoricalCols, colorByOptions,
        colTypeOf, labelOf, axisTitleOf,
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    return (
        <div className='dm-container'>

            {/* Header */}
            <div className='dm-header'>
                <div className='dm-header-left'>
                    <span className='dm-title'>Demographics</span>
                    <span className='dm-subtitle'>
                        {rows.length} subjects · {presentCols.length} variables · {groups.length} group{groups.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <button className='dm-reload-btn' onClick={handleReload} disabled={reloading}>
                    ↻ {reloading ? 'Reloading…' : 'Reload'}
                </button>
            </div>

            {/* Panels */}
            {rows.length === 0 ? (
                <div className='dm-no-data'>No demographic data loaded.</div>
            ) : (
                <>
                    <div className='dm-grid'>
                        {panels.map(panel => (
                            <PanelCard
                                key={panel.id}
                                panel={panel}
                                ctx={ctx}
                                onChange={patch => updatePanel(panel.id, patch)}
                                onRemove={() => removePanel(panel.id)}
                            />
                        ))}
                    </div>

                    <div className='dm-add-wrap'>
                        <button className='dm-add-btn' onClick={addPanel}>+ Add Chart</button>
                    </div>
                </>
            )}

        </div>
    )
}

export default DemographicsDashboard
