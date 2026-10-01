// Development probe for traffic: loads the test build headless, prints traffic statistics and a
// sample of vehicles, checks that time advances the flow, and saves screenshots from review poses.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/traffic-probe.ts [tier=high] [preset=day] [webgl2]
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const tier = arg('tier', 'high'), preset = arg('preset', 'day'), backend = process.argv.includes('webgl2') ? 'webgl2' : 'webgpu';
const out = resolve(PACKAGE_ROOT, '.tmp/traffic'); mkdirSync(out, { recursive: true });
type Pose = { position: [number, number, number]; target: [number, number, number]; fov?: number };
const POSES: Record<string, Pose | string> = {
  deck: 'deck',
  sidewalk: { position: [-11.6, 78.2, -300], target: [2, 76.4, -262], fov: 55 },
  close: { position: [-14, 79.5, -120], target: [-4, 76.8, -100], fov: 40 },
  above: { position: [-40, 118, -420], target: [0, 76, -330], fov: 50 },
  span: 'span',
  postcard: 'postcard',
};

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-traffic', 1280, 720);
try {
  const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
  page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600), url: m.location().url }));
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  const url = `${hosted.url}/?capture=1&hud=0&tier=${tier}&preset=${preset}&cam=deck&time=12${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 }).catch(() => undefined);
  const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
  console.log(JSON.stringify({ backend, tier, preset, ready: snapshot.readyCount, errors: snapshot.errors }));
  if (snapshot.readyCount > 0) {
    const invoke = (name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
    const frames = (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n);
    await frames(8);
    console.log('stats', JSON.stringify(await invoke('trafficStats')));
    const before = await invoke('trafficSample', 4) as { id: number; z: number }[];
    // Advance the frozen clock by running at normal speed briefly, then freeze again.
    await page.evaluate(() => (window as any).__kilnScene.setTimeScale(1)); await frames(30); await page.evaluate(() => (window as any).__kilnScene.setTimeScale(0));
    const after = await invoke('trafficSample', 4) as { id: number; z: number }[];
    console.log('moved', JSON.stringify(before.map(b => { const a = after.find(x => x.id === b.id); return { id: b.id, dz: a ? +(a.z - b.z).toFixed(2) : null }; })));
    for (const [name, pose] of Object.entries(POSES)) {
      if (typeof pose === 'string') await invoke('setView', pose); else await invoke('setPose', pose);
      await frames(6);
      const path = resolve(out, `${backend}-${tier}-${preset}-${name}.png`) as `${string}.png`;
      await page.screenshot({ path });
      const stats = await invoke('trafficStats') as { drawn: number; draws: number; perLevel: number[]; triangles: number; fading: number };
      console.log('shot', name, JSON.stringify({ drawn: stats.drawn, draws: stats.draws, perLevel: stats.perLevel, triangles: stats.triangles, fading: stats.fading }), path);
    }
  }
  const unexpected = unexpectedMessages(messages);
  console.log(JSON.stringify({ unexpected: unexpected.slice(0, 20), total: messages.length }));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
