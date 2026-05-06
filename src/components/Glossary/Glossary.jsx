import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { CATEGORIES, GLOSSARY } from './glossaryData'
import './Glossary.scss'

// ── Category icon map ────────────────────────────────────────────────────────
const CAT_ICONS = {
    dti:      '📐',
    anatomy:  '🧠',
    parcell:  '🗂',
    shape:    '📏',
    methods:  '⚙️',
    stats:    '📊',
    clinical: '🏥',
}

function TermCard({ entry, isOpen, onToggle }) {
    return (
        <div className={`gls-card${isOpen ? ' gls-card--open' : ''}`} id={`gls-${entry.id}`}>
            <button className='gls-card-header' onClick={onToggle}>
                <span className='gls-card-term'>{entry.term}</span>
                {entry.unit && <span className='gls-card-unit'>{entry.unit}</span>}
                <span className='gls-card-chevron'>{isOpen ? '▲' : '▼'}</span>
            </button>

            <p className='gls-card-short'>{entry.short}</p>

            {isOpen && (
                <div className='gls-card-body'>
                    {entry.body.split('\n\n').map((para, i) => (
                        <p key={i}>{para.trim()}</p>
                    ))}
                    {entry.ref && (
                        <p className='gls-card-ref'>📖 {entry.ref}</p>
                    )}
                </div>
            )}
        </div>
    )
}

export default function Glossary({ onClose }) {
    const [activeCat,  setActiveCat]  = useState('all')
    const [query,      setQuery]      = useState('')
    const [openId,     setOpenId]     = useState(null)
    const overlayRef = useRef(null)
    const inputRef   = useRef(null)

    // Focus search on open
    useEffect(() => { inputRef.current?.focus() }, [])

    // Close on Escape
    useEffect(() => {
        function onKey(e) { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return GLOSSARY.filter(e => {
            const matchCat = activeCat === 'all' || e.category === activeCat
            const matchQ   = !q
                || e.term.toLowerCase().includes(q)
                || e.short.toLowerCase().includes(q)
                || e.body.toLowerCase().includes(q)
            return matchCat && matchQ
        })
    }, [activeCat, query])

    const toggle = useCallback(id => {
        setOpenId(prev => prev === id ? null : id)
    }, [])

    function handleOverlayClick(e) {
        if (e.target === overlayRef.current) onClose()
    }

    return (
        <div className='gls-overlay' ref={overlayRef} onClick={handleOverlayClick}>
            <div className='gls-modal' role='dialog' aria-label='Glossary'>

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className='gls-header'>
                    <span className='gls-title'>📖 Glossary</span>
                    <input
                        ref={inputRef}
                        className='gls-search'
                        placeholder='Search terms, metrics, methods…'
                        value={query}
                        onChange={e => { setQuery(e.target.value); setOpenId(null) }}
                    />
                    <button className='gls-close' onClick={onClose} title='Close (Esc)'>✕</button>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className='gls-body'>

                    {/* Category sidebar */}
                    <nav className='gls-sidebar'>
                        <button
                            className={`gls-cat${activeCat === 'all' ? ' gls-cat--active' : ''}`}
                            onClick={() => { setActiveCat('all'); setOpenId(null) }}
                        >
                            <span className='gls-cat-icon'>🔍</span>
                            <span className='gls-cat-label'>All ({GLOSSARY.length})</span>
                        </button>
                        {CATEGORIES.map(cat => {
                            const count = GLOSSARY.filter(e => e.category === cat.id).length
                            return (
                                <button
                                    key={cat.id}
                                    className={`gls-cat${activeCat === cat.id ? ' gls-cat--active' : ''}`}
                                    onClick={() => { setActiveCat(cat.id); setOpenId(null) }}
                                >
                                    <span className='gls-cat-icon'>{CAT_ICONS[cat.id]}</span>
                                    <span className='gls-cat-label'>{cat.label}</span>
                                    <span className='gls-cat-count'>{count}</span>
                                </button>
                            )
                        })}
                    </nav>

                    {/* Term cards */}
                    <div className='gls-content'>
                        {filtered.length === 0 ? (
                            <div className='gls-empty'>
                                No terms found{query ? ` for "${query}"` : ''}.
                            </div>
                        ) : (
                            filtered.map(entry => (
                                <TermCard
                                    key={entry.id}
                                    entry={entry}
                                    isOpen={openId === entry.id}
                                    onToggle={() => toggle(entry.id)}
                                />
                            ))
                        )}
                    </div>

                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className='gls-footer'>
                    {filtered.length} term{filtered.length !== 1 ? 's' : ''}
                    {query && ` matching "${query}"`}
                    {activeCat !== 'all' && !query && ` in ${CATEGORIES.find(c => c.id === activeCat)?.label}`}
                    <span className='gls-footer-hint'>Click any term to expand · Press Esc to close</span>
                </div>
            </div>
        </div>
    )
}
