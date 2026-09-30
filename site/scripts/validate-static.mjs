import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HtmlValidate } from 'html-validate';
import sharp from 'sharp';
import { engineNoteErrors, isAssetPageRoute, readGlbFacts } from './engine-note.mjs';
import { ARCHIVE_INDEX_ROUTE, archiveIndexingErrors, discoveryErrors, embeddedDocumentErrors, foundryFloorErrors, inspectHtml, isArchiveItemRoute, isEmbeddedDocument, ORIGIN, resolveInternalLink, retiredNameErrors, routeForFile, socialMetadataErrors } from './static-validation-core.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const root = resolve(value('--dist', resolve(site, 'dist')));
const reportDirectory = resolve(value('--out', resolve(site, '.cache/validation')));

async function filesBelow(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) files.push(...await filesBelow(path));
    else files.push(path);
  }
  return files;
}
const files = await filesBelow(root);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
if (!htmlFiles.length) throw new Error(`No generated HTML in ${root}. Build the site before validation.`);
const pages = new Map();
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  pages.set(routeForFile(relative(root, file)), { file, html, ...inspectHtml(html) });
}
const errors = [];
const add = (page, kind, message) => errors.push({ page, kind, message });
const external = new Map();
const imageChecks = new Map();
const titles = new Map();
const descriptions = new Map();
const existing = new Set(files);
const validator = new HtmlValidate({ extends: ['html-validate:recommended'], rules: {
  // Astro serializes valid boolean attributes with an empty value and emits compact HTML.
  'attribute-boolean-style': 'off',
  'void-style': 'off',
  // Shiki deliberately sets per-token styles at build time; there is no runtime styling engine.
  'no-inline-style': 'off',
} });
let htmlErrorCount = 0;
const htmlResults = [];
for (const [route, page] of pages) {
  if (new Set(page.ids).size !== page.ids.length) add(route, 'anchors', 'Duplicate element IDs');
  // A staged scene frame is served inside a page's iframe, so it is held to what a frame needs, not to page metadata.
  if (isEmbeddedDocument(route)) for (const message of embeddedDocumentErrors(page)) add(route, 'metadata', message);
  else {
    for (const [name, text, seen] of [['title', page.title, titles], ['description', page.description, descriptions]]) {
      if (!text?.trim()) add(route, 'metadata', `Missing ${name}`);
      else if (seen.has(text)) add(route, 'metadata', `Duplicate ${name}, also used on ${seen.get(text)}`);
      else seen.set(text, route);
    }
    if (page.h1Count !== 1) add(route, 'headings', `Expected one H1, found ${page.h1Count}`);
    if (page.language !== 'en') add(route, 'metadata', 'Missing lang="en"');
    const expectedCanonical = new URL(route, ORIGIN).href;
    if (page.canonicalCount !== 1) add(route, 'metadata', `Expected one canonical link, found ${page.canonicalCount}`);
    if (page.canonical !== expectedCanonical) add(route, 'metadata', `Canonical must be ${expectedCanonical}, got ${page.canonical}`);
    for (const field of ['title', 'description', 'url', 'image', 'image:width', 'image:height']) {
      if (!page.og[field]) add(route, 'metadata', `Missing og:${field}`);
    }
    for (const field of ['card', 'title', 'description', 'image']) {
      if (!page.twitter[field]) add(route, 'metadata', `Missing twitter:${field}`);
    }
    if (page.og.url !== expectedCanonical) add(route, 'metadata', 'OG URL differs from canonical');
    if (page.og.image && !imageChecks.has(page.og.image)) {
      const image = resolveInternalLink(page.og.image, route);
      if (!image) {
        imageChecks.set(page.og.image, { error: 'Social cards must be emitted in the site output' });
      } else {
        const imagePath = resolve(root, `.${image.path}`);
        try {
          const metadata = await sharp(imagePath).metadata();
          const { size } = await stat(imagePath);
          imageChecks.set(page.og.image, { width: metadata.width, height: metadata.height, bytes: size, format: metadata.format });
          if (metadata.width !== 1200 || metadata.height !== 630 || size >= 300 * 1024) {
            add(route, 'social', `Social card must be 1200×630 and under 300 KB: ${page.og.image}`);
          }
        } catch (error) {
          imageChecks.set(page.og.image, { error: error.message });
          add(route, 'social', `Missing or unreadable social card: ${page.og.image}`);
        }
      }
    }
    // The tags must describe the card the way it is: one large-image card for both networks, at the size it declares.
    const card = imageChecks.get(page.og.image);
    for (const message of socialMetadataErrors(page, card?.width ? card : null)) add(route, 'social', message);
  }
  for (const reference of page.references) {
    const { url } = reference;
    if (reference.tag === 'a' && (!url || url === '#')) { add(route, 'links', 'Empty link or placeholder href="#"'); continue; }
    if (/^(?:data|blob):/.test(url)) continue;
    let target;
    try { target = resolveInternalLink(url, route); } catch { add(route, 'links', `Malformed URL: ${url}`); continue; }
    if (!target) {
      const from = external.get(url) ?? new Set();
      from.add(route);
      external.set(url, from);
      continue;
    }
    const targetPath = resolve(root, `.${target.path.endsWith('/') ? `${target.path}index.html` : target.path}`);
    if (!targetPath.startsWith(`${root}${sep}`) || !existing.has(targetPath)) { add(route, 'links', `Missing ${reference.tag} ${reference.attribute}: ${url}`); continue; }
    if (target.fragment && targetPath.endsWith('.html')) {
      const targetPage = pages.get(routeForFile(relative(root, targetPath)));
      if (!targetPage?.ids.includes(target.fragment)) add(route, 'anchors', `Missing anchor: ${url}`);
    }
  }
  const validation = await validator.validateString(page.html, page.file);
  if (!validation.valid) {
    const results = validation.results.map((result) => ({ file: relative(root, result.filePath), messages: result.messages }));
    htmlResults.push(...results);
    htmlErrorCount += validation.errorCount;
  }
}
let sitemapUrls = [];
try {
  const sitemap = await readFile(resolve(root, 'sitemap.xml'), 'utf8');
  sitemapUrls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);
  for (const [route, page] of pages) {
    const url = new URL(route, ORIGIN).href;
    if (page.noindex && sitemapUrls.includes(url)) add(route, 'sitemap', 'noindex page is in the sitemap');
    // Archive items are reported by the archive rule below, which says what is wrong with them.
    if (!page.noindex && route !== '/404.html' && !isArchiveItemRoute(route) && !sitemapUrls.includes(url)) add(route, 'sitemap', 'Indexed page is absent from sitemap');
  }
  for (const url of sitemapUrls) {
    const target = resolveInternalLink(url, '/');
    if (!target || !pages.has(target.path)) add('/sitemap.xml', 'sitemap', `Sitemap URL has no static page: ${url}`);
  }
} catch (error) { add('/sitemap.xml', 'sitemap', error.message); }
// The archive is browsable but not indexed: every item is "noindex, follow" and in neither sitemap.xml nor llms.txt.
let archive = { items: 0 };
try {
  const llmsUrls = (await readFile(resolve(root, 'llms.txt'), 'utf8')).match(/https:\/\/kilnstudio\.tools\/[^\s)]*/g) ?? [];
  const specimens = JSON.parse(await readFile(resolve(root, 'assets/index.json'), 'utf8'));
  const expectedItems = specimens.map((specimen) => `/gallery/archive/${specimen.name}/`);
  for (const error of archiveIndexingErrors({ pages, sitemapUrls, llmsUrls, expectedItems })) add(error.page, 'archive', error.message);
  const items = [...pages.keys()].filter(isArchiveItemRoute);
  const url = (route) => new URL(route, ORIGIN).href;
  archive = {
    items: items.length,
    specimens: specimens.length,
    noindexFollow: items.filter((route) => pages.get(route).robots === 'noindex, follow').length,
    inSitemap: items.filter((route) => sitemapUrls.includes(url(route))).length,
    inLlms: items.filter((route) => llmsUrls.includes(url(route))).length,
    canonicalOwn: items.filter((route) => pages.get(route).canonical === url(route)).length,
    indexPage: { indexed: !pages.get(ARCHIVE_INDEX_ROUTE)?.noindex, inSitemap: sitemapUrls.includes(url(ARCHIVE_INDEX_ROUTE)) },
  };
} catch (error) { add('/gallery/archive/', 'archive', error.message); }
// The second pack's retired working title is gone everywhere, and its in-production pages say what they must.
const discoveryTexts = {};
for (const name of ['sitemap.xml', 'sitemap-index.xml', 'llms.txt', 'robots.txt']) discoveryTexts[name] = await readFile(resolve(root, name), 'utf8').catch(() => '');
// Crawlers are pointed only at canonical documents (no hash routes, no queries, nothing twice) and robots.txt does not block them.
const discovery = discoveryErrors({ sitemapUrls, robots: discoveryTexts['robots.txt'], sitemapIndex: discoveryTexts['sitemap-index.xml'] });
for (const error of discovery) add(error.page, 'discovery', error.message);
const retired = retiredNameErrors({ pages, files: files.map((file) => relative(root, file).replaceAll('\\', '/')), texts: discoveryTexts });
for (const error of retired) add(error.page, 'retired-name', error.message);
// The Foundry Floor pack record's placement; a build without Commons packs emits no Farm pack page and carries no
// models on the Foundry Floor pack page.
const foundryFloorPack = JSON.parse(await readFile(resolve(site, 'src/data/packs/foundry-floor.json'), 'utf8'));
const placement = { assetCount: foundryFloorPack.assetCount, placedInScene: foundryFloorPack.placedInScene, packPage: pages.has('/packs/farm/') };
const foundry = foundryFloorErrors({ pages, sitemapUrls, placement });
for (const error of foundry) add(error.page, 'foundry-floor', error.message);
// The engine note under each 3D view is present and true of the GLB that view loads.
const glbFacts = new Map();
for (const [route, page] of pages) {
  if (!isAssetPageRoute(route) || page.viewerModels.length === 0) continue;
  const model = page.viewerModels[0].split('?')[0];
  glbFacts.set(route, await readGlbFacts(resolve(root, model.replace(/^\//, ''))).catch((error) => ({ error: error.message })));
}
const engine = engineNoteErrors({ pages, facts: glbFacts });
for (const error of engine) add(error.page, 'engine-note', error.message);
const engineChecked = [...glbFacts.values()].filter((facts) => !facts.error);
const engineSummary = {
  assetPages: [...pages.keys()].filter(isAssetPageRoute).length,
  withNote: [...pages].filter(([route, page]) => isAssetPageRoute(route) && page.engineNotes.length === 1).length,
  glbsRead: engineChecked.length,
  gltfVersions: [...new Set(engineChecked.map((facts) => facts.version))],
  extensionsDeclared: [...new Set(engineChecked.flatMap((facts) => facts.extensionsUsed))],
  problems: engine.length,
};
await mkdir(reportDirectory, { recursive: true });
const result = { pages: pages.size, internalErrors: errors.length, htmlErrors: htmlErrorCount, errors, htmlResults, socialCards: Object.fromEntries(imageChecks), archive, discovery, engineNotes: engineSummary, sitemapUrls, externalLinks: Array.from(external, ([url, from]) => ({ url, pages: Array.from(from) })).sort((a, b) => a.url.localeCompare(b.url)) };
await writeFile(resolve(reportDirectory, 'static-validation.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(resolve(reportDirectory, 'external-links.txt'), `${result.externalLinks.map((entry) => entry.url).join('\n')}\n`);
console.log(`Static validation: ${pages.size} pages, ${errors.length} link/metadata/sitemap errors, ${htmlErrorCount} HTML errors. ${result.externalLinks.length} external URLs listed.`);
for (const error of errors.slice(0, 35)) console.error(`${error.page}: ${error.kind}: ${error.message}`);
for (const result of htmlResults.slice(0, 4)) console.error(`${result.file}: ${result.messages.slice(0, 8).map((message) => `${message.ruleId}: ${message.message}`).join('; ')}`);
console.log(`Archive: ${archive.items} item pages (${archive.specimens} specimens), ${archive.noindexFollow} noindex, follow, ${archive.inSitemap} in sitemap.xml, ${archive.inLlms} in llms.txt; index indexed=${archive.indexPage?.indexed}, in sitemap=${archive.indexPage?.inSitemap}.`);
console.log(`Discovery: ${sitemapUrls.length} sitemap URLs, ${new Set(sitemapUrls).size} distinct, ${sitemapUrls.filter((url) => /[#?]/.test(url)).length} with a fragment or query; robots.txt: ${discovery.filter((error) => error.page === '/robots.txt').length} problems; sitemap-index.xml: ${discovery.filter((error) => error.page === '/sitemap-index.xml').length} problems; canonical links: ${[...pages].filter(([route, page]) => !isEmbeddedDocument(route) && page.canonicalCount === 1).length} of ${[...pages.keys()].filter((route) => !isEmbeddedDocument(route)).length} pages have exactly one.`);
console.log(`Engine notes: ${engineSummary.withNote} of ${engineSummary.assetPages} asset pages carry one; ${engineSummary.glbsRead} GLBs read (glTF ${engineSummary.gltfVersions.join(', ')}; extensions declared: ${engineSummary.extensionsDeclared.join(', ') || 'none'}); ${engineSummary.problems} problems.`);
console.log(`Retired working title: ${retired.length} matches in ${pages.size} pages, ${files.length} file names and the discovery files. Foundry Floor pages: ${foundry.length} problems.`);
console.log(`Report: ${resolve(reportDirectory, 'static-validation.json')}`);
if (errors.length || htmlErrorCount) process.exitCode = 1;
