import type * as THREE from 'three';

export type GeometryExportPolicy = 'warn' | 'strict';
export const EXPORTED_GEOMETRY_ATTRIBUTES: Readonly<Record<string, number | readonly number[]>> = {
  position: 3,
  normal: 3,
  uv: 2,
  uv1: 2,
  tangent: 4,
  color: [3, 4],
  // Delivery contract custom attributes (bakeSurfaceAttributes), written as _EDGE/_CAVITY.
  _edge: 1,
  _cavity: 1,
};

/** Custom float attributes both converters write: three.js name to glTF name. */
export const CUSTOM_EXPORT_ATTRIBUTES: Readonly<Record<string, string>> = {
  _edge: '_EDGE',
  _cavity: '_CAVITY',
};

/**
 * Author attributes: a lowercase three.js name such as `_wet` is written by both converters as a
 * float glTF attribute `_WET`, which GLTFLoader reads back as `_wet`. Other names would not
 * round-trip, so they stay unsupported.
 */
export const AUTHOR_ATTRIBUTE_PATTERN = /^_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const AUTHOR_ATTRIBUTE_COMPONENTS: readonly number[] = [1, 2, 3, 4];
const AUTHOR_ATTRIBUTE_MAX_NAME = 64;

/** glTF semantic for a three.js custom attribute name, or null when it is not one. */
export function customAttributeSemantic(key: string): string | null {
  if (key.length > AUTHOR_ATTRIBUTE_MAX_NAME || !AUTHOR_ATTRIBUTE_PATTERN.test(key)) return null;
  return CUSTOM_EXPORT_ATTRIBUTES[key] ?? key.toUpperCase();
}

/** Material texture slots whose UV channel export must preserve. */
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
] as const;

const THREE_GEOMETRY_ATTRIBUTES = {
  ...EXPORTED_GEOMETRY_ATTRIBUTES,
  uv2: 2,
  uv3: 2,
  skinIndex: 4,
  skinWeight: 4,
} as const;

/** Shared by export validation and host capability discovery. */
export function geometryExportAttributes(
  exporter: 'legacy' | 'three',
): Readonly<Record<string, number | readonly number[]>> {
  return exporter === 'three' ? THREE_GEOMETRY_ATTRIBUTES : EXPORTED_GEOMETRY_ATTRIBUTES;
}

/** Both converters require a complete, non-overlapping triangle partition. */
export function validateMaterialGroups(
  geometry: THREE.BufferGeometry,
  materialCount: number,
  name: string,
) {
  const length = geometry.getIndex()?.count ?? geometry.getAttribute('position').count;
  const groups = [...geometry.groups].sort((a, b) => a.start - b.start);
  let covered = 0;
  for (const group of groups) {
    const materialIndex = group.materialIndex ?? 0;
    if (
      group.start !== covered ||
      !Number.isInteger(group.start) ||
      !Number.isInteger(group.count) ||
      group.count <= 0 ||
      group.start % 3 ||
      group.count % 3 ||
      group.start + group.count > length ||
      !Number.isInteger(materialIndex) ||
      materialIndex < 0 ||
      materialIndex >= materialCount
    )
      throw new TypeError(
        `${name}: material groups must cover every triangle exactly once with valid material indices.`,
      );
    covered = group.start + group.count;
  }
  if (covered !== length)
    throw new TypeError(`${name}: material groups do not cover every triangle.`);
  return groups;
}

/** Read logical values, including interleaved stride/offset and normalized integer attributes. */
export function geometryAttributeValues(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): Float32Array<ArrayBuffer> {
  const values = new Float32Array(attribute.count * attribute.itemSize);
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    for (let component = 0; component < attribute.itemSize; component++) {
      values[vertex * attribute.itemSize + component] = attribute.getComponent(vertex, component);
    }
  }
  return values;
}

/** One helper note (a code and message, or a legacy string) and the meshes that carry it. */
type GeometryNoteGroup = {
  code?: string;
  text?: string;
  meshes: Set<THREE.Object3D>;
  names: string[];
};

const NOTE_NAMES_SHOWN = 3;

/** Name the first few distinct meshes; repeated names carry a count instead of repeating. */
function noteMeshList(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const shown = [...counts].slice(0, NOTE_NAMES_SHOWN);
  const covered = shown.reduce((sum, [, count]) => sum + count, 0);
  const parts = shown.map(([name, count]) => (count > 1 ? `${name} x${count}` : name));
  if (names.length > covered) parts.push(`+${names.length - covered} more`);
  return parts.join(', ');
}

function formatNoteGroup({ code, text, names }: GeometryNoteGroup): string {
  if (code === undefined) {
    const who = names.length === 1 ? names[0] : `${names.length} meshes (${noteMeshList(names)})`;
    return `${who}: ${text}`;
  }
  if (names.length === 1) return `${names[0]}: ${code}${text === undefined ? '' : ` ${text}`}`;
  return `${code} (${names.length} meshes: ${noteMeshList(names)})${text === undefined ? '' : `: ${text}`}`;
}

/** Check export data before bounds, texture baking or GLB conversion can obscure its origin. */
export function inspectGeometryExport(
  root: THREE.Object3D,
  policy: GeometryExportPolicy = 'warn',
  exporter: 'legacy' | 'three' = 'legacy',
): string[] {
  // Helper notes repeat on every mesh a helper built. One line per distinct note, in order of
  // first occurrence, keeps a 17-part loft from producing 17 identical warnings.
  const warnings: (string | GeometryNoteGroup)[] = [];
  const noteGroups = new Map<string, GeometryNoteGroup>();
  const addNote = (mesh: THREE.Object3D, name: string, code?: string, text?: string) => {
    const key = JSON.stringify([code ?? null, text ?? null]);
    let group = noteGroups.get(key);
    if (!group) {
      group = { code, text, meshes: new Set(), names: [] };
      noteGroups.set(key, group);
      warnings.push(group);
    }
    if (group.meshes.has(mesh)) return;
    group.meshes.add(mesh);
    group.names.push(name);
  };
  const attributes = geometryExportAttributes(exporter);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const name = mesh.name || '<unnamed mesh>';
    const unsupported = (feature: string, hint = '') => {
      const message = `EXPORT_ATTRIBUTE_UNSUPPORTED ${name}: ${feature} is not preserved by the GLB bridge.${hint}`;
      if (policy === 'strict') throw new TypeError(message);
      warnings.push(message);
    };
    const position = geometry.getAttribute('position');
    if (position?.itemSize !== 3) throw new TypeError(`${name}: position requires xyz vertices.`);
    for (const [key, attribute] of Object.entries(geometry.attributes)) {
      const expected =
        attributes[key] ?? (customAttributeSemantic(key) ? AUTHOR_ATTRIBUTE_COMPONENTS : undefined);
      if (expected === undefined) {
        unsupported(
          key,
          key.startsWith('_')
            ? ' Author attributes use a lowercase name such as _wet (exported as _WET) with 1 to 4 float components.'
            : '',
        );
        continue;
      }
      const sizes = typeof expected === 'number' ? [expected] : expected;
      if (!sizes.includes(attribute.itemSize) || attribute.count !== position.count) {
        throw new TypeError(
          `${name}: ${key} requires ${position.count} vertices with ${sizes.join(' or ')} components each.`,
        );
      }
      for (let vertex = 0; vertex < attribute.count; vertex++) {
        for (let component = 0; component < attribute.itemSize; component++) {
          if (!Number.isFinite(attribute.getComponent(vertex, component))) {
            throw new TypeError(`${name}: ${key} contains a non-finite value at vertex ${vertex}.`);
          }
        }
      }
    }
    const index = geometry.getIndex();
    if ((index?.count ?? position.count) % 3 !== 0)
      throw new TypeError(`${name}: triangle indices/vertices must be a multiple of three.`);
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const value = index.getX(i);
        if (!Number.isInteger(value) || value < 0 || value >= position.count)
          throw new TypeError(`${name}: index ${i} is outside the position attribute.`);
      }
    }
    // A texture's UV channel must reach the GLB, or it would silently sample UV0.
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const slot of TEXTURE_SLOTS) {
        const texture = (material as unknown as Record<string, THREE.Texture | null | undefined>)[
          slot
        ];
        const channel = texture?.isTexture ? (texture.channel ?? 0) : 0;
        if (channel === 0) continue;
        const uv = `uv${channel}`;
        if (attributes[uv] === undefined) unsupported(`${slot} UV channel ${channel}`);
        else if (!geometry.getAttribute(uv))
          throw new TypeError(`${name}: ${slot} samples ${uv}, which the geometry lacks.`);
      }
    }
    if (exporter === 'three' && Array.isArray(mesh.material))
      validateMaterialGroups(geometry, mesh.material.length, name);
    if (exporter === 'legacy') {
      for (const key of Object.keys(geometry.morphAttributes)) unsupported(`morph ${key}`);
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) unsupported('skinning');
    }
    for (const key of ['kilnAttributeWarnings', 'kilnGeometryWarnings']) {
      const notes: unknown = geometry.userData[key];
      if (!Array.isArray(notes)) continue;
      for (const note of notes) {
        if (typeof note === 'string') addNote(mesh, name, undefined, note);
        else if (note && typeof note === 'object' && 'code' in note)
          addNote(
            mesh,
            name,
            String(note.code),
            'message' in note ? String(note.message) : undefined,
          );
      }
    }
  });
  return warnings.map((warning) =>
    typeof warning === 'string' ? warning : formatNoteGroup(warning),
  );
}
