import { expect, test } from 'bun:test';
import { buildIndexFiles } from './finalize-site.mjs';
const pages = [
  { route: '/', title: 'Kiln', description: 'Build assets with source.', noindex: false },
  { route: '/docs/', title: 'Documentation', description: 'Read the docs.', noindex: false },
  { route: '/docs/install/', title: 'Install Kiln · Kiln docs', description: 'Set up a workspace.', noindex: false },
  { route: '/packs/farm/', title: 'Farm', description: 'Farm asset pack.', noindex: false },
  { route: '/scenes/farm/', title: 'Farm scene', description: 'In production.', noindex: true },
  { route: '/packs/terafab/', title: 'Terafab', description: 'In production.', noindex: true },
  { route: '/404.html', title: 'Not found', description: 'Missing page.', noindex: false },
];
test('generated sitemap contains only published, indexable routes', () => {
  const { sitemap } = buildIndexFiles(pages);
  expect(sitemap).toContain('<loc>https://kilnstudio.tools/docs/install/</loc>');
  expect(sitemap).toContain('<loc>https://kilnstudio.tools/packs/farm/</loc>');
  expect(sitemap).not.toContain('terafab');
  expect(sitemap).not.toContain('/scenes/farm/');
  expect(sitemap).not.toContain('404');
});
test('agent guide points to built site docs and omits absent or noindex pages', () => {
  const { llms, robots } = buildIndexFiles(pages);
  expect(llms).toContain('[Install Kiln](https://kilnstudio.tools/docs/install/)');
  expect(llms).not.toContain('github.com/matthew-kissinger/kiln/blob/main/docs/');
  expect(llms).not.toContain('/docs/material-library/');
  expect(llms).not.toContain('terafab');
  expect(robots).toContain('Sitemap: https://kilnstudio.tools/sitemap.xml');
});
test('index generation is deterministic across filesystem traversal order', () => {
  expect(buildIndexFiles(pages)).toEqual(buildIndexFiles([...pages].reverse()));
});
