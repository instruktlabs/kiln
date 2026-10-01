// SPDX-License-Identifier: MIT
// Named, seeded random streams (sim-spec 8). Every purpose draws from its own 32-bit stream, seeded from the
// FNV-1a hash of `seed:name`, so adding a tool or a stream never shifts another stream's draws. Variates come
// from the fixed inverse-CDF tables in tables.ts and are rounded to integer ms: the sim never calls
// Math.random, Date.now, Math.log or Math.exp.
import { EXPONENTIAL, LOGNORMAL_05, TABLE_SIZE } from './tables';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the UTF-16 code units of `text` (one byte for ASCII, two otherwise). */
export function fnv1a(text: string, seed: number = FNV_OFFSET): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) {
      h ^= c >>> 8;
      h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    h ^= c & 0xff;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Stream states, keyed by stream name; plain JSON so snapshots carry them. */
export type StreamStates = Record<string, number>;

/** Advances the named stream (mulberry32 on a 32-bit state) and returns a 32-bit unsigned draw. */
export function drawU32(streams: StreamStates, seed: number, name: string): number {
  const prior = streams[name];
  const state = ((prior === undefined ? fnv1a(`${seed}:${name}`) : prior) + 0x6d2b79f5) >>> 0;
  streams[name] = state;
  let z = state;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/** Uniform draw in [0, 1) with 32-bit resolution. */
export function drawUniform(streams: StreamStates, seed: number, name: string): number {
  return drawU32(streams, seed, name) / 4294967296;
}

function lookup(table: readonly number[], u: number): number {
  const x = u * TABLE_SIZE - 0.5;
  let i = Math.floor(x);
  if (i < 0) i = 0;
  if (i > TABLE_SIZE - 2) i = TABLE_SIZE - 2;
  let f = x - i;
  if (f < 0) f = 0;
  if (f > 1) f = 1;
  const a = table[i] as number, b = table[i + 1] as number;
  return a + f * (b - a);
}

/** Exponential variate with the given mean, rounded to integer ms (at least 1). */
export function drawExponentialMs(streams: StreamStates, seed: number, name: string, meanMs: number): number {
  return Math.max(1, Math.round(meanMs * lookup(EXPONENTIAL, drawUniform(streams, seed, name))));
}

/** Lognormal variate (shape 0.5) with the given mean, rounded to integer ms (at least 1). */
export function drawLognormalMs(streams: StreamStates, seed: number, name: string, meanMs: number): number {
  return Math.max(1, Math.round(meanMs * lookup(LOGNORMAL_05, drawUniform(streams, seed, name))));
}
