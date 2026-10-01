import { createHash } from 'node:crypto';
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three/webgpu';

/** Integer bytes only: floating point geometry is compared numerically, never hashed. */
export function integerHash(array: ArrayBufferView): string {
  if (array instanceof Float32Array || array instanceof Float64Array || array instanceof DataView) {
    throw new TypeError('Golden hashes are restricted to integer buffers');
  }
  return createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
}

function snapshotAttribute(attribute: BufferAttribute | InterleavedBufferAttribute) {
  const sums = new Array<number>(attribute.itemSize).fill(0);
  const samples: { vertex: number; values: number[] }[] = [];
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    const values: number[] = [];
    for (let component = 0; component < attribute.itemSize; component++) {
      const value = attribute.getComponent(vertex, component);
      if (!Number.isFinite(value)) throw new Error(`Nonfinite vertex ${vertex}, component ${component}`);
      sums[component] += value;
      if (vertex % 97 === 0) values.push(value);
    }
    if (vertex % 97 === 0) samples.push({ vertex, values });
  }
  return { count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized, sums, samples };
}

export function snapshotGeometry(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  if (!position || !geometry.boundingBox) throw new Error('Golden geometry needs finite positions and bounds');
  const attributes = Object.fromEntries(Object.keys(geometry.attributes).sort().map(name => [name, snapshotAttribute(geometry.getAttribute(name))]));
  return {
    vertices: position.count,
    triangles: (geometry.index?.count ?? position.count) / 3,
    bounds: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() },
    groups: geometry.groups.map(group => ({ ...group })),
    index: geometry.index ? { count: geometry.index.count, type: geometry.index.array.constructor.name, sha256: integerHash(geometry.index.array) } : null,
    attributes,
  };
}

export type GeometryGolden = ReturnType<typeof snapshotGeometry>;

/** Stable points include the mill bank, bridge, footprint edges, and a deterministic farm-wide grid. */
export function siteSamplePoints(): [number, number][] {
  const points: [number, number][] = [];
  const xs = [19, 20.8, 21.7, 25, 28.3, 29.2, 31.7, -36, 0, 36];
  const zs = [-26.99, -26.93, -26.88, -26.8, -26.74, -26.6, -26.31, -26.1, -25.88, -25.8];
  for (const x of xs) for (const z of zs) points.push([x, z]);
  for (let i = 0; i < 100; i++) points.push([((i * 47 + 13) % 721) / 10 - 36, ((i * 83 + 37) % 721) / 10 - 36]);
  return points;
}
