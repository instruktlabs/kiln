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

/**
 * Owner approval, by gallery slug and the exact revision approved. On 2026-10-23 the owner approved the 47 staged
 * Courtyard, Cove and Tidemark cards as staged, and their packs for delivery, then the 41 new Crescent Cove cards as
 * staged. The approval covers these revisions only: a new card, or a new revision of one of these, awaits review until it is recorded here. A pack is available
 * when every asset it lists is approved.
 */
export const HOLODECK_APPROVAL = {
  recordedAt: '2026-10-23',
  revisions: {
    'cove-structure': 'r_2387ce274123402dbdafd818e6fb0043',
    'cove-canopy': 'r_df0485467228414780cfa44c0f2e32ad',
    'cove-seating': 'r_6602fd828a5341eeaa0877fc58289960',
    'cove-hearth': 'r_5ef43760979043d48f358fe2932147dc',
    'cove-planting': 'r_cdb8552ccdde43f28d3995b2a5a30d25',
    'cove-rug': 'r_651bc2867976426996191865ea931163',
    'cove-lamp': 'r_3b14d66959f942c887c5550f60d6d8ce',
    'cove-moodboard': 'r_aedc5a07c6d34c1fb19f5cf959ce679c',
    'island-palm': 'r_9301a174823a4f109e19e37547295f61',
    'island-shrub': 'r_4803f98bf0ce470c8932418294232ef7',
    'island-grass': 'r_0fbd508d69a94af591440fffccd7a091',
    'island-shore': 'r_1ed20bc9bbd440e0a7d61fdd3bfa6520',
    'island-hut-frame': 'r_17b3c37ecbd540d9adeffb29ebc1bc81',
    'island-hut-roof': 'r_a534f55c922e48b19818dfc995437c5c',
    'island-hut-furnishings': 'r_8ca5cf4a3b4b4a5583462eeb16338936',
    'island-resident': 'r_7fd4e42104b14771a9108574848de5fd',
    'island-bird': 'r_f5696d892ce7485dafa2bbfd07376b13',
    'island-crab': 'r_1ead8326320c4a988a065b74c5daebd2',
    'jungle-sapling': 'r_28393641e10c49cd9787130e56d0cfd8',
    'jungle-fern': 'r_ca0d0037051040c8b5e5ca1143d92ebd',
    'jungle-understory': 'r_8435d0bc3b5a4cf590ecc61e37062613',
    'jungle-groundcover': 'r_66e544c6b8bf4c7f873421dd8b639195',
    'coastal-flybird': 'r_d9dddb69593c4e8fb4cc69d542bc614a',
    'pave-field-a': 'r_eb58fbb4efa34635bd6b7ca27e1652ab',
    'pave-field-b': 'r_39105d3e5294411da8ba0d9f4a831475',
    'pave-curb': 'r_9edce7ef69204e60851b4d3c6bd453d6',
    'pave-curb-corner': 'r_f1c84b5613d0469bb7b2cf81be9d00ee',
    'pave-step': 'r_19ccefab21fb4b6abd25f3750901466d',
    'plaza-fountain': 'r_5a5c5ed84a9d4668a05016e109861d1e',
    'fountain-cascade': 'r_df8d28bab94a46b9bec2128a7f38b22b',
    'statue-figure': 'r_6e91cd455ff24fbfb24c7dcb09029138',
    'statue-monolith': 'r_b4651a7593bd44e5a8b9c45be31dbec9',
    'statue-bronze': 'r_0e3ff4e9f6f74ac8b548f2aa6bb291ec',
    'tree-plane': 'r_9803c463ca244a27bc28b46fd194d4dc',
    'tree-cypress': 'r_11a87669343142ee9a9cf052239f0206',
    'tree-olive': 'r_f88d7d2fb5c2496ebf33ea2859e1d570',
    'shrub-box': 'r_c787a2acfc664ee2829a88bec41fa82f',
    'plant-lavender': 'r_804d9b0931644ad9a6166e9932467110',
    'bench-stone': 'r_cf24003d8a2046358c7b16ad178084bf',
    'bench-park': 'r_7930f6bf31f04c37b4ca531cd441c57f',
    'planter-square': 'r_67d49bebdd2f4b0f91dce4e6fdaaf66b',
    'planter-urn': 'r_ef304c3551e54050a26024a58eb8d4fd',
    'lamp-post': 'r_7aa5f13af3ff439281cf3772b8350680',
    'lamp-bollard': 'r_3649775fe6ce475a90e6056d0efe5eb4',
    'wall-segment': 'r_32e8228756ac4367bb8783e522e10e27',
    'wall-pier': 'r_100777af4e4247c18c3eb70df5e97a82',
    'gate-pier': 'r_2f7983fabd9249ba819388b106eda57f',
    'crescent-palm-tall': 'r_833811c9eae048acac736131aa951660',
    'crescent-palm-lean': 'r_0ba7b32ad3ee4bd494e55146b8312ed7',
    'crescent-palm-arch': 'r_5593211abef14ebab49f45b57a8b8758',
    'crescent-palm-young': 'r_8bdbc20277274140a7ba5c2dfe005f61',
    'crescent-debris-coconuts': 'r_6de480afa2fc43d3bc431cb2a1d3de1a',
    'crescent-debris-driftwood-log': 'r_4f84e09ff60342108adcb640ff365c08',
    'crescent-debris-driftwood-pile': 'r_d95c8307fe3b4f648d35c627b601a112',
    'crescent-debris-fronds': 'r_dabf789f83a84d039243505e7afe4341',
    'crescent-debris-shells': 'r_362b7d0ce6904b4cbe8a63acc3296e6b',
    'crescent-plant-alocasia': 'r_7bffd8155ce74118b9787484e19e833b',
    'crescent-plant-grass-patch': 'r_ef23b16ec9514cf7bb859c5ef2b64f65',
    'crescent-plant-grass-tuft': 'r_a07d0bbd28614cceb799753079243899',
    'crescent-plant-hibiscus': 'r_a2ca902ed3da474db9ced0bacbdfc8ab',
    'crescent-plant-naupaka': 'r_1d96a48e3a614801849560a0b2cbe5bf',
    'crescent-plant-nest-fern': 'r_f01c7040381a418b9f65a71882e0867e',
    'crescent-plant-purslane': 'r_8ba9fde90b3f476195106a2b5d98c016',
    'crescent-plant-scrub': 'r_c7f5ab339ad54cecacab349c3e3ced17',
    'crescent-plant-sword-fern': 'r_0e03667d27c84677ad2a52b4ca612cbb',
    'crescent-plant-vine-fringe': 'r_0580ebaeab84471096a92f75f5328acf',
    'crescent-plant-vine-mat': 'r_aff5d9d5047942e6be26dffe4151b898',
    'crescent-rock-beach-a': 'r_bdac00d03fee4445aca94ae2e8ca3eff',
    'crescent-rock-beach-b': 'r_35db268edac1478cadd145d5a557c06c',
    'crescent-rock-boulder-a': 'r_13a7eaad34e045aaae69b28fc12c715f',
    'crescent-rock-boulder-b': 'r_d312230034114640b10018ac9b305178',
    'crescent-rock-boulder-c': 'r_1838d6178a334cb08c7cebf6e4ec56f3',
    'crescent-rock-cliff-a': 'r_8631328505ff44fc99d7024890f29618',
    'crescent-rock-cliff-b': 'r_a2cbc91aca4342bcb3409047704717e1',
    'crescent-rock-cliff-c': 'r_7d4e3f6643fe4a2c9aa5ce024b20d670',
    'crescent-rock-outcrop-a': 'r_1e467cce279f49c19b65ebe800bb7f91',
    'crescent-rock-outcrop-b': 'r_adac0cd34d614259aca962e05b6c551f',
    'crescent-rock-reef-a': 'r_506b9771f15d49cd9c3a8ef2028e30dc',
    'crescent-rock-reef-b': 'r_f90c4f3d2acc4c46a06c1929f1211ba1',
    'crescent-coral-rubble-patch': 'r_0004b73b61ce4dbb8650b2170ca6739e',
    'crescent-coral-brain-heads': 'r_5ba43855c2d44c2288950b79928cc8d4',
    'crescent-coral-staghorn': 'r_5fc00554f8aa445e94baa7f2dd736042',
    'crescent-coral-table': 'r_92d597470e844905abeeec904b174049',
    'crescent-shelter': 'r_23af584103ec4c8788c0dcfb9e263d99',
    'crescent-jetty-deck': 'r_dd77ec41c8a148749d079173dc110e78',
    'crescent-jetty-platform': 'r_90dc37891b9f41dd843e20762d57b523',
    'crescent-jetty-stair': 'r_2f615af8a589400e9cb9b2ca602c4619',
    'crescent-seagrass': 'r_cd79d419d444441a8299b6739e6435d7',
  },
};
/** Whether the owner approved this exact revision of a card. */
export const holodeckApproved = (slug, revisionId) => HOLODECK_APPROVAL.revisions[slug] === revisionId;

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
