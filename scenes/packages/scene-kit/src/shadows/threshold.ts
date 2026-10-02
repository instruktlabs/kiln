import { Matrix4 } from 'three/webgpu';
import type { DirectionalLight, InstancedMesh, LightShadow, Mesh, Object3D, OrthographicCamera } from 'three/webgpu';
import { suppressedCasters } from './layers';
/** 'sphere': bounding-sphere diameter under the world scale and the largest instance, as the count probe sizes casters; orientation-free. 'light': geometry box extent across the sun's view. */
export type CasterMeasure = 'sphere' | 'light';
/** World size of one shadow texel for an orthographic (directional) shadow; 0 otherwise, so nothing reads as small. */
export function shadowTexelSize(shadow: LightShadow): number {
  const c = shadow.camera as OrthographicCamera; return c.isOrthographicCamera ? (c.right - c.left) / c.zoom / shadow.mapSize.x : 0;
}
const _view = /*@__PURE__*/ new Matrix4(), _instance = /*@__PURE__*/ new Matrix4();
/** Caster size in shadow texels; an InstancedMesh is its largest drawn instance. The caster's world matrix must be current; the 'light' measure brings the light's and target's up to date. */
export function casterTexels(o: Mesh, light: DirectionalLight, texel: number, measure: CasterMeasure = 'light'): number {
  const g = o.geometry, im = o as InstancedMesh, n = im.isInstancedMesh ? im.count : 1;let size = 0;
  if (measure === 'sphere') {
    if (!g.boundingSphere) g.computeBoundingSphere();
    for (let i = 0; i < n; i++) size = Math.max(size, im.isInstancedMesh ? im.getMatrixAt(i, _instance).getMaxScaleOnAxis() : 1);
    return 2 * g.boundingSphere!.radius * o.matrixWorld.getMaxScaleOnAxis() * (n ? size : 1) / texel;
  }
  if (!g.boundingBox) g.computeBoundingBox();
  const { min, max } = g.boundingBox!, hx = (max.x - min.x) / 2, hy = (max.y - min.y) / 2, hz = (max.z - min.z) / 2;
  // A light that never joined a rendered scene (a measuring copy) has stale world matrices; three updates them only when it renders.
  light.updateWorldMatrix(true, false); light.target.updateWorldMatrix(true, false); light.shadow.updateMatrices(light);
  for (let i = 0; i < n; i++) {
    _view.multiplyMatrices(light.shadow.camera.matrixWorldInverse, o.matrixWorld); if (im.isInstancedMesh) _view.multiply(im.getMatrixAt(i, _instance));
    const e = _view.elements; size = Math.max(size, Math.abs(e[0]!) * hx + Math.abs(e[4]!) * hy + Math.abs(e[8]!) * hz, Math.abs(e[1]!) * hx + Math.abs(e[5]!) * hy + Math.abs(e[9]!) * hz);
  }
  return 2 * size / texel;
}
export interface SmallCasterOptions { minTexels?: number; measure?: CasterMeasure; include?(m: Mesh): boolean; onChange?(): void }
export interface SmallCasterThreshold { readonly dropped: Mesh[]; update(): void; restore(): void; readonly stats: { casters: number; dropped: number; texel: number } }
/**
 * Switches castShadow off on visible casters under `minTexels` (default 2) shadow texels and restores them. The default
 * sphere measure matches the count probe's casters-under-N-texels what-if. `update()` re-evaluates after a texel, tier or
 * sun change (not per frame); `onChange` (a cached shadow's invalidate) runs whenever the dropped set changes.
 */
export function smallCasterThreshold(root: Object3D, light: DirectionalLight, o: SmallCasterOptions = {}): SmallCasterThreshold {
  const minTexels = o.minTexels ?? 2, measure = o.measure ?? 'sphere', set = new Set<Mesh>(), dropped: Mesh[] = [], stats = { casters: 0, dropped: 0, texel: 0 };let restored = false;
  const toggle = (m: Mesh, small: boolean) => { m.castShadow = !small; if (small) { set.add(m); suppressedCasters.add(m); } else { set.delete(m); suppressedCasters.delete(m); } };
  const visit = (n: Object3D, fn: (m: Mesh) => void) => { if (!n.visible) return; if ((n as Mesh).isMesh) fn(n as Mesh); for (const c of n.children) visit(c, fn); };
  const evaluate = () => {
    const texel = shadowTexelSize(light.shadow);let changed = false;stats.casters = 0;
    visit(root, m => { if (!(m.castShadow || set.has(m)) || o.include?.(m) === false) return; stats.casters++; const small = casterTexels(m, light, texel, measure) < minTexels; if (small !== set.has(m)) { toggle(m, small); changed = true; } });
    dropped.splice(0, dropped.length, ...set); stats.dropped = set.size; stats.texel = texel;
    if (changed) o.onChange?.();
  };
  evaluate();
  return { dropped, stats,
    update() { if (restored) throw new Error('Small-caster threshold has been restored'); evaluate(); },
    restore() { if (restored) return; restored = true; const any = set.size > 0; for (const m of [...set]) toggle(m, false); dropped.length = 0; stats.dropped = 0; if (any) o.onChange?.(); } };
}
