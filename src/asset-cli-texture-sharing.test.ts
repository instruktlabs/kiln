/**
 * `kiln textures` (#287): the cross-asset duplication report over delivered assets.
 *
 * It reads bytes and writes nothing, so it can be pointed at a frozen delivery folder.
 */
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import { encodePng } from './views/png';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const png = (rgb: number[]) => new Uint8Array(encodePng(new Uint8Array(rgb), 2, 2));
const LEAF = png([30, 120, 40, 40, 140, 50, 30, 110, 35, 50, 150, 60]);
const BARK = png([90, 70, 50, 100, 80, 60, 85, 65, 45, 110, 90, 70]);

/** One textured triangle carrying the given images: base colour first, then normal. */
async function texturedGlb(images: readonly Uint8Array[]): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type: 'VEC2' | 'VEC3', values: number[]) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const material = doc.createMaterial('Plant');
  images.forEach((bytes, index) => {
    const texture = doc.createTexture(`image${index}`).setImage(bytes).setMimeType('image/png');
    if (index === 0) material.setBaseColorTexture(texture);
    else material.setNormalTexture(texture);
  });
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('TEXCOORD_0', accessor('VEC2', [0, 0, 1, 0, 0, 1]))
    .setMaterial(material);
  doc
    .createScene('Scene')
    .addChild(doc.createNode('Plant').setMesh(doc.createMesh('Plant').addPrimitive(primitive)));
  return new WebIO().writeBinary(doc);
}

test('kiln textures reports the duplication a pack ships and leaves every file alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-texture-sharing-'));
  const run = (args: string[]) =>
    spawnSync(process.execPath, [resolve('src/cli.ts'), ...args], {
      cwd: root,
      env: { ...process.env, KILN_RENDER: 'cpu' },
      encoding: 'utf8',
    });
  try {
    // Three plants on one shared leaf atlas: the pack's own material family.
    const [palm, fern, shrub] = await Promise.all([
      texturedGlb([LEAF, BARK]),
      texturedGlb([LEAF]),
      texturedGlb([LEAF]),
    ]);
    await Promise.all([
      writeFile(join(root, 'palm.glb'), palm),
      writeFile(join(root, 'fern.glb'), fern),
      writeFile(join(root, 'shrub.glb'), shrub),
      writeFile(join(root, 'notes.md'), 'not an asset'),
    ]);

    const receipt = run(['textures', '.', '--json']);
    expect(receipt.status).toBe(0);
    const report = JSON.parse(receipt.stdout);
    expect(report.ok).toBe(true);
    expect(report.version).toBe('kiln.texture-sharing.v1');
    expect(report.assets).toBe(3);
    expect(report.embeddedImages).toBe(4);
    expect(report.distinctImages).toBe(2);
    expect(report.duplicateImageBytes).toBe(LEAF.length * 2);
    expect(report.skipped).toEqual([]);
    // Largest saving first, and the atlas names every asset shipping a copy.
    expect(report.images[0].sha256).toBe(sha(LEAF));
    expect(report.images[0].copies).toBe(3);
    expect(report.images[0].assets).toEqual(['fern.glb', 'palm.glb', 'shrub.glb']);

    // Named files are read directly, and the report says what to do about a saving.
    const text = run(['textures', 'palm.glb', 'fern.glb']);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain('2 distinct');
    expect(text.stdout).toContain('--textures external');

    // One asset alone has nothing to share, which is the normal per-asset case.
    const alone = run(['textures', 'palm.glb', '--json']);
    expect(JSON.parse(alone.stdout).duplicateImageBytes).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
