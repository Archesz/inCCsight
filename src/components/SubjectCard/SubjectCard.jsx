import React from 'react'
import './SubjectCard.scss'

// Worst-case QC across all methods: any FAIL → fail dot
function qcSummary(qc) {
    if (!qc) return { cls: 'qc-dot qc-na', title: 'QC N/A' }

    const methods = ['ROQS', 'Watershed', 'CNN']
    const entries = methods
        .map(m => ({ method: m, q: qc[m] }))
        .filter(({ q }) => q && q.flag != null)

    if (entries.length === 0) return { cls: 'qc-dot qc-na', title: 'QC N/A' }

    const hasFail = entries.some(({ q }) => q.flag === true)
    const cls     = hasFail ? 'qc-dot qc-fail' : 'qc-dot qc-pass'
    const lines   = entries.map(({ method, q }) => {
        const label = q.flag ? 'FAIL' : 'PASS'
        const pct   = q.prob != null ? ` (${(q.prob * 100).toFixed(1)}%)` : ''
        return `${method}: ${label}${pct}`
    })
    return { cls, title: lines.join(' | ') }
}

function SubjectCard(props) {
    const style = props.groupColor
        ? { borderLeft: `3px solid ${props.groupColor}` }
        : {}

    const { cls, title } = qcSummary(props.qc)

    return (
        <div className='subject-card' id={props.id} style={style} onClick={() => {props.onClick(props.name)}}>
            {props.name}
            {props.qc !== undefined && <span className={cls} title={title} />}
        </div>
    )
}

export default SubjectCard