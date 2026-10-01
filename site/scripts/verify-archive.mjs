import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { ARCHIVE_INDEX_ROUTE, archiveIndexingErrors, inspectHtml, isArchiveItemRoute, ORIGIN } from './static-validation-core.mjs';

/**
 * Behaviour check for the archive's search policy, against a served build: every archive item is
 * "noindex, follow" with its own canonical URL and reachable, none is in sitemap.xml or llms.txt, robots.txt
 * blocks nothing (a blocked page could never show its noindex), the archive index and the reviewed gallery
 * stay indexed, and the old `#/<slug>` links still land on the archive page.
 *
 * Usage: node scripts/verify-archive.mjs <site-url> <report.json>
 */
const [base, reportFile] = process.argv.slice(2);
if (!base || !reportFile) throw new Error('Usage: node scripts/verify-archive.mjs <site-url> <report.json>');
const at = (route) => new URL(route, base).href;
const canonical = (route) => new URL(route, ORIGIN).href;
const text = async (route) => {
  const response = await fetch(at(route));
  return { status: response.status, body: await response.text() };
};

const report = { base, checks: {}, redirects: [], failures: [] };
const fail = (message) => report.failures.push(message);

const specimens = JSON.parse((await text('/assets/index.json')).body);
const items = specimens.map((specimen) => `/gallery/archive/${specimen.name}/`);
const sitemap = await text('/sitemap.xml');
const llms = await text('/llms.txt');
const robots = await text('/robots.txt');
assert.equal(sitemap.status, 200);
assert.equal(llms.status, 200);
assert.equal(robots.status, 200);
const sitemapUrls = Array.from(sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);
const llmsUrls = llms.body.match(/https:\/\/kilnstudio\.tools\/[^\s)]*/g) ?? [];

// Every item page, over HTTP.
const pages = new Map();
const statuses = [];
for (const route of items) {
  const { status, body } = await text(route);
  statuses.push(status);
  if (status === 200) pages.set(route, inspectHtml(body));
  else fail(`${route} answered ${status}`);
}
const indexPage = await text(ARCHIVE_INDEX_ROUTE);
const galleryPage = await text('/gallery/');
if (indexPage.status === 200) pages.set(ARCHIVE_INDEX_ROUTE, inspectHtml(indexPage.body));
else fail(`${ARCHIVE_INDEX_ROUTE} answered ${indexPage.status}`);
if (galleryPage.status === 200) pages.set('/gallery/', inspectHtml(galleryPage.body));
else fail(`/gallery/ answered ${galleryPage.status}`);

// The reviewed gallery pages are whatever the sitemap lists below /gallery/ (excluding the archive).
const reviewed = sitemapUrls
  .map((url) => new URL(url).pathname)
  .filter((route) => /^\/gallery\/[^/]+\/$/.test(route) && route !== ARCHIVE_INDEX_ROUTE);
for (const route of reviewed) {
  const { status, body } = await text(route);
  if (status === 200) pages.set(route, inspectHtml(body));
  else fail(`${route} answered ${status}`);
}
for (const error of archiveIndexingErrors({ pages, sitemapUrls, llmsUrls, expectedItems: items })) fail(`${error.page}: ${error.message}`);

// Nothing may be blocked from crawling: a blocked page could never show its noindex.
const blocking = robots.body.split(/\r?\n/).filter((line) => /^\s*disallow\s*:\s*\S/i.test(line));
if (blocking.length) fail(`robots.txt blocks crawling: ${blocking.join(' | ')}`);

// The archive index links every item, and every link works.
const linked = new Set(inspectHtml(indexPage.body).references.filter((reference) => reference.tag === 'a').map((reference) => new URL(reference.url, at(ARCHIVE_INDEX_ROUTE)).pathname).filter(isArchiveItemRoute));
const unlinked = items.filter((route) => !linked.has(route));
if (unlinked.length) fail(`The archive index does not link ${unlinked.length} items, first ${unlinked[0]}`);

report.checks = {
  specimens: specimens.length,
  itemPagesOk: statuses.filter((status) => status === 200).length,
  noindexFollow: items.filter((route) => pages.get(route)?.robots === 'noindex, follow').length,
  ownCanonical: items.filter((route) => pages.get(route)?.canonical === canonical(route)).length,
  inSitemap: items.filter((route) => sitemapUrls.includes(canonical(route))).length,
  inLlms: items.filter((route) => llmsUrls.includes(canonical(route))).length,
  linkedFromIndex: items.filter((route) => linked.has(route)).length,
  archiveIndex: { status: indexPage.status, robots: pages.get(ARCHIVE_INDEX_ROUTE)?.robots ?? null, inSitemap: sitemapUrls.includes(canonical(ARCHIVE_INDEX_ROUTE)), inLlms: llmsUrls.includes(canonical(ARCHIVE_INDEX_ROUTE)) },
  gallery: { robots: pages.get('/gallery/')?.robots ?? null, inSitemap: sitemapUrls.includes(canonical('/gallery/')) },
  reviewedGalleryPages: { count: reviewed.length, allIndexedAndInSitemap: reviewed.every((route) => pages.get(route) && !pages.get(route).noindex && sitemapUrls.includes(canonical(route))) },
  sitemapUrls: sitemapUrls.length,
  robotsTxtDisallowLines: blocking.length,
};

// The old #/<slug> links, in a real browser: on load and on hash change.
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
report.browser = await browser.version();
try {
  const first = items[0];
  const middle = items[Math.floor(items.length / 2)];
  const last = items.at(-1);
  const slug = (route) => route.split('/')[3];
  const landings = [
    [`/#/${slug(first)}`, first], [`/#/${slug(middle)}`, middle], [`/#/${slug(last)}`, last],
    ['/#/no-such-example', ARCHIVE_INDEX_ROUTE], ['/#/gallery', ARCHIVE_INDEX_ROUTE], ['/#/../../docs', ARCHIVE_INDEX_ROUTE],
  ];
  const observe = async (page) => page.evaluate(() => ({
    path: location.pathname, hash: location.hash, title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  }));
  const settle = async (page, expected) => {
    await page.waitForFunction((path) => location.pathname === path, { timeout: 8000 }, expected).catch(() => {});
    return observe(page);
  };
  for (const [entry, expected] of landings) {
    const page = await browser.newPage();
    await page.goto(at(entry), { waitUntil: 'domcontentloaded' });
    const landed = await settle(page, expected);
    report.redirects.push({ kind: 'load', entry, expected, ...landed, ok: landed.path === expected });
    await page.close();
  }
  // Hash change on an already loaded home page.
  {
    const page = await browser.newPage();
    await page.goto(at('/'), { waitUntil: 'networkidle0' });
    await page.evaluate((hash) => { location.hash = hash; }, `#/${slug(middle)}`);
    const landed = await settle(page, middle);
    report.redirects.push({ kind: 'hashchange', entry: `/ then #/${slug(middle)}`, expected: middle, ...landed, ok: landed.path === middle });
    await page.close();
  }
  // An ordinary fragment is not a legacy link.
  {
    const page = await browser.newPage();
    await page.goto(at('/#section'), { waitUntil: 'networkidle0' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const stayed = await observe(page);
    report.redirects.push({ kind: 'plain-fragment', entry: '/#section', expected: '/', ...stayed, ok: stayed.path === '/' });
    await page.close();
  }
} finally {
  await browser.close();
}
for (const redirect of report.redirects) {
  if (!redirect.ok) fail(`${redirect.kind} ${redirect.entry} landed on ${redirect.path}, expected ${redirect.expected}`);
  // A redirect that lands on an archive item lands on a page that keeps its own policy.
  else if (isArchiveItemRoute(redirect.path) && (redirect.robots !== 'noindex, follow' || redirect.canonical !== canonical(redirect.path))) fail(`${redirect.entry} landed on ${redirect.path} with robots ${redirect.robots} and canonical ${redirect.canonical}`);
}

await mkdir(dirname(reportFile), { recursive: true });
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const c = report.checks;
console.log(`Archive: ${c.itemPagesOk}/${c.specimens} item pages served, ${c.noindexFollow} noindex, follow, ${c.ownCanonical} with their own canonical, ${c.inSitemap} in sitemap.xml, ${c.inLlms} in llms.txt, ${c.linkedFromIndex} linked from the index.`);
console.log(`Index: robots ${c.archiveIndex.robots ?? 'none'}, in sitemap ${c.archiveIndex.inSitemap}. Gallery: robots ${c.gallery.robots ?? 'none'}, in sitemap ${c.gallery.inSitemap}. ${c.reviewedGalleryPages.count} reviewed gallery pages indexed and in the sitemap: ${c.reviewedGalleryPages.allIndexedAndInSitemap}. robots.txt Disallow lines: ${c.robotsTxtDisallowLines}.`);
console.log(`Redirects: ${report.redirects.filter((redirect) => redirect.ok).length}/${report.redirects.length} landed where expected.`);
for (const redirect of report.redirects) console.log(`  ${redirect.kind} ${redirect.entry} -> ${redirect.path} ${redirect.ok ? 'ok' : 'FAILED'}`);
if (report.failures.length) {
  for (const failure of report.failures.slice(0, 20)) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else console.log('Archive behaviour check passed.');
