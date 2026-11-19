#!/usr/bin/env node
// Markdown tables for the spike review from tmp/browser-runtime-spike/*.json: per-asset times
// (Node, browser main thread, browser worker), byte equality and, for each mismatch, what
// differs (from ./glb-diff.mjs). Not part of the package.
//
//   node scripts/browser-runtime-spike/report.mjs
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffGlb } from './glb-diff.mjs';

const outRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'tmp',
  'browser-runtime-spike',
);
const load = async (name) =>
  existsSync(join(outRoot, name))
    ? JSON.parse(await readFile(join(outRoot, name), 'utf8'))
    : undefined;
const ms = (value) => (value === undefined ? '-' : `${Math.round(value)}`);
const kib = (bytes) =>
  bytes === undefined ? '-' : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)}`;

const node = await load('node-reference.json');
const main = await load('browser-main.json');
const worker = await load('browser-worker.json');
const bundle = await load('bundle-report.json');
const byId = (report) => new Map((report?.results ?? []).map((row) => [row.id, row]));
const mains = byId(main);
const workers = byId(worker);

const lines = [];
lines.push(
  '| Asset | Params | Source KiB | GLB KiB | Node cold / warm ms | Chrome main cold / warm ms | Chrome worker cold / warm ms | Browser = Node | CPU busy % (node, main, worker) |',
  '|---|---|--:|--:|--:|--:|--:|:-:|--:|',
);
for (const row of node?.results ?? []) {
  const m = mains.get(row.id);
  const w = workers.get(row.id);
  const params = row.params
    ? row.params.preset
      ? `preset ${row.params.preset}`
      : Object.entries(row.params.values ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
    : row.group === 'seed-town'
      ? 'defaults'
      : '';
  const equal = [m, w]
    .map((r) =>
      r?.error ? 'error' : r?.matchesNode === undefined ? '-' : r.matchesNode ? 'yes' : 'no',
    )
    .join(' / ');
  lines.push(
    `| ${row.id} | ${params} | ${kib(row.sourceBytes)} | ${kib(row.glbBytes)} | ${ms(row.coldMs)} / ${ms(row.warm.median)} | ${ms(m?.coldMs)} / ${ms(m?.warm?.median)} | ${ms(w?.coldMs)} / ${ms(w?.warm?.median)} | ${equal} | ${row.cpuBusyPercent}, ${m?.cpuBusyPercent ?? '-'}, ${w?.cpuBusyPercent ?? '-'} |`,
  );
}
console.log(lines.join('\n'));

console.log(
  '\nImport (bundle load) ms, main thread: ',
  (main?.results ?? []).map((r) => ms(r.importMs)).join(', '),
);
console.log('Worker start ms: ', (worker?.results ?? []).map((r) => ms(r.importMs)).join(', '));
console.log('Node import ms: ', (node?.results ?? []).map((r) => ms(r.importMs)).join(', '));
console.log(
  'JS heap after builds (MiB), main: ',
  (main?.results ?? []).map((r) => (r.jsHeapBytes / 2 ** 20).toFixed(0)).join(', '),
);
console.log(
  'Node deterministic across runs: ',
  (node?.results ?? []).every((r) => r.deterministic),
);
console.log(
  'Browser deterministic across runs: ',
  [...(main?.results ?? []), ...(worker?.results ?? [])].every((r) => r.deterministic),
);
console.log(
  'Node = saved revision GLB: ',
  (node?.results ?? [])
    .filter((r) => r.matchesSavedRevision !== undefined)
    .map((r) => `${r.id}=${r.matchesSavedRevision}`)
    .join(', '),
);
console.log(
  'Errors: ',
  JSON.stringify(
    [...(node?.results ?? []), ...(main?.results ?? []), ...(worker?.results ?? [])]
      .filter((r) => r.error)
      .map((r) => [r.id, r.error.split('\n')[0]]),
  ),
);
console.log(
  'Main vs worker sha equal: ',
  (main?.results ?? []).every(
    (r) => workers.get(r.id)?.sha256 === undefined || workers.get(r.id).sha256 === r.sha256,
  ),
);

console.log('\nMismatches:');
for (const row of main?.results ?? []) {
  if (row.matchesNode !== false) continue;
  const file = row.id.replace(/:/g, '-');
  const nodeGlb = join(outRoot, 'node-glb', `${file}.glb`);
  const browserGlb = join(outRoot, 'mismatch', `${file}.main.glb`);
  if (!existsSync(nodeGlb) || !existsSync(browserGlb)) {
    console.log(`- ${row.id}: GLBs not kept`);
    continue;
  }
  const diff = await diffGlb(nodeGlb, browserGlb);
  const images = diff.images.filter((image) => !image.sameBytes);
  const attrs = diff.accessors.map(
    (x) =>
      `${x.usedBy.join('+') || `accessor ${x.accessor}`} ${x.differing}/${x.count} max |d| ${x.maxDelta.toExponential(1)}`,
  );
  console.log(
    `- ${row.id}: other JSON ${diff.jsonOtherThanLayout.length}; images re-encoded ${images.length}/${diff.images.length}, pixels equal ${images.every((image) => image.samePixels)}; accessors differing ${diff.accessors.length}${attrs.length ? `: ${attrs.slice(0, 4).join('; ')}${attrs.length > 4 ? '; ...' : ''}` : ''}`,
  );
}

if (bundle) {
  const { total, initialEntry, files } = bundle.browser;
  console.log(`\nBundle: initial ${JSON.stringify(initialEntry)}, all ${JSON.stringify(total)}`);
  const fetched = new Map();
  for (const row of main?.results ?? [])
    for (const resource of row.resources ?? [])
      fetched.set(resource.name.replace('/bundle/', ''), true);
  const firstBuild = { raw: 0, gzip: 0, brotli: 0 };
  for (const [file, size] of Object.entries(files))
    if (fetched.has(file)) for (const key of Object.keys(firstBuild)) firstBuild[key] += size[key];
  console.log(
    `Fetched during builds (union over assets): ${[...fetched.keys()].length} files ${JSON.stringify(firstBuild)}`,
  );
}
