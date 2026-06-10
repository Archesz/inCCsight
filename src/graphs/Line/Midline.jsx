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

// ── Normative FA reference along CC midline (200 points) ─────────────────────
// Approximate population mean ± 1 SD for healthy adults (20–60 y).
// Derived from: Lebel et al. NeuroImage 2008; Hofer & Frahm 2006.
// P1=genu(0-40), P2=ant.body(40-80), P3=center(80-120), P4=post.body(120-160),
// P5=splenium(160-200)
const NORM_FA_BY_REGION = [
    { mean: 0.60, sd: 0.04 },  // P1
    { mean: 0.54, sd: 0.04 },  // P2
    { mean: 0.50, sd: 0.04 },  // P3
    { mean: 0.54, sd: 0.04 },  // P4
    { mean: 0.67, sd: 0.04 },  // P5
]
const NORM_MD_BY_REGION = [
    { mean: 0.00082, sd: 0.00006 },
    { mean: 0.00088, sd: 0.00006 },
    { mean: 0.00092, sd: 0.00007 },
    { mean: 0.00088, sd: 0.00006 },
    { mean: 0.00078, sd: 0.00006 },
]
const NORM_RD_BY_REGION = [
    { mean: 0.00042, sd: 0.00005 },
    { mean: 0.00052, sd: 0.00005 },
    { mean: 0.00058, sd: 0.00006 },
    { mean: 0.00052, sd: 0.00005 },
    { mean: 0.00036, sd: 0.00005 },
]
const NORM_AD_BY_REGION = [
    { mean: 0.00162, sd: 0.00010 },
    { mean: 0.00168, sd: 0.00010 },
    { mean: 0.00172, sd: 0.00010 },
    { mean: 0.00168, sd: 0.00010 },
    { mean: 0.00158, sd: 0.00010 },
]

const NORM_TABLES = { FA: NORM_FA_BY_REGION, MD: NORM_MD_BY_REGION,
                      RD: NORM_RD_BY_REGION, AD: NORM_AD_BY_REGION }

// Build 200-point normative arrays with smooth cubic interpolation at region boundaries
function buildNormativeProfile(scalar) {
    const table = NORM_TABLES[scalar]
    if (!table) return null

    const boundaries = [0, 40, 80, 120, 160, 200]
    const means  = new Float64Array(200)
    const uppers = new Float64Array(200)
    const lowers = new Float64Array(200)

    for (let i = 0; i < 200; i++) {
        // Determine region index
        let region = 4
        for (let r = 0; r < 5; r++) {
            if (i < boundaries[r + 1]) { region = r; break }
        }

        // Smooth transition: linear interpolation between adjacent region means
        // within ±4 points of each boundary
        const BLEND = 6
        let frac = 0, blending = false
        if (region < 4 && i >= boundaries[region + 1] - BLEND) {
            frac = (i - (boundaries[region + 1] - BLEND)) / (2 * BLEND)
            blending = true
        } else if (region > 0 && i < boundaries[region] + BLEND) {
            frac = 1 - (i - boundaries[region] + BLEND) / (2 * BLEND)
            blending = true
        }

        const m = blending
            ? table[region].mean * (1 - frac) + table[Math.min(region + 1, 4)].mean * frac
            : table[region].mean
        const s = blending
            ? table[region].sd * (1 - frac) + table[Math.min(region + 1, 4)].sd * frac
            : table[region].sd

        means[i]  = m
        uppers[i] = m + s
        lowers[i] = m - s
    }
    return { means: Array.from(means), uppers: Array.from(uppers), lowers: Array.from(lowers) }
}

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
    const [scalar,   setScalar]   = useState('FA')
    const [showNorm, setShowNorm] = useState(false)

    const x          = Array.from({ length: 200 }, (_, i) => i)
    const showCNN    = hasCNNMidlines(props.data)
    let   traces     = []
    let   yAxisTitle = scalar

    // ── Normative band traces ─────────────────────────────────────────────
    if (showNorm && scalar !== 'Thickness') {
        const norm = buildNormativeProfile(scalar)
        if (norm) {
            // Upper boundary (invisible line, filled below)
            traces.push({
                x, y: norm.uppers,
                mode: 'lines', line: { width: 0 }, showlegend: false, hoverinfo: 'skip',
                name: 'norm_upper', legendgroup: 'norm',
            })
            // Lower boundary (fills up to upper)
            traces.push({
                x, y: norm.lowers,
                fill: 'tonexty', mode: 'lines', line: { width: 0 },
                fillcolor: 'rgba(180,200,255,0.18)',
                showlegend: false, hoverinfo: 'skip', name: 'norm_lower', legendgroup: 'norm',
            })
            // Mean line
            traces.push({
                x, y: norm.means,
                mode: 'lines', name: 'Normative mean ±1 SD', legendgroup: 'norm',
                line: { color: 'rgba(130,160,255,0.6)', width: 1.5, dash: 'dot' },
                hovertemplate: 'Point %{x}<br>Normative mean: %{y:.6f}<extra>Normative</extra>',
            })
        }
    }

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
        title:  'Midline Plots',
        height: 420,
        margin: { t: 50, l: 50, r: 10 },
        legend: { orientation: 'h', x: 1, y: 1.1, xanchor: 'right', groupclick: 'togglegroup' },
        plot_bgcolor: '#E5ECF6',
        yaxis: { gridcolor: 'rgb(255,255,255)', title: yAxisTitle },
        xaxis: { gridcolor: 'rgb(255,255,255)', title: 'Points Along CC Body' },
        shapes,
        annotations,
    }

    return (
        <div className='midline-container'>
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
            <div className='select-scalar'>
                <span>Scalar</span>
                <select className='select' onChange={e => setScalar(e.target.value)}>
                    {['FA', 'MD', 'RD', 'AD', 'Thickness'].map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>

                {scalar !== 'Thickness' && (
                    <label className='midline-norm-toggle'>
                        <input
                            type='checkbox'
                            checked={showNorm}
                            onChange={e => setShowNorm(e.target.checked)}
                        />
                        Normative range
                    </label>
                )}
            </div>
        </div>
    )
}

export default memo(Midline)
