import React, { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import './VolumetricView.scss'

function getMinMax(arr) {
    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < arr.length; i++) {
        const v = arr[i]
        if (v < min) min = v
        if (v > max) max = v
    }

    return { min, max }
}

/* ── NIfTI parser (browser — DataView em vez de Node Buffer) ─────────────── */
function parseNifti1(arrayBuffer) {
    const v  = new DataView(arrayBuffer)
    const nx = v.getInt16(42, true)
    const ny = v.getInt16(44, true)
    const nz = v.getInt16(46, true)
    const dx = Math.abs(v.getFloat32(80, true))
    const dy = Math.abs(v.getFloat32(84, true))
    const dz = Math.abs(v.getFloat32(88, true))
    const datatype   = v.getInt16(70, true)
    const vox_offset = Math.floor(v.getFloat32(108, true))
    const n          = nx * ny * nz

    // .slice() garante alinhamento correto independentemente do offset
    let voxels
    if      (datatype === 2)  voxels = Float32Array.from(new Uint8Array  (arrayBuffer.slice(vox_offset, vox_offset + n)))
    else if (datatype === 4)  voxels = Float32Array.from(new Int16Array  (arrayBuffer.slice(vox_offset, vox_offset + n * 2)))
    else if (datatype === 8)  voxels = Float32Array.from(new Int32Array  (arrayBuffer.slice(vox_offset, vox_offset + n * 4)))
    else if (datatype === 16) voxels = new Float32Array                  (arrayBuffer.slice(vox_offset, vox_offset + n * 4))
    else if (datatype === 64) voxels = Float32Array.from(new Float64Array(arrayBuffer.slice(vox_offset, vox_offset + n * 8)))
    else                      voxels = new Float32Array                  (arrayBuffer.slice(vox_offset, vox_offset + n * 4))

    return { nx, ny, nz, dx, dy, dz, voxels }
}

/* ── Subamostrador de voxels → arrays x/y/z/value para Plotly ────────────── */
function buildGrid(nifti, step = 2) {
    const { nx, ny, nz, dx, dy, dz, voxels } = nifti
    const numX = Math.ceil(nx / step)
    const numY = Math.ceil(ny / step)
    const numZ = Math.ceil(nz / step)
    const n    = numX * numY * numZ

    const x = new Float32Array(n), y = new Float32Array(n),
          z = new Float32Array(n), value = new Float32Array(n)
    let i = 0
    for (let iz = 0; iz < nz; iz += step)
        for (let iy = 0; iy < ny; iy += step)
            for (let ix = 0; ix < nx; ix += step) {
                x[i] = ix * dx; y[i] = iy * dy; z[i] = iz * dz
                value[i] = voxels[ix + iy * nx + iz * nx * ny]
                i++
            }

    return {
        x: Array.from(x), y: Array.from(y),
        z: Array.from(z), value: Array.from(value),
    }
}

/* ── Colorscales ─────────────────────────────────────────────────────────── */
const COLORSCALES = {
    // Matéria branca: tons creme/osso — mais realista anatomicamente
    'Anatômico': [
        [0.00, '#c8b89a'],
        [0.40, '#ddd0b8'],
        [0.70, '#efe8d8'],
        [1.00, '#fdf8f0'],
    ],
    // Azul científico — destaque em publicações
    'Científico': [
        [0.00, '#1a3a6b'],
        [0.40, '#2d6ebd'],
        [0.70, '#6aaede'],
        [1.00, '#b8d9f0'],
    ],
    // Térmico quente
    'Térmico': [
        [0.00, '#350d36'],
        [0.30, '#a3307e'],
        [0.65, '#f66d19'],
        [1.00, '#fce725'],
    ],
}

/* ── Modos de renderização ───────────────────────────────────────────────── */
// 'surface'  → isosuperfície sólida (melhor para contorno)
// 'volume'   → renderização volumétrica por ray casting (melhor para estrutura interna)
const RENDER_MODES = ['Superfície', 'Volume']

function buildTraces(isoData, renderMode, colorscaleName, opacity) {
    const cs = COLORSCALES[colorscaleName]

    const baseLighting = {
        ambient:    0.55,
        diffuse:    0.90,
        specular:   0.65,
        roughness:  0.25,
        fresnel:    0.40,
    }
    const lightposition = { x: 200, y: 100, z: 200 }
    const caps = { x: { show: false }, y: { show: false }, z: { show: false } }

    if (renderMode === 'Volume') {
        // Ray-cast volumétrico: mostra estrutura interna com transparência
        return [{
            type:    'volume',
            x: isoData.x, y: isoData.y, z: isoData.z, value: isoData.value,
            isomin: 0.05,
            isomax: 1.00,
            opacity: Math.min(opacity * 0.25, 0.3),
            surface: { count: 20 },
            colorscale: cs,
            showscale:  false,
            opacityscale: [
                [0.00, 0.00],
                [0.35, 0.00],
                [0.50, 0.40],
                [0.75, 0.75],
                [1.00, 1.00],
            ],
            caps,
        }]
    }

    // Modo Superfície: isosuperfície sólida + camada exterior translúcida
    return [
        // Camada exterior translúcida — dá profundidade
        {
            type:    'isosurface',
            x: isoData.x, y: isoData.y, z: isoData.z, value: isoData.value,
            isomin: 0.25,
            isomax: 0.44,
            surface: { count: 1, fill: 0.4 },
            colorscale: cs,
            showscale:  false,
            opacity:    Math.min(opacity * 0.3, 0.35),
            flatshading: false,
            lighting:    { ...baseLighting, ambient: 0.3 },
            lightposition,
            caps,
        },
        // Superfície principal sólida
        {
            type:    'isosurface',
            x: isoData.x, y: isoData.y, z: isoData.z, value: isoData.value,
            isomin: 0.45,
            isomax: 1.00,
            surface: { count: 1, fill: 1.0, pattern: 'all' },
            colorscale: cs,
            showscale:  false,
            opacity:    opacity,
            flatshading: false,
            lighting:    baseLighting,
            lightposition,
            caps,
        },
    ]
}

/* ── Rótulos de orientação anatômica (scatter3d) ─────────────────────────── */
function buildOrientationLabels(isoData) {
    const xs = isoData.x, ys = isoData.y, zs = isoData.z

    const { min: xMin, max: xMax } = getMinMax(xs)
    const { min: yMin, max: yMax } = getMinMax(ys)
    const { min: zMin, max: zMax } = getMinMax(zs)

    const cx = (xMin + xMax) / 2
    const cy = (yMin + yMax) / 2

    const pad = 10

    return {
        type: 'scatter3d',
        mode: 'text',
        x: [xMax + pad, xMin - pad, cx,             cx            ],
        y: [cy,         cy,         yMax + pad,     yMin - pad    ],
        z: [zMax / 2,   zMax / 2,   zMax / 2,       zMax / 2      ],
        text: ['P', 'A', 'L', 'R'],
        textfont: { color: '#94a3b8', size: 11, family: 'monospace' },
        showlegend: false,
        hoverinfo: 'skip',
    }
}
/* ── Componente principal ─────────────────────────────────────────────────── */
function VolumetricView({ filePath }) {
    const [isoData,      setIsoData]      = useState(null)
    const [loading,      setLoading]      = useState(true)
    const [error,        setError]        = useState(null)
    const [opacity,      setOpacity]      = useState(0.85)
    const [renderMode,   setRenderMode]   = useState('Superfície')
    const [colorscale,   setColorscale]   = useState('Anatômico')
    const [showLabels,   setShowLabels]   = useState(true)

    useEffect(() => {
        setLoading(true); setError(null); setIsoData(null)

        const load = async () => {
            try {
                const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
                if (!res.ok) throw new Error(`Arquivo não encontrado (HTTP ${res.status})`)

                let arrayBuffer
                if (filePath.endsWith('.gz')) {
                    const ds = new DecompressionStream('gzip')
                    arrayBuffer = await new Response(res.body.pipeThrough(ds)).arrayBuffer()
                } else {
                    arrayBuffer = await res.arrayBuffer()
                }

                setIsoData(buildGrid(parseNifti1(arrayBuffer), 2))
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [filePath])

    if (loading) return <div className='volumetric-loading'><span>Carregando volume 3D…</span></div>
    if (error)   return (
        <div className='volumetric-error'>
            <span>{error}</span><code>{filePath}</code>
        </div>
    )

    const BG     = '#12192e'
    const traces = buildTraces(isoData, renderMode, colorscale, opacity)
    if (showLabels) traces.push(buildOrientationLabels(isoData))

    const hiddenAxis = {
        visible: false, showgrid: false, zeroline: false,
        showticklabels: false, showbackground: false, title: { text: '' },
    }

    const layout = {
        title: {
            text:  'Corpo Caloso — Segmentação Volumétrica',
            font:  { size: 14, color: '#94a3b8' },
            x: 0.5,
        },
        scene: {
            xaxis: hiddenAxis, yaxis: hiddenAxis, zaxis: hiddenAxis,
            bgcolor: BG,
            camera: { eye: { x: 1.6, y: 1.6, z: 0.7 } },
            aspectmode: 'data',
        },
        height:        520,
        margin:        { t: 48, b: 8, l: 8, r: 8 },
        paper_bgcolor: BG,
        font:          { color: '#cbd5e1' },
        showlegend:    false,
    }

    return (
        <div className='volumetric-container'>
            <Plot
                data={traces}
                layout={layout}
                config={{ displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['toImage'] }}
                style={{ width: '100%' }}
                useResizeHandler
            />

            {/* Painel de controles */}
            <div className='volumetric-controls'>

                <div className='ctrl-group'>
                    <label>Modo</label>
                    <div className='ctrl-pills'>
                        {RENDER_MODES.map(m => (
                            <button
                                key={m}
                                className={`ctrl-pill${renderMode === m ? ' active' : ''}`}
                                onClick={() => setRenderMode(m)}
                            >{m}</button>
                        ))}
                    </div>
                </div>

                <div className='ctrl-group'>
                    <label>Colorscale</label>
                    <div className='ctrl-pills'>
                        {Object.keys(COLORSCALES).map(cs => (
                            <button
                                key={cs}
                                className={`ctrl-pill${colorscale === cs ? ' active' : ''}`}
                                onClick={() => setColorscale(cs)}
                            >{cs}</button>
                        ))}
                    </div>
                </div>

                <div className='ctrl-group'>
                    <label>Opacidade: {Math.round(opacity * 100)}%</label>
                    <input
                        type='range' min={0.1} max={1.0} step={0.05}
                        value={opacity}
                        onChange={e => setOpacity(parseFloat(e.target.value))}
                    />
                </div>

                <div className='ctrl-group'>
                    <label className='ctrl-check'>
                        <input
                            type='checkbox'
                            checked={showLabels}
                            onChange={e => setShowLabels(e.target.checked)}
                        />
                        Orientação anatômica (A/P/L/R)
                    </label>
                </div>

            </div>
        </div>
    )
}

export default VolumetricView
