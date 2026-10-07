/** Installed-package proof of project preservation and cross-client storage reuse. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function smokePackageAdoption({ runtime, root, command, connect, textResult }) {
  const setup = join(runtime, 'scripts/create-workspace.mjs');
  const { workspaceSetupCapabilities } = await import(pathToFileURL(setup).href);
  const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
  const supportsAdoption = workspaceSetupCapabilities?.projectAdoption === 1;
  assert.equal(
    supportsAdoption,
    pkg.files.includes('scripts/workspace-project.mjs'),
    'Installed adoption capability and package contents must agree',
  );
  // The public-registry matrix also qualifies immutable older releases. Report
  // their missing feature explicitly; only a supporting candidate runs this gate.
  if (!supportsAdoption) return { status: 'not-supported-by-this-release' };
  const require = createRequire(join(runtime, 'package.json'));
  const { parse } = await import(pathToFileURL(require.resolve('smol-toml')).href);
  const project = join(root, 'existing project café');
  const profile = join(root, 'adoption-profile');
  const env = {
    LOCALAPPDATA: profile,
    XDG_DATA_HOME: profile,
    KILN_COLLECTIONS: '',
    KILN_PROJECT: '',
    KILN_WORK_ITEM: 'package-adoption-proof',
  };
  await mkdir(project);
  const ownerFiles = {
    'AGENTS.md': '# Existing project instructions\n',
    'CLAUDE.md': '# Existing Claude instructions\n',
    'README.md': '# Existing application\n',
  };
  for (const [name, bytes] of Object.entries(ownerFiles))
    await writeFile(join(project, name), bytes);
  await writeFile(
    join(project, '.mcp.json'),
    '{ "mcpServers": { "owner": { "command": "unused-fixture" } }, "ownerNumber": 9007199254740993 }\n',
  );
  const run = (...args) => command([setup, project, ...args], root, env);
  assert.equal(JSON.parse(await run('--adopt', '--harness', 'claude')).status, 'current');
  const claude = JSON.parse(await readFile(join(project, '.mcp.json'), 'utf8')).mcpServers
    .kiln_workspace;
  const sessionFor = (config) =>
    connect(
      config.args,
      project,
      config.env.KILN_PROGRAM_STORE,
      { ...env, ...config.env },
      config.command,
    );
  const tool = async (session, name, args) =>
    textResult(await session.call('tools/call', { name, arguments: args }));
  const source =
    "const meta = { name: 'ContractCube', category: 'prop' };\n" +
    "function build() { const root = createRoot('ContractCube');\n" +
    "createPart('Body', boxGeo(1,1,1), gameMaterial(0x808080), {position:[0,0.5,0],parent:root});\n" +
    'return root; }\n';
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  let programRef, asset, sourceUri, glbUri, glbHash;
  const first = await sessionFor(claude);
  try {
    assert.equal((await first.call('tools/list', {})).tools.length, 17);
    programRef = (await tool(first, 'kiln_validate', { code: source })).programRef;
    assert.equal(typeof programRef, 'string');
    await tool(first, 'kiln_render', { programRef, capture: { preset: '1x1' } });
    asset = (await tool(first, 'kiln_save', { programRef, name: 'ContractCube' })).asset;
    assert.equal(asset.editable, true);
    sourceUri = `kiln://assets/project/${asset.assetId}/${asset.revisionId}/source.kiln.js`;
    glbUri = `kiln://assets/project/${asset.assetId}/${asset.revisionId}/asset.glb`;
    assert.equal((await first.call('resources/read', { uri: sourceUri })).contents[0].text, source);
    const glb = await first.call('resources/read', { uri: glbUri });
    glbHash = hash(Buffer.from(glb.contents[0].blob, 'base64'));
  } finally {
    await first.close();
  }
  await run('--adopt', '--harness', 'codex');
  const codex = parse(await readFile(join(project, '.codex/config.toml'), 'utf8')).mcp_servers
    .kiln_workspace;
  assert.equal(codex.env.KILN_PROGRAM_STORE, claude.env.KILN_PROGRAM_STORE);
  const second = await sessionFor(codex);
  try {
    assert.equal((await second.call('tools/list', {})).tools.length, 17);
    assert.match(
      (await tool(second, 'kiln_source', { programRef, query: 'ContractCube' })).code,
      /ContractCube/,
    );
    const restored = await tool(second, 'kiln_assets', {
      action: 'restore',
      collection: 'project',
      assetId: asset.assetId,
      revisionId: asset.revisionId,
    });
    assert.equal(restored.asset.revisionId, asset.revisionId);
    assert.equal(
      (await second.call('resources/read', { uri: sourceUri })).contents[0].text,
      source,
    );
    const glb = await second.call('resources/read', { uri: glbUri });
    assert.equal(hash(Buffer.from(glb.contents[0].blob, 'base64')), glbHash);
  } finally {
    await second.close();
  }
  const checked = JSON.parse(await run('--check'));
  assert.equal(checked.status, 'current');
  assert.deepEqual(checked.harnesses, ['claude', 'codex']);
  for (const [name, bytes] of Object.entries(ownerFiles))
    assert.equal(await readFile(join(project, name), 'utf8'), bytes);
  assert((await readFile(join(project, '.mcp.json'), 'utf8')).includes('9007199254740993'));
  return {
    status: 'passed',
    programRef,
    assetId: asset.assetId,
    revisionId: asset.revisionId,
    glbSha256: glbHash,
  };
}
