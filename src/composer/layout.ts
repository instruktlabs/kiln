/**
 * Composer layout — a terrain-agnostic, hierarchy-aware placement engine.
 *
 * Replaces the old per-district `packRings` (mechanical concentric rings,
 * footprint underestimate, no facing, flat-ground only). The substrate here is
 * deliberately NOT rigid — it is the foundation scenes grow on:
 *
 *   - **Ground is a sampler** (`GroundSampler.heightAt`), not a hardcoded y=0.
 *     Flat today; a heightmap implements the same seam tomorrow and every
 *     placement drops onto the terrain with no layout change.
 *   - **Anchors, not districts.** "4 zones + a centrepiece" is just one way to
 *     build anchors (`zonedCenters`); pass any anchors, or one — rings, organic
 *     clusters, street grids all sit on the same core.
 *   - **Hierarchy-aware organic spacing.** Items pack big-first onto a golden-
 *     angle (sunflower) lattice with circumradius min-distance — provably
 *     overlap-free, but natural, not even concentric rings. Heroes claim the
 *     centre and get extra breathing room; fill settles on the outskirts.
 *   - **Intentional facing.** Each asset is turned to face a focal (scene centre
 *     by default — kiln assets front along +X), so landmarks address the viewer
 *     instead of pointing at random; fill gets a little jitter so clusters read
 *     natural.
 *   - **Grouping.** Items sharing a `group` cluster around that group's hero.
 *
 * Fully deterministic (seeded). The composer agent refines this baseline through
 * the tool surface; the overlap validator gates every result (`overlaps` is
 * empty by construction — global min-distance covers inter-anchor clearance).
 */
import { mulberry32 } from '../seeded-random';
import { flatGround, type GroundSampler } from './ground';
import {
  findPlacementOverlaps,
  type OverlapViolation,
  type PlacedAsset,
  type Vec3,
} from './overlap';

export type Vec2 = [number, number];
export type ItemRole = 'hero' | 'support' | 'fill';
export type FacingPolicy = 'scene-in' | 'scene-out' | 'zone-in' | 'random' | 'none';

export interface LayoutItem {
  id: string;
  /** Asset-local bbox (e.g. generation metrics.bbox.min/max), unscaled. */
  localMin: Vec3;
  localMax: Vec3;
  /** Uniform scale applied to the placement. Default 1. */
  scale?: number;
  /** Importance tier: heroes anchor + get breathing room, fill scatters out. Default 'support'. */
  role?: ItemRole;
  /** Anchor id this item belongs to. Default: the first/only anchor. */
  zone?: string;
  /** Finer affinity — items with the same group cluster around that group's hero. */
  group?: string;
  /** Explicit facing focus (world point); overrides the policy. */
  faceTarget?: Vec2;
  /** Explicit Y rotation (degrees); skips facing entirely. */
  rotYDeg?: number;
}

export interface Anchor {
  id: string;
  center: Vec2;
  /** Facing focus for 'zone-in' items; defaults to `center`. */
  focus?: Vec2;
}

export interface LayoutOptions {
  /** Placement anchors. Default: a single anchor at the origin. */
  anchors?: Anchor[];
  /** Terrain sampler. Default: flat ground at y=0. */
  ground?: GroundSampler;
  /** Global focal point for 'scene-in' / 'scene-out' facing. Default [0,0]. */
  sceneCenter?: Vec2;
  /** Minimum clearance between footprints (world units). Default 2. */
  gap?: number;
  /** Extra breathing room when either item in a pair is a hero. Default 6. */
  heroClearance?: number;
  /** Facing policy for items without an explicit `faceTarget`/`rotYDeg`. Default 'scene-in'. */
  facing?: FacingPolicy;
  /** Deterministic seed. Default 1. */
  seed?: number;
}

export interface Placed {
  id: string;
  pos: Vec3;
  /** The XZ the asset's bbox CENTRE was placed at (the origin `pos` differs by the
   *  centre offset). Lets the composer turn an auto-layout into editable per-asset
   *  placements whose `at` is the centre and whose facing is the resolved angle. */
  centerXZ: Vec2;
  rotYDeg: number;
  scale: number;
}

export interface LayoutResult {
  placements: Placed[];
  /** Empty by construction; a non-empty result signals a degenerate input. */
  overlaps: OverlapViolation[];
  /** Outermost placed radius per anchor (useful for sizing the ground / camera). */
  spreadByAnchor: Record<string, number>;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TO_DEG = 180 / Math.PI;
const TO_RAD = Math.PI / 180;
const ROLE_RANK: Record<ItemRole, number> = { hero: 0, support: 1, fill: 2 };
const round1 = (n: number): number => Math.round(n * 10) / 10;

interface Prepared {
  item: LayoutItem;
  scale: number;
  role: ItemRole;
  /** Scaled footprint circumradius — half the XZ diagonal. Bounds the footprint
   *  under any Y-rotation, so circle min-distance ⇒ AABB non-overlap. */
  footR: number;
}

function prepare(item: LayoutItem): Prepared {
  const s = item.scale ?? 1;
  const sx = Math.abs(item.localMax[0] - item.localMin[0]) * s;
  const sz = Math.abs(item.localMax[2] - item.localMin[2]) * s;
  return { item, scale: s, role: item.role ?? 'support', footR: Math.hypot(sx, sz) / 2 };
}

interface PlacedCenter {
  cx: number;
  cz: number;
  footR: number;
  hero: boolean;
}

interface PackCfg {
  spacingBase: number;
  gap: number;
  heroClearance: number;
}

/** Does a candidate centre clear every already-placed footprint circle? */
function clears(
  cx: number,
  cz: number,
  p: Prepared,
  placed: PlacedCenter[],
  cfg: PackCfg,
): boolean {
  for (const q of placed) {
    const heroRoom = p.role === 'hero' || q.hero ? cfg.heroClearance : 0;
    const need = p.footR + q.footR + cfg.gap + heroRoom;
    if (Math.hypot(cx - q.cx, cz - q.cz) < need) return false;
  }
  return true;
}

/** First open spot on a golden-angle spiral around `spiral` — organic, big-first
 *  packing that is overlap-free by construction (checks ALL placed centres, so
 *  it also keeps neighbouring anchors from colliding). */
function findOpenCenter(
  spiral: Vec2,
  phase: number,
  p: Prepared,
  placed: PlacedCenter[],
  cfg: PackCfg,
): Vec2 {
  const MAX_K = 4000;
  for (let k = 0; k < MAX_K; k++) {
    const r = cfg.spacingBase * Math.sqrt(k);
    const a = phase + k * GOLDEN;
    const cx = spiral[0] + r * Math.cos(a);
    const cz = spiral[1] + r * Math.sin(a);
    if (clears(cx, cz, p, placed, cfg)) return [cx, cz];
  }
  return [spiral[0] + cfg.spacingBase * Math.sqrt(MAX_K), spiral[1]];
}

interface FacingCtx {
  facing: FacingPolicy;
  sceneCenter: Vec2;
  anchor: Anchor;
  rng: () => number;
}

/** A per-asset facing INTENT (the composer DSL surface): face the scene centre,
 *  face away, face a world [x,z] point, or an explicit Y-rotation in degrees. */
export type Facing = 'center' | 'out' | [number, number] | number;

/** Y-rotation (deg) so an asset's +X front points from `from` toward `target`. */
function faceAngleToward(from: Vec2, target: Vec2): number {
  const dx = target[0] - from[0];
  const dz = target[1] - from[1];
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  // kiln assets face +X; local +X under Y-rotation θ points to (cosθ, -sinθ).
  return Math.atan2(-dz, dx) * TO_DEG;
}

/** Resolve a facing INTENT to a Y-rotation (deg). The composer DSL's `facing()`
 *  sugar; prefer 'center'/'out' over hand-computed degrees. */
export function facingToRotY(intent: Facing, fromXZ: Vec2, sceneCenter: Vec2): number {
  if (typeof intent === 'number') return intent;
  if (Array.isArray(intent)) return faceAngleToward(fromXZ, intent);
  if (intent === 'out') {
    return faceAngleToward(fromXZ, [
      2 * fromXZ[0] - sceneCenter[0],
      2 * fromXZ[1] - sceneCenter[1],
    ]);
  }
  return faceAngleToward(fromXZ, sceneCenter); // 'center'
}

/** World position placing an asset's bbox CENTRE at `centerXZ` with its base on the
 *  terrain — folds scale, the bbox-centre offset (so a non-centred mesh can't drift),
 *  and Y-rotation. Shared by the layout engine and the composer DSL so a manual
 *  placement lands exactly where auto-layout would put it. */
export function groundedPos(
  localMin: Vec3,
  localMax: Vec3,
  scale: number,
  centerXZ: Vec2,
  rotYDeg: number,
  ground: GroundSampler,
): Vec3 {
  const cx = ((localMin[0] + localMax[0]) / 2) * scale;
  const cz = ((localMin[2] + localMax[2]) / 2) * scale;
  const minY = localMin[1] * scale;
  const th = rotYDeg * TO_RAD;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const rcx = cx * cos + cz * sin;
  const rcz = -cx * sin + cz * cos;
  return [centerXZ[0] - rcx, ground.heightAt(centerXZ[0], centerXZ[1]) - minY, centerXZ[1] - rcz];
}

/** Degrees of Y-rotation so the asset's +X front points at its focal point. */
function resolveFacing(p: Prepared, center: Vec2, ctx: FacingCtx): number {
  if (p.item.rotYDeg !== undefined) return p.item.rotYDeg;

  let target: Vec2 | null = p.item.faceTarget ?? null;
  if (!target) {
    switch (ctx.facing) {
      case 'scene-in':
        target = ctx.sceneCenter;
        break;
      case 'scene-out':
        target = [2 * center[0] - ctx.sceneCenter[0], 2 * center[1] - ctx.sceneCenter[1]];
        break;
      case 'zone-in':
        target = ctx.anchor.focus ?? ctx.anchor.center;
        break;
      case 'random':
        return ctx.rng() * 360;
      default:
        return 0;
    }
  }

  const deg = faceAngleToward(center, target);
  const jitter = p.role === 'fill' ? (ctx.rng() - 0.5) * 14 : 0; // natural, deterministic
  return deg + jitter;
}

/** Lay a set of items out across anchors: organic hierarchy-aware spacing,
 *  intentional facing, group clustering, terrain-grounded, overlap-validated. */
export function layoutScene(items: LayoutItem[], opts: LayoutOptions = {}): LayoutResult {
  const ground = opts.ground ?? flatGround(0);
  const sceneCenter: Vec2 = opts.sceneCenter ?? [0, 0];
  const facing = opts.facing ?? 'scene-in';
  // Deterministic PRNG (mulberry32): no Math.random, so scenes are reproducible.
  const rng = mulberry32(opts.seed ?? 1);
  const anchors: Anchor[] = opts.anchors?.length
    ? opts.anchors
    : [{ id: '__root', center: [0, 0] }];
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const defaultAnchor = anchors[0]!;

  const prepared = items.map(prepare);
  // Place big-first within role tiers: heroes, then support, then fill.
  const order = [...prepared].sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || b.footR - a.footR,
  );

  // Lattice density tracks the median footprint — keeps the candidate scan cheap
  // even for the largest heroes.
  const radii = prepared.map((p) => p.footR).sort((a, b) => a - b);
  const medianR = radii.length ? radii[Math.floor(radii.length / 2)]! : 2;
  const cfg: PackCfg = {
    spacingBase: Math.max(2, medianR),
    gap: opts.gap ?? 2,
    heroClearance: opts.heroClearance ?? 6,
  };

  const placedCenters: PlacedCenter[] = [];
  const groupCenter = new Map<string, Vec2>();
  const placements: Placed[] = [];
  const placedAssets: PlacedAsset[] = [];
  const spreadByAnchor: Record<string, number> = {};

  for (const p of order) {
    const anchor = (p.item.zone ? anchorById.get(p.item.zone) : undefined) ?? defaultAnchor;
    // Cluster around the group's hero if one is already down, else the anchor.
    const spiral: Vec2 =
      (p.item.group ? groupCenter.get(p.item.group) : undefined) ?? anchor.center;
    const phase = rng() * Math.PI * 2;

    const center = findOpenCenter(spiral, phase, p, placedCenters, cfg);
    placedCenters.push({ cx: center[0], cz: center[1], footR: p.footR, hero: p.role === 'hero' });
    if (p.role === 'hero') {
      const key = p.item.group ?? p.item.id;
      if (!groupCenter.has(key)) groupCenter.set(key, center);
    }

    const rotYDeg = resolveFacing(p, center, { facing, sceneCenter, anchor, rng });
    // Recentre + ground: bbox CENTRE at `center`, base on the terrain (shared helper).
    const raw = groundedPos(p.item.localMin, p.item.localMax, p.scale, center, rotYDeg, ground);
    const pos: Vec3 = [round1(raw[0]), round1(raw[1]), round1(raw[2])];

    placements.push({
      id: p.item.id,
      pos,
      centerXZ: [round1(center[0]), round1(center[1])],
      rotYDeg: Math.round(rotYDeg),
      scale: p.scale,
    });
    placedAssets.push({
      id: p.item.id,
      localMin: p.item.localMin,
      localMax: p.item.localMax,
      pos,
      rotYDeg: Math.round(rotYDeg),
      scale: p.scale,
    });

    const d = Math.hypot(center[0] - anchor.center[0], center[1] - anchor.center[1]);
    spreadByAnchor[anchor.id] = Math.max(spreadByAnchor[anchor.id] ?? 0, d);
  }

  return { placements, overlaps: findPlacementOverlaps(placedAssets), spreadByAnchor };
}

/** The default "hub + 4 satellites" anchor set — one preset on the agnostic core,
 *  not a baked-in rule. `distance` is the satellite offset from the hub. */
export function zonedCenters(distance = 95): Anchor[] {
  return [
    { id: 'hub', center: [0, 0] },
    { id: 'north', center: [0, -distance] },
    { id: 'east', center: [distance, 0] },
    { id: 'south', center: [0, distance] },
    { id: 'west', center: [-distance, 0] },
  ];
}
