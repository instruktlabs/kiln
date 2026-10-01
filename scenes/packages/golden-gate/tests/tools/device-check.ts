// Emulated Galaxy S24+ (SCENE-TASK "a current flagship phone must land on a good tier"; the owner's
// phone is not connected, so this runs emulated): the test build in headless Chrome with the phone's
// CSS viewport (384 x 832 portrait, 832 x 384 landscape), device pixel ratio 3.75, touch and an
// Android user agent, on automatic quality (no tier parameter). The GPU is this PC's; the kit
// classifies it 'high' exactly as it classifies the S24+'s Adreno 750 (the adapter strings are
// covered by tests/unit/tiers.test.ts). Checks per pass: the kit's device class and tier, the
// Golden Gate feature level and live pixel ratio, the HUD's controls inside the viewport with 44 px
// targets and no two overlapping (overview, flyover menu, controls help, driving, the road-end
// prompt on the north approach road; the check keeps its fix round 1 name, deck-end), the D-22 touch model (no camera button pad on the overview, before the first touch as after it,
// with Reset view in the toolbar bringing an orbited camera back; the joystick is the only driving control
// and Leave the car the one context button), entering and leaving the car by touch, and the console. The WebGL2 pass checks the kit's
// mobile WebGL2 rule (D-03: minimal, so Low). Writes evidence/captures/device/.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/device-check.ts
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { downsample, montage, readPng, writePng, type Image } from './image.ts';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
const DPR = 3.75, TOUCH_TARGET = 44;
interface Pass { name: string; width: number; height: number; backend: 'webgpu' | 'webgl2'; tier: string; feature: string; drive: boolean }
const PASSES: Pass[] = [
  { name: 's24plus-portrait', width: 384, height: 832, backend: 'webgpu', tier: 'high', feature: 'medium', drive: true },
  { name: 's24plus-landscape', width: 832, height: 384, backend: 'webgpu', tier: 'high', feature: 'medium', drive: true },
  { name: 's24plus-portrait-webgl2', width: 384, height: 832, backend: 'webgl2', tier: 'minimal', feature: 'low', drive: false },
];
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/device'); mkdirSync(outDir, { recursive: true });
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-device', 1280, 900);
const results: Record<string, unknown> = {}, failures: string[] = [], shots: { name: string; file: string; sha256: string }[] = [], images = new Map<string, Image[]>();
const check = (name: string, ok: boolean, detail?: unknown) => { results[name] = { ok, detail }; if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`); };

const call = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
const frames = (page: Page, n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n);
async function shot(page: Page, name: string, sheet: string) {
  const bytes = Buffer.from(await page.screenshot({ type: 'png' })), file = resolve(outDir, `${name}.png`);
  const image = downsample(readPng(bytes), 3); writeFileSync(file, writePng(image)); images.set(sheet, [...images.get(sheet) ?? [], image]);
  shots.push({ name, file: relative(PACKAGE_ROOT, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex') });
}
/** Every visible scene control and panel: inside the viewport, controls at least TOUCH_TARGET CSS pixels both ways, no two
 *  overlapping (an open help or credits panel may cover what lies under it), and the help panel's content fully visible. */
const layout = (page: Page) => page.evaluate((min: number) => {
  const hud = document.querySelector('.ks-hud');
  const items: { label: string; x: number; y: number; w: number; h: number; inside: boolean; big: boolean; panel: boolean }[] = [];
  const visible = (el: Element) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const PANELS = '.ks-help, .ks-credits, .gg-flights';
  for (const el of hud ? hud.querySelectorAll<HTMLElement>('button, .ks-joystick, .gg-speed, .ks-status, ' + PANELS) : []) {
    const inPanel = el.parentElement?.closest(PANELS);
    if (!visible(el) || inPanel) continue; // a panel's own buttons are checked as part of the panel
    const r = el.getBoundingClientRect(), panel = el.matches(PANELS + ', .gg-speed, .ks-status');
    items.push({ label: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), panel,
      inside: r.left >= -.5 && r.top >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5, big: panel || r.width >= min && r.height >= min });
  }
  const covering = (i: typeof items[number]) => i.label === 'Controls help' || i.label === 'Credits and licences';
  const overlaps: string[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i]!, b = items[j]!;
    if (covering(a) || covering(b)) continue;
    if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) overlaps.push(a.label + ' x ' + b.label);
  }
  const help = document.querySelector<HTMLElement>('.ks-help');
  return { items, overlaps, help: help ? { clientHeight: help.clientHeight, scrollHeight: help.scrollHeight } : null };
}, TOUCH_TARGET);
/** D-22 on a touch layout: the kit's camera button pad is absent and Reset view sits in the toolbar. */
const PAD_LABELS = ['Zoom in', 'Zoom out', 'Pan left', 'Pan right', 'Pan up', 'Pan down'];
const touchOverview = (page: Page) => page.evaluate((padLabels: string[]) => {
  const hud = document.querySelector('.ks-hud'), buttons = hud ? [...hud.querySelectorAll('button')] : [];
  const label = (b: Element) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim();
  return { pad: buttons.map(label).filter(l => padLabels.includes(l)), padGroup: !!hud?.querySelector('[aria-label="Camera controls"]'),
    reset: buttons.filter(b => label(b) === 'Reset view').map(b => b.closest('.ks-toolbar') ? 'toolbar' : 'elsewhere') };
}, PAD_LABELS);
const padFree = (t: Awaited<ReturnType<typeof touchOverview>>) => t.pad.length === 0 && !t.padGroup && t.reset.length === 1 && t.reset[0] === 'toolbar';
/** The help shows all of its text, or at least 150 px of it with the rest a scroll away (a landscape phone). */
const layoutOk = (l: Awaited<ReturnType<typeof layout>>) => l.overlaps.length === 0 && l.items.every(i => i.inside && i.big) && (!l.help || l.help.clientHeight + 1 >= Math.min(l.help.scrollHeight, 150));
async function tapText(page: Page, text: string): Promise<boolean> {
  const el = await page.$(`xpath/.//div[contains(@class,"ks-hud")]//button[normalize-space()="${text}"]`), box = el && await el.boundingBox();
  if (!box) return false;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); return true;
}

try {
  for (const pass of PASSES) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    await page.setUserAgent(UA);
    await page.setViewport({ width: pass.width, height: pass.height, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
    const url = `${hosted.url}/?preset=golden&cam=postcard${pass.backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 240_000 });
    await frames(page, 12);
    const harness = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
    const stats = await call(page, 'ggStats') as { tier: string; device: { form: string; gpu: string; backend: string; devicePixelRatio: number }; knobs: { feature: string; shadows: boolean; pixelRatio: number } };
    const probe = await page.evaluate(() => ({ ua: navigator.userAgent, coarse: matchMedia('(pointer: coarse)').matches, screen: [screen.width, screen.height], dpr: devicePixelRatio,
      canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null; })() }));
    const record = { tier: stats.tier, device: stats.device, knobs: stats.knobs, initial: (harness.tiers as unknown[])[0] ?? null, backend: harness.backend, probe };
    check(`${pass.name}-tier`, harness.errors.length === 0 && stats.device.form === 'phone' && stats.device.backend === pass.backend && stats.tier === pass.tier && stats.knobs.feature === pass.feature, record);
    check(`${pass.name}-pixel-ratio`, stats.knobs.pixelRatio >= (pass.feature === 'low' ? .6 : 1) && stats.knobs.pixelRatio <= 1.5, { pixelRatio: stats.knobs.pixelRatio, canvas: probe.canvas });
    const sheet = pass.width > pass.height ? 'landscape' : 'portrait';
    await shot(page, `${pass.name}-overview`, sheet);
    // Before the first touch the coarse pointer already selects the touch layout.
    const initial = await touchOverview(page); check(`${pass.name}-overview-no-pad`, padFree(initial), initial);
    if (pass.drive) {
      // The overview by touch (toolbar only), then the flyover menu.
      await page.touchscreen.tap(pass.width / 2, pass.height / 2); await frames(page, 2);
      const overview = await layout(page); check(`${pass.name}-overview-layout`, layoutOk(overview), overview);
      // A one-finger drag orbits the camera; the toolbar's Reset view brings it back to the rig's home, as the pad's Reset does.
      const camera = async () => (await call(page, 'ggStats') as { camera: { position: number[] } }).camera.position;
      const apart = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      const touched = await touchOverview(page), loaded = await camera();
      await page.touchscreen.touchStart(pass.width / 2, pass.height / 2);
      for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(pass.width / 2 + i * 15, pass.height / 2 + i * 4); await frames(page, 1); }
      // The finger comes to rest before it lifts. Chrome takes a tap that lands within a few hundred milliseconds of a fast
      // flick's release as "stop the fling" and sends no click (measured in fix round 1: a tap 150 ms after the flick was
      // swallowed, taps 400 and 800 ms after it went through). A drag that ends at rest leaves the next tap to the button.
      for (let i = 0; i < 12; i++) { await page.touchscreen.touchMove(pass.width / 2 + 120, pass.height / 2 + 32); await frames(page, 1); }
      await page.touchscreen.touchEnd(); await frames(page, 4);
      const moved = await camera();
      const resetTapped = await tapText(page, 'Reset view'); await frames(page, 4); const home = await camera();
      await tapText(page, 'Reset view'); await frames(page, 4); const again = await camera();
      check(`${pass.name}-touch-reset-view`, padFree(touched) && resetTapped && apart(moved, loaded) > 10 && apart(home, moved) > 10 && apart(home, again) < .01,
        { ...touched, dragMoved: +apart(moved, loaded).toFixed(1), resetFromMoved: +apart(home, moved).toFixed(1), homeFromLoaded: +apart(home, loaded).toFixed(1), repeat: +apart(home, again).toFixed(3) });
      await tapText(page, 'Flyovers'); await frames(page, 2);
      const menu = await layout(page); check(`${pass.name}-flyover-menu-layout`, layoutOk(menu) && menu.items.some(i => i.label === 'Flyovers' && i.panel), menu);
      await shot(page, `${pass.name}-flyovers`, sheet);
      await tapText(page, 'Flyovers'); await frames(page, 2);
      // Drive by touch; the controls help opens on the first play in this browser profile (the kit
      // remembers its dismissal), otherwise from the Controls button; it is readable and closes.
      check(`${pass.name}-drive-button`, await tapText(page, 'Drive the sedan'), null);
      const autoOpened = await page.waitForFunction(() => !!document.querySelector('.ks-help'), { timeout: 5_000 }).then(() => true, () => false);
      if (!autoOpened) { await tapText(page, 'Controls'); await frames(page, 2); }
      const help = await layout(page); check(`${pass.name}-help-layout`, !!help.help && layoutOk(help), { autoOpened, ...help });
      await shot(page, `${pass.name}-help`, sheet);
      await tapText(page, 'Close controls'); await frames(page, 4);
      // Where the panel's Close button has scrolled out of a short panel, the toolbar's Controls button closes it.
      if (await page.$('.ks-help')) { await tapText(page, 'Controls'); await frames(page, 4); }
      const drive = await call(page, 'driveState') as { speed: number } | null;
      const driving = await layout(page), labels = driving.items.map(c => c.label);
      const noButtons = (l: string[]) => !l.some(x => ['Accelerate', 'Turn around', 'Drive the sedan'].includes(x) || x.startsWith('Brake'));
      check(`${pass.name}-touch-controls`, !!drive && !driving.help && ['Leave the car', 'Drive and steer'].every(l => labels.includes(l)) && noButtons(labels) && layoutOk(driving), { drive: !!drive, ...driving });
      // The chase view while the stick is held forward.
      const stick = await page.$('.ks-joystick'), box = stick && await stick.boundingBox();
      if (box) { const cx = box.x + box.width / 2, cy = box.y + box.height / 2; await page.touchscreen.touchStart(cx, cy); await page.touchscreen.touchMove(cx, cy - 50); await page.evaluate(() => new Promise(r => setTimeout(r, 1500))); }
      await shot(page, `${pass.name}-chase`, sheet);
      if (box) await page.touchscreen.touchEnd();
      // Near the road end (on the north approach road since fix round 2) the status line prompts a held
      // pull-back; no button joins Leave the car.
      const roadEnd = (await call(page, 'driveRoute') as { roadEnd: { north: number } }).roadEnd.north;
      await call(page, 'placeCar', 'nb-middle', roadEnd - 73, 8); await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
      const end = await layout(page), endLabels = end.items.map(i => i.label);
      check(`${pass.name}-deck-end-layout`, endLabels.some(l => l.startsWith('End of the drive. Stop and hold')) && noButtons(endLabels) && layoutOk(end), end);
      await shot(page, `${pass.name}-deck-end`, sheet);
      const left = await tapText(page, 'Leave the car'); await frames(page, 6);
      const mode = (await call(page, 'ggStats') as { camera: { mode: string } }).camera.mode;
      check(`${pass.name}-leave`, left && (await call(page, 'driveState')) === null && mode === 'orbit', { left, mode });
    }
    const unexpected = unexpectedMessages(messages); check(`${pass.name}-console`, unexpected.length === 0, unexpected.slice(0, 5));
    await page.close();
  }
  for (const [sheet, list] of images) writeFileSync(resolve(outDir, `${sheet}-sheet.png`), writePng(montage(list, list.length)));
  writeJson(resolve(outDir, 'device.json'), { captured: new Date().toISOString(), build: 'dist/test', userAgent: UA, devicePixelRatio: DPR, gpu: 'this PC (headless Chrome); classified like the S24+ Adreno 750', results, shots, failures });
  console.log(JSON.stringify({ failures, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, (v as { ok?: boolean }).ok])) }));
  if (failures.length) process.exitCode = 1; // a failed check fails the run (fix round 1: it used to exit 0)
} finally { await chrome.close(); await hosted.close(); }
