import React, { useState, useRef, useCallback } from 'react'
import VolumetricCell from '../../graphs/Volume/VolumetricCell'
import './VolumetricCompare.scss'

const PRESET_KEYS = ['Anatomical', 'Scientific', 'Thermal']

const WITELSON_META = [
    { label: 'W1 Anterior',  hex: '#636EFA' },
    { label: 'W2 Mid-ant.',  hex: '#00CC96' },
    { label: 'W3 Central',   hex: '#FFA15A' },
    { label: 'W4 Mid-post.', hex: '#AB63FA' },
    { label: 'W5 Posterior', hex: '#EF553B' },
]

function cnnPath(subject) {
    if (!subject?.img_path) return null
    const dir = subject.img_path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    return dir + '/cnnBased.nii.gz'
}

export default function VolumetricCompare({ subjects }) {
    const [slots,      setSlots]      = useState(['', '', '', ''])
    const [opacity,    setOpacity]    = useState(1.0)
    const [matName,    setMatName]    = useState('Anatomical')
    const [smoothIter, setSmoothIter] = useState(0)
    const [wireframe,  setWireframe]  = useState(false)
    const [showLabels, setShowLabels] = useState(true)
    const [colorMode,  setColorMode]  = useState('preset')

    const cellRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]

    // Broadcast camera state from the interacted cell to all other cells
    const handleCameraMove = useCallback((srcIdx, pos, quat, target) => {
        for (let i = 0; i < 4; i++) {
            if (i !== srcIdx) cellRefs[i].current?.applyCamera(pos, quat, target)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleResetAll = () => cellRefs.forEach(r => r.current?.resetCamera())

    const setSlot = (i, id) => setSlots(prev => { const n = [...prev]; n[i] = id; return n })

    const subjectsWithPath = subjects.filter(s => s.img_path)

    return (
        <div className='vol-compare'>

            {/* ── Shared controls ─────────────────────────────────────────── */}
            <div className='vol-compare-controls'>

                <div className='ctrl-group'>
                    <label>Color</label>
                    <div className='ctrl-pills'>
                        {PRESET_KEYS.map(m => (
                            <button key={m}
                                className={`ctrl-pill${colorMode === 'preset' && matName === m ? ' active' : ''}`}
                                onClick={() => { setColorMode('preset'); setMatName(m) }}
                            >{m}</button>
                        ))}
                        <button
                            className={`ctrl-pill${colorMode === 'parcellation' ? ' active' : ''}`}
                            onClick={() => setColorMode('parcellation')}
                            title='Witelson 5-region AP parcellation'
                        >Witelson</button>
                    </div>
                    {colorMode === 'parcellation' && (
                        <div className='tract-legend'>
                            {WITELSON_META.map((w, i) => (
                                <span key={i} className='tract-legend-item'>
                                    <span className='tract-legend-dot' style={{ background: w.hex }} />
                                    {w.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className='ctrl-group'>
                    <label>Smoothing</label>
                    <div className='ctrl-pills'>
                        {[
                            { label: 'Off',  val: 0  },
                            { label: 'Low',  val: 3  },
                            { label: 'Med',  val: 8  },
                            { label: 'High', val: 20 },
                        ].map(({ label, val }) => (
                            <button key={val}
                                className={`ctrl-pill${smoothIter === val ? ' active' : ''}`}
                                onClick={() => setSmoothIter(val)}
                            >{label}</button>
                        ))}
                    </div>
                </div>

                <div className='ctrl-group'>
                    <label>Opacity: {Math.round(opacity * 100)}%</label>
                    <input type='range' min={0.15} max={1.0} step={0.05}
                        value={opacity}
                        onChange={e => setOpacity(parseFloat(e.target.value))}
                    />
                </div>

                <div className='ctrl-group'>
                    <label className='ctrl-check'>
                        <input type='checkbox' checked={wireframe}
                            onChange={e => setWireframe(e.target.checked)} />
                        Wireframe
                    </label>
                </div>

                <div className='ctrl-group'>
                    <label className='ctrl-check'>
                        <input type='checkbox' checked={showLabels}
                            onChange={e => setShowLabels(e.target.checked)} />
                        A/P/L/R/S/I
                    </label>
                </div>

                <div className='ctrl-group ctrl-group--right'>
                    <button className='ctrl-pill ctrl-reset' onClick={handleResetAll}>
                        ↺ Reset all
                    </button>
                </div>

            </div>

            {/* ── 2×2 grid ────────────────────────────────────────────────── */}
            <div className='vol-compare-grid'>
                {slots.map((slotId, i) => {
                    const subject  = slotId ? subjects.find(s => s['Id'] === slotId) : null
                    const filePath = subject ? cnnPath(subject) : null
                    return (
                        <div key={i} className='vol-compare-cell'>
                            <div className='vol-compare-cell-header'>
                                <select
                                    value={slotId}
                                    onChange={e => setSlot(i, e.target.value)}
                                    className='vol-compare-select'
                                >
                                    <option value=''>— select subject —</option>
                                    {subjectsWithPath.map(s => (
                                        <option key={s['Id']} value={s['Id']}>{s['Id']}</option>
                                    ))}
                                </select>
                            </div>
                            <VolumetricCell
                                ref={cellRefs[i]}
                                filePath={filePath}
                                label={slotId}
                                opacity={opacity}
                                matName={matName}
                                smoothIter={smoothIter}
                                wireframe={wireframe}
                                showLabels={showLabels}
                                colorMode={colorMode}
                                onCameraMove={(pos, quat, target) => handleCameraMove(i, pos, quat, target)}
                            />
                        </div>
                    )
                })}
            </div>

        </div>
    )
}
