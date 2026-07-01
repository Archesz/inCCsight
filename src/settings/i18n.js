// i18n.js — lightweight translation helper.
//
// t('key') returns the string for the current language (settings.language),
// falling back to English, then to the key itself. Coverage is progressive:
// the app chrome (nav, tabs, buttons, settings) is translated first; deeper
// chart/label strings are added over time. Changing the language reloads the
// app so every t() call re-evaluates.

import { getSetting } from './settings'

const DICT = {
    en: {
        // Landing / nav
        'nav.input':        'Select data',
        'nav.help':         'Help',
        'nav.github':       'GitHub',
        'nav.settings':     'Settings',
        'enter.subtitle':   'Corpus Callosum Analysis Tool',
        'enter.selectFolders': 'Select the folders to analyse — one per group.',
        'enter.addGroup':   'Add group',
        'enter.segMethods': 'Segmentation methods',
        'enter.pipelineOptions': 'Pipeline options',
        'enter.runAnalysis': 'Run analysis',
        'enter.lastAnalysis': 'Last analysis',
        'enter.demoData':   'Demo data',
        'enter.help':       'Frequently asked questions about the tool.',
        'enter.searchQuestions': 'Search questions...',
        'tutorial.button':  'Tutorial',
        'tutorial.onStartup': 'Show tutorial on startup',

        // Dashboard tabs
        'tab.2d':           '2D Segmentation',
        'tab.3d':           '3D Volumetric',
        'tab.compare':      'Compare Groups',
        'tab.demograph':    'Demographics',
        'tab.tractography': 'Tractography',
        'tab.qc':           'Quality Control',
        'dash.newAnalysis': 'New analysis',
        'dash.subjects':    'subjects',
        'dash.subject':     'subject',

        // Settings
        'set.intro':        'Preferences that personalise the tool for each user.',
        'set.saved':        '✓ Saved',
        'set.appearance':   'Appearance & accessibility',
        'set.analysis':     'Analysis defaults',
        'set.scientific':   'Scientific parameters',
        'set.langInfra':    'Language & infrastructure',
        'set.palette':      'Group colour palette',
        'set.theme':        'Theme',
        'set.decimals':     'Decimal places in tables',
        'set.methods':      'Pre-selected methods',
        'set.defaultScalar': 'Default scalar',
        'set.defaultSeg':   'Default segmentation method',
        'set.defaultParc':  'Default parcellation scheme',
        'set.defaultChart': 'Default chart type',
        'set.qcThreshold':  'QC PASS/FAIL threshold',
        'set.cnnDevice':    'CNN compute device',
        'set.language':     'Language',
        'set.csvDelim':     'Exported CSV delimiter',
        'set.apiEndpoint':  'API endpoint',
        'set.reset':        '↺ Reset to defaults',
        'set.savedNote':    'Saved automatically · stored locally in this browser',
    },
    pt: {
        'nav.input':        'Selecionar dados',
        'nav.help':         'Ajuda',
        'nav.github':       'GitHub',
        'nav.settings':     'Configurações',
        'enter.subtitle':   'Ferramenta de Análise do Corpo Caloso',
        'enter.selectFolders': 'Selecione as pastas para analisar — uma por grupo.',
        'enter.addGroup':   'Adicionar grupo',
        'enter.segMethods': 'Métodos de segmentação',
        'enter.pipelineOptions': 'Opções do pipeline',
        'enter.runAnalysis': 'Executar análise',
        'enter.lastAnalysis': 'Última análise',
        'enter.demoData':   'Dados de demonstração',
        'enter.help':       'Perguntas frequentes sobre a ferramenta.',
        'enter.searchQuestions': 'Buscar perguntas...',
        'tutorial.button':  'Tutorial',
        'tutorial.onStartup': 'Mostrar tutorial ao iniciar',

        'tab.2d':           'Segmentação 2D',
        'tab.3d':           'Volumétrico 3D',
        'tab.compare':      'Comparar grupos',
        'tab.demograph':    'Demografia',
        'tab.tractography': 'Tractografia',
        'tab.qc':           'Controle de qualidade',
        'dash.newAnalysis': 'Nova análise',
        'dash.subjects':    'sujeitos',
        'dash.subject':     'sujeito',

        'set.intro':        'Preferências que personalizam a ferramenta para cada usuário.',
        'set.saved':        '✓ Salvo',
        'set.appearance':   'Aparência e acessibilidade',
        'set.analysis':     'Padrões de análise',
        'set.scientific':   'Parâmetros científicos',
        'set.langInfra':    'Idioma e infraestrutura',
        'set.palette':      'Paleta de cores dos grupos',
        'set.theme':        'Tema',
        'set.decimals':     'Casas decimais nas tabelas',
        'set.methods':      'Métodos pré-selecionados',
        'set.defaultScalar': 'Escalar padrão',
        'set.defaultSeg':   'Método de segmentação padrão',
        'set.defaultParc':  'Esquema de parcelação padrão',
        'set.defaultChart': 'Tipo de gráfico padrão',
        'set.qcThreshold':  'Limiar PASS/FAIL do QC',
        'set.cnnDevice':    'Dispositivo de cálculo da CNN',
        'set.language':     'Idioma',
        'set.csvDelim':     'Delimitador do CSV exportado',
        'set.apiEndpoint':  'Endpoint da API',
        'set.reset':        '↺ Restaurar padrões',
        'set.savedNote':    'Salvo automaticamente · armazenado localmente neste navegador',
    },
}

export function t(key) {
    const lang = getSetting('language')
    return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key
}
