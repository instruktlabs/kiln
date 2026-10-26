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

// W3C Datetime as sitemaps.org specifies it: a date, or a date and time to at least minutes with a zone designator.
const W3C_DATETIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/** Every `<url>` carries exactly one `<lastmod>` that is a W3C Datetime, not in the future of `now`. */
export function sitemapLastmodErrors(xml, now = Date.now()) {
  const errors = [];
  for (const [entry] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? entry;
    const dates = Array.from(entry.matchAll(/<lastmod>([^<]*)<\/lastmod>/g), (match) => match[1]);
    if (dates.length !== 1) errors.push(`Sitemap URL has ${dates.length} lastmod values: ${loc}`);
    else if (!W3C_DATETIME.test(dates[0]) || Number.isNaN(Date.parse(dates[0]))) errors.push(`Sitemap lastmod is not a W3C Datetime: ${loc} ${dates[0]}`);
    else if (Date.parse(dates[0]) > now) errors.push(`Sitemap lastmod is in the future: ${loc} ${dates[0]}`);
  }
  return errors;
}
