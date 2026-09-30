import { describe, expect, test } from 'bun:test';
import { ARCHIVE_INDEX_ROUTE, archiveIndexingErrors, discoveryErrors, embeddedDocumentErrors, foundryFloorErrors, inspectHtml, isArchiveItemRoute, isEmbeddedDocument, resolveInternalLink, retiredNameErrors, routeForFile, socialMetadataErrors } from './static-validation-core.mjs';
import foundryFloor from '../src/data/foundry-floor.json';
test('static routes use directory URLs while 404 keeps its HTML route', () => {
  expect(routeForFile('index.html')).toBe('/');
  expect(routeForFile('docs/install/index.html')).toBe('/docs/install/');
  expect(routeForFile('404.html')).toBe('/404.html');
});
test('internal links resolve queries and fragments without escaping the output root', () => {
  expect(resolveInternalLink('../programs/?from=install#edits', '/docs/install/')).toEqual({ path: '/docs/programs/', fragment: 'edits' });
  expect(resolveInternalLink('https://kilnstudio.tools/gallery/#filters', '/')).toEqual({ path: '/gallery/', fragment: 'filters' });
  expect(resolveInternalLink('https://github.com/matthew-kissinger/kiln', '/')).toBeNull();
});
test('HTML inspection uses parsed elements and ignores code and comments', () => {
  const html = '<html lang="en"><head><title>Source</title><meta name="description" content="Retained source"><link rel="canonical" href="https://kilnstudio.tools/docs/programs/"></head><body><!-- <a href="/missing/"> --><h1 id="source">Source</h1><a href="#source">Read</a><pre>&lt;a href="/missing/"&gt;</pre><img src="/x.webp" srcset="/x.webp 400w, /y.webp 800w" alt="Test"></body></html>';
  const result = inspectHtml(html);
  expect(result.h1Count).toBe(1);
  expect(result.ids).toContain('source');
  expect(result.title).toBe('Source');
  expect(result.description).toBe('Retained source');
  expect(result.references.map((entry: { url: string }) => entry.url)).not.toContain('/missing/');
  expect(result.references.map((entry: { url: string }) => entry.url)).toContain('/y.webp');
});

test('robots directives are read from the page, and noindex is recognised inside a list', () => {
  const page = (content: string) => `<html lang="en"><head><title>x</title><meta name="robots" content="${content}"></head><body></body></html>`;
  expect(inspectHtml(page('noindex, follow'))).toMatchObject({ robots: 'noindex, follow', noindex: true });
  expect(inspectHtml(page('noindex, nofollow'))).toMatchObject({ robots: 'noindex, nofollow', noindex: true });
  expect(inspectHtml(page('index, follow'))).toMatchObject({ robots: 'index, follow', noindex: false });
  expect(inspectHtml('<html lang="en"><head><title>x</title></head><body></body></html>')).toMatchObject({ robots: undefined, noindex: false });
});

test('archive item routes are the third level under /gallery/archive/ only', () => {
  expect(isArchiveItemRoute('/gallery/archive/robot-arm/')).toBe(true);
  expect(isArchiveItemRoute('/gallery/archive/')).toBe(false);
  expect(isArchiveItemRoute('/gallery/farmhouse/')).toBe(false);
  expect(isArchiveItemRoute('/gallery/archive/robot-arm/extra/')).toBe(false);
  expect(ARCHIVE_INDEX_ROUTE).toBe('/gallery/archive/');
});

const page = (route: string, over: Record<string, unknown> = {}) => [route, { canonical: new URL(route, 'https://kilnstudio.tools').href, robots: undefined, noindex: false, ...over }] as const;
const site = (over: Record<string, Record<string, unknown>> = {}) => new Map([
  page('/gallery/'), page('/gallery/farmhouse/'), page('/gallery/archive/'),
  page('/gallery/archive/robot-arm/', { robots: 'noindex, follow', noindex: true }),
  page('/gallery/archive/pirate-ship/', { robots: 'noindex, follow', noindex: true }),
].map(([route, value]) => [route, { ...value, ...over[route] }] as const));
const urls = (...routes: string[]) => routes.map((route) => new URL(route, 'https://kilnstudio.tools').href);
const rule = (pages: Map<string, Record<string, unknown>>, sitemap = urls('/gallery/', '/gallery/farmhouse/', '/gallery/archive/'), llms = urls('/gallery/', '/gallery/archive/')) =>
  archiveIndexingErrors({ pages: pages as never, sitemapUrls: sitemap, llmsUrls: llms, expectedItems: ['/gallery/archive/robot-arm/', '/gallery/archive/pirate-ship/'] }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

test('the archive rule passes when items are noindex, follow and left out, and the index and reviewed pages are listed', () => {
  expect(rule(site())).toEqual([]);
});

test('the archive rule names every way an item can be indexed', () => {
  expect(rule(site({ '/gallery/archive/robot-arm/': { robots: 'noindex, nofollow' } }))).toEqual(['/gallery/archive/robot-arm/: Archive item must be "noindex, follow", got "noindex, nofollow"']);
  expect(rule(site({ '/gallery/archive/robot-arm/': { robots: undefined, noindex: false } }))).toEqual(['/gallery/archive/robot-arm/: Archive item must be "noindex, follow", got null']);
  expect(rule(site({ '/gallery/archive/pirate-ship/': { canonical: 'https://kilnstudio.tools/gallery/archive/robot-arm/' } }))).toEqual(['/gallery/archive/pirate-ship/: Archive item canonical must stay https://kilnstudio.tools/gallery/archive/pirate-ship/, got https://kilnstudio.tools/gallery/archive/robot-arm/']);
  expect(rule(site(), urls('/gallery/', '/gallery/farmhouse/', '/gallery/archive/', '/gallery/archive/robot-arm/'))).toEqual(['/gallery/archive/robot-arm/: Archive item is in the sitemap']);
  expect(rule(site(), undefined, urls('/gallery/archive/pirate-ship/'))).toEqual(['/gallery/archive/pirate-ship/: Archive item is in llms.txt']);
  const missing = site();
  missing.delete('/gallery/archive/pirate-ship/');
  expect(rule(missing)).toEqual(['/gallery/archive/pirate-ship/: Archive item page was not emitted']);
});

test('an archive page nobody expected is held to the same rule', () => {
  const pages = site();
  pages.set(...page('/gallery/archive/surprise/'));
  expect(rule(pages)).toEqual(['/gallery/archive/surprise/: Archive item must be "noindex, follow", got null']);
});

test('the archive index and the reviewed gallery stay indexed and in the sitemap', () => {
  expect(rule(site({ '/gallery/archive/': { robots: 'noindex, follow', noindex: true } }))).toEqual(['/gallery/archive/: Archive index must stay indexed']);
  expect(rule(site(), urls('/gallery/', '/gallery/farmhouse/'))).toEqual(['/gallery/archive/: Archive index is absent from the sitemap']);
  expect(rule(site({ '/gallery/farmhouse/': { robots: 'noindex, follow', noindex: true } }))).toEqual(['/gallery/farmhouse/: Reviewed gallery page must stay indexed']);
  expect(rule(site(), urls('/gallery/archive/', '/gallery/farmhouse/'))).toEqual(['/gallery/: Reviewed gallery page is absent from the sitemap']);
  const noArchive = site();
  noArchive.delete('/gallery/archive/');
  expect(rule(noArchive)).toEqual(['/gallery/archive/: Archive index page is missing']);
});

test('a staged scene frame is an embedded document, not a page', () => {
  expect(isEmbeddedDocument('/scene-runtime/golden-gate/frame.html')).toBe(true);
  expect(isEmbeddedDocument('/scenes/golden-gate/')).toBe(false);
  expect(isEmbeddedDocument('/scene-runtime/golden-gate/')).toBe(false);
  expect(isEmbeddedDocument('/frame.html')).toBe(false);
});

test('an embedded document needs a title, a language and to be kept out of search and link graphs', () => {
  const frame = (over: Record<string, unknown> = {}) => ({ title: 'Golden Gate Bridge', language: 'en', robots: 'noindex, nofollow', noindex: true, ...over });
  expect(embeddedDocumentErrors(frame())).toEqual([]);
  expect(embeddedDocumentErrors(frame({ title: ' ' }))).toEqual(['Missing title']);
  expect(embeddedDocumentErrors(frame({ language: undefined }))).toEqual(['Missing lang="en"']);
  expect(embeddedDocumentErrors(frame({ robots: 'noindex, follow' }))).toEqual(['Embedded document must be "noindex, nofollow", got "noindex, follow"']);
  expect(embeddedDocumentErrors(frame({ robots: undefined, noindex: false }))).toEqual(['Embedded document must be "noindex, nofollow", got null']);
});

describe('the retired working title', () => {
  const html = (body: string) => `<html lang="en"><head><title>x</title></head><body>${body}</body></html>`;
  const pages = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([route, body]) => [route, { html: html(body) }] as const));
  const check = (entries: Record<string, string>, files: string[] = ['index.html'], texts: Record<string, string> = {}) =>
    retiredNameErrors({ pages: pages(entries) as never, files, texts }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

  test('is not found on a clean site', () => {
    expect(check({ '/': '<a href="/packs/foundry-floor/">Foundry Floor</a>' }, ['index.html', 'social/foundry-floor.webp'], { 'sitemap.xml': '<loc>https://kilnstudio.tools/</loc>' })).toEqual([]);
  });

  test('is found in page text, an attribute, a route or file name, and a discovery file, whatever the case', () => {
    expect(check({ '/': '<p>Terafab (working title)</p>' })).toEqual(['/: The retired working title appears in the page']);
    expect(check({ '/scenes/': '<a href="/scenes/TERAFAB/">x</a>' })).toEqual(['/scenes/: The retired working title appears in the page']);
    expect(check({ '/': '' }, ['index.html', 'social/terafab.webp'])).toEqual(['social/terafab.webp: The retired working title appears in a file name']);
    expect(check({ '/': '' }, ['packs/terafab/index.html'])).toEqual(['packs/terafab/index.html: The retired working title appears in a file name']);
    expect(check({ '/': '' }, ['index.html'], { 'llms.txt': '- [Terafab](https://kilnstudio.tools/packs/terafab/)' })).toEqual(['llms.txt: The retired working title appears in llms.txt']);
  });
});

describe('the Foundry Floor pages', () => {
  const notice = 'Not affiliated with or endorsed by Tesla, SpaceX, xAI, Intel, ASML or any equipment maker.';
  const page = (body: string, robots: string | null = 'noindex, follow') => ({ html: `<html lang="en"><body><h1>Foundry Floor</h1>${body}</body></html>`, robots: robots ?? undefined, noindex: robots?.includes('noindex') ?? false });
  const good = () => new Map([
    ['/packs/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`)],
    ['/scenes/foundry-floor/', page(`<p>The scene is in production.</p><p>${notice}</p>`, 'noindex, nofollow')],
  ]);
  const check = (pages: Map<string, unknown>, sitemapUrls: string[] = ['https://kilnstudio.tools/']) =>
    foundryFloorErrors({ pages: pages as never, sitemapUrls }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

  test('the site data holds the requested line word for word', () => {
    expect(foundryFloor.notice).toBe(notice);
    expect(foundryFloor.packRoute).toBe('/packs/foundry-floor/');
    expect(foundryFloor.sceneRoute).toBe('/scenes/foundry-floor/');
    expect(JSON.stringify(foundryFloor)).not.toMatch(/terafab/i);
  });

  test('pass when both pages are in production, unindexed, out of the sitemap and carry the line', () => {
    expect(check(good())).toEqual([]);
  });

  test('report a missing page, an indexable page, a followed scene, a missing or altered line and a page that is not in production', () => {
    const missing = good();
    missing.delete('/scenes/foundry-floor/');
    expect(check(missing)).toEqual(['/scenes/foundry-floor/: The Foundry Floor page was not emitted']);
    const indexable = good();
    indexable.set('/packs/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`, null));
    expect(check(indexable)).toEqual(['/packs/foundry-floor/: The Foundry Floor page must be noindex']);
    const followed = good();
    followed.set('/scenes/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`, 'noindex, follow'));
    expect(check(followed)).toEqual(['/scenes/foundry-floor/: The Foundry Floor scene page must be "noindex, nofollow", got "noindex, follow"']);
    const altered = good();
    altered.set('/packs/foundry-floor/', page('<p>In production.</p><p>Not affiliated with Tesla.</p>'));
    expect(check(altered)).toEqual(['/packs/foundry-floor/: The Foundry Floor page must carry the no-affiliation line word for word']);
    const planned = good();
    planned.set('/packs/foundry-floor/', page(`<p>Coming soon.</p><p>${notice}</p>`));
    expect(check(planned)).toEqual(['/packs/foundry-floor/: The Foundry Floor page must say it is in production']);
  });

  test('report a page that reached the sitemap', () => {
    expect(check(good(), ['https://kilnstudio.tools/scenes/foundry-floor/'])).toEqual(['/scenes/foundry-floor/: The Foundry Floor page is in the sitemap']);
  });
});

// The contract the retired root fixture (scripts/site-indexing.test.mjs) stood for, on the site as it is now built:
// crawlers are pointed only at canonical documents, never at hash routes, and nothing blocks them.
test('a page has exactly one canonical link, counted rather than assumed', () => {
  const page = (links: string) => `<html lang="en"><head><title>x</title>${links}</head><body></body></html>`;
  const canonical = '<link rel="canonical" href="https://kilnstudio.tools/">';
  expect(inspectHtml(page(canonical)).canonicalCount).toBe(1);
  expect(inspectHtml(page(canonical + canonical)).canonicalCount).toBe(2);
  expect(inspectHtml(page('')).canonicalCount).toBe(0);
});

describe('discovery files', () => {
  const robots = 'User-agent: *\nAllow: /\n\nSitemap: https://kilnstudio.tools/sitemap.xml\n';
  const sitemapUrls = ['https://kilnstudio.tools/', 'https://kilnstudio.tools/docs/install/', 'https://kilnstudio.tools/gallery/farmhouse/'];
  const check = (over: { sitemapUrls?: string[]; robots?: string } = {}) => discoveryErrors({ sitemapUrls, robots, ...over }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

  test('canonical, fragment-free URLs and a robots file that names the sitemap pass', () => {
    expect(check()).toEqual([]);
  });

  test('a hash route, a query, a foreign origin, a relative URL and a duplicate in the sitemap are each reported', () => {
    expect(check({ sitemapUrls: [...sitemapUrls, 'https://kilnstudio.tools/#/gallery'] })).toEqual(['/sitemap.xml: Sitemap URL carries a fragment or query, which crawlers treat as the page it hangs from: https://kilnstudio.tools/#/gallery']);
    expect(check({ sitemapUrls: [...sitemapUrls, 'https://kilnstudio.tools/gallery/?filter=cow'] })).toEqual(['/sitemap.xml: Sitemap URL carries a fragment or query, which crawlers treat as the page it hangs from: https://kilnstudio.tools/gallery/?filter=cow']);
    expect(check({ sitemapUrls: [...sitemapUrls, 'https://example.com/'] })).toEqual(['/sitemap.xml: Sitemap URL is not on https://kilnstudio.tools: https://example.com/']);
    expect(check({ sitemapUrls: [...sitemapUrls, '/docs/programs/'] })).toEqual(['/sitemap.xml: Sitemap URL is not on https://kilnstudio.tools: /docs/programs/']);
    expect(check({ sitemapUrls: [...sitemapUrls, sitemapUrls[1]!] })).toEqual([`/sitemap.xml: Sitemap URL is listed twice: ${sitemapUrls[1]}`]);
    expect(check({ sitemapUrls: [] })).toEqual(['/sitemap.xml: The sitemap lists no pages']);
  });

  test('robots.txt must name the sitemap and must not block the whole site', () => {
    expect(check({ robots: 'User-agent: *\nAllow: /\n' })).toEqual(['/robots.txt: robots.txt does not name https://kilnstudio.tools/sitemap.xml']);
    expect(check({ robots: 'User-agent: *\nDisallow: /\n\nSitemap: https://kilnstudio.tools/sitemap.xml\n' })).toEqual(['/robots.txt: robots.txt blocks the whole site with "Disallow: /"']);
    expect(check({ robots: '' })).toEqual(['/robots.txt: robots.txt is missing or empty']);
    // A rule for one path is not the whole site, and an empty Disallow allows everything.
    expect(check({ robots: 'User-agent: *\nDisallow: /private/\nDisallow:\n\nSitemap: https://kilnstudio.tools/sitemap.xml\n' })).toEqual([]);
  });
});

describe('social card metadata', () => {
  const home = 'https://kilnstudio.tools/social/home.jpg';
  const page = (over: Record<string, unknown> = {}) => ({
    og: { image: home, 'image:width': '1200', 'image:height': '630' },
    twitter: { card: 'summary_large_image', image: home },
    ...over,
  });
  const jpeg = { width: 1200, height: 630, format: 'jpeg' };

  test('a large-image card that repeats the Open Graph card, as a JPEG or PNG at its real size, passes', () => {
    expect(socialMetadataErrors(page(), jpeg)).toEqual([]);
    expect(socialMetadataErrors(page(), { ...jpeg, format: 'png' })).toEqual([]);
  });

  test('report another card kind, a different Twitter image and declared sizes that differ from the file', () => {
    expect(socialMetadataErrors(page({ twitter: { card: 'summary', image: home } }), jpeg)).toEqual(['twitter:card must be summary_large_image, got "summary"']);
    expect(socialMetadataErrors(page({ twitter: { card: 'summary_large_image', image: 'https://kilnstudio.tools/social/other.jpg' } }), jpeg)).toEqual(['twitter:image must be the same card as og:image']);
    expect(socialMetadataErrors(page(), { ...jpeg, height: 628 })).toEqual(['og:image declares 1200×630 but the card is 1200×628']);
  });

  // The previous site's fixture required a PNG after two LinkedIn-specific preview fixes; every crawler documents JPEG and PNG.
  test('a card in a format only some crawlers read is reported', () => {
    expect(socialMetadataErrors(page(), { ...jpeg, format: 'webp' })).toEqual(['og:image must be a JPEG or PNG, the formats every share crawler reads, not webp']);
    expect(socialMetadataErrors(page(), { ...jpeg, format: 'gif' })).toEqual(['og:image must be a JPEG or PNG, the formats every share crawler reads, not gif']);
  });
});

describe('the sitemap index kept for the existing Search Console submission', () => {
  const robots = 'User-agent: *\nAllow: /\n\nSitemap: https://kilnstudio.tools/sitemap.xml\n';
  const sitemapUrls = ['https://kilnstudio.tools/'];
  const index = (locs: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((loc) => `  <sitemap><loc>${loc}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  const check = (sitemapIndex: string | undefined) => discoveryErrors({ sitemapUrls, robots, sitemapIndex }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

  test('an index that lists the sitemap passes, and an absent argument means it is not being checked', () => {
    expect(check(index(['https://kilnstudio.tools/sitemap.xml']))).toEqual([]);
    expect(check(undefined)).toEqual([]);
  });

  test('a missing index, another sitemap or a page URL in it are reported', () => {
    expect(check('')).toEqual(['/sitemap-index.xml: /sitemap-index.xml is missing or empty, so the submission kept in Search Console would fail']);
    expect(check(index(['https://kilnstudio.tools/other.xml']))).toEqual(['/sitemap-index.xml: The sitemap index must list only https://kilnstudio.tools/sitemap.xml, got https://kilnstudio.tools/other.xml']);
    expect(check(index(['https://kilnstudio.tools/sitemap.xml', 'https://kilnstudio.tools/docs/install/']))).toEqual(['/sitemap-index.xml: The sitemap index must list only https://kilnstudio.tools/sitemap.xml, got https://kilnstudio.tools/sitemap.xml, https://kilnstudio.tools/docs/install/']);
  });
});
