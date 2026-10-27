/**
 * Cross-asset texture sharing report (#287).
 *
 * The duplication #287 reports is entirely between assets, never inside one: measured over
 * 160 assets in four real Holodeck worlds, within-asset duplicate images were 0 every time,
 * because the exporter already dedupes images inside one document. So the report is scoped
 * to a set of delivered assets, and a single asset's own distinct images are never a saving.
 *
 * Fixtures are built with glTF-Transform from fixed PNGs, so their bytes depend only on
 * pinned packages, never on Kiln's renderer.
 */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Document, WebIO } from '@gltf-transform/core';
import { textureSharingReport } from './texture-sharing';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const BASE_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGM4oaGhcUKDQUPjxJ07dwAhpgXd58qIBQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const NORMAL_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNoaPjf0PCfAUIBADX2B/1D9pjhAAAAAElFTkSuQmCC',
    'base64',
  ),
);

/** One textured triangle carrying the given images, in order: base colour, then normal. */
async function texturedGlb(images: readonly Uint8Array[]): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer);
  const material = doc.createMaterial('Brick');
  images.forEach((bytes, index) => {
    const texture = doc.createTexture(`image${index}`).setImage(bytes).setMimeType('image/png');
    if (index === 0) material.setBaseColorTexture(texture);
    else material.setNormalTexture(texture);
  });
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setMaterial(material);
  const node = doc.createNode('Tri').setMesh(doc.createMesh('Tri').addPrimitive(primitive));
  doc.createScene('Scene').addChild(node);
  return new WebIO().writeBinary(doc);
}

/** The same GLB with its JSON chunk replaced, so a test can express a layout by hand. */
function rebuilt(glb: Uint8Array, mutate: (json: Record<string, unknown>) => void): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonEnd = 20 + view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, jsonEnd)));
  mutate(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.length / 4) * 4;
  const out = new Uint8Array(20 + padded + (glb.byteLength - jsonEnd));
  out.set(glb.subarray(0, 20));
  out.fill(0x20, 20 + text.length, 20 + padded);
  out.set(text, 20);
  out.set(glb.subarray(jsonEnd), 20 + padded);
  const header = new DataView(out.buffer);
  header.setUint32(8, out.byteLength, true);
  header.setUint32(12, padded, true);
  return out;
}

test('reports one shared image as a saving and names every asset carrying it', async () => {
  const [wall, floor] = await Promise.all([
    texturedGlb([BASE_PNG, NORMAL_PNG]),
    texturedGlb([BASE_PNG]),
  ]);
  const report = await textureSharingReport([
    { name: 'wall.glb', bytes: wall },
    { name: 'floor.glb', bytes: floor },
  ]);

  expect(report.assets).toBe(2);
  expect(report.assetBytes).toBe(wall.byteLength + floor.byteLength);
  // Three embedded images, two distinct: the base colour map ships twice.
  expect(report.embeddedImages).toBe(3);
  expect(report.distinctImages).toBe(2);
  expect(report.embeddedImageBytes).toBe(BASE_PNG.length * 2 + NORMAL_PNG.length);
  expect(report.distinctImageBytes).toBe(BASE_PNG.length + NORMAL_PNG.length);
  expect(report.duplicateImageBytes).toBe(BASE_PNG.length);
  expect(report.skipped).toEqual([]);

  const shared = report.images.find((image) => image.sha256 === sha(BASE_PNG));
  expect(shared).toEqual({
    sha256: sha(BASE_PNG),
    bytes: BASE_PNG.length,
    mimeType: 'image/png',
    width: 2,
    height: 2,
    copies: 2,
    assets: ['floor.glb', 'wall.glb'],
  });
  // The map only one asset carries is reported too, with no saving behind it.
  expect(report.images.find((image) => image.sha256 === sha(NORMAL_PNG))?.copies).toBe(1);
});

test("one asset's own distinct images are never counted as a saving", async () => {
  const wall = await texturedGlb([BASE_PNG, NORMAL_PNG]);
  const report = await textureSharingReport([{ name: 'wall.glb', bytes: wall }]);

  expect(report.embeddedImages).toBe(2);
  expect(report.distinctImages).toBe(2);
  expect(report.duplicateImageBytes).toBe(0);
});

test('counts a repeated image inside one asset as a copy, not as a second distinct image', async () => {
  // Hand-built, because glTF-Transform dedupes identical images: a second image entry
  // pointing at the same buffer view. Real exports never do this -- 0 of 160 measured
  // assets did -- so the report has to stay right for the case it will not meet.
  const wall = rebuilt(await texturedGlb([BASE_PNG]), (json) => {
    (json.images as Record<string, unknown>[]).push({ ...(json.images as unknown[])[0]! });
  });

  const report = await textureSharingReport([{ name: 'wall.glb', bytes: wall }]);
  expect(report.skipped).toEqual([]);
  expect(report.embeddedImages).toBe(2);
  expect(report.distinctImages).toBe(1);
  expect(report.duplicateImageBytes).toBe(BASE_PNG.length);
  expect(report.images[0]!.copies).toBe(2);
  expect(report.images[0]!.assets).toEqual(['wall.glb']);
});

test('skips an unreadable input with its reason instead of failing the whole set', async () => {
  const wall = await texturedGlb([BASE_PNG]);
  const report = await textureSharingReport([
    { name: 'wall.glb', bytes: wall },
    {
      name: 'notes.txt',
      bytes: new TextEncoder().encode('a stray note sitting in the delivery folder'),
    },
  ]);

  expect(report.assets).toBe(1);
  expect(report.assetBytes).toBe(wall.byteLength);
  expect(report.distinctImages).toBe(1);
  expect(report.skipped).toEqual([{ name: 'notes.txt', reason: 'Not a GLB: bad magic' }]);
});

test('ignores an image already hosted outside the asset', async () => {
  const wall = rebuilt(await texturedGlb([BASE_PNG]), (json) => {
    json.images = [{ uri: 'textures/abc.png' }];
  });

  const report = await textureSharingReport([{ name: 'wall.glb', bytes: wall }]);
  expect(report.embeddedImages).toBe(0);
  expect(report.distinctImages).toBe(0);
  expect(report.duplicateImageBytes).toBe(0);
  expect(report.skipped).toEqual([]);
});

test('counts an image whose header it cannot read, without its pixel size', async () => {
  // Byte identity is what sharing turns on, so an unreadable header must not cost the
  // whole asset its report. Two assets carry the same opaque image.
  const opaque = new Uint8Array([7, 7, 7, 7, 7, 7, 7, 7]);
  const carry = (glb: Uint8Array) =>
    rebuilt(glb, (json) => {
      const views = json.bufferViews as Record<string, unknown>[];
      views.push({ buffer: 0, byteOffset: 0, byteLength: opaque.length });
      json.images = [{ bufferView: views.length - 1, mimeType: 'image/png' }];
    });
  const [wall, floor] = await Promise.all([texturedGlb([BASE_PNG]), texturedGlb([BASE_PNG])]);

  const report = await textureSharingReport([
    { name: 'wall.glb', bytes: carry(wall) },
    { name: 'floor.glb', bytes: carry(floor) },
  ]);
  expect(report.skipped).toEqual([]);
  expect(report.embeddedImages).toBe(2);
  expect(report.distinctImages).toBe(1);
  expect(report.images[0]!.copies).toBe(2);
  expect(report.images[0]!.bytes).toBe(opaque.length);
  expect(report.images[0]!.width).toBeUndefined();
  expect(report.images[0]!.height).toBeUndefined();
});

test('skips an asset whose image lives in a buffer this GLB does not carry', async () => {
  // Buffer 0 is the GLB's own binary chunk. An image on any other buffer is in a separate
  // file, so hashing the binary chunk at that offset would report bytes that are not it.
  const wall = rebuilt(await texturedGlb([BASE_PNG]), (json) => {
    (json.buffers as Record<string, unknown>[]).push({ uri: 'wall.bin', byteLength: 8 });
    (json.bufferViews as Record<string, unknown>[])[
      (json.images as Record<string, number>[])[0]!.bufferView!
    ]!.buffer = 1;
  });

  const report = await textureSharingReport([{ name: 'wall.glb', bytes: wall }]);
  expect(report.assets).toBe(0);
  expect(report.distinctImages).toBe(0);
  expect(report.skipped).toEqual([
    { name: 'wall.glb', reason: 'Image buffer view is not in this GLB binary chunk' },
  ]);
});

test('shares an image two assets carry as a base64 data URI', async () => {
  // Kiln's exporter uses buffer views, but a GLB may carry an image inline as a data URI,
  // and those bytes duplicate across assets exactly the same way.
  const inline = (glb: Uint8Array) =>
    rebuilt(glb, (json) => {
      json.images = [{ uri: `data:image/png;base64,${Buffer.from(BASE_PNG).toString('base64')}` }];
    });
  const [wall, floor] = await Promise.all([texturedGlb([BASE_PNG]), texturedGlb([BASE_PNG])]);

  const report = await textureSharingReport([
    { name: 'wall.glb', bytes: inline(wall) },
    { name: 'floor.glb', bytes: inline(floor) },
  ]);
  expect(report.skipped).toEqual([]);
  expect(report.embeddedImages).toBe(2);
  expect(report.distinctImages).toBe(1);
  expect(report.duplicateImageBytes).toBe(BASE_PNG.length);
  expect(report.images[0]).toEqual({
    sha256: sha(BASE_PNG),
    bytes: BASE_PNG.length,
    mimeType: 'image/png',
    width: 2,
    height: 2,
    copies: 2,
    assets: ['floor.glb', 'wall.glb'],
  });
});
