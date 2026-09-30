import { orbitDirection } from './rig-render.mjs';

/**
 * What the site says about the Foundry Floor pack beyond what it reads from the pack itself. The models, their
 * revisions, authors, pins, measurements and licence come from the staged scene pack (`pack.json`,
 * `data/assets.json`, `licenses/ASSET-LICENSE.txt`, sealed by its `SHA256SUMS`) and from the GLBs; this module only
 * names the groups the page lists them in and writes each slug out as a readable name.
 */

export const FOUNDRY_FLOOR_ID = 'foundry-floor';
export const FOUNDRY_FLOOR_NAME = 'Foundry Floor';
/** Where the pack's files sit in the asset mirror (and, after the owner's upload, on the asset host). */
export const foundryFloorDir = (release) => `packs/${FOUNDRY_FLOOR_ID}/${release}`;
export const foundryFloorFiles = (release) => ({
  model: (slug) => `${foundryFloorDir(release)}/models/${slug}.glb`,
  licence: `${foundryFloorDir(release)}/licenses/ASSET-LICENSE.txt`,
  archive: `${foundryFloorDir(release)}/foundry-floor-${release}-models.zip`,
});

/** The page lists the models in four groups, by the asset map's `class` of each. */
export const FOUNDRY_FLOOR_GROUPS = [
  { id: 'tools', title: 'Process tools', classes: ['tool'] },
  { id: 'transport', title: 'Wafer transport and storage', classes: ['mover', 'port', 'stocker', 'tower', 'storage', 'rail'] },
  { id: 'building', title: 'Building', classes: ['building', 'wall'] },
  { id: 'people', title: 'People and robots', classes: ['people', 'robot'] },
];

const ACRONYMS = new Set(['foup', 'oht', 'ffu', 'cvd', 'ald', 'pvd', 'cmp', 'euv', 'duv', 'amr']);
/** Hyphens that belong inside a word pair, and slashes that join a pair of alternatives, per slug. */
const JOINS = {
  'under-track-storage': 'Under-track storage',
  'single-wafer-clean-tool': 'Single-wafer clean tool',
  'raised-floor-module': 'Raised-floor module',
  'tool-front-robot-arm': 'Tool-front robot arm',
  'coater-developer-track': 'Coater/developer track',
  'wafer-prober-tester': 'Wafer prober/tester',
  'subfab-pump-abatement-kit': 'Subfab pump/abatement kit',
  'oht-rail-straight': 'OHT rail, straight',
  'oht-rail-curve': 'OHT rail, curve',
  'oht-rail-switch': 'OHT rail, switch',
};

/**
 * A slug written out as a name: its words in order, acronyms in capitals, the first letter capitalised, and two
 * acronyms in a row joined by a slash (`cvd-ald-cluster-tool` is "CVD/ALD cluster tool"). `slugOfName` inverts it,
 * so the page's name can always be traced back to the pack's own slug.
 */
export function displayName(slug) {
  if (JOINS[slug]) return JOINS[slug];
  const words = slug.split('-');
  let name = '';
  words.forEach((word, index) => {
    const acronym = ACRONYMS.has(word);
    const text = acronym ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    const joined = index > 0 && acronym && ACRONYMS.has(words[index - 1]);
    name += index === 0 ? text : `${joined ? '/' : ' '}${text}`;
  });
  return name;
}

export const slugOfName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Every model is seen from the same place so the cards line up: from the front right (the +X, +Z side of the pack's
 * frame), 30 degrees above the horizon, in a square frame. The GLB is the delivered file, drawn as a plain glTF
 * viewer draws it (see scripts/foundry-floor-glb.mjs).
 */
export const FOUNDRY_FLOOR_POSTER = { width: 1024, height: 1024, direction: orbitDirection(45, 30), padding: 1.05 };

/**
 * The scene page's poster: one pack model, rendered the same way in a wide frame. The scene itself is a running
 * simulation with no single file to render, so the poster says which model it shows and that the scene is not
 * pictured.
 */
export const FOUNDRY_FLOOR_SCENE_POSTER = {
  slug: 'euv-scanner',
  key: 'scene-poster',
  view: { width: 1440, height: 900, direction: orbitDirection(40, 22), padding: 1.04 },
  alt: 'The EUV scanner model from the Foundry Floor pack, rendered under the review rig on a neutral backdrop. The running scene is not pictured.',
};
