import { expect, test } from 'bun:test';
import { BoxGeometry, Matrix4 } from 'three/webgpu';
import { floorRig } from '../../src/scene/world/floor-rig';
import { FAB_DATA } from '../../src/sim/index';
import type { FloorActive } from '../../src/sim/floor-transport';
import { floorStockerDock, floorRoute, floorRoutePose, floorFoupPose } from '../../src/sim/floor-transport';
import { loadModels, MAP, staticTriangles, placementMatrix, posedParts } from './fab-geometry';
import { crossings, nearestPiece, PlanGrid, rectangle, slabPieces, soupDistance } from './envelopes';
import { proxyBoxes } from '../../src/scene/world/proxies';
import { staticPlacements } from '../../src/scene/world/placements';
const loadRigModels = () => {
  const fixtures = new Map<string, string>();
  if (process.env.FF_ARM_FIXTURE) fixtures.set('toolFrontRobotArm', process.env.FF_ARM_FIXTURE);
  if (process.env.FF_AMR_FIXTURE) fixtures.set('amrFloorRobot', process.env.FF_AMR_FIXTURE);
  return loadModels(fixtures.size ? fixtures : undefined);
};

test('numeric and GLB carried poses agree on the FOUP door orientation', async () => {
  const rig = floorRig(await loadRigModels(), MAP, FAB_DATA);
  const active: FloorActive = { id: 1, lot: 1, station: 0, stocker: 0, direction: 'deliver', phase: 'TO_DROP', carrier: 'amr', requestedAt: 0, hot: false, t0: 0, t1: 24000, carrying: true };
  expect(floorFoupPose(FAB_DATA, active, 12000).yaw).toBeCloseTo(rig.sample(active, 12000).foup.yaw, 6);
  rig.dispose();
});

test('the accepted arm and lifted AMR deck meet every tool and stocker seat continuously', async () => {
  const models = await loadRigModels(), rig = floorRig(models, MAP, FAB_DATA);
  const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
  for (let station = 0; station < 4; station++) for (let stocker = 0; stocker < 2; stocker++) {
    for (const direction of ['deliver', 'collect'] as const) for (const phase of ['PICK', 'DROP'] as const) {
      const active: FloorActive = { id: 1, lot: 1, station, stocker, direction, phase, carrier: 'amr', requestedAt: 0, hot: false, t0: 0, t1: 24000, carrying: phase === 'DROP' };
      let previous = rig.sample(active, 0).foup.position;
      let previousYaw = rig.sample(active, 0).foup.yaw;
      for (let t = 10; t <= 24000; t += 10) {
        const pose = rig.sample(active, t);
        expect(distance(previous, pose.foup.position), `${station}/${stocker}/${direction}/${phase} at ${t}`).toBeLessThan(0.02);
        expect(Math.abs(Math.atan2(Math.sin(pose.foup.yaw - previousYaw), Math.cos(pose.foup.yaw - previousYaw))), `FOUP turn at ${t}`).toBeLessThan(0.1);
        previous = pose.foup.position;
        previousYaw = pose.foup.yaw;
      }
      const atStocker = (phase === 'PICK') === (direction === 'deliver');
      const seat = atStocker ? FAB_DATA.layout.stockers[stocker]!.manualPort.seat : FAB_DATA.layout.floorRobots.stations[station]!.handoff.seat;
      expect(distance(rig.sample(active, phase === 'PICK' ? 0 : 24000).foup.position, seat)).toBeLessThan(0.001);
      const seated = rig.sample(active, phase === 'PICK' ? 6500 : 10500);
      const transferSeat = atStocker ? floorStockerDock(FAB_DATA, stocker).seat : seat;
      expect(distance(seated.foup.position, transferSeat)).toBeLessThan(0.001);
    }
  }
  rig.dispose();
});

test('every production floor route clears real stationary geometry and the transfer extensions', async () => {
  const models = await loadRigModels();
  const placements = staticPlacements(FAB_DATA), boxes = proxyBoxes(MAP, placements, FAB_DATA);
  for (let station = 0; station < 4; station++) {
    const own = FAB_DATA.layout.floorRobots.stations[station]!.amr.id;
    const world = staticTriangles(models, FAB_DATA, (id, p) => id !== 'floorModule' && p.id !== own, [0.02, 1.5]);
    const pieces = slabPieces(world, 0.02, 1.5);
    const extensions = [];
    for (const b of boxes.filter(b => b.name.startsWith('floor-transfer'))) {
      const owner = world.owners.push({ entity: 'transfer', id: b.name }) - 1;
      extensions.push({ poly: rectangle((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, 1, 0, (b.max[0] - b.min[0]) / 2, (b.max[2] - b.min[2]) / 2),
        yMin: b.min[1], yMax: b.max[1], owner, minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] });
    }
    const grid = new PlanGrid(pieces), extensionGrid = new PlanGrid(extensions);
    for (let stocker = 0; stocker < 2; stocker++) {
      const route = floorRoute(FAB_DATA, station, stocker), samples = Math.ceil(route.lengthM / 0.025);
      for (let k = 0; k <= samples; k++) {
        const p = floorRoutePose(route, k / samples), [x, , z] = p.position;
        const bodies = [
          { entity: 'amrFloorRobot', x, y: 0, z, yaw: p.yaw, hx: 0.505, hz: 0.355, lo: 0.02, hi: 1.25 },
          { entity: 'foup', x: x + Math.cos(p.yaw) * 0.23, y: 1.15, z: z - Math.sin(p.yaw) * 0.23, yaw: p.yaw - Math.PI / 2, hx: 0.1665, hz: 0.208, lo: 1.15, hi: 1.485 },
        ];
        for (const body of bodies) {
          const shape = rectangle(body.x, body.z, Math.cos(body.yaw), -Math.sin(body.yaw), body.hx, body.hz);
          const extension = nearestPiece(extensionGrid, shape, body.lo, body.hi, 0.1);
          expect(extension.distance, `${body.entity} intersects transfer extension on ${station}/${stocker} at ${x},${z}`).toBeGreaterThan(0.005);
          const near = nearestPiece(grid, shape, body.lo, body.hi, 0.1);
          if (near.distance <= 0.005) {
            // Resolve empty bounding-box corners against actual triangles; no receiving-arm exemption.
            const parts = posedParts(models, body.entity, placementMatrix(body.entity, { id: own, ...body }));
            const moving = Float64Array.from([...parts].filter(([name]) => name !== 'waferStack').flatMap(([, a]) => [...a]));
            const distance = soupDistance(moving, world.tris, 0.006).distance;
            expect(distance, `${body.entity} ${station}/${stocker} at ${x},${z} near ${world.owners[pieces[near.piece]?.owner ?? -1]?.id}`).toBeGreaterThan(0.005);
          }
        }
      }
    }
  }
});

test('carrier headings stay continuous through turns and meet each docking heading in both directions', () => {
  for (let station = 0; station < 4; station++) for (let stocker = 0; stocker < 2; stocker++) {
    const route = floorRoute(FAB_DATA, station, stocker);
    const angle = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    expect(Math.abs(angle(floorRoutePose(route, 0).yaw, floorStockerDock(FAB_DATA, stocker).yaw * Math.PI / 180))).toBeLessThan(1e-6);
    expect(Math.abs(angle(floorRoutePose(route, 1).yaw, FAB_DATA.layout.floorRobots.stations[station]!.amr.yaw * Math.PI / 180))).toBeLessThan(1e-6);
    let previous = floorRoutePose(route, 0).yaw;
    for (let k = 1; k <= 10000; k++) {
      const p = floorRoutePose(route, k / 10000);
      expect(Math.abs(angle(p.yaw, previous))).toBeLessThan(0.1);
      expect(floorRoutePose(route, 1 - k / 10000, true).position.map(x => +x.toFixed(8))).toEqual(p.position.map(x => +x.toFixed(8)));
      previous = p.yaw;
    }
  }
});

const handoffs = Array.from({ length: 6 }, (_, dock) => (['PICK', 'DROP'] as const).map(phase => ({
  station: dock < 4 ? dock : 0, stocker: dock < 4 ? 0 : dock - 4, phase,
  direction: ((phase === 'PICK') === (dock >= 4) ? 'deliver' : 'collect') as 'deliver' | 'collect',
  name: `${dock < 4 ? 'tool' : 'stocker'} ${dock < 4 ? dock : dock - 4} ${phase}`,
}))).flat();
test.each(handoffs)('real floor handoff $name clears the actual meshes without penetration', async ({ station, stocker, direction, phase }) => {
  const models = await loadRigModels(), rig = floorRig(models, MAP, FAB_DATA);
  const join = (parts: Map<string, Float64Array>) => Float64Array.from([...parts].filter(([name]) => name !== 'waferStack').flatMap(([, a]) => [...a]));
  const boxes = proxyBoxes(MAP, staticPlacements(FAB_DATA), FAB_DATA).filter(b => b.name.startsWith('floor-transfer'));
  const extension = Float64Array.from(boxes.flatMap(b => {
    const g = new BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]).toNonIndexed();
    g.applyMatrix4(new Matrix4().makeTranslation((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2));
    const values = Array.from(g.getAttribute('position').array);
    g.dispose(); return values;
  }));
    const s = FAB_DATA.layout.floorRobots.stations[station]!;
      const active: FloorActive = { id: 1, lot: 1, station, stocker, direction, phase, carrier: 'amr', requestedAt: 0, hot: false, t0: 0, t1: 24000, carrying: phase === 'DROP' };
      const start = rig.sample(active, 0), a = start.arm!;
      const ownArm = a.stocker ? `floor-stocker-arm-${a.index}` : s.arm.id;
      const world = staticTriangles(models, FAB_DATA, (entity, p) => entity !== 'floorModule' && p.id !== s.amr.id && p.id !== ownArm && Math.hypot(p.x - a.position[0], p.z - a.position[2]) < 7, [0.8, 2.5]);
      for (let t = 0; t <= 24000; t += 100) {
        const pose = rig.sample(active, t), f = pose.foup, arm = pose.arm!, c = pose.carrier;
        const foup = join(posedParts(models, 'foup', placementMatrix('foup', { id: 'lot', x: f.position[0], y: f.position[1], z: f.position[2], yaw: f.yaw })));
        const robot = join(posedParts(models, 'toolFrontRobotArm', placementMatrix('toolFrontRobotArm', { id: ownArm, x: arm.position[0], y: arm.position[1], z: arm.position[2], yaw: arm.yaw }), arm.input, [], 0, true));
        const amr = join(posedParts(models, 'amrFloorRobot', placementMatrix('amrFloorRobot', { id: s.amr.id, x: c.position[0], y: c.position[1], z: c.position[2], yaw: c.yaw }), c.input, [], 0, true));
        for (const [name, other] of [['world', world.tris], ['arm', robot], ['AMR', amr], ['extension', extension]] as const) {
          const hit = crossings(foup, other, 1e-4);
          expect(hit.count, `${station}/${stocker}/${direction}/${phase} at ${t}: FOUP/${name} depth ${hit.depth} at ${hit.at}`).toBe(0);
        }
        for (const [name, moving] of [['arm', robot], ['AMR', amr]] as const) for (const [otherName, other] of [['world', world.tris], ['extension', extension]] as const) {
          const hit = crossings(moving, other, 1e-4);
          expect(hit.count, `${station}/${stocker}/${direction}/${phase} at ${t}: ${name}/${otherName} depth ${hit.depth} at ${hit.at}`).toBe(0);
        }
      }
  rig.dispose();
}, 30_000); // The previous 32-route sweep measured83s; these12distinct physical dock/phase cases avoid duplicate geometry.

test('the authored gripper clears a FOUP mounted at its grip locator during carrying', async () => {
  const models = await loadRigModels(), rig = floorRig(models, MAP, FAB_DATA);
  for (let t = 13000; t <= 19000; t += 100) {
    const active: FloorActive = { id: 1, lot: 1, station: 0, stocker: 0, direction: 'deliver', phase: 'PICK', carrier: 'amr', requestedAt: 0, hot: false, t0: 0, t1: 24000, carrying: false };
    const pose = rig.sample(active, t), f = pose.foup, a = pose.arm!;
    const foup = Float64Array.from([...posedParts(models, 'foup', placementMatrix('foup', { id: 'foup', x: f.position[0], y: f.position[1], z: f.position[2], yaw: f.yaw }))].filter(([name]) => name !== 'waferStack').flatMap(([, p]) => [...p]));
    const arm = Float64Array.from([...posedParts(models, 'toolFrontRobotArm', placementMatrix('toolFrontRobotArm', { id: 'arm', x: a.position[0], y: a.position[1], z: a.position[2], yaw: a.yaw }), a.input, [], 0, true).values()].flatMap(p => [...p]));
    const hit = crossings(foup, arm);
    expect(hit.count, `mounted at ${t}: depth ${hit.depth} at ${hit.at}`).toBe(0);
  }
  rig.dispose();
});
