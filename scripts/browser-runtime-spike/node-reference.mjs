#!/usr/bin/env node
// Node reference for the browser runtime spike (#377). Builds every spike asset with the Node
// bundle of the same entry (tmp/browser-runtime-spike/node/entry.mjs, from ./bundle.mjs), one
// fresh `node` process per asset, so the first build is cold: module load, WASM start and JIT
// included. The SHA-256 of each GLB is the reference the browser must match. KILN_* host flags
// are removed from the child environment because a page has none. Not part of the package.
//
//   node scripts/browser-runtime-spike/node-reference.mjs --seed-town <workspace>
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildOptions, loadSpikeAssets } from './assets.mjs';
import { cpuWindow, deviceClass, idleLoad, stats } from './measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(here, '..', '..', 'tmp', 'browser-runtime-spike');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const WARM_RUNS = 5;
const WARM_RUNS_SLOW = 2;
const SLOW_MS = 4000;

async function child(inputPath, outputPath) {
  const asset = JSON.parse(await readFile(inputPath, 'utf8'));
  const started = performance.now();
  const { buildProgram } = await import(pathToFileURL(join(outRoot, 'node', 'entry.mjs')).href);
  const importMs = performance.now() - started;
  const runs = [];
  const build = async () => {
    const t0 = performance.now();
    const result = await buildProgram(asset.code, buildOptions(asset));
    // The cold GLB is kept so a browser mismatch can be explained with ./glb-diff.mjs.
    if (runs.length === 0)
      await writeFile(join(outRoot, 'node-glb', `${asset.id.replace(/:/g, '-')}.glb`), result.glb);
    runs.push({
      ms: performance.now() - t0,
      sha256: sha256(result.glb),
      bytes: result.glb.byteLength,
      tris: result.tris,
      artifactGlbSha256: result.artifactGlbSha256,
      warnings: result.warnings.length,
    });
  };
  let error;
  try {
    await build();
    const warm = runs[0].ms > SLOW_MS ? WARM_RUNS_SLOW : WARM_RUNS;
    for (let i = 0; i < warm; i++) await build();
  } catch (cause) {
    error = String(cause?.stack ?? cause);
  }
  await writeFile(outputPath, JSON.stringify({ importMs, runs, error }));
}

function runChild(asset, index) {
  const dir = join(outRoot, 'node-runs');
  const input = join(dir, `${index}.in.json`);
  const output = join(dir, `${index}.out.json`);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KILN_')),
  );
  return writeFile(input, JSON.stringify(asset)).then(
    () =>
      new Promise((resolvePromise, reject) => {
        const proc = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url), '--child', input, output],
          {
            env,
            stdio: ['ignore', 'ignore', 'inherit'],
            windowsHide: true,
          },
        );
        proc.on('error', reject);
        proc.on('exit', async (code) => {
          try {
            resolvePromise({ exit: code, ...JSON.parse(await readFile(output, 'utf8')) });
          } catch (cause) {
            resolvePromise({ exit: code, error: `no result: ${cause}` });
          }
        });
      }),
  );
}

async function main(argv) {
  const seedIndex = argv.indexOf('--seed-town');
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : undefined;
  const assets = (
    await loadSpikeAssets({ seedTownWorkspace: seedIndex >= 0 ? argv[seedIndex + 1] : undefined })
  ).filter((asset) => !only || only.includes(asset.id));
  await mkdir(join(outRoot, 'node-runs'), { recursive: true });
  await mkdir(join(outRoot, 'node-glb'), { recursive: true });
  const before = await idleLoad();
  const results = [];
  for (const [index, asset] of assets.entries()) {
    const window = cpuWindow();
    const result = await runChild(asset, index);
    const cpuBusyPercent = window();
    const cold = result.runs?.[0];
    const warm = result.runs?.slice(1) ?? [];
    const shas = new Set(result.runs?.map((run) => run.sha256));
    const row = {
      id: asset.id,
      name: asset.name,
      group: asset.group,
      sourceBytes: asset.sourceBytes,
      params: asset.params,
      importMs: result.importMs,
      coldMs: cold?.ms,
      warm: stats(warm.map((run) => run.ms)),
      sha256: cold?.sha256,
      deterministic: shas.size === 1,
      glbBytes: cold?.bytes,
      tris: cold?.tris,
      warnings: cold?.warnings,
      savedGlbSha256: asset.savedGlbSha256,
      matchesSavedRevision: asset.savedGlbSha256
        ? cold?.sha256 === asset.savedGlbSha256
        : undefined,
      cpuBusyPercent,
      error: result.error,
    };
    results.push(row);
    console.log(
      `${asset.id.padEnd(32)} cold ${cold?.ms?.toFixed(0) ?? '-'} ms, warm ${row.warm.median?.toFixed(0) ?? '-'} ms, ${row.glbBytes ?? '-'} B, cpu ${cpuBusyPercent}%${row.error ? ` ERROR ${row.error.split('\n')[0]}` : ''}`,
    );
  }
  const report = {
    runtime: `node ${process.version}`,
    device: deviceClass(),
    idleCpuBusyPercentBefore: before,
    results,
  };
  await writeFile(join(outRoot, 'node-reference.json'), `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[2] === '--child') await child(process.argv[3], process.argv[4]);
else await main(process.argv.slice(2));
