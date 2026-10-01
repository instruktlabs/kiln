// SPDX-License-Identifier: MIT
// The kit's shared contract suite (SPEC 18: B-01 to B-05, B-11, B-12) on the Foundry Floor campus builds (FF-C1 item
// 10), served and checked only on this builder's ports 4700-4749, as tests/tools/contract.ts runs it on FF2's builds.
// Correctness and counts only: no timing is collected or compared. Build first (tests/tools/build-campus.ts public test
// dev); each output must carry the staged ffc1 pack. FF2's builds (dist/standalone) and staged/ff2 are never read or
// served from here. Evidence: evidence/contract/ffc1[-webgl2]/ (the kit's browser-results.json and B-01-ready.png, plus
// summary.json with the load samples).
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/contract-campus.ts [--webgl]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { Page } from 'puppeteer-core';
import { runSceneContractTests, waitForReady, waitFrames } from '../../../scene-kit/src/testing/node.ts';
import { PACKAGE_ROOT, PORT_FIRST, PORT_LAST, SCENES_ROOT, writeJson } from './owned.ts';
import { campusOutputFor, type BuildMode } from './build-campus.ts';
import { CAMPUS_RELEASE, CAMPUS_STAGED_DIR } from '../../scripts/stage-campus.ts';
import { loadSample } from '../../scripts/load-sample.ts';

const backend = process.argv.includes('--webgl') ? 'webgl2' : 'auto';
const rel = (path: string) => relative(SCENES_ROOT, path).split(sep).join('/');
const staged = readFileSync(resolve(CAMPUS_STAGED_DIR, 'pack.json'), 'utf8');
for (const mode of ['test', 'public', 'dev'] as BuildMode[]) {
  assert.equal(readFileSync(resolve(campusOutputFor(mode), 'assets/pack.json'), 'utf8'), staged, `${rel(campusOutputFor(mode))} does not carry the staged ${CAMPUS_RELEASE} pack`);
}
const outDir = rel(resolve(PACKAGE_ROOT, 'evidence/contract', backend === 'auto' ? CAMPUS_RELEASE : `${CAMPUS_RELEASE}-webgl2`));

type Drive = { u: number; v: number; speed: number; headingDeg: number } | null;
type Place = { place: 'exterior' | 'interior'; moving: boolean; interior: boolean; interiorReady: boolean };
const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args); // eslint-disable-line @typescript-eslint/no-explicit-any
const driveState = (page: Page) => invoke(page, 'driveState') as Promise<Drive>;
const shellEscapes = (page: Page) => page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes as number); // eslint-disable-line @typescript-eslint/no-explicit-any
/** Focuses the HUD button whose text is exactly `label`, as a keyboard user reaches it (Tab order is the kit's). */
async function focusHud(page: Page, label: string): Promise<void> {
  const found = await page.evaluate(text => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.ks-hud button')).find(b => b.textContent === text && b.getBoundingClientRect().width > 0);
    button?.focus(); return !!button && document.activeElement === button;
  }, label);
  assert(found, `The HUD shows a focusable '${label}' button`);
}
/** Waits (correctness only, never a measurement) until `test` holds, reading `read` every few frames. */
async function until<T>(page: Page, read: () => Promise<T>, test: (value: T) => boolean, what: string, frames = 1200): Promise<T> {
  let value = await read();
  for (let waited = 0; !test(value); waited += 4) {
    assert(waited < frames, `${what} (last ${JSON.stringify(value)})`);
    await waitFrames(page, 4); value = await read();
  }
  return value;
}
const place = (page: Page) => invoke(page, 'campusPlace') as Promise<Place>;
const arrived = (to: Place['place']) => (p: Place) => p.place === to && !p.moving && (to === 'exterior' || p.interiorReady);

const before = await loadSample();
const report = await runSceneContractTests({
  testRoot: rel(campusOutputFor('test')), publicRoot: rel(campusOutputFor('public')), devRoot: rel(campusOutputFor('dev')),
  workspace: SCENES_ROOT, outDir, mountOptions: { backend }, windowSize: [1280, 720], ports: { first: PORT_FIRST, last: PORT_LAST },
  callbackFailureOptions: ['graphics', 'pack', 'build', 'backend', 'tier'].map(name => ({ name, options: { failCallback: name } })),
  // Runs after the suite focused the root and pressed Enter: the campus's play mode is the drive (D-22). It must leave
  // the car driving, so the suite's first Escape leaves the car and only the second reaches the page shell.
  async accessibilityFlow(page) {
    const start = await driveState(page);
    assert(start, 'Enter on the focused root takes the car');
    await page.keyboard.down('KeyW'); await waitFrames(page, 30); await page.keyboard.up('KeyW'); await waitFrames(page, 2);
    const driven = await driveState(page);
    assert(driven, 'The car is still driven');
    assert(driven.speed > start.speed, 'W accelerates the car');
    assert(Math.hypot(driven.u - start.u, driven.v - start.v) > 0.5, 'The car moves');
    return { from: { u: start.u, v: start.v, speed: start.speed }, to: { u: driven.u, v: driven.v, speed: driven.speed } };
  },
  // The way in by the keyboard alone (item 6): the Arrival view from the view radio group's arrows, Enter the fab, FF2's
  // Escape use inside unchanged (ending a tour stays in the scene), Exit to campus back at the arrival view; with
  // nothing left to end, Escape reaches the page shell.
  async extraChecks({ page, check }) {
    await check('B-11-ffc1-keyboard-way-in', async () => {
      await waitForReady(page);
      const escapesBefore = await shellEscapes(page);
      await focusHud(page, 'Campus'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      const view = await until(page, () => invoke(page, 'campusState') as Promise<{ view: string; canEnter: boolean }>, s => s.view === 'canopy' && s.canEnter, 'The arrival view offers Enter the fab');
      await until(page, () => page.evaluate(() => Array.from(document.querySelectorAll('.ks-hud button')).some(b => b.textContent === 'Enter the fab')), shown => shown, 'Enter the fab shows');
      await focusHud(page, 'Enter the fab'); await page.keyboard.press('Enter');
      const inside = await until(page, () => place(page), arrived('interior'), 'Enter the fab arrives in the interior');
      await focusHud(page, 'Tour'); await page.keyboard.press('Enter'); await waitFrames(page, 3);
      assert.equal(((await invoke(page, 'ffCamera')) as { mode: string }).mode, 'tour', 'Tour starts the tour inside');
      await page.focus('.ks-root'); await page.keyboard.press('Escape'); await waitFrames(page, 2);
      assert.equal(((await invoke(page, 'ffCamera')) as { mode: string }).mode, 'orbit', 'Escape ends the tour');
      assert.equal(await shellEscapes(page), escapesBefore, 'The Escape that ends the tour stays in the scene');
      await focusHud(page, 'Exit to campus'); await page.keyboard.press('Enter');
      const outside = await until(page, () => place(page), arrived('exterior'), 'Exit to campus arrives outside');
      const back = await invoke(page, 'campusState') as { view: string };
      assert.equal(back.view, 'canopy', 'Exit returns to the arrival view');
      assert.equal(await shellEscapes(page), escapesBefore, 'Nothing on the way in or out reaches the page shell');
      await page.focus('.ks-root'); await page.keyboard.press('Escape'); await waitFrames(page, 2);
      assert.equal(await shellEscapes(page), escapesBefore + 1, 'With nothing to end, Escape reaches the page shell');
      return { arrival: view, inside, tourEndedBy: 'Escape', outside, view: back.view, shellEscapes: { before: escapesBefore, after: escapesBefore + 1 } };
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
  task: 'TASK-FF-CAMPUS-1 item 10: the kit contract suite (B-checks) for the Foundry Floor campus on ports 4700-4749',
  release: CAMPUS_RELEASE, backend, outDir, browser: report.browser, windowSize: [1280, 720], viewport: 'the suite page is 960x720',
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
