// Development probe: serves dist/test on an owned port, loads the scene headless with the given
// URL parameters, and prints readiness, console messages, stats and a screenshot path.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/probe.ts "tier=high&cam=postcard" [webgl2] [--shots=day,golden,fog]
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';

const query = process.argv[2] ?? 'tier=high&cam=postcard', backend = process.argv.includes('webgl2') ? 'webgl2' : 'webgpu';
const shotsArg = process.argv.find(a => a.startsWith('--shots='))?.slice(8), size = process.argv.find(a => a.startsWith('--size='))?.slice(7)?.split('x').map(Number) ?? [1280, 720];
const out = resolve(PACKAGE_ROOT, '.tmp/probe'); mkdirSync(out, { recursive: true });
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-probe', size[0], size[1]);
try {
  const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
  page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600), url: m.location().url }));
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
  const url = `${hosted.url}/?capture=1&hud=0&${query}${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 }).catch(() => undefined);
  const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
  console.log(JSON.stringify({ backend, readyMs: Date.now() - started, ready: snapshot.readyCount, errors: snapshot.errors, adapter: snapshot.backend, progress: snapshot.progress.map((p: any) => `${p.phase}:${p.loaded}/${p.total}:${p.text}`).slice(-6) }));
  if (snapshot.readyCount > 0) {
    await page.evaluate(() => (window as any).__kilnScene.waitFrames(8));
    console.log(JSON.stringify(await page.evaluate(() => (window as any).__kilnScene.invoke('ggStats'))));
    // PowerShell passes `--shots=day,golden` as separate words; accept commas, plus signs or spaces.
    for (const preset of shotsArg ? shotsArg.split(/[,+ ]+/).filter(Boolean) : ['']) {
      if (preset) { await page.evaluate(p => (window as any).__kilnScene.invoke('setPreset', p), preset); await page.evaluate(() => (window as any).__kilnScene.waitFrames(8)); }
      const path = resolve(out, `${backend}-${preset || 'shot'}.png`) as `${string}.png`;
      await page.screenshot({ path });
      console.log('shot', path);
    }
  }
  const unexpected = unexpectedMessages(messages);
  console.log(JSON.stringify({ unexpected: unexpected.slice(0, 20), total: messages.length }));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
