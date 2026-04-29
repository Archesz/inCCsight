import React, { useState } from 'react'
import Plot from 'react-plotly.js'
import './Radar.scss'

const COLORS = {
    ROQS:      '#636EFA',
    Watershed: '#EF553B',
    CNN:       '#00CC96',
}

const PARC_COLORS = {
    Witelson:   '#636EFA',
    Hofer:      '#EF553B',
    Chao:       '#00CC96',
    Cover:      '#AB63FA',
    Freesurfer: '#FFA15A',
}

const PARTS      = ['P1', 'P2', 'P3', 'P4', 'P5']
const PARC_METHS = ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']
const SCALARS    = ['FA', 'RD', 'AD', 'MD']

// ── helpers ────────────────────────────────────────────────────────────────

function getMeanValue(subjects, segmKey, parcMethod, scalar, part) {
    const name   = `${parcMethod}_${scalar}_${part}`
    const values = subjects
        .filter(s => s[segmKey] && s[segmKey][name] != null)
        .map(s => Number(s[segmKey][name]))
    if (values.length === 0) return 0
    return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(6))
}

function getAllValues(subjects, segmKey, parcMethod, scalar) {
    return PARTS.map(p => getMeanValue(subjects, segmKey, parcMethod, scalar, p))
}

function applyNormalization(arrays) {
    const max = Math.max(...arrays.flat())
    if (max === 0) return arrays
    return arrays.map(arr => arr.map(v => parseFloat((v / max).toFixed(6))))
}

function hasData(subjects, segmKey) {
    return subjects.some(s => {
        const d = s[segmKey]
        if (!d) return false
        const vals = Object.values(d)
        return vals.length > 0 && vals.some(v => v != null && v !== '' && v !== 0)
    })
}

// ── Controles reutilizáveis ────────────────────────────────────────────────

function ControlRow({ children }) {
    return <div className='radar-controls'>{children}</div>
}

function SelectField({ label, value, onChange, options }) {
    return (
        <div className='radar-select-group'>
            <label>{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}>
                {options.map(o => (
                    <option key={o.value ?? o} value={o.value ?? o}>
                        {o.label ?? o}
                    </option>
                ))}
            </select>
        </div>
    )
}

function CheckField({ label, checked, onChange }) {
    return (
        <div className='radar-select-group radar-check'>
            <label>{label}</label>
            <input type='checkbox' checked={checked} onChange={e => onChange(e.target.checked)} />
        </div>
    )
}

const THETA = [...PARTS, PARTS[0]]

// ── Gráfico 1: fixar parcelamento → comparar segmentações ─────────────────

function RadarBySegmentation({ data }) {
    const [parcMethod, setParcMethod] = useState('Witelson')
    const [scalar,     setScalar]     = useState('FA')
    const [normalized, setNormalized] = useState(false)

    const hasCNN = hasData(data, 'CNN_parcellation')

    const traces = [
        { key: 'Watershed_parcellation', label: 'Watershed', color: COLORS.Watershed },
        { key: 'ROQS_parcellation',      label: 'ROQS',      color: COLORS.ROQS      },
        ...(hasCNN ? [{ key: 'CNN_parcellation', label: 'CNN', color: COLORS.CNN }] : []),
    ]

    let arrays = traces.map(({ key }) => getAllValues(data, key, parcMethod, scalar))
    if (normalized) arrays = applyNormalization(arrays)

    const plotData = traces.map(({ label, color }, i) => ({
        type:  'scatterpolar',
        r:     [...arrays[i], arrays[i][0]],
        theta: THETA,
        fill:  'toself',
        name:  label,
        line:  { color },
    }))

    const layout = {
        title:  { text: 'Segmentações por Parcelamento', font: { size: 14 } },
        legend: { orientation: 'h' },
        polar:  { radialaxis: { visible: true, title: normalized ? 'Norm.' : scalar } },
        margin: { t: 48, l: 32, r: 32, b: 8 },
        height: 380,
    }

    return (
        <div className='radar-block'>
            <Plot
                data={plotData}
                layout={layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
                useResizeHandler
            />
            <ControlRow>
                <SelectField
                    label='Parcelamento'
                    value={parcMethod}
                    onChange={setParcMethod}
                    options={PARC_METHS}
                />
                <SelectField
                    label='Escalar'
                    value={scalar}
                    onChange={setScalar}
                    options={SCALARS}
                />
                <CheckField
                    label='Normalizar (0–1)'
                    checked={normalized}
                    onChange={setNormalized}
                />
            </ControlRow>
        </div>
    )
}

// ── Gráfico 2: fixar segmentação → comparar parcelamentos ─────────────────

function RadarByParcellation({ data }) {
    const hasCNN = hasData(data, 'CNN_parcellation')

    const segmOptions = [
        { value: 'ROQS_parcellation',      label: 'ROQS'      },
        { value: 'Watershed_parcellation', label: 'Watershed' },
        ...(hasCNN ? [{ value: 'CNN_parcellation', label: 'CNN' }] : []),
    ]

    const [segmKey,    setSegmKey]    = useState('ROQS_parcellation')
    const [scalar,     setScalar]     = useState('FA')
    const [normalized, setNormalized] = useState(false)

    // garante que segmKey seja sempre uma opção válida
    const validKey = segmOptions.some(o => o.value === segmKey)
        ? segmKey
        : segmOptions[0].value

    let arrays = PARC_METHS.map(pm => getAllValues(data, validKey, pm, scalar))
    if (normalized) arrays = applyNormalization(arrays)

    const plotData = PARC_METHS.map((pm, i) => ({
        type:  'scatterpolar',
        r:     [...arrays[i], arrays[i][0]],
        theta: THETA,
        fill:  'toself',
        name:  pm,
        line:  { color: PARC_COLORS[pm] },
    }))

    const layout = {
        title:  { text: 'Parcelamentos por Segmentação', font: { size: 14 } },
        legend: { orientation: 'h' },
        polar:  { radialaxis: { visible: true, title: normalized ? 'Norm.' : scalar } },
        margin: { t: 48, l: 32, r: 32, b: 8 },
        height: 380,
    }

    return (
        <div className='radar-block'>
            <Plot
                data={plotData}
                layout={layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
                useResizeHandler
            />
            <ControlRow>
                <SelectField
                    label='Segmentação'
                    value={validKey}
                    onChange={v => setSegmKey(v)}
                    options={segmOptions}
                />
                <SelectField
                    label='Escalar'
                    value={scalar}
                    onChange={setScalar}
                    options={SCALARS}
                />
                <CheckField
                    label='Normalizar (0–1)'
                    checked={normalized}
                    onChange={setNormalized}
                />
            </ControlRow>
        </div>
    )
}

// ── Raiz ──────────────────────────────────────────────────────────────────

function Radar(props) {
    return (
        <div className='radar-container'>
            <RadarBySegmentation data={props.data} />
            <RadarByParcellation data={props.data} />
        </div>
    )
}

export default Radar
