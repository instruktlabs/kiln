import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

/**
 * The scene pages at 390, 768, 1280 and 1440 px, in each state a visitor can be in:
 *
 *   node scripts/verify-scene-widths.mjs <site-url> <output-directory> [screenshot-directory]
 *
 * - layout shift: what the page moves by while it loads (Explore is revealed by the shell's script), under 0.01.
 * - loaded: the poster, the state copy and the Explore control. No horizontal scroll, the poster inside the window, Explore
 *   shown, at least 44 px each way, inside the window, the element that answers a tap at its centre, reachable by keyboard.
 * - no JavaScript: the poster, the copy and the noscript notice are readable and nothing scrolls sideways.
 * - error: Explore pressed with the scene's runtime failing; the failure copy is readable in place and Explore is back.
 * - unavailable: a build with no runtime for the scene (the shell's `data-kind` is "none", which is what such a build emits, set
 *   before Explore so the component's own code shows its own copy); the fallback the overlay shows is readable and its link reachable.
 * - open: the overlay's Exit and Fullscreen controls are inside the window at every width.
 * - a note page (Foundry Floor, which has no scene, poster or Explore control): its copy and its way back are readable and
 *   reachable at every width, with and without JavaScript, and it carries no picture.
 *
 * "Readable": at least 14 px, not clipped, inside the window, and axe's colour-contrast rule passing on the copy. Screenshots go to
 * the screenshot directory, one per scene, state and width.
 */
const [base, review, screenshotDirectory = join(review ?? '', 'screenshots')] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-scene-widths.mjs <site-url> <output-directory> [screenshot-directory]');
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const widths = [390, 768, 1280, 1440];
const scenes = [
  { slug: 'farm', route: '/scenes/farm/', kind: 'shell' },
  { slug: 'golden-gate', route: '/scenes/golden-gate/', kind: 'shell' },
  { slug: 'foundry-floor', route: '/scenes/foundry-floor/', kind: 'note' },
];
const MIN_TEXT_PX = 14;
const MIN_TARGET_PX = 44;
const MAX_SHIFT = 0.01;

/** What the page shows of the scene shell right now, measured in the page. */
const measure = () => {
  const shell = document.querySelector('scene-shell');
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const text = (element) => {
    const style = getComputedStyle(element);
    return { text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 90), fontSize: Number.parseFloat(style.fontSize), visible: element.checkVisibility(), clipped: element.scrollWidth > element.clientWidth + 1, ...box(element) };
  };
  const explore = shell.querySelector('[data-explore]');
  const poster = shell.querySelector('[data-intro] img');
  return {
    innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    shellClipped: shell.scrollWidth > shell.clientWidth + 1,
    poster: poster && { ...box(poster), loaded: poster.complete && poster.naturalWidth > 0 },
    explore: explore && { ...box(explore), shown: !explore.hidden && explore.checkVisibility() },
    introCopy: [...shell.querySelectorAll('[data-intro] p')].filter((element) => element.checkVisibility()).map(text),
    status: (() => { const element = shell.querySelector('[data-status]'); return element && !element.classList.contains('sr-only') && element.textContent.trim() ? text(element) : null; })(),
    noscript: (() => { const element = shell.querySelector('noscript p'); return element ? text(element) : null; })(),
    state: shell.dataset.sceneState ?? null,
  };
};

/** Colour contrast of the copy inside `selector`, from axe: the lowest ratio among the text it checked, and any failure. */
const contrast = (selector) => async (page) => {
  await page.evaluate(axe);
  return page.evaluate(async (target) => {
    const scope = document.querySelector(target);
    const outcome = await window.axe.run(scope, { runOnly: ['color-contrast'] });
    const ratios = outcome.passes.flatMap((rule) => rule.nodes).flatMap((node) => node.any.map((item) => item.data?.contrastRatio)).filter((ratio) => typeof ratio === 'number');
    return { minimum: ratios.length ? Math.min(...ratios) : null, checked: ratios.length, failures: outcome.violations.flatMap((rule) => rule.nodes).map((node) => node.target.join(' ')) };
  }, selector);
};
const intoView = (selector) => (page) => page.evaluate((target) => {
  const element = document.querySelector(target);
  element.scrollIntoView({ block: 'center' });
  const rect = element.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return { hit: Boolean(hit) && (element === hit || element.contains(hit)), inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, width: rect.width, height: rect.height };
}, selector);
/** Presses Tab from the top of the page until the control has focus; the number of presses, or null when it is never reached. */
const tabsToReach = async (page, selector, limit = 80) => {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  for (let presses = 1; presses <= limit; presses++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((target) => document.activeElement?.matches(target), selector)) return presses;
  }
  return null;
};

/**
 * Wait for the fonts and for every visible picture to finish loading (or fail), so a measurement is not taken mid-load. It
 * polls from here with plain reads instead of waiting for events in the page, because a page with scripts off runs none.
 *
 * "Complete" once is not enough right after a resize: the browser picks the picture's source for the new width at its next
 * rendering update, so a read in between still sees the old picture complete, and the new one starts loading a moment later
 * (seen: the Farm poster with scripts off read as not loaded at 1280 px in one run of the gate and as loaded in the others).
 * It has to be complete, with the same source, on three reads in a row.
 */
const settle = async (page) => {
  const deadline = Date.now() + 8000;
  let steady = 0;
  let previous = null;
  for (;;) {
    const state = await page.evaluate(() => {
      const images = [...document.querySelectorAll('img')].filter((image) => image.checkVisibility());
      return { ready: document.fonts.status === 'loaded' && images.every((image) => image.complete), sources: images.map((image) => image.currentSrc).join('|') };
    });
    steady = state.ready && state.sources === previous ? steady + 1 : 0;
    previous = state.sources;
    if (steady >= 3 || Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

/** What a note page (no scene shell) shows of its copy and its way back, measured in the page. */
const measureNote = () => {
  const main = document.querySelector('main');
  const rectOf = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; };
  const link = main.querySelector('a.btn');
  return {
    innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    copy: [...main.querySelectorAll('h1, p')].map((element) => ({ text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 90), fontSize: Number.parseFloat(getComputedStyle(element).fontSize), visible: element.checkVisibility(), clipped: element.scrollWidth > element.clientWidth + 1, ...rectOf(element) })),
    link: link && { text: link.textContent.trim(), href: link.getAttribute('href'), ...rectOf(link) },
    pictures: main.querySelectorAll('img, picture, svg, canvas, video').length,
  };
};

const results = { browser: '', scenes: [], errors: [], failures: [] };
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
results.browser = await browser.version();
const lines = [];
try {
  for (const scene of scenes) {
    const record = { scene: scene.slug, route: scene.route, states: [] };
    const shots = join(screenshotDirectory, scene.slug);
    await mkdir(shots, { recursive: true });
    const url = new URL(scene.route, base).href;
    const state = (name) => { const item = { state: name, widths: [] }; record.states.push(item); return item; };
    const step = (item, width, checks, extra = {}) => {
      const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
      item.widths.push({ width, checks: Object.fromEntries(Object.entries(checks).map(([name, pass]) => [name, Boolean(pass)])), ...extra });
      lines.push(`${scene.slug} ${item.state} ${width}: ${failed.length ? `FAILED ${failed.join('; ')}` : 'ok'}${extra.summary ? ` (${extra.summary})` : ''}`);
      for (const name of failed) results.failures.push(`${scene.slug} ${item.state} at ${width}: ${name}`);
    };
    const readable = (paragraphs, width) => paragraphs.length > 0 && paragraphs.every((paragraph) => paragraph.visible && paragraph.fontSize >= MIN_TEXT_PX && !paragraph.clipped && paragraph.left >= 0 && paragraph.right <= width + 0.5);
    const insideWindow = (item, width) => item.left >= 0 && item.right <= width + 0.5;

    // A note page has no scene, poster or Explore control: its copy and its way back, with and without JavaScript.
    if (scene.kind === 'note') {
      for (const [name, javascript] of [['note page', true], ['no JavaScript', false]]) {
        const item = state(name);
        const note = await browser.newPage();
        note.setDefaultTimeout(120000);
        note.on('pageerror', (error) => results.errors.push({ scene: scene.slug, message: error.message }));
        await note.setJavaScriptEnabled(javascript);
        await note.goto(url, { waitUntil: 'networkidle0' });
        for (const width of widths) {
          await note.setViewport({ width, height: 900, deviceScaleFactor: 1 });
          await settle(note);
          const shown = await note.evaluate(measureNote);
          const reach = await intoView('main a.btn')(note);
          const tabs = await tabsToReach(note, 'main a.btn');
          // axe runs page timers, which a page with scripts off does not have; the copy is the same either way.
          const ratio = javascript ? await contrast('main')(note) : null;
          await note.evaluate(() => window.scrollTo(0, 0));
          await note.screenshot({ path: join(shots, `${javascript ? 'note' : 'no-javascript'}-${width}.png`), fullPage: true });
          step(item, width, {
            'no horizontal scroll': shown.documentScrollWidth <= shown.innerWidth,
            'copy readable': readable(shown.copy, width),
            'copy contrast passes': !ratio || (ratio.failures.length === 0 && ratio.checked > 0),
            [`way back at least ${MIN_TARGET_PX} px each way`]: reach.width >= MIN_TARGET_PX && reach.height >= MIN_TARGET_PX,
            'way back inside the window': reach.inside && insideWindow(shown.link, width),
            'way back answers a tap at its centre': reach.hit,
            'way back reachable by keyboard': tabs !== null,
            'no picture, render or logo on the page': shown.pictures === 0,
          }, { measured: shown, reach, tabs, contrast: ratio, summary: `"${shown.link?.text}" ${Math.round(reach.width)}x${Math.round(reach.height)}, ${tabs} Tab presses, copy ${Math.min(...shown.copy.map((paragraph) => paragraph.fontSize))}px+${ratio ? `, contrast ${ratio.minimum?.toFixed(1)}:1` : ''}` });
        }
        await note.close();
      }
      results.scenes.push(record);
      continue;
    }

    // 0. Layout shift while the page loads: Explore is revealed once the shell's script has run, and must not push the copy around.
    {
      const item = state('layout shift');
      for (const width of widths) {
        const shifted = await browser.newPage();
        try {
          await shifted.evaluateOnNewDocument(() => {
            window.__shifts = [];
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) window.__shifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput });
            }).observe({ type: 'layout-shift', buffered: true });
          });
          await shifted.setViewport({ width, height: 900, deviceScaleFactor: 1 });
          await shifted.goto(url, { waitUntil: 'networkidle0' });
          await shifted.evaluate(async () => { await document.fonts.ready; });
          await new Promise((resolve) => setTimeout(resolve, 800));
          const total = await shifted.evaluate(() => window.__shifts.filter((entry) => !entry.hadRecentInput).reduce((sum, entry) => sum + entry.value, 0));
          step(item, width, { [`layout shift under ${MAX_SHIFT}`]: total < MAX_SHIFT }, { total, summary: total.toFixed(4) });
        } finally { await shifted.close(); }
      }
    }

    // 1. Loaded.
    const loaded = state('loaded');
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (error) => results.errors.push({ scene: scene.slug, message: error.message }));
    await page.goto(url, { waitUntil: 'networkidle0' });
    for (const width of widths) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await settle(page);
      const shown = await measure_(page);
      const reach = await intoView('scene-shell [data-explore]')(page);
      const tabs = await tabsToReach(page, 'scene-shell [data-explore]');
      const ratio = await contrast('scene-shell [data-intro]')(page);
      // From the top: the skip link is fixed and parked above the window, and a full-page capture of a scrolled page draws it.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(shots, `loaded-${width}.png`), fullPage: true });
      step(loaded, width, {
        'no horizontal scroll': shown.documentScrollWidth <= shown.innerWidth && !shown.shellClipped,
        'poster inside the window and loaded': !shown.poster || (insideWindow(shown.poster, width) && shown.poster.loaded),
        'Explore shown': shown.explore?.shown,
        [`Explore at least ${MIN_TARGET_PX} px each way`]: reach.width >= MIN_TARGET_PX && reach.height >= MIN_TARGET_PX,
        'Explore inside the window': reach.inside && insideWindow(shown.explore, width),
        'Explore answers a tap at its centre': reach.hit,
        'Explore reachable by keyboard': tabs !== null,
        'copy readable': readable(shown.introCopy, width),
        'copy contrast passes': ratio.failures.length === 0 && ratio.checked > 0,
      }, { measured: shown, reach, tabs, contrast: ratio, summary: `Explore ${Math.round(reach.width)}x${Math.round(reach.height)}, ${tabs} Tab presses, copy ${Math.min(...shown.introCopy.map((paragraph) => paragraph.fontSize))}px+, contrast ${ratio.minimum?.toFixed(1)}:1` });
    }
    await page.close();

    // 2. No JavaScript.
    const plain = state('no JavaScript');
    const noJs = await browser.newPage();
    await noJs.setJavaScriptEnabled(false);
    await noJs.goto(url, { waitUntil: 'networkidle0' });
    for (const width of widths) {
      await noJs.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await settle(noJs);
      const shown = await measure_(noJs);
      await noJs.screenshot({ path: join(shots, `no-javascript-${width}.png`), fullPage: true });
      step(plain, width, {
        'no horizontal scroll': shown.documentScrollWidth <= shown.innerWidth && !shown.shellClipped,
        'poster inside the window and loaded': !shown.poster || (insideWindow(shown.poster, width) && shown.poster.loaded),
        'Explore stays out of sight': !shown.explore?.shown,
        'copy readable': readable(shown.introCopy, width),
        'noscript notice readable': Boolean(shown.noscript) && shown.noscript.visible && shown.noscript.fontSize >= MIN_TEXT_PX && !shown.noscript.clipped && insideWindow(shown.noscript, width),
      }, { measured: shown, summary: `notice "${shown.noscript?.text}"` });
    }
    await noJs.close();

    // 3. The runtime fails.
    {
      const failing = state('runtime error');
      const broken = await browser.newPage();
      broken.setDefaultTimeout(120000);
      await broken.setRequestInterception(true);
      broken.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith(`/scene-runtime/${scene.slug}/`) && path.endsWith('/frame.html')) {
          // A frame scene reports a fatal error the way the real one would.
          void request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>frame</title><script>parent.postMessage({source:"kiln-scene",state:"error",message:"Simulated failure."},location.origin)</script>' });
        } else if (path.startsWith(`/scene-runtime/${scene.slug}/`) && path.endsWith('.js')) void request.abort();
        else void request.continue();
      });
      for (const width of widths) {
        await broken.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await broken.goto(url, { waitUntil: 'networkidle0' });
        await broken.evaluate(() => document.querySelector('scene-shell').scrollIntoView({ block: 'start' }));
        await broken.click('scene-shell [data-explore]');
        await broken.waitForFunction(() => document.querySelector('scene-shell')?.dataset.sceneState === 'error');
        const shown = await measure_(broken);
        const focused = await broken.evaluate(() => document.activeElement?.matches('scene-shell [data-explore]'));
        const ratio = await contrast('scene-shell [data-status]')(broken);
        await broken.evaluate(() => window.scrollTo(0, 0));
        await broken.screenshot({ path: join(shots, `runtime-error-${width}.png`), fullPage: true });
        step(failing, width, {
          'failure copy shown': Boolean(shown.status),
          'failure copy readable': Boolean(shown.status) && shown.status.visible && shown.status.fontSize >= MIN_TEXT_PX && !shown.status.clipped && insideWindow(shown.status, width),
          'failure copy contrast passes': ratio.failures.length === 0,
          'no horizontal scroll': shown.documentScrollWidth <= shown.innerWidth,
          'Explore is back and focused': shown.explore?.shown && focused,
        }, { measured: shown, contrast: ratio, summary: `"${shown.status?.text}"` });
      }
      await broken.close();
    }

    // 4. A build with no runtime for the scene: the shell's data-kind is "none" and Explore opens the fallback.
    {
      const fallback = state('unavailable in this build');
      const open = await browser.newPage();
      open.setDefaultTimeout(120000);
      for (const width of widths) {
        await open.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await open.goto(url, { waitUntil: 'networkidle0' });
        await open.evaluate(() => { document.querySelector('scene-shell').dataset.kind = 'none'; });
        await open.evaluate(() => document.querySelector('scene-shell').scrollIntoView({ block: 'start' }));
        await open.click('scene-shell [data-explore]');
        await open.waitForSelector('scene-shell [data-mount] h2');
        const inside = await open.evaluate(() => {
          const overlay = document.querySelector('scene-shell [data-active]');
          const rectOf = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; };
          const paragraph = overlay.querySelector('[data-mount] p');
          const link = overlay.querySelector('[data-mount] a');
          const heading = overlay.querySelector('[data-mount] h2');
          return { scrollWidth: overlay.scrollWidth, clientWidth: overlay.clientWidth, heading: { text: heading.textContent.trim(), ...rectOf(heading), fontSize: Number.parseFloat(getComputedStyle(heading).fontSize) }, paragraph: { text: paragraph.textContent.trim().slice(0, 90), ...rectOf(paragraph), fontSize: Number.parseFloat(getComputedStyle(paragraph).fontSize) }, link: { text: link.textContent.trim(), href: link.getAttribute('href'), ...rectOf(link) }, exit: rectOf(overlay.querySelector('[data-exit]')) };
        });
        const ratio = await contrast('scene-shell [data-active]')(open);
        await open.screenshot({ path: join(shots, `unavailable-${width}.png`) });
        step(fallback, width, {
          'no horizontal scroll': inside.scrollWidth <= inside.clientWidth,
          'title and copy readable': inside.paragraph.fontSize >= MIN_TEXT_PX && inside.heading.fontSize >= MIN_TEXT_PX && insideWindow(inside.paragraph, width) && insideWindow(inside.heading, width),
          'fallback link inside the window and large enough': insideWindow(inside.link, width) && inside.link.height >= MIN_TARGET_PX && inside.link.width >= MIN_TARGET_PX,
          'Exit inside the window and large enough': insideWindow(inside.exit, width) && inside.exit.height >= MIN_TARGET_PX,
          'contrast passes': ratio.failures.length === 0,
        }, { measured: inside, contrast: ratio, summary: `"${inside.heading.text}", link to ${inside.link.href}` });
      }
      await open.close();
    }

    // 5. Open: the overlay's controls stay inside the window at every width.
    {
      const opened = state('open');
      const live = await browser.newPage();
      live.setDefaultTimeout(240000);
      await live.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await live.goto(url, { waitUntil: 'networkidle0' });
      await live.click('scene-shell [data-explore]');
      await live.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('scene-shell')?.dataset.sceneState), { timeout: 240000 });
      assert.equal(await live.$eval('scene-shell', (element) => element.dataset.sceneState), 'ready', `${scene.slug} must reach ready`);
      for (const width of widths) {
        await live.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const controls = await live.evaluate(() => {
          const rectOf = (selector) => { const element = document.querySelector(selector); if (!element || element.hidden || !element.checkVisibility()) return null; const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; };
          const overlay = document.querySelector('scene-shell [data-active]');
          return { scrollWidth: overlay.scrollWidth, clientWidth: overlay.clientWidth, exit: rectOf('scene-shell [data-exit]'), fullscreen: rectOf('scene-shell [data-fullscreen]'), mount: rectOf('scene-shell [data-mount]'), innerHeight };
        });
        await live.screenshot({ path: join(shots, `open-${width}.png`) });
        step(opened, width, {
          'no horizontal scroll in the overlay': controls.scrollWidth <= controls.clientWidth,
          'Exit inside the window and large enough': Boolean(controls.exit) && insideWindow(controls.exit, width) && controls.exit.height >= MIN_TARGET_PX && controls.exit.top >= 0,
          'Fullscreen, when offered, inside the window': !controls.fullscreen || insideWindow(controls.fullscreen, width),
          'the scene has room': Boolean(controls.mount) && controls.mount.width >= width - 1 && controls.mount.height >= 200,
        }, { measured: controls, summary: `Exit ${Math.round(controls.exit?.width ?? 0)}x${Math.round(controls.exit?.height ?? 0)}, scene ${Math.round(controls.mount?.width ?? 0)}x${Math.round(controls.mount?.height ?? 0)}` });
      }
      await live.click('scene-shell [data-exit]');
      await live.close();
    }
    results.scenes.push(record);
  }
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, 'scene-widths.json'), JSON.stringify(results, null, 2));
  await writeFile(join(review, 'scene-widths.log'), `${lines.join('\n')}\n`);
  for (const line of lines) console.log(line);
}
assert.deepEqual(results.failures, [], `${results.failures.length} scene width checks failed`);
assert.equal(results.errors.length, 0, `A scene page threw: ${JSON.stringify(results.errors.slice(0, 3))}`);
console.log(`Scene widths gate passed: ${results.scenes.length} scenes, ${lines.length} state and width combinations, widths ${widths.join(', ')}.`);

/** `measure` run in the page. */
async function measure_(page) {
  return page.evaluate(measure);
}
