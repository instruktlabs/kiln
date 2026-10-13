import { expect, test } from 'bun:test';
import { z } from 'zod';
import { discoveryShapes } from './shapes';
import { createDiscoveryService } from './service';
import {
  materialLibraryPayloadAnySchema,
  materialManifestV2Schema,
  proceduralMaterialDraftV2Schema,
} from '../material-library';

test('Discovery advertises complete legacy and opt-in material creation/import fields', () => {
  const draft = discoveryShapes.find((entry) => entry.id === 'shape:material-draft')!.shape.schema;
  const payload = discoveryShapes.find((entry) => entry.id === 'shape:material-import')!.shape
    .schema;
  const draftText = JSON.stringify(draft),
    payloadText = JSON.stringify(payload);
  for (const field of [
    'schemaVersion',
    'sampler',
    'minFilter',
    'magFilter',
    'wrapS',
    'wrapT',
    'operations',
    'palette',
    'regions',
    'content',
    'gutter',
    'edgeMode',
    'crop',
    'pin',
    'sourceId',
  ])
    expect(draftText).toContain(`"${field}"`);
  for (const field of [
    'dependencies',
    'recipe',
    'manifestHash',
    'layoutHash',
    'decodedPixelHash',
    'atlasPixelHash',
    'encodedByteLength',
    'files',
  ])
    expect(payloadText).toContain(`"${field}"`);
  expect(draftText).toContain('"layers"');
  expect(payloadText).toContain('"const":1');
  expect(payloadText).toContain('"const":2');
});

test('the exact runtime schemas serialize without opaque custom leaves or injected authoring defaults', () => {
  for (const schema of [
    proceduralMaterialDraftV2Schema,
    materialManifestV2Schema,
    materialLibraryPayloadAnySchema,
  ]) {
    const advertised = z.toJSONSchema(schema, { io: 'input' });
    function walk(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      const object = value as Record<string, unknown>;
      if (object.properties) {
        for (const [name, property] of Object.entries(object.properties as Record<string, unknown>))
          expect(Object.keys(property as object).length, `opaque ${name}`).toBeGreaterThan(0);
      }
      for (const item of Object.values(object)) walk(item);
    }
    walk(advertised);
  }
});

test('each advertised material shape can actually be retrieved within the Discovery response budget', async () => {
  const service = createDiscoveryService(
    discoveryShapes,
    { search: async () => [] },
    async () => ({}),
  );
  for (const id of ['shape:material-draft', 'shape:material-import']) {
    const response = await service({ ids: [id] });
    expect(response.error, id).toBeUndefined();
    expect(response.entries.map((entry) => entry.id)).toEqual([id]);
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThanOrEqual(64 * 1024);
    const entry = response.entries[0]!;
    if (!('shape' in entry)) throw new Error('Missing full shape');
    const schema = entry.shape.schema;
    function checkRefs(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) checkRefs(item);
        return;
      }
      const object = value as Record<string, unknown>;
      if (typeof object.$ref === 'string') {
        expect(object.$ref.startsWith('#/')).toBe(true);
        let target: unknown = schema;
        for (const component of object.$ref.slice(2).split('/'))
          target = (target as Record<string, unknown>)?.[
            component.replaceAll('~1', '/').replaceAll('~0', '~')
          ];
        expect(target, object.$ref).toBeDefined();
      }
      for (const item of Object.values(object)) checkRefs(item);
    }
    checkRefs(schema);
  }
});
