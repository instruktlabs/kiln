// Golden Gate M0: builds the feature fixture, serves it on an owned port, and checks each
// feature on WebGPU and WebGL2 with scripted pixel statistics. Correctness only; no timing.
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/run-m0.ts
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import type { Browser, Page } from 'puppeteer-core';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { launchChrome } from '../../../scene-kit/src/testing/node.ts';
import { PACKAGE_ROOT, serveOwned, assertOwnedUrl, writeJson, unexpectedMessages, type ConsoleRecord } from './owned.ts';
import { readPng, sample, regionMean, compareImages, extremes, luma, round, type Image, type Rgb } from './image.ts';

const out = resolve(PACKAGE_ROOT, 'evidence/m0'), dist = resolve(PACKAGE_ROOT, 'dist/m0');
mkdirSync(out, { recursive: true });
await build({ ...sceneStandaloneConfig({ root: resolve(PACKAGE_ROOT, 'm0'), outDir: dist, mode: 'test' }), configFile: false, logLevel: 'warn' });
mkdirSync(resolve(dist, 'assets'), { recursive: true });
writeFileSync(resolve(dist, 'assets/pack.json'), JSON.stringify({ schema: 'kiln.scene-pack/1', id: 'golden-gate-m0', release: 'm0', three: '0.186.0', models: [], data: {}, files: [] }) + '\n');

const cases = ['sky', 'reflector', 'depth', 'instances', 'halfFloat'] as const;
const INSTANCE_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#202020'];
type CaseName = typeof cases[number];
interface Check { id: string; pass: boolean; detail: unknown }
const results: Record<string, { backend: string; info: unknown; checks: Check[]; messages: ConsoleRecord[]; adapter: unknown }> = {};
const images: Record<string, Record<string, Image>> = {};
const hosted = await serveOwned(dist), owned = new Set([hosted.port]);
let browser: Browser | undefined;
const ledger = { port: hosted.port, browserPid: undefined as number | undefined, browserClosed: false, serverClosed: false };
try {
  browser = await launchChrome({ workspace: PACKAGE_ROOT, name: 'gg-m0' }); ledger.browserPid = browser.process()?.pid;
  for (const backend of ['webgpu', 'webgl2'] as const) {
    const page: Page = await browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text(), url: m.location().url }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const url = `${hosted.url}/?backend=${backend === 'webgl2' ? 'webgl2' : 'auto'}`; assertOwnedUrl(url, owned);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => { const s = (window as any).__m0; return s && (s.ready > 0 || s.errors.length > 0); }, { timeout: 120_000 });
    const state = await page.evaluate(() => (window as any).__m0);
    assert.deepEqual(state.errors, [], `M0 fixture failed on ${backend}`);
    await page.evaluate(() => (window as any).__kilnScene.waitFrames(10));
    const info = await page.evaluate(() => (window as any).__kilnScene.invoke('m0Info'));
    const checks: Check[] = [], shots: Record<string, Image> = {};
    const project = (p: [number, number, number]) => page.evaluate(q => (window as any).__kilnScene.invoke('m0Project', q), p) as Promise<[number, number]>;
    for (const name of cases) {
      await page.evaluate(n => (window as any).__kilnScene.invoke('m0Case', n), name);
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(6));
      const canvas = await page.$('canvas'); assert(canvas, 'canvas exists');
      const bytes = await canvas.screenshot({ path: resolve(out, `${backend}-${name}.png`) as `${string}.png` });
      const img = readPng(bytes as Uint8Array); shots[name] = img;
      checks.push(...await judge(name, img, project));
    }
    images[backend] = shots;
    results[backend] = { backend: (await page.$eval('.ks-root', el => el.getAttribute('data-kiln-backend'))) ?? 'unknown', info, checks, messages, adapter: state.backend };
    await page.close();
  }
} finally {
  try { await browser?.close(); ledger.browserClosed = true; } finally { await hosted.close(); ledger.serverClosed = true; }
}

async function judge(name: CaseName, img: Image, project: (p: [number, number, number]) => Promise<[number, number]>): Promise<Check[]> {
  const checks: Check[] = [], add = (id: string, pass: boolean, detail: unknown) => checks.push({ id: `${name}:${id}`, pass, detail });
  const ext = extremes(img); add('no-black-or-blown', ext.black < .02 && ext.white < .05, ext);
  if (name === 'sky') {
    const top = regionMean(img, 0, 10, img.width, 60), horizon = regionMean(img, 0, img.height / 2 - 20, img.width, img.height / 2);
    add('sky-blue-at-zenith', top[2] > top[0] + 10 && luma(top) > 40, { top: round(top), horizon: round(horizon) });
    const [sx, sy] = await project([0, 3.2, -10]), sphere = sample(img, sx, sy, 3), sphereTop = sample(img, sx, sy - 30, 2);
    add('sphere-lit-by-sky-environment', luma(sphere) > 40 && sphereTop[2] >= sphereTop[0] - 5, { sphere: round(sphere), sphereTop: round(sphereTop) });
  } else if (name === 'reflector') {
    const redDirect = sample(img, ...(await project([997, 2, -6]))), redMirror = sample(img, ...(await project([997, -2.2, -6])));
    const greenDirect = sample(img, ...(await project([1003, 2, -6]))), greenMirror = sample(img, ...(await project([1003, -2.2, -6])));
    const skyMirror = sample(img, ...(await project([1000, 0, -19])));
    add('reflects-layer0-object', redMirror[0] > 80 && redMirror[0] > 1.8 * redMirror[1] && redMirror[0] > 1.8 * redMirror[2], { redDirect: round(redDirect), redMirror: round(redMirror) });
    add('excludes-layer2-object', greenDirect[1] > 150 && !(greenMirror[1] > 1.5 * Math.max(greenMirror[0], greenMirror[2]) && greenMirror[1] > 60), { greenDirect: round(greenDirect), greenMirror: round(greenMirror) });
    add('reflects-sky', skyMirror[2] > skyMirror[0] && luma(skyMirror) > 30, { skyMirror: round(skyMirror) });
  } else if (name === 'depth') {
    const zs = [7, 4, 0, -6, -14, -24], values: number[] = [];
    for (const z of zs) values.push(luma(sample(img, ...(await project([2000, 0, z])), 2)));
    const monotonic = values.every((v, i) => i === 0 || v >= values[i - 1]! - 2);
    add('thickness-increases-offshore', monotonic && values[0]! < 70 && values.at(-1)! > 150, { zs, luma: values.map(v => Math.round(v)) });
  } else if (name === 'instances') {
    const detail: unknown[] = []; let ok = true;
    for (let i = 0; i < INSTANCE_COLORS.length; i++) {
      const c = sample(img, ...(await project([3000 + (i - 3.5) * 1.6, 1, .5])), 2), hex = INSTANCE_COLORS[i]!;
      const expect = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
      const good = expect.every((e, k) => e > 128 ? c[k]! > 150 : c[k]! < 90);
      ok &&= good; detail.push({ hex, got: round(c), good });
    }
    add('per-instance-colour', ok, detail);
  } else {
    const row: Rgb[] = []; for (const x of [3997, 3998.5, 4000, 4001.5, 4003]) row.push(sample(img, ...(await project([x, 0, 0])), 2));
    const reds = row.map(c => c[0]), greens = row.map(c => c[1]);
    add('rg16f-gradient', reds.every((v, i) => i === 0 || v > reds[i - 1]!) && greens.every((v, i) => i === 0 || v < greens[i - 1]!) && reds[0]! < 120 && reds.at(-1)! > 200, { reds: reds.map(Math.round), greens: greens.map(Math.round) });
  }
  return checks;
}

const parity: Record<string, unknown> = {};
for (const name of cases) if (images.webgpu?.[name] && images.webgl2?.[name]) parity[name] = compareImages(images.webgpu[name]!, images.webgl2[name]!);
const summary = {
  note: 'Golden Gate M0 on three 0.186.0 through the kit renderer factory. Correctness only; no timing collected.',
  date: new Date().toISOString(), ledger, parity,
  results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v, unexpected: unexpectedMessages(v.messages) }])),
  pass: Object.values(results).length === 2 && Object.values(results).every(r => r.checks.every(c => c.pass) && unexpectedMessages(r.messages).length === 0),
};
writeJson(resolve(out, 'results.json'), summary);
for (const [backend, r] of Object.entries(results)) {
  console.log(`${backend} (${r.backend}): ${r.checks.filter(c => c.pass).length}/${r.checks.length} checks; unexpected messages ${unexpectedMessages(r.messages).length}`);
  for (const c of r.checks) if (!c.pass) console.log(`  FAIL ${c.id} ${JSON.stringify(c.detail)}`);
  for (const m of unexpectedMessages(r.messages).slice(0, 5)) console.log(`  MSG ${m.kind} ${m.type ?? ''} ${(m.text ?? '').slice(0, 300)}`);
}
console.log('parity', JSON.stringify(parity));
console.log(`M0 ${summary.pass ? 'PASS' : 'FAIL'}; ledger ${JSON.stringify(ledger)}`);
