import { afterEach, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { renameDirectoryAtomically } from './atomic-directory';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Invalid test root');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-atomic-revision-'));
  roots.push(root);
  const stage = join(root, '.write-revision');
  const destination = join(root, 'r_revision');
  await mkdir(stage);
  await writeFile(join(stage, 'source.kiln.js'), 'complete revision');
  return { stage, destination };
}

test('transient Windows rename denial preserves the staged revision until atomic publication', async () => {
  const { stage, destination } = await fixture();
  const denied = Object.assign(new Error('sharing violation'), { code: 'EPERM' });
  const delays: number[] = [];
  let attempts = 0;
  await renameDirectoryAtomically(stage, destination, {
    platform: 'win32',
    renameOperation: async (from, to) => {
      expect(await readFile(join(stage, 'source.kiln.js'), 'utf8')).toBe('complete revision');
      if (++attempts < 3) throw denied;
      await rename(from, to);
    },
    pause: async (milliseconds) => {
      delays.push(milliseconds);
      expect(await lstat(destination).catch(() => undefined)).toBeUndefined();
    },
  });
  expect(attempts).toBe(3);
  expect(delays).toEqual([20, 50]);
  expect(await lstat(stage).catch(() => undefined)).toBeUndefined();
  expect(await readFile(join(destination, 'source.kiln.js'), 'utf8')).toBe('complete revision');
});

test('persistent denial has a fixed retry budget and leaves cleanup to the caller', async () => {
  const { stage, destination } = await fixture();
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  let attempts = 0;
  let waited = 0;
  await expect(
    renameDirectoryAtomically(stage, destination, {
      platform: 'win32',
      renameOperation: async () => {
        attempts++;
        throw denied;
      },
      pause: async (milliseconds) => {
        waited += milliseconds;
      },
    }),
  ).rejects.toBe(denied);
  expect(attempts).toBe(6);
  expect(waited).toBe(770);
  expect(await readFile(join(stage, 'source.kiln.js'), 'utf8')).toBe('complete revision');
});

test('an existing destination is left intact and returns the original collision immediately', async () => {
  const { stage, destination } = await fixture();
  await mkdir(destination);
  await writeFile(join(destination, 'source.kiln.js'), 'existing revision');
  const collision = Object.assign(new Error('destination exists'), { code: 'EPERM' });
  let attempts = 0;
  await expect(
    renameDirectoryAtomically(stage, destination, {
      platform: 'win32',
      renameOperation: async () => {
        attempts++;
        throw collision;
      },
      pause: async () => {
        throw new Error('A collision must not wait');
      },
    }),
  ).rejects.toBe(collision);
  expect(attempts).toBe(1);
  expect(await readFile(join(destination, 'source.kiln.js'), 'utf8')).toBe('existing revision');
  expect(await readFile(join(stage, 'source.kiln.js'), 'utf8')).toBe('complete revision');
});

test.each([
  ['linux', 'EPERM'],
  ['darwin', 'EACCES'],
  ['win32', 'ENOENT'],
  ['win32', 'EXDEV'],
] as const)('%s %s failures are not retried', async (platform, code) => {
  const { stage, destination } = await fixture();
  const error = Object.assign(new Error('failure'), { code });
  let attempts = 0;
  await expect(
    renameDirectoryAtomically(stage, destination, {
      platform,
      renameOperation: async () => {
        attempts++;
        throw error;
      },
      pause: async () => {
        throw new Error('Not retryable');
      },
    }),
  ).rejects.toBe(error);
  expect(attempts).toBe(1);
});
