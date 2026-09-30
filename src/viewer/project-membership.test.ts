import { expect, test } from 'bun:test';
import { membershipPatch } from './project-membership';
import { projectDraftSchema, type ProjectRevision } from '../projects';

test('membership replaces one exact inventory link without mutating other items or the input', () => {
  const project = {
    ...projectDraftSchema.parse({
      name: 'Farm',
      inventory: [
        { id: 'cow', name: 'Cow', brief: 'Keep this brief' },
        { id: 'barn', name: 'Barn' },
      ],
    }),
  } as ProjectRevision;
  const asset = { collectionId: 'cows', assetId: 'cow', revisionId: 'r_exact' };
  const patch = membershipPatch(project, 'cow', asset, 'New name');
  expect(patch.inventory[0]).toEqual({ ...project.inventory[0]!, asset });
  expect(patch.inventory[1]).toEqual(project.inventory[1]);
  expect(project.inventory[0]!.asset).toBeUndefined();
  expect(
    membershipPatch({ ...project, inventory: patch.inventory }, 'cow', null, '').inventory[0]!
      .asset,
  ).toBeUndefined();
});
test('a new membership creates an inventory item, while detach cannot invent one', () => {
  const project = { inventory: [] } as unknown as ProjectRevision;
  const asset = { collectionId: 'project', assetId: 'cow', revisionId: 'r_one' };
  expect(membershipPatch(project, 'cow', asset, 'Cow').inventory[0]).toEqual({
    id: 'cow',
    name: 'Cow',
    kind: 'asset',
    brief: '',
    references: [],
    asset,
  });
  expect(() => membershipPatch(project, 'missing', null, '')).toThrow('Inventory item not found');
});
