import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { textureAtlas, remapUVToAtlas } from '../texture-atlas';
import {
  atlasDocumentTable,
  collectAtlasProvenance,
  createAtlasTableMemo,
  validateAtlasProvenanceTable,
} from '../atlas-provenance';

// Loading a GLB validated the same scene table twice (import validation, then the review scene),
// and every export validated it again after the provenance refresh. The memo keeps one
// validation per unchanged table without ever answering for a table it has not seen.

test('the memo validates an unchanged table once and hands out independent copies', () => {
  let calls = 0;
  const memo = createAtlasTableMemo((raw) => {
    calls++;
    return structuredClone(raw) as never;
  });
  const raw = { version: 1, atlases: [{ id: 'a' }] };
  const first = memo(raw);
  const second = memo(raw);
  expect(calls).toBe(1);
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
  (first as unknown as { atlases: unknown[] }).atlases.push('mutated by a caller');
  expect(memo(raw)).toEqual(second);
});

test('the memo validates again after an in-place edit, for another object, and after a failure', () => {
  let calls = 0;
  const memo = createAtlasTableMemo((raw) => {
    calls++;
    if ((raw as { bad?: boolean }).bad) throw new Error('invalid table');
    return structuredClone(raw) as never;
  });
  const raw: Record<string, unknown> = { version: 1, atlases: [] };
  memo(raw);
  raw['atlases'] = [{ id: 'b' }];
  expect(memo(raw) as unknown).toEqual({ version: 1, atlases: [{ id: 'b' }] });
  expect(calls).toBe(2);
  memo({ version: 1, atlases: [{ id: 'b' }] });
  expect(calls).toBe(3);
  raw['bad'] = true;
  expect(() => memo(raw)).toThrow('invalid table');
  expect(() => memo(raw)).toThrow('invalid table');
  expect(calls).toBe(5);
});

test('a document table edited in place after validation is validated again, never reused', async () => {
  const texture = await textureAtlas({
    schemaVersion: 1,
    width: 128,
    height: 128,
    usage: 'albedo',
    regions: [
      {
        name: 'face',
        content: { x: 4, y: 4, width: 4, height: 4 },
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 4,
            height: 4,
            background: [255, 12, 34, 255],
            operations: [],
          },
        },
      },
    ],
  });
  const geometry = remapUVToAtlas(new THREE.PlaneGeometry(), texture, 'face', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
  });
  const root = new THREE.Group().add(
    new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture })),
  );
  const table = collectAtlasProvenance(root).table!;
  const doc = new Document();
  doc.getRoot().setDefaultScene(doc.createScene().setExtras({ kilnAtlasProvenance: table }));
  const first = atlasDocumentTable(doc)!;
  expect(first).toEqual(validateAtlasProvenanceTable(table));
  expect(atlasDocumentTable(doc)).toEqual(first);
  // The same extras object, now carrying a key the closed table must reject.
  (table as unknown as Record<string, unknown>)['extra'] = true;
  expect(() => atlasDocumentTable(doc)).toThrow();
});
