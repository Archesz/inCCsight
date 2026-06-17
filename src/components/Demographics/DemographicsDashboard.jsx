import React, { useMemo, useState, useEffect, useCallback } from 'react'
import Plot from 'react-plotly.js'
import './DemographicsDashboard.scss'
import InfoTool from '../InfoTool/InfoTool'

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

const SECTIONS_KNOWN = [
    { id: 'demographics', title: 'Demographics',     cols: ['age', 'sex', 'ethnicity']                         },
    { id: 'clinical',     title: 'Clinical',          cols: ['diagnosis', 'disease_duration', 'medication']    },
    { id: 'acquisition',  title: 'Acquisition',       cols: ['scanner', 'field_strength', 'acquisition_date'] },
    { id: 'anthro',       title: 'Anthropometric',    cols: ['weight_kg', 'height_cm']                        },
]

const DEFAULT_ORDER = [
    'completeness', 'demographics', 'clinical', 'acquisition', 'anthro',
    'bmi', 'custom', 'dtiCorr', 'dtiScatter', 'dtiBox',
]

const SECTION_LABELS = {
    completeness: 'Data Completeness',
    demographics: 'Demographics',
    clinical:     'Clinical',
    acquisition:  'Acquisition',
    anthro:       'Anthropometric',
    bmi:          'Body Composition',
    custom:       'Custom Columns',
    dtiCorr:      'DTI Correlation',
    dtiScatter:   'Demographics × DTI',
    dtiBox:       'DTI by Category',
}

// Short help text shown in the (?) tooltip next to each section title
const SECTION_INFO = {
    completeness: 'How many subjects have a non-empty value for each variable, as a percentage. Helps spot columns with missing data.',
    demographics: 'Distribution of basic demographic variables (age, sex, ethnicity) across groups. Numeric variables use violin plots; categorical ones use bar charts. Click the colours in the legend to hide or show each group.',
    clinical:     'Distribution of clinical variables (diagnosis, disease duration, medication) across groups. Click the colours in the legend to hide or show each group.',
    acquisition:  'Distribution of acquisition variables (scanner, field strength, acquisition date) across groups. Click the colours in the legend to hide or show each group.',
    anthro:       'Distribution of anthropometric variables (weight, height) across groups. Click the colours in the legend to hide or show each group.',
    bmi:          'Weight vs. height scatter with BMI iso-lines (18.5 / 25 / 30). Each point is a subject; hover to read its BMI. Click the colours in the legend to hide or show each group.',
    custom:       'Charts for CSV columns not recognised automatically. Enable and pick a visualisation for each in the Customize panel.',
    dtiCorr:      'Pearson correlation between each numeric demographic variable and the DTI scalars (FA, MD, RD, AD), for the selected segmentation method. Blue = positive, red = negative.',
    dtiScatter:   'Scatter of a numeric demographic variable against the selected DTI scalar, with a linear fit and Pearson r. Click the colours in the legend to hide or show each group.',
    dtiBox:       'Distribution of the selected DTI scalar split by the categories of a demographic variable.',
}

// ── DTI cross-analysis ────────────────────────────────────────────────────────
const DTI_METHODS = [
    { key: 'ROQS_scalar',       label: 'ROQS' },
    { key: 'Watershed_scalar',  label: 'Watershed' },
    { key: 'santarosa_scalars', label: 'CNN' },
]
const DTI_SCALARS = ['FA', 'MD', 'RD', 'AD']

const STORAGE_KEY = 'inccsight.demographics.prefs'

const LAYOUT_BASE = {
    margin:        { t: 16, b: 52, l: 56, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor:  '#fafbff',
    legend:        { orientation: 'h', y: -0.38 },
    font:          { size: 12 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uniqueVals(rows, col) {
    return [...new Set(rows.map(r => r[col]).filter(v => v && v !== ''))].sort()
}

function autoDetectType(rows, col) {
    const vals = rows.map(r => r[col]).filter(v => v !== '' && v != null)
    if (!vals.length) return 'categorical'
    const nums = vals.filter(v => !isNaN(Number(v)))
    return nums.length / vals.length > 0.8 ? 'numeric' : 'categorical'
}

function autoVizType(rows, col) {
    return autoDetectType(rows, col) === 'numeric' ? 'violin' : 'bar'
}

function isFullWidth(col, rows) {
    if (col === 'acquisition_date') return true
    const meta = COL_META[col]
    if (meta?.type === 'categorical') return uniqueVals(rows, col).length > 5
    return false
}

function toNum(v) {
    if (v === '' || v == null) return NaN
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
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

// ── Mini stats bar below numeric charts ──────────────────────────────────────
function NumericStats({ rows, col, groups }) {
    const stats = groups.map((g, gi) => {
        const vals = rows
            .filter(r => r.group === g)
            .map(r => parseFloat(r[col]))
            .filter(v => !isNaN(v))
        return {
            group: g,
            color: GROUP_COLORS[gi % GROUP_COLORS.length],
            n: vals.length,
            mean: mean(vals),
            std: stdDev(vals),
            min: vals.length ? Math.min(...vals) : NaN,
            max: vals.length ? Math.max(...vals) : NaN,
        }
    })
    return (
        <div className='dm-stats-bar'>
            {stats.map(s => (
                <div key={s.group} className='dm-stats-item'>
                    <span className='dm-stats-dot' style={{ background: s.color }} />
                    <span className='dm-stats-group'>{s.group}</span>
                    <span className='dm-stats-val'>n={s.n}</span>
                    <span className='dm-stats-val'>{fmt(s.mean, 2)} ± {fmt(s.std, 2)}</span>
                    <span className='dm-stats-range'>[{fmt(s.min, 2)} – {fmt(s.max, 2)}]</span>
                </div>
            ))}
        </div>
    )
}

// ── Violin chart for numeric columns ─────────────────────────────────────────
function NumericChart({ rows, col, groups, unit }) {
    const multi = groups.length > 1
    const traces = groups.map((group, gi) => {
        const vals = rows.filter(r => r.group === group).map(r => parseFloat(r[col])).filter(v => !isNaN(v))
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type: 'violin', y: vals, name: group,
            box: { visible: true }, meanline: { visible: true },
            points: 'all', jitter: 0.35, pointpos: 0,
            marker: { color, opacity: 0.7, size: 5 },
            line: { color }, fillcolor: color + '33',
            showlegend: multi,
        }
    })
    if (traces.every(t => !t.y.length)) return <div className='dm-no-data'>No data available.</div>
    return (
        <>
            <Plot
                data={traces}
                layout={{
                    ...LAYOUT_BASE,
                    height: 280,
                    yaxis: { title: unit || '', gridcolor: '#eee', zeroline: false },
                    xaxis: { showgrid: false },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }} useResizeHandler
            />
            <NumericStats rows={rows} col={col} groups={groups} />
        </>
    )
}

// ── Bar chart for categorical columns ────────────────────────────────────────
function CategoricalChart({ rows, col, groups }) {
    const cats  = uniqueVals(rows, col)
    const multi = groups.length > 1
    if (!cats.length) return <div className='dm-no-data'>No data available.</div>
    const traces = groups.map((group, gi) => {
        const groupRows = rows.filter(r => r.group === group)
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return {
            type: 'bar', x: cats,
            y: cats.map(cat => groupRows.filter(r => r[col] === cat).length),
            name: group, marker: { color, opacity: 0.85 }, showlegend: multi,
        }
    })
    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE, barmode: 'group', height: 260,
                xaxis: { gridcolor: '#eee', automargin: true },
                yaxis: { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── Year histogram for date columns ──────────────────────────────────────────
function DateChart({ rows, col, groups }) {
    const multi = groups.length > 1
    const traces = groups.map((group, gi) => {
        const years = rows
            .filter(r => r.group === group)
            .map(r => { const d = new Date(r[col]); return isNaN(d.getTime()) ? null : d.getFullYear() })
            .filter(Boolean)
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        return { type: 'histogram', x: years, name: group, marker: { color, opacity: 0.8 }, showlegend: multi }
    })
    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE, barmode: 'group', height: 240,
                xaxis: { title: 'Year', gridcolor: '#eee', dtick: 1 },
                yaxis: { title: 'Count', gridcolor: '#eee', zeroline: false },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── Custom column chart (unknown CSV columns) ─────────────────────────────────
function CustomColChart({ rows, col, groups, vizType }) {
    const detectedType = autoDetectType(rows, col)
    if (vizType === 'violin' || (vizType === 'violin' && detectedType === 'numeric')) {
        return <NumericChart rows={rows} col={col} groups={groups} unit='' />
    }
    if (vizType === 'box') {
        const multi = groups.length > 1
        const traces = groups.map((g, gi) => {
            const vals = rows.filter(r => r.group === g).map(r => parseFloat(r[col])).filter(v => !isNaN(v))
            const color = GROUP_COLORS[gi % GROUP_COLORS.length]
            return { type: 'box', y: vals, name: g, boxmean: 'sd', boxpoints: 'all', jitter: 0.4, pointpos: 0, marker: { color, opacity: 0.8 }, showlegend: multi }
        })
        return (
            <>
                <Plot
                    data={traces}
                    layout={{ ...LAYOUT_BASE, height: 280, xaxis: { showgrid: false }, yaxis: { gridcolor: '#eee', zeroline: false } }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }} useResizeHandler
                />
                {detectedType === 'numeric' && <NumericStats rows={rows} col={col} groups={groups} />}
            </>
        )
    }
    if (vizType === 'histogram') {
        const multi = groups.length > 1
        const traces = groups.map((g, gi) => {
            const vals = rows.filter(r => r.group === g).map(r => r[col]).filter(v => v !== '' && v != null)
            const color = GROUP_COLORS[gi % GROUP_COLORS.length]
            return { type: 'histogram', x: vals, name: g, marker: { color, opacity: 0.8 }, showlegend: multi }
        })
        return (
            <Plot
                data={traces}
                layout={{ ...LAYOUT_BASE, barmode: 'group', height: 260, xaxis: { automargin: true }, yaxis: { title: 'Count', gridcolor: '#eee', zeroline: false } }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }} useResizeHandler
            />
        )
    }
    // Default: bar (categorical)
    return <CategoricalChart rows={rows} col={col} groups={groups} />
}

// ── BMI scatter ───────────────────────────────────────────────────────────────
function BmiScatter({ rows, groups }) {
    const traces = groups.map((group, gi) => {
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        const pts   = rows.filter(r => r.group === group).map(r => {
            const w = parseFloat(r.weight_kg), h = parseFloat(r.height_cm)
            if (isNaN(w) || isNaN(h) || h <= 0) return null
            return { h, w, bmi: w / ((h / 100) ** 2), id: r.subject_id || '' }
        }).filter(Boolean)
        return {
            type: 'scatter', mode: 'markers', name: group,
            x: pts.map(p => p.h), y: pts.map(p => p.w),
            text: pts.map(p => `${p.id}<br>BMI: ${p.bmi.toFixed(1)}`),
            hoverinfo: 'text', marker: { color, size: 8, opacity: 0.75 },
        }
    })
    ;[{ bmi: 18.5, label: 'BMI 18.5', color: '#74b9ff' }, { bmi: 25, label: 'BMI 25', color: '#fdcb6e' }, { bmi: 30, label: 'BMI 30', color: '#e17055' }].forEach(({ bmi, label, color }) => {
        const H = [140, 210]
        traces.push({ type: 'scatter', mode: 'lines', name: label, x: H, y: H.map(h => bmi * ((h / 100) ** 2)), line: { color, dash: 'dot', width: 1.5 }, hoverinfo: 'name' })
    })
    return (
        <Plot
            data={traces}
            layout={{ ...LAYOUT_BASE, height: 340, legend: { orientation: 'h', y: -0.28 }, xaxis: { title: 'Height (cm)', gridcolor: '#eee', zeroline: false }, yaxis: { title: 'Weight (kg)', gridcolor: '#eee', zeroline: false } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }} useResizeHandler
        />
    )
}

// ── Section wrapper with collapse toggle ─────────────────────────────────────
function SectionCard({ title, info, accent, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className='dm-section-card' style={{ '--accent': accent }}>
            <div className='dm-section-card-header' onClick={() => setOpen(v => !v)}>
                <span className='dm-section-card-title'>
                    {title}
                    {info && <InfoTool text={info} />}
                </span>
                <span className='dm-section-card-arrow'>{open ? '▾' : '▸'}</span>
            </div>
            {open && <div className='dm-section-card-body'>{children}</div>}
        </div>
    )
}

const ACCENT_COLORS = {
    completeness: '#4C6EF5',
    demographics: '#00C896',
    clinical:     '#EF553B',
    acquisition:  '#AB63FA',
    anthro:       '#FFA15A',
    bmi:          '#19D3F3',
    custom:       '#636EFA',
    dtiCorr:      '#f472b6',
    dtiScatter:   '#34d399',
    dtiBox:       '#fb923c',
}

// ── Main component ────────────────────────────────────────────────────────────
function DemographicsDashboard({ rows, presentCols, subjects = [], onReload }) {
    const [showCustomize, setShowCustomize] = useState(false)
    const [reloading,     setReloading]     = useState(false)
    const [dtiMethod,     setDtiMethod]     = useState('ROQS_scalar')
    const [dtiScalar,     setDtiScalar]     = useState('FA')
    const [scatterVarSel, setScatterVarSel] = useState(null)
    const [boxVarSel,     setBoxVarSel]     = useState(null)

    // Prefs: sections toggle, display order, custom column configs
    const [prefs, setPrefs] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) return { sections: {}, order: [], customCols: {}, ...JSON.parse(raw) }
        } catch (_) {}
        return { sections: {}, order: [], customCols: {} }
    })
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch (_) {}
    }, [prefs])

    // Section order — stored order + any default keys not yet in it
    const sectionOrder = useMemo(() => {
        const stored = prefs.order || []
        return [...stored, ...DEFAULT_ORDER.filter(k => !stored.includes(k))]
    }, [prefs.order])

    const moveSection = useCallback((key, dir) => {
        setPrefs(p => {
            const order = [...sectionOrder]
            const idx = order.indexOf(key)
            if (idx < 0) return p
            const ni = idx + dir
            if (ni < 0 || ni >= order.length) return p
            ;[order[idx], order[ni]] = [order[ni], order[idx]]
            return { ...p, order }
        })
    }, [sectionOrder])

    const sectionOn  = key => prefs.sections[key] !== false
    const toggleSection = key => setPrefs(p => ({
        ...p, sections: { ...p.sections, [key]: p.sections[key] === false },
    }))

    // Unknown columns
    const unknownCols = useMemo(
        () => presentCols.filter(c => !COL_META[c]),
        [presentCols]
    )
    const getCustomCfg = col => prefs.customCols?.[col] ?? { enabled: false, vizType: autoVizType(rows, col) }
    const setCustomCfg = (col, patch) => setPrefs(p => ({
        ...p, customCols: { ...(p.customCols || {}), [col]: { ...getCustomCfg(col), ...patch } },
    }))

    function handleReload() {
        setReloading(true)
        Promise.resolve(onReload?.()).finally(() => setReloading(false))
    }

    const groups = useMemo(() => [...new Set(rows.map(r => r.group).filter(Boolean))], [rows])
    const n = rows.length

    const completeness = useMemo(() => presentCols.map(col => {
        const present = rows.filter(r => r[col] !== undefined && r[col] !== '').length
        return { col, present, total: n, pct: n ? Math.round(present / n * 100) : 0 }
    }), [rows, presentCols, n])

    const avgCompleteness = completeness.length
        ? Math.round(completeness.reduce((s, c) => s + c.pct, 0) / completeness.length) : 0

    const hasBmi = presentCols.includes('weight_kg') && presentCols.includes('height_cm')

    // Cross-DTI
    const matched = useMemo(() => {
        if (!subjects?.length) return []
        const byId = new Map(subjects.map(s => [String(s.Id), s]))
        return rows.map(r => ({ row: r, subject: byId.get(String(r.subject_id ?? '').trim()) })).filter(m => m.subject)
    }, [rows, subjects])

    const dtiNumericBase    = presentCols.filter(c => COL_META[c]?.type === 'numeric')
    const dtiNumericCols    = hasBmi ? [...dtiNumericBase, '_bmi'] : dtiNumericBase
    const dtiCategoricalCols = presentCols.filter(c => COL_META[c]?.type === 'categorical')
    const colLabel = c => c === '_bmi' ? 'BMI (derived)' : (COL_META[c]?.label || c)
    const getNumeric = (row, col) => {
        if (col === '_bmi') { const w = parseFloat(row.weight_kg), h = parseFloat(row.height_cm); return (isNaN(w) || isNaN(h) || h <= 0) ? NaN : w / ((h / 100) ** 2) }
        return toNum(row[col])
    }
    const dtiValue = sub => { const v = sub?.[dtiMethod]?.[dtiScalar]; return typeof v === 'number' ? v : toNum(v) }
    const dtiMethodLabel = DTI_METHODS.find(m => m.key === dtiMethod)?.label || dtiMethod

    const scatterVar = (scatterVarSel && dtiNumericCols.includes(scatterVarSel)) ? scatterVarSel : (dtiNumericCols[0] ?? null)
    const boxVar     = (boxVarSel && dtiCategoricalCols.includes(boxVarSel))     ? boxVarSel     : (dtiCategoricalCols[0] ?? null)

    const corrMatrix = dtiNumericCols.map(dc =>
        DTI_SCALARS.map(sc => pearson(
            matched.map(m => [getNumeric(m.row, dc), m.subject?.[dtiMethod]?.[sc] ?? toNum(m.subject?.[dtiMethod]?.[sc])])
                   .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        ))
    )

    const scatterPairs = scatterVar
        ? matched.map(m => ({ x: getNumeric(m.row, scatterVar), y: dtiValue(m.subject), id: m.row.subject_id || m.subject.Id, group: m.row.group || m.subject.group || '—' })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        : []
    const scatterFit    = linfit(scatterPairs.map(p => [p.x, p.y]))
    const scatterR      = pearson(scatterPairs.map(p => [p.x, p.y]))
    const scatterGroups = [...new Set(scatterPairs.map(p => p.group))]

    const boxCats = boxVar ? [...new Set(matched.map(m => String(m.row[boxVar] ?? '').trim()).filter(v => v !== ''))] : []
    const showDtiControls = matched.length > 0 && (sectionOn('dtiCorr') || sectionOn('dtiScatter') || sectionOn('dtiBox'))

    // ── Render a known chart ──────────────────────────────────────────────────
    function renderKnownChart(col) {
        const meta = COL_META[col]
        if (!meta) return null
        if (meta.type === 'numeric')     return <NumericChart     rows={rows} col={col} groups={groups} unit={meta.unit} />
        if (meta.type === 'categorical') return <CategoricalChart rows={rows} col={col} groups={groups} />
        if (meta.type === 'date')        return <DateChart        rows={rows} col={col} groups={groups} />
        return null
    }

    // ── Render a section by key ───────────────────────────────────────────────
    function renderSection(key) {
        if (!sectionOn(key)) return null
        const accent = ACCENT_COLORS[key] || '#4C6EF5'

        // ── Known chart sections ────────────────────────────────────────────
        const known = SECTIONS_KNOWN.find(s => s.id === key)
        if (known) {
            const activeCols = known.cols.filter(c => presentCols.includes(c))
            if (!activeCols.length) return null
            return (
                <SectionCard key={key} title={known.title} info={SECTION_INFO[key]} accent={accent}>
                    <div className='dm-charts-grid'>
                        {activeCols.map(col => {
                            const meta = COL_META[col]
                            const full = isFullWidth(col, rows) || activeCols.length === 1
                            return (
                                <div key={col} className={`dm-chart-card${full ? ' dm-chart-card--full' : ''}`}>
                                    <span className='dm-chart-title'>
                                        {meta?.label || col}
                                        {meta?.unit && <span className='dm-chart-unit'> ({meta.unit})</span>}
                                    </span>
                                    {renderKnownChart(col)}
                                </div>
                            )
                        })}
                    </div>
                </SectionCard>
            )
        }

        // ── Special sections ────────────────────────────────────────────────
        if (key === 'completeness') {
            return (
                <SectionCard key='completeness' title='Data Completeness' info={SECTION_INFO.completeness} accent={accent}>
                    <div className='dm-completeness-grid'>
                        {completeness.map(({ col, present, total, pct }) => (
                            <div key={col} className='dm-completeness-row'>
                                <span className='dm-col-label'>{COL_META[col]?.label || col}</span>
                                <div className='dm-bar-track'>
                                    <div className='dm-bar-fill' style={{
                                        width: `${pct}%`,
                                        background: pct >= 80 ? '#4C6EF5' : pct >= 50 ? '#FFA15A' : '#EF553B',
                                    }} />
                                </div>
                                <span className='dm-col-pct' style={{ color: pct >= 80 ? '#4C6EF5' : pct >= 50 ? '#FFA15A' : '#EF553B' }}>{pct}%</span>
                                <span className='dm-col-count'>{present}/{total}</span>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )
        }

        if (key === 'bmi' && hasBmi) {
            return (
                <SectionCard key='bmi' title='Body Composition' info={SECTION_INFO.bmi} accent={accent}>
                    <div className='dm-charts-grid'>
                        <div className='dm-chart-card dm-chart-card--full'>
                            <span className='dm-chart-title'>Weight × Height with BMI iso-lines</span>
                            <BmiScatter rows={rows} groups={groups} />
                        </div>
                    </div>
                </SectionCard>
            )
        }

        if (key === 'custom') {
            const enabledCols = unknownCols.filter(c => getCustomCfg(c).enabled)
            if (!enabledCols.length) return null
            return (
                <SectionCard key='custom' title='Custom Columns' info={SECTION_INFO.custom} accent={accent}>
                    <div className='dm-charts-grid'>
                        {enabledCols.map(col => {
                            const cfg = getCustomCfg(col)
                            return (
                                <div key={col} className='dm-chart-card'>
                                    <span className='dm-chart-title'>{col}</span>
                                    <CustomColChart rows={rows} col={col} groups={groups} vizType={cfg.vizType} />
                                </div>
                            )
                        })}
                    </div>
                </SectionCard>
            )
        }

        if (key === 'dtiCorr' && matched.length >= 2 && dtiNumericCols.length > 0) {
            return (
                <SectionCard key='dtiCorr' title={`Correlation — Demographics × DTI (${dtiMethodLabel})`} info={SECTION_INFO.dtiCorr} accent={accent}>
                    <div className='dm-chart-card dm-chart-card--full'>
                        <Plot
                            data={[{ type: 'heatmap', z: corrMatrix, x: DTI_SCALARS, y: dtiNumericCols.map(colLabel), zmin: -1, zmax: 1, colorscale: 'RdBu', reversescale: true, text: corrMatrix.map(row => row.map(v => fmt(v, 2))), texttemplate: '%{text}', textfont: { size: 11 } }]}
                            layout={{ ...LAYOUT_BASE, height: 90 + dtiNumericCols.length * 44, margin: { t: 10, b: 50, l: 150, r: 30 }, xaxis: { side: 'bottom' }, yaxis: { automargin: true } }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', maxWidth: 680 }} useResizeHandler
                        />
                    </div>
                </SectionCard>
            )
        }

        if (key === 'dtiScatter' && matched.length > 0 && dtiNumericCols.length > 0) {
            return (
                <SectionCard key='dtiScatter' title={`Demographics × ${dtiScalar} (${dtiMethodLabel})`} info={SECTION_INFO.dtiScatter} accent={accent}>
                    <div className='dm-section-head' style={{ padding: '0 0 12px' }}>
                        <select className='dm-select' value={scatterVar || ''} onChange={e => setScatterVarSel(e.target.value)}>
                            {dtiNumericCols.map(c => <option key={c} value={c}>{colLabel(c)}</option>)}
                        </select>
                    </div>
                    {scatterPairs.length >= 2 ? (
                        <div className='dm-chart-card dm-chart-card--full'>
                            <Plot
                                data={[
                                    ...scatterGroups.map((g, gi) => {
                                        const pts = scatterPairs.filter(p => p.group === g)
                                        return { type: 'scatter', mode: 'markers', name: g, x: pts.map(p => p.x), y: pts.map(p => p.y), text: pts.map(p => p.id), marker: { size: 9, color: GROUP_COLORS[gi % GROUP_COLORS.length], opacity: 0.85 } }
                                    }),
                                    ...(scatterFit ? [{ type: 'scatter', mode: 'lines', name: 'linear fit', x: [Math.min(...scatterPairs.map(p => p.x)), Math.max(...scatterPairs.map(p => p.x))], y: [Math.min(...scatterPairs.map(p => p.x)), Math.max(...scatterPairs.map(p => p.x))].map(x => scatterFit.a * x + scatterFit.b), line: { color: '#1F2C56', dash: 'dash', width: 2 }, hoverinfo: 'skip' }] : []),
                                ]}
                                layout={{ ...LAYOUT_BASE, height: 360, margin: { t: 16, b: 56, l: 60, r: 16 }, xaxis: { title: colLabel(scatterVar), gridcolor: '#eee' }, yaxis: { title: `${dtiScalar} (${dtiMethodLabel})`, gridcolor: '#eee' }, showlegend: scatterGroups.length > 1, legend: { orientation: 'h', y: -0.18 } }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }} useResizeHandler
                            />
                            <div className='dm-scatter-stats'>
                                <span>n = {scatterPairs.length}</span>
                                <span>Pearson r = {fmt(scatterR, 3)}</span>
                                {scatterFit && <span>slope = {fmt(scatterFit.a, 4)}</span>}
                            </div>
                        </div>
                    ) : (
                        <div className='dm-no-data'>Not enough matched subjects with both values.</div>
                    )}
                </SectionCard>
            )
        }

        if (key === 'dtiBox' && matched.length > 0 && dtiCategoricalCols.length > 0) {
            return (
                <SectionCard key='dtiBox' title={`${dtiScalar} (${dtiMethodLabel}) by Category`} info={SECTION_INFO.dtiBox} accent={accent}>
                    <div className='dm-section-head' style={{ padding: '0 0 12px' }}>
                        <select className='dm-select' value={boxVar || ''} onChange={e => setBoxVarSel(e.target.value)}>
                            {dtiCategoricalCols.map(c => <option key={c} value={c}>{colLabel(c)}</option>)}
                        </select>
                    </div>
                    {boxCats.length > 0 ? (
                        <div className='dm-chart-card dm-chart-card--full'>
                            <Plot
                                data={boxCats.map((cat, ci) => {
                                    const ys = matched.filter(m => String(m.row[boxVar] ?? '').trim() === cat).map(m => dtiValue(m.subject)).filter(Number.isFinite)
                                    return { type: 'box', name: cat, y: ys, boxmean: 'sd', boxpoints: 'all', jitter: 0.4, pointpos: 0, marker: { color: GROUP_COLORS[ci % GROUP_COLORS.length] } }
                                })}
                                layout={{ ...LAYOUT_BASE, height: 340, margin: { t: 16, b: 50, l: 60, r: 16 }, xaxis: { title: colLabel(boxVar) }, yaxis: { title: `${dtiScalar} (${dtiMethodLabel})`, gridcolor: '#eee' }, showlegend: false }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }} useResizeHandler
                            />
                        </div>
                    ) : (
                        <div className='dm-no-data'>No matched subjects have this category filled in.</div>
                    )}
                </SectionCard>
            )
        }

        return null
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    return (
        <div className='dm-container'>

            {/* Header */}
            <div className='dm-header'>
                <div className='dm-header-left'>
                    <span className='dm-title'>Demographics</span>
                    <span className='dm-subtitle'>{n} subjects · {presentCols.length} variables · {groups.length} group{groups.length !== 1 ? 's' : ''}</span>
                </div>
                <div className='dm-header-actions'>
                    <button className={`dm-action-btn${showCustomize ? ' active' : ''}`} onClick={() => setShowCustomize(v => !v)}>
                        ⚙ Customize
                    </button>
                    <button className='dm-action-btn' onClick={handleReload} disabled={reloading}>
                        ↻ {reloading ? 'Reloading…' : 'Reload'}
                    </button>
                </div>
            </div>

            {/* Customize panel */}
            {showCustomize && (
                <div className='dm-customize-panel'>
                    <div className='dm-customize-col'>
                        <span className='dm-customize-group-title'>Sections</span>
                        <div className='dm-section-list'>
                            {sectionOrder.map((key, idx) => (
                                <div key={key} className={`dm-section-row${sectionOn(key) ? ' on' : ''}`}>
                                    <div className='dm-reorder-btns'>
                                        <button className='dm-reorder-btn' onClick={() => moveSection(key, -1)} disabled={idx === 0} title='Move up'>↑</button>
                                        <button className='dm-reorder-btn' onClick={() => moveSection(key, 1)} disabled={idx === sectionOrder.length - 1} title='Move down'>↓</button>
                                    </div>
                                    <button className={`dm-section-toggle-btn${sectionOn(key) ? ' on' : ''}`} onClick={() => toggleSection(key)}>
                                        <span className='dm-toggle-dot' />
                                        {SECTION_LABELS[key] || key}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {unknownCols.length > 0 && (
                        <div className='dm-customize-col'>
                            <span className='dm-customize-group-title'>Custom Columns
                                <span className='dm-customize-hint'>columns not recognized — configure below</span>
                            </span>
                            <div className='dm-custom-cols-list'>
                                {unknownCols.map(col => {
                                    const cfg = getCustomCfg(col)
                                    return (
                                        <div key={col} className={`dm-custom-col-row${cfg.enabled ? ' on' : ''}`}>
                                            <button className={`dm-section-toggle-btn${cfg.enabled ? ' on' : ''}`} onClick={() => setCustomCfg(col, { enabled: !cfg.enabled })}>
                                                <span className='dm-toggle-dot' />
                                                <code className='dm-col-code'>{col}</code>
                                            </button>
                                            {cfg.enabled && (
                                                <div className='dm-viz-selector'>
                                                    <span className='dm-viz-label'>Viz:</span>
                                                    {['violin', 'box', 'bar', 'histogram'].map(vt => (
                                                        <button
                                                            key={vt}
                                                            className={`dm-viz-pill${cfg.vizType === vt ? ' active' : ''}`}
                                                            onClick={() => setCustomCfg(col, { vizType: vt })}
                                                        >{vt}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* KPI Row */}
            <div className='dm-kpi-row'>
                {[
                    { val: n,                   label: 'Subjects',           accent: '#4C6EF5', icon: '👥' },
                    { val: groups.length,        label: 'Groups',             accent: '#00C896', icon: '⬡'  },
                    { val: presentCols.length,   label: 'Variables',          accent: '#AB63FA', icon: '⚙'  },
                    { val: `${avgCompleteness}%`, label: 'Avg Completeness',   accent: avgCompleteness >= 80 ? '#4C6EF5' : avgCompleteness >= 50 ? '#FFA15A' : '#EF553B', icon: '✓' },
                ].map(({ val, label, accent, icon }) => (
                    <div key={label} className='dm-kpi-card' style={{ '--kpi-accent': accent }}>
                        <span className='dm-kpi-icon'>{icon}</span>
                        <span className='dm-kpi-val'>{val}</span>
                        <span className='dm-kpi-label'>{label}</span>
                    </div>
                ))}
            </div>

            {/* Subjects per group */}
            {groups.length > 0 && (
                <div className='dm-group-cards-block'>
                    <span className='dm-group-cards-title'>Subjects per group</span>
                    <div className='dm-group-cards'>
                        {groups.map((g, i) => {
                            const accent = GROUP_COLORS[i % GROUP_COLORS.length]
                            const count  = rows.filter(r => r.group === g).length
                            return (
                                <div key={g} className='dm-group-card' style={{ '--group-accent': accent }}>
                                    <span className='dm-group-card-dot' style={{ background: accent }} />
                                    <span className='dm-group-card-count'>{count}</span>
                                    <span className='dm-group-card-name' title={g}>{g}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

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

            {/* DTI shared controls */}
            {showDtiControls && (
                <div className='dm-dti-controls'>
                    <div className='dm-picker'>
                        <label>DTI Method</label>
                        <div className='dm-pills'>
                            {DTI_METHODS.map(m => <button key={m.key} className={`dm-pill${dtiMethod === m.key ? ' active' : ''}`} onClick={() => setDtiMethod(m.key)}>{m.label}</button>)}
                        </div>
                    </div>
                    <div className='dm-picker'>
                        <label>Scalar</label>
                        <div className='dm-pills'>
                            {DTI_SCALARS.map(s => <button key={s} className={`dm-pill${dtiScalar === s ? ' active' : ''}`} onClick={() => setDtiScalar(s)}>{s}</button>)}
                        </div>
                    </div>
                    <span className='dm-matched-count'>{matched.length} of {rows.length} matched</span>
                </div>
            )}

            {/* Cross-DTI no-match warning */}
            {subjects.length > 0 && rows.length > 0 && matched.length === 0 &&
             (sectionOn('dtiCorr') || sectionOn('dtiScatter') || sectionOn('dtiBox')) && (
                <div className='dm-no-data'>
                    Cross-DTI sections need a <code>subject_id</code> column in demograph.csv matching the analyzed subjects.
                </div>
            )}

            {/* Sections in user-defined order */}
            {sectionOrder.map(key => renderSection(key))}

        </div>
    )
}

export default DemographicsDashboard
