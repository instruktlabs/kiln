import { expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dir, '../..');
const setup = join(repo, 'scripts/create-workspace.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync('node', [setup, ...args], { cwd, encoding: 'utf8' });

async function expectSameDirectory(actual: string, expected: string) {
  // Node expands Windows 8.3 aliases; Bun may retain them. Require an absolute
  // path to the same real directory instead of one platform-specific spelling.
  expect(isAbsolute(actual)).toBe(true);
  const a = await stat(actual, { bigint: true });
  const b = await stat(expected, { bigint: true });
  expect(a.isDirectory()).toBe(true);
  expect(a.ino).toBeGreaterThan(0n);
  expect([a.dev, a.ino]).toEqual([b.dev, b.ino]);
}

it('registers the existing local skill tree for OpenCode and preserves edits when repairing paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-opencode-skills-'));
  try {
    const before = join(root, 'before');
    const after = join(root, 'moved');
    expect(run([before, '--harness', 'opencode', '--skills', 'compose'], root).status).toBe(0);
    const config = JSON.parse(await readFile(join(before, 'opencode.json'), 'utf8'));
    expect(config.skills?.paths).toHaveLength(1);
    await expectSameDirectory(config.skills.paths[0], join(before, 'skills'));
    const reference = join('skills', 'kiln-author-asset', 'references', 'program-contract.md');
    expect(await readFile(join(before, reference), 'utf8')).toBe(
      await readFile(join(repo, reference), 'utf8'),
    );
    expect((await readdir(join(before, 'skills'))).length).toBe(4);
    const author = join('skills', 'kiln-author-asset', 'SKILL.md');
    await writeFile(join(before, author), '# owner-edited skill');
    await writeFile(join(before, reference), '# owner-edited reference');
    await rename(before, after);
    expect(run([after, '--repair'], root).status).toBe(0);
    const repaired = JSON.parse(await readFile(join(after, 'opencode.json'), 'utf8'));
    expect(repaired.skills.paths).toHaveLength(1);
    await expectSameDirectory(repaired.skills.paths[0], join(after, 'skills'));
    expect(await readFile(join(after, author), 'utf8')).toBe('# owner-edited skill');
    expect(await readFile(join(after, reference), 'utf8')).toBe('# owner-edited reference');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('defaults to core skills, supports optional skills, and refuses invalid setup before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-bootstrap-'));
  try {
    const task = join(root, 'assets cafÃ©');
    const invalid = run([task, '--harness', 'codex', '--skills', 'unknown'], root);
    expect(invalid.status).toBe(1);
    expect(await readdir(root)).toEqual([]);
    expect(run([task, '--harness', 'codex'], root).status).toBe(0);
    expect((await readdir(join(task, 'skills'))).sort()).toEqual([
      'kiln-author-asset',
      'kiln-qa-asset',
      'kiln-refine-asset',
    ]);
    const optional = join(root, 'scene');
    expect(run([optional, '--harness', 'opencode', '--skills', 'compose,batch'], root).status).toBe(
      0,
    );
    expect((await readdir(join(optional, 'skills'))).length).toBe(5);
    expect(
      JSON.parse(await readFile(join(task, '.kiln/workspace.json'), 'utf8')).runtimeVersion,
    ).toBeString();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('repairs a moved workspace without replacing assets or silently overwriting edited configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-bootstrap-'));
  try {
    const before = join(root, 'before');
    const after = join(root, 'after cafÃ©');
    expect(run([before, '--harness', 'opencode'], root).status).toBe(0);
    await writeFile(join(before, 'keep.kiln.js'), '// authored source');
    await rename(before, after);
    expect(run([after, '--repair'], root).status).toBe(0);
    const config = JSON.parse(await readFile(join(after, 'opencode.json'), 'utf8'));
    const store = config.mcp.kiln_workspace.environment.KILN_PROGRAM_STORE;
    expect(basename(store)).toBe('programs');
    await expectSameDirectory(dirname(store), join(after, '.kiln'));
    expect(await readFile(join(after, 'keep.kiln.js'), 'utf8')).toBe('// authored source');
    await writeFile(join(after, 'opencode.json'), '{"custom":true}');
    expect(run([after, '--repair'], root).status).toBe(1);
    expect(await readFile(join(after, 'opencode.json'), 'utf8')).toBe('{"custom":true}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('checks the installation before creating a destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-bootstrap-'));
  try {
    const script = `import { createWorkspace } from ${JSON.stringify(pathToFileURL(setup).href)}; await createWorkspace(process.argv[1], 'codex', { installation: process.argv[2] });`;
    const result = spawnSync(
      'node',
      ['--input-type=module', '-e', script, join(root, 'assets'), join(root, 'missing')],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('refuses an otherwise loadable installation without the packaged worker before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-bootstrap-'));
  try {
    const runtime = join(root, 'runtime');
    await mkdir(join(runtime, 'dist'), { recursive: true });
    await writeFile(join(runtime, 'package.json'), '{"name":"@kiln/engine","version":"1.0.0"}');
    await writeFile(join(runtime, 'dist/cli.mjs'), 'export function main() {}');
    await writeFile(join(runtime, 'dist/mcp-server.mjs'), '');
    await writeFile(join(runtime, 'dist/mcp-engine.mjs'), '');
    for (const name of ['kiln-author-asset', 'kiln-refine-asset', 'kiln-qa-asset']) {
      await mkdir(join(runtime, 'skills', name), { recursive: true });
      await writeFile(join(runtime, 'skills', name, 'SKILL.md'), '# fixture');
    }
    const script = `import { createWorkspace } from ${JSON.stringify(pathToFileURL(setup).href)}; await createWorkspace(process.argv[1], 'codex', { installation: process.argv[2] });`;
    const result = spawnSync(
      'node',
      ['--input-type=module', '-e', script, join(root, 'assets'), runtime],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(await readdir(root)).toEqual(['runtime']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('teaches agents to honor the requested destination and save immutable history', async () => {
  const author = await readFile(join(repo, 'skills/kiln-author-asset/SKILL.md'), 'utf8');
  const refine = await readFile(join(repo, 'skills/kiln-refine-asset/SKILL.md'), 'utf8');
  expect(author).toContain('The user chooses the destination');
  expect(author).toContain('Use `project` only as the fallback');
  expect(author).toContain('use `library` for an explicitly requested cross-workspace library');
  // The viewer is for a person who is present. Told to launch it, a headless Codex
  // session saved its asset and then sat behind the viewer process until it was
  // killed at the 30-minute cap (baseline session b05, 2026-10-01).
  expect(author).toContain('is optional and for a person who is present');
  expect(author).toContain('never as a step of a headless or unattended run');
  expect(author).toContain('Record the actual model and harness');
  expect(author).toContain('A finished asset is not delivered until');
  expect(refine).toContain('immutable child revision');
  expect(refine).toContain('prior revision remains intact');
});

it('launches Agy in its own project and disables automatic skill expansion for headless runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-agy-bootstrap-'));
  try {
    const task = join(root, 'assets');
    expect(run([task, '--harness', 'agy'], root).status).toBe(0);
    const preload = join(root, 'capture.mjs');
    await writeFile(
      preload,
      `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {EventEmitter} from 'node:events';cp.spawn=(command,args,options)=>{console.log(JSON.stringify({command,args,cwd:options.cwd,windowsHide:options.windowsHide}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};syncBuiltinESMExports();`,
    );
    const invoke = (args: string[]) =>
      spawnSync('node', ['--import', pathToFileURL(preload).href, join(task, 'agy.mjs'), ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    const first = invoke(['--print=Make a lamp']);
    expect(first.status).toBe(0);
    const start = await readFile(join(task, 'START.md'), 'utf8');
    expect(start).toContain('--print="Read AGENTS.md');
    expect(start).not.toContain('--print "Read AGENTS.md');
    const launch = JSON.parse(first.stdout);
    expect(launch.cwd).toBe(task);
    expect(launch.windowsHide).toBe(true);
    expect(launch.args).toContain('--disable-slash-commands');
    expect(launch.args).toContain('--new-project');
    expect(launch.args[launch.args.indexOf('--add-dir') + 1]).toBe(task);
    const resumed = JSON.parse(
      invoke(['--conversation', 'existing', '--print', 'Continue']).stdout,
    );
    expect(resumed.args).not.toContain('--new-project');
    expect(JSON.parse(invoke([]).stdout).args).not.toContain('--disable-slash-commands');
    expect(await readFile(join(task, 'AGENTS.md'), 'utf8')).toContain('kiln_workspace');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('adds a new managed launcher during repair but refuses an existing user file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-agy-migrate-'));
  try {
    for (const collision of [false, true]) {
      const task = join(root, String(collision));
      expect(run([task, '--harness', 'agy'], root).status).toBe(0);
      const path = join(task, '.kiln/workspace.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      delete manifest.generated['agy.mjs'];
      await writeFile(path, JSON.stringify(manifest));
      if (collision) await writeFile(join(task, 'agy.mjs'), '// user launcher');
      else await rm(join(task, 'agy.mjs'));
      expect(run([task, '--repair'], root).status).toBe(collision ? 1 : 0);
      expect(await readFile(join(task, 'agy.mjs'), 'utf8')).toContain(
        collision ? '// user launcher' : '--disable-slash-commands',
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('steers the session to the loop, the render service and its own inherited context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-guide-'));
  try {
    const task = join(root, 'w');
    expect(run([task, '--harness', 'claude'], root).status).toBe(0);
    const guide = await readFile(join(task, 'AGENTS.md'), 'utf8');
    // Both surfaces are legitimate, so the guide has to name the two things that
    // actually differ rather than express a preference: where the image lands, and
    // that the CPU fallback is not material evidence.
    expect(guide).toContain('read the PNG back');
    expect(guide).toContain('materialFaithful');
    expect(guide).toContain('render-service');
    // `--repair` regenerates only the managedFiles set, never this guide, so an
    // absolute engine path baked in here would rot silently the first time the
    // installation moved. The manifest is the indirection that repair does keep.
    expect(guide).toContain('.kiln/workspace.json');
    expect(guide).not.toContain(repo);
    // Inherited user-level skills and servers are the measured context leak; the
    // workspace cannot prevent them, so it must at least ask for them to be reported.
    expect(guide).toContain('user-level configuration');
    // Long-running authoring sessions can cross a harness-managed compaction
    // boundary. The workspace cannot choose a safe threshold without knowing
    // the selected model's context window, but it can make the state needed to
    // resume durable across every harness.
    expect(guide).toContain('Context compaction');
    expect(guide).toContain('KILN_PROGRESS.md');
    expect(guide).toContain('current programRef');
    expect(guide).toContain('exact next action');
    // Contract rule 12 (lean standing knowledge): the guide is read whole at the
    // start of every session and re-read after each compaction, so it is at most
    // 5,000 characters, and CLAUDE.md is a one-line import rather than a second
    // copy of it for a harness that reads both files.
    expect(guide.length).toBeLessThanOrEqual(5_000);
    expect(await readFile(join(task, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    expect(await readFile(join(task, 'START.md'), 'utf8')).toContain(
      'Long-running and headless sessions may compact context automatically',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('registers skills once, in the one directory each harness reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-skill-registry-'));
  try {
    // Measured on the installed CLIs (docs/harnesses.md): Claude Code 2.1.287 names
    // `.claude/skills` and `.agents/skills`, so a workspace that carried both
    // registered every skill twice; Codex 0.160.0 and Agy 1.2.14 name
    // `.agents/skills`; OpenCode 2.0.14 reads only the `skills.paths` its config
    // names, which is `skills/` itself. Every copy is also bytes an upgrade tracks.
    const registries: Record<string, string[]> = {
      claude: ['.claude/skills'],
      codex: ['.agents/skills'],
      agy: ['.agents/skills'],
      opencode: [],
    };
    for (const [harness, expected] of Object.entries(registries)) {
      const task = join(root, harness);
      expect(run([task, '--harness', harness], root).status).toBe(0);
      for (const registry of ['.claude/skills', '.agents/skills']) {
        const present = await readdir(join(task, registry)).then(
          () => true,
          () => false,
        );
        expect({ harness, registry, present }).toEqual({
          harness,
          registry,
          present: expected.includes(registry),
        });
      }
      const manifest = JSON.parse(await readFile(join(task, '.kiln/workspace.json'), 'utf8'));
      const tracked = Object.keys(manifest.managedHashes)
        .filter((name: string) => /^\.(claude|agents)\/skills\//u.test(name))
        .map((name: string) => name.split('/').slice(0, 2).join('/'));
      expect([...new Set(tracked)].sort()).toEqual([...expected].sort());
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('writes each harness the MCP config spelling it actually reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-harness-mcp-'));
  const server = /dist[\\/]mcp-server\.mjs$/;
  try {
    // Copilot loads a workspace `.mcp.json` -- the same filename Claude Code
    // reads -- but not the same contents: `copilot mcp add` writes
    // `type: "local"` and an explicit tool filter where Claude writes
    // `type: "stdio"` and none. One file cannot serve both, so the generator
    // has to know which harness asked.
    const copilot = join(root, 'copilot');
    expect(run([copilot, '--harness', 'copilot'], root).status).toBe(0);
    const forCopilot = JSON.parse(await readFile(join(copilot, '.mcp.json'), 'utf8'));
    expect(forCopilot.mcpServers.kiln_workspace.type).toBe('local');
    expect(forCopilot.mcpServers.kiln_workspace.tools).toEqual(['*']);
    expect(forCopilot.mcpServers.kiln_workspace.args[0]).toMatch(server);

    // Cursor's CLI reads `.cursor/mcp.json`, and a user-level entry there can
    // name a different installation entirely -- so the workspace gets its own.
    const cursor = join(root, 'cursor');
    expect(run([cursor, '--harness', 'cursor-agent'], root).status).toBe(0);
    const forCursor = JSON.parse(await readFile(join(cursor, '.cursor/mcp.json'), 'utf8'));
    expect(forCursor.mcpServers.kiln_workspace.args[0]).toMatch(server);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

// The two defects this covers were invisible to every existing check, because
// `harness-smoke.mjs` invokes each CLI directly and never touches the generated
// launcher. A generated codex workspace could not see Kiln at all -- codex reads
// `.codex/config.toml` only for a project its home marks trusted, so the file was
// inert in a fresh workspace -- and a generated
// hermes workspace could not reach a model, because redirecting HERMES_HOME to
// the workspace took the provider selection and the credential store with it.
//
// Both are launcher-shaped, so this asserts the launcher's shape. Running one for
// real needs a signed-in CLI and costs money, which is what `docs/dogfooding.md`
// Tier 0 is for; what belongs in CI is that the launcher exists, is valid JS, and
// carries the flags the fix depends on.
it('gives every user-global harness a launcher that configures without relocating its home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-harness-launcher-'));
  try {
    const codexDir = join(root, 'codex');
    expect(run([codexDir, '--harness', 'codex'], root).status).toBe(0);
    const codex = await readFile(join(codexDir, 'codex.mjs'), 'utf8');
    // Per-invocation `-c` overrides are the fix: they register the server for one
    // run and write nothing, so $CODEX_HOME keeps its config AND its auth.
    expect(codex).toContain('mcp_servers.kiln_workspace.command');
    expect(codex).toContain('mcp_servers.kiln_workspace.args');
    expect(codex).toContain('mcp_servers.kiln_workspace.env.KILN_PROGRAM_STORE');
    expect(codex).toContain("'-c'");
    // A workspace is deliberately not a git checkout.
    expect(codex).toContain('--skip-git-repo-check');
    expect(codex).toContain("'--cd'");
    expect(codex).not.toContain('shell: true');
    // The launcher must never move the home that holds credentials.
    expect(codex).not.toContain('CODEX_HOME');

    const hermesDir = join(root, 'hermes');
    expect(run([hermesDir, '--harness', 'hermes'], root).status).toBe(0);
    const hermes = await readFile(join(hermesDir, 'hermes.mjs'), 'utf8');
    // The regression under test. HERMES_HOME resolves BOTH the config path and
    // the credential path, so redirecting it is what broke the run.
    expect(hermes).not.toContain('HERMES_HOME');
    // `--in` is what makes hermes treat this directory as the project, which is
    // also what injects the workspace's AGENTS.md.
    expect(hermes).toContain("'--in'");
    // The program store rides the environment, so no config file is needed for
    // it and a user-level registration still lands in THIS workspace.
    expect(hermes).toContain('KILN_PROGRAM_STORE');
    // `--skills` takes skill NAMES, not a path; passing a directory fails with
    // "Unknown skill(s)" and takes the whole run with it.
    expect(hermes).not.toContain("'--skills'");

    // Parsed by the interpreter that will run it, not by a regex: a launcher is
    // generated from a template string, so a stray escape produces a file that
    // looks fine and throws on the user's first invocation.
    for (const path of [join(codexDir, 'codex.mjs'), join(hermesDir, 'hermes.mjs')]) {
      const check = spawnSync('node', ['--check', path], { encoding: 'utf8' });
      expect(check.status, `${path}: ${check.stderr}`).toBe(0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('runs the Windows npm Codex shim through Node and preserves initial and resume arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln codex launcher '));
  try {
    const task = join(root, 'assets');
    expect(run([task, '--harness', 'codex'], root).status).toBe(0);
    const bin = join(root, 'npm prefix');
    const entry = join(bin, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    await mkdir(dirname(entry), { recursive: true });
    await writeFile(join(bin, 'codex.cmd'), '@echo off\r\n');
    await writeFile(
      entry,
      'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),home:process.env.CODEX_HOME}));',
    );
    const preload = join(root, 'platform.mjs');
    await writeFile(preload, "Object.defineProperty(process,'platform',{value:'win32'});");
    const node = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).stdout.trim();
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.PATH = bin;
    env.CODEX_HOME = join(root, 'unchanged home');
    const prompt = 'Keep spaces, "quotes", & pipes | %PATH% and $(literal) intact';
    for (const input of [
      [prompt],
      ['exec', '--json', prompt],
      ['resume', 'session-id', prompt],
      ['exec', 'resume', 'session-id', prompt],
    ]) {
      const launched = spawnSync(
        node,
        ['--import', pathToFileURL(preload).href, join(task, 'codex.mjs'), ...input],
        { cwd: root, env, encoding: 'utf8' },
      );
      expect(launched.status, launched.stderr).toBe(0);
      const actual = JSON.parse(launched.stdout);
      expect(actual.cwd).toBe(task);
      expect(actual.home).toBe(env.CODEX_HOME);
      expect(actual.args[0]).toBe('exec');
      expect(actual.args.at(-1)).toBe(prompt);
      expect(actual.args.filter((arg: string) => arg === '--cd')).toHaveLength(1);
      expect(actual.args[actual.args.indexOf('--cd') + 1]).toBe(task);
      expect(actual.args.filter((arg: string) => arg === '--skip-git-repo-check')).toHaveLength(1);
      expect(actual.args).toContain(
        `mcp_servers.kiln_workspace.env.KILN_WORKSPACE=${JSON.stringify(task)}`,
      );
      if (input.includes('resume')) {
        const resume = actual.args.indexOf('resume');
        expect(actual.args.indexOf('--cd')).toBeLessThan(resume);
        expect(actual.args.indexOf('--skip-git-repo-check')).toBeGreaterThan(resume);
        expect(actual.args.indexOf('-c')).toBeGreaterThan(resume);
        expect(actual.args.slice(-2)).toEqual(['session-id', prompt]);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('launches a native Windows Codex executable and preserves POSIX PATH execution without a shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-codex-native-'));
  try {
    const task = join(root, 'assets');
    expect(run([task, '--harness', 'codex'], root).status).toBe(0);
    const bin = join(root, 'native bin');
    await mkdir(bin);
    await writeFile(join(bin, 'codex.exe'), 'native fixture, never executed');
    const preload = join(root, 'capture.mjs');
    await writeFile(
      preload,
      `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {EventEmitter} from 'node:events';Object.defineProperty(process,'platform',{value:process.env.TEST_PLATFORM});cp.spawn=(command,args,options)=>{console.log(JSON.stringify({command,args,options}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};syncBuiltinESMExports();`,
    );
    const node = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).stdout.trim();
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.PATH = bin;
    for (const platform of ['win32', 'linux']) {
      const launched = spawnSync(
        node,
        ['--import', pathToFileURL(preload).href, join(task, 'codex.mjs'), '--help'],
        { cwd: root, env: { ...env, TEST_PLATFORM: platform }, encoding: 'utf8' },
      );
      expect(launched.status, launched.stderr).toBe(0);
      const actual = JSON.parse(launched.stdout);
      expect(actual.command).toBe(platform === 'win32' ? join(bin, 'codex.exe') : 'codex');
      expect(actual.options.shell).not.toBe(true);
      expect(actual.options.windowsHide).toBe(true);
      expect(actual.args.at(-1)).toBe('--help');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('emits names-only Codex renderer forwarding for initial and resume launches without changing inherited values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-codex-render-env-'));
  const names = [
    'KILN_RENDER_TOKEN',
    'RENDER_SERVICE_TOKEN',
    'KILN_RENDER_PORT_URL',
    'KILN_RENDER_SERVICE_PORT',
    'KILN_WORK_ITEM',
    // Codex starts an MCP server with only the named variables, so a configured
    // project that every other harness's server inherits from the shell was
    // invisible under Codex alone (finding S7, 2026-10-01).
    'KILN_PROJECT',
  ];
  const fixture = {
    KILN_RENDER_TOKEN: 'synthetic-client-token-not-a-real-credential',
    RENDER_SERVICE_TOKEN: 'synthetic-local-token-not-a-real-credential',
    KILN_RENDER_PORT_URL: 'https://renderer.invalid/fixture',
    KILN_RENDER_SERVICE_PORT: '43123',
    KILN_WORK_ITEM: 'cow',
    KILN_PROJECT: 'pack-fixture',
  };
  try {
    const task = join(root, 'assets');
    const node = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).stdout.trim();
    const created = spawnSync(node, [setup, task, '--harness', 'codex'], {
      cwd: root,
      env: { ...process.env, ...fixture },
      encoding: 'utf8',
    });
    expect(created.status, created.stderr).toBe(0);
    const config = await readFile(join(task, '.codex/config.toml'), 'utf8');
    expect(config).toMatch(/^env_vars = /m);
    expect(JSON.parse(config.match(/^env_vars = (.+)$/m)![1]!)).toEqual(names);
    for (const name of [
      'codex.mjs',
      '.codex/config.toml',
      'AGENTS.md',
      'CLAUDE.md',
      'START.md',
      '.kiln/workspace.json',
    ]) {
      const generated = await readFile(join(task, name), 'utf8');
      for (const value of Object.values(fixture)) expect(generated).not.toContain(value);
    }
    const bin = join(root, 'bin');
    await mkdir(bin);
    await writeFile(join(bin, 'codex.exe'), 'fixture, never executed');
    const preload = join(root, 'capture.mjs');
    await writeFile(
      preload,
      `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {EventEmitter} from 'node:events';Object.defineProperty(process,'platform',{value:'win32'});const names=${JSON.stringify(names)};cp.spawn=(command,args,options)=>{const env=options.env??process.env;console.log(JSON.stringify({args,inherited:Object.fromEntries(names.filter(name=>Object.hasOwn(env,name)).map(name=>[name,env[name]]))}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};syncBuiltinESMExports();`,
    );
    const cases: Record<string, string>[] = [
      {},
      { RENDER_SERVICE_TOKEN: fixture.RENDER_SERVICE_TOKEN },
      {
        KILN_RENDER_TOKEN: fixture.KILN_RENDER_TOKEN,
        KILN_RENDER_PORT_URL: fixture.KILN_RENDER_PORT_URL,
      },
      fixture,
      { KILN_RENDER_TOKEN: '', RENDER_SERVICE_TOKEN: fixture.RENDER_SERVICE_TOKEN },
      { KILN_PROJECT: fixture.KILN_PROJECT },
    ];
    for (const values of cases) {
      const env = { ...process.env };
      for (const key of Object.keys(env))
        if (names.includes(key.toUpperCase()) || key.toLowerCase() === 'path') delete env[key];
      Object.assign(env, values, { PATH: bin });
      for (const input of [
        ['exec', '--help'],
        ['exec', 'resume', '--help'],
      ]) {
        const launched = spawnSync(
          node,
          ['--import', pathToFileURL(preload).href, join(task, 'codex.mjs'), ...input],
          { cwd: root, env, encoding: 'utf8' },
        );
        expect(launched.status, launched.stderr).toBe(0);
        const actual = JSON.parse(launched.stdout);
        const expected = `mcp_servers.kiln_workspace.env_vars=${JSON.stringify(names)}`;
        expect(actual.args.filter((arg: string) => arg === expected)).toHaveLength(1);
        expect(actual.args[actual.args.indexOf(expected) - 1]).toBe('-c');
        if (input.includes('resume'))
          expect(actual.args.indexOf(expected)).toBeGreaterThan(actual.args.indexOf('resume'));
        expect(actual.inherited).toEqual(values);
        for (const value of Object.values(fixture))
          expect(JSON.stringify(actual.args)).not.toContain(value);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
