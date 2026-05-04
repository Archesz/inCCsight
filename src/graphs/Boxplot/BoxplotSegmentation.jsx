import React from 'react'
import Boxplot from './Boxplot'
import './BoxplotSegmentation.scss'

function getScalarValues(data, method, scalar) {
    return data
        .map(subject => {
            const v = subject[method]?.[scalar]
            return v != null && !isNaN(Number(v)) ? parseFloat(Number(v).toFixed(6)) : null
        })
        .filter(v => v !== null)
}

function BoxplotSegmentation(props) {
    const ids = props.data.map(s => s["Id"])

    return (
        <div className='boxplot-container'>
            <div className='boxplot-row'>
                {["FA", "MD", "RD", "AD"].map(scalar => (
                    <Boxplot
                        key={scalar}
                        title={scalar}
                        ids={ids}
                        watershed={getScalarValues(props.data, "Watershed_scalar", scalar)}
                        roqs={getScalarValues(props.data, "ROQS_scalar", scalar)}
                        cnn={getScalarValues(props.data, "CNN_scalar", scalar)}
                    />
                ))}
            </div>
        </div>
    )
}

export default BoxplotSegmentation
