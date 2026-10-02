// S5 Farm checks for the wave-B shadow and merge wiring, on one test build with its dev parameters as the A/B switch
// (OFF = ?heroMerge=false&shadowCache=false&standIns=false&casterTexels=0). Counts and pixels only, no timing.
//   creations: after ready (live clock, ambient on), a door toggle, the tractor-drive workload and the walk workload must
//     create no render pipeline or shader module (GPUDevice wraps installed before any page script, and three's pipeline
//     cache); bind groups and buffers are listed beside them for both settings.
//   live: per shadow tier at the hero view with ambient life on, draws per pass on a stable frame (the live map carries the
//     herd and the rotors) and the static-map re-arms over 600 frames.
//   parity: B-06 conditions (scripts/capture-farm-parity.ts: 1280x720, high, frozen clock, ambient off, 3 s settle) at the
//     hero view, the house interior and the open front door; OFF, OFF repeat and ON, judged by compareParityImages with the
//     OFF repeat as noise, plus exact pixel counts.
//   bun scripts/run-farm-shadow-ab.ts [--build packages/farm/dist/waveb-farm/test] [--dest ../tmp/drawcalls/wave-b/farm] [--only creations,live,parity]
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome, serveOwned, waitForReady, workspacePath } from '../packages/scene-kit/src/testing/node';
import { captureFarmNew, PLAY_FIXTURES, type CapturedFarm } from './capture-farm-parity';
import { compareParityImages } from './parity-images';

const args = process.argv.slice(2), value = (key: string, fallback: string) => { const at = args.indexOf(key); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const workspace = resolve(import.meta.dir, '..'), build = value('--build', 'packages/farm/dist/waveb-farm/test'), dest = resolve(workspace, value('--dest', '../tmp/drawcalls/wave-b/farm'));
const only = new Set(value('--only', 'creations,live,parity').split(','));
const OFF = 'heroMerge=false&shadowCache=false&standIns=false&casterTexels=0', SETTINGS = { on: '', off: OFF } as const;
// A partial run (--only) keeps the other sections of an earlier report for the same build.
const previous = (() => { try { const r = JSON.parse(readFileSync(resolve(dest, 'shadow-ab.json'), 'utf8')); return r.build === build ? r : {}; } catch { return {}; } })();
const report: Record<string, unknown> = { ...previous, schema: 'kiln.farm-shadow-ab/1', build, off: OFF };
delete report.error;
const save = () => writeFile(resolve(dest, 'shadow-ab.json'), JSON.stringify(report, null, 1) + '\n');

/** Installed before any page script: creation counts on the WebGPU device. */
function installCreations() {
  const w = window as any, c: Record<string, number> = w.__kilnCreations = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const m of ['createRenderPipeline', 'createRenderPipelineAsync', 'createShaderModule', 'createBindGroup', 'createBuffer', 'createTexture']) {
    const p = w.GPUDevice?.prototype, original = p?.[m]; if (typeof original !== 'function') continue;
    p[m] = function (this: unknown, ...a: unknown[]) { c[m] = (c[m] ?? 0) + 1; return original.apply(this, a); };
  }
}
const scene = (page: Page) => ({
  frames: (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n), // eslint-disable-line @typescript-eslint/no-explicit-any
  invoke: (name: string, ...a: unknown[]) => page.evaluate((n, x) => (window as any).__kilnScene.invoke(n, ...x), name, a), // eslint-disable-line @typescript-eslint/no-explicit-any
  run: (fn: string, ...a: unknown[]) => page.evaluate((f, x) => (window as any).__kilnScene[f](...x), fn, a), // eslint-disable-line @typescript-eslint/no-explicit-any
  snapshot: () => page.evaluate(() => { const s = (window as any).__kilnScene, st = s.stats(); return { gpu: { ...(window as any).__kilnCreations }, pipelines: st.pipelines, programs: st.programs, shadow: st.counts?.shadow ?? null }; }), // eslint-disable-line @typescript-eslint/no-explicit-any
});
async function open(browser: Browser, url: string, size: [number, number]) {
  const page = await browser.newPage(), messages: string[] = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.setViewport({ width: size[0], height: size[1], deviceScaleFactor: 1 }); await page.evaluateOnNewDocument(installCreations);
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 }); await waitForReady(page);
  return { page, messages };
}
const delta = (a: Awaited<ReturnType<ReturnType<typeof scene>['snapshot']>>, b: typeof a) => ({ ...Object.fromEntries([...new Set([...Object.keys(a.gpu), ...Object.keys(b.gpu)])].map(k => [k, (b.gpu[k] ?? 0) - (a.gpu[k] ?? 0)])), pipelineCache: b.pipelines - a.pipelines, programs: b.programs - a.programs });

let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined;
try {
  await mkdir(dest, { recursive: true });
  hosted = await serveOwned(workspacePath(workspace, build)); browser = await launchChrome({ workspace, name: 'farm-shadow-ab', windowSize: [1280, 720] });
  report.browser = await browser.version();
  if (only.has('creations')) {
    const rows: unknown[] = []; report.creations = rows;
    for (const tier of ['high', 'economy']) for (const [setting, query] of Object.entries(SETTINGS)) {
      const { page, messages } = await open(browser, `${hosted.url}/?tier=${tier}&view=hero${query ? '&' + query : ''}`, [1280, 720]), s = scene(page);
      try {
        await s.frames(60); const ready = await s.snapshot(), phases: Record<string, unknown> = {};
        let last = ready; const phase = async (name: string) => { await s.frames(60); const now = await s.snapshot(), sim = await s.invoke('simState') as any; phases[name] = { ...delta(last, now), staticReArms: (now.shadow?.staticRenders ?? 0) - (last.shadow?.staticRenders ?? 0), liveCasters: now.shadow?.liveCasters ?? null, tractor: sim.tractor.position, player: sim.player.position, drivenMeters: sim.drivenMeters }; last = now; }; // eslint-disable-line @typescript-eslint/no-explicit-any
        await s.run('setPlaying', true); await s.frames(2); await s.invoke('teleport', 'house'); await s.frames(3); await phase('enter play at the house');
        await s.invoke('toggleDoor', 'home-0');
        await page.waitForFunction(() => (window as any).__kilnScene.invoke('simState').doors.some((d: any) => d.id === 'home-0' && Math.abs(d.amount - 1) < 1e-3), { timeout: 60_000 }); // eslint-disable-line @typescript-eslint/no-explicit-any
        await phase('front door opened');
        await s.invoke('toggleDoor', 'home-0'); await page.waitForFunction(() => (window as any).__kilnScene.invoke('simState').doors.some((d: any) => d.id === 'home-0' && Math.abs(d.amount) < 1e-3), { timeout: 60_000 }); // eslint-disable-line @typescript-eslint/no-explicit-any
        await phase('front door closed');
        await s.run('setPlaying', false); await s.frames(3);
        await s.run('runWorkload', 'tractor-drive'); await s.frames(300); await s.run('runWorkload', ''); await phase('tractor-drive workload, 300 frames');
        await s.run('setPlaying', false); await s.frames(3);
        await s.run('runWorkload', 'walk'); await s.frames(300); await s.run('runWorkload', ''); await phase('walk workload, 300 frames');
        const total = delta(ready, last);
        rows.push({ tier, setting, ready, phases, total, noPipelineOrShader: !(total.createRenderPipeline || total.createRenderPipelineAsync || total.createShaderModule || total.pipelineCache || total.programs), messages });
        console.log(`creations ${tier} ${setting}: ${JSON.stringify(total)}`);
      } finally { await page.close(); }
      await save();
    }
  }
  if (only.has('live')) {
    const rows: unknown[] = []; report.live = rows;
    for (const tier of ['economy', 'balanced', 'high']) for (const [setting, query] of Object.entries(SETTINGS)) {
      const { page, messages } = await open(browser, `${hosted.url}/?tier=${tier}&view=hero${query ? '&' + query : ''}`, [1920, 1080]), s = scene(page);
      try {
        await s.frames(120); const before = await s.snapshot(); await s.frames(600); const after = await s.snapshot();
        const r = await page.evaluate(() => (window as any).__kilnScene.probeFrames({ frames: 8, stableFrames: 3, maxFrames: 600, timeoutMs: 150_000 })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const passes = r.passes.map((p: any) => ({ kind: p.kind, label: p.label, draws: p.draws, pipelines: p.pipelines, bySystem: Object.fromEntries(Object.entries(p.bySystem).map(([k, v]: [string, any]) => [k, v.draws])) })); // eslint-disable-line @typescript-eslint/no-explicit-any
        rows.push({ tier, setting, stable: r.stable, passes, totals: { draws: r.totals.draws, pipelines: r.totals.pipelinesUsed }, staticReArmsIn600Frames: after.shadow && before.shadow ? after.shadow.staticRenders - before.shadow.staticRenders : null, shadow: after.shadow, messages });
        console.log(`live ${tier} ${setting}: ${passes.map((p: any) => `${p.label} ${p.draws}`).join(', ')}; static re-arms in 600 frames ${after.shadow ? after.shadow.staticRenders - before.shadow.staticRenders : '-'}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      } finally { await page.close(); }
      await save();
    }
  }
  if (only.has('parity')) {
    const rows: unknown[] = []; report.parity = rows; const ports = new Set([hosted.port]), dir = resolve(dest, 'parity'); await mkdir(dir, { recursive: true });
    const exact = (a: CapturedFarm['png'], b: CapturedFarm['png']) => { let pixels = 0, max = 0; for (let i = 0; i < a.data.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!)); if (d) { pixels++; max = Math.max(max, d); } } return { differingPixels: pixels, differingFraction: pixels / (a.width * a.height), maxChannelDifference: max }; };
    for (const view of ['hero', 'house-interior', 'play-house-door']) {
      const play = PLAY_FIXTURES[view], shot = (setting: keyof typeof SETTINGS, file: string) => captureFarmNew({ browser: browser!, url: `${hosted!.url}/${SETTINGS[setting] ? '?' + SETTINGS[setting] : ''}`, ports, backend: 'webgpu', view, file: resolve(dir, `${view}-${file}.png`), ...(play ? { play } : {}) });
      const off = await shot('off', 'off'), repeat = await shot('off', 'off-repeat'), on = await shot('on', 'on');
      const metric = compareParityImages(off.png, repeat.png, on.png), { diff, tiles, ...numbers } = metric;
      await writeFile(resolve(dir, `${view}-diff.png`), PNG.sync.write({ width: diff.width, height: diff.height, data: Buffer.from(diff.data) }));
      const counts = (c: CapturedFarm) => ({ drawCalls: (c.stats.render as any)?.drawCalls, triangles: (c.stats.render as any)?.triangles, pipelines: c.stats.pipelines, programs: c.stats.programs, shadow: (c.stats.counts as any)?.shadow ?? null }); // eslint-disable-line @typescript-eslint/no-explicit-any
      rows.push({ view, metric: numbers, failingTiles: tiles.filter(t => !t.pass).map(t => ({ x: t.x, y: t.y, mean: t.mean, threshold: t.threshold })), exactOnOff: exact(off.png, on.png), exactOffRepeat: exact(off.png, repeat.png), counts: { off: counts(off), on: counts(on) } });
      console.log(`parity ${view}: pass ${numbers.pass} (tiles ${numbers.passingTiles}/144, global mean ${numbers.globalMean.toExponential(3)}); on vs off differing pixels ${exact(off.png, on.png).differingPixels}, max ${exact(off.png, on.png).maxChannelDifference}; off repeat ${exact(off.png, repeat.png).differingPixels}`);
      await save();
    }
  }
} catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error; }
finally { await browser?.close(); await hosted?.close(); await save(); }
