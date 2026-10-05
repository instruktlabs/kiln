import { describe, expect, test } from 'bun:test';
import { ARCHIVE_INDEX_ROUTE, archiveIndexingErrors, copyErrors, discoveryErrors, embeddedDocumentErrors, foundryFloorErrors, headersErrors, headersFor, inspectHtml, parseHeaderRules, scriptHashSource, isArchiveItemRoute, isEmbeddedDocument, licenceSpellingErrors, ownerReviewErrors, resolveInternalLink, retiredNameErrors, routeForFile, socialMetadataErrors } from './static-validation-core.mjs';
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
  expect(isEmbeddedDocument('/scene-packs/troy/troy-20261005-03/web/')).toBe(true);
  expect(isEmbeddedDocument('/scene-packs/troy/troy-20261005-03/web/qualification/pose-resources.html')).toBe(true);
  expect(isEmbeddedDocument('/packs/troy/')).toBe(false);
  expect(isEmbeddedDocument('/scene-packs/farm/release/web/')).toBe(false);
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

  test('pass when both pages are unindexed, out of the sitemap and carry the line', () => {
    expect(check(good())).toEqual([]);
  });

  test('report a missing page, an indexable page, a followed scene, and a missing or altered line', () => {
    const missing = good();
    missing.delete('/scenes/foundry-floor/');
    expect(check(missing)).toEqual(['/scenes/foundry-floor/: The Foundry Floor page was not emitted']);
    const indexable = good();
    indexable.set('/packs/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`, null));
    expect(check(indexable)).toEqual(['/packs/foundry-floor/: The Foundry Floor page must be noindex']);
    const followed = good();
    followed.set('/scenes/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`, 'noindex, follow'));
    expect(check(followed)).toEqual(['/scenes/foundry-floor/: The Foundry Floor scene page must be "noindex, nofollow", got "noindex, follow"']);
    // Exactly the two values of S-2 as corrected (content review, finding 4): a pack page that is also unfollowed is wrong.
    const unfollowedPack = good();
    unfollowedPack.set('/packs/foundry-floor/', page(`<p>In production.</p><p>${notice}</p>`, 'noindex, nofollow'));
    expect(check(unfollowedPack)).toEqual(['/packs/foundry-floor/: The Foundry Floor pack page must be "noindex, follow", got "noindex, nofollow"']);
    const altered = good();
    altered.set('/packs/foundry-floor/', page('<p>In production.</p><p>Not affiliated with Tesla.</p>'));
    // An altered line also names a maker outside the exact line.
    expect(check(altered)).toEqual(['/packs/foundry-floor/: The Foundry Floor page must carry the no-affiliation line word for word', '/packs/foundry-floor/: A maker named in the no-affiliation line appears outside it: Tesla']);
  });

  test('report a page that reached the sitemap', () => {
    expect(check(good(), ['https://kilnstudio.tools/scenes/foundry-floor/'])).toEqual(['/scenes/foundry-floor/: The Foundry Floor page is in the sitemap']);
  });

  test('report a brand name outside the no-affiliation line, a device claim on the scene page and an implied exterior', () => {
    const branded = good();
    branded.set('/packs/foundry-floor/', page(`<p>In production, with an ASML-style scanner.</p><p>${notice}</p>`));
    expect(check(branded)).toEqual(['/packs/foundry-floor/: A maker named in the no-affiliation line appears outside it: ASML']);
    const device = good();
    device.set('/scenes/foundry-floor/', page(`<p>In production. It plays on a phone.</p><p>${notice}</p>`, 'noindex, nofollow'));
    expect(check(device)).toEqual(['/scenes/foundry-floor/: The Foundry Floor scene page makes a device claim: phone']);
    const outside = good();
    outside.set('/scenes/foundry-floor/', page(`<p>In production. Walk the campus.</p><p>${notice}</p>`, 'noindex, nofollow'));
    expect(check(outside)).toEqual(['/scenes/foundry-floor/: The Foundry Floor page implies an exterior: campus']);
  });

  test('campus copy requires the explicitly staged campus inventory and keeps the in-production indexing rules', () => {
    const pages = good();
    pages.set('/scenes/foundry-floor/', page(`<p>In production. Walk the campus.</p><p>${notice}</p>`, 'noindex, nofollow'));
    expect(foundryFloorErrors({ pages: pages as never, sitemapUrls: [], hasCampus: true })).toEqual([]);
    expect(foundryFloorErrors({ pages: pages as never, sitemapUrls: [], hasCampus: false })).toHaveLength(1);
    pages.set('/scenes/foundry-floor/', page(`<p>In production. Walk the campus.</p><p>${notice}</p>`, 'index, follow'));
    expect(foundryFloorErrors({ pages: pages as never, sitemapUrls: [], hasCampus: true })).toHaveLength(1);
  });

  test('with the pack record, both pages state its placement: how many models the scene places, and the rest', () => {
    const placement = { assetCount: 31, placedInScene: 29 };
    const placed = (scene: string, pack: string) => new Map([
      ['/packs/foundry-floor/', page(`<p>In production.</p><p>${pack}</p><p>${notice}</p>`)],
      ['/scenes/foundry-floor/', page(`<p>In production.</p><p>${scene}</p><p>${notice}</p>`, 'noindex, nofollow')],
    ]);
    const scene = 'The fab is arranged from 29 of the pack’s 31 Kiln-authored models; the other 2 are in the pack but not placed.';
    const pack = 'The Foundry Floor scene places 29 of the 31 models. Far forms: 24 of the 31 models keep one.';
    const checkPlaced = (pages: Map<string, unknown>) =>
      foundryFloorErrors({ pages: pages as never, sitemapUrls: [], placement }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);
    expect(checkPlaced(placed(scene, pack))).toEqual([]);
    // A count glued to the word before it is not the statement a visitor should read.
    expect(checkPlaced(placed(scene.replace('other 2', 'other2'), pack))).toEqual(['/scenes/foundry-floor/: The Foundry Floor scene page must say the other 2 are in the pack but not placed']);
    expect(checkPlaced(placed(scene, pack.replace('places 29', 'places 30')))).toEqual(['/packs/foundry-floor/: The Foundry Floor page says the scene places 30 of 31; the pack record says 29 of 31']);
    expect(checkPlaced(placed(scene, 'The scene uses most of the models.'))).toEqual(['/packs/foundry-floor/: The Foundry Floor page must say how many of the pack’s models the scene places']);
    // A build without Commons packs carries no models on the pack page; the scene page is still checked.
    const withoutPacks = foundryFloorErrors({ pages: placed(scene.replace('other 2', 'other2'), 'This build does not carry the pack’s models.') as never, sitemapUrls: [], placement: { ...placement, packPage: false } });
    expect(withoutPacks.map((error: { page: string; message: string }) => `${error.page}: ${error.message}`)).toEqual(['/scenes/foundry-floor/: The Foundry Floor scene page must say the other 2 are in the pack but not placed']);
    // Without the record the placement is not checked (the fixtures above).
    expect(check(good())).toEqual([]);
  });

  test('read only what a visitor reads: script text and markup do not count', () => {
    const scripted = good();
    scripted.set('/scenes/foundry-floor/', page(`<p>In production.</p><script>const touch = "Intel";</script><p data-mobile="1">${notice}</p>`, 'noindex, nofollow'));
    expect(check(scripted)).toEqual([]);
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
  const alt = 'Isometric render of the farmhouse on a grey square, titled Farmhouse';
  const page = (over: Record<string, unknown> = {}) => ({
    title: 'Farmhouse — source and 3D model',
    og: { title: 'Farmhouse — source and 3D model', image: home, 'image:width': '1200', 'image:height': '630', 'image:type': 'image/jpeg', 'image:alt': alt },
    twitter: { card: 'summary_large_image', image: home, 'image:alt': alt },
    ...over,
  });
  const jpeg = { width: 1200, height: 630, format: 'jpeg' };

  test('a large-image card that repeats the Open Graph card, as a JPEG or PNG at its real size, passes', () => {
    expect(socialMetadataErrors(page(), jpeg)).toEqual([]);
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:type': 'image/png' } }), { ...jpeg, format: 'png' })).toEqual([]);
  });

  // Engineering review, finding 4: every page declared image/webp for a JPEG card.
  test('a declared type that differs from the card’s own is reported', () => {
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:type': 'image/webp' } }), jpeg)).toEqual(['og:image:type declares "image/webp" but the card is image/jpeg']);
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:type': undefined } }), jpeg)).toEqual(['og:image:type declares null but the card is image/jpeg']);
  });

  // Content review, finding 7: the alt text repeated the page title.
  test('the card’s alt text must describe the card: present, not the page title, the same for both networks', () => {
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:alt': '' } }), jpeg)).toContain('og:image:alt is missing');
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:alt': 'Farmhouse — source and 3D model' }, twitter: { ...page().twitter, 'image:alt': 'Farmhouse — source and 3D model' } }), jpeg)).toEqual(['og:image:alt repeats the page title instead of describing the card']);
    expect(socialMetadataErrors(page({ twitter: { ...page().twitter, 'image:alt': 'Something else' } }), jpeg)).toEqual(['twitter:image:alt must describe the same card as og:image:alt']);
  });

  test('report another card kind, a different Twitter image and declared sizes that differ from the file', () => {
    expect(socialMetadataErrors(page({ twitter: { ...page().twitter, card: 'summary' } }), jpeg)).toEqual(['twitter:card must be summary_large_image, got "summary"']);
    expect(socialMetadataErrors(page({ twitter: { ...page().twitter, image: 'https://kilnstudio.tools/social/other.jpg' } }), jpeg)).toEqual(['twitter:image must be the same card as og:image']);
    expect(socialMetadataErrors(page(), { ...jpeg, height: 628 })).toEqual(['og:image declares 1200×630 but the card is 1200×628']);
  });

  // The previous site's fixture required a PNG after two LinkedIn-specific preview fixes; every crawler documents JPEG and PNG.
  test('a card in a format only some crawlers read is reported', () => {
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:type': 'image/webp' } }), { ...jpeg, format: 'webp' })).toEqual(['og:image must be a JPEG or PNG, the formats every share crawler reads, not webp']);
    expect(socialMetadataErrors(page({ og: { ...page().og, 'image:type': 'image/gif' } }), { ...jpeg, format: 'gif' })).toEqual(['og:image must be a JPEG or PNG, the formats every share crawler reads, not gif']);
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

describe('copy rules on every page', () => {
  const html = (body: string) => `<html lang="en"><head><title>Page</title></head><body><main>${body}</main><footer><p>Kiln licence: MIT</p></footer></body></html>`;

  test('the site spells the noun "licence"; file names, quoted text and the verb forms are left alone', () => {
    expect(licenceSpellingErrors(html('<p>Keep the licence boundary intact. The GLBs are MIT-licensed builds; see ASSET-LICENSE.txt and LICENSE.</p>'))).toEqual([]);
    expect(licenceSpellingErrors(html('<p data-verbatim>Kiln and any software that opens these files retain their own licenses.</p><div data-verbatim><p>Record the license of each source.</p></div>'))).toEqual([]);
    expect(licenceSpellingErrors(html('<h2>Keep the license boundary intact.</h2><a href="/x">CC0-1.0 asset content License</a>'))).toEqual([
      `Spell the noun "licence" in the site's own prose: "Keep the license boundary intact."`,
      `Spell the noun "licence" in the site's own prose: "CC0-1.0 asset content License"`,
    ]);
    expect(licenceSpellingErrors(html('<code>license: MIT</code>'))).toEqual([]);
  });

  test('pages do not state owner review status: it stays in the catalog records', () => {
    expect(ownerReviewErrors(html('<h2>Review views</h2><p>A model.</p>'))).toEqual([]);
    expect(ownerReviewErrors(html('<h2>Owner approved</h2>'))).toHaveLength(1);
    expect(ownerReviewErrors(html('<p>Awaiting owner review</p>'))).toHaveLength(1);
  });

  test('verified review2 touch instructions do not authorize device or performance claims', () => {
    const instructions = 'Touch controls provide separate steering, throttle, brake / reverse and Boost.';
    const validate = (text: string, runtimeRelease = 'ff3-review2') => {
      const page = (copy: string, robots: string) => ({html: `<html><body><p>In production. ${copy}</p><p>${foundryFloor.notice}</p></body></html>`, robots, noindex: true});
      const pages = new Map([
        ['/packs/foundry-floor/', page('', 'noindex, follow')],
        ['/scenes/foundry-floor/', page(text, 'noindex, nofollow')],
      ]);
      return foundryFloorErrors({ pages: pages as never, sitemapUrls: [], hasCampus: true, runtimeRelease });
    };
    expect(validate(instructions)).toEqual([]);
    expect(validate(instructions, 'ff3')).toHaveLength(1);
    expect(validate(instructions, 'ff2')).toHaveLength(1);
    expect(validate('Touch controls run smoothly at 60 fps.')).toHaveLength(1);
    expect(validate(`${instructions} It plays on a phone.`)).toHaveLength(1);
    expect(validate('It performs smoothly on every touchscreen.')).toHaveLength(1);
  });

  test('the copy rules combine: glued numbers, licence spelling and owner status', () => {
    expect(copyErrors(html('<p>The licence is CC0-1.0.</p>'))).toEqual([]);
    expect(copyErrors(html('<p>Unity 6000.2.3f1 and 6000.0.0b12.</p>'))).toEqual([]);
    expect(copyErrors(html('<p>Awaiting owner review of the license, due April1935.</p>'))).toHaveLength(3);
  });
});

describe('the header layer in _headers (engineering review, finding 11)', () => {
  const script = 'document.body.dataset.ready = "1";';
  const file = (policy: string, extra = '') => `# comment
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=()
  Cache-Control: public, max-age=0, must-revalidate
  Content-Security-Policy-Report-Only: ${policy}

/_astro/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable

/scene-runtime/:scene/*.js
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
${extra}`;
  const good = file(`default-src 'self'; script-src 'self' ${scriptHashSource(script)}`);

  test('rules apply in order, "!" removes what an earlier rule set, placeholders match one segment', () => {
    const rules = parseHeaderRules(good);
    expect(rules.map((rule) => rule.path)).toEqual(['/*', '/_astro/*', '/scene-runtime/:scene/*.js']);
    expect(headersFor(rules, '/')['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(headersFor(rules, '/_astro/viewer.GoKKfp1n.js')['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/scene-runtime/golden-gate/index-CA13LcNQ.js')['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/scene-runtime/golden-gate/frame.html')['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(headersFor(rules, '/scene-runtime/a/b/c.js')['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/_astro/x.js')['x-content-type-options']).toBe('nosniff');
  });

  test('a complete layer passes; the CSP hashes must be exactly the pages’ inline scripts', () => {
    const files = ['index.html', '_astro/viewer.GoKKfp1n.js', 'scene-runtime/golden-gate/index-CA13LcNQ.js', 'scene-runtime/golden-gate/frame.html'];
    expect(headersErrors({ text: good, inlineScripts: [script], files })).toEqual([]);
    expect(headersErrors({ text: good, inlineScripts: [script, 'other()'], files })).toEqual([`script-src does not list the inline script ${scriptHashSource('other()')}`]);
    expect(headersErrors({ text: good, inlineScripts: [], files })).toEqual([`script-src lists ${scriptHashSource(script)}, which no page carries`]);
  });

  test('an enforced policy, a lost header, a blocked fullscreen or an unhashed immutable file are reported', () => {
    const enforced = good.replace('Content-Security-Policy-Report-Only', 'Content-Security-Policy');
    expect(headersErrors({ text: enforced, inlineScripts: [script] })).toEqual([
      'The content security policy is enforced; it stays report-only until the owner decides',
      'Pages carry no Content-Security-Policy-Report-Only',
    ]);
    expect(headersErrors({ text: good.replace('  X-Content-Type-Options: nosniff\n', ''), inlineScripts: [script] })).toEqual(['x-content-type-options on pages must be "nosniff", got null']);
    expect(headersErrors({ text: good.replace('camera=()', 'fullscreen=()'), inlineScripts: [script] })).toEqual(['The Permissions-Policy must leave fullscreen alone (the scenes use it)']);
    expect(headersErrors({ text: good, inlineScripts: [script], files: ['scene-runtime/farm/runtime.js'] })).toEqual(['/scene-runtime/farm/runtime.js is cached as immutable but its name carries no content hash']);
    const doubled = good.replace('/_astro/*\n  ! Cache-Control\n', '/_astro/*\n');
    expect(headersErrors({ text: doubled, inlineScripts: [script], files: ['_astro/a.GoKKfp1n.js'] })).toEqual(['/_astro/a.GoKKfp1n.js: Cache-Control is set twice (public, max-age=0, must-revalidate, public, max-age=31536000, immutable)']);
    expect(headersErrors({ text: good.replace('max-age=0, must-revalidate', 'max-age=86400'), inlineScripts: [script] })).toEqual(['HTML must be cached briefly and revalidated, got Cache-Control "public, max-age=86400"']);
  });

  test('inline scripts are found in pages; JSON-LD data blocks are not scripts to a CSP', () => {
    const page = inspectHtml(`<html><head><script>${script}</script><script type="application/ld+json">{"@type":"Thing"}</script><script type="module" src="/_astro/a.js"></script></head><body></body></html>`);
    expect(page.inlineScripts).toEqual([script]);
  });
});
