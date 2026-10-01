// Sealed r33 bridge.mjs; MIT, Copyright (c) 2026 Matthew Kissinger.
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh } from 'three/webgpu';
import type { Material } from 'three/webgpu';
import { bridgeCenter } from './site-layout';

/** One mesh and shared timber material; rendering and collision use the same triangles. */
export function makeBridge(wood: Material | Material[]) {
  const parts: { size: number[]; p: number[] }[] = [];
  for (let i = 0; i < 22; i++) parts.push({ size: [3.4, .16, .297], p: [19, .08, bridgeCenter[1] - 3.15 + i * .30] });
  for (const s of [-1, 1]) {
    for (const z of [-3, -1, 1, 3]) parts.push({ size: [.12, 1.12, .12], p: [19 + s * 1.65, .56, bridgeCenter[1] + z] });
    for (const y of [.58, 1.04]) parts.push({ size: [.10, .10, 6.35], p: [19 + s * 1.65, y, bridgeCenter[1]] });
  }
  const position: number[] = [], normal: number[] = [], uv: number[] = [], indexed = new BoxGeometry(1, 1, 1), base = indexed.toNonIndexed();
  indexed.dispose();
  for (const part of parts) {
    const p = base.attributes.position, n = base.attributes.normal, t = base.attributes.uv;
    for (let i = 0; i < p.count; i++) { position.push(p.getX(i) * part.size[0] + part.p[0], p.getY(i) * part.size[1] + part.p[1], p.getZ(i) * part.size[2] + part.p[2]); normal.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(t.getX(i), t.getY(i)); }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(position, 3)); g.setAttribute('normal', new Float32BufferAttribute(normal, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  base.dispose(); const bridge = new Mesh(g, wood); bridge.name = 'Demo river crossing'; bridge.castShadow = bridge.receiveShadow = true; return bridge;
}
