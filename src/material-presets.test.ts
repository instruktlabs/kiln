import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import {
  createMaterialPresetDraft,
  createMaterialPresetDraftAny,
  listMaterialPresets,
} from './material-presets';
import {
  createMaterialRecordV1,
  createMaterialRecordV2,
  verifyMaterialRecord,
  verifyMaterialRecordV1,
} from './material-library-node';

const options = {
  seed: 19,
  size: 64 as const,
  creator: 'Fixture author',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
};
test('shipped preset catalog covers its families with deterministic complete map recipes', async () => {
  const presets = listMaterialPresets().filter((item) => item.recordSchemaVersion === 1);
  expect(new Set(listMaterialPresets().map((item) => item.family))).toEqual(
    new Set(['architecture', 'wood', 'metal', 'fabric', 'ground', 'rock', 'foliage', 'fiber']),
  );
  for (const preset of presets) {
    const draft = createMaterialPresetDraft(preset.id, options);
    const record = await createMaterialRecordV1(draft);
    expect(record).toEqual(
      await createMaterialRecordV1(createMaterialPresetDraft(preset.id, options)),
    );
    expect(record.manifest.maps.map((map) => map.slot)).toEqual([
      'baseColor',
      'normal',
      'metallicRoughness',
    ]);
    expect(record.manifest.sources[0]?.creator).toBe(options.creator);
    expect(record.manifest.sources[0]?.license).toEqual(options.license);
    expect(record.manifest.maps[1]?.procedural?.derive).toMatchObject({
      kind: 'normal-from-height',
    });
    const normal = await sharp(record.files['normal.png']).raw().toBuffer();
    expect(new Set(normal).size).toBeGreaterThan(5);
    for (let i = 0; i < normal.length; i += 4) {
      const length = Math.hypot(
        normal[i]! / 127.5 - 1,
        normal[i + 1]! / 127.5 - 1,
        normal[i + 2]! / 127.5 - 1,
      );
      expect(length).toBeCloseTo(1, 1);
    }
    const changed = await createMaterialRecordV1(
      createMaterialPresetDraft(preset.id, { ...options, seed: 20 }),
    );
    expect(changed.manifest.revisionId).not.toBe(record.manifest.revisionId);
    await verifyMaterialRecordV1(record);
  }
});
test('presets require explicit bounded seed and provenance and return independent drafts', () => {
  expect(() => createMaterialPresetDraft('wood-grain', { ...options, seed: NaN })).toThrow();
  expect(() => createMaterialPresetDraft('wood-grain', { ...options, creator: '' })).toThrow();
  expect(() => createMaterialPresetDraft('https://example.com/code', options)).toThrow();
  const catalog = listMaterialPresets();
  catalog[0]!.name = 'mutated';
  expect(listMaterialPresets()[0]!.name).not.toBe('mutated');
});

const presetRecord = (id: string, seed = options.seed) => {
  const draft = createMaterialPresetDraftAny(id, { ...options, seed });
  return 'schemaVersion' in draft ? createMaterialRecordV2(draft) : createMaterialRecordV1(draft);
};
const NATURAL = [
  ['beach-sand', 'ground'],
  ['coral-limestone', 'rock'],
  ['coral-limestone-wet', 'rock'],
  ['palm-frond', 'foliage'],
  ['driftwood', 'wood'],
  ['thatch', 'fiber'],
] as const;
// The second set (#221): interior and craft surfaces from the Cove pass.
const SECOND = [
  ['lime-plaster', 'architecture'],
  ['oak', 'wood'],
  ['linen', 'fabric'],
  ['jute', 'fiber'],
  ['basalt', 'rock'],
  ['terracotta', 'architecture'],
  ['wicker', 'fiber'],
  ['brushed-brass', 'metal'],
] as const;

test('natural and second-set presets follow the three-map contract and are deterministic per seed', async () => {
  for (const [id, family] of [...NATURAL, ...SECOND]) {
    const summary = listMaterialPresets().find((item) => item.id === id);
    expect(summary).toMatchObject({ family, tags: [family, 'procedural'] });
    const record = await presetRecord(id);
    expect(record).toEqual(await presetRecord(id));
    expect((await presetRecord(id, 20)).manifest.revisionId).not.toBe(record.manifest.revisionId);
    expect(record.manifest.maps.map((map) => [map.slot, map.usage, map.colorSpace])).toEqual([
      ['baseColor', 'albedo', 'srgb'],
      ['normal', 'normal', 'linear'],
      ['metallicRoughness', 'metallicRoughness', 'linear'],
    ]);
    expect(record.manifest.tags).toEqual([family, 'procedural']);
    expect(record.manifest.physicalSizeMeters).toEqual(summary!.physicalSizeMeters);
    expect(record.manifest.sources[0]?.license).toEqual(options.license);
    await verifyMaterialRecord(record);
  }
});

test('the palm frond is an alpha-tested, double-sided cutout with a real silhouette', async () => {
  expect(() => createMaterialPresetDraft('palm-frond', options)).toThrow(
    /createMaterialPresetDraftAny/,
  );
  const record = await presetRecord('palm-frond');
  expect(record.manifest.schemaVersion).toBe(2);
  expect(record.manifest.parameters).toMatchObject({ alphaMode: 'mask', doubleSided: true });
  expect(record.manifest.tileable).toBe(false);
  const alpha = new Set<number>();
  const pixels = await sharp(record.files['baseColor.png']).raw().toBuffer();
  for (let i = 3; i < pixels.length; i += 4) alpha.add(pixels[i]!);
  expect(alpha).toEqual(new Set([0, 255]));
});

test('wet limestone darkens and smooths the dry stone while keeping its relief', async () => {
  const [dry, wet] = await Promise.all([
    presetRecord('coral-limestone'),
    presetRecord('coral-limestone-wet'),
  ]);
  const mean = async (bytes: Uint8Array, channel: number) => {
    const raw = await sharp(bytes).raw().toBuffer();
    let sum = 0;
    for (let i = channel; i < raw.length; i += 4) sum += raw[i]!;
    return sum / (raw.length / 4);
  };
  expect(await mean(wet.files['baseColor.png']!, 0)).toBeLessThan(
    0.8 * (await mean(dry.files['baseColor.png']!, 0)),
  );
  expect(await mean(wet.files['metallicRoughness.png']!, 1)).toBeLessThan(
    0.7 * (await mean(dry.files['metallicRoughness.png']!, 1)),
  );
  expect(wet.files['normal.png']).toEqual(dry.files['normal.png']);
});

test('brushed brass is a warm, fully metallic surface', async () => {
  const record = await presetRecord('brushed-brass');
  const raw = async (name: string) => sharp(record.files[name]).raw().toBuffer();
  const color = await raw('baseColor.png');
  let red = 0,
    blue = 0;
  for (let i = 0; i < color.length; i += 4) {
    red += color[i]!;
    blue += color[i + 2]!;
  }
  expect(red).toBeGreaterThan(1.5 * blue);
  const packed = await raw('metallicRoughness.png');
  for (let i = 2; i < packed.length; i += 4) expect(packed[i]).toBe(255);
});

test('the docs preset table matches the shipped catalog', () => {
  const docs = readFileSync(new URL('../docs/material-library.md', import.meta.url), 'utf8');
  const rows = [
    ...docs.matchAll(/^\| `([a-z-]+)` \| `([a-z]+)` \| ([\d.]+) × ([\d.]+) m \|/gm),
  ].map((row) => [row[1], row[2], Number(row[3]), Number(row[4])]);
  expect(rows).toEqual(
    listMaterialPresets().map((item) => [
      item.id,
      item.family,
      item.physicalSizeMeters.width,
      item.physicalSizeMeters.height,
    ]),
  );
});
