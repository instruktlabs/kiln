/**
 * Seeded random numbers for generated programs and engine code.
 *
 * One algorithm for the whole engine: mulberry32, a 32-bit generator. Program seeds are
 * hashed with FNV-1a (32-bit) over their UTF-8 bytes. The output depends only on the seed
 * and the calls made, so a build that draws from `seededRandom` stays cacheable, unlike
 * `Math.random`. Pure: no Date.now(), Math.random() or host state.
 */

/** mulberry32: returns floats in [0, 1) as k / 2^32 from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a (32-bit) over the UTF-8 bytes of `text`. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** A deterministic generator returned by `seededRandom`. */
export interface SeededRandom {
  /** A float in [0, 1). */
  next(): number;
  /** A float in [min, max): min + (max - min) * next(). */
  range(min: number, max: number): number;
  /** An integer from min to max, both included (like THREE.MathUtils.randInt). */
  int(min: number, max: number): number;
  /** One element of a non-empty array, chosen with one draw. */
  pick<T>(items: readonly T[]): T;
  /** An independent stream from this generator's seed and `label`; never from its draws. */
  fork(label: string): SeededRandom;
}

const MAX_TEXT = 256;
const MAX_INT_VALUES = 2 ** 32;

function text(value: unknown, what: string): string {
  if (typeof value !== 'string')
    throw new TypeError(`seededRandom: ${what} must be a finite number or a non-empty string`);
  if (value.length === 0) throw new RangeError(`seededRandom: ${what} must be a non-empty string`);
  if (value.length > MAX_TEXT)
    throw new RangeError(`seededRandom: ${what} must be at most ${MAX_TEXT} characters`);
  return value;
}

function generator(seed32: number): SeededRandom {
  const draw = mulberry32(seed32);
  const rng: SeededRandom = {
    next: () => draw(),
    range(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max))
        throw new RangeError('seededRandom.range: bounds must be finite numbers');
      if (min > max) throw new RangeError('seededRandom.range: min must not exceed max');
      return min + (max - min) * draw();
    },
    int(min: number, max: number): number {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))
        throw new RangeError('seededRandom.int: bounds must be safe integers');
      if (min > max) throw new RangeError('seededRandom.int: min must not exceed max');
      const count = max - min + 1;
      if (count > MAX_INT_VALUES)
        throw new RangeError(`seededRandom.int: at most ${MAX_INT_VALUES} values (max - min + 1)`);
      return min + Math.floor(draw() * count);
    },
    pick<T>(items: readonly T[]): T {
      if (!Array.isArray(items)) throw new TypeError('seededRandom.pick: expects an array');
      if (items.length === 0) throw new RangeError('seededRandom.pick: array must not be empty');
      return items[Math.floor(draw() * items.length)] as T;
    },
    fork(label: string): SeededRandom {
      if (typeof label !== 'string')
        throw new TypeError('seededRandom.fork: label must be a non-empty string');
      if (label.length === 0)
        throw new RangeError('seededRandom.fork: label must be a non-empty string');
      if (label.length > MAX_TEXT)
        throw new RangeError(`seededRandom.fork: label must be at most ${MAX_TEXT} characters`);
      return generator(fnv1a32(`${seed32}/${label}`));
    },
  };
  return Object.freeze(rng);
}

/**
 * Deterministic generator for a number or string seed. A number seed is hashed from its
 * canonical decimal text (`7` and `'7'` are the same seed).
 */
export function seededRandom(...args: [seed: number | string]): SeededRandom {
  if (args.length > 1)
    throw new TypeError('seededRandom: pass exactly one seed (a finite number or a string)');
  const [seed] = args;
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new RangeError('seededRandom: seed must be finite');
    return generator(fnv1a32(String(seed)));
  }
  return generator(fnv1a32(text(seed, 'seed')));
}
