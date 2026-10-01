// SPDX-License-Identifier: MIT
// B-04's callback-failure fixtures on the campus test build, one at a time (FF-C1 item 10; kit request FF-003): for
// each fixture (the host callback that throws: graphics, pack, build, backend, tier), repeated, the requests the fatal
// error cancels, whether each is a file listed in the pack, and the load progress when it failed. Counts and URLs only,
// no timing. Serves dist/campus/test on 4700-4749 in headless Chrome; writes evidence/contract/ffc1/callback-probe.json.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/callback-probe.ts [rounds]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl, launchHeadless, PACKAGE_ROOT, serveOwned, writeJson } from './owned.ts';
import { campusOutputFor } from './build-campus.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIXTURES = ['graphics', 'pack', 'build', 'backend', 'tier'] as const;
const rounds = Math.max(1, Number(process.argv[2] ?? 3) || 3);
const root = campusOutputFor('test');
const pack = JSON.parse(readFileSync(resolve(root, 'assets/pack.json'), 'utf8')) as { files: { path: string }[]; models: unknown[]; data: Record<string, string> };
const listed = new Set(pack.files.map(f => f.path));
const harness = <T>(page: Page, fn: string) => page.evaluate(f => (window as any).__kilnHarness[f](), fn) as Promise<T>;
const frames = (page: Page, n: number) => page.evaluate(k => new Promise<void>(done => { let left = k; const step = () => (--left <= 0 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);

const hosted = await serveOwned(root), owned = new Set([hosted.port]);
const chrome = await launchHeadless('ffc1-callback-probe', 1280, 720);
const runs: unknown[] = [];
try {
  const page = await chrome.browser.newPage();
  await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
  const failed: { url: string; text?: string }[] = [];
  page.on('requestfailed', r => failed.push({ url: r.url(), text: r.failure()?.errorText }));
  const url = `${hosted.url}/`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kilnHarness?.snapshot().readyCount === 1, { timeout: 180_000, polling: 250 });
  for (let round = 1; round <= rounds; round++) {
    for (const fixture of FIXTURES) {
      await harness(page, 'unmount'); await frames(page, 4);
      failed.length = 0;
      await page.evaluate(n => (window as any).__kilnHarness.mount({ failCallback: n }), fixture);
      await page.waitForFunction(() => (window as any).__kilnHarness.snapshot().errors.length > 0, { timeout: 120_000, polling: 50 });
      await page.waitForFunction(() => (window as any).__kilnHarness.snapshot().fiberRoots === 0, { timeout: 120_000, polling: 50 });
      await frames(page, 8);
      const snap = await page.evaluate(() => { const s = (window as any).__kilnHarness.snapshot(); return { errors: s.errors.map((e: any) => `${e.code}: ${e.message}`), readyCount: s.readyCount, progress: s.progress.map((p: any) => `${p.phase} ${p.loaded}/${p.total}`) }; });
      const cancelled = failed.map(f => { const path = new URL(f.url).pathname.replace(/^\/assets\//, ''); return { path, text: f.text, listedInPack: listed.has(path) }; });
      const run = { round, fixture, errors: snap.errors, readyCount: snap.readyCount, progressAtFailure: snap.progress.at(-1) ?? null, cancelled };
      runs.push(run); console.log(JSON.stringify(run));
    }
  }
  await harness(page, 'unmount');
} finally { await chrome.close(); await hosted.close(); }

const byFixture = Object.fromEntries(FIXTURES.map(fixture => {
  const mine = runs.filter((r: any) => r.fixture === fixture) as { cancelled: { path: string; listedInPack: boolean }[] }[];
  return [fixture, { runs: mine.length, runsWithCancellations: mine.filter(r => r.cancelled.length).length, cancelledPaths: [...new Set(mine.flatMap(r => r.cancelled.map(c => c.path)))], allListedInPack: mine.every(r => r.cancelled.every(c => c.listedInPack)) }];
}));
writeJson(resolve(PACKAGE_ROOT, 'evidence/contract/ffc1/callback-probe.json'), {
  task: 'FF-C1 item 10: B-04 callback-failure fixtures on the campus test build, one at a time (kit request FF-003)',
  build: 'dist/campus/test', pack: { tasks: pack.models.length + Object.keys(pack.data).length, models: pack.models.length, data: Object.keys(pack.data).length },
  rule: 'the kit suite (testing/node.ts isExpectedCallbackFailureDiagnostic) expects only the pack.json request to be cancelled by a callback fixture',
  noTiming: 'URLs and load progress counts only', rounds, byFixture, runs,
});
