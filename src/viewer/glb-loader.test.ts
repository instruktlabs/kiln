import { expect, spyOn, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, TextureLoader } from 'three';
import { loadAssetGlb, disposeAssetModel } from './glb-loader';
import { loadViewerLevels } from './lod';

function fixture(
  image: Record<string, unknown> = { bufferView: 1, mimeType: 'image/png' },
  late = false,
) {
  const binary = new Uint8Array(40);
  binary.set([1, 2, 3, 4], 36);
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: late
        ? [{ mesh: 0, extensions: { MSFT_lod: { ids: [1] } } }, { mesh: 1 }]
        : [{ mesh: 0 }],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 }, material: late ? 1 : 0 }] },
        ...(late ? [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] : []),
      ],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }, {}],
      textures: [{ source: 0 }],
      images: [image],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      ],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 4 },
      ],
    }),
  );
  const size = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + size + binary.length);
  const header = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, 0x46546c67],
    [4, 2],
    [8, bytes.length],
    [12, size],
    [16, 0x4e4f534a],
    [20 + size, binary.length],
    [24 + size, 0x004e4942],
  ])
    header.setUint32(offset!, value!, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(json, 20);
  bytes.set(binary, 28 + size);
  return bytes;
}

test('embedded bytes use the image handler without mutating the GLB', async () => {
  const urls: string[] = [];
  const loader = spyOn(TextureLoader.prototype, 'load').mockImplementation((url, loaded) => {
    urls.push(url);
    const texture = new Texture<HTMLImageElement>();
    queueMicrotask(() => loaded?.(texture));
    return texture;
  });
  try {
    const bytes = fixture();
    const before = bytes.slice();
    const gltf = await loadAssetGlb(bytes);
    gltf.assertTexturesLoaded();
    expect(urls).toEqual(['data:image/png;base64,AQIDBA==']);
    expect(bytes).toEqual(before);
    expect((gltf.scene.children[0] as Mesh).material).toBeInstanceOf(MeshStandardMaterial);
    disposeAssetModel(gltf.scene);
  } finally {
    loader.mockRestore();
  }
});

test('a failed image decode rejects the model instead of committing a null map', async () => {
  const loader = spyOn(TextureLoader.prototype, 'load').mockImplementation(function (
    this: TextureLoader,
    url,
    _loaded,
    _progress,
    failed,
  ) {
    queueMicrotask(() => {
      this.manager.itemError(url);
      failed?.(new Error('Test image decoder failure'));
    });
    return new Texture<HTMLImageElement>();
  });
  try {
    await expect(loadAssetGlb(fixture())).rejects.toThrow('embedded texture');
  } finally {
    loader.mockRestore();
  }
});

test('unsupported embedded image formats and external URLs fail before decoding', async () => {
  await expect(loadAssetGlb(fixture({ bufferView: 1, mimeType: 'image/svg+xml' }))).rejects.toThrow(
    'Unsupported embedded image',
  );
  await expect(loadAssetGlb(fixture({ uri: 'https://example.invalid/image.png' }))).rejects.toThrow(
    'embed',
  );
});

test('a texture failure in a detached LOD is detected before the stage can commit', async () => {
  const loader = spyOn(TextureLoader.prototype, 'load').mockImplementation(function (
    this: TextureLoader,
    url,
    _loaded,
    _progress,
    failed,
  ) {
    queueMicrotask(() => {
      this.manager.itemError(url);
      failed?.(new Error('Test LOD image decoder failure'));
    });
    return new Texture<HTMLImageElement>();
  });
  try {
    const gltf = await loadAssetGlb(fixture(undefined, true));
    expect(() => gltf.assertTexturesLoaded()).not.toThrow();
    const levels = await loadViewerLevels(gltf);
    expect(levels?.chains.length).toBe(1);
    expect(() => gltf.assertTexturesLoaded()).toThrow('embedded texture');
    for (const root of [gltf.scene, ...levels!.chains.flatMap((chain) => chain.levels.slice(1))])
      disposeAssetModel(root);
  } finally {
    loader.mockRestore();
  }
});

test('disposing a rejected model releases shared geometry, materials and textures once', () => {
  const geometry = new BoxGeometry();
  const map = new Texture();
  const material = new MeshStandardMaterial({ map });
  const root = new Group().add(new Mesh(geometry, material), new Mesh(geometry, [material]));
  const counts = [0, 0, 0];
  [geometry, material, map].forEach((resource, i) => {
    resource.addEventListener('dispose', () => {
      counts[i]!++;
    });
  });
  disposeAssetModel(root);
  expect(counts).toEqual([1, 1, 1]);
});
