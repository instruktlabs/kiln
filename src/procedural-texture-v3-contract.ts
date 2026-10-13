/** Bounded JSON and identity contract; no pixel allocations or Three.js dependency. */
import {
  canonicalizeProceduralTextureSpecV2,
  type CanonicalProceduralTextureSpecV2,
  type ProceduralTextureSpecV2,
  ProceduralTextureError,
  sha256Hex,
} from './procedural-material-v2';
import { TEXTURE_USAGES, type TextureUsage } from './texture-contract';

export const PROCEDURAL_TEXTURE_V3_COMPILER_ID = 'kiln.procedural-rgba.v3.1' as const;
export const PROCEDURAL_TEXTURE_SPEC_VERSION_V3 = 3 as const;
export const MAX_PROCEDURAL_V3_EDGE = 1024;
export const MAX_PROCEDURAL_V3_TEXELS = 1_048_576;
export const MAX_PROCEDURAL_V3_OPERATIONS = 64;
export const MAX_PROCEDURAL_V3_VERTICES = 64;
export const MAX_PROCEDURAL_V3_STAMPS = 256;
export const MAX_PROCEDURAL_V3_PALETTE = 32;
export const MAX_PROCEDURAL_V3_WORK = 64_000_000;
export const MAX_PROCEDURAL_V3_TRANSIENT_BYTES = 64 * 1024 * 1024;

export type RgbaV3 = [number, number, number, number];
export type PixelPointV3 = [number, number];
export interface PixelRectangleV3 {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ProceduralShapeV3 =
  | (PixelRectangleV3 & { kind: 'rectangle' })
  | (PixelRectangleV3 & { kind: 'ellipse' })
  | { kind: 'polygon'; points: PixelPointV3[] }
  | { kind: 'line'; from: PixelPointV3; to: PixelPointV3; width: number };
export type ProceduralOperationV3 =
  | { op: 'paint'; shape: ProceduralShapeV3; rgba: RgbaV3; opacity?: number }
  | { op: 'mask'; shape: ProceduralShapeV3; alpha?: number; invert?: boolean }
  | {
      op: 'stamps';
      shape: ProceduralShapeV3;
      rgba: RgbaV3;
      opacity?: number;
      count: number;
      seed: number;
      area: PixelRectangleV3;
      periodic?: boolean;
    }
  | { op: 'legacy-v2'; spec: ProceduralTextureSpecV2; alpha?: number; opacity?: number };
export interface ProceduralTextureSpecV3 {
  schemaVersion: 3;
  width: number;
  height: number;
  usage?: TextureUsage;
  name?: string;
  background?: RgbaV3;
  operations: ProceduralOperationV3[];
  palette?: { colors: number[]; dither?: 'none' | 'bayer4' };
}
export type CanonicalProceduralOperationV3 =
  | { op: 'paint'; shape: ProceduralShapeV3; rgba: RgbaV3; opacity: number }
  | { op: 'mask'; shape: ProceduralShapeV3; alpha: number; invert: boolean }
  | {
      op: 'stamps';
      shape: ProceduralShapeV3;
      rgba: RgbaV3;
      opacity: number;
      count: number;
      seed: number;
      area: PixelRectangleV3;
      periodic: boolean;
    }
  | { op: 'legacy-v2'; spec: CanonicalProceduralTextureSpecV2; alpha: number; opacity: number };
export interface CanonicalProceduralTextureSpecV3 {
  schemaVersion: 3;
  width: number;
  height: number;
  usage: TextureUsage;
  name?: string;
  background: RgbaV3;
  operations: CanonicalProceduralOperationV3[];
  palette?: { colors: number[]; dither: 'none' | 'bayer4' };
}

function fail(message: string): never {
  throw new ProceduralTextureError(
    `proceduralTexture V3: ${message}`,
    'PROCEDURAL_TEXTURE_V3_CONTRACT',
  );
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

/** Inspect data descriptors before reading values, including array elements. */
function assertProceduralJsonV3(input: unknown): void {
  let nodes = 0;
  const visit = (value: unknown, path: string, depth: number): void => {
    if (++nodes > 16_384 || depth > 10) fail(`${path} exceeds the JSON size/depth budget.`);
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (value.length > 4096) fail(`${path} string is too long.`);
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(`${path} must be finite.`);
      return;
    }
    if (typeof value !== 'object') fail(`${path} must contain only JSON data.`);
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      fail(`${path} must be a plain JSON ${array ? 'array' : 'object'}.`);
    // Reject oversized arrays before enumerating or copying element descriptors.
    const length = array
      ? (Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown)
      : undefined;
    if (array && (typeof length !== 'number' || length > 1024)) fail(`${path} array is too long.`);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1024) fail(`${path} has too many fields.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of keys) {
      if (typeof key !== 'string' || forbidden.has(key)) fail(`${path} has a forbidden key.`);
      if (array && key === 'length') continue;
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor))
        fail(`${path}.${key} must be an enumerable JSON data field, never an accessor.`);
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (length as number)))
        fail(`${path} has an invalid array key.`);
    }
    if (array && keys.length !== (length as number) + 1)
      fail(`${path} must be a dense JSON array.`);
    for (const key of keys)
      if (key !== 'length' || !array)
        visit(descriptors[key as string]!.value as unknown, `${path}.${String(key)}`, depth + 1);
  };
  visit(input, 'recipe', 0);
}

function record(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${path} must be a JSON object.`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!allowed.includes(key)) fail(`${path} has unknown field ${key}.`);
  return result;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  path: string,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    fail(`${path} must be an integer ${min}..${max}.`);
  return value === 0 ? 0 : value;
}
function boolean(value: unknown, path: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`${path} must be boolean.`);
  return value;
}
function tuple(value: unknown, length: number, path: string, min: number, max: number): number[] {
  if (!Array.isArray(value) || value.length !== length)
    fail(`${path} must be a ${length}-element array.`);
  return value.map((v: unknown, i: number) => integer(v, min, max, `${path}[${i}]`));
}
function rgba(value: unknown, path: string): RgbaV3 {
  const c = tuple(value, 4, path, 0, 255) as RgbaV3;
  return c[3] === 0 ? [0, 0, 0, 0] : c;
}
function rectangle(value: unknown, path: string, kind?: 'rectangle' | 'ellipse'): PixelRectangleV3 {
  const r = record(value, ['x', 'y', 'width', 'height', ...(kind ? ['kind'] : [])], path);
  return {
    x: integer(r['x'], -4096, 4096, `${path}.x`),
    y: integer(r['y'], -4096, 4096, `${path}.y`),
    width: integer(r['width'], 1, 2048, `${path}.width`),
    height: integer(r['height'], 1, 2048, `${path}.height`),
  };
}
function shape(value: unknown, path: string): ProceduralShapeV3 {
  const r = record(value, ['kind', 'x', 'y', 'width', 'height', 'from', 'to', 'points'], path);
  if (r['kind'] === 'rectangle' || r['kind'] === 'ellipse')
    return { kind: r['kind'], ...rectangle(r, path, r['kind']) };
  if (r['kind'] === 'polygon') {
    record(r, ['kind', 'points'], path);
    const points = r['points'];
    if (!Array.isArray(points) || points.length < 3 || points.length > MAX_PROCEDURAL_V3_VERTICES)
      fail(`${path}.points requires 3..${MAX_PROCEDURAL_V3_VERTICES} vertices.`);
    return {
      kind: 'polygon',
      points: points.map(
        (p: unknown, i: number) => tuple(p, 2, `${path}.points[${i}]`, -4096, 4096) as PixelPointV3,
      ),
    };
  }
  if (r['kind'] === 'line') {
    record(r, ['kind', 'from', 'to', 'width'], path);
    return {
      kind: 'line',
      from: tuple(r['from'], 2, `${path}.from`, -4096, 4096) as PixelPointV3,
      to: tuple(r['to'], 2, `${path}.to`, -4096, 4096) as PixelPointV3,
      width: integer(r['width'], 1, 2048, `${path}.width`),
    };
  }
  return fail(`${path}.kind must be rectangle, ellipse, polygon or line.`);
}

export function proceduralShapeBoundsV3(s: ProceduralShapeV3): [number, number, number, number] {
  if (s.kind === 'rectangle' || s.kind === 'ellipse')
    return [s.x, s.y, s.x + s.width, s.y + s.height];
  const points = s.kind === 'polygon' ? s.points : [s.from, s.to];
  const radius = s.kind === 'line' ? s.width / 2 : 0;
  return [
    Math.min(...points.map((p) => p[0])) - radius,
    Math.min(...points.map((p) => p[1])) - radius,
    Math.max(...points.map((p) => p[0])) + radius,
    Math.max(...points.map((p) => p[1])) + radius,
  ];
}
export function proceduralShapeCostV3(s: ProceduralShapeV3): number {
  return s.kind === 'polygon'
    ? s.points.length + 1
    : s.kind === 'line'
      ? 4
      : s.kind === 'ellipse'
        ? 3
        : 1;
}
export function proceduralClippedBoundsV3(
  s: ProceduralShapeV3,
  width: number,
  height: number,
  dx = 0,
  dy = 0,
): [number, number, number, number] {
  const [x0, y0, x1, y1] = proceduralShapeBoundsV3(s);
  return [
    Math.max(0, Math.ceil(x0 + dx - 0.5)),
    Math.max(0, Math.ceil(y0 + dy - 0.5)),
    Math.min(width, Math.floor(x1 + dx - 0.5) + 1),
    Math.min(height, Math.floor(y1 + dy - 0.5) + 1),
  ];
}

/** Internal composition admission; byte accounting is total RGBA allocations, not live peak/RSS. */
export interface ProceduralTextureAdmissionV3 {
  spec: CanonicalProceduralTextureSpecV3;
  canonicalJson: string;
  estimatedWorkUnits: number;
  conservativePixelAllocationBytes: number;
}

/** Owns the single validation/accounting pass shared by standalone and atlas compilation. */
export function admitProceduralTextureSpecV3(input: unknown): ProceduralTextureAdmissionV3 {
  assertProceduralJsonV3(input);
  const r = record(
    input,
    ['schemaVersion', 'width', 'height', 'usage', 'name', 'background', 'operations', 'palette'],
    'recipe',
  );
  if (r['schemaVersion'] !== 3) fail('schemaVersion must be 3.');
  const width = integer(r['width'], 4, MAX_PROCEDURAL_V3_EDGE, 'width');
  const height = integer(r['height'], 4, MAX_PROCEDURAL_V3_EDGE, 'height');
  const texels = width * height;
  if (texels > MAX_PROCEDURAL_V3_TEXELS) fail('output texel budget exceeded.');
  const usage = r['usage'] === undefined ? 'albedo' : r['usage'];
  if (!(TEXTURE_USAGES as readonly unknown[]).includes(usage))
    fail('usage must be a known texture usage.');
  const colorUsage = usage === 'albedo' || usage === 'emissive';
  const name = r['name'];
  if (
    name !== undefined &&
    (typeof name !== 'string' ||
      !name.length ||
      name.length > 80 ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
  )
    fail('name must be 1..80 visible characters.');
  const rawOps = r['operations'];
  if (!Array.isArray(rawOps) || rawOps.length > MAX_PROCEDURAL_V3_OPERATIONS)
    fail(`operations must be an array with at most ${MAX_PROCEDURAL_V3_OPERATIONS} entries.`);
  let work = texels;
  let expanded = 0;
  let legacyTransientBytes = 0;
  const operations: CanonicalProceduralOperationV3[] = rawOps.map((value: unknown, i: number) => {
    const path = `operations[${i}]`;
    const op = record(
      value,
      [
        'op',
        'shape',
        'rgba',
        'opacity',
        'alpha',
        'invert',
        'spec',
        'count',
        'seed',
        'area',
        'periodic',
      ],
      path,
    );
    if (op['op'] === 'legacy-v2') {
      record(op, ['op', 'spec', 'alpha', 'opacity'], path);
      const legacyRecord = record(
        op['spec'],
        ['schemaVersion', 'size', 'usage', 'name', 'layers'],
        `${path}.spec`,
      );
      if (legacyRecord['schemaVersion'] !== 2)
        fail(`${path}.spec requires explicit schemaVersion 2.`);
      const spec = canonicalizeProceduralTextureSpecV2(legacyRecord);
      if (spec.size !== width || spec.size !== height || spec.usage !== usage)
        fail(`${path} legacy-v2 dimensions and usage must match the V3 surface.`);
      work +=
        texels *
        (1 +
          spec.layers.reduce(
            (cost, layer) => cost + (layer.op === 'noise' ? layer.octaves * 16 : 4),
            0,
          ));
      // Count every legacy result conservatively, even if GC retains prior buffers.
      legacyTransientBytes += texels * 4;
      return {
        op: 'legacy-v2',
        spec,
        alpha: integer(op['alpha'], 0, 255, `${path}.alpha`, 255),
        opacity: integer(op['opacity'], 0, 255, `${path}.opacity`, 255),
      };
    }
    const s = shape(op['shape'], `${path}.shape`);
    const cost = proceduralShapeCostV3(s);
    const [x0, y0, x1, y1] = proceduralClippedBoundsV3(s, width, height);
    const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    if (op['op'] === 'mask') {
      record(op, ['op', 'shape', 'alpha', 'invert'], path);
      work += texels + area * cost;
      return {
        op: 'mask',
        shape: s,
        alpha: integer(op['alpha'], 0, 255, `${path}.alpha`, 255),
        invert: boolean(op['invert'], `${path}.invert`),
      };
    }
    if (op['op'] !== 'paint' && op['op'] !== 'stamps')
      return fail(`${path}.op must be paint, mask, stamps or legacy-v2.`);
    const paint = {
      shape: s,
      rgba: rgba(op['rgba'], `${path}.rgba`),
      opacity: integer(op['opacity'], 0, 255, `${path}.opacity`, 255),
    };
    if (op['op'] === 'paint') {
      record(op, ['op', 'shape', 'rgba', 'opacity'], path);
      work += area * (cost + 1);
      return { op: 'paint', ...paint };
    }
    record(op, ['op', 'shape', 'rgba', 'opacity', 'count', 'seed', 'area', 'periodic'], path);
    if (!colorUsage) fail('stamps are supported only for color usages albedo and emissive.');
    const count = integer(op['count'], 1, MAX_PROCEDURAL_V3_STAMPS, `${path}.count`);
    const periodic = boolean(op['periodic'], `${path}.periodic`);
    const [bx0, by0, bx1, by1] = proceduralShapeBoundsV3(s);
    if (periodic && (bx1 - bx0 > width || by1 - by0 > height))
      fail(`${path} periodic shape bounds must fit one surface period.`);
    expanded += count * (periodic ? 9 : 1);
    if (expanded > MAX_PROCEDURAL_V3_STAMPS)
      fail(`expanded stamps budget exceeds ${MAX_PROCEDURAL_V3_STAMPS}.`);
    // Conservative per-copy bounds, independent of generated positions.
    work +=
      count *
      (periodic ? 9 : 1) *
      Math.min(width, Math.ceil(bx1 - bx0) + 1) *
      Math.min(height, Math.ceil(by1 - by0) + 1) *
      (cost + 1);
    return {
      op: 'stamps',
      ...paint,
      count,
      seed: integer(op['seed'], 0, 0xffffffff, `${path}.seed`),
      area: rectangle(op['area'], `${path}.area`),
      periodic,
    };
  });
  let palette: CanonicalProceduralTextureSpecV3['palette'];
  if (r['palette'] !== undefined) {
    if (!colorUsage)
      fail('palette and dither are supported only for color usages albedo and emissive.');
    const p = record(r['palette'], ['colors', 'dither'], 'palette');
    const colors = p['colors'];
    if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_PROCEDURAL_V3_PALETTE)
      fail(`palette.colors requires 1..${MAX_PROCEDURAL_V3_PALETTE} entries.`);
    const dither = p['dither'] === undefined ? 'none' : p['dither'];
    if (dither !== 'none' && dither !== 'bayer4') fail('palette.dither must be none or bayer4.');
    palette = {
      colors: colors.map((c: unknown, i: number) =>
        integer(c, 0, 0xffffff, `palette.colors[${i}]`),
      ),
      dither,
    };
    work += texels * (colors.length + 1);
  }
  if (work > MAX_PROCEDURAL_V3_WORK)
    fail(`estimated work budget ${work} exceeds ${MAX_PROCEDURAL_V3_WORK}.`);
  if (texels * 4 + legacyTransientBytes > MAX_PROCEDURAL_V3_TRANSIENT_BYTES)
    fail('transient allocation budget exceeded.');
  const result: CanonicalProceduralTextureSpecV3 = {
    schemaVersion: 3,
    width,
    height,
    usage: usage as TextureUsage,
    ...(name !== undefined ? { name: name as string } : {}),
    background: r['background'] === undefined ? [0, 0, 0, 0] : rgba(r['background'], 'background'),
    operations,
    ...(palette ? { palette } : {}),
  };
  const canonicalJson = JSON.stringify(result);
  if (canonicalJson.length > 262_144) fail('canonical JSON byte budget exceeded.');
  return {
    spec: result,
    canonicalJson,
    estimatedWorkUnits: work,
    conservativePixelAllocationBytes: texels * 4 + legacyTransientBytes,
  };
}

export function canonicalizeProceduralTextureSpecV3(
  input: unknown,
): CanonicalProceduralTextureSpecV3 {
  return admitProceduralTextureSpecV3(input).spec;
}

export function canonicalProceduralTextureJsonV3(input: unknown): string {
  return admitProceduralTextureSpecV3(input).canonicalJson;
}
export function hashProceduralTextureSpecV3(input: unknown): `sha256:${string}` {
  return `sha256:${sha256Hex(`${PROCEDURAL_TEXTURE_V3_COMPILER_ID}\n${canonicalProceduralTextureJsonV3(input)}`)}`;
}
