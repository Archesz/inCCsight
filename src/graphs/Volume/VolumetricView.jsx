import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { marchingCubes } from 'isosurface'
import './VolumetricView.scss'

// ── NIfTI parser (browser, DataView) ─────────────────────────────────────────
function parseNifti1(arrayBuffer) {
    const v          = new DataView(arrayBuffer)
    const nx         = v.getInt16(42, true)
    const ny         = v.getInt16(44, true)
    const nz         = v.getInt16(46, true)
    const dx         = Math.abs(v.getFloat32(80, true)) || 1
    const dy         = Math.abs(v.getFloat32(84, true)) || 1
    const dz         = Math.abs(v.getFloat32(88, true)) || 1
    const datatype   = v.getInt16(70, true)
    const vox_offset = Math.max(352, Math.floor(v.getFloat32(108, true)))
    const n          = nx * ny * nz

    let voxels
    if      (datatype === 2)  voxels = new Uint8Array   (arrayBuffer, vox_offset, n)
    else if (datatype === 4)  voxels = Float32Array.from(new Int16Array  (arrayBuffer.slice(vox_offset, vox_offset + n * 2)))
    else if (datatype === 8)  voxels = Float32Array.from(new Int32Array  (arrayBuffer.slice(vox_offset, vox_offset + n * 4)))
    else if (datatype === 16) voxels = new Float32Array  (arrayBuffer, vox_offset, n)
    else if (datatype === 64) voxels = Float32Array.from(new Float64Array(arrayBuffer.slice(vox_offset, vox_offset + n * 8)))
    else                      voxels = new Uint8Array   (arrayBuffer, vox_offset, n)

    return { nx, ny, nz, dx, dy, dz, voxels }
}

// ── Build Three.js BufferGeometry from NIfTI using marching cubes ─────────────
function buildGeometry(nifti) {
    const { nx, ny, nz, dx, dy, dz, voxels } = nifti

    // isosurface expects a function (x, y, z) → scalar value
    const sdf = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return -1
        return voxels[x + y * nx + z * nx * ny] > 0.5 ? 1 : -1
    }

    const result = marchingCubes([nx, ny, nz], sdf, [[0, 0, 0], [nx, ny, nz]])

    if (!result || !result.positions || result.positions.length === 0) return null

    // Scale from voxel space to mm space, center at origin
    const cx = (nx * dx) / 2
    const cy = (ny * dy) / 2
    const cz = (nz * dz) / 2

    const rawPos  = result.positions   // array of [x,y,z] voxel coords
    const rawCells = result.cells      // array of [i,j,k] triangle indices

    const posArr  = new Float32Array(rawCells.length * 9)
    const normArr = new Float32Array(rawCells.length * 9)

    let p = 0
    for (const [i, j, k] of rawCells) {
        const a = rawPos[i], b = rawPos[j], c = rawPos[k]

        const ax = a[0]*dx - cx,  ay = a[1]*dy - cy,  az = a[2]*dz - cz
        const bx = b[0]*dx - cx,  by = b[1]*dy - cy,  bz = b[2]*dz - cz
        const ccx = c[0]*dx - cx, ccy = c[1]*dy - cy, ccz = c[2]*dz - cz

        posArr[p]   = ax; posArr[p+1] = ay; posArr[p+2] = az
        posArr[p+3] = bx; posArr[p+4] = by; posArr[p+5] = bz
        posArr[p+6] = ccx; posArr[p+7] = ccy; posArr[p+8] = ccz

        // Face normal
        const ux = bx-ax, uy = by-ay, uz = bz-az
        const vx = ccx-ax, vy = ccy-ay, vz = ccz-az
        let nx_ = uy*vz - uz*vy
        let ny_ = uz*vx - ux*vz
        let nz_ = ux*vy - uy*vx
        const len = Math.sqrt(nx_*nx_ + ny_*ny_ + nz_*nz_) || 1
        nx_ /= len; ny_ /= len; nz_ /= len

        for (let s = 0; s < 3; s++) {
            normArr[p + s*3]   = nx_
            normArr[p + s*3+1] = ny_
            normArr[p + s*3+2] = nz_
        }
        p += 9
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posArr,  3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(normArr, 3))
    geo.computeVertexNormals()   // smooth shading
    return { geo, triCount: rawCells.length }
}

// ── Material presets ──────────────────────────────────────────────────────────
const MATERIAL_PRESETS = {
    'Anatômico': { color: 0xddd0b8, emissive: 0x1a0f05, roughness: 0.55, metalness: 0.06 },
    'Científico': { color: 0x4a8fd4, emissive: 0x041020, roughness: 0.38, metalness: 0.18 },
    'Térmico':   { color: 0xf07030, emissive: 0x300a00, roughness: 0.48, metalness: 0.04 },
}

// ── Orient-label sprite ───────────────────────────────────────────────────────
function makeSprite(text, position) {
    const c = document.createElement('canvas')
    c.width = 64; c.height = 64
    const ctx = c.getContext('2d')
    ctx.font = 'bold 38px monospace'
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 32)
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })
    )
    sprite.position.copy(position)
    sprite.scale.set(10, 10, 1)
    return sprite
}

// ── Default camera position (lateral-oblique, neuroimaging sagittal view) ────
// NIfTI voxel space: X=L-R, Y=P-A, Z=I-S
// Best CC view: from the side (X axis), slightly anterior and superior
function defaultCameraPos(center, maxDim) {
    return new THREE.Vector3(
        center.x + maxDim * 2.1,   // lateral (right side)
        center.y - maxDim * 0.4,   // slightly posterior
        center.z + maxDim * 0.25,  // slightly superior
    )
}

// ── Scene setup ───────────────────────────────────────────────────────────────
function createScene(canvas, geo, matPreset, opacity) {
    const W = canvas.clientWidth  || 800
    const H = canvas.clientHeight || 520

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H, false)
    renderer.shadowMap.enabled = true

    const scene  = new THREE.Scene()
    scene.background = new THREE.Color(0x12192e)

    // ── Camera — Z is "up" in NIfTI/neuroimaging space ──────────────────────
    // Must set .up BEFORE creating OrbitControls, which reads it on construction
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 5000)
    camera.up.set(0, 0, 1)   // Z = superior direction

    // ── Lights — key from lateral-superior, fill from opposite side ─────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))

    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(200, -80, 180)   // lateral + superior + slightly posterior
    key.castShadow = true
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xb4ccff, 0.45)
    fill.position.set(-150, 80, 60)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffffff, 0.20)
    rim.position.set(0, 200, -100)
    scene.add(rim)

    // ── Main mesh ────────────────────────────────────────────────────────────
    const preset = MATERIAL_PRESETS[matPreset] || MATERIAL_PRESETS['Anatômico']
    const mat = new THREE.MeshStandardMaterial({
        ...preset,
        transparent: opacity < 1.0,
        opacity,
        side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    scene.add(mesh)

    // Wireframe overlay (toggled externally)
    const wireMat  = new THREE.MeshBasicMaterial({
        color: 0x4C6EF5, wireframe: true, transparent: true, opacity: 0.12,
    })
    const wireMesh = new THREE.Mesh(geo, wireMat)
    wireMesh.visible = false
    scene.add(wireMesh)

    // ── Bounding box → camera placement ─────────────────────────────────────
    geo.computeBoundingBox()
    const box    = geo.boundingBox
    const center = new THREE.Vector3()
    box.getCenter(center)
    const size   = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)

    const initPos = defaultCameraPos(center, maxDim)
    camera.position.copy(initPos)
    camera.lookAt(center)

    // ── Orientation labels ───────────────────────────────────────────────────
    const pad = maxDim * 0.65
    const labels = [
        makeSprite('A', new THREE.Vector3(center.x,        center.y + pad,        center.z)),
        makeSprite('P', new THREE.Vector3(center.x,        center.y - pad,        center.z)),
        makeSprite('L', new THREE.Vector3(center.x - pad,  center.y,              center.z)),
        makeSprite('R', new THREE.Vector3(center.x + pad,  center.y,              center.z)),
        makeSprite('S', new THREE.Vector3(center.x,        center.y,              center.z + pad * 0.60)),
        makeSprite('I', new THREE.Vector3(center.x,        center.y,              center.z - pad * 0.60)),
    ]
    labels.forEach(l => scene.add(l))

    // ── OrbitControls ────────────────────────────────────────────────────────
    // Created after camera.up is set — inherits the Z-up convention
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping    = true
    controls.dampingFactor    = 0.055   // snappier stop
    controls.rotateSpeed      = 0.85
    controls.zoomSpeed        = 1.0
    controls.panSpeed         = 0.8
    controls.screenSpacePanning = true  // pan parallel to screen, not floor
    controls.minDistance      = maxDim * 0.2
    controls.maxDistance      = maxDim * 7
    controls.mouseButtons     = {
        LEFT:   THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT:  THREE.MOUSE.PAN,
    }
    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
    }
    controls.update()

    return {
        renderer, scene, camera, controls,
        mesh, wireMesh, mat, wireMat, labels,
        center: center.clone(), maxDim, initPos: initPos.clone(),
    }
}

// ── Smooth camera reset (lerp over ~40 frames) ───────────────────────────────
function animateReset(s) {
    const { camera, controls, center, initPos } = s
    const targetPos    = initPos.clone()
    const targetTarget = center.clone()
    let frame = 0
    const FRAMES = 40

    const tick = () => {
        frame++
        const t = 1 - Math.pow(1 - frame / FRAMES, 3)   // ease-out cubic

        camera.position.lerpVectors(camera.position.clone(), targetPos,    t)
        controls.target.lerpVectors(controls.target.clone(), targetTarget, t)
        controls.update()

        if (frame < FRAMES) requestAnimationFrame(tick)
    }
    tick()
}

// ── Main component ────────────────────────────────────────────────────────────
function VolumetricView({ filePath }) {
    const canvasRef = useRef(null)
    const stateRef  = useRef(null)
    const geoRef    = useRef(null)
    const rafRef    = useRef(null)

    const [status,     setStatus]     = useState('loading')
    const [errMsg,     setErrMsg]     = useState('')
    const [triCount,   setTriCount]   = useState(0)
    const [opacity,    setOpacity]    = useState(0.95)
    const [matName,    setMatName]    = useState('Anatômico')
    const [wireframe,  setWireframe]  = useState(false)
    const [showLabels, setShowLabels] = useState(true)

    // ── Destroy helper ────────────────────────────────────────────────────────
    const destroyScene = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
        if (stateRef.current) {
            stateRef.current.controls.dispose()
            stateRef.current.renderer.dispose()
            stateRef.current = null
        }
    }, [])

    // ── Render loop ───────────────────────────────────────────────────────────
    const startLoop = useCallback((s) => {
        const loop = () => {
            rafRef.current = requestAnimationFrame(loop)
            s.controls.update()
            s.renderer.render(s.scene, s.camera)
        }
        loop()
    }, [])

    // ── Spawn / re-spawn scene ────────────────────────────────────────────────
    const spawnScene = useCallback((mat, op, wf, labels) => {
        if (!geoRef.current || !canvasRef.current) return
        destroyScene()
        const s = createScene(canvasRef.current, geoRef.current, mat, op)
        s.wireMesh.visible = wf
        s.labels.forEach(l => { l.visible = labels })
        stateRef.current = s
        startLoop(s)
    }, [destroyScene, startLoop])

    // ── Load NIfTI → Marching Cubes ───────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        setStatus('loading'); setErrMsg('')
        destroyScene()
        if (geoRef.current) { geoRef.current.dispose(); geoRef.current = null }

        const load = async () => {
            try {
                const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
                if (!res.ok) throw new Error(`Arquivo não encontrado (HTTP ${res.status})`)

                let buf
                if (filePath.endsWith('.gz')) {
                    const ds = new DecompressionStream('gzip')
                    buf = await new Response(res.body.pipeThrough(ds)).arrayBuffer()
                } else {
                    buf = await res.arrayBuffer()
                }

                await new Promise(r => setTimeout(r, 40))
                if (cancelled) return

                const nifti  = parseNifti1(buf)
                const result = buildGeometry(nifti)
                if (cancelled) return
                if (!result) throw new Error('Marching Cubes não produziu superfície — verifique a máscara.')

                geoRef.current = result.geo
                setTriCount(result.triCount)
                setStatus('ready')
            } catch (e) {
                if (!cancelled) { setErrMsg(e.message); setStatus('error') }
            }
        }
        load()
        return () => { cancelled = true; destroyScene() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath])

    // ── Build scene on ready ──────────────────────────────────────────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    // ── Material change → full scene rebuild (new material object) ────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matName])

    // ── Opacity — live tweak on existing material ─────────────────────────────
    useEffect(() => {
        if (!stateRef.current) return
        const { mat } = stateRef.current
        mat.opacity = opacity; mat.transparent = opacity < 1.0; mat.needsUpdate = true
    }, [opacity])

    // ── Wireframe toggle ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!stateRef.current) return
        stateRef.current.wireMesh.visible = wireframe
    }, [wireframe])

    // ── Labels toggle ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!stateRef.current) return
        stateRef.current.labels.forEach(l => { l.visible = showLabels })
    }, [showLabels])

    // ── Resize observer ───────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ro = new ResizeObserver(() => {
            if (!stateRef.current) return
            const { renderer, camera } = stateRef.current
            const w = canvas.clientWidth, h = canvas.clientHeight
            if (!w || !h) return
            renderer.setSize(w, h, false)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
        })
        ro.observe(canvas.parentElement || canvas)
        return () => ro.disconnect()
    }, [])

    // ── Reset camera ──────────────────────────────────────────────────────────
    const handleReset = useCallback(() => {
        if (stateRef.current) animateReset(stateRef.current)
    }, [])

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className='volumetric-container'>

            {status === 'loading' && (
                <div className='volumetric-loading'>
                    <span>Computando superfície 3D…</span>
                </div>
            )}
            {status === 'error' && (
                <div className='volumetric-error'>
                    <span>{errMsg}</span>
                    <code>{filePath}</code>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className='volumetric-canvas'
                style={{ display: status === 'ready' ? 'block' : 'none' }}
            />

            {status === 'ready' && (
                <div className='volumetric-controls'>

                    <div className='ctrl-group'>
                        <label>Material</label>
                        <div className='ctrl-pills'>
                            {Object.keys(MATERIAL_PRESETS).map(m => (
                                <button key={m}
                                    className={`ctrl-pill${matName === m ? ' active' : ''}`}
                                    onClick={() => setMatName(m)}
                                >{m}</button>
                            ))}
                        </div>
                    </div>

                    <div className='ctrl-group'>
                        <label>Opacidade: {Math.round(opacity * 100)}%</label>
                        <input type='range' min={0.15} max={1.0} step={0.05}
                            value={opacity}
                            onChange={e => setOpacity(parseFloat(e.target.value))}
                        />
                    </div>

                    <div className='ctrl-group'>
                        <label className='ctrl-check'>
                            <input type='checkbox' checked={wireframe}
                                onChange={e => setWireframe(e.target.checked)} />
                            Wireframe
                        </label>
                    </div>

                    <div className='ctrl-group'>
                        <label className='ctrl-check'>
                            <input type='checkbox' checked={showLabels}
                                onChange={e => setShowLabels(e.target.checked)} />
                            Orientação A/P/L/R/S/I
                        </label>
                    </div>

                    {/* Reset view button — pushed to the right */}
                    <div className='ctrl-group ctrl-group--right'>
                        <button className='ctrl-pill ctrl-reset' onClick={handleReset}
                            title='Voltar para a vista inicial'>
                            ↺ Resetar vista
                        </button>
                        <label style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {triCount.toLocaleString()} triângulos
                        </label>
                    </div>

                </div>
            )}
        </div>
    )
}

export default VolumetricView
