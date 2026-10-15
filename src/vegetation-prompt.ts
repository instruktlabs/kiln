import type { AssetIntentV1, VegetationSubtype } from './contracts';

export const VEGETATION_REJECTED_HELPER_NAMES = Object.freeze([
  'taperedBranchGeo',
  'createBranchAttachment',
  'createCanopyScaffold',
  'createLeafDistribution',
  'createFrondScaffold',
  'proceduralBarkMap',
  'proceduralLeafMap',
] as const);

interface VegetationSubtypeRecipeV1 {
  marker: string;
  guidance: string;
}

/**
 * Provider-independent recipes constrained to the currently executable primitive/material surface.
 * The map is never appended wholesale: {@link vegetationSubtypePromptContext} selects one entry.
 */
export const VEGETATION_SUBTYPE_RECIPES_V1: Readonly<
  Record<VegetationSubtype, VegetationSubtypeRecipeV1>
> = Object.freeze({
  tree: {
    marker: 'RECIPE_TREE_V1',
    guidance:
      'Use cylinderGeo/cylinderOnAxis or beamBetween for a tapered-looking trunk/branch composition, sphereGeo or foliageCardGeo for several attached foliage masses, and stamp vegetation.trunk, vegetation.branch.*, vegetation.foliage, and vegetation.canopy.cluster.* roles.',
  },
  conifer: {
    marker: 'RECIPE_CONIFER_V1',
    guidance:
      'Build a narrow central cylinderGeo trunk with successively shorter branch tiers. Compose a tapered silhouette from overlapping coneGeo, sphereGeo, or foliageCardGeo masses; vary tier rotation and radius without perfect lockstep.',
  },
  shrub: {
    marker: 'RECIPE_SHRUB_V1',
    guidance:
      'Use several short cylinderOnAxis or beamBetween stems rooted at one grounded base, then attach irregular overlapping sphereGeo/card clusters. Keep the center filled while preserving an uneven outer contour unless formal topiary is explicit.',
  },
  grass: {
    marker: 'RECIPE_GRASS_V1',
    guidance:
      'Build individual blades from narrow planeGeo or foliageCardGeo parts pivoted at Y=0. Fan heights and lean angles deterministically, keep the tuft contact compact, and avoid adding an unrequested terrain disk or grass skirt.',
  },
  'frond/palm': {
    marker: 'RECIPE_FROND_PALM_V1',
    guidance:
      'Use a cylinderGeo trunk or stem and compose each frond from curveToMesh, narrow planeGeo, or multiple foliageCardGeo leaflets. Embed every frond base into the crown and introduce an explicit outward arc and terminal droop using current primitives.',
  },
  vine: {
    marker: 'RECIPE_VINE_V1',
    guidance:
      'Trace the vine with curveToMesh or short cylinderOnAxis segments and attach sparse foliageCardGeo/sphereGeo leaves along the path. Preserve the requested support relationship; do not invent a wall, trellis, pot, or terrain prop.',
  },
  'crop/flower': {
    marker: 'RECIPE_CROP_FLOWER_V1',
    guidance:
      'Use one or more slender cylinderGeo stems, attached planeGeo/foliageCardGeo leaves, and a distinct sphereGeo/coneGeo petal, seed, or flower-head assembly. Keep the requested plant count and grounded contacts explicit.',
  },
  succulent: {
    marker: 'RECIPE_SUCCULENT_V1',
    guidance:
      'Compose thick leaves or pads from scaled sphereGeo, capsuleGeo, or rounded boxGeo parts around a grounded center. Vary vertical reach and azimuth modestly while keeping each pad visibly joined to the base.',
  },
  cactus: {
    marker: 'RECIPE_CACTUS_V1',
    guidance:
      'Build the trunk as a ribbed star-profile loft: await extrudeProfile(starOutline, { axis: "y", depth, taper, divisions }) with 6 to 12 rounded ribs (alternate outer and inner radii), seated at Y=0. Sweep each arm with pipeAlongPath through an elbow (out from the trunk, then up; bendRadius about one arm radius), embedded into the trunk. Seat spine clusters as small foliageCardGeo or crossedQuadsGeo cards on the rib crests, a few per rib, and keep them subordinate to the silhouette. Deliver explicit LOD tiers with defineLod: LOD0 full ribs, arms and spines; LOD1 fewer ribs and no spines; a last crossedQuadsGeo card tier with impostor: true.',
  },
  fungus: {
    marker: 'RECIPE_FUNGUS_V1',
    guidance:
      'Build the stipe from cylinderGeo/capsuleGeo and the cap from sphereGeo, dome-like sphere segments, or coneGeo. Seat the stipe at Y=0 and keep gills, spots, or secondary caps subordinate to the requested fungus.',
  },
  aquatic: {
    marker: 'RECIPE_AQUATIC_V1',
    guidance:
      'Use curveToMesh/cylinderOnAxis stems plus planeGeo, foliageCardGeo, or flattened sphereGeo leaves. Treat the asset-local origin as the declared anchor; do not author a water plane, pond rim, rocks, or soil unless requested.',
  },
  'bare/dead': {
    marker: 'RECIPE_BARE_DEAD_V1',
    guidance:
      'Use cylinderGeo/cylinderOnAxis, beamBetween, or curveToMesh for a visibly tapered trunk and irregular branch graph. Omit foliage intentionally, preserve branch attachment, and avoid symmetric radial tiers.',
  },
  custom: {
    marker: 'RECIPE_CUSTOM_VEGETATION_V1',
    guidance:
      'Use only current reported primitives and portable material recipes. Declare support, foliage, contact, and any custom semantic roles explicitly so generic growth, attachment, repetition, scope, and material measurements remain available.',
  },
});

export function vegetationSubtypePromptContext(intent: AssetIntentV1): string {
  if (intent.category !== 'vegetation' || !intent.vegetation) return '';
  const vegetation = intent.vegetation;
  const recipe = VEGETATION_SUBTYPE_RECIPES_V1[vegetation.subtype];
  const state =
    vegetation.growthState === 'bare'
      ? 'Bare growth is intentional; do not add foliage to satisfy a generic canopy pattern.'
      : vegetation.growthState === 'sparse'
        ? 'Keep the requested sparse state while retaining attached, readable clusters.'
        : 'Build the requested lush state from overlapping, attached masses with restrained variation.';
  const material =
    intent.material.mode === 'flatOptimized'
      ? 'Use one coherent foliage value role for intentional consolidation.'
      : 'Use two to six restrained foliage value roles and keep material coherence separate from structural checks.';
  return [
    `## Vegetation subtype recipe (${recipe.marker})`,
    `Apply only the ${vegetation.subtype} recipe; do not append recipes for other growth forms.`,
    recipe.guidance,
    state,
    material,
    'Use current executable APIs only. No branch, canopy, leaf-distribution, frond, procedural-map, or vegetation-specific LOD helper has been promoted; defineLod is the general LOD helper.',
  ].join('\n');
}
