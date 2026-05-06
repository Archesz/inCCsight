import React, { useState, memo } from 'react'
import Plot from 'react-plotly.js'
import './BiomarkerProfile.scss'

/**
 * BiomarkerProfile
 *
 * Radar chart showing a single subject's Witelson FA P1–P5 values
 * against a healthy normative reference band and optional disease
 * signature overlays.
 *
 * Normative values (FA, Witelson P1–P5, healthy adults 20–60 y):
 *   Derived from: Lebel et al. NeuroImage 2008; Hofer & Frahm 2006;
 *                 Hasan et al. AJNR 2009.
 *   P1 (genu)          mean=0.60  SD=0.04
 *   P2 (ant. body)     mean=0.54  SD=0.04
 *   P3 (central body)  mean=0.50  SD=0.04
 *   P4 (post. body)    mean=0.54  SD=0.04
 *   P5 (splenium)      mean=0.67  SD=0.04
 *
 * Disease signatures (direction and magnitude of FA change relative to
 * normative mean, expressed as fraction of 1 SD):
 *   AD  — Alzheimer's     (Salat 2010; Nir 2013)
 *   MS  — Multiple Scler. (Pagani 2005; Roosendaal 2009)
 *   ALS — Amyotrophic LS  (Sach 2004; Ciccarelli 2009)
 *   PD  — Parkinson's     (Agosta 2011; Lenfeldt 2013)
 *   TBI — Traumatic BI    (Niogi 2008; Kinnunen 2011)
 */

// ── Normative reference (FA, Witelson P1–P5) ─────────────────────────────────
const NORM_MEAN = { P1: 0.60, P2: 0.54, P3: 0.50, P4: 0.54, P5: 0.67 }
const NORM_SD   = { P1: 0.04, P2: 0.04, P3: 0.04, P4: 0.04, P5: 0.04 }

// ── Disease signatures — z-score shift (multiples of SD) ─────────────────────
// Negative = FA reduction vs. normative; positive = increase
const DISEASE_SIGNATURES = {
    AD:  { P1: -0.5, P2: -0.8, P3: -0.8, P4: -1.2, P5: -2.0, color: '#f97316', label: 'Alzheimer\'s (AD)' },
    MS:  { P1: -0.8, P2: -1.2, P3: -1.8, P4: -1.8, P5: -1.0, color: '#a855f7', label: 'Multiple Sclerosis (MS)' },
    ALS: { P1: -0.5, P2: -0.5, P3: -0.8, P4: -1.5, P5: -1.5, color: '#ef4444', label: 'ALS' },
    PD:  { P1: -1.5, P2: -1.2, P3: -0.6, P4: -0.5, P5: -0.3, color: '#3b82f6', label: 'Parkinson\'s (PD)' },
    TBI: { P1: -1.8, P2: -1.2, P3: -0.8, P4: -0.6, P5: -0.5, color: '#10b981', label: 'TBI' },
}

const PARTS = ['P1', 'P2', 'P3', 'P4', 'P5']

// ── Convert absolute FA value to z-score ─────────────────────────────────────
function toZ(part, value) {
    return (value - NORM_MEAN[part]) / NORM_SD[part]
}

// ── Convert disease z-shift back to absolute FA ───────────────────────────────
function diseaseFA(part, zShift) {
    return NORM_MEAN[part] + zShift * NORM_SD[part]
}

// ── Build radar trace from FA values (keyed by part) ─────────────────────────
function radarTrace(values, name, color, dash = 'solid', fill = 'none', opacity = 1) {
    const r     = [...PARTS, PARTS[0]].map(p => values[p] ?? 0)
    const theta = [...PARTS, PARTS[0]]
    return {
        type: 'scatterpolar',
        r, theta, name,
        mode: 'lines+markers',
        fill,
        line:    { color, width: 2, dash },
        marker:  { color, size: 6 },
        opacity,
        hovertemplate: '%{theta}: %{r:.4f}<extra>' + name + '</extra>',
    }
}

// ── Normative band (upper / lower ±1 SD) ─────────────────────────────────────
function normBandTraces() {
    const upper = Object.fromEntries(PARTS.map(p => [p, NORM_MEAN[p] + NORM_SD[p]]))
    const lower = Object.fromEntries(PARTS.map(p => [p, NORM_MEAN[p] - NORM_SD[p]]))
    const norm  = NORM_MEAN

    return [
        radarTrace(upper, 'Norm +1 SD', 'rgba(100,160,255,0.25)', 'dot', 'toself', 0.5),
        radarTrace(lower, 'Norm −1 SD', 'rgba(100,160,255,0.0)',  'dot', 'toself', 0.2),
        radarTrace(norm,  'Normative mean', '#64a0ff', 'dot', 'none', 0.9),
    ]
}

// ── Main component ────────────────────────────────────────────────────────────
function BiomarkerProfile({ subject, method = 'ROQS' }) {
    const [activeDisease, setActiveDisease] = useState(null)
    const [showNorm,      setShowNorm]      = useState(true)

    // Extract Witelson FA P1–P5 from the subject's parcellation
    const parcKey   = method === 'CNN' ? 'CNN_parcellation' : `${method}_parcellation`
    const parcData  = subject?.[parcKey] || {}
    const subjectFA = Object.fromEntries(
        PARTS.map(p => [p, parcData[`Witelson_FA_${p}`] ?? null])
    )
    const hasData = PARTS.some(p => subjectFA[p] != null)

    if (!hasData) {
        return (
            <div className='bp-empty'>
                No Witelson FA parcellation data available for this subject.
            </div>
        )
    }

    const traces = []

    // Normative band
    if (showNorm) {
        traces.push(...normBandTraces())
    }

    // Disease signature overlay
    if (activeDisease) {
        const sig  = DISEASE_SIGNATURES[activeDisease]
        const vals = Object.fromEntries(PARTS.map(p => [p, diseaseFA(p, sig[p])]))
        traces.push(radarTrace(vals, sig.label, sig.color, 'dashdot', 'none', 0.85))
    }

    // Subject trace
    traces.push(radarTrace(subjectFA, `Subject ${subject['Id']} (${method})`, '#facc15', 'solid', 'none', 1))

    // Compute z-scores for annotation
    const zScores = Object.fromEntries(
        PARTS
            .filter(p => subjectFA[p] != null)
            .map(p => [p, toZ(p, subjectFA[p])])
    )

    const layout = {
        polar: {
            radialaxis: {
                visible: true,
                range:   [0.3, 0.85],
                tickfont: { color: '#94a3b8', size: 10 },
                gridcolor: 'rgba(148,163,184,0.2)',
            },
            angularaxis: {
                tickfont: { color: '#cbd5e1', size: 13 },
                gridcolor: 'rgba(148,163,184,0.15)',
            },
            bgcolor: 'rgba(0,0,0,0)',
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor:  'rgba(0,0,0,0)',
        legend: {
            font:   { color: '#94a3b8', size: 11 },
            bgcolor: 'rgba(0,0,0,0)',
            x: 1.08, y: 1,
        },
        margin: { t: 30, b: 10, l: 30, r: 120 },
        height: 320,
        showlegend: true,
    }

    return (
        <div className='bp-container'>

            {/* ── Controls ──────────────────────────────────────────────── */}
            <div className='bp-controls'>
                <label className='bp-toggle'>
                    <input type='checkbox' checked={showNorm}
                        onChange={e => setShowNorm(e.target.checked)} />
                    Normative range
                </label>

                <span className='bp-disease-label'>Disease overlay:</span>
                <div className='bp-disease-pills'>
                    {Object.entries(DISEASE_SIGNATURES).map(([key, sig]) => (
                        <button
                            key={key}
                            className={`bp-pill${activeDisease === key ? ' active' : ''}`}
                            style={{ '--disease-color': sig.color }}
                            onClick={() => setActiveDisease(prev => prev === key ? null : key)}
                            title={sig.label}
                        >{key}</button>
                    ))}
                </div>
            </div>

            {/* ── Radar ─────────────────────────────────────────────────── */}
            <Plot
                data={traces}
                layout={layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
                useResizeHandler
            />

            {/* ── Z-score row ───────────────────────────────────────────── */}
            <div className='bp-zscore-row'>
                {PARTS.map(p => {
                    const z = zScores[p]
                    if (z == null) return null
                    const cls = Math.abs(z) < 1 ? 'normal'
                              : Math.abs(z) < 2 ? 'mild'
                              :                   'severe'
                    return (
                        <div key={p} className={`bp-zscore-card ${cls}`}>
                            <span className='bp-zp'>{p}</span>
                            <span className='bp-zv'>{z > 0 ? '+' : ''}{z.toFixed(2)}σ</span>
                            <span className='bp-zfa'>{(subjectFA[p]).toFixed(3)}</span>
                        </div>
                    )
                })}
            </div>

        </div>
    )
}

export default memo(BiomarkerProfile)
