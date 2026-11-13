import { expect, test } from 'bun:test';
import { assetIdentity, entriesForProject, entriesMatching } from './library-state';
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
test('the Library search matches words across spaces, hyphens and underscores', () => {
  const named = (name: string, tags: string[] = []) => ({
    collection: 'project',
    manifest: { assetId: name, revisionId: 'r', name, tags } as AssetManifest,
  });
  const library = [named('trail-sign', ['wood']), named('Bridge_Deck'), named('lamp')];
  const names = (query: string) => entriesMatching(library, query).map((e) => e.manifest.name);
  expect(names('trail sign')).toEqual(['trail-sign']);
  expect(names('sign wood')).toEqual(['trail-sign']);
  expect(names('bridge deck')).toEqual(['Bridge_Deck']);
  expect(names('')).toEqual(['trail-sign', 'Bridge_Deck', 'lamp']);
  expect(names('trail bridge')).toEqual([]);
});
