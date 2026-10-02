// Rebuilds the Foundry Floor page code against an already sealed pack, for a code-only change (a HUD edit, say).
// build-ff3.ts restages the pack from the authors' Kiln libraries, which a checkout without them cannot do. This tool
// never stages: it takes a sealed standalone (the site's pinned input by default), checks its pack against the sealed
// receipt, builds the current source in public mode, copies the pack unchanged and writes a new public receipt whose
// code fields are measured here and whose pack fields are carried from the sealed receipt.
// The output is dist/revision2-code/standalone. It is a build, not a qualification: no browser check runs here.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/rebuild-code.ts [sealed standalone directory]
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { auditLicenses, renderNotices } from '../../../../scripts/check-licenses.ts';
import { PACKAGE_ROOT, SCENES_ROOT } from './owned.ts';
import { CEILING } from './build.ts';
import { chunkRecords } from './build-campus.ts';
import type { ChunkRecord } from './build-campus.ts';
import { againstCeiling, landmarks } from './build-ff3.ts';
import { writePublicReceipt } from './public-receipt';

const PAGE_ROOT = resolve(PACKAGE_ROOT, 'standalone-campus');
const DIST = resolve(PACKAGE_ROOT, 'dist/revision2-code');

async function directoryBytes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) { const inner = await directoryBytes(full); files += inner.files; bytes += inner.bytes; }
    else { files++; bytes += (await stat(full)).size; }
  }
  return { files, bytes };
}

interface SealedReceipt {
  mode: string; release: string; packSha256: string; stagedFiles: number; stagedBytes: number;
  startupFetch: unknown; deferredFetch: unknown; rule: string;
  ffc1: { record: string; startupCode: { bytes: number; gzipBytes: number }; exteriorCode: { bytes: number; gzipBytes: number } } | null;
  moversChunk: { note: string };
}

export async function rebuildCode(sealed: string, options: { quiet?: boolean } = {}) {
  const receipt = JSON.parse(await readFile(resolve(sealed, 'bundle-public.json'), 'utf8')) as SealedReceipt;
  if (receipt.mode !== 'public') throw new Error('Expected a sealed public receipt');
  const packSha256 = createHash('sha256').update(await readFile(resolve(sealed, 'assets/pack.json'))).digest('hex');
  if (packSha256 !== receipt.packSha256) throw new Error('Sealed pack differs from its receipt');
  const output = resolve(DIST, 'standalone');
  await rm(DIST, { recursive: true, force: true });
  const built = await build({ ...sceneStandaloneConfig({ root: PAGE_ROOT, outDir: output, mode: 'public' }), configFile: false, logLevel: options.quiet ? 'warn' : 'info' });
  const rollup = (Array.isArray(built) ? built[0] : built) as Rollup.RollupOutput;
  const chunks = await chunkRecords(output, rollup);
  const where = landmarks(rollup);
  // The pack is every sealed asset except the sealed build's own code chunks.
  let stagedFiles = 0, stagedBytes = 0;
  for (const entry of await readdir(resolve(sealed, 'assets'), { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:js|css)$/.test(entry.name)) continue;
    const from = resolve(sealed, 'assets', entry.name);
    await cp(from, resolve(output, 'assets', entry.name), { recursive: true });
    const size = entry.isDirectory() ? await directoryBytes(from) : { files: 1, bytes: (await stat(from)).size };
    stagedFiles += size.files; stagedBytes += size.bytes;
  }
  if (stagedFiles !== receipt.stagedFiles || stagedBytes !== receipt.stagedBytes) throw new Error(`Sealed pack is ${stagedFiles} files / ${stagedBytes} B; its receipt records ${receipt.stagedFiles} / ${receipt.stagedBytes}`);
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const total = await directoryBytes(output);
  const html = await readFile(resolve(output, 'index.html'));
  const sum = (role: ChunkRecord['role']) => chunks.filter(c => c.role === role).reduce((s, c) => ({ bytes: s.bytes + c.bytes, gzipBytes: s.gzipBytes + c.gzipBytes }), { bytes: 0, gzipBytes: 0 });
  const startupCode = sum('startup'), exteriorCode = sum('exterior'), interiorCode = sum('interior');
  const initialCode = { bytes: startupCode.bytes + exteriorCode.bytes, gzipBytes: startupCode.gzipBytes + exteriorCode.gzipBytes };
  const moversChunk = [...new Set(where.movers!.map(m => m.chunk))];
  const withinCeiling = initialCode.bytes <= CEILING.bytes && initialCode.gzipBytes <= CEILING.gzipBytes;
  const record = writePublicReceipt(output, resolve(DIST, 'receipt/bundle-public.json'), {
    mode: 'public', output: relative(PACKAGE_ROOT, output).replace(/\\/g, '/'), page: relative(PACKAGE_ROOT, PAGE_ROOT).replace(/\\/g, '/'), release: receipt.release, built: new Date().toISOString(),
    chunks: chunks.map(c => ({ ...c, ceiling: againstCeiling(c) })),
    startupCode, exteriorCode, interiorCode, initialCode, initialChunks: chunks.filter(c => c.role !== 'interior').map(c => c.name),
    codeBytes: initialCode.bytes + interiorCode.bytes, codeGzipBytes: initialCode.gzipBytes + interiorCode.gzipBytes,
    landmarks: where,
    moversChunk: { chunks: moversChunk, role: chunks.filter(c => moversChunk.includes(c.name)).map(c => c.role), note: receipt.moversChunk.note },
    ffc1: receipt.ffc1 ? {
      record: receipt.ffc1.record, startupCode: receipt.ffc1.startupCode, exteriorCode: receipt.ffc1.exteriorCode,
      startupChange: { bytes: startupCode.bytes - receipt.ffc1.startupCode.bytes, gzipBytes: startupCode.gzipBytes - receipt.ffc1.startupCode.gzipBytes },
      exteriorChange: { bytes: exteriorCode.bytes - receipt.ffc1.exteriorCode.bytes, gzipBytes: exteriorCode.gzipBytes - receipt.ffc1.exteriorCode.gzipBytes },
    } : null,
    htmlBytes: html.length, stagedFiles, stagedBytes, startupFetch: receipt.startupFetch, deferredFetch: receipt.deferredFetch,
    outputFiles: total.files, outputBytes: total.bytes, licenses: licenses.records.length, packSha256,
    codeRebuild: 'Code rebuilt against the sealed pack by tests/tools/rebuild-code.ts. Pack, staged and fetch fields are carried from the sealed receipt; the pack was not restaged.',
    ceiling: CEILING, rule: receipt.rule, withinCeiling,
    headroom: { bytes: CEILING.bytes - initialCode.bytes, gzipBytes: CEILING.gzipBytes - initialCode.gzipBytes, percentOfCeiling: Math.round(initialCode.bytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(initialCode.gzipBytes / CEILING.gzipBytes * 10000) / 100 },
    startupAndExterior: againstCeiling(initialCode),
  });
  if (!withinCeiling) throw new Error(`initial code ${initialCode.bytes} B / ${initialCode.gzipBytes} B gzip exceeds the frozen D-15 ceiling ${CEILING.bytes} B / ${CEILING.gzipBytes} B`);
  return record;
}

if (import.meta.main) {
  const sealed = resolve(process.argv[2] ?? resolve(SCENES_ROOT, '.cache/site-inputs/foundry-floor/standalone'));
  const record = await rebuildCode(sealed, { quiet: true });
  console.log(JSON.stringify({ output: record.output, initialCode: record.initialCode, codeBytes: record.codeBytes, codeGzipBytes: record.codeGzipBytes, outputFiles: record.outputFiles, outputBytes: record.outputBytes, packSha256: record.packSha256 }));
  for (const c of record.chunks) console.log(`  ${c.role.padEnd(8)} ${c.kind.padEnd(13)} ${String(c.bytes).padStart(9)} B  ${String(c.gzipBytes).padStart(8)} B gzip  ${c.name}`);
}
