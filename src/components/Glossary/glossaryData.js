/**
 * glossaryData.js
 *
 * Complete glossary for InCCsight — corpus callosum DTI analysis.
 * Each entry: { id, term, category, short, body, unit?, ref? }
 */

export const CATEGORIES = [
    { id: 'dti',       label: 'DTI Metrics'          },
    { id: 'anatomy',   label: 'CC Anatomy'            },
    { id: 'parcell',   label: 'Parcellation Schemes'  },
    { id: 'shape',     label: 'Shape Metrics'         },
    { id: 'methods',   label: 'Segmentation Methods'  },
    { id: 'stats',     label: 'Statistics & QC'       },
    { id: 'clinical',  label: 'Clinical Context'      },
]

export const GLOSSARY = [

    // ── DTI Metrics ───────────────────────────────────────────────────────────

    {
        id: 'fa',
        term: 'FA — Fractional Anisotropy',
        category: 'dti',
        short: 'Degree of directionality of water diffusion (0 = isotropic, 1 = fully anisotropic).',
        body: `FA measures how strongly water diffusion is oriented in one direction within a voxel.
In the corpus callosum, where axons are tightly bundled and parallel, FA is typically high (0.55–0.75).
Low FA indicates loss of axonal organisation — caused by demyelination, axonal loss, oedema or fibre crossing.

FA is the most widely used DTI metric because it is sensitive to the overall integrity of white matter, regardless of the specific mechanism of damage.`,
        unit: 'Dimensionless, range 0–1',
        ref: 'Basser & Pierpaoli, MRM 1996; Beaulieu, NMR Biomed 2002',
    },
    {
        id: 'md',
        term: 'MD — Mean Diffusivity',
        category: 'dti',
        short: 'Average rate of water diffusion in all directions; marker of cellularity and oedema.',
        body: `MD (also called ADC — Apparent Diffusion Coefficient) is the mean of the three eigenvalues:
MD = (L1 + L2 + L3) / 3

High MD indicates less restriction to diffusion — seen in oedema, neuroinflammation, tissue loss and vasogenic oedema.
Low MD indicates more restriction — seen in acute ischaemia or dense tumours.

In the corpus callosum, MD is typically ~0.75–0.95 × 10⁻³ mm²/s and increases with neurodegeneration and demyelination.`,
        unit: '10⁻³ mm²/s (or mm²/s × 10⁻⁶)',
        ref: 'Le Bihan et al., Radiology 1986; Pierpaoli et al., Radiology 1996',
    },
    {
        id: 'rd',
        term: 'RD — Radial Diffusivity',
        category: 'dti',
        short: 'Water diffusion perpendicular to axons; sensitive to myelin integrity.',
        body: `RD = (L2 + L3) / 2

RD measures diffusion in the plane perpendicular to the primary axon direction. The myelin sheath acts as a barrier to perpendicular diffusion — intact myelin keeps RD low.

Increased RD is specifically associated with demyelination (myelin damage without axonal loss), making it more specific than FA for myelin-related changes. This distinction is clinically important in MS, where demyelination and axonal loss can co-exist.

In the CC, typical RD is ~0.35–0.55 × 10⁻³ mm²/s.`,
        unit: '10⁻³ mm²/s',
        ref: 'Song et al., NeuroImage 2002; Budde et al., NMR Biomed 2008',
    },
    {
        id: 'ad',
        term: 'AD — Axial Diffusivity',
        category: 'dti',
        short: 'Water diffusion along the main axon direction; sensitive to axonal integrity.',
        body: `AD = L1 (the largest eigenvalue)

AD measures diffusion along the primary axis of the axon bundle — the direction of fastest diffusion. It is primarily sensitive to axonal integrity rather than myelin.

Decreased AD is associated with axonal damage (Wallerian degeneration, axotomy), while increased AD may reflect loss of barriers along the fibre tract.

In the CC, typical AD is ~1.5–1.8 × 10⁻³ mm²/s. Combined interpretation of AD and RD allows partial separation of axonal vs. myelin-related damage.`,
        unit: '10⁻³ mm²/s',
        ref: 'Song et al., NeuroImage 2003; Alexander et al., Ann NY Acad Sci 2007',
    },
    {
        id: 'eigenvalues',
        term: 'Eigenvalues — L1, L2, L3',
        category: 'dti',
        short: 'Three principal diffusion rates along orthogonal axes of the diffusion ellipsoid.',
        body: `The diffusion tensor is a 3×3 symmetric matrix that describes diffusion in 3D. Its three eigenvalues (L1 ≥ L2 ≥ L3) represent the rates of diffusion along the three principal axes of an ellipsoid:

• L1 (largest) → primary diffusion direction = axon direction in WM
• L2, L3 (smaller) → diffusion perpendicular to axons

From these, all scalar metrics derive:
  FA = f(L1, L2, L3)
  MD = (L1 + L2 + L3) / 3
  AD = L1
  RD = (L2 + L3) / 2

InCCsight uses the files dti_L1.nii.gz, dti_L2.nii.gz, dti_L3.nii.gz as primary inputs.`,
        unit: '10⁻³ mm²/s',
        ref: 'Basser et al., Biophysical J 1994',
    },
    {
        id: 'eigenvectors',
        term: 'Eigenvectors — V1, V2, V3',
        category: 'dti',
        short: 'Direction vectors associated with each eigenvalue; V1 points along axon bundles.',
        body: `Each eigenvalue has a corresponding eigenvector describing its spatial orientation:

• V1 → direction of maximum diffusion = primary axon orientation
• V2, V3 → perpendicular directions

V1 is the most important clinically — it defines which way the fibres in a voxel run. In the corpus callosum, V1 points predominantly left-right (the x-axis in standard orientation).

InCCsight uses V1 for:
  • Seed selection in ROQS segmentation (voxels where V1 is predominantly left-right)
  • Computation of the FA-weighted eigenvector map (wFA)
  • Asymmetry index calculation`,
        unit: 'Dimensionless unit vector',
        ref: 'Basser et al., Biophysical J 1994; Pierpaoli & Basser, MRM 1996',
    },

    // ── CC Anatomy ────────────────────────────────────────────────────────────

    {
        id: 'genu',
        term: 'Genu',
        category: 'anatomy',
        short: 'Anterior hook-shaped portion of the CC; connects prefrontal cortices.',
        body: `The genu ("knee" in Latin) is the most anterior part of the corpus callosum, forming the characteristic curved hook visible on midsagittal MRI.

It connects the prefrontal cortices bilaterally and carries fibres involved in:
  • Executive function and decision-making
  • Working memory
  • Emotional regulation (orbitofrontal connections)

The genu is particularly affected in Parkinson's disease and frontal-predominant dementias. In the Witelson parcellation it corresponds to P1.

FA values in the genu are typically high (0.58–0.65) due to the coherent fibre orientation.`,
        ref: 'Witelson 1989, Brain; Catani & Thiebaut de Schotten 2008',
    },
    {
        id: 'body',
        term: 'Body (Truncus)',
        category: 'anatomy',
        short: 'Middle elongated portion of the CC; connects premotor, motor and somatosensory cortices.',
        body: `The body is the largest section of the corpus callosum, running between the genu and splenium. It is subdivided into anterior, central and posterior body.

Functional connectivity by sub-region:
  • Anterior body (Witelson P2) → supplementary motor area, premotor cortex
  • Central body (P3) → primary motor cortex (hand area), somatosensory cortex
  • Posterior body (P4) → parietal and posterior temporal cortices

The body is the main site of damage in ALS (corticospinal tract fibres), traumatic brain injury and progressive MS.

FA in the body ranges 0.48–0.58, slightly lower than genu and splenium due to more heterogeneous fibre orientations.`,
        ref: 'Witelson 1989; Hofer & Frahm 2006, NeuroImage',
    },
    {
        id: 'splenium',
        term: 'Splenium',
        category: 'anatomy',
        short: 'Posterior bulbous portion of the CC; connects occipital and temporal cortices.',
        body: `The splenium ("bandage" in Greek) is the posterior bulbous termination of the corpus callosum. It is the thickest part of the CC and carries the largest fibre bundles.

It connects:
  • Occipital cortices (visual processing)
  • Posterior temporal cortices (language, auditory association)
  • Inferior parietal cortices

The splenium is the region most consistently affected in Alzheimer's disease — its FA declines early, reflecting disconnection of posterior cortical networks, and this precedes clinical diagnosis in some studies.

FA in the splenium is the highest of any CC region (0.63–0.72), reflecting the dense and coherent fibre packing. In the Witelson scheme it corresponds to P5.`,
        ref: 'Salat et al., Cereb Cortex 2010; Nir et al., Hum Brain Mapp 2013',
    },
    {
        id: 'isthmus',
        term: 'Isthmus',
        category: 'anatomy',
        short: 'Narrow constriction between body and splenium; carries temporal lobe fibres.',
        body: `The isthmus is a narrowing of the CC at the junction between the posterior body and the splenium. Despite its small size, it is functionally important because it carries fibres connecting the superior temporal cortices (auditory association, Wernicke's area).

The isthmus is specifically targeted in:
  • Williams syndrome (hypoplasia)
  • Some schizophrenia studies (reduced FA)
  • Callosotomy procedures (selective posterior sectioning)

In volume-based parcellations (Cover scheme), the isthmus is treated as a distinct region. In the Witelson scheme it is included within P4/P5.`,
        ref: 'Hofer & Frahm 2006; Thompson et al., PNAS 2001',
    },
    {
        id: 'rostrum',
        term: 'Rostrum',
        category: 'anatomy',
        short: 'Inferior thin projection below the genu; connects orbital-frontal regions.',
        body: `The rostrum ("beak" in Latin) is the thin inferior projection of the CC below the genu, tapering toward the anterior commissure. It is the thinnest and most variable part of the CC.

It connects orbitofrontal and ventromedial prefrontal regions — areas involved in:
  • Emotional processing
  • Reward and motivation
  • Olfactory integration

The rostrum is often absent or hypoplastic in partial callosal agenesis, and shows early atrophy in some frontal dementias.

Due to its small size, it is not separately modelled in most parcellation schemes, but is included within P1 (Witelson) or the anterior-most region.`,
        ref: 'Witelson 1989; Paul et al., Brain 2007',
    },
    {
        id: 'midsagittal',
        term: 'Midsagittal slice',
        category: 'anatomy',
        short: 'The central sagittal plane (x=0) where the CC is best visualised.',
        body: `The corpus callosum is a midline structure best seen on the midsagittal slice — the slice passing exactly through the interhemispheric fissure.

InCCsight automatically identifies this slice from the DTI volume by finding the plane with:
  • Highest mean FA in the central region
  • Most symmetric white matter signal

All 2D segmentation (ROQS and Watershed) and morphometric analysis (midline profiles, thickness, area, CCI) is performed on this single slice.

The midsagittal approach allows fast analysis but misses 3D fibre geometry — this is why the CNN-based 3D segmentation is complementary.`,
        ref: 'Witelson 1989; Davatzikos & Bryan 1996, IEEE TMI',
    },

    // ── Parcellation Schemes ──────────────────────────────────────────────────

    {
        id: 'witelson',
        term: 'Witelson Parcellation',
        category: 'parcell',
        short: '5-region scheme based on relative length; the most widely used in clinical research.',
        body: `Proposed by Witelson (1989) based on post-mortem neuroanatomical tract tracing. Divides the midsagittal CC into 5 parts by fractional length:

  P1 (anterior 1/3)          → genu + anterior rostrum
  P2 (anterior mid-third)    → anterior body
  P3 (posterior mid-third)   → central body
  P4 (posterior fourth)      → posterior body + isthmus
  P5 (posterior fifth)       → splenium

Boundaries: at 1/3, 1/2, 2/3, and 4/5 of total length.

This scheme is the most cited in the literature (>5,000 papers) and is the default in InCCsight. It is particularly useful for cross-study comparisons but does not perfectly follow fibre architecture — more anatomically precise alternatives exist.`,
        ref: 'Witelson, Brain 1989',
    },
    {
        id: 'hofer',
        term: 'Hofer & Frahm Parcellation',
        category: 'parcell',
        short: '5-region scheme based on corticospinal tract anatomy from tractography studies.',
        body: `Proposed by Hofer & Frahm (2006) using DTI tractography to redefine CC boundaries based on actual fibre projections rather than geometric proportions.

  P1 → prefrontal cortex
  P2 → premotor and supplementary motor cortex
  P3 → primary motor cortex
  P4 → primary somatosensory and posterior parietal cortex
  P5 → temporal, parietal, occipital cortex

Key difference from Witelson: the motor-related region (P3) is more precisely localised to the central body, reflecting actual tractography rather than geometry. This makes the scheme more biologically meaningful for motor disorders.

The boundaries differ from Witelson primarily in the anterior-central transition.`,
        ref: 'Hofer & Frahm, NeuroImage 2006',
    },
    {
        id: 'chao',
        term: 'Chao Parcellation',
        category: 'parcell',
        short: 'Refined 5-region scheme using probabilistic tractography in healthy adults.',
        body: `Proposed by Chao et al. (2009) using probabilistic DTI tractography in a cohort of healthy adults. The boundaries were computed by maximising between-region FA contrast rather than relying on predefined fractions.

The Chao scheme tends to place the genu-body boundary slightly more anteriorly than Witelson, and the splenium boundary slightly more posteriorly — reflecting the fact that the high-FA splenium fibres extend further forward than the geometric 4/5 cut.

Useful when the research question concerns the splenium specifically, as it captures more of the high-FA posterior fibres.`,
        ref: 'Chao et al., NeuroImage 2009',
    },
    {
        id: 'cover',
        term: 'Cover Parcellation',
        category: 'parcell',
        short: 'Area-balanced 5-region scheme using k-means clustering on the midline.',
        body: `The Cover scheme uses k-means clustering on midline points weighted by FA to produce five regions of approximately equal midline arc length (rather than equal linear length or functional anatomy).

This approach minimises intra-region variance in FA, making it more statistically efficient for detecting group differences in small samples. However, it is less interpretable anatomically because the regions do not map to named structures.

Best suited for: hypothesis-free, data-driven studies comparing groups where anatomy is not the primary interest.`,
        ref: 'Cover et al., NeuroImage 2011',
    },
    {
        id: 'freesurfer',
        term: 'FreeSurfer Parcellation',
        category: 'parcell',
        short: 'Atlas-based parcellation using FreeSurfer cortical labels projected onto CC fibres.',
        body: `The FreeSurfer scheme maps the corpus callosum onto the FreeSurfer cortical atlas labels. The CC is divided into 5 sub-regions corresponding to the cortical areas their fibres connect — frontal, motor, parietal, temporal and occipital.

  P1 → CC frontal (prefrontal, orbitofrontal)
  P2 → CC central (motor, somatosensory)
  P3 → CC mid-posterior (parietal)
  P4 → CC isthmus (temporal)
  P5 → CC occipital (visual cortex)

This scheme is directly compatible with FreeSurfer cortical parcellation output, facilitating structure–function analyses when cortical thickness or surface area data are also available.`,
        ref: 'Desikan et al., NeuroImage 2006; FreeSurfer documentation',
    },

    // ── Shape Metrics ─────────────────────────────────────────────────────────

    {
        id: 'area',
        term: 'CC Area',
        category: 'shape',
        short: 'Voxel count of the CC mask on the midsagittal slice; proxy for cross-sectional area.',
        body: `The midsagittal area is the total number of True voxels in the 2D segmentation mask. It is the oldest and most established morphometric measure of the corpus callosum.

Clinical significance:
  • Decreases with age (normal decline ~1.5% per decade after 40)
  • Reduced in Alzheimer's, MS, schizophrenia, TBI, normal pressure hydrocephalus
  • Increases during childhood development (myelination) up to ~20 years
  • Sex differences: men tend to have absolutely larger CC; women may have relatively larger CC after brain size correction

The area is reported in voxel units. For millimetre values, multiply by the voxel size (mm²/voxel) from the NIfTI header.`,
        unit: 'voxels (multiply by pixel size² for mm²)',
        ref: 'Witelson 1989, Brain; Davatzikos & Bryan 1996; Ardekani et al., Hum Brain Mapp 2013',
    },
    {
        id: 'cc_length',
        term: 'CC Length',
        category: 'shape',
        short: 'Anterior-posterior extent of the CC on the midsagittal slice, in occupied columns.',
        body: `The CC length is computed as the number of image columns (anterior-posterior axis) that contain at least one CC voxel in the midsagittal mask.

It measures the total anterior-posterior extent of the CC — from the tip of the genu to the posterior edge of the splenium.

Clinical significance:
  • More sensitive to focal atrophy than area (e.g., posterior splenium atrophy in AD shortens the CC without proportionally reducing area)
  • Correlates with total forebrain volume (larger brains have longer CC)
  • Useful for normalising other metrics (area/length = mean height; max_thickness/length = CCI)

Expressed in pixel columns; multiply by voxel width (mm/pixel) for mm.`,
        unit: 'pixel columns (× voxel size mm for mm)',
        ref: 'Pujol et al., JNNP 1993; Luders et al., NeuroReport 2006',
    },
    {
        id: 'max_thickness',
        term: 'Max Thickness',
        category: 'shape',
        short: 'Maximum column height of the CC mask; typically at genu or splenium.',
        body: `Computed as the maximum value of the 200-point thickness array — the tallest column in the CC segmentation mask.

In healthy adults the maximum thickness is typically at the splenium (~14–18 mm for 1 mm isotropic data). The genu is also thick; the thinnest region is usually the mid-body or isthmus.

Clinical significance:
  • Reduced in multiple sclerosis (particularly splenium maximum thickness)
  • Used as input to the Corpus Callosum Index (CCI)
  • Sensitive to local focal atrophy that global area might miss`,
        unit: 'pixels (× voxel height mm for mm)',
        ref: 'Evangelou et al., Brain 2000; Losseff et al., Brain 1996',
    },
    {
        id: 'mean_thickness',
        term: 'Mean Thickness',
        category: 'shape',
        short: 'Average column height across all 200 points; global thickness measure.',
        body: `The mean of the 200-point thickness array — average height of the CC across its entire length.

Unlike maximum thickness (which reflects the thickest point), mean thickness captures global thinning. This makes it more sensitive to diffuse atrophy (Huntington's, ALS, normal ageing) while being less sensitive to focal changes.

The normal decline with age is approximately:
  • 18–40 years: relatively stable, ~6–9 mm mean thickness
  • 40–70 years: ~0.1 mm per decade decline
  • 70+ years: accelerated decline

Mean thickness strongly correlates with cognitive processing speed across healthy ageing.`,
        unit: 'pixels (× voxel height mm for mm)',
        ref: 'Keshavan et al., Psychiatry Res 1991; Ardekani et al., 2013',
    },
    {
        id: 'cci',
        term: 'CCI — Corpus Callosum Index',
        category: 'shape',
        short: 'Aspect ratio of the CC (max_thickness / length); clinical atrophy marker.',
        body: `The Corpus Callosum Index is a dimensionless shape ratio expressing how "tall" the CC is relative to its length:

  CCI = max_thickness / cc_length

A high CCI (~0.15–0.25) indicates a relatively full, globose CC. A low CCI indicates a thin, elongated CC — a hallmark of global atrophy.

Clinical use:
  • Normal Pressure Hydrocephalus (NPH): CCI < 0.18 supports diagnosis; used in guidelines as a simple screening measure
  • Multiple Sclerosis: CCI correlates with disability score (EDSS) and declines in progressive MS
  • Alzheimer's disease: CCI declines earlier than standard atrophy measures in some cohorts
  • Ageing: normal CCI ~0.20 at age 20, declining to ~0.15 by age 70

The CCI requires no specialised software — it can be measured from any midsagittal brain MRI, making it practical for routine clinical use.`,
        unit: 'Dimensionless ratio',
        ref: 'Ishii et al., Dement Geriatr Cogn Disord 2008; Guerini et al., Neurology 2019; Naggara et al., Psychiatry Res 2006',
    },
    {
        id: 'midline',
        term: 'Midline Profile',
        category: 'shape',
        short: '200-point curve tracing the centre of the CC from genu to splenium.',
        body: `The midline profile is extracted by computing the geometric centreline of the CC segmentation mask — the line equidistant from the superior and inferior boundaries.

InCCsight samples 200 equidistant points along this midline and records:
  • FA, MD, RD, AD at each point (sampled from the DTI maps)
  • Thickness at each point (distance between upper and lower boundary)

This produces spatial "profile curves" — FA vs. position from genu to splenium — that reveal focal abnormalities invisible in regional averages. For example, a localised demyelinating lesion at the body-splenium junction would appear as a dip at points 130–160 while the overall mean FA remains normal.

The 200-point sampling corresponds approximately to Witelson regions:
  P1 ≈ points 0–40, P2 ≈ 40–80, P3 ≈ 80–120, P4 ≈ 120–160, P5 ≈ 160–200`,
        ref: 'Yeatman et al., PLOS ONE 2012; Lebel et al., NeuroImage 2008',
    },
    {
        id: 'ai',
        term: 'Asymmetry Index (AI)',
        category: 'shape',
        short: 'Ratio comparing anterior vs. posterior FA; detects anterior-posterior imbalance.',
        body: `The Anterior-Posterior Asymmetry Index is computed as:

  AI = (FA_ant − FA_post) / (FA_ant + FA_post)

Where:
  FA_ant = mean(Witelson P1 FA, P2 FA)  [genu + anterior body]
  FA_post = mean(Witelson P4 FA, P5 FA) [posterior body + splenium]

Range: −1 to +1.
  AI > 0  → anterior CC has higher FA than posterior
  AI < 0  → posterior CC has higher FA (more common in healthy adults)
  |AI| ≥ 0.05 → flagged as notable asymmetry

In healthy adults, FA_post slightly exceeds FA_ant (splenium FA is highest), so AI is typically slightly negative (−0.02 to −0.08).

A positive or strongly negative AI indicates anterior-predominant (Parkinson's, frontal TBI) or posterior-predominant (Alzheimer's, visual processing disorders) white matter damage.`,
        unit: 'Dimensionless, range −1 to +1',
        ref: 'Ardekani et al., Hum Brain Mapp 2013; Hofer & Frahm 2006',
    },

    // ── Segmentation Methods ──────────────────────────────────────────────────

    {
        id: 'roqs',
        term: 'ROQS — Robust Optimum-Slope Quantitative Segmentation',
        category: 'methods',
        short: 'Fast 2D segmentation based on eigenvector orientation and FA weighting.',
        body: `ROQS is the primary 2D segmentation algorithm in InCCsight. It works on the midsagittal DTI slice using:

1. Seed selection — finds the voxel with highest weighted FA in the central region
2. Eigenvector criterion — selects voxels where V1 is predominantly left-right (horizontal), matching CC fibre direction
3. Magnification Array (MA) — weights voxels by their FA relative to the seed
4. Post-processing — binary fill and contour extraction

Advantages:
  • Very fast (< 1 second per subject)
  • No GPU required
  • Validated on multi-site data
  • Produces clean contours suitable for morphometry

Limitations:
  • 2D only (misses 3D structure)
  • Can fail in severe atrophy or when CC is displaced

ROQS is the recommended method for studies primarily interested in diffusivity scalars.`,
        ref: 'MICLab-Unicamp, original implementation; validated against manual segmentation',
    },
    {
        id: 'watershed',
        term: 'Watershed Segmentation',
        category: 'methods',
        short: 'Morphological watershed algorithm using FA gradient as the topographic map.',
        body: `The Watershed algorithm treats the FA map as a topographic surface and finds the "basin" corresponding to the corpus callosum by flooding from local maxima (seeds).

Steps:
1. Gaussian smoothing of the FA map
2. Morphological gradient computation (the "terrain")
3. Seed generation via Max-Tree extinction values (or local maxima as fallback)
4. Watershed transform producing labelled regions
5. Filtering: keep only high-FA regions (> 20% of max FA)
6. Selection of the largest wide structure (getTheCC)

Watershed runs in parallel with ROQS and provides an independent segmentation estimate. When both methods agree (similar FA values), confidence in the result is higher.

Watershed is slightly more sensitive to noise than ROQS but can capture slightly different CC boundaries, making the comparison diagnostically informative.`,
        ref: 'Vincent & Soille, IEEE TPAMI 1991; Meyer & Beucher 1990',
    },
    {
        id: 'cnn3d',
        term: 'CNN 3D — Convolutional Neural Network (UNet 3D)',
        category: 'methods',
        short: '3D volumetric segmentation of the CC using a deep learning UNet architecture.',
        body: `The CNN pipeline uses a 3D UNet architecture trained on manually segmented CC volumes. It processes the full 3D DTI volume and produces a binary 3D mask of the corpus callosum.

Architecture:
  • UNet3D (encoder-decoder with skip connections)
  • Framework: PyTorch + MONAI
  • Sliding window inference with overlap
  • Input: FA volume (derived from eigenvalues)
  • Output: probability map → thresholded binary mask

Advantages over 2D methods:
  • Captures full 3D extent of CC (important for volume and fibre density)
  • More robust to partial volume effects
  • Enables 3D surface extraction and volumetric metrics
  • Required for fixel-based and along-tract 3D analysis

Limitations:
  • Requires the model checkpoint (.ckpt) file
  • GPU strongly recommended (CPU inference is slow)
  • Less interpretable than algorithmic methods

The 3D mask is saved as cnnBased.nii.gz in each subject's inCCsight/ folder.`,
        ref: 'Çiçek et al., MICCAI 2016 (3D UNet); Cardoso et al., MONAI 2022',
    },
    {
        id: 'staple',
        term: 'STAPLE',
        category: 'methods',
        short: 'Ensemble fusion algorithm that combines multiple segmentations into one.',
        body: `STAPLE (Simultaneous Truth And Performance Level Estimation) is a statistical algorithm that combines multiple segmentation masks by estimating the probability that each voxel belongs to the structure, accounting for each rater's/method's reliability.

In InCCsight, STAPLE can optionally combine ROQS + Watershed + imported segmentations into a single consensus mask. This is useful when:
  • Individual methods disagree in a region
  • An external manually-segmented reference is available
  • Multi-rater reliability needs to be quantified

STAPLE outputs a probability map (0–1 per voxel), which can be thresholded to produce a binary mask or used directly as a soft segmentation.`,
        ref: 'Warfield et al., IEEE TMI 2004',
    },

    // ── Statistics & QC ───────────────────────────────────────────────────────

    {
        id: 'qc',
        term: 'QC — Quality Check (PASS / FAIL)',
        category: 'stats',
        short: 'Automated shape-based classification of segmentation quality.',
        body: `The QC system in InCCsight uses a trained ensemble classifier (SVM + random forest) to evaluate the shape of the segmented CC and determine whether it is morphologically plausible.

The classifier operates on a shape signature — a compact descriptor of the CC outline at multiple scales and resolutions. It was trained on:
  • Correctly segmented CC (PASS)
  • Failed segmentations (FAIL): wrong structure, partial, over/under-segmented

Output:
  • flag: True = FAIL, False = PASS
  • prob: probability of FAIL (0–1); higher = more likely to be incorrect

FAIL cases should be reviewed manually. Common causes:
  • Very thin or atrophic CC (≤2 mm thick)
  • Extreme head rotation misaligning the midsagittal plane
  • Very low FA (severe disease or poor image quality)
  • Lesion overlapping the CC

The QC probability is shown in the Subject Banner as a percentage.`,
        ref: 'MICLab-Unicamp; Valverde et al., NeuroImage 2017 (shape-based QC concept)',
    },
    {
        id: 'zscore',
        term: 'Z-score (Normative Deviation)',
        category: 'stats',
        short: 'Number of standard deviations a subject deviates from the age-matched normative mean.',
        body: `The z-score is computed as:

  z = (subject_value − normative_mean) / normative_SD

Where the normative mean and SD come from published lifespan reference datasets of healthy adults.

Interpretation:
  |z| < 1.0  → within normal range (green)
  1.0 ≤ |z| < 2.0 → mild deviation (yellow)
  |z| ≥ 2.0  → significant deviation, clinically noteworthy (red)

In the InCCsight Biomarker Profile, z-scores are shown for each Witelson region's FA value. Negative z-scores indicate lower FA than the normative mean — typical in neurodegeneration and demyelination.

The normative values embedded in InCCsight are approximate population means (Lebel et al. 2008; Hofer & Frahm 2006) for healthy adults aged 20–60. They should be interpreted with caution outside this age range.`,
        ref: 'Lebel et al., NeuroImage 2008; Normative Modelling framework: Marquand et al., eLife 2016',
    },
    {
        id: 'normative',
        term: 'Normative Range (Reference Band)',
        category: 'stats',
        short: 'Population reference mean ± 1 SD shown as a shaded band on midline plots.',
        body: `The normative reference band on midline plots represents the expected FA (or MD/RD/AD) profile for a healthy adult population, displayed as:
  • Shaded area: mean ± 1 standard deviation
  • Dotted line: population mean

Approximately 68% of healthy adults have values within ±1 SD. Values outside this band warrant clinical attention.

The reference values are derived from:
  • Lebel et al. (2008) — NeuroImage, N=202 healthy subjects aged 5–30
  • Hofer & Frahm (2006) — NeuroImage, healthy adult values by Witelson region

These are approximate population values for healthy adults (20–60 y). Younger subjects (< 20 y, still myelinating) and older subjects (> 60 y, age-related decline) may systematically fall outside the band.`,
        ref: 'Lebel et al., NeuroImage 2008; Hofer & Frahm 2006',
    },
    {
        id: 'wfa',
        term: 'wFA — Weighted FA',
        category: 'stats',
        short: 'FA map weighted by the primary eigenvector x-component; enhances CC contrast.',
        body: `The weighted FA map (wFA) is defined as:

  wFA = FA × |V1_x|

Where |V1_x| is the absolute value of the x-component of the primary eigenvector.

This weighting enhances voxels where:
  1. FA is high (white matter)
  2. The primary fibre direction is left-right (horizontal)

Because the corpus callosum is the main structure with horizontal fibres in the midsagittal view, wFA provides a high-contrast image where the CC appears bright while other structures (e.g., cingulum, which runs anterior-posterior) are suppressed.

wFA is the primary input to the ROQS seed search and magnification array computation.`,
        ref: 'Mori et al., MRM 1999; InCCsight segmentation pipeline',
    },

    // ── Clinical Context ──────────────────────────────────────────────────────

    {
        id: 'ms',
        term: 'Multiple Sclerosis (MS) — CC Pattern',
        category: 'clinical',
        short: 'Demyelinating lesions predominantly in the CC body; FA ↓ body > splenium.',
        body: `In multiple sclerosis, the corpus callosum body (Witelson P3 and P4) is preferentially affected by demyelinating plaques. The "Dawson's fingers" — periventricular lesions — often extend into the CC body.

DTI signature:
  • FA ↓ predominantly in P3, P4 (body)
  • RD ↑ (demyelination marker — myelin barrier lost)
  • AD relatively preserved (axons intact early)
  • Over time: AD ↓ as Wallerian degeneration follows demyelination

The CC FA correlates with the EDSS disability score and declines continuously in secondary progressive MS even without new lesions, reflecting progressive axonal loss.

The callosal index (CCI) and CC area are used as atrophy biomarkers in clinical trials.`,
        ref: 'Roosendaal et al., Radiology 2009; Pagani et al., AJNR 2005',
    },
    {
        id: 'ad_disease',
        term: 'Alzheimer\'s Disease (AD) — CC Pattern',
        category: 'clinical',
        short: 'Posterior CC (splenium, P5) predominantly affected; reflects parieto-occipital disconnection.',
        body: `Alzheimer's disease causes characteristic posterior-predominant CC changes, reflecting the posterior cortical network degeneration that occurs early in the disease.

DTI signature:
  • FA ↓ primarily P5 (splenium) and P4 (posterior body)
  • MD ↑ throughout but greatest posteriorly
  • The genu may be relatively preserved until later stages

Mechanistic explanation: the splenium connects parietal and occipital cortices, which show early amyloid deposition and neuronal loss in AD. As these cortical regions atrophy, the callosal fibres projecting to them undergo Wallerian degeneration — detectable by DTI before MRI atrophy is visible.

The splenium FA change in mild cognitive impairment (MCI) can predict conversion to AD 1–2 years before clinical diagnosis.`,
        ref: 'Salat et al., Cereb Cortex 2010; Nir et al., Hum Brain Mapp 2013',
    },
    {
        id: 'als',
        term: 'ALS — CC Pattern',
        category: 'clinical',
        short: 'Posterior body (P4) affected via corticospinal tract degeneration.',
        body: `Amyotrophic lateral sclerosis (ALS) causes upper motor neuron degeneration in the corticospinal tracts, which pass through the posterior body of the CC.

DTI signature:
  • FA ↓ predominantly in P4 (posterior body) corresponding to the hand motor area
  • AD ↓ (axonal loss — upper motor neuron degeneration)
  • Changes may extend to P3 and P5 in bulbar-onset ALS

The CC DTI changes in ALS precede clinical motor signs in familial ALS mutation carriers and correlate with disease progression rate. Tracking CC FA in P4 is an emerging progression biomarker in clinical trials.`,
        ref: 'Sach et al., Brain 2004; Ciccarelli et al., Neurology 2009',
    },
    {
        id: 'pd_disease',
        term: 'Parkinson\'s Disease (PD) — CC Pattern',
        category: 'clinical',
        short: 'Anterior CC (genu, P1–P2) affected via frontostriatal circuit disruption.',
        body: `Parkinson's disease preferentially affects the anterior corpus callosum, reflecting frontal lobe involvement via nigrostriatal-thalamocortical circuits.

DTI signature:
  • FA ↓ primarily in P1 (genu) and P2 (anterior body)
  • Changes reflect disruption of prefrontal-supplementary motor connections
  • MD ↑ anteriorly
  • Posterior CC (P5) relatively preserved in early PD

Longitudinal studies show progressive CC FA decline in PD correlating with akinetic-rigid symptom severity. The anterior AI index (FA_ant < FA_post, i.e., positive AI becomes more negative over time) can track disease progression.`,
        ref: 'Agosta et al., Mov Disord 2011; Lenfeldt et al., J Neurol 2013',
    },
    {
        id: 'tbi',
        term: 'TBI — CC Pattern',
        category: 'clinical',
        short: 'Genu (P1) and diffuse body affected by axonal shear injury.',
        body: `Traumatic brain injury causes diffuse axonal injury (DAI) through rotational acceleration-deceleration forces. The CC is the most commonly injured white matter structure in moderate-to-severe TBI.

DTI signature:
  • FA ↓ predominantly P1 (genu is mechanically vulnerable due to its curvature)
  • Diffuse FA reduction in all regions in severe TBI
  • AD ↓ (axonal shear) with RD ↑ (secondary demyelination)
  • Changes may be bilateral

Even in mild TBI (concussion), FA in the CC genu can be abnormal when conventional MRI is normal — DTI is more sensitive. The CC FA at 1 month post-injury predicts long-term cognitive outcome and symptom persistence.`,
        ref: 'Niogi et al., AJNR 2008; Kinnunen et al., Brain 2011',
    },
    {
        id: 'nph',
        term: 'Normal Pressure Hydrocephalus (NPH) — CC Pattern',
        category: 'clinical',
        short: 'CC compressed and thinned by enlarged ventricles; CCI is a key diagnostic criterion.',
        body: `Normal pressure hydrocephalus causes the corpus callosum to be stretched and compressed superiorly by enlarged lateral ventricles, resulting in:

  • Upward displacement and thinning of the CC body
  • Reduced CC area and CCI
  • FA ↓ throughout (compression + stretching distort fibre geometry)
  • After ventriculoperitoneal shunting, CCI and FA may partially recover

The CCI < 0.18 on midsagittal MRI is a widely used diagnostic criterion for NPH in clinical guidelines. InCCsight's CCI metric directly supports this assessment.

The combination of ventriculomegaly, gait disturbance, cognitive impairment and urinary incontinence (Hakim's triad) with CC thinning is diagnostically characteristic.`,
        ref: 'Ishii et al., Dement Geriatr Cogn Disord 2008; Relkin et al., Neurosurgery 2005',
    },
]
