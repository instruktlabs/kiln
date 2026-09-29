import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHtml, ORIGIN, routeForFile } from './static-validation-core.mjs';

const escapeXml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const link = (page) => `- [${page.title.replace(/ · Kiln docs$| · Kiln$| — Kiln$/g, '')}](${new URL(page.route, ORIGIN).href}): ${page.description ?? ''}`;

/** Derive discovery files from the pages that were actually emitted by Astro. */
export function buildIndexFiles(pages) {
  const published = pages.filter((page) => !page.noindex && page.route !== '/404.html').sort((a, b) => a.route.localeCompare(b.route));
  const home = published.find((page) => page.route === '/');
  const docs = published.filter((page) => page.route.startsWith('/docs/'));
  const catalog = published.filter((page) => /^\/(?:packs|gallery|scenes)\/(?:[^/]+\/)?$/.test(page.route) && !page.route.startsWith('/gallery/archive/'));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${published.map((page) => `  <url><loc>${escapeXml(new URL(page.route, ORIGIN).href)}</loc></url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
  const llms = [
    '# Kiln', '',
    home?.description ?? 'Build and revise 3D assets with your coding agent.', '',
    '## Documentation', '', ...docs.map(link), '',
    '## Assets and scenes', '', ...catalog.map(link), '',
    '## Source and agent skills', '',
    '- [Repository](https://github.com/matthew-kissinger/kiln)',
    `- [Agent skills index](${ORIGIN}/.well-known/agent-skills/index.json): Generated from the repository skills, with artifact digests.`,
    `- [Sitemap](${ORIGIN}/sitemap.xml)`, '',
  ].join('\n');
  return { sitemap, robots, llms };
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
  const { sitemap, robots, llms } = buildIndexFiles(pages);
  await mkdir(dist, { recursive: true });
  await Promise.all([
    writeFile(resolve(dist, 'sitemap.xml'), sitemap),
    writeFile(resolve(dist, 'robots.txt'), robots),
    writeFile(resolve(dist, 'llms.txt'), llms),
  ]);
  console.log(`Generated sitemap, robots.txt and llms.txt from ${pages.length} static pages (${pages.filter((page) => page.noindex).length} noindex).`);
  return pages;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--dist');
  await finalizeSite(index >= 0 ? { dist: resolve(process.argv[index + 1]) } : {});
}
