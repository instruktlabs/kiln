import {
  BIPED_RIG_PRESET_V1,
  CHARACTER_BODY_PLANS,
  QUADRUPED_RIG_PRESET_V1,
  createCharacterRigGraphV1,
  type CharacterBodyPlan,
  type CharacterRigGraphV1,
} from '../character';
import { MATERIAL_RECIPE_IDS, MATERIAL_RECIPE_LIBRARY_V1 } from '../material-recipes';
import type { DiscoveryEntry } from './catalog-schema';
import { articulationRecipes } from './articulation-recipes';
import { constructionRecipes } from './construction-recipes';
import { surfaceRecipes } from './surface-recipes';
import { structuralRecipes } from './structural-recipes';

type RecipeEntry = Extract<DiscoveryEntry, { kind: 'recipe' }>;

const materialWords: Record<string, string[]> = {
  bark: ['tree trunk', 'woody stem'],
  leaf: ['foliage', 'leaves', 'alpha cutout'],
  wood: ['wooden', 'timber', 'grain', 'plank'],
  stone: ['rock', 'masonry', 'mineral'],
  rubber: ['tire', 'tyre', 'grip', 'seal'],
  'painted-metal': ['paint', 'coating', 'vehicle panel'],
  cloth: ['fabric', 'woven', 'textile'],
  skin: ['flesh', 'organic surface'],
  glass: ['transparent', 'window', 'translucent'],
  emissive: ['glowing', 'lamp', 'light source'],
};
const materialLimits: Record<string, string> = {
  leaf: 'MASK mode alone does not create a cutout. Supply alpha data and UVs for shaped leaf cards.',
  glass:
    'Core glTF BLEND approximates transparency; this is not refraction or physical transmission. Sorting depends on the destination renderer.',
  skin: 'This baseline has no subsurface scattering.',
  emissive:
    'Emissive color does not create a scene light or guarantee bloom in the destination renderer.',
};

const materialRecipes: RecipeEntry[] = MATERIAL_RECIPE_IDS.map((id) => {
  const descriptor = MATERIAL_RECIPE_LIBRARY_V1[id];
  const slug = id.split('.').slice(2, -1).join('-');
  return {
    version: 'kiln.catalog-entry.v1',
    id: `recipe:material-${slug}-v1`,
    kind: 'recipe',
    name: `${descriptor.name} material baseline`,
    summary: `${descriptor.description} Call await materialRecipe(${JSON.stringify(id)}). Optional editable surface recipe; the example is a material swatch, not a finished asset.`,
    family: 'materials',
    tags: ['material', 'pbr', 'surface', slug],
    aliases: materialWords[slug] ?? [],
    intents: [`apply ${descriptor.name.toLowerCase()} appearance to any asset`],
    stability: 'stable',
    related: [{ id: 'operation:materialRecipe', relation: 'prerequisite' }],
    references: ['src/material-recipes.ts', 'docs/geometry.md'],
    limitations: [
      'Defaults contain no texture resources or geometric detail. Material naming alone does not establish realism.',
      'Uses core glTF metallic-roughness fields; visually check the actual destination importer and renderer.',
      ...(materialLimits[slug] ? [materialLimits[slug]!] : []),
    ],
    recipe: {
      prerequisites: ['operation:materialRecipe', 'operation:createRoot', 'operation:createPart'],
      steps: [
        `Await materialRecipe(${JSON.stringify(id)}) in async build().`,
        'Attach the returned material to the intended parts; reuse or create separate instances according to required surface variation.',
        'Render the exported asset and inspect material fidelity before finishing.',
      ],
      example: `const meta = { name: ${JSON.stringify(`${descriptor.name}Swatch`)} };
async function build() {
  const root = createRoot(meta.name);
  const surface = await materialRecipe(${JSON.stringify(id)});
  createPart('Swatch', sphereGeo(0.5), surface, { parent: root, position: [0, 0.5, 0] });
  return root;
}`,
      adaptations: [
        `Allowed overrides: ${descriptor.allowedOverrides.join(', ')}. Pass them as the second materialRecipe argument.`,
        `Baseline portable fields: ${JSON.stringify(descriptor.defaults)}. These are starting values, not asset requirements.`,
        'If using textures, retrieve the current approved resources and helper contract; author UVs and inspect texture scale on the intended geometry.',
      ],
      checks: [
        'Inspect glTF material fields and texture bindings in the exported artifact.',
        'Use a PBR-capable view and check viewFidelity; geometry-flat CPU views cannot establish material appearance.',
        'Check silhouette and dimensions separately from surface appearance.',
      ],
    },
  };
});

const rigWords: Record<CharacterBodyPlan, string[]> = {
  biped: ['two legged', 'humanoid', 'person', 'robot'],
  quadruped: ['four legged creature', 'animal', 'dog', 'horse'],
  avian: ['bird', 'wings', 'winged creature'],
  serpentine: ['snake', 'tail', 'worm', 'axial chain'],
  'multi-limb': ['many legs', 'spider', 'branched tentacles'],
  wheeled: ['wheeled robot', 'mobile character'],
  custom: ['custom skeleton', 'unusual creature', 'articulated mechanism'],
};
const rigGuidance: Record<CharacterBodyPlan, string> = {
  biped:
    'The supplied graph has hips, spine, head, paired arm chains and paired leg chains. Adapt the rest offsets and contact roles to the intended proportions.',
  quadruped:
    'The supplied graph has an axial hips/spine/neck/head chain and four leg chains. Adapt limb lengths and paw contacts to the creature.',
  avian:
    'Extend the example torso/wing branch with an axial neck/head graph, paired wing chains and any requested leg/contact chains.',
  serpentine:
    'Extend the continuous axial chain with explicit bend axes and requested contact nodes; no limb graph is implied.',
  'multi-limb':
    'Expand each requested branch with distinct semantic roles, explicit parent edges and contact/end-effector labels.',
  wheeled:
    'Build the character core and articulated appendages as distinct roles; discover wheel assemblies separately for wheel geometry and locomotion.',
  custom:
    'Design the graph for the brief, preserving explicit parent edges and local frames without inheriting a different body plan.',
};

function rigGraph(plan: CharacterBodyPlan): CharacterRigGraphV1 {
  if (plan === 'biped') return BIPED_RIG_PRESET_V1;
  if (plan === 'quadruped') return QUADRUPED_RIG_PRESET_V1;
  // These five are deliberately partial teaching scaffolds, not additional presets.
  const tip = plan === 'avian' ? 'wing.tip' : plan === 'serpentine' ? 'tail.tip' : 'appendage.tip';
  return createCharacterRigGraphV1({
    bodyPlan: plan,
    joints: [
      { role: 'core', rest: { translation: [0, 1, 0] } },
      { role: tip, parentRole: 'core', rest: { translation: [0.5, 0, 0] }, endEffector: true },
    ],
  });
}

function rigExample(graph: CharacterRigGraphV1): string {
  const joints = graph.joints.map((joint) => ({
    role: joint.role,
    ...(joint.parentRole ? { parentRole: joint.parentRole } : {}),
    offset: joint.rest.translation,
    restRotation: joint.rest.rotation,
    restScale: joint.rest.scale,
    aliases: joint.aliases,
    side: joint.side,
    localForwardAxis: joint.localForwardAxis,
    localBendAxis: joint.localBendAxis,
    endEffector: joint.endEffector,
    contact: joint.contact,
  }));
  return `const meta = { name: ${JSON.stringify(`${graph.bodyPlan}RigScaffold`)} };
function build() {
  const root = createRoot(meta.name);
  const specs = ${JSON.stringify(joints)};
  const nodes = new Map();
  const descriptors = [];
  for (const spec of specs) {
    const chain = createJointChain('Scaffold', [spec], {
      parent: spec.parentRole ? nodes.get(spec.parentRole) : root,
      parentRole: spec.parentRole
    });
    nodes.set(spec.role, chain.root);
    descriptors.push(...chain.descriptors);
  }
  root.userData.kilnCharacterRig = { schemaVersion: 1, bodyPlan: ${JSON.stringify(graph.bodyPlan)}, joints: descriptors };
  // A visible marker only. Attach the actual asset geometry to its intended joints.
  createPart('CoreMarker', boxGeo(0.25, 0.25, 0.25), gameMaterial('#718096'), { parent: nodes.get(specs[0].role) });
  return root;
}`;
}

const rigRecipes: RecipeEntry[] = CHARACTER_BODY_PLANS.map((plan) => {
  const preset = plan === 'biped' || plan === 'quadruped';
  return {
    version: 'kiln.catalog-entry.v1',
    id: `recipe:rig-${plan}-v1`,
    kind: 'recipe',
    name: `${plan} rig guidance`,
    summary: `Optional ${plan} semantic rig ${preset ? 'preset graph' : 'guidance with a partial scaffold'}. ${rigGuidance[plan]}`,
    family: 'rigs',
    tags: ['rig', 'skeleton', 'joint', plan],
    aliases: rigWords[plan],
    intents: [`articulate a ${plan} asset`, 'attach geometry to semantic joint pivots'],
    stability: 'experimental',
    related: [{ id: 'assembly:createJointChain', relation: 'prerequisite' }],
    references: ['src/character.ts', 'docs/geometry.md'],
    limitations: [
      preset
        ? 'The preset supplies semantic joints only, not anatomy, skinning or finished asset geometry.'
        : 'Only a two-node teaching scaffold is supplied. This is not a complete body-plan preset.',
      'No clips, inverse kinematics, gait or contact solver are generated. Visual and motion qualification are separate.',
      'Selecting a recipe does not create or change host requirements. Joint graph metadata is descriptive evidence, not policy.',
    ],
    recipe: {
      prerequisites: ['assembly:createJointChain', 'operation:createRoot', 'operation:createPart'],
      steps: [
        rigGuidance[plan],
        'Create parents before children with unique roles; attach each chain under the actual parent node and retain its parentRole.',
        'Attach asset geometry to the intended pivots and declare the collected descriptors in root.userData.kilnCharacterRig.',
        'Add requested clips targeting unique Joint_* node names, then render and inspect rest and animated poses.',
      ],
      example: rigExample(rigGraph(plan)),
      adaptations: [
        'Offsets and transforms are parent-local. Update rest offsets, frames, geometry and contact positions together when changing proportions.',
        'Combine rigs, structures, surfaces and mechanisms freely; a body-plan label does not select an asset category.',
        'Contact roles must match the intended ground plane. Adapt the sample +X forward and +Y up conventions explicitly if the host requires a different frame.',
      ],
      checks: [
        'Verify every graph role resolves to exactly one node and each parentRole matches the actual hierarchy.',
        'Check GLB joint extras and animation targets after export; source metadata alone is insufficient.',
        'Review contact, attachment, silhouette and motion views. Structural QA does not establish a natural gait or skin deformation.',
      ],
    },
  };
});

export const discoveryRecipes: readonly RecipeEntry[] = [
  ...materialRecipes,
  ...rigRecipes,
  ...constructionRecipes,
  ...surfaceRecipes,
  ...structuralRecipes,
  ...articulationRecipes,
];
