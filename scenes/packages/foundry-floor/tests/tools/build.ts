// Builds the Foundry Floor standalone page in one mode and assembles it with the staged pack:
//   public -> dist/standalone (the self-contained static output), test -> dist/test, dev -> dist/dev.
// Restages the pack (scripts/stage.ts) into staged/ff2, copies it into <out>/assets, writes THIRD-PARTY-NOTICES.txt
// from the bundled module graph (the root licence audit, read-only use) and serve.mjs (the kit builder's static
// server), and records sizes under evidence/build/ff2/. The public JS chunk is held to the D-15 ceiling the
// coordinator froze for Foundry Floor (TASK-FF2 item 6); the GLBs are pack files, not bundle bytes.
// Mirrors packages/golden-gate/tests/tools/build.ts.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/build.ts public test
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { auditLicenses, renderNotices } from '../../../../scripts/check-licenses.ts';
import { PACKAGE_ROOT, SCENES_ROOT, writeJson } from './owned.ts';
import { FAB_DATA_ENTRIES, RELEASE, STAGED_DIR, stageFoundryFloor } from '../../scripts/stage.ts';

export type BuildMode = 'public' | 'test' | 'dev';
export function outputFor(mode: BuildMode): string { return resolve(PACKAGE_ROOT, 'dist', mode === 'public' ? 'standalone' : mode); }
const EVIDENCE = resolve(PACKAGE_ROOT, 'evidence/build/ff2');

/** D-15 as amended (DECISIONS.md): FF1's first passing public build plus 10 percent, frozen by the coordinator
 *  (TASK-FF2 item 6). Every public build is held to it. */
export const CEILING = {
  rule: 'first passing public build plus 10 percent (D-15 as amended)', status: 'frozen by the coordinator (TASK-FF2 item 6)',
  firstPassing: { release: 'ff1', bytes: 1591477, gzipBytes: 446118, record: 'evidence/build/ff1/ceiling.json' },
  bytes: 1750625, gzipBytes: 490730,
} as const;

async function directoryBytes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) { const inner = await directoryBytes(full); files += inner.files; bytes += inner.bytes; }
    else { files++; bytes += (await stat(full)).size; }
  }
  return { files, bytes };
}

export async function buildStandalone(mode: BuildMode, options: { quiet?: boolean } = {}) {
  const staging = stageFoundryFloor({ force: true });
  const output = outputFor(mode);
  await rm(output, { recursive: true, force: true });
  const started = performance.now();
  await build({ ...sceneStandaloneConfig({ root: resolve(PACKAGE_ROOT, 'standalone'), outDir: output, mode }), configFile: false, logLevel: options.quiet ? 'warn' : 'info' });
  const buildMs = Math.round(performance.now() - started);
  const chunks = [];
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(output, 'assets', name));
    chunks.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  await cp(STAGED_DIR, resolve(output, 'assets'), { recursive: true });
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const staged = await directoryBytes(STAGED_DIR), total = await directoryBytes(output);
  const html = await readFile(resolve(output, 'index.html'));
  const record = {
    mode, output, release: RELEASE, built: new Date().toISOString(), buildMsIndicative: buildMs, chunks,
    codeBytes: chunks.reduce((s, c) => s + c.bytes, 0), codeGzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0),
    htmlBytes: html.length, stagedFiles: staged.files, stagedBytes: staged.bytes,
    /** What the page fetches from the pack at startup: pack.json, the asset map, the twin's data (layout, rail graph,
     *  route, tools), the stored warm start and every pack model (sim-config and about are bundled). */
    startupFetch: {
      packJsonBytes: readFileSync(resolve(STAGED_DIR, 'pack.json')).length,
      assetMapBytes: readFileSync(resolve(STAGED_DIR, 'data/assets.json')).length, assetMapGzipBytes: gzipSync(readFileSync(resolve(STAGED_DIR, 'data/assets.json'))).length,
      warmStartBytes: readFileSync(resolve(STAGED_DIR, 'data/warm/seed-1.json')).length, warmStartGzipBytes: gzipSync(readFileSync(resolve(STAGED_DIR, 'data/warm/seed-1.json'))).length,
      fabData: Object.fromEntries(Object.entries(FAB_DATA_ENTRIES).map(([id, path]) => { const bytes = readFileSync(resolve(STAGED_DIR, path)); return [id, { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }]; })),
      models: staging.loadedModels, modelBytes: staging.loadedModelBytes, stagedModels: staging.models, stagedModelBytes: staging.modelBytes,
    },
    outputFiles: total.files, outputBytes: total.bytes, licenses: licenses.records.length, packSha256: staging.packSha256,
  };
  if (mode !== 'public') { writeJson(resolve(EVIDENCE, `bundle-${mode}.json`), record); return record; }
  const withinCeiling = record.codeBytes <= CEILING.bytes && record.codeGzipBytes <= CEILING.gzipBytes;
  const headroom = { bytes: CEILING.bytes - record.codeBytes, gzipBytes: CEILING.gzipBytes - record.codeGzipBytes, percentOfCeiling: Math.round(record.codeBytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(record.codeGzipBytes / CEILING.gzipBytes * 10000) / 100 };
  writeJson(resolve(EVIDENCE, 'bundle-public.json'), { ...record, ceiling: CEILING, withinCeiling, headroom });
  if (!withinCeiling) throw new Error(`public chunk ${record.codeBytes} B / ${record.codeGzipBytes} B gzip exceeds the frozen D-15 ceiling ${CEILING.bytes} B / ${CEILING.gzipBytes} B`);
  return record;
}

if (import.meta.main) {
  const modes = process.argv.slice(2).filter(arg => ['public', 'test', 'dev'].includes(arg)) as BuildMode[];
  for (const mode of modes.length ? modes : ['test'] as BuildMode[]) {
    const record = await buildStandalone(mode, { quiet: true });
    console.log(JSON.stringify({ mode: record.mode, codeBytes: record.codeBytes, codeGzipBytes: record.codeGzipBytes, stagedBytes: record.stagedBytes, outputBytes: record.outputBytes, buildMs: record.buildMsIndicative }));
  }
}
