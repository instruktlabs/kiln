import { createHash } from 'node:crypto';
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

/** Elements whose text is not prose: code and its relatives, scripts and styles, drawings, and the document head. */
const NOT_PROSE = new Set(['head', 'script', 'style', 'noscript', 'template', 'code', 'pre', 'kbd', 'samp', 'var', 'svg', 'math', 'textarea']);

/** Inline elements that sit inside a word or phrase; every other element ends a word (links in a row, list items). */
const IN_WORD = new Set(['strong', 'em', 'b', 'i', 'sup', 'sub', 'small', 'mark', 's', 'u', 'abbr', 'bdi', 'q', 'cite', 'dfn', 'wbr']);

/** Text quoted as written (the engine's docs, an owner's scope sentence): rules about the site's own words skip it. */
const isVerbatim = (node) => Boolean(node.attrs?.some((attribute) => attribute.name === 'data-verbatim'));

/**
 * The prose of a whole page (header, main and footer): every text node outside code, scripts, drawings and the head.
 * With `skipVerbatim`, text inside an element marked `data-verbatim` is left out too.
 */
export function proseText(html, options = {}) {
  return proseBlocks(html, options).join(' ');
}

/** The same prose split where an element that is not inline ends (a heading, a paragraph, a link in a row). */
export function proseBlocks(html, { skipVerbatim = false } = {}) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeName === '#text') return void parts.push(node.value);
    if (NOT_PROSE.has(node.tagName) || (skipVerbatim && isVerbatim(node))) return void parts.push('\u0000');
    for (const child of node.childNodes ?? []) walk(child);
    if (node.tagName && !IN_WORD.has(node.tagName)) parts.push('\u0000');
  };
  walk(parse(html));
  return parts.join('').split('\u0000').map((block) => block.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * A letter, `#` or `:` running straight into a number marks a lost space ("gives470ft", "the3.81", "April1935",
 * "adopted:13.4112"; content review 2b finding 2). Tokens that join letters and digits on purpose are not flagged:
 * ids and digests, colours and issue numbers, upper-case codes (D1, CC0, LOD0, UV0, ARM64, R3F), versions and
 * release names (v1, r33, g7, m4, ff2), page references (p.5), ratios (16:9), powers (256²) and the named words.
 */
const GLUE = /[A-Za-z#:]\.?\d/;
const KNOWN_TOKENS = [
  /^[rap]_[0-9a-f]{6,}$/,
  /^(?:sha256:)?[0-9a-f]{16,}$/,
  /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/,
  /^#\d+$/,
  /^[A-Z][A-Z0-9]*\d[A-Za-z0-9]*$/,
  /^(?:v|r|g|m|ff)\d+(?:\.\d+)*$/,
  /^\d+\.\d+\.\d+[abfp]\d+$/, // Unity editor release identifiers.
  /^pp?\.\d+$/,
  /^\d+(?::\d+)+$/,
  /^\d+²$/,
  /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*$/,
  /^[a-z][\w-]*(?:\.[a-z][\w-]*)+$/,
  /^(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/,
  /^lod\d$/,
];
/** Named identifiers the docs and records use as words (the engine docs are published as written). */
const KNOWN_WORDS = new Set(['Direct3D', 'WebGL2', 'Float32', 'Float32Array', 'Uint8Array', 'Object3D', 'x64', 'amd64', 'arm64', 'base64', 'sha256', 'Native13']);
const isKnownToken = (part) => !GLUE.test(part) || KNOWN_WORDS.has(part) || KNOWN_TOKENS.some((token) => token.test(part));

/** The words of some prose that look glued to a number, in order (a word joined by - or / is checked part by part). */
export function gluedWords(text) {
  const plain = text.replace(/(?:https?:\/\/|www\.)\S+/g, ' ');
  const found = [];
  for (const raw of plain.split(/[\s,;()[\]{}"“”‘’'!?<>|…–—=+*]+/)) {
    const word = raw.replace(/^[.:]+|[.:]+$/g, '');
    if (!GLUE.test(word)) continue;
    if (word.split(/[-/]/).every(isKnownToken)) continue;
    found.push(word);
  }
  return found;
}

export const gluedNumberErrors = (html) => gluedWords(proseText(html)).map((word) => `A number is glued to the word before it: ${JSON.stringify(word)}`);

/**
 * The site's own prose spells the noun "licence" (British spelling, as "metre", "grey" and "tyres"; content review
 * finding 16). "License" stays only inside a file name (ASSET-LICENSE.txt, LICENSE) and in text quoted as written,
 * marked `data-verbatim`: the engine's docs and the owner's scope sentences. "Licensed" and "licensing" are spelt
 * the same in both.
 */
export function licenceSpellingErrors(html) {
  return proseBlocks(html, { skipVerbatim: true })
    .map((block) => block.replace(/\S*LICENSE\S*/g, ' ').replace(/\s+/g, ' ').trim())
    .flatMap((block) => [...block.matchAll(/(?:\S+\s+){0,4}\b[Ll]icenses?\b(?:\s+\S+){0,3}/g)])
    .map((match) => `Spell the noun "licence" in the site's own prose: ${JSON.stringify(match[0])}`);
}

/** Owner review status stays in the catalog records; no page states it. */
export function ownerReviewErrors(html) {
  const match = /awaiting owner review|owner approved/i.exec(`${visibleText(html)} ${proseText(html)}`);
  return match ? [`The page states owner review status (${JSON.stringify(match[0])}); that belongs in the catalog record, not in page copy`] : [];
}

/** The copy rules every page answers to: numbers not glued to words, the site's spelling of licence, owner status. */
export const copyErrors = (html) => [...gluedNumberErrors(html), ...licenceSpellingErrors(html), ...ownerReviewErrors(html)];

/** Meta descriptions over this length are cut in search and share previews (content review finding 13). */
export const DESCRIPTION_WARNING_LENGTH = 160;

/** The makers the no-affiliation line names: on a Foundry Floor page they appear in that line and nowhere else. */
const NOTICE_MAKERS = /\b(Tesla|SpaceX|xAI|Intel|ASML)\b/;
/** No physical-device or performance qualification is implied by shipped input controls. */
const DEVICE_CLAIM = /\b(phones?|tablets?|mobile|touch(?:screen)?|desktops?|laptops?|galaxy|iphone|ipad|android)\b/i;
// This exact capability sentence is supported by review2's desktop/touch functional checks.
// Strip only that sentence, only for its qualified runtime; other touch/device promises remain checked.
const TOUCH_CONTROL_INSTRUCTION = /\bTouch controls provide separate steering, throttle, brake \/ reverse and Boost\./g;
/** Historical interior-only packs cannot imply a campus. The FF3 intake must explicitly supply a sealed campus inventory. */
const EXTERIOR = /\b(campus|landscape|exterior|outdoors?|roads?|parking)\b/i;
/** How many of the pack's models a Foundry Floor page says the scene places: "places 29 of the 31", "arranged from 29 of the pack’s 31". */
const PLACEMENT = /\b(?:places|arranged from) (\d+) of the (?:pack’s )?(\d+)\b/g;

/**
 * Foundry Floor (D-33): its pack and scene pages are unindexed (the scene page also unfollowed),
 * out of the sitemap, and carry the owner's no-affiliation line word for word. The makers that line names
 * appear nowhere else on them; the scene page makes no device claims; neither implies an exterior. Given the pack
 * record's `placement` ({ assetCount, placedInScene, packPage }), each page states how many models the scene places,
 * with the record's numbers, and the scene page says how many of the rest are in the pack but not placed. `packPage:
 * false` (a build without Commons packs, whose pack page carries no models) leaves the pack page out of that check.
 */
export function foundryFloorErrors({ pages, sitemapUrls, placement = null, hasCampus = false, runtimeRelease = null }) {
  const errors = [];
  const inSitemap = new Set(sitemapUrls);
  for (const [route, scene] of [[foundryFloor.packRoute, false], [foundryFloor.sceneRoute, true]]) {
    const add = (message) => errors.push({ page: route, message });
    const page = pages.get(route);
    if (!page) { add('The Foundry Floor page was not emitted'); continue; }
    // Exactly these values (S-2 as corrected; content review finding 4): the pack page "noindex, follow", the scene
    // page "noindex, nofollow".
    const wanted = directives(page.robots);
    const expected = scene ? 'noindex, nofollow' : 'noindex, follow';
    if (!wanted.has('noindex')) add('The Foundry Floor page must be noindex');
    else if (scene && !wanted.has('nofollow')) add(`The Foundry Floor scene page must be "noindex, nofollow", got ${JSON.stringify(page.robots)}`);
    else if (page.robots !== expected) add(`The Foundry Floor ${scene ? 'scene' : 'pack'} page must be "${expected}", got ${JSON.stringify(page.robots)}`);
    if (!page.html.includes(foundryFloor.notice)) add('The Foundry Floor page must carry the no-affiliation line word for word');
    if (inSitemap.has(new URL(route, ORIGIN).href)) add('The Foundry Floor page is in the sitemap');
    const text = visibleText(page.html).split(foundryFloor.notice).join(' ');
    const maker = NOTICE_MAKERS.exec(text);
    if (maker) add(`A maker named in the no-affiliation line appears outside it: ${maker[1]}`);
    const deviceText = hasCampus && runtimeRelease === 'ff3-review2' ? text.replace(TOUCH_CONTROL_INSTRUCTION, '') : text;
    const device = scene ? DEVICE_CLAIM.exec(deviceText) : null;
    if (device) add(`The Foundry Floor scene page makes a device claim: ${device[1]}`);
    const exterior = hasCampus ? null : EXTERIOR.exec(text);
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
  // The declared type must be the card's own (engineering review, finding 4: every page said image/webp for a JPEG).
  if (card && page.og['image:type'] !== `image/${card.format}`) errors.push(`og:image:type declares ${JSON.stringify(page.og['image:type'] ?? null)} but the card is image/${card.format}`);
  // The alt text describes the card, not the page (content review, finding 7).
  if (!page.og['image:alt']?.trim()) errors.push('og:image:alt is missing');
  else if (page.og['image:alt'] === page.og.title || page.og['image:alt'] === page.title) errors.push('og:image:alt repeats the page title instead of describing the card');
  if (page.twitter['image:alt'] !== page.og['image:alt']) errors.push('twitter:image:alt must describe the same card as og:image:alt');
  return errors;
}

/**
 * The response header rules of `_headers` (Cloudflare Pages), in file order: a line starting with `/` opens a rule,
 * `Name: value` lines set headers on it and `! Name` lines remove a header an earlier rule set.
 */
export function parseHeaderRules(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('/')) rules.push({ path: line, set: {}, unset: [] });
    else if (!rules.length) throw new Error(`_headers: a header before any path: ${line}`);
    else if (line.startsWith('! ')) rules.at(-1).unset.push(line.slice(2).trim().toLowerCase());
    else {
      const colon = line.indexOf(':');
      if (colon < 1) throw new Error(`_headers: not a "Name: value" line: ${line}`);
      rules.at(-1).set[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }
  return rules;
}

/** A rule path as the host matches it: `*` is one greedy splat, `:name` one path segment (wrangler's rules engine). */
const headerRuleRegExp = (path) => {
  const pattern = path.split('*').map((part) => part.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('(?<splat>.*)');
  return new RegExp(`^${pattern.replace(/:([A-Za-z]\w*)/g, '(?<$1>[^/]+)')}$`);
};

/** The headers served for a path: matching rules in order; `!` removes, a name set twice is joined with a comma. */
export function headersFor(rules, pathname) {
  const headers = new Map();
  const seen = new Set();
  for (const rule of rules) {
    if (!headerRuleRegExp(rule.path).test(pathname)) continue;
    for (const name of rule.unset) headers.delete(name);
    for (const [name, value] of Object.entries(rule.set)) {
      headers.set(name, seen.has(name) && headers.has(name) ? `${headers.get(name)}, ${value}` : value);
      seen.add(name);
    }
  }
  return Object.fromEntries(headers);
}

/** A script element's content hash as a CSP source expression. */
export const scriptHashSource = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** A file whose name carries a build content hash (Vite's `name.HASH.js` or `name-HASH.js`). */
const HASHED_NAME = /[.-][A-Za-z0-9_-]{8}\.(?:js|css|woff2|svg|png|jpg|webp|avif)$/;

/**
 * The header layer (engineering review, finding 11; brief part 1, item 4). Every response gets nosniff, the referrer
 * policy, a permissions policy that keeps fullscreen, and the content security policy in report-only mode (enforcing
 * it is the owner's decision after the hosted dogfood), whose script hashes are exactly the inline scripts the pages
 * carry. HTML revalidates on every visit; only files with a content hash in their name are cached as immutable, and
 * every file under `/_astro/` is.
 */
export function headersErrors({ text, inlineScripts = [], files = [] }) {
  const errors = [];
  let rules;
  try { rules = parseHeaderRules(text); } catch (error) { return [error.message]; }
  const page = headersFor(rules, '/');
  const expect = (name, value) => { if (page[name] !== value) errors.push(`${name} on pages must be ${JSON.stringify(value)}, got ${JSON.stringify(page[name] ?? null)}`); };
  expect('x-content-type-options', 'nosniff');
  expect('referrer-policy', 'strict-origin-when-cross-origin');
  const permissions = page['permissions-policy'] ?? '';
  if (!permissions) errors.push('Pages carry no Permissions-Policy');
  if (/(?:^|,\s*)fullscreen=/.test(permissions)) errors.push('The Permissions-Policy must leave fullscreen alone (the scenes use it)');
  if (page['content-security-policy']) errors.push('The content security policy is enforced; it stays report-only until the owner decides');
  const policy = page['content-security-policy-report-only'];
  if (!policy) errors.push('Pages carry no Content-Security-Policy-Report-Only');
  const cache = page['cache-control'] ?? '';
  const maxAge = Number(cache.match(/max-age=(\d+)/)?.[1] ?? Number.NaN);
  if (!(maxAge <= 300) || /immutable/.test(cache)) errors.push(`HTML must be cached briefly and revalidated, got Cache-Control ${JSON.stringify(cache || null)}`);
  if (policy) {
    const scriptSources = policy.split(';').map((directive) => directive.trim().split(/\s+/)).find(([name]) => name === 'script-src')?.slice(1) ?? [];
    const listed = new Set(scriptSources.filter((source) => source.startsWith("'sha256-")));
    const wanted = new Set(inlineScripts.map(scriptHashSource));
    for (const source of wanted) if (!listed.has(source)) errors.push(`script-src does not list the inline script ${source}`);
    for (const source of listed) if (!wanted.has(source)) errors.push(`script-src lists ${source}, which no page carries`);
  }
  for (const file of files) {
    const cacheControl = headersFor(rules, `/${file}`)['cache-control'] ?? '';
    if ((cacheControl.match(/max-age=/g) ?? []).length > 1) errors.push(`/${file}: Cache-Control is set twice (${cacheControl})`);
    const immutable = /immutable/.test(cacheControl);
    if (immutable && !HASHED_NAME.test(file)) errors.push(`/${file} is cached as immutable but its name carries no content hash`);
    if (!immutable && file.startsWith('_astro/')) errors.push(`/${file} is a hashed build file but is not cached as immutable`);
  }
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
    og: Object.fromEntries(['title', 'description', 'url', 'image', 'image:width', 'image:height', 'image:type', 'image:alt'].map((name) => [name, meta(`og:${name}`)])),
    twitter: Object.fromEntries(['card', 'title', 'description', 'image', 'image:alt'].map((name) => [name, meta(`twitter:${name}`)])),
    // The engine note under a 3D view, and the GLB that view loads (see engine-note.mjs).
    engineNotes: elements.filter((node) => attr(node, 'data-engine-note') !== undefined).map((node) => content(node).replace(/\s+/g, ' ').trim()),
    viewerModels: elements.filter((node) => node.tagName === 'asset-viewer').flatMap((node) => attr(node, 'data-model') ? [attr(node, 'data-model')] : []),
    // Scripts the browser runs from the page itself (data blocks such as JSON-LD are not scripts to a CSP).
    inlineScripts: elements.filter((node) => node.tagName === 'script' && attr(node, 'src') === undefined && ['', 'text/javascript', 'module', 'application/javascript'].includes((attr(node, 'type') ?? '').toLowerCase())).map(content),
    ids, references,
  };
}
