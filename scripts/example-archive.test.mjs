import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { prepareExampleArchive } from './example-archive.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith((await realpath(tmpdir())) + sep)) throw Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'kiln-example-archive-')));
  roots.push(root);
  const repo = join(root, 'repo');
  await mkdir(repo);
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, windowsHide: true, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Archive test');
  git('config', 'user.email', 'archive@example.invalid');
  git('config', 'core.autocrlf', 'false');
  for (const name of [
    'examples/a.kiln.js',
    'site/examples/history/a.txt',
    'docs/examples.md',
    'scripts/hero-shots.ts',
    'scripts/anim-gifs.ts',
  ]) {
    await mkdir(join(repo, name, '..'), { recursive: true });
    await writeFile(join(repo, name), `original ${name}\n`);
  }
  git('add', '.');
  git('commit', '--quiet', '-m', 'Archive fixture');
  return { root, repo, git, revision: git('rev-parse', 'HEAD'), cache: join(root, 'cache') };
}

test('restores exact historical files outside the checkout without changing current work', async () => {
  const f = await fixture();
  await writeFile(join(f.repo, 'examples/a.kiln.js'), 'current user work\n');
  const before = f.git('status', '--porcelain');
  const directory = await prepareExampleArchive(f);
  expect(await readFile(join(directory, 'examples/a.kiln.js'), 'utf8')).toBe(
    'original examples/a.kiln.js\n',
  );
  expect(await readFile(join(f.repo, 'examples/a.kiln.js'), 'utf8')).toBe('current user work\n');
  expect(f.git('status', '--porcelain')).toBe(before);
  expect(await prepareExampleArchive(f)).toBe(directory);
});

test('detects a changed cache and refuses to replace it', async () => {
  const f = await fixture();
  const directory = await prepareExampleArchive(f);
  await writeFile(join(directory, 'examples/a.kiln.js'), 'local change\n');
  await expect(prepareExampleArchive(f)).rejects.toThrow('Archive bytes differ');
  expect(await readFile(join(directory, 'examples/a.kiln.js'), 'utf8')).toBe('local change\n');
});

test('rejects links in a selected Git tree before extracting anything', async () => {
  const f = await fixture();
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: f.repo,
    input: '../../outside',
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  f.git('update-index', '--add', '--cacheinfo', `120000,${blob},examples/link`);
  f.git('commit', '--quiet', '-m', 'Unsafe link');
  f.revision = f.git('rev-parse', 'HEAD');
  await expect(prepareExampleArchive(f)).rejects.toThrow('Archive accepts regular files only');
});
