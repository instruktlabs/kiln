import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Browser, Page } from 'puppeteer-core';
import { assertOwnedUrl, capture, CORRECTNESS_TIMEOUT, launchChrome, serveOwned, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';

const backend = process.argv.includes('--webgl') ? 'webgl2' : 'auto';
const at = process.argv.indexOf('--label'), label = at < 0 ? 'first' : process.argv[at + 1];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('A label uses lowercase letters, numbers and hyphens');
const out = `evidence/m2/static-${backend}-${label}`; await mkdir(out, { recursive: true });
const report: any = { phase: 'M2a', backend, status: 'fail', messages: [], views: [], note: 'Correctness/counts only; no timing measurements.', ledger: { browserClosed: false, serverClosed: false } };
let server: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined, page: Page | undefined;
try {
  server = await serveOwned('packages/farm/dist/test'); report.ledger.ports = [server.port];
  browser = await launchChrome({ name: 'farm-static' }); report.ledger.browserPid = browser.process()?.pid;
  page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('console', message => { if (['error', 'warn'].includes(message.type())) report.messages.push({ kind: message.type(), text: message.text() }); });
  page.on('pageerror', error => report.messages.push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', request => report.messages.push({ kind: 'requestfailed', url: request.url(), text: request.failure()?.errorText }));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(?:data|blob):/.test(request.url())) { void request.continue(); return; }
    try { assertOwnedUrl(request.url(), new Set([server!.port])); void request.continue(); }
    catch (error) { report.messages.push({ kind: 'blocked-request', text: String(error) }); void request.abort('blockedbyclient'); }
  });
  await page.goto(`${server.url}/?backend=${backend}&tier=high&time=0`, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT });
  await waitForReady(page);
  await page.addStyleTag({ content: 'body{display:block}header,footer,#page-status,.ks-hud{display:none!important}#scene-shell{position:fixed;inset:0;width:1280px;height:720px}canvas{width:1280px!important;height:720px!important}' });
  await waitFrames(page, 3);
  report.snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
  report.stats = await page.evaluate(() => (window as any).__kilnScene.stats());
  assert.equal(report.snapshot.readyCount, 1); assert.deepEqual(report.snapshot.errors, []);
  assert.equal(report.snapshot.backend.backend, backend === 'auto' ? 'webgpu' : 'webgl2');
  const counts = report.stats.counts;
  for (const [key, count] of Object.entries({ placements: 589, layoutEntries: 168, woodlandTrees: 843, woodlandCells: 16, woodlandMeshes: 64, grassTufts: 14000, grassMeshes: 16, terrainVertices: 22475, terrainTriangles: 44352, surroundingTriangles: 39690, streamTriangles: 12976, bridgeTriangles: 408 })) assert.equal(counts[key], count, key);
  assert.deepEqual(counts.tangentOffenders, []);
  for (const name of ['hero', 'watermill-wheel', 'house-interior']) {
    await page.evaluate(view => { (window as any).__kilnScene.setAmbient(false); (window as any).__kilnScene.setView(view); }, name);
    await waitFrames(page, 3); await capture(page, `${out}/${name}.png`);
    report.views.push({ name, stats: await page.evaluate(() => (window as any).__kilnScene.stats()) });
  }
  assert.deepEqual(report.messages, []); report.status = 'pass';
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  if (page && !page.isClosed()) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); report.failureSnapshot = await page.evaluate(() => (window as any).__kilnHarness?.snapshot()).catch(() => null); }
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed()) {
    try { await page.evaluate(() => (window as any).__kilnHarness?.unmount()); await page.waitForFunction(() => !(window as any).__kilnHarness || ((window as any).__kilnHarness.snapshot().fiberRoots === 0 && !document.querySelector('.ks-root')), { timeout: CORRECTNESS_TIMEOUT }); report.finalSnapshot = await page.evaluate(() => (window as any).__kilnHarness?.snapshot()); }
    catch (error) { report.cleanupError = String(error); process.exitCode = 1; }
  }
  if (browser) { await browser.close(); report.ledger.browserClosed = true; }
  if (server) { await server.close(); report.ledger.serverClosed = true; }
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
