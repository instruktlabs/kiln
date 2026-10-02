import { Object3D } from 'three/webgpu';
import type { DirectionalLight, InstancedMesh, Light, LightShadow, Mesh, Node, OrthographicCamera, SkinnedMesh } from 'three/webgpu';
import { min, shadow } from 'three/tsl';
import { keepsShadowMask, layerBit, ShadowLayers, suppressedCasters } from './layers';
import type { ShadowLayerSet } from './layers';

type Shadow = LightShadow & { shadowNode?: Node; filterNode?: unknown; map?: unknown };
interface Watch { m: Float64Array; v: boolean; c: boolean; iv: number; n: number; live: boolean; quiet: number }
export interface CachedSunShadowOptions {
  light: DirectionalLight; liveMapSize?: number; settleFrames?: number; layers?: ShadowLayerSet;
  /**
   * The largest change of any watched matrixWorld element (world units for translation) that is not motion; default 1e-6, 0 is
   * exact. Drift is measured from the pose last counted as motion, so a static map is never more than about twice this out of date.
   */
  tolerance?: number;
}
export interface CachedSunShadowStats { staticRenders: number; liveRenders: number; staticCasters: number; liveCasters: number; readonly pendingSettle: number; invalidations: number; reasons: Record<string, number> }
export interface CachedSunShadowTrackOptions {
  /** Casters under a movable() node are watched: one whose matrix, visibility, casting or instances change goes live until still. */
  movable?(n: Object3D): boolean;
  /** Casters under a live() node always draw in the live map: motion the watch cannot see (instance attributes, vertex or morph animation). */
  live?(n: Object3D): boolean;
}
export interface TrackedCasters { readonly added: number; untrack(): void }
export interface CachedSunShadow {
  readonly staticShadow: LightShadow; readonly liveShadow: LightShadow; readonly stats: CachedSunShadowStats;
  /**
   * Tags the casters under root (castShadow, kit-suppressed or a stand-in) that the light's shadow camera draws: those sharing a
   * layer with its mask, or layer 0 when the mask has no bit above 0 (three would use each viewing camera's mask). A mesh keeps
   * the role of the call that tagged it; one that starts casting later joins on the next track(). `untrack()` restores exactly
   * the meshes this call tagged and re-arms the static map (a world replaced while the cache survives).
   */
  track(root: Object3D, o?: CachedSunShadowTrackOptions): TrackedCasters;
  invalidate(reason: string): void; prime(): void; update(): void; dispose(): void;
}
const CAMERA = ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom'] as const, VALUES = ['bias', 'normalBias', 'radius', 'intensity', 'blurSamples'] as const;
const shown = (o: Object3D) => { for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false; return true; };
const draws = (o: Object3D) => { const im = o as InstancedMesh; return o.castShadow && (!im.isInstancedMesh || im.count > 0) && shown(o); };
/**
 * OD-9 cached sun shadow: a static map S rendered only when armed, plus a live map D for casters that moved, sampled as
 * min(S, D) through `light.shadow.shadowNode` (three r186 AnalyticLightNode reads it once, so install before any receiver
 * builds, which the light's stock map betrays; keep light.castShadow true). Each map is a clone of the configured
 * light.shadow on its own placeholder light that shares the sun's matrixWorld and target. Both are armed at install, the
 * only safe first render (a later first render leaves shared-refresh receivers bound to a destroyed texture); the kit never
 * clears a flag itself. `update()` runs every frame after all motion and visibility (SystemOrder.shadows): watched casters
 * that changed move to the live bit and re-arm S; after `settleFrames` quiet frames they return. The sampling values (bias,
 * normal bias, radius, intensity) reach both maps every frame; S takes the camera extents when it re-arms (a VSM blur takes
 * its radius then too). Call `prime()` when a warm pass starts drawing (D draws every caster once, so a later promotion
 * creates nothing) and `invalidate()` on any static change the watch cannot see (doors, LOD, visibility, threshold,
 * stand-ins, sun moves, layer changes after track). Square maps only. Dispose after the light has left the scene: three
 * would render a disposed node.
 */
export function cachedSunShadow(o: CachedSunShadowOptions): CachedSunShadow {
  const { light } = o, template = light.shadow as Shadow, L = o.layers ?? ShadowLayers, settle = o.settleFrames ?? 30, tol = o.tolerance ?? 1e-6;
  if (template.shadowNode) throw new Error('Light already has a custom shadow node');
  if (template.map) throw new Error('Install the cached sun shadow before any receiver renders: the light already has a stock shadow map');
  if (!(L.static >= 1 && L.live >= 1 && L.static <= 31 && L.live <= 31 && L.static !== L.live)) throw new Error('Shadow layers must be distinct bits 1..31');
  if (!(tol >= 0)) throw new Error('Shadow motion tolerance must be 0 or more');
  const sBit = layerBit(L.static), dBit = layerBit(L.live), kit = sBit | dBit;
  const values = (s: Shadow) => { for (const k of VALUES) s[k] = template[k]; };
  const sync = (s: Shadow) => { const c = s.camera as OrthographicCamera, t = template.camera as OrthographicCamera; for (const k of CAMERA) c[k] = t[k]; c.updateProjectionMatrix(); values(s); };
  const make = (mask: number, label: string) => {
    const s = template.clone() as Shadow; s.filterNode = template.filterNode; s.mapType = template.mapType; s.autoUpdate = false; s.needsUpdate = true; s.camera.layers.mask = mask;
    const placeholder = Object.assign(new Object3D(), { name: `${light.name || 'sun'} ${label}`, castShadow: true, shadow: s, target: light.target, matrixWorld: light.matrixWorld });
    return { s, node: shadow(placeholder as unknown as Light, s) };
  };
  const S = make(sBit, 'static'), D = make(dBit, 'live');
  if (o.liveMapSize) D.s.mapSize.setScalar(o.liveMapSize);
  template.shadowNode = min(S.node as unknown as Node<'float'>, D.node as unknown as Node<'float'>);
  const tagged = new Map<Object3D, number>(), watched = new Map<Object3D, Watch>(), pinned = new Set<Object3D>();
  let size = template.mapSize.x, sentinel = template.mapSize.y, resized = false, priming = false, hadLive = false, armLive = false, disposed = false, watchedLive = 0;
  const stats: CachedSunShadowStats = { staticRenders: 1, liveRenders: 1, staticCasters: 0, liveCasters: 0, invalidations: 0, reasons: {},
    get pendingSettle() { return watchedLive + (S.s.needsUpdate || D.s.needsUpdate || priming ? 1 : 0); } };
  const rearm = () => { sync(S.s); S.s.needsUpdate = true; stats.staticRenders++; };
  const invalidate = (reason: string) => { if (disposed) return; stats.invalidations++; stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1; rearm(); };
  const changed = (n: Object3D, w: Watch) => {
    const e = n.matrixWorld.elements, im = n as InstancedMesh, v = shown(n), iv = im.isInstancedMesh ? im.instanceMatrix.version : 0, count = im.isInstancedMesh ? im.count : 0;
    let d = v !== w.v || n.castShadow !== w.c || iv !== w.iv || count !== w.n || !!(n as SkinnedMesh).isSkinnedMesh;
    for (let i = 0; i < 16; i++) if (!(Math.abs(w.m[i]! - e[i]!) <= tol)) { w.m.set(e); d = true; break; }
    w.v = v; w.c = n.castShadow; w.iv = iv; w.n = count; return d;
  };
  /** Live casters now: watched ones that are live plus live() casters that draw. */
  const tally = (live: number) => {
    let drawn = 0; for (const n of pinned) if (draws(n)) drawn++;
    watchedLive = live; stats.liveCasters = live + drawn; stats.staticCasters = tagged.size - pinned.size - live; return live + drawn;
  };
  return { staticShadow: S.s, liveShadow: D.s, stats,
    track(root, t = {}) {
      if (disposed) throw new Error('Cached sun shadow has been disposed');
      const mine: Object3D[] = [], mask = template.camera.layers.mask, sees = keepsShadowMask(mask) ? mask : 1;let done = false;
      const visit = (n: Object3D, watch: boolean, pin: boolean) => {
        pin ||= !!t.live?.(n); watch ||= !!t.movable?.(n); const m = n as Mesh;
        if (m.isMesh && (m.castShadow || suppressedCasters.has(m) || m.userData.kilnShadowStandIn) && (m.layers.mask & sees) !== 0) {
          if (!tagged.has(m)) {
            tagged.set(m, m.layers.mask & kit); mine.push(m);
            if (pin) { pinned.add(m); m.layers.mask = m.layers.mask & ~sBit | dBit; } else m.layers.mask |= sBit;
          }
          if (watch && !pinned.has(m) && !watched.has(m)) { const w = { m: new Float64Array(16), v: false, c: false, iv: 0, n: 0, live: false, quiet: 0 }; changed(m, w); watched.set(m, w); }
        }
        for (const c of n.children) visit(c, watch, pin);
      };
      visit(root, false, false); tally(watchedLive);
      return { added: mine.length, untrack() {
        if (done || disposed) return; done = true;let gone = 0;
        for (const m of mine) {
          const had = tagged.get(m); if (had === undefined) continue;
          m.layers.mask = m.layers.mask & ~kit | had; tagged.delete(m); watched.delete(m); pinned.delete(m); gone++;
        }
        if (!gone) return;
        let live = 0; for (const w of watched.values()) if (w.live) live++;
        tally(live); invalidate('untrack');
      } };
    },
    invalidate,
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
      sync(D.s); values(S.s);
      const now = tally(live);
      if (now || hadLive || armLive) { D.s.needsUpdate = true; stats.liveRenders++; }
      hadLive = now > 0; armLive = false;
    },
    dispose() {
      if (disposed) return; disposed = true;
      S.node.dispose(); D.node.dispose(); S.s.dispose(); D.s.dispose(); delete template.shadowNode;
      if (resized) template.mapSize.y = template.mapSize.x;
      for (const [n, had] of tagged) n.layers.mask = n.layers.mask & ~kit | had;
      tagged.clear(); watched.clear(); pinned.clear();
    } };
}
