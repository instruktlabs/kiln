import { describe, expect, test } from 'bun:test';

import { buildSandboxGlobals } from '../primitives';
import { mulberry32 as shared, seededRandom, type SeededRandom } from '../seeded-random';

// Independent reference for the documented algorithm: FNV-1a (32-bit) over the seed's
// UTF-8 bytes, then mulberry32, the generator src/composer/layout.ts already uses.
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const draws = (rng: SeededRandom, n: number) => Array.from({ length: n }, () => rng.next());

describe('seededRandom', () => {
  test('hashes the seed with FNV-1a and draws with mulberry32', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
    // The engine's layout and material presets share this exact generator.
    for (const seed of [0, 1, 123, 0xffffffff])
      expect(Array.from({ length: 8 }, shared(seed))).toEqual(
        Array.from({ length: 8 }, mulberry32(seed)),
      );
    const reference = mulberry32(fnv1a('palm'));
    expect(draws(seededRandom('palm'), 8)).toEqual(Array.from({ length: 8 }, reference));
    // A number seed is hashed from its canonical decimal text, so 7 and '7' match.
    expect(draws(seededRandom(7), 4)).toEqual(draws(seededRandom('7'), 4));
    expect(draws(seededRandom(-0), 4)).toEqual(draws(seededRandom(0), 4));
  });

  test('the same seed gives the same sequence and different seeds differ', () => {
    expect(draws(seededRandom(42), 32)).toEqual(draws(seededRandom(42), 32));
    expect(draws(seededRandom('island'), 32)).toEqual(draws(seededRandom('island'), 32));
    expect(draws(seededRandom(42), 8)).not.toEqual(draws(seededRandom(43), 8));
    expect(draws(seededRandom('a'), 8)).not.toEqual(draws(seededRandom('b'), 8));
    for (const value of draws(seededRandom(1), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('fork(label) is stable per label and independent of parent draws', () => {
    const fresh = seededRandom('palm');
    const advanced = seededRandom('palm');
    draws(advanced, 17);
    advanced.int(0, 9);
    expect(draws(advanced.fork('crown'), 12)).toEqual(draws(fresh.fork('crown'), 12));
    expect(draws(fresh.fork('crown'), 12)).toEqual(draws(seededRandom('palm').fork('crown'), 12));
    // Forking does not consume or disturb the parent's own stream.
    const parent = seededRandom('palm');
    parent.fork('crown');
    expect(draws(parent, 6)).toEqual(draws(seededRandom('palm'), 6));
    // Labels and parent seeds select different streams; nested forks are deterministic.
    expect(draws(fresh.fork('crown'), 6)).not.toEqual(draws(fresh.fork('trunk'), 6));
    expect(draws(fresh.fork('crown'), 6)).not.toEqual(draws(seededRandom('reef').fork('crown'), 6));
    expect(draws(fresh.fork('crown'), 6)).not.toEqual(draws(seededRandom('palm'), 6));
    expect(draws(fresh.fork('a').fork('b'), 6)).toEqual(
      draws(seededRandom('palm').fork('a').fork('b'), 6),
    );
    expect(draws(fresh.fork('a').fork('b'), 6)).not.toEqual(draws(fresh.fork('b').fork('a'), 6));
  });

  test('range is half-open and int includes both ends like THREE.MathUtils.randInt', () => {
    const rng = seededRandom('bounds');
    const ints = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const n = rng.int(-1, 2);
      expect(Number.isInteger(n)).toBe(true);
      ints.add(n);
    }
    expect([...ints].sort((a, b) => a - b)).toEqual([-1, 0, 1, 2]);
    expect(rng.range(4, 4)).toBe(4);
    expect(rng.int(5, 5)).toBe(5);
    // Each helper consumes exactly one draw from the same stream.
    const a = seededRandom(9);
    const b = seededRandom(9);
    expect(a.range(10, 20)).toBe(10 + 10 * b.next());
    expect(a.int(0, 9)).toBe(Math.floor(b.next() * 10));
  });

  test('pick returns an element chosen by one draw', () => {
    const items = ['fan', 'spike', 'droop'] as const;
    const rng = seededRandom('pick');
    const twin = seededRandom('pick');
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const choice = rng.pick(items);
      expect(choice).toBe(items[twin.int(0, items.length - 1)]!);
      seen.add(choice);
    }
    expect(seen.size).toBe(3);
  });

  test('rejects invalid seeds, labels and bounds with named errors', () => {
    const bad = (fn: () => unknown, kind: typeof TypeError | typeof RangeError, text: RegExp) => {
      expect(fn).toThrow(kind);
      expect(fn).toThrow(text);
    };
    const call = seededRandom as unknown as (...args: unknown[]) => SeededRandom;
    bad(
      () => call(),
      TypeError,
      /seededRandom: seed must be a finite number or a non-empty string/,
    );
    bad(() => call(null), TypeError, /seed must be/);
    bad(() => call({}), TypeError, /seed must be/);
    bad(() => call(1n), TypeError, /seed must be/);
    bad(() => call(Number.NaN), RangeError, /seed must be finite/);
    bad(() => call(Infinity), RangeError, /seed must be finite/);
    bad(() => call(''), RangeError, /seed must be a non-empty string/);
    bad(() => call('x'.repeat(257)), RangeError, /at most 256/);
    bad(() => call(1, 2), TypeError, /exactly one seed/);
    const rng = seededRandom(1) as unknown as Record<string, (...args: unknown[]) => unknown>;
    bad(() => rng.fork!(''), RangeError, /fork: label must be a non-empty string/);
    bad(() => rng.fork!(3), TypeError, /fork: label must be/);
    bad(() => rng.range!(2, 1), RangeError, /range: min must not exceed max/);
    bad(() => rng.range!(0, Infinity), RangeError, /range: bounds must be finite numbers/);
    bad(() => rng.int!(0.5, 2), RangeError, /int: bounds must be safe integers/);
    bad(() => rng.int!(3, 2), RangeError, /int: min must not exceed max/);
    bad(() => rng.int!(0, 2 ** 32), RangeError, /int: at most 4294967296 values/);
    bad(() => rng.pick!([]), RangeError, /pick: array must not be empty/);
    bad(() => rng.pick!('abc'), TypeError, /pick: expects an array/);
  });

  test('is a sandbox global that programs can call', () => {
    const usage: Record<string, number> = {};
    const globals = buildSandboxGlobals(usage);
    const make = globals.seededRandom as typeof seededRandom;
    expect(typeof make).toBe('function');
    expect(draws(make('x'), 4)).toEqual(draws(seededRandom('x'), 4));
    expect(usage.seededRandom).toBe(1);
  });
});
