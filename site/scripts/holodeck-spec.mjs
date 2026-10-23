/**
 * The Holodeck scene packs: which scene each pack mirrors, and how each selected Kiln asset is named and grouped in
 * the gallery. Exact revisions and hashes are frozen separately in `packs/holodeck/selection.json`
 * (scripts/select-holodeck.mjs); the walkable scene addresses live in `src/data/holodeck-worlds.json`.
 */

export const HOLODECK_ID = 'holodeck';
export const HOLODECK_RELEASE = 'holodeck-20261023-01';

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
  {
    id: 'holodeck-crescent-cove',
    scene: 'crescent-cove',
    name: 'Crescent Cove',
    description: 'A crescent of palm-lined beach around a turquoise lagoon, with seagrass meadows, coral heads, a jetty and a rocky headland, built in Holodeck around the Cove.',
    expectedAssets: 49,
  },
];

/** Scenes whose packs are not built yet. Their pages say so; nothing is staged for them. */
export const HOLODECK_PLANNED = [];

const COVE = 'Cove modules';
const ISLAND_PLANTS = 'Island plants';
const ISLAND_SHELTER = 'Island shelter and shore';
const ISLAND_LIFE = 'Island wildlife and residents';
const PAVING = 'Courtyard paving and walls';
const FEATURES = 'Courtyard fountain and statues';
const PLANTING = 'Courtyard planting';
const FURNITURE = 'Courtyard furniture and lighting';
const CRESCENT_PALMS = 'Crescent Cove palms and beach debris';
const CRESCENT_PLANTS = 'Crescent Cove undergrowth';
const CRESCENT_ROCKS = 'Crescent Cove rocks and cliffs';
const CRESCENT_REEF = 'Crescent Cove reef';
const CRESCENT_BUILT = 'Crescent Cove shelter and jetty';

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
 * Gallery presentation by slug. Packs deliver final versions only: every scene lists the Cove modules at their
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
  'crescent-palm-tall': { name: 'Tall coconut palm', category: CRESCENT_PALMS, description: 'A tall coconut palm. Its four frond groups share one mesh and one banded texture.' },
  'crescent-palm-lean': { name: 'Leaning coconut palm', category: CRESCENT_PALMS, description: 'A coconut palm leaning out over the sand, with merged frond groups and one banded texture.' },
  'crescent-palm-arch': { name: 'Arching coconut palm', category: CRESCENT_PALMS, description: 'A coconut palm with an arched trunk, with merged frond groups and one banded texture.' },
  'crescent-palm-young': { name: 'Young coconut palm', category: CRESCENT_PALMS, description: 'A young coconut palm, with merged frond groups and one banded texture.' },
  'crescent-debris-coconuts': { name: 'Coconuts and husks', category: CRESCENT_PALMS, description: 'Fallen coconuts under a palm: four husked nuts, one sprouting, and a split husk showing the pale fibre.' },
  'crescent-debris-driftwood-log': { name: 'Driftwood log', category: CRESCENT_PALMS, description: 'A bleached driftwood log with a gnarled root plate, half sunk in the sand.' },
  'crescent-debris-driftwood-pile': { name: 'Driftwood pile', category: CRESCENT_PALMS, description: 'A tangle of seven bleached driftwood branches and side twigs.' },
  'crescent-debris-fronds': { name: 'Fallen palm fronds', category: CRESCENT_PALMS, description: 'Two dry coconut fronds crossing on the ground, with broken and missing leaflets.' },
  'crescent-debris-shells': { name: 'Shells and wrack', category: CRESCENT_PALMS, description: 'A strand-line scatter of shells, coral rubble and seaweed wrack.' },
  'crescent-plant-alocasia': { name: 'Alocasia clump', category: CRESCENT_PLANTS, description: 'An elephant-ear clump of nine arrow-shaped blades on curved stems. It moves in Holodeck’s wind.' },
  'crescent-plant-grass-patch': { name: 'Strand grass patch', category: CRESCENT_PLANTS, description: 'A sparse patch of strand grass tufts for the upper sand. It moves in Holodeck’s wind.' },
  'crescent-plant-grass-tuft': { name: 'Strand grass tuft', category: CRESCENT_PLANTS, description: 'A single strand grass tuft of green, straw and dry blades. It moves in Holodeck’s wind.' },
  'crescent-plant-hibiscus': { name: 'Beach hibiscus thicket', category: CRESCENT_PLANTS, description: 'Leaning woody stems with hanging heart leaves and yellow cup flowers. It moves in Holodeck’s wind.' },
  'crescent-plant-naupaka': { name: 'Naupaka mound', category: CRESCENT_PLANTS, description: 'A beach-hedge mound of pale spoon-leaf rosettes with white half-flowers. It moves in Holodeck’s wind.' },
  'crescent-plant-nest-fern': { name: 'Bird’s-nest fern', category: CRESCENT_PLANTS, description: 'Upright and arching strap fronds rising from a low brown nest. It moves in Holodeck’s wind.' },
  'crescent-plant-purslane': { name: 'Sea purslane mat', category: CRESCENT_PLANTS, description: 'Red runners with fleshy leaf pairs and small pink flowers, for headlands and the upper beach.' },
  'crescent-plant-scrub': { name: 'Headland scrub cushion', category: CRESCENT_PLANTS, description: 'Low wind-pruned scrub with narrow grey-green leaves and a few yellow flowers.' },
  'crescent-plant-sword-fern': { name: 'Sword fern', category: CRESCENT_PLANTS, description: 'A clump of thirteen arching pinnate fronds. It moves in Holodeck’s wind.' },
  'crescent-plant-vine-fringe': { name: 'Morning glory fringe', category: CRESCENT_PLANTS, description: 'Beach morning glory runners trailing from the back of the sand toward the sea, with pink flowers.' },
  'crescent-plant-vine-mat': { name: 'Morning glory mat', category: CRESCENT_PLANTS, description: 'A mat of red runners with goat’s-foot leaves and pink trumpet flowers on the sand.' },
  'crescent-rock-beach-a': { name: 'Notched beach slab', category: CRESCENT_ROCKS, description: 'A low waterline limestone slab with a flat dry top, a wave-cut notch and a darker wet base.' },
  'crescent-rock-beach-b': { name: 'Waterline rock cluster', category: CRESCENT_ROCKS, description: 'Three faceted waterline limestone rocks with a darker wet base.' },
  'crescent-rock-boulder-a': { name: 'Limestone boulder', category: CRESCENT_ROCKS, description: 'A weathered limestone boulder.' },
  'crescent-rock-boulder-b': { name: 'Half-buried boulder pair', category: CRESCENT_ROCKS, description: 'Two weathered limestone boulders half sunk in the ground.' },
  'crescent-rock-boulder-c': { name: 'Stone scatter', category: CRESCENT_ROCKS, description: 'A scatter of small weathered limestone stones.' },
  'crescent-rock-cliff-a': { name: 'Wide cliff face', category: CRESCENT_ROCKS, description: 'A wide weathered limestone cliff face for the headland.' },
  'crescent-rock-cliff-b': { name: 'Tall cliff buttress', category: CRESCENT_ROCKS, description: 'A tall weathered limestone buttress for the headland.' },
  'crescent-rock-cliff-c': { name: 'Sea-cave ledge', category: CRESCENT_ROCKS, description: 'A low limestone cliff with a sea-cave ledge.' },
  'crescent-rock-outcrop-a': { name: 'Karst outcrop', category: CRESCENT_ROCKS, description: 'A cluster of weathered karst limestone.' },
  'crescent-rock-outcrop-b': { name: 'Boulder group outcrop', category: CRESCENT_ROCKS, description: 'A grouped outcrop of weathered limestone boulders.' },
  'crescent-rock-reef-a': { name: 'Notched reef head', category: CRESCENT_REEF, description: 'A wet reef-edge limestone head with a deep wave-cut notch.' },
  'crescent-rock-reef-b': { name: 'Awash reef platform', category: CRESCENT_REEF, description: 'A flat reef-rim platform of three wet limestone slabs, just proud of the water.' },
  'crescent-coral-rubble-patch': { name: 'Coral rubble patch', category: CRESCENT_REEF, description: 'A patch of coral rubble for the lagoon floor, in its living colour.' },
  'crescent-coral-brain-heads': { name: 'Brain coral heads', category: CRESCENT_REEF, description: 'A group of brain coral heads, in their living colour.' },
  'crescent-coral-staghorn': { name: 'Staghorn coral thicket', category: CRESCENT_REEF, description: 'A branching staghorn coral thicket, in its living colour.' },
  'crescent-coral-table': { name: 'Table corals', category: CRESCENT_REEF, description: 'Table and plate corals, in their living colour.' },
  'crescent-seagrass': { name: 'Seagrass clump', category: CRESCENT_REEF, description: 'A clump of broad tape-grass blades for the lagoon’s seagrass meadows.' },
  'crescent-shelter': { name: 'Thatched beach shelter', category: CRESCENT_BUILT, description: 'An open thatched shelter of weathered timber with a table and benches, facing the lagoon.' },
  'crescent-jetty-deck': { name: 'Jetty deck module', category: CRESCENT_BUILT, description: 'A 3 m timber deck module with mooring posts, made to repeat into a jetty.' },
  'crescent-jetty-platform': { name: 'Jetty platform', category: CRESCENT_BUILT, description: 'A 3 m square timber platform for the end of the jetty.' },
  'crescent-jetty-stair': { name: 'Jetty stair', category: CRESCENT_BUILT, description: 'A timber stair that descends from the jetty deck to the seabed.' },
};

/** A world placement id to its gallery slug. Every scene's Cove module shares the Cove pack's slug; Crescent Cove's own assets are prefixed. */
export function holodeckSlug(pack, worldAssetId) {
  const cove = Object.hasOwn(coveModules, worldAssetId);
  if (pack === 'holodeck-cove' && !cove) throw new Error(`Unknown Cove module ${worldAssetId}`);
  if (cove) return `cove-${worldAssetId}`;
  return pack === 'holodeck-crescent-cove' ? `crescent-${worldAssetId}` : worldAssetId;
}
