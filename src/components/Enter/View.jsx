import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FolderSelector from '../FolderSelector/FolderSelector'
import { TbPlus } from 'react-icons/tb'
import Question from '../Question/Question'

// Chama a API diretamente na porta do servidor Express,
// sem passar pelo proxy do CRA (que pode bufferizar SSE).
const API = 'http://localhost:3001'

// ── Métodos disponíveis no pipeline ───────────────────────────────────────
// ROQS e Watershed compartilham o mesmo script (roqs/main.py); selecionar
// qualquer um deles ativa o pipeline 2D completo.
const METHODS = [
    { id: 'roqs',      label: 'ROQS (2D)',      desc: 'Segmentação ROQS 2D clássica' },
    { id: 'watershed', label: 'Watershed (2D)', desc: 'Segmentação por watershed (roda junto com ROQS)' },
    { id: 'cnn',       label: 'CNN (3D)',        desc: 'Segmentação volumétrica 3D (requer PyTorch)' },
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
    // conjunto de métodos selecionados (multi-select)
    const [selectedMethods, setSelectedMethods] = useState(new Set(['roqs', 'watershed', 'cnn']))
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

    async function streamPipeline(endpoint, body) {
        showLoading()
        try {
            const response = await fetch(`${API}${endpoint}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    body ? JSON.stringify(body) : undefined,
            })

            if (!response.ok) {
                const text = await response.text().catch(() => '')
                throw new Error(`Servidor retornou ${response.status}.\n${text}`)
            }

            const reader  = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer    = ''
            let navigated = false

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
                        if (msg.done && !navigated) {
                            navigated = true
                            if (msg.code === 0) {
                                navigate('/Home')
                            } else {
                                hideLoading()
                                appendLog('\n✖ Pipeline encerrou com erros. Verifique o log acima.\n')
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

    async function startAnalyzes() {
        const valid = folderGroups.filter(g => g.path.trim())
        if (valid.length === 0) {
            alert('Informe pelo menos um caminho de pasta antes de executar a análise.')
            return
        }

        // 1. Verifica se o servidor Express está rodando
        try {
            const ping = await fetch(`${API}/api/ping`, { signal: AbortSignal.timeout(3000) })
            if (!ping.ok) throw new Error()
        } catch {
            alert(
                'Servidor não encontrado na porta 3001.\n\n' +
                'Certifique-se de que está rodando com:\n  npm run dev\nou:\n  npm run server'
            )
            return
        }

        // 2. Verifica se os caminhos existem no disco
        const paths = valid.map(g => g.path.trim())
        try {
            const checkRes = await fetch(`${API}/api/check-paths`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ paths }),
            })
            const checks  = await checkRes.json()
            const missing = checks.filter(c => !c.exists).map(c => c.path)
            if (missing.length > 0) {
                alert(
                    `As seguintes pastas não foram encontradas no disco:\n\n${missing.join('\n')}\n\n` +
                    'Verifique se o caminho está correto e se a pasta existe.'
                )
                return
            }
        } catch {
            // Se a verificação falhar, prossegue (não bloqueia)
        }

        const groupsMap = {}
        valid.forEach(g => { groupsMap[g.path.trim()] = g.groupName.trim() || `Group ${g.id}` })

        // ROQS e Watershed usam o mesmo script; basta um deles para rodar o pipeline 2D
        const skipRoqs = !selectedMethods.has('roqs') && !selectedMethods.has('watershed')
        const skipCnn  = !selectedMethods.has('cnn')

        streamPipeline('/api/run-pipeline', { paths, groupsMap, skipCnn, skipRoqs })
    }

    async function loadLast() {
        // Verifica servidor antes de tentar carregar
        try {
            const ping = await fetch(`${API}/api/ping`, { signal: AbortSignal.timeout(3000) })
            if (!ping.ok) throw new Error()
        } catch {
            alert(
                'Servidor não encontrado na porta 3001.\n\n' +
                'Certifique-se de que está rodando com:\n  npm run dev\nou:\n  npm run server'
            )
            return
        }
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

                {/* Seletor de métodos — multi-select */}
                <div className='method-selector'>
                    <span className='method-label'>Métodos de segmentação</span>
                    <div className='method-pills'>
                        {METHODS.map(m => {
                            const checked = selectedMethods.has(m.id)
                            return (
                                <label
                                    key={m.id}
                                    className={`method-pill${checked ? ' active' : ''}`}
                                    title={m.desc}
                                >
                                    <input
                                        type='checkbox'
                                        checked={checked}
                                        onChange={() => {
                                            setSelectedMethods(prev => {
                                                const next = new Set(prev)
                                                next.has(m.id) ? next.delete(m.id) : next.add(m.id)
                                                return next
                                            })
                                        }}
                                        style={{ marginRight: 6 }}
                                    />
                                    {m.label}
                                </label>
                            )
                        })}
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
