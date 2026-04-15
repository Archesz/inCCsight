import React from "react";
import './FolderSelector.scss'
import { TbFolder, TbX, TbChecks } from 'react-icons/tb'

const COLOR_CLASSES = ['color-0', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5']

function FolderSelector({ id, path, groupName, onUpdate, onRemove, colorIndex }) {

    const colorClass = COLOR_CLASSES[colorIndex % COLOR_CLASSES.length]

    const folderLabel = path
        ? path.split(/[\\/]/).filter(Boolean).pop() || path
        : ''

    return (
        <div className={`folder-row ${colorClass}`}>
            <div className='group-stripe' />

            {/* Nome do grupo */}
            <input
                className="group-name-input"
                placeholder="Nome do grupo (ex: Controle)"
                value={groupName}
                onChange={e => onUpdate({ groupName: e.target.value })}
            />

            {/* Campo de caminho absoluto */}
            <div className={`folder-picker-btn ${path ? 'has-path' : ''}`}>
                <TbFolder className="folder-icon" />
                <input
                    type="text"
                    className="path-text-input"
                    placeholder="Cole o caminho absoluto da pasta (ex: C:\dados\grupo1)"
                    value={path}
                    onChange={e => onUpdate({ path: e.target.value })}
                    title={path || 'Nenhum caminho informado'}
                />
                {path && (
                    <span className="folder-label-badge" title={path}>
                        {folderLabel}
                        <TbChecks className="check-icon" />
                    </span>
                )}
            </div>

            {onRemove && (
                <button className="remove-btn" onClick={onRemove} title="Remover grupo">
                    <TbX />
                </button>
            )}
        </div>
    )
}

export default FolderSelector
