#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

async function inventory(directory, prefix = '') {
  const files = new Map();
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    if (entry.isSymbolicLink())
      throw new Error(`Plugin components must be real files: ${prefix}${entry.name}`);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await inventory(
        join(directory, entry.name),
        `${prefix}${entry.name}/`,
      ))
        files.set(name, bytes);
    } else if (entry.isFile())
      files.set(`${prefix}${entry.name}`, await readFile(join(directory, entry.name)));
    else throw new Error(`Unsupported plugin component: ${prefix}${entry.name}`);
  }
  return files;
}

async function expectedFiles() {
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  if (
    pkg.name !== '@instruktlabs/kiln' ||
    !/^\d+\.\d+\.\d+(?:-(?:rc|dev)\.\d+)?$/.test(pkg.version)
  )
    throw new Error('The local plugin requires the exact Kiln release identity.');
  const identity = {
    name: 'kiln-engine',
    version: pkg.version,
    description:
      'Set up a local Kiln workspace to create, inspect and revise editable 3D assets with Claude Code or Codex.',
    author: { name: 'Instrukt Labs' },
    homepage: 'https://github.com/instruktlabs/kiln',
    repository: 'https://github.com/instruktlabs/kiln',
    license: 'MIT',
    keywords: ['3d', 'glb', 'gltf', 'asset-generation', 'gamedev'],
  };
  const portable = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    ...identity,
    extensions: {
      'com.openai': {
        interface: {
          displayName: 'Kiln Engine',
          shortDescription: 'Create editable 3D assets in a local workspace',
          longDescription:
            'Install the pinned Kiln engine and set up a workspace with local MCP tools and maintained authoring skills. Your coding agent supplies the model.',
          developerName: 'Instrukt Labs',
          category: 'Developer Tools',
          capabilities: ['Read', 'Write'],
          defaultPrompt: [
            'Set up a Kiln workspace for this coding agent.',
            'Check and upgrade my existing Kiln workspace.',
          ],
        },
      },
    },
  };
  const files = new Map([
    ['plugin.json', json(portable)],
    ['.claude-plugin/plugin.json', json(identity)],
    ['runtime.json', json({ name: pkg.name, version: pkg.version })],
    ['LICENSE', await readFile(join(repo, 'LICENSE'))],
    [
      'scripts/setup-workspace.mjs',
      await readFile(join(repo, 'scripts/setup-plugin-workspace.mjs')),
    ],
  ]);
  for (const [name, bytes] of await inventory(
    join(repo, 'skills/kiln-setup-workspace'),
    'skills/kiln-setup-workspace/',
  ))
    files.set(name, bytes);
  const development = pkg.version.includes('-dev.')
    ? '**Development candidate.** This version is not published to npm. Qualification requires the reviewed local engine archive via `--archive`.\n\n'
    : '';
  files.set(
    'README.md',
    Buffer.from(
      `# Kiln Engine local plugin\n\n${development}Version ${pkg.version}, published by Instrukt Labs under the MIT license.\n\nAsk your coding agent to set up a Kiln workspace. The setup skill installs\n\`${pkg.name}@${pkg.version}\` with npm and creates a separate asset workspace.\nUse a supported Node.js installation with npm; no Bun, engine clone or separate\nmodel API key is required. The workspace's START.md explains how to reopen it.\n\nThe plugin registers setup only. The workspace supplies the authoring skills\nand one local MCP server, \`kiln_workspace\`. Open Claude Code in that workspace;\nlaunch Codex there with \`node codex.mjs\`. Accept the host's ordinary trust prompts\nand verify live tool discovery before authoring.\n\nThe engine installation and your assets stay outside the disposable plugin cache.\nPlugin removal or updating its cached files does not delete them. An existing\nworkspace remains on its installed engine until an explicit managed upgrade.\nRead [setup and upgrade guidance](skills/kiln-setup-workspace/references/plugin-install.md).\n\nCPU rendering is available locally. Material appearance requires a qualified\nrenderer; follow the setup skill's renderer checks rather than assuming GPU support.\nHosted ChatGPT access is a separate integration, and this local bundle is not a\npublic OpenAI directory submission.\n\n[Source and issues](https://github.com/instruktlabs/kiln)\n`,
    ),
  );
  const hashes = Object.fromEntries(
    [...files]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([name, bytes]) => [name, `sha256:${createHash('sha256').update(bytes).digest('hex')}`]),
  );
  files.set(
    'package-provenance.json',
    json({
      schemaVersion: 1,
      kind: 'kiln-local-plugin',
      engineVersion: pkg.version,
      files: hashes,
    }),
  );
  return { files, version: pkg.version };
}

export async function packageLocalPlugin(destination, options = {}) {
  const directory = resolve(destination);
  const { files, version } = await expectedFiles();
  if (options.check) {
    const actual = await inventory(directory);
    const names = [...new Set([...files.keys(), ...actual.keys()])].sort();
    const changed = names.filter(
      (name) => !files.get(name)?.equals(actual.get(name) || Buffer.alloc(0)),
    );
    if (changed.length)
      throw new Error(
        `Local plugin is stale: ${changed.join(', ')}. Generate a fresh bundle and review its changes.`,
      );
    return { directory, version, files: files.size - 1, current: true };
  }
  // Refuse both populated and empty existing destinations, including symlinks.
  try {
    await lstat(directory);
    throw new Error('Plugin output already exists. Generate into a fresh directory.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory);
  for (const [name, bytes] of files) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), bytes, { flag: 'wx' });
  }
  return { directory, version, files: files.size - 1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const destination = args.shift();
  if (!destination || args.some((arg) => arg !== '--check'))
    throw new Error('Usage: node scripts/package-local-plugin.mjs OUTPUT_DIRECTORY [--check]');
  console.log(
    JSON.stringify(
      await packageLocalPlugin(destination, { check: args.includes('--check') }),
      null,
      2,
    ),
  );
}
