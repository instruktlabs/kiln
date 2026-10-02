import type { Camera, InstancedMesh, Mesh, Object3D } from 'three/webgpu';
/** Layer bits for an extra pass: `main` holds drawables only main (and shadow) cameras draw, `pass` holds pass stand-ins. */
export interface PassLayers { main: number; pass: number }
const bit = (layer: number) => { if (!(Number.isInteger(layer) && layer >= 1 && layer <= 31)) throw new Error('Pass layers must be 1..31'); return 1 << layer | 0; };
const drawable = (n: Object3D) => { const d = n as Mesh & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean }; return !!(d.isMesh || d.isLine || d.isPoints || d.isSprite); };
/**
 * Moves every drawable under `roots` from layer 0 to a main-only layer, so a pass camera cloned from the main camera stops
 * drawing it (three r186 ReflectorNode clones its virtual camera once and never copies layers again). Cameras that keep
 * drawing it, the main camera and a shadow camera while it casts, take passCameraLayers(camera, l, 'main'). Restore puts
 * bit 0 back and clears only the bits it set.
 */
export function mainOnly(roots: Object3D[], layer: number): { stats: { objects: number }; restore(): void } {
  const b = bit(layer), moved = new Map<Object3D, boolean>();let restored = false;
  for (const root of roots) root.traverse(n => { if (drawable(n) && n.layers.mask & 1 && !moved.has(n)) { moved.set(n, !!(n.layers.mask & b)); n.layers.mask = n.layers.mask & ~1 | b; } });
  return { stats: { objects: moved.size }, restore() { if (restored) return; restored = true; for (const [n, had] of moved) n.layers.mask = (had ? n.layers.mask : n.layers.mask & ~b) | 1; } };
}
/**
 * A coloured stand-in for an extra pass (OD-18): a clone of `source` that shares its geometry, materials and instance data,
 * with every node on the pass-only layer, no shadow casting, no raycast and userData.kilnPassStandIn. Never a shadow depth
 * proxy, which writes no colour. Added to `parent` (default the source's parent) with the source's local transform.
 */
export function passStandIn(source: Object3D, o: { layer: number; parent?: Object3D }): { object: Object3D; stats: { meshes: number }; restore(): void } {
  const b = bit(o.layer), from: Object3D[] = [];source.traverse(n => { if ((n as Object3D & { isLight?: boolean }).isLight) throw new Error(`Pass stand-in ${source.name} holds a light`); from.push(n); });
  const object = source.clone();let i = 0, meshes = 0, restored = false;
  object.traverse(n => {
    const s = from[i++] as InstancedMesh, m = n as InstancedMesh; n.layers.mask = b;
    if (m.isInstancedMesh) { m.instanceMatrix = s.instanceMatrix; m.instanceColor = s.instanceColor; }
    if (drawable(n)) { m.castShadow = false; m.raycast = () => {}; m.userData.kilnPassStandIn = true; meshes++; }
  });
  object.name = `Pass stand-in ${source.name}`; (o.parent ?? source.parent)?.add(object);
  return { object, stats: { meshes }, restore() { if (restored) return; restored = true; object.removeFromParent(); } };
}
/** Sets only a camera's two pass bits: 'pass' sees pass stand-ins and not main-only drawables, 'main' the reverse. Idempotent, so it can run every frame on a pass camera three may recreate. */
export function passCameraLayers(camera: Camera, l: PassLayers, role: 'main' | 'pass' = 'pass'): number {
  const m = bit(l.main), p = bit(l.pass); if (m === p) throw new Error('Pass layers must differ');
  return camera.layers.mask = camera.layers.mask & ~(m | p) | (role === 'pass' ? p : m);
}
