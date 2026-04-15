import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FolderSelector from '../FolderSelector/FolderSelector'
import { TbPlus } from 'react-icons/tb'
import Question from '../Question/Question'

// ── Métodos disponíveis no pipeline ───────────────────────────────────────
const METHODS = [
    { id: 'all',  label: 'Todos',     skipCnn: false, skipRoqs: false, desc: 'ROQS 2D + CNN 3D' },
    { id: 'roqs', label: 'ROQS (2D)', skipCnn: true,  skipRoqs: false, desc: 'Apenas segmentação 2D' },
    { id: 'cnn',  label: 'CNN (3D)',  skipCnn: false, skipRoqs: true,  desc: 'Apenas volumétrico 3D' },
]

const questions = [
    { question: 'Como inserir dados?',           response: 'Cole o caminho absoluto da pasta de cada grupo (ex: C:\\dados\\controle). Cada subpasta deve ser um sujeito com os arquivos DTI.' },
    { question: 'Como adicionar mais grupos?',   response: 'Clique em "+ Adicionar grupo", dê um nome ao grupo e informe o caminho da pasta correspondente.' },
    { question: 'Como comparar grupos?',         response: 'Após a análise, o dashboard exibe abas por grupo e uma aba "Comparar Grupos" com boxplots lado a lado.' },
    { question: 'O que é ROQS e CNN?',           response: 'ROQS gera a segmentação 2D do corpo caloso. CNN gera a segmentação volumétrica 3D. "Todos" executa ambos.' },
    { question: 'Quais arquivos são necessários?', response: 'Dados DTI no formato NIfTI (.nii / .nii.gz) com arquivos de autovetores/autovalores: dti_L1–3, dti_V1–3.' },
]

let _nextId = 2

function View({ type }) {
    const navigate = useNavigate()

    const [folderGroups, setFolderGroups] = useState([
        { id: 1, path: '', groupName: 'Group 1' }
    ])
    const [selectedMethod, setSelectedMethod] = useState('all')
    const [filter, setFilter] = useState('')

    // ── Helpers de UI ──────────────────────────────────────────────────────

    function showLoading() {
        const log    = document.querySelector('#pipeline-log')
        const screen = document.querySelector('#loading-screen')
        if (log)    log.textContent = ''
        if (screen) screen.style.display = 'flex'
    }

    function hideLoading() {
        const screen = document.querySelector('#loading-screen')
        if (screen) screen.style.display = 'none'
    }

    function appendLog(text) {
        const log = document.querySelector('#pipeline-log')
        if (log) { log.textContent += text; log.scrollTop = log.scrollHeight }
    }

    // ── SSE streaming ──────────────────────────────────────────────────────

    async function streamPipeline(url, body) {
        showLoading()
        try {
            const response = await fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    body ? JSON.stringify(body) : undefined,
            })

            if (!response.ok) throw new Error(
                `Servidor retornou ${response.status}. Certifique-se de que "npm run server" está rodando.`
            )

            const reader  = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const msg = JSON.parse(line.slice(6))
                        if (msg.text) appendLog(msg.text)
                        if (msg.done) {
                            if (msg.code === 0) {
                                navigate('/Home')
                            } else {
                                hideLoading()
                                alert('Pipeline encerrou com erros. Verifique o log acima.')
                            }
                        }
                    } catch (_) {}
                }
            }
        } catch (err) {
            hideLoading()
            alert(`Erro ao conectar com o servidor:\n${err.message}`)
        }
    }

    // ── Gerenciamento de grupos ─────────────────────────────────────────────

    function updateGroup(id, updates) {
        setFolderGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
    }

    function addGroup() {
        const id = _nextId++
        setFolderGroups(prev => [...prev, { id, path: '', groupName: `Group ${prev.length + 1}` }])
    }

    function removeGroup(id) {
        setFolderGroups(prev => prev.filter(g => g.id !== id))
    }

    // ── Ações do pipeline ───────────────────────────────────────────────────

    function startAnalyzes() {
        const valid = folderGroups.filter(g => g.path.trim())
        if (valid.length === 0) {
            alert('Informe pelo menos um caminho de pasta antes de executar a análise.')
            return
        }

        const paths     = valid.map(g => g.path.trim())
        const groupsMap = {}
        valid.forEach(g => { groupsMap[g.path.trim()] = g.groupName.trim() || `Group ${g.id}` })

        const { skipCnn, skipRoqs } = METHODS.find(m => m.id === selectedMethod)

        streamPipeline('/api/run-pipeline', { paths, groupsMap, skipCnn, skipRoqs })
    }

    function loadLast() {
        streamPipeline('/api/load-last', null)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (type === 'Input') {
        return (
            <>
                <span className='enter-name'>Selecione as pastas a analisar — uma por grupo.</span>

                {/* Lista de grupos */}
                <div className='folders-inputs'>
                    {folderGroups.map((g, idx) => (
                        <FolderSelector
                            key={g.id}
                            id={g.id}
                            path={g.path}
                            groupName={g.groupName}
                            colorIndex={idx}
                            onUpdate={updates => updateGroup(g.id, updates)}
                            onRemove={folderGroups.length > 1 ? () => removeGroup(g.id) : null}
                        />
                    ))}

                    <button className='add-btn' onClick={addGroup}>
                        <TbPlus className='add-icon' />
                        <span>Adicionar grupo</span>
                    </button>
                </div>

                {/* Seletor de métodos */}
                <div className='method-selector'>
                    <span className='method-label'>Métodos de segmentação</span>
                    <div className='method-pills'>
                        {METHODS.map(m => (
                            <button
                                key={m.id}
                                className={`method-pill${selectedMethod === m.id ? ' active' : ''}`}
                                onClick={() => setSelectedMethod(m.id)}
                                title={m.desc}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Botões de ação */}
                <div className='row-btns'>
                    <div className='secondary-btns'>
                        <div className='btn-history' onClick={loadLast}>
                            <span>Última análise</span>
                        </div>
                        <div className='btn-demo' onClick={() => navigate('/Home')}>
                            <span>Dados de teste</span>
                        </div>
                    </div>
                    <button className='btn-start' onClick={startAnalyzes}>
                        Executar análise
                    </button>
                </div>
            </>
        )
    }

    if (type === 'Help') {
        const filtered = questions.filter(q =>
            q.question.toLowerCase().includes(filter.toLowerCase()) ||
            q.response.toLowerCase().includes(filter.toLowerCase())
        )
        return (
            <div className='enter-question'>
                <div className='search-field'>
                    <span className='enter-name'>Perguntas frequentes sobre a ferramenta.</span>
                    <input
                        className='search-input'
                        placeholder='Pesquisar dúvidas...'
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                <div className='questions-container'>
                    {filtered.map((q, i) => (
                        <Question key={i} question={q.question} response={q.response} />
                    ))}
                </div>
            </div>
        )
    }

    return <div className='news-container'><span>Em breve</span></div>
}

export default View
