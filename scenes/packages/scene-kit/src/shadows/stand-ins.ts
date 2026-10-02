import { BackSide, Box3, DoubleSide, FrontSide, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material, Object3D, Side } from 'three/webgpu';
import { bakeRigidGeometry } from '../instancing/rigid-merge';
import { layerBit, suppressedCasters } from './layers';
export interface ShadowStandInOptions {
  layer: number; isAnchor(n: Object3D): boolean; include?(m: Mesh): boolean; texel?: number; minCasterTexels?: number; chunk?: { cell: number; maxTriangles?: number };
  /** The shadow camera's layer mask: sources sharing no bit with it are skipped as `layer`, since three never draws them. Default layer 0 only; it must include `layer`. */
  shadowMask?: number;
}
export interface ShadowStandIns {
  readonly proxies: Mesh[]; readonly sources: Mesh[]; readonly dropped: Mesh[];
  readonly stats: { groups: number; sourceMeshes: number; proxies: number; triangles: number; dropped: number; skipped: Record<string, number> }; restore(): void;
}
interface Bucket { anchor: Object3D; side: Side; parts: Mesh[] }
/** The side three r186 gives a PCF or basic shadow override: `shadowSide ?? {Front: Back, Back: Front, Double: Double}[side]` (Renderer._shadowSide). */
const FLIP: Side[] = [BackSide, FrontSide, DoubleSide];
/** Material inputs the shadow override carries into its depth draw (alpha, discard, position, depth or transparency nodes). */
const OWN = ['alphaMap', 'alphaHash', 'positionNode', 'castShadowPositionNode', 'displacementMap', 'maskNode', 'maskShadowNode', 'castShadowNode', 'transmissionNode', 'backdropNode', 'depthNode'] as const;
const has = (o: object, k: string) => !!(o as Record<string, unknown>)[k], triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
function excluded(m: Mesh): string | undefined {
  const g = m.geometry, mat = m.material as Material & { transmission?: number };
  if (Array.isArray(mat)) return 'multiMaterial';
  if (has(m, 'isInstancedMesh') || has(g, 'isInstancedBufferGeometry')) return 'instanced';
  if (has(m, 'isBatchedMesh')) return 'batched';
  if (has(m, 'isSkinnedMesh')) return 'skinned';
  if (Object.keys(g.morphAttributes).length) return 'morphed';
  if (!g.attributes.position || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return 'drawRange';
  if (Object.hasOwn(m, 'onBeforeShadow') || Object.hasOwn(m, 'onBeforeRender')) return 'hook';
  if (!mat.visible) return 'materialHidden';
  if (mat.allowOverride === false) return 'allowOverride';
  if (mat.alphaTest > 0) return 'alphaTest';
  if ((mat.transmission ?? 0) > 0) return 'transmission';
  return OWN.find(k => has(mat, k));
}
/**
 * OD-18 shadow stand-ins. Eligible casters bake, positions only, into one proxy per anchor (nearest isAnchor ancestor; the
 * root counts), effective shadow side and optional world x/z cell, split at `maxTriangles`. A proxy is an identity child of
 * its anchor, so it inherits the anchor's motion and visibility; it sits on `layer` alone (never 0: main cameras and
 * raycasters never see it) with a material-free node material per side that writes no colour or depth outside a shadow
 * pass. Sources stop casting and stay on shadow layers through suppressedCasters. Eligible: visible below its anchor,
 * castShadow, on a layer the shadow camera sees (`shadowMask`, default layer 0), one material, a plain mesh with the default draw range and no own render hooks, not under a LOD or
 * ClippingGroup below its anchor, and a material the override draws as plain depth. Plain transparency qualifies: three
 * r186 draws it with NoBlending, depth written and no discard (twice when double-sided). Parts whose sphere diameter is under
 * `minCasterTexels` texels drop before the merge. Build after batching. The proxy's matrixWorld is set once and it copies
 * the anchor's matrixWorldAutoUpdate, so a frozen owner stays frozen. Assumes a non-VSM map and shadowMap.transmitted off.
 */
export function shadowStandIns(root: Object3D, o: ShadowStandInOptions): ShadowStandIns {
  if (!(Number.isInteger(o.layer) && o.layer >= 1 && o.layer <= 31)) throw new Error('Stand-in layer must be 1..31');
  if (o.shadowMask !== undefined && !(o.shadowMask & layerBit(o.layer))) throw new Error('The shadow camera mask must include the stand-in layer');
  const sees = o.shadowMask ?? 1;
  root.updateWorldMatrix(true, true);
  const skipped: Record<string, number> = {}, groups = new Map<string, Bucket>(), dropped: Mesh[] = [], min = (o.texel ?? 0) * (o.minCasterTexels ?? 0), cell = o.chunk?.cell, box = new Box3(), c = new Vector3();
  const visit = (n: Object3D, anchor: Object3D, hidden: boolean, cut?: string) => {
    if (n !== anchor && o.isAnchor(n)) { anchor = n; hidden = false; cut = undefined; }
    if (n !== anchor) { hidden ||= !n.visible; if (has(n, 'isClippingGroup')) cut ??= 'clipping'; }
    if (has(n, 'isLOD')) cut ??= 'lod';
    const m = n as Mesh;
    if (m.isMesh) {
      const why = m.userData.kilnShadowStandIn || m.userData.kilnPassStandIn ? 'standIn' : hidden ? 'hidden' : !m.castShadow ? 'noCast' : !(m.layers.mask & sees) ? 'layer' : cut ?? (o.include?.(m) === false ? 'include' : excluded(m));
      const g = m.geometry; if (!why && !g.boundingSphere) g.computeBoundingSphere();
      if (why) skipped[why] = (skipped[why] ?? 0) + 1;
      else if (2 * g.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis() < min) dropped.push(m);
      else {
        const mat = m.material as Material, side = mat.shadowSide ?? FLIP[mat.side];let key = `${anchor.id}|${side}`;
        if (cell) { if (!g.boundingBox) g.computeBoundingBox(); box.copy(g.boundingBox!).applyMatrix4(m.matrixWorld).getCenter(c); key += `|${Math.floor(c.x / cell)}|${Math.floor(c.z / cell)}`; }
        let group = groups.get(key); if (!group) groups.set(key, group = { anchor, side, parts: [] }); group.parts.push(m);
      }
    }
    for (const child of n.children) visit(child, anchor, hidden, cut);
  };
  visit(root, root, false);
  const max = o.chunk?.maxTriangles ?? Infinity, plan: Bucket[] = [];
  for (const g of groups.values()) {
    let parts: Mesh[] = [], t = 0;
    for (const m of g.parts) { const n = triangles(m.geometry); if (parts.length && t + n > max) { plan.push({ ...g, parts }); parts = []; t = 0; } parts.push(m); t += n; }
    plan.push({ ...g, parts });
  }
  const materials = new Map<Side, MeshBasicNodeMaterial>(), proxies: Mesh[] = [], sources: Mesh[] = [];let total = 0, restored = false;
  for (const p of plan) {
    let material = materials.get(p.side);
    if (!material) materials.set(p.side, material = new MeshBasicNodeMaterial({ name: 'Shadow stand-in', side: FLIP[p.side], shadowSide: p.side, colorWrite: false, depthWrite: false }));
    const m = new Mesh(bakeRigidGeometry(p.parts, p.anchor, { attributes: 'position' }), material);
    m.name = `Shadow stand-in ${p.anchor.name}`; m.layers.set(o.layer); m.castShadow = true; m.userData.kilnShadowStandIn = true; m.raycast = () => {};
    m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = p.anchor.matrixWorldAutoUpdate; p.anchor.add(m); m.matrixWorld.copy(p.anchor.matrixWorld);
    proxies.push(m); sources.push(...p.parts); total += triangles(m.geometry);
  }
  const off = [...sources, ...dropped]; for (const m of off) { m.castShadow = false; suppressedCasters.add(m); }
  return { proxies, sources, dropped, stats: { groups: groups.size, sourceMeshes: sources.length, proxies: proxies.length, triangles: total, dropped: dropped.length, skipped },
    restore() {
      if (restored) return; restored = true;
      for (const m of off) { m.castShadow = true; suppressedCasters.delete(m); }
      for (const m of proxies) { m.removeFromParent(); m.geometry.dispose(); }
      for (const m of materials.values()) m.dispose();
    } };
}
