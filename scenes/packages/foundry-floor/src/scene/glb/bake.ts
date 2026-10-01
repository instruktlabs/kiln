// SPDX-License-Identifier: MIT
// Bakes one accepted GLB (as the kit's loader parsed it) into what the entity sets instance (D-21: the asset map says
// which nodes move, switch or swap; nothing here knows a particular model):
//   anchors  the model root plus every node the scene poses or switches (targets of the clips it plays, driven nodes,
//            hideable nodes). A part belongs to its nearest anchor ancestor and is baked in that anchor's rest frame,
//            so a posed instance needs one matrix per anchor, never per part.
//   forms    one per variant: a subtree (its translation undone, for the wall kit), hidden names (switch variants
//            such as the signal-tower states) and material swaps (litho amber). A model without variants has one form.
//   groups   per (form, anchor, LOD side, opaque or transparent): every part merged into one indexed geometry carrying
//            its material as vertex data (linear colour; roughness, metalness, opacity and the tint flag; emissive),
//            so one shared node material draws them all. Double-sided materials get their back faces as reversed
//            triangles with negated normals, so no draw needs DoubleSide.
//   poses    clips sampled with their own keyframe interpolants (the GLBs carry no loop flags; looping is the
//            scene's rule per clip), plus direct translations of driven nodes (the stocker crane), into one model-frame
//            matrix per anchor.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Matrix3, Matrix4, PropertyBinding, Quaternion, Vector3 } from 'three/webgpu';
import type { Interpolant, Material, Mesh, Object3D } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Box3Json, SwapMaterial, V3 } from '../assets/asset-map';
import { modelLevels } from './model-levels';

export interface MaterialLook { name: string; color: V3; roughness: number; metalness: number; opacity: number; emissive: V3; transparent: boolean; doubleSided: boolean }
export interface FormSpec {
  name: string;
  /** Only this subtree draws, with the root's model-frame translation undone (the wall kit's side-by-side panels). */
  root?: string;
  /** Names hidden in this form (and everything under them). */
  hide: readonly string[];
  /** Material name to replacement look. */
  swaps: Readonly<Record<string, MaterialLook>>;
}
export interface BakeOptions {
  anchors: readonly string[];
  forms: readonly FormSpec[];
  /** Vertices of this material take the per-instance tint (lot class, synthetic traffic). */
  tintMaterial?: string | null;
  /** The clips the scene samples. */
  clips: readonly string[];
  /** Nodes the scene translates directly (the stocker crane): each must be an anchor or on an anchor's chain. */
  driven?: readonly string[];
  /** Clip sweeps (model frame) added to each form's bounds, so a swung lid is never culled. */
  sweeps?: readonly Box3Json[];
}
export interface BakedGroup { form: number; anchor: number; lod: 0 | 1; transparent: boolean; tinted: boolean; geometry: BufferGeometry; triangles: number }
export interface BakedForm {
  name: string;
  /** Undoes the form root's translation (identity for whole-model forms). */
  offset: Matrix4;
  /** Bounding sphere in the form frame (rest parts plus clip sweeps). */
  center: V3; radius: number;
  hasLod1: boolean;
  /** Triangles drawn per instance at rest (detailed, lod1), back faces included. */
  triangles: [number, number];
}
export interface PoseInput {
  clips?: readonly (readonly [name: string, seconds: number])[];
  translate?: readonly (readonly [node: string, x: number, y: number, z: number])[];
}
export interface BakedModel {
  readonly id: string;
  readonly anchors: readonly string[];
  readonly forms: readonly BakedForm[];
  readonly groups: readonly BakedGroup[];
  /** Anchor rest matrices in the model frame, 16 floats each (anchor 0 is the root: identity). */
  readonly rest: Float32Array;
  formIndex(name: string): number;
  anchorIndex(name: string): number;
  /** Writes one model-frame matrix per anchor (16 floats each) for the sampled clips and translations. */
  pose(input: PoseInput, out: Float32Array): void;
  clipSeconds(name: string): number;
  /** One animated value of a clip at time t (for inverse lookups such as the hoist table). */
  trackValue(clip: string, node: string, path: 'position' | 'quaternion' | 'scale', t: number): number[];
  /** A node's rest matrix in the model frame. */
  locator(name: string): Matrix4 | null;
  dispose(): void;
}

/** A palette swap as a material look (hex colours are sRGB; three stores linear). The part keeps its own sidedness. */
export function swapLook(name: string, s: SwapMaterial): MaterialLook {
  const c = new Color(s.color), e = s.emissive ? new Color(s.emissive) : null, opacity = s.opacity ?? 1;
  return { name, color: [c.r, c.g, c.b], roughness: s.roughness, metalness: s.metalness, opacity, emissive: e ? [e.r, e.g, e.b] : [0, 0, 0], transparent: opacity < 1, doubleSided: false };
}

function lookOf(material: Material): MaterialLook {
  const m = material as Material & { color?: Color; roughness?: number; metalness?: number; emissive?: Color; emissiveIntensity?: number };
  const k = m.emissiveIntensity ?? 1, e = m.emissive;
  return {
    name: material.name, color: m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1], roughness: m.roughness ?? 1, metalness: m.metalness ?? 0,
    opacity: material.opacity, emissive: e ? [e.r * k, e.g * k, e.b * k] : [0, 0, 0], transparent: material.transparent || material.opacity < 1,
    doubleSided: material.side === DoubleSide,
  };
}

interface Acc { pos: number[]; nrm: number[]; col: number[]; mat: number[]; emi: number[]; idx: number[]; tinted: boolean; tris: number }
interface PoseNode { obj: Object3D; rp: Vector3; rq: Quaternion; rs: Vector3; restLocal: Matrix4; p: Vector3; q: Quaternion; s: Vector3; animated: boolean }
interface Track { node: PoseNode; path: 'position' | 'quaternion' | 'scale'; interp: Interpolant }

export function bakeModel(id: string, gltf: GLTF, o: BakeOptions): BakedModel {
  const root = gltf.scene;
  const levels = modelLevels(gltf), parentOf = (obj: Object3D) => levels.parents.get(obj) ?? null;
  const worldOf = (obj: Object3D) => levels.worlds.get(obj)!;
  const isUnder = (obj: Object3D, ancestor: Object3D): boolean => { for (let x: Object3D | null = obj; x; x = parentOf(x)) if (x === ancestor) return true; return false; };
  // Original GLB node names (the loader may make names unique): node index -> object via the parser's associations.
  const byName = new Map<string, Object3D>();
  const nodesJson = (gltf.parser.json as { nodes?: { name?: string }[] }).nodes ?? [];
  levels.objects.forEach(obj => {
    const index = levels.indices.get(obj);
    const name = index !== undefined ? nodesJson[index]?.name : undefined;
    if (name && !byName.has(name)) byName.set(name, obj);
  });
  const need = (name: string, what: string) => {
    const obj = byName.get(name);
    if (!obj) throw new Error(`${id}: ${what} ${name} is not a node of the GLB`);
    return obj;
  };
  const lod1 = byName.get('lod1') ?? null;
  const anchorNames = ['(root)', ...o.anchors.filter((n, i, a) => a.indexOf(n) === i)];
  const anchorObjs: Object3D[] = [root, ...anchorNames.slice(1).map(n => need(n, 'anchor'))];
  const anchorOf = (obj: Object3D): number => {
    for (let x: Object3D | null = obj; x && x !== root; x = parentOf(x)) { const i = anchorObjs.indexOf(x); if (i > 0) return i; }
    return 0;
  };
  // The model frame is the loaded scene's (identity): the root anchor's rest matrix is the identity.
  const rest = new Float32Array(anchorObjs.length * 16);
  const restWorld = anchorObjs.map((a, i) => (i === 0 ? new Matrix4() : worldOf(a).clone()));
  const restInv = restWorld.map(w => w.clone().invert());
  restWorld.forEach((w, i) => w.toArray(rest, i * 16));

  const forms: BakedForm[] = [];
  const formSpecs = o.forms.length ? o.forms : [{ name: 'default', hide: [], swaps: {} }];
  const formRoots = formSpecs.map(f => (f.root ? need(f.root, 'form root') : null));
  const formHidden = formSpecs.map(f => f.hide.map(n => need(n, 'hidden node')));
  const accs = new Map<string, Acc>();
  const keyOf = (f: number, a: number, lod: number, tr: boolean) => `${f}|${a}|${lod}|${tr ? 1 : 0}`;
  const bounds = formSpecs.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], lod1: false, tris: [0, 0] as [number, number] }));
  const meshes: Mesh[] = [];
  levels.objects.forEach(obj => { if ((obj as Mesh).isMesh && (levels.lods.get(obj) ?? 0) <= 1) meshes.push(obj as Mesh); });

  const v = new Vector3(), n = new Vector3(), w = new Vector3(), m = new Matrix4(), nm = new Matrix3();
  for (const mesh of meshes) {
    const lodSide: 0 | 1 = levels.lods.get(mesh) === 1 || (lod1 && isUnder(mesh, lod1)) ? 1 : 0;
    const anchor = anchorOf(mesh);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) continue;
    const base = lookOf(material);
    const geo = mesh.geometry;
    const position = geo.getAttribute('position');
    if (!position) continue;
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const normal = geo.getAttribute('normal');
    const index = geo.index;
    m.multiplyMatrices(restInv[anchor] as Matrix4, worldOf(mesh));
    nm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const triCount = index ? index.count / 3 : position.count / 3;
    formSpecs.forEach((spec, f) => {
      const froot = formRoots[f];
      if (froot && !isUnder(mesh, froot)) return;
      if ((formHidden[f] as Object3D[]).some(h => isUnder(mesh, h))) return;
      const swap = spec.swaps[base.name];
      const look = swap ? { ...swap, doubleSided: base.doubleSided } : base;
      const key = keyOf(f, anchor, lodSide, look.transparent);
      let acc = accs.get(key);
      if (!acc) accs.set(key, (acc = { pos: [], nrm: [], col: [], mat: [], emi: [], idx: [], tinted: false, tris: 0 }));
      const tint = o.tintMaterial && base.name === o.tintMaterial ? 1 : 0;
      if (tint) acc.tinted = true;
      const b = bounds[f]!;
      const sides = look.doubleSided ? 2 : 1;
      for (let side = 0; side < sides; side++) {
        const offset = acc.pos.length / 3, sign = side === 0 ? 1 : -1;
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(m);
          n.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize().multiplyScalar(sign);
          acc.pos.push(v.x, v.y, v.z); acc.nrm.push(n.x, n.y, n.z);
          acc.col.push(look.color[0], look.color[1], look.color[2]);
          acc.mat.push(look.roughness, look.metalness, look.opacity, tint);
          acc.emi.push(look.emissive[0], look.emissive[1], look.emissive[2]);
          if (side === 0) {
            // Bounds in the model frame: back to the rest pose through the anchor's rest matrix.
            w.copy(v).applyMatrix4(restWorld[anchor] as Matrix4);
            for (let k = 0; k < 3; k++) { const c = w.getComponent(k); if (c < (b.min[k] as number)) b.min[k] = c; if (c > (b.max[k] as number)) b.max[k] = c; }
          }
        }
        const reverse = flip !== (side === 1);
        for (let t = 0; t < triCount; t++) {
          const a0 = index ? index.getX(t * 3) : t * 3, a1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, a2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
          if (reverse) acc.idx.push(offset + a0, offset + a2, offset + a1);
          else acc.idx.push(offset + a0, offset + a1, offset + a2);
        }
        acc.tris += triCount;
        b.tris[lodSide] += triCount;
      }
      if (lodSide === 1) b.lod1 = true;
    });
  }

  const groups: BakedGroup[] = [];
  for (const [key, acc] of accs) {
    const [f, a, lod, tr] = key.split('|').map(Number) as [number, number, number, number];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(acc.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(acc.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(acc.col), 3));
    g.setAttribute('ffMat', new BufferAttribute(new Float32Array(acc.mat), 4));
    g.setAttribute('ffEmis', new BufferAttribute(new Float32Array(acc.emi), 3));
    g.setIndex(new BufferAttribute(acc.pos.length / 3 > 65535 ? new Uint32Array(acc.idx) : new Uint16Array(acc.idx), 1));
    g.computeBoundingSphere();
    g.name = `${id}:${formSpecs[f]?.name}:${anchorNames[a]}:${lod ? 'lod1' : 'detail'}${tr ? ':transparent' : ''}`;
    groups.push({ form: f, anchor: a, lod: lod as 0 | 1, transparent: tr === 1, tinted: acc.tinted, geometry: g, triangles: acc.tris });
  }
  // Stable draw order: by form, then anchor, LOD side and pass.
  groups.sort((x, y) => x.form - y.form || x.anchor - y.anchor || x.lod - y.lod || Number(x.transparent) - Number(y.transparent));

  formSpecs.forEach((spec, f) => {
    const b = bounds[f]!, froot = formRoots[f];
    const t = froot ? new Vector3().setFromMatrixPosition(worldOf(froot)) : new Vector3();
    for (const s of o.sweeps ?? []) for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k] as number, s.min[k] as number); b.max[k] = Math.max(b.max[k] as number, s.max[k] as number); }
    const ok = Number.isFinite(b.min[0]);
    const min = ok ? b.min.map((x, k) => x - t.getComponent(k)) : [0, 0, 0], max = ok ? b.max.map((x, k) => x - t.getComponent(k)) : [0, 0, 0];
    const center: V3 = [((min[0] as number) + (max[0] as number)) / 2, ((min[1] as number) + (max[1] as number)) / 2, ((min[2] as number) + (max[2] as number)) / 2];
    const radius = Math.hypot((max[0] as number) - center[0], (max[1] as number) - center[1], (max[2] as number) - center[2]);
    forms.push({ name: spec.name, offset: new Matrix4().makeTranslation(-t.x, -t.y, -t.z), center, radius, hasLod1: b.lod1, triangles: b.tris });
  });

  // Pose nodes: every node on a chain from the model root to an anchor.
  const poseNodes = new Map<Object3D, PoseNode>();
  const chains: PoseNode[][] = anchorObjs.map((a, i) => {
    if (i === 0) return [];
    const chain: PoseNode[] = [];
    for (let x: Object3D | null = a; x && x !== root; x = parentOf(x)) {
      let pn = poseNodes.get(x);
      if (!pn) {
        x.updateMatrix();
        pn = { obj: x, rp: x.position.clone(), rq: x.quaternion.clone(), rs: x.scale.clone(), restLocal: x.matrix.clone(), p: x.position.clone(), q: x.quaternion.clone(), s: x.scale.clone(), animated: false };
        poseNodes.set(x, pn);
      }
      chain.unshift(pn);
    }
    return chain;
  });
  const clips = new Map<string, { duration: number; tracks: Track[] }>();
  for (const name of o.clips) {
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) throw new Error(`${id}: clip ${name} is not in the GLB`);
    const tracks: Track[] = [];
    for (const track of clip.tracks) {
      const parsed = PropertyBinding.parseTrackName(track.name) as { nodeName: string; propertyName: string };
      const obj = levels.objects.find(node => node.name === parsed.nodeName);
      const pn = obj ? poseNodes.get(obj) : undefined;
      if (!pn) continue;
      const path = parsed.propertyName as Track['path'];
      if (path !== 'position' && path !== 'quaternion' && path !== 'scale') continue;
      pn.animated = true;
      // three assigns createInterpolant in setInterpolation (the types omit it).
      tracks.push({ node: pn, path, interp: (track as typeof track & { createInterpolant(): Interpolant }).createInterpolant() });
    }
    clips.set(name, { duration: clip.duration, tracks });
  }
  for (const name of o.driven ?? []) {
    const pn = poseNodes.get(need(name, 'driven node'));
    if (!pn) throw new Error(`${id}: driven node ${name} is not on an anchor chain`);
    pn.animated = true;
  }
  const animated = [...poseNodes.values()].filter(pn => pn.animated);
  const tm = new Matrix4(), chainM = new Matrix4();

  const model: BakedModel = {
    id, anchors: anchorNames, forms, groups, rest,
    formIndex(name) { const i = forms.findIndex(f => f.name === name); if (i < 0) throw new Error(`${id}: no form ${name}`); return i; },
    anchorIndex(name) { return anchorNames.indexOf(name); },
    pose(input, out) {
      for (const pn of animated) { pn.p.copy(pn.rp); pn.q.copy(pn.rq); pn.s.copy(pn.rs); }
      for (const [name, t] of input.clips ?? []) {
        const c = clips.get(name);
        if (!c) throw new Error(`${id}: clip ${name} was not baked`);
        const at = Math.min(Math.max(t, 0), c.duration);
        for (const tr of c.tracks) {
          const r = tr.interp.evaluate(at);
          if (tr.path === 'position') tr.node.p.set(r[0] as number, r[1] as number, r[2] as number);
          else if (tr.path === 'quaternion') tr.node.q.set(r[0] as number, r[1] as number, r[2] as number, r[3] as number);
          else tr.node.s.set(r[0] as number, r[1] as number, r[2] as number);
        }
      }
      for (const [node, x, y, z] of input.translate ?? []) {
        const obj = byName.get(node), pn = obj ? poseNodes.get(obj) : undefined;
        if (!pn || !pn.animated) throw new Error(`${id}: ${node} is not a driven node`);
        pn.p.set(x, y, z);
      }
      tm.identity().toArray(out, 0);
      for (let a = 1; a < chains.length; a++) {
        chainM.identity();
        for (const pn of chains[a] as PoseNode[]) chainM.multiply(pn.animated ? tm.compose(pn.p, pn.q, pn.s) : pn.restLocal);
        chainM.toArray(out, a * 16);
      }
    },
    clipSeconds(name) { const c = clips.get(name); if (!c) throw new Error(`${id}: clip ${name} was not baked`); return c.duration; },
    trackValue(clipName, node, path, t) {
      const c = clips.get(clipName), obj = byName.get(node), pn = obj ? poseNodes.get(obj) : undefined;
      const tr = c?.tracks.find(x => x.node === pn && x.path === path);
      if (!c || !tr) throw new Error(`${id}: no ${path} track for ${node} in ${clipName}`);
      return Array.from(tr.interp.evaluate(Math.min(Math.max(t, 0), c.duration)) as ArrayLike<number>);
    },
    locator(name) { const obj = byName.get(name); return obj ? worldOf(obj).clone() : null; },
    dispose() { for (const g of groups) g.geometry.dispose(); },
  };
  return model;
}
