import { parse } from 'parse5';
import foundryFloor from '../src/data/foundry-floor.json' with { type: 'json' };

export const ORIGIN = 'https://kilnstudio.tools';
export function routeForFile(file) {
  const normalized = file.replaceAll('\\', '/');
  return `/${normalized.replace(/(?:^|\/)index\.html$/, '/')}`.replace(/^\/\//, '/');
}
export function resolveInternalLink(href, route) {
  const url = new URL(href, new URL(route, ORIGIN));
  if (url.origin !== ORIGIN) return null;
  return { path: decodeURIComponent(url.pathname), fragment: decodeURIComponent(url.hash.slice(1)) };
}

/**
 * HTML the site serves inside a frame rather than as a page: the staged scene runtime documents. They are held to
 * what a frame needs (a title, a language, never indexed and no links followed), not to page metadata.
 */
export const isEmbeddedDocument = (route) => /^\/scene-runtime\/[^/]+\/frame\.html$/.test(route);
export function embeddedDocumentErrors(page) {
  const errors = [];
  if (!page.title?.trim()) errors.push('Missing title');
  if (page.language !== 'en') errors.push('Missing lang="en"');
  const wanted = new Set((page.robots ?? '').split(',').map((entry) => entry.trim().toLowerCase()));
  if (!wanted.has('noindex') || !wanted.has('nofollow')) {
    errors.push(`Embedded document must be "noindex, nofollow", got ${page.robots === undefined ? 'null' : JSON.stringify(page.robots)}`);
  }
  return errors;
}

/** The second pack's earlier working title. The owner retired it, so it must not come back anywhere in the built site. */
const RETIRED_NAME = /terafab/i;
export function retiredNameErrors({ pages, files = [], texts = {} }) {
  const errors = [];
  for (const [route, page] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
    if (RETIRED_NAME.test(page.html ?? '')) errors.push({ page: route, message: 'The retired working title appears in the page' });
  }
  for (const file of [...files].sort()) if (RETIRED_NAME.test(file)) errors.push({ page: file, message: 'The retired working title appears in a file name' });
  for (const [name, text] of Object.entries(texts)) if (RETIRED_NAME.test(text)) errors.push({ page: name, message: `The retired working title appears in ${name}` });
  return errors;
}

/** What a visitor reads on a page: the text of `<main>` (or of `<body>` without one), leaving out scripts and styles. */
export function visibleText(html) {
  const document = parse(html);
  const find = (node, tag) => {
    if (node.tagName === tag) return node;
    for (const child of node.childNodes ?? []) {
      const found = find(child, tag);
      if (found) return found;
    }
    return null;
  };
  const text = (node) => {
    if (node.nodeName === '#text') return node.value;
    if (['script', 'style', 'noscript', 'template'].includes(node.tagName)) return ' ';
    return (node.childNodes ?? []).map(text).join(' ');
  };
  const root = find(document, 'main') ?? find(document, 'body') ?? document;
  return text(root).replace(/\s+/g, ' ').trim();
}

/** The makers the no-affiliation line names: on a Foundry Floor page they appear in that line and nowhere else. */
const NOTICE_MAKERS = /\b(Tesla|SpaceX|xAI|Intel|ASML)\b/;
/** The scene page makes no device claims at all: its device test was not run (D-36). */
const DEVICE_CLAIM = /\b(phones?|tablets?|mobile|touch(?:screen)?|desktops?|laptops?|galaxy|iphone|ipad|android)\b/i;
/** Foundry Floor is an interior: nothing on its pages may imply an exterior, a campus or a landscape. */
const EXTERIOR = /\b(campus|landscape|exterior|outdoors?|roads?|parking)\b/i;
/** How many of the pack's models a Foundry Floor page says the scene places: "places 29 of the 31", "arranged from 29 of the pack’s 31". */
const PLACEMENT = /\b(?:places|arranged from) (\d+) of the (?:pack’s )?(\d+)\b/g;

/**
 * Foundry Floor is in production (D-33): its pack and scene pages are unindexed (the scene page also unfollowed),
 * out of the sitemap and say so, and carry the owner's no-affiliation line word for word. The makers that line names
 * appear nowhere else on them; the scene page makes no device claims; neither implies an exterior. Given the pack
 * record's `placement` ({ assetCount, placedInScene, packPage }), each page states how many models the scene places,
 * with the record's numbers, and the scene page says how many of the rest are in the pack but not placed. `packPage:
 * false` (a build without Commons packs, whose pack page carries no models) leaves the pack page out of that check.
 */
export function foundryFloorErrors({ pages, sitemapUrls, placement = null }) {
  const errors = [];
  const inSitemap = new Set(sitemapUrls);
  for (const [route, scene] of [[foundryFloor.packRoute, false], [foundryFloor.sceneRoute, true]]) {
    const add = (message) => errors.push({ page: route, message });
    const page = pages.get(route);
    if (!page) { add('The Foundry Floor page was not emitted'); continue; }
    const wanted = directives(page.robots);
    if (!wanted.has('noindex')) add('The Foundry Floor page must be noindex');
    else if (scene && !wanted.has('nofollow')) add(`The Foundry Floor scene page must be "noindex, nofollow", got ${JSON.stringify(page.robots)}`);
    if (!page.html.includes(foundryFloor.notice)) add('The Foundry Floor page must carry the no-affiliation line word for word');
    if (!/in production/i.test(page.html)) add('The Foundry Floor page must say it is in production');
    if (inSitemap.has(new URL(route, ORIGIN).href)) add('The Foundry Floor page is in the sitemap');
    const text = visibleText(page.html).split(foundryFloor.notice).join(' ');
    const maker = NOTICE_MAKERS.exec(text);
    if (maker) add(`A maker named in the no-affiliation line appears outside it: ${maker[1]}`);
    const device = scene ? DEVICE_CLAIM.exec(text) : null;
    if (device) add(`The Foundry Floor scene page makes a device claim: ${device[1]}`);
    const exterior = EXTERIOR.exec(text);
    if (exterior) add(`The Foundry Floor page implies an exterior: ${exterior[1]}`);
    if (placement && (scene || placement.packPage !== false)) {
      const statements = [...text.matchAll(PLACEMENT)];
      if (!statements.length) add('The Foundry Floor page must say how many of the pack’s models the scene places');
      for (const [, placed, total] of statements) {
        if (Number(placed) !== placement.placedInScene || Number(total) !== placement.assetCount) {
          add(`The Foundry Floor page says the scene places ${placed} of ${total}; the pack record says ${placement.placedInScene} of ${placement.assetCount}`);
        }
      }
      const others = placement.assetCount - placement.placedInScene;
      if (scene && others > 0 && !text.includes(`the other ${others} are in the pack but not placed`)) {
        add(`The Foundry Floor scene page must say the other ${others} are in the pack but not placed`);
      }
    }
  }
  return errors;
}

export const ARCHIVE_INDEX_ROUTE = '/gallery/archive/';
/** A page for one earlier example: exactly one path segment below the archive index. */
export const isArchiveItemRoute = (route) => /^\/gallery\/archive\/[^/]+\/$/.test(route);
const directives = (robots) => new Set((robots ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean));

/**
 * The archive keeps every item page browsable but out of search: each item is "noindex, follow", keeps its own
 * canonical, and is absent from sitemap.xml and llms.txt. The archive index and the reviewed gallery stay indexed.
 * Pure so a test can prove it without a build; `expectedItems` are the item routes the specimen list implies.
 */
export function archiveIndexingErrors({ pages, sitemapUrls, llmsUrls, expectedItems = [] }) {
  const errors = [];
  const add = (page, message) => errors.push({ page, message });
  const inSitemap = new Set(sitemapUrls);
  const inLlms = new Set(llmsUrls);
  const url = (route) => new URL(route, ORIGIN).href;
  const items = new Set([...expectedItems, ...[...pages.keys()].filter(isArchiveItemRoute)]);
  for (const route of [...items].sort()) {
    const page = pages.get(route);
    if (!page) { add(route, 'Archive item page was not emitted'); continue; }
    const wanted = directives(page.robots);
    if (wanted.size !== 2 || !wanted.has('noindex') || !wanted.has('follow')) {
      add(route, `Archive item must be "noindex, follow", got ${page.robots === undefined ? 'null' : JSON.stringify(page.robots)}`);
    }
    if (page.canonical !== url(route)) add(route, `Archive item canonical must stay ${url(route)}, got ${page.canonical}`);
    if (inSitemap.has(url(route))) add(route, 'Archive item is in the sitemap');
    if (inLlms.has(url(route))) add(route, 'Archive item is in llms.txt');
  }
  const index = pages.get(ARCHIVE_INDEX_ROUTE);
  if (!index) add(ARCHIVE_INDEX_ROUTE, 'Archive index page is missing');
  else {
    if (index.noindex) add(ARCHIVE_INDEX_ROUTE, 'Archive index must stay indexed');
    if (!inSitemap.has(url(ARCHIVE_INDEX_ROUTE))) add(ARCHIVE_INDEX_ROUTE, 'Archive index is absent from the sitemap');
  }
  for (const [route, page] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^\/gallery\/(?:[^/]+\/)?$/.test(route) || route === ARCHIVE_INDEX_ROUTE) continue;
    if (page.noindex) add(route, 'Reviewed gallery page must stay indexed');
    if (!inSitemap.has(url(route))) add(route, 'Reviewed gallery page is absent from the sitemap');
  }
  return errors;
}

/**
 * What crawlers are pointed at. The retired root fixture (scripts/site-indexing.test.mjs) guarded this for the old
 * single-page site; these are its surviving rules for the multipage site the build generates: the sitemap lists
 * canonical documents on the site's origin, once each, never a hash route or a query, and robots.txt names it without
 * blocking the site. Not required any more: a sitemap of one URL, a sitemap index, checked-in copies of either.
 */
export function discoveryErrors({ sitemapUrls, robots, sitemapIndex }) {
  const errors = [];
  const add = (page, message) => errors.push({ page, message });
  // The owner's Search Console holds a submission of /sitemap-index.xml from the previous site (docs/site-indexing.md); it
  // must keep answering, and with nothing but the sitemap. Left unchecked when the caller passes no index.
  if (sitemapIndex !== undefined) {
    if (!sitemapIndex.trim()) add('/sitemap-index.xml', '/sitemap-index.xml is missing or empty, so the submission kept in Search Console would fail');
    else {
      const listed = Array.from(sitemapIndex.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);
      if (listed.length !== 1 || listed[0] !== `${ORIGIN}/sitemap.xml`) add('/sitemap-index.xml', `The sitemap index must list only ${ORIGIN}/sitemap.xml, got ${listed.join(', ') || 'nothing'}`);
    }
  }
  if (sitemapUrls.length === 0) add('/sitemap.xml', 'The sitemap lists no pages');
  const seen = new Set();
  const repeated = new Set();
  for (const url of sitemapUrls) {
    let parsed = null;
    try { parsed = new URL(url); } catch { /* a relative URL is not on the origin either */ }
    if (parsed?.origin !== ORIGIN) add('/sitemap.xml', `Sitemap URL is not on ${ORIGIN}: ${url}`);
    else if (parsed.hash || parsed.search) add('/sitemap.xml', `Sitemap URL carries a fragment or query, which crawlers treat as the page it hangs from: ${url}`);
    else if (seen.has(url) && !repeated.has(url)) { repeated.add(url); add('/sitemap.xml', `Sitemap URL is listed twice: ${url}`); }
    seen.add(url);
  }
  if (!robots?.trim()) add('/robots.txt', 'robots.txt is missing or empty');
  else {
    // One directive per line, comments removed: "Sitemap: <url>" names the sitemap, "Disallow: /" alone blocks everything.
    const directives = robots.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean);
    const value = (name) => directives.filter((line) => line.toLowerCase().startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).trim());
    if (!value('sitemap').includes(`${ORIGIN}/sitemap.xml`)) add('/robots.txt', `robots.txt does not name ${ORIGIN}/sitemap.xml`);
    if (value('disallow').includes('/')) add('/robots.txt', 'robots.txt blocks the whole site with "Disallow: /"');
  }
  return errors;
}

/** The share card a page declares: a large-image card, the same one for both networks, at the size its tags state. */
export function socialMetadataErrors(page, card) {
  const errors = [];
  if (page.twitter.card !== 'summary_large_image') errors.push(`twitter:card must be summary_large_image, got ${JSON.stringify(page.twitter.card)}`);
  if (page.twitter.image !== page.og.image) errors.push('twitter:image must be the same card as og:image');
  if (card && (String(card.width) !== page.og['image:width'] || String(card.height) !== page.og['image:height'])) {
    errors.push(`og:image declares ${page.og['image:width']}×${page.og['image:height']} but the card is ${card.width}×${card.height}`);
  }
  // The previous site's fixture required a PNG after two LinkedIn-specific preview fixes (#111, #112). JPEG and PNG are the
  // formats every share crawler documents; WebP is fine for the page's own images and is not used for the card.
  if (card && !['jpeg', 'png'].includes(card.format)) errors.push(`og:image must be a JPEG or PNG, the formats every share crawler reads, not ${card.format}`);
  return errors;
}

export function inspectHtml(html) {
  const document = parse(html);
  const elements = [];
  const walk = (node) => {
    if (node.tagName) elements.push(node);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(document);
  const attr = (node, name) => node?.attrs?.find((entry) => entry.name === name)?.value;
  const content = (node) => node?.nodeName === '#text' ? node.value : (node?.childNodes ?? []).map(content).join('');
  const named = (tag, attribute, value) => elements.find((node) => node.tagName === tag && attr(node, attribute) === value);
  const meta = (name) => attr(named('meta', 'name', name) ?? named('meta', 'property', name), 'content');
  const references = [];
  for (const node of elements) {
    for (const attribute of ['href', 'src', 'poster']) {
      const url = attr(node, attribute);
      if (url !== undefined) references.push({ url, tag: node.tagName, attribute });
    }
    for (const item of (attr(node, 'srcset') ?? '').split(',')) {
      const url = item.trim().split(/\s+/)[0];
      if (url) references.push({ url, tag: node.tagName, attribute: 'srcset' });
    }
  }
  const ids = elements.flatMap((node) => attr(node, 'id') ? [attr(node, 'id')] : []);
  return {
    title: content(elements.find((node) => node.tagName === 'title')).trim(),
    description: meta('description'),
    language: attr(elements.find((node) => node.tagName === 'html'), 'lang'),
    h1Count: elements.filter((node) => node.tagName === 'h1').length,
    canonical: attr(named('link', 'rel', 'canonical'), 'href'),
    canonicalCount: elements.filter((node) => node.tagName === 'link' && attr(node, 'rel') === 'canonical').length,
    robots: meta('robots'),
    noindex: /(?:^|[,\s])noindex(?:$|[,\s])/.test(meta('robots') ?? ''),
    og: Object.fromEntries(['title', 'description', 'url', 'image', 'image:width', 'image:height'].map((name) => [name, meta(`og:${name}`)])),
    twitter: Object.fromEntries(['card', 'title', 'description', 'image'].map((name) => [name, meta(`twitter:${name}`)])),
    // The engine note under a 3D view, and the GLB that view loads (see engine-note.mjs).
    engineNotes: elements.filter((node) => attr(node, 'data-engine-note') !== undefined).map((node) => content(node).replace(/\s+/g, ' ').trim()),
    viewerModels: elements.filter((node) => node.tagName === 'asset-viewer').flatMap((node) => attr(node, 'data-model') ? [attr(node, 'data-model')] : []),
    ids, references,
  };
}
