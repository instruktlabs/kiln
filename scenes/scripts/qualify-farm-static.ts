import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { compareParityImages } from './parity-images';
import { cropImage, validateWoodlandAb, WOODLAND_CROP } from './capture-woodland-ab';

const BACKENDS = ['webgpu', 'webgl2'] as const, WINDOW = 'house-window-out';
const near = (actual: number, expected: number, message: string) => assert(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12, message);

/** Validate all144 tiles and derive the gate from raw numeric fields, never just the stored pass flag. */
export function validateMetric(metric: any, requirePass = true) {
  assert.equal(metric.width, 1280); assert.equal(metric.height, 720); assert.equal(metric.tiles?.length, 144, 'Exactly144 tile metrics are required');
  let passing = 0, mean = 0, noise = 0;
  for (let i = 0; i < 144; i++) {
    const tile = metric.tiles[i];
    assert.equal(tile.x, i % 16); assert.equal(tile.y, Math.floor(i / 16)); assert.equal(tile.pixels, 6400);
    assert(Number.isFinite(tile.noise) && tile.noise >= 0 && Number.isFinite(tile.mean) && tile.mean >= 0, 'Tile metrics must be finite nonnegative values');
    near(tile.threshold, Math.max(3 * tile.noise, .02), 'The fixed tile threshold changed');
    assert.equal(tile.pass, tile.mean <= tile.threshold); if (tile.pass) passing++;
    mean += tile.mean / 144; noise += tile.noise / 144;
  }
  near(metric.globalMean, mean, 'Global mean differs from tile means'); near(metric.noiseGlobalMean, noise, 'Global noise differs from tile noise');
  assert.equal(metric.passingTiles, passing); assert.equal(metric.passingFraction, passing / 144);
  const pass = passing / 144 >= .97 && metric.globalMean < .02;
  assert.equal(metric.pass, pass, 'Stored pass flag differs from the fixed gate'); if (requirePass) assert(pass, 'Parity thresholds failed');
}
interface Result { view: string; backend: string; attempt: number; status: string; [key: string]: any }
function latest(results: Result[], views: readonly string[], correction: boolean) {
  const selected = new Map<string, Result>(), attempts = new Set<string>();
  for (const result of results) {
    assert(views.includes(result.view) && (BACKENDS as readonly string[]).includes(result.backend), 'Unexpected view/backend');
    if (correction) assert.equal(result.view, WINDOW, 'Correction may contain only the window view');
    assert(result.attempt === 1 || result.attempt === 2, 'At most the original attempt and one retry are permitted');
    const key = `${result.view}/${result.backend}`, attempt = `${key}/${result.attempt}`;
    assert(!attempts.has(attempt), 'Duplicate attempt'); attempts.add(attempt);
    if (!selected.has(key) || selected.get(key)!.attempt < result.attempt) selected.set(key, result);
  }
  return selected;
}
export function selectStaticResults(base: Result[], correction: Result[], views: readonly string[]) {
  const old = latest(base, views, false), fixed = latest(correction, views, true), result: { source: 'base' | 'correction'; result: Result }[] = [];
  assert.equal(old.size, views.length * 2, 'Base report is missing a static view/backend');
  assert.equal(fixed.size, 2, 'Correction report is missing a window backend');
  for (const view of views) for (const backend of BACKENDS) {
    const key = `${view}/${backend}`, source = view === WINDOW ? 'correction' : 'base', chosen = (view === WINDOW ? fixed : old).get(key);
    assert(chosen, 'Required view/backend missing');
    assert.equal(chosen.status, 'pass', `${key}: latest attempt must pass`);
    if (view === WINDOW) assert.equal(old.get(key)!.status, 'fail', 'Retain the original failed window provenance');
    result.push({ source, result: chosen });
  }
  return result;
}

function verifyCounts(stats: any, backend: string) {
  assert.equal(stats.readyCount, 1); assert.deepEqual(stats.errors, []); assert.equal(stats.backend.backend, backend);
  assert.equal(stats.tier.tier, 'high'); assert.equal(stats.tier.level, 0); assert.equal(stats.tier.live.pixelRatio, 1);
  assert.equal(stats.motion.time, 0); assert.equal(stats.motion.ambient, 0); assert.equal(stats.timing, 'not collected');
  const expected = { stage: 'M2a pre-batching', placements: 589, layoutEntries: 168, woodlandTrees: 843, woodlandCells: 16, woodlandMeshes: 64, grassTufts: 14000, grassMeshes: 16, terrainVertices: 22475, terrainTriangles: 44352, surroundingTriangles: 39690, streamTriangles: 12976, bridgeTriangles: 408 };
  for (const [key, value] of Object.entries(expected)) assert.equal(stats.counts[key], value, `${key} pre-batching count differs`);
  assert.deepEqual(stats.counts.tangentOffenders, []); assert.deepEqual(stats.counts.texturePooling, { uniqueBefore: 98, uniqueAfter: 29, sharedAssignments: 92 });
}
function verifyReport(report: any, correction: boolean, views: string[]) {
  assert.equal(report.schema, 'kiln.farm-parity/1'); assert.equal(report.release, 'r33'); assert(['M2a static pre-batching', 'm2a'].includes(report.stage), 'Report must be the pre-batching M2a stage'); assert(!report.error, 'Report has a top-level error');
  assert.deepEqual([...report.views].sort(), (correction ? [WINDOW] : views).sort()); assert.deepEqual([...report.backends].sort(), [...BACKENDS].sort());
  const { conditions, ledger } = report;
  for (const [key, value] of Object.entries({ width: 1280, height: 720, dpr: 1, tier: 'high', rewriteTime: 0, rewriteHerd: false, tilePassFraction: .97, globalMeanExclusiveLimit: .02, performanceTiming: 'not collected' })) assert.equal(conditions[key], value, `Capture condition differs: ${key}`);
  assert(ledger.closed && ledger.browserClosed && ledger.rewriteClosed && ledger.pilotClosed, 'Every owned resource must be closed'); assert.deepEqual(ledger.cleanupErrors, []);
  for (const port of [ledger.pilot.port, ledger.rewrite.port]) assert(Number.isInteger(port) && port >= 4400 && port <= 4499, 'Only permitted owned ports may appear');
}

export async function qualifyFarmStatic(baseLabel: string, correctionLabel: string) {
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(baseLabel) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(correctionLabel), 'Use simple evidence labels'); assert.notEqual(baseLabel, correctionLabel);
  const workspace = process.cwd(), local = (path: string) => {
    const target = resolve(workspace, path), rel = relative(workspace, target);
    assert(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'Evidence path escapes workspace'); return target;
  };
  const portable = (path: string) => relative(workspace, local(path)).replaceAll('\\', '/');
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const reportPaths = { base: `evidence/parity/${baseLabel}/results.json`, correction: `evidence/parity/${correctionLabel}/results.json` };
  const baseBytes = await readFile(local(reportPaths.base)), correctionBytes = await readFile(local(reportPaths.correction));
  const base = JSON.parse(baseBytes.toString()), correction = JSON.parse(correctionBytes.toString());
  const layout = JSON.parse(await readFile(local('packages/farm/fixtures/layout.json'), 'utf8')), views = Object.keys(layout.views); assert.equal(views.length, 12);
  verifyReport(base, false, views); verifyReport(correction, true, views);
  // Runner wording changed while adding later M2b count support. The stage is
  // also checked against every actual pre-batching scene count below.
  const { countGate: _baseGate, ...baseConditions } = base.conditions, { countGate: _correctionGate, ...correctionConditions } = correction.conditions;
  assert.deepEqual(baseConditions, correctionConditions, 'Correction must retain all original capture conditions');
  const selected = selectStaticResults(base.results, correction.results, views), qualified = [], artifacts: { path: string; bytes: number; sha256: string }[] = [];
  const readPng = async (path: string) => { const bytes = await readFile(local(path)); artifacts.push({ path: portable(path), bytes: bytes.length, sha256: hash(bytes) }); return PNG.sync.read(bytes); };
  for (const { source, result } of selected) {
    validateMetric(result.metric); verifyCounts(result.rewrite.stats, result.backend);
    const expectedDir = local(`evidence/parity/${source === 'base' ? baseLabel : correctionLabel}/${result.view}-${result.backend}/attempt-${result.attempt}`);
    assert.equal(local(result.directory), expectedDir);
    const onDisk = JSON.parse(await readFile(resolve(expectedDir, 'result.json'), 'utf8')); assert.deepEqual(onDisk, result, 'Per-attempt receipt differs from aggregate report');
    const prefix = `${result.view}-`, suffix = `-${result.backend}.png`;
    const pilot = await readPng(resolve(expectedDir, prefix + 'pilot' + suffix)), repeat = await readPng(resolve(expectedDir, prefix + 'pilot-repeat' + suffix)), rewrite = await readPng(resolve(expectedDir, prefix + 'new' + suffix));
    const measured = compareParityImages(pilot, repeat, rewrite), { diff, ...numeric } = measured;
    assert.deepEqual(numeric, result.metric, 'Archived PNGs do not reproduce the stored metrics');
    const savedDiff = await readPng(resolve(expectedDir, prefix + 'diff' + suffix)); assert.equal(hash(savedDiff.data), hash(diff.data), 'Diff artifact does not match the source images');
    qualified.push({ view: result.view, backend: result.backend, attempt: result.attempt, source: reportPaths[source], evidence: portable(resolve(expectedDir, 'result.json')), globalMean: numeric.globalMean, noiseGlobalMean: numeric.noiseGlobalMean, passingTiles: numeric.passingTiles, tiles: 144, counts: result.rewrite.stats.counts });
  }
  assert.equal(base.woodlandAb?.length, 2, 'Both woodland A/B backends are required');
  const woodland = [];
  for (const backend of BACKENDS) {
    const ab = base.woodlandAb.find((entry: any) => entry.backend === backend); assert(ab, 'Missing A/B backend'); assert.equal(ab.status, 'captured'); assert.equal(ab.branchValidation, 'pass'); assert.deepEqual(ab.crop, WOODLAND_CROP);
    const directory = local(`evidence/parity/${baseLabel}/woodland-ab-${backend}`), standalone = JSON.parse(await readFile(resolve(directory, 'result.json'), 'utf8')); assert.deepEqual(standalone, ab);
    const captures = {} as Record<'safe' | 'repeat' | 'unsafe', any>;
    for (const name of ['safe', 'repeat', 'unsafe'] as const) {
      const capture = ab.captures[name]; assert.equal(local(capture.file), resolve(directory, name === 'repeat' ? 'safe-repeat-full.png' : `${name}-full.png`));
      captures[name] = { ...capture, png: await readPng(capture.file) };
    }
    validateWoodlandAb(captures.safe, captures.repeat, captures.unsafe, backend);
    const full = compareParityImages(captures.safe.png, captures.repeat.png, captures.unsafe.png), { diff: _full, ...fullMetric } = full;
    assert.deepEqual(fullMetric, ab.full); validateMetric(fullMetric, false);
    const crop = compareParityImages(cropImage(captures.safe.png, WOODLAND_CROP), cropImage(captures.repeat.png, WOODLAND_CROP), cropImage(captures.unsafe.png, WOODLAND_CROP)), { diff: _crop, ...cropMetric } = crop;
    assert.deepEqual(cropMetric, ab.cropMetric); assert.equal(ab.visualReviewRequired, !full.pass || !crop.pass);
    for (const file of ab.images as string[]) if (!file.endsWith('-full.png') || file.startsWith('diff-')) await readPng(resolve(directory, file));
    woodland.push({ backend, evidence: portable(resolve(directory, 'result.json')), safeOffenders: 0, unsafeOffenders: 16, fullMean: full.globalMean, cropMean: crop.globalMean, noiseGlobalMean: full.noiseGlobalMean, visualReviewRequired: ab.visualReviewRequired });
  }
  const historical = base.results.filter((result: Result) => result.status === 'fail').map((result: Result) => ({ view: result.view, backend: result.backend, attempt: result.attempt, evidence: portable(resolve(local(result.directory), 'result.json')), error: result.error, globalMean: result.metric?.globalMean, passingTiles: result.metric?.passingTiles }));
  assert(historical.length >= 2 && historical.every((entry: any) => entry.view === WINDOW), 'Only the explained window defect may be superseded');
  const qualification = { schema: 'kiln.farm-static-qualification/1', date: correction.date, milestone: 'M2a', status: 'pass', release: 'r33', scope: '12 static named views on both backends, pre-batching counts, and D-06 woodland A/B; M2b optimization and M2c/M2d play parity remain outstanding',
    reports: { base: { path: reportPaths.base, sha256: hash(baseBytes), ledger: base.ledger }, correction: { path: reportPaths.correction, sha256: hash(correctionBytes), ledger: correction.ledger } },
    correction: { view: WINDOW, reason: 'Farm port incorrectly imposed a3m minimum orbit distance; restored the pilot0m minimum so the authored close window camera is preserved', reportMetadata: 'Runner stage label changed from M2a static pre-batching to m2a and countGate explanatory wording changed; all actual capture conditions and pre-batching counts remain identical', originalFailuresRetained: historical },
    summary: { staticCases: qualified.length, pass: qualified.length, fail: 0, backends: [...BACKENDS], views: 12, tilesPerImage: 144 }, results: qualified, woodlandAb: woodland, artifacts, timing: 'not collected' };
  // This is the only write. Every report, branch, count, metric and image has passed first.
  await writeFile(local('evidence/m2/static-qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
  return qualification;
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  if (args.includes('--help')) console.log('Usage: bun scripts/qualify-farm-static.ts --base <full-run-label> --correction <window-only-label>');
  else {
    const base = value('--base'), correction = value('--correction'); assert(base && correction, 'Supply --base and --correction labels');
    const result = await qualifyFarmStatic(base, correction); console.log(JSON.stringify({ status: result.status, evidence: 'evidence/m2/static-qualification.json', ...result.summary }));
  }
}
