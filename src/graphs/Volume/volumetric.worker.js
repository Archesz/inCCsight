/* eslint-disable no-restricted-globals */
/**
 * volumetric.worker.js
 *
 * Off-main-thread worker that handles:
 *   1. NIfTI-1 parsing (3D scalar and 4D vector)
 *   2. Marching Cubes surface extraction (isosurface) on the CC mask
 *   3. Optional per-vertex coloring from DTI eigenvalues / principal eigenvector:
 *        - Color-FA  : RGB = |V1| · FA  (classic direction-encoded DTI map)
 *        - FA heat   : cold→warm gradient by FA magnitude
 *   4. Flattening positions + face normals into Float32Arrays
 *
 * The heavy Float32Arrays are transferred (zero-copy) back to the main thread.
 *
 * Message in:
 *   { arrayBuffer: ArrayBuffer,                                  // CC mask NIfTI
 *     dtiBuffers : { L1, L2, L3, V1? } | null }                 // optional DTI
 * Message out (success):
 *   { posArr, normArr, triCount, maxDim, bcx, bcy, bcz,
 *     colorFA, colorHeat }                                       // last two: null if no DTI
 * Message out (error):
 *   { error: string }
 */

import { marchingCubes } from 'isosurface'

// ── NIfTI-1 parser (handles 3D scalar and 4D vector fields) ──────────────────
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

    // Infer the component dimension (1 for scalars, 3 for V1/V2/V3) from file size
    const bytesPerValue = { 2: 1, 4: 2, 8: 4, 16: 4, 64: 8 }[datatype] || 1
    const nxyz         = nx * ny * nz
    const totalValues  = Math.floor((buf.byteLength - vox_offset) / bytesPerValue)
    const ncomp        = Math.max(1, Math.round(totalValues / nxyz))
    const n            = nxyz * ncomp

    let voxels
    if      (datatype === 2)  voxels = new Uint8Array   (buf, vox_offset, n)
    else if (datatype === 4)  voxels = Float32Array.from(new Int16Array  (buf.slice(vox_offset, vox_offset + n * 2)))
    else if (datatype === 8)  voxels = Float32Array.from(new Int32Array  (buf.slice(vox_offset, vox_offset + n * 4)))
    else if (datatype === 16) voxels = new Float32Array  (buf, vox_offset, n)
    else if (datatype === 64) voxels = Float32Array.from(new Float64Array(buf.slice(vox_offset, vox_offset + n * 8)))
    else                      voxels = new Uint8Array   (buf, vox_offset, n)

    return { nx, ny, nz, dx, dy, dz, ncomp, voxels }
}

// ── Trilinear interpolation for a single scalar component ────────────────────
function trilerpScalar(vol, nx, ny, nz, fx, fy, fz, compOffset = 0) {
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz)
    const i1 = i0 + 1, j1 = j0 + 1, k1 = k0 + 1
    if (i0 < 0 || j0 < 0 || k0 < 0 || i1 >= nx || j1 >= ny || k1 >= nz) {
        // Out of bounds — fall back to nearest in-bounds voxel
        const ix = Math.min(nx - 1, Math.max(0, Math.round(fx)))
        const iy = Math.min(ny - 1, Math.max(0, Math.round(fy)))
        const iz = Math.min(nz - 1, Math.max(0, Math.round(fz)))
        return vol[compOffset + ix + iy * nx + iz * nx * ny]
    }
    const di = fx - i0, dj = fy - j0, dk = fz - k0
    const sx = nx, sy = nx * ny
    const o = compOffset
    return (
        vol[o + i0 + j0 * sx + k0 * sy] * (1 - di) * (1 - dj) * (1 - dk) +
        vol[o + i1 + j0 * sx + k0 * sy] *      di  * (1 - dj) * (1 - dk) +
        vol[o + i0 + j1 * sx + k0 * sy] * (1 - di) *      dj  * (1 - dk) +
        vol[o + i1 + j1 * sx + k0 * sy] *      di  *      dj  * (1 - dk) +
        vol[o + i0 + j0 * sx + k1 * sy] * (1 - di) * (1 - dj) *      dk  +
        vol[o + i1 + j0 * sx + k1 * sy] *      di  * (1 - dj) *      dk  +
        vol[o + i0 + j1 * sx + k1 * sy] * (1 - di) *      dj  *      dk  +
        vol[o + i1 + j1 * sx + k1 * sy] *      di  *      dj  *      dk
    )
}

// ── Witelson parcellation ─────────────────────────────────────────────────────
// AP-band colours kept in sync with WITELSON_REGION_META in VolumetricView.jsx
// and _W_BOUNDS in methods/tractography/main.py.
const W_COLORS = [
    [0.39, 0.43, 0.98],  // W1 Anterior   (#636EFA)
    [0.00, 0.80, 0.59],  // W2 Mid-ant.   (#00CC96)
    [1.00, 0.63, 0.35],  // W3 Central    (#FFA15A)
    [0.67, 0.39, 0.98],  // W4 Mid-post.  (#AB63FA)
    [0.94, 0.33, 0.23],  // W5 Posterior  (#EF553B)
]

// f is already normalised to [0, 1] over the CC's own AP extent.
function witelsonRegion(f) {
    if (f < 1/3) return 0
    if (f < 1/2) return 1
    if (f < 2/3) return 2
    if (f < 4/5) return 3
    return 4
}

// ── Marching Cubes + geometry flattening (+ optional per-vertex colors) ──────
function buildMeshArrays(maskNifti, dtiVolumes) {
    const { nx, ny, nz, dx, dy, dz, voxels } = maskNifti

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
    const triCount = rawCells.length

    const posArr  = new Float32Array(triCount * 9)
    const normArr = new Float32Array(triCount * 9)

    // ── DTI sampling setup (only if all required volumes are present) ───────
    const dti = dtiVolumes
    const nxyz = nx * ny * nz
    let colorFA = null, colorHeat = null
    if (dti && dti.L1 && dti.L2 && dti.L3) {
        // Sanity check: L1 dimensions must match mask
        if (dti.L1.nx === nx && dti.L1.ny === ny && dti.L1.nz === nz) {
            colorHeat = new Float32Array(triCount * 9)
            if (dti.V1 && dti.V1.ncomp >= 3) colorFA = new Float32Array(triCount * 9)
        }
    }
    const hasColor = colorHeat !== null

    // ── Helpers to sample DTI at a fractional voxel position ────────────────
    const sampleColors = (fx, fy, fz, outRGB) => {
        // Trilerp the three eigenvalues
        const l1 = trilerpScalar(dti.L1.voxels, nx, ny, nz, fx, fy, fz)
        const l2 = trilerpScalar(dti.L2.voxels, nx, ny, nz, fx, fy, fz)
        const l3 = trilerpScalar(dti.L3.voxels, nx, ny, nz, fx, fy, fz)
        const md = (l1 + l2 + l3) / 3
        const num = (l1 - md) ** 2 + (l2 - md) ** 2 + (l3 - md) ** 2
        const den = l1 * l1 + l2 * l2 + l3 * l3
        let fa = den > 1e-12 ? Math.sqrt(1.5 * num / den) : 0
        fa = Math.max(0, Math.min(1, fa))

        // FA heat: cold (low) → warm (high). Same palette as tract FA in VolumetricView.
        const t = fa
        outRGB.heatR = t
        outRGB.heatG = 1 - Math.abs(2 * t - 1)
        outRGB.heatB = 1 - t

        if (colorFA && dti.V1) {
            // V1 stored as (nx,ny,nz,3) with vector component as outermost dim.
            // Nearest-neighbor on V1 (sign flips between adjacent voxels can hurt trilerp).
            const ix = Math.min(nx - 1, Math.max(0, Math.round(fx)))
            const iy = Math.min(ny - 1, Math.max(0, Math.round(fy)))
            const iz = Math.min(nz - 1, Math.max(0, Math.round(fz)))
            const idx = ix + iy * nx + iz * nx * ny
            const vx = dti.V1.voxels[idx + 0 * nxyz]
            const vy = dti.V1.voxels[idx + 1 * nxyz]
            const vz = dti.V1.voxels[idx + 2 * nxyz]
            outRGB.faR = Math.abs(vx) * fa
            outRGB.faG = Math.abs(vy) * fa
            outRGB.faB = Math.abs(vz) * fa
        }
    }

    const rgb = { heatR: 0, heatG: 0, heatB: 0, faR: 0, faG: 0, faB: 0 }

    // Parcellation is always computed — no DTI required.
    // Normalise Witelson bands to the CC's own AP (Y) extent so all 5 regions
    // are always visible regardless of where the CC sits in the full image.
    let minMeshY = Infinity, maxMeshY = -Infinity
    for (const pos of rawPos) {
        if (pos[1] < minMeshY) minMeshY = pos[1]
        if (pos[1] > maxMeshY) maxMeshY = pos[1]
    }
    const meshYRange = maxMeshY - minMeshY || 1

    const colorParcellation = new Float32Array(triCount * 9)

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
        const ux = bx - ax,  uy = by - ay,  uz = bz - az
        const vx = cx_ - ax, vy = cy_ - ay, vz = cz_ - az
        let nx_ = uy*vz - uz*vy
        let ny_ = uz*vx - ux*vz
        let nz_ = ux*vy - uy*vx
        const nlen = Math.sqrt(nx_*nx_ + ny_*ny_ + nz_*nz_) || 1
        nx_ /= nlen; ny_ /= nlen; nz_ /= nlen

        for (let s = 0; s < 3; s++) {
            normArr[p + s*3]     = nx_
            normArr[p + s*3 + 1] = ny_
            normArr[p + s*3 + 2] = nz_
        }

        if (hasColor) {
            const verts = [a, b, c]
            for (let s = 0; s < 3; s++) {
                sampleColors(verts[s][0], verts[s][1], verts[s][2], rgb)
                colorHeat[p + s*3]     = rgb.heatR
                colorHeat[p + s*3 + 1] = rgb.heatG
                colorHeat[p + s*3 + 2] = rgb.heatB
                if (colorFA) {
                    colorFA[p + s*3]     = rgb.faR
                    colorFA[p + s*3 + 1] = rgb.faG
                    colorFA[p + s*3 + 2] = rgb.faB
                }
            }
        }

        // Witelson parcellation — normalised AP fraction within the CC's own extent
        const pa = W_COLORS[witelsonRegion((a[1] - minMeshY) / meshYRange)]
        const pb = W_COLORS[witelsonRegion((b[1] - minMeshY) / meshYRange)]
        const pc = W_COLORS[witelsonRegion((c[1] - minMeshY) / meshYRange)]
        colorParcellation[p]   = pa[0]; colorParcellation[p+1] = pa[1]; colorParcellation[p+2] = pa[2]
        colorParcellation[p+3] = pb[0]; colorParcellation[p+4] = pb[1]; colorParcellation[p+5] = pb[2]
        colorParcellation[p+6] = pc[0]; colorParcellation[p+7] = pc[1]; colorParcellation[p+8] = pc[2]

        p += 9
    }

    // Bounding box for maxDim (camera placement)
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

    return { posArr, normArr, triCount, maxDim, bcx, bcy, bcz, colorFA, colorHeat, colorParcellation }
}

// ── Worker message handler ────────────────────────────────────────────────────
self.onmessage = function (e) {
    const { arrayBuffer, dtiBuffers } = e.data
    try {
        const mask = parseNifti1(arrayBuffer)

        // Parse optional DTI buffers
        let dtiVolumes = null
        if (dtiBuffers && dtiBuffers.L1 && dtiBuffers.L2 && dtiBuffers.L3) {
            try {
                dtiVolumes = {
                    L1: parseNifti1(dtiBuffers.L1),
                    L2: parseNifti1(dtiBuffers.L2),
                    L3: parseNifti1(dtiBuffers.L3),
                    V1: dtiBuffers.V1 ? parseNifti1(dtiBuffers.V1) : null,
                }
            } catch (e) {
                dtiVolumes = null
            }
        }

        const result = buildMeshArrays(mask, dtiVolumes)
        if (!result) {
            self.postMessage({ error: 'Marching Cubes produced no surface — check the mask.' })
            return
        }

        const { posArr, normArr, triCount, maxDim, bcx, bcy, bcz, colorFA, colorHeat, colorParcellation } = result

        // Build transferables list (colorParcellation always present; colorFA/colorHeat optional)
        const transfer = [posArr.buffer, normArr.buffer, colorParcellation.buffer]
        if (colorHeat) transfer.push(colorHeat.buffer)
        if (colorFA)   transfer.push(colorFA.buffer)

        self.postMessage(
            { posArr, normArr, triCount, maxDim, bcx, bcy, bcz, colorFA, colorHeat, colorParcellation },
            transfer
        )
    } catch (err) {
        self.postMessage({ error: err.message })
    }
}
