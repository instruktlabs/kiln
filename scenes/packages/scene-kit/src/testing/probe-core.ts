// Pure, duck-typed helpers for the count probe (probe.ts in the page, scripts/count-probe.ts in Node). No three import:
// everything here reads plain fields, so the Node runner and unit tests share it without a renderer.
export type RenderKind = 'main' | 'shadow' | 'reflection' | 'offscreen';
export type PassKind = RenderKind | 'output';
export const PASS_KINDS: readonly PassKind[] = ['main', 'shadow', 'reflection', 'output', 'offscreen'];
const SHADOW = /^(?:Shadow Map|Point Light Shadow) \[/, REFLECTION = / \[ Reflector \]$/;
/** three r186 names its nested renders through `scene.name` (ShadowNode.js:652, PointShadowNode.js:302, ReflectorNode.js:561). */
export function classifyRender(sceneName: string, depth: number, mainScene = depth === 0): RenderKind {
  if (SHADOW.test(sceneName)) return 'shadow';
  if (REFLECTION.test(sceneName)) return 'reflection';
  return depth === 0 && mainScene ? 'main' : 'offscreen';
}
export interface TargetLike { width: number; height: number; isPostProcessingRenderTarget?: boolean }
export function classifyTarget(rt: TargetLike | null | undefined, shadowMaps: ReadonlySet<unknown>): string {
  if (!rt) return 'canvas';
  if (rt.isPostProcessingRenderTarget) return 'framebuffer';
  if (shadowMaps.has(rt)) return 'shadow-map';
  return `rt ${rt.width}x${rt.height}`;
}
export interface NodeLike { name: string; parent: NodeLike | null }
/** Named ancestors of `object` (itself included) from just below `root` down, cut to `depth` names. */
export function attributionPath(object: NodeLike, root: NodeLike | null, depth = 3): string {
  const names: string[] = [];let node: NodeLike | null = object;
  while (node && node !== root) { if (node.name) names.unshift(node.name); node = node.parent; }
  if (!node && root) names.unshift('(detached)');
  return names.length ? names.slice(0, depth).join('/') : '(unnamed)';
}
export interface InstancedLike { isInstancedMesh?: boolean; count?: number; instanceMatrix?: { array: ArrayLike<number> } }
export interface CasterLike extends InstancedLike {
  geometry: { index?: { count: number } | null; attributes: { position?: { count: number } }; boundingSphere?: { radius: number } | null; computeBoundingSphere?(): void };
  matrixWorld: { getMaxScaleOnAxis(): number };
}
/** Largest axis scale over the first `count` instance matrices of an InstancedMesh; 1 for anything else or no instances. */
export function maxInstanceScale(mesh: InstancedLike): number {
  const a = mesh.isInstancedMesh ? mesh.instanceMatrix?.array : undefined, n = a ? Math.min(mesh.count ?? 0, Math.floor(a.length / 16)) : 0;
  let max = 0;
  for (let i = 0; i < n; i++) for (const c of [0, 4, 8]) { const o = i * 16 + c; max = Math.max(max, a![o]! ** 2 + a![o + 1]! ** 2 + a![o + 2]! ** 2); }
  return n ? Math.sqrt(max) : 1;
}
/**
 * Triangles per draw (per instance for instanced meshes) and the bounding-sphere diameter in shadow texels (null without a
 * texel size). An InstancedMesh is sized by its largest instance, so a batch counts as small only when every instance is.
 */
export function casterSize(mesh: CasterLike, texelWorld: number | null | undefined): { triangles: number; texels: number | null } {
  const g = mesh.geometry, triangles = Math.floor((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3);
  if (!texelWorld) return { triangles, texels: null };
  if (!g.boundingSphere) g.computeBoundingSphere?.();
  const radius = g.boundingSphere?.radius ?? 0;
  return { triangles, texels: 2 * radius * mesh.matrixWorld.getMaxScaleOnAxis() * maxInstanceScale(mesh) / texelWorld };
}
/** Small when under either threshold given; a texel threshold needs `texelWorld`. */
export function isSmallCaster(mesh: CasterLike, o: { triangles?: number; texels?: number; texelWorld?: number | null }): boolean {
  const size = casterSize(mesh, o.texels === undefined ? null : o.texelWorld);
  return (o.triangles !== undefined && size.triangles < o.triangles) || (o.texels !== undefined && size.texels !== null && size.texels < o.texels);
}
export interface ShadowLike { camera?: { isOrthographicCamera?: boolean; isPerspectiveCamera?: boolean; left?: number; right?: number }; mapSize?: { x: number } }
/** World size of one shadow texel for an orthographic (directional) shadow; null otherwise. */
export function shadowTexelWorld(shadow: ShadowLike | null | undefined): number | null {
  const c = shadow?.camera, size = shadow?.mapSize?.x;
  if (!c?.isOrthographicCamera || !size || c.left === undefined || c.right === undefined) return null;
  return (c.right - c.left) / size;
}
/** `stable`: the last `stableFrames` frames share a key; `stableAfter` is the first index of that trailing run. */
export function summarizeFrames<T>(frames: readonly T[], o: { stableFrames?: number; key?: (frame: T) => string } = {}): { stable: boolean; identical: boolean; stableAfter: number | null; frame: T | null } {
  const need = o.stableFrames ?? 3, key = o.key ?? ((frame: T) => JSON.stringify(frame));
  if (!frames.length) return { stable: false, identical: false, stableAfter: null, frame: null };
  const keys = frames.map(key), last = keys.at(-1)!;let start = keys.length - 1;
  while (start > 0 && keys[start - 1] === last) start--;
  const stable = keys.length - start >= need;
  return { stable, identical: start === 0 && stable, stableAfter: stable ? start : null, frame: frames.at(-1)! };
}
type Counts = { [key: string]: unknown };
/** variant − base over numeric leaves of plain objects; a side missing a leaf counts as zero. Strings and arrays are dropped. */
export function diffCounts(base: Counts, variant: Counts): Counts {
  const out: Counts = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(variant)])) {
    const a = base[key], b = variant[key];
    if ((typeof a === 'number' || a === undefined) && (typeof b === 'number' || b === undefined) && (a !== undefined || b !== undefined)) out[key] = (b as number ?? 0) - (a as number ?? 0);
    else if (isPlain(a) || isPlain(b)) { if ((a === undefined || isPlain(a)) && (b === undefined || isPlain(b))) out[key] = diffCounts((a ?? {}) as Counts, (b ?? {}) as Counts); }
  }
  return out;
}
const isPlain = (value: unknown): value is Counts => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A main render that also drew a frame-buffer pass draws its canvas pass as the output quad. */
export function passKinds(passes: readonly { render: RenderKind; target: string }[]): PassKind[] {
  const buffered = passes.some(p => p.render === 'main' && p.target === 'framebuffer');
  return passes.map(p => p.render === 'main' && p.target === 'canvas' && buffered ? 'output' : p.render);
}
export interface KindTotals { passes: number; draws: number; triangles: number; pipelines: number }
export function totalsByKind(passes: readonly { kind: PassKind; draws: number; triangles: number; pipelines: ReadonlySet<unknown> }[]): { draws: number; triangles: number; pipelinesUsed: number; byKind: Partial<Record<PassKind, KindTotals>> } {
  const all = new Set<unknown>(), sets = new Map<PassKind, Set<unknown>>(), byKind: Partial<Record<PassKind, KindTotals>> = {};
  let draws = 0, triangles = 0;
  for (const p of passes) {
    const k = byKind[p.kind] ??= { passes: 0, draws: 0, triangles: 0, pipelines: 0 }, set = sets.get(p.kind) ?? new Set();
    k.passes++; k.draws += p.draws; k.triangles += p.triangles; draws += p.draws; triangles += p.triangles;
    for (const pipeline of p.pipelines) { set.add(pipeline); all.add(pipeline); }
    sets.set(p.kind, set); k.pipelines = set.size;
  }
  return { draws, triangles, pipelinesUsed: all.size, byKind };
}
