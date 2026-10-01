import type { Accessor, Document } from '@gltf-transform/core';
import { weldPrimitive } from '@gltf-transform/functions';

export type IndexPolicy = 'indexed' | 'asBuilt';
export interface IndexBufferReceipt {
  version: 'kiln.index-buffers.v1';
  policy: IndexPolicy;
  primitivesConverted: number;
  /** Unique vertex, morph and index accessor payload bytes at this pass, not GLB file size. */
  bufferBytesBefore: number;
  bufferBytesAfter: number;
}
export function resolveIndexPolicy(value: unknown = 'indexed'): IndexPolicy {
  if (value !== 'indexed' && value !== 'asBuilt')
    throw new Error('indexPolicy must be indexed or asBuilt');
  return value;
}
function geometryBytes(doc: Document): number {
  const accessors = new Set<Accessor>();
  for (const mesh of doc.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      for (const accessor of primitive.listAttributes()) accessors.add(accessor);
      const index = primitive.getIndices();
      if (index) accessors.add(index);
      for (const target of primitive.listTargets())
        for (const accessor of target.listAttributes()) accessors.add(accessor);
    }
  return [...accessors].reduce(
    (bytes, accessor) => bytes + (accessor.getArray()?.byteLength ?? 0),
    0,
  );
}
/** The pinned weldPrimitive compares every attribute bitwise. No tolerance or geometric repair. */
export function applyIndexPolicy(doc: Document, policy: IndexPolicy): IndexBufferReceipt {
  const bufferBytesBefore = geometryBytes(doc);
  let primitivesConverted = 0;
  if (policy === 'indexed')
    for (const mesh of doc.getRoot().listMeshes())
      for (const primitive of mesh.listPrimitives()) {
        if (!primitive.getIndices()) {
          weldPrimitive(primitive, { overwrite: false });
          primitivesConverted++;
        }
      }
  return {
    version: 'kiln.index-buffers.v1',
    policy,
    primitivesConverted,
    bufferBytesBefore,
    bufferBytesAfter: geometryBytes(doc),
  };
}
