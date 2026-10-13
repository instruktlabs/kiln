/** Image-free source inspection. A valid region domain is not evidence of intended corner orientation. */
import * as THREE from 'three';
import {
  readAtlasTextureProvenance,
  readAtlasGeometryBinding,
  readValidatedAtlasDelivery,
  type AtlasProvenanceV1,
} from '../atlas-provenance';
import { canonicalAtlasMetadataJsonV1 } from '../texture-atlas-contract';
import { canonicalizePortableSamplerV1 } from '../portable-sampler';
import { applyPortableSamplerV1 } from '../portable-sampler-runtime';
import type { QaFinding } from './types';

export const ATLAS_QA_LIMITS = Object.freeze({
  nodes: 4096,
  depth: 128,
  textures: 128,
  bindings: 1024,
  uvVisits: 1_048_576,
  findings: 64,
  metadataBytes: 4_194_304,
});
export interface AtlasStructuralInspectionV1 {
  schemaVersion: 1;
  findings: QaFinding[];
  coverage: 'none' | 'complete' | 'partial';
  texturesChecked: number;
  bindingsChecked: number;
  uvVerticesChecked: number;
  nodesChecked: number;
  truncated: boolean;
}
const slots = [
  ['map', ['albedo']],
  ['normalMap', ['normal']],
  ['roughnessMap', ['roughness', 'metallicRoughness']],
  ['metalnessMap', ['metalness', 'metallicRoughness']],
  ['emissiveMap', ['emissive']],
  ['aoMap', ['occlusion']],
] as const;
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor))
    throw Error('metadata data field required');
  return descriptor.value;
}
type Entry = {
  texture: THREE.Texture;
  p: AtlasProvenanceV1;
  slot: string;
  material: THREE.Material;
  materialIndex: number;
};
type UvAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
function representationError(attribute: UvAttribute, value: number): number {
  // Three's toHalfFloat truncates its mantissa: allow one FP16 quantum, not half an ulp.
  if ((attribute as UvAttribute & { isFloat16BufferAttribute?: boolean }).isFloat16BufferAttribute)
    return Math.max(2 ** -24, 2 ** (Math.floor(Math.log2(Math.abs(value))) - 10));
  if (!attribute.normalized) return 0;
  const denominators: Record<string, number> = {
    '[object Uint8Array]': 255,
    '[object Uint8ClampedArray]': 255,
    '[object Int8Array]': 127,
    '[object Uint16Array]': 65535,
    '[object Int16Array]': 32767,
    '[object Uint32Array]': 4294967295,
    '[object Int32Array]': 2147483647,
  };
  const denominator = denominators[Object.prototype.toString.call(attribute.array)];
  return denominator ? 0.5 / denominator : 0;
}

export function inspectAtlasScene(root: unknown): AtlasStructuralInspectionV1 {
  const result: AtlasStructuralInspectionV1 = {
    schemaVersion: 1,
    findings: [],
    coverage: 'none',
    texturesChecked: 0,
    bindingsChecked: 0,
    uvVerticesChecked: 0,
    nodesChecked: 0,
    truncated: false,
  };
  if (!(root instanceof THREE.Object3D)) return result;
  let encountered = false,
    metadataBytes = 0,
    metadataFull = false;
  const cache = new Map<THREE.Texture, AtlasProvenanceV1 | undefined | false>();
  const unavailable = new Set<THREE.Texture>();
  const seen = new Set<THREE.Object3D>();
  const stack: { node: THREE.Object3D; path: string; depth: number }[] = [
    { node: root, path: `${(root.name || root.type).slice(0, 80)}[0]`, depth: 0 },
  ];
  const partial = () => {
    result.truncated = true;
    result.coverage = 'partial';
  };
  const finding = (
    code: string,
    message: string,
    path: string,
    entry?: Pick<Entry, 'material' | 'texture' | 'slot'>,
  ) => {
    if (result.findings.length >= ATLAS_QA_LIMITS.findings - 1) {
      partial();
      return;
    }
    result.findings.push({
      code,
      message,
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.atlas.source',
      affected: {
        nodePath: path,
        ...(entry
          ? {
              material: entry.material.name || '(unnamed material)',
              texture: entry.texture.name || '(unnamed texture)',
              attribute: entry.slot,
            }
          : {}),
      },
      repairText:
        'Restore the exact atlas metadata, named remap and compatible texture binding, then inspect again.',
    });
  };
  while (stack.length && result.findings.length < ATLAS_QA_LIMITS.findings - 1) {
    if (result.nodesChecked >= ATLAS_QA_LIMITS.nodes) {
      partial();
      break;
    }
    const { node, path, depth } = stack.pop()!;
    if (seen.has(node)) {
      partial();
      continue;
    }
    seen.add(node);
    result.nodesChecked++;
    if (!node.visible) continue;
    const room = Math.max(0, ATLAS_QA_LIMITS.nodes - result.nodesChecked - stack.length);
    if (depth >= ATLAS_QA_LIMITS.depth && node.children.length) partial();
    else {
      if (node.children.length > room) partial();
      for (let i = Math.min(node.children.length, room) - 1; i >= 0; i--) {
        const child = node.children[i]!;
        stack.push({
          node: child,
          path: `${path}/${(child.name || child.type).slice(0, 80)}[${i}]`.slice(-800),
          depth: depth + 1,
        });
      }
    }
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) continue;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const geometryCount =
      mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
    const start = mesh.geometry.drawRange.start,
      length = mesh.geometry.drawRange.count;
    let active: Set<number> | undefined;
    if (
      Number.isSafeInteger(geometryCount) &&
      geometryCount >= 0 &&
      Number.isSafeInteger(start) &&
      start >= 0 &&
      (length === Infinity || (Number.isSafeInteger(length) && length >= 0))
    ) {
      active = new Set<number>();
      const end = Math.min(geometryCount, start + length);
      if (!Array.isArray(mesh.material)) {
        if (end - start >= 3) active.add(0);
      } else {
        if (mesh.geometry.groups.length > ATLAS_QA_LIMITS.bindings) partial();
        for (
          let gi = 0;
          gi < Math.min(mesh.geometry.groups.length, ATLAS_QA_LIMITS.bindings);
          gi++
        ) {
          const group = mesh.geometry.groups[gi]!,
            materialIndex = group.materialIndex ?? 0;
          if (
            !Number.isSafeInteger(group.start) ||
            group.start < 0 ||
            !Number.isSafeInteger(group.count) ||
            group.count < 0 ||
            group.start + group.count > geometryCount ||
            !Number.isSafeInteger(materialIndex) ||
            materialIndex < 0 ||
            materialIndex >= materials.length
          ) {
            partial();
            active = undefined;
            break;
          }
          if (Math.min(end, group.start + group.count) - Math.max(start, group.start) >= 3)
            active.add(materialIndex);
        }
      }
    } else partial();
    if (active?.size === 0) continue;
    const entries: Entry[] = [];
    let associationPartial =
      materials.length > ATLAS_QA_LIMITS.bindings ||
      mesh.geometry.groups.length > ATLAS_QA_LIMITS.bindings;
    if (materials.length > ATLAS_QA_LIMITS.bindings) partial();
    for (let mi = 0; mi < Math.min(materials.length, ATLAS_QA_LIMITS.bindings); mi++) {
      const material = materials[mi];
      if (!material || material.visible === false || (active && !active.has(mi))) continue;
      for (const [slot, allowed] of slots) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (!(texture instanceof THREE.Texture)) continue;
        let p = cache.get(texture);
        if (!cache.has(texture)) {
          try {
            // Ordinary textures do not acquire an atlas requirement.
            if (
              !Object.hasOwn(texture.userData, 'kilnAtlas') &&
              !Object.hasOwn(texture.userData, 'kilnMaterialResource')
            ) {
              cache.set(texture, undefined);
              continue;
            }
            if (metadataFull || result.texturesChecked >= ATLAS_QA_LIMITS.textures) {
              partial();
              associationPartial = true;
              unavailable.add(texture);
              cache.set(texture, false);
              continue;
            }
            p = readAtlasTextureProvenance(texture);
            if (p) {
              encountered = true;
              if (result.texturesChecked >= ATLAS_QA_LIMITS.textures) {
                partial();
                cache.set(texture, false);
                continue;
              }
              metadataBytes += new TextEncoder().encode(canonicalAtlasMetadataJsonV1(p)).length;
              if (metadataBytes > ATLAS_QA_LIMITS.metadataBytes) {
                partial();
                associationPartial = true;
                metadataFull = true;
                unavailable.add(texture);
                cache.set(texture, false);
                continue;
              }
              result.texturesChecked++;
            }
            cache.set(texture, p);
          } catch {
            encountered = true;
            cache.set(texture, false);
            finding(
              'ATLAS_METADATA_INVALID',
              'Present atlas metadata is invalid or has conflicting identities.',
              path,
              { material, texture, slot },
            );
            continue;
          }
        }
        if (!p) {
          if (unavailable.has(texture)) associationPartial = true;
          continue;
        }
        if (result.bindingsChecked >= ATLAS_QA_LIMITS.bindings) {
          partial();
          associationPartial = true;
          continue;
        }
        result.bindingsChecked++;
        const entry = { texture, p, slot, material, materialIndex: mi };
        entries.push(entry);
        const image = texture.image as { width?: unknown; height?: unknown } | undefined;
        if (image?.width === undefined || image?.height === undefined) partial();
        if (
          (image?.width !== undefined && image.width !== p.manifest.width) ||
          (image?.height !== undefined && image.height !== p.manifest.height)
        )
          finding(
            'ATLAS_METADATA_INVALID',
            'Actual atlas image dimensions differ from its declared manifest.',
            path,
            entry,
          );
        if (!(allowed as readonly string[]).includes(p.spec.usage))
          finding(
            'ATLAS_SLOT_USAGE',
            'Atlas usage does not match its actual material slot.',
            path,
            entry,
          );
        try {
          const override = own(texture.userData, 'kilnPortableBinding');
          let sampler = p.manifest.sampler;
          const delivery = readValidatedAtlasDelivery(texture);
          if (delivery !== undefined) {
            if (delivery.id !== p.manifest.manifestHash) {
              finding(
                'ATLAS_METADATA_INVALID',
                'Atlas metadata differs from its validated imported delivery identity.',
                path,
                entry,
              );
              continue;
            }
            const effective = delivery.effectiveSampler;
            if (!effective) throw Error('validated imported sampler unavailable');
            const min: Record<number, string> = {
              9728: 'nearest',
              9729: 'linear',
              9984: 'nearest-mipmap-nearest',
              9985: 'linear-mipmap-nearest',
              9986: 'nearest-mipmap-linear',
              9987: 'linear-mipmap-linear',
            };
            const mag: Record<number, string> = { 9728: 'nearest', 9729: 'linear' };
            const wrap: Record<number, string> = {
              10497: 'repeat',
              33071: 'clamp-to-edge',
              33648: 'mirrored-repeat',
            };
            sampler = canonicalizePortableSamplerV1({
              minFilter: min[effective.minFilter ?? 9729],
              magFilter: mag[effective.magFilter ?? 9729],
              wrapS: wrap[effective.wrapS],
              wrapT: wrap[effective.wrapT],
            });
          } else if (override !== undefined) {
            canonicalAtlasMetadataJsonV1(override);
            if (own(override, 'schemaVersion') !== 3) throw Error('invalid override version');
            sampler = canonicalizePortableSamplerV1(own(override, 'sampler'));
          }
          const expected = applyPortableSamplerV1(new THREE.Texture(), sampler);
          if (
            texture.minFilter !== expected.minFilter ||
            texture.magFilter !== expected.magFilter ||
            texture.wrapS !== expected.wrapS ||
            texture.wrapT !== expected.wrapT ||
            texture.generateMipmaps !== expected.generateMipmaps
          )
            finding(
              'ATLAS_SAMPLER_MISMATCH',
              'Actual atlas filtering, wrapping or mip policy differs from its declared sampler.',
              path,
              entry,
            );
        } catch {
          finding(
            'ATLAS_SAMPLER_MISMATCH',
            'The effective atlas sampler declaration is invalid.',
            path,
            entry,
          );
        }
        if (texture.flipY !== false)
          finding(
            'ATLAS_BINDING_TRANSFORM',
            'Canonical atlas texture orientation requires flipY=false.',
            path,
            entry,
          );
      }
    }
    let stamp: unknown;
    try {
      stamp = own(mesh.geometry.userData, 'kilnAtlasBinding');
      if (stamp !== undefined) canonicalAtlasMetadataJsonV1(stamp);
    } catch {
      encountered = true;
      finding('ATLAS_METADATA_INVALID', 'Present named atlas binding metadata is invalid.', path);
      continue;
    }
    if (stamp === undefined) continue; // Manual full-sheet use is supported.
    encountered = true;
    const primary = entries.find((e) => e.p.manifest.manifestHash === own(stamp, 'manifestHash'));
    if (!primary) {
      if (associationPartial) {
        partial();
        continue;
      }
      finding(
        'ATLAS_BINDING_IDENTITY',
        'Named binding has no matching exact primary atlas texture.',
        path,
      );
      continue;
    }
    if (!primary.p.manifest.regions.some((r) => r.name === own(stamp, 'region'))) {
      finding(
        'ATLAS_REGION_MISSING',
        'Named binding refers to a missing atlas region.',
        path,
        primary,
      );
      continue;
    }
    let binding: ReturnType<typeof readAtlasGeometryBinding>;
    try {
      binding = readAtlasGeometryBinding(mesh.geometry, primary.p);
    } catch {
      finding(
        'ATLAS_BINDING_IDENTITY',
        'Named binding hashes, rectangles or remap formula differ from its exact atlas.',
        path,
        primary,
      );
      continue;
    }
    if (!binding) continue;
    const geometry = mesh.geometry,
      uv = geometry.getAttribute('uv'),
      position = geometry.getAttribute('position'),
      index = geometry.index;
    if (
      !uv ||
      !position ||
      uv.itemSize !== 2 ||
      uv.count !== position.count ||
      !Number.isSafeInteger(uv.count) ||
      (uv as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ||
      (
        (uv as THREE.InterleavedBufferAttribute).data as
          | (THREE.InterleavedBuffer & { isInstancedInterleavedBuffer?: boolean })
          | undefined
      )?.isInstancedInterleavedBuffer
    ) {
      finding(
        'ATLAS_UV_DOMAIN',
        'Named atlas binding requires matching finite per-vertex UV0 and positions.',
        path,
        primary,
      );
      continue;
    }
    const count = index?.count ?? position.count;
    const drawStart = geometry.drawRange.start,
      drawCount = geometry.drawRange.count;
    if (
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(drawStart) ||
      drawStart < 0 ||
      (drawCount !== Infinity && (!Number.isSafeInteger(drawCount) || drawCount < 0)) ||
      geometry.groups.length > ATLAS_QA_LIMITS.bindings
    ) {
      partial();
      continue;
    }
    const drawEnd = Math.min(count, drawStart + drawCount);
    const ranges = Array.isArray(mesh.material)
      ? geometry.groups
      : [{ start: 0, count, materialIndex: 0 }];
    for (const entry of entries) {
      const region = entry.p.manifest.regions.find((r) => r.name === binding.region);
      if (entry.p.manifest.layoutHash !== primary.p.manifest.layoutHash || !region) {
        finding(
          'ATLAS_BINDING_IDENTITY',
          'Companion atlas does not share the named primary layout and region.',
          path,
          entry,
        );
        continue;
      }
      if (entry.texture.channel !== 0) {
        finding(
          'ATLAS_BINDING_TRANSFORM',
          'Named atlas remap binds UV0; the texture selects another UV channel.',
          path,
          entry,
        );
        continue;
      }
      const texture = entry.texture;
      const matrix = texture.matrixAutoUpdate
        ? new THREE.Matrix3().setUvTransform(
            texture.offset.x,
            texture.offset.y,
            texture.repeat.x,
            texture.repeat.y,
            texture.rotation,
            texture.center.x,
            texture.center.y,
          )
        : texture.matrix.clone();
      if (!matrix.elements.every(Number.isFinite)) {
        finding('ATLAS_BINDING_TRANSFORM', 'Atlas texture transform is nonfinite.', path, entry);
        continue;
      }
      const center = binding.mode === 'texel-center' ? 0.5 : 0;
      const minX = (region.content.x + center) / entry.p.manifest.width,
        maxX = (region.content.x + region.content.width - center) / entry.p.manifest.width;
      const minY = (region.content.y + center) / entry.p.manifest.height,
        maxY = (region.content.y + region.content.height - center) / entry.p.manifest.height;
      // Four Float32 ulps at the unit domain cover representable boundary roundoff.
      const tolerance = 4 * 2 ** -23;
      let invalid = false;
      const point = new THREE.Vector2();
      for (const range of ranges) {
        if ((range.materialIndex ?? 0) !== entry.materialIndex) continue;
        if (
          !Number.isSafeInteger(range.start) ||
          range.start < 0 ||
          !Number.isSafeInteger(range.count) ||
          range.count < 0 ||
          range.start + range.count > count
        ) {
          partial();
          continue;
        }
        const rangeStart = Math.max(drawStart, range.start),
          intersectionEnd = Math.min(drawEnd, range.start + range.count);
        const rangeEnd = rangeStart + Math.floor(Math.max(0, intersectionEnd - rangeStart) / 3) * 3;
        for (let i = rangeStart; i < rangeEnd; i++) {
          if (result.uvVerticesChecked >= ATLAS_QA_LIMITS.uvVisits) {
            partial();
            break;
          }
          result.uvVerticesChecked++;
          const vertex = index ? index.getX(i) : i;
          if (!Number.isSafeInteger(vertex) || vertex < 0 || vertex >= uv.count) {
            invalid = true;
            break;
          }
          const u = uv.getX(vertex),
            v = uv.getY(vertex);
          point.set(u, v).applyMatrix3(matrix);
          if (
            !Number.isFinite(u) ||
            !Number.isFinite(v) ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
          ) {
            invalid = true;
            break;
          }
          const eu = representationError(uv, u),
            ev = representationError(uv, v),
            e = matrix.elements;
          const toleranceX = tolerance + Math.abs(e[0]!) * eu + Math.abs(e[3]!) * ev;
          const toleranceY = tolerance + Math.abs(e[1]!) * eu + Math.abs(e[4]!) * ev;
          // Excess uncertainty is unmeasured, not an arbitrarily enlarged acceptance epsilon.
          if (
            toleranceX > Math.max(1 / entry.p.manifest.width, maxX - minX) / 2 ||
            toleranceY > Math.max(1 / entry.p.manifest.height, maxY - minY) / 2
          ) {
            partial();
            break;
          }
          if (
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x < minX - toleranceX ||
            point.x > maxX + toleranceX ||
            point.y < minY - toleranceY ||
            point.y > maxY + toleranceY
          ) {
            invalid = true;
            break;
          }
        }
        if (invalid) break;
      }
      if (invalid)
        finding(
          'ATLAS_UV_DOMAIN',
          'Drawn effective UV0 escapes the named atlas content domain or is nonfinite.',
          path,
          entry,
        );
    }
  }
  if (result.findings.length >= ATLAS_QA_LIMITS.findings - 1) partial();
  if (result.truncated && encountered)
    result.findings.push({
      code: 'ATLAS_INSPECTION_PARTIAL',
      disposition: 'observe',
      dimension: 'exportIntegrity',
      profile: 'material.atlas.source',
      message:
        'Atlas source inspection did not cover every declared binding or drawn UV because bounded work, decoded dimensions or association was unavailable.',
      measurement: {
        name: 'atlasSourceCoverage',
        actual: 'partial',
        breakdown: {
          nodes: result.nodesChecked,
          textures: result.texturesChecked,
          bindings: result.bindingsChecked,
          uvVisits: result.uvVerticesChecked,
        },
      },
    });
  if (!result.truncated) result.coverage = encountered ? 'complete' : 'none';
  return result;
}
