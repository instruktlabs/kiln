/** Explicit, optional restoration of the historical gallery into an ignored cache. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLE_ARCHIVE_REVISION = 'fda71ac775750f25390b6ee30082ebc56463edc6';
export const EXAMPLE_ARCHIVE_ROOT = join(
  REPO,
  '.cache',
  'example-archive',
  EXAMPLE_ARCHIVE_REVISION,
);
const PATHS = [
  'examples',
  'site/examples',
  'docs/examples.md',
  'scripts/hero-shots.ts',
  'scripts/anim-gifs.ts',
];
const run = (cwd, command, args, extra = {}) =>
  execFileSync(command, args, {
    cwd,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    ...extra,
  });

function inside(root, name) {
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error(`Unsafe archive path: ${name}`);
  return target;
}

export function exampleArchivePath(name = 'examples') {
  const target = inside(EXAMPLE_ARCHIVE_ROOT, name);
  if (!existsSync(target))
    throw Error(
      'Historical examples are archived. Run node scripts/example-archive.mjs --fetch before archive-gallery or corpus checks.',
    );
  return target;
}

export async function prepareExampleArchive({
  repo = REPO,
  revision = EXAMPLE_ARCHIVE_REVISION,
  cache = join(REPO, '.cache', 'example-archive'),
  fetch = false,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Archive revision must be an exact commit');
  // Partial clones may need pinned tree/blob objects. Only the explicit --fetch
  // preparation step allows Git's lazy object fetch; tests remain offline.
  const git = (...args) =>
    run(repo, 'git', args, {
      env: { ...process.env, GIT_NO_LAZY_FETCH: fetch ? '0' : '1' },
    });
  try {
    git('cat-file', '-e', `${revision}^{commit}`);
  } catch {
    if (!fetch)
      throw Error(
        'Historical commit is unavailable. Run node scripts/example-archive.mjs --fetch to restore the pinned public archive.',
      );
    git('fetch', '--no-tags', '--depth=1', 'https://github.com/instruktlabs/kiln.git', revision);
  }
  const entries = git('ls-tree', '-r', '-z', revision, '--', ...PATHS)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(row);
      if (!match || !['100644', '100755'].includes(match[1]))
        throw Error('Archive accepts regular files only');
      return { mode: match[1], oid: match[2], path: match[3] };
    });
  if (!entries.length) throw Error('Historical archive is empty');
  const destination = inside(resolve(cache), revision);
  const verify = async (directory) => {
    for (const entry of entries) {
      const file = inside(directory, entry.path);
      if (!(await lstat(file)).isFile())
        throw Error(`Archive accepts regular files only: ${entry.path}`);
      const bytes = await readFile(file);
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (hash !== entry.oid)
        throw Error(
          `Archive bytes differ: ${entry.path}; preserve local changes before restoring a fresh cache.`,
        );
    }
  };
  if (existsSync(destination)) {
    await verify(destination);
    return destination;
  }
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(join(resolve(cache), '.restoring-'));
  try {
    // The pinned Git tree was checked for links and unsafe paths before tar runs.
    for (const entry of entries) inside(temporary, entry.path);
    const tarball = join(temporary, 'archive.tar');
    git('archive', '--format=tar', `--output=${tarball}`, revision, '--', ...PATHS);
    run(repo, 'tar', ['-xf', tarball, '-C', temporary]);
    await verify(temporary);
    await rm(tarball);
    await rename(temporary, destination);
    return destination;
  } finally {
    // Resolve and validate the exact temporary target before recursive cleanup.
    inside(resolve(cache), relative(resolve(cache), temporary));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(await prepareExampleArchive({ fetch: process.argv.includes('--fetch') }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
