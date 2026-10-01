// SPDX-License-Identifier: MIT
// Presentation time (sim-spec 7). The twin advances in integer milliseconds and never sees frame timing; this
// module turns wall time into sim time for a scene (the scale ladder and the 250 ms wall-delta cap) and says how
// clips are drawn at each scale. Nothing here feeds back into the twin, so any frame rate gives the same twin.
import { DAY_MS, HOUR_MS } from './data';

export interface ScaleRules {
  values: readonly number[];
  labels: readonly string[];
  wallDeltaCapMs: number;
  oneShotMinWallMs: number;
  loopWallSpeed: number;
  pulseFromScale: number;
}

export interface PresentationClock {
  /** Sim time in ms; fractional between frames. The twin is stepped to its floor. */
  simMs: number;
  /** Wall time in ms accumulated while the page runs, for loops drawn above 1x. */
  wallMs: number;
  scale: number;
}

export function createClock(simMs: number, scale: number): PresentationClock {
  return { simMs, wallMs: 0, scale };
}

/** Advances the clock by one frame. The wall delta is capped (a stalled tab never jumps a day). Returns the
 *  integer ms the twin should be stepped to. */
export function tick(clock: PresentationClock, wallDeltaMs: number, rules: ScaleRules): number {
  const dt = Math.min(Math.max(0, wallDeltaMs), rules.wallDeltaCapMs);
  clock.wallMs += dt;
  clock.simMs += dt * clock.scale;
  return Math.floor(clock.simMs);
}

/**
 * Local time (ms) to show for a one-shot clip that started at startMs and lasts durationMs:
 * at 1x every clip plays; at 10x a clip plays when it lasts at least oneShotMinWallMs of wall time, else it
 * jumps to its end; at 60x and above every one-shot jumps. Paused, the pose holds.
 */
export function oneShotTime(nowMs: number, startMs: number, durationMs: number, scale: number, rules: ScaleRules): number {
  const local = nowMs - startMs;
  if (local <= 0) return 0;
  if (local >= durationMs) return durationMs;
  if (scale <= 1) return local;
  if (scale >= rules.pulseFromScale) return durationMs;
  return durationMs / scale >= rules.oneShotMinWallMs ? local : durationMs;
}

/** Whether a one-shot clip is drawn as playing (not jumped) at this scale. */
export function oneShotPlays(durationMs: number, scale: number, rules: ScaleRules): boolean {
  if (scale <= 1) return true;
  if (scale >= rules.pulseFromScale) return false;
  return durationMs / scale >= rules.oneShotMinWallMs;
}

/** Phase in [0, 1) of a looping clip: sim-timed at 1x (and frozen when paused), wall-timed at loopWallSpeed above
 *  1x so a loop never becomes a blur. Presentation only. */
export function loopPhase(clock: PresentationClock, startMs: number, durationMs: number, rules: ScaleRules): number {
  if (durationMs <= 0) return 0;
  const local = clock.scale <= 1 ? clock.simMs - startMs : clock.wallMs * rules.loopWallSpeed;
  const r = local % durationMs;
  return (r < 0 ? r + durationMs : r) / durationMs;
}

/** Moving vehicles are drawn as emissive pulses from 60x; stopped vehicles are drawn normally. */
export function drawAsPulse(scale: number, moving: boolean, rules: ScaleRules): boolean {
  return moving && scale >= rules.pulseFromScale;
}

export function scaleLabel(scale: number, rules: ScaleRules): string {
  const i = rules.values.indexOf(scale);
  return i >= 0 ? (rules.labels[i] as string) : `${scale}x`;
}

/** "day 30 14:05" (days count from the run epoch). */
export function formatSimTime(ms: number): string {
  const day = Math.floor(ms / DAY_MS);
  const rest = ms - day * DAY_MS;
  const h = Math.floor(rest / HOUR_MS);
  const m = Math.floor((rest - h * HOUR_MS) / 60_000);
  return `day ${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
