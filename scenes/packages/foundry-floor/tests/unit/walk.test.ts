// Free walk (TASK-FF2 item 3, D-22): the walker meets tools and walls, slides along them, walks the gallery, the viewing
// landing and the fab floor at the configured pace, starts where the view is, and never crosses between the gallery and
// the fab (glazing, handrail, closed doors) or leaves the building.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAssetMap } from '../../src/scene/assets/asset-map';
import { createWalkWorld, stepWalker, walkBoxes, walkerEye, walkPlace, walkStart, WALK_FOV } from '../../src/scene/walk';
import type { Walker } from '../../src/scene/walk';
import { FAB_DATA } from '../../src/sim/index';
import { floorWalkPaths } from '../../src/sim/floor-transport';

const PACKAGE = resolve(import.meta.dir, '../..');
const MAP = parseAssetMap(readFileSync(resolve(PACKAGE, 'data/assets.json'), 'utf8'));
const world = createWalkWorld(FAB_DATA, MAP);
const { layout } = FAB_DATA, walk = layout.cameras.walk;
const still = { move: { x: 0, y: 0 }, run: false, look: { x: 0, y: 0 }, zoom: 0 };
const deg = (d: number) => (d * Math.PI) / 180;

/** Walks forward (full stick) for `seconds` at 60 fps facing `yawDeg`; returns the walker. */
function walkFor(w: Walker, yawDeg: number, seconds: number, run = false): Walker {
  w.yaw = deg(yawDeg);
  for (let i = 0; i < Math.round(seconds * 60); i++) stepWalker(world, w, { ...still, move: { x: 0, y: 1 }, run }, 1 / 60);
  return w;
}
const at = (x: number, z: number, yawDeg = 0): Walker => ({ x, z, yaw: deg(yawDeg), pitch: 0, fov: 60 });

describe('free walk', () => {
  test('the walker meets every tool, load port, stocker, wall panel, post, floor robot, gallery obstacle and walk edge', () => {
    const boxes = walkBoxes(FAB_DATA, MAP), count = (prefix: string) => boxes.filter(b => b.id.startsWith(prefix)).length;
    expect(count('tool:')).toBe(layout.tools.length);
    expect(count('loadPort:')).toBe(layout.tools.reduce((n, t) => n + t.ports.length, 0));
    expect(count('stocker:')).toBe(layout.stockers.length);
    expect(count('wallKit:')).toBe(layout.walls.panels.length + layout.walls.posts.length);
    expect(count('toolFrontRobotArm:') + count('amrFloorRobot:')).toBe(layout.floorRobots.arms.length + layout.floorRobots.amrs.length + layout.stockers.length);
    expect(count('floor-transfer')).toBe(8);
    expect(count('gallerySegment:')).toBe(2 * layout.gallery.segmentPlacements.length);
    expect(count('edge:')).toBe(walk.edges.length);
    // The section modules meet the walker with their drawn shafts only (section-4 draws without its shaft).
    const drawnShafts = layout.sectionCut.modulePlacements.filter(m => m.variant === 'withShaft').length;
    expect(count('sectionModule:')).toBe(drawnShafts);
    expect(drawnShafts).toBe(layout.sectionCut.modulePlacements.length - 1);
    // Nothing overhead: rails, UTS, signal towers, the ceiling.
    for (const prefix of ['railStraight:', 'railCurve:', 'railSwitch:', 'uts:', 'signalTower:', 'ceilingModule:', 'floorModule:']) expect(count(prefix), prefix).toBe(0);
  });

  test('starts in the gallery facing the fab, at eye height', () => {
    const s = walk.start.position;
    expect(world.free(s[0], s[2])).toBe(true);
    const w = walkStart(world, [0, 64, 58], [0, -64, -58], 40);
    expect(world.areaAt(w.x, w.z)).toBe('fab');
    const g = walkStart(world, [53, 0.6, 12.5], [-18, -2.8, -11.5], 50);
    expect([g.x, g.z]).toEqual([s[0], s[2]]);
    expect(g.yaw).toBeCloseTo(deg(walk.start.yawDeg), 9);
    const pos = [0, 0, 0], target = [0, 0, 0];
    walkerEye(world, g, pos, target);
    expect(pos[1]).toBe(1.6);
    expect(target[2]).toBeLessThan(pos[2]!);
  });

  test('walks at the configured pace, runs at twice it, and turns and zooms from the drag and pinch', () => {
    const w = walkFor(at(-20, 0), 0, 1);
    expect(w.x + 20).toBeCloseTo(walk.speed, 6);
    const r = walkFor(at(-20, 0), 0, 1, true);
    expect(r.x + 20).toBeCloseTo(walk.runSpeed, 6);
    const t = at(-20, 0);
    stepWalker(world, t, { ...still, look: { x: 0.5, y: -0.2 }, zoom: 10 }, 1 / 60);
    expect(t.yaw).toBeCloseTo(0.5, 9);
    expect(t.pitch).toBeCloseTo(-0.2, 9);
    expect(t.fov).toBe(WALK_FOV[1]);
  });

  test('stops at the tools and slides along them', () => {
    // From the N1 aisle toward etch-02's load ports (tool face X -30.9, ports to X -30.35).
    const w = walkFor(at(-28.8, -10), 180, 3);
    expect(w.x).toBeGreaterThanOrEqual(-30.35 + walk.radius - 1e-6);
    expect(w.x).toBeLessThan(-30.35 + walk.radius + 0.01);
    // Pushed diagonally into the gallery's outer wall (between two benches) the walker slides east along it.
    const d = walkFor(at(-18.3, 26.4), -45, 2);
    expect(d.z).toBeCloseTo(27 - 0.03 - walk.radius, 4);
    expect(d.x).toBeGreaterThan(-18.3 + 1.8);
    expect(world.free(d.x, d.z)).toBe(true);
  });

  test('walks the spine end to end and every bay aisle to its end (the paths the 0.62 m walker uses)', () => {
    for (const path of floorWalkPaths(FAB_DATA)) {
      const [ax, az] = path.from, [bx, bz] = path.to;
      const w = at(ax, az);
      expect(world.free(ax, az), path.id).toBe(true);
      const heading = Math.atan2(-(bz - az), bx - ax) * (180 / Math.PI), length = Math.hypot(bx - ax, bz - az);
      walkFor(w, heading, length / walk.speed + 0.2);
      expect(Math.hypot(w.x - bx, w.z - bz), path.id).toBeLessThan(0.3);
    }
  });

  test('walks the gallery to the viewing landing and faces the section cut from there', () => {
    const s = walk.start.position, w = at(s[0], s[2]);
    walkFor(w, 0, 30);
    expect(world.areaAt(w.x, w.z)).toBe('landing');
    // The landing's east rail stops the walker; the cut lies west, 3.6 m from the rail.
    expect(w.x).toBeLessThanOrEqual(39.6 - walk.radius);
    walkFor(w, 90, 10);
    expect(w.z).toBeGreaterThanOrEqual(19.8 + walk.radius - 1e-6);
    expect(world.areaAt(w.x, w.z)).toBe('landing');
  });

  test('never crosses between the gallery and the fab, nor leaves the building', () => {
    // At each gallery door the handrail and the closed door stop the walker.
    for (const x of [-12.6, 12.6, 0]) {
      const w = walkFor(at(x, 25.2), 90, 5);
      expect(world.areaAt(w.x, w.z), `gallery at ${x}`).toBe('gallery');
      expect(w.z).toBeGreaterThan(23.55);
    }
    // From the fab toward the gallery glazing, the west wall (people door closed) and the section cut rail.
    const south = walkFor(at(-12.6, 21), -90, 5);
    expect(world.areaAt(south.x, south.z)).toBe('fab');
    const west = walkFor(at(-34, 0), 180, 5);
    expect(west.x).toBeGreaterThan(-36);
    expect(world.areaAt(west.x, west.z)).toBe('fab');
    const east = walkFor(at(33, 0), 0, 5);
    expect(east.x).toBeLessThanOrEqual(36 - walk.radius);
    expect(world.areaAt(east.x, east.z)).toBe('fab');
    // The gallery's outer wall and west end.
    const out = walkFor(at(-20, 25.2), -90, 5);
    expect(out.z).toBeLessThanOrEqual(27 - walk.radius);
    const end = walkFor(at(-30, 25.2), 180, 10);
    expect(end.x).toBeGreaterThanOrEqual(-36 + walk.radius - 1e-6);
  });

  test('a start inside a tool moves to the nearest free spot', () => {
    const etch = layout.tools.find(t => t.id === 'etch-01')!, [x, , z] = etch.position;
    expect(world.free(x, z)).toBe(false);
    const w = walkStart(world, [x, 1.6, z], [1, 0, 0], 55);
    expect(world.free(w.x, w.z)).toBe(true);
    expect(Math.hypot(w.x - x, w.z - z)).toBeLessThan(3.2);
  });

  test('the status line names where the walker stands: the gallery, the landing, the spine or the bay and its contents', () => {
    const s = walk.start.position;
    expect(walkPlace(world, layout, s[0], s[2])).toBe('In the visitor gallery');
    const landing = walkFor(at(s[0], s[2]), 0, 30);
    expect(walkPlace(world, layout, landing.x, landing.z)).toBe('On the viewing landing beside the section cut');
    expect(walkPlace(world, layout, -20, 0)).toBe('On the fab floor, the spine');
    for (const bay of layout.bays) {
      const x = (bay.x[0] + bay.x[1]) / 2, z = (bay.z[0] + bay.z[1]) / 2;
      expect(walkPlace(world, layout, x, z)).toBe(`On the fab floor, bay ${bay.id}: ${bay.contents}`);
    }
    expect(walkPlace(world, layout, 0, 60)).toBe('');
  });
});
