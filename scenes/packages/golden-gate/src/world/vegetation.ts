// SPDX-License-Identifier: MIT
// Vegetation impostors near the approaches (fix round 3, golden-gate-scene/SCENE-REVIEW-3.md item 5) from
// data/layout.json dressing.vegetation (D-21), so the driver's eye does not meet a flat photograph: cross cards where
// our own terrain imagery shows canopy (the Presidio forest south, the headland scrub and groves north) within
// `reach` m of an approach, in the approaches' near representation only. Nothing is stored per card: candidates lie
// on a jittered world grid (the feature level's density thins it), their roots take the height of the loaded near
// terrain tile after the corridor edits (./corridor), and the GPU reads that tile's own imagery at each root for the
// canopy score that keeps or drops the card and for its colour. The crown shapes are one small atlas generated at
// load (no image file). Cards cast no shadow; the imagery keeps its own.
import { BufferAttribute, ClampToEdgeWrapping, DataTexture, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, NoColorSpace, RGBAFormat, Sphere, UnsignedByteType, Vector3, Vector4 } from 'three/webgpu';
import type { Node, Texture } from 'three/webgpu';
import { attribute, cameraPosition, cos, float, floor, mix, positionGeometry, sin, specularColor, specularColorBlended, specularF90, sRGBTransferOETF, texture, transformNormalToView, uniform, uv, vec2, vec3 } from 'three/tsl';
import { horizontalProject } from './alignment';
import { polygonDistance, sideWidening } from './dressing';
import { frame } from './mesh-arrays';
import { buildApproach } from './route';
import type { ApproachName, SceneApproaches, SceneDressing, VegetationData, VegetationKindName } from '../data';

/** A candidate card: approach, kind, world root (x, z), station and lateral d, and uniform draws in [0, 1). */
export interface VegetationCandidate {
  approach: ApproachName; kind: VegetationKindName; x: number; z: number; s: number; d: number;
  /** Yaw, height and width within the kind's ranges, the keep seed (against the canopy score), and the atlas variant. */
  yaw: number; height: number; width: number; seed: number; variant: 0 | 1;
}
type Bounds = readonly [number, number, number, number]; // xmin, zmin, xmax, zmax
type P2 = readonly [number, number];

/** Jitter of a candidate within its grid cell (share of the spacing), and the coarse mask's cell (m). */
export const VEGETATION_GRID = { jitter: .8, cell: 25 } as const;
/** Cards per mesh: stations binned every `chunk` m per approach and terrain tile (frustum culling), inner cards first. */
export const VEGETATION_CHUNK = 250;
/** Bytes per card on the GPU: the root (4 float32) and the shape (4 unorm8). */
export const VEGETATION_INSTANCE_BYTES = 20;

/** A uniform draw in [0, 1) from integer grid coordinates and a stream (a 32-bit integer mix). */
export function gridHash(i: number, j: number, stream: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul((stream | 0) + 0x3c6ef372, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The candidate cards at a feature level's density (layout.json dressing.vegetation; see VegetationData): per
 * approach and kind, one per world grid cell of the kind's spacing, jittered, within `reach` of the approach and
 * clear of the road, the deck end, Vista Point's paved lot and the benched cuts. Deterministic.
 */
export function vegetationCandidates(approaches: SceneApproaches, roadEndZ: number, dressing: SceneDressing, density: number): VegetationCandidate[] {
  const v = dressing.vegetation, cs = approaches.crossSection, out: VegetationCandidate[] = [], { jitter, cell } = VEGETATION_GRID;
  for (const name of ['south', 'north'] as const) {
    const kinds = v.approaches[name]; if (!kinds.length) continue;
    const a = buildApproach(name, approaches[name], roadEndZ), steps = Math.ceil(a.length / 10), line: P2[] = [];
    for (let k = 0; k <= steps; k++) { const f = frame(a, a.length * k / steps); line.push([f.x, f.z]); }
    // A coarse mask of the cells within reach (plus a cell and the widest spacing) of the centreline.
    const pad = v.reach + Math.max(...kinds.map(k => v.kinds[k].spacing)) + cell;
    const x0 = Math.min(...line.map(p => p[0])) - pad, x1 = Math.max(...line.map(p => p[0])) + pad, z0 = Math.min(...line.map(p => p[1])) - pad, z1 = Math.max(...line.map(p => p[1])) + pad;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell), mask = new Uint8Array(nx * nz), r = Math.ceil(pad / cell);
    for (const [px, pz] of line) {
      const ci = Math.floor((px - x0) / cell), cj = Math.floor((pz - z0) / cell);
      for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
        if (Math.hypot(x0 + (i + .5) * cell - px, z0 + (j + .5) * cell - pz) <= pad) mask[j * nx + i] = 1;
      }
    }
    const vista = dressing.vista.approach === name ? dressing.vista : null, cuts = approaches[name].cuts ?? [];
    for (const kindName of kinds) {
      const kind = v.kinds[kindName], sp = kind.spacing, stream = kindName === 'tree' ? 0 : 16;
      for (let j = Math.floor(z0 / sp); j <= Math.ceil(z1 / sp); j++) for (let i = Math.floor(x0 / sp); i <= Math.ceil(x1 / sp); i++) {
        const h = (k: number) => gridHash(i, j, stream + k);
        if (h(0) >= density) continue;
        const x = (i + .5 + (h(1) - .5) * jitter) * sp, z = (j + .5 + (h(2) - .5) * jitter) * sp;
        const ci = Math.floor((x - x0) / cell), cj = Math.floor((z - z0) / cell);
        if (ci < 0 || cj < 0 || ci >= nx || cj >= nz || !mask[cj * nx + ci]) continue;
        const p = horizontalProject(a.horizontal, x, z); if (!p) continue;
        const width = h(4), half = (kind.width[0] + (kind.width[1] - kind.width[0]) * width) / 2, ad = Math.abs(p.d), side = p.d < 0 ? -1 : 1;
        if (ad > v.reach || p.s < half + v.clear || p.s > a.length) continue;
        if (ad < cs.barrier[1] + sideWidening(a, dressing, cs.pavedHalfWidth, p.s, side) + v.clear + half) continue;
        if (cuts.some(c => p.d * a.sign * c.side > 0 && p.s > c.s[0] - half && p.s < c.s[1] + half && ad < c.reach[1] + half)) continue;
        if (vista) { const q = a.sign * p.d; if (polygonDistance(vista.outline, p.s, q) < half + v.clear && !(polygonDistance(vista.planter, p.s, q) < -half)) continue; }
        out.push({ approach: name, kind: kindName, x, z, s: p.s, d: p.d, yaw: h(3), height: h(5), width, seed: h(6), variant: h(7) < .5 ? 0 : 1 });
      }
    }
  }
  return out;
}

/**
 * Terrain heights at points (x, z) from a tile's triangles (position xyz, index): the highest surface over each point,
 * vertical faces ignored; NaN where no triangle covers a point. Points are bucketed in `cell` m cells and each
 * triangle visits the cells its bounding box overlaps.
 */
export function surfaceHeights(px: ArrayLike<number>, pz: ArrayLike<number>, position: ArrayLike<number>, index: ArrayLike<number>, cell = 8): Float64Array {
  const n = px.length, out = new Float64Array(n).fill(Number.NaN);
  if (!n) return out;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < n; k++) { x0 = Math.min(x0, px[k]!); x1 = Math.max(x1, px[k]!); z0 = Math.min(z0, pz[k]!); z1 = Math.max(z1, pz[k]!); }
  const nx = Math.floor((x1 - x0) / cell) + 1, nz = Math.floor((z1 - z0) / cell) + 1, start = new Int32Array(nx * nz + 1), items = new Int32Array(n), of = new Int32Array(n);
  for (let k = 0; k < n; k++) { const c = Math.floor((pz[k]! - z0) / cell) * nx + Math.floor((px[k]! - x0) / cell); of[k] = c; start[c + 1]!++; }
  for (let c = 0; c < nx * nz; c++) start[c + 1]! += start[c]!;
  const fill = start.slice(0, nx * nz);
  for (let k = 0; k < n; k++) items[fill[of[k]!]!++] = k;
  const p = position;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    const ax = p[a]!, az = p[a + 2]!, bx = p[b]!, bz = p[b + 2]!, cx = p[c]!, cz = p[c + 2]!;
    const txmin = Math.min(ax, bx, cx), txmax = Math.max(ax, bx, cx), tzmin = Math.min(az, bz, cz), tzmax = Math.max(az, bz, cz);
    if (txmax < x0 || txmin > x1 || tzmax < z0 || tzmin > z1) continue;
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-6) continue;
    const i0 = Math.max(0, Math.floor((txmin - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((txmax - x0) / cell));
    const j0 = Math.max(0, Math.floor((tzmin - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((tzmax - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cc = j * nx + i;
      for (let m = start[cc]!; m < start[cc + 1]!; m++) {
        const k = items[m]!, x = px[k]!, z = pz[k]!;
        const w1 = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area, w2 = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area, w3 = 1 - w1 - w2;
        if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
        const y = w1 * p[a + 1]! + w2 * p[b + 1]! + w3 * p[c + 1]!;
        if (!(out[k]! >= y)) out[k] = y;
      }
    }
  }
  return out;
}

const smoothRamp = (e: readonly [number, number], x: number) => { const t = Math.min(1, Math.max(0, (x - e[0]) / (e[1] - e[0]))); return t * t * (3 - 2 * t); };
/**
 * The canopy score of an imagery colour (sRGB 0 to 255) for a kind: what the GPU computes at each card's root
 * (vegetationMaterial), for the tools and tests.
 */
export function canopyScore(rgb: readonly number[], kind: VegetationKindName, classes: VegetationData['classes']): number {
  const [r, g, b] = rgb as [number, number, number], luma = .2126 * r + .7152 * g + .0722 * b;
  const tree = smoothRamp(classes.tree.greenOverRed, g - r) * smoothRamp(classes.tree.luma, luma);
  if (kind === 'tree') return tree;
  return smoothRamp(classes.scrub.greenOverBlue, g - b) * smoothRamp(classes.scrub.luma, luma) * smoothRamp(classes.scrub.greenOverRed, g - r) * (1 - tree);
}

/**
 * The crown atlas: 2 x 2 cells of `size` px, rows tree and scrub, columns two variants, row 0 of the data at the
 * cards' foot; red (and green, blue) the leaf shade, alpha the cut-out. Value noise over the same integer hash.
 */
export function crownAtlas(size = 128): { data: Uint8Array; width: number; height: number } {
  const W = size * 2, data = new Uint8Array(W * W * 4);
  const noise = (x: number, y: number, s: number) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = gridHash(i, j, s), b = gridHash(i + 1, j, s), c = gridHash(i, j + 1, s), d = gridHash(i + 1, j + 1, s);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  const fbm = (x: number, y: number, s: number) => noise(x, y, s) * .5 + noise(x * 2.03, y * 2.03, s + 1) * .3 + noise(x * 4.1, y * 4.1, s + 2) * .2;
  for (let kind = 0; kind < 2; kind++) for (let variant = 0; variant < 2; variant++) {
    const seed = 100 + kind * 10 + variant * 5;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const u = (i + .5) / size, v = (j + .5) / size;
      let alpha = false, shade = .5;
      if (kind === 0) {
        // A crown low over a short trunk: a lobed ellipse, solid at its core, with gaps toward its edge; leaf clumps.
        const e = ((u - .5) / .43) ** 2 + ((v - .54) / .44) ** 2, edge = fbm(u * 4, v * 4, seed), holes = fbm(u * 9, v * 9, seed + 3);
        if (e < .6 + .62 * edge && holes > .2 + .55 * Math.max(0, e - .6)) { alpha = true; shade = (.3 + .7 * (.6 * fbm(u * 8, v * 8, seed + 6) + .4 * noise(u * 26, v * 26, seed + 9))) * (.72 + .28 * v); }
        else if (Math.abs(u - .5) < .03 && v < .25) { alpha = true; shade = .12; }
      } else {
        // A low mound, full width at its foot.
        const e = ((u - .5) / .47) ** 2 + (v / .9) ** 2, edge = fbm(u * 6, v * 4, seed), holes = fbm(u * 14, v * 14, seed + 3);
        if (e < .7 + .45 * edge && holes > .16 + .4 * Math.max(0, e - .55)) { alpha = true; shade = .35 + .65 * fbm(u * 10, v * 10, seed + 6); }
      }
      if (i < 2 || j < 2 || i >= size - 2 || j >= size - 2) alpha = false;
      const o = ((kind * size + j) * W + variant * size + i) * 4, c = Math.round(shade * 255);
      data[o] = c; data[o + 1] = c; data[o + 2] = c; data[o + 3] = alpha ? 255 : 0;
    }
  }
  return { data, width: W, height: W };
}
/** The crown atlas as a mipmapped texture (linear data). */
export function crownAtlasTexture(size = 128): DataTexture {
  const { data, width, height } = crownAtlas(size), t = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  t.name = 'vegetation-crowns'; t.colorSpace = NoColorSpace; t.flipY = false; t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

class VegetationMaterial extends MeshStandardNodeMaterial {
  static get type() { return 'GoldenGateVegetationMaterial'; }
  specular = { f0: .04, f90: 1 };
  setupSpecular() { specularColor.assign(vec3(this.specular.f0)); specularColorBlended.assign(vec3(this.specular.f0)); specularF90.assign(this.specular.f90); }
}
const ramp = (e: readonly [number, number], x: Node<'float'>) => { const t = x.sub(e[0]).div(e[1] - e[0]).clamp(); return t.mul(t).mul(t.mul(-2).add(3)); };
/**
 * The cards' material for one terrain tile: its imagery (`albedo`, over `bounds`) read at each card's root over
 * `footprint` m in the vertex stage for the canopy score (canopyScore), which with the camera distance fade keeps or
 * collapses the card, and for its colour; the crown atlas cuts it out and shades it, darker toward its foot, under a
 * rounded crown's normal. Terrain specular (`specular`). The tile's bounds and mip level are uniforms, so every tile's
 * material shares one program (one lazy compile when the approaches' near representation first shows).
 */
export function vegetationMaterial(o: { albedo: Texture; bounds: Bounds; atlas: Texture; data: VegetationData; fade: readonly [number, number]; specular: { f0: number; f90: number } }): MeshStandardNodeMaterial {
  const m = new VegetationMaterial({ roughness: 1, metalness: 0, side: DoubleSide });
  m.name = 'vegetation'; m.specular = { ...o.specular }; m.alphaTest = .5;
  const root = attribute<'vec4'>('root', 'vec4'), shape = attribute<'vec4'>('shape', 'vec4');
  const [x0, z0, x1, z1] = o.bounds, width = (o.albedo.image as { width: number }).width, lod = Math.max(0, Math.log2(o.data.footprint * width / (x1 - x0)));
  // The tile's imagery: u grows toward +X from its -X edge, v toward -Z from its +Z edge (terrain.ts bakeTileGeometry).
  const box = uniform(new Vector4(x0, z1, 1 / (x1 - x0), 1 / (z1 - z0))), level = uniform(lod);
  const linear = texture(o.albedo, vec2(root.x.sub(box.x).mul(box.z), box.y.sub(root.z).mul(box.w))).level(level).rgb;
  const srgb = (sRGBTransferOETF(linear) as Node<'vec3'>).mul(255), r = srgb.x, g = srgb.y, b = srgb.z, luma = r.mul(.2126).add(g.mul(.7152)).add(b.mul(.0722));
  const c = o.data.classes, K = o.data.kinds;
  const tree = ramp(c.tree.greenOverRed, g.sub(r)).mul(ramp(c.tree.luma, luma));
  const scrub = ramp(c.scrub.greenOverBlue, g.sub(b)).mul(ramp(c.scrub.luma, luma)).mul(ramp(c.scrub.greenOverRed, g.sub(r))).mul(tree.oneMinus());
  const kind = floor(root.w.mul(.5)), variant = root.w.sub(kind.mul(2));
  const keep = shape.w.lessThan(mix(tree, scrub, kind)).select(ramp([o.fade[1], o.fade[0]], cameraPosition.sub(root.xyz).length()), float(0));
  const H = mix(mix(K.tree.height[0], K.tree.height[1], shape.y), mix(K.scrub.height[0], K.scrub.height[1], shape.y), kind).mul(keep);
  const Wd = mix(mix(K.tree.width[0], K.tree.width[1], shape.z), mix(K.scrub.width[0], K.scrub.width[1], shape.z), kind).mul(keep);
  const sink = mix(K.tree.sink, K.scrub.sink, kind), yaw = shape.x.mul(2 * Math.PI), cy = cos(yaw), sy = sin(yaw), p = positionGeometry;
  const lx = p.x.mul(Wd), lz = p.z.mul(Wd);
  m.positionNode = vec3(root.x.add(lx.mul(cy).sub(lz.mul(sy))), root.y.add(p.y.sub(sink).mul(H)), root.z.add(lx.mul(sy).add(lz.mul(cy))));
  // A rounded crown: outward from the card's axis and upward (never below 35 degrees), turned with the card.
  const ny = p.y.mul(.45).add(.45), px = p.x.mul(1.2), pz = p.z.mul(1.2), n = vec3(px.mul(cy).sub(pz.mul(sy)), ny, px.mul(sy).add(pz.mul(cy))).normalize();
  m.normalNode = transformNormalToView(n).toVarying('v_vegetationNormal').normalize();
  const crown = texture(o.atlas, vec2(uv().x.add(variant.toVarying('v_vegetationVariant')).mul(.5), uv().y.add(kind.toVarying('v_vegetationKind')).mul(.5)));
  m.colorNode = linear.toVarying('v_vegetationColor').mul(crown.r.mul(.8).add(.45)).mul(mix(.78, 1.04, uv().y));
  m.opacityNode = crown.a;
  return m;
}

/** The cards on one terrain tile: meshes per approach and station bin, their card count, and GPU bytes. */
export interface VegetationTile { meshes: Mesh[]; cards: number; dropped: number; bytes: number }
/**
 * Builds a tile's cards: the candidates whose roots fall on the tile, set on its surface (surfaceHeights; none
 * where no triangle covers a root or below `ground`), in instanced cross cards (two quads, eight vertices) per
 * approach and VEGETATION_CHUNK m station bin, inner cards first (roughly front to back from the road).
 */
export function vegetationTile(candidates: readonly VegetationCandidate[], bounds: Bounds, position: ArrayLike<number>, index: ArrayLike<number>, data: VegetationData, material: MeshStandardNodeMaterial, name: string): VegetationTile {
  const [x0, z0, x1, z1] = bounds, on = candidates.filter(c => c.x >= x0 && c.x < x1 && c.z >= z0 && c.z < z1);
  const y = surfaceHeights(on.map(c => c.x), on.map(c => c.z), position, index);
  const bins = new Map<string, { c: VegetationCandidate; y: number }[]>();
  let dropped = 0;
  on.forEach((c, k) => {
    const h = y[k]!;
    if (!(h >= data.ground)) { dropped++; return; }
    const key = `${c.approach}-${Math.floor(c.s / VEGETATION_CHUNK)}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key)!.push({ c, y: h });
  });
  const meshes: Mesh[] = [];
  let cards = 0, bytes = 0;
  for (const [key, list] of [...bins].sort((a, b) => a[0].localeCompare(b[0], 'en'))) {
    list.sort((a, b) => Math.abs(a.c.d) - Math.abs(b.c.d) || a.c.s - b.c.s);
    const g = new InstancedBufferGeometry(), n = list.length, root = new Float32Array(n * 4), shape = new Uint8Array(n * 4);
    // Two crossed quads: x across in the first, z across in the second; y from the foot (0) to the top (1).
    g.setAttribute('position', new BufferAttribute(new Float32Array([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0, 0, 0, -.5, 0, 0, .5, 0, 1, .5, 0, 1, -.5]), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(24).map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]), 1));
    const centre = new Vector3();
    list.forEach(({ c, y: h }, k) => {
      root.set([c.x, h, c.z, (c.kind === 'tree' ? 0 : 2) + c.variant], k * 4);
      shape.set([c.yaw, c.height, c.width, c.seed].map(q => Math.min(255, Math.round(q * 255))), k * 4);
      centre.x += c.x / n; centre.y += h / n; centre.z += c.z / n;
    });
    const top = Math.max(data.kinds.tree.height[1], data.kinds.scrub.height[1]);
    let radius = 0;
    for (let k = 0; k < n; k++) radius = Math.max(radius, Math.hypot(root[k * 4]! - centre.x, root[k * 4 + 1]! - centre.y, root[k * 4 + 2]! - centre.z));
    g.setAttribute('root', new InstancedBufferAttribute(root, 4));
    g.setAttribute('shape', new InstancedBufferAttribute(shape, 4, true));
    g.instanceCount = n;
    g.boundingSphere = new Sphere(centre, radius + top);
    const mesh = new Mesh(g, material);
    mesh.name = `vegetation-${name}-${key}`; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
    meshes.push(mesh); cards += n; bytes += n * VEGETATION_INSTANCE_BYTES;
  }
  return { meshes, cards, dropped, bytes };
}
