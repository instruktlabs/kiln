/**
 * three.js runtime delivery target (delivery contract item 6).
 *
 * Derives a GLB for a three.js application from an already-written Kiln GLB:
 * - scoped GPU instancing (`EXT_mesh_gpu_instancing`) of the identical mesh children under a
 *   node marked by `repeatInstances(parent)`;
 * - vertex reordering, `KHR_mesh_quantization` and `EXT_meshopt_compression`;
 * - KTX2 (`KHR_texture_basisu`) only when the host supplies an encoder, reported `skipped`
 *   otherwise.
 *
 * Kept: `_EDGE`/`_CAVITY` and author underscore attributes such as `_WET` (float32, never quantized),
 * semantic roles and kit extras, hidden collider nodes, anchors, ports and `MSFT_lod` chains.
 * A collider node keeps its authored transform: its proxy mesh moves to a child first, so the
 * dequantization transform lands on that child instead of the collider's size. Static mesh
 * dequantization is recorded in nodeScale; skinned meshes instead retain it in their inverse
 * bind matrices. Consumers must preserve the loaded node, skeleton and bind transforms,
 * rather than re-parenting bare geometry.
 */
import {
  type Document,
  Format,
  Logger,
  type Mesh,
  type Node,
  type Texture,
  PropertyType,
} from '@gltf-transform/core';
import {
  EXTMeshGPUInstancing,
  EXTMeshoptCompression,
  KHRTextureBasisu,
} from '@gltf-transform/extensions';
import { dedup, quantize, reorder } from '@gltf-transform/functions';
import type { Property } from '@gltf-transform/core';
import * as THREE from 'three';
import { KILN_SEMANTIC_ROLES, readSemanticMetadataV1FromExtras } from './contracts/semantic';
import { createGltfIO, MSFT_LOD } from './gltf-io';
import { deliveryNodePaths } from './delivery-inspect';
import { KILN_REPEAT_INSTANCES_KEY } from './delivery';
import { isHiddenGltfNode } from './metrics';
import { isKtx2, sha256Hex } from './runtime-textures';

/** Bits per quantized attribute class; custom underscore attributes stay float32. */
export const RUNTIME_THREE_QUANTIZATION = Object.freeze({
  volume: 'mesh' as const,
  position: 14,
  normal: 10,
  texcoord: 12,
  color: 8,
  weight: 8,
});
const QUANTIZED_SEMANTICS =
  /^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+|JOINTS_\d+|WEIGHTS_\d+)$/;

/** The material slot an image serves; `other` covers extension textures. */
export type RuntimeThreeKtx2SlotV1 =
  | 'baseColor'
  | 'emissive'
  | 'normal'
  | 'metallicRoughness'
  | 'occlusion'
  | 'other';
export interface RuntimeThreeKtx2InputV1 {
  /** The encoded source image (PNG or JPEG). */
  image: Uint8Array;
  mimeType: string;
  /** Texture name in the GLB. */
  name: string;
  /** sRGB for base colour and emissive slots, linear otherwise. */
  colorSpace: 'srgb' | 'linear';
  /**
   * The slot this image serves. An image in several linear slots reports the first of
   * normal, metallicRoughness, occlusion, other. An image in both an sRGB and a linear slot
   * is refused, because one encoding cannot serve both.
   */
  slot: RuntimeThreeKtx2SlotV1;
}
/** What an encoder records about itself: the receipt binds these facts to the bytes. */
export interface RuntimeThreeKtx2EncoderIdentityV1 {
  name: string;
  version: string;
  /** `sha256:` of the Basis Universal WebAssembly the encoder ran, when known. */
  basisWasmSha256?: string;
  /** Every mode, quality, mipmap and supercompression setting, per colour space. */
  settings: Record<string, unknown>;
}
/** A KTX2 encoder function, optionally carrying its identity for `delivery.ktx2.encoder`. */
export type RuntimeThreeKtx2EncoderV1 = ((
  input: RuntimeThreeKtx2InputV1,
) => Promise<Uint8Array>) & {
  identity?: RuntimeThreeKtx2EncoderIdentityV1;
};
export interface RuntimeThreeOptionsV1 {
  /**
   * Optional KTX2 encoder: a host binding, or `createKtx2Encoder()` over the optional
   * `ktx2-encoder` peer. Without one, textures stay PNG/JPEG and the report says `skipped`.
   */
  ktx2Encoder?: RuntimeThreeKtx2EncoderV1;
  /**
   * Buffer compression. `meshopt` (default) requires `EXT_meshopt_compression` and a
   * Meshopt decoder in the loader. `none` writes plain buffers for loaders without one;
   * quantization, instancing and every preserved feature stay.
   */
  compression?: RuntimeThreeCompression;
}
export type RuntimeThreeCompression = 'meshopt' | 'none';
export interface RuntimeThreeNodeScaleV1 {
  /** Delivery path of the node whose matrix now carries the dequantization. */
  node: string;
  mesh: string;
  /** True when Kiln or the quantizer moved the mesh onto this new child node. */
  meshMovedToChild: boolean;
  /** Path of the authored node whose transform is unchanged, when the mesh moved. */
  authoredNode?: string;
  /** Uniform dequantization scale and offset folded into this node's local matrix. */
  dequantization: { scale: number; offset: [number, number, number] };
  /** The node's local scale after export (authored scale times dequantization). */
  localScale: [number, number, number];
}
export interface RuntimeThreeDeliveryV1 {
  target: 'three';
  extensionsUsed: string[];
  extensionsRequired: string[];
  compression: { extension: 'EXT_meshopt_compression'; method: 'quantize' } | { extension: 'none' };
  quantization: {
    extension: 'KHR_mesh_quantization';
    volume: 'mesh';
    bits: { position: number; normal: number; texcoord: number; color: number; weight: number };
    /** Underscore attributes are never quantized and stay FLOAT, unnormalized. */
    customAttributes: 'float32';
  };
  /**
   * Every node whose local matrix carries a quantization transform. Positions in its mesh are
   * normalized integers; only the node's matrix restores metres. Read geometry through the
   * node's world matrix; a bare geometry re-parented elsewhere drops the scale.
   */
  nodeScale: RuntimeThreeNodeScaleV1[];
  /** Collider nodes whose proxy mesh moved to a child so the collider transform stays exact. */
  colliderProxies: { collider: string; proxy: string }[];
  customAttributes: { name: string; meshes: number; componentType: 'FLOAT'; normalized: false }[];
  instancing: { node: string; mesh: string; count: number; instances: string[] }[];
  ktx2: {
    status: 'encoded' | 'skipped';
    textures: number;
    reason?: string;
    /** The encoder's own identity, when it declared one. */
    encoder?: RuntimeThreeKtx2EncoderIdentityV1;
  };
  preserved: {
    lodChains: number;
    hiddenNodes: number;
    colliders: number;
    anchors: number;
    ports: number;
    kitModules: number;
  };
}

const customRank = (name: string) => (name === '_EDGE' ? 0 : name === '_CAVITY' ? 1 : 2);
const rolesOf = (node: Node): string[] =>
  readSemanticMetadataV1FromExtras(node.getExtras())?.roles ?? [];
const isCollider = (node: Node) =>
  rolesOf(node).some((role) => role.startsWith(`${KILN_SEMANTIC_ROLES.collider}.`));

/** Group the identical mesh leaves under each repeatInstances parent into one batch node. */
interface InstancingRecord {
  node: Node;
  mesh: string;
  count: number;
  instances: string[];
}
/** Content identity of a mesh: its primitives' accessors, material and mode. */
function meshSignature(mesh: Mesh, ids: Map<Property, number>): string {
  const id = (property: Property | null) => {
    if (!property) return -1;
    if (!ids.has(property)) ids.set(property, ids.size);
    return ids.get(property)!;
  };
  return mesh
    .listPrimitives()
    .map(
      (primitive) =>
        `${primitive.getMode()}:${id(primitive.getMaterial())}:${id(primitive.getIndices())}:${primitive
          .listSemantics()
          .sort()
          .map((semantic) => `${semantic}=${id(primitive.getAttribute(semantic))}`)
          .join(',')}:${primitive.listTargets().length}`,
    )
    .join('|');
}
function applyScopedInstancing(doc: Document): InstancingRecord[] {
  const report: InstancingRecord[] = [];
  const ids = new Map<Property, number>();
  const parents = doc
    .getRoot()
    .listNodes()
    .filter((node) => node.getExtras()[KILN_REPEAT_INSTANCES_KEY] !== undefined);
  let extension: EXTMeshGPUInstancing | undefined;
  for (const parent of parents) {
    const groups = new Map<string, Node[]>();
    for (const child of parent.listChildren()) {
      const mesh = child.getMesh();
      if (
        !mesh ||
        child.listChildren().length ||
        child.getSkin() ||
        child.listExtensions().length ||
        isHiddenGltfNode(child) ||
        rolesOf(child).length ||
        Object.keys(child.getExtras()).length ||
        child.getWeights().length
      )
        continue;
      const signature = meshSignature(mesh, ids);
      groups.set(signature, [...(groups.get(signature) ?? []), child]);
    }
    let batchIndex = 0;
    for (const nodes of groups.values()) {
      if (nodes.length < 2) continue;
      const mesh = nodes[0]!.getMesh()!;
      extension ??= doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
      const buffer = doc.getRoot().listBuffers()[0];
      const accessor = (type: 'VEC3' | 'VEC4', values: number[]) =>
        doc
          .createAccessor()
          .setType(type)
          .setArray(new Float32Array(values))
          .setBuffer(buffer ?? null);
      const t: number[] = [],
        r: number[] = [],
        s: number[] = [];
      for (const node of nodes) {
        t.push(...node.getTranslation());
        r.push(...node.getRotation());
        s.push(...node.getScale());
      }
      const batch = extension
        .createInstancedMesh()
        .setAttribute('TRANSLATION', accessor('VEC3', t))
        .setAttribute('ROTATION', accessor('VEC4', r))
        .setAttribute('SCALE', accessor('VEC3', s));
      const name = `${parent.getName() || 'Node'}_Instances${batchIndex ? `_${batchIndex}` : ''}`;
      batchIndex++;
      const batchNode = doc
        .createNode(name)
        .setMesh(mesh)
        .setExtension('EXT_mesh_gpu_instancing', batch);
      parent.addChild(batchNode);
      report.push({
        node: batchNode,
        mesh: mesh.getName(),
        count: nodes.length,
        instances: nodes.map((node) => node.getName()),
      });
      for (const node of nodes) {
        const own = node.getMesh();
        node.dispose();
        // A merged duplicate mesh that nothing else draws goes with its node.
        if (
          own &&
          own !== mesh &&
          !own.listParents().some((p) => p.propertyType === PropertyType.NODE)
        )
          own.dispose();
      }
    }
    const extras = { ...parent.getExtras() };
    delete extras[KILN_REPEAT_INSTANCES_KEY];
    parent.setExtras(extras);
  }
  return report;
}

/** Move each collider's proxy mesh to a child so quantization never rescales the collider. */
function splitColliderProxies(doc: Document) {
  const report: { collider: Node; proxy: Node }[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !isCollider(node)) continue;
    const proxy = doc.createNode(`${node.getName()}_Proxy`).setMesh(mesh);
    node.setMesh(null).addChild(proxy);
    report.push({ collider: node, proxy });
  }
  return report;
}

async function encodeKtx2(
  doc: Document,
  encoder: RuntimeThreeOptionsV1['ktx2Encoder'],
  sources: Map<Texture, string>,
): Promise<RuntimeThreeDeliveryV1['ktx2']> {
  const textures = doc
    .getRoot()
    .listTextures()
    .filter((texture) => texture.getMimeType() !== 'image/ktx2' && texture.getImage());
  if (!encoder)
    return {
      status: 'skipped',
      textures: textures.length,
      reason: 'No KTX2 encoder was supplied; textures stay PNG or JPEG.',
    };
  const slots = new Map<Texture, Set<RuntimeThreeKtx2SlotV1>>();
  const use = (texture: Texture | null, slot: RuntimeThreeKtx2SlotV1) => {
    if (texture) slots.set(texture, (slots.get(texture) ?? new Set()).add(slot));
  };
  for (const material of doc.getRoot().listMaterials()) {
    use(material.getBaseColorTexture(), 'baseColor');
    use(material.getEmissiveTexture(), 'emissive');
    use(material.getNormalTexture(), 'normal');
    use(material.getMetallicRoughnessTexture(), 'metallicRoughness');
    use(material.getOcclusionTexture(), 'occlusion');
  }
  const order: RuntimeThreeKtx2SlotV1[] = [
    'baseColor',
    'emissive',
    'normal',
    'metallicRoughness',
    'occlusion',
  ];
  for (const texture of textures) {
    const used = slots.get(texture) ?? new Set<RuntimeThreeKtx2SlotV1>();
    const srgb = used.has('baseColor') || used.has('emissive');
    // Any other parent (an extension texture info) is a linear use the core slots do not name.
    const other = texture
      .listParents()
      .some((parent) => parent.propertyType !== PropertyType.ROOT && !isCoreMaterialUse(parent));
    const linear = [...used].some((slot) => slot !== 'baseColor' && slot !== 'emissive') || other;
    if (srgb && linear)
      throw new Error(
        `Texture ${JSON.stringify(texture.getName())} is used by both sRGB and linear material slots; one KTX2 encoding cannot serve both. Use separate images.`,
      );
    const original = texture.getImage()!;
    const image = await encoder({
      image: original,
      mimeType: texture.getMimeType(),
      name: texture.getName(),
      colorSpace: srgb ? 'srgb' : 'linear',
      slot: order.find((slot) => used.has(slot)) ?? 'other',
    });
    if (!(image instanceof Uint8Array) || !isKtx2(image))
      throw new Error('ktx2Encoder must return KTX2 bytes starting with the KTX2 identifier');
    sources.set(texture, `sha256:${await sha256Hex(original)}`);
    texture.setImage(image).setMimeType('image/ktx2');
    const uri = texture.getURI();
    if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, '.ktx2'));
  }
  if (textures.length) {
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    // Atlas references name the final image bytes and MIME type: rebind them to the KTX2
    // bytes, then check exactly as import will.
    const { refreshAtlasDocumentProvenance, validateAtlasDocumentProvenance } = await import(
      './atlas-provenance'
    );
    await refreshAtlasDocumentProvenance(doc);
    await validateAtlasDocumentProvenance(doc);
  }
  return {
    status: 'encoded',
    textures: textures.length,
    ...(encoder.identity ? { encoder: structuredClone(encoder.identity) } : {}),
  };
}

/** A material's core texture info, as opposed to an extension property's. */
function isCoreMaterialUse(parent: Property): boolean {
  return parent.propertyType === PropertyType.MATERIAL;
}

function decomposeDelta(before: number[], after: number[]) {
  const delta = new THREE.Matrix4()
    .fromArray(before)
    .invert()
    .multiply(new THREE.Matrix4().fromArray(after));
  const position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  delta.decompose(position, quaternion, scale);
  return {
    scale: scale.x,
    offset: [position.x, position.y, position.z] as [number, number, number],
  };
}

/** What the derivation returns beside the GLB: facts and, on request, the `.gltf` layout. */
export interface RuntimeThreeResult {
  glb: Uint8Array;
  delivery: RuntimeThreeDeliveryV1;
  /** Pre-encode `sha256:` of each image index KTX2 encoding replaced. */
  imageSources: Map<number, string>;
  /** The same document as JSON glTF, when `layout.gltfBasename` was given. */
  gltf?: { json: Record<string, unknown>; resources: Record<string, Uint8Array> };
}

/**
 * Transform written GLB bytes into the three.js runtime delivery GLB. `meshoptEncoder` is the
 * `MeshoptEncoder` from the `meshoptimizer` package (loaded by the caller so this module stays
 * import-light). `layout.gltfBasename` also writes the same document as JSON glTF, whose
 * buffers are named `<basename>.bin`; its image URIs are the writer's and are renamed by the
 * caller.
 */
export async function deliverRuntimeThreeGlb(
  bytes: Uint8Array,
  meshoptEncoder: unknown,
  options: RuntimeThreeOptionsV1 = {},
  layout: { gltfBasename?: string } = {},
): Promise<RuntimeThreeResult> {
  const compression = options.compression ?? 'meshopt';
  if (compression !== 'meshopt' && compression !== 'none')
    throw new Error('Runtime three compression must be meshopt or none');
  const io = createGltfIO().registerDependencies({
    'meshopt.encoder': meshoptEncoder,
  });
  const doc = await io.readBinary(bytes);
  doc.setLogger(new Logger(Logger.Verbosity.SILENT));
  // Merge identical accessors so equal children are recognisable by content; names stay.
  await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR], keepUniqueNames: true }));
  const instanced = applyScopedInstancing(doc);
  const proxies = splitColliderProxies(doc);

  // Record every mesh node's matrix so the quantizer's node transforms can be reported.
  const matrices = new Map<Node, number[]>();
  for (const node of doc.getRoot().listNodes())
    if (node.getMesh()) matrices.set(node, [...node.getMatrix()]);
  await doc.transform(
    reorder({ encoder: meshoptEncoder as never, target: 'size' }),
    quantize({
      pattern: QUANTIZED_SEMANTICS,
      patternTargets: QUANTIZED_SEMANTICS,
      quantizationVolume: 'mesh',
      quantizePosition: RUNTIME_THREE_QUANTIZATION.position,
      quantizeNormal: RUNTIME_THREE_QUANTIZATION.normal,
      quantizeTexcoord: RUNTIME_THREE_QUANTIZATION.texcoord,
      quantizeColor: RUNTIME_THREE_QUANTIZATION.color,
      quantizeWeight: RUNTIME_THREE_QUANTIZATION.weight,
    }),
  );
  if (compression === 'meshopt')
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const encodedSources = new Map<Texture, string>();
  const ktx2 = await encodeKtx2(doc, options.ktx2Encoder, encodedSources);

  // The quantizer moves a mesh to a new unnamed child when its node has children or is
  // animated; name it after its authored node so the delivery path is stable.
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || matrices.has(node) || node.getName()) continue;
    const parent = node.getParentNode();
    node.setName(`${parent?.getName() || 'Node'}_Mesh`);
  }
  const after = deliveryNodePaths(doc);
  const pathOf = (node: Node) => after.get(node) ?? `#${encodeURIComponent(node.getName())}`;
  const proxyNodes = new Set(proxies.map((entry) => entry.proxy));
  const nodeScale: RuntimeThreeNodeScaleV1[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getExtension('EXT_mesh_gpu_instancing')) continue;
    const path = after.get(node);
    if (path === undefined) continue; // Off-scene LOD levels report through their chain node.
    const original = matrices.get(node);
    const moved = original === undefined;
    const split = moved || proxyNodes.has(node);
    const reference = moved ? new THREE.Matrix4().identity().toArray() : original;
    const current = [...node.getMatrix()];
    const { scale, offset } = decomposeDelta(reference, current);
    if (!moved && Math.abs(scale - 1) < 1e-12 && offset.every((v) => v === 0)) continue;
    const parent = node.getParentNode();
    nodeScale.push({
      node: path,
      mesh: mesh.getName(),
      meshMovedToChild: split,
      ...(split && parent ? { authoredNode: pathOf(parent) } : {}),
      dequantization: { scale, offset },
      localScale: [...node.getScale()] as [number, number, number],
    });
  }
  // LOD lower levels sit off the scene; report their quantized nodes by name.
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || after.has(node) || !matrices.has(node)) continue;
    const { scale, offset } = decomposeDelta(matrices.get(node)!, [...node.getMatrix()]);
    nodeScale.push({
      node: `#lod/${encodeURIComponent(node.getName())}`,
      mesh: mesh.getName(),
      meshMovedToChild: false,
      dequantization: { scale, offset },
      localScale: [...node.getScale()] as [number, number, number],
    });
  }

  const customAttributes = new Map<string, Set<Mesh>>();
  for (const mesh of doc.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives())
      for (const semantic of primitive.listSemantics())
        if (semantic.startsWith('_'))
          customAttributes.set(semantic, (customAttributes.get(semantic) ?? new Set()).add(mesh));

  const all = doc.getRoot().listNodes();
  const glb = await io.writeBinary(doc);
  const json = (await io.binaryToJSON(glb)).json;
  // The writer emits one glTF image per texture, in list order.
  const imageSources = new Map<number, string>();
  doc
    .getRoot()
    .listTextures()
    .forEach((texture, image) => {
      const source = encodedSources.get(texture);
      if (source) imageSources.set(image, source);
    });
  const gltf = layout.gltfBasename
    ? await io.writeJSON(doc, { format: Format.GLTF, basename: layout.gltfBasename })
    : undefined;
  const delivery: RuntimeThreeDeliveryV1 = {
    target: 'three',
    extensionsUsed: [...(json.extensionsUsed ?? [])].sort(),
    extensionsRequired: [...(json.extensionsRequired ?? [])].sort(),
    compression:
      compression === 'meshopt'
        ? { extension: 'EXT_meshopt_compression', method: 'quantize' }
        : { extension: 'none' },
    quantization: {
      extension: 'KHR_mesh_quantization',
      volume: 'mesh',
      bits: {
        position: RUNTIME_THREE_QUANTIZATION.position,
        normal: RUNTIME_THREE_QUANTIZATION.normal,
        texcoord: RUNTIME_THREE_QUANTIZATION.texcoord,
        color: RUNTIME_THREE_QUANTIZATION.color,
        weight: RUNTIME_THREE_QUANTIZATION.weight,
      },
      customAttributes: 'float32',
    },
    nodeScale,
    colliderProxies: proxies.map(({ collider, proxy }) => ({
      collider: pathOf(collider),
      proxy: pathOf(proxy),
    })),
    customAttributes: [...customAttributes]
      // Same order as delivery inspection: _EDGE, _CAVITY, then author attributes by name.
      .sort(([a], [b]) => customRank(a) - customRank(b) || (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, meshes]) => ({
        name,
        meshes: meshes.size,
        componentType: 'FLOAT' as const,
        normalized: false as const,
      })),
    instancing: instanced.map(({ node, ...rest }) => ({ node: pathOf(node), ...rest })),
    ktx2,
    preserved: {
      lodChains: all.filter((node) => node.getExtension(MSFT_LOD)).length,
      hiddenNodes: all.filter((node) => isHiddenGltfNode(node)).length,
      colliders: all.filter(isCollider).length,
      anchors: all.filter((node) =>
        rolesOf(node).some((role) => role.startsWith(`${KILN_SEMANTIC_ROLES.anchor}.`)),
      ).length,
      ports: all.filter((node) =>
        rolesOf(node).some((role) => role.startsWith(`${KILN_SEMANTIC_ROLES.kitPort}.`)),
      ).length,
      kitModules: all.filter((node) => rolesOf(node).includes(KILN_SEMANTIC_ROLES.kitModule))
        .length,
    },
  };
  return {
    glb,
    delivery,
    imageSources,
    ...(gltf
      ? {
          gltf: {
            json: gltf.json as unknown as Record<string, unknown>,
            resources: gltf.resources,
          },
        }
      : {}),
  };
}
