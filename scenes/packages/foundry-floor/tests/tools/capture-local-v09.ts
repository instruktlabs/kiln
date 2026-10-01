// Current FF3 candidate: preserve historical capture runners and compare the changed twin to its exact current inputs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { createFab } from '../../src/sim/index';
import { ff3OutputFor } from './build-ff3';
import { launchHeadless, PACKAGE_ROOT, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned';
const out = resolve(PACKAGE_ROOT, 'evidence/captures/ff3-local-v09'); mkdirSync(out, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const invoke = (p: Page, name: string, ...args: unknown[]) => p.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
const frames = (p: Page, n = 12) => p.evaluate(n => (window as any).__kilnScene.waitFrames(n), n);
const hosted = await serveOwned(ff3OutputFor('test')), chrome = await launchHeadless('ff3-final-captures', 1280, 720);
const warmBytes = readFileSync(resolve(PACKAGE_ROOT, 'data/warm/seed-1.json'));
const twin = createFab({ snapshot: warmBytes.toString(), mode: 'megafab' }); twin.step(twin.now());
const warmHash = twin.hash(); twin.step(twin.now() + 3_600_000); const hourHash = twin.hash();
const records: unknown[] = [];
async function enter(p: Page) {
  await invoke(p, 'campusView', 'canopy');
  await p.waitForFunction(() => (window as any).__kilnScene.invoke('campusState').canEnter);
  await invoke(p, 'campusEnter');
  await p.waitForFunction(() => { const s = (window as any).__kilnScene.invoke('campusPlace'); return s.interiorReady && !s.moving; }, { timeout: 120_000 });
  await frames(p);
}
async function frameSubject(p: Page, x: number, y: number, z: number) {
  let spot = await invoke(p, 'ffWalkTo', x + 3.2, z - 2.2);
  const yaw = Math.atan2(-(z - spot[1]), x - spot[0]) * 180 / Math.PI;
  const pitch = Math.atan2(y - 1.6, Math.hypot(x - spot[0], z - spot[1])) * 180 / Math.PI;
  spot = await invoke(p, 'ffWalkTo', spot[0], spot[1], yaw, pitch); await frames(p);
  await p.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent === 'Close controls')?.click());
  await frames(p, 12);
  const projected = await invoke(p, 'ffProject', x, y, z); assert(projected, 'subject lies inside the frame');
  return { spot, projected, camera: await invoke(p, 'ffCamera') };
}
try {
  for (const backend of ['webgpu', 'webgl2']) {
    const context = await chrome.browser.createBrowserContext(), p = await context.newPage(), messages: ConsoleRecord[] = [], shots: any[] = [];
    p.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text() }));
    p.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e) }));
    const shot = async (name: string, state: unknown) => {
      await frames(p, 6); const bytes = await p.screenshot({ type: 'png' });
      const file = `${backend}-${name}.png`; writeFileSync(resolve(out, file), bytes);
      shots.push({ name, file, bytes: bytes.length, sha256: sha(bytes), state });
    };
    try {
      await p.goto(`${hosted.url}/?capture=1&freeze=1&tier=high&backend=${backend}`, { waitUntil: 'load' });
      await p.waitForFunction(() => document.querySelector<HTMLElement>('#page-status')?.dataset.state === 'ready', { timeout: 180_000 });
      const actual = await p.evaluate(() => (window as any).__kilnHarness.snapshot().backend);
      assert.equal(actual.backend, backend);
      await p.waitForFunction(() => (window as any).__kilnScene.invoke('driveTraffic', 1) !== null);
      for (const view of ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout']) {
        await invoke(p, 'campusView', view); await frames(p, 18); await shot(`campus-${view}`, await invoke(p, 'campusState'));
      }
      await enter(p); const warm = await invoke(p, 'ffState'); assert.equal(warm.hash, warmHash);
      for (const view of ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section']) {
        await invoke(p, 'ffSetView', view); await frames(p, 12); await shot(`interior-${view}`, await invoke(p, 'ffState'));
      }
      await invoke(p, 'ffAdvance', 3_600_000); assert.equal((await invoke(p, 'ffState')).hash, hourHash);
      // Find a genuine loaded delivery and follow the same job through its tool-side arm transfer.
      const carried = await p.evaluate(() => {
        const s = (window as any).__kilnScene;
        for (let k = 0; k < 7200; k++) {
          const f = s.invoke('ffFloor');
          if (f.foup && f.state.active?.carrying && f.state.active.direction === 'deliver' && f.state.active.phase === 'TO_DROP') return f;
          s.invoke('ffAdvance', 1000);
        }
        return null;
      });
      assert(carried, 'production provides a loaded floor delivery within two hours');
      // Use the real follow camera's obstruction-tested side selection. A nearest-free walking
      // spot can put the camera on the far side of a stocker even with the FOUP inside its frustum.
      assert.equal(await invoke(p, 'ffFollow', carried.state.active.lot), carried.state.active.lot);
      await frames(p, 24);
      await shot('loaded-amr', { ...carried, camera: await invoke(p, 'ffCamera') });
      const now = (await invoke(p, 'ffState')).simMs;
      await invoke(p, 'ffAdvance', carried.state.active.t1 - now + 7000);
      const handoff = await invoke(p, 'ffFloor');
      assert.equal(handoff.state.active.id, carried.state.active.id); assert.equal(handoff.state.active.phase, 'DROP');
      assert(handoff.foup);
      await frameSubject(p, handoff.foup.x, handoff.foup.y + .15, handoff.foup.z);
      await shot('arm-tool-handoff', { ...handoff, camera: await invoke(p, 'ffCamera') });
      for (const cls of ['humanoid', 'technician']) {
        const person = await p.evaluate(cls => {
          const s = (window as any).__kilnScene;
          for (let k = 0; k < 24 * 720; k++) {
            const pose = s.invoke('ffPeople').find((g: any) => g.id === cls)?.poses.find((p: any) => p.activity === 'walk');
            if (pose) return { pose, simMs: s.invoke('ffState').simMs };
            s.invoke('ffAdvance', 5000);
          }
          return null;
        }, cls);
        assert(person, `${cls}: a real walking service visitor appears within 24 hours`);
        const camera = await frameSubject(p, person.pose.x, 1.1, person.pose.z);
        await shot(`${cls}-walk`, { ...person, camera, people: await invoke(p, 'ffPeople') });
      }
      assert.deepEqual(unexpectedMessages(messages), []);
      // A browser-made contact sheet retains the original PNGs and exact hashes for close inspection.
      const sheet = await context.newPage(); await sheet.setViewport({ width: 1300, height: 900 });
      const cards = shots.map(s => `<figure><img src="data:image/png;base64,${readFileSync(resolve(out, s.file)).toString('base64')}"><figcaption>${s.name}</figcaption></figure>`).join('');
      await sheet.setContent(`<style>body{margin:10px;background:#182320;color:white;font:16px system-ui}main{display:grid;grid-template-columns:640px 640px;gap:10px}figure{margin:0}img{width:640px}</style><h1>FF3 local review · ${backend}</h1><main>${cards}</main>`);
      await sheet.screenshot({ path: resolve(out, `sheet-${backend}.jpg`), type: 'jpeg', quality: 88, fullPage: true }); await sheet.close();
      records.push({ backend, actual, warmHash, hourHash, shots, unexpected: [] });
      console.log(JSON.stringify({ backend, shots: shots.length, warmHash, hourHash, ok: true }));
    } finally { await context.close(); }
  }
  writeJson(resolve(out, 'captures.json'), { schema: 'foundry-floor.local-review-captures/1', ok: true,
    packSha256: sha(readFileSync(resolve(ff3OutputFor('test'), 'assets/pack.json'))), warmSnapshotSha256: sha(warmBytes),
    note: 'Correctness and visual evidence only. Current floor-transport twin is compared to its exact current headless inputs; historical FF2/FFC1 captures remain unchanged. Owner visual acceptance is pending.', records });
} finally { await chrome.close(); await hosted.close(); }
