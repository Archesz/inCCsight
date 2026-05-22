import React, { useState, useMemo } from 'react'
import Plot from 'react-plotly.js'
import VolumetricView from '../../graphs/Volume/VolumetricView'
import './TractographyDashboard.scss'

const GROUP_COLORS    = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']
const WITELSON_LABELS = ['W1 Anterior', 'W2 Mid-ant.', 'W3 Central', 'W4 Mid-post.', 'W5 Posterior']
const WITELSON_COLORS = ['#636EFA', '#00CC96', '#FFA15A', '#AB63FA', '#EF553B']

const LAYOUT_BASE = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  '#fafbff',
    font:          { size: 12 },
}

function dirname(p) {
    return p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
}

function cnnFilePath(subject) {
    if (!subject?.img_path) return null
    return dirname(subject.img_path) + '/cnnBased.nii.gz'
}

function fmt(v, d = 3) {
    if (v == null || isNaN(Number(v))) return '—'
    return Number(v).toFixed(d)
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ value, label, sub }) {
    return (
        <div className='tr-kpi-card'>
            <span className='tr-kpi-val'>{value}</span>
            <span className='tr-kpi-label'>{label}</span>
            {sub && <span className='tr-kpi-sub'>{sub}</span>}
        </div>
    )
}

// ── Witelson bar + FA overlay ─────────────────────────────────────────────────
function WitelsonChart({ stats }) {
    const counts = [1,2,3,4,5].map(r => stats[`W${r}_count`]    || 0)
    const fas    = [1,2,3,4,5].map(r => stats[`W${r}_mean_fa`]  ?? null)

    return (
        <Plot
            data={[
                {
                    type: 'bar',
                    x: WITELSON_LABELS,
                    y: counts,
                    marker: { color: WITELSON_COLORS, opacity: 0.85 },
                    text: counts.map(String),
                    textposition: 'outside',
                    yaxis: 'y',
                    showlegend: false,
                    name: 'Streamlines',
                },
                {
                    type: 'scatter',
                    mode: 'lines+markers',
                    x: WITELSON_LABELS,
                    y: fas,
                    name: 'Mean FA',
                    line:   { color: '#1F2C56', width: 2, dash: 'dot' },
                    marker: { color: '#1F2C56', size: 7 },
                    yaxis: 'y2',
                    showlegend: true,
                },
            ]}
            layout={{
                ...LAYOUT_BASE,
                height: 260,
                margin: { t: 24, b: 56, l: 52, r: 52 },
                yaxis:  { title: 'Streamlines', gridcolor: '#eee', zeroline: false },
                yaxis2: { title: 'Mean FA', overlaying: 'y', side: 'right',
                          range: [0, 0.85], showgrid: false, zeroline: false },
                legend: { orientation: 'h', y: -0.34 },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Streamlines-per-subject grouped bar ───────────────────────────────────────
function AllSubjectsChart({ subjects, groups }) {
    const traces = groups.map((g, gi) => {
        const subs = subjects.filter(s => s.group === g)
        return {
            type: 'bar',
            x: subs.map(s => s.Id),
            y: subs.map(s => s.tract_stats?.total_streamlines || 0),
            name: g || 'Ungrouped',
            marker: { color: GROUP_COLORS[gi % GROUP_COLORS.length], opacity: 0.85 },
        }
    })

    return (
        <Plot
            data={traces}
            layout={{
                ...LAYOUT_BASE,
                height: 240,
                barmode: 'group',
                margin: { t: 8, b: 72, l: 52, r: 16 },
                xaxis: { tickangle: -35, automargin: true },
                yaxis: { title: 'Streamlines', gridcolor: '#eee', zeroline: false },
                legend: { orientation: 'h', y: -0.45 },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Sortable TH helper ────────────────────────────────────────────────────────
function SortTh({ col, sortCol, sortAsc, onSort, children }) {
    const active = sortCol === col
    return (
        <th
            onClick={() => onSort(col)}
            className={`tr-th-sort${active ? ' active' : ''}`}
        >
            {children}
            <span className='tr-sort-icon'>{active ? (sortAsc ? '↑' : '↓') : ''}</span>
        </th>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────────
function TractographyDashboard({ subjects }) {
    const [selectedId, setSelectedId] = useState(null)
    const [sortCol,    setSortCol]    = useState('total_streamlines')
    const [sortAsc,    setSortAsc]    = useState(false)

    const tractSubjects = useMemo(
        () => subjects.filter(s => s.tract_stats?.total_streamlines > 0),
        [subjects]
    )

    const groups = useMemo(
        () => [...new Set(tractSubjects.map(s => s.group).filter(Boolean))],
        [tractSubjects]
    )

    if (!tractSubjects.length) {
        return (
            <div className='tr-empty'>
                <span className='tr-empty-title'>No tractography data found</span>
                <span className='tr-empty-hint'>
                    Run the pipeline without "Skip Tractography" to generate streamline data per subject.
                </span>
            </div>
        )
    }

    const selected = selectedId ? tractSubjects.find(s => s.Id === selectedId) : null

    function handleSort(col) {
        setSortAsc(sortCol === col ? !sortAsc : false)
        setSortCol(col)
    }

    // ── All-subjects view ─────────────────────────────────────────────────────
    if (!selected) {
        const totalSL = tractSubjects.reduce((acc, s) => acc + (s.tract_stats?.total_streamlines || 0), 0)
        const avgFA   = tractSubjects.reduce((acc, s) => acc + (s.tract_stats?.mean_fa || 0), 0) / tractSubjects.length
        const avgLen  = tractSubjects.reduce((acc, s) => acc + (s.tract_stats?.mean_length_vox || 0), 0) / tractSubjects.length

        const sorted = [...tractSubjects].sort((a, b) => {
            const av = a.tract_stats?.[sortCol] ?? -Infinity
            const bv = b.tract_stats?.[sortCol] ?? -Infinity
            return sortAsc ? av - bv : bv - av
        })

        const thProps = { sortCol, sortAsc, onSort: handleSort }

        return (
            <div className='tr-container'>

                <div className='tr-header'>
                    <span className='tr-title'>Tractography</span>
                    <span className='tr-subtitle'>{tractSubjects.length} subject{tractSubjects.length !== 1 ? 's' : ''}</span>
                </div>

                <div className='tr-kpi-row'>
                    <KpiCard value={tractSubjects.length}         label='Subjects with tracts'   />
                    <KpiCard value={totalSL.toLocaleString()}     label='Total streamlines'       />
                    <KpiCard value={fmt(avgFA,  3)}               label='Mean FA (avg)'           />
                    <KpiCard value={fmt(avgLen, 1)}               label='Mean length (vox, avg)'  />
                </div>

                {groups.length >= 1 && (
                    <div className='tr-section'>
                        <span className='tr-section-title'>Streamlines per subject</span>
                        <div className='tr-chart-card'>
                            <AllSubjectsChart subjects={tractSubjects} groups={groups.length ? groups : ['']} />
                        </div>
                    </div>
                )}

                <div className='tr-section'>
                    <span className='tr-section-title'>Summary — click a row to inspect</span>
                    <div className='tr-table-wrap'>
                        <table className='tr-table'>
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    {groups.length > 0 && <th>Group</th>}
                                    <SortTh col='total_streamlines' {...thProps}>Streamlines</SortTh>
                                    <SortTh col='mean_fa'           {...thProps}>Mean FA</SortTh>
                                    <SortTh col='mean_length_vox'   {...thProps}>Length (vox)</SortTh>
                                    <th>W1</th><th>W2</th><th>W3</th><th>W4</th><th>W5</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(s => {
                                    const ts = s.tract_stats || {}
                                    return (
                                        <tr key={s.Id} className='tr-table-row' onClick={() => setSelectedId(s.Id)}>
                                            <td><strong>{s.Id}</strong></td>
                                            {groups.length > 0 && <td>{s.group || '—'}</td>}
                                            <td>{ts.total_streamlines ?? '—'}</td>
                                            <td>{fmt(ts.mean_fa, 3)}</td>
                                            <td>{fmt(ts.mean_length_vox, 1)}</td>
                                            {[1,2,3,4,5].map(r => (
                                                <td key={r}>{ts[`W${r}_count`] ?? '—'}</td>
                                            ))}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        )
    }

    // ── Single-subject view ───────────────────────────────────────────────────
    const ts = selected.tract_stats || {}
    const fp = cnnFilePath(selected)

    return (
        <div className='tr-container tr-container--subject'>

            <div className='tr-header'>
                <button className='tr-back-btn' onClick={() => setSelectedId(null)}>← All subjects</button>
                <span className='tr-title'>{selected.Id}</span>
                {selected.group && <span className='tr-group-badge'>{selected.group}</span>}
            </div>

            <div className='tr-subject-layout'>

                {/* ── Stats panel ──────────────────────────────────────────── */}
                <div className='tr-stats-panel'>

                    <div className='tr-kpi-row tr-kpi-row--compact'>
                        <KpiCard value={ts.total_streamlines ?? '—'} label='Streamlines' />
                        <KpiCard value={fmt(ts.mean_fa, 3)}           label='Mean FA'     />
                        <KpiCard
                            value={fmt(ts.mean_length_vox, 1)}
                            label='Length (vox)'
                            sub={ts.std_length_vox != null ? `± ${fmt(ts.std_length_vox, 1)}` : null}
                        />
                    </div>

                    <div className='tr-section'>
                        <span className='tr-section-title'>Witelson regions</span>
                        <div className='tr-chart-card'>
                            <WitelsonChart stats={ts} />
                        </div>
                    </div>

                    <div className='tr-section'>
                        <span className='tr-section-title'>Region details</span>
                        <div className='tr-table-wrap'>
                            <table className='tr-table'>
                                <thead>
                                    <tr>
                                        <th>Region</th>
                                        <th>Streamlines</th>
                                        <th>Mean FA</th>
                                        <th>% of total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {WITELSON_LABELS.map((label, i) => {
                                        const r     = i + 1
                                        const count = ts[`W${r}_count`]   ?? 0
                                        const fa    = ts[`W${r}_mean_fa`]
                                        const pct   = ts.total_streamlines
                                            ? Math.round(count / ts.total_streamlines * 100)
                                            : 0
                                        return (
                                            <tr key={r}>
                                                <td>
                                                    <span className='tr-w-dot' style={{ background: WITELSON_COLORS[i] }} />
                                                    {label}
                                                </td>
                                                <td>{count}</td>
                                                <td>{fmt(fa, 3)}</td>
                                                <td>{pct}%</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* ── 3D viewer ─────────────────────────────────────────────── */}
                <div className='tr-viewer-panel'>
                    {fp
                        ? <VolumetricView filePath={fp} />
                        : <div className='tr-no-3d'>3D segmentation file not found for this subject.</div>
                    }
                </div>

            </div>
        </div>
    )
}

export default TractographyDashboard
