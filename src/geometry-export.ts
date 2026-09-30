import type * as THREE from 'three';

export type GeometryExportPolicy = 'warn' | 'strict';
export const EXPORTED_GEOMETRY_ATTRIBUTES: Readonly<Record<string, number>> = {
  position: 3,
  normal: 3,
  uv: 2,
  tangent: 4,
};

const THREE_GEOMETRY_ATTRIBUTES = {
  ...EXPORTED_GEOMETRY_ATTRIBUTES,
  color: [3, 4],
  uv1: 2,
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
    const unsupported = (feature: string) => {
      const message = `EXPORT_ATTRIBUTE_UNSUPPORTED ${name}: ${feature} is not preserved by the GLB bridge.`;
      if (policy === 'strict') throw new TypeError(message);
      warnings.push(message);
    };
    const position = geometry.getAttribute('position');
    if (position?.itemSize !== 3) throw new TypeError(`${name}: position requires xyz vertices.`);
    for (const [key, attribute] of Object.entries(geometry.attributes)) {
      const expected = attributes[key];
      if (expected === undefined) {
        unsupported(key);
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
