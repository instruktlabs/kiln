// SPDX-License-Identifier: MIT
// Foundry Floor staging (FF2): one kiln.scene-pack/1 folder holding
//   - the accepted GLBs, one pack model per asset-map entity that names a `glb` (data/assets.json, D-21), copied from
//     the author outputs and checked against the pinned bytes and SHA-256 before and after the copy;
//   - the asset map itself (pack data `asset-map`): the scene wires every model by it, so it is fetched, never bundled;
//   - the stored warm start (pack data `warm-seed-<n>`, one per configured snapshot seed);
//   - the twin's data files beside them, so another engine can run the same fab from plain JSON (D-21); the layout,
//     rail graph, route and tools are also pack data (`fab-layout` and so on, src/sim/config.ts): the page fetches
//     them instead of bundling them;
//   - the generated asset licence text (licenses/ASSET-LICENSE.txt): the owner's CC0-1.0 designation of the authored
//     asset content, with the Farm pack's scope (DECISIONS D-35), written here since no author folder ships a licence file.
// Pending entities (glb null) stage nothing: the scene draws their proxies. A new entity with a glb and pins (FF3's
// humanoid, a delivered pending asset) is staged by adding it to the asset map, with no change here. Every accepted GLB
// is a pack file; only those with instances (asset-map `instances` in any mode) are pack `models`, which the scene
// fetches at startup. The others (the subfab kit while it fits no kit zone, FF2's undrawn humanoid) ride in the pack
// as plain files, listed under source.unplaced.
// Every file gets its SHA-256 in pack.json and SHA256SUMS (the kit's stageFiles); the GLBs are pack files, not bundle
// bytes (D-15). Mirrors packages/golden-gate/scripts/stage.ts (read-only reference).
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/stage.ts [--release ff2] [--out <dir>] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageFiles, verifyStaged } from '@kiln-scenes/scene-kit/staging';
import type { CreditEntry } from '@kiln-scenes/scene-kit';
import { sourcePath } from './inspect-assets';

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RELEASE = 'ff2';
export const STAGED_DIR = resolve(PACKAGE_ROOT, 'staged/ff2');
/** Generated inputs (the licence text) are written here, outside the pack folder, and staged like any other file. */
export const GENERATED_DIR = resolve(PACKAGE_ROOT, 'staged/generated-ff2');
/** The twin's truth (D-21), staged verbatim beside the scene. assets.json is also pack data `asset-map`. */
export const DATA_FILES = ['layout.json', 'rail-graph.json', 'route.json', 'tools.json', 'sim-config.json', 'assets.json', 'about.json'] as const;
export const LICENCE_PATH = 'licenses/ASSET-LICENSE.txt';
/** The twin's data the page fetches from the pack (ids from src/sim/config.ts FAB_DATA_IDS). */
export const FAB_DATA_ENTRIES: Record<string, string> = { 'fab-layout': 'data/layout.json', 'fab-rail-graph': 'data/rail-graph.json', 'fab-route': 'data/route.json', 'fab-tools': 'data/tools.json' };

interface Source { author: string; file: string; revision: string; review?: string }
interface MapEntity { asset: string; status: string; glb: string | null; source?: Source; pins?: { bytes: number; sha256: string }; instances: { pilot: number; megafab: number; phone: number } }
interface AssetMap { licence: { spdx: string; note: string }; entities: Record<string, MapEntity> }

export interface StagedModel { id: string; asset: string; to: string; from: string; bytes: number; sha256: string; revision: string; author: string; placed: boolean }
export interface StageOptions { release?: string; out?: string; force?: boolean }

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function readAssetMap(): AssetMap { return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'data/assets.json'), 'utf8')) as AssetMap; }

/** The accepted models of the asset map, each read from its author output and checked against its pins. */
export function acceptedModels(map: AssetMap = readAssetMap(), reviewCandidates:readonly string[] = []): StagedModel[] {
  const models: StagedModel[] = [];
  for (const [id, e] of Object.entries(map.entities)) {
    if (!e.glb) continue;
    if ((e.status !== 'accepted' && !(e.status==='review-candidate'&&reviewCandidates.includes(id))) || !e.source || !e.pins) throw new Error(`${id}: a glb without an accepted source and pins or an explicitly qualified review replacement`);
    const from = sourcePath(e.source);
    if (!existsSync(from)) throw new Error(`${id}: ${from} is missing (the author output of revision ${e.source.revision})`);
    const bytes = new Uint8Array(readFileSync(from)), hash = sha256(bytes);
    if (bytes.length !== e.pins.bytes || hash !== e.pins.sha256) throw new Error(`${id}: ${from} is ${bytes.length} B, SHA-256 ${hash}; the pins say ${e.pins.bytes} B, ${e.pins.sha256}. Ask the coordinator before staging a new export.`);
    const placed = e.instances.pilot > 0 || e.instances.megafab > 0 || e.instances.phone > 0;
    models.push({ id, asset: e.asset, to: e.glb, from, bytes: bytes.length, sha256: hash, revision: e.source.revision, author: e.source.author, placed });
  }
  return models;
}

/** One credit per staged model: the Kiln asset, its saved revision and the owner's CC0-1.0 designation of the authored
 *  asset content (DECISIONS D-35: the Farm pack's licence and scope). */
export function assetCredits(models: readonly StagedModel[], map: AssetMap = readAssetMap()): CreditEntry[] {
  return models.map(m => ({
    name: `${m.asset} (Kiln-authored model)`, licence: map.licence.spdx, holder: 'Kiln Commons',
    source: `Kiln revision ${m.revision}, showcase/authors/${m.author}`,
    note: 'Authored asset content designated CC0-1.0 by the project owner. Exact declaration: licenses/ASSET-LICENSE.txt',
  }));
}

export function assetLicenceText(models: readonly StagedModel[], release: string): string {
  return [
    'Foundry Floor assets', 'SPDX-License-Identifier: CC0-1.0', '',
    `Release: ${release}`, '',
    'Foundry Floor: authored asset content is designated CC0-1.0 by the project owner.',
    'This covers the Kiln-authored models listed below (their procedural geometry, materials, animation clips and',
    'locators; no third-party model, texture or brand data), to the extent of the owner\'s rights.',
    'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/', '',
    ...models.map(m => `${m.to}  ${m.asset}  Kiln revision ${m.revision}  showcase/authors/${m.author}  SHA-256 ${m.sha256}`), '',
    'Scene code and third-party software retain their separate software licence notices.',
    'This designation does not relicense Kiln or its third-party dependencies.',
    'Generated by the Foundry Floor staging script because the author folders ship no licence file.', '',
  ].join('\n');
}

export function stageFoundryFloor(options: StageOptions = {}) {
  const map = readAssetMap();
  const config = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'data/sim-config.json'), 'utf8')) as { seeds: { snapshots: number[] } };
  const out = options.out ?? STAGED_DIR, release = options.release ?? RELEASE;
  const models = acceptedModels(map);
  mkdirSync(resolve(GENERATED_DIR, 'licenses'), { recursive: true });
  const licenceFrom = resolve(GENERATED_DIR, LICENCE_PATH);
  writeFileSync(licenceFrom, assetLicenceText(models, release));
  const warm = config.seeds.snapshots.map(seed => ({ id: `warm-seed-${seed}`, to: `data/warm/seed-${seed}.json`, from: resolve(PACKAGE_ROOT, `data/warm/seed-${seed}.json`) }));
  const files = [
    ...DATA_FILES.map(name => ({ from: resolve(PACKAGE_ROOT, 'data', name), to: `data/${name}` })),
    ...warm.map(w => ({ from: w.from, to: w.to })),
    ...models.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    { from: licenceFrom, to: LICENCE_PATH },
  ];
  const result = stageFiles({
    id: 'foundry-floor', release, three: '0.186.0', out, force: options.force,
    models: models.filter(m => m.placed).map(m => ({ id: m.id, to: m.to })),
    data: { 'asset-map': 'data/assets.json', ...FAB_DATA_ENTRIES, ...Object.fromEntries(warm.map(w => [w.id, w.to])) },
    files, credits: assetCredits(models, map),
    source: {
      stage: 'FF2 accepted assets', assetMap: sha256(readFileSync(resolve(PACKAGE_ROOT, 'data/assets.json'))),
      warmStarts: Object.fromEntries(warm.map(w => [w.id, sha256(readFileSync(w.from))])),
      models: Object.fromEntries(models.map(m => [m.id, { revision: m.revision, bytes: m.bytes, sha256: m.sha256 }])),
      pending: Object.entries(map.entities).filter(([, e]) => !e.glb).map(([id]) => id),
      unplaced: models.filter(m => !m.placed).map(m => ({ id: m.id, file: m.to, why: 'accepted and staged as a pack file; no instance in FF2 (data/assets.json), so the scene does not fetch it' })),
    },
  });
  const verification = verifyStaged(out);
  if (!verification.ok) throw new Error(verification.problems.join('\n'));
  // The pack's copies match the pins too (stageFiles hashes what it read; this reads what it wrote).
  for (const m of models) {
    const copy = new Uint8Array(readFileSync(resolve(out, m.to)));
    if (copy.length !== m.bytes || sha256(copy) !== m.sha256) throw new Error(`${m.id}: the staged copy differs from the pins`);
  }
  const modelBytes = models.reduce((s, m) => s + m.bytes, 0);
  const loadedModelBytes = models.filter(m => m.placed).reduce((s, m) => s + m.bytes, 0);
  return { out, release, ...result, models: models.length, loadedModels: models.filter(m => m.placed).length, modelBytes, loadedModelBytes, packSha256: sha256(readFileSync(resolve(out, 'pack.json'))), verification };
}

function parseArgs(argv: readonly string[]): StageOptions {
  const options: StageOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--release') options.release = argv[++i];
    else if (arg === '--out') options.out = resolve(argv[++i] ?? '');
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try { console.log(JSON.stringify(stageFoundryFloor(parseArgs(process.argv.slice(2))), null, 2)); } catch (error) { console.error(error); process.exitCode = 1; }
}
