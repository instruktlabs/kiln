import { expect, it } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { executeKilnCode } from '../render';

const skillRoot = resolve(import.meta.dir, '../../skills');
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(resolve(path, entry.name)) : [resolve(path, entry.name)],
  );
}
it('ships skill references that resolve within each installed skill', () => {
  for (const entry of readdirSync(skillRoot)) {
    const root = resolve(skillRoot, entry);
    for (const file of files(root).filter((file) => file.endsWith('.md'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
        const href = match[1]!.split('#')[0]!;
        if (!href || /^[a-z]+:/i.test(href)) continue;
        const target = resolve(dirname(file), href);
        expect(relative(root, target).startsWith('..')).toBe(false);
        expect(existsSync(target)).toBe(true);
      }
    }
  }
});
it('builds the shipped reusable frame and updates its attachment through one parameter', async () => {
  const source = readFileSync(
    resolve(skillRoot, 'kiln-author-asset/references/reusable-frame.kiln.js'),
    'utf8',
  );
  const original = (await executeKilnCode(source)).root;
  const changed = (await executeKilnCode(source.replace('height: 3.1', 'height: 3.6'))).root;
  const middle = original.getObjectByName('Joint_Middle')!;
  const post = middle.getObjectByName('Mesh_LeftPost') as import('three').Mesh;
  post.geometry.computeBoundingBox();
  expect(post.geometry.boundingBox!.max.x - post.geometry.boundingBox!.min.x).toBeCloseTo(0.18);
  expect(post.geometry.boundingBox!.max.z - post.geometry.boundingBox!.min.z).toBeCloseTo(0.14);
  const revised = changed.getObjectByName('Joint_Middle')!;
  expect(middle.getObjectByName('Joint_TopAttachment')!.position.y).toBe(3.1);
  expect(revised.getObjectByName('Joint_TopAttachment')!.position.y).toBe(3.6);
  expect(revised.getObjectByName('Mesh_Marker')!.parent!.name).toBe('Joint_TopAttachment');
  expect(changed.getObjectByName('Joint_Near')!.toJSON()).toMatchObject({
    object: { name: 'Joint_Near' },
  });
  const nearBefore = original.getObjectByName('Joint_Near')!;
  const nearAfter = changed.getObjectByName('Joint_Near')!;
  expect(nearAfter.position.toArray()).toEqual(nearBefore.position.toArray());
  expect(nearAfter.getObjectByName('Joint_TopAttachment')!.position.y).toBe(2.6);
});

// A generated workspace has no package.json, so the public SDK subpaths named in the
// optional compose and QA references do not resolve until the author installs the
// package (#179). The guidance must stay optional, pinned, and limited to real exports.
it.each([
  'kiln-compose-scene/references/composition-api.md',
  'kiln-qa-asset/references/integration-checks.md',
])('explains the optional pinned SDK install in %s using only exported subpaths', (name) => {
  const text = readFileSync(resolve(skillRoot, name), 'utf8');
  const section = text.match(/^## Optional SDK use\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  expect(section).toContain('package.json');
  expect(section).toContain('ERR_MODULE_NOT_FOUND');
  expect(section).toContain('npm install @instruktlabs/kiln@<version>');
  expect(section).toMatch(/CLI\/MCP/);
  expect(section).toMatch(/serverInfo|npm ls/);
  const exported = Object.keys(
    JSON.parse(readFileSync(resolve(skillRoot, '../package.json'), 'utf8')).exports,
  ).map((key) => `@instruktlabs/kiln${key.slice(1)}`);
  for (const match of text.matchAll(/@instruktlabs\/kiln(?:\/[a-z][\w-]*)+/g)) {
    expect(exported).toContain(match[0]);
  }
  expect(text).not.toMatch(/dist\/index\.m?js/);
});
