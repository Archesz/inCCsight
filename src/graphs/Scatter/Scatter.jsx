import React, { useState, useMemo, memo } from 'react'
import Plot from 'react-plotly.js'
import './Scatter.scss'

// ── Group colour palette ──────────────────────────────────────────────────────
const PALETTE = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692', '#B6E880']

const METHOD_KEYS = {
    ROQS:      'ROQS_scalar',
    Watershed: 'Watershed_scalar',
    CNN:       'CNN_scalar',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getGroupColors(groups) {
    return Object.fromEntries(groups.map((g, i) => [g, PALETTE[i % PALETTE.length]]))
}

function extractValues(subjects, methodKey, scalar) {
    return subjects.map(s => {
        const v = s[methodKey]?.[scalar]
        return v != null && !isNaN(Number(v)) ? Number(v) : null
    })
}

// ── Main component ────────────────────────────────────────────────────────────

function Scatter({ data }) {
    const [scalarX, setScalarX] = useState('MD')
    const [scalarY, setScalarY] = useState('FA')
    const [method,  setMethod]  = useState('ROQS')

    const methodKey = METHOD_KEYS[method] || 'ROQS_scalar'

    // ── Groups ────────────────────────────────────────────────────────────────
    const groups = useMemo(() => {
        const s = new Set(data.map(d => d.group).filter(Boolean))
        return s.size > 0 ? [...s] : ['All']
    }, [data])

    const colors = useMemo(() => getGroupColors(groups), [groups])

    const grouped = useMemo(() =>
        groups[0] === 'All'
            ? [{ name: 'All', subjects: data }]
            : groups.map(g => ({ name: g, subjects: data.filter(s => s.group === g) }))
    , [data, groups])

    // ── Traces ────────────────────────────────────────────────────────────────

    // Scatter: one trace per group → center panel (xaxis / yaxis)
    const scatterTraces = useMemo(() => grouped.map(({ name, subjects }) => {
        const xVals = extractValues(subjects, methodKey, scalarX)
        const yVals = extractValues(subjects, methodKey, scalarY)
        const ids   = subjects.map(s => s['Id'])
        return {
            type: 'scatter', mode: 'markers',
            x: xVals, y: yVals, text: ids,
            name,
            xaxis: 'x', yaxis: 'y',
            hovertemplate: '<b>%{text}</b><br>%{x:.5f} / %{y:.5f}<extra>' + name + '</extra>',
            marker: { color: colors[name], size: 7, opacity: 0.82, line: { color: '#fff', width: 0.5 } },
            showlegend: true,
        }
    }), [grouped, methodKey, scalarX, scalarY, colors])

    // Histogram: one trace per group → top panel (xaxis / yaxis2)
    const histTraces = useMemo(() => grouped.map(({ name, subjects }) => {
        const xVals = extractValues(subjects, methodKey, scalarX).filter(v => v !== null)
        return {
            type: 'histogram',
            x: xVals,
            name,
            xaxis: 'x', yaxis: 'y2',
            marker: { color: colors[name], opacity: 0.65 },
            showlegend: false,
            nbinsx: 20,
        }
    }), [grouped, methodKey, scalarX, colors])

    // Histogram Y: one trace per group → right panel (xaxis2 / yaxis)
    const histYTraces = useMemo(() => grouped.map(({ name, subjects }) => {
        const yVals = extractValues(subjects, methodKey, scalarY).filter(v => v !== null)
        return {
            type: 'histogram',
            y: yVals,
            orientation: 'h',
            name,
            xaxis: 'x2', yaxis: 'y',
            marker: { color: colors[name], opacity: 0.65 },
            showlegend: false,
            nbinsy: 20,
        }
    }), [grouped, methodKey, scalarY, colors])

    // ── Layout (subplot-style axes) ───────────────────────────────────────────
    const layout = useMemo(() => ({
        height: 460,
        plot_bgcolor:  '#E5ECF6',
        paper_bgcolor: 'transparent',
        margin: { t: 20, l: 64, r: 24, b: 56 },

        // Center scatter — X: 0–74 %, Y: 0–70 %
        xaxis: {
            domain:      [0, 0.74],
            title:       { text: scalarX, font: { size: 12 } },
            gridcolor:   '#fff',
            tickformat:  '.4f',
            tickfont:    { size: 10 },
            zeroline:    false,
        },
        yaxis: {
            domain:      [0, 0.70],
            title:       { text: scalarY, font: { size: 12 } },
            gridcolor:   '#fff',
            tickformat:  '.4f',
            tickfont:    { size: 10 },
            zeroline:    false,
        },

        // Top histogram — shares xaxis, own yaxis (74–92 %)
        yaxis2: {
            domain:      [0.74, 0.92],
            gridcolor:   '#fff',
            tickfont:    { size: 9 },
            zeroline:    false,
            title:       { text: 'Count', font: { size: 9 } },
        },

        // Right histogram — shares yaxis, own xaxis (77–100 %)
        xaxis2: {
            domain:    [0.77, 1.0],
            gridcolor: '#fff',
            tickfont:  { size: 9 },
            zeroline:  false,
            title:     { text: 'Count', font: { size: 9 } },
        },

        barmode: 'group',

        legend: {
            orientation: 'h',
            x: 0, y: 1.06,
            font:  { size: 11 },
            title: { text: 'Group  ', font: { size: 11 } },
            bgcolor: 'transparent',
        },
    }), [scalarX, scalarY])

    const allTraces = useMemo(
        () => [...scatterTraces, ...histTraces, ...histYTraces],
        [scatterTraces, histTraces, histYTraces]
    )

    const config = {
        responsive: true,
        displayModeBar: 'hover',
        modeBarButtons: [['toImage']],
        toImageButtonOptions: { format: 'png', scale: 2, filename: 'scatter_plot' },
    }

    return (
        <div className='scatter-container'>
            {/* Controls */}
            <div className='select-row'>
                <div className='select-scalar'>
                    <span>Scalar X</span>
                    <select className='select' value={scalarX} onChange={e => setScalarX(e.target.value)}>
                        {['FA', 'MD', 'RD', 'AD'].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div className='select-scalar'>
                    <span>Scalar Y</span>
                    <select className='select' value={scalarY} onChange={e => setScalarY(e.target.value)}>
                        {['FA', 'MD', 'RD', 'AD'].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div className='select-scalar'>
                    <span>Method</span>
                    <select className='select' value={method} onChange={e => setMethod(e.target.value)}>
                        {['ROQS', 'Watershed', 'CNN'].map(m => <option key={m}>{m}</option>)}
                    </select>
                </div>
            </div>

            {/* Single Plotly figure with 3 subpanels */}
            <Plot
                data={allTraces}
                layout={layout}
                config={config}
                style={{ width: '100%' }}
                useResizeHandler
            />
        </div>
    )
}

export default memo(Scatter)
