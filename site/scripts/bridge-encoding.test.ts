import { expect, test } from 'bun:test';
import { repairBridgeMetadata } from './bridge-encoding.mjs';

test('explicit legacy Bridge migration preserves JSON and changes only the seven symbol bytes', () => {
  const text = '{"tile_layout":"near ±2, mid ±6 with ±2 hole, far ±20 with ±6 hole","water_inputs":{"signed_shore_distance":"clamped ±300"},"collision":{"conservative_filter":"512²"},"number":12.5,"files":[{"sha256":"abc","bytes":42}]}';
  const legacy = Uint8Array.from([...text].map(char => char.charCodeAt(0)));
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(legacy)).toThrow();
  const repaired = repairBridgeMetadata(legacy);
  expect(new TextDecoder('utf-8', { fatal: true }).decode(repaired)).toBe(text);
  expect(JSON.parse(new TextDecoder().decode(repaired))).toEqual(JSON.parse(text));
  expect(repaired.length).toBe(legacy.length + 7);
});

test('migration refuses unexpected legacy bytes, symbol counts and already valid inputs', () => {
  expect(() => repairBridgeMetadata(Buffer.from('{"value":"clean"}'))).toThrow();
  expect(() => repairBridgeMetadata(Uint8Array.of(0xb1, 0xb2, 0xe9))).toThrow();
  expect(() => repairBridgeMetadata(Uint8Array.of(0xb1, 0xb2))).toThrow();
});
