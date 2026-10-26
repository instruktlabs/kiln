/**
 * `<lastmod>` for each sitemap URL: the committer date of the newest commit that touched a file the page is built from.
 *
 * Google uses lastmod only when it is "consistently and verifiably accurate"
 * (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), so the date is derived, never
 * typed: a route is matched to its Astro page file, the page's local imports are followed (data records, components,
 * layouts, libraries; stylesheets are skipped because a CSS change is not a content change), and a documentation route
 * adds its repository Markdown (from `KILN_SITE_DOCS_DIR`, as the docs loader reads it). The newest Git date among
 * those files is the page's lastmod. A file with no commit yet (an uncommitted addition) counts as changed at HEAD.
 * The shared chrome every page carries (`SITE_CHROME`: the base layout's header, footer and share card, and the
 * site constants with the release label) is not followed: Google asks for the last *significant* change to a page, and
 * a navigation link or version label changing on all pages at once would otherwise redate the whole sitemap.
 * Files read at build time from untracked inputs (the restored example archive, generated sources) are pinned by
 * tracked records, which are the files that carry the date.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsDirectory } from './source-dirs.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.astro', '.json'];
const SOURCE = /\.(?:astro|[cm]?[jt]sx?|json)$/;
/** Repository paths of the site-wide chrome that no page's lastmod follows (see above). */
export const SITE_CHROME = ['site/src/layouts/BaseLayout.astro', 'site/src/lib/config.ts'];
const IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The Astro page pattern for a file under src/pages: static segments, `[name]` (one segment) or `[...name]` (any). */
export function pagePattern(file) {
  const path = file.replaceAll('\\', '/').replace(/\.astro$/, '').replace(/(?:^|\/)index$/, '');
  return path ? path.split('/') : [];
}

/** The page file that emitted `route`, by Astro's priority: more static segments first, then single params over rest. */
export function pageForRoute(route, files) {
  const segments = route.replace(/\.html$/, '').split('/').filter(Boolean);
  const matches = (pattern, at = 0, index = 0) => {
    if (index === pattern.length) return at === segments.length;
    const part = pattern[index];
    if (/^\[\.\.\.[^\]]+\]$/.test(part)) {
      for (let end = segments.length; end >= at; end--) if (matches(pattern, end, index + 1)) return true;
      return false;
    }
    if (at >= segments.length) return false;
    return (/^\[[^\]]+\]$/.test(part) || part === segments[at]) && matches(pattern, at + 1, index + 1);
  };
  const score = (pattern) => [pattern.filter((part) => !part.startsWith('[')).length, -pattern.filter((part) => part.startsWith('[...')).length];
  let best;
  for (const file of files) {
    const pattern = pagePattern(file);
    if (!matches(pattern)) continue;
    const [fixed, rest] = score(pattern);
    if (!best || fixed > best.fixed || (fixed === best.fixed && rest > best.rest)) best = { file, fixed, rest };
  }
  return best?.file;
}

/** Every local file reachable from `entry` through relative imports, `entry` included, except files `skip` refuses. */
export function sourceClosure(entry, { read = (file) => readFileSync(file, 'utf8'), isFile = (file) => existsSync(file) && statSync(file).isFile(), skip = () => false } = {}) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || (file !== entry && skip(file))) return;
    seen.add(file);
    if (!SOURCE.test(file) || file.endsWith('.json')) return;
    for (const match of read(file).matchAll(IMPORT)) {
      const specifier = (match[1] ?? match[2]).split('?')[0];
      if (!specifier.startsWith('.') || specifier.endsWith('.css')) continue;
      const base = resolve(dirname(file), specifier);
      const target = [...EXTENSIONS.map((extension) => base + extension), ...EXTENSIONS.slice(1).map((extension) => join(base, `index${extension}`))]
        .find(isFile);
      if (target) visit(target);
    }
  };
  visit(entry);
  return [...seen];
}

/** Newest committer date (ISO 8601 / W3C Datetime) for every path Git has history for, keyed by top-level-relative path. */
export function commitDates(git) {
  const dates = new Map();
  let date;
  for (const line of git(['-c', 'core.quotePath=false', 'log', '--format=%x00%cI', '--name-only', '--no-renames', 'HEAD']).split('\n')) {
    if (line.startsWith('\0')) date = line.slice(1);
    else if (line && !dates.has(line)) dates.set(line, date);
  }
  return dates;
}

const newest = (dates) => dates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));

/** A `route => lastmod` function for the site at `site`, read from the Git work tree that holds it. */
export function sitemapLastmod({ site = SITE, git } = {}) {
  git ??= (args) => execFileSync('git', ['-C', site, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const top = git(['rev-parse', '--show-toplevel']);
  const head = git(['log', '-1', '--format=%cI', 'HEAD']);
  const dates = commitDates(git);
  const pagesRoot = join(site, 'src', 'pages');
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith('.astro') ? [relative(pagesRoot, join(directory, entry.name))] : []);
  const pages = walk(pagesRoot);
  const closures = new Map();
  const docs = docsDirectory(process.env, site);
  const repoPath = (file) => relative(top, file).split(sep).join('/');
  const chrome = new Set(SITE_CHROME);
  const skip = (file) => chrome.has(repoPath(file));
  const dateOf = (file) => dates.get(repoPath(file)) ?? head;
  return (route) => {
    const page = pageForRoute(route, pages);
    if (!page) throw new Error(`No page source matches ${route}; cannot date it for the sitemap.`);
    if (!closures.has(page)) closures.set(page, sourceClosure(join(pagesRoot, page), { skip }));
    const files = [...closures.get(page)];
    const doc = /^\/docs\/([^/]+)\/$/.exec(route)?.[1];
    if (doc) files.push(join(docs, `${doc}.md`));
    return newest(files.map(dateOf));
  };
}
