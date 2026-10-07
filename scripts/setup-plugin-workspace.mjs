#!/usr/bin/env node
// Copied into the local plugin: keep this entry independent of the engine checkout.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageName = '@instruktlabs/kiln';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:rc|dev)\.(0|[1-9]\d*))?$/;

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

// Canonicalize future paths too, including Windows junctions and macOS /var aliases.
async function canonical(path) {
  const target = resolve(path);
  let ancestor = target;
  while (true) {
    try {
      return resolve(await realpath(ancestor), relative(ancestor, target));
    } catch (error) {
      if (error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
}

function defaultDataDirectory() {
  if (process.platform === 'win32')
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'InstruktLabs/Kiln');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'instruktlabs/kiln');
}

async function npmCli(explicit) {
  const executable = await realpath(process.execPath);
  const candidates = explicit
    ? [explicit]
    : [
        process.env.npm_execpath,
        join(dirname(executable), 'node_modules/npm/bin/npm-cli.js'),
        resolve(dirname(executable), '../lib/node_modules/npm/bin/npm-cli.js'),
      ];
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.endsWith('npm-cli.js')) continue;
    try {
      if ((await stat(candidate)).isFile()) return await realpath(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(
    'Cannot locate npm. Install Node with npm, or pass --npm-cli /absolute/path/to/npm-cli.js.',
  );
}

function installWithNpm(npm, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [npm, ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-6000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 300000);
    child.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut)
        fail(
          new Error('npm installation exceeded five minutes. Retry after checking network access.'),
        );
      else if (code !== 0) fail(new Error(`npm installation failed (${code}):\n${stderr}`));
      else done();
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function verifyPackage(root, pin) {
  const runtime = join(root, 'node_modules/@instruktlabs/kiln');
  const pkg = await readJson(join(runtime, 'package.json'));
  if (pkg.name !== pin.name || pkg.version !== pin.version)
    throw new Error(`Installed package identity does not match ${pin.name}@${pin.version}.`);
  if (!inside(root, await realpath(runtime)))
    throw new Error('Installed runtime escapes its version directory.');
  if (!(await stat(join(runtime, 'scripts/create-workspace.mjs'))).isFile())
    throw new Error('Installed runtime has no workspace setup entry.');
  return runtime;
}

async function verifyRuntime(root, pin, archiveHash) {
  try {
    const marker = await readJson(join(root, 'kiln-runtime.json'));
    if (marker.schemaVersion !== 1 || marker.name !== pin.name || marker.version !== pin.version)
      throw new Error('Runtime marker identity mismatch.');
    if (marker.lockSha256 !== hash(await readFile(join(root, 'package-lock.json'))))
      throw new Error('Runtime lockfile changed.');
    if (archiveHash && marker.archiveSha256 !== archiveHash)
      throw new Error(
        'Runtime was installed from a different archive. Use a separate --data-dir for this candidate.',
      );
    return await verifyPackage(root, pin);
  } catch (error) {
    throw new Error(
      `Cannot reuse runtime at ${root}: ${error.message}. Existing files were left unchanged.`,
      { cause: error },
    );
  }
}

async function removeStage(stage, runtimes) {
  const resolvedStage = await realpath(stage);
  const resolvedRuntimes = await realpath(runtimes);
  if (!inside(resolvedRuntimes, resolvedStage) || dirname(resolvedStage) !== resolvedRuntimes)
    throw new Error('Refusing to remove a staging directory outside the runtime store.');
  await rm(resolvedStage, { recursive: true, force: true });
}

async function installRuntime(data, pin, archive, archiveHash, options) {
  const runtimes = join(data, 'runtimes');
  if (relative(runtimes, await canonical(runtimes)) !== '')
    throw new Error(
      'The runtime store must remain inside its persistent data directory, without a redirected runtimes path.',
    );
  const target = join(runtimes, pin.version);
  if (await exists(target)) return verifyRuntime(target, pin, archiveHash);
  if (options.mode === 'check')
    throw new Error(`Pinned runtime ${pin.version} is not installed; check makes no changes.`);
  const npm = options.run ? options.npmPath : await npmCli(options.npmPath);
  await mkdir(runtimes, { recursive: true });
  // Serialize competing setup processes without treating a crashed lock as safe to delete.
  const lockPath = join(runtimes, `${pin.version}.lock`);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      `Runtime setup is locked at ${lockPath}. Wait for the other setup, or verify it has stopped before removing its lock.`,
    );
  }
  let stage;
  try {
    if (await exists(target)) return await verifyRuntime(target, pin, archiveHash);
    stage = await mkdtemp(join(runtimes, `${pin.version}.staging-`));
    await writeFile(
      join(stage, 'package.json'),
      JSON.stringify({ name: 'kiln-plugin-runtime', version: '0.0.0', private: true }),
    );
    const args = [
      'install',
      archive || `${pin.name}@${pin.version}`,
      '--save-exact',
      '--ignore-scripts',
      '--omit=dev',
      '--include=optional',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org',
    ];
    if (options.run) await options.run(args, stage);
    else await installWithNpm(npm, args, stage);
    await verifyPackage(stage, pin);
    await writeFile(
      join(stage, 'kiln-runtime.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ...pin,
          lockSha256: hash(await readFile(join(stage, 'package-lock.json'))),
          archiveSha256: archiveHash || null,
        },
        null,
        2,
      )}\n`,
    );
    if (await exists(target))
      throw new Error('The runtime destination appeared during setup; no files were replaced.');
    await rename(stage, target);
    stage = undefined;
    return await verifyRuntime(target, pin, archiveHash);
  } finally {
    try {
      if (stage) await removeStage(stage, runtimes);
    } finally {
      await lock.close();
      await rm(lockPath);
    }
  }
}

export async function setupPluginWorkspace(options = {}) {
  const harness = options.harness || 'claude';
  if (!['claude', 'codex'].includes(harness)) throw new Error('Choose harness claude or codex.');
  const mode = options.mode || 'create';
  if (!['create', 'check', 'upgrade', 'repair', 'recover'].includes(mode))
    throw new Error('Unknown workspace setup mode.');
  if (mode === 'recover' && (options.adopt || options.skills))
    throw new Error('Use --recover alone before retrying setup.');
  if (!options.directory) throw new Error('Provide a workspace directory.');
  if (
    options.skills &&
    ((mode !== 'create' && !(mode === 'check' && options.adopt)) ||
      !Array.isArray(options.skills) ||
      options.skills.some((name) => !['compose', 'batch'].includes(name)))
  )
    throw new Error('Optional skills compose,batch apply only to workspace creation.');
  const plugin = await canonical(
    options.pluginRoot || resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const pin = await readJson(join(plugin, 'runtime.json'));
  if (pin.name !== packageName) throw new Error(`The plugin must pin package ${packageName}.`);
  if (typeof pin.version !== 'string' || !exactVersion.test(pin.version))
    throw new Error('The plugin runtime needs an exact stable, rc.N or dev.N version.');
  const directory = await canonical(options.directory);
  const data = await canonical(options.dataDirectory || defaultDataDirectory());
  for (const [a, b] of [
    [plugin, directory],
    [plugin, data],
    [directory, data],
  ])
    if (inside(a, b) || inside(b, a))
      throw new Error('Keep workspace, runtime data and plugin cache in separate directories.');
  if (mode === 'create' && !options.adopt && (await exists(directory))) {
    if (!(await lstat(directory)).isDirectory() || (await readdir(directory)).length)
      throw new Error(
        'The workspace destination must be an empty directory; no existing files were changed.',
      );
  }
  const archive = options.archive ? await realpath(resolve(options.archive)) : undefined;
  const archiveHash = archive ? hash(await readFile(archive)) : undefined;
  const runtime = await installRuntime(
    data,
    { name: pin.name, version: pin.version },
    archive,
    archiveHash,
    { ...options, mode: mode === 'recover' ? 'check' : mode },
  );
  const { createWorkspace, workspaceSetupCapabilities } = await import(
    pathToFileURL(join(runtime, 'scripts/create-workspace.mjs')).href
  );
  if (options.adopt && workspaceSetupCapabilities?.projectAdoption !== 1)
    throw new Error(
      'The pinned engine does not support project adoption. Use a plugin release that pins a supporting engine; no project files were changed.',
    );
  if (mode === 'recover' && workspaceSetupCapabilities?.recovery !== 1)
    throw new Error(
      'The pinned engine does not support project recovery. No project files were changed.',
    );
  const workspace = await createWorkspace(directory, harness, {
    installation: runtime,
    ...(options.adopt ? { adopt: true } : {}),
    ...(mode === 'create' ? {} : { [mode]: true }),
    ...(options.skills ? { skills: options.skills } : {}),
  });
  return { runtime, workspace };
}

export function parseSetupArguments(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const values = [...args];
  const directory = values.shift();
  if (!directory || directory.startsWith('--'))
    throw new Error('Provide a workspace directory. Run with --help for usage.');
  const result = { directory };
  const valueFlags = {
    '--harness': 'harness',
    '--data-dir': 'dataDirectory',
    '--archive': 'archive',
    '--npm-cli': 'npmPath',
    '--skills': 'skills',
  };
  while (values.length) {
    const flag = values.shift();
    if (['--check', '--upgrade', '--repair', '--recover'].includes(flag)) {
      if (result.mode)
        throw new Error('Choose only one of --check, --upgrade, --repair or --recover.');
      result.mode = flag.slice(2);
    } else if (flag === '--adopt') {
      if (result.adopt) throw new Error('Repeated option --adopt.');
      result.adopt = true;
    } else if (Object.hasOwn(valueFlags, flag)) {
      const value = values.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      if (Object.hasOwn(result, valueFlags[flag])) throw new Error(`Repeated option ${flag}.`);
      result[valueFlags[flag]] = flag === '--skills' ? value.split(',') : value;
    } else throw new Error(`Unknown option ${flag}.`);
  }
  if (result.mode === 'recover' && (result.adopt || result.skills))
    throw new Error('Use --recover alone before retrying setup.');
  return result;
}

if (
  process.argv[1] &&
  (await canonical(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)))
) {
  try {
    const options = parseSetupArguments(process.argv.slice(2));
    if (options.help)
      console.log(
        'Usage: node bin/kiln-setup-workspace.mjs <directory> [--harness claude|codex] [--skills compose,batch]\n       node bin/kiln-setup-workspace.mjs <project-or-new-workspace> --adopt [--check]\n       node bin/kiln-setup-workspace.mjs <managed-workspace> --check|--upgrade|--repair|--recover\nOptions: --data-dir <persistent-directory>, --archive <qualification.tgz>, --npm-cli <npm-cli.js>',
      );
    else {
      const result = await setupPluginWorkspace(options);
      console.log(JSON.stringify(result, null, 2));
      if (options.mode === 'check' && result.workspace.status !== 'current') process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
