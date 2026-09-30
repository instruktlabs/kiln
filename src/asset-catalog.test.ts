import { expect, test } from 'bun:test';
import type { AssetLibrary, AssetManifest } from './assets';
import { listAssetCatalog } from './asset-catalog';

const manifest = (revisionId: string): AssetManifest => ({
  version: 'kiln.asset.v1',
  assetId: 'tractor',
  revisionId,
  name: 'Tractor',
  createdAt: '2026-09-26T00:00:00Z',
  tags: [],
  editable: false,
  files: {},
});
test('Library aggregates configured collections without conflating identical asset IDs', async () => {
  const library = {
    collections: () => [
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ],
    list: async (id: string) => [manifest(id === 'one' ? 'r_one' : 'r_two')],
  } as AssetLibrary;
  const result = await listAssetCatalog(library);
  expect(result.entries.map((entry) => [entry.collectionId, entry.manifest.revisionId])).toEqual([
    ['one', 'r_one'],
    ['two', 'r_two'],
  ]);
  expect(result.errors).toEqual([]);
});
test('an unavailable collection is explicit and does not hide healthy assets', async () => {
  const library = {
    collections: () => [
      { id: 'offline', label: 'Offline' },
      { id: 'ok', label: 'Available' },
    ],
    list: async (id: string) => {
      if (id === 'offline') throw new Error('Unavailable');
      return [manifest('r_ok')];
    },
  } as AssetLibrary;
  const result = await listAssetCatalog(library);
  expect(result.entries).toHaveLength(1);
  expect(result.errors).toEqual([{ collectionId: 'offline', message: 'Unavailable' }]);
});
