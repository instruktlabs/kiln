/**
 * Primitives audit (issue #374): measure every top-level export of `src/primitives.ts`.
 *
 * For each builder that makes geometry, build it at its defaults and at a few representative
 * or edge-case parameter sets, and record, per mesh, what `geometryDiagnostics(...).solid`
 * measures (closed, manifold, orientation, signed volume), the triangle count, the UV
 * attribute, normals that oppose their triangle's winding, and any declared frames, sockets or
 * geometry role. Scene builders (walls, rooms, stairs, ladders) are also run through the
 * engine's flush-face check, once with a plain material and once with a textured one, because
 * a plain material hides a depth tie between its own faces and a texture does not.
 *
 * Probes then re-check defects reported in earlier reviews and test the few cases where a
 * builder can produce a surface the diagnostics cannot see as wrong.
 *
 * Run: bun scripts/audit-primitives.ts            (markdown to stdout)
 *      bun scripts/audit-primitives.ts --json     (JSON to stdout)
 *
 * The script reads source modules directly; it does not need `dist/`. It is deterministic:
 * the same engine commit prints the same output.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import * as P from '../src/primitives';
import { geometryDiagnostics } from '../src/geometry';
import { readSemanticMetadataV1 } from '../src/contracts/semantic';
import { analyzeFlushFaces } from '../src/qa/flush-faces';

type Built = THREE.BufferGeometry | THREE.Object3D;

interface Case {
  label: string;
  build: () => Built;
  /** The exact enclosed volume of the polyhedron the builder should make, when known. */
  expectedVolume?: number;
  /** A smooth-shape reference volume, when the polyhedron only approximates it. */
  smoothVolume?: number;
}

type Kind = 'geometry' | 'scene' | 'node' | 'material' | 'animation' | 'utility' | 'sandbox';

interface Builder {
  name: string;
  kind: Kind;
  /** What the builder is meant to make: a closed solid, an open surface, or not geometry. */
  design: 'closed' | 'open' | 'mixed' | 'pass-through' | 'n/a';
  /** UV layout of the generator, read from its source (three.js or Kiln). */
  uvKind: string;
  cases: Case[];
  note?: string;
}

interface MeshFacts {
  name: string;
  triangles: number;
  closed: boolean;
  manifold: boolean;
  orientation: 'outward' | 'inward' | 'mixed';
  /**
   * The node's world transform mirrors (negative determinant). glTF and three.js reverse the
   * front face for such a node, so it still draws outward; requireSolid reads local geometry.
   */
  mirroredNode: boolean;
  signedVolume: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationConflicts: number;
  degenerateTriangles: number;
  collapsedByToleranceTriangles: number;
  /** Triangles whose stored vertex normals point against the winding normal. */
  normalsOpposed: number;
  /** Largest angle, in degrees, between a stored vertex normal and its triangle's normal. */
  maxNormalDeviationDeg: number;
  /** Planar triangles whose vertex normals stray more than 45 degrees from the face. */
  facesOver45Deg: number;
  uv: { present: boolean; min?: [number, number]; max?: [number, number]; nonFinite?: number };
}

interface FlushFacts {
  candidates: number;
  matching: number;
  hidden: number;
  worst?: string;
}

interface CaseResult {
  label: string;
  error?: string;
  meshes: MeshFacts[];
  triangles: number;
  expectedVolume?: number;
  smoothVolume?: number;
  frames: string[];
  sockets: string[];
  roles: string[];
  geometryRoles: string[];
  flushPlain?: FlushFacts;
  flushTextured?: FlushFacts;
}

const r6 = (n: number): number => {
  const v = Math.round(n * 1e6) / 1e6;
  return Object.is(v, -0) ? 0 : v;
};

const plain = () => P.gameMaterial(0x808080);
const textured = () => {
  const texture = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
};

/** Polygonal frustum volume for an n-gon cross-section, exact for the three.js cylinder. */
const frustum = (r1: number, r2: number, h: number, n: number) => {
  const area = (r: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
  const a1 = area(r1);
  const a2 = area(r2);
  return (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));
};

function normalFacts(geometry: THREE.BufferGeometry): {
  opposed: number;
  maxDeg: number;
  over45: number;
} {
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  if (!p || !n) return { opposed: 0, maxDeg: 0, over45: 0 };
  const idx = geometry.index;
  const count = idx ? idx.count : p.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  const avg = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let opposed = 0;
  let maxDeg = 0;
  let over45 = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = idx ? idx.getX(i) : i;
    const ib = idx ? idx.getX(i + 1) : i + 1;
    const ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, ia);
    b.fromBufferAttribute(p, ib);
    c.fromBufferAttribute(p, ic);
    face.subVectors(b, a).cross(tmp.subVectors(c, a));
    if (face.lengthSq() === 0) continue;
    face.normalize();
    avg.set(0, 0, 0);
    let worst = 0;
    for (const v of [ia, ib, ic]) {
      tmp.fromBufferAttribute(n, v);
      avg.add(tmp);
      const len = tmp.length();
      if (len > 0) {
        const deg = (Math.acos(Math.max(-1, Math.min(1, tmp.dot(face) / len))) * 180) / Math.PI;
        worst = Math.max(worst, deg);
      }
    }
    if (face.dot(avg) < 0) opposed++;
    if (worst > 45) over45++;
    maxDeg = Math.max(maxDeg, worst);
  }
  return { opposed, maxDeg: Math.round(maxDeg * 10) / 10, over45 };
}

function uvFacts(geometry: THREE.BufferGeometry): MeshFacts['uv'] {
  const uv = geometry.getAttribute('uv');
  if (!uv) return { present: false };
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  let nonFinite = 0;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      nonFinite++;
      continue;
    }
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  return { present: true, min: [r6(minU), r6(minV)], max: [r6(maxU), r6(maxV)], nonFinite };
}

function meshFacts(name: string, geometry: THREE.BufferGeometry, mirrored: boolean): MeshFacts {
  const d = geometryDiagnostics(geometry);
  const normals = normalFacts(geometry);
  return {
    name,
    triangles: d.triangles,
    closed: d.solid.closed,
    manifold: d.solid.manifold,
    orientation: d.solid.orientation,
    mirroredNode: mirrored,
    signedVolume: r6(d.solid.signedVolume),
    boundaryEdges: d.boundaryEdges,
    nonManifoldEdges: d.nonManifoldEdges,
    orientationConflicts: d.orientationConflicts,
    degenerateTriangles: d.degenerateTriangles,
    collapsedByToleranceTriangles: d.collapsedByToleranceTriangles,
    normalsOpposed: normals.opposed,
    maxNormalDeviationDeg: normals.maxDeg,
    facesOver45Deg: normals.over45,
    uv: uvFacts(geometry),
  };
}

function flushFacts(root: THREE.Object3D): FlushFacts {
  const report = analyzeFlushFaces(root);
  const worst = report.pairs[0];
  return {
    candidates: report.candidates,
    matching: report.matching,
    hidden: report.hidden,
    ...(worst
      ? {
          worst: `${worst.parts[0]} / ${worst.parts[1]}: ${r6(worst.sharedArea)} m2, normal (${worst.normal.join(', ')})`,
        }
      : {}),
  };
}

function measure(c: Case, rebuildTextured?: () => Built): CaseResult {
  const result: CaseResult = {
    label: c.label,
    meshes: [],
    triangles: 0,
    frames: [],
    sockets: [],
    roles: [],
    geometryRoles: [],
    ...(c.expectedVolume === undefined ? {} : { expectedVolume: r6(c.expectedVolume) }),
    ...(c.smoothVolume === undefined ? {} : { smoothVolume: r6(c.smoothVolume) }),
  };
  let built: Built;
  try {
    built = c.build();
  } catch (error) {
    result.error =
      error instanceof Error ? error.message.split('\n')[0]!.slice(0, 160) : String(error);
    return result;
  }
  if ((built as THREE.BufferGeometry).isBufferGeometry) {
    const geometry = built as THREE.BufferGeometry;
    result.meshes.push(meshFacts('(geometry)', geometry, false));
    const role = geometry.userData?.['kilnGeometryRole'];
    if (typeof role === 'string') result.geometryRoles.push(role);
  } else {
    const root = built as THREE.Object3D;
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      const semantic = readSemanticMetadataV1(node);
      if (semantic) {
        for (const frame of semantic.frames ?? []) result.frames.push(`${node.name}:${frame.id}`);
        for (const socket of semantic.sockets ?? [])
          result.sockets.push(`${node.name}:${socket.id}(${socket.type})`);
        for (const role of semantic.roles ?? []) result.roles.push(role);
      }
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      result.meshes.push(meshFacts(mesh.name, mesh.geometry, mesh.matrixWorld.determinant() < 0));
      const role = mesh.geometry.userData?.['kilnGeometryRole'];
      if (typeof role === 'string') result.geometryRoles.push(role);
    });
    if (rebuildTextured && result.meshes.length > 1) {
      result.flushPlain = flushFacts(root);
      result.flushTextured = flushFacts(rebuildTextured() as THREE.Object3D);
    }
  }
  result.triangles = result.meshes.reduce((sum, m) => sum + m.triangles, 0);
  result.roles = [...new Set(result.roles)];
  result.geometryRoles = [...new Set(result.geometryRoles)];
  return result;
}

/** Wrap a scene builder so it builds once with the plain material and once with a texture. */
function scene(
  label: string,
  make: (material: THREE.Material) => Built,
): Case & { textured: () => Built } {
  return { label, build: () => make(plain()), textured: () => make(textured()) };
}

const g = (label: string, build: () => Built, volumes: Partial<Case> = {}): Case => ({
  label,
  build,
  ...volumes,
});

const none = (name: string, kind: Kind, note: string): Builder => ({
  name,
  kind,
  design: 'n/a',
  uvKind: 'n/a',
  cases: [],
  note,
});

const sphereVolume = (r: number) => (4 / 3) * Math.PI * r ** 3;
const capsuleVolume = (r: number, h: number) => sphereVolume(r) + Math.PI * r * r * h;
const torusVolume = (R: number, r: number) => 2 * Math.PI ** 2 * R * r * r;

const builders: Builder[] = [
  none('createRoot', 'node', 'Named empty Object3D. No geometry.'),
  none('createPivot', 'node', 'Named Joint_ Object3D. No geometry.'),
  {
    name: 'createPart',
    kind: 'scene',
    design: 'pass-through',
    uvKind: 'from the geometry passed in',
    note: 'Wraps the geometry it is given; facts are those of that geometry.',
    cases: [
      g('boxGeo(1,1,1)', () => P.createPart('A', P.boxGeo(1, 1, 1), plain()), {
        expectedVolume: 1,
      }),
      g('planeGeo(1,1)', () => P.createPart('A', P.planeGeo(1, 1), plain())),
      g('boxGeo(1,1,1), pivot:true', () =>
        P.createPart('A', P.boxGeo(1, 1, 1), plain(), { pivot: true, position: [1, 2, 3] }),
      ),
      g('boxGeo(1,1,1), scale [-1,1,1] (mirrored node)', () =>
        P.createPart('A', P.boxGeo(1, 1, 1), plain(), { scale: [-1, 1, 1] }),
      ),
    ],
  },
  {
    name: 'capsuleGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical (u around Y, v by arc length; three.js CapsuleGeometry)',
    cases: [
      g('capsuleGeo(0.5,1)', () => P.capsuleGeo(0.5, 1), { smoothVolume: capsuleVolume(0.5, 1) }),
      g('capsuleGeo(0.5,1,3) min segments', () => P.capsuleGeo(0.5, 1, 3), {
        smoothVolume: capsuleVolume(0.5, 1),
      }),
      g('capsuleGeo(0.5,0) zero straight length', () => P.capsuleGeo(0.5, 0), {
        smoothVolume: sphereVolume(0.5),
      }),
      g('capsuleGeo(0.01,2,16) thin', () => P.capsuleGeo(0.01, 2, 16), {
        smoothVolume: capsuleVolume(0.01, 2),
      }),
    ],
  },
  {
    name: 'capsuleXGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical (rotated capsuleGeo)',
    cases: [
      g('capsuleXGeo(0.5,1)', () => P.capsuleXGeo(0.5, 1), { smoothVolume: capsuleVolume(0.5, 1) }),
      g('capsuleXGeo(0.5,0,3)', () => P.capsuleXGeo(0.5, 0, 3)),
    ],
  },
  {
    name: 'capsuleZGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical (rotated capsuleGeo)',
    cases: [
      g('capsuleZGeo(0.5,1)', () => P.capsuleZGeo(0.5, 1), { smoothVolume: capsuleVolume(0.5, 1) }),
      g('capsuleZGeo(0.5,0,3)', () => P.capsuleZGeo(0.5, 0, 3)),
    ],
  },
  {
    name: 'cylinderGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar disc caps (three.js CylinderGeometry)',
    cases: [
      g('cylinderGeo(0.5,0.5,1)', () => P.cylinderGeo(0.5, 0.5, 1), {
        expectedVolume: frustum(0.5, 0.5, 1, 8),
      }),
      g('cylinderGeo(0.5,0.5,1,3) min segments', () => P.cylinderGeo(0.5, 0.5, 1, 3), {
        expectedVolume: frustum(0.5, 0.5, 1, 3),
      }),
      g('cylinderGeo(0,0.5,1) zero top radius', () => P.cylinderGeo(0, 0.5, 1), {
        expectedVolume: frustum(0, 0.5, 1, 8),
      }),
      g('cylinderGeo(0.5,0,1) zero bottom radius', () => P.cylinderGeo(0.5, 0, 1), {
        expectedVolume: frustum(0.5, 0, 1, 8),
      }),
      g('cylinderGeo(0.3,0.6,2,32) frustum', () => P.cylinderGeo(0.3, 0.6, 2, 32), {
        expectedVolume: frustum(0.3, 0.6, 2, 32),
      }),
    ],
  },
  {
    name: 'cylinderXGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar caps (rotated cylinderGeo)',
    cases: [
      g('cylinderXGeo(0.5,0.5,1)', () => P.cylinderXGeo(0.5, 0.5, 1), {
        expectedVolume: frustum(0.5, 0.5, 1, 8),
      }),
      g('cylinderXGeo(0,0.5,1,3)', () => P.cylinderXGeo(0, 0.5, 1, 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
    ],
  },
  {
    name: 'cylinderZGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar caps (rotated cylinderGeo)',
    cases: [
      g('cylinderZGeo(0.5,0.5,1)', () => P.cylinderZGeo(0.5, 0.5, 1), {
        expectedVolume: frustum(0.5, 0.5, 1, 8),
      }),
      g('cylinderZGeo(0,0.5,1,3)', () => P.cylinderZGeo(0, 0.5, 1, 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
    ],
  },
  {
    name: 'boxGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'box (each face 0..1; three.js BoxGeometry)',
    cases: [
      g('boxGeo(1,1,1)', () => P.boxGeo(1, 1, 1), { expectedVolume: 1 }),
      g('boxGeo(2,0.01,3) thin slab', () => P.boxGeo(2, 0.01, 3), { expectedVolume: 0.06 }),
      g('boxGeo(1000,1,0.001) extreme aspect', () => P.boxGeo(1000, 1, 0.001), {
        expectedVolume: 1,
      }),
      g('boxGeo(1,0,1) zero height (rejected)', () => P.boxGeo(1, 0, 1)),
    ],
  },
  {
    name: 'sphereGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'spherical (equirectangular; three.js SphereGeometry)',
    cases: [
      g('sphereGeo(0.5)', () => P.sphereGeo(0.5), { smoothVolume: sphereVolume(0.5) }),
      g('sphereGeo(0.5,3,2) min segments', () => P.sphereGeo(0.5, 3, 2), {
        smoothVolume: sphereVolume(0.5),
      }),
      g('sphereGeo(0.5,32,16)', () => P.sphereGeo(0.5, 32, 16), {
        smoothVolume: sphereVolume(0.5),
      }),
    ],
  },
  {
    name: 'coneGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar base (three.js ConeGeometry)',
    cases: [
      g('coneGeo(0.5,1)', () => P.coneGeo(0.5, 1), { expectedVolume: frustum(0, 0.5, 1, 8) }),
      g('coneGeo(0.5,1,3) min segments', () => P.coneGeo(0.5, 1, 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
      g('coneGeo(2,0.01,24) flat', () => P.coneGeo(2, 0.01, 24), {
        expectedVolume: frustum(0, 2, 0.01, 24),
      }),
    ],
  },
  {
    name: 'coneXGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar base (rotated coneGeo)',
    cases: [
      g('coneXGeo(0.5,1)', () => P.coneXGeo(0.5, 1), { expectedVolume: frustum(0, 0.5, 1, 8) }),
      g('coneXGeo(0.5,1,3)', () => P.coneXGeo(0.5, 1, 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
    ],
  },
  {
    name: 'coneZGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar base (rotated coneGeo)',
    cases: [
      g('coneZGeo(0.5,1)', () => P.coneZGeo(0.5, 1), { expectedVolume: frustum(0, 0.5, 1, 8) }),
      g('coneZGeo(0.5,1,3)', () => P.coneZGeo(0.5, 1, 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
    ],
  },
  {
    name: 'cylinderYGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'alias of cylinderGeo',
    cases: [
      g('cylinderYGeo(0.5,0.5,1)', () => P.cylinderYGeo(0.5, 0.5, 1), {
        expectedVolume: frustum(0.5, 0.5, 1, 8),
      }),
    ],
  },
  {
    name: 'capsuleYGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'alias of capsuleGeo',
    cases: [
      g('capsuleYGeo(0.5,1)', () => P.capsuleYGeo(0.5, 1), { smoothVolume: capsuleVolume(0.5, 1) }),
    ],
  },
  {
    name: 'coneYGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'alias of coneGeo',
    cases: [
      g('coneYGeo(0.5,1)', () => P.coneYGeo(0.5, 1), { expectedVolume: frustum(0, 0.5, 1, 8) }),
    ],
  },
  {
    name: 'cylinderOnAxis',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar caps (rotated cylinderGeo)',
    cases: [
      g(
        'cylinderOnAxis([0,0,0],[0,1,0],0.5,1)',
        () => P.cylinderOnAxis([0, 0, 0], [0, 1, 0], 0.5, 1),
        {
          expectedVolume: frustum(0.5, 0.5, 1, 8),
        },
      ),
      g(
        'cylinderOnAxis([1,2,3],[1,1,1],0.5,1)',
        () => P.cylinderOnAxis([1, 2, 3], [1, 1, 1], 0.5, 1),
        {
          expectedVolume: frustum(0.5, 0.5, 1, 8),
        },
      ),
      g(
        'cylinderOnAxis([0,0,0],[0,-1,0],0.5,1,{radiusTop:0,segments:3}) antiparallel',
        () => P.cylinderOnAxis([0, 0, 0], [0, -1, 0], 0.5, 1, { radiusTop: 0, segments: 3 }),
        { expectedVolume: frustum(0, 0.5, 1, 3) },
      ),
    ],
  },
  {
    name: 'taperConeGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'cylindrical side, planar caps (cylinderGeo)',
    cases: [
      g('taperConeGeo(0.5,0.25,1)', () => P.taperConeGeo(0.5, 0.25, 1), {
        expectedVolume: frustum(0.25, 0.5, 1, 8),
      }),
      g("taperConeGeo(0.5,0,1,'x',3)", () => P.taperConeGeo(0.5, 0, 1, 'x', 3), {
        expectedVolume: frustum(0, 0.5, 1, 3),
      }),
      g("taperConeGeo(0.5,0.5,1,'z',24)", () => P.taperConeGeo(0.5, 0.5, 1, 'z', 24), {
        expectedVolume: frustum(0.5, 0.5, 1, 24),
      }),
    ],
  },
  {
    name: 'torusGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'toroidal (u around the ring, v around the tube; three.js TorusGeometry)',
    cases: [
      g('torusGeo(1,0.3)', () => P.torusGeo(1, 0.3), { smoothVolume: torusVolume(1, 0.3) }),
      g('torusGeo(1,0.3,3,3) min segments', () => P.torusGeo(1, 0.3, 3, 3), {
        smoothVolume: torusVolume(1, 0.3),
      }),
      g('torusGeo(1,0.3,16,48)', () => P.torusGeo(1, 0.3, 16, 48), {
        smoothVolume: torusVolume(1, 0.3),
      }),
      g('torusGeo(0.2,0.5) tube > radius', () => P.torusGeo(0.2, 0.5)),
    ],
  },
  {
    name: 'planeGeo',
    kind: 'geometry',
    design: 'open',
    uvKind: 'planar (0..1 over the sheet)',
    cases: [
      g('planeGeo(1,1)', () => P.planeGeo(1, 1)),
      g('planeGeo(4,2,4,2)', () => P.planeGeo(4, 2, 4, 2)),
    ],
  },
  {
    name: 'decalBox',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'box (BoxGeometry)',
    cases: [
      g('decalBox(0.2,0.2)', () => P.decalBox(0.2, 0.2), { expectedVolume: 0.2 * 0.2 * 0.01 }),
      g('decalBox(0.2,0.2,0) zero depth', () => P.decalBox(0.2, 0.2, 0), {
        expectedVolume: 0.2 * 0.2 * 0.002,
      }),
      g('decalBox(0.2,0.2,0.05)', () => P.decalBox(0.2, 0.2, 0.05), {
        expectedVolume: 0.2 * 0.2 * 0.05,
      }),
    ],
  },
  {
    name: 'foliageCardGeo',
    kind: 'geometry',
    design: 'open',
    uvKind: 'planar (0..1 over the card)',
    cases: [
      g('foliageCardGeo()', () => P.foliageCardGeo()),
      g('foliageCardGeo({width:0.5,height:2,yPivot:0.5})', () =>
        P.foliageCardGeo({ width: 0.5, height: 2, yPivot: 0.5 }),
      ),
    ],
  },
  {
    name: 'crossedQuadsGeo',
    kind: 'geometry',
    design: 'open',
    uvKind: 'planar per quad (0..1 each)',
    cases: [
      g('crossedQuadsGeo()', () => P.crossedQuadsGeo()),
      g('crossedQuadsGeo({planes:3})', () => P.crossedQuadsGeo({ planes: 3 })),
    ],
  },
  {
    name: 'octaGridPlane',
    kind: 'geometry',
    design: 'open',
    uvKind: 'planar, scaled to one atlas tile',
    cases: [
      g('octaGridPlane({tilesX:8,tilesY:8})', () => P.octaGridPlane({ tilesX: 8, tilesY: 8 })),
      g('octaGridPlane({tilesX:1,tilesY:1,yPivot:1})', () =>
        P.octaGridPlane({ tilesX: 1, tilesY: 1, yPivot: 1 }),
      ),
    ],
  },
  {
    name: 'wingGeo',
    kind: 'geometry',
    design: 'closed',
    uvKind: 'none',
    cases: [
      g('wingGeo()', () => P.wingGeo(), {
        // Prism of the trapezoid planform: mean chord * span * thickness.
        expectedVolume: ((0.6 + 0.3) / 2) * 1 * 0.04,
      }),
      g('wingGeo({tipChord:0}) triangular', () => P.wingGeo({ tipChord: 0 }), {
        expectedVolume: (0.6 / 2) * 1 * 0.04,
      }),
      g(
        'wingGeo({span:4,sweep:1,dihedral:0.2,thickness:0.08})',
        () => P.wingGeo({ span: 4, sweep: 1, dihedral: 0.2, thickness: 0.08 }),
        { expectedVolume: ((0.6 + 0.3) / 2) * 4 * 0.08 },
      ),
      g('wingGeo({sweep:-0.5,tipChord:1.2})', () => P.wingGeo({ sweep: -0.5, tipChord: 1.2 }), {
        expectedVolume: ((0.6 + 1.2) / 2) * 1 * 0.04,
      }),
    ],
  },
  {
    name: 'createWingPair',
    kind: 'scene',
    design: 'closed',
    uvKind: 'none (wingGeo)',
    cases: [
      g('createWingPair defaults, rootZ 0.3', () => {
        const parent = new THREE.Group();
        P.createWingPair('Wing', plain(), { rootZ: 0.3, parent });
        return parent;
      }),
      g('createWingPair tipChord 0, sweep 0.4', () => {
        const parent = new THREE.Group();
        P.createWingPair('Wing', plain(), { rootZ: 0.3, tipChord: 0, sweep: 0.4, parent });
        return parent;
      }),
    ],
  },
  {
    name: 'beamBetween',
    kind: 'scene',
    design: 'closed',
    uvKind: 'cylindrical side, planar caps (cylinderGeo)',
    cases: [
      g(
        'beamBetween([0,0,0],[0,1,0],0.05)',
        () => P.beamBetween('B', [0, 0, 0], [0, 1, 0], 0.05, plain()),
        {
          expectedVolume: frustum(0.05, 0.05, 1, 8),
        },
      ),
      g('beamBetween([0,0,0],[1,2,3],0.05,{segments:3})', () =>
        P.beamBetween('B', [0, 0, 0], [1, 2, 3], 0.05, plain(), { segments: 3 }),
      ),
      g('beamBetween([0,0,0],[0,-1,0],0.05) antiparallel', () =>
        P.beamBetween('B', [0, 0, 0], [0, -1, 0], 0.05, plain()),
      ),
    ],
  },
  none('snapTo', 'node', 'Moves a node by the AABB gap; makes no geometry.'),
];

// Scene builders that also go through the flush-face check.
const ladderCases = [
  scene(
    'createLadder bottom [0,0,0] top [0,3,0]',
    (m) => P.createLadder('L', { bottom: [0, 0, 0], top: [0, 3, 0], material: m }).root,
  ),
  scene(
    'createLadder rungCount 0, segments 3',
    (m) =>
      P.createLadder('L', {
        bottom: [0, 0, 0],
        top: [0, 3, 0],
        material: m,
        rungCount: 0,
        segments: 3,
      }).root,
  ),
  scene(
    'createLadder slanted [0,0,0] to [1,3,0.5]',
    (m) => P.createLadder('L', { bottom: [0, 0, 0], top: [1, 3, 0.5], material: m }).root,
  ),
];
const wallCases = [
  scene('wallWithOpening 4 x 3 x 0.2, no opening', (m) =>
    P.wallWithOpening('W', m, { length: 4, height: 3, thickness: 0.2 }),
  ),
  scene('wallWithOpening door', (m) =>
    P.wallWithOpening('W', m, { length: 4, height: 3, thickness: 0.2, opening: { kind: 'door' } }),
  ),
  scene("wallWithOpening window, axis 'x'", (m) =>
    P.wallWithOpening('W', m, {
      length: 4,
      height: 3,
      thickness: 0.2,
      axis: 'x',
      opening: { kind: 'window', width: 1, height: 1, sill: 1 },
    }),
  ),
  scene('wallWithOpening two doors and a stacked window', (m) =>
    P.wallWithOpening('W', m, {
      length: 8,
      height: 3,
      thickness: 0.2,
      openings: [
        { kind: 'door', offset: -2.5, width: 1, height: 2.1 },
        { kind: 'door', offset: 2.5, width: 1, height: 2.1 },
        { kind: 'window', offset: 0, width: 1, height: 0.8, sill: 0.4 },
        { kind: 'window', offset: 0, width: 1, height: 0.8, sill: 1.6 },
      ],
    }),
  ),
];
const roomCases = [
  scene('room() defaults', (m) => P.room('R', m).root),
  scene(
    'room({floor:false, openings:[]})',
    (m) => P.room('R', m, { floor: false, openings: [] }).root,
  ),
  scene(
    'room 6 x 3, thick walls, door + window',
    (m) =>
      P.room('R', m, {
        width: 6,
        depth: 3,
        wallThickness: 0.4,
        openings: [
          { wall: 'front', kind: 'door' },
          { wall: 'left', kind: 'window', width: 1, height: 1, sill: 1 },
        ],
      }).root,
  ),
];
const stairsCases = [
  scene(
    'createStairs rise 2, run 3, width 1',
    (m) => P.createStairs('S', m, { totalRise: 2, totalRun: 3, width: 1 }).root,
  ),
  scene(
    'createStairs riser:false',
    (m) => P.createStairs('S', m, { totalRise: 2, totalRun: 3, width: 1, riser: false }).root,
  ),
  scene(
    "createStairs descending -2 / -3, axis 'z'",
    (m) => P.createStairs('S', m, { totalRise: -2, totalRun: -3, width: 1, axis: 'z' }).root,
  ),
  scene(
    'createStairs steps 1',
    (m) => P.createStairs('S', m, { steps: 1, totalRise: 0.2, totalRun: 0.3, width: 1 }).root,
  ),
];

const sceneBuilders: Array<{ name: string; uvKind: string; cases: typeof ladderCases }> = [
  {
    name: 'createLadder',
    uvKind: 'cylindrical side, planar caps (cylinderGeo)',
    cases: ladderCases,
  },
  { name: 'wallWithOpening', uvKind: 'box per panel (boxGeo)', cases: wallCases },
  { name: 'room', uvKind: 'box per panel (boxGeo)', cases: roomCases },
  { name: 'createStairs', uvKind: 'box per tread and riser (boxGeo)', cases: stairsCases },
];

// Every export, in any order; runAudit() checks the list against the file and prints file order.
const sourceOrder = [
  ...builders,
  ...sceneBuilders.map(
    (s): Builder => ({
      name: s.name,
      kind: 'scene',
      design: 'closed',
      uvKind: s.uvKind,
      cases: s.cases,
    }),
  ),
  none('gameMaterial', 'material', 'MeshStandardMaterial factory. No geometry.'),
  none('basicMaterial', 'material', 'MeshBasicMaterial factory. No geometry.'),
  none('glassMaterial', 'material', 'Transparent double-sided MeshStandardMaterial. No geometry.'),
  none('lambertMaterial', 'material', 'MeshLambertMaterial factory. No geometry.'),
  none('rotationTrack', 'animation', 'Keyframe track. No geometry.'),
  none('positionTrack', 'animation', 'Keyframe track. No geometry.'),
  none('scaleTrack', 'animation', 'Keyframe track. No geometry.'),
  none('createClip', 'animation', 'Animation clip. No geometry.'),
  none('idleBreathing', 'animation', 'Animation preset. No geometry.'),
  none('bobbingAnimation', 'animation', 'Animation preset. No geometry.'),
  none('spinAnimation', 'animation', 'Animation preset. No geometry.'),
  none('copyGeometry', 'utility', 'Clones a geometry; facts are those of the source.'),
  none('copyMaterial', 'utility', 'Clones a material. No geometry.'),
  {
    name: 'createInstance',
    kind: 'scene',
    design: 'pass-through',
    uvKind: 'from the source mesh',
    note: 'Reuses the source mesh geometry at a new transform.',
    cases: [
      g('createInstance of boxGeo part', () => {
        const parent = new THREE.Group();
        const source = P.createPart('A', P.boxGeo(1, 1, 1), plain(), { parent });
        P.createInstance('B', source, { position: [2, 0, 0], parent });
        return parent;
      }),
    ],
  },
  none('countTriangles', 'utility', 'Counts triangles. No geometry.'),
  none('countMaterials', 'utility', 'Counts materials. No geometry.'),
  none('getJointNames', 'utility', 'Lists Joint_ names. No geometry.'),
  none('materialBudgetAdvisory', 'utility', 'Material count advisory. No geometry.'),
  none('SANDBOX_DECLARATIONS', 'sandbox', 'Symbol key. Not a builder.'),
  none('buildSandboxGlobals', 'sandbox', 'Sandbox surface. Not a builder.'),
];

/** The top-level `export function` / `export const` names of src/primitives.ts, in file order. */
function exportedNames(): string[] {
  const text = readFileSync(resolve(import.meta.dir, '../src/primitives.ts'), 'utf8');
  return [...text.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]!);
}

interface Probe {
  id: string;
  question: string;
  result: unknown;
}

function probe(id: string, question: string, run: () => unknown): Probe {
  try {
    return { id, question, result: run() };
  } catch (error) {
    return {
      id,
      question,
      result: {
        threw: error instanceof Error ? error.message.split('\n')[0]!.slice(0, 160) : String(error),
      },
    };
  }
}

function probes(): Probe[] {
  return [
    probe(
      'room-floor-datum',
      'room(): is the floor top at local Y=0 (reported at Y=+thickness in 2026-09-21)?',
      () => {
        const { floor } = P.room('R', plain(), { floorThickness: 0.2 });
        const box = new THREE.Box3().setFromObject(floor!);
        return { floorMinY: r6(box.min.y), floorMaxY: r6(box.max.y) };
      },
    ),
    probe(
      'room-corners',
      'room(): how many wall meshes cover a point in each outer corner square and each inner overlap square (defaults: 4 x 4, wall 0.15)?',
      () => {
        const { root } = P.room('R', plain(), { floor: false, openings: [] });
        root.updateMatrixWorld(true);
        const boxes: THREE.Box3[] = [];
        root.traverse((n) => {
          if ((n as THREE.Mesh).isMesh) boxes.push(new THREE.Box3().setFromObject(n));
        });
        const t = 0.15;
        const half = 2;
        const cover = (x: number, z: number) =>
          boxes.filter((b) => b.containsPoint(new THREE.Vector3(x, 1.4, z))).length;
        const corners: Array<[number, number]> = [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];
        return {
          outerCornerCoverage: corners.map(([sx, sz]) =>
            cover(sx * (half + t / 4), sz * (half + t / 4)),
          ),
          innerOverlapCoverage: corners.map(([sx, sz]) =>
            cover(sx * (half - t / 4), sz * (half - t / 4)),
          ),
          notchSize: [t / 2, t / 2],
        };
      },
    ),
    probe(
      'wing-shared-corners',
      'wingGeo(): how many vertices carry the six flat faces, and what normal does the leading-edge face get?',
      () => {
        const geometry = P.wingGeo();
        const n = geometry.getAttribute('normal');
        // The leading edge is the third face: index entries 12 to 17 (after top and bottom).
        // Its face normal points +X (forward).
        const index = geometry.getIndex()!;
        const corners = [...new Set(Array.from({ length: 6 }, (_, k) => index.getX(12 + k)))];
        return {
          vertices: geometry.getAttribute('position').count,
          leadingEdgeVertexNormals: corners.map((i) => [n.getX(i), n.getY(i), n.getZ(i)].map(r6)),
        };
      },
    ),
    probe(
      'room-multiple-openings',
      'room(): does every opening on one wall survive (only the first did in 2026-09-21)?',
      () => {
        const { walls } = P.room('R', plain(), {
          width: 8,
          openings: [
            { wall: 'front', kind: 'door', offset: -2 },
            { wall: 'front', kind: 'door', offset: 2 },
          ],
        });
        let triangles = 0;
        walls.front.traverse((n) => {
          if ((n as THREE.Mesh).isMesh) triangles++;
        });
        const one = P.room('R', plain(), { width: 8 }).walls.front;
        let single = 0;
        one.traverse((n) => {
          if ((n as THREE.Mesh).isMesh) single++;
        });
        return { panelsWithTwoDoors: triangles, panelsWithOneDoor: single };
      },
    ),
    probe(
      'stairs-fractional-steps',
      'createStairs({steps:1.5}): rejected (it built two steps in 2026-09-21)?',
      () =>
        P.createStairs('S', plain(), { steps: 1.5, totalRise: 3, totalRun: 3, width: 1 }).steps
          .length,
    ),
    probe(
      'octagrid-zero-tiles',
      'octaGridPlane({tilesX:0}): rejected (NaN UVs in 2026-09-21)?',
      () => uvFacts(P.octaGridPlane({ tilesX: 0, tilesY: 1 })),
    ),
    probe(
      'wing-unchecked-dimensions',
      'wingGeo({span:NaN}): rejected (unchecked in 2026-09-21)?',
      () => geometryDiagnostics(P.wingGeo({ span: Number.NaN })).nonFiniteVertices,
    ),
    probe(
      'wing-pair-reflection',
      'createWingPair: are both wings outward (left was reflected inside out, K01)?',
      () => {
        const parent = new THREE.Group();
        const { left, right } = P.createWingPair('W', plain(), { rootZ: 0.3, parent });
        const side = (o: THREE.Object3D) => {
          const d = geometryDiagnostics((o as THREE.Mesh).geometry).solid;
          return { orientation: d.orientation, signedVolume: r6(d.signedVolume) };
        };
        return { left: side(left), right: side(right) };
      },
    ),
    probe(
      'torus-self-intersection',
      'torusGeo(0.2, 0.5): the tube crosses the ring axis. Count vertices on the far side of the axis from their own ring centre, and what the solid check says.',
      () => {
        const geometry = P.torusGeo(0.2, 0.5, 8, 12);
        const p = geometry.getAttribute('position');
        // three.js TorusGeometry lies in XY; ring angle u = j/tubular * 2pi.
        const tubular = 12;
        const radial = 8;
        let crossed = 0;
        for (let j = 0; j <= radial; j++)
          for (let i = 0; i <= tubular; i++) {
            const k = j * (tubular + 1) + i;
            const u = (i / tubular) * Math.PI * 2;
            const along = p.getX(k) * Math.cos(u) + p.getY(k) * Math.sin(u);
            if (along < -1e-9) crossed++;
          }
        const d = geometryDiagnostics(geometry);
        return {
          vertices: p.count,
          verticesPastAxis: crossed,
          solid: { ...d.solid, signedVolume: r6(d.solid.signedVolume) },
        };
      },
    ),
    probe(
      'foliage-card-sides',
      'foliageCardGeo(): the doc comment says "double-sided quad". How many triangles, which way do they face, and what side does gameMaterial draw?',
      () => {
        const geometry = P.foliageCardGeo();
        const n = geometry.getAttribute('normal');
        const normals = new Set<string>();
        for (let i = 0; i < n.count; i++) normals.add([n.getX(i), n.getY(i), n.getZ(i)].join(','));
        return {
          triangles: geometryDiagnostics(geometry).triangles,
          normals: [...normals],
          gameMaterialSide: P.gameMaterial(0x336633).side === THREE.DoubleSide ? 'double' : 'front',
        };
      },
    ),
    probe(
      'capsule-pole-triangles',
      'capsuleGeo(r,h,n): how many zero-area triangles at the poles reach the index buffer?',
      () =>
        [3, 6, 16].map((n) => {
          const d = geometryDiagnostics(P.capsuleGeo(0.5, 1, n));
          return {
            segments: n,
            triangles: d.triangles,
            collapsed: d.collapsedByToleranceTriangles,
          };
        }),
    ),
    probe(
      'capsule-zero-length-triangles',
      'capsuleGeo(r, 0): how many zero-area triangles does the empty straight section add?',
      () => {
        const d = geometryDiagnostics(P.capsuleGeo(0.5, 0, 6));
        return { triangles: d.triangles, collapsed: d.collapsedByToleranceTriangles };
      },
    ),
  ];
}

export function runAudit() {
  const order = exportedNames();
  const byName = new Map(sourceOrder.map((b) => [b.name, b]));
  const missing = order.filter((n) => !byName.has(n));
  const extra = sourceOrder.map((b) => b.name).filter((n) => !order.includes(n));
  if (missing.length || extra.length)
    throw new Error(
      `audit list out of date: missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}`,
    );
  const rows = order.map((name) => {
    const b = byName.get(name)!;
    return {
      name,
      kind: b.kind,
      design: b.design,
      uvKind: b.uvKind,
      ...(b.note ? { note: b.note } : {}),
      cases: b.cases.map((c) => measure(c, (c as Partial<{ textured: () => Built }>).textured)),
    };
  });
  return {
    version: 'kiln.primitives-audit.v1',
    kiln: JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf8'))
      .version as string,
    three: JSON.parse(
      readFileSync(resolve(import.meta.dir, '../node_modules/three/package.json'), 'utf8'),
    ).version as string,
    exports: order.length,
    rows,
    probes: probes(),
  };
}

export type Audit = ReturnType<typeof runAudit>;

function summarizeCase(c: CaseResult): string {
  if (c.error) return `throws: ${c.error}`;
  const m = c.meshes;
  if (!m.length) return 'no meshes';
  const closed = m.filter((x) => x.closed).length;
  const manifold = m.filter((x) => x.manifold).length;
  const orient = [...new Set(m.map((x) => x.orientation))].join('/');
  const vol = m.reduce((s, x) => s + x.signedVolume, 0);
  const parts = [
    m.length === 1
      ? m[0]!.closed
        ? 'closed'
        : `open (${m[0]!.boundaryEdges} boundary edges)`
      : `${closed}/${m.length} meshes closed`,
    m.length === 1
      ? m[0]!.manifold
        ? 'manifold'
        : 'non-manifold'
      : `${manifold}/${m.length} manifold`,
    orient,
    `V=${r6(vol)}`,
  ];
  if (c.expectedVolume !== undefined) parts.push(`expected ${c.expectedVolume}`);
  if (c.smoothVolume !== undefined) parts.push(`smooth ${c.smoothVolume}`);
  parts.push(`${c.triangles} tris`);
  const collapsed = m.reduce((s, x) => s + x.collapsedByToleranceTriangles, 0);
  if (collapsed) parts.push(`${collapsed} zero-area`);
  const opposed = m.reduce((s, x) => s + x.normalsOpposed, 0);
  if (opposed) parts.push(`${opposed} normals oppose winding`);
  const over45 = m.reduce((s, x) => s + x.facesOver45Deg, 0);
  if (over45)
    parts.push(
      `${over45} faces with a normal >45 deg off (max ${Math.max(...m.map((x) => x.maxNormalDeviationDeg))})`,
    );
  const mirrored = m.filter((x) => x.mirroredNode).length;
  if (mirrored) parts.push(`${mirrored} mirrored node`);
  if (c.flushTextured)
    parts.push(
      `flush pairs plain ${c.flushPlain!.candidates} (matching ${c.flushPlain!.matching}), textured ${c.flushTextured.candidates}${c.flushTextured.worst ? ` (worst ${c.flushTextured.worst})` : ''}`,
    );
  return parts.join(', ');
}

export function markdown(audit: Audit): string {
  const lines: string[] = [];
  lines.push(`Kiln ${audit.kiln}, three ${audit.three}, ${audit.exports} top-level exports.`, '');
  lines.push('| # | Export | Kind | Design | UV | Case | Measured |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  audit.rows.forEach((row, i) => {
    if (!row.cases.length) {
      lines.push(
        `| ${i + 1} | \`${row.name}\` | ${row.kind} | ${row.design} | ${row.uvKind} | - | ${row.note ?? ''} |`,
      );
      return;
    }
    row.cases.forEach((c, j) => {
      const head =
        j === 0
          ? `| ${i + 1} | \`${row.name}\` | ${row.kind} | ${row.design} | ${row.uvKind} |`
          : '| | | | | |';
      const decl = [
        c.frames.length ? `frames ${c.frames.join(' ')}` : '',
        c.sockets.length ? `sockets ${c.sockets.join(' ')}` : '',
        c.geometryRoles.length ? `role ${c.geometryRoles.join(' ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      lines.push(`${head} ${c.label} | ${summarizeCase(c)}${decl ? `; ${decl}` : ''} |`);
    });
  });
  lines.push('', '## Probes', '');
  for (const p of audit.probes)
    lines.push(`- **${p.id}**: ${p.question} \`${JSON.stringify(p.result)}\``);
  return lines.join('\n');
}

if (import.meta.main) {
  const audit = runAudit();
  console.log(process.argv.includes('--json') ? JSON.stringify(audit, null, 2) : markdown(audit));
}
