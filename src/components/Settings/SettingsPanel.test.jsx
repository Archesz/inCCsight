import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SettingsPanel from './SettingsPanel'
import { getSetting, resetSettings } from '../../settings/settings'

beforeEach(() => {
    try { localStorage.clear() } catch (_) {}
    resetSettings()
})

test('renders the settings sections', () => {
    render(<SettingsPanel />)
    expect(screen.getByText(/Appearance & accessibility/i)).toBeInTheDocument()
    expect(screen.getByText(/Analysis defaults/i)).toBeInTheDocument()
    expect(screen.getByText(/Scientific parameters/i)).toBeInTheDocument()
})

test('selecting the colour-blind palette persists the preference', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText(/Colourblind-safe/i))
    expect(getSetting('palette')).toBe('colorblind')
})
