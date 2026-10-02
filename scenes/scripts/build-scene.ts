// Builds one scene's standalone page from source against a sealed pack, for count probes and A/B captures (S1, OD-17).
//   bun scripts/build-scene.ts --scene farm|foundry-floor|golden-gate --mode test|public|dev --label <l> [--pack <dir>]
// Output: packages/<scene>/dist/<label>/<mode>, with serve.mjs, THIRD-PARTY-NOTICES.txt and build.json beside the page.
// The pack defaults to the pinned site input (.cache/site-inputs/<scene>/standalone/assets) minus its top-level code
// chunks; it is checked against its pack.json and SHA256SUMS (verifyStaged) before copying and never restaged. The
// scenes' own builders (build-farm.ts, golden-gate tests/tools/build.ts, foundry-floor rebuild-code.ts) stay as they are.
// `--base <git ref> [--overlay <path,…>]` builds from a snapshot of scenes/packages at that ref (under .tmp/build-src) with
// only the listed working-tree files laid over it, so a baseline is not mixed with other work in progress in the tree.
// This is a build, not a qualification: no browser runs here.
import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, realpathSync, symlinkSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sceneStandaloneConfig, type SceneBuildMode } from '../packages/scene-kit/src/build';
import { verifyStaged } from '../packages/scene-kit/src/staging';
import { auditLicenses, renderNotices } from './check-licenses';

export const SCENES = { farm: 'packages/farm/standalone', 'foundry-floor': 'packages/foundry-floor/standalone-campus', 'golden-gate': 'packages/golden-gate/standalone' } as const;
export type SceneId = keyof typeof SCENES;
const ROOT = resolve(import.meta.dir, '..');
const CODE_CHUNK = /^[^/]+\.(?:js|css): extra staged file$/;
export const sceneOutput = (scene: SceneId, label: string, mode: SceneBuildMode) => resolve(ROOT, 'packages', scene, 'dist', label, mode);

const run = (command: string, args: string[], cwd: string) => { const r = spawnSync(command, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${r.stderr || r.error}`); return r.stdout; };
/**
 * scenes/packages at `ref` plus `overlay` (paths relative to scenes/, copied from the working tree), with each package's
 * node_modules rebuilt from junctions to the installed ones, except workspace links, which point into the snapshot.
 */
export async function snapshotPackages(ref: string, overlay: string[], label: string): Promise<{ root: string; overlay: { path: string; sha256: string }[]; commit: string }> {
  const root = resolve(ROOT, '.tmp/build-src', label), archive = resolve(ROOT, '.tmp/build-src', `${label}.tar`);
  await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true });
  const commit = run('git', ['rev-parse', ref], ROOT).trim();
  // From scenes/, `git archive <commit> packages` holds paths relative to scenes/. Relative tar paths: GNU tar reads `C:` as a host.
  run('git', ['archive', '--format=tar', '-o', archive, commit, 'packages'], ROOT);
  run('tar', ['-xf', `../${label}.tar`], root); await rm(archive);
  if (!existsSync(resolve(root, 'packages/scene-kit/package.json'))) throw new Error(`Snapshot of ${ref} has no packages`);
  const laid = [];
  for (const path of overlay) {
    if (!/^packages\//.test(path)) throw new Error(`Overlay ${path} must be under packages/`);
    const bytes = await readFile(resolve(ROOT, path)); await mkdir(resolve(root, path, '..'), { recursive: true }); await writeFile(resolve(root, path), bytes);
    laid.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const name of readdirSync(resolve(root, 'packages'))) {
    const live = resolve(ROOT, 'packages', name, 'node_modules'), mine = resolve(root, 'packages', name, 'node_modules');
    if (!existsSync(live)) continue;
    await mkdir(mine, { recursive: true });
    for (const entry of readdirSync(live)) {
      if (entry !== '@kiln-scenes') { symlinkSync(realpathSync(resolve(live, entry)), resolve(mine, entry), 'junction'); continue; }
      await mkdir(resolve(mine, entry));
      for (const workspace of readdirSync(resolve(live, entry))) symlinkSync(resolve(root, 'packages', workspace), resolve(mine, entry, workspace), 'junction');
    }
  }
  return { root, overlay: laid, commit };
}

/** Problems with a sealed pack, ignoring only the sealed build's own top-level code chunks. */
export function packProblems(dir: string): string[] { return verifyStaged(dir).problems.filter(problem => !CODE_CHUNK.test(problem)); }

export async function buildScene(o: { scene: SceneId; mode: SceneBuildMode; label: string; pack?: string; quiet?: boolean; source?: string; provenance?: unknown }) {
  if (!(o.scene in SCENES)) throw new Error(`Unknown scene ${o.scene}; expected ${Object.keys(SCENES).join(', ')}`);
  if (!['public', 'test', 'dev'].includes(o.mode)) throw new Error(`Unknown build mode ${o.mode}`);
  if (!/^[a-z0-9-]+$/.test(o.label)) throw new Error('A build label uses lowercase letters, numbers and hyphens');
  const pack = resolve(ROOT, o.pack ?? `.cache/site-inputs/${o.scene}/standalone/assets`), problems = packProblems(pack);
  if (problems.length) throw new Error(`Pack ${pack} fails verification:\n${problems.join('\n')}`);
  const output = sceneOutput(o.scene, o.label, o.mode);
  await rm(output, { recursive: true, force: true });
  await build({ ...sceneStandaloneConfig({ root: resolve(o.source ?? ROOT, SCENES[o.scene]), outDir: output, mode: o.mode }), configFile: false, logLevel: o.quiet ? 'warn' : 'info' });
  const chunks = [];
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(output, 'assets', name));
    chunks.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  let files = 0;
  for (const entry of await readdir(pack, { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:js|css)$/.test(entry.name)) continue;
    await cp(resolve(pack, entry.name), resolve(output, 'assets', entry.name), { recursive: true }); files++;
  }
  await writeFile(resolve(output, 'serve.mjs'), await readFile(resolve(ROOT, 'scripts/static-server.mjs'), 'utf8'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8')) as { modules: string[] };
  const licenses = auditLicenses(ROOT, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const manifest = await readFile(resolve(pack, 'pack.json'));
  const record = { scene: o.scene, mode: o.mode, label: o.label, output: relative(ROOT, output).split(sep).join('/'), pack: relative(ROOT, pack).split(sep).join('/'),
    release: (JSON.parse(new TextDecoder().decode(manifest)) as { release: string }).release, packSha256: createHash('sha256').update(manifest).digest('hex'), packEntries: files,
    chunks, codeBytes: chunks.reduce((n, c) => n + c.bytes, 0), codeGzipBytes: chunks.reduce((n, c) => n + c.gzipBytes, 0), licenses: licenses.records.length, source: o.provenance ?? 'working tree' };
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'build.json'), JSON.stringify(record, null, 2) + '\n');
  return record;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => { const at = args.indexOf(name); if (at < 0) return undefined; const value = args[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
  const scenes = (option('--scene') ?? '').split(',').filter(Boolean) as SceneId[], label = option('--label');
  if (!scenes.length || !label) throw new Error('Usage: bun scripts/build-scene.ts --scene farm|foundry-floor|golden-gate[,…] --mode test|public|dev --label <l> [--pack <dir>]');
  if (scenes.length > 1 && option('--pack')) throw new Error('--pack applies to one scene');
  const base = option('--base'), snapshot = base ? await snapshotPackages(base, (option('--overlay') ?? '').split(',').filter(Boolean), label) : null;
  for (const scene of scenes) {
    const record = await buildScene({ scene, mode: (option('--mode') ?? 'test') as SceneBuildMode, label, pack: option('--pack'), quiet: true,
      ...(snapshot ? { source: snapshot.root, provenance: { base, commit: snapshot.commit, overlay: snapshot.overlay } } : {}) });
    console.log(JSON.stringify({ scene: record.scene, mode: record.mode, output: record.output, release: record.release, codeBytes: record.codeBytes, codeGzipBytes: record.codeGzipBytes }));
  }
}
