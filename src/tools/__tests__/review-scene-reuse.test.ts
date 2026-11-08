import { describe, expect, spyOn, test } from 'bun:test';

import * as glbModule from '../../views/glb';
import { createKilnProgramToolRegistry, type KilnToolContext } from '../registry';

function tool(name: string, context: KilnToolContext = {}) {
  const def = createKilnProgramToolRegistry(context).find((candidate) => candidate.name === name);
  if (!def) throw new Error(`no ${name}`);
  return def;
}

// A unique name per test keeps each test's artifact, and so its cached scene, its own.
const code = (name: string, animated = false) => `
const meta = { name: '${name}', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const arm = createPivot('Arm', [0, 0, 0], root);
  createPart('Left', boxGeo(1, 1, 1), gameMaterial('#cc3333'), { parent: arm, position: [-1, 0, 0] });
  createPart('Right', boxGeo(1, 1, 1), gameMaterial('#3333cc'), { parent: root, position: [1, 0, 0] });
  return root;
}${
  animated
    ? `
function animate() {
  return [createClip('swing', 1, [rotationTrack('Joint_Arm', [
    { time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [0, 90, 0] }
  ])])];
}`
    : ''
}`;

const shot = (azimuthDeg: number, extra: Record<string, unknown> = {}) => ({
  version: 'kiln.capture.v1',
  size: 128,
  shots: [
    { name: `S${azimuthDeg}`, camera: { type: 'orbit', azimuthDeg, elevationDeg: 20 }, ...extra },
  ],
});

type Result = { ok: boolean; programRef?: string; pngBase64?: string; error?: string };

describe('one review scene per artifact across calls', () => {
  test('later calls on a programRef reuse the loaded scene and draw the same pixels', async () => {
    const load = spyOn(glbModule, 'loadGlbReviewScene');
    try {
      const render = tool('kiln_render');
      const first = (await render.run({ code: code('reuse-a'), capture: shot(30) })) as Result;
      expect(first.ok).toBe(true);
      const loads = load.mock.calls.length;
      const isolated = (await render.run({
        programRef: first.programRef!,
        capture: shot(60, {
          subject: { path: '/reuse-a[0]/Root[0]/Joint_Arm[0]' },
          visibility: 'isolate',
        }),
      })) as Result;
      const again = (await render.run({
        programRef: first.programRef!,
        capture: shot(30),
      })) as Result;
      expect(isolated.ok).toBe(true);
      expect(again.ok).toBe(true);
      expect(load.mock.calls.length).toBe(loads);
      // The isolation was undone before the scene went back: the repeat draws what the first did.
      expect(again.pngBase64).toBe(first.pngBase64);
    } finally {
      load.mockRestore();
    }
  });

  test('kiln_inspect and kiln_render share the scene of one artifact', async () => {
    const load = spyOn(glbModule, 'loadGlbReviewScene');
    try {
      const first = (await tool('kiln_render').run({
        code: code('reuse-b'),
        capture: shot(30),
      })) as Result;
      const loads = load.mock.calls.length;
      const inspected = (await tool('kiln_inspect').run({
        code: code('reuse-b'),
        listParts: {},
        image: false,
      })) as Result;
      expect(first.ok && inspected.ok).toBe(true);
      expect(load.mock.calls.length).toBe(loads);
    } finally {
      load.mockRestore();
    }
  });

  test('a scene a call leaves posed is not lent again', async () => {
    const source = code('reuse-c', true);
    const render = tool('kiln_render');
    const before = (await render.run({ code: source, capture: shot(30) })) as Result;
    const animated = (await tool('kiln_screenshot_animation').run({
      code: source,
      clip: 'swing',
      frameTimes: [1],
    })) as Result;
    expect(animated.ok).toBe(true);
    const after = (await render.run({ code: source, capture: shot(30) })) as Result;
    expect(after.pngBase64).toBe(before.pngBase64);
  });

  test('concurrent calls on one artifact each get a scene of their own', async () => {
    const render = tool('kiln_render');
    const source = code('reuse-d');
    const alone = (await render.run({
      code: source,
      capture: shot(45, {
        subject: { path: '/reuse-d[0]/Root[0]/Joint_Arm[0]' },
        visibility: 'isolate',
      }),
    })) as Result;
    const [isolated, whole] = (await Promise.all([
      render.run({
        code: source,
        capture: shot(45, {
          subject: { path: '/reuse-d[0]/Root[0]/Joint_Arm[0]' },
          visibility: 'isolate',
        }),
      }),
      render.run({ code: source, capture: shot(45) }),
    ])) as [Result, Result];
    const wholeAlone = (await render.run({ code: source, capture: shot(45) })) as Result;
    expect(isolated.pngBase64).toBe(alone.pngBase64);
    expect(whole.pngBase64).toBe(wholeAlone.pngBase64);
    expect(whole.pngBase64).not.toBe(isolated.pngBase64);
  });
});
