import { expect, test } from 'bun:test';
import { summarizeFrameTimes, measureReviewedArtifact } from './performance';

test('bounded frame receipt reports nearest-rank percentiles without disguising a long frame', () => {
  expect(summarizeFrameTimes([16, 17, 16, 100, 18])).toEqual({
    samples: 5,
    min: 16,
    p50: 17,
    p95: 100,
    max: 100,
  });
});

test('measurement cannot start while selected artifact has no matching loaded identity', async () => {
  let called = false;
  await expect(
    measureReviewedArtifact(
      async () => {
        called = true;
        return { frames: 1 };
      },
      () => undefined,
    ),
  ).rejects.toThrow('loaded');
  expect(called).toBe(false);
});

test('a sample is rejected when selection changes while a new artifact is still fetching', async () => {
  let identity: { id: string } | undefined = { id: 'A' };
  let finish!: (value: { frames: number }) => void;
  const result = measureReviewedArtifact(
    () =>
      new Promise<{ frames: number }>((resolve) => {
        finish = resolve;
      }),
    () => identity,
  );
  identity = undefined;
  finish({ frames: 100 });
  await expect(result).rejects.toThrow('changed');
  identity = { id: 'B' };
  expect(
    await measureReviewedArtifact(
      async () => ({ frames: 100 }),
      () => identity,
    ),
  ).toEqual({ frames: 100, artifact: { id: 'B' } });
});

test('frame receipt rejects empty evidence and excludes invalid timestamps', () => {
  expect(() => summarizeFrameTimes([])).toThrow('No frame');
  expect(summarizeFrameTimes([0, -1, Number.NaN, Infinity, 8])).toEqual({
    samples: 1,
    min: 8,
    p50: 8,
    p95: 8,
    max: 8,
  });
});
