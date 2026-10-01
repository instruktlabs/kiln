import { expect, test } from 'bun:test';
import { compareSitemapRoutes } from './sitemap-routes.mjs';
const xml = (paths: string[]) => `<urlset>${paths.map((path) => `<url><loc>https://kilnstudio.tools${path}</loc></url>`).join('')}</urlset>`;
test('served sitemap matches the exact local indexable route set', () => {
  expect(compareSitemapRoutes(xml(['/','/docs/']), ['/docs/','/'])).toEqual([]);
  expect(compareSitemapRoutes(xml(['/','/stale/']), ['/','/docs/'])).toEqual(['Missing sitemap route: /docs/', 'Unexpected sitemap route: /stale/']);
  expect(compareSitemapRoutes(xml(['/','/']), ['/'])).toContain('Duplicate sitemap route: /');
});
