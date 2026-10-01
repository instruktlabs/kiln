import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { inspectGlb } from './generate-commons.mjs';
import { firstHit, partBounds, worldTriangles } from './hero-geometry.mjs';
import { readJson, sha256Hex, writeJson } from './media-pins.mjs';
import { verifyBytes } from './mirror-core.mjs';
import { rigPosterImage, rigPosterKey } from './rig-posters-core.mjs';
import { BRIDGE_ID } from './bridge-captures.mjs';
import { HERO_PACK, farmTargets } from './rig-posters.mjs';
import { heroDrawing } from '../src/lib/hero-drawing.mjs';

/**
 * Write a hero data file from sealed records, for the home page drawing (`src/lib/hero-drawing.mjs`):
 *
 *   node scripts/build-hero.mjs golden-gate-bridge --mirror DIR [--out src/data/hero.json]
 *   node scripts/build-hero.mjs farmhouse --mirror DIR --out scripts/fixtures/hero-farmhouse.json
 *
 * Everything comes from files that are already verified elsewhere: the poster record in `rig-posters.json` (its PNG
 * in the mirror is checked against the recorded SHA-256), the GLB the poster was rendered from (checked the same
 * way), the camera the rig used, and the revision's bounds as the catalog records them. The callout parts are named
 * here; each must be visible: the camera ray through its projected bounds centre has to reach that part first.
 * Nothing is uploaded and the build does not run this script.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(SITE, 'src/data');
/** Rig backdrop `neutral` as the posters record it (every corner of every rig poster measures this colour). */
const BACKDROP = [170, 177, 188];
const MASK_CELLS = 128;

export const HERO_SUBJECTS = {
  'golden-gate-bridge': {
    callouts: ['GoldenGateBridge/SouthTower/SouthTower_CrownWest', 'GoldenGateBridge/NorthTower/NorthTower_Pier'],
    async load({ mirror, recorded }) {
      const record = recorded.posters[rigPosterKey(HERO_PACK, BRIDGE_ID)];
      if (!record) throw new Error('No hero poster record: run scripts/rig-posters.mjs hero first');
      const bridge = await readJson(join(DATA, 'standalone/golden-gate-bridge.json'));
      const tier = bridge.tiers.find((candidate) => candidate.revisionId === record.revisionId);
      if (!tier) throw new Error(`The hero poster's revision ${record.revisionId} is not a tier of the catalog bridge`);
      const glb = verifyBytes(await readFile(join(mirror, tier.runtime.path)), tier.runtime, tier.runtime.path);
      if (sha256Hex(glb) !== record.glb.sha256) throw new Error('The hero GLB is not the file the poster was rendered from');
      return {
        subject: { collection: 'standalone', slug: bridge.slug, tier: tier.tier, revisionId: tier.revisionId },
        record,
        poster: rigPosterImage(record, record.alt ?? bridge.poster.alt),
        camera: record.view.camera,
        bounds: { min: tier.metrics.boundsMin, max: tier.metrics.boundsMax, size: tier.metrics.bounds },
        glb,
        glbPath: tier.runtime.path,
        cameraSource: record.view.source,
      };
    },
  },
  farmhouse: {
    callouts: ['Mesh_RoofShingles', 'Mesh_PorchRoof'],
    async load({ mirror, recorded }) {
      const record = recorded.posters[rigPosterKey('farm', 'farmhouse')];
      const farm = await readJson(join(DATA, 'packs/farm.json'));
      const asset = farm.assets.find((candidate) => candidate.slug === 'farmhouse');
      const target = (await farmTargets({ mirror })).find((candidate) => candidate.slug === 'farmhouse');
      if (sha256Hex(target.glb) !== record.glb.sha256) throw new Error('The farmhouse GLB is not the file its poster was rendered from');
      // The rig fitted this view (`cameraFromBounds`): looking at the GLB's bounds centre along the recorded direction.
      const fitted = inspectGlb(target.glb);
      const centre = fitted.boundsMin.map((value, axis) => (value + fitted.boundsMax[axis]) / 2);
      const direction = record.view.direction;
      const norm = Math.hypot(...direction);
      const camera = { version: 'kiln.camera.v1', projection: record.view.projection, position: centre.map((value, axis) => value + (direction[axis] / norm) * 100), target: centre, up: [0, 1, 0], aspect: record.width / record.height, halfHeight: record.view.halfHeight };
      return {
        subject: { collection: 'farm', slug: asset.slug, tier: null, revisionId: record.revisionId },
        record,
        poster: asset.poster,
        camera,
        bounds: { min: asset.metrics.boundsMin, max: asset.metrics.boundsMax, size: asset.metrics.bounds },
        glb: target.glb,
        glbPath: target.glbPath,
        cameraSource: { direction, padding: record.view.padding },
      };
    },
  },
};

/** The poster's silhouette as a coarse bit mask: a cell is set when any of its pixels is not the rig backdrop. */
export async function silhouetteMask(png, cells = MASK_CELLS) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array((cells * cells) / 8);
  const cellWidth = info.width / cells;
  const cellHeight = info.height / cells;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.max(Math.abs(data[i] - BACKDROP[0]), Math.abs(data[i + 1] - BACKDROP[1]), Math.abs(data[i + 2] - BACKDROP[2])) <= 12) continue;
      const cell = Math.floor(y / cellHeight) * cells + Math.floor(x / cellWidth);
      bits[cell >> 3] |= 1 << (7 - (cell & 7));
    }
  }
  return { cells, backdrop: BACKDROP, bits: Buffer.from(bits).toString('base64') };
}

export async function buildHero({ subject, mirror, recorded }) {
  const spec = HERO_SUBJECTS[subject];
  if (!spec) throw new Error(`Unknown hero subject ${subject}; one of ${Object.keys(HERO_SUBJECTS).join(', ')}`);
  const loaded = await spec.load({ mirror, recorded });
  const png = verifyBytes(await readFile(join(mirror, loaded.record.path)), loaded.record, loaded.record.path);
  const parts = worldTriangles(loaded.glb);
  const back = loaded.camera.position.map((value, axis) => value - loaded.camera.target[axis]);
  const view = back.map((value) => value / Math.hypot(...back));
  const callouts = spec.callouts.map((name) => {
    const path = parts.some((part) => part.path === name || part.path.startsWith(`${name}/`)) ? name : parts.find((part) => part.path.endsWith(`/${name}`))?.path;
    if (!path) throw new Error(`${subject}: no part ${name}`);
    const { centre } = partBounds(parts, path);
    const hit = firstHit(parts, centre, view);
    if (!hit || (hit.path !== path && !hit.path.startsWith(`${path}/`))) throw new Error(`${subject}: the camera does not see ${path} at its bounds centre (first surface: ${hit?.path ?? 'none'})`);
    return { path, centre: centre.map((value) => Math.round(value * 1e4) / 1e4), firstSurface: hit.path };
  });
  const hero = {
    schemaVersion: 1,
    subject: loaded.subject,
    poster: loaded.poster,
    camera: loaded.camera,
    bounds: loaded.bounds,
    callouts,
    mask: await silhouetteMask(png),
    sources: {
      poster: { path: loaded.record.path, bytes: loaded.record.bytes, sha256: loaded.record.sha256, rendererId: loaded.record.rendererId },
      glb: { path: loaded.glbPath, bytes: loaded.glb.length, sha256: sha256Hex(loaded.glb), namedParts: parts.length },
      camera: loaded.cameraSource,
    },
  };
  heroDrawing(hero);
  return hero;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const subject = argv[0] ?? BRIDGE_ID;
  const mirror = option('--mirror', env.KILN_ASSET_MIRROR);
  if (!mirror) throw new Error('Usage: node scripts/build-hero.mjs golden-gate-bridge|farmhouse --mirror DIR [--out FILE]');
  const out = resolve(option('--out', join(DATA, 'hero.json')));
  const hero = await buildHero({ subject, mirror: resolve(mirror), recorded: await readJson(join(DATA, 'rig-posters.json')) });
  await writeJson(out, hero);
  const drawing = heroDrawing(hero);
  console.log(`${subject}: ${out}`);
  for (const d of drawing.dimensions) console.log(`  ${d.axis} ${d.value} chip ${d.chip.place} at ${d.chip.at.join(',')} angle ${d.chip.angle}`);
  for (const c of drawing.callouts) console.log(`  callout ${c.index} ${c.path} anchor ${c.anchor.join(',')} ${c.legendOnly ? 'legend only (no free route at the narrowest labelled width)' : `elbow ${c.elbow.join(',')} ${c.side}${c.crossings ? ` crossing ${c.crossings} dimension line(s)` : ''}`}`);
  console.log(`  triad ${drawing.triad ? drawing.triad.origin.join(',') : 'none'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
