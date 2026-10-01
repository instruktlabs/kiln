#!/usr/bin/env bun
/**
 * Writes `src/generated/mcp-manifest.json`: the tool definitions, resources and
 * templates exactly as the packaged MCP server advertises them, built from the
 * registry. The thin stdio entry bundles this file so it can answer `tools/list`
 * before the engine loads. `--check` exits non-zero when the file is stale;
 * `src/__tests__/mcp-manifest.test.ts` asserts the same thing in the gate.
 *
 *   bun run mcp:manifest
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packagedMcpManifest } from '../src/mcp-manifest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(repo, 'src/generated/mcp-manifest.json');
const text = `${JSON.stringify(packagedMcpManifest(), null, 2)}\n`;
const name = relative(repo, target).replaceAll('\\', '/');

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current === text) console.log(`${name} is current.`);
  else {
    console.error(`${name} is stale. Run: bun run mcp:manifest`);
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
  console.log(`wrote ${name} (${text.length} chars)`);
}
