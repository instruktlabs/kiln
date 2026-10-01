/**
 * The last step of the build: refuse a `dist/` that carries private data, then record what built it.
 *
 * `dist/build-info.json` names the site commit, whether the tree was clean, the `KILN_SITE_PACKS` mode, the commits of
 * the docs and skills sources, the scene pack releases and the time of the build (engineering review, finding 16). It
 * holds no paths. `site-build/ops/preview.ps1` prints it and warns when it is stale.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeFinding, scanFiles } from './private-data.mjs';
import { docsDirectory, skillsDirectory } from './source-dirs.mjs';
import { verifyPack, NOTICES } from './scene-pack.mjs';
import { verifyStagedRuntime } from './scene-runtime.mjs';
import { snapshotSource } from './source-snapshot.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const entries = async (directory) => readdir(directory, { withFileTypes: true }).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
});

/** The short commit of the git work tree that holds `directory`, whether that tree is clean, and whether it is the site's own. */
export function sourceCommit(directory, git = (args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
  const snapshot = snapshotSource(directory);
  if (snapshot) return snapshot;
  let commit;
  try { commit = git(['rev-parse', '--short', 'HEAD']); } catch {
    return { commit: null, top: null, clean: null };
  }
  // An exported tree may have no Git identity. A known checkout with an unreadable
  // diff is different: fail instead of silently losing its recorded source identity.
  return {
    commit,
    top: git(['rev-parse', '--show-toplevel']),
    clean: git(['status', '--porcelain']) === '',
    diffSha256: hash(git(['diff', '--binary', 'HEAD'])),
  };
}

/** The record, from the environment and the source trees. No field may hold a path. */
export async function buildInfo({ env = process.env, site = SITE, dist = join(site, 'dist'), now = new Date(), commitOf = sourceCommit } = {}) {
  const own = commitOf(site);
  const docs = commitOf(docsDirectory(env, site));
  const skills = commitOf(skillsDirectory(env, site));
  // A catalog entry is intent. Only a verified pack and runtime actually present in this output are evidence.
  const scenes = {};
  for (const scene of await entries(join(dist, 'scene-packs'))) {
    if (!scene.isDirectory()) continue;
    const releases = (await entries(join(dist, 'scene-packs', scene.name))).filter((entry) => entry.isDirectory());
    if (releases.length !== 1) throw new Error(`Expected one staged ${scene.name} release, found ${releases.length}`);
    const folder = join(dist, 'scene-packs', scene.name, releases[0].name);
    const pack = await verifyPack(folder, join(folder, NOTICES));
    if (pack.id !== scene.name || pack.release !== releases[0].name) throw new Error(`Staged ${scene.name} pack identity differs from its path`);
    const runtime = await verifyStagedRuntime(join(dist, 'scene-runtime', scene.name));
    scenes[scene.name] = {
      release: pack.release,
      packSha256: pack.packJsonSha256,
      sealsSha256: pack.sha256sumsSha256,
      noticesSha256: pack.noticesSha256,
      files: pack.totalFiles,
      bytes: pack.totalBytes,
      runtime: { file: runtime.file, sha256: runtime.sha256, bytes: runtime.bytes, ...(runtime.initialLoad ? { initialLoad: runtime.initialLoad } : {}), ...(runtime.chunks ? { chunks: runtime.chunks } : {}) },
    };
  }
  for (const scene of await entries(join(dist, 'scene-runtime'))) {
    if (scene.isDirectory() && !scenes[scene.name]) throw new Error(`Staged ${scene.name} runtime has no sealed pack`);
  }
  const packs = env.KILN_SITE_PACKS ?? '1';
  return {
    commit: own.commit,
    treeClean: own.clean,
    ...(own.diffSha256 ? { sourceDiffSha256: own.diffSha256 } : {}),
    kilnSitePacks: packs,
    commonsPacks: !['0', 'false'].includes(packs),
    docs: { commit: docs.commit, sameTreeAsSite: Boolean(docs.top && docs.top === own.top), clean: docs.clean, ...(docs.filesSha256 ? { filesSha256: docs.filesSha256, snapshotSha256: docs.snapshotSha256 } : {}) },
    skills: { commit: skills.commit, sameTreeAsSite: Boolean(skills.top && skills.top === own.top), clean: skills.clean, ...(skills.filesSha256 ? { filesSha256: skills.filesSha256, snapshotSha256: skills.snapshotSha256 } : {}) },
    scenePacks: Object.fromEntries(Object.entries(scenes).map(([id, scene]) => [id, scene.release])),
    scenes,
    builtAt: now.toISOString(),
  };
}

/** The complete output, excluding its two mutually dependent receipts; paths are output-relative. */
export async function artifactFiles(dist) {
  const files = [];
  async function walk(directory) {
    for (const entry of await entries(directory)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const name = relative(dist, path).replaceAll('\\', '/');
        if (['build-info.json', 'artifact-files.json'].includes(name)) continue;
        const bytes = await readFile(path);
        files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
      } else throw new Error(`Unsupported build entry: ${entry.name}`);
    }
  }
  await walk(dist);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

/** Explicit build inputs, including untracked files; cache and machine-local environment never enter the receipt. */
export async function siteSourceFiles(site = SITE) {
  const files = [];
  async function walk(directory) {
    for (const entry of await entries(directory)) {
      const path = join(directory, entry.name);
      if (entry.name.startsWith('.env')) throw new Error('Environment files are not public site inputs');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        files.push({ path: relative(site, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) });
      } else throw new Error(`Unsupported source entry: ${entry.name}`);
    }
  }
  for (const directory of ['src', 'scripts', 'public']) await walk(join(site, directory));
  for (const entry of await entries(site)) if (entry.isFile() && /^(?:package\.json|bun\.lock|astro\.config\.[a-z]+|tsconfig\.json)$/.test(entry.name)) {
    const bytes = await readFile(join(site, entry.name));
    files.push({ path: entry.name, bytes: bytes.length, sha256: hash(bytes) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

/** Scan `dist`, fail on any private value, then write `build-info.json`. */
export async function finishBuild({ dist = join(SITE, 'dist'), names, ...options } = {}) {
  const scan = await scanFiles(dist, { names });
  if (scan.findings.length) {
    throw new Error(`Private data in the build (${scan.findings.length}):\n${scan.findings.slice(0, 20).map(describeFinding).join('\n')}`);
  }
  const info = await buildInfo({ ...options, dist });
  const sources = await siteSourceFiles(options.site ?? SITE);
  const sourceManifest = `${JSON.stringify(sources, null, 2)}\n`;
  info.siteInputs = { manifest: 'source-files.json', files: sources.length, bytes: sources.reduce((sum, file) => sum + file.bytes, 0), sha256: hash(sourceManifest), scope: 'site src, scripts, public and build configuration; engine docs/skills recorded separately' };
  await writeFile(join(dist, 'source-files.json'), sourceManifest);
  const files = await artifactFiles(dist);
  const manifest = `${JSON.stringify(files, null, 2)}\n`;
  info.artifacts = { manifest: 'artifact-files.json', files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), sha256: hash(manifest) };
  await writeFile(join(dist, 'artifact-files.json'), manifest);
  await writeFile(join(dist, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
  return { scan, info };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--dist');
  const { scan, info } = await finishBuild(index >= 0 ? { dist: resolve(process.argv[index + 1]) } : {});
  console.log(`Private-data scan: ${scan.scanned} of ${scan.files} files read (${scan.parts} parts: text, GLB JSON chunks and archive entries), 0 findings.`);
  console.log(`build-info.json: ${JSON.stringify(info)}`);
}
