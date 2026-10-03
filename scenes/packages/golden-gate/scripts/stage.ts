// SPDX-License-Identifier: MIT
// Golden Gate staging: copies the read-only bridge, terrain and (ready) vehicle inputs into one
// kiln.scene-pack/1 folder with the kit's stageFiles (SHA-256 per file, pack.json, SHA256SUMS).
// Every source is verified against its own manifest before anything is written.
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/golden-gate/scripts/stage.ts [--release g2] [--force]
// The default release and the pinned bridge runtimes are in ./release.ts.
// All six pinned vehicle GLBs are required; the current saved children await owner visual review.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageFiles, verifyStaged, type StagePlan } from '@kiln-scenes/scene-kit/staging';
import type { CreditEntry } from '@kiln-scenes/scene-kit';
import { DATA_FILES } from '../src/data';
import { LAYOUT } from './authored-layout';
/** The behaviour specification staged beside the data (traffic, driving, flights, fog banks, lamps). */
const BEHAVIOUR_FILE = 'data/BEHAVIOUR.md';
import { laneDrift, roadGridFromBridge } from './layout';
import { deckEnds } from './approaches';
import { verifyCanonical } from './terrain-canonical';
import { BRIDGE_ASSET, BRIDGE_FULL, BRIDGE_LIBRARY, BRIDGE_LICENCE, BRIDGE_PINS, BRIDGE_SOURCE, STAGED_RELEASE, type BridgePin } from './release';

export const TRADEMARK_NOTE = 'The Golden Gate Bridge name and likeness are trademarks of the Golden Gate Bridge, Highway and Transportation District. The CC0 dedication covers copyright in this model only and grants no trademark rights.';
export const VEHICLE_TYPES = ['sedan', 'hatchback', 'suv', 'pickup', 'box-truck', 'transit-bus'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMONS = resolve(PACKAGE_ROOT, '../../..');
const DEFAULTS = {
  /** The accepted bridge fix-up 1 outputs (release g2; g1 staged the review-2 runtimes from showcase/authors/astra-golden-gate). */
  bridge: BRIDGE_SOURCE,
  terrain: resolve(COMMONS, 'golden-gate-scene/terrain/out'),
  vehicleRoots: [resolve(COMMONS, 'showcase/authors/sonnet-vehicles-a/outputs'), resolve(COMMONS, 'showcase/authors/sonnet-vehicles-b/outputs')],
  /** The vehicle review library (showcase/review/vehicles/final): holds the approved MSFT_lod files by revision. */
  vehicleLibrary: resolve(COMMONS, 'showcase/review/vehicles/final/assets/kiln'),
};

/**
 * The six approved vehicles (owner 2026-09-29 12:45): Kiln asset and revision from each author REPORT.md.
 * The delivered GLBs were rewritten by the coordinator to glTF `MSFT_lod` (13:05, binary chunk unchanged;
 * showcase/review/vehicles/LOD-CONVENTION.md). The author folders ship no licence file, so staging writes
 * one from SCENE-TASK's rule "CC0 for Kiln-authored assets" and records that it did (credits.json, REPORT).
 */
interface VehicleProvenance { name: string; asset: string; revision: string; author: string; bytes: number; sha256: string; parentRevision?: string; refinedBy?: string }
export const VEHICLE_PROVENANCE_G7: Record<VehicleType, VehicleProvenance> = {
  sedan: { name: 'Generic sedan', asset: 'generic-sedan', revision: 'r_1cb27a0c14d44e48afff84db23013dad', author: 'sonnet-vehicles-a', bytes: 259_596, sha256: 'e05943cd76110e6ed7e3210b9bc33ede40d48371def8439ca1bc9c8dcabf8e96' },
  hatchback: { name: 'Generic hatchback', asset: 'generic-hatchback', revision: 'r_105b27d31fe44f2aa188a333e19e3977', author: 'sonnet-vehicles-a', bytes: 262_464, sha256: 'c2f941f89816b5d8a48bb2d9481a00411c2af45591d26ea46a99399d385a3bfa' },
  suv: { name: 'Generic SUV', asset: 'generic-suv', revision: 'r_8261935e39684470b65549b1c39142fd', author: 'sonnet-vehicles-a', bytes: 266_964, sha256: 'f46d4535adf8a2730ff832fba59476db2cc63b0dece497aebc1651ae53a6d28d' },
  pickup: { name: 'Generic pickup truck', asset: 'a_557b9bd6c2c34340804e802081a9b983', revision: 'r_b74ac56a93a44c7484890f712df9c64c', author: 'sonnet-vehicles-b', bytes: 170_228, sha256: '3adba5410c857ae9e4ec9e2a6eb65428b928783746a7a34fd18679a4d29d83a4' },
  'box-truck': { name: 'Generic box truck', asset: 'a_2092ca0610c749b386c14c07dbaf4236', revision: 'r_d5e37b6d4e7347ac863220cdbd8e49a4', author: 'sonnet-vehicles-b', bytes: 169_772, sha256: 'bea417d293d5e2a32f99795bc2841ef845bd1a94ccc6f9d9e4691c050c5a0e94' },
  'transit-bus': { name: 'Generic transit bus', asset: 'a_a8c030b2570f4ae5aa54eefbd3767f4c', revision: 'r_6ab2ee53817449c59972502fcf008f1a', author: 'sonnet-vehicles-b', bytes: 194_196, sha256: 'c55fbf069668774e0d3dc98db76c3efd05ff630f0ffd2b2cf475579336875617' },
};
/** Owner-requested local review2 children. Original source attribution and g7 pins stay explicit. */
export const VEHICLE_PROVENANCE_G8: Record<VehicleType, VehicleProvenance> = {
  ...VEHICLE_PROVENANCE_G7,
  sedan: { ...VEHICLE_PROVENANCE_G7.sedan, parentRevision: VEHICLE_PROVENANCE_G7.sedan.revision, revision: 'r_ae693b4eb528451886750fcb083d01a4', refinedBy: 'codex-review2-asset-repairs', bytes: 114836, sha256: '0cbc9ad175efac400e79f6180e0ef1d20c8eb2c33681bc46f9c89404333dfdd2' },
  hatchback: { ...VEHICLE_PROVENANCE_G7.hatchback, parentRevision: VEHICLE_PROVENANCE_G7.hatchback.revision, revision: 'r_4978d843f7c44dadbb574b64d78fb158', refinedBy: 'codex-review2-asset-repairs', bytes: 115644, sha256: 'db803129f66a7d6b1d1666a19f942cd2c1066961d28db276267f5861d4980287' },
  suv: { ...VEHICLE_PROVENANCE_G7.suv, parentRevision: VEHICLE_PROVENANCE_G7.suv.revision, revision: 'r_a9760325250e4aef858b823d1dc43b7e', refinedBy: 'codex-review2-asset-repairs', bytes: 117600, sha256: '0026d76e614bd232f7e2e1938236ec93d91d25389d8e1537e3f520f412812ce3' },
};
/** Final r4 local-review inputs: all six source-backed children; approval does not transfer from their parents. */
export const VEHICLE_PROVENANCE: Record<VehicleType, VehicleProvenance> = {
  sedan: { ...VEHICLE_PROVENANCE_G7.sedan, parentRevision: 'r_7680f4bae18445b19dc11dd74b62d3e6', revision: 'r_92ee0ac3d5cf4b258cc97d20ec941461', refinedBy: 'codex-review2-asset-repairs', bytes: 117780, sha256: '1bad1074f0583dfb7c650cfe6e0cae7633b93fb1dc614f50d36ed834d469b212' },
  hatchback: { ...VEHICLE_PROVENANCE_G7.hatchback, parentRevision: 'r_0393505feabd4814907bc4b527194caf', revision: 'r_74f393f06996497a9dce6c5ed50c2d62', refinedBy: 'codex-review2-asset-repairs', bytes: 118752, sha256: '4030ac7f9c3a0ee141189b01615da4016353c6302f0805cf9d66dd756a32a0f0' },
  suv: { ...VEHICLE_PROVENANCE_G7.suv, parentRevision: 'r_97a598c2b8b840dd88ff162264e85860', revision: 'r_b4cc9048731b4c039de0b87ca6e75c17', refinedBy: 'codex-review2-asset-repairs', bytes: 120120, sha256: '3193157586a99fe8710be2303fea754c0b0799557a6d5757528b5b7c83e612b2' },
  pickup: { ...VEHICLE_PROVENANCE_G7.pickup, parentRevision: 'r_b74ac56a93a44c7484890f712df9c64c', revision: 'r_218be4189a1b43e7b307c2263ba4f954', refinedBy: 'codex-review2-asset-repairs', bytes: 170184, sha256: '584240cb33df27714545c6fafc2496f1459bdadad49b2b827be13a8e936b6d8f' },
  'box-truck': { ...VEHICLE_PROVENANCE_G7['box-truck'], parentRevision: 'r_d5e37b6d4e7347ac863220cdbd8e49a4', revision: 'r_538b8a19c46d4086b456e27b32ee7d33', refinedBy: 'codex-review2-asset-repairs', bytes: 169728, sha256: '4cfccfdb2ddd15fc6ab9940e0406fe2b11bbef9d6098d783940cfeb572464420' },
  'transit-bus': { ...VEHICLE_PROVENANCE_G7['transit-bus'], parentRevision: 'r_6ab2ee53817449c59972502fcf008f1a', revision: 'r_85ff097a61384efab445c55372d3b6f5', refinedBy: 'codex-review2-asset-repairs', bytes: 194148, sha256: '14713cb461f2ecb683ea9bace5cc7a79d595aa92d322f86d3831cda7bf647067' },
};
const REVIEW2_VEHICLES = resolve(COMMONS, 'engine-work/local-v09-review/revision2-20260930/vehicles-runtime-final');
/** Exact local-review bytes: staging refuses unpinned exports; the historical API name is retained. */
export function checkApprovedVehicle(type: VehicleType, bytes: Uint8Array): void {
  const p = VEHICLE_PROVENANCE[type], hash = sha256(bytes);
  if (bytes.byteLength !== p.bytes || hash !== p.sha256) throw new Error(`Vehicle ${type}: the source is not the pinned file (${bytes.byteLength} B, SHA-256 ${hash.slice(0, 16)}; pinned ${p.bytes} B, ${p.sha256.slice(0, 16)}). Ask the coordinator before staging a new export.`);
}
/**
 * The licence text staged beside a vehicle whose author delivered none: the Farm pack's designation with the
 * owner's scope qualifier (D-35), naming the asset by its recorded Kiln identifier and revision, with no working
 * names (g7, 2026-09-30, after the site's content review).
 */
export function vehicleLicenceText(type: VehicleType, glbSha256: string): string {
  const p = VEHICLE_PROVENANCE[type];
  return [`${p.name} (${type})`, 'SPDX-License-Identifier: CC0-1.0', '', `Kiln asset: ${p.asset}`, `Saved revision: ${p.revision}`,
    `Delivered GLB SHA-256: ${glbSha256} (${p.parentRevision ? 'saved source-backed child export with standard MSFT_lod' : 'the MSFT_lod rewrite of the saved export; binary chunk unchanged'})`,
    ...(p.parentRevision ? [`Parent saved revision: ${p.parentRevision}`] : []), '',
    'Generic Road Vehicles: authored asset content is designated CC0-1.0 by the project owner.',
    'This covers this Kiln-authored vehicle (its procedural geometry and materials; no third-party model, texture or',
    "brand data), to the extent of the owner's rights.",
    'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/', '',
    'Kiln and any software that opens this file retain their own licenses.', ''].join('\n');
}
/** Runtime intake must carry the licence for the exact selected saved revision and delivered bytes. */
export function checkVehicleLicence(type: VehicleType, text: string): void {
  const pin = VEHICLE_PROVENANCE[type], lines = text.split(/\r?\n/).map(line => line.trim());
  if (!lines.includes('SPDX-License-Identifier: CC0-1.0')) throw new Error(`Vehicle ${type}: licence file is not a CC0 designation`);
  const only = (prefix: string) => { const matches = lines.filter(line => line.startsWith(prefix)); return matches.length === 1 ? matches[0]!.slice(prefix.length).trim() : null; };
  if (only('Kiln asset:') !== pin.asset) throw new Error(`Vehicle ${type}: licence asset differs from the selected asset`);
  if (only('Saved revision:') !== pin.revision) throw new Error(`Vehicle ${type}: licence revision differs from the selected revision`);
  if (only('Delivered GLB SHA-256:')?.split(/\s/)[0] !== pin.sha256) throw new Error(`Vehicle ${type}: licence hash differs from the delivered runtime`);
}
/** Checks the MSFT_lod convention: LOD0 references LOD1 and LOD2, four named wheels at the root. */
export function checkVehicleGlb(type: VehicleType, bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { nodes: { name?: string; children?: number[]; extensions?: { MSFT_lod?: { ids: number[] } } }[]; scenes: { nodes: number[] }[]; extensionsRequired?: string[] };
  const root = json.nodes[json.scenes[0]!.nodes[0]!]!, children = (root.children ?? []).map(i => json.nodes[i]!);
  const lod0 = children.find(n => n.name === 'LOD0'), ids = lod0?.extensions?.MSFT_lod?.ids ?? [];
  if (!lod0 || ids.length !== 2 || json.nodes[ids[0]!]?.name !== 'LOD1' || json.nodes[ids[1]!]?.name !== 'LOD2') throw new Error(`Vehicle ${type}: LOD0 does not reference LOD1 and LOD2 through MSFT_lod`);
  for (const wheel of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) if (!children.some(n => n.name === wheel)) throw new Error(`Vehicle ${type}: ${wheel} missing at the root`);
  if (json.extensionsRequired?.length) throw new Error(`Vehicle ${type}: requires ${json.extensionsRequired.join(', ')}`);
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface TerrainFile { file: string; bytes: number; sha256: string; kind: string; tile_key: string | null; level: string; scene_bounds_xz_m: [number, number, number, number] | null; triangle_count: number; texture_size?: [number, number] | null; resolution?: [number, number]; metres_per_unit?: number; offset_m?: number }
interface TerrainManifest {
  schema: string; tiers: Record<'high' | 'low', { files: string[]; resident_triangles: number; total_download_bytes: number }>;
  files: TerrainFile[]; levels: Record<string, { coverage_half_extent_m: number; inner_hole_half_extent_m: number }>;
  collision: { file: string; bounds_scene_xz_m: [number, number, number, number] };
  validation: { recommended_postcard_pose: { recommended_position_scene_m: [number, number, number]; target_scene_m: [number, number, number]; vertical_fov_degrees: number; camera_ground_clearance_m: number; minimum_line_of_sight_clearance_m: number } };
}

export interface StageOptions { release: string; out?: string; force: boolean; bridge: string; terrain: string; vehicles: VehicleType[]; vehicleRoots: string[] }
export function parseStageOptions(args: readonly string[]): StageOptions {
  const value = (name: string) => { const at = args.indexOf(name); if (at < 0) return undefined; const v = args[at + 1]; if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`); return v; };
  const release = value('--release') ?? STAGED_RELEASE;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(release)) throw new Error('Release must be lowercase letters, digits and dashes');
  if (args.includes('--vehicles')) throw new Error('--vehicles was removed: all six approved vehicles are always staged');
  return { release, out: value('--out'), force: args.includes('--force'), bridge: value('--bridge') ?? DEFAULTS.bridge, terrain: value('--terrain') ?? DEFAULTS.terrain, vehicles: [...VEHICLE_TYPES], vehicleRoots: DEFAULTS.vehicleRoots };
}

/** Every revision GLB in the vehicle review library (asset.glb per revision folder). */
function libraryGlbs(root: string = DEFAULTS.vehicleLibrary): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const asset of readdirSync(root)) {
    const revisions = resolve(root, asset, 'revisions'); if (!existsSync(revisions)) continue;
    for (const revision of readdirSync(revisions)) { const glb = resolve(revisions, revision, 'asset.glb'); if (existsSync(glb)) out.push(glb); }
  }
  return out;
}

/**
 * Revisions from `from` back to `to` through each revision manifest's parentRevision in the author's Kiln
 * asset library (at most eight generations); throws when the chain does not reach `to`.
 */
export function revisionLineage(from: string, to: string, library: string = BRIDGE_LIBRARY): string[] {
  const chain = [from];
  while (chain.at(-1) !== to) {
    if (chain.length > 8) throw new Error(`Bridge revision ${from} does not descend from ${to} within eight generations`);
    const manifest = json<{ assetId: string; revisionId: string; parentRevision?: string | null }>(resolve(library, chain.at(-1)!, 'manifest.json'));
    if (manifest.assetId !== BRIDGE_ASSET || manifest.revisionId !== chain.at(-1)) throw new Error(`Bridge revision manifest ${chain.at(-1)} names ${manifest.assetId} ${manifest.revisionId}`);
    if (!manifest.parentRevision) throw new Error(`Bridge revision ${chain.at(-1)} has no parent; ${from} does not descend from ${to}`);
    chain.push(manifest.parentRevision);
  }
  return chain;
}

/** Scene-level terrain sets per feature tier (Low, Medium, High) built from the terrain pipeline's level names. */
export const TERRAIN_SETS = { high: ['near', 'mid', 'far'], medium: ['near', 'mid_low', 'far'], low: ['near_low', 'mid_low', 'far'] } as const;
export const WATER_SETS = { high: { near: 'near', mid: 'mid' }, medium: { near: 'near', mid: 'mid_low' }, low: { near: 'near_low', mid: 'mid_low' } } as const;

export async function stageGoldenGate(args: readonly string[] = process.argv.slice(2)) {
  const options = parseStageOptions(args);
  const out = resolve(options.out ?? resolve(PACKAGE_ROOT, 'staged', options.release));
  const generated = resolve(PACKAGE_ROOT, '.tmp/stage', options.release);
  for (const source of [options.bridge, options.terrain, ...options.vehicleRoots, DEFAULTS.vehicleLibrary]) {
    const rel = relative(source, out);
    if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error(`Output overlaps a read-only source: ${source}`);
  }
  const files: StagePlan['files'] = [], models: StagePlan['models'] = [], provenance: Record<string, unknown>[] = [];
  const add = (from: string, to: string, expected?: string, meta: Record<string, unknown> = {}) => {
    const bytes = readFileSync(from), actual = sha256(bytes);
    if (expected && expected.replace(/^sha256:/, '') !== actual) throw new Error(`Integrity mismatch for ${from}`);
    files.push({ from, to, sha256: actual }); provenance.push({ path: to, from: relative(COMMONS, from).split('\\').join('/'), bytes: bytes.length, sha256: actual, ...meta });
    return bytes;
  };

  // Bridge (./release.ts): the licence and every runtime verified against the pinned bytes and SHA-256
  // (the fix-up outputs carry no delivery audit), each sidecar against the pinned asset and revision, and
  // the licence's "Fix-up 1" section against the licensed revision and its parent; a newer revision must
  // descend from it through its pinned parent in the author's Kiln asset library. Web and far are staged,
  // as in g1; the full tier is verified and recorded in the staging evidence only.
  const licencePath = resolve(options.bridge, BRIDGE_LICENCE.file), licenceBytes = readFileSync(licencePath);
  if (licenceBytes.length !== BRIDGE_LICENCE.bytes || sha256(licenceBytes) !== BRIDGE_LICENCE.sha256) throw new Error(`Bridge licence ${licencePath}: ${licenceBytes.length} B, SHA-256 ${sha256(licenceBytes).slice(0, 16)}; pinned ${BRIDGE_LICENCE.bytes} B, ${BRIDGE_LICENCE.sha256.slice(0, 16)}`);
  const licence = new TextDecoder().decode(licenceBytes), fixup = licence.indexOf(BRIDGE_LICENCE.section);
  if (!licence.includes('CC0-1.0') || !licence.includes(TRADEMARK_NOTE) || fixup < 0) throw new Error('Bridge licence lacks CC0, the trademark note or its fix-up section');
  const bridgeInputs: Record<string, unknown>[] = [{ file: relative(COMMONS, licencePath).split('\\').join('/'), bytes: licenceBytes.length, sha256: sha256(licenceBytes), section: BRIDGE_LICENCE.section }];
  const checkBridge = (id: string, spec: BridgePin) => {
    const metadata = json<{ source: { revisionId: string; glbSha256: string; assetId: string } }>(resolve(options.bridge, spec.metadata));
    if (metadata.source.revisionId !== spec.revision || metadata.source.assetId !== BRIDGE_ASSET) throw new Error(`Bridge ${id}: sidecar names ${metadata.source.assetId} ${metadata.source.revisionId}, pinned ${BRIDGE_ASSET} ${spec.revision}`);
    const licensed = spec.licensed ?? { revision: spec.revision, parent: spec.parent };
    const named = licence.slice(fixup).split('\n').find(line => line.includes(licensed.revision));
    if (!named?.includes(licensed.parent) || !named.includes(spec.file)) throw new Error(`Bridge ${id}: the licence's ${BRIDGE_LICENCE.section} section does not name ${licensed.revision} (parent ${licensed.parent}, ${spec.file})`);
    const lineage = spec.licensed ? revisionLineage(spec.revision, spec.licensed.revision) : [spec.revision];
    if (spec.licensed && lineage[1] !== spec.parent) throw new Error(`Bridge ${id}: ${spec.revision}'s parent is ${lineage[1]}, pinned ${spec.parent}`);
    const glb = resolve(options.bridge, spec.file), bytes = readFileSync(glb), hash = sha256(bytes);
    if (bytes.length !== spec.bytes || hash !== spec.sha256) throw new Error(`Bridge ${id}: ${bytes.length} B, SHA-256 ${hash.slice(0, 16)}; pinned ${spec.bytes} B, ${spec.sha256.slice(0, 16)}`);
    bridgeInputs.push({ tier: id, file: relative(COMMONS, glb).split('\\').join('/'), revision: spec.revision, parent: spec.parent, lineage, bytes: bytes.length, sha256: hash, sourceGlbSha256: metadata.source.glbSha256, staged: id in BRIDGE_PINS });
    return { ...metadata, lineage };
  };
  checkBridge('full', BRIDGE_FULL);
  add(licencePath, BRIDGE_LICENCE.staged);
  const bridge: Record<string, unknown> = {};
  for (const [id, spec] of Object.entries(BRIDGE_PINS) as [keyof typeof BRIDGE_PINS, BridgePin][]) {
    // kiln-metadata's glbSha256 names the source export; the runtime GLB's own hash is the pinned one.
    const metadata = checkBridge(id, spec);
    add(resolve(options.bridge, spec.file), `bridge/${spec.file}`, spec.sha256, { licence: 'CC0-1.0', revision: spec.revision, parentRevision: spec.parent, lineage: metadata.lineage, sourceGlbSha256: metadata.source.glbSha256 });
    add(resolve(options.bridge, spec.metadata), `bridge/${spec.metadata}`);
    models.push({ id: `bridge-${id}`, to: `bridge/${spec.file}` });
    bridge[id] = { model: `bridge-${id}`, path: `bridge/${spec.file}`, assetId: metadata.source.assetId, revision: spec.revision, parentRevision: spec.parent, lineage: metadata.lineage, bytes: spec.bytes, triangles: spec.triangles, licence: BRIDGE_LICENCE.staged };
  }

  // Scene data (D-21): the package's data files, staged verbatim beside scene.json. The lane polylines
  // must match the staged bridge's roadway.
  const webBridge = files.find(f => f.to === `bridge/${BRIDGE_PINS.web.file}`);
  if (!webBridge) throw new Error('The web bridge must be staged before the scene data');
  const webBytes = new Uint8Array(readFileSync(webBridge.from)), drift = laneDrift(LAYOUT, roadGridFromBridge(webBytes));
  if (!(drift <= .002)) throw new Error(`data/layout.json lane polylines are ${drift} m off the staged bridge's roadway: run scripts/layout.ts --write`);
  // The approach roads start from the staged roadway's end (elevation and grade away from the bridge).
  const ends = deckEnds(webBytes, LAYOUT.bridge.roadEndZ);
  for (const name of ['south', 'north'] as const) {
    const start = LAYOUT.approaches[name].start, end = ends[name];
    if (Math.abs(start.elevation - end.elevation) > .002 || Math.abs(start.grade - end.grade) > 2e-4) throw new Error(`data/layout.json approaches.${name}.start ${JSON.stringify(start)} does not match the staged roadway end ${JSON.stringify(end)}: run scripts/layout.ts --write`);
  }
  for (const path of Object.values(DATA_FILES)) add(resolve(PACKAGE_ROOT, path), path, undefined, { note: 'scene data (D-21)' });
  add(resolve(PACKAGE_ROOT, BEHAVIOUR_FILE), BEHAVIOUR_FILE, undefined, { note: 'behaviour specification for other engines (D-21)' });

  // Terrain: the union of the terrain pipeline's high and low tier file lists, each checked against its manifest entry.
  const terrainManifestPath = resolve(options.terrain, 'manifest.json'), terrain = json<TerrainManifest>(terrainManifestPath);
  if (terrain.schema !== 'golden-gate-terrain/1.1') throw new Error(`Unexpected terrain schema ${terrain.schema}`);
  const byFile = new Map(terrain.files.map(f => [f.file, f]));
  const wanted = [...new Set([...terrain.tiers.high.files, ...terrain.tiers.low.files])].sort();
  for (const file of wanted) {
    const entry = byFile.get(file); if (!entry) throw new Error(`Terrain file ${file} is not in the manifest`);
    const bytes = add(resolve(options.terrain, file), `terrain/${file}`, entry.sha256, { licence: 'public-domain', kind: entry.kind });
    if (bytes.length !== entry.bytes) throw new Error(`Terrain ${file}: byte length differs from its manifest`);
  }
  add(terrainManifestPath, 'terrain/manifest.json', undefined, { note: 'terrain streaming contract; cannot list its own hash' });
  // D-21: the web tiles are a derivative of the canonical decoder-free tiles in source-data/terrain.
  // Without a pinned meshopt encoder (GG-005) staging proves each one equivalent instead of producing it.
  const canonical = await verifyCanonical(key => resolve(options.terrain, 'tiles', `${key}.glb`));
  const tile = (key: string) => {
    const mesh = byFile.get(`tiles/${key}.glb`), albedo = byFile.get(`tiles/${key}_albedo.webp`), normal = byFile.get(`tiles/${key}_normal.webp`);
    if (!mesh || !albedo || !normal || !mesh.scene_bounds_xz_m) throw new Error(`Terrain tile ${key} is incomplete`);
    return { key, bounds: mesh.scene_bounds_xz_m, glb: `terrain/${mesh.file}`, albedo: `terrain/${albedo.file}`, normal: `terrain/${normal.file}`, triangles: mesh.triangle_count, bytes: mesh.bytes + albedo.bytes + normal.bytes, albedoSize: albedo.texture_size?.[0] ?? 0 };
  };
  const levels: Record<string, unknown> = {};
  for (const level of new Set(Object.values(TERRAIN_SETS).flat())) {
    const info = terrain.levels[level]; if (!info) throw new Error(`Terrain level ${level} is missing`);
    levels[level] = { half: info.coverage_half_extent_m, hole: info.inner_hole_half_extent_m, tiles: ['00', '01', '10', '11'].map(q => tile(`${level}_${q}`)) };
  }
  const waterLevel = (level: string) => {
    const entry = (kind: string, name: string) => { const f = byFile.get(`water/${level}_${name}.png`); if (!f || f.kind !== kind || !f.scene_bounds_xz_m || !f.resolution) throw new Error(`Water ${level} ${kind} is missing`); return f; };
    const depth = entry('depth', 'depth_u16'), shore = entry('shore_distance', 'shore_distance_u16'), mask = entry('land_mask', 'land_mask');
    return { level, bounds: depth.scene_bounds_xz_m, size: depth.resolution, depth: { path: `terrain/${depth.file}`, scale: depth.metres_per_unit, offset: depth.offset_m },
      shore: { path: `terrain/${shore.file}`, scale: shore.metres_per_unit, offset: shore.offset_m }, mask: `terrain/${mask.file}` };
  };
  const water = Object.fromEntries(Object.entries(WATER_SETS).map(([tier, set]) => [tier, { near: waterLevel(set.near), mid: waterLevel(set.mid) }]));
  const collision = byFile.get(terrain.collision.file); if (!collision) throw new Error('Collision grid missing');
  const pose = terrain.validation.recommended_postcard_pose;
  const terrainIndex = { schema: terrain.schema, levels, sets: TERRAIN_SETS, water,
    collision: { path: `terrain/${collision.file}`, bounds: terrain.collision.bounds_scene_xz_m, metresPerUnit: collision.metres_per_unit ?? .05, size: collision.resolution },
    postcard: { position: pose.recommended_position_scene_m, target: pose.target_scene_m, fov: pose.vertical_fov_degrees, groundClearance: pose.camera_ground_clearance_m, sightlineClearance: pose.minimum_line_of_sight_clearance_m },
    downloads: { high: terrain.tiers.high.total_download_bytes, low: terrain.tiers.low.total_download_bytes }, triangles: { high: terrain.tiers.high.resident_triangles, low: terrain.tiers.low.resident_triangles } };

  // Generated files land here (the runtime index, notices, credits and generated vehicle licences).
  mkdirSync(resolve(generated, 'data'), { recursive: true }); mkdirSync(resolve(generated, 'licenses/vehicles'), { recursive: true });
  const write = (path: string, text: string, to: string, meta: Record<string, unknown> = {}) => { const target = resolve(generated, path); writeFileSync(target, text); add(target, to, undefined, { generated: true, ...meta }); };

  // Vehicles: only the ones the coordinator declared ready, each with its GLB (MSFT_lod checked) and licence.
  const vehicles: Record<string, unknown> = {};
  for (const type of options.vehicles) {
    // The approved bytes: the author's file while it is unchanged, else the identical copy in the review library.
    const dir = options.vehicleRoots.map(root => resolve(root, type)).find(d => existsSync(resolve(d, `${type}.glb`)));
    if (!dir) throw new Error(`Vehicle ${type}: no GLB found`);
    const glbPath = [resolve(REVIEW2_VEHICLES, 'models', `${type}.glb`), resolve(dir, `${type}.glb`), ...libraryGlbs()].filter(existsSync).find(path => { const bytes = readFileSync(path); return bytes.byteLength === VEHICLE_PROVENANCE[type].bytes && sha256(bytes) === VEHICLE_PROVENANCE[type].sha256; }) ?? resolve(dir, `${type}.glb`);
    const glbBytes = readFileSync(glbPath); checkApprovedVehicle(type, glbBytes); checkVehicleGlb(type, glbBytes);
    const provenance = VEHICLE_PROVENANCE[type];
    if (glbPath !== resolve(dir, `${type}.glb`)) console.log(`Vehicle ${type}: staging the exact pinned runtime ${relative(COMMONS, glbPath)}`);
    add(glbPath, `vehicles/${type}.glb`, undefined, { licence: 'CC0-1.0', revision: provenance.revision, asset: provenance.asset, lod: 'MSFT_lod', ...(provenance.parentRevision ? { parentRevision: provenance.parentRevision, author: provenance.author, refinedBy: provenance.refinedBy } : {}) });
    const licence = [resolve(REVIEW2_VEHICLES, 'licenses', `${type}.ASSET-LICENSE.txt`), ...[`${type}.ASSET-LICENSE.txt`, 'ASSET-LICENSE.txt', `${type}-runtime.ASSET-LICENSE.txt`].map(n => resolve(dir, n))].find(p => existsSync(p));
    if (licence) {
      checkVehicleLicence(type, readFileSync(licence, 'utf8'));
      add(licence, `licenses/vehicles/${type}.ASSET-LICENSE.txt`);
    } else write(`licenses/vehicles/${type}.ASSET-LICENSE.txt`, vehicleLicenceText(type, sha256(glbBytes)), `licenses/vehicles/${type}.ASSET-LICENSE.txt`, { note: 'generated: the author folder ships no licence file' });
    models.push({ id: `vehicle-${type}`, to: `vehicles/${type}.glb` });
    vehicles[type] = { model: `vehicle-${type}`, path: `vehicles/${type}.glb`, licence: `licenses/vehicles/${type}.ASSET-LICENSE.txt`, asset: provenance.asset, revision: provenance.revision, licenceGenerated: !licence };
  }

  const credits = goldenGateCredits(Object.keys(vehicles) as VehicleType[]);
  write('licenses/FEDERAL-DATA.txt', FEDERAL_NOTICE, 'licenses/FEDERAL-DATA.txt');
  write('licenses/TRADEMARK-NOTICE.txt', `${TRADEMARK_NOTE}\n`, 'licenses/TRADEMARK-NOTICE.txt');
  const index = { schema: 'golden-gate-scene/1', release: options.release, data: DATA_FILES, behaviour: BEHAVIOUR_FILE, bridge, terrain: terrainIndex, vehicles };
  write('data/scene.json', JSON.stringify(index, null, 2) + '\n', 'data/scene.json');
  const creditsFile = { schema: 'golden-gate-credits/1', release: options.release, credits, trademark: TRADEMARK_NOTE,
    files: provenance.filter(p => p.licence).map(p => ({ path: p.path, licence: p.licence, revision: p.revision })),
    notes: [
      ...(Object.values(vehicles).some(v => (v as { licenceGenerated: boolean }).licenceGenerated) ? ['Vehicle licence files marked generated were written by the staging script under the task rule "CC0 for Kiln-authored assets", because the author folders ship none.'] : []),
    ] };
  write('credits.json', JSON.stringify(creditsFile, null, 2) + '\n', 'credits.json');

  const result = stageFiles({ id: 'golden-gate', release: options.release, three: '0.186.1', out, force: options.force, models,
    data: { scene: 'data/scene.json', collision: `terrain/${collision.file}`, ...DATA_FILES }, files, credits,
    source: { bridge: Object.fromEntries(Object.entries(BRIDGE_PINS).map(([k, v]) => [k, v.revision])), terrainSchema: terrain.schema, terrainManifestSha256: sha256(readFileSync(terrainManifestPath)), vehicles: Object.keys(vehicles) } });
  const verification = verifyStaged(out); if (!verification.ok) throw new Error(verification.problems.join('\n'));
  const tierBytes = (tier: keyof typeof TERRAIN_SETS) => {
    const paths = new Set<string>(['pack.json', 'data/scene.json', ...Object.values(DATA_FILES), 'credits.json', `terrain/${collision.file}`, ...models.map(m => m.to)]);
    for (const level of TERRAIN_SETS[tier]) for (const t of (levels[level] as { tiles: ReturnType<typeof tile>[] }).tiles) { paths.add(t.glb); paths.add(t.albedo); paths.add(t.normal); }
    for (const w of Object.values(water[tier] as Record<string, ReturnType<typeof waterLevel>>)) { paths.add(w.depth.path); paths.add(w.shore.path); }
    return [...paths].reduce((sum, p) => sum + (p === 'pack.json' ? readFileSync(resolve(out, 'pack.json')).length : (files.find(f => f.to === p) ? readFileSync(files.find(f => f.to === p)!.from).length : 0)), 0);
  };
  const canonicalCheck = { tiles: canonical.length, triangles: canonical.reduce((s, c) => s + c.triangles[0], 0), worstPositionSteps: Math.max(...canonical.map(c => c.positionError)), worstUv: Math.max(...canonical.map(c => c.uvError)) };
  const report = { release: options.release, out, ...result, bridgeInputs, canonicalTerrain: canonicalCheck, downloadBytesByTier: { high: tierBytes('high'), medium: tierBytes('medium'), low: tierBytes('low') }, vehicles: Object.keys(vehicles),
    packSha256: sha256(readFileSync(resolve(out, 'pack.json'))), sumsSha256: sha256(readFileSync(resolve(out, 'SHA256SUMS'))), verification };
  mkdirSync(resolve(PACKAGE_ROOT, 'evidence/staging'), { recursive: true });
  writeFileSync(resolve(PACKAGE_ROOT, 'evidence/staging', `${options.release}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

export function goldenGateCredits(vehicles: readonly VehicleType[]): CreditEntry[] {
  return [
    { name: `Golden Gate Bridge model (web runtime, Kiln revision ${BRIDGE_PINS.web.revision}, fix-up 1)`, licence: 'CC0-1.0', note: `Kiln-authored model; ${BRIDGE_LICENCE.staged}. ${TRADEMARK_NOTE}` },
    { name: `Golden Gate Bridge model (far runtime, Kiln revision ${BRIDGE_PINS.far.revision}, fix-up 1)`, licence: 'CC0-1.0', note: `Kiln-authored model; ${BRIDGE_LICENCE.staged}. ${TRADEMARK_NOTE}` },
    ...vehicles.map(v => ({ name: `Vehicle: ${v}`, licence: 'CC0-1.0', note: `Kiln-authored vehicle; licenses/vehicles/${v}.ASSET-LICENSE.txt.` })),
    { name: 'Terrain and bathymetry: NOAA NCEI CUDEM ninth-arc-second topobathy (2014)', licence: 'Public domain (US federal government data)', holder: 'NOAA National Centers for Environmental Information', source: 'https://coast.noaa.gov/htdata/raster2/elevation/NCEI_ninth_Topobathy_2014_8483/CA/index.html', note: 'Land and bay floor, shoreline mask and water depth. See licenses/FEDERAL-DATA.txt.' },
    { name: 'Near-shore land relief: USGS 3DEP 1 m lidar elevation', licence: 'Public domain (US federal government data)', holder: 'U.S. Geological Survey', source: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer', note: 'USGS 1 Meter 10 x54y419 CA_SanFrancisco_B23 and neighbouring exports. See licenses/FEDERAL-DATA.txt.' },
    { name: 'Ground imagery: USDA NAIP through the USGS NAIP ImageServer', licence: 'Public domain (US federal government data)', holder: 'U.S. Department of Agriculture; U.S. Geological Survey', source: 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer', note: 'Colour-balanced terrain albedo (automated gain, saturation and contrast only). See licenses/FEDERAL-DATA.txt.' },
    { name: 'Survey frame and datum: NOAA NGS control marks HT3032, HT3028, HT3034, HT3070 and NOAA tide station 9414290', licence: 'Public domain (US federal government data)', holder: 'NOAA National Geodetic Survey; NOAA CO-OPS', source: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9414290/datums.json?units=metric', note: 'Scene Y = 0 is local mean sea level at San Francisco (Presidio). See licenses/FEDERAL-DATA.txt.' },
  ];
}

const FEDERAL_NOTICE = `Golden Gate scene: federal data sources and public-domain notices

The terrain, bathymetry, water maps and ground imagery in terrain/ were built by the
Golden Gate terrain pipeline (golden-gate-scene/terrain, round 2, accepted 2026-09-29)
entirely from US federal agency data. Its REPORT.md and sources.json record every download.

Sources
- NOAA NCEI CUDEM ninth-arc-second topobathy (2014), nine raster tiles: continuous land and bay
  floor, shoreline mask and water depth. NAD83 + NAVD88 (EPSG:5498).
  https://coast.noaa.gov/htdata/raster2/elevation/NCEI_ninth_Topobathy_2014_8483/CA/index.html
- USGS 3DEP elevation ImageServer, four clipped exports: lidar-derived near-ring land relief
  ("USGS 1 Meter 10 x54y419 CA_SanFrancisco_B23" at the bridge).
  https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
- USDA NAIP through the USGS NAIP ImageServer, twelve clipped exports: ground colour.
  https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer
- NOAA NGS control marks HT3032 (south tower), HT3028 (north tower), HT3034 and HT3070, and the
  NOAA CO-OPS datums of tide station 9414290 (San Francisco/Presidio): survey frame and vertical datum.
  https://geodesy.noaa.gov/cgi-bin/ds_mark.prl?PidBox=HT3032
  https://geodesy.noaa.gov/cgi-bin/ds_mark.prl?PidBox=HT3028
  https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9414290/datums.json?units=metric

Public-domain notices (as quoted in the terrain REPORT.md)
- USGS: "Map services and data downloaded from The National Map are free and in the public domain."
  https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map
- NOAA: "The information on government web pages is in the public domain unless specifically
  annotated otherwise (copyright may be held elsewhere) and may therefore be used freely by the public."
  https://sos.noaa.gov/copyright/

No Google, Apple, Bing, Mapbox, Esri basemap or OpenStreetMap data is included.
`;

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try { await stageGoldenGate(); } catch (error) { console.error(error); process.exitCode = 1; }
}
