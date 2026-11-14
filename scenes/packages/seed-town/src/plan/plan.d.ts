/** Types for the seeded helpers in `plan.js` that the page uses outside the planner. */
export interface Random {
  /** The next number in [0, 1). */
  next(): number;
  /** A whole number from lo to hi, both included. */
  int(lo: number, hi: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  weighted<T>(pairs: readonly (readonly [T, number])[]): T;
  /** An independent stream named by `label`: drawing from it never moves this one. */
  fork(label: string): Random;
}

export function random(key: string): Random;
