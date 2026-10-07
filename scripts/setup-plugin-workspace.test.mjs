import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { parseSetupArguments, setupPluginWorkspace } from './setup-plugin-workspace.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith((await realpath(tmpdir())) + sep))
      throw new Error('Invalid test root');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'kiln-plugin-setup-café-')));
  roots.push(root);
  const pluginRoot = join(root, 'plugin-cache');
  await mkdir(pluginRoot);
  const pin = { name: '@instruktlabs/kiln', version: '1.0.0-rc.1' };
  await writeFile(join(pluginRoot, 'runtime.json'), JSON.stringify(pin));
  const calls = [];
  const run = async (args, cwd) => {
    calls.push({ args, cwd });
    const engine = join(cwd, 'node_modules/@instruktlabs/kiln');
    await mkdir(join(engine, 'scripts'), { recursive: true });
    await writeFile(join(engine, 'package.json'), JSON.stringify(pin));
    await writeFile(join(cwd, 'package-lock.json'), '{"lockfileVersion":3}');
    // The real engine owns workspace generation and conflict-preserving upgrades.
    await writeFile(
      join(engine, 'scripts/create-workspace.mjs'),
      `
export async function createWorkspace(root, harness, options) {
  return {root,harness,options,fixture:true};
}
`,
    );
  };
  return {
    root,
    pin,
    calls,
    options: {
      pluginRoot,
      directory: join(root, 'my assets'),
      dataDirectory: join(root, 'durable data'),
      harness: 'claude',
      npmPath: join(root, 'npm-cli.js'),
      run,
    },
  };
}

test('plugin setup installs an exact package once outside the cache and delegates workspace creation', async () => {
  const f = await fixture();
  const result = await setupPluginWorkspace(f.options);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].args).toContain('@instruktlabs/kiln@1.0.0-rc.1');
  expect(f.calls[0].args).toContain('--ignore-scripts');
  expect(f.calls[0].args).toContain('--include=optional');
  expect(f.calls[0].args).toContain('--registry=https://registry.npmjs.org');
  expect(f.calls[0].cwd.startsWith(f.options.pluginRoot + sep)).toBe(false);
  expect(result.workspace).toMatchObject({ root: f.options.directory, harness: 'claude' });
  expect(result.runtime.startsWith(f.options.dataDirectory + sep)).toBe(true);
  expect(result.runtime).not.toContain('.staging-');
  const after = await setupPluginWorkspace({ ...f.options, directory: join(f.root, 'another') });
  expect(after.runtime).toBe(result.runtime);
  expect(f.calls).toHaveLength(1);
});

test.each(['opencode', 'hermes', 'agy', 'copilot', 'cursor-agent'])(
  'the plugin helper can register the engine-supported %s adapter',
  async (harness) => {
    const f = await fixture();
    await writeFile(
      join(f.options.pluginRoot, 'runtime.json'),
      JSON.stringify({ ...f.pin, harnesses: ['claude', 'codex', harness] }),
    );
    const result = await setupPluginWorkspace({ ...f.options, harness });
    expect(result.workspace.harness).toBe(harness);
    expect(f.calls).toHaveLength(1);
  },
);

test('invalid advertised adapters fail before installation or workspace changes', async () => {
  const f = await fixture();
  for (const harnesses of [[], ['claude', 'claude'], ['../other'], 'claude']) {
    await writeFile(
      join(f.options.pluginRoot, 'runtime.json'),
      JSON.stringify({ ...f.pin, harnesses }),
    );
    await expect(setupPluginWorkspace(f.options)).rejects.toThrow('harness');
  }
  expect(f.calls).toHaveLength(0);
  await expect(readdir(f.options.directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

test.each(['latest', '^1.0.0', '../other', 'file:/private', 'https://example.com/p.tgz'])(
  'rejects a non-exact runtime pin %s before invoking npm',
  async (version) => {
    const f = await fixture();
    await writeFile(
      join(f.options.pluginRoot, 'runtime.json'),
      JSON.stringify({ ...f.pin, version }),
    );
    await expect(setupPluginWorkspace(f.options)).rejects.toThrow('exact');
    expect(f.calls).toHaveLength(0);
    await expect(readFile(join(f.options.dataDirectory, 'package.json'))).rejects.toThrow();
  },
);

test('rejects another package name and unsupported harnesses before installation', async () => {
  const f = await fixture();
  await expect(setupPluginWorkspace({ ...f.options, harness: 'unknown' })).rejects.toThrow(
    'harness',
  );
  await writeFile(
    join(f.options.pluginRoot, 'runtime.json'),
    JSON.stringify({ ...f.pin, name: 'other' }),
  );
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('package');
  expect(f.calls).toHaveLength(0);
});

test('refuses runtime or workspace paths inside the disposable plugin cache', async () => {
  const f = await fixture();
  for (const change of [
    { directory: join(f.options.pluginRoot, 'assets') },
    { dataDirectory: join(f.options.pluginRoot, 'data') },
    { dataDirectory: f.options.directory },
    { directory: f.options.dataDirectory },
  ]) {
    await expect(setupPluginWorkspace({ ...f.options, ...change })).rejects.toThrow('separate');
  }
  expect(f.calls).toHaveLength(0);
});

test('does not install or touch an existing nonempty directory when creation was requested', async () => {
  const f = await fixture();
  await mkdir(f.options.directory);
  const source = join(f.options.directory, 'my-source.js');
  await writeFile(source, 'keep me');
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('empty');
  expect(await readFile(source, 'utf8')).toBe('keep me');
  expect(f.calls).toHaveLength(0);
});

test('explicit project adoption delegates to a capable pinned engine without touching owner files', async () => {
  const f = await fixture();
  await mkdir(f.options.directory);
  await writeFile(join(f.options.directory, 'AGENTS.md'), 'Owner instructions');
  const install = f.options.run;
  const result = await setupPluginWorkspace({
    ...f.options,
    adopt: true,
    run: async (...args) => {
      await install(...args);
      const module = join(args[1], 'node_modules/@instruktlabs/kiln/scripts/create-workspace.mjs');
      await writeFile(
        module,
        (await readFile(module, 'utf8')) +
          '\nexport const workspaceSetupCapabilities = {projectAdoption:1,recovery:1};\n',
      );
    },
  });
  expect(result.workspace.options.adopt).toBe(true);
  expect(await readFile(join(f.options.directory, 'AGENTS.md'), 'utf8')).toBe('Owner instructions');
});

test('adoption never falls back to an older engine that can only create empty workspaces', async () => {
  const f = await fixture();
  await mkdir(f.options.directory);
  await writeFile(join(f.options.directory, 'keep.txt'), 'owner');
  await expect(setupPluginWorkspace({ ...f.options, adopt: true })).rejects.toThrow(
    'does not support project adoption',
  );
  expect(await readFile(join(f.options.directory, 'keep.txt'), 'utf8')).toBe('owner');
  expect(await readdir(f.options.directory)).toEqual(['keep.txt']);
});

test('CLI can preview project adoption and cannot combine recovery with setup changes', () => {
  expect(
    parseSetupArguments(['/project', '--adopt', '--check', '--harness', 'codex']),
  ).toMatchObject({ adopt: true, mode: 'check', harness: 'codex' });
  expect(() => parseSetupArguments(['/project', '--adopt', '--recover'])).toThrow('recover');
});

test('check is read-only when the pinned engine has not been installed', async () => {
  const f = await fixture();
  await expect(setupPluginWorkspace({ ...f.options, mode: 'check' })).rejects.toThrow(
    'not installed',
  );
  expect(f.calls).toHaveLength(0);
  expect(await readdir(f.root)).toEqual(['plugin-cache']);
});

test('a failed install removes only its staging directory', async () => {
  const f = await fixture();
  await mkdir(f.options.dataDirectory);
  await writeFile(join(f.options.dataDirectory, 'keep.txt'), 'owner data');
  await expect(
    setupPluginWorkspace({
      ...f.options,
      run: async () => {
        throw new Error('npm failed');
      },
    }),
  ).rejects.toThrow('npm failed');
  expect(await readFile(join(f.options.dataDirectory, 'keep.txt'), 'utf8')).toBe('owner data');
  expect(await readdir(join(f.options.dataDirectory, 'runtimes'))).toEqual([]);
});

test('an existing unknown runtime is never overwritten or repaired implicitly', async () => {
  const f = await fixture();
  const target = join(f.options.dataDirectory, 'runtimes', f.pin.version);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'private.txt'), 'keep');
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('runtime');
  expect(f.calls).toHaveLength(0);
  expect(await readFile(join(target, 'private.txt'), 'utf8')).toBe('keep');
});

test('a package identity mismatch never reaches the engine or publishes an installation', async () => {
  const f = await fixture();
  const run = f.options.run;
  await expect(
    setupPluginWorkspace({
      ...f.options,
      run: async (...args) => {
        await run(...args);
        await writeFile(
          join(args[1], 'node_modules/@instruktlabs/kiln/package.json'),
          JSON.stringify({ ...f.pin, version: '9.0.0' }),
        );
      },
    }),
  ).rejects.toThrow('identity');
  expect(await readdir(join(f.options.dataDirectory, 'runtimes'))).toEqual([]);
});

test('upgrade and check preserve the engine upgrade protocol rather than rewriting workspace files', async () => {
  const f = await fixture();
  const initial = await setupPluginWorkspace(f.options);
  for (const mode of ['upgrade', 'check']) {
    const result = await setupPluginWorkspace({ ...f.options, mode });
    expect(result.runtime).toBe(initial.runtime);
    expect(result.workspace.options[mode]).toBe(true);
    expect(result.workspace.options.installation).toBe(initial.runtime);
  }
  expect(f.calls).toHaveLength(1);
});

test('an explicit local qualification archive replaces only the npm spec, not the required identity', async () => {
  const f = await fixture();
  const archive = join(f.root, 'candidate.tgz');
  await writeFile(archive, 'fixture');
  const result = await setupPluginWorkspace({ ...f.options, archive });
  expect(f.calls[0].args).toContain(archive);
  expect(f.calls[0].args).not.toContain('@instruktlabs/kiln@1.0.0-rc.1');
  expect(
    JSON.parse(
      await readFile(join(dirname(dirname(dirname(result.runtime))), 'kiln-runtime.json'), 'utf8'),
    ),
  ).toMatchObject({ name: f.pin.name, version: f.pin.version });
});

test('CLI check returns failure for workspace drift without running an installation', async () => {
  const f = await fixture();
  const { runtime } = await setupPluginWorkspace(f.options);
  await writeFile(
    join(runtime, 'scripts/create-workspace.mjs'),
    'export async function createWorkspace() { return {status:"update-required"}; }',
  );
  const script = join(f.options.pluginRoot, 'bin/kiln-setup-workspace.mjs');
  await mkdir(dirname(script));
  await cp(new URL('./setup-plugin-workspace.mjs', import.meta.url), script);
  const result = spawnSync(
    process.execPath,
    [script, f.options.directory, '--check', '--data-dir', f.options.dataDirectory],
    { encoding: 'utf8', timeout: 10000, windowsHide: true },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).workspace.status).toBe('update-required');
  expect(f.calls).toHaveLength(1);
});

test('different candidate bytes cannot silently reuse a runtime with the same version', async () => {
  const f = await fixture();
  const archive = join(f.root, 'candidate.tgz');
  await writeFile(archive, 'first');
  await setupPluginWorkspace({ ...f.options, archive });
  await writeFile(archive, 'second');
  await expect(setupPluginWorkspace({ ...f.options, archive })).rejects.toThrow(
    'different archive',
  );
  expect(f.calls).toHaveLength(1);
});

test('changed dependency lock is reported without reinstalling or rewriting it', async () => {
  const f = await fixture();
  const { runtime } = await setupPluginWorkspace(f.options);
  const lock = join(dirname(dirname(dirname(runtime))), 'package-lock.json');
  await writeFile(lock, 'edited');
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('lockfile changed');
  expect(await readFile(lock, 'utf8')).toBe('edited');
  expect(f.calls).toHaveLength(1);
});

test('a path alias cannot place workspace data inside a plugin cache', async () => {
  const f = await fixture();
  const alias = join(f.root, 'cache alias');
  await symlink(f.options.pluginRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(
    setupPluginWorkspace({ ...f.options, directory: join(alias, 'assets') }),
  ).rejects.toThrow('separate');
  expect(f.calls).toHaveLength(0);
});

test('setup does not remove another process lock or begin a competing installation', async () => {
  const f = await fixture();
  const lock = join(f.options.dataDirectory, 'runtimes', `${f.pin.version}.lock`);
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, 'other setup');
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('locked');
  expect(await readFile(lock, 'utf8')).toBe('other setup');
  expect(f.calls).toHaveLength(0);
});

test('a redirected runtime store cannot install into the disposable cache', async () => {
  const f = await fixture();
  await mkdir(f.options.dataDirectory);
  await symlink(
    f.options.pluginRoot,
    join(f.options.dataDirectory, 'runtimes'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(setupPluginWorkspace(f.options)).rejects.toThrow('runtime store');
  expect(f.calls).toHaveLength(0);
});

test('setup validates CLI values and mutually exclusive maintenance modes', () => {
  expect(parseSetupArguments(['--help'])).toEqual({ help: true });
  expect(
    parseSetupArguments(['my assets', '--harness', 'codex', '--skills', 'compose,batch']),
  ).toEqual({ directory: 'my assets', harness: 'codex', skills: ['compose', 'batch'] });
  for (const args of [
    [],
    ['--check'],
    ['assets', '--unknown'],
    ['assets', '--harness'],
    ['assets', '--harness', '--check'],
    ['assets', '--check', '--upgrade'],
    ['assets', '--data-dir', 'one', '--data-dir', 'two'],
  ])
    expect(() => parseSetupArguments(args)).toThrow();
});

test('invalid mode or skill selection fails before installing an engine', async () => {
  const f = await fixture();
  for (const options of [
    { mode: 'replace' },
    { skills: ['unknown'] },
    { mode: 'upgrade', skills: ['compose'] },
  ])
    await expect(setupPluginWorkspace({ ...f.options, ...options })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
