// settings.js — single source of truth for per-user preferences.
//
// All preferences live under one localStorage key as a JSON object, merged
// over DEFAULTS so new keys added later get sensible values automatically.
// Components read with getSetting()/loadSettings() at render and write with
// saveSettings(patch). A 'inccsight:settings-changed' window event is emitted
// on every save so live consumers (e.g. the theme) can react without a reload.

const KEY = 'inccsight.settings'

export const DEFAULTS = {
    // ── Appearance & accessibility ─────────────────────────────────────────
    theme:    'light',      // 'light' | 'dark'
    palette:  'default',    // 'default' | 'colorblind'
    decimals: 4,            // decimal places in tables (2–6)

    // ── Analysis defaults (pre-fill the landing screen / dashboard) ────────
    defaultMethods:      ['roqs', 'watershed', 'cnn'],  // pre-checked on Input
    defaultSkipTract:    false,
    defaultSegMethod:    'ROQS_scalar',   // dashboard default method
    defaultScalar:       'FA',            // FA | MD | RD | AD
    defaultParcellation: 'Witelson',      // Witelson | Hofer | Chao | Cover | Freesurfer
    defaultChartType:    'box',           // box | violin | bar
    tutorialOnStartup:   true,

    // ── Scientific parameters ──────────────────────────────────────────────
    qcThreshold: 0.5,       // P(incorrect) > threshold → QC FAIL (re-derived client-side)
    cnnDevice:   'auto',    // auto | cpu | gpu (passed to the pipeline)

    // ── Language & infrastructure ──────────────────────────────────────────
    language:     'en',     // 'en' | 'pt'
    apiUrl:       '',       // runtime override of REACT_APP_API_URL ('' = same origin)
    csvDelimiter: ',',      // ',' | ';'
}

let _cache = null

function _read() {
    if (_cache) return _cache
    let stored = {}
    try {
        const raw = localStorage.getItem(KEY)
        if (raw) stored = JSON.parse(raw)
    } catch (_) {}

    // One-time migration of the legacy standalone tutorial flag.
    if (stored.tutorialOnStartup === undefined) {
        try {
            const legacy = localStorage.getItem('inccsight.tutorial.enabled')
            if (legacy !== null) stored.tutorialOnStartup = legacy === '1'
        } catch (_) {}
    }

    _cache = { ...DEFAULTS, ...stored }
    return _cache
}

export function loadSettings() {
    return { ..._read() }
}

export function getSetting(key) {
    const v = _read()[key]
    return v === undefined ? DEFAULTS[key] : v
}

export function saveSettings(patch) {
    const next = { ..._read(), ...patch }
    _cache = next
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('inccsight:settings-changed', { detail: next })) } catch (_) {}
    return next
}

export function resetSettings() {
    _cache = { ...DEFAULTS }
    try { localStorage.setItem(KEY, JSON.stringify(_cache)) } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('inccsight:settings-changed', { detail: _cache })) } catch (_) {}
    return { ..._cache }
}

// ── Convenience helpers used across the app ────────────────────────────────

export function apiBase() {
    const override = getSetting('apiUrl')
    if (override && override.trim()) return override.trim().replace(/\/$/, '')
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL
    // In dev the CRA proxy buffers SSE, so talk to Express (:3001) directly.
    if (process.env.NODE_ENV === 'development') {
        try { return `http://${window.location.hostname}:3001` } catch (_) {}
    }
    return ''
}

export function applyTheme(theme = getSetting('theme')) {
    try { document.documentElement.setAttribute('data-theme', theme) } catch (_) {}
}

// Theme-aware colours for Plotly charts. Spread into a chart layout, e.g.:
//   const PT = plotTheme()
//   layout={{ paper_bgcolor: PT.paper, plot_bgcolor: PT.plot, font: { color: PT.font }, ... }}
// Read at render time so charts pick up the theme when the dashboard mounts.
export function plotTheme() {
    const dark = getSetting('theme') === 'dark'
    return {
        paper:    'transparent',
        plot:     dark ? '#141c2b' : '#fafbff',
        font:     dark ? '#c3cce0' : '#333333',
        grid:     dark ? '#2a344a' : '#eeeeee',
        zeroline: dark ? '#3a445e' : '#cccccc',
    }
}

// ── Derived helpers ────────────────────────────────────────────────────────

// Re-derive a QC PASS/FAIL decision from the stored probability using the
// user's threshold. Falls back to the pipeline's stored flag when no prob.
export function qcFail(q) {
    if (!q) return false
    if (typeof q.prob === 'number') return q.prob > getSetting('qcThreshold')
    return q.flag === true
}

// Format a number with the user's decimal-place preference (or an override).
export function fmtNum(v, decimals) {
    if (v == null || v === '' || isNaN(Number(v))) return '—'
    const d = decimals == null ? getSetting('decimals') : decimals
    return Number(v).toFixed(d)
}

// Build a CSV string honouring the user's delimiter, with RFC-4180 escaping.
export function buildCsv(rows, { header, bom = true } = {}) {
    const delim = getSetting('csvDelimiter') || ','
    const esc = v => {
        if (v == null) return ''
        const s = String(v)
        return new RegExp(`["${delim === ';' ? ';' : ','}\\r\\n]`).test(s)
            ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = []
    if (header) lines.push(header.map(esc).join(delim))
    for (const row of rows) lines.push(row.map(esc).join(delim))
    return (bom ? '﻿' : '') + lines.join('\n')
}
