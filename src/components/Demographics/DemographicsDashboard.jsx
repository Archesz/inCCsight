import React, { useMemo, useState, useEffect } from 'react'
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

// ── DTI cross-analysis configuration ─────────────────────────────────────────

const DTI_METHODS = [
    { key: 'ROQS_scalar',       label: 'ROQS' },
    { key: 'Watershed_scalar',  label: 'Watershed' },
    { key: 'santarosa_scalars', label: 'CNN' },
]
const DTI_SCALARS = ['FA', 'MD', 'RD', 'AD']

// Seções que podem ser ligadas/desligadas pelo painel de personalização
const TOGGLABLE_SECTIONS = [
    { key: 'completeness', label: 'Data Completeness' },
    { key: 'demographics', label: 'Demographics' },
    { key: 'clinical',     label: 'Clinical' },
    { key: 'acquisition',  label: 'Acquisition' },
    { key: 'anthro',       label: 'Anthropometric' },
    { key: 'bmi',          label: 'Body Composition' },
    { key: 'dtiCorr',      label: 'DTI Correlation' },
    { key: 'dtiScatter',   label: 'Demographics × DTI' },
    { key: 'dtiBox',       label: 'DTI by Category' },
]
const STORAGE_KEY = 'inccsight.demographics.prefs'

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

// ── Stats helpers (used by cross-DTI sections) ───────────────────────────────

function toNum(v) {
    if (v === '' || v == null) return NaN
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN }
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

function DemographicsDashboard({ rows, presentCols, subjects = [], onReload }) {
    const [reloading,      setReloading]      = useState(false)
    const [showCustomize,  setShowCustomize]  = useState(false)
    const [dtiMethod,      setDtiMethod]      = useState('ROQS_scalar')
    const [dtiScalar,      setDtiScalar]      = useState('FA')
    const [scatterVarSel,  setScatterVarSel]  = useState(null)
    const [boxVarSel,      setBoxVarSel]      = useState(null)

    // ── Preferências persistidas (toggles de seção) ─────────────────────────
    const [prefs, setPrefs] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) return { sections: {}, ...JSON.parse(raw) }
        } catch (_) { /* ignora */ }
        return { sections: {} }
    })
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch (_) { /* ignora */ }
    }, [prefs])

    const sectionOn = key => prefs.sections[key] !== false
    const toggleSection = key =>
        setPrefs(p => ({ ...p, sections: { ...p.sections, [key]: p.sections[key] === false } }))

    function handleReload() {
        setReloading(true)
        Promise.resolve(onReload?.()).finally(() => setReloading(false))
    }
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

    // ── Cross-DTI: casa linhas demográficas com sujeitos (subject_id ↔ Id) ──
    const matched = useMemo(() => {
        if (!subjects?.length) return []
        const byId = new Map(subjects.map(s => [String(s.Id), s]))
        return rows
            .map(r => ({ row: r, subject: byId.get(String(r.subject_id ?? '').trim()) }))
            .filter(m => m.subject)
    }, [rows, subjects])

    // colunas numéricas/categóricas disponíveis para cross-DTI (entre as presentCols)
    const dtiNumericBase = presentCols.filter(c => COL_META[c]?.type === 'numeric')
    const dtiNumericCols = hasBmi ? [...dtiNumericBase, '_bmi'] : dtiNumericBase
    const dtiCategoricalCols = presentCols.filter(c => COL_META[c]?.type === 'categorical')

    const colLabel = c => c === '_bmi' ? 'BMI (derived)' : (COL_META[c]?.label || c)
    const getNumeric = (row, col) => {
        if (col === '_bmi') {
            const w = parseFloat(row.weight_kg), h = parseFloat(row.height_cm)
            if (isNaN(w) || isNaN(h) || h <= 0) return NaN
            return w / ((h / 100) ** 2)
        }
        return toNum(row[col])
    }
    const dtiValue = subject => {
        const v = subject?.[dtiMethod]?.[dtiScalar]
        return typeof v === 'number' ? v : toNum(v)
    }
    const dtiMethodLabel = DTI_METHODS.find(m => m.key === dtiMethod)?.label || dtiMethod

    const scatterVar = (scatterVarSel && dtiNumericCols.includes(scatterVarSel))
        ? scatterVarSel : (dtiNumericCols[0] ?? null)
    const boxVar = (boxVarSel && dtiCategoricalCols.includes(boxVarSel))
        ? boxVarSel : (dtiCategoricalCols[0] ?? null)

    // matriz de correlação demografia × DTI (rows = demo numeric; cols = FA/MD/RD/AD)
    const corrMatrix = dtiNumericCols.map(dc =>
        DTI_SCALARS.map(sc => {
            const pairs = matched
                .map(m => {
                    const x = getNumeric(m.row, dc)
                    const yv = m.subject?.[dtiMethod]?.[sc]
                    const y = typeof yv === 'number' ? yv : toNum(yv)
                    return [x, y]
                })
                .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
            return pearson(pairs)
        })
    )

    // scatter (demo numeric × dtiScalar)
    const scatterPairs = scatterVar
        ? matched
            .map(m => ({
                x: getNumeric(m.row, scatterVar),
                y: dtiValue(m.subject),
                id: m.row.subject_id || m.subject.Id,
                group: m.row.group || m.subject.group || '—',
            }))
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        : []
    const scatterFit    = linfit(scatterPairs.map(p => [p.x, p.y]))
    const scatterR      = pearson(scatterPairs.map(p => [p.x, p.y]))
    const scatterGroups = [...new Set(scatterPairs.map(p => p.group))]

    // boxplot DTI por categoria
    const boxCats = boxVar
        ? [...new Set(matched.map(m => String(m.row[boxVar] ?? '').trim()).filter(v => v !== ''))]
        : []

    const showDtiControls = matched.length > 0 &&
        (sectionOn('dtiCorr') || sectionOn('dtiScatter') || sectionOn('dtiBox'))

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

            {/* Header */}
            <div className='dm-header'>
                <span className='dm-title'>Demographics</span>
                <div className='dm-header-actions'>
                    <button
                        className='dm-reload-btn'
                        onClick={() => setShowCustomize(v => !v)}
                        title='Customize visible sections'
                    >
                        {showCustomize ? '▾' : '▸'} Customize
                    </button>
                    <button
                        className='dm-reload-btn'
                        onClick={handleReload}
                        title='Reload demograph.csv'
                        disabled={reloading}
                    >
                        ↻ {reloading ? 'Reloading…' : 'Reload'}
                    </button>
                </div>
            </div>

            {/* Customize panel */}
            {showCustomize && (
                <div className='dm-customize'>
                    <span className='dm-customize-label'>Visible sections</span>
                    <div className='dm-chips'>
                        {TOGGLABLE_SECTIONS.map(s => (
                            <button
                                key={s.key}
                                className={`dm-chip${sectionOn(s.key) ? ' on' : ''}`}
                                onClick={() => toggleSection(s.key)}
                            >{s.label}</button>
                        ))}
                    </div>
                </div>
            )}

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
            {sectionOn('completeness') && (
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
            )}

            {/* Chart sections */}
            {SECTIONS.map(section => {
                if (!sectionOn(section.id)) return null
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
            {sectionOn('bmi') && hasBmi && (
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

            {/* ── DTI cross-analysis ─────────────────────────────────────── */}

            {/* Aviso quando há sujeitos mas nenhuma linha casa por subject_id */}
            {subjects.length > 0 && rows.length > 0 && matched.length === 0 &&
             (sectionOn('dtiCorr') || sectionOn('dtiScatter') || sectionOn('dtiBox')) && (
                <div className='dm-section'>
                    <div className='dm-no-data'>
                        Cross-DTI sections need a <code>subject_id</code> column in
                        demograph.csv matching the analyzed subjects (exact match).
                    </div>
                </div>
            )}

            {/* Controles compartilhados (método + escalar DTI) */}
            {showDtiControls && (
                <div className='dm-dti-controls'>
                    <div className='dm-picker'>
                        <label>DTI Method</label>
                        <div className='dm-pills'>
                            {DTI_METHODS.map(m => (
                                <button
                                    key={m.key}
                                    className={`dm-pill${dtiMethod === m.key ? ' active' : ''}`}
                                    onClick={() => setDtiMethod(m.key)}
                                >{m.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className='dm-picker'>
                        <label>Scalar</label>
                        <div className='dm-pills'>
                            {DTI_SCALARS.map(s => (
                                <button
                                    key={s}
                                    className={`dm-pill${dtiScalar === s ? ' active' : ''}`}
                                    onClick={() => setDtiScalar(s)}
                                >{s}</button>
                            ))}
                        </div>
                    </div>
                    <span className='dm-matched-count'>
                        {matched.length} of {rows.length} matched to a subject
                    </span>
                </div>
            )}

            {/* DTI Correlation heatmap */}
            {sectionOn('dtiCorr') && matched.length >= 2 && dtiNumericCols.length > 0 && (
                <div className='dm-section'>
                    <span className='dm-section-title'>
                        Correlation — Demographics × DTI ({dtiMethodLabel})
                    </span>
                    <div className='dm-chart-card dm-chart-card--full'>
                        <Plot
                            data={[{
                                type: 'heatmap',
                                z: corrMatrix,
                                x: DTI_SCALARS,
                                y: dtiNumericCols.map(colLabel),
                                zmin: -1, zmax: 1, colorscale: 'RdBu', reversescale: true,
                                hoverongaps: false,
                                text: corrMatrix.map(row => row.map(v => fmt(v, 2))),
                                texttemplate: '%{text}', textfont: { size: 11 },
                            }]}
                            layout={{
                                ...LAYOUT_BASE,
                                height: 90 + dtiNumericCols.length * 44,
                                margin: { t: 10, b: 50, l: 150, r: 30 },
                                xaxis:  { side: 'bottom' },
                                yaxis:  { automargin: true },
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', maxWidth: 680 }}
                            useResizeHandler
                        />
                    </div>
                </div>
            )}

            {/* Scatter: variável numérica × escalar DTI */}
            {sectionOn('dtiScatter') && matched.length > 0 && dtiNumericCols.length > 0 && (
                <div className='dm-section'>
                    <div className='dm-section-head'>
                        <span className='dm-section-title'>
                            Demographics × {dtiScalar} ({dtiMethodLabel})
                        </span>
                        <select
                            className='dm-select'
                            value={scatterVar || ''}
                            onChange={e => setScatterVarSel(e.target.value)}
                        >
                            {dtiNumericCols.map(c => (
                                <option key={c} value={c}>{colLabel(c)}</option>
                            ))}
                        </select>
                    </div>
                    {scatterPairs.length >= 2 ? (
                        <div className='dm-chart-card dm-chart-card--full'>
                            <Plot
                                data={[
                                    ...scatterGroups.map((g, gi) => {
                                        const pts = scatterPairs.filter(p => p.group === g)
                                        return {
                                            type: 'scatter', mode: 'markers', name: g,
                                            x: pts.map(p => p.x), y: pts.map(p => p.y),
                                            text: pts.map(p => p.id),
                                            marker: { size: 9, color: GROUP_COLORS[gi % GROUP_COLORS.length], opacity: 0.85 },
                                        }
                                    }),
                                    ...(scatterFit ? [{
                                        type: 'scatter', mode: 'lines', name: 'linear fit',
                                        x: [Math.min(...scatterPairs.map(p => p.x)), Math.max(...scatterPairs.map(p => p.x))],
                                        y: [Math.min(...scatterPairs.map(p => p.x)), Math.max(...scatterPairs.map(p => p.x))]
                                            .map(x => scatterFit.a * x + scatterFit.b),
                                        line: { color: '#1F2C56', dash: 'dash', width: 2 },
                                        hoverinfo: 'skip',
                                    }] : []),
                                ]}
                                layout={{
                                    ...LAYOUT_BASE,
                                    height: 360, margin: { t: 16, b: 56, l: 60, r: 16 },
                                    xaxis: { title: colLabel(scatterVar), gridcolor: '#eee' },
                                    yaxis: { title: `${dtiScalar} (${dtiMethodLabel})`, gridcolor: '#eee' },
                                    showlegend: scatterGroups.length > 1,
                                    legend: { orientation: 'h', y: -0.18 },
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }}
                                useResizeHandler
                            />
                            <div className='dm-scatter-stats'>
                                <span>n {scatterPairs.length}</span>
                                <span>Pearson r {fmt(scatterR, 3)}</span>
                                {scatterFit && <span>slope {fmt(scatterFit.a, 4)}</span>}
                            </div>
                        </div>
                    ) : (
                        <div className='dm-no-data'>Not enough matched subjects with both values.</div>
                    )}
                </div>
            )}

            {/* Boxplot: escalar DTI por categoria */}
            {sectionOn('dtiBox') && matched.length > 0 && dtiCategoricalCols.length > 0 && (
                <div className='dm-section'>
                    <div className='dm-section-head'>
                        <span className='dm-section-title'>
                            {dtiScalar} ({dtiMethodLabel}) by Category
                        </span>
                        <select
                            className='dm-select'
                            value={boxVar || ''}
                            onChange={e => setBoxVarSel(e.target.value)}
                        >
                            {dtiCategoricalCols.map(c => (
                                <option key={c} value={c}>{colLabel(c)}</option>
                            ))}
                        </select>
                    </div>
                    {boxCats.length > 0 ? (
                        <div className='dm-chart-card dm-chart-card--full'>
                            <Plot
                                data={boxCats.map((cat, ci) => {
                                    const ys = matched
                                        .filter(m => String(m.row[boxVar] ?? '').trim() === cat)
                                        .map(m => dtiValue(m.subject))
                                        .filter(Number.isFinite)
                                    return {
                                        type: 'box', name: cat, y: ys, boxmean: 'sd',
                                        boxpoints: 'all', jitter: 0.4, pointpos: 0,
                                        marker: { color: GROUP_COLORS[ci % GROUP_COLORS.length] },
                                    }
                                })}
                                layout={{
                                    ...LAYOUT_BASE,
                                    height: 340, margin: { t: 16, b: 50, l: 60, r: 16 },
                                    xaxis: { title: colLabel(boxVar) },
                                    yaxis: { title: `${dtiScalar} (${dtiMethodLabel})`, gridcolor: '#eee' },
                                    showlegend: false,
                                }}
                                config={{ displayModeBar: false, responsive: true }}
                                style={{ width: '100%' }}
                                useResizeHandler
                            />
                        </div>
                    ) : (
                        <div className='dm-no-data'>No matched subjects have this category filled in.</div>
                    )}
                </div>
            )}

        </div>
    )
}

export default DemographicsDashboard
