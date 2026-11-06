import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { MaterialRecordV1 } from './material-library';
import {
  createMaterialRecordV1,
  exportMaterialMaps,
  type MaterialDraftV1,
  verifyMaterialRecordV1,
} from './material-library-node';
import type { ProceduralLayer } from './procedural-material-v2';
import { compileProceduralTextureSpecV2 } from './procedural-texture';

const packed = (roughness: number): number => (255 << 16) | (roughness << 8);
const source = {
  id: 'authored',
  kind: 'procedural' as const,
  provider: 'Cellular worked example',
  creator: 'Kiln',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
  originalFiles: [],
};

type Usage = 'albedo' | 'normal' | 'metallicRoughness';
const recipe = (usage: Usage, layers: ProceduralLayer[]) => ({
  schemaVersion: 2 as const,
  size: 256,
  usage,
  layers,
});

function draft(
  materialId: string,
  meters: number,
  albedo: ProceduralLayer[],
  height: ProceduralLayer[],
  strength: number,
  rough: ProceduralLayer[],
): MaterialDraftV1 {
  return {
    materialId,
    name: materialId,
    tags: ['rock', 'procedural'],
    tileable: true,
    physicalSizeMeters: { width: meters, height: meters },
    parameters: { metalness: 1, roughness: 1 },
    sources: [source],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: recipe('albedo', albedo),
      },
      {
        slot: 'normal',
        sourceId: 'authored',
        transforms: [],
        procedural: recipe('normal', height),
        derive: { kind: 'normal-from-height', strength },
      },
      {
        slot: 'metallicRoughness',
        sourceId: 'authored',
        transforms: [],
        procedural: recipe('metallicRoughness', rough),
      },
    ],
  };
}

const cell = (fields: Record<string, unknown>, colorA: number, colorB: number): ProceduralLayer =>
  ({ op: 'cellular', ...fields, colorA, colorB }) as ProceduralLayer;

// One seed and one cell layout through every layer of every map, so the joints line up.
const stones = {
  cellsX: 7,
  cellsY: 11,
  seed: 41,
  jitterX: 0.8,
  jitterY: 0.3,
  metricY: 1.5,
  weight: 0.2,
};
const rubble = draft(
  'cellular-rubble',
  2,
  [
    cell({ ...stones, feature: 'cell' }, 0x6a6358, 0xb3a892),
    {
      op: 'noise',
      colorA: 0x3c3a36,
      colorB: 0xc8c4bc,
      scale: 32,
      octaves: 4,
      seed: 41,
      blend: 'overlay',
      opacity: 0.55,
    },
    cell({ ...stones, feature: 'f2-f1', range: 0.14, blend: 'multiply' }, 0x2b2722, 0xffffff),
  ],
  [
    cell({ ...stones, feature: 'f2-f1', range: 0.42 }, 0x000000, 0xe0e0e0),
    {
      op: 'noise',
      colorA: 0x404040,
      colorB: 0xc0c0c0,
      scale: 32,
      octaves: 4,
      seed: 42,
      blend: 'overlay',
      opacity: 0.35,
    },
  ],
  3,
  [
    cell({ ...stones, feature: 'cell' }, packed(170), packed(225)),
    {
      op: 'noise',
      colorA: packed(120),
      colorB: packed(210),
      scale: 32,
      octaves: 3,
      seed: 43,
      blend: 'overlay',
      opacity: 0.5,
    },
  ],
);

// One flat tone per crystal. `range` on `cell` leaves about a sixth of the biotite grid dark.
const quartz = { cellsX: 64, cellsY: 64, seed: 7, weight: 0.5 };
const feldspar = { cellsX: 38, cellsY: 38, seed: 12, weight: 0.7 };
const biotite = { cellsX: 72, cellsY: 72, seed: 19, weight: 0.6, feature: 'cell', range: 0.16 };
const granite = draft(
  'cellular-granite',
  1,
  [
    cell({ ...quartz, feature: 'cell' }, 0x9a9794, 0xe4dfda),
    cell({ ...feldspar, feature: 'cell', range: 0.5, blend: 'multiply' }, 0xc4a999, 0xffffff),
    cell({ ...biotite, blend: 'multiply' }, 0x08080a, 0xffffff),
  ],
  [
    cell({ ...quartz, feature: 'facet', facetSlope: 0.9, facetBlend: 0.05 }, 0x404040, 0xc0c0c0),
    cell({ ...biotite, blend: 'multiply' }, 0xd8d8d8, 0xffffff),
  ],
  1,
  [
    cell({ ...quartz, feature: 'cell' }, packed(60), packed(140)),
    cell({ ...biotite, blend: 'multiply' }, packed(90), packed(255)),
  ],
);

// Blocks kept in beds by low vertical jitter and a vertical metric, tilted per cell, with about
// half the joints opened so that cracks end in T-junctions instead of closing every polygon.
const beds = {
  cellsX: 6,
  cellsY: 12,
  seed: 83,
  jitterX: 0.9,
  jitterY: 0.45,
  metricY: 2,
  weight: 0.25,
};
const facets = { ...beds, feature: 'facet', facetSlope: 0.9, facetBlend: 0.3 };
const joints = {
  ...beds,
  feature: 'border',
  borderOpen: 0.5,
  borderWidth: 0.06,
  blend: 'multiply',
};
const rock = draft(
  'cellular-fractured-rock',
  3,
  [
    cell({ ...beds, feature: 'cell' }, 0x6e6b65, 0x827e76),
    {
      op: 'noise',
      colorA: 0x38362f,
      colorB: 0xc4c0b4,
      scale: 24,
      octaves: 5,
      seed: 84,
      blend: 'overlay',
      opacity: 0.6,
    },
    cell({ ...facets, blend: 'multiply', opacity: 0.5 }, 0x606060, 0xffffff),
    cell(joints, 0xffffff, 0x16130f),
  ],
  [
    cell(facets, 0x000000, 0xffffff),
    cell(joints, 0xffffff, 0x000000),
    {
      op: 'noise',
      colorA: 0x505050,
      colorB: 0xb0b0b0,
      scale: 24,
      octaves: 5,
      seed: 85,
      blend: 'overlay',
      opacity: 0.3,
    },
  ],
  5,
  [
    cell({ ...beds, feature: 'cell' }, packed(180), packed(235)),
    {
      op: 'noise',
      colorA: packed(150),
      colorB: packed(235),
      scale: 24,
      octaves: 3,
      seed: 86,
      blend: 'overlay',
      opacity: 0.4,
    },
  ],
);

const EXAMPLES = [rubble, granite, rock];

interface Raster {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

async function read(path: string): Promise<Raster> {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Per channel and axis: the largest and mean difference across the wrap edge, against the same
 * statistics of every interior neighbouring line. A seam shows up as a wrap line unlike any other.
 */
function seamReport(raster: Raster): Array<{
  channel: number;
  axis: 'x' | 'y';
  wrapMax: number;
  interiorMax: number;
  wrapMean: number;
  interiorMeanMax: number;
}> {
  const { data, width, height, channels } = raster;
  const at = (x: number, y: number, c: number): number => data[(y * width + x) * channels + c]!;
  const lines = (axis: 'x' | 'y', c: number, line: number): { max: number; mean: number } => {
    const length = axis === 'x' ? height : width;
    const size = axis === 'x' ? width : height;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < length; i++) {
      const a = axis === 'x' ? at(line, i, c) : at(i, line, c);
      const next = (line + 1) % size;
      const b = axis === 'x' ? at(next, i, c) : at(i, next, c);
      const difference = Math.abs(a - b);
      max = Math.max(max, difference);
      sum += difference;
    }
    return { max, mean: sum / length };
  };
  const report = [];
  for (let channel = 0; channel < Math.min(channels, 3); channel++) {
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? width : height;
      let interiorMax = 0;
      let interiorMeanMax = 0;
      for (let line = 0; line + 1 < size; line++) {
        const { max, mean } = lines(axis, channel, line);
        interiorMax = Math.max(interiorMax, max);
        interiorMeanMax = Math.max(interiorMeanMax, mean);
      }
      const wrap = lines(axis, channel, size - 1);
      report.push({
        channel,
        axis,
        wrapMax: wrap.max,
        interiorMax,
        wrapMean: wrap.mean,
        interiorMeanMax,
      });
    }
  }
  return report;
}

const records = new Map<string, MaterialRecordV1>();
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-cellular-materials-'));
  for (const example of EXAMPLES) {
    records.set(example.materialId, await createMaterialRecordV1(example));
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe.each(EXAMPLES.map((example) => [example.materialId, example] as const))(
  '%s worked example',
  (materialId, example) => {
    test('saves as a recipe-only revision with base colour, a derived normal and metallicRoughness', () => {
      const { manifest } = records.get(materialId)!;
      expect(manifest.maps.map((map) => map.slot).sort()).toEqual([
        'baseColor',
        'metallicRoughness',
        'normal',
      ]);
      for (const map of manifest.maps) {
        expect(map.procedural?.compiler).toBe('kiln.procedural-texture.v2');
      }
      const normal = manifest.maps.find((map) => map.slot === 'normal')!;
      expect(normal.procedural?.derive?.kind).toBe('normal-from-height');
      expect(manifest.sources[0]!.originalFiles).toEqual([]);
    });

    test('the same recipe and seed give the same hashes, and verification recompiles the bytes', async () => {
      const first = records.get(materialId)!;
      const again = await createMaterialRecordV1(example);
      expect(again.manifest.revisionId).toBe(first.manifest.revisionId);
      expect(again.manifest.maps.map((map) => map.procedural?.recipeHash)).toEqual(
        first.manifest.maps.map((map) => map.procedural?.recipeHash),
      );
      expect(again.manifest.maps.map((map) => map.procedural?.pixelHash)).toEqual(
        first.manifest.maps.map((map) => map.procedural?.pixelHash),
      );
      await verifyMaterialRecordV1(first);
    });

    for (const size of [256, 128]) {
      test(`--maps at ${size}: every slot tiles, as judged from the exported files`, async () => {
        const outDir = join(root, `${materialId}-${size}`);
        const { sidecar } = await exportMaterialMaps(records.get(materialId)!, {
          outDir,
          size,
          repeatMeters: 2,
        });
        expect(sidecar.maps).toHaveLength(3);
        for (const map of sidecar.maps) {
          const raster = await read(join(outDir, `${materialId}.${map.slot}.png`));
          expect([raster.width, raster.height]).toEqual([size, size]);
          for (const line of seamReport(raster)) {
            expect(line.wrapMax).toBeLessThanOrEqual(line.interiorMax);
            // Beds cluster joints on cell rows, and the wrap edge is always a row boundary sampled
            // dead-centre, so its average can lead its peers by a little (measured 13%). The
            // same-phase test below holds it to no margin at all.
            expect(line.wrapMean).toBeLessThanOrEqual(line.interiorMeanMax * 1.25);
          }
        }
      });
    }
  },
);

test('with every cell boundary in the same sampling phase, the wrap edge is one of its peers', async () => {
  // 16 cells on 256 texels puts every boundary between two texels, exactly like the wrap edge, so
  // the wrap line gets no phase advantage and has nothing to explain.
  const layout = { cellsX: 16, cellsY: 16, seed: 41, jitterX: 0.8, jitterY: 0.3, metricY: 1.5 };
  for (const fields of [
    { feature: 'f2-f1', range: 0.3 },
    { feature: 'cell' },
    { feature: 'border', borderOpen: 1 },
    { feature: 'facet', facetSlope: 1 },
  ]) {
    const { pixels } = compileProceduralTextureSpecV2({
      schemaVersion: 2,
      size: 256,
      usage: 'albedo',
      layers: [cell({ ...layout, ...fields }, 0x000000, 0xffffff)],
    });
    const across = (line: number): number => {
      const next = (line + 1) % 256;
      let sum = 0;
      for (let x = 0; x < 256; x++) {
        sum += Math.abs(pixels[(line * 256 + x) * 4]! - pixels[(next * 256 + x) * 4]!);
      }
      return sum;
    };
    const peers = Array.from({ length: 15 }, (_, k) => across((k + 1) * 16 - 1));
    expect(across(255)).toBeLessThanOrEqual(Math.max(...peers));
  }
});

test('negative control: the same check refuses a seam', async () => {
  // A linear ramp is the plainest non-tiling map: every interior step is small, the wrap is not.
  const seamed = await createMaterialRecordV1({
    materialId: 'seamed-ramp',
    name: 'Seamed ramp',
    tags: [],
    tileable: true,
    physicalSizeMeters: { width: 1, height: 1 },
    parameters: { metalness: 1, roughness: 1 },
    sources: [source],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: recipe('albedo', [
          { op: 'gradient', from: 0x000000, to: 0xffffff, angleDeg: 0 },
        ]),
      },
    ],
  });
  const outDir = join(root, 'seamed');
  await exportMaterialMaps(seamed, { outDir, size: 64, repeatMeters: 1 });
  const lines = seamReport(await read(join(outDir, 'seamed-ramp.baseColor.png')));
  expect(lines.some((line) => line.wrapMax > line.interiorMax)).toBe(true);
  expect(lines.some((line) => line.wrapMean > line.interiorMeanMax * 1.25)).toBe(true);
});

test('a tampered stored map is refused by the recompile', async () => {
  const record = records.get('cellular-rubble')!;
  const name = record.manifest.maps[0]!.file;
  const bytes = Uint8Array.from(record.files[name]!);
  // Flip a byte inside the PNG's image data. Any change must fail, whichever check catches it.
  bytes[bytes.length - 40]! ^= 0xff;
  await expect(
    verifyMaterialRecordV1({ ...record, files: { ...record.files, [name]: bytes } }),
  ).rejects.toThrow();
});
