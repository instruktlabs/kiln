/**
 * Export one saved material revision as standalone tiling PNGs, a JSON sidecar and a lit
 * planar preview. Standalone: no project, terrain-layer schema, mask or destination tint.
 * The preview reuses the host-injected `PbrRenderPort` through `captureViewsViaPort`, which
 * owns the deadline and reply validation; a failure degrades to the CPU geometry view and the
 * sidecar records its `kiln.view-fidelity.v1` block so a CPU preview is never material evidence.
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { writeNewDestinationsAtomic } from './cli-output';
import type { PbrRenderPort, ViewFidelityV1 } from './composer/render-port';
import {
  MATERIAL_LIBRARY_LIMITS,
  MATERIAL_LIBRARY_SLOTS,
  materialPngDimensions,
  validateMaterialRecordShapeAny,
  type MaterialLibrarySlot,
  type MaterialManifest,
  type MaterialRecord,
  type MaterialSourceV1,
} from './material-library';
import { compileProceduralTextureSpecV2 } from './procedural-texture';
import type { PortableSamplerV1 } from './portable-sampler';
import { loadTexture, pbrMaterial, type PbrMaterialOptions } from './textures';

export const MATERIAL_MAP_EXPORT_LIMITS = Object.freeze({
  minSize: 4,
  maxSize: MATERIAL_LIBRARY_LIMITS.maxMapEdge,
  maxRepeatMeters: 100000,
  defaultTiles: 3,
  maxTiles: 8,
  /** Largest map edge bound into the preview plane; larger exports are resampled for it. */
  maxPreviewMapSize: 1024,
});
/**
 * Separable Catmull-Rom cubic (B=0, C=0.5), widened by the scale factor when shrinking. Edges
 * follow the map's wrap (repeat by default for tileable materials), so a tile stays seamless.
 * sRGB maps filter in linear light; normal maps are renormalized. Arithmetic only, no randomness.
 */
export const MATERIAL_MAP_RESAMPLE_FILTER = 'catmull-rom' as const;
const PREVIEW_CAMERA = Object.freeze({ azimuthDeg: 30, elevationDeg: 50 });

type Wrap = PortableSamplerV1['wrapS'];
export interface MaterialMapExportOptionsV1 {
  /** Directory for the files; created when missing. Existing files are never replaced. */
  outDir: string;
  /** Square pixel edge of every exported map. */
  size: number;
  /** Real-world edge of one tile in metres. Defaults to a square `physicalSizeMeters`. */
  repeatMeters?: number;
  /** The preview repeats the material `tiles` × `tiles` times. Default 3. */
  tiles?: number;
  /** Host GPU renderer. Omitted: the preview is a CPU geometry view. */
  viewRenderPort?: PbrRenderPort;
  /** Per-call port deadline in milliseconds. */
  viewRenderTimeoutMs?: number;
  /** Fail instead of degrading when the port cannot render. */
  viewRenderRequired?: boolean;
}
export interface MaterialMapExportMapV1 {
  slot: MaterialLibrarySlot;
  file: string;
  usage: string;
  colorSpace: 'srgb' | 'linear';
  normalConvention?: 'opengl';
  channelPacking?: 'r-occlusion-g-roughness-b-metallic';
  width: number;
  height: number;
  bytes: number;
  sha256: `sha256:${string}`;
  /** `copy`: stored bytes; `recipe`: V2 layer recipe recompiled at `size`; `resampled`. */
  method: 'copy' | 'recipe' | 'resampled';
  wrap: { s: Wrap; t: Wrap };
  recipe?: { compilerId: 'kiln.procedural-texture.v2'; recipeHash: `sha256:${string}` };
  source: { file: string; sha256: `sha256:${string}`; width: number; height: number };
}
export interface MaterialMapExportSidecarV1 {
  version: 'kiln.material-maps.v1';
  material: {
    materialId: string;
    revisionId: string;
    name: string;
    tileable: boolean;
    physicalSizeMeters?: { width: number; height: number };
    parameters: MaterialManifest['parameters'];
    sources: MaterialSourceV1[];
  };
  size: { width: number; height: number };
  repeatMeters: { width: number; height: number };
  resampleFilter: typeof MATERIAL_MAP_RESAMPLE_FILTER;
  maps: MaterialMapExportMapV1[];
  preview: {
    file: string;
    sha256: `sha256:${string}`;
    bytes: number;
    width: number;
    height: number;
    tiles: number;
    planeMeters: number;
    /** Edge of the map images bound into the preview plane. */
    mapSize: number;
    camera: { azimuthDeg: number; elevationDeg: number };
    rendererId: string;
    viewFidelity: ViewFidelityV1;
  };
}
export interface MaterialMapExportV1 {
  sidecar: MaterialMapExportSidecarV1;
  /** File name to bytes, maps first, then the preview and the sidecar. */
  files: { name: string; bytes: Uint8Array }[];
}
export interface MaterialMapExportResultV1 {
  directory: string;
  sidecarPath: string;
  previewPath: string;
  /** Absolute paths of every written file. */
  files: string[];
  sidecar: MaterialMapExportSidecarV1;
}

const digest = (bytes: Uint8Array): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encodePng = async (pixels: Uint8Array, width: number, height: number) =>
  new Uint8Array(
    await sharp(pixels, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer(),
  );
async function decodePng(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes, {
    limitInputPixels: MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
    failOn: 'warning',
  })
    .ensureAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error('Material map must decode to RGBA');
  return { pixels: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Check size, tiles and an explicit repeat. Without `physicalSizeMeters` an omitted repeat is
 * left for the record-aware check; with it, the repeat defaults to a square physical size.
 */
export function validateMaterialMapExportOptions(
  options: Pick<MaterialMapExportOptionsV1, 'size' | 'repeatMeters' | 'tiles'>,
  material?: Pick<MaterialManifest, 'materialId' | 'physicalSizeMeters'>,
): { size: number; tiles: number; repeat?: number } {
  const limits = MATERIAL_MAP_EXPORT_LIMITS;
  const { size } = options;
  if (!Number.isInteger(size) || size < limits.minSize || size > limits.maxSize)
    throw new Error(`size must be an integer from ${limits.minSize} to ${limits.maxSize} pixels`);
  const tiles = options.tiles ?? limits.defaultTiles;
  if (!Number.isInteger(tiles) || tiles < 1 || tiles > limits.maxTiles)
    throw new Error(`tiles must be an integer from 1 to ${limits.maxTiles}`);
  let repeat = options.repeatMeters;
  if (repeat === undefined && material) {
    const physical = material.physicalSizeMeters;
    if (!physical || physical.width !== physical.height)
      throw new Error(
        `repeatMeters is required: material ${material.materialId} records no square physicalSizeMeters (CLI: --repeat <metres>)`,
      );
    repeat = physical.width;
  }
  if (
    repeat !== undefined &&
    (!Number.isFinite(repeat) || repeat <= 0 || repeat > limits.maxRepeatMeters)
  )
    throw new Error(
      `repeatMeters must be a positive number of metres up to ${limits.maxRepeatMeters}`,
    );
  return { size, tiles, ...(repeat !== undefined ? { repeat } : {}) };
}

/** One axis of filter taps: wrapped source indices and normalized weights per output. */
function axisTaps(source: number, target: number, wrap: Wrap) {
  const scale = source / target;
  const stretch = Math.max(1, scale);
  const support = 2 * stretch;
  const kernel = (x: number) => {
    const a = Math.abs(x);
    if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };
  const address = (index: number) => {
    if (wrap === 'repeat') return ((index % source) + source) % source;
    if (wrap === 'mirrored-repeat') {
      const period = 2 * source;
      const folded = ((index % period) + period) % period;
      return folded < source ? folded : period - 1 - folded;
    }
    return Math.min(source - 1, Math.max(0, index));
  };
  const taps: { index: Int32Array; weight: Float64Array }[] = [];
  for (let out = 0; out < target; out++) {
    const center = (out + 0.5) * scale - 0.5;
    const first = Math.ceil(center - support);
    const last = Math.floor(center + support);
    const index = new Int32Array(last - first + 1);
    const weight = new Float64Array(last - first + 1);
    let total = 0;
    for (let i = first; i <= last; i++) {
      const w = kernel((i - center) / stretch);
      index[i - first] = address(i);
      weight[i - first] = w;
      total += w;
    }
    for (let i = 0; i < weight.length; i++) weight[i]! /= total;
    taps.push({ index, weight });
  }
  return taps;
}

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const linearToSrgb = (value: number) => {
  const c = Math.min(1, Math.max(0, value));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
};
const toByte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);

/**
 * Deterministic separable resample, one output row at a time so memory stays at the output
 * plus two row buffers even for a 4096-pixel map.
 */
function resampleMaterialMapPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  target: number,
  options: { colorSpace: 'srgb' | 'linear'; normal?: boolean; wrap: { s: Wrap; t: Wrap } },
): Uint8Array {
  const horizontal = axisTaps(width, target, options.wrap.s);
  const vertical = axisTaps(height, target, options.wrap.t);
  const srgb = options.colorSpace === 'srgb';
  const decode = (channel: number, value: number) =>
    srgb && channel < 3 ? SRGB_TO_LINEAR[value]! : value / 255;
  const column = new Float64Array(width * 4);
  const row = new Float64Array(4);
  const out = new Uint8Array(target * target * 4);
  for (let y = 0; y < target; y++) {
    const { index: rows, weight: rowWeights } = vertical[y]!;
    column.fill(0);
    for (let tap = 0; tap < rows.length; tap++) {
      const offset = rows[tap]! * width * 4;
      const w = rowWeights[tap]!;
      for (let i = 0; i < width * 4; i++) column[i]! += decode(i & 3, pixels[offset + i]!) * w;
    }
    for (let x = 0; x < target; x++) {
      const { index: cols, weight: colWeights } = horizontal[x]!;
      row.fill(0);
      for (let tap = 0; tap < cols.length; tap++) {
        const offset = cols[tap]! * 4;
        const w = colWeights[tap]!;
        for (let c = 0; c < 4; c++) row[c]! += column[offset + c]! * w;
      }
      const o = (y * target + x) * 4;
      if (options.normal) {
        let nx = row[0]! * 2 - 1;
        let ny = row[1]! * 2 - 1;
        let nz = row[2]! * 2 - 1;
        const length = Math.hypot(nx, ny, nz);
        if (length > 1e-6) {
          nx /= length;
          ny /= length;
          nz /= length;
        } else [nx, ny, nz] = [0, 0, 1];
        out[o] = toByte(nx * 0.5 + 0.5);
        out[o + 1] = toByte(ny * 0.5 + 0.5);
        out[o + 2] = toByte(nz * 0.5 + 0.5);
      } else
        for (let c = 0; c < 3; c++) out[o + c] = toByte(srgb ? linearToSrgb(row[c]!) : row[c]!);
      out[o + 3] = toByte(row[3]!);
    }
  }
  return out;
}

type StoredMap = MaterialManifest['maps'][number];
/** A V2 layer recipe samples UV space, so it renders faithfully at another size. */
function regenerableRecipe(map: StoredMap) {
  if ('procedural' in map && map.procedural && !map.procedural.derive) return map.procedural.spec;
  if (
    'recipe' in map &&
    map.recipe?.kind === 'procedural' &&
    map.recipe.compilerId === 'kiln.procedural-texture.v2' &&
    !map.recipe.derive &&
    map.recipe.spec.schemaVersion === 2
  )
    return map.recipe.spec;
  return undefined;
}

async function exportMap(
  record: MaterialRecord,
  map: StoredMap,
  size: number,
): Promise<{ entry: Omit<MaterialMapExportMapV1, 'file'>; bytes: Uint8Array; pixels: Uint8Array }> {
  const manifest = record.manifest;
  const stored = record.files[map.file]!;
  const fallbackWrap: Wrap = manifest.tileable ? 'repeat' : 'clamp-to-edge';
  const wrap =
    'sampler' in map && map.sampler
      ? { s: map.sampler.wrapS, t: map.sampler.wrapT }
      : { s: fallbackWrap, t: fallbackWrap };
  let bytes: Uint8Array;
  let pixels: Uint8Array;
  let method: MaterialMapExportMapV1['method'];
  let recipe: MaterialMapExportMapV1['recipe'];
  const spec = regenerableRecipe(map);
  if (map.width === size && map.height === size) {
    bytes = stored.slice();
    pixels = (await decodePng(bytes)).pixels;
    method = 'copy';
  } else if (spec && size <= 1024 && (size & (size - 1)) === 0) {
    // The V2 compiler's own size contract: a power of two from 4 to 1024.
    const compiled = compileProceduralTextureSpecV2({ ...spec, size });
    pixels = compiled.pixels;
    bytes = await encodePng(pixels, size, size);
    method = 'recipe';
    recipe = { compilerId: 'kiln.procedural-texture.v2', recipeHash: compiled.recipeHash };
  } else {
    const decoded = await decodePng(stored);
    pixels = resampleMaterialMapPixels(decoded.pixels, decoded.width, decoded.height, size, {
      colorSpace: map.colorSpace,
      normal: map.slot === 'normal',
      wrap,
    });
    bytes = await encodePng(pixels, size, size);
    method = 'resampled';
  }
  return {
    bytes,
    pixels,
    entry: {
      slot: map.slot,
      usage: map.usage,
      colorSpace: map.colorSpace,
      ...(map.normalConvention ? { normalConvention: map.normalConvention } : {}),
      ...(map.channelPacking ? { channelPacking: map.channelPacking } : {}),
      width: size,
      height: size,
      bytes: bytes.length,
      sha256: digest(bytes),
      method,
      wrap,
      ...(recipe ? { recipe } : {}),
      source: {
        file: map.file,
        sha256: map.sha256 as `sha256:${string}`,
        width: map.width,
        height: map.height,
      },
    },
  };
}

/** A plane of `tiles` × `tiles` repeats, flat on XZ, with the exported maps bound. */
async function previewGlb(
  manifest: MaterialManifest,
  maps: { slot: MaterialLibrarySlot; usage: StoredMap['usage']; png: Uint8Array }[],
  tiles: number,
  planeMeters: number,
): Promise<Uint8Array> {
  const textures = new Map<MaterialLibrarySlot, THREE.Texture>();
  for (const map of maps)
    textures.set(
      map.slot,
      await loadTexture(map.png, {
        usage: map.usage,
        name: `${manifest.materialId}.${map.slot}`,
      }),
    );
  const p = manifest.parameters;
  const options: PbrMaterialOptions = {
    roughness: p.roughness,
    metalness: p.metalness,
    emissiveIntensity: p.emissiveIntensity,
    alphaMode: p.alphaMode,
    ...(p.alphaMode === 'mask' ? { alphaCutoff: p.alphaCutoff } : {}),
    doubleSided: p.doubleSided,
    ...(textures.get('baseColor')
      ? { albedo: textures.get('baseColor') }
      : p.baseColor !== undefined
        ? { albedo: p.baseColor }
        : {}),
    ...(textures.get('normal') ? { normal: textures.get('normal') } : {}),
    ...(textures.get('metallicRoughness')
      ? { metallicRoughness: textures.get('metallicRoughness') }
      : {}),
    ...(textures.get('emissive')
      ? { emissive: textures.get('emissive') }
      : p.emissive !== undefined
        ? { emissive: p.emissive }
        : {}),
    ...(textures.get('occlusion') ? { aoMap: textures.get('occlusion') } : {}),
  };
  const material = pbrMaterial(options);
  material.name = manifest.name;
  if (textures.has('baseColor') && p.baseColor !== undefined) material.color.setHex(p.baseColor);
  if (textures.has('emissive') && p.emissive !== undefined) material.emissive.setHex(p.emissive);
  const geometry = new THREE.PlaneGeometry(planeMeters, planeMeters);
  geometry.rotateX(-Math.PI / 2);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tiles, uv.getY(i) * tiles);
  const root = new THREE.Group();
  root.name = `${manifest.materialId}-preview`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'tiles';
  root.add(mesh);
  // Lazy: the renderer and view modules stay off this entrypoint's load graph.
  const { renderSceneToGLB } = await import('./render');
  return (await renderSceneToGLB(root, { derivative: true })).bytes;
}

async function renderPreview(
  glb: Uint8Array,
  options: MaterialMapExportOptionsV1,
): Promise<{ png: Uint8Array; rendererId: string; viewFidelity: ViewFidelityV1 }> {
  const { captureViewsViaPort, DEFAULT_VIEW_RENDER_TIMEOUT_MS, sha256Bytes } = await import(
    './views/port'
  );
  const capture = { preset: '1x1' as const, cells: [{ ...PREVIEW_CAMERA }] };
  const inputGlbSha256 = await sha256Bytes(glb);
  let degradeReason = 'material-faithful view render port unavailable';
  if (options.viewRenderPort) {
    const ported = await captureViewsViaPort(
      options.viewRenderPort,
      glb,
      options.viewRenderTimeoutMs ?? DEFAULT_VIEW_RENDER_TIMEOUT_MS,
      capture,
    );
    if (ported.ok)
      return {
        png: new Uint8Array(ported.png),
        rendererId: ported.rendererId,
        viewFidelity: {
          version: 'kiln.view-fidelity.v1',
          requested: 'full-preferred',
          delivered: 'full-material',
          materialFaithful: true,
          // The preview plane is a purpose-built derivative, not a persisted artifact.
          exactArtifact: false,
          rendererId: ported.rendererId,
          inputGlbSha256,
          degraded: false,
        },
      };
    degradeReason = ported.reason;
  }
  if (options.viewRenderRequired) throw new Error(`Required GPU render failed: ${degradeReason}`);
  // Lazy, as everywhere: renderer-id.ts reads package metadata at module load.
  const { renderGlbViewGrid, CPU_RASTER_RENDERER_ID } = await import('./views');
  const grid = await renderGlbViewGrid(glb, { capture });
  return {
    png: new Uint8Array(grid.png),
    rendererId: CPU_RASTER_RENDERER_ID,
    viewFidelity: {
      version: 'kiln.view-fidelity.v1',
      requested: 'full-preferred',
      delivered: 'geometry-flat',
      materialFaithful: false,
      exactArtifact: false,
      rendererId: CPU_RASTER_RENDERER_ID,
      inputGlbSha256: grid.inputGlbSha256,
      degraded: true,
      degradeReason,
      reasonCodes: ['FULL_MATERIAL_RENDER_UNAVAILABLE', ...grid.reasonCodes],
    },
  };
}

/** Build every file in memory; nothing is written. */
export async function createMaterialMapExport(
  record: MaterialRecord,
  options: MaterialMapExportOptionsV1,
): Promise<MaterialMapExportV1> {
  if (typeof options.outDir !== 'string' || !options.outDir)
    throw new Error('outDir must name a directory');
  validateMaterialMapExportOptions(options);
  const manifest = validateMaterialRecordShapeAny(record);
  const checked = validateMaterialMapExportOptions(options, manifest);
  const { size, tiles } = checked;
  // With the manifest supplied, an omitted repeat is defaulted or rejected above.
  const repeat = checked.repeat!;
  for (const map of manifest.maps)
    if (digest(record.files[map.file]!) !== map.sha256)
      throw new Error(`Material integrity hash mismatch: ${map.file}`);
  const id = manifest.materialId;
  const ordered = MATERIAL_LIBRARY_SLOTS.flatMap((slot) =>
    manifest.maps.filter((map) => map.slot === slot),
  );
  const files: MaterialMapExportV1['files'] = [];
  const maps: MaterialMapExportMapV1[] = [];
  const previewMaps: { slot: MaterialLibrarySlot; usage: StoredMap['usage']; png: Uint8Array }[] =
    [];
  const previewSize = Math.min(size, MATERIAL_MAP_EXPORT_LIMITS.maxPreviewMapSize);
  for (const map of ordered) {
    const exported = await exportMap(record, map, size);
    const file = `${id}.${map.slot}.png`;
    const { slot, ...entry } = exported.entry;
    maps.push({ slot, file, ...entry });
    files.push({ name: file, bytes: exported.bytes });
    previewMaps.push({
      slot: map.slot,
      usage: map.usage,
      png:
        previewSize === size
          ? exported.bytes
          : await encodePng(
              resampleMaterialMapPixels(exported.pixels, size, size, previewSize, {
                colorSpace: map.colorSpace,
                normal: map.slot === 'normal',
                wrap: exported.entry.wrap,
              }),
              previewSize,
              previewSize,
            ),
    });
  }
  const planeMeters = tiles * repeat;
  const rendered = await renderPreview(
    await previewGlb(manifest, previewMaps, tiles, planeMeters),
    options,
  );
  const previewFile = `${id}.preview.png`;
  files.push({ name: previewFile, bytes: rendered.png });
  const sidecar: MaterialMapExportSidecarV1 = {
    version: 'kiln.material-maps.v1',
    material: {
      materialId: id,
      revisionId: manifest.revisionId,
      name: manifest.name,
      tileable: manifest.tileable,
      ...(manifest.physicalSizeMeters
        ? { physicalSizeMeters: { ...manifest.physicalSizeMeters } }
        : {}),
      parameters: structuredClone(manifest.parameters),
      sources: structuredClone(manifest.sources),
    },
    size: { width: size, height: size },
    repeatMeters: { width: repeat, height: repeat },
    resampleFilter: MATERIAL_MAP_RESAMPLE_FILTER,
    maps,
    preview: {
      file: previewFile,
      sha256: digest(rendered.png),
      bytes: rendered.png.length,
      ...materialPngDimensions(rendered.png),
      tiles,
      planeMeters,
      mapSize: previewSize,
      camera: { ...PREVIEW_CAMERA },
      rendererId: rendered.rendererId,
      viewFidelity: rendered.viewFidelity,
    },
  };
  files.push({
    name: `${id}.maps.json`,
    bytes: new TextEncoder().encode(`${JSON.stringify(sidecar, null, 2)}\n`),
  });
  return { sidecar, files };
}

/**
 * Write the maps, the preview and then the sidecar into `outDir`. Every destination must be
 * new: an existing file stops the export and this call's published files are rolled back.
 */
export async function exportMaterialMaps(
  record: MaterialRecord,
  options: MaterialMapExportOptionsV1,
): Promise<MaterialMapExportResultV1> {
  const created = await createMaterialMapExport(record, options);
  const directory = resolve(options.outDir);
  const outputs = created.files.map(({ name, bytes }) => ({
    path: join(directory, name),
    data: bytes,
  }));
  await writeNewDestinationsAtomic(outputs);
  return {
    directory,
    sidecarPath: outputs.at(-1)!.path,
    previewPath: outputs.at(-2)!.path,
    files: outputs.map(({ path }) => path),
    sidecar: created.sidecar,
  };
}
