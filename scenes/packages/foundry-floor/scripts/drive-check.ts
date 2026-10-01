// SPDX-License-Identifier: MIT
// The drive check (FF-C1 item 5): the car model drives its whole route (the split road both ways, both cross-pass
// stubs, through the roundabout four times, three turn-arounds) and every traffic lane is sampled end to end, each
// against the drawn ground, the way Golden Gate's drive check samples road contact (src/campus/drive/route.ts has the
// method). The vehicles' dimensions are measured from the approved GLBs (the bytes scripts/stage-campus.ts verifies
// and stages), exactly as the scene measures them: LOD0 with its four wheels, the wheel pivots, radius = pivot height.
//
//   bun scripts/drive-check.ts            print the report; exit 1 when a check fails
//   bun scripts/drive-check.ts --write    also write evidence/drive/contact.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUnder, nodesBounds, parseGlb, sceneTree, transformPoint, worldMatrices } from './glb';
import { vehicleModels } from './stage-campus';
import { parseCampus } from '../src/campus/data';
import type { CarBody } from '../src/campus/drive/car';
import { parseDriving, VEHICLE_TYPES, vehicleModelId } from '../src/campus/drive/driving';
import type { VehicleType } from '../src/campus/drive/driving';
import { checkDrive } from '../src/campus/drive/route';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WHEELS = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] as const;

/** A vehicle's body in its own frame (+X forward, +Y up, +Z right) from its GLB: the scene's measure (src/campus/exterior/vehicles.ts). */
export function measureVehicle(bytes: Uint8Array): CarBody {
  const file = parseGlb(bytes), tree = sceneTree(file), world = worldMatrices(tree);
  const lod0 = tree.byName.get('LOD0');
  if (lod0 === undefined) throw new Error('vehicle without LOD0');
  const wheelNodes = WHEELS.map(name => { const i = tree.byName.get(name); if (i === undefined) throw new Error(`vehicle without ${name}`); return i; });
  const box = nodesBounds(file, tree, world, i => isUnder(tree, i, lod0) || wheelNodes.some(w => isUnder(tree, i, w)));
  let radius = 0, front = -Infinity, rear = Infinity;
  const wheels = WHEELS.map((name, k) => {
    const p = transformPoint(world[wheelNodes[k]!]!, 0, 0, 0);
    radius = Math.max(radius, p[1]); front = Math.max(front, p[0]); rear = Math.min(rear, p[0]);
    return { name, offset: [p[0], p[1], p[2]] as [number, number, number], front: name.startsWith('Wheel_F') };
  });
  return {
    length: box.max[0] - box.min[0], width: box.max[2] - box.min[2], height: box.max[1] - box.min[1], wheelRadius: radius, wheelbase: front - rear, rearAxle: rear,
    centre: [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2], wheels,
  };
}

export function vehicleBodies(): Record<VehicleType, CarBody> {
  const models = new Map(vehicleModels().map(m => [m.id, m]));
  return Object.fromEntries(VEHICLE_TYPES.map(type => {
    const m = models.get(vehicleModelId(type));
    if (!m) throw new Error(`no staged vehicle ${type}`);
    return [type, measureVehicle(new Uint8Array(readFileSync(m.from)))];
  })) as Record<VehicleType, CarBody>;
}

export function runDriveCheck() {
  const campus = parseCampus(readFileSync(resolve(ROOT, 'data/campus.json'))), driving = parseDriving(readFileSync(resolve(ROOT, 'data/driving.json')));
  return checkDrive(campus, driving, vehicleBodies());
}

if (import.meta.main) {
  const report = runDriveCheck(), car = report.car, t = report.traffic;
  console.log(`drive check: ${report.ok ? 'ok' : 'FAILED'} (${report.surfaceTriangles} ground triangles; road = ${report.roadTags.join(', ')})`);
  for (const c of car.routes) {
    console.log(`car ${car.model} (${car.body.length} x ${car.body.width} m, wheelbase ${car.body.wheelbase} m) in lane ${c.lane}: ${c.ok ? 'ok' : 'FAILED'}, route ${c.completed ? 'completed' : 'NOT completed'}, ${c.metres} m, ${c.steps.samples} samples`);
    for (const leg of c.legs) console.log(`  ${leg.from} -> ${leg.to}: ${leg.metres} m in ${leg.seconds} s, top ${leg.topSpeed} m/s, path offset <= ${leg.offset} m, turned ${leg.turned}`);
    console.log(`  wheels off road ${c.steps.missing}, surfaces ${JSON.stringify(c.steps.surfaces)}; body step ${c.steps.bodyStep.m} m, surface step ${c.steps.surfaceStep.m} m, pitch step ${c.steps.pitchStep.deg} deg, gap ${c.steps.gap.m} m`);
    console.log(`  curb steps ${c.curbSteps}, least edge clearance ${c.clearance.m} m, lowest part above ${c.overhead.m} m (${c.overhead.part}), enter zone at start ${c.enterZone.atStart}, at finish ${c.enterZone.atFinish}`);
    if (c.steps.firstMissing.length) console.log(`  first off-road wheels ${JSON.stringify(c.steps.firstMissing)}`);
  }
  console.log(`traffic lanes (${t.lanes}, sampled every ${t.laneStep} m with the ${t.model}, wheelbase ${t.wheelbase} m, ends less ${t.endMargin} m): ${t.ok ? 'ok' : 'FAILED'}, ${t.steps.samples} samples, wheels off road ${t.steps.missing}, surfaces ${JSON.stringify(t.steps.surfaces)}`);
  if (t.steps.firstMissing.length) console.log(`  first off-road wheels ${JSON.stringify(t.steps.firstMissing)}`);
  if (process.argv.includes('--write')) {
    const out = resolve(ROOT, 'evidence/drive/contact.json');
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${out}`);
  }
  if (!report.ok) process.exit(1);
}
