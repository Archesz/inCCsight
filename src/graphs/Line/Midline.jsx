import React, { useState, memo } from 'react'
import Plot from 'react-plotly.js'
import './Midline.scss'

const COLORS = {
    ROQS:      '#636EFA',
    Watershed: '#EF553B',
    CNN:       '#00CC96',
}

const WITELSON_BOUNDARIES = [40, 80, 120, 160]
const WITELSON_LABELS     = ['P1', 'P2', 'P3', 'P4', 'P5']
const WITELSON_MIDPOINTS  = [20, 60, 100, 140, 180]

// ── helpers ────────────────────────────────────────────────────────────────

function getMeanPoints(data, method, scalar) {
    const valid = data.filter(s => {
        const arr = s[method]?.[scalar]
        return Array.isArray(arr) && arr.length > 0
    })
    if (valid.length === 0) return null
    const size = valid[0][method][scalar].length
    return Array.from({ length: size }, (_, p) => {
        const sum = valid.reduce((acc, s) => acc + s[method][scalar][p], 0)
        return sum / valid.length
    })
}

function getStdDevPoints(data, method, scalar) {
    const valid = data.filter(s => {
        const arr = s[method]?.[scalar]
        return Array.isArray(arr) && arr.length > 0
    })
    if (valid.length === 0) return null
    const size = valid[0][method][scalar].length
    return Array.from({ length: size }, (_, p) => {
        const vals = valid.map(s => s[method][scalar][p])
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        return Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length)
    })
}

function getMeanThickness(data, method) {
    const valid = data.filter(s => Array.isArray(s[method]) && s[method].length > 0)
    if (valid.length === 0) return null
    const size = valid[0][method].length
    return Array.from({ length: size }, (_, p) => {
        const sum = valid.reduce((acc, s) => acc + s[method][p], 0)
        return sum / valid.length
    })
}

function getStdDevThickness(data, method) {
    const valid = data.filter(s => Array.isArray(s[method]) && s[method].length > 0)
    if (valid.length === 0) return null
    const size = valid[0][method].length
    return Array.from({ length: size }, (_, p) => {
        const vals = valid.map(s => s[method][p])
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        return Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length)
    })
}

function buildBandTraces(yMean, yStd, fillColor, legendgroup) {
    const x      = Array.from({ length: yMean.length }, (_, i) => i)
    const yUpper = yMean.map((v, i) => v + yStd[i])
    const yLower = yMean.map((v, i) => v - yStd[i])
    return [
        {
            x, y: yUpper,
            mode: 'lines', line: { width: 0 },
            showlegend: false, hoverinfo: 'skip',
            legendgroup,
        },
        {
            x, y: yLower,
            fill: 'tonexty', mode: 'lines', line: { width: 0 },
            fillcolor: fillColor,
            showlegend: false, hoverinfo: 'skip',
            legendgroup,
        },
    ]
}

function hasCNNMidlines(data) {
    return data.some(s => {
        const m = s['CNN_midlines']
        if (!m) return false
        return Object.values(m).some(v => Array.isArray(v) && v.length > 0)
    })
}

// ── Componente ─────────────────────────────────────────────────────────────

function Midline(props) {
    const [scalar, setScalar] = useState('FA')

    const x          = Array.from({ length: 200 }, (_, i) => i)
    const showCNN    = hasCNNMidlines(props.data)
    let   traces     = []
    let   yAxisTitle = scalar

    if (scalar !== 'Thickness') {
        const roqsMean = getMeanPoints(props.data, 'ROQS_midlines', scalar)
        const roqsStd  = getStdDevPoints(props.data, 'ROQS_midlines', scalar)
        const wsMean   = getMeanPoints(props.data, 'Watershed_midlines', scalar)
        const wsStd    = getStdDevPoints(props.data, 'Watershed_midlines', scalar)
        const cnnMean  = showCNN ? getMeanPoints(props.data, 'CNN_midlines', scalar) : null
        const cnnStd   = showCNN ? getStdDevPoints(props.data, 'CNN_midlines', scalar) : null

        if (roqsMean && roqsStd) {
            traces.push(...buildBandTraces(roqsMean, roqsStd, 'rgba(99,110,250,0.2)', 'ROQS'))
        }
        if (wsMean && wsStd) {
            traces.push(...buildBandTraces(wsMean, wsStd, 'rgba(239,85,59,0.2)', 'Watershed'))
        }
        if (cnnMean && cnnStd) {
            traces.push(...buildBandTraces(cnnMean, cnnStd, 'rgba(0,204,150,0.2)', 'CNN'))
        }

        if (roqsMean) {
            traces.push({
                x, y: roqsMean,
                mode: 'lines', name: 'ROQS', legendgroup: 'ROQS',
                line: { color: COLORS.ROQS, width: 2 },
                hovertemplate: 'Point %{x}<br>Value: %{y:.6f}<extra>ROQS</extra>',
            })
        }
        if (wsMean) {
            traces.push({
                x, y: wsMean,
                mode: 'lines', name: 'Watershed', legendgroup: 'Watershed',
                line: { color: COLORS.Watershed, width: 2 },
                hovertemplate: 'Point %{x}<br>Value: %{y:.6f}<extra>Watershed</extra>',
            })
        }
        if (cnnMean) {
            traces.push({
                x, y: cnnMean,
                mode: 'lines', name: 'CNN', legendgroup: 'CNN',
                line: { color: COLORS.CNN, width: 2 },
                hovertemplate: 'Point %{x}<br>Value: %{y:.6f}<extra>CNN</extra>',
            })
        }
    } else {
        yAxisTitle = 'Thickness (mm)'

        const roqsMean = getMeanThickness(props.data, 'ROQS_thickness')
        const roqsStd  = getStdDevThickness(props.data, 'ROQS_thickness')
        const wsMean   = getMeanThickness(props.data, 'Watershed_thickness')
        const wsStd    = getStdDevThickness(props.data, 'Watershed_thickness')

        if (roqsMean && roqsStd) {
            traces.push(...buildBandTraces(roqsMean, roqsStd, 'rgba(99,110,250,0.2)', 'ROQS'))
        }
        if (wsMean && wsStd) {
            traces.push(...buildBandTraces(wsMean, wsStd, 'rgba(239,85,59,0.2)', 'Watershed'))
        }
        if (roqsMean) {
            traces.push({
                x, y: roqsMean,
                mode: 'lines', name: 'ROQS', legendgroup: 'ROQS',
                line: { color: COLORS.ROQS, width: 2 },
                hovertemplate: 'Point %{x}<br>Thickness: %{y:.4f}<extra>ROQS</extra>',
            })
        }
        if (wsMean) {
            traces.push({
                x, y: wsMean,
                mode: 'lines', name: 'Watershed', legendgroup: 'Watershed',
                line: { color: COLORS.Watershed, width: 2 },
                hovertemplate: 'Point %{x}<br>Thickness: %{y:.4f}<extra>Watershed</extra>',
            })
        }
    }

    const shapes = WITELSON_BOUNDARIES.map(xPos => ({
        type: 'line',
        x0: xPos, x1: xPos,
        y0: 0, y1: 1, yref: 'paper',
        line: { color: 'rgba(0,0,0,0.25)', width: 1, dash: 'dot' },
    }))

    const annotations = WITELSON_MIDPOINTS.map((xPos, i) => ({
        x: xPos, y: 1.02,
        xref: 'x', yref: 'paper',
        text: WITELSON_LABELS[i],
        showarrow: false,
        font: { size: 11, color: '#555' },
    }))

    const layout = {
        height: 420,
        margin: { t: 30, l: 50, r: 10 },
        legend: { orientation: 'h', x: 1, y: 1.1, xanchor: 'right', groupclick: 'togglegroup' },
        plot_bgcolor: '#E5ECF6',
        yaxis: { gridcolor: 'rgb(255,255,255)', title: yAxisTitle },
        xaxis: { gridcolor: 'rgb(255,255,255)', title: 'Points Along CC Body' },
        shapes,
        annotations,
    }

    return (
        <div className='midline-container'>
            <div className='midline-toolbar'>
                <span className='midline-scale-label'>Scalar</span>
                <select className='midline-select' onChange={e => setScalar(e.target.value)} value={scalar}>
                    {['FA', 'MD', 'RD', 'AD', 'Thickness'].map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>
            <Plot
                data={traces}
                layout={layout}
                config={{
                    responsive: true,
                    displayModeBar: 'hover',
                    modeBarButtons: [['toImage']],
                    toImageButtonOptions: { format: 'png', scale: 2, filename: 'midline_profile' },
                }}
                style={{ width: '100%' }}
                useResizeHandler
            />
        </div>
    )
}

export default memo(Midline)
