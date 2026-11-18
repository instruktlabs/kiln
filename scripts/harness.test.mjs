import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { foreignKilnServers, HARNESSES, makeSandbox, REPO, resolveBin, run } from './harness.mjs';

test('OpenCode uses the caller working directory without removed V1 flags', () => {
  const args = HARNESSES.opencode.argv({
    model: 'opencode/example-free',
    prompt: 'Build a curved leaf',
    sandbox: '/tmp/asset workspace',
  });
  expect(args).not.toContain('--dir');
  expect(args).toContain('--standalone');
  expect(args.at(-1)).toBe('Build a curved leaf');
});

// OpenCode 2.2.0's `run` takes its directory from `process.env.PWD ?? process.cwd()`
// and changes into it, so a child that inherits the caller's PWD ignores `cwd` and
// loads the caller's project instead of the workspace and its MCP configuration.
test('run gives the child a PWD that matches its working directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kiln-harness-pwd-'));
  const saved = process.env.PWD;
  try {
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    process.env.PWD = root;
    for (const env of [null, { PWD: root, KILN_HARNESS_PROBE: '1' }]) {
      const result = await run(
        process.execPath,
        ['-e', 'process.stdout.write(JSON.stringify(process.env.PWD ?? null))'],
        { cwd: workspace, env },
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out)).toBe(workspace);
    }
  } finally {
    if (saved === undefined) delete process.env.PWD;
    else process.env.PWD = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== 'win32')(
  'explicit executable paths bypass the shell even with forward slashes and spaces',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln explicit binary '));
    try {
      const executable = join(root, 'fixture.exe');
      copyFileSync(process.execPath, executable);
      expect(resolveBin(executable.replaceAll('\\', '/'))).toEqual({
        cmd: resolve(executable),
        shell: false,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform !== 'win32')(
  'Windows resolution preserves PATH precedence when a later executable shadows a command shim',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-harness-resolution-'));
    try {
      const first = join(root, 'current');
      const second = join(root, 'old');
      mkdirSync(first);
      mkdirSync(second);
      const name = 'kiln-path-regression';
      writeFileSync(join(first, `${name}.cmd`), '@echo current\r\n');
      copyFileSync(process.execPath, join(second, `${name}.exe`));
      const probe = join(root, 'probe.mjs');
      writeFileSync(
        probe,
        `import {resolveBin} from ${JSON.stringify(new URL('./harness.mjs', import.meta.url).href)}; console.log(JSON.stringify(resolveBin('${name}')));`,
      );
      const result = spawnSync(process.execPath, [probe], {
        env: { ...process.env, PATH: `${first};${second};${process.env.PATH}` },
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(result.status).toBe(0);
      const resolved = JSON.parse(result.stdout);
      expect(resolved.shell).toBe(true);
      // where.exe expands 8.3 paths that Bun's realpath may retain. PATH
      // precedence is about the selected file, not its equivalent spelling.
      const actual = statSync(resolved.cmd, { bigint: true });
      const expected = statSync(join(first, `${name}.cmd`), { bigint: true });
      expect(actual.ino).toBeGreaterThan(0n);
      expect([actual.dev, actual.ino]).toEqual([expected.dev, expected.ino]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// A dispatch sandbox is a real Kiln workspace wired to this checkout's build. With
// only a copy of the skills, a child reached Kiln through whatever its user-level
// configuration named: under Claude Code 2.1.322 nothing (it answered in 17 s
// without a tool call), under Codex 0.170.0 a `kiln` server running another
// checkout's source. Both runs then measured the wrong engine.
test('makeSandbox builds a per-harness workspace served by this checkout', async () => {
  const name = `harness-test-${process.pid}`;
  const sandbox = await makeSandbox(name, { harness: 'claude' });
  const other = await makeSandbox(name, { harness: 'codex' });
  try {
    expect(sandbox).not.toBe(other);
    expect(basename(sandbox)).toBe(`claude-${name}`);
    expect(existsSync(join(sandbox, '.kiln', 'workspace.json'))).toBe(true);
    const server = JSON.parse(readFileSync(join(sandbox, '.mcp.json'), 'utf8')).mcpServers
      .kiln_workspace;
    expect(server.args).toEqual([join(REPO, 'dist', 'mcp-server.mjs')]);
    expect(server.env.KILN_WORKSPACE).toBe(sandbox);
    expect(existsSync(join(other, 'codex.mjs'))).toBe(true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
}, 60_000);

test('Claude reads only the sandbox MCP configuration', () => {
  const sandbox = join(tmpdir(), 'kiln-dispatch', 'claude-x');
  const args = HARNESSES.claude.argv({ model: 'sonnet', prompt: 'p', sandbox });
  const at = args.indexOf('--mcp-config');
  expect(at).toBeGreaterThan(-1);
  expect(args[at + 1]).toBe(join(sandbox, '.mcp.json'));
  expect(args).toContain('--strict-mcp-config');
});

test('Codex runs through the workspace launcher with other Kiln servers disabled', () => {
  const sandbox = join(tmpdir(), 'kiln-dispatch', 'codex-x');
  const harness = HARNESSES.codex;
  expect(harness.runBin).toBe('node');
  const args = harness.argv({ model: 'm', prompt: 'p', sandbox, otherServers: ['kiln'] });
  expect(args[0]).toBe(join(sandbox, 'codex.mjs'));
  expect(args).toContain('--approve-for-me');
  expect(args.join(' ')).toContain('-c mcp_servers.kiln.enabled=false');
  expect(args.at(-1)).toBe('p');
});

test('foreignKilnServers names enabled Kiln servers other than the workspace one', () => {
  const list = [
    {
      name: 'kiln',
      enabled: true,
      transport: { command: 'bun', args: ['run', 'x/src/mcp-server.ts'] },
    },
    {
      name: 'my-engine',
      enabled: true,
      transport: { command: 'node', args: ['y/dist/mcp-server.mjs'] },
    },
    { name: 'kiln_workspace', enabled: true, transport: { command: 'node', args: ['z'] } },
    { name: 'kiln_old', enabled: false, transport: { command: 'node', args: [] } },
    { name: 'docs', enabled: true, transport: { url: 'https://example.test' } },
  ];
  expect(foreignKilnServers(list)).toEqual(['kiln', 'my-engine']);
});
