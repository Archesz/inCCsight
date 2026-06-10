import React, { useState, useEffect } from 'react'
import { useNavigate }  from 'react-router-dom'
import logo    from '../assets/images/inccsight.png'

import View                  from '../components/View/View'
import GroupComparison       from '../components/GroupComparison/GroupComparison'
import Glossary              from '../components/Glossary/Glossary'
import QualityControl        from '../components/QualityControl/QualityControl'
import DemographicsDashboard  from '../components/Demographics/DemographicsDashboard'

import { BsGear } from 'react-icons/bs'
import { TbAlertTriangle } from 'react-icons/tb'

import '../styles/home.scss'

const API = process.env.REACT_APP_API_URL || ''

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']

// ── Demographics fallback (shown when demograph.csv is absent) ─────────────────
function DemographNoData({ subjects, allGroups, onReload }) {
    const ungrouped = subjects.filter(s => !s.group || s.group === '').length
    return (
        <div className='dnd-wrap'>
            <div className='dnd-card'>
                <div className='dnd-title'>Demographics</div>
                <p className='dnd-hint'>
                    No <code>demograph.csv</code> file found in the analysis folder.
                    Add one to unlock full demographics &amp; DTI correlation analysis.
                </p>
                <button className='dnd-reload' onClick={onReload}>↺ Check again</button>
            </div>
            <div className='dnd-card'>
                <div className='dnd-summary-title'>Subjects per group</div>
                <div className='dnd-rows'>
                    {allGroups.map((g, i) => (
                        <div key={g} className='dnd-row'>
                            <span className='dnd-dot' style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                            <span className='dnd-group'>{g}</span>
                            <span className='dnd-count'>{subjects.filter(s => s.group === g).length}</span>
                        </div>
                    ))}
                    {ungrouped > 0 && (
                        <div className='dnd-row'>
                            <span className='dnd-dot' style={{ background: '#ccc' }} />
                            <span className='dnd-group'>(no group)</span>
                            <span className='dnd-count'>{ungrouped}</span>
                        </div>
                    )}
                    <div className='dnd-row dnd-row--total'>
                        <span className='dnd-group'><strong>Total</strong></span>
                        <span className='dnd-count'><strong>{subjects.length}</strong></span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Home() {
    const navigate = useNavigate()

    const [allSubjects,  setAllSubjects]  = useState([])
    const [data,         setData]         = useState([])
    const [allGroups,    setAllGroups]    = useState([])
    const [groupColor,   setGroupColor]   = useState({})
    const [search,       setSearch]       = useState('')
    const [groupFilter,  setGroupFilter]  = useState('')
    const [activeTab,    setActiveTab]    = useState('2D')
    const [selectedId,   setSelectedId]   = useState(null)
    const [qcFilter,     setQcFilter]     = useState(false)
    const [loading,      setLoading]      = useState(true)
    const [error,        setError]        = useState(null)
    const [showGlossary,      setShowGlossary]      = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [demographData,    setDemographData]    = useState(null)

    function _applySubjects(subjects) {
        const groups = [...new Set(subjects.map(s => s.group || '').filter(Boolean))]
        setAllSubjects(subjects)
        setAllGroups(groups)
        setGroupColor(Object.fromEntries(groups.map((g, i) => [g, i])))
    }

    function fetchDemograph() {
        return fetch(`${API}/api/demograph`)
            .then(r => r.ok ? r.json() : null)
            .then(json => { if (json?.rows?.length) setDemographData(json) })
            .catch(() => {})
    }

    function reloadData() {
        fetch(`${API}/api/mydata`)
            .then(r => r.json())
            .then(json => {
                const subjects = Array.isArray(json) ? json : (json.subjects || [])
                _applySubjects(subjects)
            })
            .catch(e => console.error('Reload failed:', e))
        fetchDemograph()
    }

    useEffect(() => {
        fetch(`${API}/api/mydata`)
            .then(r => {
                if (!r.ok) throw new Error('Run an analysis first to generate data.')
                return r.json()
            })
            .then(json => {
                // Support both legacy array format and new {_metadata, subjects} format
                const subjects = Array.isArray(json) ? json : (json.subjects || [])
                _applySubjects(subjects)
                setLoading(false)
            })
            .catch(e => { setError(e.message); setLoading(false) })
        fetchDemograph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Active subjects excludes those explicitly removed via QC panel
    const activeSubjects = allSubjects.filter(s => !s.removed)

    // ── Subject selection ──────────────────────────────────────────────────
    function selectSubject(id) {
        if (id === '__all__') {
            setSelectedId(null)
            const filtered = activeSubjects
                .filter(s => !groupFilter || s.group === groupFilter)
                .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true || s.qc?.Watershed?.flag === true || s.qc?.CNN?.flag === true)
            setData(filtered)
        } else {
            setSelectedId(id)
            setData(activeSubjects.filter(s => s['Id'] === id))
        }
    }

    function deselectSubject() {
        selectSubject('__all__')
    }

    // ── Subjects visible in sidebar ────────────────────────────────────────
    const visibleSubjects = activeSubjects
        .filter(s => !groupFilter || s.group === groupFilter)
        .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true || s.qc?.Watershed?.flag === true || s.qc?.CNN?.flag === true)
        .filter(s => s['Id'].toLowerCase().includes(search.toLowerCase()))

    const failCount = activeSubjects.filter(s =>
        s.qc?.ROQS?.flag === true ||
        s.qc?.Watershed?.flag === true ||
        s.qc?.CNN?.flag === true
    ).length

    // ── Update data when filter changes ────────────────────────────────────
    useEffect(() => {
        if (!selectedId) {
            const filtered = activeSubjects
                .filter(s => !groupFilter || s.group === groupFilter)
                .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true || s.qc?.Watershed?.flag === true || s.qc?.CNN?.flag === true)
            setData(filtered)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupFilter, qcFilter, allSubjects, selectedId])

    // ── Loading and error states ───────────────────────────────────────────
    if (loading) return (
        <div className='dash-loading'>
            <span style={{ fontSize: '1.2rem', color: 'white' }}>Loading data...</span>
        </div>
    )

    if (error) return (
        <div className='dash-error'>
            <span className='dash-error-msg'>⚠ No data found</span>
            <span className='dash-error-hint'>{error}</span>
            <a href='/'>← Back to home</a>
        </div>
    )

    return (
        <div className='dash-root'>

            {/* ── Topbar ──────────────────────────────────────────────────── */}
            <div className='dash-topbar'>

                <div className='topbar-brand' onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <img src={logo} alt='InCCsight' />
                    <span>InCCsight</span>
                </div>

                <div className='topbar-tabs'>
                    {[
                        { id: '2D',      label: '2D Segmentation'  },
                        { id: '3D',      label: '3D Volumetric'    },
                        ...(allGroups.length >= 2
                            ? [{ id: 'compare', label: 'Compare Groups', badge: allGroups.length }]
                            : []),
                        { id: 'demograph', label: 'Demographics' },
                        { id: 'qc', label: 'Quality Control' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`ttab${activeTab === tab.id ? ' active' : ''}`}
                            onClick={() => { setActiveTab(tab.id); deselectSubject() }}
                        >
                            {tab.label}
                            {tab.badge && <span className='tab-badge'>{tab.badge}</span>}
                        </button>
                    ))}
                </div>

                <div className='topbar-right'>
                    <div className='subject-count'>
                        <strong>{data.length}</strong> subject{data.length !== 1 ? 's' : ''}
                    </div>

                    {failCount > 0 && (
                        <button
                            className={`qc-fail-badge${qcFilter ? ' active' : ''}`}
                            onClick={() => setQcFilter(v => !v)}
                            title='Filter subjects with QC FAIL'
                        >
                            <TbAlertTriangle />
                            {failCount} QC FAIL
                        </button>
                    )}

                    <button
                        className='glossary-btn'
                        onClick={() => setShowGlossary(true)}
                        title='Open Glossary'
                    >
                        ?
                    </button>

                    <BsGear
                        className='gear-icon'
                        onClick={() => navigate('/')}
                        title='New analysis'
                    />
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div className='dash-body'>

                {/* ── Sidebar ─────────────────────────────────────────────── */}
                <div className='sidebar-wrap'>
                <div className={`dash-sidebar${sidebarCollapsed ? ' dash-sidebar--collapsed' : ''}`}>
                    <div className='sidebar-head'>
                        <span className='sidebar-title'>Subjects</span>
                        <input
                            className='sidebar-search'
                            placeholder='Search ID...'
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {allGroups.length > 0 && (
                        <div className='sidebar-groups'>
                            <button
                                className={`group-pill${groupFilter === '' ? ' active' : ''}`}
                                onClick={() => { setGroupFilter(''); setSelectedId(null) }}
                            >
                                All
                            </button>
                            {allGroups.map((g, i) => (
                                <button
                                    key={g}
                                    className={`group-pill${groupFilter === g ? ' active' : ''}`}
                                    onClick={() => { setGroupFilter(g); setSelectedId(null) }}
                                >
                                    <span className='pill-dot' style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                                    {g}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className='sidebar-list'>
                        {/* "All" button */}
                        <div
                            className={`sub-item sub-item--all${!selectedId ? ' sub-item--active' : ''}`}
                            onClick={() => selectSubject('__all__')}
                        >
                            <span className='sub-name'>All ({visibleSubjects.length})</span>
                        </div>

                        {visibleSubjects.map((s, i) => {
                            const gIdx    = groupColor[s.group] ?? -1
                            const color   = gIdx >= 0 ? GROUP_COLORS[gIdx % GROUP_COLORS.length] : '#E3E7F0'
                            const qcFlag  = s.qc?.ROQS?.flag
                            return (
                                <div
                                    key={s['Id']}
                                    className={`sub-item${selectedId === s['Id'] ? ' sub-item--active' : ''}`}
                                    onClick={() => selectSubject(s['Id'])}
                                >
                                    <span className='sub-dot' style={{ background: color }} />
                                    <span className='sub-name'>{s['Id']}</span>
                                    {qcFlag === true  && <span className='sub-qc fail'>FAIL</span>}
                                    {qcFlag === false && <span className='sub-qc pass'>PASS</span>}
                                </div>
                            )
                        })}
                    </div>

                    <div className='sidebar-footer'>
                        <span>{allSubjects.length} total</span>
                        {allGroups.length > 0 && (
                            <span>{allGroups.length} group{allGroups.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                </div>
                <button
                    className='sidebar-toggle-btn'
                    onClick={() => setSidebarCollapsed(v => !v)}
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {sidebarCollapsed ? '›' : '‹'}
                </button>
                </div>

                {/* ── Main ────────────────────────────────────────────────── */}
                <div className='dash-main'>
                    {activeTab === 'qc'
                        ? <QualityControl
                            allSubjects={allSubjects}
                            onReload={reloadData}
                          />
                        : activeTab === 'compare'
                        ? <GroupComparison
                            allSubjects={activeSubjects.filter(s => !groupFilter || s.group === groupFilter)}
                            allGroups={allGroups.filter(g =>
                                activeSubjects.some(s => s.group === g && (!groupFilter || g === groupFilter))
                            )}
                          />
                        : activeTab === 'demograph'
                        ? demographData
                            ? <DemographicsDashboard
                                rows={demographData.rows}
                                presentCols={demographData.presentCols}
                                subjects={activeSubjects}
                                onReload={fetchDemograph}
                              />
                            : <DemographNoData
                                subjects={activeSubjects}
                                allGroups={allGroups}
                                onReload={fetchDemograph}
                              />
                        : <View
                            view={activeTab}
                            data={data}
                            selectedId={selectedId}
                            onDeselect={deselectSubject}
                          />
                    }
                </div>

            </div>

            {/* ── Glossary modal ──────────────────────────────────────────── */}
            {showGlossary && <Glossary onClose={() => setShowGlossary(false)} />}

        </div>
    )
}

export default Home
