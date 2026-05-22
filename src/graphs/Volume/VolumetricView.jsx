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

// ── Self-contained Taubin mesh smoothing ─────────────────────────────────────
// Works directly on Float32Array triangle soup (no external dependencies).
// Uses Taubin λ/μ scheme to prevent mesh shrinkage.
//
//   posArrIn  : Float32Array (triCount * 9) — raw positions from worker
//   iterations: number of Taubin iterations (each = 1 λ-pass + 1 μ-pass)
//
// Returns { posArr, normArr } — new smoothed arrays, same size as input.
//
function taubinSmooth(posArrIn, iterations) {
    const LAMBDA =  0.5
    const MU     = -0.53   // |μ| > |λ| prevents net shrinkage

    const triCount = posArrIn.length / 9

    // ── Step 1: weld vertices by position hash ────────────────────────────
    const EPS    = 1e-4
    const idMap  = new Map()
    const verts  = []          // flat [x, y, z, x, y, z, …]
    const triIdx = new Int32Array(triCount * 3)

    for (let t = 0; t < triCount; t++) {
        for (let v = 0; v < 3; v++) {
            const b = (t * 3 + v) * 3
            const x = posArrIn[b], y = posArrIn[b + 1], z = posArrIn[b + 2]
            const key = `${Math.round(x / EPS)},${Math.round(y / EPS)},${Math.round(z / EPS)}`
            if (!idMap.has(key)) { idMap.set(key, verts.length / 3); verts.push(x, y, z) }
            triIdx[t * 3 + v] = idMap.get(key)
        }
    }
    const n = verts.length / 3

    // ── Step 2: adjacency list (Set per vertex) ───────────────────────────
    const nbSets = Array.from({ length: n }, () => new Set())
    for (let t = 0; t < triCount; t++) {
        const a = triIdx[t * 3], b = triIdx[t * 3 + 1], c = triIdx[t * 3 + 2]
        nbSets[a].add(b); nbSets[a].add(c)
        nbSets[b].add(a); nbSets[b].add(c)
        nbSets[c].add(a); nbSets[c].add(b)
    }
    const neighbors = nbSets.map(s => [...s])

    // ── Step 3: Taubin smoothing ──────────────────────────────────────────
    const pos  = new Float32Array(verts)
    const next = new Float32Array(pos.length)

    const smoothPass = (lam) => {
        for (let i = 0; i < n; i++) {
            const nb = neighbors[i]
            if (nb.length === 0) {
                next[i*3] = pos[i*3]; next[i*3+1] = pos[i*3+1]; next[i*3+2] = pos[i*3+2]
                continue
            }
            let sx = 0, sy = 0, sz = 0
            for (const j of nb) { sx += pos[j*3]; sy += pos[j*3+1]; sz += pos[j*3+2] }
            const cnt = nb.length
            next[i*3]   = pos[i*3]   + lam * (sx / cnt - pos[i*3])
            next[i*3+1] = pos[i*3+1] + lam * (sy / cnt - pos[i*3+1])
            next[i*3+2] = pos[i*3+2] + lam * (sz / cnt - pos[i*3+2])
        }
        pos.set(next)
    }

    for (let iter = 0; iter < iterations; iter++) {
        smoothPass(LAMBDA)
        smoothPass(MU)
    }

    // ── Step 4: smooth per-vertex normals (accumulate face normals) ───────
    const normAcc = new Float32Array(n * 3)
    for (let t = 0; t < triCount; t++) {
        const a = triIdx[t*3], b = triIdx[t*3+1], c = triIdx[t*3+2]
        const ax=pos[a*3], ay=pos[a*3+1], az=pos[a*3+2]
        const bx=pos[b*3], by=pos[b*3+1], bz=pos[b*3+2]
        const cx=pos[c*3], cy=pos[c*3+1], cz=pos[c*3+2]

        const ux=bx-ax, uy=by-ay, uz=bz-az
        const vx=cx-ax, vy=cy-ay, vz=cz-az
        let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx
        const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1
        nx/=len; ny/=len; nz/=len

        normAcc[a*3]+=nx; normAcc[a*3+1]+=ny; normAcc[a*3+2]+=nz
        normAcc[b*3]+=nx; normAcc[b*3+1]+=ny; normAcc[b*3+2]+=nz
        normAcc[c*3]+=nx; normAcc[c*3+1]+=ny; normAcc[c*3+2]+=nz
    }
    for (let i = 0; i < n; i++) {
        const len = Math.sqrt(normAcc[i*3]**2 + normAcc[i*3+1]**2 + normAcc[i*3+2]**2) || 1
        normAcc[i*3]/=len; normAcc[i*3+1]/=len; normAcc[i*3+2]/=len
    }

    // ── Step 5: write back to triangle-soup arrays ────────────────────────
    const outPos  = new Float32Array(posArrIn.length)
    const outNorm = new Float32Array(posArrIn.length)
    for (let t = 0; t < triCount; t++) {
        for (let v = 0; v < 3; v++) {
            const id = triIdx[t*3+v]
            const b  = (t*3+v)*3
            outPos [b]=pos [id*3]; outPos [b+1]=pos [id*3+1]; outPos [b+2]=pos [id*3+2]
            outNorm[b]=normAcc[id*3]; outNorm[b+1]=normAcc[id*3+1]; outNorm[b+2]=normAcc[id*3+2]
        }
    }
    return { posArr: outPos, normArr: outNorm }
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

// ── Default camera position ───────────────────────────────────────────────────
function defaultCameraPos(center, maxDim) {
    return new THREE.Vector3(
        center.x + maxDim * 2.1,
        center.y - maxDim * 0.4,
        center.z + maxDim * 0.25,
    )
}

// ── Scene setup ───────────────────────────────────────────────────────────────
function createScene(canvas, posArrRaw, normArrRaw, bcx, bcy, bcz, maxDim, matPreset, opacity, smoothIter) {
    const W = canvas.clientWidth  || 800
    const H = canvas.clientHeight || 520

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H, false)
    renderer.shadowMap.enabled = true

    const scene  = new THREE.Scene()
    scene.background = new THREE.Color(0x12192e)

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 5000)
    camera.up.set(0, 0, 1)

    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(200, -80, 180); key.castShadow = true; scene.add(key)
    const fill = new THREE.DirectionalLight(0xb4ccff, 0.45)
    fill.position.set(-150, 80, 60); scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.20)
    rim.position.set(0, 200, -100); scene.add(rim)

    // Apply smoothing (Taubin) — works on copies, preserves originals in meshRef
    let posArr, normArr
    if (smoothIter > 0) {
        const result = taubinSmooth(posArrRaw, smoothIter)
        posArr  = result.posArr
        normArr = result.normArr
    } else {
        posArr  = posArrRaw
        normArr = normArrRaw
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posArr,  3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(normArr, 3))
    if (smoothIter === 0) geo.computeVertexNormals()   // smooth normals on raw mesh too

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

    const wireMat  = new THREE.MeshBasicMaterial({ color: 0x4C6EF5, wireframe: true, transparent: true, opacity: 0.12 })
    const wireMesh = new THREE.Mesh(geo, wireMat)
    wireMesh.visible = false
    scene.add(wireMesh)

    const center  = new THREE.Vector3(bcx, bcy, bcz)
    const initPos = defaultCameraPos(center, maxDim)
    camera.position.copy(initPos)
    camera.lookAt(center)

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
    controls.mouseButtons     = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    controls.touches          = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    controls.update()

    return { renderer, scene, camera, controls, mesh, wireMesh, mat, wireMat, labels, center: center.clone(), maxDim, initPos: initPos.clone() }
}

// ── Smooth camera reset ───────────────────────────────────────────────────────
function animateReset(s) {
    const { camera, controls, center, initPos } = s
    const targetPos = initPos.clone(), targetTarget = center.clone()
    let frame = 0
    const tick = () => {
        frame++
        const t = 1 - Math.pow(1 - frame / 40, 3)
        camera.position.lerpVectors(camera.position.clone(), targetPos,    t)
        controls.target.lerpVectors(controls.target.clone(), targetTarget, t)
        controls.update()
        if (frame < 40) requestAnimationFrame(tick)
    }
    tick()
}

// ── Tract geometry builder ────────────────────────────────────────────────────
// colorMode: 'direction' | 'fa' | 'region'
const TRACT_REGION_COLORS = [
    [0.39, 0.43, 0.98],  // W1 — anterior (blue)
    [0.24, 0.80, 0.60],  // W2 — mid-anterior (teal)
    [1.00, 0.63, 0.35],  // W3 — central (orange)
    [0.67, 0.39, 0.98],  // W4 — mid-posterior (purple)
    [0.94, 0.33, 0.23],  // W5 — posterior/splenium (red)
]

function buildTractLines(data, colorMode) {
    const { nx, ny, nz, dx, dy, dz, streamlines, fa_along, regions } = data
    const cx = nx * dx / 2, cy = ny * dy / 2, cz = nz * dz / 2

    const positions = [], colors = []

    streamlines.forEach((sl, si) => {
        const faVals = fa_along[si]
        const reg    = (regions[si] || 1) - 1  // 0-indexed
        for (let p = 0; p < sl.length - 1; p++) {
            const [i0, j0, k0] = sl[p]
            const [i1, j1, k1] = sl[p + 1]
            const wx0 = i0*dx - cx, wy0 = j0*dy - cy, wz0 = k0*dz - cz
            const wx1 = i1*dx - cx, wy1 = j1*dy - cy, wz1 = k1*dz - cz
            positions.push(wx0, wy0, wz0, wx1, wy1, wz1)

            let r, g, b
            if (colorMode === 'direction') {
                const ddx = Math.abs(wx1-wx0), ddy = Math.abs(wy1-wy0), ddz = Math.abs(wz1-wz0)
                const len = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz) || 1
                r = ddx/len; g = ddy/len; b = ddz/len
            } else if (colorMode === 'fa') {
                const t = Math.max(0, Math.min(1, ((faVals[p] || 0) - 0.2) / 0.8))
                r = t; g = 1 - Math.abs(2*t - 1); b = 1 - t
            } else {
                ;[r, g, b] = TRACT_REGION_COLORS[reg % TRACT_REGION_COLORS.length]
            }
            colors.push(r, g, b, r, g, b)
        }
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors),   3))
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, opacity: 0.85, transparent: true }))
}

function getTractsPath(fp) {
    if (!fp) return null
    // fp is like .../subject/inCCsight/cnnBased.nii.gz
    // tracts.json sits at .../subject/tracts.json (one level above inCCsight/)
    const parts = fp.replace(/\\/g, '/').split('/')
    parts.splice(-2, 2, 'tracts.json')   // remove last 2 segments, add tracts.json
    return parts.join('/')
}

// ── Main component ────────────────────────────────────────────────────────────
function VolumetricView({ filePath }) {
    const canvasRef = useRef(null)
    const stateRef  = useRef(null)
    const meshRef   = useRef(null)
    const rafRef    = useRef(null)
    const workerRef = useRef(null)

    const [status,       setStatus]       = useState('loading')
    const [errMsg,       setErrMsg]       = useState('')
    const [triCount,     setTriCount]     = useState(0)
    const [opacity,      setOpacity]      = useState(1.0)
    const [matName,      setMatName]      = useState('Anatomical')
    const [wireframe,    setWireframe]    = useState(false)
    const [showLabels,   setShowLabels]   = useState(true)
    const [smoothIter,   setSmoothIter]   = useState(0)
    const [customColor,  setCustomColor]  = useState('')
    const customColorRef = useRef('')
    const [tractsStatus, setTractsStatus] = useState('none')  // 'none'|'loading'|'ready'|'error'
    const [showTracts,   setShowTracts]   = useState(true)
    const [tractColor,   setTractColor]   = useState('direction')
    const tractsDataRef  = useRef(null)
    const tractLinesRef  = useRef(null)

    const destroyScene = useCallback(() => {
        if (rafRef.current)  { cancelAnimationFrame(rafRef.current); rafRef.current = null }
        if (stateRef.current) {
            stateRef.current.controls.dispose()
            stateRef.current.renderer.dispose()
            stateRef.current = null
        }
    }, [])

    const startLoop = useCallback((s) => {
        const loop = () => {
            rafRef.current = requestAnimationFrame(loop)
            s.controls.update()
            s.renderer.render(s.scene, s.camera)
        }
        loop()
    }, [])

    const spawnScene = useCallback((mat, op, wf, labels, smooth) => {
        if (!meshRef.current || !canvasRef.current) return
        destroyScene()
        const { posArr, normArr, maxDim, bcx, bcy, bcz } = meshRef.current
        const s = createScene(canvasRef.current, posArr, normArr, bcx, bcy, bcz, maxDim, mat, op, smooth)
        if (customColorRef.current) s.mat.color.set(customColorRef.current)
        s.wireMesh.visible = wf
        s.labels.forEach(l => { l.visible = labels })
        stateRef.current = s
        startLoop(s)
    }, [destroyScene, startLoop])

    const killWorker = useCallback(() => {
        if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    }, [])

    // ── Load file ─────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        setStatus('loading'); setErrMsg('')
        setTractsStatus('none')
        tractsDataRef.current = null
        destroyScene(); killWorker()
        meshRef.current = null

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
                if (cancelled) return

                const worker = new Worker(new URL('./volumetric.worker.js', import.meta.url))
                workerRef.current = worker

                worker.onmessage = (e) => {
                    if (cancelled) { worker.terminate(); return }
                    const data = e.data
                    if (data.error) { setErrMsg(data.error); setStatus('error'); worker.terminate(); workerRef.current = null; return }
                    const { posArr, normArr, triCount, maxDim, bcx, bcy, bcz } = data
                    meshRef.current = { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
                    setTriCount(triCount)
                    setStatus('ready')
                    worker.terminate(); workerRef.current = null
                }
                worker.onerror = (err) => {
                    if (!cancelled) { setErrMsg(err.message || 'Worker error'); setStatus('error') }
                    worker.terminate(); workerRef.current = null
                }
                worker.postMessage({ arrayBuffer: buf }, [buf])

                // Check and load tracts.json alongside the NIfTI file
                const tractsPath = getTractsPath(filePath)
                if (tractsPath) {
                    setTractsStatus('loading')
                    fetch(`http://localhost:3001/api/exists?path=${encodeURIComponent(tractsPath)}`)
                        .then(r => r.json())
                        .then(({ exists }) => {
                            if (!exists) { setTractsStatus('none'); return }
                            return fetch(`http://localhost:3001/api/tracts?path=${encodeURIComponent(tractsPath)}`)
                                .then(r => { if (!r.ok) throw new Error('tracts.json fetch failed'); return r.json() })
                                .then(data => {
                                    if (!cancelled) {
                                        tractsDataRef.current = data
                                        setTractsStatus('ready')
                                    }
                                })
                        })
                        .catch(() => { if (!cancelled) setTractsStatus('none') })
                }
            } catch (e) {
                if (!cancelled) { setErrMsg(e.message); setStatus('error') }
            }
        }
        load()
        return () => { cancelled = true; killWorker(); destroyScene() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath])

    // ── Rebuild on ready ──────────────────────────────────────────────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels, smoothIter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    // ── Rebuild on material or smoothing change ───────────────────────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels, smoothIter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matName, smoothIter])

    // ── Live opacity tweak ────────────────────────────────────────────────────
    useEffect(() => {
        if (!stateRef.current) return
        const { mat } = stateRef.current
        mat.opacity = opacity; mat.transparent = opacity < 1.0; mat.needsUpdate = true
    }, [opacity])

    useEffect(() => {
        if (!stateRef.current) return
        stateRef.current.wireMesh.visible = wireframe
    }, [wireframe])

    useEffect(() => {
        if (!stateRef.current) return
        stateRef.current.labels.forEach(l => { l.visible = showLabels })
    }, [showLabels])

    // Keep ref in sync so spawnScene (inside useCallback) always sees latest value
    useEffect(() => { customColorRef.current = customColor }, [customColor])

    // Live color update — no scene rebuild needed
    useEffect(() => {
        if (!stateRef.current || !customColor) return
        stateRef.current.mat.color.set(customColor)
        stateRef.current.mat.needsUpdate = true
    }, [customColor])

    // ── Add / update tract lines whenever scene or tract settings change ─────
    useEffect(() => {
        if (!stateRef.current) return
        const { scene } = stateRef.current

        // Remove previous lines
        if (tractLinesRef.current) {
            scene.remove(tractLinesRef.current)
            tractLinesRef.current.geometry.dispose()
            tractLinesRef.current.material.dispose()
            tractLinesRef.current = null
        }

        if (showTracts && tractsStatus === 'ready' && tractsDataRef.current) {
            const lines = buildTractLines(tractsDataRef.current, tractColor)
            scene.add(lines)
            tractLinesRef.current = lines
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTracts, tractColor, tractsStatus, status])

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

    const handleReset = useCallback(() => {
        if (stateRef.current) animateReset(stateRef.current)
    }, [])

    const handleExportSTL = useCallback(() => {
        if (!stateRef.current) return
        const exporter = new STLExporter()
        const result   = exporter.parse(stateRef.current.mesh, { binary: true })
        const blob     = new Blob([result], { type: 'application/octet-stream' })
        const url      = URL.createObjectURL(blob)
        const a        = document.createElement('a')
        const parts    = (filePath || '').replace(/\\/g, '/').split('/')
        a.href = url; a.download = `corpus_callosum_${parts[parts.length - 3] || 'cc'}.stl`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [filePath])

    return (
        <div className='volumetric-container'>
            {status === 'loading' && <div className='volumetric-loading'><span>Computing 3D surface…</span></div>}
            {status === 'error'   && <div className='volumetric-error'><span>{errMsg}</span><code>{filePath}</code></div>}

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
                                    className={`ctrl-pill${matName === m && !customColor ? ' active' : ''}`}
                                    onClick={() => { setMatName(m); setCustomColor('') }}
                                >{m}</button>
                            ))}
                            <label
                                className={`ctrl-color-swatch${customColor ? ' active' : ''}`}
                                title='Custom color'
                                style={customColor ? { background: customColor } : {}}
                            >
                                <input
                                    type='color'
                                    value={customColor || '#ddd0b8'}
                                    onChange={e => setCustomColor(e.target.value)}
                                />
                                {!customColor && <span>+</span>}
                            </label>
                        </div>
                    </div>

                    <div className='ctrl-group'>
                        <label>Smoothing</label>
                        <div className='ctrl-pills'>
                            {[
                                { label: 'Off',  val: 0  },
                                { label: 'Low',  val: 3  },
                                { label: 'Med',  val: 8  },
                                { label: 'High', val: 20 },
                            ].map(({ label, val }) => (
                                <button key={val}
                                    className={`ctrl-pill${smoothIter === val ? ' active' : ''}`}
                                    onClick={() => setSmoothIter(val)}
                                    title={val === 0 ? 'No smoothing' : `Taubin smoothing — ${val} iterations`}
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

                    {tractsStatus !== 'none' && (
                        <div className='ctrl-group'>
                            <label>Tractography
                                {tractsStatus === 'loading' && <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 6 }}>loading…</span>}
                                {tractsStatus === 'ready'   && tractsDataRef.current && (
                                    <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 6 }}>
                                        {tractsDataRef.current.streamlines.length} streamlines
                                    </span>
                                )}
                            </label>
                            {tractsStatus === 'ready' && (
                                <>
                                    <div className='ctrl-pills'>
                                        <label className='ctrl-check'>
                                            <input type='checkbox' checked={showTracts}
                                                onChange={e => setShowTracts(e.target.checked)} />
                                            Show tracts
                                        </label>
                                    </div>
                                    {showTracts && (
                                        <div className='ctrl-pills' style={{ marginTop: 4 }}>
                                            {[
                                                { id: 'direction', label: 'Direction' },
                                                { id: 'fa',        label: 'FA'        },
                                                { id: 'region',    label: 'Region'    },
                                            ].map(({ id, label }) => (
                                                <button key={id}
                                                    className={`ctrl-pill${tractColor === id ? ' active' : ''}`}
                                                    onClick={() => setTractColor(id)}
                                                    title={`Color by ${label}`}
                                                >{label}</button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className='ctrl-group ctrl-group--right'>
                        <div className='ctrl-pills'>
                            <button className='ctrl-pill ctrl-reset' onClick={handleReset} title='Return to initial view'>
                                ↺ Reset view
                            </button>
                            <button className='ctrl-pill ctrl-export' onClick={handleExportSTL} title='Download binary STL'>
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
