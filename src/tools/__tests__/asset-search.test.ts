/**
 * kiln_assets searches treat spaces, hyphens and underscores as the same separator, and need
 * every word of the query to appear, in any order.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../../assets-node';
import { MemoryProgramStore } from '../../program-store';
import { matchesAssetQuery } from '../asset-text';
import { createKilnProgramToolRegistry } from '../registry';

const CODE = `const meta = { name: 'Sign' };
function build() {
  const root = createRoot('Sign');
  createPart('Board', boxGeo(1, 0.6, 0.04), gameMaterial(0x6b4a2b), { parent: root, position: [0, 0.3, 0] });
  return root;
}`;

describe('matchesAssetQuery', () => {
  test('matches every word in any order across separators', () => {
    expect(matchesAssetQuery('trail-sign wood', 'sign trail')).toBe(true);
    expect(matchesAssetQuery('trail-sign', 'Trail_Sign')).toBe(true);
    expect(matchesAssetQuery('trail-sign', 'trail sign post')).toBe(false);
  });
  test('an empty or separator-only query keeps the literal behaviour', () => {
    expect(matchesAssetQuery('trail-sign', '')).toBe(true);
    expect(matchesAssetQuery('trail sign', '-')).toBe(false);
    expect(matchesAssetQuery('trail-sign', '-')).toBe(true);
    expect(matchesAssetQuery('trail sign', ' ')).toBe(true);
  });
});

describe('kiln_assets query', () => {
  let root: string;
  let library: FileAssetLibrary;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kiln-asset-search-'));
    library = new FileAssetLibrary({ project: root });
    const programStore = new MemoryProgramStore();
    const save = createKilnProgramToolRegistry({ assetLibrary: library, programStore }).find(
      (def) => def.name === 'kiln_save',
    )!;
    await save.run({
      programRef: await programStore.put(CODE),
      name: 'trail-sign',
      collection: 'project',
    });
  }, 60_000);
  afterAll(() => rm(root, { recursive: true, force: true }));

  const find = async (action: 'catalog' | 'list', query: string) => {
    const assets = createKilnProgramToolRegistry({
      assetLibrary: library,
      programStore: new MemoryProgramStore(),
    }).find((def) => def.name === 'kiln_assets')!;
    const result = (await assets.run({
      action,
      query,
      ...(action === 'list' ? { collection: 'project' } : {}),
    })) as { total: number };
    return result.total;
  };

  for (const action of ['catalog', 'list'] as const)
    test(`${action} finds trail-sign by space, hyphen, underscore, reversed and partial queries`, async () => {
      for (const query of ['trail sign', 'trail-sign', 'Trail_Sign', 'sign trail', 'trail'])
        expect({ query, total: await find(action, query) }).toEqual({ query, total: 1 });
      expect(await find(action, 'bridge')).toBe(0);
      expect(await find(action, 'trail bridge')).toBe(0);
    }, 60_000);
});
