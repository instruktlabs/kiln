import { expect, test } from 'bun:test';
import { AnimationClip, AnimationMixer, BoxGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import type { FarmInstance } from '../../src/world/types';
await import('three');
const { findDoor, stepDoors, toggleDoor, doorCenter } = await import('../../src/play/doors');
const { applyTractorPose, createTractorRig, driveTractor, findTractorExit, tractorAreaBlocked, TRACTOR_EXITS } = await import('../../src/play/tractor');
const { buildFarmColliders } = await import('../../src/world/colliders');
const { createFarmSim } = await import('../../src/play/sim');
const { warmRenderables } = await import('../../src/world/prewarm');
const { FARM_STRINGS, DOOR_LABELS, doorPrompt, doorStatus } = await import('../../src/ui/strings');
const { bridgeCenter, drivingHeight, riverCenter, terrainHeight } = await import('../../src/world/site-layout');

const box = new BoxGeometry(), material = new MeshBasicMaterial();
function instance(id: string, assetId: string, object: Group, clips: AnimationClip[] = []): FarmInstance {
  object.name = id; return { id, asset: { id: assetId }, object, mixer: new AnimationMixer(object), clips, action: null, clipIndex: '' };
}
function node(parent: Object3D, name: string, at: [number, number, number] = [0, 0, 0], mesh = false): Object3D {
  const child = mesh ? new Mesh(box, material) : new Group(); child.name = name; child.position.set(...at); parent.add(child); return child;
}
/** A door pivot with one leaf mesh offset from the hinge, so the pivot-bounds centre moves as it swings. */
function hinged(root: Object3D, name: string, at: [number, number, number] = [0, 0, 0]) {
  const pivot = node(root, name, at), leaf = new Mesh(box, material); leaf.name = name + '_Leaf'; leaf.scale.set(.9, 2, .05); leaf.position.set(.45, 1, 0); pivot.add(leaf);
  return pivot;
}
const turned = (y: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), y);
function clipDoor(assetId: string, pivots: string[]) {
  const root = new Group(), ends = pivots.map((_, i) => [turned(0), turned((i ? -1 : 1) * Math.PI / 2)] as const);
  for (const name of pivots) hinged(root, name);
  const tracks = pivots.map((name, i) => new QuaternionKeyframeTrack(name + '.quaternion', [0, 2], [...ends[i]![0].toArray(), ...ends[i]![1].toArray()]));
  return { door: instance(assetId + '-0', assetId, root, [new AnimationClip('Open', 2, tracks)]), ends };
}

test('U-11 the four door mechanisms: labels, closed and open poses and live collider matrices', () => {
  const house = new Group(), front = hinged(house, 'Joint_FrontDoor', [2, 0, 0]); front.rotation.y = 1;
  const farmhouse = findDoor(instance('farmhouse-0', 'farmhouse', house))!;
  expect(farmhouse.label).toBe('farmhouse door'); expect(farmhouse.pivots.length).toBe(1); expect(farmhouse.pivots[0]).toBe(front);
  farmhouse.apply(0); expect(front.rotation.y).toBe(0); farmhouse.apply(1); expect(front.rotation.y).toBe(Math.PI * .53); farmhouse.apply(.5); expect(front.rotation.y).toBe(Math.PI * .53 * .5);
  expect(front.matrixWorld.elements[0]).toBeCloseTo(Math.cos(Math.PI * .53 * .5), 12);
  const millRoot = new Group(), millPivot = hinged(millRoot, 'DoorPivot'), mill = findDoor(instance('watermill-0', 'watermill', millRoot))!;
  expect(mill.label).toBe('mill door'); mill.apply(1); expect(millPivot.rotation.y).toBe(-Math.PI * 95 / 180);
  for (const [assetId, names, label] of [['barn', ['Joint_DoorLeft', 'Joint_DoorRight'], 'barn doors'], ['fence-gate', ['Joint_Gate'], 'paddock gate']] as const) {
    const { door, ends } = clipDoor(assetId, [...names]), found = findDoor(door)!;
    expect(found.label).toBe(label); expect(found.pivots.map(p => p.name)).toEqual([...names]);
    for (const [amount, expected] of [[0, (i: number) => ends[i]![0]], [1, (i: number) => ends[i]![1]], [.5, (i: number) => new Quaternion().slerpQuaternions(ends[i]![0], ends[i]![1], .5)]] as const) {
      found.apply(amount);
      // Keyframe values are stored as Float32Array, hence six decimal places.
      found.pivots.forEach((pivot, i) => { const q = expected(i); for (const k of ['x', 'y', 'z', 'w'] as const) expect(pivot.quaternion[k]).toBeCloseTo(q[k], 6); });
    }
  }
  expect(Object.values(DOOR_LABELS).sort()).toEqual(['barn doors', 'farmhouse door', 'mill door', 'paddock gate']);
  expect(findDoor(instance('barn-1', 'barn', new Group()))).toBeNull();
  expect(findDoor(instance('cow-0', 'cow', new Group()))).toBeNull();
  expect(() => findDoor(instance('farmhouse-1', 'farmhouse', new Group()))).toThrow('Missing door pivot farmhouse');
});

test('U-11 damp 7 convergence, status clearing, resting short of the target and reduced-motion snap', () => {
  const root = new Group(), pivot = hinged(root, 'Joint_FrontDoor'), door = findDoor(instance('farmhouse-0', 'farmhouse', root))!;
  let applied = 0; const apply = door.apply; door.apply = value => { applied++; apply(value); };
  const context = { status: toggleDoor(door), blocked: () => false }, h = 1 / 120, keep = Math.exp(-7 * h);
  expect(door.target).toBe(1); expect(context.status).toBe('Opening farmhouse door.');
  let steps = 0;
  while (context.status && steps < 1000) { stepDoors([door], h, context); steps++; }
  // 1 - amount = keep^n; the status clears at the first step within .001 of the target.
  expect(steps).toBe(Math.ceil(Math.log(.001) / Math.log(keep))); expect(1 - door.amount).toBeCloseTo(keep ** steps, 12);
  for (let i = 0; i < 2000; i++) stepDoors([door], h, context);
  const settled = door.amount, calls = applied; stepDoors([door], h, context);
  expect(applied).toBe(calls); expect(door.amount).toBe(settled);
  // Increments below 1e-5 are skipped, so the pilot's door rests just short of fully open.
  expect(1 - settled).toBeGreaterThan(0); expect((1 - settled) * (1 - keep)).toBeLessThan(1e-5);
  expect(pivot.rotation.y).toBe(Math.PI * .53 * settled);
  // Another door's status is not cleared by this door arriving.
  const other = { status: doorStatus('mill door', false), blocked: () => false }; door.target = 0; stepDoors([door], h, other); expect(other.status).toBe('Closing mill door.');
  const snap = { status: toggleDoor(door), blocked: () => false, snap: true };
  expect(snap.status).toBe('Opening farmhouse door.'); stepDoors([door], h, snap); expect(door.amount).toBe(1); expect(snap.status).toBe('');
});

test('U-11 a door that would meet Rowan reverts its step, stops where it is and says so', () => {
  const root = new Group(), pivot = hinged(root, 'DoorPivot'), door = findDoor(instance('watermill-0', 'watermill', root))!;
  door.apply(.4); door.amount = .4; door.target = 0;
  const context = { status: doorStatus(door.label, false), blocked: () => true };
  stepDoors([door], 1 / 120, context);
  expect(door.amount).toBe(.4); expect(door.target).toBe(.4); expect(pivot.rotation.y).toBe(-Math.PI * 95 / 180 * .4);
  expect(context.status).toBe('Door stopped: Rowan is in its path.'); expect(context.status).toBe(FARM_STRINGS.doorBlocked);
  // A stopped door (target .4) toggles open, as in play.mjs.
  expect(toggleDoor(door)).toBe('Opening mill door.'); expect(door.target).toBe(1);
  expect(toggleDoor(door)).toBe('Closing mill door.'); expect(door.target).toBe(0);
});

test('U-09 Farm collider selection: walk-through assets, rotors, foliage, dynamic vehicles and closed door pivots', () => {
  const ground = new Mesh(new BoxGeometry(200, 1, 200), material); ground.position.y = -.5; ground.name = 'Farm terrain and paths';
  const bridge = new Group(); node(bridge, 'Deck', [19, .1, -27], true);
  const walkers = ['farmer', 'cow', 'sheep', 'chicken', 'wheat', 'pumpkin-plant', 'cabbage-stage-2'].map((id, i) => { const g = new Group(); node(g, 'Mesh_Body', [0, 0, 0], true); g.position.x = -20 + i; return instance(id + '-0', id, g); });
  const tractorRoot = new Group(); node(tractorRoot, 'Mesh_Body', [0, 1, 0], true); node(node(tractorRoot, 'Joint_WheelRotor'), 'Mesh_Wheel', [0, 0, 0], true); tractorRoot.position.set(5, 0, 0);
  const trailerRoot = new Group(); node(trailerRoot, 'Mesh_Bed', [0, 1, 0], true); trailerRoot.position.set(8, 0, 0);
  const treeRoot = new Group(); node(treeRoot, 'Mesh_Trunk', [0, 1, 0], true); node(treeRoot, 'Mesh_Crown', [0, 3, 0], true); node(treeRoot, 'Mesh_LeafCluster', [0, 4, 0], true); treeRoot.position.set(-8, 0, 8);
  const millRoot = new Group(); node(millRoot, 'Mesh_Walls', [0, 2, 0], true); hinged(millRoot, 'DoorPivot', [1, 0, 1]); node(node(millRoot, 'Joint_Rotor'), 'Mesh_Wheel', [2, 1, 0], true); millRoot.position.set(29, 0, -29);
  const houseRoot = new Group(); node(houseRoot, 'Mesh_Walls', [0, 2, 0], true); const front = hinged(houseRoot, 'Joint_FrontDoor', [0, .4, 1]); front.rotation.y = 1; houseRoot.position.set(12, 0, -16);
  const instances = [...walkers, instance('tractor-0', 'tractor', tractorRoot), instance('trailer-0', 'trailer', trailerRoot), instance('faceted-tree-0', 'faceted-tree', treeRoot),
    instance('watermill-0', 'watermill', millRoot), instance('farmhouse-0', 'farmhouse', houseRoot)];
  const colliders = buildFarmColliders({ ground, bridge, instances });
  try {
    const list = colliders.world.colliders, triangles = (i: number) => list[i]!.geometry.getAttribute('position').count / 3;
    expect(list.map(c => [c.key, c.dynamic])).toEqual([['Static farm world', false], ['tractor-0', true], ['trailer-0', true], ['DoorPivot', true], ['Joint_FrontDoor', true]]);
    // Ground, bridge deck, tree trunk, mill walls and farmhouse walls: twelve triangles each.
    expect(triangles(0)).toBe(5 * 12); expect([1, 2, 3, 4].map(triangles)).toEqual([12, 12, 12, 12]);
    expect(colliders.stats).toEqual({ colliders: 5, dynamic: 4, doors: 2, doorPivots: 2, staticTriangles: 60, dynamicTriangles: 48 });
    expect(colliders.doors.map(d => d.label)).toEqual(['mill door', 'farmhouse door']);
    expect(front.rotation.y).toBe(0);
    expect([...colliders.ignoreVehicle]).toEqual([list[1]]);
    // The static soup is world space: the tree trunk at (-8, 1, 8) is inside it; the crown at y 3 is not.
    const inside = (x: number, y: number, z: number) => colliders.world.intersects(new Vector3(x, y, z), .1, .2);
    // Soup queries meet surfaces: each probe sits .05 m from a face of the box it tests.
    expect(inside(-8, .9, 8.45)).toBe(true); expect(inside(-8, 2.9, 8.45)).toBe(false); expect(inside(-20, .35, 0)).toBe(false);
  } finally { colliders.dispose(); }
  expect(() => buildFarmColliders({ ground, bridge: null, instances: walkers })).toThrow('Farm tractor collider is missing');
});

/** A farmer with the joints the empty-handed pose and the seat rig use, and a tractor with its joints. */
function playFixture(farmerClips?: AnimationClip[]) {
  const farmer = new Group(), pelvis = node(farmer, 'Joint_Pelvis', [0, .95, 0]), chest = node(pelvis, 'Joint_Chest', [0, .3, 0]);
  for (const [side, z] of [['Left', -.2], ['Right', .2]] as const) {
    const shoulder = node(chest, `Joint_${side}Shoulder`, [0, .25, z]), elbow = node(shoulder, `Joint_${side}Elbow`, [0, -.28, 0]);
    node(elbow, `Mesh_Consolidated_Joint_${side}Elbow_0`, [0, 0, 0], true);
    if (side === 'Right') { const hand = node(elbow, 'Joint_RightHandToolAttachment', [.15, -.035, .113]); node(hand, 'Joint_Pitchfork', [0, 0, 0], true); }
    const hip = node(pelvis, `Joint_${side}Hip`, [0, -.05, z / 2]); node(node(hip, `Joint_${side}Knee`, [0, -.382, 0]), `Joint_${side}Ankle`, [0, -.382, 0]);
  }
  const tractor = new Group(); node(tractor, 'Mesh_Body', [0, .8, 0], true); node(tractor, 'Joint_SeatAttach', [-.3, 1.2, 0]);
  node(tractor, 'Joint_SteeringWheelMount', [.3, 1.5, 0]).rotation.x = .3;
  for (const name of ['Joint_Steer_FL', 'Joint_Steer_FR', 'Joint_Wheel_FL', 'Joint_Wheel_FR', 'Joint_Wheel_RL', 'Joint_Wheel_RR']) node(tractor, name);
  const house = new Group(); hinged(house, 'Joint_FrontDoor');
  // Three bales, one across each dismount point of a tractor parked at (-20, 0, 20) facing +x.
  const shed = new Group(); for (const [x, z] of [[-20.4, 21.5], [-20.4, 18.5], [-17.8, 20]] as const) node(shed, 'Mesh_Bale', [x, 1 + terrainHeight(x, z), z], true);
  // The ground sits well below the terrain function so that dismount capsules only meet the shed.
  const ground = new Mesh(new BoxGeometry(80, 1, 80), material); ground.position.y = -10;
  const instances = [instance('farmer-yard-0', 'farmer', farmer, farmerClips ?? [new AnimationClip('Idle', 1, []), new AnimationClip('Walk', 1, [])]),
    instance('tractor-0', 'tractor', tractor), instance('farmhouse-0', 'farmhouse', house), instance('hay-bales-0', 'hay-bales', shed)];
  const colliders = buildFarmColliders({ ground, bridge: null, instances }), sim = createFarmSim({ instances, colliders });
  return { sim, colliders, farmer, tractor, door: colliders.doors[0]! };
}
const idle = { move: { x: 0, y: 0 }, run: false }, south = new Vector3(0, 0, -1);

test('U-11 nearest interaction within 2.6 m of a door and 2.5 m of the tractor, and the prompt text table', () => {
  const { sim, colliders, farmer, tractor, door } = playFixture();
  try {
    const centre = doorCenter(door, new Vector3()), at = (x: number) => { farmer.position.set(centre.x + x, 0, centre.z); sim.update(0, idle, south); };
    tractor.position.set(-30, 0, -30); tractor.updateMatrixWorld(true);
    sim.start(); expect(sim.active).toBe(true);
    at(2.59); expect(sim.nearestDoor).toBe(door); expect(sim.prompt).toBe('Open farmhouse door'); expect(sim.canInteract).toBe(true);
    door.target = 1; sim.update(0, idle, south); expect(sim.prompt).toBe('Close farmhouse door'); door.target = 0;
    at(2.61); expect(sim.nearestDoor).toBeNull(); expect(sim.prompt).toBe('Approach a door or tractor'); expect(sim.canInteract).toBe(false);
    // The tractor replaces a door only when it is within 2.5 m and nearer than that door.
    tractor.position.set(centre.x + 2.4 + 2.49, 0, centre.z); at(2.4); expect(sim.nearestDoor).toBe(door); expect(sim.nearestTractor).toBe(false);
    tractor.position.set(centre.x + 2.4 + 2.3, 0, centre.z); at(2.4); expect(sim.nearestTractor).toBe(true); expect(sim.nearestDoor).toBeNull(); expect(sim.prompt).toBe('Drive tractor');
    tractor.position.set(centre.x + 6 + 2.51, 0, centre.z); at(6); expect(sim.nearestTractor).toBe(false); expect(sim.canInteract).toBe(false);
    tractor.position.set(centre.x + 6 + 2.49, 0, centre.z); at(6); expect(sim.nearestTractor).toBe(true);
    sim.interact(); expect(sim.driving).toBe(true); expect(sim.status).toBe(FARM_STRINGS.tractorKeyboard);
    sim.update(0, idle, south); expect(sim.prompt).toBe('Leave tractor'); expect(sim.canInteract).toBe(true);
    sim.interact(); expect(sim.driving).toBe(false); expect(sim.status).toBe('');
    sim.setTouch(true); sim.update(0, idle, south); sim.interact(); expect(sim.status).toBe(FARM_STRINGS.tractorTouch); sim.setTouch(false);
    // Every dismount point behind a bale: E and Escape keep Rowan seated; a page-forced stop dismounts at the first option.
    tractor.position.set(-20, 0, 20); tractor.updateMatrixWorld(true);
    sim.interact(); expect(sim.driving).toBe(true); expect(sim.status).toBe('Exit is blocked. Drive into an open area.');
    expect(sim.stop()).toBe(false); expect(sim.active).toBe(true); expect(sim.visit('yard')).toBe(false); expect(sim.reset()).toBe(false);
    expect(sim.stop(true)).toBe(true); expect(sim.active).toBe(false); expect(sim.driving).toBe(false); expect(farmer.visible).toBe(true);
    expect(sim.canInteract).toBe(false);
  } finally { sim.dispose(); colliders.dispose(); }
});

test('U-14 tractor speed and steer damping, yaw integration, forward vector, probes and joint angles', () => {
  const { tractor, sim, colliders } = playFixture(); sim.dispose(); colliders.dispose();
  tractor.position.set(0, 0, 0); tractor.rotation.set(0, 0, 0); tractor.updateMatrixWorld(true);
  const rig = createTractorRig(tractor), s = { speed: 0, steer: 0, travel: 0 }, h = 1 / 120, rest = rig.steeringRest.clone(), probes: Vector3[] = [];
  expect(driveTractor(rig, s, 1, 1, h, p => { probes.push(p.clone()); return false; })).toBe(false);
  const speed = MathUtils.damp(0, 4, 2.5, h), steer = MathUtils.damp(0, .45, 6, h), yaw = speed * Math.tan(steer) / 1.75 * h;
  expect(s.speed).toBe(speed); expect(s.steer).toBe(steer); expect(tractor.rotation.y).toBe(yaw);
  expect(tractor.position.x).toBe(Math.cos(yaw) * (speed * h)); expect(tractor.position.z).toBe(-Math.sin(yaw) * (speed * h));
  expect(tractor.position.y).toBe(drivingHeight(tractor.position.x, tractor.position.z)); expect(s.travel).toBe(speed * h);
  const expected = [-.8, .8].map(x => tractor.localToWorld(new Vector3(x, .23, 0)));
  expect(probes.length).toBe(2); probes.forEach((p, i) => expect(p.distanceTo(expected[i]!)).toBeLessThan(1e-12));
  for (const joint of rig.steerJoints) expect(joint.rotation.y).toBe(steer);
  for (const wheel of rig.frontWheels) expect(wheel.rotation.z).toBe(-s.travel / .4);
  for (const wheel of rig.rearWheels) expect(wheel.rotation.z).toBe(-s.travel / .72);
  const wheelTurn = rest.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -steer * 1.7));
  expect(rig.steeringWheel.quaternion.toArray()).toEqual(wheelTurn.toArray());
  // Reverse eases toward 1.8 m/s at the same rate; no gas eases to rest twice as fast.
  s.speed = 0; driveTractor(rig, s, -1, 0, h, () => false); expect(s.speed).toBe(MathUtils.damp(0, -1.8, 2.5, h));
  s.speed = 2; driveTractor(rig, s, 0, 0, h, () => false); expect(s.speed).toBe(MathUtils.damp(2, 0, 5, h));
  // A blocked step restores the pose, zeroes the speed, keeps travel and still poses the joints.
  const before = tractor.position.clone(), beforeYaw = tractor.rotation.y, travel = s.travel;
  s.speed = 3; s.steer = .2;
  expect(driveTractor(rig, s, 1, 1, h, () => true)).toBe(true);
  expect(tractor.position.equals(before)).toBe(true); expect(tractor.rotation.y).toBe(beforeYaw); expect(s.speed).toBe(0); expect(s.travel).toBe(travel);
  expect(rig.steerJoints[0]!.rotation.y).toBe(s.steer);
  // The +-33 m bound is a blocked step too.
  tractor.position.set(32.99, 0, 0); tractor.rotation.set(0, 0, 0); s.speed = 4; s.steer = 0;
  expect(driveTractor(rig, s, 1, 0, h, () => false)).toBe(true); expect(tractor.position.x).toBe(32.99);
  s.travel = 1.2; applyTractorPose(rig, s); expect(rig.frontWheels[1]!.rotation.z).toBe(-1.2 / .4);
});

test('U-14 ground plan: bound, river margin outside the bridge deck, and the dismount option order', () => {
  expect(tractorAreaBlocked(33.01, 0)).toBe(true); expect(tractorAreaBlocked(0, -33.01)).toBe(true); expect(tractorAreaBlocked(0, 0)).toBe(false);
  expect(tractorAreaBlocked(5, riverCenter(5))).toBe(true);
  expect(tractorAreaBlocked(bridgeCenter[0], bridgeCenter[1])).toBe(false);
  expect(tractorAreaBlocked(bridgeCenter[0] + 1, bridgeCenter[1])).toBe(true);
  const object = new Group(); object.position.set(3, 0, -4); object.rotation.y = .7; object.updateMatrixWorld(true);
  const tried: Vector3[] = [], out = new Vector3();
  expect(findTractorExit(object, p => { tried.push(p.clone()); return tried.length === 2; }, out)).toBe(true);
  const options = TRACTOR_EXITS.map(([x, y, z]) => { const p = object.localToWorld(new Vector3(x, y, z)); p.y = terrainHeight(p.x, p.z) + .01; return p; });
  expect(TRACTOR_EXITS.map(e => [...e])).toEqual([[-.4, 0, 1.5], [-.4, 0, -1.5], [2.2, 0, 0]]);
  tried.forEach((p, i) => expect(p.distanceTo(options[i]!)).toBeLessThan(1e-12)); expect(out.distanceTo(options[1]!)).toBeLessThan(1e-12);
  tried.length = 0; expect(findTractorExit(object, () => false, out)).toBe(false); expect(tried.length).toBe(0);
});

test('U-18 Farm string table: pilot messages verbatim, four door labels, prompts and no coordinates', () => {
  const pilot = ['Use the timber bridge to cross the river.', 'Door stopped: Rowan is in its path.', 'Exit is blocked. Drive into an open area.', 'Obstacle ahead. Reverse or steer clear.',
    'Tractor controls: W/S accelerate and reverse; A/D steer. Trailer stays parked.', 'Tractor controls: use the joystick. The trailer stays parked.', 'Approach a door or tractor', 'Drive tractor', 'Leave tractor'];
  const values: string[] = Object.values(FARM_STRINGS);
  for (const text of pilot) expect(values).toContain(text);
  expect(FARM_STRINGS.walk).toBe('Walk the farm'); expect(FARM_STRINGS.overview).toBe('Back to overview'); expect(FARM_STRINGS.controls).toBe('Controls');
  expect(doorPrompt('farmhouse door', false)).toBe('Open farmhouse door'); expect(doorPrompt('mill door', true)).toBe('Close mill door');
  expect(doorStatus('barn doors', true)).toBe('Opening barn doors.'); expect(doorStatus('paddock gate', false)).toBe('Closing paddock gate.');
  const all = [...values, ...Object.values(DOOR_LABELS).flatMap(label => [doorPrompt(label, true), doorPrompt(label, false), doorStatus(label, true), doorStatus(label, false)])];
  for (const text of all) { expect(text.trim()).toBe(text); expect(text.length).toBeGreaterThan(0); expect(/\d/.test(text)).toBe(false); }
  expect(new Set(all).size).toBe(all.length);
});

test('walking is third person: the help says so and no pointer-capture strings remain', () => {
  expect(FARM_STRINGS.helpKeyboard).toMatch(/third person/); expect(FARM_STRINGS.helpTouch).toMatch(/third person/);
  for (const text of Object.values(FARM_STRINGS) as string[]) expect(text).not.toMatch(/first person|capture the mouse/i);
  expect(Object.keys(FARM_STRINGS)).not.toContain('walkCapture'); expect(Object.keys(FARM_STRINGS)).not.toContain('walkCaptured');
  expect(FARM_STRINGS.walkHint).toBe('WASD to walk · Drag to look · Scroll to zoom · Shift to run · E to interact · Escape to leave');
});

// Opt-in: the sealed r33 play controller in lockstep with the port, then the port-only B-08 fixture searches
// (about 7 s measured on this PC as a script; staged pilot delivery required).
if (process.env.ORACLE === '1') test('M2c sealed r33 play oracle: byte-identical colliders and lockstep play within 1e-9', async () => {
  await import('../../scripts/audit-play-oracle');
}, 120_000);


test('empty-handed pose follows the mixer every rendered frame, including no physics step; seat and overview retain their poses', () => {
  // Released Rowan Walk animates only the left shoulder, about z. Any mixer update
  // resets its procedural x angle, even when the subsequent fixed-step loop does no work.
  const swing = new QuaternionKeyframeTrack('Joint_LeftShoulder.quaternion', [0, 1],
    [0, 0, 0, 1, ...new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -.24).toArray()]);
  const { sim, colliders, farmer } = playFixture([new AnimationClip('Idle', 1, []), new AnimationClip('Walk', 1, [swing])]);
  const left = farmer.getObjectByName('Joint_LeftShoulder')!, right = farmer.getObjectByName('Joint_RightShoulder')!;
  const fork = farmer.getObjectByName('Joint_Pitchfork')!, h = 1 / 120, moving = { move: { x: 0, y: 1 }, run: false };
  try {
    sim.start(); sim.update(0, idle, south);
    expect(left.rotation.x).toBeCloseTo(.28, 12); expect(fork.visible).toBe(false);
    sim.update(h, moving, south); expect(sim.currentClip).toBe('Walk');
    for (const dt of [0, h / 2, h / 2, 1 / 121, 1 / 119, h, h * 2]) {
      sim.updateAnimation(dt); sim.update(dt, moving, south);
      expect(left.rotation.x).toBeCloseTo(.28, 12);
      expect(right.rotation.z).toBeCloseTo(-left.rotation.z, 12);
    }
    farmer.position.copy(sim.tractor.object.position); sim.update(0, idle, south); sim.interact();
    expect(sim.driving).toBe(true); const seated = left.quaternion.clone();
    sim.update(0, idle, south); expect(left.quaternion.equals(seated)).toBe(true);
    expect(sim.stop(true)).toBe(true); expect(fork.visible).toBe(true);
    const restored = left.quaternion.clone(); sim.update(h, moving, south);
    expect(left.quaternion.equals(restored)).toBe(true); expect(left.rotation.x).toBeCloseTo(0, 12);
  } finally { sim.dispose(); colliders.dispose(); }
});


test('empty-handed right arm borrows the relaxed left geometry, restores tool/seat state and removes only its derivative', () => {
  const { sim, colliders, farmer } = playFixture();
  const left = farmer.getObjectByName('Mesh_Consolidated_Joint_LeftElbow_0') as Mesh;
  const lower = farmer.getObjectByName('Mesh_Consolidated_Joint_RightElbow_0')!, hand = farmer.getObjectByName('Joint_RightHandToolAttachment')!;
  const elbow = farmer.getObjectByName('Joint_RightElbow')!, elbowRest = elbow.quaternion.clone();
  const derivative = farmer.getObjectByName('Mesh_EmptyHandedRightArm') as Mesh;
  let geometryDisposals = 0, materialDisposals = 0;
  left.geometry.addEventListener('dispose', () => geometryDisposals++);
  (left.material as MeshBasicMaterial).addEventListener('dispose', () => materialDisposals++);
  try {
    expect(derivative).toBeDefined(); expect(derivative.visible).toBe(false);
    expect(warmRenderables(farmer)).toContain(derivative);
    expect(derivative.geometry).toBe(left.geometry); expect(derivative.material).toBe(left.material);
    sim.start(); sim.update(0, idle, south); farmer.updateMatrixWorld(true);
    expect(derivative.visible).toBe(true); expect(lower.visible).toBe(false); expect(hand.visible).toBe(false);
    expect(elbow.quaternion.equals(elbowRest)).toBe(true);
    expect(derivative.matrixWorld.determinant()).toBeLessThan(0);
    sim.interact(); expect(sim.driving).toBe(true);
    expect(derivative.visible).toBe(false); expect(lower.visible).toBe(true); expect(hand.visible).toBe(true);
    expect(farmer.getObjectByName('Joint_Pitchfork')!.visible).toBe(false);
    sim.stop(true); expect(lower.visible).toBe(true); expect(hand.visible).toBe(true);
    expect(elbow.quaternion.equals(elbowRest)).toBe(true);
    expect(farmer.getObjectByName('Joint_Pitchfork')!.visible).toBe(true);
    sim.start(); sim.update(0, idle, south); sim.dispose(); sim.dispose();
    expect(derivative.parent).toBeNull(); expect(lower.visible).toBe(true); expect(hand.visible).toBe(true);
    const detached = new Group(); detached.add(derivative); expect(warmRenderables(detached)).not.toContain(derivative); derivative.removeFromParent();
    expect(geometryDisposals).toBe(0); expect(materialDisposals).toBe(0);
  } finally { sim.dispose(); colliders.dispose(); }
});


test('empty-hand variants retain independent visibility through Farm shadow stand-ins', async () => {
  const { shadowStandIns } = await import('@kiln-scenes/scene-kit/shadows');
  const { farmHeroAnchors } = await import('../../src/world/shadows');
  const { sim, colliders, farmer } = playFixture();
  farmer.traverse(node => { if ((node as Mesh).isMesh) (node as Mesh).castShadow = true; });
  const original = farmer.getObjectByName('Mesh_Consolidated_Joint_RightElbow_0')!, relaxed = farmer.getObjectByName('Mesh_EmptyHandedRightArm')!;
  const keep = farmHeroAnchors(sim.player);
  const shadows = shadowStandIns(farmer, { layer: 1, shadowMask: 3, isAnchor: node => keep.has(node) });
  try {
    const originalProxy = shadows.proxies.find(proxy => proxy.parent === original), relaxedProxy = shadows.proxies.find(proxy => proxy.parent === relaxed);
    expect(originalProxy).toBeDefined(); expect(relaxedProxy).toBeDefined();
    const visible = (object: Object3D) => { for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false; return true; };
    expect(visible(originalProxy!)).toBe(true); expect(visible(relaxedProxy!)).toBe(false);
    sim.start(); sim.update(0, idle, south);
    expect(visible(originalProxy!)).toBe(false); expect(visible(relaxedProxy!)).toBe(true);
    sim.interact(); expect(sim.driving).toBe(true);
    expect(visible(originalProxy!)).toBe(true); expect(visible(relaxedProxy!)).toBe(false);
  } finally { shadows.restore(); sim.dispose(); colliders.dispose(); }
});


test('player clip changes blend without resetting rendered joints, keep unit weight through reversals and retire the outgoing action', () => {
  const shoulder = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -.24), hip = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .45);
  const walk = new AnimationClip('Walk', 1, [new QuaternionKeyframeTrack('Joint_LeftShoulder.quaternion', [0, 1], [...shoulder.toArray(), ...shoulder.toArray()]),
    new QuaternionKeyframeTrack('Joint_RightHip.quaternion', [0, 1], [...hip.toArray(), ...hip.toArray()])]);
  const { sim, colliders, farmer } = playFixture([new AnimationClip('Idle', 1, []), walk]);
  sim.tractor.object.position.set(20, 0, 20); sim.tractor.object.updateMatrixWorld(true); farmer.position.set(-10, 0, 0); sim.home.copy(farmer.position);
  const left = farmer.getObjectByName('Joint_LeftShoulder')!, rightHip = farmer.getObjectByName('Joint_RightHip')!;
  const idleAction = sim.player.mixer.clipAction(sim.player.clips[0]!), walkAction = sim.player.mixer.clipAction(walk);
  const h = 1 / 120, moving = { move: { x: 0, y: 1 }, run: false };
  const update = sim.player.mixer.update.bind(sim.player.mixer); let mixerUpdates = 0, rendered = 0;
  sim.player.mixer.update = dt => { mixerUpdates++; return update(dt); };
  const tick = (input: typeof moving, dt = h, animationDelta = dt) => {
    sim.updateAnimation(animationDelta); rendered++; sim.update(dt, input, south);
    expect(mixerUpdates).toBe(rendered);
    expect(idleAction.getEffectiveWeight() + walkAction.getEffectiveWeight()).toBeCloseTo(1, 12);
  };
  try {
    sim.start(); tick(idle, 0); tick(moving);
    const before = rightHip.quaternion.clone(); tick(moving);
    expect(before.angleTo(rightHip.quaternion)).toBeLessThan(.1); // full authored entry jump is .45 radians
    for (let i = 0; i < 24; i++) tick(moving);
    expect(walkAction.isScheduled()).toBe(true); expect(idleAction.isScheduled()).toBe(false);
    const swing = left.rotation.z; tick(idle);
    expect(left.rotation.z).toBeCloseTo(swing, 6); // selecting Idle must not reset the already mixed frame
    tick(idle); expect(Math.abs(left.rotation.z - swing)).toBeLessThan(.04);
    // Freeze: neither weights nor clip time move, including a physics step and a zero-dt frame.
    const weight = walkAction.getEffectiveWeight(), time = walkAction.time, pose = rightHip.quaternion.clone();
    tick(idle, h, 0); tick(idle, 0, 0);
    expect(walkAction.getEffectiveWeight()).toBe(weight); expect(walkAction.time).toBe(time);
    expect(rightHip.quaternion.toArray()).toEqual(pose.toArray());
    // Reverse an unfinished fade repeatedly without jumping to an endpoint or resetting phase.
    for (let i = 0; i < 12; i++) {
      const oldWeight = walkAction.getEffectiveWeight(), oldTime = walkAction.time;
      tick(i % 2 ? idle : moving, h / 2); tick(i % 2 ? idle : moving, h / 2);
      expect(Math.abs(walkAction.getEffectiveWeight() - oldWeight)).toBeLessThan(.12);
      expect(walkAction.time).toBeGreaterThanOrEqual(oldTime);
    }
    for (let i = 0; i < 24; i++) tick(idle);
    expect(walkAction.isScheduled()).toBe(false); expect(idleAction.isScheduled()).toBe(true);
    for (let i = 0; i < 5; i++) tick(moving);
    farmer.position.copy(sim.tractor.object.position); sim.update(0, idle, south); sim.interact();
    expect(sim.driving).toBe(true); expect(walkAction.isScheduled()).toBe(false); expect(idleAction.isScheduled()).toBe(false);
    const seatedUpdates = mixerUpdates; sim.updateAnimation(h); expect(mixerUpdates).toBe(seatedUpdates);
    sim.interact(); sim.update(0, idle, south);
    expect(sim.driving).toBe(false); expect(idleAction.getEffectiveWeight()).toBe(1); expect(walkAction.getEffectiveWeight()).toBe(0);
    expect(farmer.getObjectByName('Mesh_EmptyHandedRightArm')!.visible).toBe(true);
    for (const reset of [() => sim.visit('yard'), () => sim.reset()]) {
      reset(); sim.update(h, idle, south); sim.updateAnimation(0); rendered++; sim.update(0, idle, south);
      expect(idleAction.getEffectiveWeight()).toBe(1); expect(walkAction.isScheduled()).toBe(false);
      expect(farmer.getObjectByName('Joint_RightHandToolAttachment')!.visible).toBe(false);
    }
    sim.stop(true); expect(walkAction.isScheduled()).toBe(false); expect(idleAction.isScheduled()).toBe(false);
    expect(farmer.getObjectByName('Joint_Pitchfork')!.visible).toBe(true);
  } finally { sim.dispose(); colliders.dispose(); }
});


test('constructing the player blend preserves an existing overview action until play explicitly selects a clip', async () => {
  const { createFarmerClipBlend } = await import('../../src/play/farmer-rig');
  const object = new Group(), player = instance('farmer-yard-0', 'farmer', object, [new AnimationClip('Idle', 1, []), new AnimationClip('Walk', 1, [])]);
  const overview = player.mixer.clipAction(player.clips[1]!).setEffectiveWeight(.6).play(); player.action = overview; player.clipIndex = '1';
  player.mixer.update(.2); const time = overview.time;
  const blend = createFarmerClipBlend(player, { Idle: '0', Walk: '1' });
  expect(overview.isScheduled()).toBe(true); expect(overview.getEffectiveWeight()).toBe(.6); expect(overview.time).toBe(time);
  expect(player.action).toBe(overview); expect(player.clipIndex).toBe('1');
  blend.select('Idle'); blend.update(0);
  expect(player.action!.getClip().name).toBe('Idle'); expect(player.action!.getEffectiveWeight()).toBe(1); expect(overview.isScheduled()).toBe(false);
  blend.reset(); expect(player.action).toBeNull(); expect(overview.getEffectiveWeight()).toBe(0);
  // An overview action chosen after stopping remains intact until the next play entry.
  overview.reset().setEffectiveWeight(.7).play(); player.action = overview; player.clipIndex = '1'; player.mixer.update(.1);
  expect(overview.getEffectiveWeight()).toBe(.7);
  blend.select('Idle'); blend.update(0); expect(player.action!.getEffectiveWeight()).toBe(1); expect(overview.isScheduled()).toBe(false);
  blend.reset(); player.mixer.uncacheRoot(object);
});
