import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harnessWithVersion } from '../src/lib/attribution';
import { stepPrompts } from './stage-text-to-3d.mjs';

async function runWith(files: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'text-to-3d-prompts-'));
  await mkdir(join(directory, 'run'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(directory, 'run', name), text);
  return directory;
}

test('a step made from one prompt keeps it alone', async () => {
  const directory = await runWith({ '01-make.txt': 'Make a cathedral.\n' });
  expect(await stepPrompts(directory, { prompt: '01-make.txt' })).toEqual({ prompt: 'Make a cathedral.' });
});

test('a step whose author was sent more while it worked keeps each message, in order', async () => {
  const directory = await runWith({ '13-architecture.txt': 'Fix six faults.\n', '13b-budget.txt': 'The limit is now 16 MB.\n' });
  expect(await stepPrompts(directory, { prompt: ['13-architecture.txt', '13b-budget.txt'] })).toEqual({
    prompt: 'Fix six faults.',
    followUps: ['The limit is now 16 MB.'],
  });
});

test('a run made across harness versions names each, oldest first', () => {
  expect(harnessWithVersion('claude', '2.1.319')).toBe('Claude Code 2.1.319');
  expect(harnessWithVersion('claude', ['2.1.319', '2.1.300'])).toBe('Claude Code 2.1.319 and 2.1.300');
});
