import React, { useState, useMemo, memo } from 'react'
import Plot from 'react-plotly.js'
import './Scatter.scss'

const COLORS = {
    ROQS:      '#636EFA',
    Watershed: '#EF553B',
    CNN:       '#2CA02C',
}

const METHODS = [
    { key: 'ROQS_scalar',      label: 'ROQS',      color: COLORS.ROQS      },
    { key: 'Watershed_scalar', label: 'Watershed', color: COLORS.Watershed },
    { key: 'CNN_scalar',       label: 'CNN',        color: COLORS.CNN       },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function getValues(data, methodKey, scalar) {
    return data
        .map(s => {
            const v = s[methodKey]?.[scalar]
            return v != null && !isNaN(Number(v)) ? Number(v) : null
        })
}

function linearRegression(xs, ys) {
    const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null)
    const n = pairs.length
    if (n < 2) return null
    const [sumX, sumY, sumXY, sumX2, sumY2] = pairs.reduce(
        ([sx, sy, sxy, sx2, sy2], [x, y]) => [sx + x, sy + y, sxy + x * y, sx2 + x * x, sy2 + y * y],
        [0, 0, 0, 0, 0]
    )
    const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    const denom     = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
    const r         = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
    const [xMin, xMax] = [Math.min(...pairs.map(p => p[0])), Math.max(...pairs.map(p => p[0]))]
    return { slope, intercept, r2: r * r, xMin, xMax }
}

// Silverman's rule KDE
function gaussianKDE(rawValues, nPoints = 200) {
    const vals = rawValues.filter(v => v != null && !isNaN(v))
    if (vals.length < 2) return null
    const n    = vals.length
    const mean = vals.reduce((a, b) => a + b, 0) / n
    const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
    if (std === 0) return null
    const h    = 1.06 * std * Math.pow(n, -0.2)   // Silverman bandwidth
    const min  = Math.min(...vals)
    const max  = Math.max(...vals)
    const pad  = (max - min) * 0.25
    const xs   = Array.from({ length: nPoints }, (_, i) =>
        (min - pad) + i * (max - min + 2 * pad) / (nPoints - 1)
    )
    const ys   = xs.map(x =>
        vals.reduce((acc, xi) => acc + Math.exp(-0.5 * ((x - xi) / h) ** 2), 0) /
        (n * h * Math.sqrt(2 * Math.PI))
    )
    return { x: xs, y: ys }
}

// ── hex → rgba helper ─────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

// ── Histogram panel ───────────────────────────────────────────────────────────

function HistPanel({ methodData, scalar, height = 260 }) {
    const traces = useMemo(() => {
        const out = []

        // ── KDE curves with filled area ───────────────────────────────────────
        for (const { label, color, values } of methodData) {
            const kde = gaussianKDE(values)
            if (kde) {
                out.push({
                    type:      'scatter',
                    mode:      'lines',
                    x:         kde.x,
                    y:         kde.y,
                    name:      label,
                    line:      { color, width: 2.5 },
                    fill:      'tozeroy',
                    fillcolor: hexToRgba(color, 0.13),
                    hoverinfo: 'skip',
                    showlegend: true,
                })
            }
        }

        // ── Rug plot (individual subjects at y = -max_density * 0.05) ─────────
        for (const { label, color, values } of methodData) {
            const valid = values.filter(v => v != null)
            if (valid.length === 0) continue
            out.push({
                type: 'scatter',
                mode: 'markers',
                x: valid,
                y: Array(valid.length).fill(0),
                name: label,
                marker: { color, symbol: 'line-ns-open', size: 10, line: { color, width: 2 } },
                showlegend: false,
                hovertemplate: `%{x:.5f}<extra>${label}</extra>`,
                yaxis: 'y',
            })
        }

        return out
    }, [methodData])

    // Separate KDE traces to compute a shared y-range
    const kdePeak = useMemo(() => {
        let peak = 0
        for (const { values } of methodData) {
            const kde = gaussianKDE(values)
            if (kde) peak = Math.max(peak, ...kde.y)
        }
        return peak || 1
    }, [methodData])

    const layout = {
        height,
        margin: { t: 36, b: 44, l: 52, r: 16 },
        plot_bgcolor: '#E5ECF6',
        paper_bgcolor: 'transparent',
        xaxis: {
            title: { text: scalar, font: { size: 11 } },
            gridcolor: '#fff',
            tickfont:  { size: 10 },
            tickformat: '.4f',
            zeroline: false,
        },
        yaxis: {
            title: { text: 'Density', font: { size: 10 } },
            gridcolor: '#fff',
            tickfont:  { size: 9 },
            range: [-kdePeak * 0.12, kdePeak * 1.18],
            zeroline: true,
            zerolinecolor: 'rgba(0,0,0,0.15)',
            zerolinewidth: 1,
        },
        legend: {
            orientation: 'h',
            x: 0, y: 1.14,
            font: { size: 10 },
            bgcolor: 'transparent',
        },
        showlegend: true,
        annotations: [{
            x: 0.5, y: 1.06,
            xref: 'paper', yref: 'paper',
            text: `<b>Distribution — ${scalar}</b>`,
            showarrow: false,
            font: { size: 11, color: '#555' },
        }],
    }

    return (
        <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: 'hover', modeBarButtons: [['toImage']], toImageButtonOptions: { format: 'png', scale: 2 } }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── Main Scatter component ────────────────────────────────────────────────────

function Scatter({ data }) {
    const [scalarX, setScalarX] = useState('FA')
    const [scalarY, setScalarY] = useState('MD')

    const sameScalar = scalarX === scalarY
    const ids        = data.map(s => s['Id'])

    // Compute values for each method × scalar
    const vals = useMemo(() =>
        METHODS.map(m => ({
            ...m,
            xVals: getValues(data, m.key, scalarX),
            yVals: getValues(data, m.key, scalarY),
        }))
    , [data, scalarX, scalarY])

    // ── Scatter traces ────────────────────────────────────────────────────────
    const scatterData = useMemo(() => {
        const traces = vals.map(({ label, color, xVals, yVals }) => ({
            x: xVals, y: yVals,
            mode: 'markers',
            type: 'scatter',
            name: label,
            text: ids,
            hovertemplate: '<b>%{text}</b><br>%{x:.6f} / %{y:.6f}<extra>' + label + '</extra>',
            marker: { color, size: 9, opacity: 0.85, line: { color: '#fff', width: 0.8 } },
        }))

        if (!sameScalar) {
            for (const { label, color, xVals, yVals } of vals) {
                const reg = linearRegression(xVals, yVals)
                if (reg) {
                    traces.push({
                        x: [reg.xMin, reg.xMax],
                        y: [reg.slope * reg.xMin + reg.intercept, reg.slope * reg.xMax + reg.intercept],
                        mode: 'lines',
                        name: `${label} (R²=${reg.r2.toFixed(3)})`,
                        line: { color, width: 2, dash: 'dash' },
                        hoverinfo: 'skip',
                    })
                }
            }
        }
        return traces
    }, [vals, sameScalar, ids])

    const scatterLayout = {
        plot_bgcolor: '#E5ECF6',
        paper_bgcolor: 'transparent',
        height: 574,
        margin: { t: sameScalar ? 40 : 16, l: 60, r: 16, b: 56 },
        xaxis: {
            title: { text: scalarX, font: { size: 12 } },
            gridcolor: '#fff',
            tickformat: '.4f',
            tickfont: { size: 10 },
        },
        yaxis: {
            title: { text: scalarY, font: { size: 12 } },
            gridcolor: '#fff',
            tickformat: '.5f',
            tickfont: { size: 10 },
        },
        legend: { orientation: 'h', x: 0, y: -0.12, font: { size: 11 } },
        annotations: sameScalar ? [{
            x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
            text: 'X and Y are the same scalar',
            showarrow: false,
            font: { size: 14, color: '#EF553B' },
            bgcolor: 'rgba(255,255,255,0.85)',
            bordercolor: '#EF553B',
            borderwidth: 1,
        }] : [],
    }

    // ── Histogram method data ─────────────────────────────────────────────────
    const histDataX = vals.map(({ label, color, xVals }) => ({ label, color, values: xVals }))
    const histDataY = vals.map(({ label, color, yVals }) => ({ label, color, values: yVals }))

    return (
        <div className='scatter-container'>
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
            </div>

            <div className='scatter-row'>
                {/* Left: scatter */}
                <Plot
                    data={scatterData}
                    layout={scatterLayout}
                    config={{ responsive: true, displayModeBar: 'hover', modeBarButtons: [['toImage']], toImageButtonOptions: { format: 'png', scale: 2 } }}
                    style={{ width: '100%' }}
                    useResizeHandler
                />

                {/* Right: two density histograms */}
                <div className='scatter-col'>
                    <HistPanel methodData={histDataX} scalar={scalarX} height={277} />
                    <HistPanel methodData={histDataY} scalar={scalarY} height={277} />
                </div>
            </div>
        </div>
    )
}

export default memo(Scatter)
