// Builds the Foundry Floor page for FF3 (TASK-FF3 items 7 and 8) in one mode and assembles it with the ff3 pack:
//   public -> dist/ff3/standalone (the self-contained static output), test -> dist/ff3/test, dev -> dist/ff3/dev.
// The page is FF-C1's campus page (standalone-campus/): the campus exterior with the way in to the interior twin, which
// now draws the placed subfab kits (D-42) and the humanoid work robot's visits. The ff3 pack holds everything ffc1 holds
// plus FF3's data, so the one page serves both places.
// The pack comes from scripts/stage-ff3.ts, called without force: the build reproduces the staged pack byte for byte or
// stops (restage deliberately with `stage-ff3.ts --force`). FF2's and FF-C1's builds and packs (dist/standalone,
// dist/campus, staged/ff2, staged/ffc1) are never written: neither stageFoundryFloor nor stageCampus is called here.
// Copies the pack into <out>/assets, writes THIRD-PARTY-NOTICES.txt from the bundled module graph (the root licence
// audit, read-only use) and serve.mjs (the kit builder's static server), and records under evidence/build/ff3/ every
// chunk (bytes, gzip, role, largest modules), the chunk each landmark module sits in (the movers, the twin, the bundled
// sim config, the campus exterior) and what the page fetches. D-15: the public startup code (the entry and its static
// imports) is held to the ceiling frozen for Foundry Floor; every chunk is reported against it.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/build-ff3.ts public test dev
import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { sceneStandaloneConfig } from '../../../scene-kit/src/build/index.ts';
import { auditLicenses, renderNotices } from '../../../../scripts/check-licenses.ts';
import { PACKAGE_ROOT, SCENES_ROOT, readJson, writeJson } from './owned.ts';
import { CEILING } from './build.ts';
import { chunkRecords, moduleLabel } from './build-campus.ts';
import type { ChunkRecord } from './build-campus.ts';
import { FF3_RELEASE, FF3_STAGED_DIR, stageFf3 } from '../../scripts/stage-ff3.ts';
import { campusStartupModel } from '../../src/campus/loading';
import { writePublicReceipt } from './public-receipt';

export type BuildMode = 'public' | 'test' | 'dev';
const DIST = resolve(PACKAGE_ROOT, 'dist/ff3');
export function ff3OutputFor(mode: BuildMode,revision2=false): string { return resolve(revision2?resolve(PACKAGE_ROOT,'dist/revision2'):DIST, mode === 'public' ? 'standalone' : mode); }
const EVIDENCE = resolve(PACKAGE_ROOT, 'evidence/build/ff3');
/** The page: FF-C1's campus page root, unchanged. */
const PAGE_ROOT = resolve(PACKAGE_ROOT, 'standalone-campus');

/** Modules whose chunk the record names (labels as moduleLabel gives them). The movers are the twin's moving things as
 *  the page draws them: the people classes (people.ts: the technician and the humanoid walking their visits) and the
 *  world that poses every mover (glb-world.ts: OHT vehicles, FOUPs, the floor robots, the people), with the service
 *  visits they walk (sim/service.ts). */
export const LANDMARKS: Readonly<Record<string, readonly string[]>> = {
  movers: ['foundry-floor/src/scene/people.ts', 'foundry-floor/src/scene/world/glb-world.ts', 'foundry-floor/src/sim/service.ts'],
  twin: ['foundry-floor/src/sim/fab.ts'],
  simConfig: ['foundry-floor/data/sim-config.json'],
  interiorScene: ['foundry-floor/src/scene/World.tsx'],
  campusExterior: ['foundry-floor/src/campus/exterior/index.ts', 'foundry-floor/src/campus/exterior/traffic.ts'],
};

async function directoryBytes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) { const inner = await directoryBytes(full); files += inner.files; bytes += inner.bytes; }
    else { files++; bytes += (await stat(full)).size; }
  }
  return { files, bytes };
}

/** Each landmark module's chunk and rendered bytes; a landmark in no chunk is an error. */
function landmarks(rollup: Rollup.RollupOutput): Record<string, { module: string; chunk: string; renderedBytes: number }[]> {
  const where = new Map<string, { chunk: string; renderedBytes: number }>();
  for (const o of rollup.output) if (o.type === 'chunk') for (const [id, m] of Object.entries(o.modules)) where.set(moduleLabel(id), { chunk: o.fileName, renderedBytes: m.renderedLength });
  const out: Record<string, { module: string; chunk: string; renderedBytes: number }[]> = {};
  for (const [group, modules] of Object.entries(LANDMARKS)) {
    out[group] = modules.map(module => {
      const w = where.get(module);
      if (!w) throw new Error(`Landmark module ${module} (${group}) is in no chunk of the build`);
      return { module, ...w };
    });
  }
  return out;
}

/** Every chunk against the frozen ceiling: bytes and gzip, and their share of it in percent. */
function againstCeiling(c: { bytes: number; gzipBytes: number }) {
  return {
    bytes: c.bytes, gzipBytes: c.gzipBytes, withinCeiling: c.bytes <= CEILING.bytes && c.gzipBytes <= CEILING.gzipBytes,
    percentOfCeiling: Math.round(c.bytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(c.gzipBytes / CEILING.gzipBytes * 10000) / 100,
  };
}

export async function buildFf3(mode: BuildMode, options: { quiet?: boolean;revision2?:boolean;finalIntake?:boolean } = {}) {
  if (options.finalIntake && !options.revision2) throw new Error('Final intake requires revision2');
  const stagedDir=options.revision2?resolve(PACKAGE_ROOT,'staged/revision2'):FF3_STAGED_DIR;
  const evidence=options.revision2?resolve(PACKAGE_ROOT,options.finalIntake?'evidence/revision2/final-intake/build':'evidence/revision2/build'):EVIDENCE;
  const staging = stageFf3(options.revision2?{revision2:true,release:'ff3-review2',out:stagedDir,generated:resolve(PACKAGE_ROOT,'staged/generated-revision2')}:{});
  if (staging.out !== stagedDir) throw new Error(`FF3 staged into unexpected directory`);
  const output = ff3OutputFor(mode,options.revision2),dist=resolve(PACKAGE_ROOT,options.revision2?'dist/revision2':'dist/ff3');
  if (!output.startsWith(dist + '\\') && !output.startsWith(dist + '/')) throw new Error(`Refusing to build outside the selected dist folder: ${output}`);
  await rm(output, { recursive: true, force: true });
  const built = await build({ ...sceneStandaloneConfig({ root: PAGE_ROOT, outDir: output, mode }), configFile: false, logLevel: options.quiet ? 'warn' : 'info' });
  const rollup = (Array.isArray(built) ? built[0] : built) as Rollup.RollupOutput;
  const chunks = await chunkRecords(output, rollup);
  const where = landmarks(rollup);
  await cp(stagedDir, resolve(output, 'assets'), { recursive: true });
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(SCENES_ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(SCENES_ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const staged = await directoryBytes(stagedDir), total = await directoryBytes(output);
  const html = await readFile(resolve(output, 'index.html'));
  const sum = (role: ChunkRecord['role']) => chunks.filter(c => c.role === role).reduce((s, c) => ({ bytes: s.bytes + c.bytes, gzipBytes: s.gzipBytes + c.gzipBytes }), { bytes: 0, gzipBytes: 0 });
  const startupCode = sum('startup'), exteriorCode = sum('exterior'), interiorCode = sum('interior');
  const initialCode = { bytes: startupCode.bytes + exteriorCode.bytes, gzipBytes: startupCode.gzipBytes + exteriorCode.gzipBytes };
  const fetched = (path: string) => { const bytes = readFileSync(resolve(stagedDir, path)); return { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }; };
  const moversChunk = [...new Set(where.movers!.map(m => m.chunk))];
  const packManifest=JSON.parse(readFileSync(resolve(stagedDir,'pack.json'),'utf8')) as {models:{id:string;path:string}[];files:{path:string;bytes:number}[]};
  const deferredModels=options.revision2?packManifest.models.filter(m=>!campusStartupModel(m)):[];
  const deferredBytes=deferredModels.reduce((n,m)=>n+packManifest.files.find(f=>f.path===m.path)!.bytes,0);
  // FF-C1's record of the same mode, for the change (read only; absent records give null).
  const ffc1 = readJson<{ chunks: ChunkRecord[]; startupCode: { bytes: number; gzipBytes: number }; exteriorCode: { bytes: number; gzipBytes: number } }>(resolve(PACKAGE_ROOT, `evidence/build/ffc1/bundle-${mode}.json`));
  const record = {
    mode, output: relative(PACKAGE_ROOT, output).replace(/\\/g, '/'), page: relative(PACKAGE_ROOT, PAGE_ROOT).replace(/\\/g, '/'), release: staging.release, built: new Date().toISOString(),
    chunks: chunks.map(c => ({ ...c, ceiling: againstCeiling(c) })),
    startupCode, exteriorCode, interiorCode, initialCode, initialChunks: chunks.filter(c => c.role !== 'interior').map(c => c.name),
    codeBytes: initialCode.bytes + interiorCode.bytes, codeGzipBytes: initialCode.gzipBytes + interiorCode.gzipBytes,
    landmarks: where,
    moversChunk: { chunks: moversChunk, role: chunks.filter(c => moversChunk.includes(c.name)).map(c => c.role), note: 'the chunks that hold people.ts, glb-world.ts and sim/service.ts: the people classes (technician and humanoid), the world that poses OHT vehicles, FOUPs, production floor transfers and people, and the service visits they walk' },
    ffc1: ffc1 ? {
      record: `evidence/build/ffc1/bundle-${mode}.json`, startupCode: ffc1.startupCode, exteriorCode: ffc1.exteriorCode,
      startupChange: { bytes: startupCode.bytes - ffc1.startupCode.bytes, gzipBytes: startupCode.gzipBytes - ffc1.startupCode.gzipBytes },
      exteriorChange: { bytes: exteriorCode.bytes - ffc1.exteriorCode.bytes, gzipBytes: exteriorCode.gzipBytes - ffc1.exteriorCode.gzipBytes },
    } : null,
    htmlBytes: html.length, stagedFiles: staged.files, stagedBytes: staged.bytes,
    /** What the page fetches from the pack at startup: pack.json, every pack data entry (the asset map, the twin's data,
     *  the warm start, the campus data) and every pack model (the interior's placed models, now with the subfab kit and
     *  the humanoid, the twelve structures and the six vehicles; the kit loads and verifies them all before ready). */
    startupFetch: {
      packJsonBytes: readFileSync(resolve(stagedDir, 'pack.json')).length,
      data: Object.fromEntries(Object.entries(staging.data).map(([id, path]) => [id, fetched(path)])),
      models: staging.models-deferredModels.length, modelBytes: staging.loadedModelBytes-deferredBytes,
      modelIds:packManifest.models.filter(m=>!deferredModels.includes(m)).map(m=>m.id),
      groups:{...staging.groups,interior:{...staging.groups.interior,loaded:staging.groups.interior.loaded-deferredModels.length,loadedBytes:staging.groups.interior.loadedBytes-deferredBytes}},
    },
    deferredFetch:{trigger:'Enter the fab',models:deferredModels.length,modelBytes:deferredBytes,modelIds:deferredModels.map(m=>m.id),release:'Interior model geometry/materials are disposed and removed from the runtime pack on exit.'},
    outputFiles: total.files, outputBytes: total.bytes, licenses: licenses.records.length, packSha256: staging.packSha256,
  };
  if (mode !== 'public') { writeJson(resolve(evidence, `bundle-${mode}.json`), record); return record; }
  const withinCeiling = initialCode.bytes <= CEILING.bytes && initialCode.gzipBytes <= CEILING.gzipBytes;
  const headroom = { bytes: CEILING.bytes - initialCode.bytes, gzipBytes: CEILING.gzipBytes - initialCode.gzipBytes, percentOfCeiling: Math.round(initialCode.bytes / CEILING.bytes * 10000) / 100, percentOfGzipCeiling: Math.round(initialCode.gzipBytes / CEILING.gzipBytes * 10000) / 100 };
  const rule = 'D-15: all code loaded for the initial campus view (entry, exterior and their static dependency closure) must fit the unchanged ceiling. The twin interior is requested only by Enter the fab. Every chunk is hashed and reported.';
  const publicRecord = writePublicReceipt(output, resolve(evidence, 'bundle-public.json'), { ...record, ceiling: CEILING, rule, withinCeiling, headroom, startupAndExterior: againstCeiling(initialCode) });
  if (!withinCeiling) throw new Error(`initial code ${initialCode.bytes} B / ${initialCode.gzipBytes} B gzip exceeds the frozen D-15 ceiling ${CEILING.bytes} B / ${CEILING.gzipBytes} B`);
  return publicRecord;
}

if (import.meta.main) {
  const modes = process.argv.slice(2).filter(arg => ['public', 'test', 'dev'].includes(arg)) as BuildMode[];
  if (!existsSync(resolve(FF3_STAGED_DIR, 'pack.json'))) throw new Error('Stage ff3 first: ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/stage-ff3.ts');
  for (const mode of modes.length ? modes : ['test'] as BuildMode[]) {
    const record = await buildFf3(mode, { quiet: true,revision2:process.argv.includes('--revision2'),finalIntake:process.argv.includes('--final-intake') });
    console.log(JSON.stringify({ mode: record.mode, output: record.output, startupCode: record.startupCode, exteriorCode: record.exteriorCode, htmlBytes: record.htmlBytes, stagedBytes: record.stagedBytes, outputBytes: record.outputBytes, packSha256: record.packSha256, moversChunk: record.moversChunk.chunks }));
    for (const c of record.chunks) console.log(`  ${c.role.padEnd(8)} ${c.kind.padEnd(13)} ${String(c.bytes).padStart(9)} B  ${String(c.gzipBytes).padStart(8)} B gzip  ${String(c.ceiling.percentOfCeiling).padStart(6)} % / ${String(c.ceiling.percentOfGzipCeiling).padStart(6)} % of the ceiling  ${c.name}`);
    for (const [group, list] of Object.entries(record.landmarks)) console.log(`  ${group.padEnd(15)} ${list.map(l => `${l.module.replace('foundry-floor/', '')} -> ${l.chunk} (${l.renderedBytes} B rendered)`).join('; ')}`);
  }
}
