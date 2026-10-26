import { expect, test } from 'bun:test';
import { compareSitemapRoutes, sitemapLastmodErrors } from './sitemap-routes.mjs';
const xml = (paths: string[]) => `<urlset>${paths.map((path) => `<url><loc>https://kilnstudio.tools${path}</loc></url>`).join('')}</urlset>`;
test('served sitemap matches the exact local indexable route set', () => {
  expect(compareSitemapRoutes(xml(['/','/docs/']), ['/docs/','/'])).toEqual([]);
  expect(compareSitemapRoutes(xml(['/','/stale/']), ['/','/docs/'])).toEqual(['Missing sitemap route: /docs/', 'Unexpected sitemap route: /stale/']);
  expect(compareSitemapRoutes(xml(['/','/']), ['/'])).toContain('Duplicate sitemap route: /');
});
test('every sitemap URL carries one W3C Datetime lastmod that is not in the future', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const entry = (lastmod: string) => `<urlset><url><loc>https://kilnstudio.tools/</loc>${lastmod}</url></urlset>`;
  expect(sitemapLastmodErrors(entry('<lastmod>2026-10-25T22:07:37-04:00</lastmod>'), now)).toEqual([]);
  expect(sitemapLastmodErrors(entry('<lastmod>2026-10-25</lastmod>'), now)).toEqual([]);
  expect(sitemapLastmodErrors(entry(''), now)).toEqual(['Sitemap URL has 0 lastmod values: https://kilnstudio.tools/']);
  expect(sitemapLastmodErrors(entry('<lastmod>Oct 25 2026</lastmod>'), now)).toEqual(['Sitemap lastmod is not a W3C Datetime: https://kilnstudio.tools/ Oct 25 2026']);
  expect(sitemapLastmodErrors(entry('<lastmod>2026-10-25T22:07:37</lastmod>'), now)).toHaveLength(1);
  expect(sitemapLastmodErrors(entry('<lastmod>2027-01-01</lastmod>'), now)).toEqual(['Sitemap lastmod is in the future: https://kilnstudio.tools/ 2027-01-01']);
});
