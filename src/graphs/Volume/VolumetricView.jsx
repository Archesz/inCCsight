import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter'
import './VolumetricView.scss'

// ── Material presets ──────────────────────────────────────────────────────────
const MATERIAL_PRESETS = {
    'Anatomical': { color: 0xddd0b8, emissive: 0x1a0f05, roughness: 0.55, metalness: 0.06 },
    'Scientific': { color: 0x4a8fd4, emissive: 0x041020, roughness: 0.38, metalness: 0.18 },
    'Thermal':    { color: 0xf07030, emissive: 0x300a00, roughness: 0.48, metalness: 0.04 },
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
function defaultCameraPos(center, maxDim) {
    return new THREE.Vector3(
        center.x + maxDim * 2.1,   // lateral (right side)
        center.y - maxDim * 0.4,   // slightly posterior
        center.z + maxDim * 0.25,  // slightly superior
    )
}

// ── Scene setup ───────────────────────────────────────────────────────────────
function createScene(canvas, posArr, normArr, bcx, bcy, bcz, maxDim, matPreset, opacity) {
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

    // ── Lights ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))

    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(200, -80, 180)
    key.castShadow = true
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xb4ccff, 0.45)
    fill.position.set(-150, 80, 60)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffffff, 0.20)
    rim.position.set(0, 200, -100)
    scene.add(rim)

    // ── Build geometry from transferred arrays ───────────────────────────────
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(normArr, 3))
    geo.computeVertexNormals()   // smooth shading

    // ── Main mesh ────────────────────────────────────────────────────────────
    const preset = MATERIAL_PRESETS[matPreset] || MATERIAL_PRESETS['Anatomical']
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

    // ── Camera placement ─────────────────────────────────────────────────────
    const center  = new THREE.Vector3(bcx, bcy, bcz)
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
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping    = true
    controls.dampingFactor    = 0.055
    controls.rotateSpeed      = 0.85
    controls.zoomSpeed        = 1.0
    controls.panSpeed         = 0.8
    controls.screenSpacePanning = true
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

// ── Smooth camera reset (ease-out cubic, ~40 frames) ────────────────────────
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
    const canvasRef  = useRef(null)
    const stateRef   = useRef(null)
    const meshRef    = useRef(null)   // { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
    const rafRef     = useRef(null)
    const workerRef  = useRef(null)
    const rawBufRef  = useRef(null)   // copy of raw ArrayBuffer for re-processing with different smoothing

    const [status,     setStatus]     = useState('loading')
    const [errMsg,     setErrMsg]     = useState('')
    const [triCount,   setTriCount]   = useState(0)
    const [opacity,    setOpacity]    = useState(1.0)
    const [matName,    setMatName]    = useState('Anatomical')
    const [wireframe,  setWireframe]  = useState(false)
    const [showLabels, setShowLabels] = useState(true)
    const [smoothIter, setSmoothIter] = useState(0)

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
        if (!meshRef.current || !canvasRef.current) return
        destroyScene()
        const { posArr, normArr, maxDim, bcx, bcy, bcz } = meshRef.current
        const s = createScene(canvasRef.current, posArr, normArr, bcx, bcy, bcz, maxDim, mat, op)
        s.wireMesh.visible = wf
        s.labels.forEach(l => { l.visible = labels })
        stateRef.current = s
        startLoop(s)
    }, [destroyScene, startLoop])

    // ── Terminate running worker ──────────────────────────────────────────────
    const killWorker = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate()
            workerRef.current = null
        }
    }, [])

    // ── Shared worker-spawn helper ────────────────────────────────────────────
    const spawnWorker = useCallback((buf, smooth, cancelledRef) => {
        killWorker()
        meshRef.current = null

        const worker = new Worker(
            new URL('./volumetric.worker.js', import.meta.url)
        )
        workerRef.current = worker

        worker.onmessage = (e) => {
            if (cancelledRef.v) { worker.terminate(); return }
            const data = e.data
            if (data.error) {
                setErrMsg(data.error)
                setStatus('error')
                worker.terminate()
                workerRef.current = null
                return
            }
            const { posArr, normArr, triCount, maxDim, bcx, bcy, bcz } = data
            meshRef.current = { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
            setTriCount(triCount)
            setStatus('ready')
            worker.terminate()
            workerRef.current = null
        }

        worker.onerror = (err) => {
            if (!cancelledRef.v) {
                setErrMsg(err.message || 'Worker error')
                setStatus('error')
            }
            worker.terminate()
            workerRef.current = null
        }

        // Transfer a copy so rawBufRef stays intact for re-use
        const xfer = buf.slice(0)
        worker.postMessage({ arrayBuffer: xfer, smoothIterations: smooth }, [xfer])
    }, [killWorker])

    // ── Load NIfTI → Web Worker (Marching Cubes off main thread) ─────────────
    useEffect(() => {
        const cancelled = { v: false }
        setStatus('loading'); setErrMsg('')
        destroyScene()
        rawBufRef.current = null

        const load = async () => {
            try {
                const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
                if (!res.ok) throw new Error(`File not found (HTTP ${res.status})`)

                let buf
                if (filePath.endsWith('.gz')) {
                    const ds = new DecompressionStream('gzip')
                    buf = await new Response(res.body.pipeThrough(ds)).arrayBuffer()
                } else {
                    buf = await res.arrayBuffer()
                }

                if (cancelled.v) return

                rawBufRef.current = buf   // keep original for smoothing re-runs
                spawnWorker(buf, smoothIter, cancelled)

            } catch (e) {
                if (!cancelled.v) { setErrMsg(e.message); setStatus('error') }
            }
        }
        load()
        return () => {
            cancelled.v = true
            killWorker()
            destroyScene()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath])

    // ── Re-process with new smoothing level (no re-fetch needed) ─────────────
    useEffect(() => {
        if (!rawBufRef.current) return   // file not loaded yet
        const cancelled = { v: false }
        setStatus('loading')
        destroyScene()
        spawnWorker(rawBufRef.current, smoothIter, cancelled)
        return () => { cancelled.v = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [smoothIter])

    // ── Build scene on ready ──────────────────────────────────────────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    // ── Material change → full scene rebuild ──────────────────────────────────
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

    // ── Export STL (binary, ~10× smaller than ASCII) ──────────────────────────
    const handleExportSTL = useCallback(() => {
        if (!stateRef.current) return
        const exporter = new STLExporter()
        const result   = exporter.parse(stateRef.current.mesh, { binary: true })
        const blob     = new Blob([result], { type: 'application/octet-stream' })
        const url      = URL.createObjectURL(blob)
        const a        = document.createElement('a')
        // Derive subject name from path, e.g.
        // /mnt/subjects/subject_001/inCCsight/cnnBased.nii.gz → subject_001
        const parts      = (filePath || '').replace(/\\/g, '/').split('/')
        const subjectName = parts[parts.length - 3] || 'corpus_callosum'
        a.href     = url
        a.download = `corpus_callosum_${subjectName}.stl`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [filePath])

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className='volumetric-container'>

            {status === 'loading' && (
                <div className='volumetric-loading'>
                    <span>Computing 3D surface… (off main thread)</span>
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
                        <label>Smoothing</label>
                        <div className='ctrl-pills'>
                            {[
                                { label: 'Off',  val: 0  },
                                { label: 'Low',  val: 5  },
                                { label: 'Med',  val: 15 },
                                { label: 'High', val: 30 },
                            ].map(({ label, val }) => (
                                <button key={val}
                                    className={`ctrl-pill${smoothIter === val ? ' active' : ''}`}
                                    onClick={() => setSmoothIter(val)}
                                    title={val === 0 ? 'No smoothing' : `${val} Laplacian iterations`}
                                >{label}</button>
                            ))}
                        </div>
                    </div>

                    <div className='ctrl-group'>
                        <label>Opacity: {Math.round(opacity * 100)}%</label>
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
                            Orientation A/P/L/R/S/I
                        </label>
                    </div>

                    {/* Action buttons — pushed to the right */}
                    <div className='ctrl-group ctrl-group--right'>
                        <div className='ctrl-pills'>
                            <button className='ctrl-pill ctrl-reset' onClick={handleReset}
                                title='Return to initial view'>
                                ↺ Reset view
                            </button>
                            <button className='ctrl-pill ctrl-export' onClick={handleExportSTL}
                                title='Download binary STL for 3D printing'>
                                ⬇ Export STL
                            </button>
                        </div>
                        <label style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {triCount.toLocaleString()} triangles
                        </label>
                    </div>

                </div>
            )}
        </div>
    )
}

export default VolumetricView
