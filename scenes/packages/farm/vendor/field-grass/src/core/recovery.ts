// SPDX-License-Identifier: MIT

export const DEFAULT_WAKE_RECOVERY_SECONDS = 0.92;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Monotonic C2 return from full displacement to exact rest. */
export function wakeRecoveryResponse(
  age: number,
  duration = DEFAULT_WAKE_RECOVERY_SECONDS,
): number {
  if (duration <= 0) return 0;
  const phase = clamp01(age / duration);
  const settled = phase ** 3 * (phase * (phase * 6 - 15) + 10);
  return clamp01(1 - settled);
}

/** A trail sample eases in once, then follows the monotonic recovery tail. */
export function wakeSampleResponse(
  age: number,
  duration: number,
  birthDuration: number,
): number {
  if (age < 0 || age > duration || birthDuration <= 0) return 0;
  const birthPhase = clamp01(age / Math.min(birthDuration, duration * 0.25));
  const birth = birthPhase * birthPhase * (3 - 2 * birthPhase);
  return birth * wakeRecoveryResponse(age, duration);
}
