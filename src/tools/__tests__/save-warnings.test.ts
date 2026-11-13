/**
 * The kiln_save result returns each build warning whole when it fits, and says so when it cuts
 * one: at a word, with the length of what was left out. The manifest keeps every full line.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../../assets-node';
import { MemoryProgramStore } from '../../program-store';
import { SAVE_WARNING_LIMIT, cutWarning } from '../asset-text';
import { createKilnProgramToolRegistry } from '../registry';

// The plaque is sunk by its own depth, so its front face lies in the board's front face.
const FLUSH = `const meta = { name: 'Sign' };
function build() {
  const root = createRoot('Sign');
  createPart('Board', boxGeo(1, 0.6, 0.04), gameMaterial(0x6b4a2b), { parent: root, position: [0, 0.3, 0] });
  createPart('Plaque', planeGeo(0.4, 0.2), gameMaterial(0xd8c690), { parent: root, position: [0, 0.3, 0.02] });
  return root;
}`;

describe('cutWarning', () => {
  test('returns a line within the limit unchanged', () => {
    expect(cutWarning('short line', 20)).toBe('short line');
    expect(cutWarning('x'.repeat(20), 20)).toBe('x'.repeat(20));
  });

  test('cuts an over-long line at a whole word and states what was left out', () => {
    const line = 'alpha beta gamma delta epsilon';
    const cut = cutWarning(line, 14);
    expect(cut).toBe('alpha beta … (20 more characters; the saved manifest has the full line)');
  });

  test('never cuts inside a word, even one longer than the limit', () => {
    expect(cutWarning('supercalifragilistic and more', 8)).toBe(
      '… (29 more characters; the saved manifest has the full line)',
    );
    // A cut that lands exactly at a word's end keeps that word.
    expect(cutWarning('alpha beta gamma', 10)).toBe(
      'alpha beta … (6 more characters; the saved manifest has the full line)',
    );
  });
});

describe('kiln_save warnings', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kiln-save-warnings-'));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  test('a flush-face warning longer than 200 characters is returned whole, with its remedy', async () => {
    const programStore = new MemoryProgramStore();
    const save = createKilnProgramToolRegistry({
      assetLibrary: new FileAssetLibrary({ project: root }),
      programStore,
    }).find((def) => def.name === 'kiln_save')!;
    const result = (await save.run({
      programRef: await programStore.put(FLUSH),
      name: 'Sign',
      collection: 'project',
    })) as { asset: { build: { warningCount: number; warnings: string[] } } };
    const warnings = result.asset.build.warnings.filter((w) => w.startsWith('FLUSH_FACES'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.length).toBeGreaterThan(200);
    expect(warnings[0]!.length).toBeLessThanOrEqual(SAVE_WARNING_LIMIT);
    expect(warnings[0]).toContain('Move the smaller face at least 2 mm along that normal');
    expect(warnings[0]).not.toContain('more characters');
  }, 60_000);
});
