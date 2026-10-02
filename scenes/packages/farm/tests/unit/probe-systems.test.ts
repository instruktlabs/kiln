import { expect, test } from 'bun:test';
import { farmProbeHooks } from '../../src/world/probe-systems';

// Count-probe systems over a stubbed FarmWorld: only parents, names and the instanced flag are read.
const node = (name: string, parent: any = null, extra: Record<string, unknown> = {}): any => { const n = { name, parent, children: [] as any[], ...extra }; parent?.children.push(n); return n; };
function world() {
  const root = node('farm-root'), placed = (id: string) => { const object = node(id, root), mesh = node(`${id}-mesh`, object); return { instance: { object, asset: { id } }, mesh }; };
  const [house, windmill, gate, cow, sheep, fence, barrel] = ['farmhouse', 'windmill', 'fence-gate', 'cow', 'sheep', 'fence-straight', 'barrel'].map(placed);
  const batch = (name: string, source: any) => ({ mesh: node(name, root, { isInstancedMesh: true }), sources: source ? [{ o: source }] : [] });
  const batches = [batch('Repeated sheep-mesh', sheep!.mesh), batch('Repeated fence-mesh', fence!.mesh), batch('Repeated orphan', null)];
  const trees = node('woodland-lod0', root, { isInstancedMesh: true }), packed = node('Packed tree-a', root, { isInstancedMesh: true }), notPacked = node('Packed but plain', root);
  const parts = { ground: node('ground', root), surrounding: node('surrounding', root), water: node('stream', root), bridge: node('bridge', root), grass: node('grass', root) };
  const farm = {
    root, ground: parts.ground, surrounding: parts.surrounding, water: parts.water, bridge: parts.bridge, grass: { layers: [{ mesh: parts.grass }] },
    woodland: { meshes: [trees] }, placements: { instances: [house, windmill, gate, cow, sheep, fence, barrel].map(p => p!.instance) },
    optimization: { batches: { batches } },
  };
  return { farm: farm as unknown as Parameters<typeof farmProbeHooks>[0], house: house!, windmill: windmill!, gate: gate!, cow: cow!, sheep: sheep!, fence: fence!, barrel: barrel!, batches, trees, packed, notPacked, parts };
}
const names = (list: any[]) => list.map(o => o.name);

test('farm probe systems split heroes, animals, placements and batches by asset', () => {
  const w = world(), systems = farmProbeHooks(w.farm).probeSystems!() as Record<string, any>;
  expect(Object.keys(systems)).toEqual(['terrain', 'woodland', 'stream', 'bridge', 'grass', 'heroes', 'animals', 'placements', 'batched']);
  // Heroes are the batch policy's excluded assets plus the windmill, which never batches.
  expect(names(systems.heroes)).toEqual(['farmhouse', 'windmill', 'fence-gate']);
  // Animals are the animal placements plus the batches whose first source an animal owns.
  expect(names(systems.animals)).toEqual(['cow', 'sheep', 'Repeated sheep-mesh']);
  expect(names(systems.placements)).toEqual(['fence-straight', 'barrel']);
  expect(names(systems.batched)).toEqual(['Repeated fence-mesh', 'Repeated orphan']);
  // Woodland is its own meshes plus the instanced 'Packed …' children of the root.
  expect(names(systems.woodland)).toEqual(['woodland-lod0', 'Packed tree-a']);
  expect([names(systems.terrain), systems.stream.name, systems.grass.map((m: any) => m.name)]).toEqual([['ground', 'surrounding'], 'stream', ['grass']]);
});

test('farm probe assets name batches by their first source, woodland as the tree and meshes by their placement', () => {
  const w = world(), asset = farmProbeHooks(w.farm).probeAsset!;
  expect(w.batches.map(b => asset(b.mesh))).toEqual(['sheep', 'fence-straight', 'Repeated orphan']);
  expect([asset(w.trees), asset(w.packed)]).toEqual(['faceted-tree', 'faceted-tree']);
  expect([asset(w.house.mesh), asset(w.cow.instance.object), asset(node('deep', w.barrel.mesh))]).toEqual(['farmhouse', 'cow', 'barrel']);
  expect([asset(w.parts.ground), asset(w.notPacked)]).toEqual([null, null]);
});
