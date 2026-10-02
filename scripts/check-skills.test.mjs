/**
 * `check:skills` enforces contract rule 12 (lean standing knowledge): a SKILL.md is
 * at most 16,000 characters and 500 lines, and every file under `skills/` has one
 * source. The checks run over a scratch copy of the tree so the breakages can be
 * made without touching the maintained skills.
 */
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '..');
const script = join(repo, 'scripts', 'check-skills.mjs');

async function scratchTree() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-check-skills-'));
  for (const folder of ['skills', '.claude/skills', '.agents/skills'])
    await cp(join(repo, folder), join(root, folder), { recursive: true });
  return root;
}

const run = (root) => spawnSync('node', [script, root], { encoding: 'utf8' });

test('the maintained tree passes, and the copy of it passes too', async () => {
  const root = await scratchTree();
  try {
    const result = run(root);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('conform to the Agent Skills specification');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a SKILL.md over 16,000 characters fails with the rule', async () => {
  const root = await scratchTree();
  try {
    const skill = join(root, 'skills', 'kiln-compose-scene', 'SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, `${text}\n${'Padding sentence that says nothing new. '.repeat(400)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('skills/kiln-compose-scene: SKILL.md is');
    expect(result.stderr).toContain('characters, over the 16,000');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a skill that tells the model to pass full detail as a matter of course fails', async () => {
  // The OpenCode wave sessions of 1 October 2026 asked `detail: "full"` on every review
  // call in both arms because the skills said to pass it "for every finding" (H28).
  const root = await scratchTree();
  try {
    const skill = join(root, 'skills', 'kiln-qa-asset', 'SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, `${text}\nPass \`detail: "full"\` to every render for every finding.\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('skills/kiln-qa-asset/SKILL.md');
    expect(result.stderr).toContain('names full detail without "only"');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a reference file duplicated into another skill fails: one source per file', async () => {
  const root = await scratchTree();
  try {
    await cp(
      join(root, 'skills', 'kiln-author-asset', 'references', 'camera-cli.md'),
      join(root, 'skills', 'kiln-qa-asset', 'references', 'camera-cli.md'),
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has the same bytes as');
    expect(result.stderr).toContain('camera-cli.md');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
