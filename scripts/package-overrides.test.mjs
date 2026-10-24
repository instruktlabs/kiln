import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// npm refuses an override that pins a direct dependency to another version (EOVERRIDE), and then every `npm exec`
// in that folder fails, including the pinned Wrangler that site/scripts/deploy.mjs and publish-assets.mjs run. Bun
// accepts the mismatch, so builds and tests stay green; this keeps a dependency bump from silently breaking a deploy.
const ROOT = resolve(import.meta.dirname, '..');
const MANIFESTS = [
  'package.json',
  'site/package.json',
  'scenes/package.json',
  'render-service/package.json',
];

test("every override of a direct dependency names that dependency's version", async () => {
  const mismatches = [];
  for (const file of MANIFESTS) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(resolve(ROOT, file), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const direct = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    };
    for (const [name, version] of Object.entries(manifest.overrides ?? {})) {
      if (
        typeof version === 'string' &&
        name in direct &&
        direct[name] !== version &&
        version !== `$${name}`
      )
        mismatches.push(`${file}: ${name} is ${direct[name]} but overridden to ${version}`);
    }
  }
  expect(mismatches).toEqual([]);
});
