import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check-merge-markers.mjs', import.meta.url));
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function check(files, untracked = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-merge-markers-'));
  roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  for (const [path, text] of Object.entries({ ...files, ...untracked })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  spawnSync('git', ['add', '--', ...Object.keys(files)], { cwd: root });
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
}

for (const marker of ['<<<<<<< ours', '||||||| base', '>>>>>>> theirs']) {
  test(`fails on ${marker} and names the file and line`, async () => {
    const result = await check({ 'CHANGELOG.md': `# Notes\n${marker}\n` });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`CHANGELOG.md:2:${marker}`);
  });
}

test('passes when a marker is not at the start of a line, or is only a separator', async () => {
  const result = await check({
    'a.md':
      'Conflicts look like `<<<<<<< ours`.\n    >>>>>>> indented\n=======\nHeading\n=======\n',
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

test('leaves untracked files alone', async () => {
  const result = await check(
    { 'a.md': 'clean\n' },
    { 'scratch.md': '>>>>>>> local\n' },
  );
  expect(result.status).toBe(0);
});
