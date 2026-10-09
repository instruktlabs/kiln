/** Optional browser regression; uses an installed Playwright and Chrome, no live service. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const output = await mkdtemp(path.join(os.tmpdir(), 'kiln-viewer-textures-'));
const bundle = path.join(output, 'browser.js');
const build = spawnSync(
  option('--bun', 'bun'),
  [
    'build',
    'scripts/integration/viewer-texture-fixtures.mjs',
    '--target=browser',
    `--outfile=${bundle}`,
  ],
  { cwd: root, encoding: 'utf8', windowsHide: true },
);
if (build.status !== 0) throw new Error(`Browser build failed: ${build.error ?? build.stderr}`);
const js = await readFile(bundle, 'utf8');
const widget = await readFile(path.join(root, 'dist/viewer/chat.html'), 'utf8');
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'",
  );
  if (request.url === '/widget') {
    response.end(widget);
    return;
  }
  response.end(
    `<html><body><script type="module">${js.replaceAll('</script', '<\\/script')}</script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const { chromium } = createRequire(import.meta.url)(option('--playwright', 'playwright'));
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.audit, {}, { timeout: 20000 });
  const receipt = {
    ...(await page.evaluate(() => window.audit)),
    browser: browser.version(),
    errors,
  };
  const fixture = await page.evaluate(() => window.viewerFixture);
  // Emulate the component's documented host messages. Actual ChatGPT acceptance
  // remains a separate integration check; this test uses a fresh local profile.
  await page.addInitScript(() =>
    window.addEventListener('message', (event) => {
      if (event.data?.method === 'ui/initialize')
        window.postMessage(
          {
            jsonrpc: '2.0',
            id: event.data.id,
            result: { protocolVersion: '2026-01-26', hostCapabilities: {} },
          },
          '*',
        );
    }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/widget`);
  const present = async (glb, preview) => {
    const bytes = {
      'asset.glb': Buffer.from(glb),
      ...(preview ? { 'preview.png': Buffer.from(fixture.preview, 'base64') } : {}),
    };
    const payload = {
      manifest: {
        version: 'kiln.asset.v1',
        assetId: 'a_viewer_test',
        revisionId: 'r_viewer_test',
        name: 'Viewer texture regression',
        tags: [],
        createdAt: '2026-10-09T00:00:00.000Z',
        editable: false,
        files: Object.fromEntries(
          Object.entries(bytes).map(([name, data]) => [
            name,
            {
              bytes: data.length,
              sha256: `sha256:${createHash('sha256').update(data).digest('hex')}`,
            },
          ]),
        ),
      },
      files: Object.fromEntries(
        Object.entries(bytes).map(([name, data]) => [name, data.toString('base64')]),
      ),
    };
    await page.evaluate(
      (kilnAsset) =>
        window.postMessage(
          {
            jsonrpc: '2.0',
            method: 'ui/notifications/tool-result',
            params: { _meta: { kilnAsset } },
          },
          '*',
        ),
      payload,
    );
  };
  const check = async (name, run) => {
    try {
      await run();
      receipt.results.push({ name, passed: true });
    } catch (error) {
      receipt.results.push({ name, passed: false, error: String(error) });
    }
  };
  await check('packaged component renders both texture colors', async () => {
    await present(fixture.glb, true);
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.startsWith('Drag to orbit'),
    );
    const screenshot = await page
      .locator('#stage')
      .screenshot({ path: path.join(output, 'widget.png') });
    const { data, info } = await sharp(screenshot)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let red = 0,
      green = 0;
    // Studio tone mapping lifts green's red channel; require chromatic separation,
    // not raw authoring RGB. White or background pixels satisfy neither predicate.
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 100 && data[i] > data[i + 1] + 30) red++;
      if (data[i + 1] > 100 && data[i + 1] > data[i] + 20 && data[i + 1] > data[i + 2] + 20)
        green++;
    }
    if (red < 500 || green < 500)
      throw new Error(`Missing visible texture colors: red=${red}, green=${green}`);
  });
  for (const preview of [true, false]) {
    await check(
      `failed component load ${preview ? 'shows labeled preview' : 'clears stale geometry'} and recovers`,
      async () => {
        await present(fixture.corrupt, preview);
        await page.waitForFunction(() =>
          document.querySelector('#status').textContent.includes('3D preview unavailable'),
        );
        if (await page.locator('#stage canvas').count())
          throw new Error('Failed model left a live canvas');
        if ((await page.locator('#stage img').count()) !== Number(preview))
          throw new Error('Wrong fallback surface');
        if (
          preview &&
          !(await page.locator('#status').innerText()).includes('Showing saved preview')
        )
          throw new Error('Unlabeled fallback');
        await present(fixture.glb, true);
        await page.waitForFunction(() =>
          document.querySelector('#status').textContent.startsWith('Drag to orbit'),
        );
        if (
          (await page.locator('#stage canvas').count()) !== 1 ||
          (await page.locator('#stage img').count())
        )
          throw new Error('Viewer did not recover after fallback');
      },
    );
  }
  receipt.passed = receipt.results.every((row) => row.passed);
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ output, ...receipt }, null, 2));
  if (!receipt.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
