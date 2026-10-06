#!/usr/bin/env node
// Manual installed-package qualification. npm installation is the only external acquisition.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeBuildIdentity } from './build-runtime.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'kiln-project-foundation-'));
const receipt = {
  schemaVersion: 1,
  root,
  node: process.version,
  platform: process.platform,
  checks: [],
  commands: [],
  rendererEnvironment: {
    localCredentialPresent: Boolean(process.env.RENDER_SERVICE_TOKEN),
    remoteCredentialPresent: Boolean(process.env.KILN_RENDER_TOKEN),
    explicitRoutePresent: Boolean(process.env.KILN_RENDER_PORT_URL),
    explicitPortPresent: Boolean(process.env.KILN_RENDER_SERVICE_PORT),
  },
  performance:
    'Functional qualification only; this script does not control or qualify ambient machine load and establishes no timing baseline or performance acceptance.',
  status: 'running',
};
const hash = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^(ANTHROPIC|OPENAI|OPENROUTER|AWS|GOOGLE|GEMINI|AZURE|BEDROCK|KILN_|NODE_OPTIONS|BUN_OPTIONS)/i.test(
        key,
      ),
  ),
);
// Keep a host's explicitly configured renderer credential in-process only; never record its value.
for (const key of [
  'KILN_RENDER_TOKEN',
  'KILN_RENDER_PORT_URL',
  'KILN_RENDER_SERVICE_PORT',
  'RENDER_SERVICE_TOKEN',
])
  if (process.env[key]) env[key] = process.env[key];
const children = new Set();
function launch(binary, args, cwd, extra = {}) {
  const child = spawn(binary, args, {
    cwd,
    windowsHide: true,
    env: { ...env, ...extra },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
async function command(args, cwd = root, extra = {}, binary = process.execPath) {
  const startedAt = new Date().toISOString();
  const index = receipt.commands.length;
  const observation = { index, binary, args, cwd, startedAt };
  receipt.commands.push(observation);
  const child = launch(binary, args, cwd, extra);
  return new Promise((done, fail) => {
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error('Qualification command timed out'));
    }, 300000);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-12000);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once('exit', async (code) => {
      clearTimeout(timer);
      observation.finishedAt = new Date().toISOString();
      observation.code = code;
      observation.stdout = `command-${index}-stdout.txt`;
      observation.stderr = `command-${index}-stderr.txt`;
      await Promise.all([
        writeFile(join(root, observation.stdout), stdout),
        writeFile(join(root, observation.stderr), stderr),
      ]);
      done({ code, stdout, stderr });
    });
  });
}
async function pass(args, cwd, extra, binary) {
  const result = await command(args, cwd, extra, binary);
  assert.equal(
    result.code,
    0,
    `${args.slice(0, 3).join(' ')} failed: ${result.stderr}\n${result.stdout.slice(-4000)}`,
  );
  return result.stdout;
}
async function npmPath() {
  for (const candidate of [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].filter(Boolean)) {
    try {
      if (candidate.endsWith('npm-cli.js') && (await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  throw new Error('Run through npm or a Node installation containing npm.');
}
async function connect(server, workspace, extra) {
  const child = launch(process.execPath, [server], workspace, extra);
  let sequence = 0,
    buffer = '';
  const pending = new Map();
  child.stdout.on('data', (data) => {
    buffer += data;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      } catch {}
    }
  });
  const call = (method, params) =>
    new Promise((done, fail) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        fail(new Error(`MCP ${method} timed out`));
      }, 90000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        message.error ? fail(new Error(JSON.stringify(message.error))) : done(message.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  await call('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'kiln-project-foundation-qualification', version: '1' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return { call, close: () => child.kill() };
}
const textResult = (result) => {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
};
async function viewer(cli, workspace, extra) {
  const child = launch(process.execPath, [cli, 'view', '--port', '0'], workspace, extra);
  const url = await new Promise((done, fail) => {
    let output = '';
    const timer = setTimeout(
      () => fail(new Error('Installed viewer did not announce its URL')),
      30000,
    );
    child.stdout.on('data', (data) => {
      output += data;
      const match = /http:\/\/127\.0\.0\.1:\d+\//.exec(output);
      if (match) {
        clearTimeout(timer);
        done(match[0]);
      }
    });
    child.once('error', fail);
  });
  return { url, close: () => child.kill() };
}
try {
  const npm = await npmPath();
  receipt.npm = (await pass([npm, '--version'])).trim();
  const args = process.argv.slice(2);
  const at = args.indexOf('--tarball');
  if (at >= 0) receipt.tarball = resolve(args[at + 1]);
  else {
    const [pack] = JSON.parse(
      await pass([npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', root], repo),
    );
    receipt.tarball = join(root, pack.filename);
    assert(
      !pack.files.some((file) =>
        /material-foundation|material-samples|\.test\.ts$/.test(file.path),
      ),
    );
  }
  receipt.tarballSha256 = hash(await readFile(receipt.tarball));
  const install = join(root, 'installation');
  await mkdir(install);
  await writeFile(
    join(install, 'package.json'),
    JSON.stringify({
      private: true,
      name: 'kiln-foundation-qualification',
      version: '1.0.0',
      type: 'module',
    }),
  );
  await pass(
    [npm, 'install', receipt.tarball, '--omit=dev', '--omit=peer', '--no-audit', '--no-fund'],
    install,
  );
  receipt.checks.push('fresh-tarball-install-without-model-peers');
  const runtime = join(install, 'node_modules/@instruktlabs/kiln');
  receipt.runtime = runtime;
  const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
  receipt.engineVersion = pkg.version;
  for (const entry of [
    './projects',
    './projects/node',
    './project-bundle',
    './project-bundle/node',
    './workspace',
    './workspace/node',
    './material-library',
    './material-library/node',
    './material-presets',
    './live-review',
    './live-review/node',
  ]) {
    const path = pkg.exports[entry];
    assert.equal(typeof path, 'string', `Missing export ${entry}`);
    assert.equal(
      hash(await readFile(join(runtime, path))),
      hash(await readFile(join(repo, path))),
      `Installed source differs: ${entry}`,
    );
  }
  receipt.checks.push('exact-source-exports');
  const build = JSON.parse(await readFile(join(runtime, 'dist/build.json'), 'utf8'));
  const sourceIdentity = await runtimeBuildIdentity(repo);
  receipt.build = {};
  for (const entry of ['cli', 'mcp', 'worker']) {
    const item = build.entries[entry];
    assert(item, `Missing build entry ${entry}`);
    assert.equal(
      item.sourceHash,
      sourceIdentity.sourceHash,
      'Bundle must match the current source tree',
    );
    const actual = hash(await readFile(join(runtime, 'dist', item.file)));
    assert.equal(actual, item.bundleHash);
    receipt.build[entry] = {
      identity: item.identity,
      sourceHash: item.sourceHash,
      bundleHash: actual,
    };
  }
  assert.equal(
    new Set(Object.values(receipt.build).map((item) => item.sourceHash)).size,
    1,
    'Runtime bundles must share an exact source snapshot',
  );
  const importProbe = join(install, 'source-exports.ts');
  await writeFile(
    importProbe,
    `import { listMaterialPresets } from '@instruktlabs/kiln/material-presets'; import { FileMaterialLibrary } from '@instruktlabs/kiln/material-library/node'; import { FileProjectStore } from '@instruktlabs/kiln/projects/node'; if(listMaterialPresets().length !== 5 || !FileMaterialLibrary || !FileProjectStore) throw new Error('Source export mismatch'); console.log('source-exports-ok');`,
  );
  await pass([importProbe], install, {}, process.env.BUN_BINARY ?? 'bun');
  receipt.checks.push(
    'source-exports-consumed-with-bun',
    'bundle-hashes-and-common-source-identity',
  );
  const workspace = join(root, 'workspace');
  await pass(
    [join(runtime, 'scripts/create-workspace.mjs'), workspace, '--harness', 'codex'],
    install,
  );
  const cli = join(workspace, 'kiln.mjs');
  const extra = {
    KILN_WORKSPACE: workspace,
    KILN_RENDER: 'gpu',
    KILN_EVALUATOR_MODE: 'subprocess',
  };
  const run = (values, overrides = {}) =>
    pass([cli, ...values], workspace, { ...extra, ...overrides });
  const presets = JSON.parse(await run(['material', 'presets']));
  assert.equal(presets.presets.length, 5);
  const presetFile = join(workspace, 'preset.json');
  await writeFile(
    presetFile,
    JSON.stringify({
      presetId: 'warm-brick',
      seed: 7,
      size: 64,
      creator: 'Installed qualification',
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
    }),
  );
  const created = JSON.parse(await run(['material', 'create-preset', '--file', presetFile]));
  const material = created.material;
  assert.equal(material.maps.length, 3);
  assert.deepEqual(
    JSON.parse(await run(['material', 'create-preset', '--file', presetFile])),
    created,
  );
  const projectFile = join(workspace, 'project.json');
  await writeFile(
    projectFile,
    JSON.stringify({
      projectId: 'foundation',
      name: 'Installed foundation',
      materialDependencies: [
        {
          resourceId: material.materialId,
          revisionId: material.revisionId,
          sha256: material.revisionId,
        },
      ],
    }),
  );
  const { project } = JSON.parse(await run(['project', 'create', '--file', projectFile]));
  assert.equal(
    JSON.parse(await run(['project', 'get', 'foundation'])).project.revisionId,
    project.revisionId,
  );
  const source = `const meta={name:'Installed material cube',category:'prop'}; async function build(){const root=createRoot('Root'); const material=await compilePortableMaterialSpecV2(${JSON.stringify(created.portableSpec)}); createPart('Box',boxGeo(1,1,1),material,{parent:root});return root;}`;
  const sourceFile = join(workspace, 'cube.kiln.js');
  await writeFile(sourceFile, source);
  const ref = (await run(['source', sourceFile])).trim();
  const output = join(workspace, 'cube.glb');
  const preview = join(workspace, 'cube.png');
  const rendered = JSON.parse(
    await run([
      'render',
      ref,
      '--project',
      'foundation',
      '--project-revision',
      project.revisionId,
      '--render',
      'gpu',
      '--out',
      output,
      '--views',
      preview,
      '--json',
    ]),
  );
  assert.equal(rendered.viewFidelity?.delivered, 'full-material');
  assert.equal(rendered.viewFidelity?.degraded, false);
  receipt.gpu = rendered.viewFidelity;
  const glb = await readFile(output);
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  assert.equal(gltf.images.length, 3);
  assert(gltf.images.every((image) => image.bufferView !== undefined && !image.uri));
  assert.equal((await readFile(preview)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const exportedSource = join(workspace, 'source-export.kiln.js');
  await run(['source', ref, '--out', exportedSource]);
  assert.equal(await readFile(exportedSource, 'utf8'), source);
  const unboundProjectFile = join(workspace, 'unbound-project.json');
  await writeFile(
    unboundProjectFile,
    JSON.stringify({ projectId: 'unbound', name: 'No material dependencies' }),
  );
  await run(['project', 'create', '--file', unboundProjectFile]);
  const missing = await command(
    [cli, 'render', ref, '--project', 'unbound', '--out', join(workspace, 'missing.glb'), '--json'],
    workspace,
    extra,
  );
  assert.notEqual(missing.code, 0, 'Unpinned resources must not resolve');
  receipt.checks.push(
    'cli-project-create-read',
    'cli-preset-create-repeat',
    'project-pinned-default-subprocess',
    'gpu-full-material-capture',
    'embedded-map-closure',
    'exact-source-export',
    'unbound-resource-rejection',
  );
  const payload = join(root, 'portable-material.json');
  await run(['material', 'export', material.materialId, material.revisionId, '--out', payload]);
  const receiver = join(root, 'offline-receiver');
  await mkdir(receiver);
  const receiverEnv = { KILN_PROGRAM_STORE: join(receiver, '.kiln/programs'), KILN_RENDER: 'cpu' };
  const imported = JSON.parse(
    await pass(
      [join(runtime, 'dist/cli.mjs'), 'material', 'import', '--file', payload],
      receiver,
      receiverEnv,
    ),
  );
  assert.equal(imported.materials[0].revisionId, material.revisionId);
  receipt.checks.push('portable-material-export-and-offline-reimport');
  const session = await connect(join(runtime, 'dist/mcp-server.mjs'), workspace, extra);
  try {
    const { tools } = await session.call('tools/list', {});
    for (const name of ['kiln_project', 'kiln_material', 'kiln_review', 'kiln_render'])
      assert(tools.some((tool) => tool.name === name));
    assert.equal(
      textResult(
        await session.call('tools/call', {
          name: 'kiln_project',
          arguments: { action: 'get', projectId: 'foundation' },
        }),
      ).project.revisionId,
      project.revisionId,
    );
    assert.equal(
      textResult(
        await session.call('tools/call', {
          name: 'kiln_material',
          arguments: { action: 'presets' },
        }),
      ).presets.length,
      5,
    );
    const renderedMcp = textResult(
      await session.call('tools/call', {
        name: 'kiln_render',
        arguments: {
          programRef: ref,
          projectId: 'foundation',
          projectRevision: project.revisionId,
          capture: { preset: '1x1' },
        },
      }),
    );
    assert.equal(renderedMcp.viewFidelity?.delivered, 'full-material');
    receipt.mcpGpu = renderedMcp.viewFidelity;
  } finally {
    session.close();
  }
  receipt.checks.push(
    'installed-mcp-project-material-review-discovery',
    'installed-mcp-shared-project-state',
    'installed-mcp-gpu-render',
  );
  const dashboard = await viewer(cli, workspace, extra);
  try {
    const html = await (await fetch(dashboard.url)).text();
    assert.match(html, /Live|live/);
    const projects = await (await fetch(`${dashboard.url}api/projects`)).json();
    assert(projects.projects.some((item) => item.projectId === 'foundation'));
    const materials = await (await fetch(`${dashboard.url}api/materials`)).json();
    assert(materials.materials.some((item) => item.materialId === material.materialId));
    const live = await (await fetch(`${dashboard.url}api/live?project=foundation`)).json();
    assert(live.operations.some((operation) => operation.artifact && operation.captures?.length));
    receipt.viewer = {
      url: dashboard.url,
      projectCount: projects.projects.length,
      materialCount: materials.materials.length,
      operationCount: live.operations.length,
    };
  } finally {
    dashboard.close();
  }
  receipt.checks.push('installed-viewer-static-and-shared-project-material-live-endpoints');
  const saved = JSON.parse(
    await run([
      'save',
      ref,
      '--name',
      'Saved material cube',
      '--asset',
      'cube',
      '--project',
      'foundation',
      '--project-revision',
      project.revisionId,
      '--render',
      'gpu',
    ]),
  );
  const nextPreset = JSON.parse(await readFile(presetFile, 'utf8'));
  nextPreset.seed = 8;
  await writeFile(presetFile, JSON.stringify(nextPreset));
  const newerMaterial = JSON.parse(
    await run(['material', 'create-preset', '--file', presetFile]),
  ).material;
  assert.notEqual(newerMaterial.revisionId, material.revisionId);
  const patchFile = join(workspace, 'project-patch.json');
  await writeFile(
    patchFile,
    JSON.stringify({
      materialDependencies: [
        {
          resourceId: newerMaterial.materialId,
          revisionId: newerMaterial.revisionId,
          sha256: newerMaterial.revisionId,
        },
      ],
      inventory: [
        {
          id: 'cube',
          name: 'Cube',
          asset: {
            collectionId: 'project',
            assetId: saved.asset.assetId,
            revisionId: saved.asset.revisionId,
          },
        },
      ],
    }),
  );
  const newerProject = JSON.parse(
    await run([
      'project',
      'update',
      'foundation',
      '--expected',
      project.revisionId,
      '--file',
      patchFile,
    ]),
  ).project;
  const bundle = join(root, 'editable-project.zip');
  await run([
    'project',
    'export',
    'foundation',
    '--revision',
    newerProject.revisionId,
    '--profile',
    'editable',
    '--out',
    bundle,
  ]);
  const bundleReceiver = join(root, 'bundle-receiver');
  await pass(
    [join(runtime, 'scripts/create-workspace.mjs'), bundleReceiver, '--harness', 'codex'],
    install,
  );
  const receiverCli = join(bundleReceiver, 'kiln.mjs');
  const bundleEnv = {
    KILN_WORKSPACE: bundleReceiver,
    KILN_RENDER: 'gpu',
    KILN_EVALUATOR_MODE: 'subprocess',
  };
  const receive = (values, overrides = {}) =>
    pass([receiverCli, ...values], bundleReceiver, { ...bundleEnv, ...overrides });
  const importedProject = JSON.parse(
    await receive(['project', 'import', bundle, '--id', 'imported', '--collection', 'project']),
  ).project;
  assert.equal(importedProject.materialDependencies[0].revisionId, newerMaterial.revisionId);
  const receivedMaterials = JSON.parse(await receive(['material', 'list'])).materials;
  assert.deepEqual(
    new Set(receivedMaterials.map((item) => item.revisionId)),
    new Set([material.revisionId, newerMaterial.revisionId]),
  );
  const receivedSource = join(bundleReceiver, 'exact-source.kiln.js');
  await receive([
    'export',
    saved.asset.assetId,
    saved.asset.revisionId,
    '--collection',
    'project',
    '--format',
    'source',
    '--out',
    receivedSource,
  ]);
  assert.equal(await readFile(receivedSource, 'utf8'), source);
  const rebuiltPath = join(bundleReceiver, 'rebuilt.glb');
  const rebuilt = JSON.parse(
    await receive(
      [
        'asset',
        saved.asset.assetId,
        saved.asset.revisionId,
        '--collection',
        'project',
        '--rebuild',
        '--out',
        rebuiltPath,
      ],
      { KILN_PROJECT: 'imported', KILN_BAKE_OPTIMIZE: 'full', KILN_BAKE_INSTANCE: 'on' },
    ),
  );
  assert.equal(rebuilt.matchesSavedArtifact, true);
  assert.equal(hash(await readFile(rebuiltPath)), rebuilt.savedArtifactGlbSha256);
  receipt.portableProject = {
    bundleSha256: hash(await readFile(bundle)),
    savedMaterialRevision: material.revisionId,
    currentProjectMaterialRevision: newerMaterial.revisionId,
    importedProjectRevision: importedProject.revisionId,
    rebuilt,
  };
  receipt.checks.push(
    'editable-project-export-and-fresh-workspace-import',
    'bundle-retains-old-asset-and-new-project-material-revisions',
    'imported-asset-exact-source-export',
    'cli-exact-asset-rebuild-ignores-newer-project-defaults',
  );
  const standalonePins = [
    {
      resourceId: material.materialId,
      revisionId: material.revisionId,
      sha256: material.revisionId,
    },
  ];
  const standalonePinsFile = join(workspace, 'standalone-materials.json');
  await writeFile(standalonePinsFile, JSON.stringify(standalonePins));
  const standaloneRender = JSON.parse(
    await run([
      'render',
      ref,
      '--materials',
      standalonePinsFile,
      '--render',
      'gpu',
      '--out',
      join(workspace, 'standalone.glb'),
      '--views',
      join(workspace, 'standalone.png'),
      '--json',
    ]),
  );
  assert.equal(standaloneRender.projectId, undefined);
  assert.equal(standaloneRender.viewFidelity?.delivered, 'full-material');
  assert.equal(standaloneRender.viewFidelity?.degraded, false);
  const configuredConflict = await command(
    [
      cli,
      'render',
      ref,
      '--materials',
      standalonePinsFile,
      '--out',
      join(workspace, 'conflicting-default.glb'),
      '--json',
    ],
    workspace,
    { ...extra, KILN_PROJECT: 'foundation' },
  );
  assert.notEqual(
    configuredConflict.code,
    0,
    'Explicit configured default must still enforce its newer material lock',
  );
  const standaloneSaved = JSON.parse(
    await run(
      [
        'save',
        ref,
        '--name',
        'Standalone material cube',
        '--asset',
        'standalone-cube',
        '--no-project',
        '--materials',
        standalonePinsFile,
        '--render',
        'gpu',
      ],
      { KILN_PROJECT: 'foundation' },
    ),
  );
  assert.equal(standaloneSaved.projectId, undefined);
  assert.equal(standaloneSaved.asset.build.rebuild, 'external-dependencies-required');
  receipt.checks.push(
    'standalone-cli-material-render-with-projects-present',
    'explicit-configured-project-default-enforces-lock',
    'standalone-cli-save-opts-out-of-configured-default',
  );
  const standaloneMcp = await connect(join(runtime, 'dist/mcp-server.mjs'), workspace, {
    ...extra,
    KILN_PROJECT: 'foundation',
  });
  try {
    const standaloneResult = textResult(
      await standaloneMcp.call('tools/call', {
        name: 'kiln_render',
        arguments: {
          programRef: ref,
          projectId: null,
          materialDependencies: standalonePins,
          capture: { preset: '1x1' },
        },
      }),
    );
    assert.equal(standaloneResult.projectId, undefined);
    assert.equal(standaloneResult.viewFidelity?.delivered, 'full-material');
    assert.equal(standaloneResult.viewFidelity?.degraded, false);
    const download = await standaloneMcp.call('resources/read', {
      uri: `kiln://assets/project/${standaloneSaved.asset.assetId}/${standaloneSaved.asset.revisionId}/editable.zip`,
    });
    assert.equal(download.contents[0].mimeType, 'application/zip');
    const bytes = Buffer.from(download.contents[0].blob, 'base64');
    await writeFile(join(root, 'standalone-mcp-download.zip'), bytes);
    receipt.standaloneMcpGpu = standaloneResult.viewFidelity;
    receipt.standaloneMcpBundleSha256 = hash(bytes);
  } finally {
    standaloneMcp.close();
  }
  receipt.checks.push(
    'standalone-mcp-material-render-explicit-null',
    'standalone-mcp-editable-resource-download',
  );
  const standaloneBundle = join(root, 'standalone-editable.zip');
  await run([
    'export',
    standaloneSaved.asset.assetId,
    standaloneSaved.asset.revisionId,
    '--out',
    standaloneBundle,
  ]);
  const standaloneReceiver = join(root, 'standalone-receiver');
  await pass(
    [join(runtime, 'scripts/create-workspace.mjs'), standaloneReceiver, '--harness', 'codex'],
    install,
  );
  const standaloneCli = join(standaloneReceiver, 'kiln.mjs');
  const standaloneEnv = {
    KILN_WORKSPACE: standaloneReceiver,
    KILN_RENDER: 'gpu',
    KILN_EVALUATOR_MODE: 'subprocess',
  };
  const receiveStandalone = (values) =>
    pass([standaloneCli, ...values], standaloneReceiver, standaloneEnv);
  assert.equal(JSON.parse(await receiveStandalone(['project', 'list'])).projects.length, 0);
  await receiveStandalone(['import', standaloneBundle]);
  assert.equal(JSON.parse(await receiveStandalone(['project', 'list'])).projects.length, 0);
  const standaloneImportedMaterials = JSON.parse(
    await receiveStandalone(['material', 'list']),
  ).materials;
  assert.deepEqual(
    standaloneImportedMaterials.map((entry) => entry.revisionId),
    [material.revisionId],
  );
  const standaloneSource = join(standaloneReceiver, 'source.kiln.js');
  await receiveStandalone([
    'export',
    standaloneSaved.asset.assetId,
    standaloneSaved.asset.revisionId,
    '--format',
    'source',
    '--out',
    standaloneSource,
  ]);
  assert.equal(await readFile(standaloneSource, 'utf8'), source);
  const standaloneRebuiltPath = join(standaloneReceiver, 'rebuilt.glb');
  const standaloneRebuilt = JSON.parse(
    await receiveStandalone([
      'asset',
      standaloneSaved.asset.assetId,
      standaloneSaved.asset.revisionId,
      '--rebuild',
      '--out',
      standaloneRebuiltPath,
    ]),
  );
  assert.equal(standaloneRebuilt.matchesSavedArtifact, true);
  assert.equal(
    hash(await readFile(standaloneRebuiltPath)),
    standaloneRebuilt.savedArtifactGlbSha256,
  );
  receipt.standalone = {
    materialRevision: material.revisionId,
    bundleSha256: hash(await readFile(standaloneBundle)),
    projectCountAfterImport: 0,
    rebuilt: standaloneRebuilt,
    gpu: standaloneRender.viewFidelity,
  };
  receipt.checks.push(
    'standalone-editable-asset-export-and-fresh-import',
    'standalone-import-retains-maps-without-creating-project',
    'standalone-imported-source-and-exact-cli-rebuild',
  );
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
  await writeFile(join(root, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
