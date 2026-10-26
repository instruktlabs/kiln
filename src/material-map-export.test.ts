import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { materialPngDimensions, type MaterialRecord } from './material-library';
import { createMaterialRecordV1, exportMaterialMaps } from './material-library-node';
import type { PbrRenderPort } from './composer/render-port';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const source = {
  id: 'authored',
  kind: 'procedural' as const,
  provider: 'Kiln',
  creator: 'Fixture',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
  originalFiles: [],
};
const noise = (usage: 'albedo' | 'normal' | 'metallicRoughness', size = 8) => ({
  schemaVersion: 2 as const,
  usage,
  size,
  layers: [
    {
      op: 'noise' as const,
      colorA: 0x404040,
      colorB: 0xc0c0c0,
      seed: 7,
      scale: 4,
      octaves: 2,
      blend: 'normal' as const,
      opacity: 1,
    },
  ],
});

let root: string;
let record: MaterialRecord;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-material-maps-'));
  record = await createMaterialRecordV1({
    materialId: 'leaf-litter',
    name: 'Leaf litter',
    tileable: true,
    physicalSizeMeters: { width: 4, height: 4 },
    sources: [source],
    maps: [
      { slot: 'baseColor', sourceId: 'authored', transforms: [], procedural: noise('albedo') },
      {
        slot: 'normal',
        sourceId: 'authored',
        transforms: [],
        procedural: noise('normal'),
        derive: { kind: 'normal-from-height', strength: 4 },
      },
      {
        slot: 'metallicRoughness',
        sourceId: 'authored',
        transforms: [],
        procedural: noise('metallicRoughness'),
      },
    ],
  });
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test('exports each map as a PNG at the stated size with a hashed sidecar and a planar preview', async () => {
  const outDir = join(root, 'cpu');
  const result = await exportMaterialMaps(record, { outDir, size: 16, repeatMeters: 4 });
  const names = (await readdir(outDir)).sort();
  expect(names).toEqual([
    'leaf-litter.baseColor.png',
    'leaf-litter.maps.json',
    'leaf-litter.metallicRoughness.png',
    'leaf-litter.normal.png',
    'leaf-litter.preview.png',
  ]);
  const sidecar = JSON.parse(await readFile(join(outDir, 'leaf-litter.maps.json'), 'utf8'));
  expect(sidecar).toEqual(result.sidecar);
  expect(sidecar.version).toBe('kiln.material-maps.v1');
  expect(sidecar.material).toMatchObject({
    materialId: 'leaf-litter',
    revisionId: record.manifest.revisionId,
    name: 'Leaf litter',
    tileable: true,
  });
  expect(sidecar.material.sources[0].license.spdx).toBe('CC0-1.0');
  expect(sidecar.size).toEqual({ width: 16, height: 16 });
  expect(sidecar.repeatMeters).toEqual({ width: 4, height: 4 });
  const bySlot = Object.fromEntries(
    sidecar.maps.map((map: { slot: string }) => [map.slot, map]),
  ) as Record<string, Record<string, unknown>>;
  expect(Object.keys(bySlot).sort()).toEqual(['baseColor', 'metallicRoughness', 'normal']);
  expect(bySlot['baseColor']!['colorSpace']).toBe('srgb');
  expect(bySlot['normal']!['colorSpace']).toBe('linear');
  expect(bySlot['metallicRoughness']!['colorSpace']).toBe('linear');
  expect(bySlot['normal']!['normalConvention']).toBe('opengl');
  expect(bySlot['metallicRoughness']!['channelPacking']).toBe('r-occlusion-g-roughness-b-metallic');
  // A V2 layer recipe is UV-space and is regenerated at the requested size. A height-derived
  // normal depends on texel spacing, so its stored pixels are resampled instead.
  expect(bySlot['baseColor']!['method']).toBe('recipe');
  expect(bySlot['normal']!['method']).toBe('resampled');
  for (const map of sidecar.maps) {
    const bytes = await readFile(join(outDir, map.file));
    expect(materialPngDimensions(bytes)).toEqual({ width: 16, height: 16 });
    expect(map).toMatchObject({ width: 16, height: 16, bytes: bytes.length, sha256: sha(bytes) });
    const stored = record.manifest.maps.find((item) => item.slot === map.slot)!;
    expect(map.source).toEqual({
      file: stored.file,
      sha256: stored.sha256,
      width: stored.width,
      height: stored.height,
    });
  }
  const preview = await readFile(join(outDir, 'leaf-litter.preview.png'));
  expect(sidecar.preview).toMatchObject({
    file: 'leaf-litter.preview.png',
    sha256: sha(preview),
    bytes: preview.length,
    tiles: 3,
    planeMeters: 12,
  });
  // No render port: a CPU geometry view, never material evidence.
  expect(sidecar.preview.rendererId).toStartWith('cpu-raster');
  expect(sidecar.preview.viewFidelity).toMatchObject({
    version: 'kiln.view-fidelity.v1',
    materialFaithful: false,
    delivered: 'geometry-flat',
    rendererId: sidecar.preview.rendererId,
    degraded: true,
  });
  expect(sidecar.preview.viewFidelity.reasonCodes).toContain('FULL_MATERIAL_RENDER_UNAVAILABLE');
  expect(materialPngDimensions(preview).width).toBeGreaterThan(0);
  expect(result.files.sort()).toEqual(names.map((name) => join(outDir, name)).sort());
}, 60_000); // In-process CPU preview plus three PNG encodes; measured below 3 s on an idle host.

test('a stored size passes the exact stored bytes through and resampling is deterministic', async () => {
  const a = await exportMaterialMaps(record, {
    outDir: join(root, 'same-a'),
    size: 8,
    repeatMeters: 2,
    tiles: 2,
  });
  const b = await exportMaterialMaps(record, {
    outDir: join(root, 'same-b'),
    size: 8,
    repeatMeters: 2,
    tiles: 2,
  });
  expect(a.sidecar).toEqual(b.sidecar);
  for (const map of a.sidecar.maps) {
    expect(map.method).toBe('copy');
    expect(map.sha256).toBe(map.source.sha256);
  }
  expect(a.sidecar.preview.tiles).toBe(2);
  expect(a.sidecar.preview.planeMeters).toBe(4);
  const c = await exportMaterialMaps(record, {
    outDir: join(root, 'c'),
    size: 12,
    repeatMeters: 2,
  });
  const d = await exportMaterialMaps(record, {
    outDir: join(root, 'd'),
    size: 12,
    repeatMeters: 2,
  });
  expect(c.sidecar.maps).toEqual(d.sidecar.maps);
}, 60_000);

test('resampled normals stay unit length', async () => {
  const outDir = join(root, 'wrap');
  await exportMaterialMaps(record, { outDir, size: 13, repeatMeters: 4 });
  const { data, info } = await sharp(await readFile(join(outDir, 'leaf-litter.normal.png')))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(13);
  for (let i = 0; i < data.length; i += 4) {
    const [x, y, z] = [0, 1, 2].map((c) => (data[i + c]! / 255) * 2 - 1);
    expect(Math.abs(Math.hypot(x!, y!, z!) - 1)).toBeLessThan(0.02);
  }
});

test('resampling follows the tile edge: a tileable map wraps, a non-tileable one clamps', async () => {
  // One white column at the left edge of an 8 x 8 black base colour map.
  const pixels = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++) pixels.fill(255, y * 32, y * 32 + 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const png = new Uint8Array(
    await sharp(pixels, { raw: { width: 8, height: 8, channels: 4 } })
      .png()
      .toBuffer(),
  );
  const lastColumn = async (tileable: boolean) => {
    const external = await createMaterialRecordV1({
      materialId: tileable ? 'edge-wrap' : 'edge-clamp',
      name: 'Edge',
      tileable,
      sources: [
        {
          id: 'scan',
          kind: 'external',
          provider: 'Fixture',
          creator: 'Fixture',
          assetUrl: 'https://example.com/edge',
          license: source.license,
          originalFiles: [{ name: 'edge.png', sha256: sha(png), bytes: png.length }],
        },
      ],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'scan',
          transforms: [],
          bytes: png,
          originalFile: 'edge.png',
        },
      ],
    });
    const outDir = join(root, `edge-${tileable}`);
    const { sidecar } = await exportMaterialMaps(external, { outDir, size: 16, repeatMeters: 1 });
    expect(sidecar.maps[0]).toMatchObject({ method: 'resampled' });
    const id = external.manifest.materialId;
    const { data } = await sharp(await readFile(join(outDir, `${id}.baseColor.png`)))
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data[(5 * 16 + 15) * 4]!;
  };
  expect(await lastColumn(true)).toBeGreaterThan(64);
  expect(await lastColumn(false)).toBe(0);
}, 60_000);

test('refuses to replace any existing output and writes nothing', async () => {
  const outDir = join(root, 'existing');
  const first = await exportMaterialMaps(record, { outDir, size: 16, repeatMeters: 4 });
  const before = await Promise.all(first.files.map((file) => readFile(file)));
  await expect(exportMaterialMaps(record, { outDir, size: 16, repeatMeters: 4 })).rejects.toThrow(
    /already exists/,
  );
  expect(await Promise.all(first.files.map((file) => readFile(file)))).toEqual(before);
  // One existing output, published last, rolls back every file this call had published.
  const partial = join(root, 'partial');
  await mkdir(partial);
  await writeFile(join(partial, 'leaf-litter.preview.png'), 'keep');
  await expect(
    exportMaterialMaps(record, { outDir: partial, size: 8, repeatMeters: 1 }),
  ).rejects.toThrow(/already exists/);
  expect(await readdir(partial)).toEqual(['leaf-litter.preview.png']);
  expect(await readFile(join(partial, 'leaf-litter.preview.png'), 'utf8')).toBe('keep');
}, 60_000);

test('rejects bad sizes, repeats and tile counts before writing', async () => {
  const outDir = join(root, 'invalid');
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ size: 0, repeatMeters: 1 }, /size/],
    [{ size: 3, repeatMeters: 1 }, /size/],
    [{ size: 4097, repeatMeters: 1 }, /size/],
    [{ size: 15.5, repeatMeters: 1 }, /size/],
    [{ size: Number.NaN, repeatMeters: 1 }, /size/],
    [{ size: 16, repeatMeters: 0 }, /repeat/],
    [{ size: 16, repeatMeters: -2 }, /repeat/],
    [{ size: 16, repeatMeters: Number.POSITIVE_INFINITY }, /repeat/],
    [{ size: 16, repeatMeters: 1, tiles: 0 }, /tiles/],
    [{ size: 16, repeatMeters: 1, tiles: 9 }, /tiles/],
    [{ size: 16, repeatMeters: 1, tiles: 2.5 }, /tiles/],
  ];
  for (const [options, message] of cases)
    await expect(
      exportMaterialMaps(record, { outDir, ...(options as { size: number }) }),
    ).rejects.toThrow(message);
  await expect(readdir(outDir)).rejects.toThrow();
});

test('repeat defaults to a square physical size and is required otherwise', async () => {
  const defaulted = await exportMaterialMaps(record, { outDir: join(root, 'default'), size: 8 });
  expect(defaulted.sidecar.repeatMeters).toEqual({ width: 4, height: 4 });
  const { physicalSizeMeters: _, ...manifest } = record.manifest;
  const unsized = { ...record, manifest } as MaterialRecord;
  await expect(
    exportMaterialMaps(unsized, { outDir: join(root, 'unsized'), size: 8 }),
  ).rejects.toThrow(/repeat/);
}, 60_000);

test('the preview routes through an injected render port and records its fidelity', async () => {
  const cell = await sharp({
    create: { width: 384, height: 384, channels: 4, background: { r: 90, g: 70, b: 40, alpha: 1 } },
  })
    .png()
    .toBuffer();
  let requests = 0;
  const port: PbrRenderPort = async (request) => {
    requests++;
    expect(request.glb.byteLength).toBeGreaterThan(0);
    return {
      ok: true,
      rendererId: 'fixture-gpu',
      viewsPng: (request.viewDirs ?? [[0, 0, 1]]).map(() => new Uint8Array(cell)),
    };
  };
  const gpu = await exportMaterialMaps(record, {
    outDir: join(root, 'gpu'),
    size: 8,
    repeatMeters: 4,
    viewRenderPort: port,
  });
  expect(requests).toBe(1);
  expect(gpu.sidecar.preview.rendererId).toBe('fixture-gpu');
  expect(gpu.sidecar.preview.viewFidelity).toMatchObject({
    materialFaithful: true,
    delivered: 'full-material',
    degraded: false,
    rendererId: 'fixture-gpu',
  });

  const failing: PbrRenderPort = async () => ({ ok: false, rendererId: '', error: 'no adapter' });
  const degraded = await exportMaterialMaps(record, {
    outDir: join(root, 'degraded'),
    size: 8,
    repeatMeters: 4,
    viewRenderPort: failing,
  });
  expect(degraded.sidecar.preview.rendererId).toStartWith('cpu-raster');
  expect(degraded.sidecar.preview.viewFidelity).toMatchObject({
    materialFaithful: false,
    degraded: true,
    degradeReason: 'no adapter',
  });

  const requiredDir = join(root, 'required');
  await expect(
    exportMaterialMaps(record, {
      outDir: requiredDir,
      size: 8,
      repeatMeters: 4,
      viewRenderPort: failing,
      viewRenderRequired: true,
    }),
  ).rejects.toThrow(/GPU/);
  await expect(readdir(requiredDir)).rejects.toThrow();
}, 60_000);
