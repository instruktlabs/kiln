import { expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

it('reuses a packaged Node build across fresh CLI host instances and invalidates changed source', async () => {
  const repo = resolve(import.meta.dir, '../..');
  await mkdir(join(repo, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(repo, 'tmp/persistent-cache-'));
  const sha = (value: string | Uint8Array) =>
    `sha256:${createHash('sha256').update(value).digest('hex')}`;
  try {
    const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: '@kiln/engine',
        version: pkg.version,
        dependencies: pkg.dependencies,
        type: 'module',
      }),
    );
    await mkdir(join(root, 'dist'));
    const code =
      "const meta={name:'CachedBox'};function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
    const probe = `import {createPackagedLocalToolContext} from ${JSON.stringify(join(repo, 'src/local-runtime.ts'))};
import {createKilnProgramToolRegistry} from ${JSON.stringify(join(repo, 'src/tools/registry.ts'))};
const context=await createPackagedLocalToolContext({}, {KILN_WORKSPACE:${JSON.stringify(root)},KILN_PROGRAM_STORE:${JSON.stringify(join(root, 'programs'))},KILN_GLTF_EXPORTER:process.env.KILN_GLTF_EXPORTER}, ${JSON.stringify(root)});
if(context.localExecution.cacheScope!=='disk') throw new Error(JSON.stringify(context.localExecution));
const tool=createKilnProgramToolRegistry(context).find(t=>t.name==='kiln_render');
const result=await tool.run({code:process.argv[2]==='changed'?${JSON.stringify(code.replace('boxGeo(1,1,1)', 'boxGeo(1,2,1)'))}:${JSON.stringify(code)},capture:{preset:'1x1'}});
await context.liveReview?.flush?.();
if(!result.ok) throw new Error(JSON.stringify(result));
console.log(JSON.stringify({cache:result.buildCache,hash:result.viewFidelity?.inputGlbSha256,scope:context.localExecution.cacheScope}));`;
    await writeFile(join(root, 'probe.ts'), probe);
    for (const [input, output] of [
      [join(root, 'probe.ts'), 'probe.mjs'],
      ['src/evaluator/worker.ts', 'evaluator-worker.mjs'],
      ['src/cli.ts', 'cli.mjs'],
    ]) {
      const built = spawnSync(
        process.execPath,
        [
          'build',
          input!,
          '--target=node',
          '--packages=external',
          `--outfile=${join(root, 'dist', output!)}`,
        ],
        { cwd: repo, encoding: 'utf8', windowsHide: true },
      );
      expect(built.status, built.stderr).toBe(0);
    }
    await writeFile(
      join(root, 'dist', 'build.json'),
      JSON.stringify({
        schemaVersion: 1,
        entries: {
          worker: {
            file: 'evaluator-worker.mjs',
            identity: sha('fixture'),
            bundleHash: sha(await readFile(join(root, 'dist/evaluator-worker.mjs'))),
          },
        },
      }),
    );
    const run = (arg = '') => {
      const child = spawnSync('node', [join(root, 'dist/probe.mjs'), arg], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
      });
      expect(child.status, child.stderr).toBe(0);
      return JSON.parse(child.stdout.trim());
    };
    const first = run();
    const second = run();
    const changed = run('changed');
    expect(first.cache.hit).toBe(false);
    expect(second.cache.hit).toBe(true);
    expect(first.hash).toMatch(/^sha256:/);
    expect(second.hash).toBe(first.hash);
    expect(changed.cache.hit).toBe(false);
    expect(changed.hash).not.toBe(first.hash);
    await writeFile(join(root, 'asset.kiln.js'), code);
    const cli = spawnSync(
      'node',
      [
        join(root, 'dist/cli.mjs'),
        'render',
        'asset.kiln.js',
        '--render',
        'cpu',
        '--out',
        'export.glb',
        '--views',
        'export.png',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
        env: {
          ...process.env,
          KILN_WORKSPACE: root,
          KILN_PROGRAM_STORE: join(root, 'programs'),
        },
      },
    );
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toContain('build reused');
    expect(sha(await readFile(join(root, 'export.glb')))).toBe(first.hash);
    expect((await readFile(join(root, 'export.png'))).subarray(1, 4).toString()).toBe('PNG');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 90000);
