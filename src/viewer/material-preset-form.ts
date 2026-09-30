import type { MaterialPresetOptions } from '../material-presets';

export interface MaterialPresetFields {
  presetId: string;
  seed: string;
  size: string;
  creator: string;
  spdx: string;
  url: string;
  attribution: string;
}

export function materialPresetRequest(fields: MaterialPresetFields) {
  if (!fields.presetId.trim()) throw new Error('Choose a material preset');
  if (!fields.seed.trim()) throw new Error('Enter an explicit seed');
  const seed = Number(fields.seed),
    size = Number(fields.size);
  if (!Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647)
    throw new Error('Seed must be a signed 32-bit integer');
  if (![64, 128, 256, 512].includes(size)) throw new Error('Choose a supported map size');
  if (!fields.creator.trim() || !fields.spdx.trim() || !fields.url.trim())
    throw new Error('Creator and license details are required');
  const url = new URL(fields.url.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('License URL must be HTTP(S)');
  // The server applies the shared authoritative schema. Keep its texture compiler out of the browser.
  return {
    presetId: fields.presetId,
    seed,
    size: size as MaterialPresetOptions['size'],
    creator: fields.creator.trim(),
    license: { spdx: fields.spdx.trim(), url: fields.url.trim(), attribution: fields.attribution },
  };
}
