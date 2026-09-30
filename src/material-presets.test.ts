import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { createMaterialPresetDraft, listMaterialPresets } from './material-presets';
import { createMaterialRecordV1, verifyMaterialRecordV1 } from './material-library-node';

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
test('shipped preset catalog covers five useful families with deterministic complete map recipes', async () => {
  const presets = listMaterialPresets();
  expect(new Set(presets.map((item) => item.family))).toEqual(
    new Set(['architecture', 'wood', 'metal', 'fabric', 'ground']),
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
