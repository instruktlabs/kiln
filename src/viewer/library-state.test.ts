import { expect, test } from 'bun:test';
import { assetIdentity, entriesForProject } from './library-state';
import { projectDraftSchema, type ProjectRevision } from '../projects';
import type { AssetManifest } from '../assets';

const entries = ['one/r_old', 'one/r_new', 'two/r_new'].map((value) => {
  const [collection, revisionId] = value.split('/');
  return { collection: collection!, manifest: { assetId: 'cow', revisionId } as AssetManifest };
});
const project = {
  ...projectDraftSchema.parse({
    name: 'Farm',
    inventory: [
      {
        id: 'cow',
        name: 'Cow',
        asset: { collectionId: 'one', assetId: 'cow', revisionId: 'r_old' },
      },
    ],
  }),
  projectId: 'farm',
} as ProjectRevision;
test('asset identity includes storage collection', () => {
  expect(assetIdentity(entries[0]!)).toBe(assetIdentity(entries[1]!));
  expect(assetIdentity(entries[1]!)).not.toBe(assetIdentity(entries[2]!));
});
test('project filter shows its pinned revision, while standalone excludes all revisions of members', () => {
  expect(entriesForProject(entries, [project], 'farm')).toEqual([entries[0]!]);
  expect(entriesForProject(entries, [project], 'standalone')).toEqual([entries[2]!]);
  expect(entriesForProject(entries, [project], '')).toEqual(entries);
});
