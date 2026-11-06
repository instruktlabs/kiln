/**
 * Bun-only APIs must not reach a `--target=node` bundle, or the shipped source.
 *
 * Ledger 10.3, and it exists because 10.1 shipped undetected for as long as the
 * bundle did. `src/mcp-server.ts` guarded its entry block with `import.meta.main`,
 * which is Bun's. No Bun release lowers it correctly for a Node target: both
 * lowerings observed emit `__require.main == __require.module`, and under Node ESM
 * both sides are `undefined`, so the guard was **always true** and importing the
 * bundle started a live stdio server. Bun 1.4 then stopped emitting the helper the
 * expression referenced, turning it into a startup `ReferenceError` -- which is the
 * only reason anyone found out.
 *
 * The same identifier fails the other way in unbundled shipped source. This
 * package ships `src/**` and a user may run a script with `node` directly; there
 * `import.meta.main` is plainly `undefined`, so an entry guard is always false and
 * the script silently does nothing. `src/experiments/geometry-acceptance.ts` was
 * doing exactly that.
 *
 * Both directions are decided by `isDirectEntry`, from `process.argv[1]` rather
 * than from whatever a bundler makes of `import.meta`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

const REPO = resolve(import.meta.dir, '../..');

/**
 * Each pattern is written to survive the bundles' embedded base64. The base64
 * alphabet contains `Bun` as an ordinary substring but can never contain `Bun.`,
 * so the namespace check requires the dot and an identifier after it rather than
 * matching the bare word.
 */
const BUN_ONLY: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'import.meta.main', pattern: /import\.meta\.main\b/ },
  { name: 'import.meta.dir', pattern: /import\.meta\.dir\b/ },
  { name: 'import.meta.file', pattern: /import\.meta\.file\b/ },
  { name: 'import.meta.path', pattern: /import\.meta\.path\b/ },
  { name: 'import.meta.require', pattern: /import\.meta\.require\b/ },
  { name: 'Bun namespace', pattern: /\bBun\.[A-Za-z_$]/ },
  { name: 'process.isBun', pattern: /\bprocess\.isBun\b/ },
  { name: 'HTMLRewriter', pattern: /\bHTMLRewriter\b/ },
  // The helper Bun's `import.meta.main` lowering referenced. Its presence means
  // some Bun-ism was lowered rather than rejected.
  { name: "Bun's __require helper", pattern: /\b__require\b/ },
];

/** Every `.ts` under `src` that the package ships: tests are excluded by `files`. */
async function shippedSources(directory = join(REPO, 'src')): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      found.push(...(await shippedSources(path)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

describe('Bun-only APIs', () => {
  it('do not appear in any built runtime bundle', async () => {
    const dist = join(REPO, 'dist');
    const bundles = (await readdir(dist)).filter((file) => file.endsWith('.mjs'));
    // A passing assertion over an empty list would be no assertion at all.
    expect(bundles.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const bundle of bundles) {
      const text = await readFile(join(dist, bundle), 'utf8');
      for (const { name, pattern } of BUN_ONLY)
        if (pattern.test(text)) offences.push(`dist/${bundle}: ${name}`);
    }
    expect(offences).toEqual([]);
  });

  it('are not used to decide an entry point in shipped source', async () => {
    const sources = await shippedSources();
    expect(sources.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const path of sources) {
      const text = await readFile(path, 'utf8');
      // `direct-entry.ts` names the identifier in prose to explain why it is not
      // used; prose is fine, an expression is not.
      for (const line of text.split('\n')) {
        const code = line.replace(/^\s*(?:\/\/|\*|\/\*).*$/, '');
        if (/import\.meta\.main\b/.test(code))
          offences.push(`${relative(REPO, path)}: import.meta.main`);
      }
    }
    expect(offences).toEqual([]);
  });
});
