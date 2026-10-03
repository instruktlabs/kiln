// M4 item 1 look check for the instanced-attribute path (packages/farm/src/world/instance-attributes.ts): the same test
// build captured with the Farm's default (instance matrices as vertex attributes) and with ?instanceUniforms=true (three's
// per-mesh uniform buffers, the M3 behaviour), at every sealed named view, both backends, under the parity capture's
// fixed conditions (1280 x 720, DPR 1, tier high, frozen clock, ambient off, 3 s settle). Pixel identity is expected
// (same matrices, same transform); where a pair is not identical, a repeat of the default capture gives the noise
// floor and the B-06 tile metric judges the pair. No timing is recorded. Headless with an explicit window size; the
// server binds an owned port in 4400-4499 and is closed with the browser at the end.
//
//   bun scripts/run-farm-instance-ab.ts [--build packages/farm/dist/m4/test] [--views all|hero,...] [--backend both|webgpu|webgl2] [--dest evidence/m4/instance-ab]
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser } from 'puppeteer-core';
import { launchChrome, serveOwned, workspacePath } from '../packages/scene-kit/src/testing/node';
import { captureFarmNew, type CapturedFarm, type ParityBackend } from './capture-farm-parity';
import { compareParityImages } from './parity-images';
import { closeExtraStartupPages } from './browser-startup';

const args = process.argv.slice(2), value = (key: string, fallback: string) => { const at = args.indexOf(key); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const workspace = resolve(import.meta.dir, '..');
const build = value('--build', 'packages/farm/dist/m4/test'), out = workspacePath(workspace, value('--dest', 'evidence/m4/instance-ab'));
const layout = JSON.parse(await readFile(workspacePath(workspace, '.tmp/pilot-r34/scene/layout.json'), 'utf8')) as { views: Record<string, unknown> };
const requested = value('--views', 'all'), views = requested === 'all' ? Object.keys(layout.views) : requested.split(',');
assert(views.every(view => Object.hasOwn(layout.views, view)), 'Every view is a sealed named view');
const backend = value('--backend', 'both'), backends: ParityBackend[] = backend === 'both' ? ['webgpu', 'webgl2'] : [backend as ParityBackend];
assert(!existsSync(resolve(out, 'result.json')), `Refusing to overwrite ${out}`);
await mkdir(out, { recursive: true });

/** Exact comparison: differing pixels and the largest channel difference (0 to 255). */
function exact(a: CapturedFarm['png'], b: CapturedFarm['png']) {
  assert.equal(a.data.length, b.data.length);
  let pixels = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let differs = false;
    for (let c = 0; c < 4; c++) { const d = Math.abs(a.data[i + c]! - b.data[i + c]!); if (d) { differs = true; if (d > max) max = d; } }
    if (differs) pixels++;
  }
  return { identical: pixels === 0, differingPixels: pixels, differingFraction: pixels / (a.width * a.height), maxChannelDifference: max };
}
const summary = (capture: CapturedFarm) => ({ file: capture.file.slice(workspace.length + 1).replace(/\\/g, '/'), programs: capture.stats.programs, pipelines: capture.stats.pipelines, render: capture.stats.render, camera: capture.stats.camera, diagnostics: capture.diagnostics });

const report: Record<string, any> = { schema: 'kiln.farm-instance-ab/1', date: new Date().toISOString(), build, views, backends,
  conditions: { width: 1280, height: 720, dpr: 1, tier: 'high', time: 0, ambient: 'off', settle: '3 s (the parity capture)', order: 'attributes, uniforms; a repeat of attributes only where the pair differs' },
  rule: 'Pass: identical pixels, or where not identical the B-06 tile metric (default vs default repeat as noise) passes. No timing.', results: [] as any[] };
const save = () => writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined;
try {
  hosted = await serveOwned(workspacePath(workspace, build));
  browser = await launchChrome({ workspace, name: 'instance-ab', windowSize: [1280, 720] });
  report.browser = await browser.version(); report.port = hosted.port;
  await closeExtraStartupPages(browser);
  const ports = new Set([hosted.port]);
  for (const b of backends) for (const view of views) {
    const dir = resolve(out, `${view}-${b}`); await mkdir(dir, { recursive: true });
    const attributes = await captureFarmNew({ browser, url: hosted.url, ports, backend: b, view, file: resolve(dir, 'attributes.png') });
    const uniforms = await captureFarmNew({ browser, url: hosted.url, ports, backend: b, view, file: resolve(dir, 'uniforms.png'), instanceUniforms: true });
    const pair = exact(attributes.png, uniforms.png), result: any = { view, backend: b, exact: pair, attributes: summary(attributes), uniforms: summary(uniforms) };
    if (!pair.identical) {
      const repeat = await captureFarmNew({ browser, url: hosted.url, ports, backend: b, view, file: resolve(dir, 'attributes-repeat.png') });
      const metric = compareParityImages(attributes.png, repeat.png, uniforms.png), { diff, tiles: _tiles, ...numbers } = metric;
      await writeFile(resolve(dir, 'diff.png'), PNG.sync.write({ width: diff.width, height: diff.height, data: Buffer.from(diff.data) }));
      Object.assign(result, { repeat: summary(repeat), repeatExact: exact(attributes.png, repeat.png), metric: numbers });
    }
    result.status = pair.identical || result.metric?.pass ? 'pass' : 'fail';
    report.results.push(result); await save();
    console.log(`${view}/${b}: ${result.status} (identical ${pair.identical}, differing pixels ${pair.differingPixels}, max channel ${pair.maxChannelDifference}; programs ${attributes.stats.programs} vs ${uniforms.stats.programs})`);
  }
  report.pass = report.results.every((r: any) => r.status === 'pass');
  report.identical = report.results.filter((r: any) => r.exact.identical).length;
} catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error; }
finally {
  await browser?.close(); await hosted?.close(); report.closed = true; await save();
  console.log(JSON.stringify({ pass: report.pass, identical: report.identical, of: report.results.length }));
}
