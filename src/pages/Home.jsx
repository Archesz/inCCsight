import React, { useState, useEffect } from 'react'

import logo    from '../assets/images/inccsight.png'
import unicamp from '../assets/images/unicamp.png'
import miclab  from '../assets/images/miclab.png'

import SubjectCard     from '../components/SubjectCard/SubjectCard'
import ConfigModal     from '../components/ConfigModal/ConfigModal'
import View            from '../components/View/View'
import GroupComparison from '../components/GroupComparison/GroupComparison'

import { BsGear } from 'react-icons/bs'
import { createRoot } from 'react-dom/client'

import '../styles/home.scss'

const GROUP_COLORS = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3']

function showConfigs() {
    const container = document.querySelector('#modalArea')
    const root = createRoot(container)
    root.render(<ConfigModal root={root} />)
}

function Home() {
    const [allSubjects,     setAllSubjects]     = useState([])
    const [data,            setData]            = useState([])
    const [allGroups,       setAllGroups]       = useState([])
    const [groupColorIndex, setGroupColorIndex] = useState({})
    const [filter,          setFilter]          = useState('')
    const [groupFilter,     setGroupFilter]     = useState('')
    const [activeTab,       setActiveTab]       = useState('2D')   // '2D' | '3D' | 'compare'
    const [loading,         setLoading]         = useState(true)
    const [error,           setError]           = useState(null)

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
                setGroupColorIndex(Object.fromEntries(groups.map((g, i) => [g, i])))
                setLoading(false)
            })
            .catch(e => { setError(e.message); setLoading(false) })
    }, [])

    function selectSubject(name) {
        if (name === 'All') {
            setData(allSubjects)
        } else {
            const panel = document.querySelector('#subjectPainel')
            if (panel) panel.style.display = 'flex'
            setData(allSubjects.filter(s => s['Id'] === name))
        }
    }

    if (loading) return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'white', fontSize:'1.2rem' }}>
            Carregando dados...
        </div>
    )

    if (error) return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', color:'white', gap:'1rem' }}>
            <span style={{ fontSize:'1.2rem' }}>⚠ Nenhum dado encontrado</span>
            <span style={{ opacity:0.7 }}>{error}</span>
            <a href='/' style={{ color:'#636EFA' }}>← Voltar para a tela inicial</a>
        </div>
    )

    const visibleSubjects = allSubjects
        .filter(s => !groupFilter || s.group === groupFilter)
        .filter(s => s['Id'].includes(filter))

    return (
        <div className='container-home' id='main-area'>

            <div id='modalArea' />

            <div className='header'>

                {/* Banner lateral esquerdo */}
                <div className='banner'>
                    <div className='banner-logos'>
                        <img src={unicamp} className='banner-logo' alt='Unicamp' />
                        <img src={miclab}  className='banner-logo' alt='MICLab'  />
                    </div>
                    <img src={logo} className='img-logo' alt='InCCsight' />
                    <span className='banner-span'>
                        Ferramenta de exploração e visualização de dados de Diffusion Tensor Imaging do Corpo Caloso.
                    </span>
                    <div className='banner-selects'>
                        <div className='input-group'>
                            <label>Categoria</label>
                            <select><option>Método</option><option>Pasta</option></select>
                        </div>
                        <div className='input-group'>
                            <label>Segm. Method</label>
                            <select><option>ROQS</option><option>Watershed</option></select>
                        </div>
                    </div>
                    <button className='btn-check'>
                        Quality Check
                        <span className='btn-tag'>
                            {allSubjects.filter(s => s.qc?.ROQS?.flag === true).length}
                        </span>
                    </button>
                </div>

                {/* Lista de sujeitos */}
                <div className='subjects-list'>
                    <label>Sujeitos</label>

                    {/* Filtro por grupo */}
                    {allGroups.length > 0 && (
                        <div className='group-tabs'>
                            <button
                                className={`group-tab${groupFilter === '' ? ' active' : ''}`}
                                style={groupFilter === '' ? { borderColor:'#1F2C56', color:'#1F2C56' } : {}}
                                onClick={() => setGroupFilter('')}
                            >Todos</button>
                            {allGroups.map((g, i) => (
                                <button
                                    key={g}
                                    className={`group-tab${groupFilter === g ? ' active' : ''}`}
                                    style={groupFilter === g
                                        ? { borderColor: GROUP_COLORS[i % GROUP_COLORS.length], color: GROUP_COLORS[i % GROUP_COLORS.length], backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] + '18' }
                                        : { borderColor: GROUP_COLORS[i % GROUP_COLORS.length] + '80', color:'#bbb' }}
                                    onClick={() => setGroupFilter(g)}
                                >
                                    <span className='group-tab-dot' style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                                    {g}
                                </button>
                            ))}
                        </div>
                    )}

                    <input
                        placeholder='Ex: Subject_00002'
                        id='filter'
                        onChange={e => setFilter(e.target.value)}
                    />

                    <div className='subjects'>
                        <SubjectCard name='All' onClick={selectSubject} />
                        {visibleSubjects.map((subject, index) => {
                            const gIdx = groupColorIndex[subject.group] ?? -1
                            return (
                                <SubjectCard
                                    key={index}
                                    name={subject['Id']}
                                    id={index}
                                    onClick={selectSubject}
                                    qc={subject['qc']}
                                    group={subject['group']}
                                    groupColor={gIdx >= 0 ? GROUP_COLORS[gIdx % GROUP_COLORS.length] : null}
                                />
                            )
                        })}
                    </div>
                </div>

                {/* Contador */}
                <div className='square-field'>
                    <div>
                        <span className='qnt'>{data.length}</span>
                        <span className='label'>Sujeitos</span>
                    </div>
                </div>

                <BsGear className='gear-icon' onClick={showConfigs} />
            </div>

            {/* ── Abas de visualização ──────────────────────────────────────── */}
            <div className='tab-change'>
                <div
                    id='tab2D'
                    className={`tab${activeTab === '2D' ? ' active' : ''}`}
                    onClick={() => setActiveTab('2D')}
                >
                    Segmentação 2D
                </div>
                <div
                    id='tab3D'
                    className={`tab${activeTab === '3D' ? ' active' : ''}`}
                    onClick={() => setActiveTab('3D')}
                >
                    Volumétrico 3D
                </div>
                {allGroups.length >= 2 && (
                    <div
                        className={`tab tab-compare${activeTab === 'compare' ? ' active' : ''}`}
                        onClick={() => setActiveTab('compare')}
                    >
                        Comparar Grupos
                        <span className='tab-badge'>{allGroups.length}</span>
                    </div>
                )}
            </div>

            {/* ── Conteúdo da aba ───────────────────────────────────────────── */}
            {activeTab === 'compare'
                ? <GroupComparison allSubjects={allSubjects} allGroups={allGroups} />
                : <View view={activeTab} data={data} />
            }

        </div>
    )
}

export default Home
