// SPDX-License-Identifier: MIT
// The kit's shared contract suite (SPEC 18: B-01 to B-05, B-11, B-12) on the Foundry Floor builds, served and checked
// only on this builder's ports 4700-4749 through the kit's optional port range (GG-001 / FF-001, TASK-FF2 item 5).
// Correctness and counts only: no timing is collected or compared. Build first (tests/tools/build.ts test public dev);
// each output must carry the staged ff2 pack. Evidence: evidence/contract/ff2[-webgl2]/ (the kit's browser-results.json
// and B-01-ready.png, plus summary.json with the load samples).
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/contract.ts [--webgl]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { Page } from 'puppeteer-core';
import { runSceneContractTests, waitForReady, waitFrames } from '../../../scene-kit/src/testing/node.ts';
import { PACKAGE_ROOT, PORT_FIRST, PORT_LAST, SCENES_ROOT, writeJson } from './owned.ts';
import { outputFor, type BuildMode } from './build.ts';
import { RELEASE, STAGED_DIR } from '../../scripts/stage.ts';
import { loadSample } from '../../scripts/load-sample.ts';

const backend = process.argv.includes('--webgl') ? 'webgl2' : 'auto';
const rel = (path: string) => relative(SCENES_ROOT, path).split(sep).join('/');
const staged = readFileSync(resolve(STAGED_DIR, 'pack.json'), 'utf8');
for (const mode of ['test', 'public', 'dev'] as BuildMode[]) {
  assert.equal(readFileSync(resolve(outputFor(mode), 'assets/pack.json'), 'utf8'), staged, `${rel(outputFor(mode))} does not carry the staged ${RELEASE} pack`);
}
const outDir = rel(resolve(PACKAGE_ROOT, 'evidence/contract', backend === 'auto' ? RELEASE : `${RELEASE}-webgl2`));

type Camera = { mode: string; position: number[]; walker: { x: number; z: number; place: string } | null };
const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args); // eslint-disable-line @typescript-eslint/no-explicit-any
const camera = (page: Page) => invoke(page, 'ffCamera') as Promise<Camera>;
const shellEscapes = (page: Page) => page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes as number); // eslint-disable-line @typescript-eslint/no-explicit-any
/** Clicks the scene HUD button whose text is exactly `label`, as a pointer user would. */
async function clickHud(page: Page, label: string): Promise<void> {
  const box = await page.evaluate(text => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.ff-hud button')).find(b => b.textContent === text);
    if (!button) return null;
    const r = button.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  assert(box, `The HUD shows a '${label}' button`);
  await page.mouse.click(box.x, box.y);
}

const before = await loadSample();
const report = await runSceneContractTests({
  testRoot: rel(outputFor('test')), publicRoot: rel(outputFor('public')), devRoot: rel(outputFor('dev')),
  workspace: SCENES_ROOT, outDir, mountOptions: { backend }, windowSize: [1280, 720], ports: { first: PORT_FIRST, last: PORT_LAST },
  callbackFailureOptions: ['graphics', 'pack', 'build', 'backend', 'tier'].map(name => ({ name, options: { failCallback: name } })),
  // Runs after the suite focused the root and pressed Enter: the kit's play mode is Foundry Floor's free walk (D-22).
  // It must leave the walk running, so the suite's first Escape ends it and only the second reaches the page shell.
  async accessibilityFlow(page) {
    const start = await camera(page);
    assert.equal(start.mode, 'walk', 'Enter on the focused root starts the walk');
    assert.equal(start.position[1], 1.6, 'The walker sees from eye height');
    await page.keyboard.down('KeyW'); await waitFrames(page, 30); await page.keyboard.up('KeyW'); await waitFrames(page, 2);
    const walked = await camera(page);
    assert.equal(walked.mode, 'walk');
    assert(walked.walker && start.walker && Math.hypot(walked.walker.x - start.walker.x, walked.walker.z - start.walker.z) > 0.05, 'W moves the walker');
    return { from: start.walker, to: walked.walker };
  },
  // Foundry Floor's own Escape uses: ending a tour or following a wafer is the scene's first Escape, like leaving the
  // walk, and never reaches the page shell; with nothing left to end, the next Escape does.
  async extraChecks({ page, check }) {
    await check('B-11-ff-escape', async () => {
      await waitForReady(page);
      const escapesBefore = await shellEscapes(page);
      await clickHud(page, 'Tour'); await waitFrames(page, 3);
      assert.equal((await camera(page)).mode, 'tour', 'The Tour button starts the tour');
      await page.focus('.ks-root'); await page.keyboard.press('Escape'); await waitFrames(page, 2);
      const afterTour = await camera(page);
      assert.equal(afterTour.mode, 'orbit', 'Escape ends the tour');
      assert.equal(await shellEscapes(page), escapesBefore, 'The Escape that ends the tour stays in the scene');
      const lot = await invoke(page, 'ffFollow') as number | null;
      assert(lot !== null, 'A lot can be followed'); await waitFrames(page, 3);
      assert.equal((await camera(page)).mode, 'follow');
      await page.focus('.ks-root'); await page.keyboard.press('Escape'); await waitFrames(page, 2);
      assert.equal((await camera(page)).mode, 'orbit', 'Escape stops following');
      assert.equal(await shellEscapes(page), escapesBefore, 'The Escape that stops following stays in the scene');
      await page.keyboard.press('Escape'); await waitFrames(page, 2);
      assert.equal(await shellEscapes(page), escapesBefore + 1, 'With nothing to end, Escape reaches the page shell');
      return { tourEndedBy: 'Escape', followedLot: lot, shellEscapes: { before: escapesBefore, after: escapesBefore + 1 } };
    });
  },
});
const after = await loadSample();

// The suite's Chrome profile lives in the workspace scratch folder; it is this run's own and is removed with it.
const profile = report.ledger.browserProfile, scratch = resolve(SCENES_ROOT, '.tmp');
let profileRemoved = false;
if (profile && resolve(profile).startsWith(scratch + sep) && report.ledger.browserClosed) { await rm(profile, { recursive: true, force: true }); profileRemoved = true; }
const latest = new Map(report.results.map(result => [result.id, result]));
const summary = {
  task: 'TASK-FF2 item 5: the kit contract suite (B-checks) for Foundry Floor on ports 4700-4749',
  release: RELEASE, backend, outDir, browser: report.browser, windowSize: [1280, 720], viewport: 'the suite page is 960x720',
  ports: { first: PORT_FIRST, last: PORT_LAST, used: report.ledger.ports },
  results: report.results.map(({ id, status, attempt, error }) => ({ id, status, attempt, ...(error ? { error: error.split('\n')[0] } : {}) })),
  final: Object.fromEntries([...latest].map(([id, result]) => [id, result.status])),
  passed: [...latest.values()].every(result => result.status === 'pass'),
  ledger: { ...report.ledger, profileRemoved },
  unexpectedMessages: report.messages.filter(m => !m.expected && (m.kind !== 'console' || m.type === 'error' || m.type === 'warn')).length,
  load: { before, after, note: 'indicative only: this PC is shared and under load' },
};
writeJson(resolve(SCENES_ROOT, outDir, 'summary.json'), summary);
console.log(JSON.stringify({ final: summary.final, passed: summary.passed, ports: summary.ports, ledger: summary.ledger, outDir }));
if (!summary.passed) process.exitCode = 1;
