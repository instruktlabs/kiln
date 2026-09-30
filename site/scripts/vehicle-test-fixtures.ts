import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Synthetic vehicles for the vehicle tests: a tiny car with three detail tiers and four wheels, written both as an
 * author's saved export (tiers as named sibling groups) and as the delivered file (tiers linked with
 * `MSFT_lod`). Both forms share one binary chunk, as the real files do.
 */

export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** Wrap a JSON document and a binary chunk as a GLB. */
export function glbBytes(json: object, bin: Buffer = Buffer.alloc(64, 7)): Buffer {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk('JSON', jsonPadded), chunk('BIN\0', binPadded)]);
}

/** The inverse of the writer's thresholds: the screen fraction a sphere of `radius` covers at `distance` (50 degrees, 16:9). */
export function coverageAt(radius: number, distance: number) {
  const projected = radius / (distance * Math.tan((25 * Math.PI) / 180));
  return (projected * projected * Math.PI) / (4 * (16 / 9));
}

const accessor = (min: number[], max: number[], count: number) => ({ componentType: 5126, count, type: 'VEC3', min, max });
const indices = (count: number) => ({ componentType: 5123, count, type: 'SCALAR' });

export interface FixtureOptions {
  root?: string;
  /** Triangles of the LOD0 paint mesh (the budget tests raise it). */
  paintTriangles?: number;
  /** The distances (metres) at which LOD1 and LOD2 start, and the vehicle stops being drawn. */
  distances?: [number, number, number];
  /** Where the wheels stop being drawn; the default is where the last tier starts. */
  wheelsHideAt?: number;
  wheelsHidden?: boolean;
}

/** Half the diagonal of the LOD0 body (paint plus glass), which the writer's coverage numbers are relative to. */
const BODY = { min: [-2.1, 0.25, -0.9], max: [2.1, 1.4, 0.9] };
const bodyRadius = 0.5 * Math.hypot(BODY.max[0] - BODY.min[0], BODY.max[1] - BODY.min[1], BODY.max[2] - BODY.min[2]);
const wheelRadius = 0.5 * Math.hypot(0.6, 0.6, 0.2);

/** The vehicle's JSON. `form` is the saved export (`named-groups`) or the delivered file (`MSFT_lod`). */
export function vehicleJson(form: 'named-groups' | 'MSFT_lod', options: FixtureOptions = {}) {
  const { root = 'Car', paintTriangles = 100, distances = [60, 250, 1500], wheelsHideAt = distances[1], wheelsHidden = true } = options;
  const wheelNames = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
  const wheelPositions = [[1.3, 0.3, -0.8], [1.3, 0.3, 0.8], [-1.3, 0.3, -0.8], [-1.3, 0.3, 0.8]];
  const nodes: Record<string, unknown>[] = [
    { name: root, children: [1, 2, 3, 4, 5, 6, 7] },
    { name: 'LOD0', children: [8, 9] },
    { name: 'LOD1', children: [10] },
    { name: 'LOD2', children: [11] },
    ...wheelNames.map((name, index) => ({ name, translation: wheelPositions[index], children: [12 + index] })),
    { name: 'Mesh_Paint_L0', mesh: 0 },
    { name: 'Mesh_Glass_L0', mesh: 1 },
    { name: 'Mesh_Paint_L1', mesh: 2 },
    { name: 'Mesh_Paint_L2', mesh: 4 },
    ...wheelNames.map((name) => ({ name: `Mesh_Tyre_${name.slice(-2)}`, mesh: 3 })),
  ];
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 2 }, indices: 3, material: 1 }] },
      { primitives: [{ attributes: { POSITION: 4 }, indices: 5, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 6 }, indices: 7, material: 2 }] },
      { primitives: [{ attributes: { POSITION: 8 }, indices: 9, material: 0 }] },
    ],
    accessors: [
      accessor(BODY.min, BODY.max, 200), indices(paintTriangles * 3),
      accessor([-1, 0.6, -0.5], [1, 1.2, 0.5], 60), indices(90),
      accessor([-2.12, 0.25, -0.9], [2.12, 1.35, 0.9], 100), indices(60),
      accessor([-0.3, -0.3, -0.1], [0.3, 0.3, 0.1], 40), indices(60),
      accessor([-2.2, 0.25, -0.92], [2.2, 1.0, 0.92], 20), indices(15),
    ],
    materials: [{ name: 'Paint' }, { name: 'Glass' }, { name: 'Tyre' }],
  };
  if (form === 'named-groups') return json;
  // The delivered form: LOD1 and LOD2 leave the scene tree and hang off LOD0; each wheel points at an empty far node.
  const far = wheelNames.map((name) => ({ name: `${name}_far` }));
  const [near, mid, cull] = distances;
  nodes[0] = { name: root, children: [1, 4, 5, 6, 7] };
  nodes[1] = { name: 'LOD0', children: [8, 9], extensions: { MSFT_lod: { ids: [2, 3] } }, extras: { MSFT_screencoverage: [coverageAt(bodyRadius, near), coverageAt(bodyRadius, mid), coverageAt(bodyRadius, cull)] } };
  wheelNames.forEach((name, index) => {
    const farIndex = nodes.length + index;
    nodes[4 + index] = {
      ...(nodes[4 + index] as object),
      ...(wheelsHidden ? { extensions: { MSFT_lod: { ids: [farIndex] } }, extras: { MSFT_screencoverage: [coverageAt(wheelRadius, wheelsHideAt), 0] } } : {}),
    };
  });
  nodes.push(...far);
  return { ...json, nodes, extensionsUsed: ['MSFT_lod'] };
}

export interface FixtureVehicle {
  slug: string;
  name: string;
  root: string;
  author: string;
  assetId: string;
  category: string;
  budget: 'car' | 'heavy';
  description: string;
  revisions: { revisionId: string; parentRevisionId: string | null; run: string; stage: string }[];
  correction?: string;
}

export interface WrittenFixture {
  commons: string;
  scenePack: string;
  data: string;
  mirror: string;
  vehicles: FixtureVehicle[];
  runs: unknown[];
  sumsSha256: string;
  glb: Buffer;
}

const RUN_START = '2026-09-29T14:00:00.000Z';
const RUN_END = '2026-09-29T15:00:00.000Z';

export interface WriteOptions {
  /** Saved time of the (last) revision. */
  savedAt?: string;
  paintTriangles?: number;
  /** The delivered export's paint triangles when they should differ from the saved revision's. */
  deliveredPaintTriangles?: number;
  /** An earlier revision's paint triangles (with `corrected`), to make a correction that changed geometry. */
  firstPaintTriangles?: number;
  /** The delivered file's own tier form; the default is the MSFT_lod rewrite. */
  deliveredForm?: 'named-groups' | 'MSFT_lod';
  /** Required extensions the delivered file declares. */
  extensionsRequired?: string[];
  /** The root node name of both files. */
  root?: string;
  /** Bytes of the delivered binary chunk (default: the same as the saved export). */
  deliveredBin?: Buffer;
  licenceGlbSha?: string;
  dependencies?: unknown[];
  wheelsHideAt?: number;
  wheelsHidden?: boolean;
  /** Two revisions for the vehicle, the second changing nothing measurable. */
  corrected?: boolean;
  recordSums?: string;
}

/**
 * Lay a one-vehicle commons out on disk the way the stager reads it: the author's saved revisions and export, the
 * Golden Gate scene pack's copy and licence text sealed by its SHA256SUMS, and the site's run and pack records.
 */
export async function writeFixture(root: string, options: WriteOptions = {}): Promise<WrittenFixture> {
  const { savedAt = '2026-09-29T14:30:00.000Z', paintTriangles = 100, deliveredPaintTriangles = paintTriangles, firstPaintTriangles = paintTriangles, deliveredForm = 'MSFT_lod', extensionsRequired, root: rootName = 'Car', deliveredBin, licenceGlbSha, dependencies = [], wheelsHideAt, wheelsHidden, corrected = false, recordSums } = options;
  const commons = join(root, 'commons');
  const scenePack = join(root, 'pack');
  const data = join(root, 'data');
  const mirror = join(root, 'mirror');
  const slug = 'sedan';
  const assetId = 'fixture-sedan';
  const author = 'fixture-author';
  const write = async (path: string, bytes: Buffer | string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  };
  const bin = Buffer.alloc(64, 7);
  const savedGlb = (index: number) => glbBytes(vehicleJson('named-groups', { root: rootName, paintTriangles: index === (corrected ? 1 : 0) ? paintTriangles : firstPaintTriangles }), bin);
  const delivered = { ...vehicleJson(deliveredForm, { root: rootName, paintTriangles: deliveredPaintTriangles, wheelsHideAt, wheelsHidden }), ...(extensionsRequired ? { extensionsRequired } : {}) };
  const glb = glbBytes(delivered, deliveredBin ?? bin);
  const source = Buffer.from('// fixture source\nexport default () => ({});\n');
  const preview = await sharp({ create: { width: 700, height: 450, channels: 3, background: '#aab1bc' } }).png().toBuffer();
  const revisionIds = corrected ? ['r_00000000000000000000000000000001', 'r_00000000000000000000000000000002'] : ['r_00000000000000000000000000000001'];
  const manifests: { revisionId: string; time: string }[] = revisionIds.map((revisionId, index) => ({ revisionId, time: index === revisionIds.length - 1 ? savedAt : '2026-09-29T14:10:00.000Z' }));
  for (const [index, { revisionId, time }] of manifests.entries()) {
    const dir = join(commons, 'showcase/authors', author, 'assets/kiln', assetId, 'revisions', revisionId);
    const record = (bytes: Buffer) => ({ sha256: `sha256:${sha(bytes)}`, bytes: bytes.length });
    const manifest = {
      version: 'kiln.asset.v1',
      assetId,
      revisionId,
      ...(index > 0 ? { parentRevision: revisionIds[index - 1] } : {}),
      name: 'Fixture sedan',
      createdAt: time,
      brief: index > 0 ? 'Review 2 fix: close the back.' : 'Generic fixture sedan.',
      attribution: { model: 'claude-sonnet-5-5', harness: 'Claude Code', author },
      files: { 'asset.glb': record(savedGlb(index)), 'source.kiln.js': record(source), 'preview.png': record(preview) },
      build: { dependencies },
      preview: { fidelity: { materialFaithful: true, exactArtifact: false, delivered: 'full-material', rendererId: 'fixture', degraded: false }, backdrop: 'neutral' },
    };
    await write(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await write(join(dir, 'asset.glb'), savedGlb(index));
    await write(join(dir, 'source.kiln.js'), source);
    await write(join(dir, 'preview.png'), preview);
  }
  await write(join(commons, 'showcase/authors', author, 'outputs', slug, `${slug}.glb`), glb);

  const licence = Buffer.from(['SPDX-License-Identifier: CC0-1.0', `Kiln asset: ${assetId}`, `Saved revision: ${revisionIds.at(-1)}`, `Delivered GLB SHA-256: ${licenceGlbSha ?? sha(glb)}`, ''].join('\n'));
  await write(join(scenePack, 'vehicles', `${slug}.glb`), glb);
  await write(join(scenePack, 'licenses/vehicles', `${slug}.ASSET-LICENSE.txt`), licence);
  const sums = `${sha(glb)}  vehicles/${slug}.glb\n${sha(licence)}  licenses/vehicles/${slug}.ASSET-LICENSE.txt\n`;
  await write(join(scenePack, 'SHA256SUMS'), sums);

  const run = { stage: 'first-retry1', author, requestedModel: 'claude-sonnet-5-5', requestedEffort: 'max', harness: 'claude', harnessVersion: '2.1.280', confirmedEffort: null, confirmation: 'Requested in receipt and invocation; effective reasoning effort not independently confirmed.', modelReported: ['claude-sonnet-5-5'], status: 'completed', stop: 'success', startedAt: RUN_START, endedAt: RUN_END, source: { receipt: 'r.json', receiptSha256: sha('receipt'), invocation: 'i.json', invocationSha256: sha('invocation') }, label: 'first run, retry 1' };
  const second = { ...run, stage: 'review-2', startedAt: '2026-09-29T14:05:00.000Z', endedAt: '2026-09-29T15:30:00.000Z', label: 'review 2' };
  const runs = [run, second];
  await write(join(data, 'vehicle-runs.json'), `${JSON.stringify(runs, null, 2)}\n`);
  await write(join(data, 'scene-packs.json'), `${JSON.stringify({ 'golden-gate': { sha256sumsSha256: recordSums ?? sha(sums) } }, null, 2)}\n`);
  await write(join(data, 'mirror-manifest.json'), `${JSON.stringify({ base: 'https://assets.kilnstudio.tools/', files: [{ path: 'packs/farm/keep.bin', bytes: 1, sha256: sha('x') }] }, null, 2)}\n`);
  await write(join(data, 'commons-build.json'), `${JSON.stringify({ schemaVersion: 1, images: [], archives: ['packs/farm/keep.zip'], sources: [], models: [] }, null, 2)}\n`);

  const vehicles: FixtureVehicle[] = [{
    slug,
    name: 'Fixture sedan',
    root: rootName,
    author,
    assetId,
    category: 'Cars',
    budget: 'car',
    description: 'A synthetic sedan.',
    revisions: revisionIds.map((revisionId, index) => ({ revisionId, parentRevisionId: index > 0 ? revisionIds[index - 1]! : null, run: index === 0 ? 'first-retry1' : 'review-2', stage: index === 0 ? 'first' : 'review-2' })),
    ...(corrected ? { correction: 'The fixture sedan was found see-through from behind, and this revision corrects that.' } : {}),
  }];
  return { commons, scenePack, data, mirror, vehicles, runs, sumsSha256: sha(sums), glb };
}
