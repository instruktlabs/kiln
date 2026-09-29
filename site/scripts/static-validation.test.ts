import { expect, test } from 'bun:test';
import { inspectHtml, resolveInternalLink, routeForFile } from './static-validation-core.mjs';
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
