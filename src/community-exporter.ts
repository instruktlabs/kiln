import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { Document } from '@gltf-transform/core';
import { createGltfIO } from './gltf-io';
import { rigExtrasForExport } from './rig-export';
import type { AuthorExtras } from './user-data-extras';
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
): Promise<Document> {
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
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
      copy = new THREE.Mesh(geometry, spriteMaterial);
      THREE.Object3D.prototype.copy.call(copy, shadow, false);
    }
    Object.assign(copy.userData, authorExtras?.node(source), rigExtrasForExport(source));
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
  const bytes = await new GLTFExporter().parseAsync(copy, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: exportClips.filter((clip) => clip.tracks.length > 0),
  });
  const io = createGltfIO();
  const json = await io.binaryToJSON(new Uint8Array(bytes as ArrayBuffer));
  // Three names texture/sampler bindings; glTF Transform models textures by
  // image. Carry the first named binding onto an unnamed shared image so the
  // conversion retains a useful authored resource name without duplicating it.
  for (const binding of json.json.textures ?? []) {
    if (binding.source === undefined || !binding.name) continue;
    const image = json.json.images?.[binding.source];
    if (image && !image.name) image.name = binding.name;
  }
  return io.readJSON(json);
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
