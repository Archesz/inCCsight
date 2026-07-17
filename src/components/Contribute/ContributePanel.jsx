import React, { useState } from 'react'
import './ContributePanel.scss'
import {
    TbBrandGithub, TbBug, TbBulb, TbBook, TbGitPullRequest,
    TbExternalLink, TbChevronDown,
} from 'react-icons/tb'

const REPO_URL = 'https://github.com/MICLab-Unicamp/inCCsight'

const WAYS = [
    { icon: TbBug,            title: 'Report a bug',      text: 'Something broken or confusing? Open an issue with steps to reproduce, your OS and the pipeline log.' },
    { icon: TbBulb,           title: 'Suggest a feature', text: 'Propose an idea or a new metric/chart. Describe the use case so we can scope it together.' },
    { icon: TbBook,           title: 'Improve the docs',  text: 'Fix a typo, clarify a step, or add an example. Documentation PRs are very welcome.' },
    { icon: TbGitPullRequest, title: 'Contribute code',   text: 'Pick an item from the roadmap below (or an open issue) and send a pull request.' },
]

// Roadmap — kept in sync with the tool's known progressive work.
const ROADMAP = [
    { done: true,  text: 'Per-user Settings (palette, defaults, QC threshold, CNN device, CSV delimiter)' },
    { done: true,  text: 'Guided startup tutorial + chart help icons' },
    { done: false, text: 'Dark mode for Plotly chart interiors (chrome already themed)' },
    { done: false, text: 'Full PT/EN translation (chrome done; chart/table labels pending)' },
    { done: false, text: 'Host the CNN & QC model weights for one-command download' },
    { done: false, text: 'More parcellation schemes and segmentation methods' },
    { done: false, text: 'Automated tests for the Python pipeline and React components' },
]

const WORKFLOW = `# 1. Fork on GitHub, then clone your fork (with Git LFS for the model files)
git lfs install
git clone https://github.com/<you>/inCCsight.git
cd inCCsight

# 2. Create a branch for your change
git checkout -b feat/my-improvement

# 3. Install everything ONCE — Node + Python venv + PyTorch (auto-detected).
#    This is required: the pipeline is Python, 'npm install' alone is not enough.
./setup.sh             # Windows: setup.bat

# 4. Run locally
./start.sh             # Windows: start.bat   (React :3000 + Express :3001)

# 5. Make your change, then verify
npm test               # React component tests
npm run build          # must compile cleanly

# 6. Commit and push, then open a Pull Request
git commit -am "feat: my improvement"
git push origin feat/my-improvement`

const ADD_SEGMENTATION = [
    'Create methods/<your_method>/main.py that reads the DTI files and writes CSVs into methods/csvs/ using the SAME schema as the existing ones: <Method>_scalar_statistics.csv, <Method>_scalar_midlines.csv, <Method>_dict_thickness.csv and <Method>_parcellation_statistics.csv. Reuse the shared library in methods/shared/libcc/ (segmentation, parcellation, gets, saves) — never duplicate it.',
    'Register the step in methods/run.py: add a block that runs your script as a subprocess and emits PROGRESS:n:N:step lines so the progress bar animates.',
    'Merge the new columns in methods/csvs/transformInJson.py: add your <Method>_scalar / _midlines / _thickness / _parcellation keys to the subject dict (they are then served automatically via /api/mydata).',
    'Surface it in the frontend: add the method to METHODS in components/Enter/View.jsx (a run option) and to the method lists — SEG_KEYS in components/View/View.jsx, plus the method pickers in GroupComparison and the Table/Radar/Boxplot graphs.',
]

const ADD_PARCELLATION = [
    'Implement the scheme in methods/shared/libcc/parcellation.py, following the existing ones (Witelson, Hofer, Chao, Cover, Freesurfer). It must split the CC into P1–P5 and return FA/MD/RD/AD (and StdDev) per region.',
    'No extra pipeline wiring is needed: the new scheme flows into *_parcellation_statistics.csv automatically once parcellation.py produces its columns.',
    'Add the scheme NAME to the PARC_METHODS arrays in the frontend so it appears in every picker: components/View/View.jsx, graphs/Boxplot/BoxplotParcellation.jsx, graphs/Table/TableParcellation.jsx, graphs/Radar/Radar.jsx, components/GroupComparison/GroupComparison.jsx and components/Settings/SettingsPanel.jsx.',
]

function Guide({ icon: Icon, title, steps, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className={`cp-guide${open ? ' open' : ''}`}>
            <button className='cp-guide-head' onClick={() => setOpen(o => !o)}>
                <span className='cp-guide-title'><Icon /> {title}</span>
                <TbChevronDown className='cp-guide-caret' />
            </button>
            {open && (
                <ol className='cp-steps'>
                    {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
            )}
        </div>
    )
}

function ContributePanel() {
    return (
        <div className='contribute-panel'>

            <div className='cp-intro'>
                <h2 className='cp-title'><TbBrandGithub /> Contribute to inCCsight</h2>
                <p className='cp-sub'>
                    inCCsight is open-source (MIT) and developed by MICLab — UNICAMP.
                    Contributions of every size are welcome.
                </p>
                <a className='cp-repo-btn' href={REPO_URL} target='_blank' rel='noreferrer'>
                    <TbBrandGithub /> Open the repository <TbExternalLink />
                </a>
            </div>

            {/* Ways to contribute */}
            <div className='cp-ways'>
                {WAYS.map((w, i) => (
                    <div key={i} className='cp-way'>
                        <div className='cp-way-icon'><w.icon /></div>
                        <div>
                            <span className='cp-way-title'>{w.title}</span>
                            <span className='cp-way-text'>{w.text}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Roadmap / to-dos */}
            <div className='cp-card'>
                <span className='cp-card-title'>Roadmap · good first tasks</span>
                <ul className='cp-todos'>
                    {ROADMAP.map((r, i) => (
                        <li key={i} className={r.done ? 'done' : ''}>
                            <span className='cp-check'>{r.done ? '✓' : '○'}</span>
                            {r.text}
                        </li>
                    ))}
                </ul>
                <a className='cp-issues-link' href={`${REPO_URL}/issues`} target='_blank' rel='noreferrer'>
                    Browse open issues <TbExternalLink />
                </a>
            </div>

            {/* Contribution workflow */}
            <div className='cp-card'>
                <span className='cp-card-title'>Contribution workflow</span>
                <pre className='cp-code'>{WORKFLOW}</pre>
                <p className='cp-note'>
                    Keep changes focused, match the surrounding code style, and make sure
                    <code> npm run build </code> compiles before opening the PR.
                </p>
            </div>

            {/* Extend the tool */}
            <div className='cp-card'>
                <span className='cp-card-title'>Extend the tool</span>
                <p className='cp-note' style={{ marginTop: 0 }}>
                    The Python pipeline lives in <code>methods/</code>; the dashboard reads a single
                    <code> data/mydata.json </code> produced by <code>transformInJson.py</code>.
                </p>
                <Guide
                    icon={TbGitPullRequest}
                    title='Add a new segmentation method'
                    steps={ADD_SEGMENTATION}
                    defaultOpen
                />
                <Guide
                    icon={TbGitPullRequest}
                    title='Add a new parcellation scheme'
                    steps={ADD_PARCELLATION}
                />
            </div>

        </div>
    )
}

export default ContributePanel
