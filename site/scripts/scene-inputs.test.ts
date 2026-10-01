import { expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { checkedSceneArchive } from './scene-inputs.mjs';
import { hashBytes } from './mirror-core.mjs';

test('scene archives are hash pinned and refuse unsafe members before extraction', () => {
  const bytes = zipSync({ 'assets/pack.json': strToU8('{}') });
  const record = { bytes: bytes.length, sha256: hashBytes(bytes), path: 'scene.zip' };
  expect(Object.keys(checkedSceneArchive(bytes, record))).toEqual(['assets/pack.json']);
  expect(() => checkedSceneArchive(bytes, { ...record, sha256: '0'.repeat(64) })).toThrow('verification failed');
  const unsafe = zipSync({ '../outside.txt': strToU8('no') });
  expect(() => checkedSceneArchive(unsafe, { ...record, bytes: unsafe.length, sha256: hashBytes(unsafe) })).toThrow('Unsafe asset path');
});
