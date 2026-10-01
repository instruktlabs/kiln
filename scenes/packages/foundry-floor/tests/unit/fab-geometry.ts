// Shared by the tests that need the accepted GLBs (glb-world, clearance, handoff): the pinned files (the staged pack's
// copies, or the authors' outputs while they are the pinned bytes; read-only inputs), parsed once, and the fab's
// static geometry as world triangles, baked the way the scene draws it (bake.ts forms, the asset map's hidden-by-default
// parts left out, the detailed side only) at the placements the scene uses (placements.ts).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseAssetMap } from '../../src/scene/assets/asset-map';
import type { AssetMap } from '../../src/scene/assets/asset-map';
import { bakeModel } from '../../src/scene/glb/bake';
import type { BakedModel, PoseInput } from '../../src/scene/glb/bake';
import { prepareModelLevels } from '../../src/scene/glb/model-levels';
import { entityBake } from '../../src/scene/glb/options';
import { staticPlacements } from '../../src/scene/world/placements';
import type { Placed } from '../../src/scene/world/placements';
import type { FabData } from '../../src/sim/data';

export const PACKAGE = resolve(import.meta.dir, '../..');
const COMMONS = resolve(PACKAGE, '../../..');
export const MAP: AssetMap = parseAssetMap(readFileSync(resolve(PACKAGE, 'data/assets.json'), 'utf8'));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
export const ACCEPTED = Object.entries(MAP.entities).filter(([, e]) => e.glb && e.pins).map(([id]) => id);

/** The pinned bytes of an accepted entity's GLB: the staged copy, else the author's output, whichever matches the pin. */
export function glbPath(id: string): string | undefined {
  const e = MAP.entities[id]!;
  const candidates = [resolve(PACKAGE, 'staged/ff2', e.glb!), ...(e.source ? [resolve(COMMONS, 'showcase/authors', e.source.author, e.source.file)] : [])];
  return candidates.find(path => existsSync(path) && sha(path) === e.pins!.sha256);
}
export const GLBS_AVAILABLE = ACCEPTED.every(id => glbPath(id));

let loaded: Promise<Map<string, GLTF>> | undefined;
export function loadModels(fixtures?: ReadonlyMap<string, string>): Promise<Map<string, GLTF>> {
  const load = async () => {
    const models = new Map<string, GLTF>();
    for (const id of ACCEPTED) {
      const bytes = readFileSync(fixtures?.get(id) ?? glbPath(id)!);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
      await prepareModelLevels(gltf); models.set(id, gltf);
    }
    return models;
  };
  return fixtures ? load() : loaded ??= load();
}

const bakes = new WeakMap<GLTF, { model: BakedModel; variantForm: Record<string, number> }>();
/** The entity's baked model with the scene's bake options (no driver anchors: those change grouping, not geometry). */
export function bakedEntity(models: Map<string, GLTF>, id: string): { model: BakedModel; variantForm: Record<string, number> } {
  const gltf = models.get(id)!;
  let b = bakes.get(gltf);
  if (!b) {
    const bake = entityBake(MAP, id);
    b = { model: bakeModel(id, models.get(id)!, bake.options), variantForm: bake.variantForm };
    bakes.set(gltf, b);
  }
  return b;
}

/** The world matrix the scene gives a static placement (entity-set place: translation, yaw, placement and entity scale). */
export function placementMatrix(id: string, p: Placed, out = new Matrix4()): Matrix4 {
  const k = MAP.entities[id]!.scale?.value ?? 1;
  return out.compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw),
    new Vector3((p.scale?.[0] ?? 1) * k, (p.scale?.[1] ?? 1) * k, (p.scale?.[2] ?? 1) * k));
}

const partBakes = new WeakMap<GLTF, Map<string, BakedModel>>();
/** One entity's detailed triangles (9 numbers each) in world coordinates, by anchor name, for a pose (clips at clip
 *  times) and a world matrix. `anchors` makes those nodes groups of their own: a grouping only, the geometry is the
 *  same. Hidden-by-default parts are included (the caller decides); variant forms other than `form` are not. */
export function posedParts(models: Map<string, GLTF>, id: string, world: Matrix4, input: PoseInput = {}, anchors: readonly string[] = [], form = 0, floorMoves = false): Map<string, Float64Array> {
  const key = `${id}|${anchors.join(',')}|${floorMoves}`;
  const gltf = models.get(id)!;
  let cached = partBakes.get(gltf);
  if (!cached) partBakes.set(gltf, cached = new Map());
  let model = cached.get(key);
  if (!model) cached.set(key, (model = bakeModel(id, gltf, entityBake(MAP, id, { anchors, floorMoves }).options)));
  const posed = new Float32Array(model.anchors.length * 16);
  model.pose(input, posed);
  const chunks = new Map<string, number[]>(), m = new Matrix4(), a = new Matrix4(), v = new Vector3();
  for (const g of model.groups) {
    if (g.form !== form || g.lod !== 0) continue;
    const name = model.anchors[g.anchor]!, out = chunks.get(name) ?? [];
    chunks.set(name, out);
    m.multiplyMatrices(world, a.fromArray(posed, g.anchor * 16));
    const pos = g.geometry.getAttribute('position'), index = g.geometry.index!;
    for (let t = 0; t < index.count; t++) { v.fromBufferAttribute(pos, index.getX(t)).applyMatrix4(m); out.push(v.x, v.y, v.z); }
  }
  return new Map([...chunks].map(([k, list]) => [k, Float64Array.from(list)]));
}

export interface Owner { entity: string; id: string }
/** World triangles: 9 numbers each (a, b, c); owner[i] indexes `owners`. */
export interface WorldTriangles { tris: Float64Array; owner: Int32Array; owners: Owner[]; count: number }

/** The fab's static geometry at rest as world triangles, for the placements `include` accepts; `yRange` keeps only
 *  triangles reaching into that band of heights. */
export function staticTriangles(models: Map<string, GLTF>, data: FabData, include: (entity: string, p: Placed) => boolean = () => true,
  yRange: readonly [number, number] = [-Infinity, Infinity]): WorldTriangles {
  const placements = staticPlacements(data);
  const chunks: number[] = [], owner: number[] = [], owners: Owner[] = [];
  const world = new Matrix4(), m = new Matrix4(), anchorRest = new Matrix4(), v = new Vector3(), tri = new Float64Array(9);
  for (const [entity, list] of Object.entries(placements)) {
    if (!models.has(entity)) continue;
    const { model, variantForm } = bakedEntity(models, entity);
    const hidden = new Set(MAP.entities[entity]!.hideByDefault ?? []);
    for (const p of list) {
      if (!include(entity, p)) continue;
      const form = p.variant !== undefined ? variantForm[p.variant] : 0;
      if (form === undefined) throw new Error(`${entity}: ${p.id} names variant ${p.variant}`);
      placementMatrix(entity, p, world).multiply(model.forms[form]!.offset);
      const oi = owners.push({ entity, id: p.id }) - 1;
      for (const g of model.groups) {
        if (g.form !== form || g.lod !== 0 || hidden.has(model.anchors[g.anchor]!)) continue;
        m.multiplyMatrices(world, anchorRest.fromArray(model.rest, g.anchor * 16));
        const pos = g.geometry.getAttribute('position'), index = g.geometry.index!;
        for (let t = 0; t < index.count; t += 3) {
          let lo = Infinity, hi = -Infinity;
          for (let k = 0; k < 3; k++) {
            v.fromBufferAttribute(pos, index.getX(t + k)).applyMatrix4(m);
            tri[k * 3] = v.x; tri[k * 3 + 1] = v.y; tri[k * 3 + 2] = v.z;
            lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
          }
          if (hi < yRange[0] || lo > yRange[1]) continue;
          for (let k = 0; k < 9; k++) chunks.push(tri[k] as number);
          owner.push(oi);
        }
      }
    }
  }
  return { tris: Float64Array.from(chunks), owner: Int32Array.from(owner), owners, count: owner.length };
}
