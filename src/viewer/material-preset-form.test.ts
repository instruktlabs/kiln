import { expect, test } from 'bun:test';
import { materialPresetRequest } from './material-preset-form';

const fields = {
  presetId: 'wood-grain',
  seed: '19',
  size: '64',
  creator: 'Viewer qualification',
  spdx: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: '',
};
test('preset form preserves explicit provenance and deterministic generation options', () => {
  expect(materialPresetRequest(fields)).toEqual({
    presetId: 'wood-grain',
    seed: 19,
    size: 64,
    creator: 'Viewer qualification',
    license: { spdx: fields.spdx, url: fields.url, attribution: '' },
  });
  expect(materialPresetRequest({ ...fields, seed: '0' }).seed).toBe(0);
});
test('preset form does not invent a seed or license and rejects invalid sizes', () => {
  for (const patch of [
    { seed: '' },
    { seed: '1.5' },
    { spdx: '' },
    { url: '' },
    { creator: '' },
    { size: '1024' },
  ])
    expect(() => materialPresetRequest({ ...fields, ...patch })).toThrow();
});
