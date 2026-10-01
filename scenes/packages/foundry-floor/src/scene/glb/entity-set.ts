// SPDX-License-Identifier: MIT
// One entity type drawn from its baked GLB: one instanced draw per baked group, filled each frame with the instances
// that pass the per-instance frustum test, on the LOD side their class's distance rule gives (with hysteresis), with
// each group's anchor matrix (placement x form offset x pose). Instances are records the drivers write (placement,
// form, pose, hidden anchors, tint, forced detail); nothing here knows the twin. A group's instance buffers are
// rewritten only when a record changed or the group's membership did (a still camera over a still fab uploads nothing),
// and only the slots in use are uploaded. Each group is a plain Mesh on an InstancedBufferGeometry that shares the baked
// geometry's attributes and adds one interleaved instance buffer (the matrix columns the shared GLB materials read, then
// the tint on tinted groups): one program per material and attribute layout rather than one per instanced mesh
// (materials.ts), and six vertex buffers per draw, inside WebGPU's default limit of eight.
import { DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Matrix4, Mesh, Quaternion, Sphere, Vector3 } from 'three/webgpu';
import type { Frustum, Group } from 'three/webgpu';
import type { LodClass } from '../assets/asset-map';
import type { BakedModel, PoseInput } from './bake';
import { INSTANCE_COLUMNS } from './materials';
import type { GlbMaterials } from './materials';

export interface EntityStats { instances: number; drawn: number; lod1: number; draws: number; triangles: number }

interface Rec {
  world: Matrix4; form: number; pose: Float32Array | null; hidden: number; tint: Float32Array; force: boolean; lod: 0 | 1;
  final: Float32Array; dirty: boolean; center: Vector3; radius: number;
}

const m1 = new Matrix4(), m2 = new Matrix4(), m3 = new Matrix4(), up = new Vector3(0, 1, 0), sphere = new Sphere();
const v1 = new Vector3(), v2 = new Vector3(), q1 = new Quaternion();

export class EntitySet {
  readonly meshes: Mesh<InstancedBufferGeometry>[] = [];
  /** Instances in use (records 0 to n-1). */
  n = 0;
  /** False hides the whole set (the ceiling seen from above). */
  visible = true;
  private readonly recs: Rec[] = [];
  /** Per group: the interleaved instance buffer (16 matrix floats, then 4 tint floats on tinted groups). */
  private readonly instanceData: InstancedInterleavedBuffer[] = [];
  private readonly counts: number[];
  /** Per group: the record index drawn in each slot last time. */
  private readonly members: Int32Array[];
  /** Group indices per form and LOD side. */
  private readonly byFormLod: number[][][];
  private changed = true;
  private shown = true;
  private readonly last: EntityStats = { instances: 0, drawn: 0, lod1: 0, draws: 0, triangles: 0 };

  constructor(readonly name: string, readonly model: BakedModel, materials: GlbMaterials, readonly capacity: number, parent: Group,
    private readonly lod: LodClass | null, private readonly defaultHidden = 0) {
    if (model.anchors.length > 31) throw new Error(`${name}: ${model.anchors.length} anchors (at most 31)`);
    this.byFormLod = model.forms.map(() => [[], []]);
    model.groups.forEach((g, i) => {
      (this.byFormLod[g.form]![g.lod] as number[]).push(i);
      const geometry = new InstancedBufferGeometry();
      geometry.name = g.geometry.name;
      geometry.setIndex(g.geometry.index);
      for (const [attributeName, attribute] of Object.entries(g.geometry.attributes)) geometry.setAttribute(attributeName, attribute);
      geometry.instanceCount = 0;
      const stride = g.tinted ? 20 : 16, data = new InstancedInterleavedBuffer(new Float32Array(capacity * stride), stride, 1);
      data.setUsage(DynamicDrawUsage);
      INSTANCE_COLUMNS.forEach((column, k) => geometry.setAttribute(column, new InterleavedBufferAttribute(data, 4, k * 4)));
      if (g.tinted) geometry.setAttribute('ffTint', new InterleavedBufferAttribute(data, 4, 16));
      const mesh = new Mesh(geometry, materials.get(g.transparent, g.tinted));
      mesh.name = `${name}:${g.geometry.name}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      this.instanceData.push(data);
      parent.add(mesh);
      this.meshes.push(mesh);
    });
    this.counts = model.groups.map(() => 0);
    this.members = model.groups.map(() => new Int32Array(capacity).fill(-1));
  }

  private rec(i: number): Rec {
    if (i >= this.capacity) throw new Error(`${this.name}: instance ${i} over capacity ${this.capacity}`);
    let r = this.recs[i];
    if (!r) {
      r = { world: new Matrix4(), form: 0, pose: null, hidden: this.defaultHidden, tint: new Float32Array(4), force: false, lod: 0,
        final: new Float32Array(this.model.anchors.length * 16), dirty: true, center: new Vector3(), radius: 0 };
      this.recs[i] = r;
    }
    if (i >= this.n) { this.n = i + 1; this.changed = true; }
    return r;
  }

  /** Places instance i at (x, y, z) turned yaw radians about +Y, with an optional scale, in form `form`. */
  place(i: number, x: number, y: number, z: number, yaw: number, form = 0, sx = 1, sy = 1, sz = 1): void {
    const r = this.rec(i);
    r.world.compose(v1.set(x, y, z), q1.setFromAxisAngle(up, yaw), v2.set(sx, sy, sz));
    r.form = form;
    r.dirty = true;
  }

  /** Moves instance i (dynamic entities): the same as place without scale, and without allocating. */
  move(i: number, x: number, y: number, z: number, yaw: number, form = 0): void {
    const r = this.rec(i), e = r.world.elements, c = Math.cos(yaw), s = Math.sin(yaw);
    if (e[12] === x && e[13] === y && e[14] === z && e[0] === c && e[8] === s && r.form === form) return;
    e[0] = c; e[1] = 0; e[2] = -s; e[3] = 0;
    e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
    e[8] = s; e[9] = 0; e[10] = c; e[11] = 0;
    e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
    r.form = form;
    r.dirty = true;
  }

  /** Places instance i by a full world matrix. */
  placeMatrix(i: number, world: Matrix4, form = 0): void {
    const r = this.rec(i);
    r.world.copy(world);
    r.form = form;
    r.dirty = true;
  }

  setForm(i: number, form: number): void { const r = this.rec(i); if (r.form !== form) { r.form = form; r.dirty = true; } }
  /** Poses instance i from clips and driven translations; null returns it to rest. */
  setPose(i: number, input: PoseInput | null): void {
    const r = this.rec(i);
    if (!input) { if (r.pose) { r.pose = null; r.dirty = true; } return; }
    r.pose ??= new Float32Array(this.model.anchors.length * 16);
    this.model.pose(input, r.pose);
    r.dirty = true;
  }
  setHidden(i: number, mask: number): void { const r = this.rec(i); if (r.hidden !== mask) { r.hidden = mask; this.changed = true; } }
  setTint(i: number, red: number, green: number, blue: number, strength: number): void {
    const t = this.rec(i).tint;
    if (t[0] !== red || t[1] !== green || t[2] !== blue || t[3] !== strength) { t[0] = red; t[1] = green; t[2] = blue; t[3] = strength; this.changed = true; }
  }
  setForce(i: number, detailed: boolean): void { const r = this.rec(i); if (r.force !== detailed) { r.force = detailed; this.changed = true; } }
  /** Dynamic entities: the number of instances this frame. */
  setCount(n: number): void { const k = Math.min(n, this.capacity); if (k !== this.n) { this.n = k; this.changed = true; } }
  /** A hidden-anchor mask bit. */
  bit(anchor: string): number { const i = this.model.anchorIndex(anchor); if (i < 1) throw new Error(`${this.name}: ${anchor} is not an anchor`); return 1 << i; }
  /** World matrix of anchor a of instance i (after pending placement and pose changes). */
  anchorWorld(i: number, a: number, out: Matrix4): Matrix4 { const r = this.rec(i); if (r.dirty) this.refresh(r); return out.fromArray(r.final, a * 16); }
  /** World-space bounding sphere of instance i (its form's rest parts and clip sweeps). */
  bounds(i: number, out: Sphere): Sphere { const r = this.rec(i); if (r.dirty) this.refresh(r); out.center.copy(r.center); out.radius = r.radius; return out; }

  private refresh(r: Rec): void {
    const form = this.model.forms[r.form];
    if (!form) throw new Error(`${this.name}: no form ${r.form}`);
    m1.multiplyMatrices(r.world, form.offset);
    const src = r.pose ?? this.model.rest;
    for (let a = 0; a < this.model.anchors.length; a++) {
      m2.fromArray(src, a * 16);
      m3.multiplyMatrices(m1, m2).toArray(r.final, a * 16);
    }
    r.center.set(form.center[0], form.center[1], form.center[2]).applyMatrix4(m1);
    r.radius = form.radius * r.world.getMaxScaleOnAxis();
    r.dirty = false;
    this.changed = true;
  }

  /** Fills the meshes for this frame. `moved` says whether the camera changed since the last call. */
  draw(frustum: Frustum, eye: Vector3, moved: boolean): void {
    for (let i = 0; i < this.n; i++) { const r = this.recs[i] as Rec; if (r.dirty) this.refresh(r); }
    if (!this.visible) {
      if (this.shown) { for (const mesh of this.meshes) mesh.visible = false; this.shown = false; }
      this.last.drawn = 0; this.last.draws = 0; this.last.triangles = 0; this.last.lod1 = 0;
      return;
    }
    if (!this.shown) { this.shown = true; this.changed = true; }
    if (!moved && !this.changed) return;
    const recordsChanged = this.changed;
    this.changed = false;
    const counts = this.counts, groups = this.model.groups, rule = this.lod;
    const dirtyGroups = this.dirtyScratch(groups.length);
    counts.fill(0);
    let drawn = 0, lod1 = 0;
    for (let i = 0; i < this.n; i++) {
      const r = this.recs[i] as Rec;
      sphere.center.copy(r.center); sphere.radius = r.radius;
      if (!frustum.intersectsSphere(sphere)) continue;
      const form = this.model.forms[r.form]!;
      if (!rule || !form.hasLod1 || r.force) r.lod = 0;
      else {
        const d = eye.distanceTo(r.center);
        if (r.lod === 0 && d > rule.farM) r.lod = 1;
        else if (r.lod === 1 && d < rule.nearM) r.lod = 0;
      }
      drawn++;
      if (r.lod === 1) lod1++;
      for (const g of this.byFormLod[r.form]![r.lod]!) {
        if (r.hidden & (1 << groups[g]!.anchor)) continue;
        const c = counts[g]!, members = this.members[g]!;
        counts[g] = c + 1;
        if (members[c] !== i) { members[c] = i; dirtyGroups[g] = 1; }
      }
    }
    let draws = 0, triangles = 0;
    this.meshes.forEach((mesh, g) => {
      const c = counts[g]!, group = groups[g]!, geometry = mesh.geometry;
      if (geometry.instanceCount !== c) dirtyGroups[g] = 1;
      geometry.instanceCount = c;
      mesh.visible = c > 0;
      if (c === 0) return;
      draws++;
      triangles += c * group.triangles;
      if (!recordsChanged && !dirtyGroups[g]) return;
      const data = this.instanceData[g]!, dst = data.array as Float32Array, stride = data.stride, members = this.members[g]!, so = group.anchor * 16;
      for (let k = 0; k < c; k++) {
        const r = this.recs[members[k] as number] as Rec, src = r.final, d = k * stride;
        for (let e = 0; e < 16; e++) dst[d + e] = src[so + e] as number;
        if (stride === 20) { const t = r.tint; dst[d + 16] = t[0] as number; dst[d + 17] = t[1] as number; dst[d + 18] = t[2] as number; dst[d + 19] = t[3] as number; }
      }
      data.clearUpdateRanges();
      data.addUpdateRange(0, c * stride);
      data.needsUpdate = true;
    });
    this.last.instances = this.n; this.last.drawn = drawn; this.last.lod1 = lod1; this.last.draws = draws; this.last.triangles = triangles;
  }

  private scratch: Uint8Array = new Uint8Array(0);
  private dirtyScratch(n: number): Uint8Array {
    if (this.scratch.length < n) this.scratch = new Uint8Array(n);
    this.scratch.fill(0);
    return this.scratch;
  }

  stats(): EntityStats { return { ...this.last, instances: this.n }; }

  dispose(): void {
    // The instanced geometries share the baked attributes; the world disposes the baked models right after its sets.
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.meshes.length = 0;
  }
}
