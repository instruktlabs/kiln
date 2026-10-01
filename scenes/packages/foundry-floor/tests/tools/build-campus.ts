// Builds the Foundry Floor campus page (FF-C1 items 8 and 9) in one mode and assembles it with the ffc1 pack:
//   public -> dist/campus/standalone (the self-contained static output), test -> dist/campus/test, dev -> dist/campus/dev.
// Restages ffc1 (scripts/stage-campus.ts, never staged/ff2), builds standalone-campus/ with the kit's standalone config,
// copies the pack into <out>/assets, writes THIRD-PARTY-NOTICES.txt from the bundled module graph (the root licence
// audit, read-only use) and serve.mjs (the kit builder's static server), and records every chunk under
// evidence/build/ffc1/: its bytes and gzip, and whether the page loads it at startup (the entry and its static imports)
// or when the exterior starts (the campus exterior, a dynamic import). D-15: the startup code is held to the ceiling
// frozen for Foundry Floor; the exterior chunk is reported beside it. FF2's build (tests/tools/build.ts) is never run
// from here: it restages staged/ff2 and rebuilds dist/standalone, which the site's round 3 builder reads.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/build-campus.ts public test dev
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { auditLicenses, renderNotices } from '../../../../scripts/check-licenses.ts';
import { PACKAGE_ROOT, SCENES_ROOT, writeJson } from './owned.ts';
import { CEILING } from './build.ts';
import { FAB_DATA_ENTRIES } from '../../scripts/stage.ts';
import { CAMPUS_RELEASE, CAMPUS_STAGED_DIR, stageCampus } from '../../scripts/stage-campus.ts';

export type BuildMode = 'public' | 'test' | 'dev';
export function campusOutputFor(mode: BuildMode): string { return resolve(PACKAGE_ROOT, 'dist/campus', mode === 'public' ? 'standalone' : mode); }
const EVIDENCE = resolve(PACKAGE_ROOT, 'evidence/build/ffc1');

async function directoryBytes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) { const inner = await directoryBytes(full); files += inner.files; bytes += inner.bytes; }
    else { files++; bytes += (await stat(full)).size; }
  }
  return { files, bytes };
}

/** A module id as a short label: the package-relative source path, or the node_modules package. */
export function moduleLabel(id: string): string {
  const path = id.replace(/\\/g, '/').replace(/^\0/, '');
  const nm = path.lastIndexOf('/node_modules/');
  if (nm >= 0) { const rest = path.slice(nm + 14).split('/'); return rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!; }
  const rel = relative(resolve(SCENES_ROOT, 'packages'), path).replace(/\\/g, '/');
  return rel.startsWith('..') ? path : rel;
}

export interface ChunkRecord { name: string; role: 'startup' | 'exterior' | 'interior'; kind: string; bytes: number; gzipBytes: number; sha256: string; imports: string[]; modules: number; largest: { module: string; renderedBytes: number }[] }

/** The exterior is requested on initial render. Count its complete dependency closure alongside the entry. */
export function initialChunkRoles(chunks: readonly { fileName: string; isEntry: boolean; imports: readonly string[]; modules: Record<string, unknown> }[]): Map<string, ChunkRecord['role']> {
  const byName = new Map(chunks.map(c => [c.fileName, c]));
  const closure = (roots: readonly string[]) => {
    const set = new Set<string>();
    const visit = (name: string) => { if (set.has(name)) return; set.add(name); for (const i of byName.get(name)?.imports ?? []) visit(i); };
    roots.forEach(visit); return set;
  };
  const startup = closure(chunks.filter(c => c.isEntry).map(c => c.fileName));
  const exterior = closure(chunks.filter(c => Object.keys(c.modules).some(id => id.replace(/\\/g, '/').endsWith('/src/campus/exterior/index.ts'))).map(c => c.fileName));
  return new Map(chunks.map(c => [c.fileName, startup.has(c.fileName) ? 'startup' : exterior.has(c.fileName) ? 'exterior' : 'interior']));
}

/** Every JS and CSS file of the build, with its role: startup (the entry chunk and everything it statically imports) or
 *  exterior (loaded by the dynamic import when the exterior starts). */
export async function chunkRecords(output: string, rollup: Rollup.RollupOutput): Promise<ChunkRecord[]> {
  const chunks = rollup.output.filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
  const roles = initialChunkRoles(chunks);
  const cssOwner = new Map<string, string>();
  for (const c of chunks) for (const css of c.viteMetadata?.importedCss ?? []) cssOwner.set(css, c.fileName);
  const records: ChunkRecord[] = [];
  for (const o of rollup.output) {
    if (!/\.(?:js|css)$/.test(o.fileName)) continue;
    const bytes = await readFile(resolve(output, o.fileName));
    const owner = o.type === 'chunk' ? o.fileName : cssOwner.get(o.fileName) ?? o.fileName;
    const role = roles.get(owner) ?? 'startup';
    const modules = o.type === 'chunk' ? Object.entries(o.modules) : [];
    records.push({
      name: o.fileName, role, kind: o.type === 'chunk' ? (o.isEntry ? 'entry' : o.isDynamicEntry ? 'dynamic entry' : 'shared') : 'css',
      bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex'), imports: o.type === 'chunk' ? o.imports : [], modules: modules.length,
      largest: modules.map(([id, m]) => ({ module: moduleLabel(id), renderedBytes: m.renderedLength })).sort((a, b) => b.renderedBytes - a.renderedBytes).slice(0, 8),
    });
  }
  return records;
}

export async function buildCampus(mode: BuildMode, options: { quiet?: boolean; stage?: boolean } = {}) {
  const staging = stageCampus({ force: true });
  const output = campusOutputFor(mode);
  if (!output.startsWith(resolve(PACKAGE_ROOT, 'dist/campus'))) throw new Error(`Refusing to build outside dist/campus: ${output}`);
  await rm(output, { recursive: true, force: true });
  const built = await build({ ...sceneStandaloneConfig({ root: resolve(PACKAGE_ROOT, 'standalone-campus'), outDir: output, mode }), configFile: false, logLevel: options.quiet ? 'warn' : 'info' });
  const rollup = (Array.isArray(built) ? built[0] : built) as Rollup.RollupOutput;
  const chunks = await chunkRecords(output, rollup);
  await cp(CAMPUS_STAGED_DIR, resolve(output, 'assets'), { recursive: true });
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const staged = await directoryBytes(CAMPUS_STAGED_DIR), total = await directoryBytes(output);
  const html = await readFile(resolve(output, 'index.html'));
  const sum = (role: ChunkRecord['role']) => chunks.filter(c => c.role === role).reduce((s, c) => ({ bytes: s.bytes + c.bytes, gzipBytes: s.gzipBytes + c.gzipBytes }), { bytes: 0, gzipBytes: 0 });
  const startupCode = sum('startup'), exteriorCode = sum('exterior');
  const fetched = (path: string) => { const bytes = readFileSync(resolve(CAMPUS_STAGED_DIR, path)); return { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }; };
  const record = {
    mode, output, release: CAMPUS_RELEASE, built: new Date().toISOString(), chunks,
    startupCode, exteriorCode, codeBytes: startupCode.bytes + exteriorCode.bytes, codeGzipBytes: startupCode.gzipBytes + exteriorCode.gzipBytes,
    htmlBytes: html.length, stagedFiles: staged.files, stagedBytes: staged.bytes,
    /** What the page fetches from the pack at startup: pack.json, every pack data entry (the asset map, the twin's data,
     *  the warm start, the campus data) and every pack model (the interior's placed models, the twelve structures and
     *  the six vehicles; the kit loads and verifies them all before the scene reports ready). */
    startupFetch: {
      packJsonBytes: readFileSync(resolve(CAMPUS_STAGED_DIR, 'pack.json')).length,
      data: Object.fromEntries(Object.entries(staging.data).map(([id, path]) => [id, fetched(path)])),
      fabData: Object.keys(FAB_DATA_ENTRIES),
      models: staging.models, modelBytes: staging.loadedModelBytes, groups: staging.groups,
    },
    outputFiles: total.files, outputBytes: total.bytes, licenses: licenses.records.length, packSha256: staging.packSha256,
  };
  if (mode !== 'public') { writeJson(resolve(EVIDENCE, `bundle-${mode}.json`), record); return record; }
  const withinCeiling = startupCode.bytes <= CEILING.bytes && startupCode.gzipBytes <= CEILING.gzipBytes;
  const headroom = { bytes: CEILING.bytes - startupCode.bytes, gzipBytes: CEILING.gzipBytes - startupCode.gzipBytes, percentOfCeiling: Math.round(startupCode.bytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(startupCode.gzipBytes / CEILING.gzipBytes * 10000) / 100 };
  const rule = 'D-15: the startup chunk (the entry and its static imports) is held to the frozen Foundry Floor ceiling; the campus exterior loads as its own chunk when the exterior starts and is reported beside it';
  writeJson(resolve(EVIDENCE, 'bundle-public.json'), { ...record, ceiling: CEILING, rule, withinCeiling, headroom });
  if (!withinCeiling) throw new Error(`startup code ${startupCode.bytes} B / ${startupCode.gzipBytes} B gzip exceeds the frozen D-15 ceiling ${CEILING.bytes} B / ${CEILING.gzipBytes} B`);
  return record;
}

if (import.meta.main) {
  const modes = process.argv.slice(2).filter(arg => ['public', 'test', 'dev'].includes(arg)) as BuildMode[];
  for (const mode of modes.length ? modes : ['test'] as BuildMode[]) {
    const record = await buildCampus(mode, { quiet: true });
    console.log(JSON.stringify({ mode: record.mode, output: relative(PACKAGE_ROOT, record.output), startupCode: record.startupCode, exteriorCode: record.exteriorCode, htmlBytes: record.htmlBytes, stagedBytes: record.stagedBytes, outputBytes: record.outputBytes, packSha256: record.packSha256 }));
    for (const c of record.chunks) console.log(`  ${c.role.padEnd(8)} ${c.kind.padEnd(13)} ${String(c.bytes).padStart(9)} B  ${String(c.gzipBytes).padStart(8)} B gzip  ${c.name}`);
  }
}
