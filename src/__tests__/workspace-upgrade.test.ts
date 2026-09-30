import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dir, '../..');
const setup = pathToFileURL(join(repo, 'scripts/create-workspace.mjs')).href;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const put = async (path: string, text: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
};
const invoke = (root: string, runtime: string, options = {}, node = 'node') =>
  spawnSync(
    node,
    [
      '--input-type=module',
      '-e',
      `import {createWorkspace} from ${JSON.stringify(setup)}; console.log(JSON.stringify(await createWorkspace(process.argv[1], 'opencode', {...JSON.parse(process.argv[3]),installation:process.argv[2]})));`,
      root,
      runtime,
      JSON.stringify(options),
    ],
    { encoding: 'utf8' },
  );

async function fixture(runtime: string, revision: string) {
  await put(
    join(runtime, 'package.json'),
    JSON.stringify({ name: '@kiln/engine', version: '1.0.0' }),
  );
  const entries: Record<string, unknown> = {};
  for (const [key, file] of [
    ['cli', 'cli.mjs'],
    ['mcp', 'mcp-server.mjs'],
    ['worker', 'evaluator-worker.mjs'],
  ]) {
    const source = `export function main() {} // ${revision}\n`;
    await put(join(runtime, 'dist', file!), source);
    entries[key!] = { identity: `sha256:${sha(revision)}`, bundleHash: `sha256:${sha(source)}` };
  }
  await put(join(runtime, 'dist/build.json'), JSON.stringify({ schemaVersion: 1, entries }));
  for (const name of ['kiln-author-asset', 'kiln-refine-asset', 'kiln-qa-asset'])
    await put(join(runtime, 'skills', name, 'SKILL.md'), `# ${name} ${revision}\n`);
}

it('workspace paths stay current across parent directory aliases and canonical Node entry paths', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-workspace-alias-'));
  try {
    const physical = join(temp, 'physical');
    const alias = join(temp, 'alias');
    await mkdir(physical);
    await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    // Exercise both existing destinations and new nested paths below an alias.
    for (const suffix of ['existing', 'new/nested/workspace']) {
      if (suffix === 'existing') await mkdir(join(physical, suffix));
      const entered = join(alias, suffix);
      const created = invoke(entered, repo);
      expect(created.status).toBe(0);
      const canonical = await realpath(entered);
      expect(JSON.parse(created.stdout).root).toBe(canonical);
      for (const root of [entered, canonical]) {
        const check = invoke(root, repo, { check: true });
        expect(check.status).toBe(0);
        expect(JSON.parse(check.stdout).status).toBe('current');
      }
      const cli = spawnSync('node', [join(entered, 'kiln.mjs'), 'discover', '--json'], {
        encoding: 'utf8',
      });
      expect(cli.status).toBe(0);
      expect(JSON.parse(cli.stdout).version).toBe('kiln.discovery.v1');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('checks the recorded interpreter without treating another supported caller as runtime drift', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-check-node-'));
  try {
    const root = join(temp, 'workspace');
    const recordedNode = join(temp, process.platform === 'win32' ? 'node.exe' : 'node');
    const currentNode = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' });
    expect(currentNode.status).toBe(0);
    await copyFile(currentNode.stdout.trim(), recordedNode);
    expect(invoke(root, repo, {}, recordedNode).status).toBe(0);
    const manifestPath = join(root, '.kiln/workspace.json');
    const original = await readFile(manifestPath, 'utf8');
    expect(JSON.parse(original).node).toBe(recordedNode);

    const check = invoke(root, repo, { check: true });
    expect(check.status).toBe(0);
    expect(JSON.parse(check.stdout).status).toBe('current');
    expect(JSON.parse(check.stdout).runtimeChanged).toBe(false);
    const cli = spawnSync('node', [join(root, 'kiln.mjs'), 'discover', '--json'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('createRoot');
    expect(await readFile(manifestPath, 'utf8')).toBe(original);

    // A removed pinned interpreter is real drift and still requires explicit repair.
    await rm(recordedNode);
    expect(JSON.parse(invoke(root, repo, { check: true }).stdout).status).toBe('update-required');
    expect(await readFile(manifestPath, 'utf8')).toBe(original);
    expect(invoke(root, repo, { repair: true }).status).toBe(0);
    expect(JSON.parse(invoke(root, repo, { check: true }).stdout).status).toBe('current');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('the CLI launcher runs under the pinned interpreter that the MCP server uses', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-launcher-node-'));
  try {
    const root = join(temp, 'workspace');
    const pinned = join(temp, process.platform === 'win32' ? 'node.exe' : 'node');
    const currentNode = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' });
    expect(currentNode.status).toBe(0);
    await copyFile(currentNode.stdout.trim(), pinned);
    expect(invoke(root, repo, {}, pinned).status).toBe(0);
    // Another Node version can change float digits in exported GLB JSON, so a CLI
    // export must run where kiln_save runs. A preload records every interpreter.
    const probe = join(temp, 'probe.cjs');
    const log = join(temp, 'interpreters.log');
    await writeFile(
      probe,
      `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.execPath + '\\n');`,
    );
    const env = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(probe)}` };
    const run = async (node: string) => {
      await rm(log, { force: true });
      const cli = spawnSync(node, [join(root, 'kiln.mjs'), 'discover', '--json'], {
        encoding: 'utf8',
        env,
      });
      expect(cli.status).toBe(0);
      expect(JSON.parse(cli.stdout).version).toBe('kiln.discovery.v1');
      return (await readFile(log, 'utf8')).trim().split(/\r?\n/);
    };
    const other = await run('node');
    expect(other).toHaveLength(2);
    expect(await realpath(other[1]!)).toBe(await realpath(pinned));
    // The pinned interpreter itself runs the CLI in process.
    expect(await run(pinned)).toHaveLength(1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('retires only tracked unchanged resources and refuses directory links before touching outside files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-resources-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    const resource = 'kiln-author-asset/references/retired.md';
    await put(join(runtime, 'skills', resource), 'old guidance');
    expect(invoke(root, runtime).status).toBe(0);
    await put(join(root, 'skills/kiln-author-asset/owner-note.md'), 'owner note');
    await rm(join(runtime, 'skills', resource));
    expect(invoke(root, runtime, { upgrade: true }).status).toBe(0);
    for (const folder of ['skills', '.agents/skills', '.claude/skills'])
      expect(await Bun.file(join(root, folder, resource)).exists()).toBe(false);
    expect(await readFile(join(root, 'skills/kiln-author-asset/owner-note.md'), 'utf8')).toBe(
      'owner note',
    );
    const outside = join(temp, 'outside');
    await put(join(outside, 'kiln-author-asset/SKILL.md'), 'outside sentinel');
    await rm(join(root, '.agents/skills'), { recursive: true });
    await symlink(
      outside,
      join(root, '.agents/skills'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await fixture(runtime, 'after');
    const refused = invoke(root, runtime, { upgrade: true });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('symbolic link');
    expect(await readFile(join(outside, 'kiln-author-asset/SKILL.md'), 'utf8')).toBe(
      'outside sentinel',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('diagnoses and upgrades a same-version runtime and all skill copies without changing asset data', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime).status).toBe(0);
    const asset = join(root, '.kiln/programs/retained-source');
    await put(asset, '// original asset');
    await put(join(root, 'brief.md'), 'Owner brief');
    await fixture(runtime, 'after');
    const check = invoke(root, runtime, { check: true });
    expect(check.status).toBe(0);
    expect(JSON.parse(check.stdout).status).toBe('update-required');
    const upgrade = invoke(root, runtime, { upgrade: true });
    expect(upgrade.status).toBe(0);
    expect(JSON.parse(upgrade.stdout).upgraded).toBe(true);
    for (const folder of ['skills', '.agents/skills', '.claude/skills'])
      expect(await readFile(join(root, folder, 'kiln-author-asset/SKILL.md'), 'utf8')).toContain(
        'after',
      );
    expect(await readFile(asset, 'utf8')).toBe('// original asset');
    expect(await readFile(join(root, 'brief.md'), 'utf8')).toBe('Owner brief');
    expect(JSON.parse(invoke(root, runtime, { check: true }).stdout).status).toBe('current');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('stops actual CLI and MCP startup on stale skill copies, then restores CLI discovery after upgrade', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-startup-'));
  try {
    expect(invoke(temp, repo).status).toBe(0);
    const manifestPath = join(temp, '.kiln/workspace.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const skill = 'kiln-author-asset/SKILL.md';
    const old = '# Old instructions for kiln_list_primitives';
    manifest.skillHashes[skill] = sha(old);
    for (const folder of ['skills', '.agents/skills', '.claude/skills']) {
      manifest.managedHashes[`${folder}/${skill}`] = sha(old);
      await put(join(temp, folder, skill), old);
    }
    await put(manifestPath, JSON.stringify(manifest));
    const cli = spawnSync('node', [join(temp, 'kiln.mjs'), 'discover', '--json'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('workspace is out of date');
    const config = JSON.parse(await readFile(join(temp, 'opencode.json'), 'utf8')).mcp
      .kiln_workspace;
    const mcp = spawnSync(config.command[0], config.command.slice(1), {
      cwd: temp,
      encoding: 'utf8',
      input: '',
      timeout: 10000,
      env: { ...process.env, ...config.environment, KILN_RENDER: 'cpu' },
    });
    expect(mcp.status).toBe(1);
    expect(mcp.stderr).toContain('workspace is out of date');
    expect(mcp.stdout).toBe('');
    expect(invoke(temp, repo, { upgrade: true }).status).toBe(0);
    const restored = spawnSync('node', [join(temp, 'kiln.mjs'), 'discover', '--json'], {
      encoding: 'utf8',
    });
    expect(restored.status).toBe(0);
    expect(restored.stdout).toContain('createRoot');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('reports conflicting customizations before any upgrade and accepts manually resolved current files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-conflict-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime).status).toBe(0);
    const relative = '.agents/skills/kiln-author-asset/SKILL.md';
    await put(join(root, relative), '# Owner customized instructions');
    const before = await readFile(join(root, '.kiln/workspace.json'), 'utf8');
    await fixture(runtime, 'after');
    const refused = invoke(root, runtime, { upgrade: true });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(relative);
    expect(await readFile(join(root, relative), 'utf8')).toBe('# Owner customized instructions');
    expect(await readFile(join(root, '.kiln/workspace.json'), 'utf8')).toBe(before);
    expect(await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'), 'utf8')).toContain(
      'before',
    );
    await put(
      join(root, relative),
      await readFile(join(runtime, 'skills/kiln-author-asset/SKILL.md'), 'utf8'),
    );
    expect(invoke(root, runtime, { upgrade: true }).status).toBe(0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('upgrades a legacy manifest without inventing ownership of unknown instructions or following unsafe paths', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-legacy-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime).status).toBe(0);
    const path = join(root, '.kiln/workspace.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    delete manifest.managedHashes;
    await put(path, JSON.stringify(manifest));
    await put(join(root, 'AGENTS.md'), '# Historical untracked guide');
    const refused = invoke(root, runtime, { upgrade: true });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('AGENTS.md');
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('# Historical untracked guide');
    manifest.skillHashes['../outside'] = sha('sentinel');
    await put(join(temp, 'outside'), 'sentinel');
    await put(path, JSON.stringify(manifest));
    expect(invoke(root, runtime, { upgrade: true }).stderr).toContain('Unsafe managed path');
    expect(await readFile(join(temp, 'outside'), 'utf8')).toBe('sentinel');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);
