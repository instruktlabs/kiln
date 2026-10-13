import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLB_BUFFER, type Document } from '@gltf-transform/core';
import { createGltfIO } from './gltf-io';
import { openShellExtras } from './open-shell';
import { rigExtrasForExport } from './rig-export';
import type { AuthorExtras } from './user-data-extras';
import { assertPortableMaterialSides } from './material-export';
import {
  collectAtlasProvenance,
  refreshAtlasDocumentProvenance,
  type AtlasProvenanceCollection,
} from './atlas-provenance';
import {
  KILN_SEMANTIC_EXTRAS_KEY,
  validateSemanticMetadataV1,
  cloneSemanticMetadataV1,
  createSemanticMetadataV1,
} from './contracts';

export function resolveGltfExporter(
  value: string | undefined = typeof process !== 'undefined'
    ? process.env['KILN_GLTF_EXPORTER']
    : undefined,
): 'legacy' | 'three' {
  if (value === undefined || value === 'legacy') return 'legacy';
  if (value === 'three') return 'three';
  throw new Error(`Invalid KILN_GLTF_EXPORTER ${JSON.stringify(value)}; use legacy or three.`);
}

export interface ExportPlatform {
  prepare(hasTextures: boolean): Promise<void>;
  decode(bytes: Uint8Array): Promise<{ data: Uint8Array; width: number; height: number }>;
}

const browserPlatform: ExportPlatform = {
  async prepare() {},
  async decode(bytes) {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]), {
      colorSpaceConversion: 'none',
    });
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('A 2D canvas is required to decode export textures.');
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { data: new Uint8Array(image.data), width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  },
};

/** Clone through the object's public API without serializing arbitrary userData. */
function cleanClone<
  T extends { userData: Record<string, unknown>; clone: (...args: never[]) => T },
>(source: T): T {
  const shadow = Object.create(source) as T;
  shadow.userData = {};
  return shadow.clone();
}

export async function communitySceneDocument(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
  platform: ExportPlatform = browserPlatform,
  authorExtras?: AuthorExtras,
  atlas: AtlasProvenanceCollection = collectAtlasProvenance(root),
): Promise<Document> {
  assertPortableMaterialSides(root);
  const materials = new Map<THREE.Material, THREE.Material>();
  const originalMaterials = new Map<THREE.Material, THREE.Material>();
  const originalGeometries = new Map<THREE.Mesh, THREE.BufferGeometry>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const directImages = new Map<THREE.Texture, { bytes: Uint8Array; mime: string }>();
  const nodes = new Map<THREE.Object3D, THREE.Object3D>();
  const encoded: Array<Promise<void>> = [];
  function texture(source: THREE.Texture): THREE.Texture {
    const found = textures.get(source);
    if (found) return found;
    const copy = cleanClone(source);
    normalizeTextureTransform(copy);
    // Texture.copy shares Source. Detach it before decoding into the export copy.
    copy.source = new THREE.TextureSource(source.image);
    textures.set(source, copy);
    const bytes = source.userData['encoded'] as { bytes?: Uint8Array; mime?: string } | undefined;
    if (bytes?.bytes) {
      // Canvas stores premultiplied color and can discard hidden cutout RGB or
      // round partial-alpha channels. Keep already-encoded direct images when
      // the exporter does not need to flip or derive a new texture from them.
      if (!copy.flipY && (bytes.mime === 'image/png' || bytes.mime === 'image/jpeg'))
        directImages.set(copy, { bytes: bytes.bytes, mime: bytes.mime });
      encoded.push(
        (async () => {
          copy.image = await platform.decode(bytes.bytes!);
          Object.defineProperty(copy, 'isDataTexture', { value: true });
          copy.format = THREE.RGBAFormat;
          copy.type = THREE.UnsignedByteType;
        })(),
      );
    }
    return copy;
  }
  function material(source: THREE.Material): THREE.Material {
    const found = materials.get(source);
    if (found) return found;
    const copy = cleanClone(source);
    // GLTFExporter writes material userData as extras: only the author's checked JSON.
    Object.assign(copy.userData, authorExtras?.material(source));
    const physical = copy as THREE.MeshPhysicalMaterial;
    if (physical.isMeshPhysicalMaterial && physical.sheen > 0) {
      // glTF has a sheen color factor, but no separate intensity. Match the
      // effective color used by Three's renderer on this detached material.
      physical.sheenColor.multiplyScalar(physical.sheen);
      physical.sheen = 1;
    }
    for (const [key, value] of Object.entries(copy)) {
      if (value instanceof THREE.Texture)
        (copy as unknown as Record<string, unknown>)[key] = texture(value);
    }
    materials.set(source, copy);
    originalMaterials.set(copy, source);
    return copy;
  }
  function node(source: THREE.Object3D): THREE.Object3D {
    if ((source as THREE.Line).isLine || (source as THREE.Points).isPoints)
      throw new Error(
        'Experimental glTF exporter supports triangle meshes and sprites, not lines or points.',
      );
    // Object3D.clone defaults to recursive; call copy with recursion disabled.
    const shadow = Object.create(source) as THREE.Object3D;
    shadow.userData = {};
    let copy = shadow.clone(false);
    // GLTFExporter uses TRS when animations are enabled. Manual matrices (including
    // expanded GPU instances in review derivatives) must populate those fields too.
    if (!copy.matrixAutoUpdate) copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
    if ((source as THREE.Scene).isScene) {
      copy = new THREE.Group();
      copy.copy(shadow, false);
    }
    if ((source as THREE.Sprite).isSprite) {
      const sprite = source as THREE.Sprite;
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.translate(0.5 - sprite.center.x, 0.5 - sprite.center.y, 0);
      geometry.rotateZ(sprite.material.rotation);
      const spriteMaterial = new THREE.MeshBasicMaterial({
        name: sprite.material.name,
        color: sprite.material.color,
        opacity: sprite.material.opacity,
        transparent: sprite.material.transparent,
        alphaTest: sprite.material.alphaTest,
        side: sprite.material.side,
        map: sprite.material.map ? texture(sprite.material.map) : null,
      });
      Object.assign(spriteMaterial.userData, authorExtras?.material(sprite.material));
      originalMaterials.set(spriteMaterial, sprite.material);
      copy = new THREE.Mesh(geometry, spriteMaterial);
      THREE.Object3D.prototype.copy.call(copy, shadow, false);
    }
    Object.assign(
      copy.userData,
      authorExtras?.node(source),
      rigExtrasForExport(source),
      openShellExtras(source),
    );
    const semantic = source.userData[KILN_SEMANTIC_EXTRAS_KEY];
    if (semantic !== undefined) {
      const checked = validateSemanticMetadataV1(semantic);
      if (!checked.valid || !checked.value)
        throw new TypeError(`Invalid ${KILN_SEMANTIC_EXTRAS_KEY} on ${source.name}`);
      copy.userData[KILN_SEMANTIC_EXTRAS_KEY] = cloneSemanticMetadataV1(checked.value);
    }
    if ((source as THREE.Sprite).isSprite) {
      const metadata = copy.userData[KILN_SEMANTIC_EXTRAS_KEY] as
        | ReturnType<typeof createSemanticMetadataV1>
        | undefined;
      copy.userData[KILN_SEMANTIC_EXTRAS_KEY] = createSemanticMetadataV1({
        ...metadata,
        roles: [
          ...(metadata?.roles ?? []).filter((role) => !role.startsWith('vfx.facing.')),
          'vfx.facing.camera-spherical',
          ...(metadata?.roles.some((role) => role.startsWith('vfx.effect.surface'))
            ? []
            : ['vfx.effect.surface.card']),
        ],
      });
    }
    if ((source as THREE.Mesh).isMesh) {
      const original = source as THREE.Mesh;
      const mesh = copy as THREE.Mesh;
      mesh.geometry = cleanClone(original.geometry);
      originalGeometries.set(mesh, original.geometry);
      mesh.material = Array.isArray(original.material)
        ? original.material.map(material)
        : material(original.material);
    }
    nodes.set(source, copy);
    for (const child of source.children) copy.add(node(child));
    return copy;
  }
  const copy = node(root);
  for (const [source, target] of nodes) {
    if (!(source as THREE.SkinnedMesh).isSkinnedMesh) continue;
    const original = source as THREE.SkinnedMesh;
    const mesh = target as THREE.SkinnedMesh;
    mesh.skeleton = original.skeleton.clone();
    mesh.skeleton.bones = original.skeleton.bones.map((bone) => {
      const mapped = nodes.get(bone);
      if (!mapped) throw new Error(`Skin bone ${bone.name} is outside the exported hierarchy.`);
      return mapped as THREE.Bone;
    });
    mesh.bind(mesh.skeleton, original.bindMatrix);
  }
  await Promise.all(encoded);
  await platform.prepare(textures.size > 0);
  // Upstream channel-packing and normal-basis conversions use drawImage, which
  // does not accept a DataTexture's {data,width,height} image in either host.
  // Adapt only those detached inputs; direct color textures keep their bytes.
  const canvasInputs = new Map<THREE.Texture, THREE.Texture>();
  const canvasInput = (map: THREE.Texture | null): THREE.Texture | null => {
    const raw = map?.image as { data?: Uint8Array; width: number; height: number } | undefined;
    if (!map || !raw?.data) return map;
    const found = canvasInputs.get(map);
    if (found) return found;
    const { data, width, height } = raw;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas is required to prepare export texture channels.');
    context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    const adapted = new THREE.Texture().copy(map);
    adapted.source = new THREE.TextureSource(canvas);
    canvasInputs.set(map, adapted);
    const direct = directImages.get(map);
    if (direct) directImages.set(adapted, direct);
    return adapted;
  };
  for (const material of materials.values()) {
    // putImageData ignores the canvas transform used by GLTFExporter for flipY.
    // A canvas image makes that explicit orientation request reach drawImage.
    for (const [key, value] of Object.entries(material)) {
      if (value instanceof THREE.Texture && value.flipY && value.image?.data)
        (material as unknown as Record<string, unknown>)[key] = canvasInput(value);
    }
    const standard = material as THREE.MeshStandardMaterial;
    if (!standard.isMeshStandardMaterial) continue;
    if (standard.metalnessMap !== standard.roughnessMap) {
      standard.metalnessMap = canvasInput(standard.metalnessMap);
      standard.roughnessMap = canvasInput(standard.roughnessMap);
    }
    standard.normalMap = canvasInput(standard.normalMap);
  }
  const exportClips = clips.map((clip) => {
    const cloned = cleanClone(clip);
    // UUID-targeted clips must point at the export copy, not the live scene.
    for (const track of cloned.tracks) {
      for (const [source, target] of nodes) {
        if (track.name.startsWith(`${source.uuid}.`))
          track.name = target.uuid + track.name.slice(source.uuid.length);
      }
    }
    // Keep advisory unresolved tracks in Kiln's review extras, not in native
    // glTF animations. Upstream otherwise emits invalid empty clip entities.
    cloned.tracks = cloned.tracks.filter((track) => {
      try {
        const binding = THREE.PropertyBinding.parseTrackName(track.name);
        return (
          ['position', 'quaternion', 'scale', 'morphTargetInfluences'].includes(
            binding.propertyName,
          ) && THREE.PropertyBinding.findNode(copy, binding.nodeName) !== null
        );
      } catch {
        return false;
      }
    });
    return cloned;
  });
  const preservedImages = new Map<number, { bytes: Uint8Array; mime: string }>();
  const exporter = new GLTFExporter().register(() => ({
    writeMesh(mesh, definition) {
      const geometry = originalGeometries.get(mesh);
      const binding = geometry && atlas.binding(geometry);
      if (binding)
        for (const primitive of definition.primitives as Array<{
          extras?: Record<string, unknown>;
        }>)
          primitive.extras = { ...primitive.extras, kilnAtlasBinding: binding };
    },
    async writeMaterialAsync(material, definition) {
      const source = originalMaterials.get(material);
      if (!source) return;
      const bag = source as unknown as Record<string, THREE.Texture | undefined>;
      const pbr = definition.pbrMetallicRoughness as
        | {
            baseColorTexture?: { extras?: Record<string, unknown> };
            metallicRoughnessTexture?: { extras?: Record<string, unknown> };
          }
        | undefined;
      for (const [slot, info] of [
        ['map', pbr?.baseColorTexture],
        ['normalMap', definition.normalTexture as { extras?: Record<string, unknown> } | undefined],
        ['metalnessMap', pbr?.metallicRoughnessTexture],
        ['roughnessMap', pbr?.metallicRoughnessTexture],
        [
          'emissiveMap',
          definition.emissiveTexture as { extras?: Record<string, unknown> } | undefined,
        ],
        ['aoMap', definition.occlusionTexture as { extras?: Record<string, unknown> } | undefined],
      ] as const) {
        const texture = bag[slot],
          ref = texture && atlas.texture(texture);
        if (ref && info) {
          const prior = info.extras?.['kilnAtlasReference'] as { id?: string } | undefined;
          if (prior && prior.id !== ref.id)
            throw new TypeError('Atlas channel packing requires one exact source identity.');
          info.extras = { ...info.extras, kilnAtlasReference: ref };
        }
      }
    },
    writeTexture(map, definition) {
      const direct = directImages.get(map);
      if (direct && typeof definition['source'] === 'number')
        preservedImages.set(definition['source'], direct);
    },
  }));
  const bytes = await exporter.parseAsync(copy, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: exportClips.filter((clip) => clip.tracks.length > 0),
  });
  const io = createGltfIO();
  const json = await io.binaryToJSON(new Uint8Array(bytes as ArrayBuffer));
  for (const [index, original] of preservedImages) {
    const image = json.json.images?.[index];
    if (!image) throw new Error('The glTF converter lost a direct texture image.');
    const uri = `kiln-direct-image-${index}`;
    image.uri = uri;
    image.mimeType = original.mime;
    delete image.bufferView;
    json.resources[uri] = new Uint8Array(original.bytes);
  }
  // GLTFExporter includes four-byte buffer alignment in generated image views.
  // Keep the BIN allocation aligned but end a PNG's view at its IEND chunk.
  // Direct authored bytes above remain untouched; this is not an input decoder.
  for (const image of json.json.images ?? []) {
    if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue;
    const view = json.json.bufferViews![image.bufferView]!;
    const buffer = json.resources[json.json.buffers?.[view.buffer]?.uri ?? GLB_BUFFER]!;
    const start = view.byteOffset ?? 0;
    const png = buffer.subarray(start, start + view.byteLength);
    const data = new DataView(png.buffer, png.byteOffset, png.byteLength);
    for (let offset = 8; offset + 12 <= png.length; ) {
      const length = data.getUint32(offset),
        end = offset + length + 12;
      if (end > png.length) break;
      if (data.getUint32(offset + 4) === 0x49454e44 && length === 0) {
        if (png.length - end <= 3 && png.subarray(end).every((byte) => byte === 0))
          view.byteLength = end;
        break;
      }
      offset = end;
    }
  }
  // Three names texture/sampler bindings; glTF Transform models textures by
  // image. Carry the first named binding onto an unnamed shared image so the
  // conversion retains a useful authored resource name without duplicating it.
  for (const binding of json.json.textures ?? []) {
    if (binding.source === undefined || !binding.name) continue;
    const image = json.json.images?.[binding.source];
    if (image && !image.name) image.name = binding.name;
  }
  const document = await io.readJSON(json);
  if (atlas.table) {
    const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]!;
    scene.setExtras({ ...scene.getExtras(), kilnAtlasProvenance: atlas.table });
    await refreshAtlasDocumentProvenance(document);
  }
  return document;
}

/** Encode the effective UV matrix in glTF's T*R*S order, including manual
 * matrices and Three's center. A sheared UV basis needs baking, not TRS. */
function normalizeTextureTransform(texture: THREE.Texture): void {
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  const e = texture.matrix.elements;
  const sx = Math.hypot(e[0], e[1]);
  const rotation = sx > 0 ? Math.atan2(-e[1], e[0]) : Math.atan2(e[3], e[4]);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const sy = e[3] * s + e[4] * c;
  const reconstructed = [sx * c, -sx * s, 0, sy * s, sy * c, 0, e[6], e[7], 1];
  const tolerance = 1e-7 * Math.max(1, ...e.map(Math.abs));
  if (
    e.some((value, i) => !Number.isFinite(value) || Math.abs(value - reconstructed[i]!) > tolerance)
  ) {
    throw new Error(
      `Texture ${texture.name || '<unnamed>'}: UV matrix contains shear or perspective that KHR_texture_transform cannot represent; lossless UV baking is not yet qualified.`,
    );
  }
  texture.offset.set(e[6], e[7]);
  texture.repeat.set(sx, sy);
  texture.rotation = rotation;
  texture.center.set(0, 0);
  // GLTFExporter reads TRS fields, not this matrix. Retain the exact matrix so
  // any host-side texture operations continue to see the authored mapping.
  texture.matrixAutoUpdate = false;
}
