#!/usr/bin/env node
// Explicit distribution check: npm registry access, no model calls or publication.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { smokePackageExporter } from './smoke-package-exporter.mjs';
import { smokeSdkTypes } from './smoke-sdk-types.mjs';
import { smokePackageAdoption } from './smoke-package-adoption.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// macOS exposes /var through /private/var. Match Node's canonical module URLs
// before asserting that the installed SDK identifies its own package directory.
const root = await realpath(await mkdtemp(join(tmpdir(), 'kiln-package-café-')));
const receipt = {
  root,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  checks: [],
  status: 'running',
};
const sha = (value) => createHash('sha256').update(value).digest('hex');

async function command(args, cwd, env = {}) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`Command exceeded five minutes: ${args[0]}`));
    }, 300000);
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) done(stdout);
      else
        fail(
          new Error(
            `Command exited ${code}: ${args.slice(0, 3).join(' ')}\n${stderr.slice(-6000)}`,
          ),
        );
    });
  });
}

async function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].filter(Boolean);
  for (const candidate of candidates)
    if (candidate.endsWith('npm-cli.js')) {
      try {
        await stat(candidate);
        return candidate;
      } catch {}
    }
  throw new Error('Run this check with npm run test:package so npm can locate its CLI.');
}

async function connect(server, cwd, store, env = {}, executable = process.execPath) {
  const child = spawn(executable, Array.isArray(server) ? server : [server], {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...env, KILN_RENDER: 'cpu', KILN_PROGRAM_STORE: store },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let next = 0,
    buffer = '',
    stderr = '';
  const pending = new Map();
  child.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(-4000);
  });
  child.stdout.on('data', (data) => {
    buffer += data;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    }
  });
  const call = (method, params) =>
    new Promise((done, fail) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        fail(new Error(`MCP ${method} timed out. ${stderr}`));
      }, 60000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) fail(new Error(JSON.stringify(message.error)));
        else done(message.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  // EOF also reaches the server when npm is its parent. Killing only the npm
  // wrapper can leave a running server behind on Windows.
  const close = () =>
    new Promise((done, fail) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      const timer = setTimeout(() => {
        child.kill();
        fail(
          new Error(
            `MCP process did not exit within 5000 ms after stdin closed: ${JSON.stringify(server)}; exit=${child.exitCode}, signal=${child.signalCode}; stderr: ${stderr}`,
          ),
        );
      }, 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      child.stdin.end();
    });
  child.on('error', (error) => {
    for (const resolve of pending.values()) resolve({ error: { message: error.message } });
    pending.clear();
  });
  try {
    const initialized = await call('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'kiln-package-smoke', version: '1' },
    });
    assert.equal(
      initialized.serverInfo.version,
      receipt.engineVersion,
      'MCP/package version drift',
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    return { call, close };
  } catch (error) {
    await close();
    throw error;
  }
}

const textResult = (result) => {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
};

try {
  const npm = await npmCli();
  receipt.npm = (await command([npm, '--version'], root)).trim();
  const checkTypes = process.argv.includes('--types');
  const args = process.argv.slice(2).filter((argument) => argument !== '--types');
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--tarball'))
    throw new Error('Usage: smoke-package.mjs [--tarball /absolute/package.tgz] [--types]');
  if (args.length) {
    receipt.tarball = resolve(args[1]);
    assert((await stat(receipt.tarball)).isFile(), 'Tarball must be a file.');
  } else {
    const packed = JSON.parse(
      await command([npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', root], repo),
    );
    const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
    receipt.tarball = join(root, pack.filename);
    receipt.integrity = pack.integrity;
    assert(pack.files.some((entry) => entry.path === 'dist/cli.mjs'));
    assert(pack.files.some((entry) => entry.path === 'scripts/create-workspace.mjs'));
    assert(pack.files.some((entry) => entry.path === 'plugin.json'));
    assert(pack.files.some((entry) => entry.path === '.claude-plugin/plugin.json'));
    // The MCP server tells every model that a GPU renderer "ships as render-service/
    // in this installation". That sentence was false for anyone installing from npm
    // until this line existed, and the on-demand start has nothing to start without it.
    assert(pack.files.some((entry) => entry.path === 'render-service/src/server.mjs'));
    assert(!pack.files.some((entry) => entry.path.startsWith('render-service/test/')));
    assert(
      !pack.files.some(
        (entry) => entry.path.includes('__tests__') || entry.path.endsWith('.test.ts'),
      ),
    );
  }
  receipt.tarballSha256 = sha(await readFile(receipt.tarball));
  const install = join(root, 'fresh installation');
  await mkdir(install);
  await writeFile(
    join(install, 'package.json'),
    JSON.stringify({ private: true, name: 'kiln-package-check', version: '1.0.0' }),
  );
  await command(
    [npm, 'install', receipt.tarball, '--omit=dev', '--no-audit', '--no-fund'],
    install,
  );
  const runtime = join(install, 'node_modules/@instruktlabs/kiln');
  const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
  receipt.engineName = pkg.name;
  receipt.engineVersion = pkg.version;
  assert.equal(pkg.name, '@instruktlabs/kiln');
  assert.equal(pkg.bin['kiln-mcp'], './dist/mcp-server.mjs');
  const plugin = join(runtime, 'plugins/kiln-engine');
  const pluginJson = async (path) => JSON.parse(await readFile(join(plugin, path), 'utf8'));
  const portablePlugin = await pluginJson('plugin.json');
  assert.equal(
    portablePlugin.$schema,
    'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  );
  assert.equal(portablePlugin.name, 'kiln-engine');
  assert.equal((await pluginJson('.claude-plugin/plugin.json')).version, portablePlugin.version);
  const { workspaceSetupCapabilities } = await import(
    pathToFileURL(join(runtime, 'scripts/create-workspace.mjs')).href
  );
  assert.deepEqual(await pluginJson('runtime.json'), {
    name: pkg.name,
    version: pkg.version,
    ...(workspaceSetupCapabilities?.harnesses
      ? { harnesses: workspaceSetupCapabilities.harnesses }
      : {}),
  });
  assert.deepEqual(await readdir(join(plugin, 'skills')), ['kiln-setup-workspace']);
  const pluginReceipt = await pluginJson('package-provenance.json');
  assert.equal(pluginReceipt.kind, 'kiln-local-plugin');
  assert.equal(pluginReceipt.engineVersion, pkg.version);
  // Published plugin 1.0.0 coupled these versions; newer plugin-only revisions do not.
  assert.equal(portablePlugin.version, pluginReceipt.pluginVersion ?? pkg.version);
  for (const [name, digest] of Object.entries(pluginReceipt.files))
    assert.equal(
      `sha256:${sha(await readFile(join(plugin, name)))}`,
      digest,
      `Plugin file ${name}`,
    );
  for (const catalog of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
    const marketplace = JSON.parse(await readFile(join(runtime, catalog), 'utf8'));
    assert.equal(marketplace.name, 'instruktlabs');
    assert.equal(marketplace.plugins[0].name, portablePlugin.name);
    const source = marketplace.plugins[0].source;
    assert.equal(typeof source === 'string' ? source : source.path, './plugins/kiln-engine');
  }
  receipt.checks.push('local-plugin-bundle');
  // Check the installed tree too: CI consumers receive a prepacked archive,
  // so checking only this checkout's `npm pack` inventory would miss them.
  const docs = await readdir(join(runtime, 'docs'), { withFileTypes: true });
  assert(docs.every((entry) => entry.isFile() && entry.name.endsWith('.md')));
  assert.deepEqual(
    docs.map((entry) => `docs/${entry.name}`).sort(),
    pkg.files.filter((entry) => entry.startsWith('docs/')).sort(),
    'Installed documentation must match the explicit consumer allowlist',
  );
  for (const entry of docs) {
    const document = join(runtime, 'docs', entry.name);
    const body = await readFile(document, 'utf8');
    for (const [, href] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) continue;
      const target = fileURLToPath(new URL(href, pathToFileURL(document)));
      assert(
        await stat(target).then(
          () => true,
          () => false,
        ),
        `Broken installed documentation link in ${entry.name}: ${href}`,
      );
    }
  }
  receipt.checks.push('installed-consumer-documents');
  const coreExports = Object.keys(pkg.exports).filter(
    (name) => !['./agent', './composer/agent'].includes(name),
  );
  await writeFile(
    join(install, 'sdk-check.mjs'),
    `import assert from 'node:assert/strict';
const name = ${JSON.stringify(pkg.name)};
const sdk = await import(name);
for (const subpath of ${JSON.stringify(coreExports)}) {
  await import(subpath === '.' ? name : name + '/' + subpath.slice(2));
}
assert.equal(typeof sdk.validateKilnCode, 'function');
assert.equal(typeof sdk.createDiscovery, 'function');
const { createKilnOperationToolRegistry } = await import(name + '/tools');
const { createKilnToolHost } = await import(name + '/mcp');
const operationContext = {
  assetLibrary: { collections: () => [], list: async () => [] },
  materialLibrary: { list: async () => [] },
};
const operations = createKilnOperationToolRegistry(operationContext);
assert.equal(operations.length, 21);
const operationHost = createKilnToolHost(operationContext, { toolPresentation: 'operations' });
assert.deepEqual(operationHost.defs.map(tool => tool.name), operations.map(tool => tool.name));
assert.deepEqual(await operations.find(tool => tool.name === 'kiln_material_search').run({ scope: 'saved' }),
  { ok: true, presets: [], materials: [] });
await assert.rejects(() => operations.find(tool => tool.name === 'kiln_material_create').run({ definition: { kind: 'preset' } }));
const arena = await import(name + '/arena');
assert.equal(arena.fitBradleyTerry([{winner:'a',loser:'b'}]).items[0].id, 'a');
assert.deepEqual(arena.pickNextPair(['a','b'], []), {a:'a',b:'b'});
const result = await sdk.renderGLB('function build() { return new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0x888888)); }');
assert.equal(result.glb.subarray(0, 4).toString('utf8'), 'glTF');
assert.equal(sdk.engineIdentity().installUrl, ${JSON.stringify(pathToFileURL(`${runtime}/`).href)});
console.log(JSON.stringify({ imports: ${coreExports.length}, renderBytes: result.glb.length }));
`,
  );
  receipt.sdk = JSON.parse(
    await command([join(install, 'sdk-check.mjs')], install, {
      KILN_RENDER: 'cpu',
      KILN_EVALUATOR_MODE: 'subprocess',
    }),
  );
  receipt.checks.push(
    'plain-node-sdk-exports',
    'sdk-subprocess-render',
    'installed-named-operation-contract',
  );
  // Qualify the compiled worker's native imports and wire protocol. This runs
  // trusted fixture code without an OS sandbox; provider isolation is a separate gate.
  await writeFile(
    join(install, 'compiled-worker-check.mjs'),
    `import assert from 'node:assert/strict';
import { renderGLBViaProcessLaunch, sanitizedEvaluatorEnv } from ${JSON.stringify(pathToFileURL(join(runtime, 'lib/evaluator/subprocess.js')).href)};
const result = await renderGLBViaProcessLaunch(
  'function build() { return new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0x888888)); }',
  {}, {}, {
    command: process.execPath,
    args: ['--max-old-space-size=512', ${JSON.stringify(join(runtime, 'lib/evaluator/worker.js'))}],
    env: sanitizedEvaluatorEnv(),
  });
assert.equal(result.glb.subarray(0, 4).toString('utf8'), 'glTF');
console.log(JSON.stringify({ renderBytes: result.glb.length }));
`,
  );
  receipt.compiledWorker = JSON.parse(
    await command([join(install, 'compiled-worker-check.mjs')], install),
  );
  receipt.checks.push('compiled-evaluator-worker');
  if (checkTypes) {
    receipt.sdkTypes = await smokeSdkTypes(runtime);
    receipt.checks.push('sdk-consumer-types-without-optional-peers');
  }
  for (const required of [
    'dist/cli.mjs',
    'dist/mcp-server.mjs',
    'dist/mcp-engine.mjs',
    'dist/evaluator-worker.mjs',
    'lib/evaluator/worker.js',
    'lib/evaluator/probe-worker.js',
    'lib/evaluator/transport-worker.mjs',
    'scripts/create-workspace.mjs',
    'plugin.json',
    '.claude-plugin/plugin.json',
    'render-service/src/server.mjs',
    'render-service/src/register-hooks.mjs',
    'render-service/package.json',
  ])
    assert(
      (await stat(join(runtime, required))).isFile(),
      `Missing installed package file: ${required}`,
    );
  // `renderServiceDir()` is `new URL('../render-service', import.meta.url)` from the
  // bundle. Walk that exact arithmetic against the real installation rather than
  // trusting that the three paths above happen to sit where the server will look.
  assert(
    (
      await stat(
        fileURLToPath(
          new URL(
            '../render-service/src/server.mjs',
            pathToFileURL(join(runtime, 'dist/mcp-server.mjs')),
          ),
        ),
      )
    ).isFile(),
    'render-service is not where the MCP bundle resolves it',
  );
  receipt.bundleHashes = {
    cli: sha(await readFile(join(runtime, 'dist/cli.mjs'))),
    mcp: sha(await readFile(join(runtime, 'dist/mcp-server.mjs'))),
    engine: sha(await readFile(join(runtime, 'dist/mcp-engine.mjs'))),
  };
  assert((await readFile(join(runtime, 'dist/cli.mjs'), 'utf8')).startsWith('#!/usr/bin/env node'));
  assert.match(
    await command([join(runtime, 'dist/cli.mjs'), '--help'], root),
    /kiln render/,
    'Direct Node CLI must print help',
  );
  receipt.checks.push('direct-node-cli-help');
  assert.match(
    await command([npm, 'exec', '--offline', '--', 'kiln', '--help'], install),
    /kiln render/,
    'npm bin entry must print help (including Linux symlinks)',
  );
  receipt.checks.push('tarball-install-without-dev-dependencies', 'node-cli-entry');
  const workspace = join(root, 'asset workspace café');
  await command(
    [npm, 'exec', '--offline', '--', 'kiln-init', workspace, '--harness', 'codex'],
    install,
  );
  assert((await stat(workspace)).isDirectory(), 'npm kiln-init must create its workspace');
  receipt.checks.push('npm-init-workspace');
  const cli = join(workspace, 'kiln.mjs');
  const source = `const meta = { name: 'PackedEnclosure', category: 'prop' };\nasync function build() {\nconst root = createRoot('PackedEnclosure');\nconst mat = gameMaterial(0x4488aa);\nconst base = new THREE.Mesh(boxGeo(2, 2, 2), mat);\nbase.position.y = 1;\nconst cutter = new THREE.Mesh(cylinderGeo(0.3, 0.3, 3, 16), mat);\ncutter.position.y = 1;\nconst body = await boolDiff('Body', base, cutter);\nbody.geometry = await autoUnwrap(body.geometry, { resolution: 256 });\nroot.add(body);\nreturn root;\n}\n`;
  await writeFile(join(workspace, 'asset.kiln.js'), source);
  const ref = (await command([cli, 'source', join(workspace, 'asset.kiln.js')], root)).trim();
  assert.match(ref, /^p_[a-f0-9]{12}$/);
  assert.equal(await command([cli, 'source', `sha256:${sha(source)}`], root), source);
  receipt.checks.push('short-reference-full-hash-compatibility');
  await command(
    [
      cli,
      'render',
      ref,
      '--render',
      'cpu',
      '--out',
      join(workspace, 'asset.glb'),
      '--views',
      join(workspace, 'sheet.png'),
    ],
    root,
  );
  const png = await readFile(join(workspace, 'sheet.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  // Resolve as ESM from this fresh installation. require.resolve selects the
  // package's CJS branch, which cannot require its ESM dependencies on Node 20.15.
  const inspectionImports = join(install, 'qualification-imports.mjs');
  await writeFile(
    inspectionImports,
    "export {NodeIO} from '@gltf-transform/core';\nexport {ALL_EXTENSIONS} from '@gltf-transform/extensions';\n",
  );
  const { NodeIO, ALL_EXTENSIONS } = await import(pathToFileURL(inspectionImports).href);
  const doc = await new NodeIO().readBinary(await readFile(join(workspace, 'asset.glb')));
  assert(
    doc
      .getRoot()
      .listMeshes()
      .some((mesh) =>
        mesh
          .listPrimitives()
          .some((primitive) => primitive.getAttribute('TEXCOORD_0')?.getCount() > 0),
      ),
  );
  receipt.checks.push('csg-wasm', 'uv-wasm', 'cpu-png', 'cross-cwd-cli-source-store');
  const capture = {
    version: 'kiln.capture.v1',
    output: 'grid',
    cols: 2,
    size: 160,
    shots: [
      {
        name: 'Part side',
        subject: { name: 'Mesh_Body' },
        visibility: 'isolate',
        camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 25, elevationDeg: 0 },
      },
      {
        name: 'Part above',
        subject: { name: 'Mesh_Body' },
        visibility: 'context',
        camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 90, elevationDeg: 70 },
      },
    ],
  };
  const recipe = join(workspace, 'capture.json');
  await writeFile(recipe, JSON.stringify(capture));
  const captureLog = await command(
    [
      cli,
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      recipe,
      '--views',
      join(workspace, 'chosen.png'),
      '--out',
      join(workspace, 'chosen.glb'),
    ],
    root,
  );
  const chosen = await readFile(join(workspace, 'chosen.png'));
  assert.deepEqual([chosen.readUInt32BE(16), chosen.readUInt32BE(20)], [332, 168]);
  assert.match(captureLog, /build reused/, 'Camera-only export must reuse the evaluated build');
  assert.equal(
    sha(await readFile(join(workspace, 'chosen.glb'))),
    sha(await readFile(join(workspace, 'asset.glb'))),
  );
  capture.shots[0].camera.elevationDeg = 75;
  await writeFile(recipe, JSON.stringify(capture));
  await command(
    [
      cli,
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      recipe,
      '--views',
      join(workspace, 'changed-view.png'),
    ],
    root,
  );
  assert.notEqual(sha(chosen), sha(await readFile(join(workspace, 'changed-view.png'))));
  const badCapture = { ...capture, shots: [{ ...capture.shots[0], subject: { name: 'Body' } }] };
  await writeFile(recipe, JSON.stringify(badCapture));
  await assert.rejects(
    command(
      [
        cli,
        'render',
        ref,
        '--render',
        'cpu',
        '--capture',
        recipe,
        '--views',
        join(workspace, 'missing-subject.png'),
      ],
      root,
    ),
    /missing camera subject: no node is named "Body"; similar: \/PackedEnclosure\[0\]\/PackedEnclosure\[0\]\/Mesh_Body\[0\]/,
  );
  badCapture.shots[0].subject = { path: '/PackedEnclosure[0]/PackedEnclosure[0]/Mesh_Body[0]' };
  await writeFile(recipe, JSON.stringify(badCapture));
  await command(
    [
      cli,
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      recipe,
      '--views',
      join(workspace, 'exact-subject.png'),
    ],
    root,
  );
  assert((await stat(join(workspace, 'exact-subject.png'))).size > 0);
  receipt.checks.push('capture-file-part-relative-grid', 'capture-file-build-reuse');

  await command(
    [cli, 'render', ref, '--render', 'cpu', '--out', join(workspace, 'worker.glb')],
    root,
    { KILN_EVALUATOR_MODE: 'subprocess' },
  );
  assert.equal(
    sha(await readFile(join(workspace, 'worker.glb'))),
    sha(await readFile(join(workspace, 'asset.glb'))),
  );
  receipt.checks.push('packaged-node-worker');
  // Export/reload only: the native canvas encodes texture pixels; no CPU/GPU views.
  receipt.communityExporter = await smokePackageExporter({
    runtime,
    workspace,
    cli,
    command,
    NodeIO,
    ALL_EXTENSIONS,
  });
  receipt.checks.push('community-exporter-textured-subprocess');
  const server = join(runtime, 'dist/mcp-server.mjs'),
    store = join(workspace, '.kiln/programs');
  const binSession = await connect([npm, 'exec', '--offline', '--', 'kiln-mcp'], install, store);
  try {
    const listed = await binSession.call('tools/list', {});
    assert(listed.tools.some((tool) => tool.name === 'kiln_render'));
    receipt.checks.push('npm-mcp-entry');
  } finally {
    await binSession.close();
  }
  const session = await connect(server, root, store);
  let changed;
  try {
    const listed = await session.call('tools/list', {});
    assert(listed.tools.some((tool) => tool.name === 'kiln_source'));
    assert(listed.tools.some((tool) => tool.name === 'kiln_render'));
    for (const [id, stability] of [
      ['operation:boxGeo', 'stable'],
      ['operation:implicitSurface', 'experimental'],
      ['recipe:steerable-wheel-v1', 'experimental'],
    ]) {
      const result = await session.call('tools/call', {
        name: 'kiln_discover',
        arguments: { query: id, limit: 1 },
      });
      assert.notEqual(result.isError, true);
      assert(
        result.content.some(
          (item) => item.type === 'text' && item.text.includes(`${id} [${stability}]`),
        ),
      );
    }
    const cliDiscovery = await command(
      [cli, 'discover', '--query', 'recipe:steerable-wheel-v1', '--limit', '1'],
      root,
    );
    assert.match(cliDiscovery, /recipe:steerable-wheel-v1 \[experimental\]/);
    receipt.checks.push('discovery-stability-labels');
    const read = textResult(
      await session.call('tools/call', {
        name: 'kiln_source',
        arguments: { programRef: ref, query: 'gameMaterial' },
      }),
    );
    assert.match(read.code, /0x4488aa/);
    const result = await session.call('tools/call', {
      name: 'kiln_edit',
      arguments: { programRef: ref, edits: [{ oldString: '0x4488aa', newString: '0xaa8844' }] },
    });
    changed = textResult(result);
    assert.equal(changed.ok, true);
    assert.equal(changed.parentRef, ref);
    assert.notEqual(changed.programRef, ref);
    assert.match(changed.programRef, /^p_[a-f0-9]{12}$/);
    assert.equal(changed.code, undefined);
    assert(result.content.some((item) => item.type === 'image' && item.data.length > 100));
    receipt.editResult = { programRef: changed.programRef, parentRef: changed.parentRef };
  } finally {
    await session.close();
  }
  const restarted = await connect(server, install, store);
  try {
    const after = textResult(
      await restarted.call('tools/call', {
        name: 'kiln_source',
        arguments: { programRef: changed.programRef, query: 'gameMaterial' },
      }),
    );
    assert.match(after.code, /0xaa8844/);
  } finally {
    await restarted.close();
  }
  await command(
    [cli, 'source', changed.programRef, '--out', join(workspace, 'revised.kiln.js')],
    root,
  );
  assert.equal(
    await readFile(join(workspace, 'revised.kiln.js'), 'utf8'),
    source.replace('0x4488aa', '0xaa8844'),
  );
  receipt.checks.push(
    'mcp-discovery',
    'source-reference-edit-images',
    'server-restart-persistence',
    'exact-source-export',
  );
  receipt.projectAdoption = await smokePackageAdoption({
    runtime,
    root,
    command,
    connect,
    textResult,
  });
  if (receipt.projectAdoption.status === 'passed')
    receipt.checks.push('installed-project-adoption-and-cross-client-storage');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(join(root, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
