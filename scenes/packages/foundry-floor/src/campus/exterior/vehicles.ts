// SPDX-License-Identifier: MIT
// The six approved Kiln vehicles as instancing-ready geometry (FF-C1 item 5), the same pattern as Golden Gate's
// (packages/golden-gate/src/traffic/vehicle-models.ts, copied, not imported): each GLB follows the glTF MSFT_lod
// convention (the LOD0 node references LOD1 and LOD2 through `extensions.MSFT_lod.ids`; the four `Wheel_*` nodes are
// siblings of LOD0 with their pivots at the wheel centres; +X forward, +Y up, right side +Z, radius = pivot height).
// Plain GLTFLoader output holds LOD0 and the wheels; LOD1 and LOD2 load through the parser (`getDependency('node',
// id)`), the loader half of MSFT_lod. MSFT_lod is never required: a file without it uses sibling groups named LOD1 and
// LOD2, or LOD0 at every distance.
//
// Per level, every mesh is baked into the vehicle frame and merged into one interleaved geometry whose vertices carry
// their material: albedo, emissive glow, roughness, metalness, a paint weight (the only per-instance tint target) and
// a lamp kind (head, tail, brake). Wheels are merged into LOD0 and LOD1 with their pivot and axle kind, so the vertex
// stage spins and steers them; LOD2 has none. One draw per vehicle type and level.
import { Box3, BufferAttribute, Color, InstancedBufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Matrix3, Matrix4, Sphere, Vector3 } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial, Object3D } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { CarBody } from '../drive/car';
import type { LampData } from '../drive/driving';

export const WHEEL_NAMES = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] as const;
/** Interleaved vertex layout (floats): position 3, normal 3, albedo 3, glow 3, surface 4, wheel 4. */
export const VERTEX_LAYOUT = { position: [0, 3], normal: [3, 3], albedo: [6, 3], glow: [9, 3], surface: [12, 4], wheel: [16, 4] } as const;
export const VERTEX_STRIDE = 20;
/** `surface.w`: lamp kind per vertex. */
export const LAMP_KIND = { none: 0, head: 1, tail: 2, brake: 3 } as const;
/** `wheel.w`: 0 body, 1 rear wheel (spins), 2 front wheel (spins and steers). */
export const WHEEL_KIND = { body: 0, rear: 1, front: 2 } as const;

export interface VehicleModel {
  type: string; name: string;
  /** LOD0 and LOD1 include the wheels; LOD2 is the wheel-less silhouette. */
  lods: [InstancedBufferGeometry, InstancedBufferGeometry, InstancedBufferGeometry];
  length: number; width: number; height: number; wheelRadius: number; wheelbase: number;
  /** Centre of LOD0's bounding box in the vehicle frame (the footprint centre and the contact shadow). */
  boxCentre: [number, number, number];
  /** Bounding sphere of LOD0 in the vehicle frame (for culling). */
  bounds: { centre: [number, number, number]; radius: number };
  wheels: { name: string; offset: [number, number, number]; front: boolean }[];
  rearAxle: number;
  triangles: [number, number, number];
  lodSource: 'MSFT_lod' | 'named groups' | 'LOD0';
  materials: string[];
  locators: Record<string,[number,number,number]>;
}

interface Part { geometry: Mesh['geometry']; matrix: Matrix4; material: MeshStandardMaterial; wheel?: { pivot: Vector3; front: boolean } }

function collect(root: Object3D, frame: Matrix4, wheel?: Part['wheel']): Part[] {
  const parts: Part[] = [], inverse = frame.clone().invert();
  root.updateWorldMatrix(true, true);
  root.traverse(node => {
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length !== 1) throw new Error(`Vehicle mesh ${mesh.name} has ${materials.length} materials`);
    parts.push({ geometry: mesh.geometry, matrix: inverse.clone().multiply(mesh.matrixWorld), material: materials[0] as MeshStandardMaterial, wheel });
  });
  return parts;
}

/** Merges parts into one indexed, interleaved geometry with per-vertex material attributes. */
function mergeParts(parts: Part[], lamps: LampData, paintMaterial: string): InstancedBufferGeometry {
  const kinds: Record<string, number> = Object.fromEntries(Object.entries(lamps.materials).map(([material, kind]) => [material, LAMP_KIND[kind]]));
  let vertices = 0, indices = 0;
  for (const p of parts) { const n = p.geometry.getAttribute('position').count; vertices += n; indices += p.geometry.index ? p.geometry.index.count : n; }
  const data = new Float32Array(vertices * VERTEX_STRIDE), index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const v = new Vector3(), n = new Vector3(), normalMatrix = new Matrix3(), glow = new Color(), black = new Color(0, 0, 0);
  let vo = 0, io = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position'), nor = p.geometry.getAttribute('normal'), m = p.material;
    normalMatrix.getNormalMatrix(p.matrix);
    const lamp = kinds[m.name] ?? LAMP_KIND.none, paint = m.name === paintMaterial ? 1 : 0;
    glow.copy(m.emissive ?? black).multiplyScalar(m.emissiveIntensity ?? 1);
    if (lamp === LAMP_KIND.tail) { const peak = Math.max(glow.r, glow.g, glow.b); if (peak > lamps.taillightPeak) glow.multiplyScalar(lamps.taillightPeak / peak); }
    const kind = p.wheel ? (p.wheel.front ? WHEEL_KIND.front : WHEEL_KIND.rear) : WHEEL_KIND.body, pivot = p.wheel?.pivot ?? new Vector3();
    for (let i = 0; i < pos.count; i++) {
      const o = (vo + i) * VERTEX_STRIDE;
      v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix); v.toArray(data, o);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize(); else n.set(0, 1, 0);
      n.toArray(data, o + 3);
      data[o + 6] = m.color.r; data[o + 7] = m.color.g; data[o + 8] = m.color.b;
      data[o + 9] = glow.r; data[o + 10] = glow.g; data[o + 11] = glow.b;
      data[o + 12] = m.roughness ?? .5; data[o + 13] = m.metalness ?? 0; data[o + 14] = paint; data[o + 15] = lamp;
      data[o + 16] = pivot.x; data[o + 17] = pivot.y; data[o + 18] = pivot.z; data[o + 19] = kind;
    }
    if (p.geometry.index) { const src = p.geometry.index; for (let i = 0; i < src.count; i++) index[io + i] = src.getX(i) + vo; io += src.count; }
    else { for (let i = 0; i < pos.count; i++) index[io + i] = vo + i; io += pos.count; }
    vo += pos.count;
  }
  const geometry = new InstancedBufferGeometry(), buffer = new InterleavedBuffer(data, VERTEX_STRIDE);
  for (const [name, [offset, size]] of Object.entries(VERTEX_LAYOUT)) geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.instanceCount = 0;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

interface LodJson { nodes: { name?: string; extensions?: { MSFT_lod?: { ids: number[] } } }[] }

/** Extracts one vehicle from its loaded GLTF (the kit's verified pack model). */
export async function extractVehicle(type: string, gltf: GLTF, lamps: LampData, paintMaterial: string, options: {wheelNames?:readonly string[]} = {}): Promise<{ model: VehicleModel; release(): void }> {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  const root = scene.children.length === 1 ? scene.children[0]! : scene;
  const lod0 = root.getObjectByName('LOD0');
  if (!lod0) throw new Error(`Vehicle ${type}: no LOD0 node`);
  const json = gltf.parser.json as LodJson, index = json.nodes.findIndex(n => n.name === 'LOD0'), ids = json.nodes[index]?.extensions?.MSFT_lod?.ids ?? [];
  // The referenced levels are built detached (no parent). MSFT_lod levels replace the LOD0 node in place, so their own
  // transforms are relative to the vehicle root exactly like LOD0's.
  const named1 = root.getObjectByName('LOD1'), named2 = root.getObjectByName('LOD2');
  const lodSource: VehicleModel['lodSource'] = ids.length >= 2 ? 'MSFT_lod' : named1 && named2 ? 'named groups' : 'LOD0';
  const [lod1, lod2] = lodSource === 'MSFT_lod' ? await Promise.all(ids.slice(0, 2).map(id => gltf.parser.getDependency('node', id) as Promise<Object3D>)) : [null, null];
  const frame = root.matrixWorld, toVehicle = frame.clone().invert();
  const wheels: VehicleModel['wheels'] = [], wheelParts: Part[] = [];
  let radius = 0, front = -Infinity, rear = Infinity;
  for (const name of options.wheelNames ?? WHEEL_NAMES) {
    const wheel = root.getObjectByName(name); if (!wheel) throw new Error(`Vehicle ${type}: ${name} missing`);
    const pivot = new Vector3().setFromMatrixPosition(wheel.matrixWorld).applyMatrix4(toVehicle), isFront = name.startsWith('Wheel_F');
    radius = Math.max(radius, pivot.y); front = Math.max(front, pivot.x); rear = Math.min(rear, pivot.x);
    wheels.push({ name, offset: pivot.toArray() as [number, number, number], front: isFront });
    wheelParts.push(...collect(wheel, frame, { pivot, front: isFront }));
  }
  const body0 = collect(lod0, frame);
  const levels = lod1 && lod2 ? [[...body0, ...wheelParts], [...collect(lod1, new Matrix4()), ...wheelParts], collect(lod2, new Matrix4())]
    : named1 && named2 ? [[...body0, ...wheelParts], [...collect(named1, frame), ...wheelParts], collect(named2, frame)]
    : [[...body0, ...wheelParts], [...body0, ...wheelParts], body0];
  const lods = levels.map(parts => mergeParts(parts, lamps, paintMaterial)) as VehicleModel['lods'];
  const box = new Box3().copy(lods[0].boundingBox!), sphere = new Sphere().copy(lods[0].boundingSphere!);
  const materials = [...new Set(levels.flat().map(p => p.material.name))].sort();
  const locators:VehicleModel['locators']={};
  for(const name of ['FifthWheel','Kingpin']){const node=root.getObjectByName(name);if(node)locators[name]=new Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(toVehicle).toArray() as [number,number,number];}
  const model: VehicleModel = {
    type, name: root.name, lods, length: box.max.x - box.min.x, width: box.max.z - box.min.z, height: box.max.y - box.min.y,
    boxCentre: box.getCenter(new Vector3()).toArray() as [number, number, number],
    wheelRadius: radius, wheelbase: front - rear, rearAxle: rear, bounds: { centre: sphere.center.toArray() as [number, number, number], radius: sphere.radius }, wheels,
    triangles: lods.map(g => g.index!.count / 3) as VehicleModel['triangles'], lodSource, materials, locators,
  };
  // LOD1 and LOD2 were created here and are merged now; LOD0 and the wheels belong to the kit's model.
  const release = () => { for (const node of [lod1, lod2]) node?.traverse(n => { const m = n as Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); } }); };
  return { model, release };
}

/** The car model's dimensions for the pure driving model. */
export function carBody(model: VehicleModel): CarBody {
  return { length: model.length, width: model.width, height: model.height, wheelRadius: model.wheelRadius, wheelbase: model.wheelbase,
    rearAxle: model.rearAxle, centre: [model.boxCentre[0], model.boxCentre[2]], wheels: model.wheels };
}
