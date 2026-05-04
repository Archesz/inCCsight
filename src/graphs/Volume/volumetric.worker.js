/* eslint-disable no-restricted-globals */
/**
 * volumetric.worker.js
 *
 * Off-main-thread worker that handles:
 *   1. NIfTI-1 parsing (DataView)
 *   2. Marching Cubes surface extraction (isosurface)
 *   3. Optional Laplacian smoothing on the indexed mesh
 *   4. Flattening positions + face normals into Float32Arrays
 *
 * The heavy Float32Arrays are transferred (zero-copy) back to the main thread.
 *
 * Message in:  { arrayBuffer: ArrayBuffer, smoothIterations?: number }
 * Message out (success): { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
 * Message out (error):   { error: string }
 */

import { marchingCubes } from 'isosurface'

// ── NIfTI-1 parser ────────────────────────────────────────────────────────────
function parseNifti1(buf) {
    const v          = new DataView(buf)
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
    if      (datatype === 2)  voxels = new Uint8Array   (buf, vox_offset, n)
    else if (datatype === 4)  voxels = Float32Array.from(new Int16Array  (buf.slice(vox_offset, vox_offset + n * 2)))
    else if (datatype === 8)  voxels = Float32Array.from(new Int32Array  (buf.slice(vox_offset, vox_offset + n * 4)))
    else if (datatype === 16) voxels = new Float32Array  (buf, vox_offset, n)
    else if (datatype === 64) voxels = Float32Array.from(new Float64Array(buf.slice(vox_offset, vox_offset + n * 8)))
    else                      voxels = new Uint8Array   (buf, vox_offset, n)

    return { nx, ny, nz, dx, dy, dz, voxels }
}

// ── Laplacian mesh smoothing ──────────────────────────────────────────────────
// Operates on the INDEXED representation (rawPos + rawCells) before flattening.
// Using Taubin's two-step approach (λ forward + μ backward) to prevent shrinkage.
//   λ =  0.5  — expand toward neighbours
//   μ = -0.53 — tiny pull back (keeps volume stable)
function laplacianSmooth(positions, cells, iterations) {
    if (iterations === 0) return positions

    const n = positions.length

    // ── Build adjacency list ─────────────────────────────────────────────────
    const adj = new Array(n)
    for (let i = 0; i < n; i++) adj[i] = []

    for (const [a, b, c] of cells) {
        adj[a].push(b, c)
        adj[b].push(a, c)
        adj[c].push(a, b)
    }
    // Deduplicate
    for (let i = 0; i < n; i++) adj[i] = [...new Set(adj[i])]

    // ── Working copy ─────────────────────────────────────────────────────────
    let pos = positions.map(p => [p[0], p[1], p[2]])

    const LAMBDA =  0.5
    const MU     = -0.53

    function step(src, factor) {
        const dst = new Array(n)
        for (let i = 0; i < n; i++) {
            const nbrs = adj[i]
            if (nbrs.length === 0) { dst[i] = [src[i][0], src[i][1], src[i][2]]; continue }
            let sx = 0, sy = 0, sz = 0
            for (const j of nbrs) { sx += src[j][0]; sy += src[j][1]; sz += src[j][2] }
            const inv = 1 / nbrs.length
            dst[i] = [
                src[i][0] + factor * (sx * inv - src[i][0]),
                src[i][1] + factor * (sy * inv - src[i][1]),
                src[i][2] + factor * (sz * inv - src[i][2]),
            ]
        }
        return dst
    }

    for (let iter = 0; iter < iterations; iter++) {
        pos = step(pos, LAMBDA)   // forward — smooths
        pos = step(pos, MU)       // backward — restores volume
    }

    return pos
}

// ── Marching Cubes + optional smoothing + geometry flattening ─────────────────
function buildMeshArrays(nifti, smoothIterations) {
    const { nx, ny, nz, dx, dy, dz, voxels } = nifti

    const sdf = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return -1
        return voxels[x + y * nx + z * nx * ny] > 0.5 ? 1 : -1
    }

    const result = marchingCubes([nx, ny, nz], sdf, [[0, 0, 0], [nx, ny, nz]])
    if (!result || !result.positions || result.positions.length === 0) return null

    // Center of mass in mm space
    const cx = (nx * dx) / 2
    const cy = (ny * dy) / 2
    const cz = (nz * dz) / 2

    const rawPos   = result.positions   // [[x,y,z], ...]
    const rawCells = result.cells       // [[i,j,k], ...]

    // ── Apply Laplacian smoothing on indexed mesh (optional) ─────────────────
    const pos = laplacianSmooth(rawPos, rawCells, smoothIterations)

    const triCount = rawCells.length

    const posArr  = new Float32Array(triCount * 9)
    const normArr = new Float32Array(triCount * 9)

    let p = 0
    for (const [i, j, k] of rawCells) {
        const a = pos[i], b = pos[j], c = pos[k]

        const ax = a[0]*dx - cx,  ay = a[1]*dy - cy,  az = a[2]*dz - cz
        const bx = b[0]*dx - cx,  by = b[1]*dy - cy,  bz = b[2]*dz - cz
        const cx_ = c[0]*dx - cx, cy_ = c[1]*dy - cy, cz_ = c[2]*dz - cz

        posArr[p]   = ax; posArr[p+1] = ay; posArr[p+2] = az
        posArr[p+3] = bx; posArr[p+4] = by; posArr[p+5] = bz
        posArr[p+6] = cx_; posArr[p+7] = cy_; posArr[p+8] = cz_

        // Face normal
        const ux = bx-ax, uy = by-ay, uz = bz-az
        const vx = cx_-ax, vy = cy_-ay, vz = cz_-az
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

    // Bounding box for maxDim (used by camera placement)
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < posArr.length; i += 3) {
        if (posArr[i]   < minX) minX = posArr[i]
        if (posArr[i]   > maxX) maxX = posArr[i]
        if (posArr[i+1] < minY) minY = posArr[i+1]
        if (posArr[i+1] > maxY) maxY = posArr[i+1]
        if (posArr[i+2] < minZ) minZ = posArr[i+2]
        if (posArr[i+2] > maxZ) maxZ = posArr[i+2]
    }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    const bcx = (minX + maxX) / 2
    const bcy = (minY + maxY) / 2
    const bcz = (minZ + maxZ) / 2

    return { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
}

// ── Worker message handler ────────────────────────────────────────────────────
self.onmessage = function (e) {
    const { arrayBuffer, smoothIterations = 0 } = e.data
    try {
        const nifti  = parseNifti1(arrayBuffer)
        const result = buildMeshArrays(nifti, smoothIterations)
        if (!result) {
            self.postMessage({ error: 'Marching Cubes produced no surface — check the mask.' })
            return
        }
        const { posArr, normArr, triCount, maxDim, bcx, bcy, bcz } = result
        // Transfer buffers for zero-copy
        self.postMessage(
            { posArr, normArr, triCount, maxDim, bcx, bcy, bcz },
            [posArr.buffer, normArr.buffer]
        )
    } catch (err) {
        self.postMessage({ error: err.message })
    }
}
