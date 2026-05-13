/* eslint-disable no-restricted-globals */
/**
 * volumetric.worker.js
 *
 * Off-main-thread worker that handles:
 *   1. NIfTI-1 parsing (DataView)
 *   2. Marching Cubes surface extraction (isosurface)
 *   3. Flattening positions + face normals into Float32Arrays
 *
 * The heavy Float32Arrays are transferred (zero-copy) back to the main thread.
 *
 * Message in:  { arrayBuffer: ArrayBuffer }
 * Message out (success): { posArr, normArr, triCount, maxDim, cx, cy, cz }
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

// ── Laplacian mesh smoothing (operates on shared vertex list) ─────────────────
function laplacianSmooth(positions, cells, iterations) {
    if (iterations <= 0) return positions
    const n = positions.length

    // Build adjacency as flat arrays for speed
    const neighborCount = new Int32Array(n)
    for (const [a, b, c] of cells) {
        neighborCount[a] += 2; neighborCount[b] += 2; neighborCount[c] += 2
    }
    const offsets = new Int32Array(n + 1)
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + neighborCount[i]
    const total = offsets[n]
    const adj   = new Int32Array(total)
    const fill  = new Int32Array(n)
    for (const [a, b, c] of cells) {
        adj[offsets[a] + fill[a]++] = b
        adj[offsets[a] + fill[a]++] = c
        adj[offsets[b] + fill[b]++] = a
        adj[offsets[b] + fill[b]++] = c
        adj[offsets[c] + fill[c]++] = a
        adj[offsets[c] + fill[c]++] = b
    }

    // Smoothing iterations with λ=0.5 (move half-way toward centroid of neighbours)
    const lambda = 0.5
    let pos = positions.map(p => [p[0], p[1], p[2]])
    const next = pos.map(p => [p[0], p[1], p[2]])

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < n; i++) {
            const start = offsets[i]
            const end   = offsets[i + 1]
            if (start === end) { next[i][0] = pos[i][0]; next[i][1] = pos[i][1]; next[i][2] = pos[i][2]; continue }
            let sx = 0, sy = 0, sz = 0
            const cnt = end - start
            for (let k = start; k < end; k++) {
                const j = adj[k]
                sx += pos[j][0]; sy += pos[j][1]; sz += pos[j][2]
            }
            next[i][0] = pos[i][0] + lambda * (sx / cnt - pos[i][0])
            next[i][1] = pos[i][1] + lambda * (sy / cnt - pos[i][1])
            next[i][2] = pos[i][2] + lambda * (sz / cnt - pos[i][2])
        }
        // swap
        for (let i = 0; i < n; i++) {
            pos[i][0] = next[i][0]; pos[i][1] = next[i][1]; pos[i][2] = next[i][2]
        }
    }
    return pos
}

// ── Marching Cubes + geometry flattening ──────────────────────────────────────
function buildMeshArrays(nifti, smoothIterations = 0) {
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

    // Apply Laplacian smoothing before flattening (shared vertices → correct adjacency)
    const rawPos   = laplacianSmooth(result.positions, result.cells, smoothIterations)
    const rawCells = result.cells       // [[i,j,k], ...]
    const triCount = rawCells.length

    const posArr  = new Float32Array(triCount * 9)
    const normArr = new Float32Array(triCount * 9)

    let p = 0
    for (const [i, j, k] of rawCells) {
        const a = rawPos[i], b = rawPos[j], c = rawPos[k]

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
    // Geometric center of bounding box (will be 0,0,0 since we centered on cx/cy/cz)
    const bcx = (minX + maxX) / 2
    const bcy = (minY + maxY) / 2
    const bcz = (minZ + maxZ) / 2

    return { posArr, normArr, triCount, maxDim, bcx, bcy, bcz }
}

// ── Worker message handler ────────────────────────────────────────────────────
self.onmessage = function (e) {
    const { arrayBuffer, smoothIterations = 0 } = e.data
    try {
        const nifti = parseNifti1(arrayBuffer)
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
