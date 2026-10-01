// Farm release coverage for the shared contract suite (SPEC 18: B-01 to B-05, B-11, B-12), on a
// built r33 or r34 output. Correctness and counts only: no timing is collected or compared.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSceneContractTests, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';

const args = process.argv.slice(2), workspace = resolve(import.meta.dir, '..');
const option = (name: string, fallback: string) => { const at = args.indexOf(name); if (at < 0) return fallback; if (!args[at + 1] || args[at + 1]!.startsWith('--')) throw new Error(`${name} needs a value`); return args[at + 1]!; };
const release = option('--release', 'r33');
if (!['r33', 'r34'].includes(release)) throw new Error('Farm release must be r33 or r34');
const dist = option('--dist', release === 'r33' ? 'packages/farm/dist' : 'packages/farm/dist/r34');
const backend = args.includes('--webgl') ? 'webgl2' : 'auto';
const label = option('--label', '');
if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('A test label uses lowercase letters, numbers and hyphens');

// Each output must carry the staged pack of the release it claims (the farmhouse is the only r33/r34 difference).
const staged = JSON.parse(await readFile(resolve(workspace, `packages/farm/staged/${release}/pack.json`), 'utf8'));
for (const mode of ['test', 'standalone', 'dev']) {
  const built = JSON.parse(await readFile(resolve(workspace, dist, mode, 'assets/pack.json'), 'utf8'));
  assert.deepEqual(built, staged, `${dist}/${mode} does not carry the staged ${release} pack`);
}

// M3: --out-root names the evidence folder (default evidence/m2/contract for the M2 record).
const outDir = `${option('--out-root', 'evidence/m2/contract')}/${release}-${backend}${label ? '-' + label : ''}`;
type Sim = { active: boolean; driving: boolean; prompt: string; nearest: string | null; player: { position: number[] }; doors: { id: string; target: number; amount: number }[] };
const simState = (page: import('puppeteer-core').Page) => page.evaluate(() => (window as any).__kilnScene.simState()) as Promise<Sim>;
const report = await runSceneContractTests({
  testRoot: `${dist}/test`, publicRoot: `${dist}/standalone`, devRoot: `${dist}/dev`,
  outDir, mountOptions: { backend }, windowSize: [1280, 720],
  callbackFailureOptions: ['graphics', 'pack', 'build', 'backend', 'tier'].map(name => ({ name, options: { failCallback: name } })),
  // Runs after the suite focused the root and pressed Enter; it must leave Rowan walking (not driving),
  // so the suite's first Escape leaves play and only the second reaches the page shell.
  async accessibilityFlow(page) {
    const before = await simState(page);
    assert.equal(before.active, true, 'Enter on the focused root starts Farm play');
    await page.keyboard.down('KeyW'); await waitFrames(page, 30); await page.keyboard.up('KeyW');
    const walked = await simState(page);
    assert.notDeepEqual(walked.player.position, before.player.position, 'W moves Rowan');
    await page.evaluate(() => (window as any).__kilnScene.teleport('house')); await waitFrames(page, 3);
    const porch = await simState(page);
    assert.equal(porch.nearest, 'home-0', 'The farmhouse door is the nearest interaction at the porch');
    const doorBefore = porch.doors.find(door => door.id === 'home-0')!.target;
    await page.keyboard.press('KeyE'); await waitFrames(page, 3);
    const after = await simState(page), doorAfter = after.doors.find(door => door.id === 'home-0')!.target;
    assert.notEqual(doorAfter, doorBefore, 'E toggles the farmhouse door');
    assert.equal(after.driving, false);
    return { walk: { from: before.player.position, to: walked.player.position }, porch: { prompt: porch.prompt, nearest: porch.nearest }, door: { id: 'home-0', before: doorBefore, after: doorAfter } };
  },
  // SPEC 13.4 / B-11 (P-35): reduced motion snaps Farm doors to their target on the next step; with motion allowed they ease.
  async extraChecks({ page, check }) {
    await check('B-11-farm-doors', async () => {
      await waitForReady(page);
      await page.evaluate(() => (window as any).__kilnScene.feedFrameTimes([]));
      await page.focus('.ks-root'); await page.keyboard.press('Enter'); await waitFrames(page, 3);
      assert.equal((await simState(page)).active, true, 'Enter starts play');
      await page.evaluate(() => (window as any).__kilnScene.teleport('house')); await waitFrames(page, 3);
      const door = async () => (await simState(page)).doors.find(d => d.id === 'home-0')!;
      const settle = async (target: number) => { await page.waitForFunction(() => { const d = (window as any).__kilnScene.simState().doors.find((x: any) => x.id === 'home-0'); return Math.abs(d.amount - d.target) < 1e-3; }, { timeout: 15_000 }); assert.equal((await door()).target, target); };
      // Motion allowed: the door eases (one frame after E it is between its old amount and its target).
      const start = await door(); await page.keyboard.press('KeyE'); await waitFrames(page, 1); const easing = await door();
      assert.notEqual(easing.target, start.target); assert(Math.abs(easing.amount - easing.target) > 1e-3, `the door eases with motion allowed (${JSON.stringify(easing)})`);
      await settle(easing.target);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await waitFrames(page, 3);
      assert.equal(await page.evaluate(() => (window as any).__kilnScene.motionPolicy().reduced), true);
      const before = await door(); await page.keyboard.press('KeyE'); await waitFrames(page, 2); const snapped = await door();
      assert.notEqual(snapped.target, before.target); assert.equal(snapped.amount, snapped.target, `reduced motion snaps the door (${JSON.stringify(snapped)})`);
      await page.emulateMediaFeatures([]); await page.keyboard.press('Escape'); await waitFrames(page, 2);
      return { eased: { from: start, oneFrameLater: easing }, reduced: { from: before, twoFramesLater: snapped } };
    });
  },
});
console.log(JSON.stringify({ release, dist, backend, results: report.results.map(({ id, status, attempt }) => ({ id, status, attempt })), ledger: report.ledger, outDir }));
const latest = new Map(report.results.map(result => [result.id, result]));
if ([...latest.values()].some(result => result.status === 'fail')) process.exitCode = 1;
