#!/usr/bin/env node
/**
 * Refuses a missing or stale `dist/` before a test run. `dist/` is built, not tracked, so
 * a fresh clone has none and a pull leaves the old one in place. Either way dozens of
 * tests that launch the bundles fail for one reason, minutes in.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeBuildIdentity } from './build-runtime.mjs';

export async function runtimeBuildProblem(root) {
  let build;
  try {
    build = JSON.parse(await readFile(join(root, 'dist/build.json'), 'utf8'));
  } catch {}
  const entries = Object.values(build?.entries ?? {});
  if (entries.length === 0) return 'This checkout has no runtime build.';

  const expected = [...entries.map((entry) => entry.file), 'viewer/app.js'];
  const missing = expected.find((file) => !existsSync(join(root, 'dist', file)));
  if (missing) return `dist/${missing} is missing.`;

  const { identity } = await runtimeBuildIdentity(root);
  if (entries.some((entry) => entry.identity !== identity))
    return 'The runtime build is older than the source.';
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problem = await runtimeBuildProblem(resolve(dirname(process.argv[1]), '..'));
  if (problem) {
    console.error(`${problem} Run: bun run build:runtime`);
    process.exitCode = 1;
  }
}
