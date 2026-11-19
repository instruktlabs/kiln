/**
 * Print export (#378): binary STL or 3MF from a GLB whose visible meshes are all closed,
 * manifold, outward solids.
 *
 * - Units: scene units are metres; both formats are written in millimetres (x1000). STL has
 *   no unit field, so the header states it; 3MF declares `unit="millimeter"`.
 * - Axes: glTF is Y-up and print files are Z-up (the build direction), so a point
 *   (x, y, z) is written as (x, -z, y). This is a rotation: volume and winding are kept.
 * - What is exported: the default scene as a loader draws it at LOD0. Hidden subtrees
 *   (`KHR_node_visibility` off) and the lower levels of an `MSFT_lod` chain (they are not in
 *   the scene graph) are left out; world transforms are applied; `EXT_mesh_gpu_instancing`
 *   placements are expanded, one body each. Points, lines, skins and posed morph targets
 *   are refused.
 * - Solids: each visible mesh is measured with `geometryDiagnostics`, as `REQUIRE_SOLID`
 *   does, and an open, non-manifold or not-outward mesh refuses the whole export. The written
 *   mesh is the welded one the diagnostic measured, so every edge is shared by exactly two
 *   triangles in the file. Self-intersection is not checked.
 * - Colour: 3MF carries each material's base colour factor as a `basematerials` entry
 *   (sRGB `#RRGGBBAA`). Textures, vertex colours and every other material property are
 *   dropped. STL carries no colour.
 * - Layout: STL is one triangle list holding every body. 3MF writes one mesh object per
 *   body (named after its node) and a single build item, an object whose components are
 *   those bodies, placed as in the asset. Slicers read that assembly differently:
 *   PrusaSlicer 2.9.7 loads each body as its own object. Bodies may overlap (parts of an
 *   assembly often do); merging them is left to the slicer.
 *
 * Deterministic: no clock, no randomness; a fixed STL header and fixed zip timestamps.
 */
import type { Document, Material, Node as GltfNode } from '@gltf-transform/core';
import type { InstancedMesh } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { geometryDiagnostics } from './geometry';
import { diagnosticWeld } from './geometry-frame';
import { createGltfIO } from './gltf-io';
import { isHiddenGltfNode } from './metrics';
import { solidFailureReasons } from './require-solid';

export type PrintFormat = 'stl' | '3mf';
export const PRINT_FORMATS: readonly PrintFormat[] = ['stl', '3mf'];
/** Scene units are metres; print files are millimetres. */
export const PRINT_MILLIMETRES_PER_SCENE_UNIT = 1000;

export interface PrintExportOptions {
  format: PrintFormat;
}

/** One exported solid: a visible mesh at one placement. */
export interface PrintBodyV1 {
  /** The glTF node name, else its mesh name, else `(unnamed mesh)`. */
  name: string;
  /** Inspection path of the node, as `kiln_inspect` lists it. */
  path: string;
  triangles: number;
  /** Volume of the written triangles, in cubic millimetres. */
  volumeMm3: number;
}

export interface PrintExportResult {
  format: PrintFormat;
  bytes: Uint8Array;
  unit: 'millimeter';
  /** Z-up: glTF (x, y, z) written as (x, -z, y). */
  up: 'z';
  bodies: PrintBodyV1[];
  triangles: number;
  /** Bounds of the written vertices, in millimetres, Z-up. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  volumeMm3: number;
  /** 3MF only: the base colours written, in first-use order. */
  colors?: { name: string; displaycolor: string }[];
}

export interface PrintExportFailure {
  name: string;
  path: string;
  reasons: string[];
}

/** A visible mesh is not a closed, manifold, outward triangle solid. */
export class PrintExportError extends Error {
  readonly code = 'PRINT_NOT_SOLID';
  constructor(
    readonly parts: PrintExportFailure[],
    message: string,
  ) {
    super(message);
    this.name = 'PrintExportError';
  }
}

const MAX_LISTED_FAILURES = 8;
const TRIANGLES = 4;
const MODE_NAMES: Record<number, string> = {
  0: 'points',
  1: 'lines',
  2: 'a line loop',
  3: 'a line strip',
  5: 'a triangle strip',
  6: 'a triangle fan',
};

/** A mesh welded once, in its own geometry space, with one material slot per triangle. */
interface WeldedMesh {
  positions: Float64Array;
  triangles: Uint32Array;
  slots: Uint32Array;
  materials: (Material | null)[];
}

interface Placement {
  name: string;
  path: string;
  mesh: WeldedMesh;
  matrix: THREE.Matrix4;
}

const segment = (name: string, occurrence: number) => `/${encodeURIComponent(name)}[${occurrence}]`;

/** Weld one glTF mesh as `geometryDiagnostics` does, or say why it is not a solid. */
function weldMesh(mesh: import('@gltf-transform/core').Mesh): WeldedMesh | string[] {
  const positions: number[] = [];
  const indices: number[] = [];
  const slots: number[] = [];
  const materials: (Material | null)[] = [];
  const local = [0, 0, 0];
  for (const primitive of mesh.listPrimitives()) {
    const mode = primitive.getMode();
    if (mode !== TRIANGLES) return [`draws ${MODE_NAMES[mode] ?? `mode ${mode}`}, not triangles`];
    const position = primitive.getAttribute('POSITION');
    if (!position) continue;
    const base = positions.length / 3;
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, local);
      positions.push(local[0]!, local[1]!, local[2]!);
    }
    const material = primitive.getMaterial();
    let slot = materials.indexOf(material);
    if (slot < 0) slot = materials.push(material) - 1;
    const stored = primitive.getIndices();
    const count = stored ? stored.getCount() : position.getCount();
    if (count % 3) return ['has an incomplete triangle'];
    for (let i = 0; i < count; i++) indices.push(base + (stored ? stored.getScalar(i) : i));
    for (let i = 0; i < count / 3; i++) slots.push(slot);
  }
  if (!indices.length) return [];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const report = geometryDiagnostics(geometry);
  const reasons = solidFailureReasons(report);
  if (report.invalidIndices) reasons.push(`${report.invalidIndices} triangles index no vertex`);
  if (report.nonFiniteVertices) reasons.push(`${report.nonFiniteVertices} non-finite vertices`);
  if (reasons.length) return reasons;

  // Keep the vertex each welded id first met; drop faces the weld collapses, as the
  // diagnostic leaves them out of its edge counts.
  const weld = diagnosticWeld(geometry.getAttribute('position'));
  const welded = new Float64Array(weld.count * 3);
  const seen = new Uint8Array(weld.count);
  const attribute = geometry.getAttribute('position');
  for (let i = 0; i < attribute.count; i++) {
    const id = weld.ids[i]!;
    if (seen[id]) continue;
    seen[id] = 1;
    welded[id * 3] = attribute.getX(i);
    welded[id * 3 + 1] = attribute.getY(i);
    welded[id * 3 + 2] = attribute.getZ(i);
  }
  // Renumber the welded vertices the kept faces use, in first-use order.
  const triangles: number[] = [];
  const kept: number[] = [];
  const renumber = new Map<number, number>();
  const used: number[] = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const corners = [0, 1, 2].map((k) => weld.ids[indices[t * 3 + k]!]!);
    const [a, b, c] = corners as [number, number, number];
    if (a === b || b === c || c === a) continue;
    for (const id of corners) {
      if (!renumber.has(id)) renumber.set(id, used.push(id) - 1);
      triangles.push(renumber.get(id)!);
    }
    kept.push(slots[t]!);
  }
  const compact = new Float64Array(used.length * 3);
  used.forEach((id, i) => {
    compact.set(welded.subarray(id * 3, id * 3 + 3), i * 3);
  });
  return {
    positions: compact,
    triangles: Uint32Array.from(triangles),
    slots: Uint32Array.from(kept),
    materials,
  };
}

function instanceMatrices(node: GltfNode): THREE.Matrix4[] {
  const base = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const instances = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
  if (!instances) return [base];
  const translation = instances.getAttribute('TRANSLATION');
  const rotation = instances.getAttribute('ROTATION');
  const scale = instances.getAttribute('SCALE');
  const count = translation?.getCount() ?? rotation?.getCount() ?? scale?.getCount() ?? 1;
  return Array.from({ length: count }, (_, i) =>
    base
      .clone()
      .multiply(
        new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(translation?.getElement(i, []) ?? [0, 0, 0]),
          new THREE.Quaternion().fromArray(rotation?.getElement(i, []) ?? [0, 0, 0, 1]),
          new THREE.Vector3().fromArray(scale?.getElement(i, []) ?? [1, 1, 1]),
        ),
      ),
  );
}

/** Every visible mesh placement in scene order, or every failing part. */
function collect(doc: Document): Placement[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const placements: Placement[] = [];
  const failures: PrintExportFailure[] = [];
  const welded = new Map<object, WeldedMesh | string[]>();
  const visit = (siblings: readonly GltfNode[], parentPath: string): void => {
    const seen = new Map<string, number>();
    for (const node of siblings) {
      const nodeName = node.getName();
      const occurrence = seen.get(nodeName) ?? 0;
      seen.set(nodeName, occurrence + 1);
      const path = `${parentPath}${segment(nodeName, occurrence)}`;
      if (isHiddenGltfNode(node)) continue;
      const mesh = node.getMesh();
      if (mesh) {
        const name = nodeName || mesh.getName() || '(unnamed mesh)';
        const result = welded.get(mesh) ?? weldMesh(mesh);
        welded.set(mesh, result);
        const reasons = Array.isArray(result) ? [...result] : [];
        if (node.getSkin()) reasons.push('is skinned; print export reads unposed geometry only');
        const weights = [...node.getWeights(), ...mesh.getWeights()];
        if (weights.some((weight) => weight !== 0))
          reasons.push('has non-zero morph weights; print export reads base geometry only');
        const matrices = instanceMatrices(node);
        if (matrices.some((matrix) => !(Math.abs(matrix.determinant()) > 0)))
          reasons.push('is placed with a zero scale');
        if (reasons.length) failures.push({ name, path, reasons });
        else if (!Array.isArray(result))
          for (const matrix of matrices) placements.push({ name, path, mesh: result, matrix });
      }
      visit(node.listChildren(), path);
    }
  };
  if (scene) visit(scene.listChildren(), segment(scene.getName() || 'Scene', 0));
  if (failures.length) {
    const listed = failures
      .slice(0, MAX_LISTED_FAILURES)
      .map(({ name, path, reasons }) => `${name} (${path}): ${reasons.join(', ')}`);
    throw new PrintExportError(
      failures,
      `Print export: ${failures.length} visible mesh(es) are not closed, manifold, outward triangle solids: ${listed.join('; ')}${failures.length > MAX_LISTED_FAILURES ? '; ...' : ''}. Close or hide them, or mark parts with requireSolid() to catch this at build time. Nothing was written.`,
    );
  }
  if (!placements.length)
    throw new PrintExportError(
      [],
      'Print export: the default scene has no visible triangle meshes. Nothing was written.',
    );
  return placements;
}

/** A body ready to write: millimetre Z-up float32 vertices and outward triangles. */
interface PrintBody {
  name: string;
  path: string;
  vertices: Float32Array;
  triangles: Uint32Array;
  slots: Uint32Array;
  materials: (Material | null)[];
}

function place({ name, path, mesh, matrix }: Placement): PrintBody {
  const m = matrix.elements;
  const s = PRINT_MILLIMETRES_PER_SCENE_UNIT;
  const vertices = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!;
    const y = mesh.positions[i + 1]!;
    const z = mesh.positions[i + 2]!;
    const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
    // Y-up to Z-up: (x, y, z) -> (x, -z, y).
    vertices[i] = wx * s;
    vertices[i + 1] = -wz * s;
    vertices[i + 2] = wy * s;
  }
  let triangles = mesh.triangles;
  if (matrix.determinant() < 0) {
    // A mirrored placement turns the winding inside out; swap two corners to keep it outward.
    triangles = triangles.slice();
    for (let t = 0; t < triangles.length; t += 3) {
      const b = triangles[t + 1]!;
      triangles[t + 1] = triangles[t + 2]!;
      triangles[t + 2] = b;
    }
  }
  return { name, path, vertices, triangles, slots: mesh.slots, materials: mesh.materials };
}

function corner(body: PrintBody, t: number, k: number): [number, number, number] {
  const v = body.triangles[t * 3 + k]! * 3;
  return [body.vertices[v]!, body.vertices[v + 1]!, body.vertices[v + 2]!];
}

function volumeOf(body: PrintBody): number {
  let sum = 0;
  for (let t = 0; t < body.triangles.length / 3; t++) {
    const [a, b, c] = [corner(body, t, 0), corner(body, t, 1), corner(body, t, 2)];
    sum +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return sum;
}

/** 80 bytes of fixed ASCII; it must not begin with "solid", which marks ASCII STL. */
const STL_HEADER = 'Kiln print export. Binary STL. Units: millimetres. Z up.';

function writeStl(bodies: PrintBody[]): Uint8Array {
  const count = bodies.reduce((sum, body) => sum + body.triangles.length / 3, 0);
  const bytes = new Uint8Array(84 + 50 * count);
  bytes.fill(0x20, 0, 80);
  bytes.set(new TextEncoder().encode(STL_HEADER), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  let at = 84;
  for (const body of bodies)
    for (let t = 0; t < body.triangles.length / 3; t++) {
      const [a, b, c] = [corner(body, t, 0), corner(body, t, 1), corner(body, t, 2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [
        u[1]! * w[2]! - u[2]! * w[1]!,
        u[2]! * w[0]! - u[0]! * w[2]!,
        u[0]! * w[1]! - u[1]! * w[0]!,
      ];
      const length = Math.hypot(n[0]!, n[1]!, n[2]!);
      for (const value of n) {
        view.setFloat32(at, length > 0 ? value / length : 0, true);
        at += 4;
      }
      for (const point of [a, b, c])
        for (const value of point) {
          view.setFloat32(at, value, true);
          at += 4;
        }
      view.setUint16(at, 0, true);
      at += 2;
    }
  return bytes;
}

/** The shortest decimal that reads back as the same float32. */
function number(value: number): string {
  for (let precision = 1; precision < 10; precision++) {
    const text = value.toPrecision(precision);
    if (Math.fround(Number(text)) === value) return String(Number(text));
  }
  return String(value);
}

const xml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Drop the characters XML 1.0 cannot carry at all.
    .replace(/./gsu, (ch) => {
      const code = ch.codePointAt(0)!;
      return (code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) ||
        code === 0xfffe ||
        code === 0xffff
        ? ''
        : ch;
    });

const hex = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
/** glTF base colour factors are linear; 3MF display colours are sRGB. */
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function displayColor(material: Material | null): string {
  const [r, g, b, a] = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
  return `#${hex(linearToSrgb(r))}${hex(linearToSrgb(g))}${hex(linearToSrgb(b))}${hex(a)}`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`;
/** Fixed zip entry time: DOS epoch, read through local-time getters so every zone writes it. */
const ZIP_TIME = new Date(1980, 0, 1);

function write3mf(
  bodies: PrintBody[],
  assembly: string,
): {
  bytes: Uint8Array;
  colors: { name: string; displaycolor: string }[];
} {
  const order: (Material | null)[] = [];
  for (const body of bodies)
    for (let t = 0; t < body.slots.length; t++) {
      const material = body.materials[body.slots[t]!]!;
      if (!order.includes(material)) order.push(material);
    }
  const colors = order.map((material, index) => ({
    name: material?.getName() || (material ? `Material ${index}` : 'Default'),
    displaycolor: displayColor(material),
  }));
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    ' <metadata name="Application">Kiln</metadata>',
    ' <resources>',
    '  <basematerials id="1">',
    ...colors.map(
      ({ name, displaycolor }) => `   <base name="${xml(name)}" displaycolor="${displaycolor}"/>`,
    ),
    '  </basematerials>',
  ];
  bodies.forEach((body, index) => {
    const slotColor = body.materials.map((material) => order.indexOf(material));
    const fallback = slotColor[body.slots[0]!]!;
    lines.push(
      `  <object id="${index + 2}" type="model" name="${xml(body.name)}" pid="1" pindex="${fallback}">`,
      '   <mesh>',
      '    <vertices>',
    );
    for (let v = 0; v < body.vertices.length; v += 3)
      lines.push(
        `     <vertex x="${number(body.vertices[v]!)}" y="${number(body.vertices[v + 1]!)}" z="${number(body.vertices[v + 2]!)}"/>`,
      );
    lines.push('    </vertices>', '    <triangles>');
    for (let t = 0; t < body.triangles.length / 3; t++) {
      const color = slotColor[body.slots[t]!]!;
      lines.push(
        `     <triangle v1="${body.triangles[t * 3]}" v2="${body.triangles[t * 3 + 1]}" v3="${body.triangles[t * 3 + 2]}"${color === fallback ? '' : ` pid="1" p1="${color}"`}/>`,
      );
    }
    lines.push('    </triangles>', '   </mesh>', '  </object>');
  });
  // One build item whose components are the bodies, already placed, so the file states one
  // assembly. How a slicer opens it varies: PrusaSlicer 2.9.7 makes each component its own
  // object.
  const assemblyId = bodies.length + 2;
  lines.push(
    `  <object id="${assemblyId}" type="model" name="${xml(assembly)}">`,
    '   <components>',
    ...bodies.map((_, index) => `    <component objectid="${index + 2}"/>`),
    '   </components>',
    '  </object>',
    ' </resources>',
    ' <build>',
    `  <item objectid="${assemblyId}"/>`,
    ' </build>',
    '</model>',
    '',
  );
  const encode = (text: string) => new TextEncoder().encode(text);
  // Insertion order is entry order; level and time are fixed, so the bytes are too.
  const bytes = zipSync(
    {
      '[Content_Types].xml': encode(CONTENT_TYPES),
      '_rels/.rels': encode(RELS),
      '3D/3dmodel.model': encode(lines.join('\n')),
    },
    { level: 6, mtime: ZIP_TIME },
  );
  return { bytes, colors };
}

export function assertPrintFormat(format: unknown): asserts format is PrintFormat {
  if (!PRINT_FORMATS.includes(format as PrintFormat))
    throw new Error(`Print export format must be stl or 3mf; got ${JSON.stringify(format)}`);
}

/**
 * Write a GLB's visible solids as binary STL or 3MF, in millimetres, Z-up. Throws
 * {@link PrintExportError} naming each visible mesh that is not a closed, manifold, outward
 * triangle solid. Self-intersection is not checked. No filesystem or network access.
 */
export async function exportPrintGlb(
  glb: Uint8Array,
  options: PrintExportOptions,
): Promise<PrintExportResult> {
  assertPrintFormat(options?.format);
  const doc = await createGltfIO().readBinary(glb);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bodies = collect(doc).map(place);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  // Every written vertex is used by a triangle, so these are the triangles' bounds.
  for (const body of bodies)
    for (let i = 0; i < body.vertices.length; i++) {
      const axis = i % 3;
      const value = body.vertices[i]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  const summaries = bodies.map((body) => ({
    name: body.name,
    path: body.path,
    triangles: body.triangles.length / 3,
    volumeMm3: volumeOf(body),
  }));
  const common = {
    unit: 'millimeter' as const,
    up: 'z' as const,
    bodies: summaries,
    triangles: summaries.reduce((sum, body) => sum + body.triangles, 0),
    bounds: { min, max },
    volumeMm3: summaries.reduce((sum, body) => sum + body.volumeMm3, 0),
  };
  if (options.format === 'stl') return { format: 'stl', bytes: writeStl(bodies), ...common };
  const { bytes, colors } = write3mf(bodies, scene?.getName() || 'Kiln asset');
  return { format: '3mf', bytes, colors, ...common };
}
