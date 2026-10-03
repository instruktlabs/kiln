// SPDX-License-Identifier: MIT
// Foundry Floor campus staging (FF-C1 item 9): release `ffc1` at staged/ffc1/, one kiln.scene-pack/1 folder holding
//   - everything staged/ff2 holds (the twin's data files, the asset map, the warm start, the accepted interior GLBs),
//     read from the same sources and pins as FF2's staging (scripts/stage.ts exports) and compared file by file with
//     staged/ff2/pack.json. `stageFoundryFloor` is never called, so staged/ff2 and staged/generated-ff2 are never
//     written (the site's round 3 builder reads staged/ff2);
//   - the twelve campus structure exports at models/structures/<file>, verified three ways by scripts/structures.ts
//     (the pins, the newest revision of the author's Kiln asset, its manifest), pack models under the asset map's
//     structure ids; the scene merges them by material at load, with the materials exactly as exported;
//   - the campus data (pack data `campus`, data/campus.json from scripts/build-campus.ts) and, once written, the
//     drive's data (pack data `driving`, data/driving.json);
//   - the six accepted vehicles as Golden Gate stages them: the approved bytes of the author outputs (pins copied from
//     packages/golden-gate/scripts/stage.ts, read-only), MSFT_lod and the four root wheels checked, at
//     models/vehicles/<type>.glb as pack models `vehicle-<type>`, with Golden Gate's licence texts
//     (packages/golden-gate/staged/g4/licenses/vehicles/, read-only) at licenses/vehicles/;
//   - licenses/ASSET-LICENSE.txt extended with the structures and vehicles (author and revision per model; CC0-1.0 with
//     the Farm pack's scope qualifier, DECISIONS D-35), generated in staged/generated-ffc1/.
// Every file gets its SHA-256 in pack.json and SHA256SUMS (the kit's stageFiles). Prints every file's bytes and hash.
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/stage-campus.ts [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageFiles, verifyStaged } from '@kiln-scenes/scene-kit/staging';
import type { CreditEntry, PackManifest } from '@kiln-scenes/scene-kit';
import { acceptedModels, assetCredits, DATA_FILES, FAB_DATA_ENTRIES, LICENCE_PATH, PACKAGE_ROOT, readAssetMap, STAGED_DIR } from './stage';
import type { StagedModel } from './stage';
import { sha256, structureSource, STRUCTURES, verifyStructure } from './structures';

export const CAMPUS_RELEASE = 'ffc1';
export const CAMPUS_STAGED_DIR = resolve(PACKAGE_ROOT, 'staged/ffc1');
/** Generated inputs (the extended licence text) are written here, outside the pack folder, and staged like any file. */
export const CAMPUS_GENERATED_DIR = resolve(PACKAGE_ROOT, 'staged/generated-ffc1');
const COMMONS = resolve(PACKAGE_ROOT, '../../..');
const GG_LICENCES = resolve(PACKAGE_ROOT, '../golden-gate/staged/g4/licenses/vehicles');
/** The campus's own data (D-21), pack data ids to pack paths. The drive's file joins when it is written. */
export const CAMPUS_DATA_ENTRIES: Record<string, string> = { campus: 'data/campus.json', driving: 'data/driving.json' };

export const VEHICLE_TYPES = ['sedan', 'hatchback', 'suv', 'pickup', 'box-truck', 'transit-bus'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];
/** The six approved vehicles (owner 2026-09-29 12:45; coordinator 13:18 "final"), copied from Golden Gate's staging
 *  pins (read-only reference): staging refuses any other bytes, so a later re-export is never staged unreviewed. */
export const VEHICLES: Record<VehicleType, { name: string; asset: string; revision: string; author: string; bytes: number; sha256: string }> = {
  sedan: { name: 'Generic sedan', asset: 'generic-sedan', revision: 'r_1cb27a0c14d44e48afff84db23013dad', author: 'sonnet-vehicles-a', bytes: 259_596, sha256: 'e05943cd76110e6ed7e3210b9bc33ede40d48371def8439ca1bc9c8dcabf8e96' },
  hatchback: { name: 'Generic hatchback', asset: 'generic-hatchback', revision: 'r_105b27d31fe44f2aa188a333e19e3977', author: 'sonnet-vehicles-a', bytes: 262_464, sha256: 'c2f941f89816b5d8a48bb2d9481a00411c2af45591d26ea46a99399d385a3bfa' },
  suv: { name: 'Generic SUV', asset: 'generic-suv', revision: 'r_8261935e39684470b65549b1c39142fd', author: 'sonnet-vehicles-a', bytes: 266_964, sha256: 'f46d4535adf8a2730ff832fba59476db2cc63b0dece497aebc1651ae53a6d28d' },
  pickup: { name: 'Generic pickup truck', asset: 'a_557b9bd6c2c34340804e802081a9b983', revision: 'r_b74ac56a93a44c7484890f712df9c64c', author: 'sonnet-vehicles-b', bytes: 170_228, sha256: '3adba5410c857ae9e4ec9e2a6eb65428b928783746a7a34fd18679a4d29d83a4' },
  'box-truck': { name: 'Generic box truck', asset: 'a_2092ca0610c749b386c14c07dbaf4236', revision: 'r_d5e37b6d4e7347ac863220cdbd8e49a4', author: 'sonnet-vehicles-b', bytes: 169_772, sha256: 'bea417d293d5e2a32f99795bc2841ef845bd1a94ccc6f9d9e4691c050c5a0e94' },
  'transit-bus': { name: 'Generic transit bus', asset: 'a_a8c030b2570f4ae5aa54eefbd3767f4c', revision: 'r_6ab2ee53817449c59972502fcf008f1a', author: 'sonnet-vehicles-b', bytes: 194_196, sha256: 'c55fbf069668774e0d3dc98db76c3efd05ff630f0ffd2b2cf475579336875617' },
};
export const vehicleModelId = (type: VehicleType) => `vehicle-${type}`;
export const vehiclePath = (type: VehicleType) => `models/vehicles/${type}.glb`;
export const vehicleLicencePath = (type: VehicleType) => `licenses/vehicles/${type}.ASSET-LICENSE.txt`;

interface GlbJson { nodes: { name?: string; children?: number[]; extensions?: { MSFT_lod?: { ids: number[] } } }[]; scenes: { nodes: number[] }[]; extensionsRequired?: string[] }
function glbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GlbJson;
}
/** Golden Gate's vehicle convention: LOD0 names LOD1 and LOD2 through MSFT_lod, four named wheels at the root, nothing
 *  required. The drive turns the wheels by these names. */
export function checkVehicleGlb(type: VehicleType, bytes: Uint8Array): { root: string; nodes: number } {
  const json = glbJson(bytes), root = json.nodes[json.scenes[0]!.nodes[0]!]!, children = (root.children ?? []).map(i => json.nodes[i]!);
  const lod0 = children.find(n => n.name === 'LOD0'), ids = lod0?.extensions?.MSFT_lod?.ids ?? [];
  if (!lod0 || ids.length !== 2 || json.nodes[ids[0]!]?.name !== 'LOD1' || json.nodes[ids[1]!]?.name !== 'LOD2') throw new Error(`Vehicle ${type}: LOD0 does not reference LOD1 and LOD2 through MSFT_lod`);
  for (const wheel of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) if (!children.some(n => n.name === wheel)) throw new Error(`Vehicle ${type}: ${wheel} missing at the root`);
  if (json.extensionsRequired?.length) throw new Error(`Vehicle ${type}: requires ${json.extensionsRequired.join(', ')}`);
  return { root: root.name ?? '', nodes: json.nodes.length };
}

export interface CampusModel { id: string; group: 'structure' | 'vehicle'; name: string; asset: string; to: string; from: string; bytes: number; sha256: string; revision: string; author: string }

/** The twelve structures, each verified (pins, newest library revision, manifest) and read from its author output. */
export function structureModels(): CampusModel[] {
  const map = readAssetMap() as ReturnType<typeof readAssetMap> & { structures?: Record<string, { glb: string; source: { revision: string } }> };
  return Object.entries(STRUCTURES).map(([id, spec]) => {
    const entry = map.structures?.[id];
    if (!entry) throw new Error(`${id}: missing from the asset map's structures section (run scripts/inspect-assets.ts --write)`);
    const verified = verifyStructure(id, spec);
    if (entry.source.revision !== verified.revision) throw new Error(`${id}: the asset map records ${entry.source.revision}, the library's newest is ${verified.revision}`);
    return { id, group: 'structure', name: id, asset: spec.asset, to: entry.glb, from: structureSource(spec), bytes: verified.bytes.length, sha256: sha256(verified.bytes), revision: verified.revision, author: spec.author };
  });
}

/** The six vehicles: the author outputs at the approved bytes, the convention checked. */
export function vehicleModels(): CampusModel[] {
  return VEHICLE_TYPES.map(type => {
    const p = VEHICLES[type], from = resolve(COMMONS, 'showcase/authors', p.author, 'outputs', type, `${type}.glb`);
    if (!existsSync(from)) throw new Error(`Vehicle ${type}: ${from} is missing`);
    const bytes = new Uint8Array(readFileSync(from)), hash = sha256(bytes);
    if (bytes.length !== p.bytes || hash !== p.sha256) throw new Error(`Vehicle ${type}: ${from} is ${bytes.length} B, SHA-256 ${hash}; approved ${p.bytes} B, ${p.sha256}. Ask the coordinator before staging a new export.`);
    checkVehicleGlb(type, bytes);
    return { id: vehicleModelId(type), group: 'vehicle', name: p.name, asset: p.asset, to: vehiclePath(type), from, bytes: bytes.length, sha256: hash, revision: p.revision, author: p.author };
  });
}

/** Golden Gate's staged licence text for a vehicle, checked to be the CC0 declaration of exactly the approved file. */
export function vehicleLicence(type: VehicleType): { from: string; text: string } {
  const from = resolve(GG_LICENCES, `${type}.ASSET-LICENSE.txt`), p = VEHICLES[type];
  if (!existsSync(from)) throw new Error(`Vehicle ${type}: Golden Gate's licence text ${from} is missing`);
  const text = readFileSync(from, 'utf8');
  for (const needle of ['SPDX-License-Identifier: CC0-1.0', `Saved revision: ${p.revision}`, `Delivered GLB SHA-256: ${p.sha256}`, `Author folder: showcase/authors/${p.author}`]) {
    if (!text.includes(needle)) throw new Error(`Vehicle ${type}: ${from} does not state "${needle}"`);
  }
  return { from, text };
}

const modelLine = (m: { to: string; asset: string; revision: string; author: string; sha256: string }) => `${m.to}  ${m.asset}  Kiln revision ${m.revision}  showcase/authors/${m.author}  SHA-256 ${m.sha256}`;

/** FF2's declaration (scripts/stage.ts assetLicenceText) extended with the campus structures and the vehicles. */
export function campusLicenceText(interior: readonly StagedModel[], structures: readonly CampusModel[], vehicles: readonly CampusModel[], release: string): string {
  return [
    'Foundry Floor assets', 'SPDX-License-Identifier: CC0-1.0', '',
    `Release: ${release}`, '',
    'Foundry Floor: authored asset content is designated CC0-1.0 by the project owner.',
    'This covers the Kiln-authored models listed below (their procedural geometry, materials, animation clips and',
    'locators; no third-party model, texture or brand data), to the extent of the owner\'s rights.',
    'The campus structures and the vehicles carry the same licence and scope as the Farm pack (DECISIONS D-35).',
    'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/', '',
    'Interior twin (FF2):',
    ...interior.map(modelLine), '',
    'Campus structures (S1 to S5, accepted exports):',
    ...structures.map(modelLine), '',
    'Vehicles (the six accepted vehicles as Golden Gate stages them; their own declarations in licenses/vehicles/):',
    ...vehicles.map(modelLine), '',
    'Scene code and third-party software retain their separate software licence notices.',
    'This designation does not relicense Kiln or its third-party dependencies.',
    'Generated by the Foundry Floor campus staging script because the author folders ship no licence file.', '',
  ].join('\n');
}

export function campusCredits(structures: readonly CampusModel[], vehicles: readonly CampusModel[]): CreditEntry[] {
  return [
    ...structures.map(m => ({
      name: `${m.name} (Kiln-authored campus structure)`, licence: 'CC0-1.0', holder: 'Kiln Commons',
      source: `Kiln revision ${m.revision}, showcase/authors/${m.author}`,
      note: 'Authored asset content designated CC0-1.0 by the project owner (D-35). Exact declaration: licenses/ASSET-LICENSE.txt',
    })),
    ...vehicles.map(m => ({
      name: `${m.name} (Kiln-authored vehicle)`, licence: 'CC0-1.0', holder: 'Kiln Commons',
      source: `Kiln revision ${m.revision}, showcase/authors/${m.author}`,
      note: `Authored asset content designated CC0-1.0 (D-35). Exact declarations: licenses/ASSET-LICENSE.txt and ${vehicleLicencePath(m.id.replace(/^vehicle-/, '') as VehicleType)}`,
    })),
  ];
}

/** Every file staged/ff2 holds is in ffc1 with the same bytes, except the two FF-C1 extends (each checked here). */
export function compareWithFf2(ffc1Dir: string, ff2Dir: string = STAGED_DIR) {
  const ff2 = JSON.parse(readFileSync(resolve(ff2Dir, 'pack.json'), 'utf8')) as PackManifest;
  const ffc1 = JSON.parse(readFileSync(resolve(ffc1Dir, 'pack.json'), 'utf8')) as PackManifest;
  const byPath = new Map(ffc1.files.map(f => [f.path, f]));
  const same: string[] = [], changed: { path: string; ff2: { bytes: number; sha256: string }; ffc1: { bytes: number; sha256: string }; why: string }[] = [], problems: string[] = [];
  for (const f of ff2.files) {
    const g = byPath.get(f.path);
    if (!g) { problems.push(`${f.path}: in staged/ff2, missing from ffc1`); continue; }
    if (g.sha256 === f.sha256 && g.bytes === f.bytes) { same.push(f.path); continue; }
    if (f.path === 'data/assets.json') {
      const a = JSON.parse(readFileSync(resolve(ff2Dir, f.path), 'utf8')) as Record<string, unknown>, b = JSON.parse(readFileSync(resolve(ffc1Dir, f.path), 'utf8')) as Record<string, unknown>;
      const differing = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      const allowed = differing.every(k => k === 'structures');
      if (!allowed) problems.push(`data/assets.json: FF2 sections differ (${differing.join(', ')})`);
      changed.push({ path: f.path, ff2: { bytes: f.bytes, sha256: f.sha256 }, ffc1: { bytes: g.bytes, sha256: g.sha256 }, why: `adds the structures section (FF-C1 step 1a); every other section equal when parsed (differing: ${differing.join(', ') || 'none'})` });
    } else if (f.path === LICENCE_PATH) {
      const a = readFileSync(resolve(ff2Dir, f.path), 'utf8'), b = readFileSync(resolve(ffc1Dir, f.path), 'utf8');
      const lines = a.split('\n').filter(l => l.startsWith('models/'));
      const missing = lines.filter(l => !b.includes(l));
      if (missing.length) problems.push(`${LICENCE_PATH}: ${missing.length} FF2 model lines missing`);
      changed.push({ path: f.path, ff2: { bytes: f.bytes, sha256: f.sha256 }, ffc1: { bytes: g.bytes, sha256: g.sha256 }, why: `extended with the structures and vehicles; all ${lines.length} FF2 model lines kept verbatim` });
    } else problems.push(`${f.path}: differs from staged/ff2 (${f.sha256} vs ${g.sha256})`);
  }
  const ff2Models = new Set(ff2.models.map(m => `${m.id} ${m.path}`)), ffc1Models = new Set(ffc1.models.map(m => `${m.id} ${m.path}`));
  for (const m of ff2Models) if (!ffc1Models.has(m)) problems.push(`model ${m}: in staged/ff2, missing from ffc1`);
  for (const [id, path] of Object.entries(ff2.data)) if (ffc1.data[id] !== path) problems.push(`data ${id}: ${path} in staged/ff2, ${ffc1.data[id] ?? 'missing'} in ffc1`);
  return { ff2PackSha256: sha256(readFileSync(resolve(ff2Dir, 'pack.json'))), ff2Files: ff2.files.length, same: same.length, changed, problems };
}

export interface CampusStageOptions { out?: string; force?: boolean; release?: string }

export function stageCampus(options: CampusStageOptions = {}) {
  const map = readAssetMap(), release = options.release ?? CAMPUS_RELEASE, out = options.out ?? CAMPUS_STAGED_DIR;
  if (resolve(out) === resolve(STAGED_DIR)) throw new Error('The campus never stages into staged/ff2');
  const config = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'data/sim-config.json'), 'utf8')) as { seeds: { snapshots: number[] } };
  const interior = acceptedModels(map), structures = structureModels(), vehicles = vehicleModels();
  const licences = VEHICLE_TYPES.map(type => ({ type, ...vehicleLicence(type) }));
  mkdirSync(resolve(CAMPUS_GENERATED_DIR, 'licenses'), { recursive: true });
  const licenceFrom = resolve(CAMPUS_GENERATED_DIR, LICENCE_PATH);
  writeFileSync(licenceFrom, campusLicenceText(interior, structures, vehicles, release));
  const warm = config.seeds.snapshots.map(seed => ({ id: `warm-seed-${seed}`, to: `data/warm/seed-${seed}.json`, from: resolve(PACKAGE_ROOT, `data/warm/seed-${seed}.json`) }));
  const campusData = Object.entries(CAMPUS_DATA_ENTRIES).map(([id, to]) => ({ id, to, from: resolve(PACKAGE_ROOT, to) })).filter(d => existsSync(d.from));
  if (!campusData.some(d => d.id === 'campus')) throw new Error('data/campus.json is missing (run scripts/build-campus.ts --write)');
  const files = [
    ...DATA_FILES.map(name => ({ from: resolve(PACKAGE_ROOT, 'data', name), to: `data/${name}` })),
    ...warm.map(w => ({ from: w.from, to: w.to })),
    ...interior.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...campusData.map(d => ({ from: d.from, to: d.to })),
    ...structures.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...vehicles.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...licences.map(l => ({ from: l.from, to: vehicleLicencePath(l.type) })),
    { from: licenceFrom, to: LICENCE_PATH },
  ];
  const result = stageFiles({
    id: 'foundry-floor', release, three: '0.186.1', out, force: options.force,
    models: [
      ...interior.filter(m => m.placed).map(m => ({ id: m.id, to: m.to })),
      ...structures.map(m => ({ id: m.id, to: m.to })),
      ...vehicles.map(m => ({ id: m.id, to: m.to })),
    ],
    data: { 'asset-map': 'data/assets.json', ...FAB_DATA_ENTRIES, ...Object.fromEntries(warm.map(w => [w.id, w.to])), ...Object.fromEntries(campusData.map(d => [d.id, d.to])) },
    files, credits: [...assetCredits(interior, map), ...campusCredits(structures, vehicles)],
    source: {
      stage: 'FF-C1 campus: the FF2 interior pack plus the campus structures, the campus data and the vehicles',
      assetMap: sha256(readFileSync(resolve(PACKAGE_ROOT, 'data/assets.json'))),
      campusData: Object.fromEntries(campusData.map(d => [d.id, sha256(readFileSync(d.from))])),
      warmStarts: Object.fromEntries(warm.map(w => [w.id, sha256(readFileSync(w.from))])),
      models: Object.fromEntries([...interior, ...structures, ...vehicles].map(m => [m.id, { revision: m.revision, bytes: m.bytes, sha256: m.sha256 }])),
      structures: Object.fromEntries(structures.map(m => [m.id, { asset: m.asset, author: m.author, revision: m.revision, file: m.to }])),
      vehicles: Object.fromEntries(vehicles.map(m => [m.id, { asset: m.asset, author: m.author, revision: m.revision, file: m.to, licence: vehicleLicencePath(m.id.replace(/^vehicle-/, '') as VehicleType), licenceFrom: 'packages/golden-gate/staged/g4/licenses/vehicles (Golden Gate\'s generated CC0 declaration)' }])),
      pending: Object.entries(map.entities).filter(([, e]) => !e.glb).map(([id]) => id),
      unplaced: interior.filter(m => !m.placed).map(m => ({ id: m.id, file: m.to, why: 'accepted and staged as a pack file; no instance in FF2 (data/assets.json), so the scene does not fetch it' })),
    },
  });
  const verification = verifyStaged(out);
  if (!verification.ok) throw new Error(verification.problems.join('\n'));
  for (const m of [...interior, ...structures, ...vehicles]) {
    const copy = new Uint8Array(readFileSync(resolve(out, m.to)));
    if (copy.length !== m.bytes || sha256(copy) !== m.sha256) throw new Error(`${m.id}: the staged copy differs from the pins`);
  }
  const ff2 = compareWithFf2(out);
  if (ff2.problems.length) throw new Error(ff2.problems.join('\n'));
  const manifest = JSON.parse(readFileSync(resolve(out, 'pack.json'), 'utf8')) as PackManifest;
  const sum = (list: readonly { bytes: number }[]) => list.reduce((s, m) => s + m.bytes, 0);
  const loadedInterior = interior.filter(m => m.placed);
  return {
    out, release, ...result, packSha256: sha256(readFileSync(resolve(out, 'pack.json'))), verification,
    models: manifest.models.length,
    groups: {
      interior: { staged: interior.length, loaded: loadedInterior.length, stagedBytes: sum(interior), loadedBytes: sum(loadedInterior) },
      structures: { loaded: structures.length, bytes: sum(structures) },
      vehicles: { loaded: vehicles.length, bytes: sum(vehicles) },
    },
    loadedModelBytes: sum(loadedInterior) + sum(structures) + sum(vehicles),
    data: manifest.data, ff2,
    files: manifest.files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })),
  };
}

function parseArgs(argv: readonly string[]): CampusStageOptions {
  const options: CampusStageOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--out') options.out = resolve(argv[++i] ?? '');
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try {
    const staged = stageCampus(parseArgs(process.argv.slice(2)));
    const { files, ...summary } = staged;
    const evidence = resolve(PACKAGE_ROOT, 'evidence/build/ffc1');
    mkdirSync(evidence, { recursive: true });
    writeFileSync(resolve(evidence, 'stage.json'), JSON.stringify({ ...summary, files }, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
    for (const f of files) console.log(`${String(f.bytes).padStart(10)}  ${f.sha256}  ${f.path}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
}
