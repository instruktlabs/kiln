// SPEC 20.3's local evidence for Golden Gate: the count, byte and memory checks that do not depend on
// machine load (no timing is taken or kept). Headless Chrome (owner rule 11:40) on this builder's ports.
//   X-02 renderer.info at the ten named views, four hero-orbit points and the drive fixture, on the
//        frozen clock (WATER-SPEC time 12, Day), tiers high, balanced and economy, WebGPU and WebGL2
//   X-03 the kit's B-05 protocol for this scene: initialization cycles, then ten measured mount and
//        unmount cycles alternating WebGPU and WebGL2; heap after a forced collection within 5 percent,
//        one released backend per mount, no canvas, HUD, callback or extra listener left
//   X-11 bytes: the staged pack, the bundle per chunk, and the bytes fetched before onReady per tier
//        (CDP Network, cache disabled), plus anything fetched in the 5 s after
//   X-12 per-frame allocation: 1,000 frames of each workload (orbit, flyover, drive) between forced
//        collections; growth under 2 MB
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/perf-local.ts [x02] [x03] [x11] [x12] [--out=<dir>]
// --out= writes the files to another directory under the package (default evidence/perf; fix round 2 wrote
// nothing there while the hub session owned it). One token with "=": toolchain-run.ps1 is an advanced PowerShell
// script, which reads a separate "--out" as its ambiguous -OutVariable/-OutBuffer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CDPSession, Page } from 'puppeteer-core';
import { assertTeardownListenerAudit } from '@kiln-scenes/scene-kit';
import type { TeardownListenerAudit } from '@kiln-scenes/scene-kit';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord, type Hosted } from './owned.ts';
import { BUNDLE_CEILING, outputFor } from './build.ts';
import { STAGED_RELEASE } from '../../scripts/release.ts';
import { HERO_ORBIT, heroOrbitPosition } from '../../src/camera/workloads.ts';
import { NAMED_CAMERAS } from '../../src/constants.ts';

const WIDTH = 1920, HEIGHT = 1080, TIME = 12, TIMEOUT = 180_000;
const wanted = new Set(process.argv.slice(2).filter(a => /^x\d\d$/.test(a))); const run = (id: string) => !wanted.size || wanted.has(id);
const servers: Hosted[] = [], owned = new Set<number>();
const serve = async (root: string) => { const hosted = await serveOwned(root, owned); servers.push(hosted); owned.add(hosted.port); return hosted; };
const test = await serve(outputFor('test')), publicBuild = await serve(outputFor('public'));
const chrome = await launchHeadless('gg-perf-local', WIDTH, HEIGHT);
const outArg = process.argv.find(a => a.startsWith('--out=')), outDir = outArg ? outArg.slice('--out='.length) : 'evidence/perf';
const out = (name: string) => resolve(PACKAGE_ROOT, outDir, name);
const summary: Record<string, unknown> = {};

async function open(url: string, messages: ConsoleRecord[]): Promise<Page> {
  const page = await chrome.browser.newPage(); page.setDefaultTimeout(TIMEOUT); await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  assertOwnedUrl(url, owned); await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); return page;
}
const ready = (page: Page) => page.waitForFunction(() => { const s = (window as any).__kilnHarness?.snapshot(); if (s?.errors?.length) throw new Error(JSON.stringify(s.errors[0])); return (s?.readyCount ?? 0) > 0; }, { timeout: TIMEOUT, polling: 100 });
const frames = (page: Page, n: number) => page.evaluate(count => (window as any).__kilnScene.waitFrames(count), n);
const call = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
async function heap(client: CDPSession, collect: boolean) { if (collect) await client.send('HeapProfiler.collectGarbage'); return client.send('Runtime.getHeapUsage'); }

/** renderer.info and the scene's own counters for the frame just rendered. */
const counts = (page: Page) => page.evaluate(() => {
  const api = (window as any).__kilnScene, s = api.stats(), gg = api.invoke('ggStats'), t = api.invoke('trafficStats');
  return { drawCalls: s.render?.drawCalls ?? null, triangles: s.render?.triangles ?? null, geometries: s.memory?.geometries ?? null, textures: s.memory?.textures ?? null, pipelines: s.pipelines, programs: s.programs,
    mode: gg?.camera?.mode ?? null, terrainTiles: gg?.terrainTiles ?? null, farBridge: gg?.usingFarBridge ?? null,
    traffic: t ? { vehicles: t.vehicles, drawn: t.drawn, draws: t.draws, triangles: t.triangles, perLevel: t.perLevel, contactShadows: t.contactShadows } : null };
});
/** Counts once the view has settled: two samples 20 frames apart must agree (terrain and LOD selection follow the camera). */
async function settled(page: Page) {
  await frames(page, 20); let a = await counts(page);
  for (let i = 0; i < 4; i++) { await frames(page, 20); const b = await counts(page); if (b.drawCalls === a.drawCalls && b.triangles === a.triangles) return { ...b, stable: true }; a = b; }
  return { ...a, stable: false };
}

try {
  if (run('x02')) {
    const cases: unknown[] = [], messages: ConsoleRecord[] = [];
    for (const backend of ['webgpu', 'webgl2'] as const) for (const tier of ['high', 'balanced', 'economy'] as const) {
      const page = await open(`${test.url}/?capture=1&hud=0&preset=day&cam=postcard&time=${TIME}&tier=${tier}${backend === 'webgl2' ? '&backend=webgl2' : ''}`, messages);
      try {
        await ready(page); await frames(page, 30);
        const knobs = await call(page, 'ggStats') as { tier: string; knobs: unknown; device: unknown };
        const actual = await page.$eval('.ks-root', r => r.getAttribute('data-kiln-backend')); assert.equal(actual, backend);
        const views: unknown[] = [];
        for (const name of Object.keys(NAMED_CAMERAS)) { await call(page, 'setView', name); views.push({ view: name, ...await settled(page) }); }
        for (const quarter of [0, 1, 2, 3]) {
          await call(page, 'setPose', { position: heroOrbitPosition(quarter * HERO_ORBIT.seconds / 4), target: HERO_ORBIT.center, fov: HERO_ORBIT.fov });
          views.push({ view: `hero-orbit-${quarter * 90}deg`, ...await settled(page) });
        }
        // The drive fixture: the sedan in the northbound middle lane 300 m south of midspan at 25 m/s,
        // the chase settled for 90 frames of running time, then the clock frozen again.
        await page.evaluate(() => { const api = (window as any).__kilnScene; api.setTimeScale(1); api.setPlaying(true); });
        await page.waitForFunction(() => !!(window as any).__kilnScene.invoke('driveState'), { timeout: TIMEOUT });
        await call(page, 'placeCar', 'nb-middle', -300, 25); await frames(page, 90);
        await page.evaluate(() => (window as any).__kilnScene.setTimeScale(0));
        views.push({ view: 'drive-chase', ...await settled(page), drive: await call(page, 'driveState').then((d: any) => d && { z: +d.z.toFixed(1), speed: +d.speed.toFixed(2) }) });
        cases.push({ backend, tier, feature: (knobs.knobs as { feature: string }).feature, knobs: knobs.knobs, views });
        const tris = (views as { triangles: number }[]).map(v => v.triangles), draws = (views as { drawCalls: number }[]).map(v => v.drawCalls);
        console.log(`X-02 ${backend} ${tier}: draws ${Math.min(...draws)}-${Math.max(...draws)}, triangles ${Math.min(...tris)}-${Math.max(...tris)}`);
      } finally { await page.close(); }
    }
    const unexpected = unexpectedMessages(messages);
    writeJson(out('x02-counts.json'), { id: 'X-02', captured: new Date().toISOString(), note: 'Counts only (renderer.info for the frame just rendered, after two equal samples 20 frames apart); no timing. Golden Gate has no pilot, so these are the baseline.', window: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 }, preset: 'day', time: TIME, unexpectedMessages: unexpected, cases });
    summary['X-02'] = { cases: cases.length, unexpectedMessages: unexpected.length };
  }

  if (run('x11')) {
    const staging = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, `evidence/staging/${STAGED_RELEASE}.json`), 'utf8')), bundle = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'evidence/build/bundle-public.json'), 'utf8'));
    const loads: unknown[] = [], messages: ConsoleRecord[] = [];
    const cases = [{ build: 'public', tier: 'auto (high on this desktop)', url: `${publicBuild.url}/` },
      ...(['high', 'balanced', 'economy'] as const).map(tier => ({ build: 'test', tier, url: `${test.url}/?tier=${tier}` }))];
    for (const c of cases) {
      const page = await chrome.browser.newPage(); page.setDefaultTimeout(TIMEOUT); await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
      page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
      const client = await page.createCDPSession(), urls = new Map<string, string>(), fetched: { url: string; bytes: number; phase: 'before' | 'after' }[] = [];
      let phase: 'before' | 'after' = 'before';
      client.on('Network.responseReceived', e => urls.set(e.requestId, e.response.url));
      client.on('Network.loadingFinished', e => fetched.push({ url: urls.get(e.requestId) ?? '?', bytes: e.encodedDataLength, phase }));
      await client.send('Network.enable'); await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      try {
        assertOwnedUrl(c.url, owned); await page.goto(c.url, { waitUntil: 'load', timeout: TIMEOUT });
        // The public build has no test hooks: its status line clears on onReady (standalone/main.tsx).
        await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h ? h.readyCount > 0 : document.querySelector('#page-status')?.textContent === '' && !!document.querySelector('.ks-hud button'); }, { timeout: TIMEOUT, polling: 50 });
        phase = 'after'; await new Promise(done => setTimeout(done, 5000));
        const kind = (url: string) => { const p = new URL(url).pathname; return /\.(js|css)$/.test(p) ? 'code' : p.endsWith('.html') || p === '/' ? 'page' : /\.glb$/.test(p) ? 'glb' : /\.(webp|png|jpg|ktx2)$/.test(p) ? 'image' : /\.json$/.test(p) ? 'json' : 'other'; };
        const sum = (list: typeof fetched) => list.reduce((s, f) => s + f.bytes, 0);
        const before = fetched.filter(f => f.phase === 'before'), after = fetched.filter(f => f.phase === 'after');
        const byKind = Object.fromEntries(['page', 'code', 'json', 'glb', 'image', 'other'].map(k => [k, sum(before.filter(f => kind(f.url) === k))]));
        loads.push({ ...c, url: undefined, requestsBeforeReady: before.length, bytesBeforeReady: sum(before), byKind, requestsAfterReady: after.length, bytesAfterReady: sum(after), afterReady: after.map(f => ({ path: new URL(f.url).pathname, bytes: f.bytes })) });
        console.log(`X-11 ${c.build} ${c.tier}: ${before.length} requests, ${sum(before)} B before ready; ${after.length} after`);
      } finally { await client.detach().catch(() => undefined); await page.close(); }
    }
    // Renderer memory as three counts it (renderer.info.memory: attribute, index, texture, program and
    // uniform bytes) at the postcard view once the view has settled, per tier and backend.
    const gpuMemory: unknown[] = [];
    for (const backend of ['webgpu', 'webgl2'] as const) for (const tier of ['high', 'balanced', 'economy'] as const) {
      const page = await open(`${test.url}/?capture=1&hud=0&preset=day&cam=postcard&time=${TIME}&tier=${tier}${backend === 'webgl2' ? '&backend=webgl2' : ''}`, messages);
      try {
        await ready(page); await settled(page);
        const memory = await page.evaluate(() => (window as any).__kilnScene.stats().memory) as { texturesSize?: number; total?: number } | null;
        gpuMemory.push({ backend, tier, view: 'postcard', memory });
        console.log(`X-11 renderer memory ${backend} ${tier}: textures ${memory?.texturesSize} B, total ${memory?.total} B`);
      } finally { await page.close(); }
    }
    writeJson(out('x11-bytes.json'), { id: 'X-11', captured: new Date().toISOString(), note: 'Bytes only (encodedDataLength on the wire from the local no-cache server, cache disabled; gpuMemory is renderer.info.memory at the postcard view); no timing.',
      stagedPack: { release: staging.release, files: staging.files, bytes: staging.bytes, packSha256: staging.packSha256, downloadBytesByTier: staging.downloadBytesByTier },
      bundle: { chunks: bundle.chunks, codeBytes: bundle.codeBytes, codeGzipBytes: bundle.codeGzipBytes, ceilingD15: BUNDLE_CEILING, withinCeiling: bundle.codeBytes <= BUNDLE_CEILING.bytes && bundle.codeGzipBytes <= BUNDLE_CEILING.gzipBytes },
      loads, gpuMemory, unexpectedMessages: unexpectedMessages(messages) });
    summary['X-11'] = { loads: loads.length, gpuMemory: gpuMemory.length };
  }

  if (run('x12')) {
    const messages: ConsoleRecord[] = [], page = await open(`${test.url}/?capture=1&tier=high&preset=day`, messages), client = await page.createCDPSession(), results: unknown[] = [];
    try {
      await ready(page); await frames(page, 60);
      for (const workload of ['orbit', 'flyover', 'drive'] as const) {
        await page.evaluate(name => (window as any).__kilnScene.runWorkload(name), workload); await frames(page, 240);
        const before = await heap(client, true); await frames(page, 1000); const after = await heap(client, true);
        const growth = after.usedSize - before.usedSize, state = await call(page, 'ggStats') as { camera: { mode: string } };
        results.push({ workload, frames: 1000, beforeBytes: before.usedSize, afterBytes: after.usedSize, growthBytes: growth, pass: growth < 2 * 1048576, mode: state.camera.mode });
        console.log(`X-12 ${workload}: ${(growth / 1048576).toFixed(2)} MB over 1,000 frames (${state.camera.mode})`);
      }
    } finally { await client.detach().catch(() => undefined); await page.close(); }
    const unexpected = unexpectedMessages(messages);
    writeJson(out('x12-allocation.json'), { id: 'X-12', captured: new Date().toISOString(), note: 'Memory only: CDP HeapProfiler.collectGarbage then Runtime.getHeapUsage before and after 1,000 frames of each workload (after 240 frames of warm-up); tier high, WebGPU, 1920 x 1080; no timing.', results, unexpectedMessages: unexpected });
    summary['X-12'] = { results: (results as { workload: string; growthBytes: number; pass: boolean }[]).map(r => ({ workload: r.workload, growthMB: +(r.growthBytes / 1048576).toFixed(3), pass: r.pass })), unexpectedMessages: unexpected.length };
  }

  if (run('x03')) {
    const messages: ConsoleRecord[] = [], page = await open(`${test.url}/?preset=day`, messages), client = await page.createCDPSession();
    const snapshot = () => page.evaluate(() => (window as any).__kilnHarness.snapshot()) as Promise<{ readyCount: number; errors: unknown[]; disposals?: any[]; callbacksAfterUnmount?: number; fiberRoots?: number }>;
    const audit = async (): Promise<TeardownListenerAudit> => {
      const listeners: TeardownListenerAudit['listeners'] = {};
      try {
        for (const expression of ['window', 'document', 'window.__kilnDetachedRoot']) {
          const result = await client.send('Runtime.evaluate', { expression, objectGroup: 'gg-x03' });
          listeners[expression] = result.result.objectId ? (await client.send('DOMDebugger.getEventListeners', { objectId: result.result.objectId })).listeners
            .map(l => ({ type: l.type, useCapture: l.useCapture, passive: l.passive, once: l.once, lineNumber: l.lineNumber, handlerDescription: (l.originalHandler?.description ?? l.handler?.description)?.slice(0, 120) })) : [];
        }
        const reactDocumentMarkers = await page.evaluate(() => Object.getOwnPropertyNames(document).filter(n => n.startsWith('_reactListening')).sort().map(name => ({ name, value: Object.getOwnPropertyDescriptor(document, name)?.value === true })));
        return { listeners, reactDocumentMarkers };
      } finally { await client.send('Runtime.releaseObjectGroup', { objectGroup: 'gg-x03' }); }
    };
    let baselineListeners: string | null = null, baselineMarkers: string | null = null;
    const teardown = async (label: string, previous: number) => {
      await page.evaluate(() => { (window as any).__kilnDetachedRoot = document.querySelector('.ks-root'); (window as any).__kilnHarness.unmount(); });
      await page.waitForFunction(p => ((window as any).__kilnHarness.snapshot().disposals?.length ?? 0) > p, { timeout: TIMEOUT }, previous);
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const listenerAudit = await audit(); await page.evaluate(() => { delete (window as any).__kilnDetachedRoot; });
      const state = await snapshot(), receipts = state.disposals?.slice(previous) ?? [];
      const canvasAbsent = !(await page.$('canvas')), hudAbsent = !(await page.$('.ks-hud')), usage = await heap(client, true);
      assertTeardownListenerAudit(listenerAudit);
      const globalListeners = JSON.stringify({ window: listenerAudit.listeners.window?.length, document: listenerAudit.listeners.document?.length }), markers = JSON.stringify(listenerAudit.reactDocumentMarkers);
      if (baselineListeners === null) { baselineListeners = globalListeners; baselineMarkers = markers; }
      assert.equal(globalListeners, baselineListeners, `${label}: window and document listener counts unchanged`); assert.equal(markers, baselineMarkers, `${label}: one React document marker throughout`);
      assert(canvasAbsent && hudAbsent, `${label}: no canvas or HUD left`); assert.equal(state.callbacksAfterUnmount ?? 0, 0, `${label}: no callback after unmount`); assert.equal(state.fiberRoots, 0, `${label}: no React root left`);
      assert.equal(receipts.length, 1, `${label}: one disposal receipt`);
      assert(receipts.every(r => r.disposed && (r.resources ?? 0) === 0 && (r.backend === null || (r.backend === 'webgpu' ? r.deviceLost : r.contextLost))), `${label}: the owned backend was released`);
      return { label, heapAfterGcBytes: usage.usedSize, listeners: JSON.parse(globalListeners), receipt: receipts[0] && { backend: receipts[0].backend, resources: receipts[0].resources, deviceLost: receipts[0].deviceLost, contextLost: receipts[0].contextLost } };
    };
    const cycle = async (label: string, backend: 'auto' | 'webgl2', warmFrames: number) => {
      const previous = (await snapshot()).disposals?.length ?? 0;
      await page.evaluate(b => (window as any).__kilnHarness.mount({ backend: b }), backend); await ready(page);
      if (warmFrames) await frames(page, warmFrames);
      return teardown(label, previous);
    };
    const records: unknown[] = [];
    try {
      await ready(page); records.push(await teardown('document-initialized', (await snapshot()).disposals?.length ?? 0));
      for (const backend of ['auto', 'webgl2'] as const) records.push(await cycle(`initialize-${backend}-120-frames`, backend, 120));
      for (let i = 0; i < 10; i++) records.push(await cycle(`initialize-cycle-${i + 1}`, i % 2 ? 'webgl2' : 'auto', 0));
      const before = (await heap(client, true)).usedSize, measured: { heapAfterGcBytes: number }[] = [];
      for (let i = 0; i < 10; i++) measured.push(await cycle(`measured-cycle-${i + 1}`, i % 2 ? 'webgl2' : 'auto', 0));
      const after = (await heap(client, true)).usedSize, ratio = after / before;
      console.log(`X-03: heap ${(before / 1048576).toFixed(1)} MB before, ${(after / 1048576).toFixed(1)} MB after ten measured cycles (ratio ${ratio.toFixed(4)})`);
      writeJson(out('x03-leaks.json'), { id: 'X-03', captured: new Date().toISOString(), note: "The kit's B-05 protocol (R2-13/C-04) for this scene: a cold teardown, two 120-frame cycles (WebGPU, WebGL2) and ten initialization cycles, then ten measured cycles alternating automatic (WebGPU) and forced WebGL2, each mounted to onReady and unmounted; memory and counts only.",
        beforeBytes: before, afterBytes: after, growthRatio: ratio, pass: ratio < 1.05, initialization: records, measured, unexpectedMessages: unexpectedMessages(messages) });
      summary['X-03'] = { growthRatio: +ratio.toFixed(4), pass: ratio < 1.05, cycles: 10, unexpectedMessages: unexpectedMessages(messages).length };
    } finally { await client.detach().catch(() => undefined); await page.close(); }
  }
} finally {
  console.log(JSON.stringify(summary));
  await chrome.close(); for (const s of servers) await s.close();
}
