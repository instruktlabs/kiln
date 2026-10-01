import { expect, test } from 'bun:test';
import { createGoldenGateMotion } from '../../src/motion';

test('pause freezes animation time and drive delta, with no catch-up on resume', () => {
  const motion = createGoldenGateMotion(false);
  motion.advance(.05); expect(motion.time).toBe(.05); expect(motion.delta).toBe(.05);
  motion.setPaused(true);
  for (let i = 0; i < 100; i++) motion.advance(.05);
  expect(motion.time).toBe(.05); expect(motion.delta).toBe(0);
  motion.setPaused(false); motion.advance(.05);
  expect(motion.time).toBe(.1); expect(motion.delta).toBe(.05);
});

test('reduced motion starts paused but allows explicit motion and reacts to preference changes', () => {
  const changes: boolean[] = [], motion = createGoldenGateMotion(true, paused => changes.push(paused));
  motion.advance(.1); expect(motion.time).toBe(0); expect(motion.paused).toBe(true);
  motion.setPaused(false); motion.setReduced(true); motion.advance(.1);
  expect(motion.time).toBe(.1); expect(motion.paused).toBe(false);
  motion.setReduced(false); motion.setReduced(true); motion.advance(.1);
  expect(motion.time).toBe(.1); expect(motion.paused).toBe(true);
  expect(changes).toEqual([false, true]);
});

test('the review clock can initialize and seek a fixed time without unpausing ambient motion', () => {
  const motion = createGoldenGateMotion(true);
  motion.advance(0, 42); expect(motion.time).toBe(42);
  motion.advance(.05, 42.05); expect(motion.time).toBe(42);
  motion.advance(0, 12); expect(motion.time).toBe(12); expect(motion.paused).toBe(true);
  motion.setPaused(false); motion.advance(.05, 12.05); expect(motion.time).toBe(12.05);
});
