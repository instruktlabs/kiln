// Golden Gate scene contract on this builder's ports (kit request GG-001: the kit's
// runSceneContractTests serves only on 4400-4499). It mirrors the kit's B-series for this scene,
// reusing the kit's exported helpers, and drives the three builds (test, public, dev) in headless
// Chrome (owner rule 11:40). Correctness and counts only: nothing here is timed.
//   G-01 a collapsed slot stays unready without error, then becomes ready once (B-01)
//   G-02 forced WebGL2 (B-02); G-03 automatic WebGPU with the loading stages in order (B-03)
//   G-04 failures: missing pack (asset-fetch), invalid pack (pack-invalid), a corrupted GLB
//        (asset-hash) and a throwing host callback (runtime), each reported once with no ready (B-04)
//   G-05 four mount/unmount cycles: ready once each, one disposal receipt each, no callback after
//        unmount, no React roots left, no leftover window or document listeners, bounded heap (B-05)
//   G-11 accessibility and input: no serious or critical axe violations in the overview, the
//        flyover menu and the open controls help; Tab leaves the scene; reduced motion (B-11)
//   G-12 public build: no test hooks or dev panel, URL parameters ignored, axe clean (B-12)
//   G-13 dev build: the kit's development panel and the registered performance workloads
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/contract.ts
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import axe from 'axe-core';
import type { HTTPRequest, Page } from 'puppeteer-core';
import { assertTeardownListenerAudit, waitForReady, waitFrames } from '@kiln-scenes/scene-kit';
import type { TeardownListenerAudit } from '@kiln-scenes/scene-kit';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord, type Hosted } from './owned.ts';
import { outputFor } from './build.ts';

interface Snapshot { readyCount: number; errors: { code: string; message: string }[]; backend?: { backend: string; forced: boolean }; callbacksAfterUnmount?: number;
  disposals?: unknown[]; progress?: { phase: string; loaded: number; total: number; text: string }[]; tiers?: unknown[]; fiberRoots?: number }
const ROOT = '.ks-root', HUD = '.ks-hud';
const results: { id: string; ok: boolean; details?: unknown; error?: string }[] = [];
const servers: Hosted[] = [], owned = new Set<number>();
const serve = async (root: string) => { const hosted = await serveOwned(root, owned); servers.push(hosted); owned.add(hosted.port); return hosted; };
const test = await serve(outputFor('test')), publicBuild = await serve(outputFor('public')), dev = await serve(outputFor('dev'));
const chrome = await launchHeadless('gg-contract', 960, 720);

const snapshot = (page: Page) => page.evaluate(() => (window as any).__kilnHarness.snapshot()) as Promise<Snapshot>;
async function unmount(page: Page, waitForDisposal = false): Promise<Snapshot> {
  const before = waitForDisposal ? (await snapshot(page)).disposals?.length ?? 0 : 0;
  await page.evaluate(() => (window as any).__kilnHarness.unmount());
  await page.waitForFunction(selector => !document.querySelector(selector), { timeout: 120_000 }, ROOT);
  if (waitForDisposal) await page.waitForFunction(previous => ((window as any).__kilnHarness.snapshot().disposals?.length ?? 0) > previous, { timeout: 120_000 }, before);
  return snapshot(page);
}
async function mount(page: Page, options: Record<string, unknown> = {}): Promise<Snapshot> {
  if (await page.$(ROOT)) await unmount(page, (await snapshot(page)).readyCount > 0);
  await page.evaluate(value => (window as any).__kilnHarness.mount(value), options); await waitForReady(page); return snapshot(page);
}
const rafs = (page: Page, count = 4) => page.evaluate(n => new Promise<void>(done => { const next = () => --n <= 0 ? done() : requestAnimationFrame(next); requestAnimationFrame(next); }), count);
async function axeViolations(page: Page) {
  if (!await page.evaluate(() => 'axe' in window)) await page.addScriptTag({ content: axe.source });
  return page.evaluate(async selector => { const result = await (window as any).axe.run({ include: [selector], exclude: ['canvas'] });
    return result.violations.filter((v: any) => v.impact === 'serious' || v.impact === 'critical').map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n: any) => n.target.join(' ')).slice(0, 4) })); }, HUD);
}
async function listenerAudit(page: Page): Promise<TeardownListenerAudit> {
  const client = await page.createCDPSession(), listeners: TeardownListenerAudit['listeners'] = {};
  try {
    for (const expression of ['window', 'document', 'window.__kilnDetachedRoot']) {
      const result = await client.send('Runtime.evaluate', { expression, objectGroup: 'gg-listeners' });
      listeners[expression] = result.result.objectId ? (await client.send('DOMDebugger.getEventListeners', { objectId: result.result.objectId })).listeners
        .map(l => ({ type: l.type, useCapture: l.useCapture, passive: l.passive, once: l.once, lineNumber: l.lineNumber, handlerDescription: (l.originalHandler?.description ?? l.handler?.description)?.slice(0, 120) })) : [];
    }
    const reactDocumentMarkers = await page.evaluate(() => Object.getOwnPropertyNames(document).filter(n => n.startsWith('_reactListening')).sort().map(name => ({ name, value: Object.getOwnPropertyDescriptor(document, name)?.value === true })));
    return { listeners, reactDocumentMarkers };
  } finally { await client.send('Runtime.releaseObjectGroup', { objectGroup: 'gg-listeners' }); await client.detach(); }
}
async function heap(page: Page) { const c = await page.createCDPSession(); try { await c.send('HeapProfiler.collectGarbage'); return (await c.send('Runtime.getHeapUsage')).usedSize; } finally { await c.detach(); } }

async function open(url: string, messages: ConsoleRecord[], expected: RegExp[] = []): Promise<Page> {
  const page = await chrome.browser.newPage(); page.setDefaultTimeout(120_000);
  page.on('console', m => { const text = m.text().slice(0, 600); if (!expected.some(e => e.test(text))) messages.push({ kind: 'console', type: m.type(), text }); });
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  assertOwnedUrl(url, owned); await page.goto(url, { waitUntil: 'load', timeout: 120_000 }); return page;
}
async function check(id: string, messages: ConsoleRecord[], fn: () => Promise<unknown>) {
  const before = messages.length;
  try {
    const details = await fn(); const unexpected = unexpectedMessages(messages.slice(before));
    assert.deepEqual(unexpected, [], 'Unexpected browser messages');
    results.push({ id, ok: true, details }); console.log(`${id}: PASS`);
  } catch (error) { results.push({ id, ok: false, error: error instanceof Error ? error.message : String(error), details: (error as { details?: unknown }).details }); console.log(`${id}: FAIL ${String(error).slice(0, 400)}`); }
}

try {
  // The test build: G-01 to G-11 on one page, as the kit's suite does.
  const messages: ConsoleRecord[] = [];
  const page = await open(`${test.url}/?preset=day&cam=postcard`, messages);
  await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
  await page.waitForFunction(() => !!(window as any).__kilnHarness, { timeout: 120_000 });
  await waitForReady(page); await unmount(page, true);

  await check('G-01 collapsed slot', messages, async () => {
    await page.evaluate(() => { const s = document.createElement('style'); s.id = 'gg-zero'; s.textContent = '#golden-gate{width:0!important;height:0!important}'; document.head.appendChild(s); (window as any).__kilnHarness.mount({}); });
    await page.waitForSelector(ROOT); await rafs(page, 6);
    const collapsed = await snapshot(page); assert.equal(collapsed.readyCount, 0); assert.deepEqual(collapsed.errors, []);
    await page.evaluate(() => document.getElementById('gg-zero')?.remove());
    await waitForReady(page); await waitFrames(page, 6); const value = await snapshot(page); assert.equal(value.readyCount, 1); assert.deepEqual(value.errors, []);
    return { collapsed: collapsed.readyCount, ready: value.readyCount };
  });
  await check('G-02 forced WebGL2', messages, async () => {
    const value = await mount(page, { backend: 'webgl2' });
    assert.equal(await page.$eval(ROOT, r => r.getAttribute('data-kiln-backend')), 'webgl2'); assert.equal(value.backend?.forced, true); assert.equal(value.readyCount, 1);
    const stats = await page.evaluate(() => (window as any).__kilnScene.invoke('ggStats')); assert.equal(stats.tier, 'high');
    return { backend: value.backend, tier: stats.tier, feature: stats.knobs.feature };
  });
  await check('G-03 automatic WebGPU and loading stages', messages, async () => {
    const value = await mount(page, {});
    assert.equal(await page.$eval(ROOT, r => r.getAttribute('data-kiln-backend')), 'webgpu'); assert.equal(value.backend?.forced, false); assert.equal(value.readyCount, 1);
    // The kit reports graphics first, then reads the pack and its assets while the renderer starts, then builds.
    const phases = (value.progress ?? []).map(p => p.phase), order = ['graphics', 'pack', 'assets', 'build', 'first-frame'];
    const ranks = phases.map(p => order.indexOf(p));
    assert(ranks.every(r => r >= 0), `known phases only: ${phases.join(',')}`);
    for (const phase of ['graphics', 'pack', 'assets', 'build']) assert(phases.includes(phase), `stage ${phase} reported`);
    // The world's own build steps arrive inside 'build'; the kit's phases never go backwards.
    assert(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]! || phases[i] === 'build'), `stages in order: ${phases.join(',')}`);
    const texts = [...new Set((value.progress ?? []).map(p => p.text))];
    assert(texts.every(t => t && !/[{}]|undefined|NaN/.test(t)), 'stage texts are plain');
    return { phases: [...new Set(phases)], texts: texts.slice(0, 16), tiers: value.tiers };
  });
  await check('G-04 failures', messages, async () => {
    const cases: unknown[] = [], from = messages.length;
    for (const kind of ['404', 'schema', 'hash'] as const) {
      await unmount(page);
      const intercept = async (request: HTTPRequest) => {
        if (request.isInterceptResolutionHandled()) return;
        try {
          if (kind === '404' && request.url().includes('/missing-pack/')) return await request.respond({ status: 404, body: 'Not found' });
          if (kind === 'schema' && new URL(request.url()).pathname.endsWith('/pack.json')) return await request.respond({ status: 200, contentType: 'application/json', body: '{"schema":"invalid"}' });
          if (kind === 'hash' && new URL(request.url()).pathname.endsWith('.glb')) {
            assertOwnedUrl(request.url(), owned); const bytes = new Uint8Array(await (await fetch(request.url())).arrayBuffer()); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
            return await request.respond({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(bytes) });
          }
          await request.continue();
        } catch { if (!request.isInterceptResolutionHandled()) await request.abort(); }
      };
      await page.setRequestInterception(true); page.on('request', intercept);
      try {
        await page.evaluate(options => (window as any).__kilnHarness.mount(options), kind === '404' ? { assetBase: `${test.url}/missing-pack/` } : {});
        await page.waitForFunction(() => (window as any).__kilnHarness.snapshot().errors.length > 0, { timeout: 120_000 });
        await rafs(page); const value = await snapshot(page);
        assert.equal(value.errors.length, 1); assert.equal(value.readyCount, 0);
        assert.equal(value.errors[0]!.code, kind === 'hash' ? 'asset-hash' : kind === 'schema' ? 'pack-invalid' : 'asset-fetch');
        if (kind === 'hash') assert.match(value.errors[0]!.message, /\.glb/);
        const status = await page.$eval('#page-status', e => e.textContent ?? '');
        cases.push({ kind, error: value.errors[0], status });
      } finally { await unmount(page); page.off('request', intercept); await page.setRequestInterception(false); }
    }
    // A host callback that throws is reported as one runtime error, and the scene stops cleanly.
    await page.evaluate(() => (window as any).__kilnHarness.mount({ failCallback: 'tier' }));
    await page.waitForFunction(() => (window as any).__kilnHarness.snapshot().errors.length > 0, { timeout: 120_000 });
    await page.waitForFunction(() => (window as any).__kilnHarness.snapshot().fiberRoots === 0, { timeout: 120_000 });
    const value = await snapshot(page); assert.equal(value.errors.length, 1); assert.equal(value.errors[0]!.code, 'runtime'); assert.equal(value.readyCount, 0);
    cases.push({ kind: 'callback-tier', error: value.errors[0] });
    await unmount(page); await rafs(page);
    // Drop the browser's own reports of the deliberately failed responses.
    for (let i = messages.length - 1; i >= from; i--) if (messages[i]!.kind === 'console' && /Failed to load resource|net::ERR_FAILED/.test(messages[i]!.text ?? '')) messages.splice(i, 1);
    return cases;
  });
  await check('G-05 mount and unmount cycles', messages, async () => {
    const cycles: unknown[] = []; let baseline: number | null = null, last = 0;
    for (let cycle = 1; cycle <= 4; cycle++) {
      const receipts = (await snapshot(page)).disposals?.length ?? 0;
      const ready = await mount(page, {}); assert.equal(ready.readyCount, 1); assert.deepEqual(ready.errors, []);
      await waitFrames(page, 6);
      const after = await unmount(page, true); await rafs(page, 6);
      const state = await snapshot(page);
      assert.equal(state.callbacksAfterUnmount ?? 0, 0, 'no callback after unmount');
      assert.equal((state.disposals?.length ?? 0) - receipts, 1, 'one disposal receipt per mount');
      assert.equal(state.fiberRoots, 0, 'no React root left');
      const audit = await listenerAudit(page); assertTeardownListenerAudit(audit);
      const used = await heap(page); if (cycle === 2) baseline = used; last = used;
      cycles.push({ cycle, receipts: after.disposals?.length, heapMB: +(used / 1048576).toFixed(1) });
    }
    // Cycle 1 warms caches (shader programs, module state); after it the heap must not keep growing.
    const growth = (last - baseline!) / 1048576; assert(growth < 12, `heap growth from cycle 2 to 4 is ${growth.toFixed(1)} MB`);
    return { cycles, growthMB: +growth.toFixed(1) };
  });
  await check('G-11 accessibility and input', messages, async () => {
    await mount(page, {});
    const overview = await axeViolations(page); assert.deepEqual(overview, [], 'overview HUD');
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent === 'Flyovers')?.click()); await waitFrames(page, 2);
    const menu = await axeViolations(page); assert.deepEqual(menu, [], 'flyover menu');
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent === 'Flyovers')?.click());
    await page.evaluate(() => (window as any).__kilnScene.setPlaying(true)); await waitFrames(page, 4);
    const helpOpen = await page.$('.ks-help'); if (!helpOpen) await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent === 'Controls')?.click());
    await waitFrames(page, 2); assert(await page.$('.ks-help'), 'controls help open');
    const help = await axeViolations(page); assert.deepEqual(help, [], 'driving with the controls help');
    const helpBox = await page.$eval('.ks-help', e => ({ client: e.clientHeight, scroll: e.scrollHeight })); assert(helpBox.client >= Math.min(helpBox.scroll, 150), `help readable: ${JSON.stringify(helpBox)}`);
    await page.evaluate(() => (window as any).__kilnScene.setPlaying(false)); await waitFrames(page, 4);
    // Tab moves focus out of the scene root into the HUD or the page.
    await page.focus(ROOT); await page.keyboard.press('Tab'); assert.equal(await page.$eval(ROOT, root => document.activeElement !== root), true);
    // Reduced motion: the kit's motion policy reports it for a fresh mount.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await mount(page, {}); const motion = await page.evaluate(() => (window as any).__kilnScene.motionPolicy()); assert.equal(motion.reduced, true);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await unmount(page, true);
    return { overview: overview.length, menu: menu.length, help: help.length, helpBox, reducedMotion: motion.reduced };
  });
  await page.close();

  // G-12: the public build carries no test hooks or dev panel and ignores URL parameters.
  const publicMessages: ConsoleRecord[] = [];
  await check('G-12 public build', publicMessages, async () => {
    const p = await open(`${publicBuild.url}/?backend=webgl2&tier=minimal&dev=1&preset=fog&cam=deck&hud=0`, publicMessages);
    // The page's status line empties when the scene reports ready (standalone/main.tsx).
    await p.waitForFunction(() => document.querySelector('#page-status')?.textContent === '' && !!document.querySelector('.ks-hud button'), { timeout: 180_000 });
    assert.equal(await p.evaluate(() => '__kilnScene' in window || '__kilnHarness' in window), false, 'no test hooks');
    assert.equal(await p.$('.ks-dev-panel'), null, 'no dev panel');
    assert.equal(await p.$eval(ROOT, r => r.getAttribute('data-kiln-backend')), 'webgpu', 'backend parameter ignored');
    const buttons = await p.$$eval('.ks-hud button', b => b.map(x => x.textContent));
    assert(buttons.includes('Drive the sedan') && buttons.includes('Credits'), 'HUD shown (hud=0 ignored)');
    const pressed = await p.$$eval('.ks-hud [aria-checked="true"]', b => b.map(x => x.textContent)); assert.deepEqual(pressed, ['Day'], 'preset parameter ignored');
    const violations = await axeViolations(p); assert.deepEqual(violations, []);
    // Credits: the trademark note verbatim, and the machine-readable file beside the pack.
    await p.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent === 'Credits')?.click());
    const credits = await p.$eval('.ks-credits', e => e.textContent ?? '');
    assert(credits.includes('The Golden Gate Bridge name and likeness are trademarks of the Golden Gate Bridge, Highway and Transportation District. The CC0 dedication covers copyright in this model only and grants no trademark rights.'), 'trademark note verbatim');
    const json = await p.evaluate(async () => (await fetch('./assets/credits.json')).json());
    await p.close();
    return { buttons, credits: credits.length, creditEntries: Array.isArray(json.assets) ? json.assets.length : Object.keys(json).length };
  });

  // G-13: the dev build exposes the kit's development panel and the performance workloads.
  const devMessages: ConsoleRecord[] = [];
  await check('G-13 dev build', devMessages, async () => {
    const p = await open(`${dev.url}/?dev=1&preset=day`, devMessages);
    await p.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 });
    await waitFrames(p, 6);
    const panel = await p.$('.ks-dev-panel'); assert(panel, 'dev panel present');
    // The registered 'drive' workload (SPEC 20) enters the car and drives it (the kit lists no workloads, so it is run).
    const drive = await p.evaluate(async () => { const api = (window as any).__kilnScene; api.runWorkload('drive'); await api.waitFrames(60); const st = api.invoke('driveState'); return st && { speed: st.speed, z: st.z }; });
    assert(drive && drive.speed > 0, 'drive workload runs');
    await p.close();
    return { panel: !!panel, driveWorkload: drive };
  });
} finally {
  const failures = results.filter(r => !r.ok).map(r => `${r.id}: ${r.error}`);
  writeJson(resolve(PACKAGE_ROOT, 'evidence/contract/contract.json'), { captured: new Date().toISOString(), note: 'Correctness and counts only; no timing.', builds: { test: 'dist/test', public: 'dist/standalone', dev: 'dist/dev' }, ports: [...owned], results, failures });
  console.log(JSON.stringify({ pass: results.filter(r => r.ok).length, fail: failures.length, failures }));
  await chrome.close(); for (const s of servers) await s.close();
}
