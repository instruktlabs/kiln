/**
 * Strict, browser-safe contracts for model-authored portable materials.
 *
 * These functions accept `unknown` on purpose. Generated programs are an
 * untrusted JSON-shaped boundary even when TypeScript declarations say the
 * input is well formed. Canonicalization rejects executable references,
 * inherited state, unknown fields, and work outside the fixed budgets before
 * the pixel compiler allocates an output buffer.
 */

import { TEXTURE_USAGES, type TextureUsage } from './texture-contract';
import {
  AuthoringDiagnosticError,
  type AuthoringDiagnostic,
} from './evaluator/authoring-diagnostic';

export const PROCEDURAL_TEXTURE_SPEC_VERSION = 2 as const;
export const PORTABLE_MATERIAL_SPEC_VERSION = 2 as const;

export const MAX_PROCEDURAL_SIZE = 1024;
export const MIN_PROCEDURAL_SIZE = 4;
export const MAX_PROCEDURAL_LAYERS = 8;
export const MAX_NOISE_OCTAVES = 6;
export const MAX_PROCEDURAL_NAME_LENGTH = 80;
export const MAX_PROCEDURAL_PATTERN_COUNT = 256;
export const MAX_PORTABLE_MATERIAL_TEXTURES = 5;
/** Four 1024-square maps, or a larger number of smaller maps. */
export const MAX_PORTABLE_MATERIAL_TEXELS = 4 * 1024 * 1024;

export type ProceduralBlend = 'normal' | 'multiply' | 'screen' | 'overlay';

interface LayerCommon {
  blend?: ProceduralBlend;
  opacity?: number;
}

export type ProceduralLayer = LayerCommon &
  (
    | { op: 'solid'; color: number }
    | { op: 'checker'; colorA: number; colorB: number; squares?: number }
    | { op: 'stripes'; colorA: number; colorB: number; count?: number; angleDeg?: number }
    | { op: 'gradient'; from: number; to: number; angleDeg?: number }
    | {
        op: 'bricks';
        brick: number;
        mortar: number;
        rows?: number;
        cols?: number;
        mortarWidth?: number;
        stagger?: number;
      }
    | {
        op: 'noise';
        colorA: number;
        colorB: number;
        scale?: number;
        octaves?: number;
        seed?: number;
      }
  );

/** Historical source shape. Absence of schemaVersion means V1. */
export interface ProceduralTextureSpecV1 {
  schemaVersion?: 1;
  size?: number;
  usage?: TextureUsage;
  name?: string;
  layers: ProceduralLayer[];
}

/** Current source shape. Validation still happens at runtime. */
export interface ProceduralTextureSpecV2 {
  schemaVersion: 2;
  size?: number;
  usage?: TextureUsage;
  name?: string;
  layers: ProceduralLayer[];
}

/** Compatibility name retained for existing generated programs. */
export type ProceduralTextureSpec = ProceduralTextureSpecV1 | ProceduralTextureSpecV2;

interface CanonicalLayerCommon {
  blend: ProceduralBlend;
  opacity: number;
}

export type CanonicalProceduralLayerV2 = CanonicalLayerCommon &
  (
    | { op: 'solid'; color: number }
    | { op: 'checker'; colorA: number; colorB: number; squares: number }
    | { op: 'stripes'; colorA: number; colorB: number; count: number; angleDeg: number }
    | { op: 'gradient'; from: number; to: number; angleDeg: number }
    | {
        op: 'bricks';
        brick: number;
        mortar: number;
        rows: number;
        cols: number;
        mortarWidth: number;
        stagger: number;
      }
    | {
        op: 'noise';
        colorA: number;
        colorB: number;
        scale: number;
        octaves: number;
        seed: number;
      }
  );

export interface CanonicalProceduralTextureSpecV2 {
  schemaVersion: 2;
  size: number;
  usage: TextureUsage;
  name?: string;
  layers: CanonicalProceduralLayerV2[];
}

export type PortableTextureRefV2 =
  | { kind: 'procedural'; spec: ProceduralTextureSpecV2 }
  | { kind: 'resource'; resourceId: string };

export interface PortableMaterialSpecV2 {
  schemaVersion: 2;
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
  textures?: {
    baseColor?: PortableTextureRefV2;
    normal?: PortableTextureRefV2;
    metallicRoughness?: PortableTextureRefV2;
    emissive?: PortableTextureRefV2;
    occlusion?: PortableTextureRefV2;
  };
}

export type CanonicalPortableTextureRefV2 =
  | { kind: 'procedural'; spec: CanonicalProceduralTextureSpecV2 }
  | { kind: 'resource'; resourceId: string };

export interface CanonicalPortableMaterialSpecV2 {
  schemaVersion: 2;
  model: 'pbrMetallicRoughness';
  name?: string;
  baseColor?: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity: number;
  alphaMode: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number;
  doubleSided: boolean;
  textures: {
    baseColor?: CanonicalPortableTextureRefV2;
    normal?: CanonicalPortableTextureRefV2;
    metallicRoughness?: CanonicalPortableTextureRefV2;
    emissive?: CanonicalPortableTextureRefV2;
    occlusion?: CanonicalPortableTextureRefV2;
  };
}

export class ProceduralTextureError extends AuthoringDiagnosticError {
  constructor(message: string, diagnostic?: AuthoringDiagnostic) {
    super(diagnostic, message);
    this.name = 'ProceduralTextureError';
  }
}

const OPS = ['solid', 'checker', 'stripes', 'gradient', 'bricks', 'noise'] as const;
const BLENDS: readonly ProceduralBlend[] = ['normal', 'multiply', 'screen', 'overlay'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function strictRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProceduralTextureError(`${path} must be a plain JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ProceduralTextureError(
      `${path} must be a plain JSON object with no custom prototype.`,
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new ProceduralTextureError(`${path} must not contain symbol keys.`);
    }
    if (FORBIDDEN_KEYS.has(key)) {
      throw new ProceduralTextureError(`${path} contains forbidden key ${JSON.stringify(key)}.`);
    }
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw new ProceduralTextureError(`${path}.${key} must be an enumerable JSON field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new ProceduralTextureError(`${path}.${key} must be a plain JSON data field.`);
    }
  }
  return value as Record<string, unknown>;
}

function strictArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ProceduralTextureError(`${path} must be a plain JSON array.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new ProceduralTextureError(`${path} must not contain symbol keys.`);
    }
    if (key === 'length') continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
      throw new ProceduralTextureError(
        `${path} has non-index JSON array key ${JSON.stringify(key)}.`,
      );
    }
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw new ProceduralTextureError(
        `${path} must be a dense JSON array (missing index ${index}).`,
      );
    }
  }
  return value;
}

function assertKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allow = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allow.has(key)) {
      throw new ProceduralTextureError(
        `${path} has unknown key ${JSON.stringify(key)}.`,
        'PROCEDURAL_TEXTURE_UNKNOWN_KEY',
      );
    }
  }
}

function color(value: unknown, path: string, diagnostic?: AuthoringDiagnostic): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new ProceduralTextureError(
      `${path} must be a color integer between 0x000000 and 0xffffff, got ${JSON.stringify(value)}.`,
      diagnostic,
    );
  }
  return value;
}

function integer(value: unknown, path: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ProceduralTextureError(
      `${path} must be a whole number between ${min} and ${max}, got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function finite(
  value: unknown,
  path: string,
  fallback: number,
  min: number,
  max: number,
  diagnostic?: AuthoringDiagnostic,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ProceduralTextureError(
      `${path} must be a finite number between ${min} and ${max}, got ${JSON.stringify(value)}.`,
      diagnostic,
    );
  }
  return value;
}

function unit(value: unknown, path: string, fallback: number): number {
  return finite(value, path, fallback, 0, 1, 'MATERIAL_FRACTION_RANGE');
}

function optionalName(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const hasControlCharacter =
    typeof value === 'string' &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PROCEDURAL_NAME_LENGTH ||
    hasControlCharacter
  ) {
    throw new ProceduralTextureError(
      `${path} must be 1..${MAX_PROCEDURAL_NAME_LENGTH} visible characters.`,
    );
  }
  return value;
}

function usage(value: unknown, path: string, fallback: TextureUsage): TextureUsage {
  if (value === undefined) return fallback;
  if (!(TEXTURE_USAGES as readonly unknown[]).includes(value)) {
    throw new ProceduralTextureError(
      `${path} must be one of ${TEXTURE_USAGES.join(', ')}, got ${JSON.stringify(value)}.`,
    );
  }
  return value as TextureUsage;
}

function angle(value: unknown, path: string): number {
  const bounded = finite(value, path, 0, -36_000, 36_000);
  const normalized = ((bounded % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function blend(record: Record<string, unknown>, path: string): ProceduralBlend {
  const value = record['blend'] ?? 'normal';
  if (!BLENDS.includes(value as ProceduralBlend)) {
    throw new ProceduralTextureError(
      `${path}.blend ${JSON.stringify(value)} is not one of ${BLENDS.join(', ')}.`,
      'PROCEDURAL_TEXTURE_BLEND',
    );
  }
  return value as ProceduralBlend;
}

function canonicalLayer(value: unknown, index: number): CanonicalProceduralLayerV2 {
  const path = `proceduralTexture.layers[${index}]`;
  const record = strictRecord(value, path);
  const op = record['op'];
  if (!(OPS as readonly unknown[]).includes(op)) {
    throw new ProceduralTextureError(
      `${path}.op ${JSON.stringify(op)} is not one of ${OPS.join(', ')}.`,
    );
  }
  const validatedBlend = blend(record, path);
  const validatedOpacity = unit(record['opacity'], `${path}.opacity`, 1);
  // The base layer has nothing beneath it. Normalize its ignored compositing
  // controls so semantically identical recipes cannot receive different hashes.
  const common = {
    blend: index === 0 ? ('normal' as const) : validatedBlend,
    opacity: index === 0 ? 1 : validatedOpacity,
  };
  switch (op) {
    case 'solid':
      assertKeys(record, ['op', 'color', 'blend', 'opacity'], path);
      return { op, color: color(record['color'], `${path}.color`), ...common };
    case 'checker':
      assertKeys(record, ['op', 'colorA', 'colorB', 'squares', 'blend', 'opacity'], path);
      return {
        op,
        colorA: color(record['colorA'], `${path}.colorA`),
        colorB: color(record['colorB'], `${path}.colorB`),
        squares: integer(record['squares'], `${path}.squares`, 8, 1, MAX_PROCEDURAL_PATTERN_COUNT),
        ...common,
      };
    case 'stripes':
      assertKeys(record, ['op', 'colorA', 'colorB', 'count', 'angleDeg', 'blend', 'opacity'], path);
      return {
        op,
        colorA: color(record['colorA'], `${path}.colorA`),
        colorB: color(record['colorB'], `${path}.colorB`),
        count: integer(record['count'], `${path}.count`, 8, 1, MAX_PROCEDURAL_PATTERN_COUNT),
        angleDeg: angle(record['angleDeg'], `${path}.angleDeg`),
        ...common,
      };
    case 'gradient':
      assertKeys(record, ['op', 'from', 'to', 'angleDeg', 'blend', 'opacity'], path);
      return {
        op,
        from: color(record['from'], `${path}.from`),
        to: color(record['to'], `${path}.to`),
        angleDeg: angle(record['angleDeg'], `${path}.angleDeg`),
        ...common,
      };
    case 'bricks':
      assertKeys(
        record,
        ['op', 'brick', 'mortar', 'rows', 'cols', 'mortarWidth', 'stagger', 'blend', 'opacity'],
        path,
      );
      return {
        op,
        brick: color(record['brick'], `${path}.brick`),
        mortar: color(record['mortar'], `${path}.mortar`),
        rows: integer(record['rows'], `${path}.rows`, 8, 1, MAX_PROCEDURAL_PATTERN_COUNT),
        cols: integer(record['cols'], `${path}.cols`, 4, 1, MAX_PROCEDURAL_PATTERN_COUNT),
        mortarWidth: unit(record['mortarWidth'], `${path}.mortarWidth`, 0.06),
        stagger: unit(record['stagger'], `${path}.stagger`, 0.5),
        ...common,
      };
    case 'noise':
      assertKeys(
        record,
        ['op', 'colorA', 'colorB', 'scale', 'octaves', 'seed', 'blend', 'opacity'],
        path,
      );
      return {
        op,
        colorA: color(record['colorA'], `${path}.colorA`),
        colorB: color(record['colorB'], `${path}.colorB`),
        scale: integer(record['scale'], `${path}.scale`, 8, 1, MAX_PROCEDURAL_PATTERN_COUNT),
        octaves: integer(record['octaves'], `${path}.octaves`, 3, 1, MAX_NOISE_OCTAVES),
        seed: integer(record['seed'], `${path}.seed`, 0, -0x80000000, 0x7fffffff),
        ...common,
      };
    default:
      throw new ProceduralTextureError(`${path}.op is unsupported.`);
  }
}

export function migrateProceduralTextureSpecV1(input: unknown): ProceduralTextureSpecV2 {
  const record = strictRecord(input, 'proceduralTexture');
  assertKeys(record, ['schemaVersion', 'size', 'usage', 'name', 'layers'], 'proceduralTexture');
  if (record['schemaVersion'] !== undefined && record['schemaVersion'] !== 1) {
    throw new ProceduralTextureError(
      `proceduralTexture.schemaVersion must be 1 or absent for V1 migration, got ${JSON.stringify(record['schemaVersion'])}.`,
    );
  }
  return {
    schemaVersion: 2,
    ...(record['size'] !== undefined ? { size: record['size'] as number } : {}),
    ...(record['usage'] !== undefined ? { usage: record['usage'] as TextureUsage } : {}),
    ...(record['name'] !== undefined ? { name: record['name'] as string } : {}),
    layers: record['layers'] as ProceduralLayer[],
  };
}

export function canonicalizeProceduralTextureSpecV2(
  input: unknown,
): CanonicalProceduralTextureSpecV2 {
  const initial = strictRecord(input, 'proceduralTexture');
  const source =
    initial['schemaVersion'] === undefined || initial['schemaVersion'] === 1
      ? strictRecord(migrateProceduralTextureSpecV1(initial), 'proceduralTexture')
      : initial;
  assertKeys(source, ['schemaVersion', 'size', 'usage', 'name', 'layers'], 'proceduralTexture');
  if (source['schemaVersion'] !== 2) {
    throw new ProceduralTextureError(
      `proceduralTexture.schemaVersion must be 2, got ${JSON.stringify(source['schemaVersion'])}.`,
    );
  }
  const size = source['size'] ?? 256;
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < MIN_PROCEDURAL_SIZE ||
    size > MAX_PROCEDURAL_SIZE ||
    (size & (size - 1)) !== 0
  ) {
    throw new ProceduralTextureError(
      `proceduralTexture.size must be a power of two between ${MIN_PROCEDURAL_SIZE} and ${MAX_PROCEDURAL_SIZE}, got ${JSON.stringify(source['size'])}.`,
    );
  }
  const rawLayers = source['layers'];
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
    throw new ProceduralTextureError(
      'proceduralTexture.layers must be a non-empty array — the bottom layer is the base pattern.',
    );
  }
  const layers = strictArray(rawLayers, 'proceduralTexture.layers');
  if (layers.length > MAX_PROCEDURAL_LAYERS) {
    throw new ProceduralTextureError(
      `proceduralTexture: ${layers.length} layers exceeds the maximum of ${MAX_PROCEDURAL_LAYERS}.`,
    );
  }
  const name = optionalName(source['name'], 'proceduralTexture.name');
  return {
    schemaVersion: 2,
    size,
    usage: usage(source['usage'], 'proceduralTexture.usage', 'albedo'),
    ...(name !== undefined ? { name } : {}),
    layers: layers.map(canonicalLayer),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function canonicalProceduralTextureJsonV2(input: unknown): string {
  return canonicalJson(canonicalizeProceduralTextureSpecV2(input));
}

// Browser-safe synchronous SHA-256. Keeping this local avoids a module-load
// `node:crypto` edge in the primitives graph while still giving synchronous
// generated code a stable recipe identity.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

function sha256Hex(text: string): string {
  const source = new TextEncoder().encode(text);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temp1 = (hh! + s1 + choice + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (s0 + majority) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    const next = [a!, b!, c!, d!, e!, f!, g!, hh!];
    for (let i = 0; i < 8; i++) h[i] = (h[i]! + next[i]!) >>> 0;
  }
  return [...h].map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function hashProceduralTextureSpecV2(input: unknown): `sha256:${string}` {
  return `sha256:${sha256Hex(canonicalProceduralTextureJsonV2(input))}`;
}

const MATERIAL_TEXTURE_USAGE = {
  baseColor: 'albedo',
  normal: 'normal',
  metallicRoughness: 'metallicRoughness',
  emissive: 'emissive',
  occlusion: 'occlusion',
} as const satisfies Record<string, TextureUsage>;

function canonicalTextureRef(
  value: unknown,
  slot: keyof typeof MATERIAL_TEXTURE_USAGE,
): CanonicalPortableTextureRefV2 {
  const path = `portableMaterial.textures.${slot}`;
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ProceduralTextureError(
      `${path} must be a typed resource or procedural reference.`,
      'PORTABLE_TEXTURE_REFERENCE',
    );
  const record = strictRecord(value, path);
  if (record['kind'] === 'procedural') {
    assertKeys(record, ['kind', 'spec'], path);
    const spec = canonicalizeProceduralTextureSpecV2(record['spec']);
    const expected = MATERIAL_TEXTURE_USAGE[slot];
    if (spec.usage !== expected) {
      throw new ProceduralTextureError(
        `${path} requires procedural usage ${JSON.stringify(expected)}, got ${JSON.stringify(spec.usage)}.`,
      );
    }
    return { kind: 'procedural', spec };
  }
  if (record['kind'] === 'resource') {
    assertKeys(record, ['kind', 'resourceId'], path);
    const resourceId = record['resourceId'];
    if (
      typeof resourceId !== 'string' ||
      resourceId.length > 128 ||
      !/^kiln\.[a-z0-9][a-z0-9._-]+$/.test(resourceId)
    ) {
      throw new ProceduralTextureError(`${path}.resourceId must be a bounded kiln.* resource ID.`);
    }
    return { kind: 'resource', resourceId };
  }
  throw new ProceduralTextureError(
    `${path}.kind must be "procedural" or "resource".`,
    'PORTABLE_TEXTURE_REFERENCE',
  );
}

export function canonicalizePortableMaterialSpecV2(
  input: unknown,
): CanonicalPortableMaterialSpecV2 {
  const record = strictRecord(input, 'portableMaterial');
  assertKeys(
    record,
    [
      'schemaVersion',
      'model',
      'name',
      'baseColor',
      'roughness',
      'metalness',
      'emissive',
      'emissiveIntensity',
      'alphaMode',
      'alphaCutoff',
      'doubleSided',
      'textures',
    ],
    'portableMaterial',
  );
  if (record['schemaVersion'] !== 2) {
    throw new ProceduralTextureError('portableMaterial.schemaVersion must be 2.');
  }
  if (record['model'] !== 'pbrMetallicRoughness') {
    throw new ProceduralTextureError(
      'portableMaterial.model must be "pbrMetallicRoughness"; executable shader models are not portable.',
    );
  }
  const textureInput = record['textures'] ?? {};
  const textureRecord = strictRecord(textureInput, 'portableMaterial.textures');
  const slots = Object.keys(MATERIAL_TEXTURE_USAGE) as Array<keyof typeof MATERIAL_TEXTURE_USAGE>;
  assertKeys(textureRecord, slots, 'portableMaterial.textures');
  if (Object.keys(textureRecord).length > MAX_PORTABLE_MATERIAL_TEXTURES) {
    throw new ProceduralTextureError(
      `portableMaterial has more than ${MAX_PORTABLE_MATERIAL_TEXTURES} texture slots.`,
    );
  }
  const textures: CanonicalPortableMaterialSpecV2['textures'] = {};
  let proceduralTexels = 0;
  for (const slot of slots) {
    if (textureRecord[slot] === undefined) continue;
    const ref = canonicalTextureRef(textureRecord[slot], slot);
    textures[slot] = ref;
    if (ref.kind === 'procedural') proceduralTexels += ref.spec.size * ref.spec.size;
  }
  if (proceduralTexels > MAX_PORTABLE_MATERIAL_TEXELS) {
    throw new ProceduralTextureError(
      `portableMaterial procedural texture budget is ${proceduralTexels} texels, above ${MAX_PORTABLE_MATERIAL_TEXELS}.`,
    );
  }
  const alphaMode = record['alphaMode'] ?? 'opaque';
  if (alphaMode !== 'opaque' && alphaMode !== 'mask' && alphaMode !== 'blend') {
    throw new ProceduralTextureError(
      'portableMaterial.alphaMode must be opaque, mask, or blend.',
      'MATERIAL_ALPHA_MODE',
    );
  }
  if (record['doubleSided'] !== undefined && typeof record['doubleSided'] !== 'boolean') {
    throw new ProceduralTextureError('portableMaterial.doubleSided must be boolean.');
  }
  const name = optionalName(record['name'], 'portableMaterial.name');
  return {
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    ...(name !== undefined ? { name } : {}),
    ...(record['baseColor'] !== undefined
      ? {
          baseColor: color(
            record['baseColor'],
            'portableMaterial.baseColor',
            'PORTABLE_COLOR_ARGUMENT',
          ),
        }
      : {}),
    roughness: unit(record['roughness'], 'portableMaterial.roughness', 1),
    metalness: unit(record['metalness'], 'portableMaterial.metalness', 0),
    ...(record['emissive'] !== undefined
      ? {
          emissive: color(
            record['emissive'],
            'portableMaterial.emissive',
            'PORTABLE_COLOR_ARGUMENT',
          ),
        }
      : {}),
    emissiveIntensity: finite(
      record['emissiveIntensity'],
      'portableMaterial.emissiveIntensity',
      1,
      0,
      64,
    ),
    alphaMode,
    alphaCutoff: unit(record['alphaCutoff'], 'portableMaterial.alphaCutoff', 0.5),
    doubleSided: record['doubleSided'] === true,
    textures,
  };
}
