// M4 (TASK-M4.md item 3; SPEC 20.1 X-11 and X-12) for the Farm: bytes and memory only, no timing, so the load on this
// PC does not affect the results (a load sample is still recorded beside each part). Headless Chrome at 1920 x 1080,
// DPR 1; the builds are served on owned ports in 4400-4499 and closed with the browser at the end.
//   X-11  the staged r34 pack (files, bytes, GLBs), the public bundle per chunk against the Farm's D-15 ceiling, and the
//         bytes fetched before onReady (Resource Timing in the page, CDP cache disabled) for the public build (automatic
//         tier) and the test build per tier and backend, with anything fetched in the 5 s after ready
//   X-12  1,000 frames of orbiting (living-orbit) and 1,000 of walking (walk), each after 240 frames of warm-up, between
//         forced collections (CDP HeapProfiler.collectGarbage, then Runtime.getHeapUsage); growth under 2 MB. Tiers high
//         and minimal on both backends. With --alloc, one extra pass per backend samples allocations (HeapProfiler
//         sampling, collected objects included) over the same frames and lists where they are made.
//   bun scripts/run-farm-x11-x12.ts [x11] [x12] [--alloc] [--label m4] [--dest evidence/m4]
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Browser, CDPSession, Page } from 'puppeteer-core';
import { launchChrome, serveOwned, workspacePath } from '../packages/scene-kit/src/testing/node';

const argv = process.argv.slice(2), option = (name: string, fallback: string) => { const at = argv.indexOf(name); return at < 0 ? fallback : argv[at + 1] ?? fallback; };
const workspace = resolve(import.meta.dir, '..'), label = option('--label', 'm4'), release = option('--release', 'r34');
const out = workspacePath(workspace, option('--dest', 'evidence/m4'));
const wanted = new Set(argv.filter(a => /^x1[12]$/.test(a))), run = (id: string) => !wanted.size || wanted.has(id);
const WIDTH = 1920, HEIGHT = 1080, TIMEOUT = 180_000, WARMUP_FRAMES = 240, FRAMES = 1000, LIMIT_BYTES = 2 * 1048576;
/** The Farm's D-15 ceiling (DECISIONS D-15 as amended 2026-09-29 12:45): the M2 public chunk plus 10 percent. */
const CEILING = { rule: 'the M2 public chunk (1,574,581 B / 460,130 B gzip) plus 10 percent, rounded up (D-15, amended 2026-09-29 12:45)', bytes: 1_732_040, gzipBytes: 506_143 };
const builds = { public: workspacePath(workspace, `packages/farm/dist/${label}/standalone`), test: workspacePath(workspace, `packages/farm/dist/${label}/test`) };

const loadSample = () => new Promise<unknown>(done => execFile('pwsh', ['-NoProfile', '-File', resolve(workspace, 'scripts/load-sample.ps1')], { timeout: 30_000 }, (error, stdout) => {
  if (error) return done({ error: String(error) }); try { done(JSON.parse(stdout.trim())); } catch { done({ error: 'unparsed', stdout }); }
}));
const save = async (name: string, value: unknown) => { await mkdir(out, { recursive: true }); await writeFile(resolve(out, name), JSON.stringify(value, null, 2) + '\n'); console.log(`wrote ${name}`); };

/** The static byte facts: the staged pack and the public bundle's chunks, measured as scripts/build-farm.ts measures them. */
async function staticBytes() {
  const packRoot = workspacePath(workspace, `packages/farm/staged/${release}`), pack = JSON.parse(await readFile(resolve(packRoot, 'pack.json'), 'utf8')) as { files: { path: string; bytes: number }[] };
  const listed = pack.files, glb = listed.filter(file => file.path.endsWith('.glb'));
  const packJsonBytes = (await readFile(resolve(packRoot, 'pack.json'))).length;
  const chunks: { name: string; bytes: number; gzipBytes: number }[] = [];
  for (const name of (await readdir(resolve(builds.public, 'assets'))).sort()) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const data = await readFile(resolve(builds.public, 'assets', name)); chunks.push({ name, bytes: data.length, gzipBytes: gzipSync(data).length });
  }
  const codeBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0), codeGzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  return {
    stagedPack: { release, files: listed.length, bytes: listed.reduce((sum, file) => sum + file.bytes, 0), packJsonBytes, glbs: glb.length, glbBytes: glb.reduce((sum, file) => sum + file.bytes, 0),
      note: 'files and bytes are pack.json\'s verified file list (the manifest itself is fetched too and counted in the loads)' },
    bundle: { build: `packages/farm/dist/${label}/standalone`, chunks, codeBytes, codeGzipBytes, ceilingD15: CEILING, withinCeiling: codeBytes <= CEILING.bytes && codeGzipBytes <= CEILING.gzipBytes,
      ofCeiling: { bytes: codeBytes / CEILING.bytes, gzipBytes: codeGzipBytes / CEILING.gzipBytes } },
  };
}

/** Installed before any page script: the moment onReady clears the harness status line (both builds' standalone/main.tsx). */
function watchReady() {
  const w = window as any; w.__x11 = { readyAt: null as number | null };
  document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('page-status'); if (!status) return;
    let seen = (status.textContent ?? '') !== '';
    new MutationObserver(() => { const text = status.textContent ?? ''; if (text !== '') seen = true; else if (seen && w.__x11.readyAt === null) w.__x11.readyAt = performance.now(); })
      .observe(status, { childList: true, characterData: true, subtree: true });
  });
}
const kind = (path: string) => /\.(js|css)$/.test(path) ? 'code' : path.endsWith('.html') || path.endsWith('/') ? 'page' : path.endsWith('.glb') ? 'glb' : /\.(webp|png|jpg|ktx2)$/.test(path) ? 'image' : path.endsWith('.json') ? 'json' : path.endsWith('.bin') ? 'binary' : 'other';

async function bytesBeforeReady(browser: Browser, url: string, test: boolean) {
  const page = await browser.newPage(), messages: string[] = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  const client = await page.createCDPSession();
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await client.send('Network.enable'); await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    let wire = 0; client.on('Network.loadingFinished', e => { wire += e.encodedDataLength; });
    await page.evaluateOnNewDocument(watchReady);
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
    await page.waitForFunction(() => (window as any).__x11.readyAt !== null, { timeout: TIMEOUT, polling: 50 });
    if (test) assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().readyCount), 1, 'the test harness saw one onReady');
    await page.evaluate(() => new Promise(done => setTimeout(done, 5000)));
    const record = await page.evaluate(() => {
      const readyAt = (window as any).__x11.readyAt as number, nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const entries = [{ path: new URL(nav.name).pathname, end: nav.responseEnd, transfer: nav.transferSize, body: nav.encodedBodySize, decoded: nav.decodedBodySize },
        ...(performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(r => ({ path: new URL(r.name).pathname, end: r.responseEnd, transfer: r.transferSize, body: r.encodedBodySize, decoded: r.decodedBodySize }))];
      return { readyAt, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, entries, bufferFull: performance.getEntriesByType('resource').length >= 250 };
    });
    const before = record.entries.filter(e => e.end <= record.readyAt), after = record.entries.filter(e => e.end > record.readyAt);
    const sum = (list: typeof before, key: 'transfer' | 'body' | 'decoded') => list.reduce((total, e) => total + e[key], 0);
    const byKind = Object.fromEntries(['page', 'code', 'json', 'glb', 'image', 'binary', 'other'].map(k => [k, sum(before.filter(e => kind(e.path) === k), 'body')]));
    return { backend: record.backend, requestsBeforeReady: before.length, transferBytesBeforeReady: sum(before, 'transfer'), bodyBytesBeforeReady: sum(before, 'body'), byKindBodyBytes: byKind,
      requestsAfterReady: after.length, bodyBytesAfterReady: sum(after, 'body'), afterReady: after.map(e => ({ path: e.path, bodyBytes: e.body })),
      files: before.map(e => ({ path: e.path, bodyBytes: e.body })), wireBytesAllRequestsCdp: wire, resourceBufferFull: record.bufferFull, messages };
  } finally { await client.detach().catch(() => undefined); await page.close(); }
}

async function heap(client: CDPSession, collect: boolean) { if (collect) await client.send('HeapProfiler.collectGarbage'); return client.send('Runtime.getHeapUsage'); }
const frames = (page: Page, n: number) => page.evaluate(count => (window as any).__kilnScene.waitFrames(count), n);

/** One page per tier and backend: orbit, then walk, each 240 frames of warm-up then 1,000 frames between forced collections. */
async function allocationTrend(browser: Browser, base: string, backend: 'webgpu' | 'webgl2', tier: string, sampling: boolean) {
  const page = await browser.newPage(), messages: string[] = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  const client = await page.createCDPSession(), results: any[] = [];
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.goto(`${base}/?tier=${tier}${backend === 'webgl2' ? '&backend=webgl2' : ''}`, { waitUntil: 'load', timeout: TIMEOUT });
    await page.waitForFunction(() => { const s = (window as any).__kilnHarness?.snapshot(); if (s?.errors?.length) throw new Error(JSON.stringify(s.errors[0])); return (s?.readyCount ?? 0) > 0; }, { timeout: TIMEOUT, polling: 100 });
    const actual = await page.evaluate(() => ({ backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'), tier: (window as any).__kilnScene.tierState() }));
    assert.equal(actual.backend, backend); assert.equal(actual.tier.tier, tier);
    await frames(page, 60);
    for (const workload of ['living-orbit', 'walk'] as const) {
      await page.evaluate(name => (window as any).__kilnScene.runWorkload(name), workload); await frames(page, WARMUP_FRAMES);
      const start = await page.evaluate(() => (window as any).__kilnScene.simState());
      if (sampling) { await client.send('HeapProfiler.enable'); await client.send('HeapProfiler.startSampling', { samplingInterval: 16_384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as any); }
      const before = await heap(client, !sampling), frameBefore = await page.evaluate(() => (window as any).__kilnScene.stats().frame);
      await frames(page, FRAMES);
      const frameAfter = await page.evaluate(() => (window as any).__kilnScene.stats().frame);
      const profile = sampling ? (await client.send('HeapProfiler.stopSampling')).profile : null;
      const after = await heap(client, !sampling), end = await page.evaluate(() => (window as any).__kilnScene.simState()), tierAfter = await page.evaluate(() => (window as any).__kilnScene.tierState());
      const moved = JSON.stringify(start.camera) !== JSON.stringify(end.camera), walked = workload !== 'walk' || (end.active === true && end.driving === false && JSON.stringify(start.player.position) !== JSON.stringify(end.player.position));
      const growth = after.usedSize - before.usedSize;
      results.push({ workload, frames: frameAfter - frameBefore, ...(sampling ? { sites: sites(profile, frameAfter - frameBefore) } : { beforeBytes: before.usedSize, afterBytes: after.usedSize, growthBytes: growth, pass: growth < LIMIT_BYTES }),
        checks: { cameraMoved: moved, walkingOnFoot: walked, tierHeld: tierAfter.tier === tier, level: tierAfter.level }, playerStart: start.player.position, playerEnd: end.player.position });
      console.log(`X-12 ${backend} ${tier} ${workload}${sampling ? ' (allocation sampling)' : `: ${(growth / 1048576).toFixed(3)} MB over ${frameAfter - frameBefore} frames`}; camera moved ${moved}, walking ${walked}, tier ${tierAfter.tier}/${tierAfter.level}`);
    }
    return { backend, tier, results, messages };
  } finally { await client.detach().catch(() => undefined); await page.close(); }
}

/** Sampled allocation (collected objects included) by allocating function, and by source (three, React, R3F, the kit, the Farm, other). */
function sites(profile: any, frameCount: number) {
  const self = new Map<string, number>(), bySource = new Map<string, number>();
  let total = 0;
  const visit = (node: any, stack: string[]) => {
    const f = node.callFrame, name = `${f.functionName || '(anonymous)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    if (node.selfSize) { self.set(name, (self.get(name) ?? 0) + node.selfSize); total += node.selfSize; const source = stack.concat(name); bySource.set(classify(source), (bySource.get(classify(source)) ?? 0) + node.selfSize); }
    for (const child of node.children ?? []) visit(child, stack.concat(name));
  };
  visit(profile.head, []);
  const top = (map: Map<string, number>, n: number) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, bytes]) => ({ key, bytes, perFrameBytes: Math.round(bytes / frameCount) }));
  return { sampledBytes: total, sampledBytesPerFrame: Math.round(total / frameCount), note: 'HeapProfiler sampling at 16 KB intervals including objects later collected; sizes are sampled estimates', topSelf: top(self, 40), bySource: top(bySource, 20) };
}
/** Coarse attribution by function name (the bundle is minified, so three's and React's method names carry the signal). */
function classify(stack: string[]): string {
  const leaf = stack.at(-1) ?? '';
  if (/^\(/.test(leaf)) return `engine ${leaf.split(' ')[0]}`;
  for (let i = stack.length - 1; i >= 0; i--) {
    const f = stack[i]!.split(' ')[0]!;
    if (/^(render|_renderScene|_renderObjects|renderObjects|_renderObjectDirect|renderObject|getRenderObject|_createRenderObject|updateForRender|getForRender|draw|_renderBundle|setRenderTarget|getRenderList|push|finish|sort|updateBindings|updateBinding|_update|updateBefore|updateAfter|updateNode|getNodeFrame|getNodeFrameForRender|get|getCacheKey|getMaterialCacheKey)$/.test(f)) return `three renderer (${f})`;
    if (/^(onFrame|loop|advance|update|render\$1|renderGl)$/.test(f)) continue;
  }
  return 'other (minified; see topSelf)';
}

const report: Record<string, any> = { schema: 'kiln.farm-x11-x12/1', captured: new Date().toISOString(), label, release, window: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, headless: true } };
let browser: Browser | undefined; const servers: { close(): Promise<void>; url: string; port: number }[] = [];
try {
  for (const root of Object.values(builds)) assert(existsSync(resolve(root, 'index.html')), `${root} is built`);
  const [publicHost, testHost] = [await serveOwned(builds.public), await serveOwned(builds.test)]; servers.push(publicHost!, testHost!);
  browser = await launchChrome({ workspace, name: 'farm-x11-x12', windowSize: [WIDTH, HEIGHT] });
  for (const blank of await browser.pages()) await blank.close();
  report.browser = await browser.version(); report.ports = servers.map(s => s.port);
  if (run('x11')) {
    const loadBefore = await loadSample(), loads: unknown[] = [];
    const cases = [{ build: 'public', tier: 'auto', backend: 'auto', url: `${publicHost!.url}/` },
      ...(['webgpu', 'webgl2'] as const).flatMap(backend => (['high', 'balanced', 'economy', 'minimal'] as const).map(tier => ({ build: 'test', tier, backend, url: `${testHost!.url}/?tier=${tier}${backend === 'webgl2' ? '&backend=webgl2' : ''}` })))];
    for (const c of cases) {
      const result = await bytesBeforeReady(browser, c.url, c.build === 'test');
      loads.push({ build: c.build, tier: c.tier, requestedBackend: c.backend, ...result });
      console.log(`X-11 ${c.build} ${c.tier} ${c.backend}: ${result.requestsBeforeReady} requests, ${result.bodyBytesBeforeReady} B body (${result.transferBytesBeforeReady} B transfer) before ready; ${result.requestsAfterReady} after`);
    }
    await save('x11-bytes.json', { id: 'X-11', ...report, note: 'Bytes only, no timing. Body bytes are Resource Timing encodedBodySize (the served files carry no content encoding here), transfer bytes add the response headers; before ready means the response ended before onReady cleared the harness status line; the local server sends no-store and CDP disables the cache.',
      ...(await staticBytes()), loads, loadBefore, loadAfter: await loadSample() });
  }
  if (run('x12')) {
    const loadBefore = await loadSample(), cases: unknown[] = [];
    for (const backend of ['webgpu', 'webgl2'] as const) for (const tier of ['high', 'minimal']) cases.push(await allocationTrend(browser, testHost!.url, backend, tier, false));
    const flat = (cases as any[]).flatMap(c => c.results.map((r: any) => ({ backend: c.backend, tier: c.tier, ...r })));
    await save('x12-allocation.json', { id: 'X-12', ...report, note: `Memory only, no timing: CDP HeapProfiler.collectGarbage then Runtime.getHeapUsage before and after ${FRAMES} frames of each workload (after ${WARMUP_FRAMES} frames of warm-up), one page per tier and backend, orbit then walk; pass when the used heap grows by less than 2 MB (SPEC 20.1).`,
      pass: flat.every(r => r.pass && r.checks.cameraMoved && r.checks.walkingOnFoot && r.checks.tierHeld), cases, loadBefore, loadAfter: await loadSample() });
    if (argv.includes('--alloc')) {
      const sampled: unknown[] = [];
      for (const backend of ['webgpu', 'webgl2'] as const) sampled.push(await allocationTrend(browser, testHost!.url, backend, 'minimal', true));
      await save('x12-allocation-sites.json', { id: 'X-12 (diagnostic)', ...report, note: 'Where the per-frame allocation is made (diagnostic beside X-12, not a pass rule): HeapProfiler sampling over the same 1,000 frames, collected objects included.', cases: sampled });
    }
  }
} finally {
  await browser?.close(); for (const server of servers) await server.close();
  console.log(JSON.stringify({ closed: true, ports: servers.map(s => s.port) }));
}
