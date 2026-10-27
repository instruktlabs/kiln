import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { RENDER_READY, RENDER_SIGNALS, WORLD_READY, captureDrift, settleAndShoot } from './capture-holodeck-shots.mjs';

const frame = (grey: number) => sharp({ create: { width: 4, height: 4, channels: 3, background: { r: grey, g: grey, b: grey } } }).png().toBuffer();

/** An open world page: which readiness signals it publishes, whether each wait resolves, and the frames it shows. */
function fakeWorld({ published = [] as string[], draws = true, renderReady = true, frames = [] as Buffer[] }) {
  const waited: string[] = [];
  let shown = 0;
  return {
    waited,
    styles: [] as string[],
    async waitForFunction(expression: string) {
      waited.push(expression);
      if (expression === WORLD_READY && !draws) throw new Error('Waiting failed: 180000ms exceeded');
      if (expression === RENDER_READY && !renderReady) throw new Error('Waiting failed: 180000ms exceeded');
    },
    async evaluate(expression: string) {
      expect(expression).toBe(RENDER_SIGNALS);
      return published;
    },
    async addStyleTag({ content }: { content: string }) { this.styles.push(content); },
    async screenshot() { return frames[Math.min(shown++, frames.length - 1)]; },
  };
}

const settle = { view: 'meridian-sanctuary-overview', settleMs: 0, driftMs: 0 };

test('drift is the mean absolute luminance difference between two captures of the same frame', async () => {
  const [dark, lighter] = await Promise.all([frame(0), frame(51)]);
  expect(await captureDrift(dark, dark)).toBe(0);
  expect(await captureDrift(dark, lighter)).toBeCloseTo(51 / 255, 6);
  expect(await captureDrift(lighter, dark)).toBeCloseTo(51 / 255, 6);
  const wide = await sharp({ create: { width: 8, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  await expect(captureDrift(dark, wide)).rejects.toThrow('different sizes');
});

test('a world that publishes its own readiness is waited on, and the shot names it', async () => {
  const still = await frame(120);
  const page = fakeWorld({ published: ['renderReady', 'skyLightReady'], frames: [still] });
  const shot = await settleAndShoot(page, settle);
  expect(shot.settled).toBe('renderReady+skyLightReady');
  expect(shot.drift).toBe(0);
  expect(page.waited).toEqual([WORLD_READY, RENDER_READY]);
  expect(page.styles).toEqual([expect.stringContaining('viewer-diagnostics')]);
});

test('a world that publishes none settles for the given time, and the shot names that instead', async () => {
  const page = fakeWorld({ frames: [await frame(120)] });
  const shot = await settleAndShoot(page, { ...settle, settleMs: 1 });
  expect(shot.settled).toBe('settle:1ms');
  expect(page.waited).toEqual([WORLD_READY]);
});

test('readiness the world publishes but has not reached is a timeout naming the signals', async () => {
  const page = fakeWorld({ published: ['probeGridReady'], renderReady: false, frames: [await frame(120)] });
  await expect(settleAndShoot(page, settle)).rejects.toThrow('did not become render-ready within 180000 ms (probeGridReady)');
});

test('a frame still moving between two captures is refused rather than kept', async () => {
  // The Meridian mirrors at 8 s: the frame was still resolving, and the receipt recorded the shot as valid anyway.
  const frames = await Promise.all([frame(0), frame(80)]);
  const page = fakeWorld({ frames });
  await expect(settleAndShoot(page, settle)).rejects.toThrow(/still moved 0\.3137 between captures 0 ms apart, over 0\.01.*--settle/s);
  // A scene that animates can say so, and the measured drift is still reported.
  const animated = await settleAndShoot(fakeWorld({ frames }), { ...settle, maxDrift: false });
  expect(animated.drift).toBeCloseTo(80 / 255, 6);
  expect(animated.png).toEqual(frames[1]);
});

test('a world that never draws a frame blames headless Chrome on a hybrid GPU, not the world', async () => {
  const page = fakeWorld({ draws: false, frames: [await frame(0)] });
  await expect(settleAndShoot(page, settle)).rejects.toThrow(/no drawn frame within 180000 ms.*--headed.*__NV_PRIME_RENDER_OFFLOAD=1/s);
  await expect(settleAndShoot(page, { ...settle, headless: false })).rejects.toThrow(/no drawn frame within 180000 ms\.$/);
});
