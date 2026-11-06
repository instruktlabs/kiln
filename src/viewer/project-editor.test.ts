import { expect, test } from 'bun:test';
import { projectDraftSchema, projectRevisionSchema } from '../projects';
import { editableProjectConfig, placementLabel, projectFormDraft } from './project-editor';

test('editing basic project fields preserves inventory, exact dependency lock and design governance', () => {
  const draft = projectDraftSchema.parse({
    name: 'Island',
    design: { palette: [{ role: 'foliage', color: '#526D31' }], conventions: ['1 metre grid'] },
    inventory: [{ id: 'tree', name: 'Tree' }],
    materialDependencies: [
      { resourceId: 'bark', revisionId: 'v1', sha256: `sha256:${'a'.repeat(64)}` },
    ],
  });
  const result = projectFormDraft(JSON.stringify(editableProjectConfig(draft)), {
    name: 'Island revised',
    brief: 'Coastal',
    style: 'Stylized',
    scale: 'Metres',
  });
  expect(result.name).toBe('Island revised');
  expect(result.inventory).toEqual(draft.inventory);
  expect(result.materialDependencies).toEqual(draft.materialDependencies);
  expect(result.design).toEqual({ ...draft.design, style: 'Stylized', scale: 'Metres' });
});

test('editable configuration excludes immutable identity and rejects invalid palette/resource associations', () => {
  const revision = projectRevisionSchema.parse({
    version: 'kiln.project.v1',
    projectId: 'island',
    revisionId: `r_0000000001_${'b'.repeat(64)}`,
    createdAt: '2026-09-26T00:00:00.000Z',
    name: 'Island',
  });
  expect(editableProjectConfig(revision)).not.toHaveProperty('revisionId');
  const fields = { name: 'Island', brief: '', style: '', scale: '' };
  expect(() =>
    projectFormDraft('{"design":{"palette":[{"role":"leaf","color":"red"}]}}', fields),
  ).toThrow();
  expect(() =>
    projectFormDraft(
      '{"design":{"materialRoles":[{"role":"wood","resourceId":"missing"}]}}',
      fields,
    ),
  ).toThrow();
  expect(() => projectFormDraft('{"revisionId":"overwrite"}', fields)).toThrow();
});

test('saving the form keeps a stated placement and leaves an absent one absent', () => {
  const draft = projectDraftSchema.parse({
    name: 'Cove',
    inventory: [
      { id: 'wall', name: 'Wall', placement: { translation: [1, 2, 3], rotation: [0, 90, 0] } },
      { id: 'identity', name: 'Identity', placement: {} },
      { id: 'plan', name: 'Plan' },
    ],
  });
  const result = projectFormDraft(JSON.stringify(editableProjectConfig(draft)), {
    name: 'Cove',
    brief: '',
    style: '',
    scale: '',
  });
  expect(result.inventory[0]!.placement).toEqual({ translation: [1, 2, 3], rotation: [0, 90, 0] });
  expect(result.inventory[1]!.placement).toEqual({});
  expect('placement' in result.inventory[2]!).toBe(false);
});

test('placement reads as what the check does with the item', () => {
  expect(placementLabel(undefined)).toBe('Not composed');
  expect(placementLabel({})).toBe('At origin');
  expect(placementLabel({ translation: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 2, 2] })).toBe(
    'Move 1, 2, 3 · turn 0, 90, 0° · scale 2, 2, 2',
  );
});
