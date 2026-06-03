import React, { useState, useMemo } from 'react'
import Boxplot from './Boxplot'
import './BoxplotSegmentation.scss'

const SCALARS = ['FA', 'MD', 'RD', 'AD']
const METHODS = [
    { key: 'ROQS_scalar',      prop: 'roqs'      },
    { key: 'Watershed_scalar', prop: 'watershed'  },
    { key: 'CNN_scalar',       prop: 'cnn'        },
]

function getScalarValues(data, method, scalar) {
    return data
        .map(subject => {
            const v = subject[method]?.[scalar]
            return v != null && !isNaN(Number(v)) ? parseFloat(Number(v).toFixed(6)) : null
        })
        .filter(v => v !== null)
}

function BoxplotSegmentation({ data }) {
    const [normalize, setNormalize] = useState(false)
    const ids = data.map(s => s['Id'])

    // Global min/max per scalar across ALL segmentation methods
    const normFactors = useMemo(() => Object.fromEntries(SCALARS.map(sc => {
        const vals = METHODS.flatMap(({ key }) => getScalarValues(data, key, sc))
        if (!vals.length) return [sc, null]
        return [sc, { mn: Math.min(...vals), mx: Math.max(...vals) }]
    })), [data])

    const applyNorm = (values, sc) => {
        if (!normalize || !normFactors[sc]) return values
        const { mn, mx } = normFactors[sc]
        return mx === mn ? values.map(() => 0) : values.map(v => (v - mn) / (mx - mn))
    }

    return (
        <div className='boxplot-container'>
            <div className='bps-toolbar'>
                <span className='bps-scale-label'>Scale:</span>
                <button
                    className={`bps-pill${!normalize ? ' active' : ''}`}
                    onClick={() => setNormalize(false)}
                    title='Show raw values per scalar'>
                    Raw
                </button>
                <button
                    className={`bps-pill${normalize ? ' active' : ''}`}
                    onClick={() => setNormalize(true)}
                    title='Min-max normalize each scalar to [0–1] — makes all 4 charts share the same Y scale'>
                    Normalize [0–1]
                </button>
            </div>
            <div className='boxplot-row'>
                {SCALARS.map(sc => (
                    <Boxplot
                        key={sc}
                        title={sc}
                        ids={ids}
                        roqs={applyNorm(getScalarValues(data, 'ROQS_scalar', sc), sc)}
                        watershed={applyNorm(getScalarValues(data, 'Watershed_scalar', sc), sc)}
                        cnn={applyNorm(getScalarValues(data, 'CNN_scalar', sc), sc)}
                        yRange={normalize ? [0, 1] : null}
                    />
                ))}
            </div>
        </div>
    )
}

export default BoxplotSegmentation
