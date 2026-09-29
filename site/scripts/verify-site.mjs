import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import lighthouse from 'lighthouse';
import { chromeExecutable } from './build-site-media.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const at = value.indexOf('=');
  return at < 0 ? [value.replace(/^--/, ''), true] : [value.slice(0, at).replace(/^--/, ''), value.slice(at + 1)];
}));
if (!args.base || !args.out) throw new Error('Usage: node scripts/verify-site.mjs --base=http://127.0.0.1:4175 --out=<review-dir> [--phase=browser|lighthouse|all] [--routes=home,docs-page] [--executable=<Chrome-or-Chromium>]');
const base = String(args.base);
const out = resolve(String(args.out));
const phase = args.phase ?? 'all';
const executablePath = typeof args.executable === 'string' ? args.executable : chromeExecutable();
const suffix = typeof args.suffix === 'string' ? `-${args.suffix}` : '';
const routeSelection = typeof args.routes === 'string' ? args.routes.split(',') : null;
const routes = [
  ['home', '/'], ['packs', '/packs/'], ['pack-farm', '/packs/farm/'], ['pack-terafab', '/packs/terafab/'],
  ['gallery', '/gallery/'], ['asset-farmhouse', '/gallery/farmhouse/'], ['asset-bridge', '/gallery/golden-gate-bridge/'],
  ['archive', '/gallery/archive/'], ['archive-asset', '/gallery/archive/robot-arm/'],
  ['docs', '/docs/'], ['docs-page', '/docs/install/'], ['docs-projects', '/docs/projects-and-live-review/'],
  ['scenes', '/scenes/'], ['scene-farm', '/scenes/farm/'], ['scene-terafab', '/scenes/terafab/'], ['404', '/404.html'],
].filter(([slug]) => !routeSelection || routeSelection.includes(slug));
const widths = [390, 768, 1280, 1440, 1920];
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
await mkdir(out, { recursive: true });

const waitImages = async (page) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => image.loading !== 'lazy').map((image) => image.decode().catch(() => {})));
  });
};
const loadLazyImages = async (page) => {
  await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += Math.max(400, innerHeight)) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    await Promise.all([...document.images].filter((image) => image.getClientRects().length > 0).map((image) => image.decode().catch(() => {})));
    scrollTo(0, 0);
  });
};
const violations = async (page) => {
  await page.evaluate(axeSource);
  return page.evaluate(async () => (await window.axe.run()).violations.map(({ id, impact, description, helpUrl, nodes }) => ({
    id, impact, description, helpUrl,
    nodes: nodes.map(({ target, failureSummary, html }) => ({ target, failureSummary, html })),
  })));
};
async function screenshots(page, slug) {
  const directory = join(out, 'screenshots', `${slug}${suffix}`);
  await mkdir(directory, { recursive: true });
  const overflow = [];
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await waitImages(page);
    await loadLazyImages(page);
    overflow.push(await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      offenders: [...document.querySelectorAll('body *')].filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.position !== 'fixed' && box.width > 0 && box.right > innerWidth + 1 && !element.closest('pre, [role="region"], .overflow-x-auto');
      }).slice(0, 8).map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(element.className).slice(0, 90)}`),
    })));
    if (widths.includes(width)) await page.screenshot({ path: join(directory, `${width}.png`), fullPage: true });
  }
  const panels = [];
  for (let i = 0; i < widths.length; i++) {
    const image = await sharp(join(directory, `${widths[i]}.png`)).resize({ width: 220 }).toBuffer();
    const metadata = await sharp(image).metadata();
    const cropped = metadata.height > 1500 ? await sharp(image).extract({ left: 0, top: 0, width: 220, height: 1500 }).toBuffer() : image;
    panels.push({ input: cropped, left: i * 228, top: 36 });
    panels.push({ input: Buffer.from(`<svg width="220" height="30"><rect width="220" height="30" fill="#eee9df"/><text x="8" y="21" font-size="16" font-family="sans-serif" fill="#292d29">${widths[i]} px</text></svg>`), left: i * 228, top: 0 });
  }
  await mkdir(join(out, 'contact-sheets'), { recursive: true });
  await sharp({ create: { width: 1132, height: 1544, channels: 4, background: '#eee9df' } }).composite(panels).png().toFile(join(out, 'contact-sheets', `${slug}${suffix}.png`));
  return overflow;
}

async function browserChecks() {
  const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let previous;
  if (args.merge && routeSelection) {
    try { previous = JSON.parse(await readFile(join(out, `browser-checks${suffix}.json`), 'utf8')); } catch { /* No prior report. */ }
  }
  const result = { browser: await browser.version(), node: process.version, base, startedAt: new Date().toISOString(), priorStartedAt: previous?.startedAt, pages: previous?.pages?.filter((page) => !routeSelection.includes(page.slug)) ?? [], interactions: previous?.interactions?.filter((check) => !routeSelection.includes(/filter|Gallery without JavaScript/i.test(check.name) ? 'gallery' : 'home')) ?? [] };
  try {
    for (const [slug, route] of routes) {
      const page = await browser.newPage();
      const errors = [];
      const responses = [];
      const scripts = [];
      const requests = [];
      page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
      page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
      page.on('response', (response) => { if (response.status() >= 400 && !(route === '/404.html' && response.url().endsWith('/404.html'))) responses.push({ url: response.url(), status: response.status() }); });
      page.on('request', (request) => requests.push(request.url()));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.setCacheEnabled(false);
      const cdp = await page.createCDPSession();
      await cdp.send('Network.enable');
      let transferred = 0;
      cdp.on('Network.loadingFinished', ({ encodedDataLength }) => { transferred += encodedDataLength; });
      const scriptReads = [];
      page.on('response', (response) => {
        if (response.request().resourceType() === 'script') scriptReads.push(response.buffer().then((bytes) => scripts.push({ url: response.url(), bytes: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length })).catch(() => {}));
      });
      const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
      await waitImages(page);
      await Promise.all(scriptReads);
      const inlineScripts = await page.$$eval('script:not([src])', (elements) => elements.filter((element) => !element.type || ['module', 'text/javascript', 'application/javascript'].includes(element.type)).map((element) => element.textContent ?? '').join('\n'));
      const inlineBytes = Buffer.from(inlineScripts);
      const initial = { transferred, inlineScriptBytes: inlineBytes.length, inlineScriptGzipBytes: inlineBytes.length ? gzipSync(inlineBytes).length : 0, scriptBytes: scripts.reduce((sum, script) => sum + script.bytes, 0), gzipScriptBytes: scripts.reduce((sum, script) => sum + script.gzip, 0), brotliScriptBytes: scripts.reduce((sum, script) => sum + script.brotli, 0), scripts: [...scripts], heavyModuleRequests: requests.filter((url) => /(?:AssetViewerRuntime|FarmScene|react-dom|three\.module|\/mount[.-])/.test(url)) };
      const metadata = await page.evaluate(() => ({
        h1: [...document.querySelectorAll('h1')].map((element) => element.textContent),
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        noindex: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
        missingImages: [...document.images].filter((image) => image.complete && !image.naturalWidth).map((image) => image.src),
      }));
      const overflow = await screenshots(page, slug);
      const axe = [];
      for (const width of [390, 1440]) {
        await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
        axe.push({ width, violations: await violations(page) });
      }
      result.pages.push({ slug, route, capturedAt: new Date().toISOString(), status: response?.status(), metadata, initial, overflow, axe, errors, failedResponses: responses });
      await page.close();
      await writeFile(join(out, `browser-checks${suffix}.json`), JSON.stringify(result, null, 2));
      console.log(`${slug}: ${axe.reduce((sum, check) => sum + check.violations.length, 0)} axe violations, ${overflow.filter((check) => check.overflow).length} overflow widths, ${errors.length} console/page errors`);
    }
    if (!routeSelection || routeSelection.includes('gallery')) {
      const page = await browser.newPage();
      await page.goto(new URL('/gallery/', base).href, { waitUntil: 'networkidle0' });
      await page.select('#pack-filter', 'standalone');
      const visible = await page.$$eval('[data-asset]', (elements) => elements.filter((element) => !element.hidden).map((element) => element.querySelector('a')?.getAttribute('href')));
      result.interactions.push({ name: 'Standalone filter', pass: visible.length === 1 && visible[0] === '/gallery/golden-gate-bridge/', visible });
      await screenshots(page, 'gallery-filtered');
      await page.select('#category-filter', 'Nature');
      result.interactions.push({ name: 'Empty-filter state', pass: await page.$eval('#gallery-empty', (element) => !element.hidden) });
      await page.click('button[type="reset"]');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-asset]')].every((element) => !element.hidden));
      result.interactions.push({ name: 'Filter reset', pass: true });
      await page.close();
      const noJs = await browser.newPage();
      await noJs.setJavaScriptEnabled(false);
      await noJs.goto(new URL('/gallery/', base).href, { waitUntil: 'networkidle0' });
      const count = await noJs.$$eval('[data-asset]', (elements) => elements.filter((element) => !element.hidden).length);
      result.interactions.push({ name: 'Gallery without JavaScript', pass: count === 24, visibleCount: count });
      await noJs.close();
    }
    if (!routeSelection || routeSelection.includes('home')) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(new URL('/', base).href, { waitUntil: 'networkidle0' });
      await page.keyboard.press('Tab');
      result.interactions.push({ name: 'Skip link is the first keyboard target', pass: await page.evaluate(() => document.activeElement?.textContent === 'Skip to content') });
      await page.keyboard.press('Enter');
      result.interactions.push({ name: 'Skip link moves focus to main', pass: await page.evaluate(() => document.activeElement?.id === 'main') });
      await page.focus('#menu-toggle');
      await page.keyboard.press('Enter');
      result.interactions.push({ name: 'Mobile menu opens from keyboard', pass: await page.$eval('#primary-nav', (element) => !element.hidden) });
      await page.focus('#primary-nav a');
      await page.keyboard.press('Escape');
      result.interactions.push({ name: 'Mobile menu Escape restores focus', pass: await page.evaluate(() => document.querySelector('#primary-nav').hidden && document.activeElement?.id === 'menu-toggle') });
      for (const [hash, expected] of [['#/robot-arm', '/gallery/archive/robot-arm/'], ['#/gallery', '/gallery/archive/'], ['#/not-a-real-asset', '/gallery/archive/']]) {
        await page.goto(new URL(`/${hash}`, base).href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction((pathname) => location.pathname === pathname, { timeout: 5000 }, expected).catch(() => {});
        result.interactions.push({ name: `Legacy redirect ${hash}`, pass: new URL(page.url()).pathname === expected, final: page.url() });
      }
      await page.close();
    }
  } finally {
    await browser.close();
    result.finishedAt = new Date().toISOString();
    await writeFile(join(out, `browser-checks${suffix}.json`), JSON.stringify(result, null, 2));
  }
  const summary = {
    templates: result.pages.length,
    axeChecks: result.pages.reduce((sum, page) => sum + page.axe.length, 0),
    axeViolations: result.pages.reduce((sum, page) => sum + page.axe.reduce((count, check) => count + check.violations.length, 0), 0),
    overflowFailures: result.pages.reduce((sum, page) => sum + page.overflow.filter((check) => check.overflow).length, 0),
    consoleErrors: result.pages.reduce((sum, page) => sum + page.errors.length, 0),
    failedResponses: result.pages.reduce((sum, page) => sum + page.failedResponses.length, 0),
    behaviorFailures: result.interactions.filter((check) => !check.pass).length,
  };
  console.log(JSON.stringify(summary));
  if (summary.axeViolations || summary.overflowFailures || summary.consoleErrors || summary.failedResponses || summary.behaviorFailures) throw new Error('Browser verification found issues; see the saved report.');
}

async function lighthouseChecks() {
  const reports = [];
  await mkdir(join(out, 'lighthouse'), { recursive: true });
  for (const [slug, route] of routes.filter(([slug]) => ['home', 'pack-farm', 'gallery', 'asset-farmhouse', 'docs-page', 'scene-farm'].includes(slug))) {
    for (const device of ['mobile', 'desktop']) {
      const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0'] });
      try {
        const port = Number(new URL(browser.wsEndpoint()).port);
        const config = device === 'desktop' ? {
          extends: 'lighthouse:default', settings: {
            formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
            throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
          },
        } : undefined;
        const run = await lighthouse(new URL(route, base).href, { port, output: ['html', 'json'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, config);
        if (!run) throw new Error(`Lighthouse returned no result: ${slug} ${device}`);
        await writeFile(join(out, 'lighthouse', `${slug}-${device}${suffix}.html`), run.report[0]);
        await writeFile(join(out, 'lighthouse', `${slug}-${device}${suffix}.json`), run.report[1]);
        const lhr = run.lhr;
        const scores = Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, Math.round((value.score ?? 0) * 100)]));
        const record = {
          slug, route, device, lighthouseVersion: lhr.lighthouseVersion, browser: await browser.version(), node: process.version,
          scores,
          lcpMs: lhr.audits['largest-contentful-paint'].numericValue,
          cls: lhr.audits['cumulative-layout-shift'].numericValue,
          fcpMs: lhr.audits['first-contentful-paint'].numericValue,
          totalBytes: lhr.audits['total-byte-weight'].numericValue,
          failedAudits: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 1).map(([id, audit]) => ({ id, score: audit.score, title: audit.title, displayValue: audit.displayValue, description: audit.description })),
          warnings: lhr.runWarnings,
        };
        reports.push(record);
        await writeFile(join(out, `lighthouse-summary${suffix}.json`), JSON.stringify(reports, null, 2));
        console.log(`${slug} ${device}: ${JSON.stringify(scores)}; LCP ${Math.round(record.lcpMs)}ms; CLS ${record.cls}`);
      } finally { await browser.close(); }
    }
  }
}

if (phase === 'browser' || phase === 'all') await browserChecks();
if (phase === 'lighthouse' || phase === 'all') await lighthouseChecks();
