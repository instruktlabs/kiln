import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Line3, Matrix4, Object3D, Ray, Vector3 } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';

export interface Collider { key: string; root: Object3D; dynamic: boolean; geometry: BufferGeometry; bvh: MeshBVH; enabled: boolean }
export interface CollisionWorld {
  add(root: Object3D, o?: { filter?: (m: Mesh) => boolean; dynamic?: boolean; key?: string }): Collider | null;
  addStatic(key: string, root: Object3D, filter?: (m: Mesh) => boolean): Collider | null;
  removeStatic(key: string): void;
  consolidateStatic(name?: string): void;
  intersects(p: Vector3, radius: number, height: number, ignore?: ReadonlySet<Collider>): boolean;
  resolve(p: Vector3, radius: number, height: number, ignore?: ReadonlySet<Collider>): boolean;
  rayDistance(from: Vector3, to: Vector3, ignore?: ReadonlySet<Collider>): number;
  floor(p: Vector3, maxDrop?: number): number;
  readonly colliders: readonly Collider[];
  dispose(): void;
}
// Synchronous queries share scratch state. They never call user code or recurse.
const v = new Vector3(), triPoint = new Vector3(), capPoint = new Vector3(), normal = new Vector3();
const segment = new Line3(), bounds = new Box3(), inverse = new Matrix4(), delta = new Vector3();
const ray = new Ray(), localRay = new Ray();
let queryRadius = 0, queryResolve = false, queryHit = false;
const capsuleCast: Parameters<MeshBVH['shapecast']>[0] = {
  intersectsBounds: b => b.intersectsBox(bounds),
  intersectsTriangle: triangle => {
    const distance = triangle.closestPointToSegment(segment, triPoint, capPoint);
    if (distance >= queryRadius - 1e-5) return false;
    queryHit = true;
    if (!queryResolve) return true;
    delta.subVectors(capPoint, triPoint);
    if (delta.lengthSq() < 1e-14) {
      triangle.getNormal(delta); segment.getCenter(normal);
      if (delta.dot(normal.sub(triangle.a)) < 0) delta.negate();
    } else delta.normalize();
    delta.multiplyScalar(queryRadius - distance + 1e-5);
    segment.start.add(delta); segment.end.add(delta); return false;
  },
};
function release(c: Collider) {
  c.enabled = false; c.geometry.dispose();
  // Terminal entry: release the tree's buffers even if a consumer kept the handle.
  c.bvh = undefined as unknown as MeshBVH;
}
export function createCollisionWorld(): CollisionWorld {
  const colliders: Collider[] = []; let disposed = false;
  function add(root: Object3D, o: { filter?: (m: Mesh) => boolean; dynamic?: boolean; key?: string } = {}): Collider | null {
    if (disposed) return null;
    root.updateWorldMatrix(true, true);
    const meshes: Mesh[] = []; let count = 0;
    root.traverse(node => {
      const mesh = node as Mesh;
      // Shadow and pass stand-ins (src/shadows) duplicate geometry for other passes, and a rigid merge (src/instancing) copies
      // sources it keeps hidden in the graph, which this traversal already reads; none of the copies is solid.
      if (!mesh.isMesh || mesh.userData.kilnShadowStandIn || mesh.userData.kilnPassStandIn || mesh.userData.kilnMerged || !mesh.geometry?.getAttribute('position') || (o.filter && !o.filter(mesh))) return;
      meshes.push(mesh); count += mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
    });
    if (!count) return null;
    const positions = new Float32Array(count * 3);
    const toLocal = new Matrix4(); if (o.dynamic) toLocal.copy(root.matrixWorld).invert();
    const matrix = new Matrix4(); let offset = 0;
    for (const mesh of meshes) {
      matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
      const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
      for (let i = 0, n = index?.count ?? p.count; i < n; i++) {
        v.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(matrix);
        positions[offset++] = v.x; positions[offset++] = v.y; positions[offset++] = v.z;
      }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const c: Collider = { key: o.key ?? root.name, root, dynamic: o.dynamic ?? false, geometry, bvh: new MeshBVH(geometry, { targetLeafSize: 10 }), enabled: true };
    colliders.push(c); return c;
  }
  function query(p: Vector3, radius: number, height: number, resolve: boolean, ignore?: ReadonlySet<Collider>) {
    queryRadius = radius; queryResolve = resolve; queryHit = false;
    for (const c of colliders) {
      if (!c.enabled || ignore?.has(c)) continue;
      if (c.dynamic) { c.root.updateWorldMatrix(true, false); inverse.copy(c.root.matrixWorld).invert(); } else inverse.identity();
      segment.start.set(p.x, p.y + radius, p.z).applyMatrix4(inverse);
      segment.end.set(p.x, p.y + height - radius, p.z).applyMatrix4(inverse);
      bounds.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end).expandByScalar(radius);
      c.bvh.shapecast(capsuleCast);
      if (resolve) { v.copy(segment.start); if (c.dynamic) v.applyMatrix4(c.root.matrixWorld); v.y -= radius; p.copy(v); }
      else if (queryHit) return true;
    }
    return queryHit;
  }
  return {
    colliders, add,
    addStatic(key, root, filter) { this.removeStatic(key); return add(root, { key, filter }); },
    removeStatic(key) {
      for (let i = colliders.length - 1; i >= 0; i--) { const c = colliders[i]!; if (!c.dynamic && c.key === key) { release(c); colliders.splice(i, 1); } }
    },
    consolidateStatic(name = 'Static world') {
      const fixed = colliders.filter(c => !c.dynamic); if (fixed.length < 2 || disposed) return;
      const count = fixed.reduce((sum, c) => sum + c.geometry.getAttribute('position').count, 0);
      const data = new Float32Array(count * 3); let at = 0;
      for (const c of fixed) { const p = c.geometry.getAttribute('position'); data.set(p.array, at); at += p.array.length; release(c); colliders.splice(colliders.indexOf(c), 1); }
      const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(data, 3));
      colliders.unshift({ key: name, root: new Object3D(), dynamic: false, geometry, bvh: new MeshBVH(geometry, { targetLeafSize: 10 }), enabled: true });
    },
    intersects: (p, r, h, ignore) => query(p, r, h, false, ignore),
    resolve(p, r, h, ignore) { let hit = false; for (let i = 0; i < 3; i++) hit = query(p, r, h, true, ignore) || hit; return hit; },
    rayDistance(from, to, ignore) {
      ray.origin.copy(from); ray.direction.subVectors(to, from); let closest = ray.direction.length(); ray.direction.normalize();
      if (!closest) return 0;
      for (const c of colliders) {
        if (!c.enabled || ignore?.has(c)) continue; localRay.copy(ray);
        if (c.dynamic) { c.root.updateWorldMatrix(true, false); localRay.applyMatrix4(inverse.copy(c.root.matrixWorld).invert()); }
        const hit = c.bvh.raycastFirst(localRay, DoubleSide, .02, closest);
        if (hit) { v.copy(hit.point); if (c.dynamic) v.applyMatrix4(c.root.matrixWorld); closest = Math.min(closest, from.distanceTo(v)); }
      }
      return closest;
    },
    floor(p, maxDrop = .35) {
      let best = -Infinity; ray.origin.set(p.x, p.y + .06, p.z); ray.direction.set(0, -1, 0);
      for (const c of colliders) {
        if (!c.enabled) continue; localRay.copy(ray);
        if (c.dynamic) { c.root.updateWorldMatrix(true, false); localRay.applyMatrix4(inverse.copy(c.root.matrixWorld).invert()); }
        const hit = c.bvh.raycastFirst(localRay, DoubleSide, 0, maxDrop + .06);
        if (hit) { v.copy(hit.point); if (c.dynamic) v.applyMatrix4(c.root.matrixWorld); best = Math.max(best, v.y); }
      }
      return best;
    },
    dispose() { if (disposed) return; disposed = true; for (const c of colliders) release(c); colliders.length = 0; },
  };
}
export interface MoverRules { radius: number; height: number; pace: number; runPace: number; gravity: number; terminal: number; stepUp: number; stepProbe: number; clampX: number; clampZ: number; blocked?: (x: number, z: number, radius: number) => string | null }
export interface MoverState { position: Vector3; velocityY: number; yaw: number; speedXZ: number; status: string }
const forward = new Vector3(), right = new Vector3(), moveVector = new Vector3(), old = new Vector3(), desired = new Vector3(), raised = new Vector3();
/** Pilot capsule algorithm; injected policy keeps scene geography out of the kit. */
export function stepCapsule(s: MoverState, move: { x: number; y: number }, run: boolean, camForward: Vector3, dt: number, world: CollisionWorld, r: MoverRules): void {
  if (!(dt > 0)) return;
  forward.copy(camForward); forward.y = 0; forward.normalize(); right.set(-forward.z, 0, forward.x);
  moveVector.copy(forward).multiplyScalar(move.y).addScaledVector(right, move.x); if (moveVector.lengthSq()) moveVector.normalize();
  const pace = run ? r.runPace : r.pace;
  old.copy(s.position); desired.copy(old).addScaledVector(moveVector, pace * dt);
  s.velocityY = Math.max(r.terminal, s.velocityY - r.gravity * dt); desired.y += s.velocityY * dt;
  world.resolve(desired, r.radius, r.height);
  if (moveVector.lengthSq() && Math.hypot(desired.x - old.x, desired.z - old.z) < pace * dt * .6) {
    raised.copy(old); raised.y += r.stepUp; raised.addScaledVector(moveVector, pace * dt);
    if (!world.intersects(raised, r.radius, r.height)) {
      const floor = world.floor(raised, r.stepProbe);
      if (Number.isFinite(floor) && floor > old.y + .01) { raised.y = floor + .00002; desired.copy(raised); }
    }
  }
  if (desired.y > old.y + s.velocityY * dt + .0001) s.velocityY = 0;
  desired.x = Math.max(-r.clampX, Math.min(r.clampX, desired.x)); desired.z = Math.max(-r.clampZ, Math.min(r.clampZ, desired.z));
  const blocked = r.blocked?.(desired.x, desired.z, r.radius);
  if (blocked) { desired.x = old.x; desired.z = old.z; s.status = blocked; }
  s.position.copy(desired); s.speedXZ = Math.hypot(desired.x - old.x, desired.z - old.z) / dt;
  if (s.speedXZ > .05) s.yaw = Math.atan2(-moveVector.z, moveVector.x);
}
export function fixedStep(acc: { t: number }, dt: number, step: number, cap: number, fn: (h: number) => void): void {
  if (!(step > 0) || !(cap >= 0)) throw new RangeError('Invalid fixed-step limits');
  acc.t = Math.min(cap, acc.t + Math.max(0, dt));
  while (acc.t + 1e-12 >= step) { fn(step); acc.t = Math.max(0, acc.t - step); }
}
