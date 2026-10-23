import { expect, test } from 'bun:test';
import { createCachedEvaluatorPort, MemoryBuildCache } from '../build-cache';
import { renderGLBInProcess, type RenderResult } from '../render';
const source =
  "const meta={name:'cache-review'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});return r;}";
test('does not reuse source that explicitly depends on ambient randomness or time', async () => {
  const result = await renderGLBInProcess(source);
  let calls = 0;
  const port = createCachedEvaluatorPort(
    {
      render: async () => {
        calls++;
        return result;
      },
    },
    { cache: new MemoryBuildCache(), identity: () => 'ambient-review' },
  );
  for (const expression of [
    'Math.random()',
    "Math['random']()",
    'const M=Math; M.random()',
    'Date.now()',
    'THREE.MathUtils.randFloat(0,1)',
  ]) {
    const code = `${expression}; ${source}`;
    await port.render(code);
    await port.render(code);
  }
  expect(calls).toBe(10);
  const deterministic = `const seed=123; const y=Math.sin(seed); ${source}`;
  await port.render(deterministic);
  await port.render(deterministic);
  expect(calls).toBe(11);
});
test('a program using seededRandom builds deterministically and stays cacheable', async () => {
  // #244: Math.random marks a build ambient; the seeded sandbox generator must not.
  const seeded =
    "const meta={name:'seeded-review'};function build(){const r=createRoot('Root');const rng=seededRandom('palm');const crown=rng.fork('crown');const m=gameMaterial('#888888');for(let i=0;i<4;i++){createPart('Leaf'+i,boxGeo(rng.range(0.2,0.6),0.1,crown.range(0.5,1)),m,{parent:r,position:[rng.int(-3,3),0,crown.next()]});}return r;}";
  const first = await renderGLBInProcess(seeded);
  const second = await renderGLBInProcess(seeded);
  expect(Buffer.from(second.glb).equals(Buffer.from(first.glb))).toBe(true);
  let calls = 0;
  const port = createCachedEvaluatorPort(
    {
      render: async (code, options) => {
        calls++;
        return renderGLBInProcess(code, options);
      },
    },
    { cache: new MemoryBuildCache(), identity: () => 'seeded-review' },
  );
  const built = await port.render(seeded);
  const reused = await port.render(seeded);
  expect(calls).toBe(1);
  expect(Buffer.from(reused.glb).equals(Buffer.from(built.glb))).toBe(true);
  expect(Buffer.from(built.glb).equals(Buffer.from(first.glb))).toBe(true);
});
test('cache is optional for a successful result containing non-cloneable metadata', async () => {
  const code = source.replace("name:'cache-review'", "name:'cache-review',note:()=>1");
  const original = await renderGLBInProcess(code);
  expect(original.tris).toBe(12);
  const port = createCachedEvaluatorPort(
    { render: renderGLBInProcess },
    { cache: new MemoryBuildCache(), identity: () => 'review' },
  );
  const result = await port.render(code);
  expect(result.tris).toBe(12);
});
test('input fingerprint and evaluation use the same options snapshot across awaits', async () => {
  const original = await renderGLBInProcess(source);
  const port = createCachedEvaluatorPort(
    {
      render: async (_code, options): Promise<RenderResult> => ({
        ...original,
        warnings: [String(options?.optimize)],
      }),
    },
    { cache: new MemoryBuildCache(), identity: () => 'review' },
  );
  const opts: { optimize: 'off' | 'auto' } = { optimize: 'off' };
  const pending = port.render(source, opts);
  opts.optimize = 'auto';
  const first = await pending;
  expect(first.warnings).toEqual(['off']);
  const second = await port.render(source, { optimize: 'off' });
  expect(second.warnings).toEqual(['off']);
});

test('completed builds are reused with request signals and an aborted request never receives a hit', async () => {
  let calls = 0;
  const original = await renderGLBInProcess(source);
  const cache = new MemoryBuildCache();
  const port = createCachedEvaluatorPort(
    {
      render: async () => {
        calls++;
        return original;
      },
    },
    { cache, identity: () => 'cancellation' },
  );
  await port.render(source);
  const controller = new AbortController();
  const hit = await port.render(source, undefined, { signal: controller.signal });
  expect(calls).toBe(1);
  expect(hit.buildCache?.hit).toBe(true);
  controller.abort();
  await expect(port.render(source, undefined, { signal: controller.signal })).rejects.toMatchObject(
    { code: 'CANCELLED' },
  );
  expect(calls).toBe(1);
});

test('cancelling one simultaneous cache miss does not cancel another request', async () => {
  const original = await renderGLBInProcess(source);
  const started: Array<() => void> = [];
  const port = createCachedEvaluatorPort(
    {
      render: async (_code, _options, controls) =>
        new Promise((resolve, reject) => {
          controls?.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })),
            { once: true },
          );
          started.push(() => resolve(original));
        }),
    },
    { cache: new MemoryBuildCache(), identity: () => 'isolated-signals' },
  );
  const controller = new AbortController();
  const a = port.render(source, undefined, { signal: controller.signal });
  const rejected = a.catch((error) => error);
  const b = port.render(source, undefined, { signal: new AbortController().signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toHaveLength(2);
  controller.abort();
  started[1]!();
  expect(await rejected).toMatchObject({ code: 'CANCELLED' });
  expect((await b).glb).toEqual(original.glb);
  expect((await port.render(source)).buildCache?.hit).toBe(true);
});
