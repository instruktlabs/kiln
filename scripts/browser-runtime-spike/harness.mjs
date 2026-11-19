#!/usr/bin/env node
// Browser harness for the runtime spike (#377). Serves the browser bundle from ./bundle.mjs on
// 127.0.0.1 with caching off, then for each asset starts a fresh headless Chrome process with
// a fresh profile, so every first build is cold (no HTTP or V8 code cache). The page builds
// once cold and then warm, hashes each GLB, and posts the result back. Each result is compared
// with tmp/browser-runtime-spike/node-reference.json. No driver dependency: Chrome is launched
// directly. Not part of the package.
//
//   node scripts/browser-runtime-spike/harness.mjs --seed-town <workspace> [--mode main|worker]
//        [--chrome <path>] [--only id,id]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, loadSpikeAssets } from './assets.mjs';
import { cpuWindow, deviceClass, idleLoad, stats } from './measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(here, '..', '..', 'tmp', 'browser-runtime-spike');
const bundleDir = join(outRoot, 'browser');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const PAGE = `<!doctype html><meta charset="utf-8"><title>kiln browser runtime spike</title>
<script type="module" src="/page.mjs"></script>`;

function chromeVersion(chrome) {
  if (process.platform === 'win32') {
    const probe = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-Item '${chrome}').VersionInfo.ProductVersion`],
      { encoding: 'utf8', windowsHide: true },
    );
    return probe.stdout.trim() || undefined;
  }
  return spawnSync(chrome, ['--version'], { encoding: 'utf8' }).stdout.trim() || undefined;
}

function killTree(proc) {
  if (proc.exitCode !== null) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
  else proc.kill('SIGKILL');
}

async function main(argv) {
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const mode = arg('--mode') ?? 'main';
  const chrome = arg('--chrome') ?? CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chrome) throw new Error('Chrome not found; pass --chrome <path>.');
  if (!existsSync(join(bundleDir, 'entry.js')))
    throw new Error('Run scripts/browser-runtime-spike/bundle.mjs first.');
  const only = arg('--only')?.split(',');
  const verbose = argv.includes('--verbose');
  const assets = (await loadSpikeAssets({ seedTownWorkspace: arg('--seed-town') })).filter(
    (asset) => !only || only.includes(asset.id),
  );
  const reference = existsSync(join(outRoot, 'node-reference.json'))
    ? JSON.parse(await readFile(join(outRoot, 'node-reference.json'), 'utf8'))
    : { results: [] };
  const expected = new Map(reference.results.map((row) => [row.id, row.sha256]));

  const waiting = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(200, 'text/html', PAGE);
      if (req.method === 'GET' && url.pathname === '/page.mjs')
        return send(200, TYPES['.mjs'], await readFile(join(here, 'page.mjs')));
      if (req.method === 'GET' && url.pathname.startsWith('/bundle/')) {
        const file = normalize(join(bundleDir, url.pathname.slice('/bundle/'.length)));
        if (!file.startsWith(bundleDir) || !existsSync(file)) return send(404, 'text/plain', '');
        return send(200, TYPES[extname(file)] ?? 'application/octet-stream', await readFile(file));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/job/')) {
        const asset = assets[Number(url.pathname.slice('/job/'.length))];
        return send(
          200,
          'application/json',
          JSON.stringify({
            id: asset.id,
            code: asset.code,
            options: buildOptions(asset),
            expectedSha256: expected.get(asset.id),
            warmRuns: 5,
            warmRunsSlow: 2,
            slowMs: 4000,
          }),
        );
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (req.method === 'POST' && url.pathname.startsWith('/glb/')) {
        const [, , index, which] = url.pathname.split('/');
        await mkdir(join(outRoot, 'mismatch'), { recursive: true });
        await writeFile(
          join(outRoot, 'mismatch', `${assets[index].id.replace(/[:]/g, '-')}.${which}.glb`),
          body,
        );
        return send(204, 'text/plain', '');
      }
      if (req.method === 'POST' && url.pathname.startsWith('/result/')) {
        const [, , index] = url.pathname.split('/');
        waiting.get(Number(index))?.(JSON.parse(body.toString('utf8')));
        return send(204, 'text/plain', '');
      }
      send(404, 'text/plain', '');
    } catch (error) {
      send(500, 'text/plain', String(error));
    }
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const { port } = server.address();

  const before = await idleLoad();
  const results = [];
  for (const [index, asset] of assets.entries()) {
    const profile = join(outRoot, 'chrome-profiles', `${mode}-${index}`);
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
    // Chrome exits with code 21 when the profile's parent directory is missing.
    await mkdir(profile, { recursive: true });
    const result = new Promise((resolvePromise) => {
      waiting.set(index, resolvePromise);
      // Unreferenced, so a finished run does not keep the harness alive for the full timeout.
      setTimeout(() => resolvePromise({ error: 'timeout' }), JOB_TIMEOUT_MS).unref();
    });
    const window = cpuWindow();
    const proc = spawn(
      chrome,
      [
        '--headless=new',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-default-apps',
        '--mute-audio',
        '--enable-precise-memory-info',
        ...(verbose ? ['--enable-logging=stderr', '--v=0'] : []),
        `http://127.0.0.1:${port}/?i=${index}&mode=${mode}`,
      ],
      { stdio: ['ignore', 'ignore', verbose ? 'inherit' : 'ignore'], windowsHide: true },
    );
    // A Chrome that exits before the page reports is a failed run, not a 15 minute wait.
    proc.once('exit', (code) => waiting.get(index)?.({ error: `chrome exited with code ${code}` }));
    const page = await result;
    const cpuBusyPercent = window();
    const exited = new Promise((done) =>
      proc.exitCode !== null ? done() : proc.once('exit', done),
    );
    killTree(proc);
    await exited;
    waiting.delete(index);
    const cold = page.runs?.[0];
    const warm = page.runs?.slice(1) ?? [];
    const reference = expected.get(asset.id);
    const row = {
      id: asset.id,
      name: asset.name,
      group: asset.group,
      sourceBytes: asset.sourceBytes,
      params: asset.params,
      importMs: page.importMs,
      coldMs: cold?.ms,
      warm: stats(warm.map((run) => run.ms)),
      workerColdMs: cold?.workerMs,
      sha256: cold?.sha256,
      deterministic: new Set(page.runs?.map((run) => run.sha256)).size === 1,
      glbBytes: cold?.bytes,
      tris: cold?.tris,
      nodeSha256: reference,
      matchesNode: reference && cold ? cold.sha256 === reference : undefined,
      jsHeapBytes: page.jsHeapBytes,
      resources: page.resources,
      userAgent: page.userAgent,
      hardwareConcurrency: page.hardwareConcurrency,
      cpuBusyPercent,
      error: page.error,
    };
    results.push(row);
    console.log(
      `${asset.id.padEnd(32)} import ${row.importMs?.toFixed(0) ?? '-'} ms, cold ${row.coldMs?.toFixed(0) ?? '-'} ms, warm ${row.warm.median?.toFixed(0) ?? '-'} ms, node ${row.matchesNode === undefined ? '?' : row.matchesNode ? '=' : '!='}, cpu ${cpuBusyPercent}%${row.error ? ` ERROR ${row.error.split('\n')[0]}` : ''}`,
    );
  }
  server.close();
  await rm(join(outRoot, 'chrome-profiles'), {
    recursive: true,
    force: true,
    maxRetries: 10,
  }).catch(() => undefined);
  const report = {
    mode,
    chrome: { path: chrome, version: chromeVersion(chrome) },
    device: deviceClass(),
    idleCpuBusyPercentBefore: before,
    results,
  };
  await writeFile(join(outRoot, `browser-${mode}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

await main(process.argv.slice(2));
