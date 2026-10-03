/** Upload a reviewed, sealed site build after release authorization. No build, login, R2 upload or DNS changes. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRANGLER_VERSION = '4.147.0';
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPTS = new Set(['build-info.json', 'artifact-files.json']);
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function execute(file, args, { cwd, inherit = false } = {}, exec = execFileSync) {
  return exec(file, args, {
    cwd, shell: false, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
  }) ?? '';
}

function manifestPath(value) {
  return typeof value === 'string' && !/[\\:\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..') && !RECEIPTS.has(value);
}

/** Inspect all entries, including the two receipts: symlinks and special files never reach Wrangler. */
async function outputFiles(dist) {
  const files = new Map();
  async function walk(path, name) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink in deployment output: ${name || 'dist'}`);
    if (stat.isDirectory()) {
      for (const child of await readdir(path)) await walk(join(path, child), name ? `${name}/${child}` : child);
    } else if (stat.isFile() && name) {
      if (stat.size > MAX_FILE_BYTES) throw new Error(`${name} exceeds the Pages 25 MiB file limit.`);
      files.set(name, { path, bytes: stat.size });
      if (files.size > MAX_FILES) throw new Error('Deployment exceeds the Pages 20,000-file limit.');
    } else throw new Error(`Unsupported deployment entry: ${name || 'dist'}`);
  }
  await walk(dist, '');
  return files;
}

async function outputBytes(files, name) {
  const file = files.get(name);
  if (!file) throw new Error(`Missing deployment file: ${name}`);
  const stat = await lstat(file.path);
  if (stat.isSymbolicLink()) throw new Error(`Symlink in deployment output: ${name}`);
  if (!stat.isFile() || stat.size !== file.bytes) throw new Error(`Deployment file changed during preflight: ${name}`);
  return readFile(file.path);
}

async function assertStaticDeployment(site, dist) {
  // Pages otherwise compiles cwd/functions outside the artifact manifest, or
  // bundles _worker.js (including its imports) after our byte verification.
  for (const [directory, name] of [[site, 'functions'], [dist, 'functions'], [dist, '_worker.js'], [dist, '_routes.json']]) {
    try {
      await lstat(join(directory, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Static deployment refuses ${directory === site ? 'site' : 'dist'}/${name}. Worker/Functions inputs require a separately reviewed deployment workflow.`);
  }
}

/** Verify the existing build-info/artifact-files format without changing the output or contacting Cloudflare. */
export async function preflight({ site = SITE, run = execute } = {}) {
  site = resolve(site);
  const dist = join(site, 'dist');
  await assertStaticDeployment(site, dist);
  const files = await outputFiles(dist);
  if (!files.has('index.html')) throw new Error('Missing dist/index.html. Build and review the production site first.');
  const infoBytes = await outputBytes(files, 'build-info.json');
  const info = JSON.parse(infoBytes.toString('utf8'));
  if (info.treeClean !== true) throw new Error('The build was not made from a clean tree. Rebuild and review a clean commit.');
  if (info.kilnSitePacks !== '1') throw new Error('Production deployment requires KILN_SITE_PACKS=1; reduced builds cannot be deployed by this script.');
  if (typeof info.commit !== 'string' || !/^[0-9a-f]{7,64}$/.test(info.commit)) throw new Error('The build has no valid Git commit identity.');
  const artifacts = info.artifacts;
  if (!artifacts || artifacts.manifest !== 'artifact-files.json' || !isDigest(artifacts.sha256) ||
      !isCount(artifacts.files) || !isCount(artifacts.bytes)) throw new Error('Invalid artifact manifest receipt in build-info.json.');
  const manifestBytes = await outputBytes(files, artifacts.manifest);
  if (digest(manifestBytes) !== artifacts.sha256) throw new Error('Artifact manifest digest mismatch. Rebuild and review before deploying.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!Array.isArray(manifest)) throw new Error('Artifact manifest must be a file list.');
  if (manifest.length + RECEIPTS.size > MAX_FILES) throw new Error('Deployment exceeds the Pages 20,000-file limit including receipts.');
  const expected = new Set();
  let artifactBytes = 0;
  for (const file of manifest) {
    if (!file || !manifestPath(file.path)) throw new Error('Invalid artifact manifest path; paths must be relative and cannot name the excluded receipts.');
    if (expected.has(file.path)) throw new Error(`Duplicate artifact manifest path: ${file.path}`);
    if (!isCount(file.bytes) || !isDigest(file.sha256)) throw new Error(`Invalid artifact manifest size or digest: ${file.path}`);
    if (file.bytes > MAX_FILE_BYTES) throw new Error(`${file.path} exceeds the Pages 25 MiB file limit.`);
    expected.add(file.path);
    artifactBytes += file.bytes;
  }
  if (!Number.isSafeInteger(artifactBytes) || manifest.length !== artifacts.files || artifactBytes !== artifacts.bytes)
    throw new Error('Artifact manifest count or byte total mismatch.');
  for (const name of files.keys()) if (!RECEIPTS.has(name) && !expected.has(name)) throw new Error(`Unexpected deployment file absent from the manifest: ${name}`);
  for (const file of manifest) {
    const bytes = await outputBytes(files, file.path);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Artifact size or hash mismatch: ${file.path}`);
  }

  // No pathspec: source changes anywhere in the checkout invalidate the reviewed build.
  const git = async (...args) => String(await run('git', ['-C', site, ...args], { cwd: site })).trim();
  const head = await git('rev-parse', '--verify', 'HEAD');
  if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error('Cannot resolve the checkout HEAD.');
  const builtCommit = await git('rev-parse', '--verify', `${info.commit}^{commit}`);
  if (builtCommit !== head) throw new Error(`Build commit ${info.commit} differs from checkout HEAD ${head}. Rebuild and review this commit.`);
  if (await git('status', '--porcelain', '--untracked-files=all')) throw new Error('The checkout has uncommitted or untracked changes. Commit, rebuild and review before deployment.');
  return {
    site, dist, head, info, files: files.size, bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0),
    buildInfoSha256: digest(infoBytes), artifactManifestSha256: artifacts.sha256,
  };
}

/** Node executes npm's JavaScript directly, including on Windows; no .cmd shell or command interpolation. */
export async function resolveNpmCli({ execPath = process.execPath, env = process.env, platform = process.platform } = {}) {
  const nodePaths = [execPath];
  try { nodePaths.push(await realpath(execPath)); } catch { /* The executable-directory candidates remain useful. */ }
  const directories = [...nodePaths.map(dirname), ...(env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)];
  const candidates = [env.npm_execpath, ...directories.flatMap(directory => [join(directory, 'node_modules/npm/bin/npm-cli.js'), join(directory, 'npm')])];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const path = await realpath(candidate);
      if (basename(path) === 'npm-cli.js' && (await lstat(path)).isFile()) return path;
    } catch { /* Try the next standard npm location. */ }
  }
  throw new Error('Cannot find npm-cli.js. Install the maintained Node/npm toolchain, or supply --wrangler with the exact pinned executable.');
}

/** Run the full preflight even in dry-run mode. Only an authorized non-dry run can prepare Wrangler and upload. */
export async function deploy({ site = SITE, projectName = 'kilnstudio', wrangler, dryRun = false, npmCli, run = execute, log = console.log } = {}) {
  if (typeof projectName !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(projectName)) throw new Error('Invalid Pages project name.');
  if (wrangler && /\.(?:cmd|bat)$/i.test(wrangler)) throw new Error('Use the default pinned npm invocation instead of a Wrangler .cmd/.bat shell wrapper.');
  const initial = await preflight({ site, run });
  const argumentsFor = (checked) => ['pages', 'deploy', checked.dist, '--project-name', projectName, '--branch', 'production', '--commit-hash', checked.head, '--commit-dirty=false'];
  log(`Verified ${initial.files} files (${initial.bytes} bytes), commit ${initial.head}, packs=1; ${projectName}/production.`);
  if (dryRun) {
    log(`Dry run: no upload, package preparation or login. Wrangler ${WRANGLER_VERSION} is required for deployment.`);
    return { deployed: false, preflight: initial };
  }
  const command = wrangler
    ? { file: wrangler, prefix: [] }
    : { file: process.execPath, prefix: [npmCli ?? await resolveNpmCli(), 'exec', '--yes', `--package=wrangler@${WRANGLER_VERSION}`, '--', 'wrangler'] };
  const versionText = String(await run(command.file, [...command.prefix, '--version'], { cwd: initial.site }));
  const version = versionText.match(/^\s*(?:wrangler\s+)?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s*$/m)?.[1];
  if (version !== WRANGLER_VERSION) throw new Error(`Deployment requires Wrangler ${WRANGLER_VERSION}; the executable did not report that exact version.`);
  // npm preparation can take time. Recheck all bytes and Git state afterwards, immediately before upload.
  const checked = await preflight({ site: initial.site, run });
  if (checked.head !== initial.head || checked.buildInfoSha256 !== initial.buildInfoSha256 || checked.artifactManifestSha256 !== initial.artifactManifestSha256)
    throw new Error('Deployment receipts or HEAD changed while preparing Wrangler. Review the build again.');
  await run(command.file, [...command.prefix, ...argumentsFor(checked)], { cwd: checked.site, inherit: true });
  return { deployed: true, preflight: checked };
}

export function parseArgs(args) {
  const options = {};
  const values = { '--site': 'site', '--project-name': 'projectName', '--wrangler': 'wrangler' };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--allow-packs-off') throw new Error('The packs-off bypass is retired. Production requires KILN_SITE_PACKS=1.');
    else if (Object.hasOwn(values, arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[values[arg]] = value;
    } else throw new Error(`Unknown deployment option: ${arg}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log('Usage: node site/scripts/deploy.mjs [--site DIR] [--project-name NAME] [--wrangler EXECUTABLE] [--dry-run]\nRun only after release authorization. Dry run performs offline checks; deployment uses Wrangler 4.147.0.');
    else await deploy(options);
  } catch (error) {
    console.error(`Deployment refused: ${error.message}`);
    process.exitCode = 1;
  }
}
