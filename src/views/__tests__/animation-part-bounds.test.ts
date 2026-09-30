import { expect, test } from 'bun:test';
import { executeKilnCode } from '../../render';
import { createKilnScreenshotAnimationDef } from '../../tools/registry';
import { renderClipAnimation } from '../index';

const SOURCE = `
const meta={name:'MovingContacts'};
function build(){const root=createRoot('Root');
createPart('Ground',boxGeo(4,.2,4),gameMaterial('#777777'),{parent:root,position:[0,-.1,0]});
const foot=createPivot('Foot',[0,.1,0],root);
createPart('Pad',boxGeo(.2,.2,.2),gameMaterial('#ffaa00'),{parent:foot});
createPivot('Empty',[0,0,0],root);
return root;}
function animate(){return [createClip('Lift',1,[positionTrack('Joint_Foot',[
{time:0,position:[0,.1,0]},{time:.5,position:[0,.3,0]},{time:1,position:[0,.1,0]}
])])];}`;

test('selected moving parts are measured together before isolation; empty groups are unmeasured', async () => {
  const { root, clips } = await executeKilnCode(SOURCE);
  const output = await renderClipAnimation(root, clips, {
    clip: 'Lift',
    size: 32,
    frameTimes: [0, 0.5, 1],
    measureParts: [{ name: 'Joint_Foot' }, { name: 'Mesh_Ground' }, { name: 'Joint_Empty' }],
    shot: { subject: { name: 'Joint_Foot' }, visibility: 'isolate' },
  });
  expect(output.ok).toBe(true);
  for (const [i, pose] of output.poseBounds!.entries()) {
    expect(pose.parts).toHaveLength(3);
    expect(pose.parts![0]!.bounds!.min[1]).toBeCloseTo(i === 1 ? 0.2 : 0, 6);
    expect(pose.parts![1]!.bounds!.min[1]).toBeCloseTo(-0.2, 6);
    expect(pose.parts![2]).toMatchObject({ name: 'Joint_Empty', bounds: null });
    expect(pose.parts![0]!.path).toContain('/Joint_Foot[0]');
  }
});

test('batch selectors reject missing, duplicate and oversized selections before posing', async () => {
  const { root, clips } = await executeKilnCode(SOURCE);
  await expect(
    renderClipAnimation(root, clips, {
      measureParts: [{ name: 'Absent' }],
      size: 32,
    }),
  ).rejects.toThrow('missing');
  await expect(
    renderClipAnimation(root, clips, {
      measureParts: [{ name: 'Joint_Foot' }, { name: 'Joint_Foot' }],
      size: 32,
    }),
  ).rejects.toThrow('duplicate');
  await expect(
    renderClipAnimation(root, clips, {
      measureParts: Array.from({ length: 17 }, () => ({ name: 'Joint_Foot' })),
      size: 32,
    }),
  ).rejects.toThrow('1..16');
});

test('shared animation tool forwards batch measurement without requiring a shot subject', async () => {
  const tool = createKilnScreenshotAnimationDef();
  const output = (await tool.run({
    code: SOURCE,
    clip: 'Lift',
    frameTimes: [0, 0.5],
    measureParts: [{ name: 'Joint_Foot' }, { name: 'Mesh_Ground' }],
  })) as { ok: boolean; poseBounds: { parts: { name: string; bounds: { min: number[] } }[] }[] };
  expect(output.ok).toBe(true);
  expect(output.poseBounds[1]!.parts[0]!.bounds.min[1]).toBeCloseTo(0.2, 6);
  expect(output.poseBounds[1]!.parts[1]!.name).toBe('Mesh_Ground');
});

const APPROACH = `
const meta={name:'Approach'};
function build(){const root=createRoot('Root');
createPart('Ground',boxGeo(4,.2,4),gameMaterial('#777777'),{parent:root,position:[0,-.1,0]});
const slider=createPivot('Slider',[0,.1,0],root);
createPart('Pad',boxGeo(.2,.2,.2),gameMaterial('#ffaa00'),{parent:slider});
createPivot('Seat',[0,.5,0],slider);
return root;}
function animate(){return [createClip('Approach',1,[positionTrack('Joint_Slider',[
{time:0,position:[0,.1,0]},{time:1,position:[0,.1,2.5]}
])])];}`;

test('a locked perspective camera keeps its near plane short of every pose', async () => {
  const { root, clips } = await executeKilnCode(APPROACH);
  const output = await renderClipAnimation(root, clips, {
    clip: 'Approach',
    size: 32,
    frameTimes: [0, 1],
    shot: {
      camera: {
        type: 'explicit',
        projection: 'perspective',
        position: [0, 0.2, 3],
        target: [0, 0, 0],
      },
    },
  });
  expect(output.ok).toBe(true);
  // The pad ends 0.4 m from the camera; the first pose alone would put the plane at 0.51 m.
  for (const shot of output.cameraShots!) expect(shot.camera.near).toBeLessThanOrEqual(0.2);
});

test('measured locators report their world origin even without geometry bounds', async () => {
  const { root, clips } = await executeKilnCode(APPROACH);
  const output = await renderClipAnimation(root, clips, {
    clip: 'Approach',
    size: 32,
    frameTimes: [0, 1],
    measureParts: [{ name: 'Joint_Seat' }],
  });
  expect(output.ok).toBe(true);
  const [start, end] = output.poseBounds!.map((pose) => pose.parts![0]!);
  expect(start).toMatchObject({ name: 'Joint_Seat', bounds: null });
  expect(start!.origin![1]).toBeCloseTo(0.6, 6);
  expect(start!.origin![2]).toBeCloseTo(0, 6);
  expect(end!.origin![2]).toBeCloseTo(2.5, 6);
});
