import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { startStaticServer } from './static-server.mjs';

// Correctness only: no CPU/render/startup duration is measured or emitted.
const out = resolve('evidence/m0');
await mkdir(out, { recursive: true });
const results: any[] = [];
const messages: any[] = [];
const ledger: any = { server: null, browserPid: null, closed: false };
const allowedWarning = /THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\./;
let hosted: any;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let page: any;
const snap = () => page.evaluate(() => {
  const s = (window as any).__spike.snapshot();
  const r = s.renderers.findLast((r: any) => r.generation === s.generation);
  return { ...s, backend: r && { backend: r.backend, forced: r.forced, fellBack: r.fellBack, adapter: r.adapter }, shadow: r && { enabled: r.shadowEnabled, type: r.shadowType } };
});
const frames = async (count = 4) => {
  const current = await snap();
  await page.waitForFunction((target: number) => (window as any).__spike.snapshot().frames >= target, { timeout: 120_000 }, current.frames + count);
};
async function mount(options: any) {
  await page.evaluate((o: any) => (window as any).__spike.mount(o), options);
  await page.waitForFunction(() => (window as any).__spike.snapshot().readyCount === 1, { timeout: 120_000 });
  await frames();
  const s = await snap();
  assert.equal(s.readyCount, 1);
  assert.equal(s.errors.length, 0, JSON.stringify(s.errors));
  return s;
}
async function unmount() {
  await page.evaluate(() => (window as any).__spike.unmount());
  await page.waitForFunction(() => {
    const s = (window as any).__spike.snapshot();
    return s.renderers.every((r: any) => r.disposed || !r.initialized);
  }, { timeout: 120_000 });
  assert.equal(await page.$('canvas'), null);
  const s = await snap();
  assert.deepEqual([...s.resourcesCreated].sort(), [...s.resourcesDisposed].sort(), 'All fixture resources disposed');
  assert(s.renderers.every((r: any) => r.renderAfterDispose === 0), 'Disposed renderer never reused');
  return s;
}
async function capture(name: string) {
  const canvas = await page.$('canvas');
  assert(canvas, 'Canvas exists');
  const bytes = await canvas.screenshot({ path: resolve(out, name + '.png') });
  return PNG.sync.read(Buffer.from(bytes));
}
function compare(a: any, b: any) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let sum = 0, changed = 0;
  const tileSum = new Float64Array(16 * 9), tileCount = new Uint32Array(16 * 9);
  for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta += Math.abs(a.data[i+c] - b.data[i+c]);
    sum += delta / (3 * 255);
    const pixel = i / 4, x = pixel % a.width, y = Math.floor(pixel / a.width);
    const tile = Math.floor(y * 9 / a.height) * 16 + Math.floor(x * 16 / a.width);
    tileSum[tile] += delta / (3 * 255); tileCount[tile]++;
    if (delta > 24) changed++;
  }
  const tileMeans = Array.from(tileSum, (sum, i) => sum / tileCount[i]);
  return { meanRgbDifference: sum / (a.width * a.height), changedPixelFraction: changed / (a.width * a.height), maxTileMean: Math.max(...tileMeans), tilesAbove02: tileMeans.filter(x => x > .02).length };
}
function nonblank(png: any) {
  const colors = new Set<string>();
  for (let y = 0; y < png.height; y += 4) for (let x = 0; x < png.width; x += 4) {
    const i = (y * png.width + x) * 4;
    colors.add(`${png.data[i] >> 3},${png.data[i+1] >> 3},${png.data[i+2] >> 3}`);
  }
  assert(colors.size > 30, `Expected shaded fixture, observed ${colors.size} colors`);
  return colors.size;
}
async function check(id: string, fn: () => Promise<any>) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { const details = await fn(); results.push({ id, attempt, status: 'pass', details }); console.log(id + ': PASS'); return true; }
    catch (e) {
      results.push({ id, attempt, status: 'fail', error: e instanceof Error ? e.stack : String(e), snapshot: await snap().catch(() => null) });
      console.error(id + ': FAIL (attempt ' + attempt + ') ' + String(e));
      await page?.evaluate(() => (window as any).__spike.unmount()).catch(() => {});
      if (attempt === 2) return false;
    }
  }
}

try {
  // Bind only our server; never probe a port owned by another process.
  for (let port = 4400; port <= 4499; port++) {
    try { hosted = await startStaticServer({ root: resolve('packages/scene-kit/dist/spike'), port }); ledger.server = { port, owned: true }; break; }
    catch (e) { if ((e as any).code !== 'EADDRINUSE') throw e; }
  }
  assert(hosted, 'An authorized port is available');
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, userDataDir: resolve('.tmp/m0-browser'), args: ['--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check'], env: { ...process.env, TEMP: resolve('.tmp'), TMP: resolve('.tmp') } });
  ledger.browserPid = browser.process()?.pid;
  page = await browser.newPage();
  await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
  page.on('console', (m: any) => messages.push({ kind: 'console', type: m.type(), text: m.text() }));
  page.on('pageerror', (e: any) => messages.push({ kind: 'pageerror', text: String(e) }));
  page.on('requestfailed', (r: any) => messages.push({ kind: 'requestfailed', url: r.url(), failure: r.failure() }));
  await page.goto(hosted.url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => !!(window as any).__spike, { timeout: 120_000 });
  const adapter = await page.evaluate(async () => { const gpu = (navigator as any).gpu; const a = gpu && await gpu.requestAdapter(); return a ? { ...a.info, vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description } : null; });
  assert(adapter, 'Headless Chrome must expose WebGPU; if absent, run an explicitly recorded headed retry');
  const standard = { width: 640, height: 480, dpr: 1, toneMapping: 'aces', shadows: 'percentage', strict: false };
  await check('B-00a', async () => { const s = await mount({ ...standard, backend: 'auto' }); assert.equal(s.revision, '186'); assert(s.renderers.findLast((r: any) => r.generation === s.generation).factoryReturnedInitialized); const colors = nonblank(await capture('B-00a-webgpu')); await unmount(); return { snapshot: s, quantizedColors: colors }; });
  await check('B-00b', async () => { const s = await mount({ ...standard, backend: 'auto' }); assert.equal(s.backend.backend, 'webgpu'); assert(s.backend.adapter); await unmount(); return { backend: s.backend, adapter }; });
  await check('B-00c', async () => { const s = await mount({ ...standard, backend: 'webgl2' }); assert.equal(s.backend.backend, 'webgl2'); assert.equal(s.backend.forced, true); nonblank(await capture('B-00c-webgl2')); await unmount(); return s; });
  await check('B-00d', async () => {
    const entries = [];
    for (const backend of ['auto', 'webgl2']) for (const shadows of ['percentage', 'basic', 'omitted']) {
      const s = await mount({ ...standard, backend, shadows });
      assert.equal(s.shadow.enabled, shadows !== 'omitted');
      entries.push({ backend, shadows, observed: s.shadow }); await unmount();
    }
    return entries;
  });
  await check('B-00e', async () => {
    const entries = [];
    for (const backend of ['auto', 'webgl2']) {
      const before = await mount({ ...standard, backend });
      await page.evaluate(() => { (window as any).__spike.setDpr(1.5); (window as any).__spike.resize(720, 400); });
      await frames(6);
      assert.deepEqual((await snap()).resourcesCreated, before.resourcesCreated, 'Resize preserves resources instead of masking buffer refresh with rebuilding');
      const live = await capture('B-00e-' + backend + '-live'); await unmount();
      await mount({ ...standard, backend, dpr: 1.5, width: 720, height: 400 });
      const fresh = await capture('B-00e-' + backend + '-fresh');
      const difference = compare(live, fresh);
      entries.push({ backend, difference, pass: difference.meanRgbDifference < .01 && difference.maxTileMean < .02 }); await unmount();
    }
    // A localized material fault must not be diluted by the unchanged background.
    // Z4 explicitly allows this failure with startup-only DPR; preserve evidence.
    if (entries.some(entry => !entry.pass)) {
      results.push({ id: 'B-00e-comparison', status: 'fail', details: entries, fallback: 'DPR fixed at startup; governor excludes pixel-ratio steps' });
      throw new Error('B-00e viewport-dependent node differs after live resize/DPR: ' + JSON.stringify(entries));
    }
    return entries;
  });
  await check('B-00f', async () => {
    const entries = [];
    for (const backend of ['auto', 'webgl2']) {
      const s = await mount({ ...standard, backend, strict: true });
      assert(s.domEffectMounts >= 2, 'Development StrictMode replays the DOM host effect');
      await unmount();
      await page.evaluate((o: any) => (window as any).__spike.mount(o), { ...standard, backend, strict: true, deferInit: true });
      await page.waitForFunction(() => { const s = (window as any).__spike.snapshot(); return s.renderers.some((r: any) => r.generation === s.generation && !r.factoryReturnedInitialized && !r.disposed); }, { timeout: 120_000 });
      await page.evaluate(() => { (window as any).__spike.unmount(); (window as any).__spike.releaseInit(); });
      await page.waitForFunction(() => (window as any).__spike.snapshot().renderers.every((r: any) => r.disposed), { timeout: 120_000 });
      const late = await snap(); assert.equal(late.readyCount, 0); assert.equal(late.errors.length, 0); assert.equal(await page.$('canvas'), null);
      const remount = await mount({ ...standard, backend, strict: true }); await unmount();
      assert(remount.resourcesCreated.every((id: string) => !s.resourcesCreated.includes(id)), 'StrictMode remount creates fresh resources, never disposed values');
      entries.push({ backend, normal: s, late, remount });
    }
    return entries;
  });
  await check('B-00g', async () => {
    const entries = [];
    for (const backend of ['auto', 'webgl2']) {
      const before = await mount({ ...standard, backend }); await unmount();
      await page.waitForFunction(() => (window as any).__spike.snapshot().renderers.every((r: any) => r.backend === 'webgpu' ? r.deviceLost : r.contextLost), { timeout: 120_000 });
      entries.push({ backend, before, after: await snap() });
    }
    return entries;
  });
  await check('B-00h', async () => {
    const pictures = new Map<string, any>(); const observed: any[] = [];
    for (const backend of ['auto', 'webgl2']) for (const toneMapping of ['aces', 'neutral', 'agx']) {
      const s = await mount({ ...standard, backend, toneMapping }); const png = await capture('B-00h-' + backend + '-' + toneMapping);
      nonblank(png); pictures.set(backend + toneMapping, png); observed.push({ backend, toneMapping, snapshot: s }); await unmount();
    }
    const comparisons = [];
    for (const tone of ['aces', 'neutral', 'agx']) { const delta = compare(pictures.get('auto' + tone), pictures.get('webgl2' + tone)); assert(delta.meanRgbDifference < .025, JSON.stringify({ tone, delta })); comparisons.push({ tone, crossBackend: delta }); }
    for (const backend of ['auto', 'webgl2']) for (const tone of ['neutral', 'agx']) { const delta = compare(pictures.get(backend + 'aces'), pictures.get(backend + tone)); assert(delta.meanRgbDifference > .001, 'Tone mapper must visibly change fixture'); }
    return { observed, comparisons, conclusion: 'Neutral and AgX rendered on both backends; fallback not required' };
  });
  const unexpected = messages.filter(m => m.kind === 'pageerror' || m.kind === 'requestfailed' || m.type === 'error' || (m.type === 'warn' && !allowedWarning.test(m.text)));
  assert.deepEqual(unexpected, [], 'Unexpected browser diagnostics');
  const failed = results.filter(r => r.attempt === 2 && r.status === 'fail' && r.id !== 'B-00e');
  if (failed.length) process.exitCode = 1;
} catch (e) {
  results.push({ id: 'harness', status: 'fail', error: e instanceof Error ? e.stack : String(e) }); process.exitCode = 1; console.error(String(e));
} finally {
  try { await browser?.close(); } finally { await hosted?.close(); }
  ledger.closed = true;
  await writeFile(resolve(out, 'browser-results.json'), JSON.stringify({ browser: 'Chrome installed', note: 'Correctness only; no performance timings collected', results, messages, ledger }, null, 2));
  console.log('Owned browser and server closed. Evidence: evidence/m0/browser-results.json');
}
