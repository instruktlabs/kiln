#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Package the maintained skills for a registered ChatGPT connector. No credentials,
// local collections, executable server, or machine-specific paths enter this bundle.
export async function packagePlugin(destination, appId) {
  if (appId !== undefined && !/^plugin_asdk_app[_a-zA-Z0-9-]+$/.test(appId))
    throw new Error('Expected a registered plugin_asdk_app connector ID');
  const directory = resolve(destination);
  const name = basename(directory);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error('Use a lowercase hyphenated plugin folder name');
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // Deliberately refuses an existing output.
  const manifest = JSON.parse(await readFile(join(repo, '.codex-plugin/plugin.json'), 'utf8'));
  manifest.name = name;
  delete manifest.mcpServers;
  if (appId) manifest.apps = './.app.json';
  await mkdir(join(directory, '.codex-plugin'));
  await writeFile(
    join(directory, '.codex-plugin/plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await cp(join(repo, 'skills'), join(directory, 'skills'), { recursive: true });
  await cp(join(repo, 'LICENSE'), join(directory, 'LICENSE'));
  await cp(join(repo, 'SECURITY.md'), join(directory, 'SECURITY.md'));
  if (appId)
    await writeFile(
      join(directory, '.app.json'),
      `${JSON.stringify({ apps: { kiln: { id: appId } } }, null, 2)}\n`,
    );
  const files = {};
  async function inventory(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await inventory(join(path, entry.name), `${relative}/`);
      else
        files[relative] =
          'sha256:' +
          createHash('sha256')
            .update(await readFile(join(path, entry.name)))
            .digest('hex');
    }
  }
  await inventory(directory);
  await writeFile(
    join(directory, 'package-provenance.json'),
    `${JSON.stringify(
      { version: 1, engineVersion: manifest.version, connectorBound: Boolean(appId), files },
      null,
      2,
    )}\n`,
  );
  return { directory, files: Object.keys(files).length, connectorBound: Boolean(appId) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [destination, appId] = process.argv.slice(2);
  if (!destination)
    throw new Error('Usage: node scripts/package-plugin.mjs OUTPUT_DIRECTORY [plugin_asdk_app_ID]');
  console.log(JSON.stringify(await packagePlugin(destination, appId), null, 2));
}
