/**
 * Kiln UV unwrapping — Wave 3A
 *
 * Auto-generates UV coordinates for an arbitrary BufferGeometry using
 * xatlas (Witness engine alum, C++ → WASM via xatlasjs). Output is a new
 * BufferGeometry — the input is not mutated.
 *
 * Why UVs matter for Kiln: once we support textures (Wave 3B+) and
 * projection painting (Wave 3D), every mesh needs a well-packed UV atlas
 * or projected textures will overlap / stretch. `autoUnwrap` is the step
 * that makes our CSG / subdivide / curveToMesh outputs texture-ready.
 *
 * Runs headlessly in Node via `xatlasjs/dist/node`. Lazy init so the
 * WASM isn't paid for in scenes that don't use textures.
 */

import * as THREE from 'three';
import { prepareUnwrap, remapUnwrapAttribute, validateAtlasRemap, type AtlasMesh } from './uv-data';

// Lazy xatlas init — pays ~100-200ms on first call, then free.
let _xatlasReady: Promise<unknown> | null = null;

type XatlasApi = {
  loaded: boolean;
  createAtlas(): void;
  addMesh(
    indexes: Uint16Array | Uint32Array,
    vertices: Float32Array,
    normals: Float32Array | null,
    coords: Float32Array | null,
    meshObj: string,
    useNormals: boolean,
    useCoords: boolean,
    scale: number,
  ): { meshId: number } | null;
  generateAtlas(
    chartOptions: Record<string, unknown>,
    packOptions: Record<string, unknown>,
    destroyMesh: boolean,
  ): {
    width: number;
    height: number;
    atlasCount: number;
    meshCount: number;
    meshes: AtlasMesh[];
  };
  destroyAtlas(): void;
};

async function getXatlas(): Promise<XatlasApi> {
  if (!_xatlasReady) {
    _xatlasReady = (async () => {
      // xatlasjs publishes a Node-friendly emscripten build under dist/node.
      const apiSpecifier = 'xatlasjs/dist/node/api.mjs';
      const xatlasSpecifier = 'xatlasjs/dist/node/xatlas.js';
      const apiMod = (await import(apiSpecifier)) as unknown as {
        Api: (
          createModule: unknown,
        ) => new (
          onLoad: () => void,
          locateFile: unknown,
          onProgress: unknown,
        ) => XatlasApi;
      };
      const xatlasMod = (await import(xatlasSpecifier)) as unknown as {
        default?: unknown;
      };
      const create = xatlasMod.default ?? xatlasMod;
      const ApiCtor = apiMod.Api(create);
      return new Promise<XatlasApi>((resolve) => {
        const xa = new ApiCtor(() => resolve(xa), null as never, null as never);
      });
    })();
  }
  return _xatlasReady as Promise<XatlasApi>;
}

export interface AutoUnwrapOptions {
  /** Target atlas resolution, integer 1..4096. Actual packed dimensions may differ. Default 1024. */
  resolution?: number;
  /** Padding between charts in texels. Default 2. */
  padding?: number;
  /** Use and preserve source normals; otherwise recompute. Required for normal morphs. Default false. */
  useNormals?: boolean;
}

/**
 * Generate a UV atlas for a BufferGeometry.
 *
 * The output geometry has a fresh `uv` attribute ready for texture
 * sampling, and (usually) a different vertex count than the input: xatlas
 * duplicates vertices along UV seams so each shell gets its own chart.
 *
 * Returns a *new* BufferGeometry; the input is left untouched. Seam remapping
 * preserves per-vertex attributes, position/normal/color morphs, groups and JSON
 * userData. Replaces UV0 and removes stale tangents. Normal behavior is unchanged:
 * recompute by default, preserve source normals with useNormals: true.
 * The current xatlasjs adapter supports at most 65,536 input AND output vertices;
 * split larger meshes. Instancing, multi-page atlases and changed face order are
 * rejected rather than returning corrupt attribute correspondence.
 *
 * @example
 * const raw = boxGeo(1, 2, 1);
 * const unwrapped = await autoUnwrap(raw, { resolution: 1024, padding: 2 });
 * const crate = new THREE.Mesh(unwrapped, woodPBR);
 */
export async function autoUnwrap(
  geometry: THREE.BufferGeometry,
  opts: AutoUnwrapOptions = {},
): Promise<THREE.BufferGeometry> {
  const prepared = prepareUnwrap(geometry, opts);
  const xa = await getXatlas();
  xa.createAtlas();
  try {
    const added = xa.addMesh(
      prepared.index,
      prepared.positions,
      prepared.normals,
      null,
      'kiln-mesh',
      prepared.useNormals,
      false,
      1,
    );
    if (!added)
      throw new Error('autoUnwrap: xatlas.addMesh failed (non-manifold or degenerate geometry?).');
    const result = xa.generateAtlas(
      {},
      { resolution: prepared.resolution, padding: prepared.padding },
      true,
    );
    const mesh = result.meshes[0];
    if (!mesh || result.meshCount !== 1)
      throw new Error('autoUnwrap: xatlas returned no single mesh.');
    if (
      result.atlasCount !== 1 ||
      !Number.isSafeInteger(result.width) ||
      result.width <= 0 ||
      !Number.isSafeInteger(result.height) ||
      result.height <= 0
    )
      throw new Error(
        'autoUnwrap: xatlas must return one valid atlas; multiple atlas pages are unsupported.',
      );
    const remap = validateAtlasRemap(mesh, prepared.index, geometry.getAttribute('position').count);
    const out = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (name === 'uv' || name === 'tangent' || (name === 'normal' && !prepared.useNormals))
        continue;
      out.setAttribute(name, remapUnwrapAttribute(attribute, remap.oldIndexes));
    }
    for (const [name, targets] of Object.entries(geometry.morphAttributes)) {
      // Three's declaration lists standard keys, although its runtime uses a dictionary.
      (out.morphAttributes as Record<string, THREE.BufferAttribute[]>)[name] = targets.map(
        (attribute) => remapUnwrapAttribute(attribute, remap.oldIndexes),
      );
    }
    out.morphTargetsRelative = geometry.morphTargetsRelative;
    out.setIndex(new THREE.BufferAttribute(new Uint32Array(remap.index), 1));
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(remap.uv), 2));
    out.name = geometry.name;
    // Triangle correspondence was checked before retaining material groups and draw range.
    out.groups = geometry.groups.map((group) => ({ ...group }));
    out.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
    out.userData = JSON.parse(JSON.stringify(geometry.userData));
    // xatlas's requested resolution is not the returned width/height (often rectangular).
    out.userData['atlas'] = {
      width: result.width,
      height: result.height,
      atlasCount: result.atlasCount,
    };
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    repairZeroNormals(out);
    return out;
  } finally {
    xa.destroyAtlas();
  }
}

/**
 * Replace any zero-length or non-finite normal with one derived from the faces
 * that use it.
 *
 * A CSG result routinely carries a few zero-area triangles -- Manifold produces
 * them where cutters meet a curved surface at a shallow angle. They are
 * invisible, they survive the atlas, and `computeVertexNormals` cannot give
 * them a direction: the cross product of two collinear edges is the zero
 * vector, so every vertex touched only by such triangles ends up at (0, 0, 0).
 * glTF rejects that (`GLTF_ACCESSOR_VECTOR3_NON_UNIT`), so an asset that looks
 * finished fails export. Measured on a torus shell cut to an arc: 118 of 662.
 *
 * Only the broken normals are rebuilt, from the non-degenerate faces around
 * them. Rebuilding the whole attribute would be no more correct and would throw
 * away the normals xatlas already carried through correctly.
 */
function repairZeroNormals(geo: THREE.BufferGeometry): void {
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const position = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  const index = geo.getIndex();
  if (!normal || !position || !index) return;

  const broken = new Set<number>();
  for (let i = 0; i < normal.count; i++) {
    const x = normal.getX(i);
    const y = normal.getY(i);
    const z = normal.getZ(i);
    if (!Number.isFinite(x + y + z) || Math.hypot(x, y, z) < 1e-6) broken.add(i);
  }
  if (broken.size === 0) return;

  const acc = new Float32Array(normal.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  const edge = new THREE.Vector3();
  for (let t = 0; t + 2 < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (!tri.some((i) => broken.has(i))) continue;
    a.fromBufferAttribute(position, tri[0]!);
    b.fromBufferAttribute(position, tri[1]!);
    c.fromBufferAttribute(position, tri[2]!);
    // Area-weighted, which is what the cross product already gives: a sliver
    // triangle should not pull the normal of the vertex it happens to touch.
    face.subVectors(c, a);
    edge.subVectors(b, a);
    face.crossVectors(edge, face);
    for (const i of tri) {
      if (!broken.has(i)) continue;
      const o = i * 3;
      acc[o] = acc[o]! + face.x;
      acc[o + 1] = acc[o + 1]! + face.y;
      acc[o + 2] = acc[o + 2]! + face.z;
    }
  }

  for (const i of broken) {
    face.set(acc[i * 3]!, acc[i * 3 + 1]!, acc[i * 3 + 2]!);
    // A vertex used only by degenerate triangles has no direction to recover.
    // Any unit vector satisfies the validator; +Y is the least surprising.
    if (face.lengthSq() < 1e-20) face.set(0, 1, 0);
    else face.normalize();
    normal.setXYZ(i, face.x, face.y, face.z);
  }
  normal.needsUpdate = true;
}
