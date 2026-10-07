import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dir, '..');
const entry = pathToFileURL(join(repo, 'scripts/create-workspace.mjs')).href;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const put = async (root, name, value) => {
  await mkdir(dirname(join(root, name)), { recursive: true });
  await writeFile(join(root, name), value);
};
async function cleanup(temp) {
  const actual = await realpath(temp),
    parent = await realpath(tmpdir());
  if (
    !actual.startsWith(parent + sep) ||
    !actual.slice(parent.length + 1).startsWith('kiln-adopt-')
  )
    throw new Error('Unsafe fixture cleanup.');
  await rm(actual, { recursive: true, force: true });
}
async function fixture(fn) {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'kiln-adopt-')));
  const runtime = join(temp, 'runtime'),
    root = join(temp, 'project'),
    stateDirectory = join(temp, 'private-state');
  await mkdir(root);
  const entries = {};
  for (const [key, name] of [
    ['cli', 'cli.mjs'],
    ['mcp', 'mcp-server.mjs'],
    ['engine', 'mcp-engine.mjs'],
    ['worker', 'evaluator-worker.mjs'],
  ]) {
    const source = 'export function main() {}\n';
    await put(runtime, `dist/${name}`, source);
    entries[key] = { identity: `sha256:${sha('fixture')}`, bundleHash: `sha256:${sha(source)}` };
  }
  await put(runtime, 'package.json', '{"name":"@instruktlabs/kiln","version":"1.0.0"}');
  await put(runtime, 'dist/build.json', JSON.stringify({ schemaVersion: 1, entries }));
  for (const skill of ['author', 'refine', 'qa', 'compose-scene', 'batch-dispatch']) {
    const name = skill.includes('-') ? `kiln-${skill}` : `kiln-${skill}-asset`;
    await put(runtime, `skills/${name}/SKILL.md`, `# ${name}\n`);
  }
  const run = (harness = 'claude', options = {}, destination = root) =>
    spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import {createWorkspace} from ${JSON.stringify(entry)}; try { console.log(JSON.stringify(await createWorkspace(process.argv[1],process.argv[3],JSON.parse(process.argv[2])))); } catch(error) { console.error(error.message); process.exitCode=1; }`,
        destination,
        JSON.stringify({ installation: runtime, stateDirectory, adopt: true, ...options }),
        harness,
      ],
      { encoding: 'utf8', timeout: 15000, windowsHide: true },
    );
  try {
    await fn({ root, runtime, temp, stateDirectory, run });
  } finally {
    await cleanup(temp);
  }
}
const json = async (root, name) => JSON.parse(await readFile(join(root, name), 'utf8'));
const passed = (result) => {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  return JSON.parse(result.stdout);
};

test('adopts an existing project without replacing instructions, another MCP server or assets', () =>
  fixture(async ({ root, run }) => {
    await put(root, 'AGENTS.md', '# Owner project rules\n');
    await put(root, 'CLAUDE.md', '# Owner Claude rules\n');
    await put(
      root,
      '.mcp.json',
      '{ "mcpServers": { "other": { "command": "other", "env": { "API_KEY": "synthetic-owner-key" } } }, "owner": 9007199254740993 }\n',
    );
    await put(root, 'assets/source.kiln.js', '// owned asset');
    const report = passed(run());
    expect(report.status).toBe('current');
    expect(report.harnesses).toEqual(['claude']);
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('# Owner project rules\n');
    expect(await readFile(join(root, 'CLAUDE.md'), 'utf8')).toBe('# Owner Claude rules\n');
    expect(await readFile(join(root, 'assets/source.kiln.js'), 'utf8')).toBe('// owned asset');
    const config = await json(root, '.mcp.json');
    expect(config.mcpServers.other.env.API_KEY).toBe('synthetic-owner-key');
    expect(config.mcpServers.kiln_workspace.env.KILN_PROGRAM_STORE).toBe(
      join(root, '.kiln', 'programs'),
    );
    expect(await readFile(join(root, '.mcp.json'), 'utf8')).toContain('9007199254740993');
    const manifest = await readFile(join(root, '.kiln/workspace.json'), 'utf8');
    expect(manifest).not.toContain('synthetic-owner-key');
    expect(JSON.stringify(report)).not.toContain('synthetic-owner-key');
    expect((await json(root, '.kiln/workspace.json')).schemaVersion).toBe(2);
    expect(
      await readFile(join(root, '.claude/skills/kiln-author-asset/SKILL.md'), 'utf8'),
    ).toContain('kiln-author-asset');
  }));

test('adds Codex around the same store and keeps unrelated TOML settings byte-for-byte', () =>
  fixture(async ({ root, run }) => {
    passed(run());
    await put(root, '.kiln/programs/owner-source.txt', 'source retained');
    const prefix =
      '# owner settings\nmodel = "owner-choice"\n[mcp_servers.other]\ncommand = "other"\n';
    await put(root, '.codex/config.toml', prefix);
    const report = passed(run('codex'));
    expect(report.harnesses).toEqual(['claude', 'codex']);
    expect(await readFile(join(root, '.codex/config.toml'), 'utf8')).toStartWith(prefix);
    expect(await readFile(join(root, '.kiln/programs/owner-source.txt'), 'utf8')).toBe(
      'source retained',
    );
    expect(await readFile(join(root, '.claude/skills/kiln-author-asset/SKILL.md'), 'utf8')).toBe(
      await readFile(join(root, '.agents/skills/kiln-author-asset/SKILL.md'), 'utf8'),
    );
    expect(passed(run('codex')).changed).toEqual([]);
    expect(passed(run('claude', { adopt: false, check: true })).status).toBe('current');
  }));

test('check previews adoption without creating a manifest, configuration or recovery storage', () =>
  fixture(async ({ root, stateDirectory, run }) => {
    await put(root, 'AGENTS.md', 'owner');
    const report = passed(run('codex', { check: true }));
    expect(report.status).toBe('update-required');
    expect(report.files.some((file) => file.path === '.codex/config.toml')).toBe(true);
    expect(await readdir(root)).toEqual(['AGENTS.md']);
    await expect(readdir(stateDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  }));

test('conflicting MCP ownership fails before any project file is installed', () =>
  fixture(async ({ root, run }) => {
    const original =
      '{"mcpServers":{"kiln_workspace":{"command":"owner-server","env":{"TOKEN":"synthetic-private-token"}}}}';
    await put(root, '.mcp.json', original);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('conflict');
    expect(result.stderr).not.toContain('synthetic-private-token');
    expect(await readdir(root)).toEqual(['.mcp.json']);
    expect(await readFile(join(root, '.mcp.json'), 'utf8')).toBe(original);
  }));

test('maintenance tolerates unrelated config edits and preserves customized unchanged skills', () =>
  fixture(async ({ root, run }) => {
    passed(run());
    const config = await json(root, '.mcp.json');
    config.mcpServers.owner = { command: 'owner' };
    await put(root, '.mcp.json', JSON.stringify(config));
    await put(root, 'skills/kiln-author-asset/SKILL.md', '# Owner skill customization\n');
    const report = passed(run('claude', { adopt: false, check: true }));
    expect(report.status).toBe('current');
    expect(report.files).toContainEqual({
      path: 'skills/kiln-author-asset/SKILL.md',
      status: 'customized',
    });
    passed(run('claude', { adopt: false, upgrade: true }));
    expect((await json(root, '.mcp.json')).mcpServers.owner.command).toBe('owner');
    expect(await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'), 'utf8')).toContain(
      'Owner skill',
    );
  }));

test('an explicit legacy migration retains saved assets and allows a second integration', () =>
  fixture(async ({ root, run }) => {
    passed(run('claude', { adopt: false }));
    const first = await json(root, '.kiln/workspace.json');
    expect(first.schemaVersion).toBe(1);
    await put(root, '.kiln/programs/preserved.txt', 'original');
    passed(run('codex'));
    expect((await json(root, '.kiln/workspace.json')).harnesses).toEqual(['claude', 'codex']);
    expect(await readFile(join(root, '.kiln/programs/preserved.txt'), 'utf8')).toBe('original');
    expect(passed(run('codex', { adopt: false, check: true })).status).toBe('current');
  }));

test('adopting a copied legacy OpenCode workspace replaces only its owned old skill path', () =>
  fixture(async ({ root, temp, run }) => {
    passed(run('opencode', { adopt: false }));
    const originalConfig = await readFile(join(root, 'opencode.json'));
    const originalManifest = await readFile(join(root, '.kiln/workspace.json'));
    await put(root, '.kiln/programs/retained.txt', 'saved source');
    const moved = join(temp, 'copied-project');
    await cp(root, moved, { recursive: true });
    passed(run('opencode', {}, moved));
    const config = await json(moved, 'opencode.json');
    expect(config.skills.paths).toEqual([join(moved, 'skills')]);
    expect(config.mcp.kiln_workspace.environment.KILN_PROGRAM_STORE).toBe(
      join(moved, '.kiln/programs'),
    );
    expect(await readFile(join(moved, '.kiln/programs/retained.txt'), 'utf8')).toBe('saved source');
    expect(await readFile(join(root, 'opencode.json'))).toEqual(originalConfig);
    expect(await readFile(join(root, '.kiln/workspace.json'))).toEqual(originalManifest);
    expect(passed(run('opencode', {}, moved)).changed).toEqual([]);
  }));

test('the same adoption path creates a new workspace with optional skills', () =>
  fixture(async ({ root, run }) => {
    const report = passed(run('codex', { skills: ['compose'] }));
    expect(report.status).toBe('current');
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('Kiln asset workspace');
    expect(await readFile(join(root, 'skills/kiln-compose-scene/SKILL.md'), 'utf8')).toContain(
      'compose-scene',
    );
    expect((await json(root, '.kiln/workspace.json')).skills).toContain('kiln-compose-scene');
  }));

test('repair updates every registered runtime path after relocation without rewriting source', () =>
  fixture(async ({ root, temp, runtime, run, stateDirectory }) => {
    passed(run());
    passed(run('codex'));
    await put(root, '.kiln/programs/retained.txt', 'original');
    const moved = join(temp, 'moved-runtime');
    await rename(runtime, moved);
    passed(run('claude', { adopt: false, repair: true, installation: moved, stateDirectory }));
    expect((await json(root, '.mcp.json')).mcpServers.kiln_workspace.args[0]).toBe(
      join(moved, 'dist', 'mcp-server.mjs'),
    );
    expect(await readFile(join(root, '.codex/config.toml'), 'utf8')).toContain(
      JSON.stringify(join(moved, 'dist', 'mcp-server.mjs')),
    );
    expect(await readFile(join(root, '.kiln/programs/retained.txt'), 'utf8')).toBe('original');
  }));

test('repair preserves copied skills until an explicit upgrade adopts the new source', () =>
  fixture(async ({ root, runtime, run }) => {
    passed(run());
    await put(runtime, 'skills/kiln-author-asset/SKILL.md', '# New release guidance\n');
    passed(run('claude', { adopt: false, repair: true }));
    expect(await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'), 'utf8')).toBe(
      '# kiln-author-asset\n',
    );
    expect(passed(run('claude', { adopt: false, check: true })).status).toBe('update-required');
    passed(run('claude', { adopt: false, upgrade: true }));
    expect(await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'), 'utf8')).toBe(
      '# New release guidance\n',
    );
  }));

test('OpenCode keeps other skill paths and servers while adopting only its Kiln entries', () =>
  fixture(async ({ root, run }) => {
    await put(
      root,
      'opencode.json',
      '{ // owner comment\n "skills":{"paths":["./owner-skills"]}, "mcp":{"other":{"type":"local","command":["other"]}} }',
    );
    passed(run('opencode'));
    const raw = await readFile(join(root, 'opencode.json'), 'utf8');
    expect(raw).toContain('// owner comment');
    expect(raw).toContain('./owner-skills');
    expect(raw).toContain('"other"');
    expect(passed(run('opencode', { adopt: false, check: true })).status).toBe('current');
  }));

test('untrusted manifest paths cannot delete or read a project asset during upgrade', () =>
  fixture(async ({ root, run }) => {
    passed(run());
    await put(root, 'assets/keep.txt', 'owner asset');
    const manifest = await json(root, '.kiln/workspace.json');
    manifest.ownedFiles['assets/keep.txt'] = sha('owner asset');
    await put(root, '.kiln/workspace.json', JSON.stringify(manifest));
    const result = run('claude', { adopt: false, upgrade: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid managed-file manifest');
    expect(await readFile(join(root, 'assets/keep.txt'), 'utf8')).toBe('owner asset');
  }));

test('invalid UTF-8 config fails without replacing its original bytes', () =>
  fixture(async ({ root, run }) => {
    const original = Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]);
    await put(root, '.mcp.json', original);
    expect(run().status).toBe(1);
    expect(await readFile(join(root, '.mcp.json'))).toEqual(original);
    expect(await readdir(root)).toEqual(['.mcp.json']);
  }));

test('adoption validates and creates a previously missing directory, while check stays read-only', () =>
  fixture(async ({ root, run }) => {
    await rmdir(root);
    expect(passed(run('claude', { check: true })).status).toBe('update-required');
    await expect(readdir(root)).rejects.toMatchObject({ code: 'ENOENT' });
    passed(run());
    expect((await json(root, '.kiln/workspace.json')).schemaVersion).toBe(2);
  }));

test('adoption previews optional skill selection and rejects corrupt manifests before writing', () =>
  fixture(async ({ root, run }) => {
    const report = passed(run('codex', { check: true, skills: ['compose'] }));
    expect(report.files.some((file) => file.path === 'skills/kiln-compose-scene/SKILL.md')).toBe(
      true,
    );
    expect(await readdir(root)).toEqual([]);
    await put(root, '.kiln/workspace.json', 'null');
    expect(run().status).toBe(1);
    expect(await readdir(root)).toEqual(['.kiln']);
  }));

test('malformed manifest lists stop with a clear error and leave owned files intact', () =>
  fixture(async ({ root, run }) => {
    passed(run());
    const manifest = await json(root, '.kiln/workspace.json');
    const config = await readFile(join(root, '.mcp.json'));
    const skill = await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'));
    for (const [patch, message] of [
      [{ skills: {} }, 'Invalid workspace skill manifest'],
      [{ skills: [] }, 'Invalid workspace skill manifest'],
      [{ skills: [...manifest.skills, manifest.skills[0]] }, 'Invalid workspace skill manifest'],
      [{ harnesses: {} }, 'Invalid workspace harness manifest'],
      [{ harnesses: ['codex'] }, 'Invalid workspace harness manifest'],
    ]) {
      const bytes = JSON.stringify({ ...manifest, ...patch });
      await put(root, '.kiln/workspace.json', bytes);
      const result = run('claude', { adopt: false, upgrade: true });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(await readFile(join(root, '.kiln/workspace.json'), 'utf8')).toBe(bytes);
      expect(await readFile(join(root, '.mcp.json'))).toEqual(config);
      expect(await readFile(join(root, 'skills/kiln-author-asset/SKILL.md'))).toEqual(skill);
    }
  }));
