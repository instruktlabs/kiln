// Builds the Golden Gate standalone page in one mode and assembles it with the staged pack:
//   public -> dist/standalone (the self-contained static output), test -> dist/test, dev -> dist/dev.
// Copies the current staged release (scripts/release.ts, STAGED_RELEASE) into <out>/assets, writes THIRD-PARTY-NOTICES.txt from the bundled module graph
// (root license audit, read-only use) and serve.mjs (the kit builder's static server), and records
// bundle sizes under evidence/build/. Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/build.ts test
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { auditLicenses, renderNotices } from '../../../../scripts/check-licenses.ts';
import { PACKAGE_ROOT, SCENES_ROOT, writeJson } from './owned.ts';
import { STAGED_RELEASE, stagedDir } from '../../scripts/release.ts';

export type BuildMode = 'public' | 'test' | 'dev';
export function outputFor(mode: BuildMode, label = ''): string {
  if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('Build label must be lowercase letters, numbers and hyphens');
  return resolve(PACKAGE_ROOT, 'dist', label, mode === 'public' ? 'standalone' : mode);
}

// D-15 as amended 12:45 (DECISIONS.md): each scene freezes its bundle ceiling from its first passing
// build plus 10 percent. Golden Gate's first passing public build (15:57) was 1,633,104 B / 482,446 B
// gzip, so the ceiling is ceil(x 1.1). A public build over it fails.
export const BUNDLE_CEILING = { rule: 'first passing public build plus 10 percent (D-15 as amended 12:45)', firstPassing: { built: '2026-09-29T15:57', bytes: 1633104, gzipBytes: 482446 }, bytes: 1796415, gzipBytes: 530691 } as const;

async function directoryBytes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) { const inner = await directoryBytes(full); files += inner.files; bytes += inner.bytes; }
    else { files++; bytes += (await stat(full)).size; }
  }
  return { files, bytes };
}

export async function buildStandalone(mode: BuildMode, options: { quiet?: boolean; label?: string } = {}) {
  const output = outputFor(mode, options.label);
  await rm(output, { recursive: true, force: true });
  await build({ ...sceneStandaloneConfig({ root: resolve(PACKAGE_ROOT, 'standalone'), outDir: output, mode }), configFile: false, logLevel: options.quiet ? 'warn' : 'info' });
  const chunks = [];
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(output, 'assets', name));
    chunks.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  await cp(stagedDir(), resolve(output, 'assets'), { recursive: true });
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const staged = await directoryBytes(stagedDir()), total = await directoryBytes(output);
  const record = { mode, output, release: STAGED_RELEASE, chunks, codeBytes: chunks.reduce((s, c) => s + c.bytes, 0), codeGzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0), stagedFiles: staged.files, stagedBytes: staged.bytes, outputFiles: total.files, outputBytes: total.bytes, licenses: licenses.records.length };
  const withinCeiling = record.codeBytes <= BUNDLE_CEILING.bytes && record.codeGzipBytes <= BUNDLE_CEILING.gzipBytes;
  writeJson(resolve(PACKAGE_ROOT, 'evidence/build', options.label ?? '', `bundle-${mode}.json`), mode === 'public' ? { ...record, ceiling: BUNDLE_CEILING, withinCeiling } : record);
  if (mode === 'public' && !withinCeiling) throw new Error(`public chunk ${record.codeBytes} B / ${record.codeGzipBytes} B gzip exceeds the D-15 ceiling ${BUNDLE_CEILING.bytes} B / ${BUNDLE_CEILING.gzipBytes} B`);
  return record;
}

if (import.meta.main) {
  const modes = process.argv.slice(2).filter(arg => ['public', 'test', 'dev'].includes(arg)) as BuildMode[];
  for (const mode of modes.length ? modes : ['test'] as BuildMode[]) {
    const labelAt = process.argv.indexOf('--label');
    const record = await buildStandalone(mode, { quiet: true, ...(labelAt >= 0 ? { label: process.argv[labelAt + 1] } : {}) });
    console.log(JSON.stringify({ mode: record.mode, codeBytes: record.codeBytes, codeGzipBytes: record.codeGzipBytes, stagedBytes: record.stagedBytes, outputBytes: record.outputBytes }));
  }
}
