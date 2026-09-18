import React, { useState, useEffect, useCallback } from 'react'
import './Tutorial.scss'

// ── Tour content ───────────────────────────────────────────────────────────────
// Each step is one slide in the guided walkthrough shown on the landing screen.
const STEPS = [
    {
        icon: '🧠',
        title: 'Welcome to InCCsight',
        body: [
            'InCCsight segments, quantifies and visualises the Corpus Callosum from Diffusion Tensor Imaging (DTI) data — all locally on your machine.',
            'This quick tour walks you through the whole workflow, from loading data to exploring the dashboard. Use Next / Back, or the ← → arrow keys. Press Esc to close at any time.',
        ],
    },
    {
        icon: '📂',
        title: '1 · Add your data',
        body: [
            'On the Select data screen, paste the absolute path to a group folder (e.g. C:\\data\\controls) or use Browse to pick it.',
            'Each sub-folder inside it should be one subject containing the DTI files (dti_L1–3, dti_V1–3).',
            'Give the group a name and click “+ Add group” to add more groups for comparison.',
        ],
    },
    {
        icon: '⚙️',
        title: '2 · Choose the methods',
        body: [
            'Pick the segmentation methods to run: ROQS (2D), Watershed (2D) and CNN (3D, requires PyTorch).',
            'A Vision-Transformer Quality-Control model scores every segmentation automatically.',
        ],
    },
    {
        icon: '▶️',
        title: '3 · Run the analysis',
        body: [
            'Click “Run analysis” to start the pipeline — a live log and a real progress bar show each step.',
            'Already analysed before? Use “Last analysis” to reload the previous results instantly.',
            'Just want to explore? Click “Demo data” to run a bundled example dataset.',
        ],
    },
    {
        icon: '🗂️',
        title: '4 · The dashboard & subject list',
        body: [
            'After the run you land on the dashboard. The left sidebar lists every subject — search by ID, filter by group, or click one to inspect it.',
            'Each subject shows a PASS / FAIL Quality-Control badge. The top bar lets you filter only the QC-flagged subjects.',
        ],
    },
    {
        icon: '📊',
        title: '5 · 2D Segmentation tab',
        body: [
            'Explore mean scalars (FA, MD, RD, AD), per-region parcellation, midline and thickness profiles, box plots, radars and scalar correlations.',
            'Tip: every chart has a “?” icon next to its title explaining what it shows.',
            'In charts with a legend you can click a colour to hide or show that series.',
        ],
    },
    {
        icon: '🧊',
        title: '6 · 3D Volumetric tab',
        body: [
            'Render the CNN corpus-callosum mask in interactive 3D. Drag to rotate, scroll to zoom.',
            'Switch material (Anatomical / Scientific / Thermal), adjust opacity and toggle wireframe. Anatomical orientation labels (A/P/L/R/S/I) help with bearings.',
        ],
    },
    {
        icon: '⚖️',
        title: '7 · Compare Groups',
        body: [
            'This tab appears automatically when you have two or more groups.',
            'Compare scalar distributions (box / violin / bar), thickness and midline profiles, per-region bars, shape metrics and a per-group statistics table — with raw or normalized [0–1] scales.',
        ],
    },
    {
        icon: '👥',
        title: '8 · Demographics',
        body: [
            'Drop a demograph.csv inside a group folder to unlock demographic & clinical analysis.',
            'You get summary cards (groups, subjects per group, totals, columns), data-completeness bars, per-variable charts, and correlations between demographics and DTI scalars.',
        ],
    },
    {
        icon: '✅',
        title: '9 · Quality Control',
        body: [
            'The Quality Control tab shows the automatic PASS / FAIL flag and confidence for each segmentation, produced by the ViT QC model.',
            'Remove problematic subjects from the analysis (and restore them later) — the dashboard recomputes instantly.',
        ],
    },
    {
        icon: '🎓',
        title: 'You are ready!',
        body: [
            'Need a refresher? Open the Glossary (“?” button) for term definitions, or re-launch this tour anytime with the “Tutorial” button on the landing screen.',
            'Uncheck “Show tutorial on startup” if you don’t want it to open automatically next time.',
        ],
    },
]

function Tutorial({ onClose }) {
    const [step, setStep] = useState(0)
    const last  = STEPS.length - 1
    const isLast = step === last

    const next = useCallback(() => setStep(s => Math.min(s + 1, last)), [last])
    const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), [])

    // Keyboard navigation
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape')      onClose?.()
            else if (e.key === 'ArrowRight') next()
            else if (e.key === 'ArrowLeft')  prev()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [next, prev, onClose])

    const s = STEPS[step]

    return (
        <div className='tut-overlay' onClick={onClose}>
            <div className='tut-modal' onClick={e => e.stopPropagation()} role='dialog' aria-modal='true'>

                <button className='tut-close' onClick={onClose} title='Close tutorial'>×</button>

                <div className='tut-icon'>{s.icon}</div>
                <h2 className='tut-title'>{s.title}</h2>

                <div className='tut-body'>
                    {s.body.map((p, i) => <p key={i}>{p}</p>)}
                </div>

                {/* Progress dots */}
                <div className='tut-dots'>
                    {STEPS.map((_, i) => (
                        <button
                            key={i}
                            className={`tut-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
                            onClick={() => setStep(i)}
                            title={`Step ${i + 1}`}
                        />
                    ))}
                </div>

                {/* Footer controls */}
                <div className='tut-footer'>
                    <button className='tut-skip' onClick={onClose}>Skip</button>
                    <span className='tut-counter'>{step + 1} / {STEPS.length}</span>
                    <div className='tut-nav'>
                        <button className='tut-btn tut-btn--ghost' onClick={prev} disabled={step === 0}>
                            ← Back
                        </button>
                        {isLast
                            ? <button className='tut-btn tut-btn--primary' onClick={onClose}>Finish ✓</button>
                            : <button className='tut-btn tut-btn--primary' onClick={next}>Next →</button>
                        }
                    </div>
                </div>

            </div>
        </div>
    )
}

export default Tutorial
