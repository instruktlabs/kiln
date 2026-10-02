import { Object3D } from 'three/webgpu';
import type { DirectionalLight, InstancedMesh, Light, LightShadow, Mesh, Node, OrthographicCamera, SkinnedMesh } from 'three/webgpu';
import { min, shadow } from 'three/tsl';
import { layerBit, ShadowLayers, suppressedCasters } from './layers';
import type { ShadowLayerSet } from './layers';

type Shadow = LightShadow & { shadowNode?: Node; filterNode?: unknown };
interface Watch { m: Float64Array; v: boolean; c: boolean; iv: number; n: number; live: boolean; quiet: number }
export interface CachedSunShadowOptions { light: DirectionalLight; liveMapSize?: number; settleFrames?: number; layers?: ShadowLayerSet }
export interface CachedSunShadowStats { staticRenders: number; liveRenders: number; staticCasters: number; liveCasters: number; readonly pendingSettle: number; invalidations: number; reasons: Record<string, number> }
export interface CachedSunShadow {
  readonly staticShadow: LightShadow; readonly liveShadow: LightShadow; readonly stats: CachedSunShadowStats;
  /** Adds the static bit to every caster under root (castShadow, kit-suppressed or a stand-in); casters under a movable() node are watched. */
  track(root: Object3D, o?: { movable?(n: Object3D): boolean }): number;
  invalidate(reason: string): void; prime(): void; update(): void; dispose(): void;
}
const CAMERA = ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom'] as const, VALUES = ['bias', 'normalBias', 'radius', 'intensity', 'blurSamples'] as const;
const shown = (o: Object3D) => { for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false; return true; };
/**
 * OD-9 cached sun shadow: a static map S rendered only when armed, plus a live map D for casters that moved, sampled as
 * min(S, D) through `light.shadow.shadowNode` (three r186 AnalyticLightNode reads it once, so install before receivers
 * build; keep light.castShadow true). Each map is a clone of the configured light.shadow on its own placeholder light that
 * shares the sun's matrixWorld and target. Both are armed at install, the only safe first render (a later first render
 * leaves shared-refresh receivers bound to a destroyed texture); the kit never clears a flag itself. `update()` runs every
 * frame after all motion and visibility (SystemOrder.shadows): watched casters that changed move to the live bit and
 * re-arm S; after `settleFrames` quiet frames they return. Call `prime()` when a warm pass starts drawing and
 * `invalidate()` on any static change the watch cannot see (doors, LOD, visibility, threshold, stand-ins, sun moves).
 * Dispose after the light has left the scene: three would render a disposed node.
 */
export function cachedSunShadow(o: CachedSunShadowOptions): CachedSunShadow {
  const { light } = o, template = light.shadow as Shadow, L = o.layers ?? ShadowLayers, settle = o.settleFrames ?? 30;
  if (template.shadowNode) throw new Error('Light already has a custom shadow node');
  if (!(L.static >= 1 && L.live >= 1 && L.static <= 31 && L.live <= 31 && L.static !== L.live)) throw new Error('Shadow layers must be distinct bits 1..31');
  const sBit = layerBit(L.static), dBit = layerBit(L.live), kit = sBit | dBit;
  const sync = (s: Shadow) => { const c = s.camera as OrthographicCamera, t = template.camera as OrthographicCamera; for (const k of CAMERA) c[k] = t[k]; c.updateProjectionMatrix(); for (const k of VALUES) s[k] = template[k]; };
  const make = (mask: number, label: string) => {
    const s = template.clone() as Shadow; s.filterNode = template.filterNode; s.mapType = template.mapType; s.autoUpdate = false; s.needsUpdate = true; s.camera.layers.mask = mask;
    const placeholder = Object.assign(new Object3D(), { name: `${light.name || 'sun'} ${label}`, castShadow: true, shadow: s, target: light.target, matrixWorld: light.matrixWorld });
    return { s, node: shadow(placeholder as unknown as Light, s) };
  };
  const S = make(sBit, 'static'), D = make(dBit, 'live');
  if (o.liveMapSize) D.s.mapSize.setScalar(o.liveMapSize);
  template.shadowNode = min(S.node as unknown as Node<'float'>, D.node as unknown as Node<'float'>);
  const tagged = new Map<Object3D, number>(), watched = new Map<Object3D, Watch>();
  let size = template.mapSize.x, sentinel = template.mapSize.y, resized = false, priming = false, hadLive = false, armLive = false, disposed = false;
  const stats: CachedSunShadowStats = { staticRenders: 1, liveRenders: 1, staticCasters: 0, liveCasters: 0, invalidations: 0, reasons: {},
    get pendingSettle() { return stats.liveCasters + (S.s.needsUpdate || D.s.needsUpdate || priming ? 1 : 0); } };
  const rearm = () => { sync(S.s); S.s.needsUpdate = true; stats.staticRenders++; };
  const changed = (n: Object3D, w: Watch) => {
    const e = n.matrixWorld.elements, im = n as InstancedMesh, v = shown(n), iv = im.isInstancedMesh ? im.instanceMatrix.version : 0, count = im.isInstancedMesh ? im.count : 0;
    let d = v !== w.v || n.castShadow !== w.c || iv !== w.iv || count !== w.n || !!(n as SkinnedMesh).isSkinnedMesh;
    for (let i = 0; i < 16; i++) if (w.m[i] !== e[i]) { w.m.set(e); d = true; break; }
    w.v = v; w.c = n.castShadow; w.iv = iv; w.n = count; return d;
  };
  return { staticShadow: S.s, liveShadow: D.s, stats,
    track(root, t = {}) {
      if (disposed) throw new Error('Cached sun shadow has been disposed');
      let added = 0;
      const visit = (n: Object3D, watch: boolean) => {
        watch ||= !!t.movable?.(n); const m = n as Mesh;
        if (m.isMesh && (m.castShadow || suppressedCasters.has(m) || m.userData.kilnShadowStandIn)) {
          if (!tagged.has(m)) { tagged.set(m, m.layers.mask & kit); m.layers.mask |= sBit; added++; stats.staticCasters++; }
          if (watch && !watched.has(m)) { const w = { m: new Float64Array(16), v: false, c: false, iv: 0, n: 0, live: false, quiet: 0 }; changed(m, w); watched.set(m, w); }
        }
        for (const c of n.children) visit(c, watch);
      };
      visit(root, false); return added;
    },
    invalidate(reason) { if (disposed) return; stats.invalidations++; stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1; rearm(); },
    prime() { if (disposed) return; rearm(); priming = true; D.s.camera.layers.mask = kit; D.s.needsUpdate = true; stats.liveRenders++; },
    update() {
      if (disposed) return;
      if (priming && !D.s.needsUpdate) { priming = false; D.s.camera.layers.mask = dBit; armLive = true; }
      if (template.mapSize.x !== size) {
        // Placeholders are not scene lights, so receivers rebind only when the real light's mapSize changes (NodeMaterialObserver).
        size = template.mapSize.x; S.s.mapSize.setScalar(size); if (!o.liveMapSize) D.s.mapSize.setScalar(size);
        template.mapSize.y = sentinel = Math.max(sentinel, template.mapSize.y) + 1; resized = armLive = true; rearm();
      }
      let moved = false, live = 0;
      for (const [n, w] of watched) {
        if (changed(n, w)) { w.quiet = 0; if (!w.live) { w.live = moved = true; n.layers.mask = n.layers.mask & ~sBit | dBit; } }
        else if (w.live && ++w.quiet >= settle) { w.live = false; moved = true; n.layers.mask = n.layers.mask & ~dBit | sBit; }
        if (w.live) live++;
      }
      if (moved) rearm();
      sync(D.s);
      if (live || hadLive || armLive) { D.s.needsUpdate = true; stats.liveRenders++; }
      hadLive = live > 0; armLive = false; stats.liveCasters = live; stats.staticCasters = tagged.size - live;
    },
    dispose() {
      if (disposed) return; disposed = true;
      S.node.dispose(); D.node.dispose(); S.s.dispose(); D.s.dispose(); delete template.shadowNode;
      if (resized) template.mapSize.y = template.mapSize.x;
      for (const [n, had] of tagged) n.layers.mask = n.layers.mask & ~kit | had;
      tagged.clear(); watched.clear();
    } };
}
