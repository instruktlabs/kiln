/** Browser-safe named pixel regions. Admission never loads or allocates image pixels. */
import {
  canonicalizePortableSamplerV1,
  type CanonicalPortableSamplerV1,
  type PortableSamplerV1,
} from './portable-sampler';
import {
  admitProceduralTextureSpecV3,
  hashProceduralTextureSpecV3,
  type CanonicalProceduralTextureSpecV3,
  type ProceduralTextureSpecV3,
} from './procedural-texture-v3-contract';
import { sha256Hex } from './procedural-material-v2';
import type { MaterialMapPinV1 } from './pinned-material-map';
import type { TextureAtlasManifestV1 } from './texture-atlas-pixels';
import { TEXTURE_USAGES, type TextureUsage } from './texture-contract';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** Compiler id of an atlas without `pack`: its identities are unchanged since v1.1. */
export const TEXTURE_ATLAS_COMPILER_ID = 'kiln.texture-atlas.v1.1' as const;
/** Compiler id of an atlas that sets `pack` (raised limits, packed placement). */
export const TEXTURE_ATLAS_COMPILER_ID_V1_2 = 'kiln.texture-atlas.v1.2' as const;
export const TEXTURE_ATLAS_COMPILER_IDS = Object.freeze([
  TEXTURE_ATLAS_COMPILER_ID,
  TEXTURE_ATLAS_COMPILER_ID_V1_2,
] as const);
export type TextureAtlasCompilerIdV1 = (typeof TEXTURE_ATLAS_COMPILER_IDS)[number];
export const TEXTURE_ATLAS_LIMITS = Object.freeze({
  edge: 1024,
  outputTexels: 1_048_576,
  regions: 64,
  sources: 16,
  sourceTexels: 4_194_304,
  encodedSourceBytes: 8_388_608,
  encodedBytes: 16_777_216,
  jsonBytes: 262_144,
  work: 64_000_000,
  allocatedBytes: 67_108_864,
  uvVertices: 262_144,
  uvAttributeBytes: 134_217_728,
});
/**
 * Limits of a packed (v1.2) atlas. Edge, output texels, sources and regions follow the
 * delivery contract; work and allocation scale with the fourfold output so a full 2048 sheet
 * can compile. Source-side budgets (decoded source texels, encoded bytes) are unchanged.
 */
export const TEXTURE_ATLAS_LIMITS_V1_2 = Object.freeze({
  ...TEXTURE_ATLAS_LIMITS,
  edge: 2048,
  outputTexels: 4_194_304,
  regions: 128,
  sources: 32,
  work: 192_000_000,
  allocatedBytes: 134_217_728,
});
export type TextureAtlasLimitsV1 = typeof TEXTURE_ATLAS_LIMITS | typeof TEXTURE_ATLAS_LIMITS_V1_2;
export const TEXTURE_ATLAS_PACK_EDGES = Object.freeze([1024, 2048] as const);
/** Atlas packing request: regions without `content` are placed by MaxRects. */
export interface TextureAtlasPackV1 {
  edge: 1024 | 2048;
  /** Default gutter of every region in a packed atlas (0..32, default 2). */
  gutter?: number;
  algorithm?: 'maxrects';
}
export interface CanonicalTextureAtlasPackV1 {
  edge: 1024 | 2048;
  gutter: number;
  algorithm: 'maxrects';
}
/** The compiler id a canonical spec compiles under: v1.2 exactly when it sets `pack`. */
export function textureAtlasCompilerIdV1(spec: { pack?: unknown }): TextureAtlasCompilerIdV1 {
  return spec.pack === undefined ? TEXTURE_ATLAS_COMPILER_ID : TEXTURE_ATLAS_COMPILER_ID_V1_2;
}
export function textureAtlasLimitsV1(spec: { pack?: unknown }): TextureAtlasLimitsV1 {
  return spec.pack === undefined ? TEXTURE_ATLAS_LIMITS : TEXTURE_ATLAS_LIMITS_V1_2;
}
export interface AtlasRectangleV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type AtlasEdgeModeV1 = 'copy-edge' | 'mask-rgb-dilate';
export interface AtlasResourceExpectationV1 {
  width?: number;
  height?: number;
  imageSha256?: `sha256:${string}`;
  decodedPixelHash?: `sha256:${string}`;
}
export type TextureAtlasSourceV1 =
  | { kind: 'procedural'; spec: ProceduralTextureSpecV3 }
  | {
      kind: 'resource';
      resourceId: string;
      pin: MaterialMapPinV1;
      expected?: AtlasResourceExpectationV1;
    };
export interface TextureAtlasRegionV1 {
  name: string;
  /** Required unless the atlas sets `pack`; a packed region takes its source's size. */
  content?: AtlasRectangleV1;
  gutter?: number;
  edgeMode?: AtlasEdgeModeV1;
  source: TextureAtlasSourceV1;
  crop?: AtlasRectangleV1;
  /** Resolved-placement marker a canonical packed record carries; never set it by hand. */
  packed?: true;
}
export interface TextureAtlasSpecV1 {
  schemaVersion: 1;
  /** Defaults to `pack.edge` when the atlas packs. */
  width?: number;
  height?: number;
  usage: TextureUsage;
  sampler?: PortableSamplerV1;
  regions: TextureAtlasRegionV1[];
  pack?: TextureAtlasPackV1;
}
export type CanonicalTextureAtlasSourceV1 =
  | { kind: 'procedural'; spec: CanonicalProceduralTextureSpecV3 }
  | Extract<TextureAtlasSourceV1, { kind: 'resource' }>;
export interface CanonicalTextureAtlasRegionV1 {
  name: string;
  content: AtlasRectangleV1;
  gutter: number;
  edgeMode: AtlasEdgeModeV1;
  source: CanonicalTextureAtlasSourceV1;
  crop?: AtlasRectangleV1;
  /** True when the packer placed this region; its content is the resolved placement. */
  packed?: true;
}
export interface CanonicalTextureAtlasSpecV1 {
  schemaVersion: 1;
  width: number;
  height: number;
  usage: TextureUsage;
  sampler: CanonicalPortableSamplerV1;
  regions: CanonicalTextureAtlasRegionV1[];
  pack?: CanonicalTextureAtlasPackV1;
}
export class TextureAtlasError extends AuthoringDiagnosticError {
  constructor(message: string) {
    super('TEXTURE_ATLAS_CONTRACT', `textureAtlas: ${message}`);
    this.name = 'TextureAtlasError';
  }
}
export function atlasFailure(message: string): never {
  throw new TextureAtlasError(message);
}

function preflight(input: unknown): void {
  let nodes = 0;
  let bytes = 0;
  const encoder = new TextEncoder();
  const addBytes = (count: number) => {
    bytes += count;
    if (bytes > TEXTURE_ATLAS_LIMITS.jsonBytes) atlasFailure('JSON byte budget exceeded.');
  };
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 65_536 || depth > 16) atlasFailure('JSON node/depth budget exceeded.');
    if (value === null || typeof value === 'boolean') {
      addBytes(value === false ? 5 : 4);
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) atlasFailure('JSON numbers must be finite.');
      addBytes(JSON.stringify(value).length);
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 4096) atlasFailure('JSON string budget exceeded.');
      addBytes(encoder.encode(JSON.stringify(value)).length);
      return;
    }
    if (typeof value !== 'object') atlasFailure('plain JSON data is required.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== null && proto !== Object.prototype)
      atlasFailure('plain JSON prototypes are required.');
    const length = array ? Object.getOwnPropertyDescriptor(value, 'length')?.value : undefined;
    if (array && (!Number.isSafeInteger(length) || length > 1024))
      atlasFailure('JSON array budget exceeded.');
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1024 || (array && keys.length !== length + 1))
      atlasFailure('dense bounded JSON fields are required.');
    addBytes(2 + Math.max(0, keys.length - (array ? 1 : 0) - 1));
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        atlasFailure('forbidden JSON field.');
      if (key.length > 4096) atlasFailure('JSON field name budget exceeded.');
      if (!array) addBytes(encoder.encode(JSON.stringify(key)).length + 1);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !('value' in descriptor))
        atlasFailure('JSON accessors/hidden fields are unsupported.');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
        atlasFailure('invalid JSON array key.');
      visit(descriptor.value, depth + 1);
    }
  };
  visit(input, 0);
}
function record(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    atlasFailure(`${label} must be a JSON object.`);
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some((k) => !fields.includes(k)))
    atlasFailure(`${label} has an unknown field.`);
  return r;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    atlasFailure(`${label} must be an integer ${min}..${max}.`);
  return value === 0 ? 0 : value;
}
function hash(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    atlasFailure(`${label} must be an exact SHA-256 hash.`);
  return value as `sha256:${string}`;
}
function rect(value: unknown, label: string): AtlasRectangleV1 {
  const r = record(value, ['x', 'y', 'width', 'height'], label);
  return {
    x: integer(r['x'], 0, 4096, `${label}.x`),
    y: integer(r['y'], 0, 4096, `${label}.y`),
    width: integer(r['width'], 1, 4096, `${label}.width`),
    height: integer(r['height'], 1, 4096, `${label}.height`),
  };
}
export function atlasAllocationV1(
  region: Pick<CanonicalTextureAtlasRegionV1, 'content' | 'gutter'>,
): AtlasRectangleV1 {
  const { content: c, gutter: g } = region;
  return { x: c.x - g, y: c.y - g, width: c.width + 2 * g, height: c.height + 2 * g };
}
export function assertAtlasCropV1(
  crop: AtlasRectangleV1,
  content: AtlasRectangleV1,
  width: number,
  height: number,
): void {
  if (crop.x + crop.width > width || crop.y + crop.height > height)
    atlasFailure('source crop is out of bounds.');
  if (crop.width !== content.width || crop.height !== content.height)
    atlasFailure('source crop/content dimensions must match; resampling is unsupported.');
}
export function atlasSourceIdentityV1(source: CanonicalTextureAtlasSourceV1): string {
  return source.kind === 'procedural'
    ? `procedural:${hashProceduralTextureSpecV3(source.spec)}`
    : `resource:${source.pin.resourceId}:${source.pin.revisionId}:${source.resourceId}`;
}
/** Packing order is allocation area descending, then name: deterministic for any input order. */
interface PendingPackV1 {
  region: CanonicalTextureAtlasRegionV1;
  width: number;
  height: number;
}
const rectsOverlap = (a: AtlasRectangleV1, b: AtlasRectangleV1): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const rectContains = (outer: AtlasRectangleV1, inner: AtlasRectangleV1): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
/**
 * MaxRects, best-short-side-fit, no rotation (UV remapping never rotates). Explicit allocations
 * are carved out of the free space first; each packed region then takes the free rectangle
 * with the smallest leftover short side, ties broken by long side, then y, then x. Integer
 * arithmetic only, so the result is identical on every host.
 */
function packAtlasRegionsV1(
  width: number,
  height: number,
  fixed: AtlasRectangleV1[],
  pending: PendingPackV1[],
): void {
  let free: AtlasRectangleV1[] = [{ x: 0, y: 0, width, height }];
  const occupy = (used: AtlasRectangleV1) => {
    const next: AtlasRectangleV1[] = [];
    for (const f of free) {
      if (!rectsOverlap(f, used)) {
        next.push(f);
        continue;
      }
      if (used.x > f.x) next.push({ x: f.x, y: f.y, width: used.x - f.x, height: f.height });
      if (used.x + used.width < f.x + f.width)
        next.push({
          x: used.x + used.width,
          y: f.y,
          width: f.x + f.width - used.x - used.width,
          height: f.height,
        });
      if (used.y > f.y) next.push({ x: f.x, y: f.y, width: f.width, height: used.y - f.y });
      if (used.y + used.height < f.y + f.height)
        next.push({
          x: f.x,
          y: used.y + used.height,
          width: f.width,
          height: f.y + f.height - used.y - used.height,
        });
    }
    // Drop rectangles contained in another; of two identical ones keep the first.
    free = next.filter(
      (a, i) =>
        !next.some((b, j) => j !== i && rectContains(b, a) && (!rectContains(a, b) || j < i)),
    );
    if (free.length > 16_384) atlasFailure('pack: free-space bookkeeping budget exceeded.');
  };
  for (const allocation of fixed) occupy(allocation);
  const order = [...pending].sort(
    (a, b) =>
      b.width * b.height - a.width * a.height ||
      (a.region.name < b.region.name ? -1 : a.region.name > b.region.name ? 1 : 0),
  );
  for (const item of order) {
    let best: AtlasRectangleV1 | undefined;
    let bestScore: [number, number, number, number] | undefined;
    for (const f of free) {
      if (f.width < item.width || f.height < item.height) continue;
      const dw = f.width - item.width,
        dh = f.height - item.height;
      const score: [number, number, number, number] = [
        Math.min(dw, dh),
        Math.max(dw, dh),
        f.y,
        f.x,
      ];
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] &&
          (score[1] < bestScore[1] ||
            (score[1] === bestScore[1] &&
              (score[2] < bestScore[2] || (score[2] === bestScore[2] && score[3] < bestScore[3])))))
      ) {
        best = f;
        bestScore = score;
      }
    }
    if (!best)
      atlasFailure(
        `pack: region ${item.region.name} (${item.width}x${item.height} texels with its gutter) does not fit in the ${width}x${height} atlas beside the regions already placed.`,
      );
    item.region.content = {
      x: best.x + item.region.gutter,
      y: best.y + item.region.gutter,
      width: item.region.content.width,
      height: item.region.content.height,
    };
    occupy({ x: best.x, y: best.y, width: item.width, height: item.height });
  }
}
export function canonicalizeTextureAtlasSpecV1(input: unknown): CanonicalTextureAtlasSpecV1 {
  preflight(input);
  const r = record(
    input,
    ['schemaVersion', 'width', 'height', 'usage', 'sampler', 'regions', 'pack'],
    'atlas',
  );
  if (r['schemaVersion'] !== 1) atlasFailure('schemaVersion must be 1.');
  let pack: CanonicalTextureAtlasPackV1 | undefined;
  if (r['pack'] !== undefined) {
    const p = record(r['pack'], ['edge', 'gutter', 'algorithm'], 'pack');
    if (!(TEXTURE_ATLAS_PACK_EDGES as readonly unknown[]).includes(p['edge']))
      atlasFailure('pack.edge must be 1024 or 2048.');
    if (p['algorithm'] !== undefined && p['algorithm'] !== 'maxrects')
      atlasFailure("pack.algorithm must be 'maxrects'.");
    pack = {
      edge: p['edge'] as CanonicalTextureAtlasPackV1['edge'],
      gutter: p['gutter'] === undefined ? 2 : integer(p['gutter'], 0, 32, 'pack.gutter'),
      algorithm: 'maxrects',
    };
  }
  const limits = pack ? TEXTURE_ATLAS_LIMITS_V1_2 : TEXTURE_ATLAS_LIMITS,
    maxEdge = pack ? pack.edge : limits.edge;
  const width =
      pack && r['width'] === undefined ? pack.edge : integer(r['width'], 4, maxEdge, 'width'),
    height =
      pack && r['height'] === undefined ? pack.edge : integer(r['height'], 4, maxEdge, 'height');
  if (width * height > limits.outputTexels) atlasFailure('output texel budget exceeded.');
  if (!(TEXTURE_USAGES as readonly unknown[]).includes(r['usage']))
    atlasFailure('usage must be a texture usage.');
  const usage = r['usage'] as TextureUsage;
  if (!Array.isArray(r['regions']) || !r['regions'].length || r['regions'].length > limits.regions)
    atlasFailure(`regions must contain 1..${limits.regions} entries.`);
  const pending: PendingPackV1[] = [];
  const regions = r['regions']
    .map((value, i): CanonicalTextureAtlasRegionV1 => {
      const q = record(
        value,
        ['name', 'content', 'gutter', 'edgeMode', 'source', 'crop', 'packed'],
        `regions[${i}]`,
      );
      if (typeof q['name'] !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(q['name']))
        atlasFailure('region name must be a stable lowercase identifier.');
      const explicit = q['content'] !== undefined;
      if (!explicit && !pack)
        atlasFailure(`region ${q['name']}: content is required unless the atlas sets pack.`);
      if (q['packed'] !== undefined && (q['packed'] !== true || !pack || !explicit))
        atlasFailure(
          'packed is the resolved-placement marker: true, with content, in an atlas that sets pack.',
        );
      let content = explicit ? rect(q['content'], 'content') : undefined;
      const gutter =
        q['gutter'] === undefined ? (pack?.gutter ?? 2) : integer(q['gutter'], 0, 32, 'gutter');
      const edgeMode = q['edgeMode'] === undefined ? 'copy-edge' : q['edgeMode'];
      if (!['copy-edge', 'mask-rgb-dilate'].includes(edgeMode as string))
        atlasFailure('unsupported edgeMode.');
      if (edgeMode === 'mask-rgb-dilate' && usage !== 'albedo' && usage !== 'emissive')
        atlasFailure('mask RGB dilation requires color usage.');
      const s = record(q['source'], ['kind', 'spec', 'resourceId', 'pin', 'expected'], 'source');
      let source: CanonicalTextureAtlasSourceV1;
      let crop = q['crop'] === undefined ? undefined : rect(q['crop'], 'crop');
      if (s['kind'] === 'procedural') {
        record(s, ['kind', 'spec'], 'procedural source');
        const admission = admitProceduralTextureSpecV3(s['spec']);
        if (admission.spec.usage !== usage)
          atlasFailure('source usage does not match atlas usage.');
        source = { kind: 'procedural', spec: admission.spec };
        crop ??= { x: 0, y: 0, width: admission.spec.width, height: admission.spec.height };
        content ??= { x: 0, y: 0, width: crop.width, height: crop.height };
        assertAtlasCropV1(crop, content, admission.spec.width, admission.spec.height);
      } else if (s['kind'] === 'resource') {
        record(s, ['kind', 'resourceId', 'pin', 'expected'], 'resource source');
        if (
          typeof s['resourceId'] !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/.test(s['resourceId'])
        )
          atlasFailure('source resourceId must be an exact returned map ID.');
        const p = record(s['pin'], ['resourceId', 'revisionId', 'sha256'], 'source pin');
        if (typeof p['resourceId'] !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(p['resourceId']))
          atlasFailure('pin resourceId must be a material ID.');
        const revisionId = hash(p['revisionId'], 'pin revisionId'),
          sha256 = hash(p['sha256'], 'pin sha256');
        if (revisionId !== sha256) atlasFailure('source pin revision/hash mismatch.');
        let expected: AtlasResourceExpectationV1 | undefined;
        if (s['expected'] !== undefined) {
          const e = record(
            s['expected'],
            ['width', 'height', 'imageSha256', 'decodedPixelHash'],
            'source expected',
          );
          expected = {
            ...(e['width'] === undefined
              ? {}
              : { width: integer(e['width'], 1, 4096, 'expected.width') }),
            ...(e['height'] === undefined
              ? {}
              : { height: integer(e['height'], 1, 4096, 'expected.height') }),
            ...(e['imageSha256'] === undefined
              ? {}
              : { imageSha256: hash(e['imageSha256'], 'expected.imageSha256') }),
            ...(e['decodedPixelHash'] === undefined
              ? {}
              : { decodedPixelHash: hash(e['decodedPixelHash'], 'expected.decodedPixelHash') }),
          };
        }
        source = {
          kind: 'resource',
          resourceId: s['resourceId'],
          pin: { resourceId: p['resourceId'], revisionId, sha256 },
          ...(expected ? { expected } : {}),
        };
        if (!content) {
          // A packed resource needs its size before any host load: a crop or expected size.
          const size =
            crop ??
            (expected?.width !== undefined && expected.height !== undefined
              ? { width: expected.width, height: expected.height }
              : atlasFailure(
                  `region ${q['name']}: a packed resource region needs a crop or expected width and height (its size).`,
                ));
          content = { x: 0, y: 0, width: size.width, height: size.height };
        }
        if (crop && (crop.width !== content.width || crop.height !== content.height))
          atlasFailure('source crop/content dimensions must match; resampling is unsupported.');
      } else atlasFailure('source kind must be procedural or pinned resource.');
      const result: CanonicalTextureAtlasRegionV1 = {
        name: q['name'],
        content: content!,
        gutter,
        edgeMode: edgeMode as AtlasEdgeModeV1,
        source,
        ...(crop ? { crop } : {}),
        ...(pack && (!explicit || q['packed'] === true) ? { packed: true as const } : {}),
      };
      if (!explicit)
        pending.push({
          region: result,
          width: result.content.width + 2 * gutter,
          height: result.content.height + 2 * gutter,
        });
      return result;
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (new Set(regions.map((v) => v.name)).size !== regions.length)
    atlasFailure('duplicate region name.');
  if (pending.length) {
    const placed = new Set(pending.map((p) => p.region));
    packAtlasRegionsV1(
      width,
      height,
      regions.filter((region) => !placed.has(region)).map((region) => atlasAllocationV1(region)),
      pending,
    );
  }
  for (const region of regions) {
    const allocation = atlasAllocationV1(region);
    if (
      allocation.x < 0 ||
      allocation.y < 0 ||
      allocation.x + allocation.width > width ||
      allocation.y + allocation.height > height
    )
      atlasFailure('padded allocation is out of bounds.');
  }
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      const a = atlasAllocationV1(regions[i]!),
        b = atlasAllocationV1(regions[j]!);
      if (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      )
        atlasFailure(`padded allocations overlap: ${regions[i]!.name}, ${regions[j]!.name}.`);
    }
  if (new Set(regions.map((v) => atlasSourceIdentityV1(v.source))).size > limits.sources)
    atlasFailure(`distinct source budget exceeds ${limits.sources}.`);
  let sampler: CanonicalPortableSamplerV1;
  try {
    sampler = canonicalizePortableSamplerV1(
      r['sampler'] === undefined
        ? {
            minFilter: 'linear-mipmap-linear',
            magFilter: 'linear',
            wrapS: 'clamp-to-edge',
            wrapT: 'clamp-to-edge',
          }
        : r['sampler'],
    );
  } catch (e) {
    atlasFailure(`sampler: ${(e as Error).message}`);
  }
  const spec: CanonicalTextureAtlasSpecV1 = {
    schemaVersion: 1,
    width,
    height,
    usage,
    sampler,
    regions,
    ...(pack ? { pack } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(spec)).length > TEXTURE_ATLAS_LIMITS.jsonBytes)
    atlasFailure('canonical JSON byte budget exceeded.');
  return spec;
}
export function canonicalTextureAtlasJsonV1(input: unknown): string {
  return JSON.stringify(canonicalizeTextureAtlasSpecV1(input));
}
export function hashTextureAtlasSpecV1(input: unknown): `sha256:${string}` {
  const spec = canonicalizeTextureAtlasSpecV1(input);
  return `sha256:${sha256Hex(`${textureAtlasCompilerIdV1(spec)}\n${JSON.stringify(spec)}`)}`;
}
/** Internal identity helper for bounded atlas metadata; stable across object property order. */
export function canonicalAtlasMetadataJsonV1(input: unknown): string {
  preflight(input);
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sort(v)]),
          )
        : value;
  return JSON.stringify(sort(input));
}
export function atlasLayoutHashV1(spec: CanonicalTextureAtlasSpecV1): `sha256:${string}` {
  return `sha256:${sha256Hex(`kiln.atlas-layout.v1\n${canonicalAtlasMetadataJsonV1({ width: spec.width, height: spec.height, origin: 'top-left', regions: spec.regions.map((r) => ({ name: r.name, content: r.content, allocation: atlasAllocationV1(r) })) })}`)}`;
}

/** Pure persisted-manifest reader. Actual PNG/RGBA and recompilation belong to the host. */
export function validateTextureAtlasManifestV1(
  input: unknown,
  providedSpec: CanonicalTextureAtlasSpecV1,
): TextureAtlasManifestV1 {
  preflight(input);
  const spec = canonicalizeTextureAtlasSpecV1(providedSpec);
  const r = record(
    input,
    [
      'version',
      'compilerId',
      'width',
      'height',
      'usage',
      'origin',
      'sampler',
      'specHash',
      'layoutHash',
      'decodedPixelHash',
      'atlasPixelHash',
      'sources',
      'regions',
      'manifestHash',
    ],
    'manifest',
  );
  if (
    r['version'] !== 'kiln.atlas-manifest.v1' ||
    r['compilerId'] !== textureAtlasCompilerIdV1(spec) ||
    r['width'] !== spec.width ||
    r['height'] !== spec.height ||
    r['usage'] !== spec.usage ||
    r['origin'] !== 'top-left'
  )
    atlasFailure('manifest version/compiler/dimensions/usage/origin mismatch.');
  if (
    canonicalAtlasMetadataJsonV1(r['sampler']) !== canonicalAtlasMetadataJsonV1(spec.sampler) ||
    r['specHash'] !== hashTextureAtlasSpecV1(spec) ||
    r['layoutHash'] !== atlasLayoutHashV1(spec)
  )
    atlasFailure('manifest sampler/spec/layout identity mismatch.');
  hash(r['decodedPixelHash'], 'manifest decodedPixelHash');
  hash(r['atlasPixelHash'], 'manifest atlasPixelHash');
  const expectedSources = new Map(
    spec.regions.map((region) => [atlasSourceIdentityV1(region.source), region.source]),
  );
  if (
    !Array.isArray(r['sources']) ||
    r['sources'].length !== expectedSources.size ||
    !Array.isArray(r['regions']) ||
    r['regions'].length !== spec.regions.length
  )
    atlasFailure('manifest source/region inventory mismatch.');
  const dimensions = new Map<string, { width: number; height: number }>();
  for (const sourceValue of r['sources']) {
    const s = record(
      sourceValue,
      [
        'id',
        'kind',
        'width',
        'height',
        'decodedPixelHash',
        'recipeHash',
        'compilerId',
        'descriptor',
      ],
      'manifest source',
    );
    if (typeof s['id'] !== 'string' || dimensions.has(s['id']))
      atlasFailure('duplicate/invalid manifest source identity.');
    const source = expectedSources.get(s['id']);
    if (!source || s['kind'] !== source.kind) atlasFailure('manifest source identity mismatch.');
    const width = integer(s['width'], 1, 4096, 'manifest source width'),
      height = integer(s['height'], 1, 4096, 'manifest source height');
    hash(s['decodedPixelHash'], 'manifest source decodedPixelHash');
    if (source.kind === 'procedural') {
      record(
        s,
        ['id', 'kind', 'width', 'height', 'decodedPixelHash', 'recipeHash', 'compilerId'],
        'manifest procedural source',
      );
      if (
        width !== source.spec.width ||
        height !== source.spec.height ||
        s['recipeHash'] !== hashProceduralTextureSpecV3(source.spec) ||
        s['compilerId'] !== 'kiln.procedural-rgba.v3.1'
      )
        atlasFailure('manifest procedural source identity mismatch.');
    } else {
      record(
        s,
        ['id', 'kind', 'width', 'height', 'decodedPixelHash', 'descriptor'],
        'manifest resource source',
      );
      const d = record(
        s['descriptor'],
        [
          'materialId',
          'revisionId',
          'resourceId',
          'slot',
          'usage',
          'colorSpace',
          'width',
          'height',
          'encodedByteLength',
          'imageSha256',
          'decodedPixelHash',
        ],
        'manifest source descriptor',
      );
      const slots: Record<string, string> = {
        baseColor: 'albedo',
        normal: 'normal',
        metallicRoughness: 'metallicRoughness',
        emissive: 'emissive',
        occlusion: 'occlusion',
      };
      if (
        d['materialId'] !== source.pin.resourceId ||
        d['revisionId'] !== source.pin.revisionId ||
        d['resourceId'] !== source.resourceId ||
        d['width'] !== width ||
        d['height'] !== height ||
        d['usage'] !== spec.usage ||
        typeof d['slot'] !== 'string' ||
        slots[d['slot']] !== spec.usage ||
        d['colorSpace'] !==
          (spec.usage === 'albedo' || spec.usage === 'emissive' ? 'srgb' : 'linear')
      )
        atlasFailure('manifest pinned resource descriptor mismatch.');
      hash(d['imageSha256'], 'manifest source imageSha256');
      integer(
        d['encodedByteLength'],
        1,
        textureAtlasLimitsV1(spec).encodedSourceBytes,
        'manifest encodedByteLength',
      );
      if (d['decodedPixelHash'] !== undefined && d['decodedPixelHash'] !== s['decodedPixelHash'])
        atlasFailure('manifest source decodedPixelHash mismatch.');
      for (const key of ['width', 'height', 'imageSha256', 'decodedPixelHash'] as const) {
        const expected = source.expected?.[key];
        if (expected !== undefined && expected !== (key === 'decodedPixelHash' ? s[key] : d[key]))
          atlasFailure('manifest source expectation mismatch.');
      }
    }
    dimensions.set(s['id'], { width, height });
  }
  for (let i = 0; i < spec.regions.length; i++) {
    const region = spec.regions[i]!,
      v = record(
        r['regions'][i],
        ['name', 'content', 'allocation', 'crop', 'sourceId'],
        'manifest region',
      );
    const sourceId = atlasSourceIdentityV1(region.source),
      size = dimensions.get(sourceId)!;
    const crop = region.crop ?? { x: 0, y: 0, width: size.width, height: size.height };
    assertAtlasCropV1(crop, region.content, size.width, size.height);
    if (
      v['name'] !== region.name ||
      v['sourceId'] !== sourceId ||
      canonicalAtlasMetadataJsonV1(v['content']) !== canonicalAtlasMetadataJsonV1(region.content) ||
      canonicalAtlasMetadataJsonV1(v['allocation']) !==
        canonicalAtlasMetadataJsonV1(atlasAllocationV1(region)) ||
      canonicalAtlasMetadataJsonV1(v['crop']) !== canonicalAtlasMetadataJsonV1(crop)
    )
      atlasFailure('manifest named region/crop/allocation identity mismatch.');
  }
  const { manifestHash, ...payload } = r;
  if (
    manifestHash !==
    `sha256:${sha256Hex(`kiln.atlas-manifest.v1\n${canonicalAtlasMetadataJsonV1(payload)}`)}`
  )
    atlasFailure('manifest hash mismatch.');
  return structuredClone(input) as TextureAtlasManifestV1;
}
