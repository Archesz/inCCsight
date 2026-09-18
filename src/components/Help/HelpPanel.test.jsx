import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import HelpPanel from './HelpPanel'

test('renders the help panel with quick-start and FAQ', () => {
    render(<HelpPanel />)
    expect(screen.getByText(/Help & Getting Started/i)).toBeInTheDocument()
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument()
    // a known FAQ question is present
    expect(screen.getByText(/How do I add data\?/i)).toBeInTheDocument()
})

test('FAQ search filters the questions', () => {
    render(<HelpPanel />)
    fireEvent.change(screen.getByPlaceholderText(/Search help/i), {
        target: { value: 'demographics' },
    })
    expect(screen.getByText(/Can I add demographics\?/i)).toBeInTheDocument()
    // an unrelated question is filtered out
    expect(screen.queryByText(/How do I add data\?/i)).not.toBeInTheDocument()
})
