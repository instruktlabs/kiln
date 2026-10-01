import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type SceneId, sceneInMode, scenes } from '../src/data/scenes';
import { catalogAssets, packSlugs } from '../src/lib/catalog';

// Engineering review, finding 2: the scene status panel's fallback link must lead to a page the build has, in the
// launch build (KILN_SITE_PACKS=1) and in the pre-upload build (KILN_SITE_PACKS=0) alike.
const PAGES = resolve(import.meta.dir, '../src/pages');

/** Routes of the static pages: every build has them. */
function staticRoutes(directory = PAGES): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return staticRoutes(path);
    if (!entry.name.endsWith('.astro') || entry.name.includes('[') || entry.name === '404.astro') return [];
    const route = relative(PAGES, path).split('\\').join('/').replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
    return [route ? `/${route}/` : '/'];
  });
}

/** Every page route of a build mode: the static pages plus the dynamic ones the mode generates. */
function routes(packsEnabled: boolean) {
  return new Set([
    ...staticRoutes(),
    ...packSlugs(packsEnabled).map((slug) => `/packs/${slug}/`),
    ...catalogAssets(packsEnabled).map((asset) => `/gallery/${asset.slug}/`),
  ]);
}

const ids = Object.keys(scenes) as SceneId[];

describe('scene fallback links (engineering review, finding 2)', () => {
  test('the pack and gallery pages generate their routes from the functions this test reads', () => {
    expect(readFileSync(join(PAGES, 'packs/[slug].astro'), 'utf8')).toContain('packSlugs(PACKS_ENABLED)');
    expect(readFileSync(resolve(import.meta.dir, '../src/lib/catalog.ts'), 'utf8')).toContain(
      'export const assets = catalogAssets(PACKS_ENABLED);',
    );
    expect(readFileSync(resolve(import.meta.dir, '../src/components/SceneShell.astro'), 'utf8')).toContain(
      'sceneInMode(id, PACKS_ENABLED)',
    );
  });

  for (const packsEnabled of [true, false]) {
    test(`every fallback resolves in the ${packsEnabled ? 'launch' : 'pre-upload'} build`, () => {
      const existing = routes(packsEnabled);
      expect(existing.has('/scenes/')).toBe(true);
      for (const id of ids) {
        const { fallback } = sceneInMode(id, packsEnabled);
        expect({ id, href: fallback.href, exists: existing.has(fallback.href) }).toEqual({
          id,
          href: fallback.href,
          exists: true,
        });
      }
    });
  }

  test('the launch build keeps each scene its own fallback and copy', () => {
    for (const id of ids) {
      const inMode = sceneInMode(id, true);
      expect(inMode.fallback).toEqual(scenes[id].fallback);
      expect(inMode.unavailableBody).toBe(scenes[id].copy.unavailableBody);
      expect(inMode.errorText).toBe(scenes[id].copy.errorText);
    }
  });

  test('a pre-upload build names no download or asset page it does not have', () => {
    const launchOnly = routes(true);
    const preUpload = routes(false);
    for (const id of ids) {
      const inMode = sceneInMode(id, false);
      if (preUpload.has(scenes[id].fallback.href)) {
        expect(inMode.fallback).toEqual(scenes[id].fallback);
        continue;
      }
      expect(launchOnly.has(scenes[id].fallback.href)).toBe(true);
      expect(inMode.fallback).toEqual({ href: '/scenes/', label: 'View all scenes' });
      for (const text of [inMode.unavailableBody, inMode.errorText]) expect(text).not.toMatch(/download|asset/i);
    }
  });
});
