import {
  LoadingManager,
  TextureLoader,
  Texture,
  type Object3D,
  type Mesh,
  type BufferGeometry,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateAssetGlb } from '../assets';

export function disposeAssetModel(model: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  for (const value of [...geometries, ...materials, ...textures]) value.dispose();
}

/**
 * Parse self-contained GLBs under MCP Apps' img-src data: / connect-src none policy.
 * ImageBitmapLoader fetches even blob/data URLs. Use the documented image handler
 * instead, preserving GLTFLoader's sampler, UV, color-space and extension logic.
 * Only the parser's private JSON copy changes; downloaded GLB bytes remain exact.
 */
export async function loadAssetGlb(bytes: Uint8Array) {
  validateAssetGlb(bytes);
  const manager = new LoadingManager();
  let imageFailed = false;
  manager.onError = () => {
    imageFailed = true;
  };
  manager.addHandler(/^data:image\//, new TextureLoader(manager));
  manager.setURLModifier((url) => {
    if (!url.startsWith('blob:') && !url.startsWith('data:'))
      throw new Error('External model resources are not loaded');
    return url;
  });
  const loader = new GLTFLoader(manager);
  loader.register((parser) => ({
    name: 'KILN_embedded_images',
    async beforeRoot() {
      for (const image of parser.json.images ?? []) {
        if (image.bufferView === undefined) continue;
        const buffer = new Uint8Array(await parser.getDependency('bufferView', image.bufferView));
        let binary = '';
        for (let i = 0; i < buffer.length; i += 8192)
          binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
        if (!/^image\/(png|jpeg|webp|avif)$/.test(image.mimeType ?? ''))
          throw new Error('Unsupported embedded image type');
        image.uri = `data:${image.mimeType};base64,${btoa(binary)}`;
        delete image.bufferView;
      }
    },
  }));
  const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
  if (imageFailed) {
    for (const scene of gltf.scenes) disposeAssetModel(scene);
    throw new Error('An embedded texture could not be decoded.');
  }
  // GLTFLoader deliberately converts failed images to null maps. Never commit a
  // material-degraded scene, including resources loaded later for detached LODs.
  return Object.assign(gltf, {
    assertTexturesLoaded() {
      if (imageFailed) throw new Error('An embedded texture could not be decoded.');
    },
  });
}
