/**
 * Naming the data that differs between two builds of a GLB, for the `DATA_CHANGED` detail of a
 * parameter a file cannot carry: which accessor or image, what it holds and whose it is, from
 * the glTF JSON. Browser-safe; it reads GLB bytes and nothing else.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Data a GLB holds in its binary chunk, named for an author: what it is and whose it is. */
export interface DataNameV1 {
  what: string;
  of?: string;
}

/** The longest a `DATA_CHANGED` detail grows to with its named difference. */
const DATA_DETAIL_MAX = 320;
const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};
const TYPE_SIZE: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};
const SEMANTIC_WORDS: [RegExp, string][] = [
  [/^POSITION$/, 'positions'],
  [/^NORMAL$/, 'normals'],
  [/^TANGENT$/, 'tangents'],
  [/^TEXCOORD_\d+$/, 'texture coordinates'],
  [/^COLOR_\d+$/, 'vertex colours'],
  [/^JOINTS_\d+$/, 'skin joints'],
  [/^WEIGHTS_\d+$/, 'skin weights'],
];
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const nameOf = (value: unknown): string | undefined =>
  isRecord(value) && typeof value.name === 'string' && value.name ? value.name : undefined;
const wordsFor = (semantic: string) =>
  `${SEMANTIC_WORDS.find(([pattern]) => pattern.test(semantic))?.[1] ?? 'data'} (${semantic})`;

/** A mesh's name, else the name of the first node that draws it, else its index. */
function meshLabel(json: Record<string, unknown>, mesh: number): string {
  return (
    nameOf(listOf(json.meshes)[mesh]) ??
    nameOf(listOf(json.nodes).find((node) => isRecord(node) && node.mesh === mesh)) ??
    `mesh ${mesh}`
  );
}

/** What the accessor at `index` of this glTF JSON holds, from its first user. */
export function nameAccessor(json: Record<string, unknown>, index: number): DataNameV1 {
  for (const [m, mesh] of listOf(json.meshes).entries())
    for (const primitive of isRecord(mesh) ? listOf(mesh.primitives) : []) {
      if (!isRecord(primitive)) continue;
      const attributes = isRecord(primitive.attributes) ? primitive.attributes : {};
      for (const [semantic, value] of Object.entries(attributes))
        if (value === index) return { what: wordsFor(semantic), of: meshLabel(json, m) };
      if (primitive.indices === index) return { what: 'indices', of: meshLabel(json, m) };
      for (const target of listOf(primitive.targets))
        if (isRecord(target) && Object.values(target).includes(index))
          return { what: 'morph target data', of: meshLabel(json, m) };
    }
  for (const [n, node] of listOf(json.nodes).entries()) {
    const extensions = isRecord(node) && isRecord(node.extensions) ? node.extensions : {};
    const instancing = extensions.EXT_mesh_gpu_instancing;
    const attributes =
      isRecord(instancing) && isRecord(instancing.attributes) ? instancing.attributes : {};
    for (const [semantic, value] of Object.entries(attributes))
      if (value === index)
        return { what: `instance data (${semantic})`, of: nameOf(node) ?? `node ${n}` };
  }
  for (const [a, animation] of listOf(json.animations).entries())
    for (const sampler of isRecord(animation) ? listOf(animation.samplers) : [])
      if (isRecord(sampler) && (sampler.input === index || sampler.output === index))
        return { what: 'animation data', of: nameOf(animation) ?? `animation ${a}` };
  for (const [s, skin] of listOf(json.skins).entries())
    if (isRecord(skin) && skin.inverseBindMatrices === index)
      return { what: 'inverse bind matrices', of: nameOf(skin) ?? `skin ${s}` };
  return { what: `accessor ${index}` };
}

/** What the image at `index` of this glTF JSON is: the image of the first texture that uses it. */
export function nameImage(json: Record<string, unknown>, index: number): DataNameV1 {
  const texture = listOf(json.textures).findIndex(
    (entry) => isRecord(entry) && entry.source === index,
  );
  return { what: texture >= 0 ? `the image of texture ${texture}` : `image ${index}` };
}

/**
 * `general` with one sentence naming data, `lead` before the name and `tail` after it, kept
 * within `DATA_DETAIL_MAX` characters by cutting the owner's name.
 */
export function namedDataDetail(
  general: string,
  lead: string,
  name: DataNameV1 | undefined,
  tail = '.',
): string {
  if (!name) return general;
  const fixed = `${general} ${lead}${name.what}${name.of === undefined ? '' : ' of '}${tail}`;
  let of = name.of ?? '';
  const room = DATA_DETAIL_MAX - fixed.length;
  if (of.length > room) of = room > 3 ? `${of.slice(0, room - 3)}...` : '';
  const detail = `${general} ${lead}${name.what}${of ? ` of ${of}` : ''}${tail}`;
  return detail.length <= DATA_DETAIL_MAX ? detail : general;
}

/** The binary chunk of a GLB, or undefined when it has none. */
function binChunk(bytes: Uint8Array, jsonEnd: number): Uint8Array | undefined {
  if (bytes.length < jsonEnd + 8) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + jsonEnd, 8);
  if (view.getUint32(4, true) !== 0x004e4942) return undefined;
  return bytes.subarray(jsonEnd + 8, Math.min(bytes.length, jsonEnd + 8 + view.getUint32(0, true)));
}

interface GlbData {
  json: Record<string, unknown>;
  bin: Uint8Array;
}

/** The bytes of a buffer view in the binary chunk, or undefined when they are elsewhere. */
function viewBytes(glb: GlbData, index: unknown): Uint8Array | undefined {
  const view = typeof index === 'number' ? listOf(glb.json.bufferViews)[index] : undefined;
  if (!isRecord(view) || view.buffer !== 0 || typeof view.byteLength !== 'number') return undefined;
  const offset = typeof view.byteOffset === 'number' ? view.byteOffset : 0;
  if (offset + view.byteLength > glb.bin.length) return undefined;
  return glb.bin.subarray(offset, offset + view.byteLength);
}

/** The bytes of an accessor's elements, or undefined when it has none in the binary chunk. */
function accessorBytes(glb: GlbData, index: number): Uint8Array | undefined {
  const accessor = listOf(glb.json.accessors)[index];
  if (!isRecord(accessor)) return undefined;
  const bytes = viewBytes(glb, accessor.bufferView);
  if (!bytes) return undefined;
  const element =
    (COMPONENT_BYTES[accessor.componentType as number] ?? 0) *
    (TYPE_SIZE[accessor.type as string] ?? 0);
  const count = typeof accessor.count === 'number' ? accessor.count : 0;
  if (!element || !count) return bytes;
  const view = listOf(glb.json.bufferViews)[accessor.bufferView as number] as Record<
    string,
    unknown
  >;
  const stride = typeof view.byteStride === 'number' ? view.byteStride : element;
  const start = typeof accessor.byteOffset === 'number' ? accessor.byteOffset : 0;
  if (start + stride * (count - 1) + element > bytes.length) return undefined;
  if (stride === element) return bytes.subarray(start, start + element * count);
  // Interleaved: gather this accessor's elements and leave out the other attributes' bytes.
  const out = new Uint8Array(element * count);
  for (let i = 0; i < count; i++)
    out.set(bytes.subarray(start + i * stride, start + i * stride + element), i * element);
  return out;
}

/**
 * The first accessor, then the first image, whose bytes differ between two builds, named from
 * the first build. Undefined when the files do not line up well enough to name it: different
 * accessor or image counts, data that one file has and the other does not, or data used
 * differently in each.
 */
function firstDataDifference(a: GlbData, b: GlbData): DataNameV1 | undefined {
  const imageBytes = (glb: GlbData, index: number) => {
    const image = listOf(glb.json.images)[index];
    return isRecord(image) ? viewBytes(glb, image.bufferView) : undefined;
  };
  const sections = [
    ['accessors', accessorBytes, nameAccessor],
    ['images', imageBytes, nameImage],
  ] as const;
  for (const [key, bytesOf, name] of sections) {
    const count = listOf(a.json[key]).length;
    if (count !== listOf(b.json[key]).length) return undefined;
    for (let index = 0; index < count; index++) {
      const x = bytesOf(a, index);
      const y = bytesOf(b, index);
      if (!x && !y) continue;
      if (!x || !y) return undefined;
      if (sameBytes(x, y)) continue;
      const named = name(a.json, index);
      return JSON.stringify(named) === JSON.stringify(name(b.json, index)) ? named : undefined;
    }
  }
  return undefined;
}

/** A GLB's bytes with its glTF JSON and where the JSON chunk's data ends. */
export interface SplitBuild {
  glb: Uint8Array;
  json: Record<string, unknown>;
  jsonEnd: number;
}

/**
 * The detail for binary data that differs between two builds: `general`, followed by the first
 * difference when the files line up well enough to name it.
 */
export function dataChangedDetail(general: string, a: SplitBuild, b: SplitBuild): string {
  const binA = binChunk(a.glb, a.jsonEnd);
  const binB = binChunk(b.glb, b.jsonEnd);
  if (!binA || !binB) return general;
  return namedDataDetail(
    general,
    'First difference: ',
    firstDataDifference({ json: a.json, bin: binA }, { json: b.json, bin: binB }),
  );
}
