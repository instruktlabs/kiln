// One-time, read-only pilot oracle. Frozen output is used by tests; never a test-time dependency.
import * as T from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';
const { createCollisionWorld } = await import('C:/Users/Mattm/X/kiln-commons/farm-pilot/scene/showcase/collision.mjs');
const world = createCollisionWorld(T, MeshBVH);
function box(x: number, y: number, z: number, w = 2, h = 2, d = 2) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial()); m.position.set(x, y, z); return m; }
world.add(box(0, -.5, 0, 20, 1, 20)); world.add(box(2, 1, 0)); world.add(box(-2, 1, 0), { dynamic: true });
const samples = [[0,.01,0],[1.1,.01,0],[.8,.01,0],[0,-.05,0],[-2,.01,0],[3.1,.01,0],[0,2,0]].map(p => {
  const point = new T.Vector3(...p as [number,number,number]); const intersects = world.intersects(point,.3,1.9); const resolved = world.resolve(point,.3,1.9);
  const floor = world.floor(new T.Vector3(...p as [number,number,number])); return { p, intersects, resolved, after: point.toArray(), floor: Number.isFinite(floor) ? floor : null };
});
await Bun.write(new URL('./pilot-boxes.json', import.meta.url), JSON.stringify({ source: 'collision.mjs; synthetic boxes; three 0.186.0, three-mesh-bvh 0.9.15', samples, ray: world.rayDistance(new T.Vector3(0,1,0),new T.Vector3(5,1,0)) }, null, 2) + '\n'); world.dispose();
