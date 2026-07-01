import React, { useState } from 'react'
import './FolderSelector.scss'
import { TbFolder, TbFolders, TbX, TbChecks, TbLoader } from 'react-icons/tb'
import { apiBase } from '../../settings/settings'

const API = apiBase()
const COLOR_CLASSES = ['color-0', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5']

function FolderSelector({ id, path, groupName, onUpdate, onRemove, colorIndex }) {
    const [browsing, setBrowsing] = useState(false)

    const colorClass = COLOR_CLASSES[colorIndex % COLOR_CLASSES.length]
    const folderLabel = path
        ? path.split(/[\\/]/).filter(Boolean).pop() || path
        : ''

    async function handleBrowse() {
        setBrowsing(true)
        try {
            const res  = await fetch(`${API}/api/browse-folder`, { method: 'POST' })
            const data = await res.json()
            if (data.error) {
                alert(`Folder picker not available:\n${data.error}\n\nPaste the path manually instead.`)
            } else if (data.path) {
                onUpdate({ path: data.path })
            }
            // data.path === '' means the user cancelled — do nothing
        } catch {
            alert('Could not open folder picker.\nMake sure the server is running (npm run dev).')
        } finally {
            setBrowsing(false)
        }
    }

    return (
        <div className={`folder-row ${colorClass}`}>
            <div className='group-stripe' />

            {/* Group name */}
            <input
                className='group-name-input'
                placeholder='Group name (e.g. Control)'
                value={groupName}
                onChange={e => onUpdate({ groupName: e.target.value })}
            />

            {/* Path field + browse button */}
            <div className={`folder-picker-btn ${path ? 'has-path' : ''}`}>
                <TbFolder className='folder-icon' />
                <input
                    type='text'
                    className='path-text-input'
                    placeholder='Folder path  (type or click Browse →)'
                    value={path}
                    onChange={e => onUpdate({ path: e.target.value })}
                    title={path || 'No path selected'}
                />
                {path && (
                    <span className='folder-label-badge' title={path}>
                        {folderLabel}
                        <TbChecks className='check-icon' />
                    </span>
                )}
            </div>

            {/* Browse button */}
            <button
                className={`browse-btn${browsing ? ' browsing' : ''}`}
                onClick={handleBrowse}
                disabled={browsing}
                title='Open folder picker dialog'
            >
                {browsing
                    ? <TbLoader className='browse-spinner' />
                    : <TbFolders className='browse-icon' />
                }
                <span>{browsing ? '…' : 'Browse'}</span>
            </button>

            {onRemove && (
                <button className='remove-btn' onClick={onRemove} title='Remove group'>
                    <TbX />
                </button>
            )}
        </div>
    )
}

export default FolderSelector
