/** Strict opt-in PBR material data. Pixel/byte loading is outside this module. */
import {
  canonicalizePortableMaterialSpecV2,
  ProceduralTextureError,
} from './procedural-material-v2';
import {
  admitProceduralTextureSpecV3,
  type CanonicalProceduralTextureSpecV3,
  type ProceduralTextureSpecV3,
} from './procedural-texture-v3-contract';
import {
  canonicalizePortableSamplerV1,
  type CanonicalPortableSamplerV1,
  type PortableSamplerV1,
} from './portable-sampler';
import type { AuthoringDiagnostic } from './evaluator/authoring-diagnostic';
import type { MaterialMapSlotV1 } from './pinned-material-map';

export const PORTABLE_MATERIAL_V3_LIMITS = Object.freeze({
  maxBindings: 5,
  maxTexels: 4 * 1024 * 1024,
  maxEncodedBytes: 16 * 1024 * 1024,
  maxWork: 64_000_000,
  maxTransientBytes: 64 * 1024 * 1024,
  maxJsonBytes: 1024 * 1024,
});
export const PORTABLE_MATERIAL_SLOT_USAGE = {
  baseColor: 'albedo',
  normal: 'normal',
  metallicRoughness: 'metallicRoughness',
  emissive: 'emissive',
  occlusion: 'occlusion',
} as const;
export type PortableTextureRefV3 =
  | { kind: 'procedural'; spec: ProceduralTextureSpecV3; sampler: PortableSamplerV1 }
  | { kind: 'resource'; resourceId: string; sampler: PortableSamplerV1 };
export type CanonicalPortableTextureRefV3 =
  | {
      kind: 'procedural';
      spec: CanonicalProceduralTextureSpecV3;
      sampler: CanonicalPortableSamplerV1;
    }
  | { kind: 'resource'; resourceId: string; sampler: CanonicalPortableSamplerV1 };
export interface PortableMaterialSpecV3 {
  schemaVersion: 3;
  model: 'pbrMetallicRoughness';
  name?: string;
  baseColor?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  alphaMode?: 'opaque' | 'mask' | 'blend';
  alphaCutoff?: number;
  doubleSided?: boolean;
  textures?: Partial<Record<MaterialMapSlotV1, PortableTextureRefV3>>;
}
export interface CanonicalPortableMaterialSpecV3
  extends Omit<
    PortableMaterialSpecV3,
    | 'textures'
    | 'roughness'
    | 'metalness'
    | 'emissiveIntensity'
    | 'alphaMode'
    | 'alphaCutoff'
    | 'doubleSided'
  > {
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  alphaMode: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number;
  doubleSided: boolean;
  textures: Partial<Record<MaterialMapSlotV1, CanonicalPortableTextureRefV3>>;
}
export class PortableMaterialV3Error extends ProceduralTextureError {
  constructor(message: string, diagnostic: AuthoringDiagnostic = 'PORTABLE_MATERIAL_V3_CONTRACT') {
    super(`portableMaterial V3: ${message}`, diagnostic);
    this.name = 'PortableMaterialV3Error';
  }
}
function fail(message: string): never {
  throw new PortableMaterialV3Error(message);
}
/** Bound untrusted data before reading any accessor or making canonical copies. */
function assertJson(input: unknown): void {
  let nodes = 0;
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 65536 || depth > 16) fail('JSON size/depth budget exceeded.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (value.length > PORTABLE_MATERIAL_V3_LIMITS.maxJsonBytes) fail('string budget exceeded.');
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object') fail('only plain JSON data is supported.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      fail('only plain JSON prototypes are supported.');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(value);
    if (keys.length > 1025) fail('field/array budget exceeded.');
    const length = array ? (descriptors['length']?.value as number) : undefined;
    if (array && (length! > 1024 || keys.length !== length! + 1))
      fail('arrays must be bounded dense JSON data.');
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        fail('forbidden JSON field.');
      const d = descriptors[key]!;
      if (!d.enumerable || !('value' in d)) fail('JSON accessors/hidden fields are unsupported.');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length!))
        fail('invalid array key.');
      visit(d.value, depth + 1);
    }
  };
  visit(input, 0);
  if (
    new TextEncoder().encode(JSON.stringify(input)).length >
    PORTABLE_MATERIAL_V3_LIMITS.maxJsonBytes
  )
    fail('JSON byte budget exceeded.');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected a JSON object.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)))
    fail('unknown field in material or texture reference.');
  return result;
}
export interface PortableMaterialAdmissionV3 {
  spec: CanonicalPortableMaterialSpecV3;
  texels: number;
  estimatedWorkUnits: number;
  conservativePixelAllocationBytes: number;
}
function admitMaterial(input: unknown): PortableMaterialAdmissionV3 {
  assertJson(input);
  const scalarKeys = [
    'baseColor',
    'roughness',
    'metalness',
    'emissive',
    'emissiveIntensity',
    'alphaMode',
    'alphaCutoff',
    'doubleSided',
  ];
  const r = record(input, ['schemaVersion', 'model', 'name', 'textures', ...scalarKeys]);
  if (r['schemaVersion'] !== 3 || r['model'] !== 'pbrMetallicRoughness')
    fail('requires schemaVersion 3 and model pbrMetallicRoughness.');
  const name = r['name'];
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 200))
    fail('name requires 1..200 characters.');
  const common = canonicalizePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    ...Object.fromEntries(scalarKeys.filter((k) => r[k] !== undefined).map((k) => [k, r[k]])),
  });
  const refs = record(r['textures'] ?? {}, Object.keys(PORTABLE_MATERIAL_SLOT_USAGE));
  const textures: CanonicalPortableMaterialSpecV3['textures'] = {};
  let texels = 0,
    work = 0,
    bytes = 0;
  for (const [key, value] of Object.entries(refs)) {
    const slot = key as MaterialMapSlotV1;
    const ref = record(value, ['kind', 'spec', 'resourceId', 'sampler']);
    const sampler = canonicalizePortableSamplerV1(ref['sampler']);
    if (ref['kind'] === 'procedural') {
      if (ref['resourceId'] !== undefined)
        fail('procedural references cannot carry a resource ID.');
      const admitted = admitProceduralTextureSpecV3(ref['spec']);
      if (admitted.spec.usage !== PORTABLE_MATERIAL_SLOT_USAGE[slot])
        throw new PortableMaterialV3Error(
          `${slot} requires ${PORTABLE_MATERIAL_SLOT_USAGE[slot]} data.`,
          'PROCEDURAL_TEXTURE_USAGE',
        );
      texels += admitted.spec.width * admitted.spec.height;
      work += admitted.estimatedWorkUnits;
      bytes += admitted.conservativePixelAllocationBytes;
      textures[slot] = { kind: 'procedural', spec: admitted.spec, sampler };
    } else if (ref['kind'] === 'resource') {
      if (
        ref['spec'] !== undefined ||
        typeof ref['resourceId'] !== 'string' ||
        ref['resourceId'].length > 128 ||
        !/^kiln\.[a-z0-9][a-z0-9._-]+$/.test(ref['resourceId'])
      )
        fail('resource requires only a bounded closed kiln.* ID and sampler.');
      textures[slot] = { kind: 'resource', resourceId: ref['resourceId'], sampler };
    } else fail('texture kind must be procedural or resource.');
  }
  if (
    texels > PORTABLE_MATERIAL_V3_LIMITS.maxTexels ||
    work > PORTABLE_MATERIAL_V3_LIMITS.maxWork ||
    bytes > PORTABLE_MATERIAL_V3_LIMITS.maxTransientBytes
  )
    fail('aggregate texel/work/allocation budget exceeded.');
  const { schemaVersion: _, textures: __, ...parameters } = common;
  return {
    spec: {
      schemaVersion: 3,
      ...parameters,
      ...(name !== undefined ? { name: name as string } : {}),
      textures,
    },
    texels,
    estimatedWorkUnits: work,
    conservativePixelAllocationBytes: bytes,
  };
}
export function admitPortableMaterialSpecV3(input: unknown): PortableMaterialAdmissionV3 {
  try {
    return admitMaterial(input);
  } catch (error) {
    if (error instanceof PortableMaterialV3Error) throw error;
    throw new PortableMaterialV3Error(
      error instanceof ProceduralTextureError ? error.message : 'Invalid bounded material data.',
    );
  }
}
export function canonicalizePortableMaterialSpecV3(
  input: unknown,
): CanonicalPortableMaterialSpecV3 {
  return admitPortableMaterialSpecV3(input).spec;
}
