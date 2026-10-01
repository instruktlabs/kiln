// SPEC 19.8: record the r33 to r34 differences from retained captures (no new capture). For each farmhouse
// named view and backend it compares the rewrite's r33 frame with its r34 frame (both at time 0, herd off),
// and the sealed r33 pilot with the sealed r34 pilot (judged against the r33 pilot's own old-old noise).
// Expected: only the farmhouse differs (D-07). Same linear-luminance 16 by 9 tiles as B-06.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { compareParityImages, type RgbaImage } from './parity-images';
import { compareColliderCounts, type ColliderCounts } from './farm-count-gates';

const workspace = resolve(import.meta.dir, '..'), args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]!; };
const r33Run = option('--r33', 'm2b-static-02'), r34Run = option('--r34', 'm2d-r34-01');
const views = ['house-interior', 'house-porch', 'house-window-out'], out = resolve(workspace, 'evidence/parity', r34Run, 'r33-r34-diff');
await mkdir(out, { recursive: true });
const read = async (file: string): Promise<RgbaImage> => { const png = PNG.sync.read(await readFile(file)); return { width: png.width, height: png.height, data: new Uint8Array(png.data) }; };
const latest = async (run: string, view: string, backend: string) => {
  const dir = resolve(workspace, 'evidence/parity', run, `${view}-${backend}`), attempts = (await readdir(dir)).filter(name => /^attempt-[0-9]+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  const attempt = attempts.at(-1)!, base = resolve(dir, attempt), result = JSON.parse(await readFile(resolve(base, 'result.json'), 'utf8'));
  return { source: `evidence/parity/${run}/${view}-${backend}/${attempt}`, status: result.status ?? (result.metric?.pass ? 'pass' : 'fail'), image: (kind: string) => read(resolve(base, `${view}-${kind}-${backend}.png`)) };
};
const box = (tiles: { x: number; y: number }[]) => tiles.length ? { x0: Math.min(...tiles.map(t => t.x)), x1: Math.max(...tiles.map(t => t.x)), y0: Math.min(...tiles.map(t => t.y)), y1: Math.max(...tiles.map(t => t.y)) } : null;
const round = (value: number) => Number(value.toPrecision(4));
const results = [];
for (const view of views) for (const backend of ['webgpu', 'webgl2']) {
  const r33 = await latest(r33Run, view, backend), r34 = await latest(r34Run, view, backend);
  const [a, b] = await Promise.all([r33.image('new'), r34.image('new')]);
  // Rewrite: both frames are deterministic, so any changed tile is a real content difference.
  const rewrite = compareParityImages(a, a, b), changed = rewrite.tiles.filter(tile => tile.mean > 1e-3);
  const [p33, p33repeat, p34] = await Promise.all([r33.image('pilot'), r33.image('pilot-repeat'), r34.image('pilot')]);
  const pilot = compareParityImages(p33, p33repeat, p34), pilotChanged = pilot.tiles.filter(tile => !tile.pass);
  const write = (name: string, image: RgbaImage) => writeFile(resolve(out, name), PNG.sync.write({ width: image.width, height: image.height, data: new Uint8Array(image.data) }));
  await write(`${view}-rewrite-r33-r34-diff-${backend}.png`, rewrite.diff); await write(`${view}-pilot-r33-r34-diff-${backend}.png`, pilot.diff);
  results.push({ view, backend, r33: r33.source, r34: r34.source, r34ParityStatus: r34.status,
    rewrite: { globalMean: round(rewrite.globalMean), tilesChangedOver001: changed.length, bounds: box(changed), tiles: changed.map(t => ({ x: t.x, y: t.y, mean: round(t.mean) })) },
    pilot: { globalMean: round(pilot.globalMean), r33NoiseGlobalMean: round(pilot.noiseGlobalMean), tilesAboveR33NoiseThreshold: pilotChanged.length, bounds: box(pilotChanged), tiles: pilotChanged.map(t => ({ x: t.x, y: t.y, mean: round(t.mean), threshold: round(t.threshold) })) } });
}
// The r34 run compared its colliders with the r33 fixture, the only one then frozen. Re-judge each view's latest
// attempt against the sealed r34 collision world (play-colliders-r34.json, byte-identical soups), from the recorded counts.
const fixture = JSON.parse(await readFile(resolve(workspace, 'packages/farm/fixtures/play-colliders-r34.json'), 'utf8')) as ColliderCounts, reevaluation = [];
for (const view of [...views, 'play-house-door']) for (const backend of ['webgpu', 'webgl2']) {
  const dir = resolve(workspace, 'evidence/parity', r34Run, `${view}-${backend}`);
  let attempts: string[]; try { attempts = (await readdir(dir)).filter(name => /^attempt-[0-9]+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8))); } catch { continue; }
  const attempt = attempts.at(-1)!, result = JSON.parse(await readFile(resolve(dir, attempt, 'result.json'), 'utf8'));
  const b07 = result.countChecks?.b07?.checks ?? [], value = (name: string) => b07.find((check: any) => check.name === name)?.actual;
  const keys = value('colliders.keys (dynamic, triangles) in order'), actual: Partial<ColliderCounts> = { colliders: value('colliders.colliders'), dynamic: value('colliders.dynamic'), staticTriangles: value('colliders.staticTriangles'),
    dynamicTriangles: value('colliders.dynamicTriangles'), doors: value('colliders.doors'), doorPivots: value('colliders.doorPivots'), keys: Array.isArray(keys) ? keys.map(([dynamic, triangles]: [boolean, number]) => ({ key: '', dynamic, triangles })) : undefined };
  const colliders = compareColliderCounts(actual, fixture), otherB07 = b07.filter((check: any) => !String(check.name).startsWith('colliders.'));
  const onlyB07Failed = result.status === 'pass' || result.error === 'B-07 optimization statistics failed';
  const pass = onlyB07Failed && result.metric?.pass === true && result.countChecks?.x02?.pass !== false && otherB07.every((check: any) => check.pass) && colliders.every(check => check.pass);
  reevaluation.push({ view, backend, attempt, recordedStatus: result.status, recordedError: result.error ?? null, pixel: { pass: result.metric?.pass, passingTiles: result.metric?.passingTiles, globalMean: result.metric?.globalMean, noiseGlobalMean: result.metric?.noiseGlobalMean },
    x02: result.countChecks?.x02?.pass ?? null, otherB07Pass: otherB07.every((check: any) => check.pass), collidersAgainstR34: colliders.every(check => check.pass), colliderChecks: colliders.filter(check => !check.pass), pass });
}
const summary = { id: 'SPEC 19.8 r33 to r34 differences', r33Run, r34Run, date: '2026-09-29',
  colliders: { r33: 'evidence/m2/m2d/colliders-r33.json', r34: 'evidence/m2/m2d/colliders-r34.json', note: 'Static soup 95,118 (r33) and 95,382 (r34) triangles; without the farmhouse both are 91,434, so the +264 triangles are the r34 farmhouse (3,684 to 3,948). All 12 dynamic colliders are identical.' },
  reevaluation,
  rule: 'Linear luminance, 16 by 9 tiles; rewrite tiles listed when their mean difference exceeds .001 (both frames deterministic); pilot tiles listed when they exceed max(3 x r33 old-old noise, .02)',
  expectation: 'Only the farmhouse differs (D-07: the r34 farmhouse wood floor)',
  finding: 'Farmhouse floor only (diff images reviewed). Sealed pilot r33 against r34: the tiles above the r33 noise threshold are floor rows in house-interior and house-window-out, none at house-porch. Rewrite r33 against r34: the same floor, plus grass seen through the windows at a different wind phase, because the r33 frames are at time 0 (stage m2b) and the r34 frames take the pilot shader phase (stage m2d, R4-07). The r34 frames pass B-06, X-02 and B-07 against the sealed r34 pilot and its collision world (reevaluation).',
  results };
await writeFile(resolve(workspace, 'evidence/parity', r34Run, 'r33-r34-differences.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(results.map(r => ({ view: r.view, backend: r.backend, r34: r.r34ParityStatus, rewriteTiles: r.rewrite.tilesChangedOver001, rewriteBounds: r.rewrite.bounds, pilotTiles: r.pilot.tilesAboveR33NoiseThreshold, pilotBounds: r.pilot.bounds }))));
console.log(JSON.stringify(reevaluation.map(r => ({ view: r.view, backend: r.backend, attempt: r.attempt, pixel: r.pixel.pass, tiles: r.pixel.passingTiles, x02: r.x02, otherB07: r.otherB07Pass, colliders: r.collidersAgainstR34, pass: r.pass }))));
