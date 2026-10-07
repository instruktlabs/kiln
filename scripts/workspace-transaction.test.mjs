import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyProjectEdits,
  readProjectFile,
  recoverProjectEdits,
} from './workspace-transaction.mjs';

const moduleUrl = pathToFileURL(resolve(import.meta.dir, 'workspace-transaction.mjs')).href;
async function cleanupFixture(temp) {
  const actual = await realpath(temp);
  const parent = await realpath(tmpdir());
  if (
    !actual.startsWith(parent + sep) ||
    !actual.slice(parent.length + 1).startsWith('kiln-project-update-')
  )
    throw new Error('Refusing fixture cleanup outside its temporary root.');
  await rm(actual, { recursive: true, force: true });
}
async function fixture(fn) {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'kiln-project-update-')));
  const root = join(temp, 'project');
  const stateDirectory = join(temp, 'private-state');
  await mkdir(root);
  try {
    await fn({ temp, root, stateDirectory });
  } finally {
    await cleanupFixture(temp);
  }
}
const put = async (root, name, text) => {
  await mkdir(dirname(join(root, name)), { recursive: true });
  await writeFile(join(root, name), text);
};

test('updates only planned files and commits the manifest after complete configuration files', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'AGENTS.md', 'Owner instructions');
    await put(root, '.mcp.json', 'old config');
    const events = [];
    const edits = [
      { path: '.kiln/workspace.json', before: undefined, after: 'manifest' },
      { path: '.mcp.json', before: 'old config', after: 'new config' },
      { path: 'skills/kiln-author-asset/SKILL.md', before: undefined, after: '# skill' },
    ];
    const result = await applyProjectEdits(root, edits, {
      stateDirectory,
      onStep: (event) => events.push(event),
    });
    expect(result.status).toBe('applied');
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('Owner instructions');
    expect(await readFile(join(root, '.mcp.json'), 'utf8')).toBe('new config');
    expect(await readFile(join(root, '.kiln/workspace.json'), 'utf8')).toBe('manifest');
    expect(events.filter((e) => e.phase === 'written').at(-1).path).toBe('.kiln/workspace.json');
    expect(JSON.stringify(events)).not.toContain('old config');
    expect(await readdir(stateDirectory)).toEqual([]);
  }));

test('a check makes no directories or writes, and a stale plan fails before mutation', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'existing.txt', 'owner edit');
    const edits = [{ path: 'new.txt', after: 'new' }];
    expect((await applyProjectEdits(root, edits, { stateDirectory, check: true })).status).toBe(
      'planned',
    );
    expect(await readdir(root)).toEqual(['existing.txt']);
    await expect(readdir(stateDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      applyProjectEdits(
        root,
        [...edits, { path: 'existing.txt', before: 'stale', after: 'replacement' }],
        { stateDirectory },
      ),
    ).rejects.toThrow(/changed.*existing.txt/i);
    expect(await readdir(root)).toEqual(['existing.txt']);
  }));

test('a caught partial failure restores previous bytes and removes only its newly created files', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'existing.txt', 'original');
    const edits = [
      { path: 'existing.txt', before: 'original', after: 'updated' },
      { path: 'nested/new.txt', after: 'created' },
    ];
    await expect(
      applyProjectEdits(root, edits, {
        stateDirectory,
        onStep: (event) => {
          if (event.phase === 'written' && event.path === 'nested/new.txt')
            throw new Error('Injected failure');
        },
      }),
    ).rejects.toThrow(/restored/i);
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('original');
    expect(await readdir(root)).toEqual(['existing.txt']);
    expect(await readdir(stateDirectory)).toEqual([]);
  }));

test('rollback retains a conflicting user edit and private recovery data until explicitly resolved', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'existing.txt', 'original');
    await expect(
      applyProjectEdits(root, [{ path: 'existing.txt', before: 'original', after: 'updated' }], {
        stateDirectory,
        onStep: async (event) => {
          if (event.phase === 'written') {
            await put(root, 'existing.txt', 'new owner edit');
            throw new Error('Injected');
          }
        },
      }),
    ).rejects.toThrow(/recovery required/i);
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('new owner edit');
    await expect(recoverProjectEdits(root, { stateDirectory })).rejects.toThrow(
      /conflict.*existing.txt/i,
    );
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('new owner edit');
    await put(root, 'existing.txt', 'updated');
    expect((await recoverProjectEdits(root, { stateDirectory })).status).toBe('recovered');
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('original');
    expect(await readdir(stateDirectory)).toEqual([]);
  }));

test('rejects traversal, aliases, protected paths and project-local backup storage before mutation', () =>
  fixture(async ({ root, stateDirectory }) => {
    for (const path of [
      '../escape',
      '/absolute',
      'C:/escape',
      'a\\b',
      '.git/config',
      'file:stream',
      'nested/../escape',
      'NUL',
      'file.',
    ])
      await expect(
        applyProjectEdits(root, [{ path, after: 'x' }], { stateDirectory }),
      ).rejects.toThrow(/unsafe.*path/i);
    await expect(
      applyProjectEdits(
        root,
        [
          { path: 'A', after: 'a' },
          { path: 'a', after: 'b' },
        ],
        { stateDirectory },
      ),
    ).rejects.toThrow(/duplicate/i);
    await expect(
      applyProjectEdits(root, [{ path: 'a', after: 'a' }], {
        stateDirectory: join(root, '.state'),
      }),
    ).rejects.toThrow(/outside/i);
    expect(await readdir(root)).toEqual([]);
  }));

test('never follows a directory junction or symbolic link to read or mutate an outside file', () =>
  fixture(async ({ temp, root, stateDirectory }) => {
    const outside = join(temp, 'outside');
    await mkdir(outside);
    await put(outside, 'config.json', 'outside');
    await symlink(outside, join(root, '.codex'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readProjectFile(root, '.codex/config.json')).rejects.toThrow(/symbolic link/i);
    await expect(
      applyProjectEdits(root, [{ path: '.codex/config.json', before: 'outside', after: 'wrong' }], {
        stateDirectory,
      }),
    ).rejects.toThrow(/symbolic link/i);
    expect(await readFile(join(outside, 'config.json'), 'utf8')).toBe('outside');
  }));

test('serializes setup and refuses recovery while an update is still active', () =>
  fixture(async ({ root, stateDirectory }) => {
    await applyProjectEdits(root, [{ path: 'one.txt', after: 'one' }], {
      stateDirectory,
      onStep: async (event) => {
        if (event.phase !== 'prepared') return;
        await expect(
          applyProjectEdits(root, [{ path: 'two.txt', after: 'two' }], { stateDirectory }),
        ).rejects.toThrow(/locked/i);
        await expect(recoverProjectEdits(root, { stateDirectory })).rejects.toThrow(/active/i);
      },
    });
    expect(await readdir(root)).toEqual(['one.txt']);
  }));

test('recovers after the setup process exits mid-update without putting backups in the project', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, '.mcp.json', 'original secret-fixture');
    const script = `import {applyProjectEdits} from ${JSON.stringify(moduleUrl)}; await applyProjectEdits(process.argv[1],[{path:'.mcp.json',before:'original secret-fixture',after:'updated'},{path:'.kiln/workspace.json',after:'manifest'}],{stateDirectory:process.argv[2],onStep:event=>{if(event.phase==='written')process.exit(37)}});`;
    const child = spawnSync('node', ['--input-type=module', '-e', script, root, stateDirectory], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    });
    expect(child.status).toBe(37);
    expect(child.stdout + child.stderr).not.toContain('secret-fixture');
    expect(await readdir(root)).toEqual(['.mcp.json']);
    expect(await readFile(join(root, '.mcp.json'), 'utf8')).toBe('updated');
    expect((await recoverProjectEdits(root, { stateDirectory })).status).toBe('recovered');
    expect(await readFile(join(root, '.mcp.json'), 'utf8')).toBe('original secret-fixture');
    expect(await readdir(stateDirectory)).toEqual([]);
  }));

test('deletion is reversible and never recursively removes a target directory', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'retired.txt', 'old');
    await applyProjectEdits(root, [{ path: 'retired.txt', before: 'old', after: undefined }], {
      stateDirectory,
    });
    expect(await readdir(root)).toEqual([]);
    await mkdir(join(root, 'directory'));
    await expect(
      applyProjectEdits(root, [{ path: 'directory', after: 'wrong' }], { stateDirectory }),
    ).rejects.toThrow(/regular file/i);
  }));

test('rejects file and directory overlaps before creating recovery storage or writing', () =>
  fixture(async ({ root, stateDirectory }) => {
    await expect(
      applyProjectEdits(
        root,
        [
          { path: 'nested', after: 'file' },
          { path: 'nested/new.txt', after: 'child' },
        ],
        { stateDirectory },
      ),
    ).rejects.toThrow(/overlap/i);
    expect(await readdir(root)).toEqual([]);
    await expect(readdir(stateDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  }));

test('a directory replaced by a junction during setup cannot redirect writes', () =>
  fixture(async ({ temp, root, stateDirectory }) => {
    const outside = join(temp, 'outside');
    await mkdir(outside);
    await put(outside, 'target.txt', 'outside');
    await expect(
      applyProjectEdits(root, [{ path: 'target.txt', after: 'wrong' }], {
        stateDirectory,
        onStep: async (event) => {
          if (event.phase !== 'prepared') return;
          await rename(root, join(temp, 'original-project'));
          await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
        },
      }),
    ).rejects.toThrow(/recovery required/i);
    expect(await readFile(join(outside, 'target.txt'), 'utf8')).toBe('outside');
    await expect(readProjectFile(root, 'target.txt')).rejects.toThrow(/symbolic link/i);
  }));

test('tampered backups prevent every recovery write and disclose no configuration values', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'one.txt', 'first original');
    await put(root, 'two.txt', 'second original');
    await expect(
      applyProjectEdits(
        root,
        [
          { path: 'one.txt', before: 'first original', after: 'first update' },
          { path: 'two.txt', before: 'second original', after: 'second update' },
        ],
        {
          stateDirectory,
          onStep: async (event) => {
            if (event.phase !== 'written' || event.path !== 'two.txt') return;
            await put(root, 'two.txt', 'conflicting owner edit');
            throw new Error('Stop');
          },
        },
      ),
    ).rejects.toThrow(/recovery required/i);
    await put(root, 'two.txt', 'second update');
    const transaction = join(stateDirectory, (await readdir(stateDirectory))[0]);
    await writeFile(join(transaction, '1.before'), 'SYNTHETIC-SECRET-NOT-FOR-LOGS');
    await expect(recoverProjectEdits(root, { stateDirectory })).rejects.toThrow(
      'Recovery data failed integrity verification.',
    );
    expect(await readFile(join(root, 'one.txt'), 'utf8')).toBe('first update');
    expect(await readFile(join(root, 'two.txt'), 'utf8')).toBe('second update');
  }));

test('an unmodified second file edited after planning is preserved while earlier setup writes roll back', () =>
  fixture(async ({ root, stateDirectory }) => {
    await put(root, 'one.txt', 'first original');
    await put(root, 'two.txt', 'second original');
    await expect(
      applyProjectEdits(
        root,
        [
          { path: 'one.txt', before: 'first original', after: 'first update' },
          { path: 'two.txt', before: 'second original', after: 'second update' },
        ],
        {
          stateDirectory,
          onStep: async (event) => {
            if (event.phase === 'written') await put(root, 'two.txt', 'owner edit');
          },
        },
      ),
    ).rejects.toThrow(/restored/i);
    expect(await readFile(join(root, 'one.txt'), 'utf8')).toBe('first original');
    expect(await readFile(join(root, 'two.txt'), 'utf8')).toBe('owner edit');
    expect(await readdir(stateDirectory)).toEqual([]);
  }));
