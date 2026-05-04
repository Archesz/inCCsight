import React, { useState, useEffect } from 'react'
import { useNavigate }  from 'react-router-dom'
import logo    from '../assets/images/inccsight.png'

import View            from '../components/View/View'
import GroupComparison from '../components/GroupComparison/GroupComparison'

import { BsGear } from 'react-icons/bs'
import { TbAlertTriangle } from 'react-icons/tb'

import '../styles/home.scss'

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']

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

    useEffect(() => {
        fetch('http://localhost:3001/api/mydata')
            .then(r => {
                if (!r.ok) throw new Error('Execute uma análise primeiro para gerar os dados.')
                return r.json()
            })
            .then(subjects => {
                const groups = [...new Set(subjects.map(s => s.group || '').filter(Boolean))]
                setAllSubjects(subjects)
                setData(subjects)
                setAllGroups(groups)
                setGroupColor(Object.fromEntries(groups.map((g, i) => [g, i])))
                setLoading(false)
            })
            .catch(e => { setError(e.message); setLoading(false) })
    }, [])

    // ── Seleção de sujeito ─────────────────────────────────────────────────
    function selectSubject(id) {
        if (id === '__all__') {
            setSelectedId(null)
            const filtered = allSubjects
                .filter(s => !groupFilter || s.group === groupFilter)
                .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true)
            setData(filtered)
        } else {
            setSelectedId(id)
            setData(allSubjects.filter(s => s['Id'] === id))
        }
    }

    function deselectSubject() {
        selectSubject('__all__')
    }

    // ── Filtro de sujeitos visíveis na sidebar ─────────────────────────────
    const visibleSubjects = allSubjects
        .filter(s => !groupFilter || s.group === groupFilter)
        .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true)
        .filter(s => s['Id'].toLowerCase().includes(search.toLowerCase()))

    const failCount = allSubjects.filter(s => s.qc?.ROQS?.flag === true).length

    // ── Quando o filtro muda, atualizar data se não há sujeito selecionado ─
    useEffect(() => {
        if (!selectedId) {
            const filtered = allSubjects
                .filter(s => !groupFilter || s.group === groupFilter)
                .filter(s => !qcFilter    || s.qc?.ROQS?.flag === true)
            setData(filtered)
        }
    }, [groupFilter, qcFilter, allSubjects, selectedId])

    // ── Estados de carregamento e erro ─────────────────────────────────────
    if (loading) return (
        <div className='dash-loading'>
            <span style={{ fontSize: '1.2rem', color: 'white' }}>Carregando dados...</span>
        </div>
    )

    if (error) return (
        <div className='dash-error'>
            <span className='dash-error-msg'>⚠ Nenhum dado encontrado</span>
            <span className='dash-error-hint'>{error}</span>
            <a href='/'>← Voltar para a tela inicial</a>
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
                        { id: '2D',      label: 'Segmentação 2D'  },
                        { id: '3D',      label: 'Volumétrico 3D'  },
                        ...(allGroups.length >= 2
                            ? [{ id: 'compare', label: 'Comparar Grupos', badge: allGroups.length }]
                            : []),
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
                        <strong>{data.length}</strong> sujeito{data.length !== 1 ? 's' : ''}
                    </div>

                    {failCount > 0 && (
                        <button
                            className={`qc-fail-badge${qcFilter ? ' active' : ''}`}
                            onClick={() => setQcFilter(v => !v)}
                            title='Filtrar sujeitos com QC FAIL'
                        >
                            <TbAlertTriangle />
                            {failCount} QC FAIL
                        </button>
                    )}

                    <BsGear
                        className='gear-icon'
                        onClick={() => navigate('/')}
                        title='Nova análise'
                    />
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div className='dash-body'>

                {/* ── Sidebar ─────────────────────────────────────────────── */}
                <div className='dash-sidebar'>
                    <div className='sidebar-head'>
                        <span className='sidebar-title'>Sujeitos</span>
                        <input
                            className='sidebar-search'
                            placeholder='Buscar ID...'
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
                                Todos
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
                        {/* Botão "Todos" */}
                        <div
                            className={`sub-item sub-item--all${!selectedId ? ' sub-item--active' : ''}`}
                            onClick={() => selectSubject('__all__')}
                        >
                            <span className='sub-name'>Todos ({visibleSubjects.length})</span>
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
                            <span>{allGroups.length} grupo{allGroups.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                </div>

                {/* ── Main ────────────────────────────────────────────────── */}
                <div className='dash-main'>
                    {activeTab === 'compare'
                        ? <GroupComparison allSubjects={allSubjects} allGroups={allGroups} />
                        : <View
                            view={activeTab}
                            data={data}
                            selectedId={selectedId}
                            onDeselect={deselectSubject}
                          />
                    }
                </div>

            </div>
        </div>
    )
}

export default Home
