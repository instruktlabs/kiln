/**
 * One mount's shared state: the seed and the hour, what the last build produced, and the live
 * objects the walker, the lights and the controls reach for. The controls live in the DOM tree and
 * the world in the canvas tree, so they meet here instead of through React context.
 */
import { createRef } from 'react';
import type { RefObject } from 'react';
import type { RigHandle } from '@kiln-scenes/scene-kit';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import type { Texture } from 'three/webgpu';
import type { Lantern } from './glow';
import type { Hour } from './light';
import type { TownFrame } from './layout';
import type { Glow, SunRig } from './lighting';

export interface TownState { seed: string; dusk: boolean }

/** What the page shows about the town that is standing. */
export interface TownInfo {
  seed: string;
  buildings: number;
  placements: number;
  instances: number;
  draws: number;
  triangles: number;
  /** Milliseconds from the seed to filled instance buffers. */
  buildMs: number;
}

/** The picture window glass reflects; the hour repaints it. */
export interface Reflection { texture: Texture; paint(hour: Hour): void; dispose(): void }

export interface TownSession {
  getState(): TownState;
  getInfo(): TownInfo | null;
  set(patch: Partial<TownState>): void;
  setInfo(info: TownInfo): void;
  subscribe(listener: () => void): () => void;
  /** Bumped whenever the standing town changed; the walker and the shadows restart from it. */
  revision: number;
  collision: CollisionWorld | null;
  frame: TownFrame | null;
  sun: SunRig | null;
  /** The kits' emissive materials with the strength their files carry; the hour scales it. */
  glow: Glow[];
  /** How strongly the town's own light shows: 0 by day, 1 at dusk. The hour sets it. */
  pools: number;
  reflection: Reflection | null;
  /** Unit vector toward the sun as the hour has it now; tree shade follows it. */
  sunDir: [number, number, number];
  /** The lit lanterns of the standing town, in scene coordinates. */
  lanterns: Lantern[];
  readonly orbit: RefObject<RigHandle | null>;
}

export const DEFAULT_SEED = '2026';
export const MAX_SEED_LENGTH = 40;

/** A seed as the planner will receive it: trimmed, bounded, never empty. */
export function cleanSeed(raw: string): string {
  const seed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SEED_LENGTH);
  return seed || DEFAULT_SEED;
}

const FIRST = ['amber', 'brindle', 'candle', 'dapple', 'ember', 'fallow', 'gable', 'harrow', 'ivy', 'juniper', 'kestrel', 'linden', 'marrow', 'nettle', 'ochre', 'pewter', 'quarry', 'russet', 'saffron', 'tallow', 'umber', 'verdigris', 'willow', 'yarrow'];
const SECOND = ['bridge', 'cross', 'ford', 'gate', 'ham', 'hythe', 'lane', 'market', 'mill', 'row', 'stead', 'stoke', 'thorpe', 'well', 'wick', 'yard'];

/** A fresh seed for the "new town" button. `pick` returns a number in [0, 1); the page passes Math.random. */
export function freshSeed(pick: () => number, current?: string): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const seed = `${FIRST[Math.floor(pick() * FIRST.length) % FIRST.length]}${SECOND[Math.floor(pick() * SECOND.length) % SECOND.length]}`;
    if (seed !== current) return seed;
  }
  return `${current ?? DEFAULT_SEED}-2`;
}

export function createSession(initial: Partial<TownState> = {}): TownSession {
  let state: TownState = { seed: cleanSeed(initial.seed ?? DEFAULT_SEED), dusk: initial.dusk === true };
  let info: TownInfo | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of [...listeners]) listener(); };
  return {
    getState: () => state,
    getInfo: () => info,
    set(patch) {
      const next: TownState = { seed: patch.seed === undefined ? state.seed : cleanSeed(patch.seed), dusk: patch.dusk ?? state.dusk };
      if (next.seed === state.seed && next.dusk === state.dusk) return;
      state = next;
      emit();
    },
    setInfo(next) { info = next; emit(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    revision: 0,
    collision: null,
    frame: null,
    sun: null,
    glow: [],
    pools: 0,
    reflection: null,
    sunDir: [0, 1, 0],
    lanterns: [],
    orbit: createRef<RigHandle | null>(),
  };
}
