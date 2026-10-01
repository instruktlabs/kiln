// A quick headless smoke run of the dist/test build (not evidence): the page loads from the staged pack on an owned
// port (4700-4749), becomes ready on WebGPU and on the WebGL2 fallback, and reports the world's counts, the kit's
// render counters and any unexpected console message. Screenshots go to .tmp/smoke (ignored).
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/smoke.ts [--build] [--backends=webgpu,webgl2] [--views=landing,overview]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, type ConsoleRecord } from './owned.ts';
import { buildStandalone, outputFor } from './build.ts';
import { loadSample } from '../../scripts/load-sample.ts';

type Backend = 'webgpu' | 'webgl2';
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const backends = (arg('backends') ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const views = (arg('views') ?? 'landing').split(/[,+ ]+/).filter(Boolean);
const out = resolve(PACKAGE_ROOT, '.tmp/smoke');
mkdirSync(out, { recursive: true });
if (process.argv.includes('--build')) await buildStandalone('test', { quiet: true });

const load = await loadSample();
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('ff-smoke', 1280, 720);
try {
  for (const backend of backends) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    try {
      const url = `${hosted.url}/?capture=1&freeze=1&tier=high${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
      assertOwnedUrl(url, owned);
      const started = Date.now();
      await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000, polling: 200 });
      const readyMs = Date.now() - started;
      const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
      if (!snapshot.readyCount) { console.log(JSON.stringify({ backend, errors: snapshot.errors, messages: messages.slice(0, 12) })); continue; }
      for (const view of views) {
        await page.evaluate((v: string) => (window as any).__kilnScene.invoke('ffSetView', v), view);
        await page.evaluate(() => (window as any).__kilnScene.waitFrames(8));
        const state = await page.evaluate(() => (window as any).__kilnScene.invoke('ffState'));
        const stats = await page.evaluate(() => { const s = (window as any).__kilnScene.stats(); return { programs: s.programs, pipelines: s.pipelines, render: s.render }; });
        const png = Buffer.from(await page.screenshot({ type: 'png' }));
        writeFileSync(resolve(out, `${backend}-${view}.png`), png);
        const w = state?.world;
        console.log(JSON.stringify({ backend, actual: snapshot.backend?.backend, fellBack: snapshot.backend?.fellBack, view, readyMs, simMs: state?.simMs, mode: state?.mode,
          world: w && { instances: w.instances, drawn: w.drawn, draws: w.draws, triangles: w.triangles, lod1: w.lod1, people: w.people, pulses: w.pulses },
          kit: { programs: stats.programs, pipelines: stats.pipelines, drawCalls: stats.render?.drawCalls, triangles: stats.render?.triangles }, png: png.length }));
      }
      const unexpected = unexpectedMessages(messages);
      console.log(JSON.stringify({ backend, unexpected: unexpected.length, first: unexpected.slice(0, 6) }));
    } finally { await page.close(); }
  }
  console.log(JSON.stringify({ load }));
} finally { await chrome.close(); await hosted.close(); }
