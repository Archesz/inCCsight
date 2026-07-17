/**
 * BubblePlot — CC body bubble chart
 *
 * For each group (or "All" when ungrouped), one Plotly scatter subplot:
 *   X  = position along CC body (0–199)
 *   Y  = midline position (row-coord flipped so arch faces UP, positive range)
 *   Size = mean CC thickness at each position
 *   Color = mean scalar value (FA / MD / RD / AD)
 *
 * Falls back to thickness on the y-axis when midline y-coords are not yet
 * in the data (subjects processed before the 'y' column was added).
 */

import React, { useState, useMemo, memo } from 'react'
import Plot from 'react-plotly.js'
import './BubblePlot.scss'
import { plotTheme } from '../../settings/settings'

const SCALARS = ['FA', 'MD', 'RD', 'AD']
const N       = 200   // number of midline points

const COLORSCALES = {
    FA: 'Viridis',
    MD: 'Plasma',
    RD: 'Cividis',
    AD: 'Magma',
}

// ── data helpers ──────────────────────────────────────────────────────────────

/** Compute mean of an array of same-length numeric arrays; returns null if none. */
function meanArrays(arrs) {
    const valid = arrs.filter(a => Array.isArray(a) && a.length === N)
    if (!valid.length) return null
    return Array.from({ length: N }, (_, i) =>
        valid.reduce((s, a) => s + (a[i] || 0), 0) / valid.length
    )
}

function getMidlineArrays(subjects, key, method = 'ROQS_midlines') {
    return subjects
        .map(s => s[method]?.[key])
        .filter(a => Array.isArray(a) && a.length === N)
}

function getThicknessArrays(subjects, method = 'ROQS_thickness') {
    return subjects
        .map(s => s[method])
        .filter(a => Array.isArray(a) && a.length === N)
}

/** Scale bubble sizes: min→6px, max→28px */
function scaleSizes(arr) {
    if (!arr) return null
    const min = Math.min(...arr)
    const max = Math.max(...arr)
    const range = max - min || 1
    return arr.map(v => 6 + ((v - min) / range) * 22)
}

/**
 * Flip row-coords so arch faces UP:
 *   image row 0 = top → body of CC (most superior) has SMALLEST row numbers
 *   after flip: body gets LARGEST y_plot → appears at top of chart
 *   result is in positive range [0 .. max-min]
 */
function flipToArch(arr) {
    const maxVal = Math.max(...arr)
    return arr.map(v => maxVal - v)
}

// ── single-group plot ─────────────────────────────────────────────────────────

/**
 * segMethod is the midlines key, e.g. "ROQS_midlines" or "Watershed_midlines".
 * Derive the matching thickness key from it.
 */
function thicknessKeyFor(segMethod) {
    if (segMethod.startsWith('ROQS'))      return 'ROQS_thickness'
    if (segMethod.startsWith('Watershed')) return 'Watershed_thickness'
    return 'ROQS_thickness'
}

function GroupBubble({ subjects, groupLabel, scalar, segMethod }) {
    const x = useMemo(() => Array.from({ length: N }, (_, i) => i), [])

    // midline y-coords (image row coordinates)
    const yArr = useMemo(() => {
        const arrs = getMidlineArrays(subjects, 'y', segMethod)
        return meanArrays(arrs)
    }, [subjects, segMethod])

    // thickness
    const thickKey   = thicknessKeyFor(segMethod)
    const thickArrs  = useMemo(() => getThicknessArrays(subjects, thickKey), [subjects, thickKey])
    const thickMean  = useMemo(() => meanArrays(thickArrs), [thickArrs])

    // scalar color values
    const scalarArrs = useMemo(() => getMidlineArrays(subjects, scalar, segMethod), [subjects, scalar, segMethod])
    const scalarMean = useMemo(() => meanArrays(scalarArrs), [scalarArrs])

    const hasYCoords = yArr && yArr.some(v => v !== 0)

    if ((!hasYCoords && !thickMean) || !scalarMean) {
        return (
            <div className='bp-empty'>
                <span>{groupLabel} — no data</span>
            </div>
        )
    }

    // Flip coords so arch faces up (positive y range)
    const yPlot = hasYCoords
        ? flipToArch(yArr)
        : thickMean  // fallback: thickness as y (also creates arch-like shape)

    const sizes = scaleSizes(thickMean || yPlot)

    // Witelson boundary lines
    const shapes = [40, 80, 120, 160].map(xv => ({
        type: 'line',
        x0: xv, x1: xv, y0: 0, y1: 1, yref: 'paper',
        line: { color: 'rgba(0,0,0,0.18)', width: 1, dash: 'dot' },
    }))

    const annotations = [[20,'P1'],[60,'P2'],[100,'P3'],[140,'P4'],[180,'P5']].map(([xv, lbl]) => ({
        x: xv, y: 1.06, xref: 'x', yref: 'paper',
        text: lbl, showarrow: false,
        font: { size: 10, color: '#888' },
    }))

    const trace = {
        type: 'scatter',
        mode: 'markers',
        x,
        y: yPlot,
        marker: {
            color: scalarMean,
            colorscale: COLORSCALES[scalar] || 'Viridis',
            cmin: Math.min(...scalarMean),
            cmax: Math.max(...scalarMean),
            size: sizes,
            showscale: true,
            colorbar: {
                title:       { text: scalar, side: 'right' },
                thickness:   14,
                len:         0.9,
                tickfont:    { size: 10 },
                outlinewidth: 0,
            },
            line: { width: 0 },
            opacity: 0.9,
        },
        hovertemplate:
            'Position: %{x}<br>' +
            'CC position: %{customdata[0]:.1f}<br>' +
            `${scalar}: %{marker.color:.5f}<br>` +
            'Thickness: %{customdata[1]:.2f}<extra>' + groupLabel + '</extra>',
        customdata: Array.from({ length: N }, (_, i) => [
            yPlot[i] ?? 0,
            thickMean ? (thickMean[i] ?? 0) : 0,
        ]),
    }

    const PT = plotTheme()
    const layout = {
        height: 300,
        margin: { t: 30, l: 60, r: 80, b: 44 },
        plot_bgcolor: PT.plot,
        paper_bgcolor: PT.paper,
        font: { color: PT.font },
        xaxis: {
            title: { text: 'Points Along CC Body', font: { size: 11 } },
            gridcolor: PT.grid,
            range: [-2, N + 1],
            tickfont: { size: 10 },
        },
        yaxis: {
            title: {
                text: `Thickness for ${groupLabel} category`,
                font: { size: 10 },
                standoff: 8,
            },
            gridcolor: PT.grid,
            tickfont: { size: 10 },
        },
        annotations,
        shapes,
        showlegend: false,
    }

    return (
        <Plot
            data={[trace]}
            layout={layout}
            config={{
                responsive: true,
                displayModeBar: 'hover',
                modeBarButtons: [['toImage']],
                toImageButtonOptions: { format: 'png', scale: 2, filename: `bubble_${groupLabel}` },
            }}
            style={{ width: '100%' }}
            useResizeHandler
        />
    )
}

// ── main component ────────────────────────────────────────────────────────────

function BubblePlot({ data }) {
    const [scalar,    setScalar]    = useState('FA')
    const [segMethod, setSegMethod] = useState('ROQS')

    // Midline method key differs from scalar key
    const midlineKey = `${segMethod}_midlines`

    // Build groups
    const groups = useMemo(() => {
        const gNames = [...new Set(data.map(s => s.group || '').filter(Boolean))]
        if (gNames.length === 0) return [{ label: 'All', subjects: data }]
        return gNames.map(g => ({ label: g, subjects: data.filter(s => s.group === g) }))
    }, [data])

    if (!data || data.length === 0) return null

    return (
        <div className='bp-root'>
            {/* controls */}
            <div className='bp-controls'>
                <div className='bp-ctrl'>
                    <span className='bp-ctrl-label'>Scalar (color)</span>
                    <select
                        value={scalar}
                        onChange={e => setScalar(e.target.value)}
                        className='bp-select'
                    >
                        {SCALARS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className='bp-ctrl'>
                    <span className='bp-ctrl-label'>Method</span>
                    <select
                        value={segMethod}
                        onChange={e => setSegMethod(e.target.value)}
                        className='bp-select'
                    >
                        {['ROQS', 'Watershed'].map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
                <span className='bp-hint'>
                    Bubble size = CC thickness · Color = mean {scalar} along midline
                </span>
            </div>

            {/* one plot per group */}
            <div className='bp-plots'>
                {groups.map((g) => (
                    <GroupBubble
                        key={g.label}
                        subjects={g.subjects}
                        groupLabel={g.label}
                        scalar={scalar}
                        segMethod={midlineKey}
                    />
                ))}
            </div>
        </div>
    )
}

export default memo(BubblePlot)
