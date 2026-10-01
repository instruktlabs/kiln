// Sealed r33 landscape.mjs woodland section; MIT, Copyright (c) 2026 Matthew Kissinger.
import { InstancedMesh, Matrix4, Object3D } from 'three/webgpu';
import type { BufferGeometry, Mesh } from 'three/webgpu';
import { deriveInstancingSafeGeometry } from '@kiln-scenes/scene-kit/instancing';
import { riverCenter, riverWidth } from './site-layout';
import { landscapeHeight } from './landscape';

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export interface WoodlandPoint { x: number; z: number; y: number; yaw: number; scale: number }
export function woodlandPlacements(): WoodlandPoint[] {
  const points: WoodlandPoint[] = []; let n = 0;
  for (const radius of [41, 45, 49, 54, 60, 68, 78, 91, 105, 122]) {
    const count = Math.ceil(2 * Math.PI * radius / 4.8);
    for (let i = 0; i < count; i++, n++) {
      const angle = (i + .45 * hash(n + 1)) * 2 * Math.PI / count, r = radius + (hash(n + 2) - .5) * 4, x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) < 37 || Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + 3 || Math.abs(x - 19) < 3) continue;
      points.push({ x, z, y: landscapeHeight(x, z), yaw: hash(n + 3) * Math.PI * 2, scale: 1.25 + hash(n + 4) * .95 });
    }
  }
  return points;
}
/** Register dispose with the world registry. GLB geometry/material ownership stays with the loaded pack. */
export function addWoodland(parent: Object3D, model: Object3D, options: { tangentSafe?: boolean; points?: readonly WoodlandPoint[] } = {}) {
  model.updateMatrixWorld(true); const sources: Mesh[] = []; model.traverse(o => { if ((o as Mesh).isMesh) sources.push(o as Mesh); });
  const cells = new Map<string, WoodlandPoint[]>();
  for (const p of options.points ?? woodlandPlacements()) { const key = [Math.floor(p.x / 64), Math.floor(p.z / 64)].join('/'); if (!cells.has(key)) cells.set(key, []); cells.get(key)!.push(p); }
  const dummy = new Object3D(), matrix = new Matrix4(), meshes: InstancedMesh[] = [], derived = new Map<BufferGeometry, BufferGeometry>();
  for (const [cell, points] of cells) for (const source of sources) {
    // Z2/D-06: one render-only derivative shared by every cell of this source geometry.
    const geometry = options.tangentSafe === false ? source.geometry : deriveInstancingSafeGeometry(source, derived);
    const mesh = new InstancedMesh(geometry, source.material, points.length); mesh.name = 'Boundary woodland ' + cell + ' ' + source.name;
    mesh.receiveShadow = true; mesh.castShadow = points.some(p => Math.hypot(p.x, p.z) < 52);
    points.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.y = p.yaw; dummy.scale.setScalar(p.scale); dummy.updateMatrix(); matrix.multiplyMatrices(dummy.matrix, source.matrixWorld); mesh.setMatrixAt(i, matrix); });
    mesh.computeBoundingSphere(); parent.add(mesh); meshes.push(mesh);
  }
  let disposed = false;
  return { trees: [...cells.values()].reduce((n, p) => n + p.length, 0), cells: cells.size, meshes, derivatives: derived.size,
    dispose() { if (disposed) return; disposed = true; for (const mesh of meshes) { mesh.removeFromParent(); mesh.dispose(); } for (const geometry of derived.values()) geometry.dispose(); derived.clear(); },
  };
}
