export type PresetValue = number | readonly number[];
export type PresetValues = Record<string, PresetValue>;
export interface PresetBlender<P extends PresetValues> {
  readonly names: readonly string[];
  readonly current: Readonly<P>;
  readonly target: string;
  readonly blending: boolean;
  set(name: string, o?: { seconds?: number; immediate?: boolean }): void;
  update(dt: number): void;
  onChange(fn: (name: string, immediate: boolean) => void): () => void;
}
export interface PresetBlenderOptions { reduced?: () => boolean; dev?: boolean }

/** Linear RGB and vector components are interpolated in the caller's chosen space. */
export function createPresetBlender<P extends PresetValues>(presets: Record<string, P>, initial: string, options: PresetBlenderOptions = {}): PresetBlender<P> {
  const dev = options.dev ?? !!import.meta.env.KILN_DEV;
  const names = Object.keys(presets), first = presets[initial];
  if (!first) throw new Error(`Unknown initial preset: ${initial}`);
  const keys = Object.keys(first), current: PresetValues = {}, from: PresetValues = {};
  for (const name of names) {
    const p = presets[name];
    if (Object.keys(p).length !== keys.length) throw new Error(`Preset ${name} has different keys`);
    for (const key of keys) {
      const a = first[key], b = p[key];
      if (typeof a !== typeof b || (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length))) throw new Error(`Preset ${name}.${key} has a different shape`);
      if (typeof b === 'number' ? !Number.isFinite(b) : !Array.isArray(b) || !b.every(Number.isFinite)) throw new Error(`Preset ${name}.${key} is not finite`);
    }
  }
  for (const key of keys) { const value = first[key]; current[key] = typeof value === 'number' ? value : [...value]; from[key] = typeof value === 'number' ? value : [...value]; }
  let target = initial, elapsed = 0, seconds = 0, blending = false;
  const listeners = new Set<(name: string, immediate: boolean) => void>();
  const apply = (u: number) => {
    const to = presets[target];
    for (const key of keys) {
      const a = from[key], b = to[key];
      if (typeof a === 'number' && typeof b === 'number') current[key] = a + (b - a) * u;
      else { const values = current[key] as number[], start = a as readonly number[], end = b as readonly number[]; for (let i = 0; i < values.length; i++) values[i] = start[i] + (end[i] - start[i]) * u; }
    }
  };
  return {
    names: Object.freeze(names), current: current as P,
    get target() { return target; }, get blending() { return blending; },
    set(name, o = {}) {
      if (!Object.hasOwn(presets, name)) { if (dev) throw new Error(`Unknown preset: ${name}`); return; }
      if (name === target && !o.immediate && !options.reduced?.()) return;
      for (const key of keys) { const value = current[key]; if (typeof value === 'number') from[key] = value; else { const values = from[key] as number[]; for (let i = 0; i < values.length; i++) values[i] = value[i]; } }
      target = name; elapsed = 0; seconds = Math.max(0, o.seconds ?? 2);
      const immediate = !!o.immediate || !!options.reduced?.() || seconds === 0;
      blending = !immediate; if (immediate) apply(1);
      for (const fn of listeners) fn(name, immediate);
    },
    update(dt) {
      if (!blending) return;
      elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      const u = options.reduced?.() ? 1 : Math.min(1, elapsed / seconds); apply(u * u * (3 - 2 * u)); if (u === 1) blending = false;
    },
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
