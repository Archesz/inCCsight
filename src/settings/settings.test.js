// Unit tests for the settings/logic module — pure functions, no DOM needed.
import {
    DEFAULTS, loadSettings, saveSettings, getSetting, resetSettings,
    qcFail, fmtNum, buildCsv, apiBase,
} from './settings'

beforeEach(() => {
    try { localStorage.clear() } catch (_) {}
    resetSettings()
})

describe('settings store', () => {
    test('exposes sensible defaults', () => {
        expect(DEFAULTS.qcThreshold).toBe(0.5)
        expect(DEFAULTS.decimals).toBe(4)
        expect(DEFAULTS.theme).toBe('light')
        expect(loadSettings().palette).toBe('default')
    })

    test('saveSettings / getSetting round-trip', () => {
        saveSettings({ decimals: 2, theme: 'dark' })
        expect(getSetting('decimals')).toBe(2)
        expect(getSetting('theme')).toBe('dark')
        // untouched keys keep their default
        expect(getSetting('palette')).toBe('default')
    })

    test('resetSettings restores defaults', () => {
        saveSettings({ decimals: 6 })
        resetSettings()
        expect(getSetting('decimals')).toBe(DEFAULTS.decimals)
    })
})

describe('qcFail — threshold re-derivation', () => {
    test('uses prob against the configured threshold', () => {
        saveSettings({ qcThreshold: 0.5 })
        expect(qcFail({ prob: 0.6 })).toBe(true)
        expect(qcFail({ prob: 0.4 })).toBe(false)
    })

    test('threshold change flips the decision', () => {
        saveSettings({ qcThreshold: 0.7 })
        expect(qcFail({ prob: 0.6 })).toBe(false)
        saveSettings({ qcThreshold: 0.5 })
        expect(qcFail({ prob: 0.6 })).toBe(true)
    })

    test('falls back to the stored flag when prob is absent', () => {
        expect(qcFail({ flag: true })).toBe(true)
        expect(qcFail({ flag: false })).toBe(false)
        expect(qcFail(null)).toBe(false)
    })
})

describe('fmtNum', () => {
    test('honours the decimals preference', () => {
        saveSettings({ decimals: 3 })
        expect(fmtNum(0.123456)).toBe('0.123')
        saveSettings({ decimals: 5 })
        expect(fmtNum(0.123456)).toBe('0.12346')
    })
    test('explicit decimals override the preference', () => {
        expect(fmtNum(1.23456, 2)).toBe('1.23')
    })
    test('non-numbers become a dash', () => {
        expect(fmtNum(null)).toBe('—')
        expect(fmtNum('')).toBe('—')
        expect(fmtNum('abc')).toBe('—')
    })
})

describe('buildCsv — delimiter + escaping', () => {
    test('uses the comma delimiter by default', () => {
        saveSettings({ csvDelimiter: ',' })
        const csv = buildCsv([['a', 'b']], { header: ['x', 'y'], bom: false })
        expect(csv).toBe('x,y\na,b')
    })
    test('respects the semicolon delimiter', () => {
        saveSettings({ csvDelimiter: ';' })
        const csv = buildCsv([['a', 'b']], { header: ['x', 'y'], bom: false })
        expect(csv).toBe('x;y\na;b')
    })
    test('quotes cells that contain the delimiter', () => {
        saveSettings({ csvDelimiter: ',' })
        const csv = buildCsv([['a,b', 'c']], { bom: false })
        expect(csv).toBe('"a,b",c')
    })
})

describe('apiBase', () => {
    test('honours a runtime override', () => {
        saveSettings({ apiUrl: 'http://example.test:1234/' })
        expect(apiBase()).toBe('http://example.test:1234')
    })
})
