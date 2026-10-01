// Sim-spec 12 test 5 (determinism): one seed gives identical hourly hashes over 30 simulated days when stepped at
// 30, 60 and 144 frames per second (600x, through the presentation clock the scene uses) and in one headless run.
// The headless run is also held to the recorded hash list (evidence/sim/hashes.json) and to the stored warm start
// (data/warm/seed-1.json), which must be byte-identical to the state a fresh 30-day warm-up reaches.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClock, tick } from '../../src/sim/clock';
import { createFab, DAY_MS, FAB_DATA } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..');
const DAYS = 30;
const END = DAYS * DAY_MS;
const recorded = JSON.parse(readFileSync(resolve(PACKAGE, 'evidence/sim/hashes.json'), 'utf8')) as { seed: number; hashes: string[]; day30Hash: string };
const seed = FAB_DATA.config.seeds.default;

let headless: { hashes: string[]; snapshot: string } | null = null;
function runHeadless() {
  if (!headless) {
    const fab = createFab({ seed });
    fab.step(END);
    headless = { hashes: [...fab.hourlyHashes()], snapshot: fab.snapshot() };
  }
  return headless;
}

function runFramed(fps: number): string[] {
  const fab = createFab({ seed });
  const clock = createClock(0, 600);
  const rules = FAB_DATA.config.scales;
  const dt = 1000 / fps;
  for (;;) {
    const target = Math.min(tick(clock, dt, rules), END);
    fab.step(target);
    if (target >= END) break;
  }
  return [...fab.hourlyHashes()];
}

describe('sim-spec 12 test 5: determinism', () => {
  // Measured 4.9 s for the 30-day run on this PC under load (indicative); budget 120 s for a cold, loaded start.
  test('headless: 720 hourly hashes, equal to the recorded list for the default seed', () => {
    const run = runHeadless();
    expect(recorded.seed).toBe(seed);
    expect(run.hashes.length).toBe(DAYS * 24);
    expect(run.hashes).toEqual(recorded.hashes);
    expect(run.hashes[DAYS * 24 - 1]).toBe(recorded.day30Hash);
  }, 120_000);

  test('the stored warm start equals a fresh 30-day warm-up', () => {
    const stored = readFileSync(resolve(PACKAGE, `data/warm/seed-${seed}.json`), 'utf8');
    expect(stored === runHeadless().snapshot).toBe(true);
  }, 120_000);

  for (const fps of [30, 60, 144]) {
    // Measured 4.5-4.6 s per run (the 144 fps run makes 622,080 step calls); budget 120 s each.
    test(`${fps} fps at 600x gives the headless hashes`, () => {
      expect(runFramed(fps)).toEqual(runHeadless().hashes);
    }, 120_000);
  }
});
