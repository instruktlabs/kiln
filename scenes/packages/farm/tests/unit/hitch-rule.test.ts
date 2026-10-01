// SPDX-License-Identifier: MIT
// The X-05 hitch rule (D-28, adopted 2026-09-30): per 60 s run at every tier, no frame over 100 ms, no frame over
// 50 ms, longest frame at most 50 ms; a run that is invalid or not quiet fails the cell.
import { describe, expect, test } from 'bun:test';
import { HITCH_RULE, hitchVerdict, type HitchRun } from '../../scripts/hitch-rule';

const run = (over: Partial<HitchRun> = {}): HitchRun => ({ run: 1, valid: true, quiet: true, over50PerMinute: 0, over100: 0, maxMs: 25.1, ...over });

describe('hitch rule', () => {
  test('every tier carries the same limits', () => {
    for (const tier of ['high', 'balanced', 'economy', 'minimal']) expect(HITCH_RULE[tier]).toEqual({ over50PerMinute: 0, over100: 0, maxMs: 50 });
  });

  test('five clean runs pass', () => {
    const verdict = hitchVerdict([1, 2, 3, 4, 5].map(n => run({ run: n, maxMs: n === 3 ? 33.4 : 16.8 })), 'high');
    expect(verdict.pass).toBe(true);
    expect(verdict.runs.map(row => row.pass)).toEqual([true, true, true, true, true]);
    expect(verdict.limits).toEqual(HITCH_RULE.high);
  });

  test('one frame over 50 ms in one run fails the cell', () => {
    const verdict = hitchVerdict([run({ run: 1 }), run({ run: 2, over50PerMinute: 1, maxMs: 58.5 })], 'minimal');
    expect(verdict.pass).toBe(false);
    expect(verdict.runs.map(row => row.pass)).toEqual([true, false]);
  });

  test('a longest frame just over the limit fails even with no counted hitch', () => {
    expect(hitchVerdict([run({ maxMs: 50.1 })], 'balanced').pass).toBe(false);
    expect(hitchVerdict([run({ maxMs: 50 })], 'balanced').pass).toBe(true);
  });

  test('an invalid or noisy run fails the cell, and missing numbers never pass', () => {
    expect(hitchVerdict([run(), run({ run: 2, quiet: false })], 'economy').pass).toBe(false);
    expect(hitchVerdict([run({ valid: false })], 'economy').pass).toBe(false);
    expect(hitchVerdict([run({ maxMs: null })], 'economy').runs[0]!.pass).toBe(false);
    expect(hitchVerdict([], 'economy').pass).toBe(false);
  });

  test('an unknown tier is an error, not a pass', () => {
    expect(() => hitchVerdict([run()], 'ultra')).toThrow(/tier/);
  });
});
