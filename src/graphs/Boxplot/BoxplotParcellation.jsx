import React, { useState, useMemo, memo } from 'react'
import Boxplot from './Boxplot'
import './BoxplotParcellation.scss'

const PARC_METHODS = ["Witelson", "Hofer", "Chao", "Cover", "Freesurfer"]
const SCALARS      = ["FA", "RD", "AD", "MD"]
const PARTS        = ["P1", "P2", "P3", "P4", "P5"]

function getScalarValues(subjects, method, parc_method, scalar, part) {
    const name = `${parc_method}_${scalar}_${part}`
    return subjects.map(s => {
        const d = s[method]
        return d && d[name] != null ? Number(d[name]) : null
    }).filter(v => v !== null)
}

function hasData(subjects, key) {
    return subjects.some(s => {
        const d = s[key]
        if (!d) return false
        return Object.values(d).some(v => v != null && v !== '' && Number(v) !== 0)
    })
}

function BoxplotParcellation(props) {
    const [methodParcellation, setMethodParcellation] = useState("Witelson")
    const [scalarParcellation, setScalarParcellation] = useState("FA")
    const [normalize,          setNormalize]          = useState(false)

    const ids    = props.data.map(s => s["Id"])
    const hasCNN = hasData(props.data, "CNN_parcellation")

    // Global min/max per part across all segmentation methods
    const normFactors = useMemo(() => Object.fromEntries(PARTS.map(part => {
        const vals = [
            ...getScalarValues(props.data, "Watershed_parcellation", methodParcellation, scalarParcellation, part),
            ...getScalarValues(props.data, "ROQS_parcellation",      methodParcellation, scalarParcellation, part),
            ...(hasCNN ? getScalarValues(props.data, "CNN_parcellation", methodParcellation, scalarParcellation, part) : []),
        ]
        if (!vals.length) return [part, null]
        return [part, { mn: Math.min(...vals), mx: Math.max(...vals) }]
    })), [props.data, methodParcellation, scalarParcellation, hasCNN])

    const applyNorm = (values, part) => {
        if (!normalize || !normFactors[part]) return values
        const { mn, mx } = normFactors[part]
        return mx === mn ? values.map(() => 0) : values.map(v => (v - mn) / (mx - mn))
    }

    return (
        <div className='boxplot-container'>
            <div className='bpp-toolbar'>
                <span className='bpp-scale-label'>Scale:</span>
                <button
                    className={`bpp-pill${!normalize ? ' active' : ''}`}
                    onClick={() => setNormalize(false)}
                    title='Show raw values'>
                    Raw
                </button>
                <button
                    className={`bpp-pill${normalize ? ' active' : ''}`}
                    onClick={() => setNormalize(true)}
                    title='Min-max normalize each part to [0–1]'>
                    Normalize [0–1]
                </button>
            </div>

            <div className='options-row'>
                <div className='select-group'>
                    <label>Parcellation</label>
                    <select onChange={e => setMethodParcellation(e.target.value)}>
                        {PARC_METHODS.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
                <div className='select-group'>
                    <label>Scalar</label>
                    <select onChange={e => setScalarParcellation(e.target.value)}>
                        {SCALARS.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='boxplot-row'>
                {PARTS.map(part => (
                    <Boxplot
                        key={part}
                        title={part}
                        ids={ids}
                        watershed={applyNorm(getScalarValues(props.data, "Watershed_parcellation", methodParcellation, scalarParcellation, part), part)}
                        roqs={applyNorm(getScalarValues(props.data, "ROQS_parcellation", methodParcellation, scalarParcellation, part), part)}
                        cnn={hasCNN
                            ? applyNorm(getScalarValues(props.data, "CNN_parcellation", methodParcellation, scalarParcellation, part), part)
                            : undefined
                        }
                        yRange={normalize ? [0, 1] : null}
                    />
                ))}
            </div>
        </div>
    )
}

export default memo(BoxplotParcellation)
