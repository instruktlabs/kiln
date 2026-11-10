import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneStandaloneConfig, sourcePath } from '@kiln-scenes/scene-kit/build';
import { launchChrome } from '@kiln-scenes/scene-kit/testing/node';

const root = sourcePath(new URL('../standalone/', import.meta.url));
const built = sceneStandaloneConfig({ root, outDir: resolve(root, '../dist/measure'), mode: 'dev' });
const views = [
  { name: 'nave', x: 30, z: 0, yaw: -Math.PI / 2 },
  { name: 'nave-east', x: 24, z: 0, yaw: Math.PI / 2 },
  { name: 'parvis', x: 100, z: 0, yaw: Math.PI / 2 },
  { name: 'street', x: 186, z: 0, yaw: -Math.PI / 2 },
];
const server = await createServer({
  ...built,
  configFile: false,
  publicDir: resolve(root, 'public'),
  server: { host: '127.0.0.1', port: 4477, strictPort: false },
});
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 4477;
const url = `http://127.0.0.1:${port}/?backend=webgl2&tier=balanced`;
let browser;
const errors = [];
try {
  browser = await launchChrome({
    workspace: resolve(root, '../..'),
    name: 'cathedral-square',
    headless: true,
    windowSize: [1280, 720],
    args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(240000);
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__kilnScene, { timeout: 180000 });
  await page.evaluate(() => window.__kilnScene.whenReady());
  const samples = [];
  for (const view of views) {
    await page.evaluate(pose => window.__kilnScene.placeEyes(pose.x, 0, pose.z, pose.yaw), view);
    await page.evaluate(() => window.__kilnScene.waitFrames(12));
    await page.evaluate(() => window.__kilnScene.beginMeasurement());
    await page.evaluate(() => window.__kilnScene.waitFrames(40));
    const sample = await page.evaluate(async name => {
      const api = window.__kilnScene;
      const frames = api.frameTimes();
      api.recordFrames(false);
      const sorted = frames.slice().sort((a, b) => a - b);
      const mid = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
      const stats = api.stats();
      const probe = await api.probeFrames({ frames: 4, maxFrames: 24, timeoutMs: 60000 });
      const tier = api.tierState();
      return {
        name,
        eyes: api.eyes(),
        backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null,
        tier: tier?.tier ?? null,
        pixelRatio: tier?.live?.pixelRatio ?? null,
        draws: probe.totals?.draws ?? null,
        triangles: probe.totals?.triangles ?? null,
        byKind: probe.totals?.byKind ?? null,
        info: probe.info?.render ?? null,
        stable: probe.stable ?? null,
        frameMedianMs: mid,
        frames: frames.length,
        cpuRenderMedianMs: stats.cpuRenderMedianMs,
      };
    }, view.name);
    samples.push(sample);
    console.log(JSON.stringify(sample));
  }
  const report = { url, samples, errors };
  writeFileSync(new URL('../measure-views.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  if (errors.length) throw new Error(errors.slice(0, 6).join('\n'));
} catch (error) {
  console.error(String(error));
  if (errors.length) console.error(errors.slice(0, 12).join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server.close();
}
