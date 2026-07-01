// palettes.js — centralized group colour palettes.
//
// Historically GROUP_COLORS was duplicated in several components. They now all
// import getGroupColors() so the user's palette preference applies everywhere.

import { getSetting } from './settings'

export const PALETTES = {
    // Original Plotly-style palette
    default: ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3'],
    // Okabe–Ito colourblind-safe palette
    colorblind: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#F0E442', '#56B4E9', '#D55E00'],
}

export function getGroupColors() {
    return PALETTES[getSetting('palette')] || PALETTES.default
}
