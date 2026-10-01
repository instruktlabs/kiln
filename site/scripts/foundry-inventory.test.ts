import { expect, test } from 'bun:test';
import { foundryInventory } from './foundry-inventory.mjs';
const revision = `r_${'1'.repeat(32)}`;
const sha256 = 'a'.repeat(64);
const author = 'Claude Sonnet 5.5 · claude 2.1.280';
const pin = (asset: string) => ({ asset, revision, sha256, bytes: 100, author, requestedEffort: 'max', confirmedEffort: null });
const records = { interior: pin('tool'), campus: pin('office'), car: pin('sedan'), 'plant-shrub-mound': pin('shrub-mound'), 'freight-van-delivery': pin('van-delivery') };
const models = Object.keys(records).map(id => ({ id, path: `models/${id}.glb` }));
const pack = { models, source: { models: records, structures: ['campus'], vehicles: { car: {} }, unplaced: [] } };
const assetMap = { entities: { interior: { asset: 'tool', glb: 'models/interior.glb' } } };
const campusMap = { schema: 'foundry-floor.campus-assets/1', models: Object.fromEntries(models.slice(3).map(({ id, path }) => [id, { ...records[id as keyof typeof records], path, kind: id.startsWith('plant-') ? 'vegetation' : 'freight' }])) };
const sums = new Map(models.map(model => [model.path, sha256]));
const licenceLines = new Map(models.map(({ id, path }) => [path, records[id as keyof typeof records]]));
const input = { pack, assetMap, campusMap, sums, licenceLines };

test('full inventory retains interior assertions and catalogues every sealed campus group', () => {
  const items = foundryInventory(input);
  expect(items.map(item => item.group)).toEqual(['interior', 'campus', 'vehicles', 'vegetation', 'freight']);
  expect(items.map(item => item.path)).toEqual(models.map(model => model.path));
  expect(items[0].entity).toBe(assetMap.entities.interior);
});
test('full inventory refuses omitted, duplicate, unsealed, unknown and differently attributed models', () => {
  expect(() => foundryInventory({ ...input, sums: new Map([...sums, ['models/unlisted.glb', sha256]]) })).toThrow();
  expect(() => foundryInventory({ ...input, pack: { ...pack, models: [...models, models[0]] } })).toThrow();
  expect(() => foundryInventory({ ...input, pack: { ...pack, models: models.slice(1) } })).toThrow();
  expect(() => foundryInventory({ ...input, campusMap: { ...campusMap, models: {} } })).toThrow();
  expect(() => foundryInventory({ ...input, licenceLines: new Map([...licenceLines].slice(1)) })).toThrow();
  const altered = structuredClone(campusMap); altered.models['plant-shrub-mound'].author = 'Different model';
  expect(() => foundryInventory({ ...input, campusMap: altered })).toThrow();
});
test('sealed structure paths keep their case while page download slugs stay lowercase', () => {
  const path='models/structures/s1-head-W.glb';
  const models=[{id:'campus',path}];
  const items=foundryInventory({pack:{models,source:{models:{campus:records.campus},structures:['campus']}},assetMap:{entities:{}},sums:new Map([[path,sha256]]),licenceLines:new Map([[path,records.campus]])});
  expect(items[0].path).toBe(path); expect(items[0].slug).toBe('s1-head-w');
});
