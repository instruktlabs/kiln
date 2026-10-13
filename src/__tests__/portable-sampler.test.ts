import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { canonicalizePortableSamplerV1 } from '../portable-sampler';
import { applyPortableSamplerV1 } from '../portable-sampler-runtime';

const input = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'repeat',
  wrapT: 'clamp-to-edge',
} as const;
test('samplers require exact portable data and do not invoke accessors', () => {
  const canonical = canonicalizePortableSamplerV1(input);
  expect(canonical).toEqual(input);
  expect(canonical).not.toBe(input);
  for (const value of [
    undefined,
    null,
    [],
    { ...input, flipY: true },
    { ...input, minFilter: 9728 },
    { ...input, magFilter: 'nearest-mipmap-nearest' },
    { ...input, wrapT: 'border' },
  ])
    expect(() => canonicalizePortableSamplerV1(value)).toThrow();
  for (const key of Object.keys(input)) {
    const incomplete = { ...input };
    delete (incomplete as Record<string, unknown>)[key];
    expect(() => canonicalizePortableSamplerV1(incomplete)).toThrow();
  }
  let invoked = false;
  const accessor = { ...input };
  Object.defineProperty(accessor, 'minFilter', {
    enumerable: true,
    get() {
      invoked = true;
      return 'nearest';
    },
  });
  expect(() => canonicalizePortableSamplerV1(accessor)).toThrow();
  expect(invoked).toBe(false);
});
test('every portable filter/wrap maps to actual Three constants and mip generation', () => {
  const filters = [
    ['nearest', THREE.NearestFilter],
    ['linear', THREE.LinearFilter],
    ['nearest-mipmap-nearest', THREE.NearestMipmapNearestFilter],
    ['linear-mipmap-nearest', THREE.LinearMipmapNearestFilter],
    ['nearest-mipmap-linear', THREE.NearestMipmapLinearFilter],
    ['linear-mipmap-linear', THREE.LinearMipmapLinearFilter],
  ] as const;
  const wraps = [
    ['repeat', THREE.RepeatWrapping],
    ['clamp-to-edge', THREE.ClampToEdgeWrapping],
    ['mirrored-repeat', THREE.MirroredRepeatWrapping],
  ] as const;
  for (const [minFilter, expected] of filters)
    for (const [wrapS, wrap] of wraps) {
      const texture = new THREE.DataTexture(new Uint8Array(16), 2, 2);
      const result = applyPortableSamplerV1(
        texture,
        canonicalizePortableSamplerV1({ minFilter, magFilter: 'linear', wrapS, wrapT: 'repeat' }),
      );
      expect(result).toBe(texture);
      expect(texture.minFilter).toBe(expected);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.wrapS).toBe(wrap);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.generateMipmaps).toBe(minFilter.includes('mipmap'));
      expect(texture.flipY).toBe(false);
      texture.dispose();
    }
});
test('inherited allowlist names never admit extra own JSON fields', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const value = JSON.parse(
      `{"minFilter":"nearest","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat","${key}":"unexpected"}`,
    );
    expect(() => canonicalizePortableSamplerV1(value)).toThrow();
  }
});
