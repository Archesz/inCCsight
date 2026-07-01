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
    return process.env.REACT_APP_API_URL || ''
}

export function applyTheme(theme = getSetting('theme')) {
    try { document.documentElement.setAttribute('data-theme', theme) } catch (_) {}
}
