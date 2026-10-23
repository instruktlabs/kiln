/**
 * The Holodeck scene packs: which scene each pack mirrors, and how each selected Kiln asset is named and grouped in
 * the gallery. Exact revisions and hashes are frozen separately in `packs/holodeck/selection.json`
 * (scripts/select-holodeck.mjs); the walkable scene addresses live in `src/data/holodeck-worlds.json`.
 */

export const HOLODECK_ID = 'holodeck';
export const HOLODECK_RELEASE = 'holodeck-20261022-02';

export const HOLODECK_PACKS = [
  {
    id: 'holodeck-tidemark',
    scene: 'tidemark',
    name: 'Tidemark Island',
    description: 'A quiet tropical island with open beaches, layered jungle, a thatched shelter and moving wildlife, built in Holodeck around the Cove.',
    expectedAssets: 23,
  },
  {
    id: 'holodeck-courtyard',
    scene: 'courtyard',
    name: 'Courtyard',
    description: 'A walled limestone plaza beside the Cove, with a tiered fountain, three statues, planted beds, benches and lanterns.',
    expectedAssets: 32,
  },
  {
    id: 'holodeck-cove',
    scene: 'cove',
    name: 'Cove',
    description: 'Holodeck’s starter Cove after its quality pass: a sheltered platform with a linen canopy, cushions, a hearth table, fern planters, a rug, a lamp and a mood board.',
    expectedAssets: 8,
  },
];

/** Scenes whose packs are not built yet. Their pages say so; nothing is staged for them. */
export const HOLODECK_PLANNED = [
  {
    id: 'holodeck-crescent-cove',
    scene: 'crescent-cove',
    name: 'Crescent Cove',
    description: 'A tropical island that is still being built. Its assets join the gallery when the island is finished.',
  },
];

const COVE = 'Cove modules';
const ISLAND_PLANTS = 'Island plants';
const ISLAND_SHELTER = 'Island shelter and shore';
const ISLAND_LIFE = 'Island wildlife and residents';
const PAVING = 'Courtyard paving and walls';
const FEATURES = 'Courtyard fountain and statues';
const PLANTING = 'Courtyard planting';
const FURNITURE = 'Courtyard furniture and lighting';

const coveModules = {
  structure: ['Cove platform and seating shell', 'The circular platform and curved seating shell that hold the rest of the Cove.'],
  canopy: ['Cove linen canopy', 'A linen canopy on timber supports that shades the Cove platform.'],
  seating: ['Cove cushions and throws', 'Fitted cushions and upright throws for the curved seating shell.'],
  hearth: ['Cove hearth table', 'The creation table with its glowing ember core at the centre of the Cove.'],
  planting: ['Cove fern planters', 'Fern planters for the platform rim. The fronds bend in Holodeck’s wind.'],
  rug: ['Cove woven rug', 'A woven floor rug for the platform.'],
  lamp: ['Cove ember lamp', 'A low lamp with a warm ember glow.'],
  moodboard: ['Cove mood board', 'A movable timber board for pinning references.'],
};

/**
 * Gallery presentation by slug. Packs deliver final versions only: every scene places the Cove modules at their
 * quality-pass revision, so each module has one page shared by the scenes that place it.
 */
export const HOLODECK_ASSETS = {
  ...Object.fromEntries(Object.entries(coveModules).map(([id, [name, description]]) => [`cove-${id}`, { name, description: `${description} Quality-pass revision with procedural texture maps, derived normals and packed roughness.`, category: COVE }])),
  'island-palm': { name: 'Coconut palm', category: ISLAND_PLANTS, description: 'A curved coconut palm with an 18-frond rosette of upright, arching and drooping fronds.' },
  'island-shrub': { name: 'Coastal shrub', category: ISLAND_PLANTS, description: 'A rounded coastal shrub for beach margins and clearings.' },
  'island-grass': { name: 'Dune grass', category: ISLAND_PLANTS, description: 'A clump of coastal grass for dunes and sandy paths.' },
  'jungle-sapling': { name: 'Jungle sapling', category: ISLAND_PLANTS, description: 'A young jungle tree whose leaf blades bend in Holodeck’s wind.' },
  'jungle-fern': { name: 'Arched jungle fern', category: ISLAND_PLANTS, description: 'An arching fern for the jungle floor. Its fronds bend in Holodeck’s wind.' },
  'jungle-understory': { name: 'Jungle understory plant', category: ISLAND_PLANTS, description: 'A broad-leaved understory plant for layered jungle.' },
  'jungle-groundcover': { name: 'Jungle groundcover', category: ISLAND_PLANTS, description: 'Low leafy groundcover that fills the jungle floor.' },
  'island-shore': { name: 'Shore rocks and driftwood', category: ISLAND_SHELTER, description: 'Weathered rocks and a driftwood log for the beach edge.' },
  'island-hut-frame': { name: 'Shelter frame', category: ISLAND_SHELTER, description: 'The timber frame and raised floor of the island’s open shelter.' },
  'island-hut-roof': { name: 'Thatched roof', category: ISLAND_SHELTER, description: 'Layered thatch with solid thickness and ragged fibre eaves, sized for the shelter frame.' },
  'island-hut-furnishings': { name: 'Shelter furnishings', category: ISLAND_SHELTER, description: 'A low timber table and woven baskets for the island shelter.' },
  'island-resident': { name: 'Island resident', category: ISLAND_LIFE, description: 'A figure with named joints. Holodeck’s gait module walks it around the island.' },
  'island-bird': { name: 'Shore bird', category: ISLAND_LIFE, description: 'A wading bird with named joints for Holodeck’s gait module.' },
  'island-crab': { name: 'Beach crab', category: ISLAND_LIFE, description: 'A crab with named leg joints for Holodeck’s gait module.' },
  'coastal-flybird': { name: 'Seabird', category: ISLAND_LIFE, description: 'A seabird with named wing joints that flies over the island.' },
  'pave-field-a': { name: 'Ashlar paving module', category: PAVING, description: 'A 4 m limestone ashlar paving module.' },
  'pave-field-b': { name: 'Diagonal paving module', category: PAVING, description: 'A 4 m diagonal-set limestone paving module with a travertine border.' },
  'pave-curb': { name: 'Bed curb', category: PAVING, description: 'A 4 m bullnosed limestone curb for planted beds.' },
  'pave-curb-corner': { name: 'Curb corner', category: PAVING, description: 'A chamfered limestone corner block for the bed curbs.' },
  'pave-step': { name: 'Step band', category: PAVING, description: 'A 4 m limestone step band with a half-round nosing.' },
  'wall-segment': { name: 'Garden wall module', category: PAVING, description: 'A 4 m coursed ashlar wall module with a travertine plinth and ridged coping.' },
  'wall-pier': { name: 'Corner pier', category: PAVING, description: 'A quoined corner pier with a moulded cap and ball finial.' },
  'gate-pier': { name: 'Gate pier', category: PAVING, description: 'A panelled gateway pier with a moulded cap and pineapple finial.' },
  'plaza-fountain': { name: 'Tiered plaza fountain', category: FEATURES, description: 'A tiered, carved limestone fountain with an octagonal panelled basin and a fluted pedestal.' },
  'fountain-cascade': { name: 'Fountain cascade', category: FEATURES, description: 'Falling-water sheets for the plaza fountain, which Holodeck turns slowly.' },
  'statue-figure': { name: 'Water-bearer statue', category: FEATURES, description: 'A draped water-bearer carrying a hydria, on a moulded limestone plinth.' },
  'statue-monolith': { name: 'Twisted monolith', category: FEATURES, description: 'A twisted, grooved travertine monolith with a pierced opening, on a stepped plinth.' },
  'statue-bronze': { name: 'Bronze trefoil knot', category: FEATURES, description: 'A verdigris bronze trefoil knot on a limestone plinth.' },
  'tree-plane': { name: 'London plane tree', category: PLANTING, description: 'A plane shade tree with mottled bark and a clumpy palmate canopy.' },
  'tree-cypress': { name: 'Italian cypress', category: PLANTING, description: 'An Italian cypress with a dense, flame-shaped crown.' },
  'tree-olive': { name: 'Olive tree', category: PLANTING, description: 'A gnarled olive with a split trunk and a silvery canopy.' },
  'shrub-box': { name: 'Boxwood ball', category: PLANTING, description: 'A clipped boxwood ball shrub.' },
  'plant-lavender': { name: 'Lavender clump', category: PLANTING, description: 'A lavender clump with purple flower spikes.' },
  'planter-square': { name: 'Square topiary planter', category: PLANTING, description: 'A panelled limestone planter with a clipped topiary ball.' },
  'planter-urn': { name: 'Urn planter', category: PLANTING, description: 'A gadrooned stone urn with trailing plants and flowers.' },
  'bench-stone': { name: 'Stone garden bench', category: FURNITURE, description: 'A carved limestone bench on scroll supports.' },
  'bench-park': { name: 'Park bench', category: FURNITURE, description: 'An oak-slat bench with wrought-iron scroll-arm frames.' },
  'lamp-post': { name: 'Lantern post', category: FURNITURE, description: 'A fluted iron post with a warm glazed lantern.' },
  'lamp-bollard': { name: 'Path bollard', category: FURNITURE, description: 'A stone and iron bollard with a warm glow band.' },
};

/** A world placement id to its gallery slug. Every scene's Cove module shares the Cove pack's slug. */
export function holodeckSlug(pack, worldAssetId) {
  const cove = Object.hasOwn(coveModules, worldAssetId);
  if (pack === 'holodeck-cove' && !cove) throw new Error(`Unknown Cove module ${worldAssetId}`);
  return cove ? `cove-${worldAssetId}` : worldAssetId;
}
