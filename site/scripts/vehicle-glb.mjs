import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHash } from 'node:crypto';

/**
 * Measure a Kiln vehicle GLB: the triangles, bounds, materials and named parts of each detail tier, and of the
 * wheels, read from the file itself.
 *
 * A vehicle carries its tiers as sibling groups `LOD0`, `LOD1`, `LOD2` under one root, with the four wheel
 * groups `Wheel_FL/FR/RL/RR` beside them. The GLBs delivered by the Golden Gate scene were rewritten to the glTF
 * vendor extension `MSFT_lod`: `LOD1` and `LOD2` leave the scene tree and are referenced from `LOD0` through
 * `extensions.MSFT_lod.ids`, and each wheel references an empty far node, so a loader without the extension
 * shows `LOD0` and the wheels only. The author's saved export keeps all three groups in the scene tree. Both
 * forms are read here, so the numbers of one can be checked against the other.
 */

const TRIANGLES = 4;
const WHEEL_NAME = /^Wheel_[FR][LR]$/;
const LOD_NAME = /^LOD(\d+)$/;

/**
 * The switch thresholds of a delivered file are the fraction of the screen the body's bounding sphere covers.
 * `msft-lod.mjs` (the coordinator's writer) computed them for a 50 degree vertical field of view at 16:9; the
 * same constants read them back into distances.
 */
export const LOD_VIEW = Object.freeze({ verticalFovDegrees: 50, aspect: 16 / 9 });

export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The JSON and binary chunks of a GLB, with the raw chunk bytes for byte-level comparisons. */
export function parseGlb(bytes) {
  const data = Buffer.from(bytes);
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a binary glTF file');
  if (data.readUInt32LE(4) !== 2) throw new Error('Not a glTF 2 binary');
  if (data.readUInt32LE(8) !== data.length) throw new Error('GLB header length differs from the file length');
  let json;
  let jsonBytes;
  let binBytes = Buffer.alloc(0);
  let offset = 12;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (chunk.length !== length) throw new Error('GLB chunk runs past the end of the file');
    if (type === 'JSON') {
      jsonBytes = chunk;
      json = JSON.parse(chunk.toString('utf8'));
    } else if (type === 'BIN\0') {
      binBytes = chunk;
    }
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, jsonBytes, binBytes };
}

const localMatrix = (node) => (node.matrix
  ? new Matrix4().fromArray(node.matrix)
  : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1]))));

const round = (value, places = 6) => Number(value.toFixed(places));
const roundAll = (values) => values.map((value) => round(value));

/** Triangles, bounds, named parts and materials below one node, following only `children` (never `MSFT_lod`). */
function measure(json, index, parentWorld, parentPath = []) {
  const box = new Box3();
  const parts = [];
  const materials = new Set();
  let triangles = 0;
  const visit = (nodeIndex, parent, path) => {
    const node = json.nodes[nodeIndex];
    const world = parent.clone().multiply(localMatrix(node));
    const here = [...path, node.name ?? `node_${nodeIndex}`];
    if (node.mesh !== undefined) {
      parts.push(here.join('/'));
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        if (!accessor.min || !accessor.max) throw new Error(`GLB position bounds missing: ${here.join('/')}`);
        const count = primitive.indices !== undefined ? json.accessors[primitive.indices].count : accessor.count;
        if ((primitive.mode ?? TRIANGLES) === TRIANGLES) triangles += count / 3;
        if (primitive.material !== undefined) materials.add(json.materials[primitive.material].name ?? `material_${primitive.material}`);
        for (let corner = 0; corner < 8; corner++) {
          box.expandByPoint(new Vector3(...[0, 1, 2].map((axis) => ((corner >> axis) & 1 ? accessor.max[axis] : accessor.min[axis]))).applyMatrix4(world));
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, here);
  };
  visit(index, parentWorld, parentPath);
  return { triangles, box, parts, materials: [...materials].sort() };
}

const emptyBox = () => ({ min: null, max: null, size: null });
const boxRecord = (box) => (box.isEmpty()
  ? emptyBox()
  : { min: roundAll(box.min.toArray()), max: roundAll(box.max.toArray()), size: roundAll(box.getSize(new Vector3()).toArray()) });

/** Bounding-sphere radius of a box, as the writer of the delivered files measures it. */
const sphereRadius = (box) => 0.5 * box.getSize(new Vector3()).length();

/**
 * The distance at which a bounding sphere of `radius` covers `coverage` of the screen (the inverse of the
 * writer's formula: projected diameter over screen height, then a disc over a screen of the given aspect).
 */
export function coverageToDistance(radius, coverage, { verticalFovDegrees, aspect } = LOD_VIEW) {
  if (!(coverage > 0)) return null;
  const projected = Math.sqrt((4 * coverage * aspect) / Math.PI);
  return radius / (projected * Math.tan((verticalFovDegrees / 2) * (Math.PI / 180)));
}

/**
 * What three.js's own loader (the one the site's viewer uses) puts in the scene from these bytes: the mesh and
 * triangle counts of everything it would draw. A file's `MSFT_lod` links are unknown to it, so this is how the
 * catalog's "top tier and wheels" figures are checked against the real loader instead of against a model of it.
 */
export async function loaderDraws(bytes) {
  const data = Buffer.from(bytes);
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  let meshes = 0;
  let triangles = 0;
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
  });
  return { meshes, triangles };
}

/**
 * Measure a vehicle GLB. Returns the root name, the file's LOD form, one record per tier and per wheel, and the
 * totals a viewer without `MSFT_lod` draws (the top tier and the wheels).
 */
export function inspectVehicleGlb(bytes) {
  const { json } = parseGlb(bytes);
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (sceneRoots.length !== 1) throw new Error(`A vehicle has one root node; the scene has ${sceneRoots.length}`);
  const rootIndex = sceneRoots[0];
  const root = json.nodes[rootIndex];
  const rootWorld = localMatrix(root);
  const children = (root.children ?? []).map((index) => ({ index, node: json.nodes[index] }));

  const top = children.find(({ node }) => node.name === 'LOD0');
  if (!top) throw new Error('The vehicle has no LOD0 group');
  const linked = top.node.extensions?.MSFT_lod?.ids;
  const levelIndexes = linked ? [top.index, ...linked] : children.filter(({ node }) => LOD_NAME.test(node.name ?? '')).sort((a, b) => Number(LOD_NAME.exec(a.node.name)[1]) - Number(LOD_NAME.exec(b.node.name)[1])).map(({ index }) => index);
  const form = linked ? 'MSFT_lod' : 'named-groups';
  const coverage = top.node.extras?.MSFT_screencoverage ?? null;
  if (linked && (!Array.isArray(coverage) || coverage.length !== levelIndexes.length)) throw new Error('MSFT_lod is present but MSFT_screencoverage does not give one threshold per tier');

  const levels = levelIndexes.map((index, level) => {
    const node = json.nodes[index];
    if (node.name !== `LOD${level}`) throw new Error(`Tier ${level} is named ${node.name}, not LOD${level}`);
    const measured = measure(json, index, rootWorld, [root.name ?? 'root']);
    return { level, name: node.name, ...measured };
  });

  const wheelNodes = children.filter(({ node }) => WHEEL_NAME.test(node.name ?? ''));
  const wheels = wheelNodes.map(({ index, node }) => {
    const measured = measure(json, index, rootWorld, [root.name ?? 'root']);
    const size = measured.box.getSize(new Vector3());
    const far = node.extensions?.MSFT_lod?.ids?.map((id) => json.nodes[id]) ?? [];
    // A far level with nothing in it is how the file hides a wheel; its own threshold says how far away.
    const coverageOfWheel = node.extras?.MSFT_screencoverage;
    const empty = far.length > 0 && far.every((farNode) => farNode.mesh === undefined && !(farNode.children ?? []).length);
    const hiddenBeyond = empty && Array.isArray(coverageOfWheel) && coverageOfWheel[0] > 0 ? coverageToDistance(sphereRadius(measured.box), coverageOfWheel[0]) : null;
    return {
      name: node.name,
      pivot: roundAll(node.translation ?? [0, 0, 0]),
      // The pivot is the wheel's centre: the tyre's height is its diameter, and the axle runs along Z.
      radius: round(size.y / 2),
      width: round(size.z),
      triangles: measured.triangles,
      parts: measured.parts,
      materials: measured.materials,
      box: measured.box,
      hiddenBeyondMetres: hiddenBeyond === null ? null : round(hiddenBeyond, 1),
    };
  });
  // The distance at which the wheels stop being drawn (the nearest, if they differ), or null when they never do.
  const wheelsHideAt = wheels.length > 0 && wheels.every((wheel) => wheel.hiddenBeyondMetres !== null) ? Math.min(...wheels.map((wheel) => wheel.hiddenBeyondMetres)) : null;
  const sameDistance = (a, b) => Math.abs(a - b) <= 0.02 * b;
  const wheelTriangles = wheels.reduce((sum, wheel) => sum + wheel.triangles, 0);
  const wheelBox = new Box3();
  for (const wheel of wheels) wheelBox.union(wheel.box);

  const bodyRadius = sphereRadius(levels[0].box);
  const tiers = levels.map((level, index) => {
    const threshold = coverage && index > 0 ? coverage[index - 1] : null;
    const distance = threshold ? coverageToDistance(bodyRadius, threshold) : null;
    // A tier draws the wheels unless they are already gone where it starts.
    const wheelsShown = wheels.length > 0 && !(wheelsHideAt !== null && distance !== null && (distance >= wheelsHideAt || sameDistance(distance, wheelsHideAt)));
    const box = level.box.clone();
    if (wheelsShown) box.union(wheelBox);
    return {
      tier: level.name,
      triangles: level.triangles + (wheelsShown ? wheelTriangles : 0),
      bodyTriangles: level.triangles,
      wheelTriangles: wheelsShown ? wheelTriangles : 0,
      wheelsShown,
      bounds: boxRecord(box),
      bodyBounds: boxRecord(level.box),
      parts: level.parts,
      materials: level.materials,
      // The coverage below which this tier replaces the one before it, and the distance that coverage means.
      coverageBelow: threshold,
      distanceMetres: distance === null ? null : round(distance, 1),
    };
  });
  const culledBelow = coverage && coverage.length === levels.length ? coverage.at(-1) : null;

  const materials = [...new Set([...levels.flatMap((level) => level.materials), ...wheels.flatMap((wheel) => wheel.materials)])].sort();
  return {
    root: root.name ?? 'root',
    form,
    tiers,
    wheels: wheels.map(({ box, materials: wheelMaterials, ...wheel }) => wheel),
    wheelsHiddenBeyondMetres: wheelsHideAt,
    // True only when the wheels' own threshold is the last tier's start (within the tolerance), so "the wheels stop
    // being drawn where LOD2 starts" is exact; wheels that vanish at some other distance are not that.
    wheelsHiddenAtLastTier: wheelsHideAt !== null && tiers.length > 1 && !tiers.at(-1).wheelsShown && tiers.at(-1).distanceMetres !== null && sameDistance(tiers.at(-1).distanceMetres, wheelsHideAt),
    culledBelow,
    culledDistanceMetres: culledBelow ? round(coverageToDistance(bodyRadius, culledBelow), 1) : null,
    materials,
    materialCount: json.materials?.length ?? 0,
    meshCount: json.meshes?.length ?? 0,
    nodeCount: json.nodes.length,
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    // What a loader that ignores MSFT_lod draws: the top tier and the wheels.
    drawnByPlainLoader: {
      tier: levels[0].name,
      triangles: levels[0].triangles + wheelTriangles,
      bounds: tiers[0].bounds,
      materials: [...new Set([...levels[0].materials, ...wheels.flatMap((wheel) => wheel.materials)])].sort(),
    },
    animations: (json.animations ?? []).map((clip) => clip.name),
  };
}
