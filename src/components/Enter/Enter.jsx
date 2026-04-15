import React, { useState } from 'react'
import { Dna } from 'react-loader-spinner'
import './Enter.scss'
import logo from '../../assets/inccsight.png'

import { TbHome2, TbQuestionCircle, TbBrandGithub, TbSettings } from 'react-icons/tb'
import View from './View'
import Loading from '../Loading/Loading'

const NAV = [
    { icon: TbHome2,          name: 'Input',    title: 'Selecionar dados'   },
    { icon: TbQuestionCircle, name: 'Help',     title: 'Ajuda'              },
    { icon: TbBrandGithub,    name: 'Github',   title: 'GitHub'             },
    { icon: TbSettings,       name: 'Settings', title: 'Configurações'      },
]

function Enter() {
    const [page, setPage] = useState('Input')

    return (
        <div className='enter-wrap'>
            {/* Loading overlay */}
            <div className='loading-screen' id='loading-screen'>
                <Loading />
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
        </div>
    )
}

export default Enter
