import { expect, test } from 'bun:test';
import { createFoundrySession } from '../../src/scene/session';

test('reduced motion opens the running twin paused while retaining explicit resume controls', () => {
  const session = createFoundrySession({ reducedMotion: true });
  expect(session.clock.scale).toBe(0);
  expect(session.hud.getSnapshot().scale).toBe(0);
  session.setScale(1);
  expect(session.requests.scale).toBe(1);
  session.dispose();
});
