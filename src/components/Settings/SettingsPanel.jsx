import React, { useState } from 'react'
import './SettingsPanel.scss'
import { loadSettings, saveSettings, resetSettings, applyTheme } from '../../settings/settings'
import { PALETTES } from '../../settings/palettes'

// Pipeline methods (mirror of the Input screen)
const METHODS = [
    { id: 'roqs',      label: 'ROQS (2D)'      },
    { id: 'watershed', label: 'Watershed (2D)' },
    { id: 'cnn',       label: 'CNN (3D)'       },
]
const SCALARS       = ['FA', 'MD', 'RD', 'AD']
const SEG_METHODS   = [
    { value: 'ROQS_scalar',      label: 'ROQS'      },
    { value: 'Watershed_scalar', label: 'Watershed' },
    { value: 'CNN_scalar',       label: 'CNN'       },
]
const PARC_METHODS  = ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']
const CHART_TYPES   = [
    { value: 'box',    label: 'Box'    },
    { value: 'violin', label: 'Violin' },
    { value: 'bar',    label: 'Bar'    },
]

// ── Small presentational helpers ────────────────────────────────────────────
function Row({ label, hint, children }) {
    return (
        <div className='set-row'>
            <div className='set-row-label'>
                <span>{label}</span>
                {hint && <span className='set-hint'>{hint}</span>}
            </div>
            <div className='set-row-control'>{children}</div>
        </div>
    )
}

function Section({ title, badge, children }) {
    return (
        <div className='set-section'>
            <div className='set-section-title'>
                {title}
                {badge && <span className='set-badge'>{badge}</span>}
            </div>
            {children}
        </div>
    )
}

function Toggle({ checked, onChange }) {
    return (
        <button
            className={`set-toggle${checked ? ' on' : ''}`}
            onClick={() => onChange(!checked)}
            role='switch'
            aria-checked={checked}
        >
            <span className='set-toggle-knob' />
        </button>
    )
}

function SettingsPanel() {
    const [s, setS] = useState(loadSettings)
    const [savedFlash, setSavedFlash] = useState(false)

    function update(patch) {
        const next = saveSettings(patch)
        setS({ ...next })
        if ('theme' in patch) applyTheme(patch.theme)
        setSavedFlash(true)
        clearTimeout(update._t)
        update._t = setTimeout(() => setSavedFlash(false), 1100)
    }

    function toggleMethod(id) {
        const set = new Set(s.defaultMethods)
        set.has(id) ? set.delete(id) : set.add(id)
        update({ defaultMethods: [...set] })
    }

    function handleReset() {
        const next = resetSettings()
        setS({ ...next })
    }

    return (
        <div className='settings-panel'>
            <div className='set-head'>
                <span className='enter-name'>Preferences that personalise the tool for each user.</span>
                <span className={`set-saved${savedFlash ? ' show' : ''}`}>✓ Saved</span>
            </div>

            {/* ── Appearance & accessibility ─────────────────────────────── */}
            <Section title='Appearance & accessibility'>
                <Row label='Group colour palette' hint='Used in every group-coloured chart'>
                    <div className='set-pills'>
                        {Object.keys(PALETTES).map(p => (
                            <button
                                key={p}
                                className={`set-pill${s.palette === p ? ' active' : ''}`}
                                onClick={() => update({ palette: p })}
                            >
                                <span className='set-swatches'>
                                    {PALETTES[p].slice(0, 5).map((c, i) => (
                                        <span key={i} className='set-swatch' style={{ background: c }} />
                                    ))}
                                </span>
                                {p === 'default' ? 'Default' : 'Colourblind-safe'}
                            </button>
                        ))}
                    </div>
                </Row>
                <Row label='Theme' hint='Light / Dark'>
                    <div className='set-pills'>
                        {[{ v: 'light', l: '☀ Light' }, { v: 'dark', l: '🌙 Dark' }].map(o => (
                            <button
                                key={o.v}
                                className={`set-pill${s.theme === o.v ? ' active' : ''}`}
                                onClick={() => update({ theme: o.v })}
                            >
                                {o.l}
                            </button>
                        ))}
                    </div>
                </Row>
                <Row label='Decimal places in tables' hint='Numeric precision'>
                    <select value={s.decimals} onChange={e => update({ decimals: parseInt(e.target.value, 10) })}>
                        {[2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </Row>
            </Section>

            {/* ── Analysis defaults ──────────────────────────────────────── */}
            <Section title='Analysis defaults'>
                <Row label='Pre-selected methods' hint='Checked by default on the Select-data screen'>
                    <div className='set-pills'>
                        {METHODS.map(m => (
                            <button
                                key={m.id}
                                className={`set-pill${s.defaultMethods.includes(m.id) ? ' active' : ''}`}
                                onClick={() => toggleMethod(m.id)}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </Row>
                <Row label='Default scalar' hint='Pre-selected in the dashboard charts'>
                    <select value={s.defaultScalar} onChange={e => update({ defaultScalar: e.target.value })}>
                        {SCALARS.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                </Row>
                <Row label='Default segmentation method'>
                    <select value={s.defaultSegMethod} onChange={e => update({ defaultSegMethod: e.target.value })}>
                        {SEG_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </Row>
                <Row label='Default parcellation scheme'>
                    <select value={s.defaultParcellation} onChange={e => update({ defaultParcellation: e.target.value })}>
                        {PARC_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Row>
                <Row label='Default chart type' hint='Group comparison distributions'>
                    <select value={s.defaultChartType} onChange={e => update({ defaultChartType: e.target.value })}>
                        {CHART_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </Row>
                <Row label='Show tutorial on startup'>
                    <Toggle checked={s.tutorialOnStartup} onChange={v => update({ tutorialOnStartup: v })} />
                </Row>
            </Section>

            {/* ── Scientific parameters ──────────────────────────────────── */}
            <Section title='Scientific parameters'>
                <Row label='QC PASS/FAIL threshold' hint='P(incorrect) above this = FAIL · applied live'>
                    <div className='set-slider'>
                        <input
                            type='range' min='0.05' max='0.95' step='0.05'
                            value={s.qcThreshold}
                            onChange={e => update({ qcThreshold: parseFloat(e.target.value) })}
                        />
                        <span className='set-slider-val'>{Number(s.qcThreshold).toFixed(2)}</span>
                    </div>
                </Row>
                <Row label='CNN compute device' hint='Used when running the pipeline'>
                    <select value={s.cnnDevice} onChange={e => update({ cnnDevice: e.target.value })}>
                        <option value='auto'>Auto</option>
                        <option value='cpu'>CPU</option>
                        <option value='gpu'>GPU (CUDA)</option>
                    </select>
                </Row>
            </Section>

            {/* ── Language & infrastructure ──────────────────────────────── */}
            <Section title='Language & infrastructure'>
                <Row label='Language'>
                    <div className='set-pills'>
                        {[{ v: 'en', l: 'English' }, { v: 'pt', l: 'Português' }].map(o => (
                            <button
                                key={o.v}
                                className={`set-pill${s.language === o.v ? ' active' : ''}`}
                                onClick={() => update({ language: o.v })}
                            >
                                {o.l}
                            </button>
                        ))}
                    </div>
                </Row>
                <Row label='Exported CSV delimiter' hint='Excel (pt-BR) expects “;”'>
                    <div className='set-pills'>
                        {[{ v: ',', l: 'Comma  ,' }, { v: ';', l: 'Semicolon  ;' }].map(o => (
                            <button
                                key={o.v}
                                className={`set-pill${s.csvDelimiter === o.v ? ' active' : ''}`}
                                onClick={() => update({ csvDelimiter: o.v })}
                            >
                                {o.l}
                            </button>
                        ))}
                    </div>
                </Row>
                <Row label='API endpoint' hint='Blank = same origin · reload to apply'>
                    <input
                        className='set-text'
                        type='text'
                        placeholder='e.g. http://localhost:3001'
                        value={s.apiUrl}
                        onChange={e => update({ apiUrl: e.target.value })}
                    />
                </Row>
            </Section>

            <div className='set-footer'>
                <button className='set-reset' onClick={handleReset}>↺ Reset to defaults</button>
                <span className='set-note'>Saved automatically · stored locally in this browser</span>
            </div>
        </div>
    )
}

export default SettingsPanel
