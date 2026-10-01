// FF3 item 7 and the coordinator's pack hygiene (TASK-FF3, 2026-09-30): the ff3 pack, staged into a scratch folder
// (never staged/ff3, staged/ff2 or staged/ffc1), holds everything staged/ffc1 holds plus the FF3 data and evidence; its
// data files equal the package data except the documentation strings in pack wording and the model sources; the scene's
// parsers read it and the twin run from the pack's own data files reproduces the recorded hourly hashes; and the staged
// pack names no repository path or working name: its licence text, pack.json sources and credits and the asset map's
// review fields name each model's Kiln asset, revision and author in the site's wording.
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { authorWorkspaceNames, modelCredit, packAssetMap, rewriteStrings, scanPack, staleEntries } from '../../scripts/pack-hygiene';
import { PACK_TEXT } from '../../scripts/pack-text';
import { attributionOf, authorLine } from '../../scripts/attribution';
import { CAMPUS_DATA_ENTRIES, CAMPUS_STAGED_DIR } from '../../scripts/stage-campus';
import { DATA_FILES } from '../../scripts/stage';
import { CAMPUS_ASSETS_PATH, compareWithFfc1, FF3_EVIDENCE, packedWarmReceipt, REPLACEMENT_EVIDENCE_PATH, stageFf3, WARM_EVIDENCE_PATH } from '../../scripts/stage-ff3';
import { reviewReplacements } from '../../scripts/review-replacements';
import { campusModels, campusAssetManifest } from '../../scripts/campus-assets';
import { parseCampusPlantings } from '../../src/campus/exterior/planting';
import { parseAssetMap } from '../../src/scene/assets/asset-map';
import { parseCampus } from '../../src/campus/data';
import { parseDriving } from '../../src/campus/drive/driving';
import { createFab, DAY_MS } from '../../src/sim/index';
import type { FabData } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..');
const FF3_RELEASE='ff3-review2', FF3_STAGED_DIR=resolve(PACKAGE,'staged/revision2');
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Json;
/** Pack path to package path of every data and evidence file the pack stages. */
const PACK_DATA: Record<string, string> = {
  ...Object.fromEntries(DATA_FILES.map(name => [`data/${name}`, `data/${name}`])),
  ...Object.fromEntries(Object.values(CAMPUS_DATA_ENTRIES).map(to => [to, to])),
  ...FF3_EVIDENCE,
};

let staged: { out: string; result: ReturnType<typeof stageFf3> } | null = null;
/** Stages once into a scratch folder under the package's .tmp (removed after the last test). */
function stagedPack() {
  if (!staged) {
    const scratch = resolve(PACKAGE, '.tmp'); mkdirSync(scratch, { recursive: true });
    const root = mkdtempSync(resolve(scratch, 'ff3-test-'));
    staged = { out: resolve(root, 'ff3'), result: stageFf3({ out: resolve(root, 'ff3'), generated: resolve(root, 'generated'), revision2:true, release:FF3_RELEASE }) };
  }
  return staged;
}
function leafDiffs(a: Json | undefined, b: Json | undefined, path: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
  if (Array.isArray(a) && Array.isArray(b)) for (let i = 0; i < Math.max(a.length, b.length); i++) leafDiffs(a[i], b[i], [...path, i], out);
  else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leafDiffs(a[k], b[k], [...path, k], out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
}
const at = (v: Json, path: readonly (string | number)[]): Json | undefined => path.reduce<Json | undefined>((x, k) => (x && typeof x === 'object' ? (x as Record<string, Json>)[k as string] : undefined), v);

describe('the ff3 pack (FF3 item 7)', () => {
  afterAll(() => { if (staged) rmSync(resolve(staged.out, '..'), { recursive: true, force: true }); staged = null; });
  // Staging reads the sealed GLBs and resolves62attributions; measured under10s on this PC (indicative).
  test('stages release ff3: every file verified, every model at its pins, the subfab kit and the humanoid as pack models', () => {
    const { out, result } = stagedPack();
    expect(result.release).toBe(FF3_RELEASE);
    expect(result.verification.ok).toBe(true);
    const manifest = readJson(resolve(out, 'pack.json')) as { models: { id: string; path: string }[]; files: { path: string; sha256: string }[]; data: Record<string, string> };
    expect(manifest.models).toHaveLength(62);
    expect(manifest.models).toContainEqual({ id: 'subfabKit', path: 'models/subfab-pump-abatement-kit.glb' });
    expect(manifest.models).toContainEqual({ id: 'humanoidWorkRobot', path: 'models/humanoid-work-robot.glb' });
    expect(result.groups.interior).toMatchObject({ staged: 31, loaded: 31 });
    expect(result.groups.vegetation.loaded).toBe(8);expect(result.groups.freight.loaded).toBe(5);
    const plants=readJson(resolve(out,CAMPUS_ASSETS_PATH));
    const campus=parseCampus(readFileSync(resolve(out,'data/campus.json'),'utf8'));
    expect(plants).toEqual(campusAssetManifest(campusModels(),campus));
    expect(parseCampusPlantings(JSON.stringify(plants),campus)).toHaveLength(801);
    const sums = readFileSync(resolve(out, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+\*?/));
    for (const f of manifest.files) expect(sums.some(([hash, path]) => path === f.path && hash === f.sha256)).toBe(true);
    for (const path of Object.keys(FF3_EVIDENCE)) expect(manifest.files.some(f => f.path === path)).toBe(true);
  }, 120_000);

  test.skipIf(!existsSync(resolve(CAMPUS_STAGED_DIR, 'pack.json')))('retains ffc1 files with exact declared asset replacements and explicit FF3 data changes', () => {
    const { out } = stagedPack();
    const ffc1 = compareWithFfc1(out);
    expect(ffc1.problems).toEqual([]);
    expect(ffc1.same + ffc1.changed.length).toBe(ffc1.ffc1Files);
    // Simulation-backed floor transport regenerates the warm start; original GLBs retain their exact pins.
    expect(ffc1.changed.map(c => c.path).sort()).toEqual([
      'data/assets.json', 'data/campus.json', 'data/driving.json', 'data/layout.json', 'data/rail-graph.json', 'data/route.json', 'data/sim-config.json', 'data/tools.json',
      'data/warm/seed-1.json',
      'licenses/ASSET-LICENSE.txt', ...['box-truck', 'hatchback', 'pickup', 'sedan', 'suv', 'transit-bus'].map(t => `licenses/vehicles/${t}.ASSET-LICENSE.txt`),
      ...reviewReplacements().map(r=>r.path), ...['sedan','hatchback','suv','pickup','box-truck','transit-bus'].map(t=>`models/vehicles/${t}.glb`),
    ].sort());
    expect(ffc1.added.sort()).toEqual([...Object.keys(FF3_EVIDENCE),CAMPUS_ASSETS_PATH,REPLACEMENT_EVIDENCE_PATH,...campusModels().map(m=>m.to)].sort());
    expect(ffc1.addedModels.sort()).toEqual(['humanoidWorkRobot', 'subfabKit',...campusModels().map(m=>m.id)].sort());
  }, 120_000);

  test('the data files equal the package data but for the documentation strings in pack wording and the model sources', () => {
    const { out } = stagedPack();
    for (const [packPath, packagePath] of Object.entries(PACK_DATA)) {
      const pkg = readJson(resolve(PACKAGE, packagePath)), pack = readJson(resolve(out, packPath));
      if(packPath===WARM_EVIDENCE_PATH){expect(pack).toEqual(packedWarmReceipt());continue;}
      expect(staleEntries(packPath, pkg)).toEqual([]);
      const expected = packPath === 'data/assets.json' ? packAssetMap(pkg as unknown as Parameters<typeof packAssetMap>[0]) as unknown as Json : rewriteStrings(packPath, pkg);
      expect(pack).toEqual(expected);
      // Every difference is a listed documentation string or, in the asset map, a model's source.
      const table = PACK_TEXT[packPath] ?? {};
      for (const path of leafDiffs(pkg, pack)) {
        const value = at(pkg, path), isSource = packPath === 'data/assets.json' && (path[0] === 'entities' || path[0] === 'structures') && path[2] === 'source';
        expect({ path: path.join('.'), explained: isSource || (typeof value === 'string' && value in table) }).toEqual({ path: path.join('.'), explained: true });
      }
    }
  }, 120_000);

  test('the scene reads the pack: the asset map, campus and driving data parse, and the twin run from the pack\'s own data files gives the recorded 720 hourly hashes', () => {
    const { out } = stagedPack();
    const text = (path: string) => readFileSync(resolve(out, path), 'utf8');
    const map = parseAssetMap(text('data/assets.json'));
    expect(Object.keys(map.entities)).toEqual(Object.keys((readJson(resolve(PACKAGE, 'data/assets.json')) as { entities: Record<string, Json> }).entities));
    expect(parseCampus(text('data/campus.json')).counts).toEqual(parseCampus(readFileSync(resolve(PACKAGE, 'data/campus.json'), 'utf8')).counts);
    expect(parseDriving(text('data/driving.json'))).toBeTruthy();
    const data = { layout: JSON.parse(text('data/layout.json')), graph: JSON.parse(text('data/rail-graph.json')), route: JSON.parse(text('data/route.json')), tools: JSON.parse(text('data/tools.json')), config: JSON.parse(text('data/sim-config.json')) } as FabData;
    const recorded = readJson(resolve(PACKAGE, 'evidence/sim/hashes.json')) as { seed: number; hashes: string[]; day30Hash: string };
    const fab = createFab({ seed: recorded.seed, data });
    fab.step(30 * DAY_MS);
    const hashes = [...fab.hourlyHashes()];
    expect(hashes).toEqual(recorded.hashes);
    expect(hashes[719]).toBe(recorded.day30Hash);
    // The stored warm start is staged byte-identical.
    expect(readFileSync(resolve(out, 'data/warm/seed-1.json'))).toEqual(readFileSync(resolve(PACKAGE, 'data/warm/seed-1.json')));
  }, 120_000);

  test('pack hygiene: the staged pack names no repository path or working name, and names every model in the site\'s wording', () => {
    const { out, result } = stagedPack();
    const scan = scanPack(out);
    expect(scan.hits).toEqual([]);
    expect(scan.glbs).toBe(62);
    // Final r4 vehicles declare LODs in their saved masters, so no legacy rewrite-script attribution remains.
    expect(scan.known).toEqual([]);
    expect(result.hygiene.hits).toBe(0);
    // The same scan finds the working names in the ffc1 pack (the licence's author folders, the review files).
    if (existsSync(resolve(CAMPUS_STAGED_DIR, 'pack.json'))) {
      const before = scanPack(CAMPUS_STAGED_DIR);
      expect(before.hits.filter(h => h.file === 'licenses/ASSET-LICENSE.txt' && h.rule === 'showcase folder').length).toBe(49);
      expect(before.hits.some(h => h.file === 'data/assets.json' && h.rule === 'review record')).toBe(true);
    }
    const names = authorWorkspaceNames();
    expect(names.length).toBeGreaterThan(10);
    const authorPattern='(?:Claude (?:Sonnet|Opus) \\d+\\.\\d+ · claude \\d+\\.\\d+\\.\\d+|GPT-6\\.1 Sol · codex 0\\.159\\.2|GPT-6 Astra · codex 0\\.159\\.2|Codex · model and harness version not recorded)';
    const effortPattern='Requested effort: (?:max|high|ultra|not recorded)\\. Independently confirmed: not recorded\\.';
    const credit = new RegExp(`^Kiln asset \\S+, revision r_[0-9a-f]{32}\\. ${authorPattern}\\. ${effortPattern}$`);
    const manifest = readJson(resolve(out, 'pack.json')) as { credits: { name: string; source: string }[]; source: { models: Record<string, { asset: string; revision: string; author: string; requestedEffort: string; confirmedEffort: null; stage: string }> } };
    expect(manifest.credits).toHaveLength(62);
    for (const c of manifest.credits) expect({ name: c.name, source: credit.test(c.source) }).toEqual({ name: c.name, source: true });
    for (const [id, m] of Object.entries(manifest.source.models)) {
      expect({ id, author: new RegExp(`^${authorPattern}$`).test(m.author), confirmed: m.confirmedEffort }).toEqual({ id, author: true, confirmed: null });
    }
    // The licence: every model entry is followed by its author line.
    const licence = readFileSync(resolve(out, 'licenses/ASSET-LICENSE.txt'), 'utf8').split('\n');
    const entries = licence.map((l, i) => [l, licence[i + 1] ?? ''] as const).filter(([l]) => l.startsWith('models/'));
    expect(entries).toHaveLength(62);
    for (const [line, author] of entries) {
      expect(line).toMatch(/^models\/\S+\.glb {2}Kiln asset \S+, revision r_[0-9a-f]{32} {2}SHA-256 [0-9a-f]{64}$/);
      expect(author).toMatch(new RegExp(`^ {4}${authorPattern}\\. ${effortPattern}$`));
    }
    // The asset map's review fields: the Kiln asset, revision and author of each model, as the author records give them.
    const pkg = readJson(resolve(PACKAGE, 'data/assets.json')) as { entities: Record<string, { source?: { author: string; revision: string } }>; structures: Record<string, { source: { author: string; revision: string } }> };
    const pack = readJson(resolve(out, 'data/assets.json')) as { entities: Record<string, { source?: { review: string; asset: string; revision: string; author: string } }>; structures: Record<string, { source: { review: string; asset: string; revision: string; author: string } }> };
    const sources = [...Object.entries(pkg.entities).filter(([, e]) => e.source).map(([id, e]) => [e.source!, pack.entities[id]!.source!] as const),
      ...Object.entries(pkg.structures).map(([id, e]) => [e.source, pack.structures[id]!.source] as const)];
    expect(sources).toHaveLength(43);
    for (const [from, to] of sources) {
      const a = attributionOf(from.author, from.revision);
      expect(to.review.startsWith(`${modelCredit(a)} `)).toBe(true);
      expect(to.review).toMatch(/Accepted |Qualified technical local review candidate; owner visual review pending\./);
      expect({ asset: to.asset, revision: to.revision, author: to.author }).toEqual({ asset: a.asset, revision: a.revision, author: authorLine(a) });
      for (const name of names) expect(JSON.stringify(to).includes(name)).toBe(false);
    }
  }, 120_000);

  test.skipIf(!existsSync(resolve(FF3_STAGED_DIR, 'pack.json')))('staged/ff3 is this staging, file for file', () => {
    const { out } = stagedPack();
    const a = readJson(resolve(FF3_STAGED_DIR, 'pack.json')) as { files: { path: string; bytes: number; sha256: string }[] };
    const b = readJson(resolve(out, 'pack.json')) as { files: { path: string; bytes: number; sha256: string }[] };
    expect(a.files).toEqual(b.files);
    expect(readFileSync(resolve(FF3_STAGED_DIR, 'pack.json'), 'utf8')).toBe(readFileSync(resolve(out, 'pack.json'), 'utf8'));
  }, 120_000);
});
