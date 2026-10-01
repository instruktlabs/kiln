import { expect, test } from 'bun:test';
import { createHerdMotion } from '../../src/play/herd';
import { buildPlacements, chooseClip } from '../../src/world/placements';
import type { FarmInstance, FarmLayout } from '../../src/world/types';
import fixture from '../../fixtures/herd.json';
import layout from '../../fixtures/layout.json';
import { fixturePack } from './placement-fixture';

function checkActors(actors: FarmInstance[], expected: typeof fixture.stopped) {
  expect(actors).toHaveLength(expected.length);
  for (let n = 0; n < actors.length; n++) {
    const instance = actors[n]!, row = expected[n]!;
    expect(instance.id).toBe(row.id);
    instance.object.position.toArray().forEach((x, k) => expect(x).toBeCloseTo(row.position[k]!, 6));
    instance.object.quaternion.toArray().forEach((x, k) => expect(x).toBeCloseTo(row.quaternion[k]!, 6));
    expect(instance.object.rotation.y).toBeCloseTo(row.yaw, 6);
    expect(instance.clipIndex).toBe(row.clipIndex); expect(instance.action?.getClip().name ?? null).toBe(row.clip);
    expect(instance.action?.time ?? 0).toBeCloseTo(row.time, 6);
    expect(instance.action?.timeScale ?? 1).toBeCloseTo(row.timeScale, 6);
    expect(instance.action?.paused ?? false).toBe(row.paused);
  }
}
test('U-22 all cows, sheep and chickens match sealed pilot positions and clips at fixed times', () => {
  const source = fixturePack(), built = buildPlacements(source.pack, layout as FarmLayout);
  const herd = createHerdMotion({ instances: built.instances }); built.initializeClips();
  const actors = built.instances.filter(i => ['cow', 'sheep', 'chicken'].includes(i.asset.id));
  herd.start(); let frame = 0;
  for (const sample of fixture.samples) {
    while (frame < sample.frame) { herd.update(fixture.dt); built.updateMixers(fixture.dt); frame++; }
    checkActors(actors, sample.actors);
    const report = herd.report();
    expect(report.animals).toBe(sample.report.animals); expect(report.walkFrames).toBe(sample.report.walkFrames); expect(report.restFrames).toBe(sample.report.restFrames);
    expect(report.elapsedSeconds).toBeCloseTo(sample.report.elapsedSeconds, 6); expect(report.distanceMeters).toBeCloseTo(sample.report.distanceMeters, 6);
  }
  herd.stop(); expect(herd.active).toBe(false); checkActors(actors, fixture.stopped);
  herd.dispose(); built.dispose(); source.dispose();
});

test('herd preserves custom rest playback, starts idempotently, clamps dt and restores on disposal', () => {
  const source = fixturePack(), built = buildPlacements(source.pack, layout as FarmLayout); built.initializeClips();
  const cow = built.instances.find(i => i.asset.id === 'cow')!;
  chooseClip(cow, String(cow.clips.findIndex(c => c.name === 'Idle'))); cow.action!.paused = true; cow.action!.time = .42; cow.action!.timeScale = .73;
  const position = cow.object.position.clone(), quaternion = cow.object.quaternion.clone(), oldAction = cow.action;
  const herd = createHerdMotion({ instances: built.instances });
  herd.update(1); expect(herd.report().elapsedSeconds).toBe(0);
  herd.start(); herd.update(1); herd.start(); expect(herd.report().elapsedSeconds).toBe(.1);
  expect(cow.object.position.equals(position)).toBe(false);
  herd.dispose(); herd.dispose();
  expect(cow.object.position.equals(position)).toBe(true); expect(cow.object.quaternion.equals(quaternion)).toBe(true);
  expect(cow.action).toBe(oldAction); expect(cow.action!.time).toBe(.42); expect(cow.action!.paused).toBe(true); expect(cow.action!.timeScale).toBe(.73);
  expect(() => herd.start()).toThrow(/disposed/);
  built.dispose(); source.dispose();
});

test('herd restoration attempts every actor and is terminal despite a throwing chooser', () => {
  const source = fixturePack(), built = buildPlacements(source.pack, layout as FarmLayout); built.initializeClips();
  const actors = built.instances.filter(i => ['cow', 'sheep', 'chicken'].includes(i.asset.id)), before = actors.map(i => i.object.position.clone());
  let restoring = false, attempts = 0;
  const herd = createHerdMotion({ instances: built.instances, chooseClip(instance, index) {
    if (restoring) { attempts++; if (instance === actors[0]) throw new Error('injected restore failure'); }
    chooseClip(instance, index);
  } });
  herd.start(); herd.update(.1); restoring = true;
  expect(() => herd.dispose()).toThrow('Farm herd restoration failed');
  expect(attempts).toBe(20); expect(herd.active).toBe(false); expect(herd.report().animals).toBe(0);
  for (let n = 0; n < actors.length; n++) expect(actors[n]!.object.position.equals(before[n]!)).toBe(true);
  expect(() => herd.start()).toThrow(/disposed/); herd.dispose();
  built.dispose(); source.dispose();
});
