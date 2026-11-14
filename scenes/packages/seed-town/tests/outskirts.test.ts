import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { portraitLayout, PORTRAITS } from '../src/impostors';
import { AUTUMN, EVERGREEN, FAR, HEDGE, NEAR, nearRoad, planOutskirts, RAMP, TREE_RANGE } from '../src/outskirts';
import { planTown } from '../src/plan/town-plan.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const SEEDS = ['2026', '7', '1', 'amberbridge', 'saffronmill'];

test('the high street runs through the town and every other street leaves by one end', () => {
  for (const seed of SEEDS) {
    const plan = planTown(seed), high = plan.streets[Math.min(1, plan.streets.length - 1)]!.name;
    expect(plan.ends.length).toBe(plan.streets.length * 2);
    for (const street of plan.streets) {
      const ends = plan.ends.filter(end => end.street === street.name), open = ends.filter(end => end.open);
      expect(ends.map(end => end.end).sort()).toEqual(['N', 'S']);
      expect([seed, street.name, open.length]).toEqual([seed, street.name, street.name === high ? 2 : 1]);
      // A closed end has its gatehouse row; an open one has none.
      for (const end of ends) expect(plan.sides.some(side => side.name === street.name + end.end)).toBe(!end.open);
    }
    // Both edges of the town have a road besides the high road.
    for (const edge of ['N', 'S']) expect(plan.ends.filter(end => end.open && end.end === edge).length).toBeGreaterThanOrEqual(2);
  }
});

test('the country round a town follows its seed alone', () => {
  const day = planOutskirts(planTown('2026')), dusk = planOutskirts(planTown('2026', { dusk: true }));
  expect(digest(day)).toBe(digest(dusk));
  expect(digest(day)).toBe('d9942da26266b774');
  expect(digest(planOutskirts(planTown('2027')))).not.toBe(digest(day));
});

test('a road leaves every open street end, and a side road runs into the high road', () => {
  for (const seed of SEEDS) {
    const plan = planTown(seed), out = planOutskirts(plan), open = plan.ends.filter(end => end.open);
    expect(out.roads.length).toBe(open.length);
    expect(out.thresholds.length).toBe(open.length);
    for (const end of open) {
      const road = out.roads.find(r => r.id === `road-${end.street}${end.end}`)!, dz = end.end === 'N' ? 1 : -1;
      // It leaves the street's end at the street's level, has climbed by its first point, and heads straight out at first.
      expect([road.from, road.drop]).toEqual([[end.x, end.z], plan.town.kerbHeight]);
      expect(road.points[0]).toEqual([end.x, end.z + dz * RAMP]);
      expect(road.points[1]![0]).toBeCloseTo(end.x, 6);
      expect((road.points[1]![1] - road.points[0]![1]) * dz).toBeGreaterThan(0);
      const threshold = out.thresholds.find(t => t.x === end.x && t.z === end.z)!;
      expect([threshold.dz, threshold.drop]).toEqual([dz, plan.town.kerbHeight]);
      for (let i = 0; i + 1 < road.points.length; i++) {
        const step = Math.hypot(road.points[i + 1]![0] - road.points[i]![0], road.points[i + 1]![1] - road.points[i]![1]);
        expect(step).toBeGreaterThan(0.5);
        expect(step).toBeLessThan(20);
      }
      const last = road.points[road.points.length - 1]!;
      if (road.main) expect(Math.abs(last[1] - end.z)).toBeGreaterThan(500);
      else expect(nearRoad(out.roads.find(r => r.main && r.id.endsWith(end.end))!, last[0], last[1])).toBeLessThan(0.01);
    }
  }
});

test('near trees are the kit itself, clear of the walls and the roads and inside what the kit can be', () => {
  const tones = new Set([...AUTUMN, ...EVERGREEN, ...HEDGE].flatMap(tone => [tone.leaf, tone.accent]));
  for (const seed of SEEDS) {
    const plan = planTown(seed), out = planOutskirts(plan), { x0, x1, length } = plan.town;
    expect(out.trees.length).toBeGreaterThan(260);
    expect(out.trees.length).toBeLessThan(560);
    expect(new Set(out.trees.map(tree => tree.id)).size).toBe(out.trees.length);
    const forms = new Set<string>();
    for (const tree of out.trees) {
      const { height, spread, form, leaf, leafAccent } = tree.values as { height: number; spread: number; form: string; leaf: string; leafAccent: string };
      forms.add(form);
      expect(tree.kit).toBe('tree');
      expect(height >= TREE_RANGE.height[0] && height <= TREE_RANGE.height[1] && spread >= TREE_RANGE.spread[0] && spread <= TREE_RANGE.spread[1]).toBe(true);
      expect(tones.has(leaf) && tones.has(leafAccent)).toBe(true);
      const [x, , z] = tree.pos;
      // Not in the town, nor against its walls (a gatehouse stands 8 m past the street end), nor past where a walker goes.
      expect(x > x0 - 4 && x < x1 + 4 && z > -12 && z < length + 12).toBe(false);
      expect(Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(-8 - z, 0, z - length - 8))).toBeLessThanOrEqual(NEAR + 0.1);
      for (const road of out.roads) expect(nearRoad(road, x, z)).toBeGreaterThan(road.half + 1.5);
    }
    expect([...forms].sort()).toEqual(['broad', 'column', 'conifer', 'open', 'shrub']);
    // An avenue: trees close along both sides of the high road south of the town.
    const south = out.roads.find(r => r.id.endsWith('S') && r.main)!;
    const beside = out.trees.filter(tree => tree.pos[2] < -10 && tree.pos[2] > -150 && nearRoad(south, tree.pos[0], tree.pos[2]) < south.half + 6.5);
    expect(beside.length).toBeGreaterThan(16);
    expect(beside.some(tree => tree.pos[0] < south.points[0]![0])).toBe(true);
    expect(beside.some(tree => tree.pos[0] > south.points[0]![0])).toBe(true);
    // Leaves lie under the trees that shed, and each wood has its floor.
    expect(out.litter.length).toBeGreaterThan(150);
    expect(out.litter.every(patch => patch.radius > 1 && patch.strength > 0 && patch.strength <= 1)).toBe(true);
    // The roads keep the colours the streets are paved in.
    const paved = plan.placements.find(place => place.kit === 'paving')!.values as { sett: string; kerb: string };
    expect(out.paving).toEqual({ sett: paved.sett, kerb: paved.kerb });
  }
});

test('far trees close the country to the horizon and are pictures, not placements', () => {
  for (const seed of SEEDS) {
    const plan = planTown(seed), out = planOutskirts(plan), { x0, x1, length } = plan.town;
    expect(out.far.length).toBeGreaterThan(3500);
    expect(out.far.length).toBeLessThan(7000);
    const quarters = [0, 0, 0, 0];
    for (const tree of out.far) {
      const away = Math.hypot(Math.max(x0 - tree.x, 0, tree.x - x1), Math.max(-8 - tree.z, 0, tree.z - length - 8));
      expect(away).toBeGreaterThan(NEAR);
      expect(away).toBeLessThan(FAR + 80);
      expect(tree.height >= TREE_RANGE.height[0] && tree.height <= TREE_RANGE.height[1] && tree.spread >= TREE_RANGE.spread[0] && tree.spread <= TREE_RANGE.spread[1]).toBe(true);
      for (const road of out.roads) expect(nearRoad(road, tree.x, tree.z)).toBeGreaterThan(road.half + 1.5);
      quarters[(tree.x > (x0 + x1) / 2 ? 1 : 0) + (tree.z > length / 2 ? 2 : 0)]!++;
    }
    // No quarter of the horizon is bare.
    expect(Math.min(...quarters)).toBeGreaterThan(450);
  }
});

test('each form has its picture from two sides, inside its own cell of the texture', () => {
  const layout = portraitLayout();
  expect([layout.columns, layout.rows]).toEqual([5, 2]);
  Object.entries(layout.cells).forEach(([form, cell], i) => {
    const portrait = PORTRAITS[form as keyof typeof PORTRAITS];
    expect(cell.portraits.length).toBe(2);
    cell.portraits.forEach((side, j) => {
      expect(side.u).toBeGreaterThanOrEqual(i / 5);
      expect(side.u + side.du).toBeLessThanOrEqual((i + 1) / 5);
      expect(side.v).toBeGreaterThan(j / 2);
      expect(side.v + side.dv).toBeLessThan((j + 1) / 2);
      // The picture keeps the tree's proportions: a cell is square.
      expect(side.du * 5 / (side.dv * 2)).toBeCloseTo(side.width / side.height, 6);
      expect(side.width).toBe(portrait.width);
      expect(side.height).toBeGreaterThan(portrait.height);
    });
  });
});

test('a crown keeps to one family of colour: greens together, or golds, oranges and reds together', () => {
  // Green spots in a yellow or orange crown, or yellow spots in a green one, read as a fault.
  const warm = (hex: string) => parseInt(hex.slice(1, 3), 16) > parseInt(hex.slice(3, 5), 16);
  for (const tone of [...AUTUMN, ...EVERGREEN, ...HEDGE]) expect([tone.leaf, warm(tone.accent)]).toEqual([tone.leaf, warm(tone.leaf)]);
  for (const seed of SEEDS) {
    const country = planOutskirts(planTown(seed));
    const pairs = [...country.trees.map(tree => [String(tree.values.leaf), String(tree.values.leafAccent)]), ...country.far.map(tree => [tree.leaf, tree.accent])];
    expect(pairs.length).toBeGreaterThan(3000);
    const mixed = pairs.filter(([leaf, accent]) => warm(leaf!) !== warm(accent!));
    expect([seed, mixed.slice(0, 3)]).toEqual([seed, []]);
  }
});

test('a crown wears one listed pair of colours, never one tone with another tone on it', () => {
  // Gold sprays on a dark red crown go olive in the crown's own shade, and read as green spots.
  const listed = new Set([...AUTUMN, ...EVERGREEN, ...HEDGE].map(tone => `${tone.leaf} ${tone.accent}`));
  for (const seed of SEEDS) {
    const country = planOutskirts(planTown(seed));
    const pairs = [...country.trees.map(tree => `${tree.values.leaf} ${tree.values.leafAccent}`), ...country.far.map(tree => `${tree.leaf} ${tree.accent}`)];
    expect([seed, pairs.filter(pair => !listed.has(pair)).slice(0, 3)]).toEqual([seed, []]);
  }
});
