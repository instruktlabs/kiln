import { describe, expect, test } from 'bun:test';
import { createIslandSession } from '../src/components/island-session';

describe('on-demand island lifetime', () => {
  test('does not load before start and disposes the mounted island on exit', async () => {
    let loads = 0;
    let disposed = 0;
    const states: string[] = [];
    const session = createIslandSession(async () => {
      loads++;
      return () => { disposed++; };
    }, (state) => states.push(state));
    expect(loads).toBe(0);
    await session.start();
    expect(loads).toBe(1);
    expect(states).toEqual(['loading', 'ready']);
    session.stop();
    expect(disposed).toBe(1);
    expect(states.at(-1)).toBe('idle');
  });

  test('exiting during a module load disposes the late mount and cannot reopen it', async () => {
    let complete!: (cleanup: () => void) => void;
    let disposed = 0;
    const states: string[] = [];
    const session = createIslandSession(() => new Promise((resolve) => { complete = resolve; }),
      (state) => states.push(state));
    const pending = session.start();
    session.stop();
    complete(() => { disposed++; });
    await pending;
    expect(disposed).toBe(1);
    expect(states).toEqual(['loading', 'idle']);
  });

  test('a rejected load exposes an error and a later explicit retry can succeed', async () => {
    let attempts = 0;
    const errors: string[] = [];
    const states: string[] = [];
    const session = createIslandSession(async () => {
      if (++attempts === 1) throw new Error('Offline');
      return () => {};
    }, (state, error) => { states.push(state); if (error) errors.push(error.message); });
    await session.start();
    expect(states).toEqual(['loading', 'error']);
    expect(errors).toEqual(['Offline']);
    await session.start();
    expect(states.at(-1)).toBe('ready');
  });

  test('repeated starts do not create concurrent renderers', async () => {
    let complete!: (cleanup: () => void) => void;
    let loads = 0;
    const session = createIslandSession(() => {
      loads++;
      return new Promise((resolve) => { complete = resolve; });
    }, () => {});
    const pending = session.start();
    await session.start();
    expect(loads).toBe(1);
    complete(() => {});
    await pending;
    session.stop();
  });
});
