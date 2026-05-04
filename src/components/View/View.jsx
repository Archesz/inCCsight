import React, { useState, useEffect } from 'react'

import TableSegmentation  from '../../graphs/Table/TableSegmentation'
import TableParcellation  from '../../graphs/Table/TableParcellation'
import BoxplotSegmentation from '../../graphs/Boxplot/BoxplotSegmentation'
import BoxplotParcellation from '../../graphs/Boxplot/BoxplotParcellation'
import Scatter            from '../../graphs/Scatter/Scatter'
import Midline            from '../../graphs/Line/Midline'
import VolumetricView     from '../../graphs/Volume/VolumetricView'
import Radar              from '../../graphs/Radar/Radar'

import '../../styles/home.scss'

const API = 'http://localhost:3001'

const SCALARS   = ['FA', 'MD', 'RD', 'AD']
const SEG_KEYS  = [
    { key: 'ROQS_scalar',      label: 'ROQS'      },
    { key: 'Watershed_scalar', label: 'Watershed'  },
    { key: 'CNN_scalar',       label: 'CNN'        },
]

// ── Utilitários ────────────────────────────────────────────────────────────────
function dirname(p) {
    return p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
}

function meanOf(data, methodKey, scalar) {
    const vals = data
        .map(s => s[methodKey]?.[scalar])
        .filter(v => v != null && !isNaN(Number(v)))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length
}

function fmt(v, decimals = 6) {
    if (v == null) return '—'
    return Number(v).toFixed(decimals)
}

// ── Utilitário: caminho da imagem por método ──────────────────────────────────
function imgPathForMethod(subject, method) {
    if (!subject.img_path) return null
    const dir = dirname(subject.img_path)
    if (method === 'ROQS')      return subject.img_path
    if (method === 'Watershed') return dir + '/midsagittal_watershed.png'
    if (method === 'CNN')       return dir + '/cnnBased_midsagittal.png'
    return subject.img_path
}

const PARC_METHODS = ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']
const PARC_PARTS   = ['P1', 'P2', 'P3', 'P4', 'P5']

// ── Banner do sujeito selecionado ──────────────────────────────────────────────
function SubjectBanner({ subject, onDeselect }) {
    const [imgMethod,  setImgMethod]  = useState('ROQS')
    const [imgErrors,  setImgErrors]  = useState({})
    const [parcMethod, setParcMethod] = useState('Witelson')
    const [parcScalar, setParcScalar] = useState('FA')

    const qc      = subject.qc || {}
    const hasCNN  = Object.keys(subject.CNN_scalar  || {}).length > 0
    const hasCNNP = Object.keys(subject.CNN_parcellation || {}).length > 0

    const imgPath   = imgPathForMethod(subject, imgMethod)
    const imgFailed = imgErrors[imgMethod]

    const subjectPath = subject.img_path ? dirname(dirname(subject.img_path)) : null

    // Build parcellation key: e.g. "Witelson_FA_P1"
    const parcKey = (part) => `${parcMethod}_${parcScalar}_${part}`

    return (
        <div className='subject-banner'>

            {/* ── Painel esquerdo: imagem + abas de método ──────────────── */}
            <div className='sb-left'>
                <div className='sb-img-tabs'>
                    {['ROQS', 'Watershed', 'CNN'].map(m => (
                        <button
                            key={m}
                            className={`sb-img-tab${imgMethod === m ? ' active' : ''}`}
                            onClick={() => setImgMethod(m)}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className='sb-image'>
                    {imgPath && !imgFailed
                        ? <img
                            src={`${API}/api/file?path=${encodeURIComponent(imgPath)}`}
                            alt={`Segmentação ${imgMethod}`}
                            onError={() => setImgErrors(prev => ({ ...prev, [imgMethod]: true }))}
                          />
                        : <span className='sb-no-img'>
                            {imgMethod === 'CNN' ? 'CNN: sem imagem 2D' : 'Imagem não disponível'}
                          </span>
                    }
                </div>
            </div>

            {/* ── Painel direito: dados ─────────────────────────────────── */}
            <div className='sb-info'>

                {/* Cabeçalho */}
                <div className='sb-header'>
                    <span className='sb-id'>Sujeito {subject['Id']}</span>
                    {subject.group && <span className='sb-group'>{subject.group}</span>}
                    <button className='sb-close' onClick={onDeselect} title='Voltar para todos'>×</button>
                </div>

                {subjectPath && (
                    <div className='sb-path' title={subjectPath}>{subjectPath}</div>
                )}

                {/* QC — só exibe quando há dado real */}
                {(qc.ROQS?.flag != null || qc.Watershed?.flag != null) && (
                    <div className='sb-qc-row'>
                        {[
                            { method: 'ROQS',      q: qc.ROQS      },
                            { method: 'Watershed', q: qc.Watershed },
                        ].map(({ method, q }) => {
                            if (!q || q.flag == null) return null
                            const cls   = q.flag === true ? 'fail' : 'pass'
                            const label = q.flag === true ? 'FAIL' : 'PASS'
                            return (
                                <div key={method} className='sb-qc-item'>
                                    <span className='sqc-method'>{method}</span>
                                    <span className={`sqc-badge ${cls}`}>{label}</span>
                                    {q.prob != null && (
                                        <span className='sqc-prob'>{(q.prob * 100).toFixed(1)}%</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Escalares + Parcelamento lado a lado */}
                <div className='sb-row'>

                    {/* Escalares */}
                    <div className='sb-section'>
                        <span className='sb-section-title'>Escalares</span>
                        <table className='sb-table'>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>ROQS</th>
                                    <th>Watershed</th>
                                    {hasCNN && <th>CNN</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {SCALARS.map(sc => (
                                    <tr key={sc}>
                                        <td className='sbt-label'>{sc}</td>
                                        <td>{fmt(subject.ROQS_scalar?.[sc], 4)}</td>
                                        <td>{fmt(subject.Watershed_scalar?.[sc], 4)}</td>
                                        {hasCNN && <td>{fmt(subject.CNN_scalar?.[sc], 4)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Parcelamento */}
                    <div className='sb-section'>
                        <div className='sb-section-header'>
                            <span className='sb-section-title'>Parcelamento</span>
                            <div className='sb-parc-selects'>
                                <select
                                    value={parcMethod}
                                    onChange={e => setParcMethod(e.target.value)}
                                    title='Método de parcelamento'
                                >
                                    {PARC_METHODS.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={parcScalar}
                                    onChange={e => setParcScalar(e.target.value)}
                                    title='Escalar'
                                >
                                    {SCALARS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <table className='sb-table'>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>ROQS</th>
                                    <th>Watershed</th>
                                    {hasCNNP && <th>CNN</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {PARC_PARTS.map(part => (
                                    <tr key={part}>
                                        <td className='sbt-label'>{part}</td>
                                        <td>{fmt(subject.ROQS_parcellation?.[parcKey(part)], 4)}</td>
                                        <td>{fmt(subject.Watershed_parcellation?.[parcKey(part)], 4)}</td>
                                        {hasCNNP && <td>{fmt(subject.CNN_parcellation?.[parcKey(part)], 4)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>

            </div>
        </div>
    )
}

// ── KPI cards de visão geral ───────────────────────────────────────────────────
function KPIRow({ data, method }) {
    const COLORS = {
        FA: '#4C6EF5', MD: '#00C896', RD: '#EF553B', AD: '#AB63FA',
    }

    return (
        <div className='kpi-row'>
            {SCALARS.map(sc => {
                const val = meanOf(data, method, sc)
                return (
                    <div key={sc} className='kpi-card' style={{ borderTopColor: COLORS[sc] }}>
                        <span className='kpi-label'>{sc} — Média</span>
                        <span className='kpi-value'>{fmt(val, 6)}</span>
                        <span className='kpi-sub'>
                            {data.length} sujeito{data.length !== 1 ? 's' : ''}
                            {' · '}
                            {SEG_KEYS.find(m => m.key === method)?.label}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

// ── Verifica sujeitos CNN disponíveis ──────────────────────────────────────────
function useCNNSubjects(data) {
    const [cnnSubjects, setCnnSubjects] = useState([])
    useEffect(() => {
        let cancelled = false
        async function check() {
            const results = []
            for (const s of data) {
                if (!s.img_path) continue
                const cnnPath = dirname(s.img_path) + '/cnnBased.nii.gz'
                try {
                    const res  = await fetch(`${API}/api/exists?path=${encodeURIComponent(cnnPath)}`)
                    const json = await res.json()
                    if (json.exists) results.push({ id: s['Id'], cnnPath })
                } catch (_) {}
            }
            if (!cancelled) setCnnSubjects(results)
        }
        check()
        return () => { cancelled = true }
    }, [data])
    return cnnSubjects
}

// ── Card wrapper com título ────────────────────────────────────────────────────
function Card({ title, controls, children }) {
    return (
        <div className='dash-card'>
            <div className='dc-header'>
                <span className='dc-title'>{title}</span>
                {controls && <div className='dc-controls'>{controls}</div>}
            </div>
            <div className='dc-body'>{children}</div>
        </div>
    )
}

// ── Componente principal ───────────────────────────────────────────────────────
function View({ view, data, selectedId, onDeselect }) {
    const [kpiMethod,       setKpiMethod]       = useState('ROQS_scalar')
    const [selectedCNNIdx,  setSelectedCNNIdx]  = useState(0)
    const cnnSubjects = useCNNSubjects(data)

    if (!data || data.length === 0) {
        return (
            <div className='view-wrap'>
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7a849e', fontSize: '15px' }}>
                    Nenhum sujeito para exibir.
                </div>
            </div>
        )
    }

    // ── Vista 2D ──────────────────────────────────────────────────────────────
    if (view === '2D') {
        const selectedSubject = selectedId ? data.find(s => s['Id'] === selectedId) || data[0] : null

        const methodControls = (
            <>
                {SEG_KEYS.map(m => (
                    <button
                        key={m.key}
                        className={`method-pill${kpiMethod === m.key ? ' active' : ''}`}
                        onClick={() => setKpiMethod(m.key)}
                    >
                        {m.label}
                    </button>
                ))}
            </>
        )

        return (
            <div className='view-wrap'>

                {/* Subject banner */}
                {selectedSubject && (
                    <SubjectBanner
                        subject={selectedSubject}
                        onDeselect={onDeselect}
                    />
                )}

                {/* KPI Overview */}
                <Card title='Visão Geral — Médias por Escalar' controls={methodControls}>
                    <KPIRow data={data} method={kpiMethod} />
                </Card>

                {/* Tabelas de dados */}
                <Card title='Tabela de Segmentação'>
                    <TableSegmentation data={data} type='2D' />
                </Card>

                <Card title='Tabela de Parcelamento'>
                    <TableParcellation data={data} type='2D' />
                </Card>

                {/* Midline Profile */}
                <Card title='Perfil Midline ao Longo do Corpo Caloso'>
                    <Midline data={data} />
                </Card>

                {/* Distribuições — boxplots */}
                <Card title='Distribuições — Escalares por Método de Segmentação'>
                    <BoxplotSegmentation data={data} />
                </Card>

                <Card title='Distribuições — Parcelamento por Parte'>
                    <BoxplotParcellation data={data} />
                </Card>

                {/* Parcellation Radar */}
                <Card title='Análise de Parcelamento — Radar'>
                    <Radar data={data} />
                </Card>

                {/* Scatter Correlation */}
                <Card title='Correlação entre Escalares'>
                    <Scatter data={data} />
                </Card>

            </div>
        )
    }

    // ── Vista 3D ──────────────────────────────────────────────────────────────
    if (view === '3D') {
        const selectedCNN = cnnSubjects[selectedCNNIdx] || null

        return (
            <div className='view-wrap'>

                {/* Tabelas CNN */}
                <Card title='Tabela de Segmentação — CNN-Based'>
                    <TableSegmentation data={data} type='3D' />
                </Card>

                <Card title='Tabela de Parcelamento — CNN-Based'>
                    <TableParcellation data={data} type='3D' />
                </Card>

                {/* Visualizador volumétrico */}
                <Card title='Visualizador Volumétrico 3D'>
                    <div className='area-volumetric'>
                        <div className='cnn-subject-list'>
                            <span className='cnn-list-title'>Sujeitos com CNN</span>
                            {cnnSubjects.length === 0 ? (
                                <span className='cnn-empty'>
                                    Nenhum dado CNN encontrado.<br />
                                    Execute o pipeline CNN primeiro.
                                </span>
                            ) : (
                                cnnSubjects.map((s, i) => (
                                    <div
                                        key={s.id}
                                        className={`cnn-subject-card${selectedCNNIdx === i ? ' selected' : ''}`}
                                        onClick={() => setSelectedCNNIdx(i)}
                                    >
                                        {s.id}
                                    </div>
                                ))
                            )}
                        </div>
                        <div className='cnn-viewer'>
                            {selectedCNN
                                ? <VolumetricView filePath={selectedCNN.cnnPath} />
                                : <div className='cnn-no-subject'>
                                    <span>Selecione um sujeito na lista para visualizar o corpo caloso em 3D.</span>
                                  </div>
                            }
                        </div>
                    </div>
                </Card>

            </div>
        )
    }

    return null
}

export default View
