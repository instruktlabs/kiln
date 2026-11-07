import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { commitDates, pageForRoute, SITE_CHROME, sitemapLastmod, sourceClosure } from './sitemap-lastmod.mjs';

const pages = ['index.astro', '404.astro', 'docs/index.astro', 'docs/[slug].astro', 'gallery/[slug].astro', 'gallery/archive/index.astro', 'gallery/archive/[slug].astro', 'packs/troy/[...page].astro', 'scenes/farm.astro'];

test('a route is matched to the page that emits it, static segments before parameters', () => {
  expect(pageForRoute('/', pages)).toBe('index.astro');
  expect(pageForRoute('/404.html', pages)).toBe('404.astro');
  expect(pageForRoute('/docs/', pages)).toBe('docs/index.astro');
  expect(pageForRoute('/docs/install/', pages)).toBe('docs/[slug].astro');
  expect(pageForRoute('/gallery/archive/', pages)).toBe('gallery/archive/index.astro');
  expect(pageForRoute('/gallery/archive/robot-arm/', pages)).toBe('gallery/archive/[slug].astro');
  expect(pageForRoute('/gallery/barn/', pages)).toBe('gallery/[slug].astro');
  expect(pageForRoute('/packs/troy/', pages)).toBe('packs/troy/[...page].astro');
  expect(pageForRoute('/packs/troy/walls/', pages)).toBe('packs/troy/[...page].astro');
  expect(pageForRoute('/scenes/farm/', pages)).toBe('scenes/farm.astro');
  expect(pageForRoute('/unknown/deep/route/', pages)).toBeUndefined();
});

test('the source closure follows relative imports and skips stylesheets and packages', () => {
  const files: Record<string, string> = {
    '/s/pages/index.astro': "---\nimport Layout from '../layouts/Base.astro';\nimport data from '../data/home.json';\nimport { x } from '../lib/x';\nimport 'astro:content';\nimport '../styles/global.css';\nconst lazy = await import('../lib/lazy.mjs');\n---",
    '/s/layouts/Base.astro': "import { y } from '../lib/x';",
    '/s/data/home.json': '{"import": "../never.ts"}',
    '/s/lib/x.ts': "export { z } from './z';",
    '/s/lib/z/index.ts': 'export const z = 1;',
    '/s/lib/lazy.mjs': '',
    '/s/styles/global.css': '',
  };
  // resolve() makes Windows paths of these POSIX ones; compare them as POSIX paths.
  const posix = (file: string) => file.replaceAll('\\', '/').replace(/^[A-Z]:/, '');
  const read = (file: string) => files[posix(file)];
  const isFile = (file: string) => posix(file) in files;
  const closure = sourceClosure('/s/pages/index.astro', { read, isFile });
  expect(closure.map(posix).sort()).toEqual(['/s/data/home.json', '/s/layouts/Base.astro', '/s/lib/lazy.mjs', '/s/lib/x.ts', '/s/lib/z/index.ts', '/s/pages/index.astro']);
  // A skipped file is not dated, and neither is what only it imports.
  const skip = (file: string) => posix(file) === '/s/lib/x.ts';
  expect(sourceClosure('/s/pages/index.astro', { read, isFile, skip }).map(posix).sort()).toEqual(['/s/data/home.json', '/s/layouts/Base.astro', '/s/lib/lazy.mjs', '/s/pages/index.astro']);
});

test('commit dates keep the newest commit per path from git log order', () => {
  const log = '\0' + '2026-10-25T22:07:37-04:00\n\nsite/a.json\ndocs/install.md\n\0' + '2026-09-01T10:00:00Z\n\nsite/a.json\nsite/b.ts\n';
  const dates = commitDates(() => log);
  expect(Object.fromEntries(dates)).toEqual({ 'site/a.json': '2026-10-25T22:07:37-04:00', 'docs/install.md': '2026-10-25T22:07:37-04:00', 'site/b.ts': '2026-09-01T10:00:00Z' });
});

test('nothing skipped as site chrome can carry a page\'s content', () => {
  const site = resolve(import.meta.dir, '..');
  const skipped = SITE_CHROME.map((path) => resolve(site, '..', path)).filter((file) => file.includes(`${sep}components${sep}`));
  expect(skipped.length).toBeGreaterThan(0);
  const reached = skipped.flatMap((file) => sourceClosure(file));
  // Everything the viewer reaches is behind a click; a data record imported here would stop dating the pages it changes.
  expect(reached.filter((file) => file.includes(`${sep}src${sep}data${sep}`))).toEqual([]);
  for (const name of ['AssetViewer.astro', 'island-session.ts', 'viewer-retry.ts', 'AssetViewerRuntime.tsx', 'viewer-framing.ts', 'vehicle-paint.ts', 'review-rig-three.ts']) expect(reached.some((file) => file.endsWith(`${sep}${name}`))).toBe(true);
});

test('a change to the 3D viewer redates no page', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiln-lastmod-'));
  try {
    const site = join(root, 'site');
    for (const directory of ['src/pages', 'src/components', 'src/data']) mkdirSync(join(site, directory), { recursive: true });
    writeFileSync(join(site, 'src/pages/asset.astro'), "import AssetViewer from '../components/AssetViewer.astro';\nimport record from '../data/asset.json';\n");
    writeFileSync(join(site, 'src/components/AssetViewer.astro'), 'const { mountAssetViewer } = await import("./AssetViewerRuntime");\n');
    writeFileSync(join(site, 'src/components/AssetViewerRuntime.tsx'), "import { frameAsset } from './viewer-framing';\n");
    writeFileSync(join(site, 'src/components/viewer-framing.ts'), '');
    writeFileSync(join(site, 'src/data/asset.json'), '{}');
    const log = '\0' + '2026-11-06T18:00:00Z\n\nsite/src/components/AssetViewer.astro\nsite/src/components/AssetViewerRuntime.tsx\nsite/src/components/viewer-framing.ts\n\0' + '2026-10-28T12:00:00Z\n\nsite/src/data/asset.json\nsite/src/pages/asset.astro\n';
    const git = (args: string[]) => (args[0] === 'rev-parse' ? root : args[0] === 'log' && args[1] === '-1' ? '2026-11-07T00:00:00Z' : log);
    expect(sitemapLastmod({ site, git })('/asset/')).toBe('2026-10-28T12:00:00Z');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page is dated by its newest source but not the site chrome, a doc by its Markdown too, an uncommitted file at HEAD', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiln-lastmod-'));
  try {
    const site = join(root, 'site');
    for (const directory of ['src/pages/docs', 'src/data', 'src/layouts', 'src/lib']) mkdirSync(join(site, directory), { recursive: true });
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(site, 'src/pages/index.astro'), "import Base from '../layouts/BaseLayout.astro';\nimport { VERSION } from '../lib/config';\nimport home from '../data/home.json';");
    writeFileSync(join(site, 'src/layouts/BaseLayout.astro'), '');
    writeFileSync(join(site, 'src/lib/config.ts'), '');
    writeFileSync(join(site, 'src/pages/docs/[slug].astro'), '');
    writeFileSync(join(site, 'src/pages/new.astro'), '');
    writeFileSync(join(site, 'src/data/home.json'), '{}');
    writeFileSync(join(root, 'docs/install.md'), '# Install');
    // The site chrome changed last; it redates no page.
    const log = '\0' + '2026-10-23T16:19:55Z\n\nsite/src/layouts/BaseLayout.astro\nsite/src/lib/config.ts\n\0' + '2026-10-20T09:00:00+02:00\n\ndocs/install.md\n\0' + '2026-10-10T12:00:00Z\n\nsite/src/data/home.json\n\0' + '2026-08-01T12:00:00Z\n\nsite/src/pages/index.astro\nsite/src/pages/docs/[slug].astro\n';
    const git = (args: string[]) => (args[0] === 'rev-parse' ? root : args[0] === 'log' && args[1] === '-1' ? '2026-10-24T00:00:00Z' : log);
    const lastmod = sitemapLastmod({ site, git });
    expect(lastmod('/')).toBe('2026-10-10T12:00:00Z');
    expect(lastmod('/docs/install/')).toBe('2026-10-20T09:00:00+02:00');
    expect(lastmod('/new/')).toBe('2026-10-24T00:00:00Z');
    expect(() => lastmod('/missing/route/')).toThrow('No page source matches');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
