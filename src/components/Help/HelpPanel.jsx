import React, { useState, useMemo } from 'react'
import './HelpPanel.scss'
import {
    TbFolderPlus, TbAdjustments, TbPlayerPlay, TbLayoutDashboard,
    TbSearch, TbChevronDown, TbExternalLink,
} from 'react-icons/tb'

const REPO_URL = 'https://github.com/MICLab-Unicamp/inCCsight'

// ── Quick-start steps ───────────────────────────────────────────────────────
const STEPS = [
    { icon: TbFolderPlus,     title: 'Add your groups',   text: 'Paste the absolute path to each group folder, name it, and add more with “+ Add group”.' },
    { icon: TbAdjustments,    title: 'Pick the methods',  text: 'Choose ROQS / Watershed (2D) and/or CNN (3D). Defaults come from your Settings.' },
    { icon: TbPlayerPlay,     title: 'Run the analysis',  text: 'Watch the live log and progress bar. Or click “Demo data” to try a bundled example.' },
    { icon: TbLayoutDashboard,title: 'Explore the dashboard', text: 'Inspect subjects, compare groups, check QC, and export CSVs.' },
]

// ── FAQ (grouped) ───────────────────────────────────────────────────────────
const FAQ = [
    {
        category: 'Getting started',
        items: [
            { q: 'How do I add data?', a: 'On “Select data”, paste the absolute path to a group folder (e.g. C:\\data\\controls). Each sub-folder inside it must be one subject containing the DTI files.' },
            { q: 'How do I add more groups?', a: 'Click “+ Add group”, give the group a name, and provide its folder path. Two or more groups unlock the “Compare Groups” tab.' },
            { q: 'Can I try it without my own data?', a: 'Yes — click “Demo data” on the landing screen to run a small bundled example dataset end-to-end.' },
            { q: 'Where are my previous results?', a: 'Click “Last analysis” to instantly reload the results of the most recent run without re-processing.' },
        ],
    },
    {
        category: 'Data & formats',
        items: [
            { q: 'What files are required?', a: 'DTI data in NIfTI format (.nii / .nii.gz) with the eigenvalue/eigenvector maps: dti_L1–L3 and dti_V1–V3. FA is derived from these.' },
            { q: 'How should folders be organised?', a: 'A group folder contains one sub-folder per subject; each subject sub-folder holds its DTI files (see the diagram below).' },
            { q: 'Can I add demographics?', a: 'Drop a demograph.csv (with a subject_id column) inside a group folder to unlock the Demographics tab and DTI-vs-demographics correlations.' },
        ],
    },
    {
        category: 'Methods',
        items: [
            { q: 'What are ROQS, Watershed and CNN?', a: 'ROQS and Watershed are fast 2D corpus-callosum segmentations. CNN is a volumetric 3D segmentation (needs PyTorch). Selecting several runs them together for comparison.' },
            { q: 'What is parcellation?', a: 'The corpus callosum is split into sub-regions (P1–P5) under a scheme — Witelson, Hofer, Chao, Cover or Freesurfer — and each region gets its own FA/MD/RD/AD values.' },
            { q: 'What does the QC badge mean?', a: 'A Vision-Transformer model scores each segmentation; PASS/FAIL is derived from P(incorrect) against the threshold you set in Settings → Scientific parameters.' },
        ],
    },
    {
        category: 'Dashboard',
        items: [
            { q: 'How do I compare groups?', a: 'Open the “Compare Groups” tab (visible with ≥ 2 groups) for box/violin/bar distributions, thickness & midline profiles, per-region bars and a stats table.' },
            { q: 'What do the “?” icons do?', a: 'Every chart has a help icon next to its title explaining what it shows. In charts with a legend, click a colour to hide or show that series.' },
            { q: 'Can I export the data?', a: 'Tables and comparison views have “Export / CSV” buttons. The delimiter (comma or semicolon) follows Settings → Language & infrastructure.' },
        ],
    },
    {
        category: 'Troubleshooting',
        items: [
            { q: '“Cannot reach the analysis server”', a: 'The backend isn’t running. Start it with start.bat (Windows), ./start.sh (Linux/macOS) or `npm run dev`. It listens on port 3001.' },
            { q: 'The CNN step is very slow or fails', a: 'Confirm the checkpoint is in methods/CNNBased/peso/ and set Settings → CNN compute device to GPU if you have CUDA. Use ROQS-only for a quick run.' },
            { q: 'The 3D viewer shows no surface', a: 'The CNN mask (cnnBased.nii.gz) must exist and contain voxels above the iso-threshold. Run the CNN step first.' },
        ],
    },
]

function FaqItem({ q, a }) {
    const [open, setOpen] = useState(false)
    return (
        <div className={`hp-faq-item${open ? ' open' : ''}`}>
            <button className='hp-faq-q' onClick={() => setOpen(o => !o)}>
                <span>{q}</span>
                <TbChevronDown className='hp-faq-caret' />
            </button>
            {open && <div className='hp-faq-a'>{a}</div>}
        </div>
    )
}

function HelpPanel() {
    const [query, setQuery] = useState('')

    const groups = useMemo(() => {
        const term = query.trim().toLowerCase()
        if (!term) return FAQ
        return FAQ
            .map(g => ({
                ...g,
                items: g.items.filter(i =>
                    i.q.toLowerCase().includes(term) || i.a.toLowerCase().includes(term)
                ),
            }))
            .filter(g => g.items.length)
    }, [query])

    return (
        <div className='help-panel'>

            <div className='hp-intro'>
                <h2 className='hp-title'>Help & Getting Started</h2>
                <p className='hp-sub'>
                    inCCsight segments, quantifies and visualises the corpus callosum from DTI data —
                    all locally on your machine. New here? Follow the four steps below.
                </p>
            </div>

            {/* Quick start */}
            <div className='hp-steps'>
                {STEPS.map((s, i) => (
                    <div key={i} className='hp-step'>
                        <div className='hp-step-badge'><s.icon /><span className='hp-step-num'>{i + 1}</span></div>
                        <div className='hp-step-body'>
                            <span className='hp-step-title'>{s.title}</span>
                            <span className='hp-step-text'>{s.text}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Data format */}
            <div className='hp-card'>
                <span className='hp-card-title'>Expected data layout</span>
                <pre className='hp-code'>{`my_group/
├── subject_001/
│   ├── dti_L1.nii.gz   ← eigenvalues 1–3
│   ├── dti_L2.nii.gz
│   ├── dti_L3.nii.gz
│   ├── dti_V1.nii.gz   ← eigenvectors 1–3
│   ├── dti_V2.nii.gz
│   └── dti_V3.nii.gz
│   └── demograph.csv   ← optional (demographics)
├── subject_002/ …`}</pre>
            </div>

            {/* FAQ */}
            <div className='hp-faq'>
                <div className='hp-faq-head'>
                    <span className='hp-card-title'>Frequently asked questions</span>
                    <div className='hp-search'>
                        <TbSearch className='hp-search-icon' />
                        <input
                            placeholder='Search help…'
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                    </div>
                </div>

                {groups.length === 0 && (
                    <div className='hp-empty'>No results for “{query}”.</div>
                )}

                {groups.map(g => (
                    <div key={g.category} className='hp-faq-group'>
                        <span className='hp-faq-cat'>{g.category}</span>
                        {g.items.map((it, i) => <FaqItem key={i} q={it.q} a={it.a} />)}
                    </div>
                ))}
            </div>

            {/* Footer links */}
            <div className='hp-links'>
                <span>Still stuck?</span>
                <a href={`${REPO_URL}/issues`} target='_blank' rel='noreferrer'>
                    Open an issue on GitHub <TbExternalLink />
                </a>
                <span className='hp-links-hint'>· or open the Glossary (“?”) in the dashboard for term definitions.</span>
            </div>

        </div>
    )
}

export default HelpPanel
