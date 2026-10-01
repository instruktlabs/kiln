import type { Page } from 'puppeteer-core';
import { waitFrames as frames, waitForReady } from '../src/testing/node';

interface RigSnapshot { mode: string; player: number[]; car: number[]; door: number; pathInterrupts: number; handoffError: number; preset: string; presetValues: { exposure: number; background: number[] }; camera: number[]; colliders: number; chaseRays: number; chaseNominalDistance: number; chaseAppliedDistance: number }
interface BrowserHooks {
  whenReady(): Promise<void>; waitFrames(n: number): Promise<void>; setTimeScale(n: number): void;
  demoRigState(): RigSnapshot; demoSetMode(mode: string): void; demoSeek(u: number): { position: number[]; target: number[] };
  demoDoor(): void; demoPreset(name: string, immediate?: boolean): void; demoMove(x: number, y: number): void;
  demoChaseFixture(): void;
}
const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((value, i) => value - b[i]));
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoRigState());

/** B-15 rig, collision and preset correctness only. Caller owns the page and backend. */
export async function assertDemoRigs(page: Page): Promise<Record<string, unknown>> {
  await waitForReady(page);
  await page.evaluate(() => { const api = (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene; api.setTimeScale(0); api.demoSetMode('fly'); });
  await frames(page, 3);
  const sought = await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoSeek(.5));
  await frames(page, 3); const atSeek = await snapshot(page);
  check(distance(atSeek.camera, sought.position) < 1e-5, 'PathRig seek holds the requested pose with the clock frozen');
  const canvas = await page.$('canvas'); check(canvas, 'Demo canvas exists'); const rect = await canvas!.boundingBox(); check(rect, 'Demo canvas is visible');
  // Lower-right avoids the ordinary DOM controls and triggers one real pointer event.
  await page.mouse.move(rect!.x + rect!.width * .8, rect!.y + rect!.height * .75); await page.mouse.down(); await page.mouse.up();
  await frames(page, 3); const handoff = await snapshot(page);
  check(handoff.mode === 'orbit', 'Flyover hands control back to orbit');
  check(handoff.pathInterrupts === atSeek.pathInterrupts + 1, 'First pointer input interrupts exactly once');
  check(handoff.handoffError < 1e-4 && distance(handoff.camera, atSeek.camera) < 1e-4, 'Path-to-orbit handoff has no pose jump');
  await page.mouse.down(); await page.mouse.up(); await frames(page, 2);
  check((await snapshot(page)).pathInterrupts === handoff.pathInterrupts, 'Further pointer events do not repeat the completed interruption');

  await page.evaluate(() => { const api = (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene; api.demoSetMode('walk'); api.demoMove(0, 1); });
  const walkBefore = await snapshot(page); await frames(page, 30);
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoMove(0, 0));
  const walking = await snapshot(page); check(distance(walking.player, walkBefore.player) > .01, 'Walking capsule responds while world time is frozen');
  check(walking.player[1] >= -.02 && walking.colliders >= 3, 'Capsule remains on its collidable ground and box/door world exists');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await frames(page, 3);
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoDoor()); await frames(page, 2);
  const door = await snapshot(page); check(Math.abs(door.door + Math.PI / 2) < 1e-5, 'Reduced-motion door snaps to its open target');
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoPreset('Sunset')); await frames(page, 2);
  const sunset = await snapshot(page); check(sunset.preset === 'Sunset' && sunset.presetValues.exposure === .8, 'Reduced-motion preset applies immediately');
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoPreset('Day')); await frames(page, 2);
  const day = await snapshot(page); check(day.presetValues.exposure === 1, 'Second preset restores its values');

  await page.emulateMediaFeatures([]); await frames(page, 3);
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoChaseFixture()); await frames(page, 3);
  const obstructed = await snapshot(page);
  check(obstructed.chaseRays >= 5, 'Vehicle obstruction evaluates its five-ray bundle');
  check(obstructed.chaseAppliedDistance >= .3 && obstructed.chaseAppliedDistance < obstructed.chaseNominalDistance - .2, 'Box behind the car pulls the actual chase camera closer than nominal');
  await page.evaluate(() => { const api = (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene; api.demoSetMode('drive'); api.demoMove(0, 1); });
  const driveBefore = await snapshot(page); await frames(page, 30);
  await page.evaluate(() => (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene.demoMove(0, 0));
  const driving = await snapshot(page); check(distance(driving.car, driveBefore.car) > .01, 'Vehicle advances under input');
  check(driving.camera.every(Number.isFinite), 'Chase camera produces a finite obstructed pose');
  await page.evaluate(() => { const api = (window as unknown as { __kilnScene: BrowserHooks }).__kilnScene; api.demoSetMode('orbit'); api.setTimeScale(1); });
  await frames(page, 2);
  return { frozenSeek: atSeek, interruption: handoff, walking, door, sunset, day, obstructed, driving, frameTimeMeasurements: 'none' };
}
