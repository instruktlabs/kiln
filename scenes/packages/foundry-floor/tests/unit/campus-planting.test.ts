import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseCampus } from '../../src/campus/data';
import { campusPlantings, clearPlantSpot, PLANT_SIZES } from '../../src/campus/exterior/planting';

const campus = parseCampus(readFileSync(new URL('../../data/campus.json', import.meta.url), 'utf8'));
test('campus planting is deterministic, covers all eight assets and keeps roads and buildings clear', () => {
  const plants = campusPlantings(campus);
  expect(plants).toEqual(campusPlantings(campus));
  expect(plants.length).toBeGreaterThan(500); expect(plants.length).toBeLessThan(1800);
  expect(new Set(plants.map(p => p.model))).toEqual(new Set(Object.keys(PLANT_SIZES)));
  for (const p of plants) expect(clearPlantSpot(campus, p.model, p.x, p.z)).toBe(true);
  expect(plants.filter(p => p.zone === 'island').length).toBeGreaterThan(70);
  expect(plants.filter(p => p.zone === 'arrival').length).toBeGreaterThan(20);
  expect(plants.filter(p => p.zone === 'parking').length).toBeGreaterThan(20);
});
test('the planting clearance predicate rejects traffic lanes, circulation ring and occupied buildings', () => {
  for (const [x,z] of [[1000,10],[0,95],[-3500,-300],[0,200]]) expect(clearPlantSpot(campus,'tree-broad-m',x!,z!)).toBe(false);
  expect(clearPlantSpot(campus,'tree-ornamental',0,0)).toBe(true);
});
