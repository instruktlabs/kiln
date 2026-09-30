import { expect, test } from 'bun:test';
import { projectDraftSchema, projectRevisionSchema } from '../projects';
import { editableProjectConfig, projectFormDraft } from './project-editor';

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
