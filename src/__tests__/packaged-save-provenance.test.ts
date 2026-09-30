import { afterAll, beforeAll, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const repo = resolve(import.meta.dir, '../..');
const base = join(repo, 'tmp');
let root: string;
const sha = (value: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

beforeAll(async () => {
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, 'packaged-save-'));
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  // As in persistent-local-cache.test.ts: fresh bundles, existing resolved dependencies,
  // no package installation or network access.
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@kiln/engine',
      version: pkg.version,
      dependencies: { ...pkg.dependencies, 'kiln-provenance-fixture': '1' },
      type: 'module',
    }),
  );
  await mkdir(join(root, 'node_modules/kiln-provenance-fixture'), { recursive: true });
  await writeFile(
    join(root, 'node_modules/kiln-provenance-fixture/package.json'),
    JSON.stringify({
      name: 'kiln-provenance-fixture',
      version: '1.0.0',
      peerDependencies: { 'kiln-provenance-omitted-peer': '^1' },
    }),
  );
  const code =
    "const meta={name:'ProvenanceBox'};function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
  const probe = `import {createPackagedLocalToolContext} from ${JSON.stringify(join(repo, 'src/local-runtime.ts'))};
import {createKilnProgramToolRegistry} from ${JSON.stringify(join(repo, 'src/tools/registry.ts'))};
import {FileAssetLibrary} from ${JSON.stringify(join(repo, 'src/assets-node.ts'))};
import {retainProgram} from ${JSON.stringify(join(repo, 'src/program-store.ts'))};
import {installedRuntimeIdentity} from ${JSON.stringify(join(repo, 'src/runtime-identity.ts'))};
import {readFile,writeFile,rename} from 'node:fs/promises';
const root=${JSON.stringify(root)}, policy=process.argv[2], scenario=process.argv[3]??'normal';
const manifest=root+'/dist/build.json', bytes=await readFile(manifest);
const expected=await installedRuntimeIdentity(root);
if(!expected.identity) throw new Error(JSON.stringify(expected));
if(scenario==='lazy') await rename(manifest,manifest+'.hidden');
if(scenario==='invalid') await writeFile(manifest,'{}');
const library=new FileAssetLibrary({project:root+'/collection-'+policy+'-'+scenario});
const context=await createPackagedLocalToolContext({assetLibrary:library,...(scenario==='disabled'?{cacheEvaluations:false}:{})},
  {KILN_BUILD_CACHE:policy,KILN_PROGRAM_STORE:root+'/programs',...(scenario==='in-process'?{KILN_EVALUATOR_MODE:'in-process'}:{})},root);
const initial={...context.localExecution};
let disposable;
if(scenario==='lazy') {
  await context.evaluatorPort.render(${JSON.stringify(code)});
  disposable={...context.localExecution};
  await rename(manifest+'.hidden',manifest);
}
const programRef=await retainProgram(context.programStore,${JSON.stringify(code)});
const save=createKilnProgramToolRegistry(context).find(t=>t.name==='kiln_save');
const saved=await save.run({programRef,name:'ProvenanceBox'});
const record=await library.read('project',saved.asset.assetId,saved.asset.revisionId);
let second;
if(scenario==='lazy') {
  await writeFile(manifest,'{}');
  second=await save.run({programRef,name:'ProvenanceBoxAgain'});
}
await writeFile(manifest,bytes);
console.log(JSON.stringify({expected:expected.identity,absent:expected.absentPackages,initial,disposable,execution:context.localExecution,
  engine:record.manifest.build.engine,second:second?.asset.build.engine,cacheEvaluations:context.cacheEvaluations}));`;
  await writeFile(join(root, 'probe.ts'), probe);
  for (const [entry, output] of [
    [join(root, 'probe.ts'), 'probe.mjs'],
    ['src/evaluator/worker.ts', 'evaluator-worker.mjs'],
  ]) {
    const built = await Bun.build({
      entrypoints: [resolve(repo, entry!)],
      target: 'node',
      packages: 'external',
      outdir: join(root, 'dist'),
      naming: output!,
    });
    expect(built.success).toBe(true);
  }
  await writeFile(
    join(root, 'dist/build.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        worker: {
          file: 'evaluator-worker.mjs',
          identity: sha('provenance-fixture'),
          bundleHash: sha(await readFile(join(root, 'dist/evaluator-worker.mjs'))),
        },
      },
    }),
  );
});

afterAll(async () => {
  if (root && resolve(root).startsWith(base + sep))
    await rm(root, { recursive: true, force: true });
});

function run(policy: string, scenario = 'normal', command = 'node') {
  const child = spawnSync(command, [join(root, 'dist/probe.mjs'), policy, scenario], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, KILN_RENDER: 'cpu', KILN_RENDER_SERVICE_PORT: '8011' },
  });
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout.trim());
}

for (const policy of ['off', 'memory']) {
  it(`records verified packaged save provenance with ${policy} reuse`, () => {
    const result = run(policy);
    expect(result.engine).toBe(result.expected);
    expect(result.execution.runtimeIdentity).toBe(result.expected);
    // The dist build identity a workspace manifest records, reported under its own name.
    expect(result.execution.buildIdentity).toBe(sha('provenance-fixture'));
    expect(result.absent).toContainEqual({
      path: 'dependencies/kiln-provenance-fixture/kiln-provenance-omitted-peer',
      kind: 'peer-absent',
    });
    expect(result.execution.cacheScope).toBe(policy === 'off' ? 'disabled' : 'process');
  });
  it(`defers the ${policy} scan until saving and retains one host snapshot`, () => {
    const result = run(policy, 'lazy');
    expect(result.initial.runtimeIdentity).toBeUndefined();
    expect(result.initial.cacheReason).toBeUndefined();
    expect(result.disposable.runtimeIdentity).toBeUndefined();
    expect(result.disposable.cacheReason).toBeUndefined();
    expect(result.engine).toBe(result.expected);
    expect(result.second).toBe(result.expected);
  });
  it(`keeps ${policy} identity failures visible without blocking a save`, () => {
    const result = run(policy, 'invalid');
    expect(result.engine).toBe('source-development:unverified');
    expect(result.execution.runtimeIdentity).toBeUndefined();
    expect(result.execution.buildIdentity).toBeUndefined();
    expect(result.execution.cacheReason).toContain('No valid packaged worker identity');
  });
}

it('records provenance when the host disables evaluation reuse', () => {
  const result = run('disk', 'disabled');
  expect(result.engine).toBe(result.expected);
  expect(result.execution.runtimeIdentity).toBe(result.expected);
  expect(result.execution.cacheScope).toBe('disabled');
  expect(result.cacheEvaluations).toBe(false);
});

it('does not claim the packaged worker for in-process execution', () => {
  const result = run('off', 'in-process');
  expect(result.engine).toBe('source-development:unverified');
  expect(result.execution.runtimeIdentity).toBeUndefined();
});

it('does not claim the Node packaged worker when run by Bun', () => {
  const result = run('memory', 'normal', process.execPath);
  expect(result.engine).toBe('source-development:unverified');
  expect(result.execution.runtimeIdentity).toBeUndefined();
});
