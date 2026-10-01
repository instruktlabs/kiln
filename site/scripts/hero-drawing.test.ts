import { describe, expect, test } from 'bun:test';
import bridgeHero from '../src/data/hero.json';
import farmhouseHero from './fixtures/hero-farmhouse.json';
import { decodeMask, heroDrawing, LAYOUT, metres, projector, TEXT } from '../src/lib/hero-drawing.mjs';
import { heroFacts } from '../src/lib/hero';

// Design review, findings 4 and 5: the drawing is computed from the hero data file alone, so a swapped file redraws it.
// The site's file is the Golden Gate Bridge; the farmhouse file is the second fixture.
const fixtures = { 'golden-gate-bridge': bridgeHero, farmhouse: farmhouseHero } as const;
type Hero = (typeof fixtures)[keyof typeof fixtures];
type Point = number[];

const near = (a: Point, b: Point, tolerance = 0.11) => a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
const direction = ([a, b]: Point[]) => {
  const d = [b![0]! - a![0]!, b![1]! - a![1]!];
  const length = Math.hypot(d[0]!, d[1]!);
  return [d[0]! / length, d[1]! / length];
};
const parallel = (a: Point, b: Point) => Math.abs(a[0]! * b[1]! - a[1]! * b[0]!);
const corner = (hero: Hero, ix: number, iy: number, iz: number) => [ix ? hero.bounds.max[0]! : hero.bounds.min[0]!, iy ? hero.bounds.max[1]! : hero.bounds.min[1]!, iz ? hero.bounds.max[2]! : hero.bounds.min[2]!];

for (const [name, hero] of Object.entries(fixtures)) {
  describe(`the hero drawing from ${name}'s data file`, () => {
    const drawing = heroDrawing(hero);
    const project = projector(hero.camera, hero.poster.width, hero.poster.height);
    const mask = decodeMask(hero.mask, hero.poster.width, hero.poster.height);

    test('draws in the poster’s own pixels', () => {
      expect([drawing.width, drawing.height]).toEqual([hero.poster.width, hero.poster.height]);
    });

    test('X, Z and height run along the projected edges of the revision’s bounding box, valued from its bounds', () => {
      expect(drawing.dimensions.map((d) => d.axis)).toEqual(['X', 'Z', 'Y']);
      expect(drawing.dimensions.map((d) => d.value)).toEqual([metres(hero.bounds.size[0]!), metres(hero.bounds.size[2]!), metres(hero.bounds.size[1]!)]);
      const edges = { X: [corner(hero, 0, 0, 0), corner(hero, 1, 0, 0)], Z: [corner(hero, 0, 0, 0), corner(hero, 0, 0, 1)], Y: [corner(hero, 0, 0, 0), corner(hero, 0, 1, 0)] };
      for (const dimension of drawing.dimensions) {
        // Every edge of one axis projects to the same screen direction (parallel projection), so any edge will do.
        const edge = direction(edges[dimension.axis as keyof typeof edges].map(project));
        expect(parallel(direction(dimension.line), edge)).toBeLessThan(0.002);
        // Extension lines leave the box corners and cross the dimension line's ends.
        for (const [index, [from, to]] of dimension.extensions.entries()) {
          expect(parallel(direction([from!, to!]), direction([from!, dimension.line[index]!]))).toBeLessThan(0.01);
        }
        // 45 degree ticks.
        for (const tick of dimension.ticks) {
          const cosine = Math.abs(direction(tick).reduce((sum, value, index) => sum + value * direction(dimension.line)[index]!, 0));
          expect(cosine).toBeCloseTo(Math.SQRT1_2, 2);
        }
        expect(dimension.inFrame).toBe(true);
      }
    });

    test('each callout’s dot is its part’s bounds centre projected through the capture camera', () => {
      expect(drawing.callouts.map((c) => c.path)).toEqual(hero.callouts.map((c) => c.path));
      for (const [index, callout] of drawing.callouts.entries()) expect(near(callout.anchor, project(hero.callouts[index]!.centre))).toBe(true);
    });

    test('leaders leave at 40 degrees, then run level to a label in free space inside the frame', () => {
      for (const callout of drawing.callouts.filter((c) => !c.legendOnly)) {
        const [dx, dy] = [callout.elbow![0]! - callout.anchor[0]!, callout.elbow![1]! - callout.anchor[1]!];
        expect((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI).toBeCloseTo(40, 0);
        expect(callout.end![1]).toBe(callout.elbow![1]!);
        expect(Math.abs(callout.end![0]! - callout.elbow![0]!)).toBeCloseTo(LAYOUT.level, 0);
        const box = callout.box!;
        expect(box[0]! >= LAYOUT.margin - 1 && box[1]! >= LAYOUT.margin - 1 && box[2]! <= hero.poster.width - LAYOUT.margin + 1 && box[3]! <= hero.poster.height - LAYOUT.margin + 1).toBe(true);
        expect(mask.boxOccupied(box, 0)).toBe(false);
        // The label box holds the part name at 12 px at the narrowest drawing that shows labels.
        expect(box[2]! - box[0]!).toBeGreaterThanOrEqual(Math.floor(((callout.name.length * TEXT.charPx) * hero.poster.width) / LAYOUT.labelWidthPx));
      }
    });

    test('the axis triad sits in free space and points along the projected world axes', () => {
      expect(drawing.triad).not.toBeNull();
      const triad = drawing.triad!;
      expect(mask.boxOccupied(triad.box, 0)).toBe(false);
      for (const axis of triad.axes) {
        const world = { '+X': [1, 0, 0], '+Y': [0, 1, 0], '+Z': [0, 0, 1] }[axis.name]!;
        const target = hero.camera.target;
        const expected = direction([project(target), project(target.map((value, index) => value + world[index]!))]);
        expect(parallel(axis.direction, expected)).toBeLessThan(0.002);
        expect(axis.direction[0]! * expected[0]! + axis.direction[1]! * expected[1]!).toBeGreaterThan(0);
      }
    });

    test('the title block reads the catalog entry the file names, with requested and confirmed effort apart', () => {
      const facts = heroFacts(hero as typeof bridgeHero);
      expect(facts.revisionId).toBe(hero.subject.revisionId);
      expect(facts.href).toBe(`/gallery/${hero.subject.slug}/`);
      expect(facts.namedParts).toBe(hero.sources.glb.namedParts);
      expect(facts.requestedEffort).not.toBe(facts.confirmedEffort);
    });
  });
}

describe('swapping the data file redraws the figure', () => {
  test('the two fixtures give different drawings, each from its own file', () => {
    const bridge = heroDrawing(bridgeHero);
    const farmhouse = heroDrawing(farmhouseHero);
    expect(bridge.dimensions.map((d) => d.value)).toEqual(['91.44 m', '2,067.96 m', '262.76 m']);
    expect(farmhouse.dimensions.map((d) => d.value)).toEqual(['9.12 m', '9.05 m', '6.97 m']);
    expect(bridge.callouts.map((c) => c.name)).toEqual(['SouthTower_CrownWest', 'NorthTower_Pier']);
    expect(farmhouse.callouts.map((c) => c.name)).toEqual(['Mesh_RoofShingles', 'Mesh_PorchRoof']);
    expect(bridge.dimensions.map((d) => d.line)).not.toEqual(farmhouse.dimensions.map((d) => d.line));
  });

  test('moving the camera moves every mark with it', () => {
    const turned = { ...bridgeHero, camera: { ...bridgeHero.camera, position: [-bridgeHero.camera.position[0]!, bridgeHero.camera.position[1]!, bridgeHero.camera.position[2]!] } };
    const before = heroDrawing(bridgeHero);
    const project = projector(turned.camera, turned.poster.width, turned.poster.height);
    // The mask belongs to the recorded poster, so only the projected geometry is compared here.
    const anchors = turned.callouts.map((callout) => project(callout.centre));
    expect(anchors.map((a) => a.map((v) => Math.round(v)))).not.toEqual(before.callouts.map((c) => c.anchor.map((v) => Math.round(v))));
  });

  test('the site’s bridge routes both callouts; a callout with no free route keeps its dot and number and goes to the legend', () => {
    expect(heroDrawing(bridgeHero).callouts.every((callout) => !callout.legendOnly)).toBe(true);
    // The farmhouse's roof leaves no free space for a 20-character label at the narrowest labelled width.
    const legend = heroDrawing(farmhouseHero).callouts.filter((callout) => callout.legendOnly);
    expect(legend.length).toBeGreaterThan(0);
    for (const callout of legend) {
      expect(callout.index).toBeGreaterThan(0);
      expect('elbow' in callout).toBe(false);
    }
  });
});
