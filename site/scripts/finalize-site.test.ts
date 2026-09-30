import { expect, test } from 'bun:test';
import { buildIndexFiles } from './finalize-site.mjs';
const pages = [
  { route: '/', title: 'Kiln', description: 'Build assets with source.', noindex: false },
  { route: '/docs/', title: 'Documentation', description: 'Read the docs.', noindex: false },
  { route: '/docs/install/', title: 'Install Kiln · Kiln docs', description: 'Set up a workspace.', noindex: false },
  { route: '/packs/farm/', title: 'Farm', description: 'Farm asset pack.', noindex: false },
  { route: '/scenes/farm/', title: 'Farm scene', description: 'In production.', noindex: true },
  { route: '/packs/foundry-floor/', title: 'Foundry Floor', description: 'In production.', noindex: true },
  { route: '/scenes/', title: 'Scenes made with Kiln', description: 'Three scenes.', noindex: false },
  { route: '/scenes/golden-gate/', title: 'Golden Gate Bridge scene', description: 'A preview.', noindex: true },
  { route: '/scenes/foundry-floor/', title: 'Foundry Floor scene — in production', description: 'In production.', noindex: true },
  { route: '/404.html', title: 'Not found', description: 'Missing page.', noindex: false },
];
test('generated sitemap contains only published, indexable routes', () => {
  const { sitemap } = buildIndexFiles(pages);
  expect(sitemap).toContain('<loc>https://kilnstudio.tools/docs/install/</loc>');
  expect(sitemap).toContain('<loc>https://kilnstudio.tools/packs/farm/</loc>');
  expect(sitemap).not.toContain('foundry-floor');
  expect(sitemap).not.toContain('/scenes/farm/');
  expect(sitemap).not.toContain('/scenes/golden-gate/');
  expect(sitemap).toContain('<loc>https://kilnstudio.tools/scenes/</loc>');
  expect(sitemap).not.toContain('404');
});
test('agent guide points to built site docs and omits absent or noindex pages', () => {
  const { llms, robots } = buildIndexFiles(pages);
  expect(llms).toContain('[Install Kiln](https://kilnstudio.tools/docs/install/)');
  expect(llms).not.toContain('github.com/matthew-kissinger/kiln/blob/main/docs/');
  expect(llms).not.toContain('/docs/material-library/');
  expect(llms).not.toContain('foundry-floor');
  expect(llms).not.toContain('/scenes/golden-gate/');
  expect(llms).not.toContain('/scenes/farm/');
  expect(robots).toContain('Sitemap: https://kilnstudio.tools/sitemap.xml');
});
test('index generation is deterministic across filesystem traversal order', () => {
  expect(buildIndexFiles(pages)).toEqual(buildIndexFiles([...pages].reverse()));
});

const gallery = [
  { route: '/gallery/', title: 'Gallery · Kiln', description: 'Reviewed assets.', noindex: false },
  { route: '/gallery/farmhouse/', title: 'Farmhouse · Kiln', description: 'A reviewed asset.', noindex: false },
  { route: '/gallery/archive/', title: 'Archive · Earlier Kiln examples', description: 'Earlier examples from earlier Kiln versions, not reviewed to the pack standard.', noindex: false },
  { route: '/gallery/archive/robot-arm/', title: 'Robot Arm · Kiln archive', description: 'An unreviewed historical Kiln example.', noindex: true },
  { route: '/gallery/archive/pirate-ship/', title: 'Pirate Ship · Kiln archive', description: 'An unreviewed historical Kiln example.', noindex: true },
];
const locs = (sitemap: string) => Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);

test('the sitemap lists the archive index and the reviewed gallery but no archive item', () => {
  const urls = locs(buildIndexFiles([...pages, ...gallery]).sitemap);
  expect(urls).toContain('https://kilnstudio.tools/gallery/');
  expect(urls).toContain('https://kilnstudio.tools/gallery/farmhouse/');
  expect(urls).toContain('https://kilnstudio.tools/gallery/archive/');
  expect(urls.filter((url) => /\/gallery\/archive\/[^/]+\/$/.test(url))).toEqual([]);
});

test('an archive item stays out of the sitemap and llms.txt even if its noindex marker is lost', () => {
  const lost = gallery.map((page) => ({ ...page, noindex: false }));
  lost.find((page) => page.route === '/gallery/archive/robot-arm/')!.description = 'Distinctive robot arm sentence.';
  const { sitemap, llms } = buildIndexFiles([...pages, ...lost]);
  expect(locs(sitemap).filter((url) => /\/gallery\/archive\/[^/]+\/$/.test(url))).toEqual([]);
  expect(llms).not.toContain('robot-arm');
  expect(llms).not.toContain('Distinctive robot arm sentence');
});

test('llms.txt lists the archive index under its own heading and says its items are not listed', () => {
  const { llms } = buildIndexFiles([...pages, ...gallery]);
  const archive = llms.split('\n## ').find((section) => section.startsWith('Archive'));
  expect(archive).toBeDefined();
  expect(archive).toContain('[Archive · Earlier Kiln examples](https://kilnstudio.tools/gallery/archive/)');
  expect(archive).toContain('not reviewed to the pack standard');
  expect(archive).toMatch(/item pages .*not listed/i);
  // The reviewed catalogue is unchanged and does not carry the archive index.
  const catalogue = llms.split('\n## ').find((section) => section.startsWith('Assets and scenes'))!;
  expect(catalogue).toContain('/gallery/farmhouse/');
  expect(catalogue).not.toContain('/gallery/archive/');
  expect(llms).not.toContain('robot-arm');
  expect(llms).not.toContain('pirate-ship');
});

test('llms.txt has no archive section when the archive index is not published', () => {
  expect(buildIndexFiles([...pages, ...gallery.filter((page) => page.route !== '/gallery/archive/')]).llms).not.toContain('## Archive');
});

// The owner's Search Console holds a submission of /sitemap-index.xml from the previous site (docs/site-indexing.md), so
// the path keeps answering: a sitemap index that lists the one sitemap, generated with it rather than checked in.
test('a sitemap index lists the sitemap and only the sitemap', () => {
  const { sitemapIndex } = buildIndexFiles(pages);
  expect(sitemapIndex).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>https://kilnstudio.tools/sitemap.xml</loc></sitemap>\n</sitemapindex>\n');
  expect(locs(sitemapIndex)).toEqual(['https://kilnstudio.tools/sitemap.xml']);
});
