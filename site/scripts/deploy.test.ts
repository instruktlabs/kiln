import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploy, execute, parseArgs, preflight, resolveNpmCli, WRANGLER_VERSION } from './deploy.mjs';

const roots: string[] = [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const head = 'a1234567890abcdef1234567890abcdef12345678';
const otherHead = 'b1234567890abcdef1234567890abcdef12345678';
const quiet = () => {};
type Command = { file: string; args: string[]; options?: { cwd?: string; inherit?: boolean } };
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-deploy-')); roots.push(root);
  const site = join(root, 'site with spaces');
  const dist = join(site, 'dist'); await mkdir(join(dist, 'nested'), { recursive: true });
  const files = [{ path: 'index.html', text: '<p>Reviewed</p>' }, { path: 'nested/model.glb', text: 'model bytes' }];
  for (const file of files) await writeFile(join(dist, file.path), file.text);
  const manifest = files.map(({ path, text }) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) }));
  const info: any = { commit: head.slice(0, 7), treeClean: true, kilnSitePacks: '1', builtAt: '2026-10-03T00:00:00.000Z' };
  async function seal() {
    const bytes = `${JSON.stringify(manifest)}\n`;
    info.artifacts = { manifest: 'artifact-files.json', files: manifest.length, bytes: manifest.reduce((n, f) => n + f.bytes, 0), sha256: hash(bytes) };
    await writeFile(join(dist, 'artifact-files.json'), bytes);
    await writeFile(join(dist, 'build-info.json'), JSON.stringify(info));
  }
  await seal();
  const calls: Command[] = [];
  let status = '';
  let currentHead = head;
  let version = WRANGLER_VERSION;
  let onVersion: (() => Promise<void>) | undefined;
  const run = async (file: string, args: string[], options?: Command['options']) => {
    calls.push({ file, args, options });
    if (file === 'git') {
      if (args.includes('status')) return status;
      if (args.at(-1) === 'HEAD') return currentHead;
      if (args.at(-1) === `${info.commit}^{commit}`) return info.commit === otherHead.slice(0, 7) ? otherHead : head;
      throw new Error(`Unexpected git command: ${args}`);
    }
    if (args.at(-1) === '--version') { await onVersion?.(); return `${version}\n`; }
    if (args.includes('deploy')) return '';
    throw new Error(`Unexpected command: ${file} ${args}`);
  };
  return { root, site, dist, files, manifest, info, seal, calls, run, setStatus: (value: string) => { status = value; }, setHead: (value: string) => { currentHead = value; }, setVersion: (value: string) => { version = value; }, onVersion: (fn: () => Promise<void>) => { onVersion = fn; } };
}

describe('deployment preflight', () => {
  test.each(['functions-directory', 'functions-symlink', 'worker-file', 'worker-directory', 'asset-functions', 'worker-routes'])('rejects dynamic or ignored worker inputs for the static deployment: %s', async (kind) => {
    const f = await fixture();
    if (kind === 'functions-directory') { await mkdir(join(f.site, 'functions')); await writeFile(join(f.site, 'functions/index.js'), 'export function onRequest() {}'); }
    if (kind === 'functions-symlink') { const target = join(f.root, 'external-functions'); await mkdir(target); await symlink(target, join(f.site, 'functions'), 'junction'); }
    if (kind === 'worker-directory') await mkdir(join(f.dist, '_worker.js'));
    if (kind === 'asset-functions') await mkdir(join(f.dist, 'functions'));
    if (kind === 'worker-file' || kind === 'worker-routes') {
      const path = kind === 'worker-file' ? '_worker.js' : '_routes.json';
      const text = kind === 'worker-file' ? 'export default {};' : '{}';
      await writeFile(join(f.dist, path), text);
      f.manifest.push({ path, bytes: Buffer.byteLength(text), sha256: hash(text) });
      await f.seal();
    }
    await expect(deploy({ site: f.site, dryRun: true, run: f.run, log: quiet })).rejects.toThrow(/static.*deployment|deployment.*static/i);
    expect(f.calls.every(call => call.file === 'git')).toBe(true);
  });

  test('verifies the receipt, every artifact and full checkout identity without network on dry run', async () => {
    const f = await fixture();
    const result = await deploy({ site: f.site, dryRun: true, run: f.run, log: quiet });
    expect(result.deployed).toBe(false);
    expect(result.preflight.files).toBe(4); // Both excluded receipts still count towards Pages limits.
    expect(result.preflight.head).toBe(head);
    expect(f.calls.every(call => call.file === 'git')).toBe(true);
    expect(f.calls.some(call => call.args.includes('--untracked-files=all'))).toBe(true);
  });

  test.each(['tampered', 'missing', 'extra'])('rejects %s output', async (kind) => {
    const f = await fixture();
    if (kind === 'tampered') await writeFile(join(f.dist, 'nested/model.glb'), 'wrong bytes');
    if (kind === 'missing') await rm(join(f.dist, 'nested/model.glb'));
    if (kind === 'extra') await writeFile(join(f.dist, 'unexpected.txt'), 'extra');
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/mismatch|missing|unexpected/i);
  });

  test('rejects an altered manifest even if every listed member would verify', async () => {
    const f = await fixture();
    await writeFile(join(f.dist, 'artifact-files.json'), `${JSON.stringify(f.manifest)} `);
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/manifest.*digest/i);
  });

  test.each(['../escape', '/escape', 'C:/escape', 'nested\\escape', 'nested//escape', './index.html', 'build-info.json', 'artifact-files.json'])('rejects unsafe or excluded manifest path %s', async (path) => {
    const f = await fixture(); f.manifest[0].path = path; await f.seal();
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/manifest.*path/i);
  });

  test.each(['file', 'directory', 'receipt', 'root'])('rejects a symlink at the %s boundary', async (kind) => {
    const f = await fixture();
    const target = kind === 'file' ? join(f.dist, 'nested/model.glb') : kind === 'directory' ? join(f.dist, 'nested') : kind === 'receipt' ? join(f.dist, 'build-info.json') : f.dist;
    const replacement = join(f.root, 'linked-target');
    if (kind === 'directory' || kind === 'root') await mkdir(replacement);
    else await writeFile(replacement, await readFile(target));
    await rm(target, { recursive: true });
    await symlink(replacement, target, kind === 'directory' || kind === 'root' ? 'junction' : 'file');
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/symlink/i);
  });

  test.each(['duplicate', 'count', 'bytes', 'negative', 'digest', 'missing-index', 'manifest-name'])('rejects malformed receipt or manifest: %s', async (kind) => {
    const f = await fixture();
    if (kind === 'duplicate') f.manifest.push({ ...f.manifest[0] });
    if (kind === 'negative') f.manifest[0].bytes = -1;
    if (kind === 'digest') f.manifest[0].sha256 = 'bad';
    if (kind === 'missing-index') { f.manifest.shift(); await rm(join(f.dist, 'index.html')); }
    await f.seal();
    if (kind === 'count') f.info.artifacts.files++;
    if (kind === 'bytes') f.info.artifacts.bytes++;
    if (kind === 'manifest-name') f.info.artifacts.manifest = '../other.json';
    await writeFile(join(f.dist, 'build-info.json'), JSON.stringify(f.info));
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow();
  });

  test.each(['dirty-checkout', 'dirty-build', 'wrong-commit', 'packs-off'])('rejects %s', async (kind) => {
    const f = await fixture();
    if (kind === 'dirty-checkout') f.setStatus('?? engine-untracked.ts\n');
    if (kind === 'dirty-build') f.info.treeClean = false;
    if (kind === 'wrong-commit') f.info.commit = otherHead.slice(0, 7);
    if (kind === 'packs-off') f.info.kilnSitePacks = '0';
    await f.seal();
    await expect(deploy({ site: f.site, dryRun: true, run: f.run, log: quiet })).rejects.toThrow();
    expect(f.calls.every(call => call.file === 'git')).toBe(true);
  });

  test('counts the two receipts in the 20,000-file limit', async () => {
    const f = await fixture();
    while (f.manifest.length < 19999) f.manifest.push({ path: `file-${f.manifest.length}`, bytes: 0, sha256: hash('') });
    await f.seal();
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/20,000/);
  });

  test('rejects files larger than 25 MiB before reading their contents', async () => {
    const f = await fixture(); await truncate(join(f.dist, 'nested/model.glb'), 25 * 1024 * 1024 + 1);
    await expect(preflight({ site: f.site, run: f.run })).rejects.toThrow(/25 MiB/);
  });
});

describe('deployment command', () => {
  test('streams upload output without a shell or interactive input', () => {
    let received: any;
    execute('node', ['npm-cli.js', 'exec'], { cwd: '/fixture/site', inherit: true }, (file: any, args: any, options: any) => { received = { file, args, options }; return ''; });
    expect(received.options.stdio).toEqual(['ignore', 'inherit', 'inherit']);
    expect(received.options.shell).toBe(false);
  });

  test('Node CLI dry run refuses ignored Functions and untracked files outside site in a real Git tree', async () => {
    const f = await fixture();
    const git = (...args: string[]) => execFileSync('git', ['-C', f.root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init');
    await writeFile(join(f.root, '.gitignore'), 'site with spaces/dist/\n');
    git('add', '.gitignore');
    git('-c', 'user.name=Deployment Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(f.root, 'no-hooks')}`, 'commit', '-m', 'Fixture');
    f.info.commit = git('rev-parse', '--short', 'HEAD'); await f.seal();
    const args = [fileURLToPath(new URL('./deploy.mjs', import.meta.url)), '--site', f.site, '--dry-run'];
    const clean = spawnSync('node', args, { encoding: 'utf8' });
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('Dry run: no upload');
    await writeFile(join(f.root, '.git/info/exclude'), 'site with spaces/functions/\n');
    await mkdir(join(f.site, 'functions')); await writeFile(join(f.site, 'functions/index.js'), 'export function onRequest() {}');
    expect(git('status', '--porcelain', '--untracked-files=all')).toBe('');
    const outsideArtifacts = spawnSync('node', args, { encoding: 'utf8' });
    expect(outsideArtifacts.status).toBe(1);
    expect(outsideArtifacts.stderr).toContain('Static deployment refuses site/functions');
    await rm(join(f.site, 'functions'), { recursive: true });
    await writeFile(join(f.root, 'engine-new.ts'), '// Untracked engine source');
    const dirty = spawnSync('node', args, { encoding: 'utf8' });
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain('uncommitted or untracked');
  });

  test('pins Wrangler through Node/npm arguments and sends exact HEAD to Pages', async () => {
    const f = await fixture(); const npmCli = join(f.root, 'npm cli.js');
    await deploy({ site: f.site, npmCli, run: f.run, log: quiet });
    const commands = f.calls.filter(call => call.file !== 'git');
    expect(commands).toHaveLength(2);
    expect(commands[0].file).toBe(process.execPath);
    expect(commands[0].args).toEqual([npmCli, 'exec', '--yes', `--package=wrangler@${WRANGLER_VERSION}`, '--', 'wrangler', '--version']);
    expect(commands[1].args).toEqual([npmCli, 'exec', '--yes', `--package=wrangler@${WRANGLER_VERSION}`, '--', 'wrangler', 'pages', 'deploy', f.dist, '--project-name', 'kilnstudio', '--branch', 'production', '--commit-hash', head, '--commit-dirty=false']);
    expect(commands[1].options?.inherit).toBe(true);
    expect(f.calls.at(-2)?.file).toBe('git');
  });

  test.each(['tamper', 'reseal', 'dirty', 'head', 'functions'])('rechecks immediately after Wrangler preparation: %s', async (kind) => {
    const f = await fixture();
    f.onVersion(async () => {
      if (kind === 'tamper') await writeFile(join(f.dist, 'index.html'), 'changed');
      if (kind === 'reseal') { f.info.builtAt = 'changed'; await f.seal(); }
      if (kind === 'dirty') f.setStatus(' M src/change.ts\n');
      if (kind === 'head') f.setHead(otherHead);
      if (kind === 'functions') await mkdir(join(f.site, 'functions'));
    });
    await expect(deploy({ site: f.site, npmCli: '/test/npm-cli.js', run: f.run, log: quiet })).rejects.toThrow();
    expect(f.calls.some(call => call.args.includes('deploy'))).toBe(false);
  });

  test('an explicit Wrangler executable must match the exact pin', async () => {
    const f = await fixture(); f.setVersion('4.146.0');
    await expect(deploy({ site: f.site, wrangler: '/test/wrangler', run: f.run, log: quiet })).rejects.toThrow(/4\.147\.0/);
    expect(f.calls.some(call => call.args.includes('deploy'))).toBe(false);
  });

  test('propagates an upload failure instead of reporting a deployment', async () => {
    const f = await fixture();
    const run = async (file: string, args: string[], options?: Command['options']) => {
      if (args.includes('deploy')) throw new Error('Upload failed');
      return f.run(file, args, options);
    };
    await expect(deploy({ site: f.site, npmCli: '/test/npm-cli.js', run, log: quiet })).rejects.toThrow('Upload failed');
  });

  test('uses npm CLI JavaScript on Windows without a command shell', async () => {
    const f = await fixture(); const nodeDir = join(f.root, 'node');
    const cli = join(nodeDir, 'node_modules/npm/bin/npm-cli.js');
    await mkdir(join(nodeDir, 'node_modules/npm/bin'), { recursive: true }); await writeFile(cli, '// fixture');
    expect(await resolveNpmCli({ execPath: join(nodeDir, 'node.exe'), env: {}, platform: 'win32' })).toBe(cli);
  });

  test('accepts portable flags and refuses the old production bypass or unknown options', () => {
    expect(parseArgs(['--site', '/test/site', '--project-name', 'kilnstudio', '--dry-run'])).toEqual({ site: '/test/site', projectName: 'kilnstudio', dryRun: true });
    expect(() => parseArgs(['--allow-packs-off'])).toThrow(/packs/i);
    expect(() => parseArgs(['--site'])).toThrow(/value/i);
    expect(() => parseArgs(['--unsafe'])).toThrow(/unknown/i);
  });
});
