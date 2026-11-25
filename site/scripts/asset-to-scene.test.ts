import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { planTown } from '../../scenes/packages/seed-town/src/plan/town-plan.js';
import { planOutskirts } from '../../scenes/packages/seed-town/src/outskirts';
import { assemblySchedule, shots, duration } from '../../scenes/packages/seed-town/scripts/workflow-sequence.mjs';

const site = resolve(import.meta.dir, '..');
const data = JSON.parse(await readFile(resolve(site, 'src/data/asset-to-scene.json'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(site, 'src/data/packs/seed-town.json'), 'utf8'));
const pins = JSON.parse(await readFile(resolve(site, '../scenes/packages/seed-town/ASSET-MANIFEST.json'), 'utf8'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('Seed Town shows the pinned bay placed in the daylight 2026 plan', async () => {
  expect(data.scene.id).toBe('seed-town');
  expect(data.scene.seed).toBe('2026');
  expect(data.scene.hour).toBe('day');
  expect(data.scene.release).toBe(catalog.release);
  const plan = planTown(data.scene.seed);
  const bay = plan.placements.find(p => p.id === data.asset.placement);
  expect(bay?.kit).toBe('facade-bay');
  expect(data.asset.revision).toBe(pins.assets.find((asset: {id: string}) => asset.id === bay!.kit).revisionId);
  expect(data.asset.instances).toBe(plan.placements.filter(p => p.kit === bay?.kit).length);
  expect(data.scene.buildings).toBe(plan.town.buildings);
  expect(data.scene.townPlacements).toBe(plan.placements.length);
  expect(data.capture.variants.map((id: string) => plan.placements.find(p => p.id === id)?.values.finish)).toEqual(['stucco', 'timber']);
  expect(data.capture.buildingPlacements).toEqual(plan.placements.filter(p => p.id.startsWith('aW1-')).map(p => p.id));
  expect(data.modules.map((m: {id: string}) => m.id)).toEqual(catalog.assets.map((m: {slug: string}) => m.slug));
  expect(data.modules.map((m: {sha256: string}) => m.sha256)).toEqual(pins.assets.map((m: {sha256: string}) => m.sha256));
  expect(data.capture.shots).toEqual(shots);
  const sceneMedia = JSON.parse(await readFile(resolve(site, 'src/data/scene-media.json'), 'utf8'))['seed-town'];
  expect(data.scene.packJsonSha256).toBe(sceneMedia.capture.packJsonSha256);
});

test('every building assembles in courses, then the perimeter trees are planted', () => {
  const plan = planTown('2026');
  const { trees } = planOutskirts(plan);
  const entries = assemblySchedule(plan, trees);
  expect(new Set(entries.map(e => e.place.id)).size).toBe(plan.placements.length + trees.length);
  const roofs = entries.filter(e => e.place.kit === 'roof');
  const planting = entries.filter(e => e.place.kit === 'tree');
  const at = (id: string) => entries.find(e => e.place.id === id)!;
  expect(roofs.length).toBe(plan.town.buildings);
  for (const roof of roofs) {
    const lot = roof.place.id.replace(/-roof$/, '');
    // The featured bay is already standing when its shop assembles around it.
    if (lot !== 'aW1') expect(at(lot + '-ground-0').start).toBeLessThan(at(lot + '-floor1-0').start);
    expect(at(lot + '-floor1-0').start).toBeLessThan(roof.start);
  }
  expect(at('aW1-roof').end).toBeLessThan(at('aW2-ground-0').start);
  expect(new Set(roofs.map(e => e.start)).size).toBeGreaterThan(25);
  expect(planting.length).toBe(trees.length);
  expect(Math.max(...entries.filter(e => e.place.kit !== 'tree').map(e => e.end))).toBeLessThan(Math.min(...planting.map(e => e.start)));
  expect(new Set(planting.map(e => e.start)).size).toBeGreaterThan(30);
  expect(Math.max(...planting.map(e => e.end))).toBeLessThan(duration - .8);
  expect(data.scene.plantedTrees).toBe(trees.length);
});

test('workflow media and the editable bay source match their recorded bytes', async () => {
  const fullSource = await readFile(resolve(site, 'public', '.' + data.source.href));
  expect(hash(fullSource)).toBe(pins.assets.find((m: {id: string}) => m.id === 'facade-bay').sourceSha256);
  expect(fullSource.toString('utf8')).toContain(data.source.excerpt);
  for (const file of data.files) {
    const bytes = await readFile(resolve(site, file.path));
    expect(hash(bytes)).toBe(file.sha256);
    expect(bytes.length).toBe(file.bytes);
  }
  const info = await sharp(resolve(site, 'public', '.' + data.media.gif), { animated: true }).metadata();
  expect(info.format).toBe('gif');
  expect(info.pages).toBeGreaterThan(10);
  expect(Math.abs(info.delay!.reduce((a, b) => a + b, 0) / 1000 - data.media.duration)).toBeLessThan(.3);
  expect(data.capture.frameCount).toBe(data.media.fps * data.media.duration);
});

test('the accessible workflow links the same asset, pack, and walkable town', async () => {
  const component = await readFile(resolve(site, 'src/components/AssetToScene.astro'), 'utf8');
  expect(component.match(/<video\b/g)).toHaveLength(1);
  expect(component).toContain('controls');
  expect(component).not.toContain('autoplay');
  expect(component).toContain('/gallery/seed-town/facade-bay/');
  expect(component).toContain('/packs/seed-town/');
  expect(component).toContain('/scenes/seed-town/?seed=2026');
  expect(component).toContain('workflow.media.gif');
  expect(component).not.toContain('cabin');
});
