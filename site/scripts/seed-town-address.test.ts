import { expect, test } from 'bun:test';
import { MAX_SEED_LENGTH, readTownAddress, townSearch } from '../src/scenes/seed-town-address';

test('the address names the seed and the hour; an absent or empty seed leaves the scene its default', () => {
  expect(readTownAddress('?seed=amberbridge&hour=dusk')).toEqual({ seed: 'amberbridge', dusk: true });
  expect(readTownAddress('?seed=amberbridge')).toEqual({ seed: 'amberbridge', dusk: false });
  expect(readTownAddress('')).toEqual({ seed: undefined, dusk: false });
  expect(readTownAddress('?hour=dusk')).toEqual({ seed: undefined, dusk: true });
  expect(readTownAddress('?seed=')).toEqual({ seed: undefined, dusk: false });
  expect(readTownAddress('?seed=%20%20%09')).toEqual({ seed: undefined, dusk: false });
  expect(readTownAddress('?hour=day').dusk).toBe(false);
  expect(readTownAddress('?hour=%20Dusk%20').dusk).toBe(true);
});

test('a seed from the address is trimmed, its whitespace folded and its length bounded', () => {
  expect(readTownAddress('?seed=%20old%20%20%0Atown%20').seed).toBe('old town');
  expect(readTownAddress('?seed=a+b').seed).toBe('a b');
  const long = readTownAddress(`?seed=${'x'.repeat(5000)}`).seed;
  expect(long).toBe('x'.repeat(MAX_SEED_LENGTH));
  expect(MAX_SEED_LENGTH).toBe(40);
  // A cut never leaves half of a surrogate pair behind.
  const emoji = readTownAddress(`?seed=${encodeURIComponent(`${'a'.repeat(MAX_SEED_LENGTH - 1)}\u{1F3E0}`)}`).seed!;
  expect(emoji).toBe('a'.repeat(MAX_SEED_LENGTH - 1));
});

test('odd input never throws', () => {
  for (const search of ['?seed=%', '?seed=%E0%A4%A', '?=&&==', '?seed=a&seed=b', '%%%', '?\u0000seed=\u0000', 'seed=plain'] as const) {
    expect(() => readTownAddress(search)).not.toThrow();
  }
  expect(readTownAddress('?seed=a&seed=b').seed).toBe('a');
  expect(readTownAddress('seed=plain').seed).toBe('plain');
  expect(readTownAddress('?seed=%00x%1F').seed).toBe('x');
  expect(() => readTownAddress(undefined as unknown as string)).not.toThrow();
  expect(readTownAddress(undefined as unknown as string)).toEqual({ seed: undefined, dusk: false });
});

test('the address follows the town, keeps other parameters and names the hour only at dusk', () => {
  expect(townSearch('', { seed: 'amberbridge', dusk: false })).toBe('?seed=amberbridge');
  expect(townSearch('', { seed: 'amberbridge', dusk: true })).toBe('?seed=amberbridge&hour=dusk');
  expect(townSearch('?tier=economy&seed=old&hour=dusk', { seed: 'new', dusk: false })).toBe('?tier=economy&seed=new');
  expect(townSearch('?tier=economy', { seed: 'old town', dusk: true })).toBe('?tier=economy&seed=old+town&hour=dusk');
  expect(townSearch('?seed=x&hour=dusk', { seed: '   ', dusk: false })).toBe('');
  expect(townSearch('?a=1', { seed: 'y'.repeat(100), dusk: false })).toBe(`?a=1&seed=${'y'.repeat(MAX_SEED_LENGTH)}`);
  // What the address writes reads back as the same town.
  const search = townSearch('?tier=high', { seed: ' café & 日本 ', dusk: true });
  expect(readTownAddress(search)).toEqual({ seed: 'café & 日本', dusk: true });
  expect(() => townSearch('%%%', { seed: 'z', dusk: false })).not.toThrow();
});
