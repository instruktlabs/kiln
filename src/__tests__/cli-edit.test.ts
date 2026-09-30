import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { FileProgramStore } from '../program-store-node';
import { retainProgram } from '../program-store';

async function fixture(run: (directory: string, store: FileProgramStore) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-cli-edit-'));
  try {
    await run(directory, new FileProgramStore(join(directory, 'programs')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function cli(directory: string, args: string[]) {
  return Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../cli.ts'), ...args], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      KILN_RENDER: 'cpu',
      KILN_WORKSPACE: directory,
      KILN_PROGRAM_STORE: join(directory, 'programs'),
    },
  });
}
const original =
  "const meta = { name: 'Arm' };\nfunction build() { throw new Error('Do not evaluate while editing'); }\n";

test('CLI edits immutable references through the shared tool without evaluating source', async () => {
  await fixture(async (directory, store) => {
    const ref = await retainProgram(store, original);
    const edits = [
      { oldString: "'Arm'", newString: "'Wrist'" },
      { oldString: "'Wrist'", newString: "'SuctionHead'" },
    ];
    await writeFile(join(directory, 'edits.json'), JSON.stringify(edits));
    const result = cli(directory, ['edit', ref, '--edits', 'edits.json']);
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    const shared = createKilnProgramToolRegistry({ programStore: store }).find(
      (tool) => tool.name === 'kiln_edit',
    )!;
    expect(output).toEqual(await shared.run({ programRef: ref, edits, render: false }));
    expect(output.ok).toBe(true);
    expect(output.programRef).not.toBe(ref);
    expect(output.applied).toEqual([{ occurrences: 1 }, { occurrences: 1 }]);
    expect(output.render).toBeUndefined();
    expect(await store.get(ref)).toBe(original);
    expect(await store.get(output.programRef)).toBe(original.replace("'Arm'", "'SuctionHead'"));
    const exported = cli(directory, ['source', output.programRef, '--out', 'edited.js']);
    expect(exported.exitCode).toBe(0);
    expect(await readFile(join(directory, 'edited.js'), 'utf8')).toBe(
      await store.get(output.programRef),
    );
  });
});

test('CLI edit accepts --json, the flag every other machine-readable command takes', async () => {
  await fixture(async (directory, store) => {
    const ref = await retainProgram(store, original);
    const edits = [{ oldString: "'Arm'", newString: "'Wrist'" }];
    await writeFile(join(directory, 'edits.json'), JSON.stringify(edits));
    // Edit output is always JSON; --json is accepted in any position and changes nothing.
    for (const args of [
      [ref, '--edits', 'edits.json', '--json'],
      [ref, '--json', '--edits', 'edits.json'],
    ]) {
      const result = cli(directory, ['edit', ...args]);
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout.toString());
      expect(output.ok).toBe(true);
      expect(await store.get(output.programRef)).toBe(original.replace("'Arm'", "'Wrist'"));
    }
    const failed = cli(directory, ['edit', 'p_123456789abc', '--edits', 'edits.json', '--json']);
    expect(failed.exitCode).toBe(1);
    expect(JSON.parse(failed.stdout.toString()).ok).toBe(false);
    expect(
      cli(directory, ['edit', ref, '--edits', 'edits.json', '--json', '--json']).exitCode,
    ).toBe(2);
  });
});

test('CLI edit failure is atomic and reports ambiguity, failed batch position and missing revisions', async () => {
  await fixture(async (directory, store) => {
    const ref = await retainProgram(store, "const name = 'Arm'; const other = 'Arm';");
    const before = (await readdir(store.directory)).sort();
    for (const edits of [
      [{ oldString: "'Arm'", newString: "'Wrist'" }],
      [
        { oldString: "'Arm'", newString: "'Wrist'", replaceAll: true },
        { oldString: 'absent anchor', newString: 'replacement' },
      ],
    ]) {
      await writeFile(join(directory, 'edits.json'), JSON.stringify(edits));
      const result = cli(directory, ['edit', ref, '--edits', 'edits.json']);
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout.toString());
      expect(output.ok).toBe(false);
      expect(output.failedEdit).toBe(edits.length);
      expect(output.programRef).toBe(ref);
      expect((await readdir(store.directory)).sort()).toEqual(before);
    }
    const missing = cli(directory, ['edit', 'p_123456789abc', '--edits', 'edits.json']);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout.toString()).error).toContain('Program not found');
  });
});

test('CLI edit input is bounded, uses the registry edit limit and rejects unrelated options', async () => {
  await fixture(async (directory, store) => {
    const ref = await retainProgram(store, original);
    expect(cli(directory, ['edit', '--help']).exitCode).toBe(0);
    for (const args of [
      [],
      [ref],
      [ref, '--edits'],
      [ref, '--render', 'cpu'],
      ['asset.js', '--edits', 'edits.json'],
    ])
      expect(cli(directory, ['edit', ...args]).exitCode).toBe(2);
    for (const content of [
      new Uint8Array([0xff]),
      ' '.repeat(1024 * 1024 + 1),
      '{bad json',
      JSON.stringify([]),
      JSON.stringify(Array.from({ length: 21 }, () => ({ oldString: 'Arm', newString: 'Wrist' }))),
      JSON.stringify([{ oldString: 'Arm' }]),
    ]) {
      await writeFile(join(directory, 'edits.json'), content);
      const result = cli(directory, ['edit', ref, '--edits', 'edits.json']);
      expect(result.exitCode).not.toBe(0);
      expect(JSON.parse(result.stdout.toString()).ok).toBe(false);
    }
    expect(cli(directory, ['edit', ref, '--edits', '.']).exitCode).toBe(1);
    expect(await store.get(ref)).toBe(original);
  });
}, 20000);
