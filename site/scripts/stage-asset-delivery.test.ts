import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageAssetDelivery } from './stage-asset-delivery.mjs';
import { hashBytes } from './mirror-core.mjs';

test('Troy runtime downloads copy verified Pages bytes to the immutable R2 release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-stage-downloads-'));
  try {
    const glb = Buffer.from('verified runtime'), source = Buffer.from('return 1;');
    const files = { 'asset.glb': glb, 'source.kiln.js': source };
    const manifest = { assetId: 'soldier', revisionId: 'r_current', editable: true,
      files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: `sha256:${hashBytes(bytes)}` }])) };
    const saved = join(root, 'saved'); await mkdir(saved);
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(saved, name), bytes);
    const index = { assets: new Map([['project/soldier/r_current', [{ dir: saved, manifest, collection: 'project' }]]]), materials: new Map() };
    const runtimePath = 'scene-packs/troy/old-release/models/soldier.glb';
    const mirror = join(root, 'mirror'); await mkdir(join(mirror, 'scene-packs/troy/old-release/models'), { recursive: true });
    await writeFile(join(mirror, runtimePath), glb);
    const output = join(root, 'asset-delivery.json');
    const sourceRoot = join(root, 'source');
    const snapshotDir = join(sourceRoot, 'troy/sources/project/soldier/r_current');
    await mkdir(snapshotDir, { recursive: true });
    const reorderedManifest = JSON.stringify(Object.fromEntries(Object.entries(manifest).reverse()));
    await writeFile(join(snapshotDir, 'manifest.json'), reorderedManifest);
    const result = await stageAssetDelivery({ index, mirror, output, sourceRoot, release: 'delivery-test',
      groups: [{ id: 'troy', assets: [{ slug: 'soldier', assetId: 'soldier', revisionId: 'r_current', runtimeDownload: { url: `/${runtimePath}`, bytes: glb.length, sha256: hashBytes(glb) } }] }] });
    const download = result.groups.troy.assets[0].runtimeDownload;
    expect(download.url).toBe('https://assets.kilnstudio.tools/packs/troy/delivery-test/models/soldier.glb');
    expect(Buffer.from(await readFile(join(mirror, download.path))).equals(glb)).toBe(true);
    const uploads = JSON.parse(await readFile(join(mirror, 'asset-delivery-delivery-test-uploads.json'), 'utf8'));
    expect(uploads.some((item: any) => item.path === download.path && item.sha256 === hashBytes(glb))).toBe(true);
    expect(await readFile(join(snapshotDir, 'manifest.json'), 'utf8')).toBe(reorderedManifest);
    index.assets.set('project/other/r_current', [{ dir: saved, manifest: { ...manifest, assetId: 'other' }, collection: 'project' }]);
    const duplicateAssets = ['soldier', 'other'].map(assetId => ({ slug: 'same-slug', assetId, revisionId: 'r_current',
      runtimeDownload: { url: `/${runtimePath}`, bytes: glb.length, sha256: hashBytes(glb) } }));
    await expect(stageAssetDelivery({ index, mirror, output, sourceRoot: join(root, 'source'), release: 'delivery-test',
      groups: [{ id: 'troy', assets: duplicateAssets }] })).rejects.toThrow('Duplicate download slug');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saved material identity accepts reordered fields while preserving existing source serialization', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-stage-material-'));
  try {
    const map = Buffer.from('map'), glb = Buffer.from('runtime'), source = Buffer.from('return 1;');
    const material = { materialId: 'bronze', revisionId: `sha256:${'a'.repeat(64)}`, maps: [{ file: 'baseColor.png', bytes: map.length, sha256: `sha256:${hashBytes(map)}` }] };
    const reorderedMaterial = { maps: material.maps, revisionId: material.revisionId, materialId: material.materialId };
    const files = { 'asset.glb': glb, 'source.kiln.js': source };
    const manifest = { assetId: 'soldier', revisionId: 'r_current', editable: true,
      files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: `sha256:${hashBytes(bytes)}` }])),
      build: { dependencies: [{ kind: 'kiln.material.v1', manifest: material, delivery: 'runtime' }] } };
    const saved = join(root, 'saved'), materialDir = join(root, 'material');
    await mkdir(saved); await mkdir(materialDir);
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(saved, name), bytes);
    await writeFile(join(materialDir, 'baseColor.png'), map);
    const index = { assets: new Map([['project/soldier/r_current', [{ dir: saved, manifest, collection: 'project' }]]]),
      materials: new Map([[`${material.materialId}/${material.revisionId}`, [{ dir: materialDir, manifest: reorderedMaterial }]]]) };
    const mirror = join(root, 'mirror'); await mkdir(mirror); await writeFile(join(mirror, 'soldier.glb'), glb);
    const sourceRoot = join(root, 'source'), snapshotDir = join(sourceRoot, `farm/materials/bronze/${'a'.repeat(64)}`);
    await mkdir(snapshotDir, { recursive: true });
    const originalSerialization = JSON.stringify(reorderedMaterial);
    await writeFile(join(snapshotDir, 'manifest.json'), originalSerialization);
    await stageAssetDelivery({ index, mirror, output: join(root, 'catalog.json'), sourceRoot, release: 'delivery-test',
      groups: [{ id: 'farm', assets: [{ slug: 'soldier', assetId: 'soldier', revisionId: 'r_current', runtimeDownload: { path: 'soldier.glb', url: 'https://assets.kilnstudio.tools/soldier.glb', bytes: glb.length, sha256: hashBytes(glb) } }] }] });
    expect(await readFile(join(snapshotDir, 'manifest.json'), 'utf8')).toBe(originalSerialization);
  } finally { await rm(root, { recursive: true, force: true }); }
});
