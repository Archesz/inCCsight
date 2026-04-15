import React, { useState, useEffect } from 'react'
import Plot from 'react-plotly.js'

/* Componentes */
import TableSegmentation  from '../../graphs/Table/TableSegmentation'
import TableParcellation  from '../../graphs/Table/TableParcellation'
import BoxplotSegmentation from '../../graphs/Boxplot/BoxplotSegmentation'
import BoxplotParcellation from '../../graphs/Boxplot/BoxplotParcellation'
import Scatter            from '../../graphs/Scatter/Scatter'
import Midline            from '../../graphs/Line/Midline'
import VolumetricView     from '../../graphs/Volume/VolumetricView'
import Radar              from '../../graphs/Radar/Radar'

/* Ícones */
import { AiOutlineClose } from 'react-icons/ai'

import '../../styles/home.scss'

// ── Utilitário: resolve o diretório de um caminho (sem path.dirname) ───────
function dirname(filePath) {
    const normalized = filePath.replace(/\\/g, '/')
    const parts = normalized.split('/')
    parts.pop()
    return parts.join('/')
}

// ── Componente de imagem de segmentação ────────────────────────────────────
function SegmentationPlot({ imgPath }) {
    if (!imgPath) return <span className='msg-image'>Imagem não disponível</span>

    // Serve a imagem via API local (evita CORS e leitura direta de disco)
    const src = `/api/file?path=${encodeURIComponent(imgPath)}`

    return (
        <Plot
            data={[{
                type:          'image',
                source:        src,
                hovertemplate: 'x: %{x}  y: %{y}<extra></extra>',
            }]}
            layout={{
                margin:       { l: 0, r: 0, t: 0, b: 0 },
                xaxis:        { visible: false, showgrid: false },
                yaxis:        { visible: false, showgrid: false },
                paper_bgcolor:'transparent',
                plot_bgcolor: 'transparent',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
        />
    )
}

// ── Verifica sujeitos CNN disponíveis via API ──────────────────────────────
function useCNNSubjects(data) {
    const [cnnSubjects, setCnnSubjects] = useState([])

    useEffect(() => {
        let cancelled = false
        async function check() {
            const results = []
            for (const subject of data) {
                const imgPath = subject['img_path']
                if (!imgPath) continue
                const cnnPath = dirname(imgPath) + '/cnnBased.nii.gz'
                try {
                    const res  = await fetch(`/api/exists?path=${encodeURIComponent(cnnPath)}`)
                    const json = await res.json()
                    if (json.exists) results.push({ id: subject['Id'], cnnPath })
                } catch (_) {}
            }
            if (!cancelled) setCnnSubjects(results)
        }
        check()
        return () => { cancelled = true }
    }, [data])

    return cnnSubjects
}

// ── Componente principal ───────────────────────────────────────────────────
function View(props) {
    const data        = props.data
    const cnnSubjects = useCNNSubjects(data)
    const [selectedCNNIdx, setSelectedCNNIdx] = useState(0)

    function closeSelect() {
        const panel = document.querySelector('#subjectPainel')
        if (panel) panel.style.display = 'none'
    }

    if (props.view === '2D') {
        return (
            <div className='view-container' id="main-area">

                <div className='subject-select' id="subjectPainel">
                    <div className='subject-image'>
                        <span className='subject-name'>{data[0]['Id']}</span>

                        <div className='image'>
                            <SegmentationPlot imgPath={data[0]['img_path']} />
                        </div>

                        <div className='image-prompts'>
                            <div className='image-inputs'>
                                <div className='input-group'>
                                    <label>Segm. Method</label>
                                    <select>
                                        <option>Watershed</option>
                                        <option>ROQS Based</option>
                                        <option>CNN Based</option>
                                    </select>
                                </div>
                                <div className='input-group'>
                                    <label>Scalar</label>
                                    <select>
                                        <option value="wFA">wFA</option>
                                        <option value="FA">FA</option>
                                        <option value="MD">MD</option>
                                        <option value="RD">RD</option>
                                        <option value="AD">AD</option>
                                    </select>
                                </div>
                            </div>
                            <div className='image-buttons'>
                                <button className='btn-remove'>Remove</button>
                            </div>
                        </div>
                    </div>

                    <div className='subject-qc'>
                        <span className='qc-title'>Quality Check</span>
                        {['ROQS', 'Watershed'].map(method => {
                            const qc    = data[0]?.qc?.[method]
                            const flag  = qc?.flag
                            const prob  = qc?.prob
                            const dotClass = flag === true  ? 'qc-dot qc-fail'
                                           : flag === false ? 'qc-dot qc-pass'
                                           :                  'qc-dot qc-na'
                            const label = flag === true  ? 'FAIL'
                                        : flag === false ? 'PASS'
                                        :                  'N/A'
                            return (
                                <div key={method} className='qc-row'>
                                    <span className={dotClass} />
                                    <span className='qc-method'>{method}</span>
                                    <span className={`qc-label qc-label-${label.toLowerCase()}`}>{label}</span>
                                    {prob != null && <span className='qc-prob'>{(prob * 100).toFixed(1)}%</span>}
                                </div>
                            )
                        })}
                    </div>

                    <div className='subject-tables'>
                        <TableSegmentation data={data} bg_color="#1F2C56" color="white" type="2D"/>
                        <TableParcellation data={data} bg_color="#1F2C56" color="white" type="2D"/>
                    </div>

                    <AiOutlineClose className='close-icon' onClick={closeSelect}/>
                </div>

                <div className='area-view'>
                    <div className='area-table'>
                        <TableSegmentation data={data} type="2D"/>
                        <TableParcellation data={data} type="2D"/>
                    </div>
                    <div className='area-boxplot'>
                        <BoxplotSegmentation data={data} />
                        <BoxplotParcellation data={data} />
                    </div>
                    <div className='area-scatter'>
                        <Scatter data={data}/>
                    </div>
                    <div className='area-midline'>
                        <Midline data={data}/>
                        <Radar data={data}/>
                    </div>
                </div>
            </div>
        )
    }

    if (props.view === '3D') {
        const selectedSubject = cnnSubjects[selectedCNNIdx] || null

        return (
            <div className='view-container' id="main-area">

                <div className='subject-select' id="subjectPainel">
                    <div className='subject-image'>
                        <span className='subject-name'>3D: {selectedSubject ? selectedSubject.id : data[0]['Id']}</span>
                        <div className='image-prompts'>
                            <div className='image-inputs'>
                                <div className='input-group'>
                                    <label>Segm. Method</label>
                                    <select><option>CNN Based</option></select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='subject-tables'>
                        <TableSegmentation data={data} bg_color="#1F2C56" color="white" type="3D"/>
                        <TableParcellation data={data} bg_color="#1F2C56" color="white" type="3D"/>
                    </div>

                    <AiOutlineClose className='close-icon' onClick={closeSelect}/>
                </div>

                <div className='area-view'>
                    <div className='area-table'>
                        <TableSegmentation data={data} type="3D"/>
                        <TableParcellation data={data} type="3D"/>
                    </div>

                    <div className='area-volumetric'>
                        <div className='cnn-subject-list'>
                            <span className='cnn-list-title'>Sujeitos com dados CNN</span>
                            {cnnSubjects.length === 0 ? (
                                <span className='cnn-empty'>Nenhum dado CNN encontrado.<br/>Execute o pipeline CNN primeiro.</span>
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
                            {selectedSubject ? (
                                <VolumetricView filePath={selectedSubject.cnnPath} />
                            ) : (
                                <div className='cnn-no-subject'>
                                    <span>Selecione um sujeito na lista para visualizar o corpo caloso em 3D.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

export default View
