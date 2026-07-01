import React, { useState, useEffect } from 'react'
import './Enter.scss'
import logo from '../../assets/inccsight.png'

import { TbHome2, TbQuestionCircle, TbBrandGithub, TbSettings } from 'react-icons/tb'
import View from './View'
import Loading from '../Loading/Loading'
import Tutorial from '../Tutorial/Tutorial'
import { getSetting, saveSettings } from '../../settings/settings'

const NAV = [
    { icon: TbHome2,          name: 'Input',    title: 'Select data'   },
    { icon: TbQuestionCircle, name: 'Help',     title: 'Help'          },
    { icon: TbBrandGithub,    name: 'Github',   title: 'GitHub'        },
    { icon: TbSettings,       name: 'Settings', title: 'Settings'      },
]

// ── Tutorial preference ────────────────────────────────────────────────────────
// Stored under the unified settings object (settings.tutorialOnStartup) so the
// Settings page and this toggle stay in sync. First-time users default to ON.
// A per-session flag (sessionStorage) makes it auto-open once per app launch
// rather than on every in-app navigation back to the landing screen.
const TUT_SHOWN_KEY = 'inccsight.tutorial.shownThisSession'

function readTutorialEnabled() {
    return getSetting('tutorialOnStartup') !== false
}
function persistEnabled(val) {
    saveSettings({ tutorialOnStartup: !!val })
}
function shownThisSession() {
    try { return sessionStorage.getItem(TUT_SHOWN_KEY) === '1' } catch (_) { return false }
}
function markShownThisSession(val) {
    try {
        if (val) sessionStorage.setItem(TUT_SHOWN_KEY, '1')
        else     sessionStorage.removeItem(TUT_SHOWN_KEY)
    } catch (_) {}
}

function Enter() {
    const [page, setPage] = useState('Input')

    const [tutorialEnabled, setTutorialEnabled] = useState(readTutorialEnabled)
    const [showTutorial,    setShowTutorial]    = useState(false)

    // Auto-open once per session while the tutorial is enabled.
    useEffect(() => {
        if (readTutorialEnabled() && !shownThisSession()) {
            setShowTutorial(true)
            markShownThisSession(true)
        }
    }, [])

    function openTutorial() {
        setShowTutorial(true)
        markShownThisSession(true)
    }

    function closeTutorial() {
        setShowTutorial(false)
    }

    function toggleTutorialEnabled(checked) {
        setTutorialEnabled(checked)
        persistEnabled(checked)
        if (checked) {
            // Re-enabling brings the tour back right away.
            markShownThisSession(true)
            setShowTutorial(true)
        } else {
            setShowTutorial(false)
        }
    }

    return (
        <div className='enter-wrap'>
            {/* Loading overlay */}
            <div className='loading-screen' id='loading-screen'>
                <Loading />
                <div className='pipeline-progress-wrap' id='pipeline-progress-wrap'>
                    <div className='pipeline-progress-bar'>
                        <div className='pipeline-progress-fill' id='progress-bar-fill' style={{ width: '0%' }} />
                    </div>
                    <span className='pipeline-progress-label' id='progress-label'>Starting…</span>
                </div>
                <pre id='pipeline-log' className='pipeline-log' />
            </div>

            {/* Card central */}
            <div className='enter-card'>

                {/* Cabeçalho */}
                <div className='enter-header'>
                    <img src={logo} className='header-logo' alt='InCCsight logo' />
                    <div className='header-title'>
                        <span className='header-name'>InCCsight</span>
                        <span className='header-sub'>Corpus Callosum Analysis Tool</span>
                    </div>

                    {/* Tutorial controls */}
                    <div className='enter-header-actions'>
                        <label className='tut-toggle' title='Open the guided tutorial automatically on startup'>
                            <input
                                type='checkbox'
                                checked={tutorialEnabled}
                                onChange={e => toggleTutorialEnabled(e.target.checked)}
                            />
                            <span>Show tutorial on startup</span>
                        </label>
                        <button
                            className='tut-launch-btn'
                            onClick={openTutorial}
                            title='Open the guided tutorial'
                        >
                            <TbQuestionCircle />
                            <span>Tutorial</span>
                        </button>
                    </div>
                </div>

                {/* Corpo: sidebar + conteúdo */}
                <div className='enter-body'>
                    <nav className='enter-sidebar'>
                        {NAV.map(({ icon: Icon, name, title }) => (
                            <button
                                key={name}
                                className={`nav-btn${page === name ? ' active' : ''}`}
                                title={title}
                                onClick={() => setPage(name)}
                            >
                                <Icon />
                                <span className='nav-label'>{title}</span>
                            </button>
                        ))}
                    </nav>

                    <div className='enter-content'>
                        <View type={page} />
                    </div>
                </div>
            </div>

            {/* Guided tutorial */}
            {showTutorial && <Tutorial onClose={closeTutorial} />}
        </div>
    )
}

export default Enter
