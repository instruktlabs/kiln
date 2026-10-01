import { describe, expect, test } from 'bun:test';
import { clearingOnError, viewerErrorMessage } from '../src/components/viewer-retry';

test('graphics failures explain the available poster and downloads rather than a network retry', () => {
  expect(viewerErrorMessage(new Error('WebGL2 is unavailable'))).toMatch(/browser cannot draw.*poster and downloads/i);
  expect(viewerErrorMessage(new Error('GLB request failed'))).toMatch(/try again/);
});

/** drei's useGLTF keeps one promise per URL, a rejected one included, until clear(url) evicts it. */
function cachingLoader(responses: Array<'fail' | 'ok'>) {
  const cache = new Map<string, Promise<string>>();
  let requests = 0;
  const load = (url: string) => {
    let entry = cache.get(url);
    if (!entry) {
      const outcome = responses[requests++] ?? 'ok';
      entry = outcome === 'fail' ? Promise.reject(new Error(`GLB request ${requests} failed`)) : Promise.resolve(`scene from request ${requests}`);
      entry.catch(() => undefined);
      cache.set(url, entry);
    }
    return entry;
  };
  return { load, clear: (url: string) => void cache.delete(url), requests: () => requests };
}

describe('asset viewer retry after a failed load', () => {
  test('a failed open clears the cached load, so the next open requests the GLB again and succeeds', async () => {
    const url = '/models/farm/farmhouse.glb?revision=r_1';
    const loader = cachingLoader(['fail', 'ok']);
    const errors: string[] = [];
    const onError = clearingOnError(url, (error) => errors.push(error.message), loader.clear);
    await loader.load(url).catch(onError);
    expect(errors).toEqual(['GLB request 1 failed']);
    expect(await loader.load(url)).toBe('scene from request 2');
    expect(loader.requests()).toBe(2);
  });

  test('without the eviction the rejected promise is reused and no second request is made (the defect)', async () => {
    const url = '/models/farm/farmhouse.glb?revision=r_1';
    const loader = cachingLoader(['fail', 'ok']);
    await loader.load(url).catch(() => undefined);
    await expect(loader.load(url)).rejects.toThrow('GLB request 1 failed');
    expect(loader.requests()).toBe(1);
  });

  test('the error still reaches the page after the cache entry is cleared, in that order', () => {
    const order: string[] = [];
    const onError = clearingOnError('/a.glb', () => order.push('page'), (url) => order.push(`clear ${url}`));
    onError(new Error('context lost'));
    expect(order).toEqual(['clear /a.glb', 'page']);
  });
});
