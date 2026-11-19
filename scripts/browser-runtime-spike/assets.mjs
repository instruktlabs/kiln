// The spike's asset set: pack revisions checked into packs/ (small to large, both exporters)
// and parametric Seed Town kits at several parameter values. Seed Town sources are not in this
// repository; pass the authoring workspace that holds the pinned revisions, and each source is
// checked against the SHA-256 pinned in scenes/packages/seed-town/ASSET-MANIFEST.json.
// Not part of the package.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Pack revisions, ordered by saved GLB size. None needs material-library maps: those are hydrated
 * from the release mirror, not kept in packs/, so 194 of 625 pack revisions cannot build here. */
const PACK = [
  [
    'oht-rail-straight',
    'foundry-floor/sources/project/oht-rail-straight/r_ed0c4b464c3f44419b6efed936349a64',
  ],
  ['signal-tower', 'foundry-floor/sources/project/signal-tower/r_9d238ec1a53f4caaa39daaef9c27c840'],
  [
    'seagrass-clump',
    'holodeck/sources/project/a_675613e1a07241bfac5e903469b306a4/r_934ea81017634afc83591980f95dfadc',
  ],
  [
    'shrub-mound',
    'foundry-floor/sources/project/a_04e07c6b49f94dce8bb469a89b253bab/r_37b46919727c4c8a8bafe8884635a17b',
  ],
  ['load-port', 'foundry-floor/sources/project/load-port/r_b45a5f436cd14d7294bc6866dcebb5f7'],
  [
    'pave-field-a',
    'holodeck/sources/project/a_da7f4e34a9ed42d19e323263ff4194d6/r_eb58fbb4efa34635bd6b7ca27e1652ab',
  ],
  ['generic-sedan', 'vehicles/sources/project/generic-sedan/r_35222363b36f4d2da720311bcad86215'],
  [
    'humanoid-work-robot',
    'foundry-floor/sources/project/humanoid-work-robot/r_87ffa104a0c04a408c928fa7260fd566',
  ],
  [
    'generic-transit-bus',
    'vehicles/sources/project/a_a8c030b2570f4ae5aa54eefbd3767f4c/r_85ff097a61384efab445c55372d3b6f5',
  ],
  [
    'bench-park',
    'holodeck/sources/project/a_caace1bc7a0e44d289a8ad8f8055eda2/r_fb5d97b7cd994309a8159bf5a66a2b81',
  ],
  [
    'low-ember-lamp',
    'holodeck/sources/project/a_0e6e95f9c49d445fa83af41f12cabde1/r_3b14d66959f942c887c5550f60d6d8ce',
  ],
  [
    'coconut-palm-lean',
    'holodeck/sources/project/a_26aa8b78264d45f2bf79d6dff7188cb4/r_7a73a65486b049138933dba49173cd11',
  ],
  [
    'wool-sofa',
    'holodeck/sources/project/a_5af9bd51de70444cb02f1cc5e926043f/r_b2c8b849e6da44c3b56bed180f764e81',
  ],
  [
    'golden-gate-bridge',
    'golden-gate-bridge/sources/project/a_9fafaa6e7f4c4868a372e8f3b0b84738/r_46c96e629405473097b57b922f7e6545',
  ],
  [
    'holodeck-gateway',
    'holodeck/sources/project/a_3d189b692e934646bccc63f3088eafd1/r_c33d46440935478180576e38ffa20662',
  ],
];

/** Seed Town kits by manifest id, each at one or more parameter inputs. */
const SEED_TOWN = [
  ['street-lamp', 'default', undefined],
  ['street-lamp', 'twin-lit', { values: { arms: 'twin', height: 4.4, lit: true } }],
  ['tree', 'default', undefined],
  ['tree', 'preset-spruce', { preset: 'spruce' }],
  ['tree', 'column', { values: { form: 'column', height: 6, spread: 2.5 } }],
  ['facade-bay', 'default', undefined],
  [
    'facade-bay',
    'brick-arched',
    {
      values: {
        bayWidth: 2,
        window: 'arched',
        finish: 'brick',
        cornice: true,
        shutters: true,
        balcony: true,
      },
    },
  ],
  ['roof', 'mansard-two-dormers', { values: { form: 'mansard', dormers: 'two', width: 8 } }],
];

/** The saved exporter settings an exact rebuild replays (`kiln asset --rebuild`). */
function renderOptions(manifest) {
  const saved = manifest.build?.options ?? {};
  const options = {};
  for (const key of ['indexPolicy', 'gltfExporter', 'geometryPolicy', 'optimize', 'instance'])
    if (saved[key] !== undefined) options[key] = saved[key];
  return options;
}

export async function loadSpikeAssets({ seedTownWorkspace } = {}) {
  const assets = [];
  for (const [id, path] of PACK) {
    const dir = join(repo, 'packs', path);
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    const source = await readFile(join(dir, 'source.kiln.js'));
    assets.push({
      id,
      group: path.split('/')[0],
      name: manifest.name,
      source: `packs/${path}/source.kiln.js`,
      sourceBytes: source.length,
      code: source.toString('utf8'),
      options: renderOptions(manifest),
      savedGlbSha256: manifest.files?.['asset.glb']?.sha256?.replace(/^sha256:/, ''),
      savedGlbBytes: manifest.files?.['asset.glb']?.bytes,
    });
  }
  if (!seedTownWorkspace) return assets;
  const pins = JSON.parse(
    await readFile(join(repo, 'scenes/packages/seed-town/ASSET-MANIFEST.json'), 'utf8'),
  );
  for (const [kit, variant, params] of SEED_TOWN) {
    const pin = pins.assets.find((asset) => asset.id === kit);
    if (!pin) throw new Error(`Seed Town kit ${kit} is not pinned.`);
    const dir = join(seedTownWorkspace, 'assets/kiln', pin.assetId, 'revisions', pin.revisionId);
    const source = await readFile(join(dir, 'source.kiln.js'));
    if (sha256(source) !== pin.sourceSha256)
      throw new Error(`Seed Town ${kit} source does not match its pinned SHA-256.`);
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    assets.push({
      id: `${kit}:${variant}`,
      group: 'seed-town',
      name: manifest.name,
      source: `seed-town ${pin.assetId}/${pin.revisionId}`,
      sourceBytes: source.length,
      code: source.toString('utf8'),
      options: renderOptions(manifest),
      ...(params ? { params } : {}),
      ...(params
        ? {}
        : {
            savedGlbSha256: manifest.files?.['asset.glb']?.sha256?.replace(/^sha256:/, ''),
            savedGlbBytes: manifest.files?.['asset.glb']?.bytes,
          }),
    });
  }
  return assets;
}

/** Build options for one asset: its saved settings plus the parameter input, if any. */
export const buildOptions = (asset) => ({
  ...asset.options,
  ...(asset.params ? { params: asset.params } : {}),
});
