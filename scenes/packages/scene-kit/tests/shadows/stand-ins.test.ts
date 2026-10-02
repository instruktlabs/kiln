import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  BackSide, BatchedMesh, Box3, BoxGeometry, BufferAttribute, BufferGeometry, ClippingGroup, DoubleSide, FrontSide, Group, InstancedBufferGeometry, InstancedMesh, InterleavedBuffer,
  InterleavedBufferAttribute, LOD, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, MeshStandardNodeMaterial, Raycaster, Scene, SkinnedMesh, Texture, Vector3,
} from 'three/webgpu';
import type { Material, Object3D } from 'three/webgpu';
import { float, positionLocal, vec4 } from 'three/tsl';
import { shadowStandIns } from '../../src/shadows/stand-ins';
import { suppressedCasters } from '../../src/shadows/layers';
import { createFrameGraph, freezeTransforms } from '../../src/instancing/core';
import type { InstanceOwner } from '../../src/instancing/core';

const LAYER = 29, isAnchor = (n: Object3D) => /^Joint_/.test(n.name);
const box = (x = 1, y = 1, z = 1) => { const g = new BoxGeometry(x, y, z); g.clearGroups(); return g; };
const node = (name: string, parent: Object3D | null, x = 0, y = 0, z = 0) => { const g = new Group(); g.name = name; g.position.set(x, y, z); parent?.add(g); return g; };
const mesh = (name: string, material: Material | Material[], parent: Object3D, x = 0, y = 0, z = 0, geometry: BufferGeometry = box()) => {
  const m = new Mesh(geometry, material); m.name = name; m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
};
const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
const sum = (meshes: Mesh[]) => meshes.reduce((n, m) => n + tris(m.geometry), 0);
const worldBox = (meshes: Mesh[]) => {
  const b = new Box3(), v = new Vector3();
  for (const m of meshes) { const p = m.geometry.attributes.position!; for (let i = 0; i < p.count; i++) b.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); }
  return b;
};
const closeBox = (a: Box3, b: Box3) => { expect(a.min.distanceTo(b.min)).toBeLessThan(1e-5); expect(a.max.distanceTo(b.max)).toBeLessThan(1e-5); };
/** World-space triangles in draw order, each as the geometric normal of its winding. */
const normals = (m: Mesh) => {
  const g = m.geometry, p = g.attributes.position!, out: Vector3[] = [], a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < tris(g) * 3; i += 3) {
    const at = (k: number) => g.index ? g.index.getX(k) : k;
    a.fromBufferAttribute(p, at(i)).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(p, at(i + 1)).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(p, at(i + 2)).applyMatrix4(m.matrixWorld);
    out.push(b.clone().sub(a).cross(c.clone().sub(a)).normalize());
  }
  return out;
};
/** A ray that hits the mesh's first triangle on its front face from one metre out, whatever layers the mesh is on. */
const aimed = (m: Mesh) => {
  const g = m.geometry, p = g.attributes.position!, at = (k: number) => new Vector3().fromBufferAttribute(p, g.index ? g.index.getX(k) : k).applyMatrix4(m.matrixWorld);
  const centre = at(0).add(at(1)).add(at(2)).divideScalar(3), n = normals(m)[0]!, ray = new Raycaster(centre.clone().addScaledVector(n, 1), n.clone().negate()); ray.layers.enableAll(); return ray;
};

/** A farmhouse-like placement: a rotated root, a scaled shell, single- and double-sided parts, glass, a door anchor and a non-caster. */
function farmhouse() {
  const stone = new MeshStandardMaterial({ name: 'Stone' }), wood = new MeshStandardMaterial({ name: 'Wood', side: DoubleSide });
  const glass = new MeshStandardMaterial({ name: 'Glass', transparent: true, opacity: .4, side: DoubleSide });
  const root = node('House', null, 10, 0, -4); root.rotation.y = .5;
  const shell = node('Shell', root, 1, 0, 0); shell.rotation.z = .2; shell.scale.set(1, 2, 1);
  const front = [mesh('WallA', stone, shell), mesh('WallB', stone, shell, 2), mesh('Roof', stone, root, 0, 3)];
  const double = [mesh('Fence', wood, root, 0, 0, 5), mesh('Window', glass, shell, 0, 0, 1)];
  const door = node('Joint_FrontDoor', root, 3); door.rotation.y = .3;
  const leaf = [mesh('Leaf', stone, door, .5, 1), mesh('Hinge', stone, node('Hardware', door, 0, .5), 0, 0, 0, box(.1, .2, .1))];
  const rug = mesh('Rug', stone, root, 0, -.1); rug.castShadow = false;
  root.updateMatrixWorld(true);
  return { root, shell, door, front, double, leaf, rug, eligible: [...front, ...double, ...leaf], materials: { stone, wood, glass } };
}

test('one proxy per anchor and effective shadow side, sharing one material per side; sources stop casting', () => {
  const h = farmhouse(), r = shadowStandIns(h.root, { layer: LAYER, isAnchor });
  expect(r.stats).toEqual({ groups: 3, sourceMeshes: 7, proxies: 3, triangles: 7 * 12, dropped: 0, skipped: { noCast: 1 } });
  expect(r.sources.map(s => s.name).sort()).toEqual(h.eligible.map(m => m.name).sort());
  const of = (anchor: Object3D, side: number) => r.proxies.filter(p => p.parent === anchor && (p.material as Material).shadowSide === side);
  expect(of(h.root, BackSide).length).toBe(1); expect(of(h.root, DoubleSide).length).toBe(1); expect(of(h.door, BackSide).length).toBe(1);
  expect(sum(of(h.root, BackSide))).toBe(sum(h.front)); expect(sum(of(h.root, DoubleSide))).toBe(sum(h.double)); expect(sum(of(h.door, BackSide))).toBe(sum(h.leaf));
  const back = of(h.root, BackSide)[0]!.material as Material;
  expect(of(h.door, BackSide)[0]!.material).toBe(back);
  expect([back.side, back.shadowSide, back.colorWrite, back.depthWrite, back.transparent]).toEqual([FrontSide, BackSide, false, false, false]);
  expect([(of(h.root, DoubleSide)[0]!.material as Material).side, (of(h.root, DoubleSide)[0]!.material as Material).transparent]).toEqual([DoubleSide, false]);
  for (const p of r.proxies) {
    expect(p.layers.mask).toBe(1 << LAYER); expect([p.castShadow, p.receiveShadow]).toEqual([true, false]); expect(p.userData.kilnShadowStandIn).toBe(true);
    expect(p.matrix.equals(new Matrix4())).toBe(true); expect(p.matrixAutoUpdate).toBe(false); expect(p.matrixWorld.equals(p.parent!.matrixWorld)).toBe(true);
    expect(Object.keys(p.geometry.attributes)).toEqual(['position']); expect((p.material as Material & { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true);
    const ray = aimed(p), control = new Mesh(p.geometry, new MeshStandardMaterial()); control.matrixWorld.copy(p.matrixWorld);
    expect(ray.intersectObject(control).length).toBeGreaterThan(0); expect(ray.intersectObject(p)).toEqual([]);
  }
  for (const m of h.eligible) { expect(m.castShadow).toBe(false); expect(suppressedCasters.has(m)).toBe(true); expect(m.visible).toBe(true); expect(m.layers.mask).toBe(1); }
  expect(h.rug.castShadow).toBe(false); expect(suppressedCasters.has(h.rug)).toBe(false);
  r.restore();
});

test('an explicit shadowSide groups with the side three derives: Front with shadowSide Front joins Back', () => {
  const root = node('R', null), a = mesh('A', new MeshStandardMaterial({ side: BackSide }), root), b = mesh('B', new MeshStandardMaterial({ shadowSide: FrontSide }), root, 2);
  const c = mesh('C', new MeshStandardMaterial(), root, 4);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor });
  expect(r.stats.proxies).toBe(2);
  const front = r.proxies.find(p => (p.material as Material).shadowSide === FrontSide)!, back = r.proxies.find(p => (p.material as Material).shadowSide === BackSide)!;
  expect(sum([front])).toBe(sum([a, b])); expect(sum([back])).toBe(sum([c])); expect((front.material as Material).side).toBe(BackSide);
});

test('world-space depth silhouette: proxy bounds and triangle totals equal the eligible sources', () => {
  const h = farmhouse(), b0 = worldBox(h.eligible), t0 = sum(h.eligible), r = shadowStandIns(h.root, { layer: LAYER, isAnchor });
  h.root.updateMatrixWorld(true);
  expect(r.stats.triangles).toBe(t0); expect(sum(r.proxies)).toBe(t0); closeBox(worldBox(r.proxies), b0);
  for (const anchor of [h.root, h.door]) {
    const own = r.proxies.filter(p => p.parent === anchor), src = r.sources.filter(s => { let n = s.parent!; while (n !== h.root && !isAnchor(n)) n = n.parent!; return n === anchor; });
    closeBox(worldBox(own), worldBox(src));
  }
  r.restore();
});

test('proxies follow anchor motion through world updates', () => {
  const h = farmhouse(), r = shadowStandIns(h.root, { layer: LAYER, isAnchor }), door = r.proxies.find(p => p.parent === h.door)!;
  h.door.rotation.y = 1.4; h.root.position.x = -6; h.root.updateWorldMatrix(true, true);  // as the Farm's door.apply does
  expect(door.matrixWorld.equals(h.door.matrixWorld)).toBe(true); closeBox(worldBox([door]), worldBox(h.leaf));
  h.door.visible = false; expect(door.parent!.visible).toBe(false);
  r.restore();
  // An anchor hidden at build time (Joint_Pitchfork, the play-only farmer) still gets its proxy, which inherits the anchor's visibility.
  const again = shadowStandIns(h.root, { layer: LAYER, isAnchor });
  expect(again.proxies.filter(p => p.parent === h.door).length).toBe(1); expect(again.stats.skipped).toEqual({ noCast: 1 }); again.restore();
});

test('a mirrored part has its winding reversed so its depth faces match the source', () => {
  const root = node('R', null), mirror = node('Mirror', root, 2); mirror.scale.set(-1, 1, 1);
  const tri = new BufferGeometry(); tri.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  const plain = mesh('Plain', new MeshStandardMaterial(), root, 0, 0, 0, tri), flipped = mesh('Flipped', new MeshStandardMaterial(), mirror, 0, 0, 0, tri);
  root.updateMatrixWorld(true);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor }), p = r.proxies[0]!;
  expect(normals(plain)[0]!.z).toBeCloseTo(1); expect(normals(flipped)[0]!.z).toBeCloseTo(-1);  // three draws the mirrored source front face towards +z (frontFaceCW)
  expect(normals(p).map(n => Math.round(n.z))).toEqual([1, 1]);
});

test('dequantised, interleaved and non-indexed positions bake to the source world positions', () => {
  const root = node('R', null, 1, 2, 3), q = new BufferGeometry(), i = new BufferGeometry();
  q.setAttribute('position', new BufferAttribute(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0, 0, 0, -32767, 16384, 0, 0, 0, 0, 32767]), 3, true));
  const buffer = new InterleavedBuffer(new Float32Array([0, 0, 0, 9, 1, 0, 0, 9, 0, 1, 0, 9]), 4); i.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0)); i.setIndex([0, 1, 2]);
  const quantised = mesh('Quantised', new MeshStandardMaterial(), root, 0, 0, 0, q); quantised.scale.setScalar(4);
  const interleaved = mesh('Interleaved', new MeshStandardMaterial(), root, 3, 0, 0, i); root.updateMatrixWorld(true);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor }), p = r.proxies[0]!, pos = p.geometry.attributes.position!, v = new Vector3(), w = new Vector3();
  expect(pos.array).toBeInstanceOf(Float32Array); expect(pos.count).toBe(9);
  let k = 0;
  for (const m of [quantised, interleaved]) for (let j = 0; j < m.geometry.attributes.position!.count; j++, k++) {
    v.fromBufferAttribute(pos, k).applyMatrix4(p.matrixWorld); w.fromBufferAttribute(m.geometry.attributes.position!, j).applyMatrix4(m.matrixWorld);
    expect(v.distanceTo(w)).toBeLessThan(1e-5);
  }
  expect(Array.from(p.geometry.index!.array)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('spatial chunks split a group by the world-bounds centre cell, then by the triangle cap', () => {
  const root = node('Bridge', null), paint = new MeshStandardMaterial(), parts = [0, 10, 40, 120, 130, 260].map((x, k) => mesh(`P${k}`, paint, root, x, k === 5 ? -500 : 0, 0));
  const big = mesh('Big', paint, root, 270, 0, 0, new BoxGeometry(1, 1, 1, 4, 4, 4)); big.geometry.clearGroups(); root.updateMatrixWorld(true);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor, chunk: { cell: 100, maxTriangles: 24 } });
  // Cells 0 (P0, P1, P2: 36 triangles, capped into 24 + 12), 1 (P3, P4) and 2 (P5 at any height, then Big alone: one part over the cap).
  expect(r.stats.groups).toBe(3); expect(r.proxies.map(p => tris(p.geometry))).toEqual([24, 12, 24, 12, tris(big.geometry)]);
  expect(r.stats.proxies).toBe(5); expect(r.stats.triangles).toBe(sum([...parts, big]));
  const unchunked = (r.restore(), shadowStandIns(root, { layer: LAYER, isAnchor, chunk: { cell: 1000 } }));
  expect(unchunked.stats.proxies).toBe(1); unchunked.restore();
});

test('more than 65,535 proxy vertices take a Uint32 index; smaller proxies keep Uint16', () => {
  const soup = () => { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(39999 * 3).map((_, k) => k % 7), 3)); return g; };
  const root = node('R', null), a = mesh('A', new MeshStandardMaterial(), root, 0, 0, 0, soup()); mesh('B', a.material as Material, root, 1, 0, 0, soup());
  const door = node('Joint_Small', root); mesh('C', a.material as Material, door);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor });
  expect(r.proxies.find(p => p.parent === root)!.geometry.index!.array).toBeInstanceOf(Uint32Array);
  expect(r.proxies.find(p => p.parent === door)!.geometry.index!.array).toBeInstanceOf(Uint16Array);
});

test('every exclusion is counted by reason and left casting as it was', () => {
  const root = node('R', null), basic = () => new MeshStandardNodeMaterial(), with_ = (k: string, v: unknown) => Object.assign(new MeshStandardNodeMaterial(), { [k]: v });
  const cases: Record<string, Object3D[]> = {};
  const add = (reason: string, o: Object3D) => { (cases[reason] ??= []).push(o); if (!o.parent) root.add(o); return o; };
  add('hidden', Object.assign(mesh('Hidden', basic(), root), { visible: false })); const shut = node('Shutters', root); shut.visible = false; add('hidden', mesh('Veiled', basic(), shut));
  add('noCast', Object.assign(mesh('NoCast', basic(), root), { castShadow: false }));
  add('include', mesh('Excluded', basic(), root));
  add('multiMaterial', mesh('Multi', [basic(), basic()], root));
  const inst = new InstancedMesh(box(), basic(), 2); inst.castShadow = true; add('instanced', inst);
  add('instanced', mesh('InstGeo', basic(), root, 0, 0, 0, Object.assign(new InstancedBufferGeometry(), { attributes: box().attributes, index: box().index })));
  const batched = new BatchedMesh(1, 24, 36, basic()); batched.castShadow = true; add('batched', batched);
  const skin = new SkinnedMesh(box(), basic()); skin.castShadow = true; add('skinned', skin);
  const morph = box(); morph.morphAttributes.position = [new BufferAttribute(new Float32Array(72), 3)]; add('morphed', mesh('Morph', basic(), root, 0, 0, 0, morph));
  const ranged = box(); ranged.setDrawRange(0, 12); add('drawRange', mesh('Ranged', basic(), root, 0, 0, 0, ranged));
  add('hook', Object.assign(mesh('Hooked', basic(), root), { onBeforeShadow() {} }));
  add('materialHidden', mesh('Invisible', Object.assign(basic(), { visible: false }), root));
  add('allowOverride', mesh('OwnShadow', Object.assign(basic(), { allowOverride: false }), root));
  add('alphaTest', mesh('Cutout', Object.assign(basic(), { alphaTest: .5 }), root));
  add('alphaMap', mesh('AlphaMap', with_('alphaMap', new Texture()), root));
  add('alphaHash', mesh('AlphaHash', with_('alphaHash', true), root));
  add('transmission', mesh('Clear', new MeshPhysicalMaterial({ transmission: 1 }), root));
  add('displacementMap', mesh('Displaced', with_('displacementMap', new Texture()), root));
  for (const k of ['positionNode', 'castShadowPositionNode', 'maskNode', 'maskShadowNode', 'castShadowNode', 'transmissionNode', 'backdropNode', 'depthNode'])
    add(k, mesh(k, with_(k, k === 'castShadowNode' || k === 'backdropNode' ? vec4(1) : k.startsWith('position') || k.startsWith('castShadowP') ? positionLocal : float(1)), root));
  const lod = new LOD(); lod.addLevel(Object.assign(new Mesh(box(), basic()), { castShadow: true, name: 'Level' }), 0); add('lod', lod);
  const clip = new ClippingGroup(); clip.add(Object.assign(new Mesh(box(), basic()), { castShadow: true })); add('clipping', clip);
  add('standIn', Object.assign(mesh('Proxy', basic(), root), { userData: { kilnShadowStandIn: true } }));
  const kept = mesh('Kept', basic(), root), lodded = new LOD(), level = node('Joint_Level', null), inLevel = mesh('InLevel', basic(), level);
  lodded.addLevel(level, 0); root.add(lodded);  // a LOD above an anchor is fine: the proxy lives inside the level
  const casting = new Map<Mesh, boolean>(); root.traverse(o => { if ((o as Mesh).isMesh) casting.set(o as Mesh, (o as Mesh).castShadow); });
  const r = shadowStandIns(root, { layer: LAYER, isAnchor, include: m => m.name !== 'Excluded' });
  const expected = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v.length]));
  expect(r.stats.skipped).toEqual(expected);
  expect(r.sources).toEqual([kept, inLevel]); expect(r.stats.proxies).toBe(2); expect(r.proxies[1]!.parent).toBe(level);
  for (const [m, was] of casting) if (m !== kept && m !== inLevel) { expect(m.castShadow).toBe(was); expect(suppressedCasters.has(m)).toBe(false); }
  r.restore();
});

test('plain transparent glass is included as opaque depth; three r186 draws it so in the shadow pass', () => {
  // The shadow material blends nothing and writes depth, and a transparent source only adds a second (back) draw when double-sided.
  const src = readFileSync(Bun.resolveSync('three/webgpu', import.meta.dir), 'utf8');
  expect(src).toContain("material.name = 'ShadowMaterial';\n\t\tmaterial.blending = NoBlending;");
  expect(src).toContain('overrideMaterial.side = ( material.shadowSide !== null ) ? material.shadowSide : _shadowSide[ material.side ];');
  expect(src).toContain('overrideMaterial.alphaTest = material.alphaTest;');
  expect(src).toContain('if ( object.castShadow === true || ( object.receiveShadow && shadowType === VSMShadowMap ) ) {');
  const h = farmhouse(), r = shadowStandIns(h.root, { layer: LAYER, isAnchor }), pane = h.double[1]!;
  expect(r.sources).toContain(pane); expect(pane.castShadow).toBe(false);
  expect((r.proxies.find(p => (p.material as Material).shadowSide === DoubleSide)!.material as Material).transparent).toBe(false);
});

test('parts under the texel threshold are measured per part, dropped from the geometry and stop casting', () => {
  const h = farmhouse(), bolt = mesh('Bolt', h.materials.stone, h.door, 0, 0, 0, box(.02, .02, .02)), scaled = node('Scaled', h.door); scaled.scale.setScalar(10);
  const big = mesh('BigBolt', h.materials.stone, scaled, 0, 0, 0, box(.02, .02, .02)), lone = node('Joint_Lone', h.root), only = mesh('OnlyTiny', h.materials.stone, lone, 0, 0, 0, box(.01, .01, .01));
  // No world update here: the build brings world matrices current before it measures, so BigBolt's parent scale counts.
  const r = shadowStandIns(h.root, { layer: LAYER, isAnchor, texel: .05, minCasterTexels: 2 });  // diameter under 0.1 m drops; the hinge is 0.24 m
  expect(r.dropped.map(m => m.name).sort()).toEqual([bolt.name, only.name].sort()); expect(r.stats.dropped).toBe(2);
  expect(r.sources).toContain(big); expect(r.sources).not.toContain(bolt);
  expect(r.proxies.some(p => p.parent === lone)).toBe(false); expect(r.stats.groups).toBe(3);
  expect(r.stats.triangles).toBe(sum([...h.eligible, big]));
  for (const m of [bolt, only]) { expect(m.castShadow).toBe(false); expect(suppressedCasters.has(m)).toBe(true); }
  r.restore();
  for (const m of [bolt, only, big]) { expect(m.castShadow).toBe(true); expect(suppressedCasters.has(m)).toBe(false); }
  const off = shadowStandIns(h.root, { layer: LAYER, isAnchor, texel: .05 }); expect(off.stats.dropped).toBe(0); off.restore();
});

test('frozen owners stay immutable in the frame graph whether stand-ins come before or after freezing; dynamic owners carry their proxies', () => {
  for (const order of ['before', 'after'] as const) {
    const scene = new Scene(), world = node('World', scene), fixed = node('Fixed', world, 5, 0, 2), cart = node('Cart', world, -3), stone = new MeshStandardMaterial();
    mesh('PostA', stone, fixed); mesh('PostB', stone, fixed, 1); mesh('Bed', stone, cart); mesh('Wheel', stone, cart, 1);
    const owners: InstanceOwner[] = [{ id: 'fixed', object: fixed, dynamic: false, assetId: 'post' }, { id: 'cart', object: cart, dynamic: true, assetId: 'cart' }];
    const isFixed = (o: InstanceOwner) => o.id === 'fixed', owner = (n: Object3D) => n === fixed || n === cart;
    let r: ReturnType<typeof shadowStandIns>, frozen: ReturnType<typeof freezeTransforms>;
    if (order === 'before') { r = shadowStandIns(world, { layer: LAYER, isAnchor: owner }); frozen = freezeTransforms(owners, isFixed); }
    else { frozen = freezeTransforms(owners, isFixed); r = shadowStandIns(world, { layer: LAYER, isAnchor: owner }); }
    const graph = createFrameGraph({ scene, worldRoot: world, owners, batches: null, isFixed, validateStatic: true });
    expect(graph.stats.dynamicRoots).toBe(1);
    const still = r.proxies.find(p => p.parent === fixed)!, moving = r.proxies.find(p => p.parent === cart)!;
    expect([still.matrixAutoUpdate, still.matrixWorldAutoUpdate]).toEqual([false, false]);
    expect(still.matrixWorld.equals(fixed.matrixWorld)).toBe(true); expect(still.matrixWorld.elements[12]).toBe(5);
    cart.position.x = 7; graph.update();
    expect(moving.matrixWorld.equals(cart.matrixWorld)).toBe(true); expect(moving.matrixWorld.elements[12]).toBe(7);
    graph.restore(); frozen.restore(); r.restore();
  }
});

test('restore removes proxies, disposes their geometry and materials, and brings casting back; it runs once', () => {
  const h = farmhouse(), r = shadowStandIns(h.root, { layer: LAYER, isAnchor }), disposed: string[] = [];
  for (const p of r.proxies) p.geometry.addEventListener('dispose', () => disposed.push('geometry'));
  for (const m of new Set(r.proxies.map(p => p.material as Material))) m.addEventListener('dispose', () => disposed.push('material'));
  const parents = r.proxies.map(p => p.parent);
  r.restore(); r.restore();
  expect(parents.every(p => p !== null)).toBe(true); for (const p of r.proxies) expect(p.parent).toBeNull();
  expect(disposed.filter(d => d === 'geometry').length).toBe(3); expect(disposed.filter(d => d === 'material').length).toBe(2);
  for (const m of h.eligible) { expect(m.castShadow).toBe(true); expect(suppressedCasters.has(m)).toBe(false); }
  expect(h.rug.castShadow).toBe(false);
  let n = 0; h.root.traverse(o => { if (o.userData.kilnShadowStandIn) n++; }); expect(n).toBe(0);
});

test('stand-ins never take layer 0 or an out-of-range layer', () => {
  const h = farmhouse();
  for (const layer of [0, 32, 1.5]) expect(() => shadowStandIns(h.root, { layer, isAnchor })).toThrow();
  for (const m of h.eligible) expect(m.castShadow).toBe(true);
});

test('RK-4 sources the shadow camera cannot see are skipped as layer (default: layer 0 only); the camera must see the stand-in layer', () => {
  const root = new Group(), stone = new MeshStandardMaterial(), a = mesh('onLayer0', stone, root), b = mesh('onLayer5', stone, root, 3), c = mesh('onLayer2', stone, root, 6);
  b.layers.set(5); c.layers.set(2); root.updateMatrixWorld(true);
  const r = shadowStandIns(root, { layer: LAYER, isAnchor });
  expect(r.sources).toEqual([a]); expect(r.stats.skipped).toEqual({ layer: 2 }); expect([b.castShadow, c.castShadow, suppressedCasters.has(b)]).toEqual([true, true, false]);
  r.restore();
  const seen = shadowStandIns(root, { layer: LAYER, isAnchor, shadowMask: 1 | 1 << 2 | 1 << LAYER });
  expect(seen.sources).toEqual([a, c]); expect(seen.stats.skipped).toEqual({ layer: 1 }); seen.restore();
  expect(() => shadowStandIns(root, { layer: LAYER, isAnchor, shadowMask: 1 | 1 << 2 })).toThrow('stand-in layer');
});
