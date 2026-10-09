#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSdk } from './build-sdk.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function pinnedBun(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const match = /^bun@(.+)$/.exec(pkg.packageManager ?? '');
  if (!match) throw new Error('packageManager must pin the Bun build toolchain.');
  const expected = match[1];
  const installed = spawnSync('bun', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (installed.status === 0 && installed.stdout.trim() === expected)
    return { command: 'bun', prefix: [] };

  // A stale Bun elsewhere on PATH must not silently change committed Node bundles.
  // npm ships with Node on every supported platform and resolves the exact package
  // version without requiring Bun itself to already be current.
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    prefix: ['--yes', '--package', `bun@${expected}`, 'bun'],
  };
}

async function sources(directory, prefix = '') {
  const entries = [];
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    if (item.name === '__tests__' || item.name.endsWith('.test.ts')) continue;
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) entries.push(...(await sources(join(directory, item.name), name)));
    else if (/\.(?:ts|mjs|html|css|json)$/.test(item.name))
      entries.push([name, sha(await readFile(join(directory, item.name)))]);
  }
  return entries;
}

export async function runtimeBuildIdentity(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const inputs = {
    engineVersion: pkg.version,
    toolchain: pkg.packageManager,
    sourceHash: sha(JSON.stringify(await sources(join(root, 'src')))),
    rendererSourceHash: sha(JSON.stringify(await sources(join(root, 'render-service', 'src')))),
    dependencyHash: sha(await readFile(join(root, 'bun.lock'))),
    dependencies: pkg.dependencies ?? {},
    optionalDependencies: pkg.optionalDependencies ?? {},
    target: 'node',
  };
  return { identity: `sha256:${sha(JSON.stringify(inputs))}`, ...inputs };
}

export async function buildRuntime(target, root = repo) {
  const entries = {
    cli: 'src/cli.ts',
    // The stdio entry carries the protocol library and the generated manifest;
    // it loads the engine bundle beside it on the first call that needs it.
    mcp: 'src/mcp-server.ts',
    engine: 'src/mcp-engine.ts',
    worker: 'src/evaluator/worker.ts',
    'agent-run': 'src/agent/run.ts',
    'agent-providers': 'src/agent/providers.ts',
  };
  const outputs = {
    cli: 'cli.mjs',
    mcp: 'mcp-server.mjs',
    engine: 'mcp-engine.mjs',
    worker: 'evaluator-worker.mjs',
    'agent-run': 'agent-run.mjs',
    'agent-providers': 'agent-providers.mjs',
  };
  if (!entries[target])
    throw new Error('Choose cli, mcp, engine, worker, agent-run or agent-providers.');
  const compiler = await pinnedBun(root);
  if (target === 'mcp') {
    // The entry bundles src/generated/mcp-manifest.json: regenerate it from the
    // registry first, before the source identity below is taken.
    const generated = spawnSync(
      compiler.command,
      [...compiler.prefix, 'scripts/generate-mcp-manifest.ts'],
      { cwd: root, stdio: 'inherit', windowsHide: true },
    );
    if (generated.status !== 0) throw new Error('Generating the MCP manifest failed.');
  }
  const before = await runtimeBuildIdentity(root);
  const built = spawnSync(
    compiler.command,
    [
      ...compiler.prefix,
      'build',
      entries[target],
      '--target=node',
      '--packages=external',
      `--outfile=dist/${outputs[target]}`,
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (built.status !== 0) throw new Error(`Building ${target} failed.`);
  const after = await runtimeBuildIdentity(root);
  if (before.identity !== after.identity)
    throw new Error('Runtime source changed during build. Rebuild from a stable tree.');
  const path = join(root, 'dist/build.json');
  let previous = { schemaVersion: 1, entries: {} };
  try {
    previous = JSON.parse(await readFile(path, 'utf8'));
  } catch {}
  if (previous.schemaVersion !== 1) previous = { schemaVersion: 1, entries: {} };
  const entry = {
    ...after,
    file: outputs[target],
    bundleHash: `sha256:${sha(await readFile(join(root, 'dist', outputs[target])))}`,
  };
  previous.entries[target] = entry;
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(path, `${JSON.stringify(previous, null, 2)}\n`);
  return entry;
}

export async function buildAllRuntime(root = repo) {
  const entries = [];
  // MCP regenerates an identity input. Do it before any sibling captures its
  // source identity, so a version/widget change needs only one complete build.
  for (const target of ['mcp', 'worker', 'agent-run', 'agent-providers', 'engine', 'cli'])
    entries.push(await buildRuntime(target, root));
  return entries;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const entries =
      process.argv[2] === 'all' ? await buildAllRuntime() : [await buildRuntime(process.argv[2])];
    for (const entry of entries) {
      console.log(`${entry.file} ${entry.bundleHash} (${entry.identity})`);
    }
    if (process.argv[2] === 'all') await buildSdk();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
