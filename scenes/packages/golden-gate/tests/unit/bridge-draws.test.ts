// SPDX-License-Identifier: MIT
// Draw optimisation (docs/plans/2026-10-01-draw-optimization-cycle.md S4b, OD-18; tmp/drawcalls/understand/golden-gate.md
// sections 2-3): the bridge draws a render copy of each pack model, merged by material inside its south, north and span
// groups, with shadow depth stand-ins per tower, anchorage and span on High and far-approach stand-ins in the planar
// reflection. The pack's scene graphs are never changed (a second build from the same pack starts from the authored graph;
// its shared materials carry the joint-plate offset and the lamp level), the semantic web model keeps its node names for
// route contact and the colliders, and the merge keeps the same triangles, world bounds, materials and coplanar depth ties,
// with the material-level lamp and joint-plate edits still applied.
import { describe, expect, test } from 'bun:test';
import { Box3, BoxGeometry, FrontSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material, Object3D } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BRIDGE, LAYERS } from '../../src/constants';
import { LAYOUT } from '../../src/data';
import { createBridge } from '../../src/world/bridge';
import type { BridgeOptions } from '../../src/world/bridge';
import { drawOptions } from '../../src/world/draw-options';
import { FEATURES } from '../../src/tiers';

const NAMES = ['Paint', 'Concrete', 'AnchorageConcrete', 'Asphalt', 'RoadMarkings', 'LampGlass', 'JointSteel', 'BeaconEmissive'] as const;
type Materials = Record<typeof NAMES[number], MeshStandardMaterial>;
/**
 * A bridge model in the runtime GLBs' layout (staged/g9/bridge): GoldenGateBridge holding the towers, the south fender and
 * the anchorages (translated parts) and the span parts (cables and the deck with the Roadway, joints, markings and lamps).
 * 21 meshes: south 7, north 6, span 8.
 */
function model(materials: Materials): GLTF {
  const scene = new Group(), bridge = new Group(); scene.name = 'Scene'; bridge.name = 'GoldenGateBridge'; scene.add(bridge);
  const node = (name: string, parent: Object3D, at: [number, number, number] = [0, 0, 0]) => { const g = new Group(); g.name = name; g.position.set(...at); parent.add(g); return g; };
  const mesh = (name: string, parent: Object3D, material: keyof Materials, at: [number, number, number], size: [number, number, number]) => {
    // One primitive per mesh, as in the GLBs: BoxGeometry's per-face groups would keep a part out of the merge.
    const g = new BoxGeometry(...size).translate(...at); g.clearGroups();
    const m = new Mesh(g, materials[material]); m.name = name; parent.add(m); return m;
  };
  for (const [side, z] of [['South', -640.08], ['North', 640.08]] as const) {
    const tower = node(`${side}Tower`, bridge, [0, 0, z]), leg = node(`${side}Tower_LegWest`, tower, [13.7, 0, 0]), pier = node(`${side}Tower_Pier`, tower);
    mesh(`${side}Tower_LegWest_Mesh_Shaft`, leg, 'Paint', [0, 110, 0], [3, 220, 5]); mesh(`${side}Tower_LegWest_Mesh_Cap`, leg, 'Paint', [0, 225, 0], [4, 4, 6]);
    mesh(`${side}Tower_Pier_Mesh_Pier`, pier, 'Concrete', [0, 5, 0], [40, 10, 20]); mesh(`${side}Tower_Mesh_Beacon`, tower, 'BeaconEmissive', [0, 230, 0], [1, 1, 1]);
    const anchorage = node(`${side}Anchorage`, bridge, [0, 0, side === 'South' ? -1008 : 1008]);
    mesh(`${side}Anchorage_Mesh_AnchorageHousing`, anchorage, 'AnchorageConcrete', [0, 20, 0], [40, 40, 60]); mesh(`${side}Anchorage_Mesh_HousingPilasters`, anchorage, 'AnchorageConcrete', [21, 20, 0], [2, 40, 60]);
  }
  mesh('SouthFender_Mesh_EllipticalWall', node('SouthFender', bridge, [0, 0, -640.08]), 'Concrete', [0, 3, 0], [60, 6, 40]);
  for (const side of ['West', 'East']) mesh(`MainCable${side}_Mesh_ContinuousCable`, node(`MainCable${side}`, bridge), 'Paint', [side === 'West' ? 13.7 : -13.7, 150, 0], [1, 1, 2700]);
  const deck = node('Deck', bridge);
  const road = new Mesh(new PlaneGeometry(2 * BRIDGE.roadHalfWidth + 4, 2 * BRIDGE.roadEndZ + 4).rotateX(-Math.PI / 2).translate(0, 62.55, 0), materials.Asphalt); road.name = 'Roadway'; deck.add(road);
  mesh('Deck_Mesh_ExpansionJoints', deck, 'JointSteel', [0, 62.6, 0], [20, .05, 1]);
  mesh('Deck_LaneMarkings_Mesh_Lines', node('Deck_LaneMarkings', deck), 'RoadMarkings', [0, 62.56, 0], [.1, .01, 2000]);
  const lamps = node('Deck_ArtDecoLampStandards', deck);
  mesh('Deck_ArtDecoLampStandards_Mesh_West', lamps, 'LampGlass', [12, 68, 0], [.5, .5, 2000]); mesh('Deck_ArtDecoLampStandards_Mesh_East', lamps, 'LampGlass', [-12, 68, 0], [.5, .5, 2000]);
  mesh('CurbsEast', deck, 'Concrete', [-10, 62.7, 0], [.3, .3, 2000]);
  return { scene } as unknown as GLTF;
}
function pack() {
  const materials = Object.fromEntries(NAMES.map(name => [name, new MeshStandardMaterial({ name, emissive: name === 'LampGlass' || name === 'BeaconEmissive' ? 0xffcc88 : 0, emissiveIntensity: 2 })])) as Materials;
  return { materials, web: model(materials), far: model(materials) };
}
const HIGH: BridgeOptions = { farSwitch: 5200, castShadow: true, merge: true, standInLayer: LAYERS.shadowStandIn, passLayers: { main: LAYERS.mainOnly, pass: LAYERS.reflectionOnly } };
const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
/** What a camera on layer `layer` draws under root: visible meshes on that layer, their triangles, materials and world bounds. */
function drawn(root: Object3D, layer = LAYERS.world, cast = false) {
  root.updateMatrixWorld(true);
  const out = { draws: 0, triangles: 0, materials: new Set<Material>(), bounds: new Box3(), meshes: [] as Mesh[] }, v = new Vector3();
  root.traverseVisible(node => {
    const m = node as Mesh; if (!m.isMesh || !m.layers.isEnabled(layer) || (cast && !m.castShadow)) return;
    out.draws++; out.triangles += triangles(m.geometry); out.materials.add(m.material as Material); out.meshes.push(m);
    const p = m.geometry.attributes.position!; for (let i = 0; i < p.count; i++) out.bounds.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}
/** Everything a build could change on a pack model: graph, flags, layers, transforms and shared resources. */
function snapshot(gltf: GLTF) {
  const rows: string[] = [`parent:${gltf.scene.parent?.name ?? null}`];
  gltf.scene.traverse(n => { const m = n as Mesh; rows.push([n.name, n.parent?.name, n.children.map(c => c.name).join('+'), n.visible, n.layers.mask, n.castShadow, n.receiveShadow, n.matrixAutoUpdate, n.position.toArray(), m.isMesh ? m.geometry.uuid : '', m.isMesh ? (m.material as Material).uuid : ''].join('|')); });
  return rows;
}
const near = new Vector3(300, 120, 900), distant = new Vector3(0, 100, 8000);

describe('bridge draws', () => {
  test('the merge draws south, north and span parts by material with the same triangles, bounds and materials', () => {
    const p = pack(), bridge = createBridge(p.web, p.far, { ...HIGH, standInLayer: undefined, passLayers: undefined });
    const source = drawn(bridge.web), web = drawn(bridge.views.web);
    // South: Paint (2), Concrete (pier and fender), AnchorageConcrete (2) merged, the beacon alone; north: Paint and
    // AnchorageConcrete merged, the pier and beacon alone; span: the cables and the lamps merged, four single parts.
    expect(source.draws).toBe(21); expect(web.draws).toBe(14); expect(bridge.stats.draws).toEqual({ web: 14, far: 14 });
    expect(bridge.stats.webMeshes).toBe(21); expect(bridge.stats.merged?.web).toMatchObject({ sourceMeshes: 14, mergedMeshes: 7 });
    expect(web.triangles).toBe(source.triangles); expect(web.materials).toEqual(source.materials);
    for (const k of ['min', 'max'] as const) expect(web.bounds[k].distanceTo(source.bounds[k])).toBeLessThan(1e-4);
    expect(web.meshes.filter(m => m.userData.kilnMerged).map(m => m.name).sort()).toEqual(['Merged south/AnchorageConcrete', 'Merged south/Concrete', 'Merged south/Paint', 'Merged north/AnchorageConcrete', 'Merged north/Paint', 'Merged span/LampGlass', 'Merged span/Paint'].sort());
    // Every merged mesh keeps the flags of its parts: High receives and casts (no stand-ins here).
    for (const m of web.meshes) expect([m.castShadow, m.receiveShadow, m.layers.mask]).toEqual([true, true, 1]);
    bridge.dispose();
  });

  test('the pack scene graphs are untouched after two builds, and the semantic web model keeps names for route contact and colliders', () => {
    const p = pack(), before = [snapshot(p.web), snapshot(p.far)], authored = NAMES.map(n => p.materials[n].emissiveIntensity);
    for (let i = 0; i < 2; i++) {
      const bridge = createBridge(p.web, p.far, HIGH);
      expect(bridge.web).not.toBe(p.web.scene); expect(bridge.web.parent).toBeNull();
      expect(bridge.web.getObjectByName('Roadway')).toBeDefined(); expect(bridge.web.getObjectByName('SouthTower_Pier_Mesh_Pier')?.visible).toBe(true);
      // Obstruction colliders come from the semantic model: towers, cables and lamp standards (no stand-ins or merged copies).
      expect(bridge.stats.colliders).toBe(1); expect(bridge.colliders.colliders[0]!.root).toBe(bridge.web); expect(bridge.colliders.colliders[0]!.geometry.attributes.position!.count / 3).toBe(drawn(bridge.web).meshes.filter(m => /^(SouthTower|NorthTower|MainCable|Deck_ArtDecoLampStandards)/.test(m.name)).reduce((n, m) => n + triangles(m.geometry), 0));
      bridge.setLamps(.5);
      bridge.dispose();
      expect([snapshot(p.web), snapshot(p.far)]).toEqual(before);
    }
    // Lamp levels scale the authored intensity on every build and return to it on dispose, also when a rebuild overlaps
    // the old bridge with its lamps off (the day preset).
    expect(NAMES.map(n => p.materials[n].emissiveIntensity)).toEqual(authored);
    const old = createBridge(p.web, p.far, HIGH); old.setLamps(0);
    const next = createBridge(p.web, p.far, HIGH); next.setLamps(.5); expect(p.materials.LampGlass.emissiveIntensity).toBe(1);
    old.dispose(); next.dispose();
  });

  test('lamp and joint-plate material edits apply to the merged meshes, the LOD switch toggles the views and dispose frees the merged geometry', () => {
    const p = pack(), bridge = createBridge(p.web, p.far, HIGH), lamp = p.materials.LampGlass, joint = p.materials.JointSteel;
    expect(joint.polygonOffset).toBe(true); expect(joint.polygonOffsetFactor).toBe(LAYOUT.bridge.jointPlates.polygonOffset.factor);
    const lamps = drawn(bridge.views.web).meshes.filter(m => m.material === lamp);
    expect(lamps.map(m => m.name)).toEqual(['Merged span/LampGlass']);
    bridge.setLamps(0); expect(lamp.emissiveIntensity).toBe(0); bridge.setLamps(.5); expect(lamp.emissiveIntensity).toBe(1); expect(p.materials.BeaconEmissive.emissiveIntensity).toBe(1);
    bridge.update(near); expect([bridge.usingFar, bridge.views.web.visible, bridge.views.far.visible]).toEqual([false, true, false]);
    bridge.update(distant); expect([bridge.usingFar, bridge.views.web.visible, bridge.views.far.visible]).toEqual([true, false, true]);
    expect(drawn(bridge.root).meshes.every(m => bridge.views.far.getObjectById(m.id) || bridge.approachMeshes.far.group.getObjectById(m.id))).toBe(true);
    const merged = [bridge.views.web, bridge.views.far].flatMap(v => drawn(v).meshes).filter(m => m.userData.kilnMerged);
    bridge.update(near); expect(bridge.views.web.visible).toBe(true);
    let freed = 0; for (const m of merged) m.geometry.addEventListener('dispose', () => freed++);
    bridge.dispose();
    expect(freed).toBe(merged.length); expect(bridge.root.parent).toBeNull();
    // Shared pack geometry is never disposed by the bridge.
    let shared = 0; p.web.scene.traverse(n => { const m = n as Mesh; if (m.isMesh) m.geometry.addEventListener('dispose', () => shared++); });
    createBridge(p.web, p.far, HIGH).dispose(); expect(shared).toBe(0);
  });

  test('the merge puts the curbs before the walks in their shared Concrete mesh, so the walks keep winning their coplanar depth ties', () => {
    // GoldenGateBridge's CurbsEast/West share Concrete with Deck_Mesh_EastWalk/WestWalk and their road-facing faces are coplanar
    // (x = +/-9.449). Unmerged, three drew the curbs first and the walks won the LessEqual ties; inside one merged draw later
    // triangles win, so the curbs' triangles must come first, whatever the scene order (wave-B review R1: a kerb stipple).
    const p = pack();
    for (const gltf of [p.web, p.far]) {
      const deck = gltf.scene.getObjectByName('Deck')!, curb = deck.getObjectByName('CurbsEast')!;
      const part = (name: string, x: number, size: [number, number, number]) => { const g = new BoxGeometry(...size).translate(x, 62.65, 0); g.clearGroups(); return Object.assign(new Mesh(g, p.materials.Concrete), { name }); };
      // As in the runtime GLB, the walks come before the curbs.
      deck.add(part('Deck_Mesh_EastWalk', -11.5, [2, .2, 2000]), part('Deck_Mesh_WestWalk', 11.5, [2, .2, 2000])); deck.remove(curb); deck.add(curb, part('CurbsWest', 10, [.3, .3, 2000]));
    }
    const bridge = createBridge(p.web, p.far, HIGH);
    for (const view of [bridge.views.web, bridge.views.far]) {
      const concrete = view.getObjectByName('Merged span/Concrete') as Mesh, g = concrete.geometry, x = g.attributes.position!, index = g.index!, kinds: string[] = [];
      for (let i = 0; i < index.count; i += 3) kinds.push(Math.abs(x.getX(index.getX(i)) + x.getX(index.getX(i + 1)) + x.getX(index.getX(i + 2))) / 3 < 10.3 ? 'curb' : 'walk');
      expect(kinds.filter(k => k === 'curb').length).toBe(24); expect(kinds.filter(k => k === 'walk').length).toBe(24);
      expect(kinds.lastIndexOf('curb')).toBeLessThan(kinds.indexOf('walk'));
    }
    // The order costs no draw: one Concrete mesh in the span, as without it.
    expect(bridge.stats.draws).toEqual({ web: 14, far: 14 });
    bridge.dispose();
  });

  test('the span\'s merged paint draws after the other opaque draws, as the deck\'s lower painted parts did when far out', () => {
    // The underdeck's top lies 0.45 m below the roadway; from 2 km the depth buffer cannot separate them, and unmerged three
    // drew the lower underdeck after the roadway (its centre is farther), so the paint won the ties. Merged, the span's paint
    // centre rises to the cables and would draw first (wave-B review R2 residual: arrival 256 px over 32 levels on WebGL2).
    const p = pack(), bridge = createBridge(p.web, p.far, HIGH), merged = [bridge.views.web, bridge.views.far].flatMap(v => { const out: Mesh[] = []; v.traverse(n => { if (n.userData.kilnMerged) out.push(n as Mesh); }); return out; });
    expect(merged.filter(m => m.renderOrder !== 0).map(m => [m.name, m.renderOrder])).toEqual([['Merged span/Paint', 1], ['Merged span/Paint', 1]]);
    bridge.dispose();
    const off = createBridge(p.web, p.far, { ...HIGH, merge: false }); let ordered = 0; off.root.traverse(n => { if ((n as Mesh).renderOrder) ordered++; }); expect(ordered).toBe(0); off.dispose();
  });

  test('bridgeMerge off draws every part as authored', () => {
    const p = pack(), bridge = createBridge(p.web, p.far, { ...HIGH, merge: false, standInLayer: undefined, passLayers: undefined });
    expect(drawn(bridge.views.web).draws).toBe(21); expect(bridge.stats.draws).toEqual({ web: 21, far: 21 }); expect(bridge.stats.merged).toBeNull();
    bridge.dispose();
  });

  test('shadow stand-ins: one front-sided depth proxy per tower, anchorage, fender group and span plus one for the near approaches, on the stand-in layer only', () => {
    const p = pack(), bridge = createBridge(p.web, p.far, HIGH), plain = createBridge(pack().web, pack().far, { ...HIGH, standInLayer: undefined, merge: false, passLayers: undefined });
    const casters = drawn(plain.root, LAYERS.world, true), proxies = drawn(bridge.root, LAYERS.shadowStandIn, true);
    expect(proxies.meshes.map(m => m.name).sort()).toEqual(['Shadow stand-in NorthAnchorage', 'Shadow stand-in NorthTower', 'Shadow stand-in SouthAnchorage', 'Shadow stand-in SouthTower', 'Shadow stand-in approaches-near', 'Shadow stand-in south', 'Shadow stand-in span'].sort());
    expect(bridge.stats.shadowProxies).toMatchObject({ proxies: 7, sourceMeshes: casters.draws });
    // The same depth: every caster's triangles and world bounds, now in 7 draws.
    expect(proxies.triangles).toBe(casters.triangles);
    for (const k of ['min', 'max'] as const) expect(proxies.bounds[k].distanceTo(casters.bounds[k])).toBeLessThan(1e-4);
    for (const m of proxies.meshes) { expect(m.layers.mask).toBe(1 << LAYERS.shadowStandIn); expect((m.material as Material).side).toBe(FrontSide); }
    // Visible sources and the merged meshes no longer cast; they still receive.
    expect(drawn(bridge.root, LAYERS.world, true).draws).toBe(0); expect(drawn(bridge.root, LAYERS.mainOnly, true).draws).toBe(0);
    expect(drawn(bridge.views.web).meshes.every(m => m.receiveShadow && !m.castShadow)).toBe(true);
    // Merge after stand-ins: the main pass still draws 14, and no proxy was merged.
    expect(drawn(bridge.views.web).draws).toBe(14);
    bridge.dispose(); plain.dispose();
  });

  test('reflection stand-ins: the near approaches draw only for main cameras, a far-approach clone only in the reflection, switching with the near representation', () => {
    const p = pack(), bridge = createBridge(p.web, p.far, HIGH), { near: n, far: f } = bridge.approachMeshes;
    const main = drawn(n.group, LAYERS.mainOnly), reflected = drawn(n.group, LAYERS.reflectionOnly);
    expect(drawn(n.group, LAYERS.world).draws).toBe(0); expect(main.draws).toBe(n.draws);
    expect(reflected.draws).toBe(f.draws); expect(bridge.stats.reflectionProxies).toBe(f.draws);
    const farGeometries = new Set<BufferGeometry>(); f.group.traverse(o => { if ((o as Mesh).isMesh) farGeometries.add((o as Mesh).geometry); });
    for (const m of reflected.meshes) { expect(farGeometries.has(m.geometry)).toBe(true); expect([m.castShadow, m.layers.mask]).toEqual([false, 1 << LAYERS.reflectionOnly]); }
    // Vegetation joins the near group after the bridge is built and stays reflected (layer 0).
    const vegetation = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); n.group.add(vegetation); expect(vegetation.layers.mask).toBe(1);
    bridge.update(distant); expect(drawn(bridge.root, LAYERS.reflectionOnly).draws).toBe(0); expect(drawn(f.group).draws).toBe(f.draws);
    bridge.dispose(); expect(drawn(n.group, LAYERS.reflectionOnly).draws).toBe(0);
  });
});

describe('draw options', () => {
  test('High takes every look-neutral option and no cached shadow; Low and Medium only the merge; overrides switch each off', () => {
    expect(drawOptions(FEATURES.high, {})).toEqual({ merge: true, once: true, depth: true, reflection: true, cache: false });
    for (const level of ['medium', 'low'] as const) expect(drawOptions(FEATURES[level], {})).toEqual({ merge: true, once: false, depth: false, reflection: false, cache: false });
    expect(drawOptions(FEATURES.high, { merge: false, once: false, depth: false, reflection: false })).toEqual({ merge: false, once: false, depth: false, reflection: false, cache: false });
    // The cached sun shadow replaces the once-per-frame render (its maps render once per frame by construction).
    expect(drawOptions(FEATURES.high, { cache: true })).toMatchObject({ once: false, cache: true });
    expect(drawOptions(FEATURES.low, { cache: true, once: true, depth: true, reflection: true })).toEqual({ merge: true, once: false, depth: false, reflection: false, cache: false });
  });
});
