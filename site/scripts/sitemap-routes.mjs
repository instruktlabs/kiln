/** Check exact routes, including duplicates, rather than trusting a successful sitemap response. */
export function compareSitemapRoutes(xml, expected) {
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  const actual = new Set(paths);
  const wanted = new Set(expected);
  return [
    ...[...wanted].filter((path) => !actual.has(path)).sort().map((path) => `Missing sitemap route: ${path}`),
    ...[...actual].filter((path) => !wanted.has(path)).sort().map((path) => `Unexpected sitemap route: ${path}`),
    ...[...actual].filter((path) => paths.indexOf(path) !== paths.lastIndexOf(path)).map((path) => `Duplicate sitemap route: ${path}`),
  ];
}
