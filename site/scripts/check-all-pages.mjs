import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { inspectHtml, routeForFile, isEmbeddedDocument } from './static-validation-core.mjs';
import { compareSitemapRoutes } from './sitemap-routes.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:4175';
const out = resolve(process.argv[3] ?? '.cache/validation');
const root = resolve('dist');
async function htmlFiles(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await htmlFiles(path));
    else if (item.name.endsWith('.html')) result.push(path);
  }
  return result;
}
const files = await htmlFiles(root);
const routes = files.map(file => routeForFile(relative(root, file)));
const indexable = [];
for (const file of files) {
  const route = routeForFile(relative(root, file));
  if (route !== '/404.html' && !isEmbeddedDocument(route) && !inspectHtml(await readFile(file, 'utf8')).noindex) indexable.push(route);
}
const sitemap = await fetch(new URL('/sitemap.xml', base));
if (!sitemap.ok) throw new Error(`Sitemap HTTP ${sitemap.status}`);
const sitemapErrors = compareSitemapRoutes(await sitemap.text(), indexable);
if (sitemapErrors.length) throw new Error(sitemapErrors.join('\n'));
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const report = { browser: await browser.version(), node: process.version, pages: [], errors: [] };
try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    let route;
    page.on('pageerror', error => report.errors.push({ route, type: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ route, type: 'console', message: message.text() }); });
    while ((route = routes.shift())) {
      try {
        const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0', timeout: 30000 });
        const status = response?.status();
        if (status !== 200 && !(route === '/404.html' && status === 404)) report.errors.push({ route, type: 'http', status });
        report.pages.push({ route, status });
      } catch (error) { report.errors.push({ route, type: 'navigation', message: error.message }); }
    }
    await page.close();
  }));
} finally {
  await browser.close();
  report.pages.sort((a, b) => a.route.localeCompare(b.route));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'all-page-console.json'), JSON.stringify(report, null, 2));
}
console.log(`${report.pages.length} routes visited; ${report.errors.length} console, script, navigation or HTTP errors.`);
if (report.errors.length) process.exitCode = 1;
