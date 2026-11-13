// Rebuilds the Foundry Floor page code against an already sealed pack, for a code-only change (a HUD edit, say).
// build-ff3.ts restages the pack from the authors' Kiln libraries, which a checkout without them cannot do. This tool
// never stages: it takes a sealed standalone (the site's pinned input by default), checks its pack against the sealed
// receipt, builds the current source in public mode, copies the pack unchanged and writes a new public receipt whose
// code fields are measured here and whose pack fields are carried from the sealed receipt.
// The default output is dist/revision2-code/standalone. --out-dir selects a separate owned dist directory.
// It is a build, not a qualification: no browser check runs here.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/rebuild-code.ts [sealed standalone directory] [--out-dir packages/foundry-floor/dist/<label>]
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
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

const contains = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path));
};
function canonicalPath(path: string): string {
  try { return realpathSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    return resolve(canonicalPath(dirname(path)), relative(dirname(path), path));
  }
}
/** Validate the directory that will be replaced before reading or deleting any build input. */
export function codeRebuildDirectory(sealed: string, outputDir = DIST): string {
  const directory = resolve(SCENES_ROOT, outputDir);
  const owned = resolve(PACKAGE_ROOT, 'dist'), realOwned = resolve(canonicalPath(PACKAGE_ROOT), 'dist');
  const realDirectory = canonicalPath(directory), input = canonicalPath(resolve(sealed));
  if (directory === owned || !contains(owned, directory) || realDirectory === realOwned || !contains(realOwned, realDirectory)) throw new Error('Expected an owned output directory below foundry-floor/dist');
  if (contains(realDirectory, input) || contains(input, realDirectory)) throw new Error('Sealed input and output directory must not overlap');
  return directory;
}

/** Replace only this builder's public output and receipt; a test build may share the label directory. */
export async function prepareCodeRebuildDirectory(sealed: string, outputDir?: string): Promise<string> {
  const directory = codeRebuildDirectory(sealed, outputDir);
  await Promise.all(['standalone', 'receipt'].map(name => rm(resolve(directory, name), { recursive: true, force: true })));
  return directory;
}

export function codeRebuildArguments(args: string[]): { sealed?: string; outputDir?: string; packFrom?: string } {
  const result: { sealed?: string; outputDir?: string; packFrom?: string } = {};
  const usage = () => new Error('Usage: rebuild-code.ts [sealed standalone directory] [--pack-from previous sealed standalone] [--out-dir packages/foundry-floor/dist/<label>]');
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!;
    if (argument === '--out-dir' || argument === '--pack-from') {
      const value = args[++i], key = argument === '--out-dir' ? 'outputDir' : 'packFrom';
      if (result[key] !== undefined || !value || value.startsWith('--')) throw usage();
      result[key] = value;
    } else {
      if (argument.startsWith('--') || result.sealed !== undefined) throw usage();
      result.sealed = argument;
    }
  }
  return result;
}

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

/** A bundled module id relative to the checkout root, prefixed `kiln/`; ids outside the checkout are kept. */
export function portableModuleId(id: string, root = resolve(SCENES_ROOT, '..')): string {
  const path = id.replace(/\\/g, '/'), base = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/`;
  return path.toLowerCase().startsWith(base.toLowerCase()) ? `kiln/${path.slice(base.length)}` : path;
}

interface FetchGroups { interior: { staged: number; loaded: number; stagedBytes: number; loadedBytes: number }; [group: string]: { bytes?: number; stagedBytes?: number; loaded: number; staged?: number; loadedBytes?: number } }
interface FetchReceipt {
  release: string; stagedFiles: number; stagedBytes: number;
  startupFetch: { packJsonBytes: number; data: Record<string, { bytes: number; gzipBytes: number }>; models: number; modelBytes: number; modelIds: string[]; groups: FetchGroups };
  deferredFetch: { models: number; modelBytes: number; modelIds: string[]; [key: string]: unknown };
}
export interface PackView { manifest: { release: string; models: { id: string; path: string }[]; data: Record<string, string>; files: { path: string; bytes: number; sha256: string }[] }; packJsonBytes: number; read(path: string): Uint8Array }
/** Campus model groups by pack folder; any other model is the deferred interior. */
const GROUP_FOLDERS: Record<string, string> = { 'models/vehicles/': 'vehicles', 'models/structures/': 'structures', 'models/vegetation/': 'vegetation', 'models/freight/': 'freight' };

/**
 * The receipt's pack fields for a pack changed by a model swap (site/scripts/scene-pack-swap.mjs): the files whose bytes
 * changed are re-measured (sizes, model and group totals, gzip of changed data), every other value is carried from the
 * previous sealed receipt. The file list, models and data entries must be the same; the release must be new.
 */
export function changedPackFields({ receipt, previous, next }: { receipt: FetchReceipt; previous: PackView; next: PackView }) {
  if (receipt.release !== previous.manifest.release) throw new Error('The previous pack is not the one its receipt names');
  if (next.manifest.release === previous.manifest.release) throw new Error('A changed pack needs a new release');
  const paths = (v: PackView) => JSON.stringify(v.manifest.files.map(f => f.path));
  if (paths(previous) !== paths(next) || JSON.stringify(previous.manifest.models) !== JSON.stringify(next.manifest.models) || JSON.stringify(previous.manifest.data) !== JSON.stringify(next.manifest.data)) throw new Error('A changed pack must keep its file list, models and data entries');
  const before = new Map(previous.manifest.files.map(f => [f.path, f])), after = new Map(next.manifest.files.map(f => [f.path, f]));
  const delta = (path: string) => after.get(path)!.bytes - before.get(path)!.bytes;
  const changed = (path: string) => after.get(path)!.sha256 !== before.get(path)!.sha256;
  const pathOf = new Map(next.manifest.models.map(m => [m.id, m.path]));
  const startup = structuredClone(receipt.startupFetch), deferred = structuredClone(receipt.deferredFetch);
  startup.packJsonBytes = next.packJsonBytes;
  for (const [id, path] of Object.entries(next.manifest.data)) {
    if (!changed(path) || !startup.data[id]) continue;
    const bytes = next.read(path);
    startup.data[id] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }
  for (const id of startup.modelIds) {
    const path = pathOf.get(id)!;
    if (!changed(path)) continue;
    const folder = Object.keys(GROUP_FOLDERS).find(prefix => path.startsWith(prefix));
    const group = folder ? startup.groups[GROUP_FOLDERS[folder]!] : undefined;
    if (!group || group.bytes === undefined) throw new Error(`${id}: changed startup model in no recorded group`);
    group.bytes += delta(path); startup.modelBytes += delta(path);
  }
  for (const id of deferred.modelIds) {
    const path = pathOf.get(id)!;
    if (!changed(path)) continue;
    deferred.modelBytes += delta(path); startup.groups.interior.stagedBytes += delta(path);
  }
  const stagedBytesChange = next.manifest.files.reduce((n, f) => n + delta(f.path), 0) + next.packJsonBytes - previous.packJsonBytes;
  return { release: next.manifest.release, startupFetch: startup, deferredFetch: deferred, stagedBytesChange };
}

async function packView(standalone: string): Promise<PackView> {
  const bytes = await readFile(resolve(standalone, 'assets/pack.json'));
  const manifest = JSON.parse(bytes.toString('utf8')) as PackView['manifest'];
  const files = new Map<string, Uint8Array>();
  for (const f of manifest.files) {
    const content = await readFile(resolve(standalone, 'assets', f.path));
    if (content.length !== f.bytes || createHash('sha256').update(content).digest('hex') !== f.sha256) throw new Error(`${f.path}: differs from its pack.json pin`);
    files.set(f.path, content);
  }
  return { manifest, packJsonBytes: bytes.length, read: path => files.get(path)! };
}

export async function rebuildCode(sealed: string, options: { quiet?: boolean; outputDir?: string; packFrom?: string } = {}) {
  const directory = codeRebuildDirectory(sealed, options.outputDir);
  const receiptFrom = options.packFrom ?? sealed;
  const receipt = JSON.parse(await readFile(resolve(receiptFrom, 'bundle-public.json'), 'utf8')) as SealedReceipt & FetchReceipt;
  if (receipt.mode !== 'public') throw new Error('Expected a sealed public receipt');
  const receiptPack = createHash('sha256').update(await readFile(resolve(receiptFrom, 'assets/pack.json'))).digest('hex');
  if (receiptPack !== receipt.packSha256) throw new Error('Sealed pack differs from its receipt');
  const packSha256 = createHash('sha256').update(await readFile(resolve(sealed, 'assets/pack.json'))).digest('hex');
  const receiptRelease = receipt.release;
  const changedPack = options.packFrom ? changedPackFields({ receipt, previous: await packView(options.packFrom), next: await packView(sealed) }) : null;
  if (changedPack) Object.assign(receipt, { release: changedPack.release, startupFetch: changedPack.startupFetch, deferredFetch: changedPack.deferredFetch, stagedBytes: receipt.stagedBytes + changedPack.stagedBytesChange });
  const output = resolve(directory, 'standalone');
  await prepareCodeRebuildDirectory(sealed, directory);
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
  // A swapped pack's bytes are measured: the previous receipt's staged figure is carried arithmetic and is reported beside it.
  const stagedCheck = changedPack ? { previousRelease: receiptRelease, expectedFromPreviousReceipt: receipt.stagedBytes, measured: stagedBytes } : null;
  if (changedPack) receipt.stagedBytes = stagedBytes;
  if (stagedFiles !== receipt.stagedFiles || stagedBytes !== receipt.stagedBytes) throw new Error(`Sealed pack is ${stagedFiles} files / ${stagedBytes} B; its receipt records ${receipt.stagedFiles} / ${receipt.stagedBytes}`);
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  // The module receipt is published with the pack: name modules from the checkout root as `kiln/...`, as the sealed
  // receipts do, never by this machine's absolute path.
  const modulesFile = resolve(output, 'bundle-modules.json');
  const receiptModules = JSON.parse(await readFile(modulesFile, 'utf8')) as { modules: string[] };
  await writeFile(modulesFile, `${JSON.stringify({ ...receiptModules, modules: receiptModules.modules.map(id => portableModuleId(id)) }, null, 2)}\n`);
  const total = await directoryBytes(output);
  const html = await readFile(resolve(output, 'index.html'));
  const sum = (role: ChunkRecord['role']) => chunks.filter(c => c.role === role).reduce((s, c) => ({ bytes: s.bytes + c.bytes, gzipBytes: s.gzipBytes + c.gzipBytes }), { bytes: 0, gzipBytes: 0 });
  const startupCode = sum('startup'), exteriorCode = sum('exterior'), interiorCode = sum('interior');
  const initialCode = { bytes: startupCode.bytes + exteriorCode.bytes, gzipBytes: startupCode.gzipBytes + exteriorCode.gzipBytes };
  const moversChunk = [...new Set(where.movers!.map(m => m.chunk))];
  const withinCeiling = initialCode.bytes <= CEILING.bytes && initialCode.gzipBytes <= CEILING.gzipBytes;
  const record = writePublicReceipt(output, resolve(directory, 'receipt/bundle-public.json'), {
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
    codeRebuild: changedPack
      ? 'Code rebuilt by tests/tools/rebuild-code.ts against a pack whose models were swapped by site/scripts/scene-pack-swap.mjs. The staged bytes and the fetch fields of the changed files are re-measured; every other pack field is carried from the previous sealed receipt.'
      : 'Code rebuilt against the sealed pack by tests/tools/rebuild-code.ts. Pack, staged and fetch fields are carried from the sealed receipt; the pack was not restaged.',
    ...(stagedCheck ? { changedPack: { ...stagedCheck, release: receipt.release } } : {}),
    ceiling: CEILING, rule: receipt.rule, withinCeiling,
    headroom: { bytes: CEILING.bytes - initialCode.bytes, gzipBytes: CEILING.gzipBytes - initialCode.gzipBytes, percentOfCeiling: Math.round(initialCode.bytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(initialCode.gzipBytes / CEILING.gzipBytes * 10000) / 100 },
    startupAndExterior: againstCeiling(initialCode),
  });
  if (!withinCeiling) throw new Error(`initial code ${initialCode.bytes} B / ${initialCode.gzipBytes} B gzip exceeds the frozen D-15 ceiling ${CEILING.bytes} B / ${CEILING.gzipBytes} B`);
  return record;
}

if (import.meta.main) {
  const args = codeRebuildArguments(process.argv.slice(2));
  const sealed = resolve(args.sealed ?? resolve(SCENES_ROOT, '.cache/site-inputs/foundry-floor/standalone'));
  const record = await rebuildCode(sealed, { quiet: true, outputDir: args.outputDir, packFrom: args.packFrom ? resolve(args.packFrom) : undefined });
  console.log(JSON.stringify({ output: record.output, initialCode: record.initialCode, codeBytes: record.codeBytes, codeGzipBytes: record.codeGzipBytes, outputFiles: record.outputFiles, outputBytes: record.outputBytes, packSha256: record.packSha256 }));
  for (const c of record.chunks) console.log(`  ${c.role.padEnd(8)} ${c.kind.padEnd(13)} ${String(c.bytes).padStart(9)} B  ${String(c.gzipBytes).padStart(8)} B gzip  ${c.name}`);
}
