import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packagePlugin } from './package-plugin.mjs';

const root = await mkdtemp(join(tmpdir(), 'kiln-plugin-package-'));
try {
  const result = await packagePlugin(join(root, 'kiln-chatgpt'), 'plugin_asdk_app_test');
  const manifest = JSON.parse(await readFile(join(result.directory, '.codex-plugin/plugin.json')));
  assert.equal(manifest.apps, './.app.json');
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(manifest.name, 'kiln-chatgpt');
  assert.equal(manifest.homepage, 'https://kilnstudio.tools');
  assert.equal(manifest.repository, 'https://github.com/instruktlabs/kiln');
  assert.equal(manifest.interface.websiteURL, manifest.homepage);
  assert.deepEqual(manifest.keywords, [
    '3d',
    'glb',
    'gltf',
    'asset-generation',
    'three.js',
    'gamedev',
  ]);
  assert.equal(
    await readFile(join(result.directory, 'SECURITY.md'), 'utf8'),
    await readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
  );
  const mapping = JSON.parse(await readFile(join(result.directory, '.app.json')));
  assert.equal(mapping.apps.kiln.id, 'plugin_asdk_app_test');
  assert.match(
    await readFile(
      join(result.directory, 'skills/kiln-author-asset/references/program-contract.md'),
      'utf8',
    ),
    /build/,
  );
  await assert.rejects(packagePlugin(result.directory, 'plugin_asdk_app_test'), /exist/i);
  await assert.rejects(packagePlugin(join(root, 'invalid'), 'https://example.com'), /connector ID/);
  assert.ok(result.files > 5);
  console.error(
    'Plugin packaging passed: complete skill references, exact connector binding, no overwrite.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
