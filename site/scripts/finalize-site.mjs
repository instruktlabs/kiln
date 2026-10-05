import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_INDEX_ROUTE, inspectHtml, isArchiveItemRoute, ORIGIN, routeForFile, scriptHashSource } from './static-validation-core.mjs';
import {sealedTroyCache} from './sealed-cache.mjs';

const escapeXml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const link = (page) => `- [${page.title.replace(/ · Archive · Kiln$| · Kiln docs$| · Kiln$| — Kiln$| — source and 3D model \| Kiln$| — Kiln Commons$/g, '')}](${new URL(page.route, ORIGIN).href}): ${page.description ?? ''}`;

/** Keep the reviewed report-only policy, replacing its inline allowlist with exact emitted script bytes. */
export function buildHeaders(template, pages) {
  const hashes=[...new Set(pages.flatMap(page=>page.inlineScripts??[]).map(scriptHashSource))].sort();
  let changed=false;
  const text=template.replace(/(Content-Security-Policy-Report-Only:\s*)([^\r\n]+)/gi,(_match,label,policy)=>{
    const directives=policy.split(';').map(directive=>directive.trim());
    const at=directives.findIndex(directive=>/^script-src\s/.test(directive));
    if(at<0)throw new Error('The report-only policy has no script-src directive');
    directives[at]=[...directives[at].split(/\s+/).filter(token=>!token.startsWith("'sha256-")),...hashes].join(' ');
    changed=true;return `${label}${directives.join('; ')}`;
  });
  if(!changed)throw new Error('Missing report-only response policy');
  return text;
}

/** Derive discovery files from the pages that were actually emitted by Astro. */
export function buildIndexFiles(pages) {
  // Archive item pages are excluded by route as well as by their noindex marker: the marker is the source of truth,
  // and validate-static fails a build in which an item lost it, but the discovery files never depend on that alone.
  const published = pages.filter((page) => !page.noindex && page.route !== '/404.html' && !isArchiveItemRoute(page.route)).sort((a, b) => a.route.localeCompare(b.route));
  const home = published.find((page) => page.route === '/');
  const docs = published.filter((page) => page.route.startsWith('/docs/'));
  const catalog = published.filter((page) => /^\/(?:packs|gallery|scenes)\/(?:[^/]+\/)?$/.test(page.route) && page.route !== ARCHIVE_INDEX_ROUTE);
  const archive = published.find((page) => page.route === ARCHIVE_INDEX_ROUTE);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${published.map((page) => `  <url><loc>${escapeXml(new URL(page.route, ORIGIN).href)}</loc></url>`).join('\n')}\n</urlset>\n`;
  // The owner's Search Console holds a submission of /sitemap-index.xml from the previous site (docs/site-indexing.md), so the path
  // keeps answering with an index of the one sitemap. It is generated with the sitemap, never a checked-in copy that could drift.
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${ORIGIN}/sitemap.xml</loc></sitemap>\n</sitemapindex>\n`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
  const llms = [
    '# Kiln', '',
    home?.description ?? 'Build and revise 3D assets with your coding agent.', '',
    '## Documentation', '', ...docs.map(link), '',
    '## Assets and scenes', '', ...catalog.map(link), '',
    ...(archive ? [
      '## Archive', '',
      'Earlier examples from earlier Kiln versions, not reviewed to the pack standard. Their item pages are not listed here or in the sitemap; the archive index links to each one.', '',
      link(archive), '',
    ] : []),
    '## Source and agent skills', '',
    '- [Repository](https://github.com/matthew-kissinger/kiln)',
    `- [Agent skills index](${ORIGIN}/.well-known/agent-skills/index.json): Generated from the repository skills, with artifact digests.`,
    `- [Sitemap](${ORIGIN}/sitemap.xml)`, '',
  ].join('\n');
  return { sitemap, sitemapIndex, robots, llms };
}

async function htmlFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

export async function finalizeSite({ dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist') } = {}) {
  const pages = [];
  for (const file of await htmlFiles(dist)) {
    pages.push({ route: routeForFile(relative(dist, file)), ...inspectHtml(await readFile(file, 'utf8')) });
  }
  if (!pages.some((page) => page.route === '/')) throw new Error(`Astro home output missing in ${dist}; build the site before finalizing.`);
  const { sitemap, sitemapIndex, robots, llms } = buildIndexFiles(pages);
  const headerPath=resolve(dist,'_headers');
  const sealedCache=await sealedTroyCache(dist);
  const headers=buildHeaders(await readFile(headerPath,'utf8'),pages)+sealedCache.headers;
  await mkdir(dist, { recursive: true });
  await Promise.all([
    writeFile(resolve(dist, 'sitemap.xml'), sitemap),
    writeFile(resolve(dist, 'sitemap-index.xml'), sitemapIndex),
    writeFile(resolve(dist, 'robots.txt'), robots),
    writeFile(resolve(dist, 'llms.txt'), llms),
    writeFile(headerPath, headers),
  ]);
  console.log(`Generated sitemap, sitemap-index.xml, robots.txt and llms.txt from ${pages.length} static pages (${pages.filter((page) => page.noindex).length} noindex).`);
  return pages;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--dist');
  await finalizeSite(index >= 0 ? { dist: resolve(process.argv[index + 1]) } : {});
}
