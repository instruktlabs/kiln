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

import {
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  resultJson,
  startStdioServer,
  type StdioServer,
} from './stdio-mcp';

const repo = resolve(import.meta.dir, '../..');
const setup = pathToFileURL(join(repo, 'scripts/create-workspace.mjs')).href;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const put = async (path: string, text: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
};
// The harness matters only at creation; a check, repair or upgrade reads it from the manifest.
const invoke = (root: string, runtime: string, options = {}, node = 'node', harness = 'opencode') =>
  spawnSync(
    node,
    [
      '--input-type=module',
      '-e',
      `import {createWorkspace} from ${JSON.stringify(setup)}; console.log(JSON.stringify(await createWorkspace(process.argv[1], process.argv[4], {...JSON.parse(process.argv[3]),installation:process.argv[2]})));`,
      root,
      runtime,
      JSON.stringify(options),
      harness,
    ],
    { encoding: 'utf8' },
  );

async function fixture(runtime: string, revision: string) {
  await put(
    join(runtime, 'package.json'),
    JSON.stringify({ name: '@instruktlabs/kiln', version: '1.0.0' }),
  );
  const entries: Record<string, unknown> = {};
  for (const [key, file] of [
    ['cli', 'cli.mjs'],
    ['mcp', 'mcp-server.mjs'],
    ['engine', 'mcp-engine.mjs'],
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
    expect(invoke(root, runtime, {}, 'node', 'codex').status).toBe(0);
    await put(join(root, 'skills/kiln-author-asset/owner-note.md'), 'owner note');
    await rm(join(runtime, 'skills', resource));
    expect(invoke(root, runtime, { upgrade: true }).status).toBe(0);
    for (const folder of ['skills', '.agents/skills'])
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
    expect(invoke(root, runtime, {}, 'node', 'claude').status).toBe(0);
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
    for (const folder of ['skills', '.claude/skills'])
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

it('records the dist build identity under its own name and accepts the legacy field', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-build-identity-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime).status).toBe(0);
    const manifestPath = join(root, '.kiln/workspace.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    // Discovery's execution.runtimeIdentity and a save's build.engine are the installed
    // runtime identity, a different hash; this field names the dist build only.
    expect(manifest.buildIdentity).toBe(`sha256:${sha('before')}`);
    expect(manifest.runtimeIdentity).toBeUndefined();
    // Manifests written before the rename carry the same value as runtimeIdentity.
    const { buildIdentity, ...rest } = manifest;
    await put(manifestPath, JSON.stringify({ ...rest, runtimeIdentity: buildIdentity }));
    const check = JSON.parse(invoke(root, runtime, { check: true }).stdout);
    expect(check.runtimeChanged).toBe(false);
    expect(check.status).toBe('current');
    expect(invoke(root, runtime, { upgrade: true }).status).toBe(0);
    const upgraded = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(upgraded.buildIdentity).toBe(buildIdentity);
    expect(upgraded.runtimeIdentity).toBeUndefined();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('stops CLI startup on stale skill copies, reports them in the first MCP call, and recovers after upgrade without a restart', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-startup-'));
  let mcp: StdioServer | undefined;
  try {
    expect(invoke(temp, repo).status).toBe(0);
    const manifestPath = join(temp, '.kiln/workspace.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const skill = 'kiln-author-asset/SKILL.md';
    const old = '# Old instructions for kiln_list_primitives';
    manifest.skillHashes[skill] = sha(old);
    // An OpenCode workspace registers `skills/` itself through `skills.paths`.
    manifest.managedHashes[`skills/${skill}`] = sha(old);
    await put(join(temp, 'skills', skill), old);
    await put(manifestPath, JSON.stringify(manifest));
    const cli = spawnSync('node', [join(temp, 'kiln.mjs'), 'discover', '--json'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('workspace is out of date');
    // The MCP server answers the handshake regardless (contract rule 2) and
    // reports the stale workspace on the first call that needs the engine, as a
    // result the agent can act on: the next step, and no local path (rule 9).
    const config = JSON.parse(await readFile(join(temp, 'opencode.json'), 'utf8')).mcp
      .kiln_workspace;
    mcp = await startStdioServer({
      cwd: temp,
      env: { ...config.environment, KILN_RENDER: 'cpu' },
      bundle: config.command.at(-1),
    });
    const init = await mcp.request('initialize', {
      protocolVersion: LEGACY_REVISIONS[0],
      capabilities: {},
      clientInfo: { name: 'kiln-upgrade-test', version: '0' },
    });
    expect(init.error, mcp.stderr()).toBeUndefined();
    mcp.notify('notifications/initialized');
    const validate = () =>
      mcp!.request('tools/call', { name: 'kiln_validate', arguments: { code: CUBE_PROGRAM } });
    const stale = await validate();
    expect(stale.result!['isError']).toBe(true);
    const text = (stale.result!['content'] as { text?: string }[])
      .map((b) => b.text ?? '')
      .join('\n');
    expect(text).toContain('workspace is out of date');
    expect(text).toContain('kiln-init');
    expect(text).not.toContain(temp);
    expect(invoke(temp, repo, { upgrade: true }).status).toBe(0);
    const restored = spawnSync('node', [join(temp, 'kiln.mjs'), 'discover', '--json'], {
      encoding: 'utf8',
    });
    expect(restored.status).toBe(0);
    expect(restored.stdout).toContain('createRoot');
    // The same server process, once the workspace is current, serves the call.
    const current = await validate();
    expect(current.result!['isError'], JSON.stringify(current.result)).not.toBe(true);
    expect(resultJson(current)['programRef']).toMatch(/^p_[0-9a-f]{12}$/u);
  } finally {
    await mcp?.close();
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);

it('reports conflicting customizations before any upgrade and accepts manually resolved current files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-conflict-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime, {}, 'node', 'codex').status).toBe(0);
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

it('retires the second skill registry a 0.9 workspace carried, and refuses when it was edited', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-upgrade-registry-'));
  try {
    const runtime = join(temp, 'runtime'),
      root = join(temp, 'workspace');
    await fixture(runtime, 'before');
    expect(invoke(root, runtime, {}, 'node', 'codex').status).toBe(0);
    // 0.9.0 wrote `.claude/skills` and `.agents/skills` for every harness. Replay
    // that for a codex workspace: the extra copies, tracked under their digests.
    const path = join(root, '.kiln/workspace.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    const legacy = Object.keys(manifest.skillHashes).map((name) => `.claude/skills/${name}`);
    for (const name of Object.keys(manifest.skillHashes)) {
      await put(
        join(root, '.claude/skills', name),
        await readFile(join(root, 'skills', name), 'utf8'),
      );
      manifest.managedHashes[`.claude/skills/${name}`] = manifest.skillHashes[name];
    }
    await put(path, JSON.stringify(manifest));
    const check = JSON.parse(invoke(root, runtime, { check: true }).stdout);
    expect(check.status).toBe('update-required');
    expect(check.files.map((e: { path: string }) => e.path).sort()).toEqual(legacy.sort());
    expect(check.files.every((e: { status: string }) => e.status === 'retired')).toBe(true);
    // Edited, the copy is the owner's and stops the upgrade before any write.
    const edited = join(root, legacy[0]!);
    await put(edited, '# owner customized copy');
    const refused = invoke(root, runtime, { upgrade: true });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(legacy[0]!);
    expect(await readFile(edited, 'utf8')).toBe('# owner customized copy');
    await put(edited, await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'), 'utf8'));
    expect(invoke(root, runtime, { upgrade: true }).status).toBe(0);
    for (const name of legacy) expect(await Bun.file(join(root, name)).exists()).toBe(false);
    expect(
      await readFile(join(root, '.agents/skills/kiln-author-asset/SKILL.md'), 'utf8'),
    ).toContain('before');
    expect(JSON.parse(invoke(root, runtime, { check: true }).stdout).status).toBe('current');
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
