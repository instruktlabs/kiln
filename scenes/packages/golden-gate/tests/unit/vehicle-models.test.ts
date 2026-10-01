import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createHash } from 'node:crypto';
import { extractVehicle, LAMP_KIND, VEHICLE_TYPES, VERTEX_LAYOUT, VERTEX_STRIDE, WHEEL_KIND } from '../../src/traffic/vehicle-models';
import type { VehicleType } from '../../src/traffic/vehicle-models';
import { VEHICLE_PROVENANCE } from '../../scripts/stage';
import { stagedDir } from '../../scripts/release';

// The approved vehicle GLBs (pinned bytes in scripts/stage.ts): the staged copy, or the author's
// file while it is still the approved one (read-only inputs, the folders the staging script reads).
const PACKAGE = resolve(import.meta.dir, '../..'), COMMONS = resolve(PACKAGE, '../../..');
const ROOTS = ['showcase/authors/sonnet-vehicles-a/outputs', 'showcase/authors/sonnet-vehicles-b/outputs'].map(r => resolve(COMMONS, r));
const approved = (path: string, type: VehicleType) => existsSync(path) && createHash('sha256').update(readFileSync(path)).digest('hex') === VEHICLE_PROVENANCE[type].sha256;
const source = (type: VehicleType) => [resolve(stagedDir(), 'vehicles', `${type}.glb`), ...ROOTS.map(root => resolve(root, type, `${type}.glb`))].find(path => approved(path, type));
const available = VEHICLE_TYPES.every(type => source(type));

async function load(type: VehicleType): Promise<GLTF> {
  const bytes = readFileSync(source(type)!);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
/** Exact r4 child measurements; heavy source LOD conversion preserves geometry counts. Four wheels per vehicle. */
const BODY: Record<VehicleType, [number, number, number]> = {
  sedan: [2190, 706, 240], hatchback: [2184, 724, 252], suv: [2226, 738, 246],
  pickup: [1168, 672, 152], 'box-truck': [1050, 598, 90], 'transit-bus': [1188, 924, 154],
};

describe.skipIf(!available)('approved vehicles through MSFT_lod', () => {
  for (const type of VEHICLE_TYPES) test(`${type}: three levels, wheels at their pivots, material attributes`, async () => {
    const { model, release } = await extractVehicle(type, await load(type));
    const [l0, l1, l2] = model.triangles, wheels = l0 - BODY[type][0];
    expect(l2).toBe(BODY[type][2]);
    expect(wheels).toBeGreaterThan(0);
    expect(l1).toBe(BODY[type][1] + wheels); // the same four wheels ride on LOD0 and LOD1
    expect(model.wheels.map(w => w.name)).toEqual(['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']);
    // +X forward, right side +Z: front wheels ahead of the rear, left wheels at -Z, radius = pivot height.
    const [fl, fr, rl, rr] = model.wheels.map(w => w.offset);
    expect(fl![0]).toBeGreaterThan(rl![0]); expect(fl![2]).toBeLessThan(0); expect(fr![2]).toBeGreaterThan(0);
    expect(Math.abs(fl![1] - rr![1])).toBeLessThan(.05);
    expect(model.wheelRadius).toBeGreaterThan(.28); expect(model.wheelRadius).toBeLessThan(.6);
    expect(model.length).toBeGreaterThan(3.9); expect(model.width).toBeGreaterThan(1.6); expect(model.width).toBeLessThan(2.7);
    // Per-vertex material: some paint, some lamps of each kind, wheel vertices only on LOD0/LOD1.
    const data = (model.lods[0].getAttribute('position') as unknown as { data: { array: Float32Array } }).data.array;
    let paint = 0, head = 0, tail = 0, brake = 0, front = 0, rear = 0;
    for (let o = 0; o < data.length; o += VERTEX_STRIDE) {
      paint += data[o + VERTEX_LAYOUT.surface[0] + 2]!;
      const lamp = data[o + VERTEX_LAYOUT.surface[0] + 3]!, kind = data[o + VERTEX_LAYOUT.wheel[0] + 3]!;
      if (lamp === LAMP_KIND.head) head++; if (lamp === LAMP_KIND.tail) tail++; if (lamp === LAMP_KIND.brake) brake++;
      if (kind === WHEEL_KIND.front) front++; if (kind === WHEEL_KIND.rear) rear++;
    }
    expect(paint).toBeGreaterThan(0); expect(head).toBeGreaterThan(0); expect(tail).toBeGreaterThan(0); expect(brake).toBeGreaterThan(0);
    expect(front).toBeGreaterThan(0); expect(rear).toBeGreaterThan(0);
    const far = (model.lods[2].getAttribute('position') as unknown as { data: { array: Float32Array } }).data.array;
    for (let o = 0; o < far.length; o += VERTEX_STRIDE) expect(far[o + VERTEX_LAYOUT.wheel[0] + 3]).toBe(WHEEL_KIND.body);
    expect(model.lodSource).toBe('MSFT_lod');
    console.log(type, JSON.stringify({ length: +model.length.toFixed(3), width: +model.width.toFixed(3), height: +model.height.toFixed(3), radius: +model.wheelRadius.toFixed(3), wheelbase: +model.wheelbase.toFixed(3), triangles: model.triangles, materials: model.materials }));
    release();
  });

  test('MSFT_lod is never required: without the extension every level is LOD0, wheels hidden at LOD2 (D-21)', async () => {
    const gltf = await load('sedan');
    for (const node of (gltf.parser.json as { nodes: { extensions?: Record<string, unknown> }[] }).nodes) delete node.extensions?.MSFT_lod;
    const { model, release } = await extractVehicle('sedan', gltf), wheels = model.triangles[0] - BODY.sedan[0];
    expect(model.lodSource).toBe('LOD0');
    expect(model.triangles).toEqual([BODY.sedan[0] + wheels, BODY.sedan[0] + wheels, BODY.sedan[0]]);
    expect(model.wheels).toHaveLength(4);
    release();
  });
});
