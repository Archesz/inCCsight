import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

// ── Material presets (kept in sync with VolumetricView.jsx) ──────────────────
const MATERIAL_PRESETS = {
    'Anatomical': { color: 0xddd0b8, emissive: 0x1a0f05, roughness: 0.55, metalness: 0.06 },
    'Scientific': { color: 0x4a8fd4, emissive: 0x041020, roughness: 0.38, metalness: 0.18 },
    'Thermal':    { color: 0xf07030, emissive: 0x300a00, roughness: 0.48, metalness: 0.04 },
}

// ── Taubin smoothing (identical to VolumetricView.jsx) ───────────────────────
function taubinSmooth(posArrIn, iterations) {
    const LAMBDA =  0.5
    const MU     = -0.53

    const triCount = posArrIn.length / 9
    const EPS    = 1e-4
    const idMap  = new Map()
    const verts  = []
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
    const nbSets = Array.from({ length: n }, () => new Set())
    for (let t = 0; t < triCount; t++) {
        const a = triIdx[t * 3], b = triIdx[t * 3 + 1], c = triIdx[t * 3 + 2]
        nbSets[a].add(b); nbSets[a].add(c)
        nbSets[b].add(a); nbSets[b].add(c)
        nbSets[c].add(a); nbSets[c].add(b)
    }
    const neighbors = nbSets.map(s => [...s])
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

// ── Orientation sprite (identical to VolumetricView.jsx) ─────────────────────
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

function defaultCameraPos(center, maxDim) {
    return new THREE.Vector3(
        center.x + maxDim * 2.1,
        center.y - maxDim * 0.4,
        center.z + maxDim * 0.25,
    )
}

// ── Scene setup (identical to VolumetricView.jsx) ────────────────────────────
function createScene(canvas, posArrRaw, normArrRaw, bcx, bcy, bcz, maxDim, matPreset, opacity, smoothIter) {
    const W = canvas.clientWidth  || 600
    const H = canvas.clientHeight || 400

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
    if (smoothIter === 0) geo.computeVertexNormals()

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

async function fetchAndDecompress(path) {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`File not found (HTTP ${res.status})`)
    if (path.endsWith('.gz')) {
        const ds = new DecompressionStream('gzip')
        return await new Response(res.body.pipeThrough(ds)).arrayBuffer()
    }
    return await res.arrayBuffer()
}

// ── VolumetricCell ────────────────────────────────────────────────────────────
// Single 3D panel used inside VolumetricCompare's 2×2 grid.
// All visual controls (opacity, material, smoothing, etc.) come from the parent
// as props so they stay in sync across all cells.
// Camera sync works via:
//   - onCameraMove(pos, quat, target): fired whenever this cell's camera moves
//   - applyCamera(pos, quat, target): imperative method to receive external camera state
const VolumetricCell = forwardRef(function VolumetricCell({
    filePath,
    label,
    opacity,
    matName,
    smoothIter,
    wireframe,
    showLabels,
    colorMode,
    onCameraMove,
}, ref) {
    const canvasRef  = useRef(null)
    const stateRef   = useRef(null)
    const meshRef    = useRef(null)
    const rafRef     = useRef(null)
    const workerRef  = useRef(null)
    const syncingRef = useRef(false)
    // Keep latest onCameraMove in a ref so the controls listener always calls the current one
    const onCMRef = useRef(onCameraMove)
    useEffect(() => { onCMRef.current = onCameraMove }, [onCameraMove])

    const [status, setStatus] = useState('idle')
    const [errMsg, setErrMsg] = useState('')

    // ── Imperative API exposed to parent ──────────────────────────────────────
    useImperativeHandle(ref, () => ({
        applyCamera(pos, quat, target) {
            if (!stateRef.current) return
            syncingRef.current = true
            stateRef.current.camera.position.copy(pos)
            stateRef.current.camera.quaternion.copy(quat)
            stateRef.current.controls.target.copy(target)
            stateRef.current.controls.update()
            syncingRef.current = false
        },
        resetCamera() {
            if (stateRef.current) animateReset(stateRef.current)
        },
    }))

    const destroyScene = useCallback(() => {
        if (rafRef.current)   { cancelAnimationFrame(rafRef.current); rafRef.current = null }
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
        // Preserve current camera pose across scene rebuilds (smoothing/material changes)
        let savedCam = null
        if (stateRef.current) {
            const { camera, controls } = stateRef.current
            savedCam = {
                pos:    camera.position.clone(),
                quat:   camera.quaternion.clone(),
                target: controls.target.clone(),
            }
        }
        destroyScene()
        const { posArr, normArr, maxDim, bcx, bcy, bcz } = meshRef.current
        const s = createScene(canvasRef.current, posArr, normArr, bcx, bcy, bcz, maxDim, mat, op, smooth)
        s.wireMesh.visible = wf
        s.labels.forEach(l => { l.visible = labels })
        if (savedCam) {
            s.camera.position.copy(savedCam.pos)
            s.camera.quaternion.copy(savedCam.quat)
            s.controls.target.copy(savedCam.target)
            s.controls.update()
        }
        // Attach the camera-sync listener to the new OrbitControls instance
        s.controls.addEventListener('change', () => {
            if (syncingRef.current) return
            onCMRef.current?.(
                s.camera.position.clone(),
                s.camera.quaternion.clone(),
                s.controls.target.clone(),
            )
        })
        stateRef.current = s
        startLoop(s)
    }, [destroyScene, startLoop])

    const killWorker = useCallback(() => {
        if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    }, [])

    // ── Load NIfTI file via Web Worker ────────────────────────────────────────
    useEffect(() => {
        if (!filePath) {
            destroyScene(); killWorker(); meshRef.current = null; setStatus('idle'); return
        }
        let cancelled = false
        setStatus('loading'); setErrMsg('')
        destroyScene(); killWorker(); meshRef.current = null

        ;(async () => {
            try {
                const maskBuf = await fetchAndDecompress(filePath)
                if (cancelled) return

                const worker = new Worker(new URL('./volumetric.worker.js', import.meta.url))
                workerRef.current = worker

                worker.onmessage = (e) => {
                    if (cancelled) { worker.terminate(); return }
                    if (e.data.error) {
                        setErrMsg(e.data.error); setStatus('error')
                        worker.terminate(); workerRef.current = null; return
                    }
                    const { posArr, normArr, triCount, maxDim, bcx, bcy, bcz, colorParcellation } = e.data
                    meshRef.current = { posArr, normArr, triCount, maxDim, bcx, bcy, bcz, colorParcellation }
                    setStatus('ready')
                    worker.terminate(); workerRef.current = null
                }
                worker.onerror = (err) => {
                    if (!cancelled) { setErrMsg(err.message || 'Worker error'); setStatus('error') }
                    worker.terminate(); workerRef.current = null
                }
                // No DTI loading in compare mode — keeps loading fast
                worker.postMessage({ arrayBuffer: maskBuf, dtiBuffers: null }, [maskBuf])
            } catch (e) {
                if (!cancelled) { setErrMsg(e.message); setStatus('error') }
            }
        })()

        return () => { cancelled = true; killWorker(); destroyScene() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath])

    // ── Build scene when mesh is ready ────────────────────────────────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels, smoothIter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    // ── Rebuild scene when material preset or smoothing changes ───────────────
    useEffect(() => {
        if (status === 'ready') spawnScene(matName, opacity, wireframe, showLabels, smoothIter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matName, smoothIter])

    // ── Live-update opacity without rebuilding the scene ─────────────────────
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

    // ── Swap vertex color attribute when colorMode changes ────────────────────
    useEffect(() => {
        if (status !== 'ready' || !stateRef.current || !meshRef.current) return
        const { mesh, mat } = stateRef.current
        const { colorParcellation } = meshRef.current

        if (colorMode === 'parcellation' && colorParcellation) {
            mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colorParcellation, 3))
            mat.vertexColors = true
            mat.color.set(0xffffff)
            mat.emissive.set(0x000000)
        } else {
            if (mesh.geometry.attributes.color) mesh.geometry.deleteAttribute('color')
            mat.vertexColors = false
            const preset = MATERIAL_PRESETS[matName] || MATERIAL_PRESETS['Anatomical']
            mat.color.set(preset.color)
            mat.emissive.set(preset.emissive)
        }
        mat.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colorMode, status, matName, smoothIter])

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

    return (
        <div className='vcell'>
            {status === 'idle' && (
                <div className='vcell-empty'>Select a subject</div>
            )}
            {status === 'loading' && (
                <div className='vcell-loading'><span>Computing surface…</span></div>
            )}
            {status === 'error' && (
                <div className='vcell-error'>
                    <span>No 3D data available</span>
                    <code>{filePath}</code>
                </div>
            )}
            <canvas
                ref={canvasRef}
                className='vcell-canvas'
                style={{ display: status === 'ready' ? 'block' : 'none' }}
            />
            {status === 'ready' && label && (
                <div className='vcell-label'>{label}</div>
            )}
        </div>
    )
})

export default VolumetricCell
