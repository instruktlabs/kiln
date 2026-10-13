/** Deterministic fixed-scale composition. Resource loading is a trusted host capability. */
import { compileProceduralTextureSpecV3 } from './procedural-texture-v3';
import {
  admitProceduralTextureSpecV3,
  hashProceduralTextureSpecV3,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
  type ProceduralTextureAdmissionV3,
} from './procedural-texture-v3-contract';
import { sha256Hex } from './procedural-material-v2';
import type {
  PinnedMaterialMapPortV1,
  VerifiedPinnedMaterialMapDescriptorV1,
} from './pinned-material-map';
import {
  atlasAllocationV1,
  atlasFailure,
  atlasLayoutHashV1,
  atlasSourceIdentityV1,
  assertAtlasCropV1,
  canonicalizeTextureAtlasSpecV1,
  canonicalAtlasMetadataJsonV1,
  hashTextureAtlasSpecV1,
  TEXTURE_ATLAS_COMPILER_ID,
  TEXTURE_ATLAS_LIMITS,
  type AtlasRectangleV1,
  type CanonicalTextureAtlasRegionV1,
  type CanonicalTextureAtlasSourceV1,
  type CanonicalTextureAtlasSpecV1,
} from './texture-atlas-contract';

type Hash = `sha256:${string}`;
export interface TextureAtlasCompileOptionsV1 {
  resources?: PinnedMaterialMapPortV1;
  signal?: AbortSignal;
}
export interface TextureAtlasBudgetV1 {
  sourceTexels: number;
  encodedBytes: number;
  workUnits: number;
  conservativePixelAllocationBytes: number;
  dilationScratchBytes: number;
}
interface PreparedSource {
  id: string;
  source: CanonicalTextureAtlasSourceV1;
  width: number;
  height: number;
  descriptor?: VerifiedPinnedMaterialMapDescriptorV1;
  admission?: ProceduralTextureAdmissionV3;
}
export interface TextureAtlasAdmissionV1 {
  spec: CanonicalTextureAtlasSpecV1;
  sources: PreparedSource[];
  crops: Map<string, AtlasRectangleV1>;
  budget: TextureAtlasBudgetV1;
}
export interface TextureAtlasSourceManifestV1 {
  id: string;
  kind: 'procedural' | 'resource';
  width: number;
  height: number;
  decodedPixelHash: Hash;
  recipeHash?: Hash;
  compilerId?: string;
  descriptor?: VerifiedPinnedMaterialMapDescriptorV1;
}
export interface TextureAtlasRegionManifestV1 {
  name: string;
  content: AtlasRectangleV1;
  allocation: AtlasRectangleV1;
  crop: AtlasRectangleV1;
  sourceId: string;
}
export interface TextureAtlasManifestV1 {
  version: 'kiln.atlas-manifest.v1';
  compilerId: typeof TEXTURE_ATLAS_COMPILER_ID;
  width: number;
  height: number;
  usage: CanonicalTextureAtlasSpecV1['usage'];
  origin: 'top-left';
  sampler: CanonicalTextureAtlasSpecV1['sampler'];
  specHash: Hash;
  layoutHash: Hash;
  decodedPixelHash: Hash;
  atlasPixelHash: Hash;
  sources: TextureAtlasSourceManifestV1[];
  regions: TextureAtlasRegionManifestV1[];
  manifestHash: Hash;
}
export interface CompiledTextureAtlasV1 {
  spec: CanonicalTextureAtlasSpecV1;
  canonicalJson: string;
  pixels: Uint8Array;
  manifest: TextureAtlasManifestV1;
  budget: TextureAtlasBudgetV1;
}

const isHash = (value: unknown): value is Hash =>
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const boundedInteger = (value: number, max: number) =>
  Number.isSafeInteger(value) && value >= 1 && value <= max;
function checkDescriptor(
  d: VerifiedPinnedMaterialMapDescriptorV1,
  source: Extract<CanonicalTextureAtlasSourceV1, { kind: 'resource' }>,
  usage: CanonicalTextureAtlasSpecV1['usage'],
): void {
  const slots = {
    baseColor: 'albedo',
    normal: 'normal',
    metallicRoughness: 'metallicRoughness',
    emissive: 'emissive',
    occlusion: 'occlusion',
  };
  if (
    d.materialId !== source.pin.resourceId ||
    d.revisionId !== source.pin.revisionId ||
    d.resourceId !== source.resourceId ||
    !isHash(d.revisionId) ||
    !isHash(d.imageSha256)
  )
    atlasFailure('pinned source descriptor identity/hash mismatch.');
  if (
    d.usage !== usage ||
    slots[d.slot] !== usage ||
    d.colorSpace !== (usage === 'albedo' || usage === 'emissive' ? 'srgb' : 'linear')
  )
    atlasFailure('pinned source usage/slot/colorSpace mismatch.');
  if (
    !boundedInteger(d.width, 4096) ||
    !boundedInteger(d.height, 4096) ||
    !boundedInteger(d.encodedByteLength, TEXTURE_ATLAS_LIMITS.encodedSourceBytes) ||
    (d.decodedPixelHash !== undefined && !isHash(d.decodedPixelHash))
  )
    atlasFailure('pinned source dimensions/byte/hash budget is invalid.');
  for (const key of ['width', 'height', 'imageSha256', 'decodedPixelHash'] as const) {
    const expected = source.expected?.[key];
    if (expected !== undefined && d[key] !== undefined && expected !== d[key])
      atlasFailure(`source expected ${key} does not match verified descriptor.`);
  }
}

/** Admit all sources and aggregate work/buffer allocations before any source pixel load. */
export function admitTextureAtlasSpecV1(
  input: unknown,
  options: TextureAtlasCompileOptionsV1 = {},
): TextureAtlasAdmissionV1 {
  const spec = canonicalizeTextureAtlasSpecV1(input),
    unique = new Map<string, PreparedSource>(),
    crops = new Map<string, AtlasRectangleV1>();
  const outputTexels = spec.width * spec.height;
  // Include output and two output-sized hash snapshots/domain concatenation buffers.
  const budget: TextureAtlasBudgetV1 = {
    sourceTexels: 0,
    encodedBytes: 0,
    workUnits: outputTexels * 13,
    conservativePixelAllocationBytes: outputTexels * 12,
    dilationScratchBytes: 0,
  };
  for (const region of spec.regions) {
    const id = atlasSourceIdentityV1(region.source);
    let prepared = unique.get(id);
    if (!prepared) {
      if (region.source.kind === 'procedural') {
        const admission = admitProceduralTextureSpecV3(region.source.spec);
        prepared = {
          id,
          source: region.source,
          width: admission.spec.width,
          height: admission.spec.height,
          admission,
        };
        budget.workUnits += admission.estimatedWorkUnits;
        budget.conservativePixelAllocationBytes += admission.conservativePixelAllocationBytes;
      } else {
        const described = options.resources?.describePinnedMaterialMap(
          region.source.resourceId,
          region.source.pin,
        );
        if (!described)
          atlasFailure(
            `source ${region.name} requires a verified pinned library map. Get its exact map ID with kiln_material get and supply materialDependencies or project pins; approved resources are unsupported for atlas sources.`,
          );
        checkDescriptor(described, region.source, spec.usage);
        // Snapshot verified metadata before an async loader can mutate its own object.
        const descriptor = structuredClone(described);
        prepared = {
          id,
          source: region.source,
          width: descriptor.width,
          height: descriptor.height,
          descriptor,
        };
        budget.encodedBytes += descriptor.encodedByteLength;
        // Returned owned pixels + our immutable snapshot + decoder/copy allowance + encoded input.
        budget.conservativePixelAllocationBytes +=
          descriptor.width * descriptor.height * 12 + descriptor.encodedByteLength;
      }
      const texels = prepared.width * prepared.height;
      budget.sourceTexels += texels;
      budget.workUnits += texels * 8;
      budget.conservativePixelAllocationBytes += texels * 4; // Raw-pixel hash snapshot allowance.
      unique.set(id, prepared);
    }
    if (region.source.kind === 'resource')
      checkDescriptor(prepared.descriptor!, region.source, spec.usage);
    const crop = region.crop ?? { x: 0, y: 0, width: prepared.width, height: prepared.height };
    assertAtlasCropV1(crop, region.content, prepared.width, prepared.height);
    crops.set(region.name, crop);
    const allocation = atlasAllocationV1(region),
      texels = allocation.width * allocation.height;
    budget.workUnits += texels * (region.edgeMode === 'mask-rgb-dilate' ? 16 : 2);
    if (region.edgeMode === 'mask-rgb-dilate')
      budget.dilationScratchBytes = Math.max(budget.dilationScratchBytes, texels * 8);
  }
  budget.workUnits += (spec.regions.length * (spec.regions.length - 1)) / 2;
  budget.conservativePixelAllocationBytes += budget.dilationScratchBytes;
  if (budget.sourceTexels > TEXTURE_ATLAS_LIMITS.sourceTexels)
    atlasFailure(
      'full decoded source texel budget exceeded; a small crop does not reduce source decode cost.',
    );
  if (budget.encodedBytes > TEXTURE_ATLAS_LIMITS.encodedBytes)
    atlasFailure('aggregate encoded source byte budget exceeded.');
  if (budget.workUnits > TEXTURE_ATLAS_LIMITS.work)
    atlasFailure(`aggregate work budget ${budget.workUnits} exceeds ${TEXTURE_ATLAS_LIMITS.work}.`);
  if (budget.conservativePixelAllocationBytes > TEXTURE_ATLAS_LIMITS.allocatedBytes)
    atlasFailure(
      `aggregate pixel allocation budget ${budget.conservativePixelAllocationBytes} exceeds ${TEXTURE_ATLAS_LIMITS.allocatedBytes}.`,
    );
  return {
    spec,
    sources: [...unique.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    crops,
    budget,
  };
}
async function pixelDigest(bytes: Uint8Array): Promise<Hash> {
  // Compiler/host snapshots are ArrayBuffer-backed, never shared mutable cache state.
  const result = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return `sha256:${[...new Uint8Array(result)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) atlasFailure('compilation cancelled.');
}

/** Copy exact crop and fill only this region's disjoint allocation. Scratch is reused. */
function composeRegion(
  output: Uint8Array,
  atlasWidth: number,
  region: CanonicalTextureAtlasRegionV1,
  crop: AtlasRectangleV1,
  source: Uint8Array,
  sourceWidth: number,
  distances: Int32Array,
  donors: Int32Array,
): void {
  const allocation = atlasAllocationV1(region),
    w = allocation.width,
    h = allocation.height,
    g = region.gutter;
  const sourcePixel = (cx: number, cy: number) => ((crop.y + cy) * sourceWidth + crop.x + cx) * 4;
  const destination = (x: number, y: number) =>
    ((allocation.y + y) * atlasWidth + allocation.x + x) * 4;
  if (region.edgeMode === 'copy-edge') {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = sourcePixel(
            Math.max(0, Math.min(crop.width - 1, x - g)),
            Math.max(0, Math.min(crop.height - 1, y - g)),
          ),
          d = destination(x, y);
        for (let c = 0; c < 4; c++) output[d + c] = source[s + c]!;
      }
    return;
  }
  const length = w * h,
    infinity = 0x3fffffff;
  distances.fill(infinity, 0, length);
  donors.fill(infinity, 0, length);
  for (let cy = 0; cy < crop.height; cy++)
    for (let cx = 0; cx < crop.width; cx++) {
      const s = sourcePixel(cx, cy),
        d = destination(cx + g, cy + g),
        index = (cy + g) * w + cx + g;
      for (let c = 0; c < 4; c++) output[d + c] = source[s + c]!;
      if (source[s + 3]! > 0) {
        distances[index] = 0;
        donors[index] = cy * crop.width + cx;
      }
    }
  const consider = (i: number, neighbor: number) => {
    const distance = distances[neighbor]! + 1;
    if (
      distance < distances[i]! ||
      (distance === distances[i]! && donors[neighbor]! < donors[i]!)
    ) {
      distances[i] = distance;
      donors[i] = donors[neighbor]!;
    }
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) consider(i, i - 1);
      if (y) consider(i, i - w);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) consider(i, i + 1);
      if (y + 1 < h) consider(i, i + w);
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = destination(x, y);
      if (output[d + 3]! > 0) continue;
      const donor = donors[y * w + x]!;
      if (donor === infinity) {
        output[d] = 0;
        output[d + 1] = 0;
        output[d + 2] = 0;
      } else {
        const s = sourcePixel(donor % crop.width, Math.floor(donor / crop.width));
        for (let c = 0; c < 3; c++) output[d + c] = source[s + c]!;
      }
    }
}

export async function compileTextureAtlasSpecV1(
  input: unknown,
  options: TextureAtlasCompileOptionsV1 = {},
): Promise<CompiledTextureAtlasV1> {
  const admission = admitTextureAtlasSpecV1(input, options),
    { spec, sources, crops, budget } = admission;
  cancelled(options.signal);
  const sourcePixels = new Map<string, Uint8Array>(),
    sourceManifests: TextureAtlasSourceManifestV1[] = [];
  // Sequential loads avoid multiplying decoder/snapshot peaks; each exact source compiles once.
  for (const prepared of sources) {
    cancelled(options.signal);
    let pixels: Uint8Array, manifest: TextureAtlasSourceManifestV1;
    if (prepared.source.kind === 'procedural') {
      pixels = compileProceduralTextureSpecV3(prepared.source.spec).pixels;
      manifest = {
        id: prepared.id,
        kind: 'procedural',
        width: prepared.width,
        height: prepared.height,
        decodedPixelHash: await pixelDigest(pixels),
        recipeHash: hashProceduralTextureSpecV3(prepared.source.spec),
        compilerId: PROCEDURAL_TEXTURE_V3_COMPILER_ID,
      };
    } else {
      const resolved = await options.resources!.resolvePinnedMaterialMapPixels(
        prepared.source.resourceId,
        prepared.source.pin,
        { signal: options.signal },
      );
      checkDescriptor(resolved.descriptor, prepared.source, spec.usage);
      if (
        canonicalAtlasMetadataJsonV1(resolved.descriptor) !==
        canonicalAtlasMetadataJsonV1(prepared.descriptor)
      )
        atlasFailure('resolved source descriptor changed after admission.');
      if (
        !(resolved.pixels instanceof Uint8Array) ||
        resolved.pixels.length !== prepared.width * prepared.height * 4
      )
        atlasFailure('decoded source RGBA dimensions/length mismatch.');
      pixels = Uint8Array.from(resolved.pixels);
      const decodedPixelHash = await pixelDigest(pixels);
      if (
        decodedPixelHash !== resolved.decodedPixelHash ||
        (prepared.descriptor!.decodedPixelHash !== undefined &&
          decodedPixelHash !== prepared.descriptor!.decodedPixelHash)
      )
        atlasFailure('decoded source pixel hash mismatch.');
      manifest = {
        id: prepared.id,
        kind: 'resource',
        width: prepared.width,
        height: prepared.height,
        decodedPixelHash,
        descriptor: prepared.descriptor,
      };
    }
    sourcePixels.set(prepared.id, pixels);
    sourceManifests.push(manifest);
  }
  // Compare every reuse's expectations, including an old external source without a descriptor hash.
  for (const region of spec.regions)
    if (
      region.source.kind === 'resource' &&
      region.source.expected?.decodedPixelHash !== undefined
    ) {
      const actual = sourceManifests.find(
        (v) => v.id === atlasSourceIdentityV1(region.source),
      )!.decodedPixelHash;
      if (actual !== region.source.expected.decodedPixelHash)
        atlasFailure('source expected decodedPixelHash mismatch.');
    }
  cancelled(options.signal);
  const pixels = new Uint8Array(spec.width * spec.height * 4),
    scratchLength = budget.dilationScratchBytes / 8;
  const distances = new Int32Array(scratchLength),
    donors = new Int32Array(scratchLength);
  for (const region of spec.regions)
    composeRegion(
      pixels,
      spec.width,
      region,
      crops.get(region.name)!,
      sourcePixels.get(atlasSourceIdentityV1(region.source))!,
      sources.find((v) => v.id === atlasSourceIdentityV1(region.source))!.width,
      distances,
      donors,
    );
  const decodedPixelHash = await pixelDigest(pixels),
    header = new TextEncoder().encode(
      `kiln.atlas-pixels.v1\n${spec.width},${spec.height},${spec.usage}\n`,
    );
  const tagged = new Uint8Array(header.length + pixels.length);
  tagged.set(header);
  tagged.set(pixels, header.length);
  const atlasPixelHash = await pixelDigest(tagged);
  const payload = {
    version: 'kiln.atlas-manifest.v1' as const,
    compilerId: TEXTURE_ATLAS_COMPILER_ID,
    width: spec.width,
    height: spec.height,
    usage: spec.usage,
    origin: 'top-left' as const,
    sampler: spec.sampler,
    specHash: hashTextureAtlasSpecV1(spec),
    layoutHash: atlasLayoutHashV1(spec),
    decodedPixelHash,
    atlasPixelHash,
    sources: sourceManifests,
    regions: spec.regions.map((r) => ({
      name: r.name,
      content: r.content,
      allocation: atlasAllocationV1(r),
      crop: crops.get(r.name)!,
      sourceId: atlasSourceIdentityV1(r.source),
    })),
  };
  const manifestHash =
    `sha256:${sha256Hex(`kiln.atlas-manifest.v1\n${canonicalAtlasMetadataJsonV1(payload)}`)}` as Hash;
  cancelled(options.signal);
  return {
    spec,
    canonicalJson: JSON.stringify(spec),
    pixels,
    manifest: { ...payload, manifestHash },
    budget,
  };
}
