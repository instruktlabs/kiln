import { expect, test } from 'bun:test';
import { downloadPoster } from './poster-download.mjs';

test('retries a reset while reading the body and returns only the complete download', async () => {
  let calls = 0;
  const result = await downloadPoster('https://example.test/poster.png', {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls++;
      if (calls === 1)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1]));
              controller.error(new Error('ECONNRESET'));
            },
          }),
        );
      return new Response('complete', { headers: { 'content-type': 'image/png' } });
    },
  });
  expect(calls).toBe(2);
  expect(result.bytes.toString()).toBe('complete');
  expect(result.response.headers.get('content-type')).toBe('image/png');
});

test('bounds stalled downloads and stops after three attempts', async () => {
  let calls = 0;
  await expect(
    downloadPoster('https://example.test/poster.png', {
      timeoutMs: 10,
      retryDelayMs: 0,
      fetchImpl: async (_url, { signal }) => {
        calls++;
        return new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener('abort', () => controller.error(signal.reason));
            },
          }),
        );
      },
    }),
  ).rejects.toThrow(/timed out|timeout/i);
  expect(calls).toBe(3);
});

test('returns HTTP failures without retrying them', async () => {
  let calls = 0;
  const result = await downloadPoster('https://example.test/missing.png', {
    fetchImpl: async () => {
      calls++;
      return new Response('missing', { status: 404 });
    },
  });
  expect(calls).toBe(1);
  expect(result.response.status).toBe(404);
  expect(result.bytes).toBeNull();
});
