import { expect, test } from 'bun:test';
import { BoxGeometry, Group, InstancedMesh, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Raycaster, Vector3 } from 'three/webgpu';
import type { Material, Object3D } from 'three/webgpu';
import { mainOnly, passCameraLayers, passStandIn } from '../../src/shadows/pass';

const MAIN = 27, PASS = 28, L = { main: MAIN, pass: PASS };
const node = (name: string, parent: Object3D | null, x = 0) => { const g = new Group(); g.name = name; g.position.x = x; parent?.add(g); return g; };
/** Golden Gate-like approaches: a near set that should stay out of the reflection and a far set that stands in for it. */
function approaches() {
  const concrete = new MeshStandardMaterial({ name: 'Concrete' }), paint = new MeshStandardMaterial({ name: 'Paint' });
  const world = node('World', null), near = node('approaches-near', world), far = node('approaches-far', world, 2);
  const deck = new Mesh(new BoxGeometry(), concrete); deck.name = 'Deck'; deck.castShadow = deck.receiveShadow = true; deck.layers.enable(2); near.add(deck);
  const rail = new Mesh(new BoxGeometry(), [concrete, paint]); rail.name = 'Rail'; near.add(rail);
  const lamps = new InstancedMesh(new BoxGeometry(), paint, 3); lamps.name = 'Lamps'; near.add(lamps);
  const wire = new LineSegments(new BoxGeometry(), concrete); wire.name = 'Wire'; near.add(wire);
  const shadowOnly = new Mesh(new BoxGeometry(), concrete); shadowOnly.layers.set(29); shadowOnly.userData.kilnShadowStandIn = true; near.add(shadowOnly);
  const farDeck = new Mesh(new BoxGeometry(), concrete); farDeck.name = 'FarDeck'; farDeck.castShadow = true; farDeck.position.y = 1; far.add(node('Span', far)); far.children[0]!.add(farDeck);
  const farLamps = new InstancedMesh(new BoxGeometry(), paint, 2); farLamps.name = 'FarLamps'; far.add(farLamps);
  world.updateMatrixWorld(true);
  return { world, near, far, deck, rail, lamps, wire, shadowOnly, farDeck, farLamps };
}

test('mainOnly moves every drawable on layer 0 to the main-only layer and keeps other bits; restore puts back only what it moved', () => {
  const a = approaches(), groups = [a.world.layers.mask, a.near.layers.mask], r = mainOnly([a.near], MAIN);
  expect(r.stats).toEqual({ objects: 4 });
  expect(a.deck.layers.mask).toBe(1 << MAIN | 1 << 2); for (const o of [a.rail, a.lamps, a.wire]) expect(o.layers.mask).toBe(1 << MAIN);
  expect(a.shadowOnly.layers.mask).toBe(1 << 29); expect([a.world.layers.mask, a.near.layers.mask]).toEqual(groups); expect(a.farDeck.layers.mask).toBe(1);
  a.deck.layers.enable(30);  // a later feature's bit survives restore
  r.restore(); r.restore();
  expect(a.deck.layers.mask).toBe(1 | 1 << 2 | 1 << 30); for (const o of [a.rail, a.lamps, a.wire]) expect(o.layers.mask).toBe(1);
  expect(a.shadowOnly.layers.mask).toBe(1 << 29);
  const pre = new Mesh(new BoxGeometry()); pre.layers.enable(MAIN); const again = mainOnly([pre], MAIN); expect(pre.layers.mask).toBe(1 << MAIN); again.restore(); expect(pre.layers.mask).toBe(1 | 1 << MAIN);
});

test('passStandIn clones a representation that shares geometry and materials onto the pass-only layer without changing the source', () => {
  const a = approaches(), before = new Map<Object3D, [number, boolean, string]>();
  a.far.traverse(o => before.set(o, [o.layers.mask, (o as Mesh).castShadow, JSON.stringify(o.userData)]));
  const r = passStandIn(a.far, { layer: PASS }), clone = r.object;
  expect(clone).not.toBe(a.far); expect(clone.parent).toBe(a.world); expect(r.stats).toEqual({ meshes: 2 });
  const deck = clone.getObjectByName('FarDeck') as Mesh, lamps = clone.getObjectByName('FarLamps') as InstancedMesh;
  expect(deck).not.toBe(a.farDeck); expect(deck.geometry).toBe(a.farDeck.geometry); expect(deck.material).toBe(a.farDeck.material);
  expect(lamps.geometry).toBe(a.farLamps.geometry); expect(lamps.material).toBe(a.farLamps.material); expect(lamps.instanceMatrix).toBe(a.farLamps.instanceMatrix);
  clone.traverse(o => expect(o.layers.mask).toBe(1 << PASS));
  for (const m of [deck, lamps]) {
    expect(m.castShadow).toBe(false); expect(m.userData.kilnPassStandIn).toBe(true);
    const ray = new Raycaster(new Vector3(2, 50, 0), new Vector3(0, -1, 0)); ray.layers.enableAll(); expect(ray.intersectObject(m)).toEqual([]);
  }
  clone.updateMatrixWorld(true); expect(deck.matrixWorld.equals(a.farDeck.matrixWorld)).toBe(true);
  for (const [o, [mask, cast, data]] of before) { expect(o.layers.mask).toBe(mask); expect((o as Mesh).castShadow).toBe(cast); expect(JSON.stringify(o.userData)).toBe(data); }
  r.restore(); r.restore(); expect(clone.parent).toBeNull(); expect(a.world.children).not.toContain(clone);
  const holder = node('Reflection stand-ins', a.world), other = passStandIn(a.far, { layer: PASS, parent: holder });
  expect(other.object.parent).toBe(holder); other.restore();
});

test('a multi-material source keeps every material by reference; a source holding a light is refused', () => {
  const a = approaches(), r = passStandIn(a.rail, { layer: PASS }), rail = r.object as Mesh;
  expect((rail.material as Material[]).every((m, i) => m === (a.rail.material as Material[])[i])).toBe(true); r.restore();
  const lit = node('Lit', a.world); lit.add(new Mesh(new BoxGeometry()), new PointLight());
  expect(() => passStandIn(lit, { layer: PASS })).toThrow(); expect(lit.children.length).toBe(2); expect(a.world.children.filter(c => c.name.includes('Lit')).length).toBe(1);
});

test('passCameraLayers sets only the two pass bits, idempotently, for a pass camera cloned from the main camera', () => {
  const main = new PerspectiveCamera(); main.layers.enable(1); main.layers.enable(2);
  expect(passCameraLayers(main, L, 'main')).toBe(1 | 2 | 4 | 1 << MAIN); expect(main.layers.mask).toBe(1 | 2 | 4 | 1 << MAIN);
  const virtual = main.clone();  // three r186 ReflectorNode clones the main camera once and never copies its layers again
  expect(passCameraLayers(virtual, L)).toBe(1 | 2 | 4 | 1 << PASS); expect(passCameraLayers(virtual, L)).toBe(1 | 2 | 4 | 1 << PASS);
  expect(main.layers.mask).toBe(1 | 2 | 4 | 1 << MAIN);
  const a = approaches(), moved = mainOnly([a.near], MAIN), stand = passStandIn(a.far, { layer: PASS });
  const sees = (camera: PerspectiveCamera, o: Object3D) => o.layers.test(camera.layers);
  expect([sees(main, a.rail), sees(main, stand.object.getObjectByName('FarDeck')!), sees(main, a.farDeck)]).toEqual([true, false, true]);
  expect([sees(virtual, a.rail), sees(virtual, stand.object.getObjectByName('FarDeck')!), sees(virtual, a.farDeck)]).toEqual([false, true, true]);
  moved.restore(); stand.restore();
  for (const bad of [{ main: 0, pass: PASS }, { main: MAIN, pass: MAIN }, { main: MAIN, pass: 32 }]) expect(() => passCameraLayers(main, bad)).toThrow();
  expect(() => mainOnly([a.near], 0)).toThrow(); expect(() => passStandIn(a.far, { layer: 0 })).toThrow();
});
