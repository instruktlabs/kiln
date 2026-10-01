/** M2c play parity oracle (P-20 to P-24; U-09 Farm selection, U-11 and U-14 against the pilot; B-07 collider counts).
 * The sealed r33 `play.mjs`, `collision.mjs`, `interaction-rig.mjs`, `site-layout.mjs`, `terrain.mjs`,
 * `bridge.mjs` and `bvh.mjs` run in Bun, unmodified, beside the Farm port. Both receive the same sealed
 * GLBs, keys, frame times and the pilot camera's direction. Every frame compares Rowan's position,
 * rotation and every rig node, the tractor and its joints, each door, the status line, the prompt and
 * whether interaction is possible. The follow camera is not part of this oracle (B-08 covers it), so
 * Rowan's own visibility flag, which the camera owns, is excluded. No renderer, network, GPU or timing.
 * Run after staging: bun packages/farm/scripts/audit-play-oracle.ts  (ORACLE=1 runs it from the unit suite)
 * SPEC 19.8 r34 collider record: ORACLE_RELEASE=r34 ORACLE_COLLIDERS_ONLY=1 builds both collision worlds from the
 * sealed r34 pilot and GLBs, requires byte-identical soups, freezes play-colliders-r34.json and stops before the lockstep.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import { buildPlacements } from '../src/world/placements';
import { prepareFarm } from '../src/world/prepare';
import { makeBridge } from '../src/world/bridge';
import { buildFarmColliders } from '../src/world/colliders';
import { createFarmSim, FARM_WALK_RULES } from '../src/play/sim';
import { stepCapsule } from '@kiln-scenes/scene-kit/collision';
import type { MoverState } from '@kiln-scenes/scene-kit/collision';
import { doorCenter } from '../src/play/doors';
import { FARM_STRINGS, DOOR_LABELS, doorPrompt, doorStatus } from '../src/ui/strings';
import { applyTractorPose, driveTractor, findTractorExit, TRACTOR_EXITS, TRACTOR_PROBE, TRACTOR_PROBES, tractorAreaBlocked } from '../src/play/tractor';
import { drivingHeight, onBridge, terrainHeight } from '../src/world/site-layout';
import { FARM_CAMERA, FARM_DESTINATIONS, FARM_TRACTOR, FARM_WALK } from '../src/constants';
import type { FarmDestination } from '../src/play/destinations';

const release = process.env.ORACLE_RELEASE ?? 'r33';
if (release !== 'r33' && release !== 'r34') throw Error('ORACLE_RELEASE is r33 or r34');
const base = resolve(`.tmp/pilot-${release}`), receipts = JSON.parse(readFileSync(resolve(base, 'delivery.json'), 'utf8')), hashes: Record<string, string> = {};
function read(name: string) {
  const bytes = readFileSync(resolve(base, name)), hash = createHash('sha256').update(bytes).digest('hex'), receipt = receipts.files[name];
  if (!receipt || receipt.bytes !== bytes.length || receipt.sha256 !== 'sha256:' + hash) throw Error('Sealed member mismatch: ' + name);
  hashes[name] = hash; return bytes;
}
const source = (name: string) => new TextDecoder().decode(read('scene/' + name));
// Every sealed module a pilot import can reach is verified before the first import.
for (const name of ['play.mjs', 'collision.mjs', 'interaction-rig.mjs', 'site-layout.mjs', 'terrain.mjs', 'bridge.mjs', 'bvh.mjs']) read('scene/' + name);
const sealed = async <M>(name: string) => await import(new URL('file:///' + resolve(base, 'scene', name).replaceAll('\\', '/')).href) as M;
const manifest = JSON.parse(source('scene.json')), viewer = source('viewer.mjs');
const { createFarmPlay } = await sealed<{ createFarmPlay: Function }>('play.mjs');
const { makeTerrainGeometry: pilotTerrain } = await sealed<{ makeTerrainGeometry: Function }>('terrain.mjs');
const { makeBridge: pilotBridge } = await sealed<{ makeBridge: Function }>('bridge.mjs');
const { MeshBVH: PilotBVH } = await sealed<{ MeshBVH: unknown }>('bvh.mjs');

const models = new Map(), textures = new Map<number, T.Texture>(), loader = new GLTFLoader();
loader.register(() => ({ name: 'COUNT_ONLY_NO_IMAGE_DECODE', loadTexture(index: number) { let t = textures.get(index); if (!t) { t = new T.Texture(); textures.set(index, t); } return Promise.resolve(t); } }));
for (const asset of manifest.assets) { textures.clear(); const b = read('scene/' + asset.file); models.set(asset.id, await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '')); }

// ---- Pilot: sealed placement and clip code, then the sealed play controller, in viewer.mjs order.
const planting = new Function(source('planting.mjs').replaceAll('export ', '') + ';return{soilPartName,applyPlanting};')();
const clipScale = new Function(source('scene-motion.mjs').replaceAll('export ', '') + ';return sceneClipTimeScale;')();
const chooseStart = viewer.indexOf('function chooseClip('), chooseEnd = viewer.indexOf('\nconst playbackLabel', chooseStart), placementStart = viewer.indexOf(' for(const placement of manifest.layout.placements)'), placementEnd = viewer.indexOf('\n play=createFarmPlay', placementStart), initialStart = viewer.indexOf(' for(const i of instances){const preferred='), initialEnd = viewer.indexOf('\n', initialStart + 1);
if ([chooseStart, chooseEnd, placementStart, placementEnd, initialStart, initialEnd].some(n => n < 0)) throw Error('Pilot extraction marker missing');
const pilotScene = new T.Scene(), pilotInstances: any[] = [];
new Function('THREE', 'clone', 'manifest', 'models', 'scene', 'instances', 'soilPartName', 'applyPlanting', viewer.slice(placementStart, placementEnd))(T, clone, manifest, models, pilotScene, pilotInstances, planting.soilPartName, planting.applyPlanting);
const pilotChoose = new Function('THREE', 'sceneClipTimeScale', viewer.slice(chooseStart, chooseEnd) + ';return chooseClip;')(T, clipScale);
const wood = new T.MeshStandardMaterial(), pilotGround = new T.Mesh(pilotTerrain(T, manifest.layout), wood), pilotBridgeMesh = pilotBridge(T, wood);
pilotScene.add(pilotGround, pilotBridgeMesh);
const elements = new Map<string, any>(), element = (id: string) => { let e = elements.get(id); if (!e) { e = { id, textContent: '', hidden: false, disabled: true, value: '', onclick: null, onchange: null }; elements.set(id, e); } return e; };
const globals = globalThis as any, previous = { document: globals.document, window: globals.window };
globals.document = { getElementById: element, addEventListener() {}, removeEventListener() {} };
globals.window = { addEventListener() {}, removeEventListener() {} };
const camera = new T.PerspectiveCamera(40, 16 / 9, .02, 250); camera.position.set(-61, 56, 58);
/** OrbitControls reduced to what play.mjs reads; `update` only re-aims the camera. */
const controls = { target: new T.Vector3(0, 0, -2), maxPolarAngle: .495 * Math.PI, update() { camera.lookAt(this.target); return true; }, addEventListener() {}, removeEventListener() {} };
controls.update();
const pilot = createFarmPlay(T, PilotBVH, { instances: pilotInstances, ground: pilotGround, bridge: pilotBridgeMesh, camera, controls, canvas: { focus() {} }, chooseClip: pilotChoose, onChange() {} });
new Function('instances', 'chooseClip', viewer.slice(initialStart, initialEnd))(pilotInstances, pilotChoose);

// ---- Port: the buildFarmWorld order (placements, prepared ground soup, bridge, colliders, sim, clips).
const portScene = new T.Scene(), placements = buildPlacements({ models } as LoadedPack, manifest.layout);
while (placements.root.children.length) portScene.add(placements.root.children[0]!);
const prepared = prepareFarm(new TextEncoder().encode(JSON.stringify(manifest.layout)).buffer as ArrayBuffer);
const portGround = new T.Mesh(prepared.groundCollision, wood); portGround.name = pilotGround.name;
const portBridge = makeBridge(wood); portScene.add(portBridge);
const colliders = buildFarmColliders({ ground: portGround, bridge: portBridge, instances: placements.instances });
const sim = createFarmSim({ instances: placements.instances, colliders });
placements.initializeClips();

// ---- Collision worlds: order, kind, triangle count and the exact soup bytes.
const soup = (geometry: T.BufferGeometry) => { const a = geometry.getAttribute('position').array as Float32Array; return createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex'); };
const describe = (world: { colliders: readonly any[] }) => world.colliders.map(c => ({ key: String(c.key ?? c.name), dynamic: !!c.dynamic, triangles: c.geometry.getAttribute('position').count / 3, sha256: soup(c.geometry) }));
const pilotColliders = describe(pilot.world), portColliders = describe(colliders.world);
assert.equal(portColliders.length, pilotColliders.length, 'collider count');
for (let i = 0; i < pilotColliders.length; i++) {
  const p = pilotColliders[i]!, q = portColliders[i]!;
  assert.deepEqual({ dynamic: q.dynamic, triangles: q.triangles, sha256: q.sha256 }, { dynamic: p.dynamic, triangles: p.triangles, sha256: p.sha256 }, `collider ${i} ${p.key}`);
}
assert.deepEqual(sim.doors.map(d => [d.instance.id, d.label, d.pivots.map(p => p.name)]), pilot.doors.map((d: any) => [d.instance.id, d.label, d.pivots.map((p: any) => p.name)]), 'doors');

if (process.env.ORACLE_COLLIDERS_ONLY === '1') {
  // The farmhouse's share of the static soup: the same selection rules without the farmhouse instances.
  const withoutFarmhouse = buildFarmColliders({ ground: portGround, bridge: portBridge, instances: placements.instances.filter(instance => instance.asset.id !== 'farmhouse') });
  const counts = (list: typeof pilotColliders) => ({ colliders: list.length, dynamic: list.filter(c => c.dynamic).length, staticTriangles: list.filter(c => !c.dynamic).reduce((n, c) => n + c.triangles, 0),
    dynamicTriangles: list.filter(c => c.dynamic).reduce((n, c) => n + c.triangles, 0), doors: pilot.doors.length, doorPivots: pilot.doors.reduce((n: number, d: any) => n + d.pivots.length, 0) });
  const frozen = { source: `Sealed ${release} play.mjs collision world (receipt-verified), frozen by audit-play-oracle.ts`, ...counts(pilotColliders), keys: pilotColliders.map(c => ({ key: c.key, dynamic: c.dynamic, triangles: c.triangles })) };
  const stats = colliders.stats;
  assert.deepEqual({ colliders: stats.colliders, dynamic: stats.dynamic, staticTriangles: stats.staticTriangles, dynamicTriangles: stats.dynamicTriangles, doors: stats.doors, doorPivots: stats.doorPivots }, counts(pilotColliders), 'collider stats');
  const path = resolve(`packages/farm/fixtures/${release === 'r33' ? 'play-colliders.json' : `play-colliders-${release}.json`}`);
  if (existsSync(path)) assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), frozen, `Frozen ${release} collider oracle changed`); else writeFileSync(path, JSON.stringify(frozen, null, 2) + '\n');
  mkdirSync('evidence/m2/m2d', { recursive: true });
  const record = { release, method: `Sealed ${release} play.mjs, collision.mjs and bvh.mjs (receipt-verified) beside the Farm port on the sealed ${release} GLBs; every collision soup byte-identical`,
    pilot: pilotColliders, port: portColliders, fixture: path.slice(resolve('.').length + 1).replaceAll('\\', '/'),
    farmhouseStaticTriangles: frozen.staticTriangles - withoutFarmhouse.stats.staticTriangles, staticTrianglesWithoutFarmhouse: withoutFarmhouse.stats.staticTriangles, hashes };
  writeFileSync(`evidence/m2/m2d/colliders-${release}.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ release, colliders: frozen.colliders, staticTriangles: frozen.staticTriangles, farmhouseStaticTriangles: record.farmhouseStaticTriangles, staticTrianglesWithoutFarmhouse: record.staticTrianglesWithoutFarmhouse }));
  withoutFarmhouse.dispose(); colliders.dispose(); placements.dispose(); prepared.dispose(); pilot.dispose();
  globals.document = previous.document; globals.window = previous.window;
  process.exit(0);
}

// ---- Lockstep driver.
const pilotPlayer = pilot.player, pilotTractor = pilot.tractor, world = colliders.world;
assert.equal(pilotPlayer.id, sim.player.id); assert.equal(pilotTractor.id, sim.tractor.id);
assert(pilotPlayer.object !== sim.player.object && pilotTractor.object !== sim.tractor.object, 'two independent worlds');
const nodes = (root: T.Object3D) => { const list: T.Object3D[] = []; root.traverse(n => { list.push(n); }); return list; };
const pilotRig = nodes(pilotPlayer.object), portRig = nodes(sim.player.object), pilotCar = nodes(pilotTractor.object), portCar = nodes(sim.tractor.object);
assert.deepEqual(portRig.map(n => n.name), pilotRig.map(n => n.name), 'farmer rig topology'); assert.deepEqual(portCar.map(n => n.name), pilotCar.map(n => n.name), 'tractor rig topology');
const forward = new T.Vector3(), keys = new Set<string>(), frameTimes = [1 / 60, 1 / 60, 1 / 30, 1 / 144, 1 / 60, .12, 1 / 90, 1 / 75];
let frame = 0, compared = 0;
const worst = { position: 0, rotation: 0, rig: 0, tractor: 0, doors: 0 };
const seen = { statuses: new Set<string>(), prompts: new Set<string>() }, counts = { blockedSteps: 0, exitVetoes: 0 }, stands: Record<string, number[]> = {}, scenario: Record<string, unknown> = { stands };
const defaultHint = 'WASD / arrows to move; drag to look; E to interact.';
const pilotStatus = () => { const status = String(element('play-state').textContent).split(' · ').slice(2).join(' · '); return status === defaultHint ? '' : status; };
function input() {
  const has = (code: string) => keys.has(code);
  return { move: { x: Number(has('KeyD')) - Number(has('KeyA')), y: Number(has('KeyW')) - Number(has('KeyS')) }, run: has('ShiftLeft') };
}
/** Largest component difference of two quaternions, sign-agnostic (q and -q are one rotation; norms are not assumed to be 1). */
function turn(a: T.Quaternion, b: T.Quaternion) {
  const minus = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));
  const plus = Math.max(Math.abs(a.x + b.x), Math.abs(a.y + b.y), Math.abs(a.z + b.z), Math.abs(a.w + b.w));
  return Math.min(minus, plus);
}
/** Largest position or rotation difference over paired nodes; Infinity when visibility differs (the root optionally excepted). */
function deviation(a: readonly T.Object3D[], b: readonly T.Object3D[], rootVisibility = true) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!, q = b[i]!;
    d = Math.max(d, p.position.distanceTo(q.position), turn(p.quaternion, q.quaternion));
    if (p.visible !== q.visible && (i > 0 || rootVisibility)) d = Infinity;
  }
  return d;
}
/** `dom` is false between frames: play.mjs writes the status line and prompt only inside update(). */
function compare(label: string, dom = true) {
  const a = pilotPlayer.object as T.Object3D, b = sim.player.object;
  const position = a.position.distanceTo(b.position), rotation = Math.abs(a.rotation.x - b.rotation.x) + Math.abs(a.rotation.y - b.rotation.y) + Math.abs(a.rotation.z - b.rotation.z);
  const rig = deviation(pilotRig, portRig, false), tractor = deviation(pilotCar, portCar);
  let doors = 0;
  for (let i = 0; i < sim.doors.length; i++) {
    const p = pilot.doors[i], q = sim.doors[i]!;
    doors = Math.max(doors, Math.abs(p.amount - q.amount), Math.abs(p.target - q.target), deviation(p.pivots, q.pivots));
  }
  worst.position = Math.max(worst.position, position); worst.rotation = Math.max(worst.rotation, rotation); worst.rig = Math.max(worst.rig, rig);
  worst.tractor = Math.max(worst.tractor, tractor); worst.doors = Math.max(worst.doors, doors);
  const context = `${label} (frame ${frame})`;
  assert.equal(sim.active, pilot.active, context + ' active'); assert.equal(sim.driving, pilot.driving, context + ' driving');
  if (!(position < 1e-9 && rotation < 1e-9 && rig < 1e-9 && tractor < 1e-9 && doors < 1e-9)) {
    for (const [name, x, y] of [['rig', pilotRig, portRig], ['tractor', pilotCar, portCar]] as const) for (let i = 0; i < x.length; i++) {
      const p = x[i]!, q = y[i]!, d = Math.max(p.position.distanceTo(q.position), turn(p.quaternion, q.quaternion));
      if (d > 1e-9 || (i > 0 && p.visible !== q.visible)) console.log(name, p.name, d, p.position.toArray(), q.position.toArray(), p.quaternion.toArray(), q.quaternion.toArray(), p.visible, q.visible);
    }
  }
  assert(position < 1e-9 && rotation < 1e-9 && rig < 1e-9 && tractor < 1e-9 && doors < 1e-9, `${context}: position ${position} rotation ${rotation} rig ${rig} tractor ${tractor} doors ${doors}`);
  if (pilot.active && dom) {
    const prompt = String(element('interact').textContent).replace(/ \(E\)$/, '');
    assert.equal(sim.status, pilotStatus(), context + ' status'); assert.equal(sim.prompt, prompt, context + ' prompt');
    assert.equal(sim.canInteract, !element('interact').disabled, context + ' canInteract');
    seen.statuses.add(sim.status); seen.prompts.add(sim.prompt);
  }
  compared++;
}
/** viewer.mjs frame: every mixer, play.update, then updateCamera. Port: farm-mixers (400) then farm-sim (500). */
function step(frames: number, label: string) {
  for (let i = 0; i < frames; i++, frame++) {
    const dt = Math.min(.1, frameTimes[frame % frameTimes.length]!);
    for (const instance of pilotInstances) if (instance.action) instance.mixer.update(dt);
    const player = sim.active ? sim.player : undefined;
    placements.updateMixers(dt, player); if (player?.action) player.mixer.update(dt);
    camera.getWorldDirection(forward);
    const before = sim.blockedSteps;
    pilot.update(dt); if (pilot.active) pilot.updateCamera();
    sim.update(dt, input(), forward, false);
    counts.blockedSteps += sim.blockedSteps - before;
    compare(label);
  }
}
function press(...codes: string[]) {
  assert(pilot.active && sim.active, 'keys only reach play while it is active');
  for (const code of [...keys]) { keys.delete(code); pilot.control(code, false); }
  for (const code of codes) { keys.add(code); pilot.control(code, true); }
}
function interact() { pilot.control('KeyE', true); pilot.control('KeyE', false); sim.interact(); compare('interact', false); }
function escape() {
  pilot.control('Escape', true); pilot.control('Escape', false);
  const left = sim.stop(); if (left) keys.clear(); else counts.exitVetoes++;
  compare('escape', false); return left;
}
function visit(name: FarmDestination) { assert.equal(sim.visit(name), pilot.visit(name), 'visit ' + name); compare('visit ' + name, false); }
/** Identical placements in both worlds (the two collision worlds are byte-identical, checked above). */
function placePlayer(at: T.Vector3, yaw: number) { for (const node of [pilotPlayer.object, sim.player.object] as T.Object3D[]) { node.position.copy(at); node.rotation.set(0, yaw, 0); node.updateMatrixWorld(true); } }
function placeTractor(x: number, z: number, yaw: number) {
  for (const node of [pilotTractor.object, sim.tractor.object] as T.Object3D[]) { node.position.set(x, drivingHeight(x, z), z); node.rotation.set(0, yaw, 0); node.updateMatrixWorld(true); }
}
const probe = new T.Vector3(), centre = new T.Vector3();
/** A free standing point on the ground or a porch-height floor (never on rails, sills or roofs). */
function standing(x: number, z: number): T.Vector3 | null {
  probe.set(x, terrainHeight(x, z) + .6, z); const floor = world.floor(probe, 1.5);
  if (!Number.isFinite(floor)) return null;
  probe.y = floor + .01; return world.intersects(probe, FARM_WALK.radius, FARM_WALK.height) ? null : probe.clone();
}
function nearestDoorTo(point: T.Vector3) {
  let best = -1, distance = 2.6;
  sim.doors.forEach((door, index) => { doorCenter(door, centre); const d = Math.hypot(point.x - centre.x, point.z - centre.z); if (d < distance) { distance = d; best = index; } });
  return best;
}
/** The pose a drive step would accept: inside the ground plan and both probes clear. */
function tractorFree(x: number, z: number, yaw: number) {
  if (tractorAreaBlocked(x, z)) return false;
  const object = sim.tractor.object, saved = object.position.clone(), savedYaw = object.rotation.y;
  object.position.set(x, drivingHeight(x, z), z); object.rotation.set(0, yaw, 0); object.updateMatrixWorld(true);
  let free = true;
  for (const px of TRACTOR_PROBES) { probe.set(px, TRACTOR_PROBE.y, 0); object.localToWorld(probe); if (world.intersects(probe, TRACTOR_PROBE.radius, TRACTOR_PROBE.height, colliders.ignoreVehicle)) free = false; }
  object.position.copy(saved); object.rotation.set(0, savedYaw, 0); object.updateMatrixWorld(true);
  return free;
}
/** Every dismount point overlaps geometry (the play.mjs exit test, which includes the tractor itself). */
function exitsBlocked(x: number, z: number, yaw: number) {
  const object = sim.tractor.object, saved = object.position.clone(), savedYaw = object.rotation.y;
  object.position.set(x, drivingHeight(x, z), z); object.rotation.set(0, yaw, 0); object.updateMatrixWorld(true);
  let blocked = true;
  for (const exit of TRACTOR_EXITS) {
    probe.set(exit[0], exit[1], exit[2]); object.localToWorld(probe); probe.y = terrainHeight(probe.x, probe.z) + .01;
    if (!world.intersects(probe, FARM_WALK.radius, FARM_WALK.height)) { blocked = false; break; }
  }
  object.position.copy(saved); object.rotation.set(0, savedYaw, 0); object.updateMatrixWorld(true);
  return blocked;
}
const doorIndex = (id: string) => { const index = sim.doors.findIndex(d => d.instance.asset.id === id); assert(index >= 0, 'door ' + id); return index; };
/** Mount wherever the tractor stands: Rowan steps in from a free point within reach. */
function mountHere(label: string) {
  const t = sim.tractor.object.position;
  for (let r = 1.6; r <= 2.4; r += .2) for (let k = 0; k < 32; k++) {
    const a = k / 32 * Math.PI * 2, s = standing(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r);
    if (!s) continue;
    placePlayer(s, 0); step(2, label);
    if (sim.nearestTractor) { interact(); assert(sim.driving, label + ' mounted'); stands[label] = s.toArray(); return; }
  }
  throw Error('No mount point for ' + label);
}

// ---- Scenarios.
pilot.start(); sim.start(); compare('start', false);
step(30, 'idle');
press('KeyW'); step(90, 'walk');
press('KeyW', 'ShiftLeft'); step(60, 'run');
press('KeyD'); step(45, 'strafe');
press('KeyW', 'KeyA'); step(60, 'diagonal');
press('KeyS'); step(40, 'back');
press(); step(20, 'stand');
// Farmhouse wall, door leaf and porch riser.
visit('house'); press('KeyW'); step(180, 'house wall');
{
  // Rowan held by the wall: no drift over the last 60 frames, and a probe 5 cm further along the
  // camera direction still meets the static world with every dynamic collider (doors, tractor) ignored.
  const early = sim.player.object.position.clone(); step(60, 'house wall');
  const stop = sim.player.object.position.clone(); camera.getWorldDirection(forward);
  const along = new T.Vector3(forward.x, 0, forward.z).normalize(), ahead = stop.clone().addScaledVector(along, .05);
  const dynamic = new Set(world.colliders.filter(c => c.dynamic));
  // staticAhead false: from the house destination the closed front door leaf (a dynamic collider) holds Rowan.
  scenario.frontDoorContact = { stop: stop.toArray(), drift: early.distanceTo(stop), along: along.toArray(), staticAhead: world.intersects(ahead, FARM_WALK.radius, FARM_WALK.height, dynamic) };
}
press('KeyA', 'KeyW'); step(120, 'house porch'); press(); step(10, 'house stop');
// Each door both ways, each time from a free spot where that door is the nearest interaction
// (an opening leaf moves the pivot-bounds centre that play.mjs measures from).
/** True when the leaf would meet Rowan anywhere between closed and open (port world; the pose is restored). */
function inSwing(index: number, at: T.Vector3) {
  const door = sim.doors[index]!, amount = door.amount; let hit = false;
  for (let i = 0; i <= 20 && !hit; i++) { door.apply(i / 20); hit = world.intersects(at, FARM_WALK.radius - FARM_WALK.doorClearance, FARM_WALK.height); }
  door.apply(amount); return hit;
}
function standBy(index: number, label: string) {
  doorCenter(sim.doors[index]!, centre); const at = centre.clone();
  for (let r = 1.2; r <= 2.4; r += .2) for (let k = 0; k < 32; k++) {
    const a = k / 32 * Math.PI * 2, s = standing(at.x + Math.cos(a) * r, at.z + Math.sin(a) * r);
    if (!s || nearestDoorTo(s) !== index || Math.hypot(s.x - sim.tractor.object.position.x, s.z - sim.tractor.object.position.z) < 2.6 || inSwing(index, s)) continue;
    placePlayer(s, 0); step(4, label);
    if (sim.nearestDoor === sim.doors[index]) { stands[label] = s.toArray(); return; }
  }
  throw Error('No free stand for ' + label);
}
for (const id of ['farmhouse', 'barn', 'watermill', 'fence-gate'] as const) {
  const index = doorIndex(id), label = sim.doors[index]!.label;
  standBy(index, id + ' before opening'); interact(); assert.equal(sim.status, doorStatus(label, true)); step(150, id + ' opening');
  standBy(index, id + ' before closing'); interact(); assert.equal(sim.status, doorStatus(label, false)); step(150, id + ' closing');
  assert(sim.doors[index]!.amount < .001 && sim.doors[index]!.target === 0, id + ' closed');
}
// A door stopped by Rowan: open the farmhouse door, stand inside its swing, then close it.
{
  const index = doorIndex('farmhouse'), door = sim.doors[index]!, hinge = door.pivots[0]!.getWorldPosition(new T.Vector3());
  visit('house'); step(5, 'house again');
  door.target = 1; pilot.doors[index].target = 1; step(200, 'door opened');
  let inside: T.Vector3 | null = null;
  for (let r = .35; r <= 1 && !inside; r += .05) for (let k = 0; k < 72 && !inside; k++) {
    const a = k / 72 * Math.PI * 2, s = standing(hinge.x + Math.cos(a) * r, hinge.z + Math.sin(a) * r);
    if (!s) continue;
    const saved = door.amount; door.apply(.5); const hit = world.intersects(s, FARM_WALK.radius - FARM_WALK.doorClearance, FARM_WALK.height); door.apply(saved);
    if (hit) inside = s;
  }
  assert(inside, 'a standing point inside the farmhouse door swing');
  stands['farmhouse doorway'] = inside.toArray(); placePlayer(inside, 0); step(3, 'in the doorway'); scenario.doorwayNearest = sim.nearestDoor === door;
  door.target = 0; pilot.doors[index].target = 0; step(90, 'door stopped');
  assert.equal(sim.status, FARM_STRINGS.doorBlocked); assert(door.amount > .4, 'the door stopped before closing');
}
// The river rule on the north bank, then the bridge crossing at a run.
// A north-bank start from which walking south meets the river rule before any collider (scratch mover, port world).
{
  let start: T.Vector3 | null = null;
  const south = new T.Vector3(0, 0, -1);
  for (let x = 6; x <= 30 && !start; x += .5) {
    const s = standing(x, -22.7); if (!s) continue;
    const mover: MoverState = { position: s.clone(), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
    for (let i = 0; i < 720 && !mover.status; i++) stepCapsule(mover, { x: 0, y: 1 }, false, south, 1 / 120, world, FARM_WALK_RULES);
    if (mover.status === FARM_STRINGS.river) start = s;
  }
  assert(start, 'a north-bank approach to the river');
  scenario.riverStart = start.toArray(); visit('bridge'); press('KeyD'); step(120, 'bank east'); placePlayer(start, Math.PI / 2); press('KeyW'); step(300, 'river edge'); scenario.riverEdge = sim.player.object.position.toArray(); press(); step(5, 'river stop');
}
assert(seen.statuses.has(FARM_STRINGS.river), 'the river rule stopped Rowan');
visit('bridge'); press('KeyW', 'ShiftLeft');
{
  let deck = -Infinity; const from = sim.player.object.position.toArray();
  for (let i = 0; i < 360; i++) { step(1, 'bridge crossing'); const p = sim.player.object.position; if (onBridge(p.x, p.z)) deck = Math.max(deck, p.y); }
  scenario.bridge = { from, end: sim.player.object.position.toArray(), deckMaxY: deck };
}
press(); step(10, 'south bank');
// Tractor from its placement: mount, drive, steer, reverse and dismount at a free exit.
const blockedBeforeDrive = counts.blockedSteps; visit('tractor'); step(5, 'at the tractor'); scenario.tractorStart = { position: sim.tractor.object.position.toArray(), yaw: sim.tractor.object.rotation.y, scale: sim.tractor.object.scale.toArray() }; assert(sim.nearestTractor, 'tractor in reach'); interact(); assert(sim.driving, 'mounted');
press('KeyW'); step(150, 'drive'); press('KeyW', 'KeyA'); step(120, 'steer left'); press('KeyS'); step(120, 'reverse');
press('KeyW', 'KeyD'); step(90, 'steer right'); press(); step(40, 'coast'); interact(); step(30, 'dismounted'); assert(!sim.driving, 'dismounted'); scenario.driveBlockedSteps = counts.blockedSteps - blockedBeforeDrive;
// The +-33 m bound: a clear lane toward +x.
{
  let lane: number | null = null;
  for (let z = -8; z <= 20 && lane === null; z += .5) { let clear = true; for (let x = 29; x <= 33 && clear; x += .25) clear = tractorFree(x, z, 0); if (clear) lane = z; }
  assert(lane !== null, 'a clear lane to the bound');
  placeTractor(29, lane, 0); scenario.boundStart = [29, drivingHeight(29, lane), lane, 0]; mountHere('bound lane'); press('KeyW'); step(200, 'to the bound'); press(); step(20, 'bound stop');
  const x = sim.tractor.object.position.x; assert(x <= 33 && x > 32.5, 'held at the bound, x ' + x); scenario.bound = { lane, heldAtX: x };
  interact(); step(10, 'off at the bound'); assert(!sim.driving);
}
// An obstacle: drive into the barn. A free straight run-up of at least 3 m toward one of the barn's
// faces, whose first blocked pose has its front probe at the barn's bounds; the pose at rest is free.
{
  const barnObject = placements.instances.find(i => i.asset.id === 'barn')!.object, box = new T.Box3().setFromObject(barnObject);
  const sides = [
    { yaw: Math.PI, dx: -1, dz: 0 }, { yaw: 0, dx: 1, dz: 0 }, { yaw: Math.PI / 2, dx: 0, dz: -1 }, { yaw: -Math.PI / 2, dx: 0, dz: 1 },
  ];
  let found: { start: [number, number]; contact: [number, number]; yaw: number; runUp: number } | null = null;
  search: for (const side of sides) {
    const lateral = side.dx ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
    for (let l = lateral[0]! + 1; l <= lateral[1]! - 1; l += .5) {
      // From 10 m outside the face toward it: the first free pose, then free poses until the first blocked one.
      const face = side.dx > 0 ? box.min.x : side.dx < 0 ? box.max.x : side.dz > 0 ? box.min.z : box.max.z;
      const along = (t: number): [number, number] => side.dx ? [face - side.dx * t, l] : [l, face - side.dz * t];
      let t = 10; while (t > 0 && !tractorFree(...along(t), side.yaw)) t -= .25;
      const first = t; while (t > 0 && tractorFree(...along(t - .25), side.yaw)) t -= .25;
      if (first - t < 3 || t <= 0) continue;
      const [cx, cz] = along(t - .25), front = new T.Vector3(cx + side.dx * FARM_TRACTOR.probeX, drivingHeight(cx, cz) + TRACTOR_PROBE.y, cz + side.dz * FARM_TRACTOR.probeX);
      if (box.distanceToPoint(front) > TRACTOR_PROBE.radius + .05 || tractorAreaBlocked(cx, cz)) continue;
      found = { start: along(Math.min(first, t + 6)), contact: along(t), yaw: side.yaw, runUp: Math.min(first, t + 6) - t }; break search;
    }
  }
  assert(found, 'a clear run-up to the barn');
  const [sx, sz] = found.start;
  scenario.barnApproach = [sx, drivingHeight(sx, sz), sz, found.yaw]; placeTractor(sx, sz, found.yaw); mountHere('barn approach');
  const blocked = counts.blockedSteps; press('KeyW'); step(300, 'into the barn'); press(); step(20, 'obstacle stop');
  const stop = sim.tractor.object.position, gap = Math.hypot(stop.x - found.contact[0], stop.z - found.contact[1]);
  scenario.barn = { contact: found.contact, stop: [stop.x, stop.z], runUp: found.runUp, gapToContact: gap };
  assert(counts.blockedSteps > blocked && gap < .26, 'stopped by the barn, ' + gap + ' m from the sampled contact');
}
// Every exit blocked: a drivable tractor pose whose three dismount points all overlap geometry.
{
  const saved = sim.tractor.object.position.clone(), savedYaw = sim.tractor.object.rotation.y;
  let wedge: [number, number, number] | null = null;
  search: for (let x = -32; x <= 32; x += 1) for (let z = -32; z <= 32; z += 1) for (let k = 0; k < 8; k++) {
    const yaw = k * Math.PI / 4;
    if (tractorAreaBlocked(x, z) || !exitsBlocked(x, z, yaw) || !tractorFree(x, z, yaw)) continue;
    wedge = [x, z, yaw]; break search;
  }
  assert(wedge, 'a tractor pose with every exit blocked');
  // Still driving from the barn: carry the tractor into the wedge, then try to leave.
  assert(sim.driving); placeTractor(wedge[0], wedge[1], wedge[2]); step(3, 'wedged');
  interact(); step(3, 'exit blocked'); assert.equal(sim.status, FARM_STRINGS.exitBlocked); assert(sim.driving);
  assert.equal(escape(), false, 'Escape keeps play while every exit is blocked'); assert(pilot.active && pilot.driving); step(3, 'still driving');
  assert.equal(sim.visit('yard'), false); assert.equal(pilot.visit('yard'), false); compare('visit refused', false);
  placeTractor(saved.x, saved.z, savedYaw); step(3, 'carried clear'); interact(); step(5, 'left the tractor'); assert(!sim.driving);
  scenario.wedge = [wedge[0], drivingHeight(wedge[0], wedge[1]), wedge[1], wedge[2]]; scenario.clear = [saved.x, drivingHeight(saved.x, saved.z), saved.z, savedYaw];
}
visit('mill'); press('KeyW'); step(120, 'mill'); press(); assert(escape()); step(5, 'overview'); assert(!sim.active && !pilot.active);

// ---- Port-only fixture search for the browser runner (B-08), after every lockstep comparison.
/** True when a scratch mover covers its pace (within 2%: ground resolve on slopes) on every fixed step: no contact, no river. `end` continues a mover. */
function walkFree(from: T.Vector3, cameraForward: T.Vector3, x: number, y: number, run: boolean, seconds: number, end?: MoverState) {
  const mover: MoverState = end ?? { position: from.clone(), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
  const pace = (run ? FARM_WALK.runPace : FARM_WALK.pace) / 120;
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    const bx = mover.position.x, bz = mover.position.z;
    stepCapsule(mover, { x, y }, run, cameraForward, 1 / 120, world, FARM_WALK_RULES);
    if (mover.status || Math.abs(Math.hypot(mover.position.x - bx, mover.position.z - bz) - pace) > .02 * pace) return false;
  }
  return true;
}
scenario.doorIds = Object.fromEntries((['farmhouse', 'barn', 'watermill', 'fence-gate'] as const).map(id => [id, sim.doors[doorIndex(id)]!.instance.id]));
// A clear walking area for the camera-relative checks: from the yard destination (or the nearest free spot
// with the yard's camera), W 1.8 s, Shift+W 1.8 s and D 1.2 s, then W 1.2 s with the camera turned 40 degrees either way.
{
  const yard = FARM_DESTINATIONS.yard, yaw = yard.yaw, f = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const clear = (start: T.Vector3) => {
    const mover: MoverState = { position: start.clone(), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
    for (let i = 0; i < 60; i++) stepCapsule(mover, { x: 0, y: 0 }, false, f, 1 / 120, world, FARM_WALK_RULES);
    if (!walkFree(start, f, 0, 1, false, 1.8, mover) || !walkFree(start, f, 0, 1, true, 1.8, mover) || !walkFree(start, f, 1, 0, false, 1.2, mover)) return false;
    return [-40, 40].every(deg => {
      const a = deg * Math.PI / 180, turned = new T.Vector3(f.x * Math.cos(a) - f.z * Math.sin(a), 0, f.x * Math.sin(a) + f.z * Math.cos(a));
      return walkFree(mover.position, turned, 0, 1, false, 1.2);
    });
  };
  const resolved = new T.Vector3().fromArray(yard.position); world.resolve(resolved, FARM_WALK.radius, FARM_WALK.height);
  let walk: number[] | null = clear(resolved) ? [...resolved.toArray(), yaw] : null;
  for (let r = 1; r <= 12 && !walk; r++) for (let k = 0; k < r * 8 && !walk; k++) {
    const a = k / (r * 8) * Math.PI * 2, s = standing(yard.position[0] + Math.cos(a) * r, yard.position[2] + Math.sin(a) * r);
    if (s && clear(s)) walk = [...s.toArray(), yaw];
  }
  assert(walk, 'a clear walking area near the yard');
  scenario.walk = { start: walk, fromYardDestination: walk[0] === resolved.x && walk[2] === resolved.z };
}
// A farmhouse wall met head-on (no slide), held by the static world, at least 4 m from the front door.
{
  const house = placements.instances.find(i => i.asset.id === 'farmhouse')!.object.position;
  const doorAt = doorCenter(sim.doors[doorIndex('farmhouse')]!, new T.Vector3()), dynamic = new Set(world.colliders.filter(c => c.dynamic));
  let wall: { start: number[]; yaw: number; direction: number[]; stop: number[]; walked: number } | null = null;
  // Walk along the building's own axes (perpendicular to its walls), offset along each face.
  const houseYaw = placements.instances.find(i => i.asset.id === 'farmhouse')!.object.rotation.y;
  const axes = [0, 1, 2, 3].map(q => new T.Vector3(Math.cos(houseYaw + q * Math.PI / 2), 0, -Math.sin(houseYaw + q * Math.PI / 2)));
  search: for (const d of axes) for (let r = 3; r <= 10; r += .5) for (let l = -4; l <= 4; l += .5) {
    const side = new T.Vector3(-d.z, 0, d.x), s = standing(house.x - d.x * r + side.x * l, house.z - d.z * r + side.z * l);
    if (!s || Math.hypot(s.x - doorAt.x, s.z - doorAt.z) < 4) continue;
    const mover: MoverState = { position: s.clone(), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
    let late = mover.position.clone();
    for (let i = 0; i < 480; i++) { if (i === 420) late = mover.position.clone(); stepCapsule(mover, { x: 0, y: 1 }, false, d, 1 / 120, world, FARM_WALK_RULES); }
    const stop = mover.position, walked = Math.hypot(stop.x - s.x, stop.z - s.z), lateral = Math.abs((stop.x - s.x) * d.z - (stop.z - s.z) * d.x);
    if (mover.status || stop.distanceTo(late) > 1e-9 || walked < .8 || walked > 2.5 || lateral > 1e-4) continue;
    if (!world.intersects(stop.clone().addScaledVector(d, .05), FARM_WALK.radius, FARM_WALK.height, dynamic)) continue;
    if (!walkFree(stop, d.clone().negate(), 0, 1, false, 3.5)) continue;
    wall = { start: s.toArray(), yaw: Math.atan2(-d.z, d.x), direction: d.toArray(), stop: stop.toArray(), walked };
    break search;
  }
  assert(wall, 'a straight static farmhouse wall contact');
  // Facing away from that wall, the follow camera's ray meets it: pulled in, Rowan hidden (play.mjs updateCamera).
  const stop = new T.Vector3().fromArray(wall.stop), yaw = wall.yaw + Math.PI, target = stop.clone(); target.y += FARM_CAMERA.walkingTargetHeight;
  const offset = new T.Vector3(-Math.cos(yaw) * FARM_CAMERA.playOffsetLength, FARM_CAMERA.walkingHeight, Math.sin(yaw) * FARM_CAMERA.playOffsetLength);
  const ray = world.rayDistance(target, target.clone().add(offset)), distance = Math.min(offset.length(), Math.max(FARM_CAMERA.playMinPull, ray - FARM_CAMERA.playPad));
  assert(distance < offset.length() - 1, 'the wall obstructs the follow camera');
  scenario.wall = wall;
  scenario.obstruction = { at: wall.stop, yaw, ray, distance, full: offset.length(), hidden: distance < FARM_CAMERA.playHideRay - FARM_CAMERA.playPad };
}
// A clear drive pose: every browser timing variant of W, W+A, S and a coast is free, and a dismount exit is free after it.
{
  const object = sim.tractor.object, saved = object.position.clone(), savedYaw = object.rotation.y, rig = sim.tractorRig;
  const blocked = (point: T.Vector3) => world.intersects(point, TRACTOR_PROBE.radius, TRACTOR_PROBE.height, colliders.ignoreVehicle);
  const exitFree = (point: T.Vector3) => !world.intersects(point, FARM_WALK.radius, FARM_WALK.height), exit = new T.Vector3();
  const run = (x: number, z: number, yaw: number, straight: number, arc: number) => {
    object.position.set(x, drivingHeight(x, z), z); object.rotation.set(0, yaw, 0); object.updateMatrixWorld(true);
    const state = { speed: 0, steer: 0, travel: 0 };
    for (const [seconds, gas, turn] of [[straight, 1, 0], [arc, 1, 1], [2, -1, 0], [1.5, 0, 0]] as const)
      for (let t = 0; t < Math.round(seconds * 120); t++) if (driveTractor(rig, state, gas, turn, 1 / 120, blocked)) return false;
    return findTractorExit(object, exitFree, exit);
  };
  let drive: number[] | null = null;
  const home = scenario.tractorStart as { position: number[] };
  search: for (let r = 0; r <= 30; r++) for (let k = 0, n = Math.max(1, r * 6); k < n; k++) for (let y = 0; y < 8; y++) {
    const x = Math.round(home.position[0]! + Math.cos(k / n * Math.PI * 2) * r), z = Math.round(home.position[2]! + Math.sin(k / n * Math.PI * 2) * r), yaw = y * Math.PI / 4;
    if (!tractorFree(x, z, yaw)) continue;
    let clear = true;
    for (const straight of [1.4, 2, 2.6]) for (const arc of [1, 1.5, 2]) if (clear && !run(x, z, yaw, straight, arc)) clear = false;
    if (clear) { drive = [x, drivingHeight(x, z), z, yaw]; break search; }
  }
  assert(drive, 'a clear drive pose');
  // Where Rowan stands to mount it: free, within the 2.5 m tractor reach and with no door nearer.
  object.position.set(drive[0]!, drive[1]!, drive[2]!); object.rotation.set(0, drive[3]!, 0); object.updateMatrixWorld(true);
  let mount: number[] | null = null;
  for (let r = 1.6; r <= 2.4 && !mount; r += .2) for (let k = 0; k < 32 && !mount; k++) {
    const a = k / 32 * Math.PI * 2, at = standing(drive[0]! + Math.cos(a) * r, drive[2]! + Math.sin(a) * r);
    if (at && nearestDoorTo(at) < 0) mount = at.toArray();
  }
  object.position.copy(saved); object.rotation.set(0, savedYaw, 0); object.updateMatrixWorld(true); applyTractorPose(rig, sim.drive);
  assert(mount, 'a mount point beside the drive pose');
  scenario.drive = drive; stands['drive'] = mount;
}

const required = {
  statuses: [FARM_STRINGS.river, FARM_STRINGS.doorBlocked, FARM_STRINGS.obstacle, FARM_STRINGS.exitBlocked, FARM_STRINGS.tractorKeyboard,
    ...Object.values(DOOR_LABELS).flatMap(label => [doorStatus(label, true), doorStatus(label, false)])],
  prompts: [FARM_STRINGS.approach, FARM_STRINGS.drive, FARM_STRINGS.leaveTractor, ...Object.values(DOOR_LABELS).flatMap(label => [doorPrompt(label, false), doorPrompt(label, true)])],
};
const missing = { statuses: required.statuses.filter(s => !seen.statuses.has(s)), prompts: required.prompts.filter(p => !seen.prompts.has(p)) };
const fixture = {
  source: 'Sealed r33 play.mjs collision world (receipt-verified), frozen by audit-play-oracle.ts',
  colliders: pilotColliders.length, dynamic: pilotColliders.filter(c => c.dynamic).length,
  staticTriangles: pilotColliders.filter(c => !c.dynamic).reduce((n, c) => n + c.triangles, 0),
  dynamicTriangles: pilotColliders.filter(c => c.dynamic).reduce((n, c) => n + c.triangles, 0),
  doors: pilot.doors.length, doorPivots: pilot.doors.reduce((n: number, d: any) => n + d.pivots.length, 0),
  keys: pilotColliders.map(c => ({ key: c.key, dynamic: c.dynamic, triangles: c.triangles })),
};
const stats = colliders.stats;
assert.deepEqual({ colliders: stats.colliders, dynamic: stats.dynamic, staticTriangles: stats.staticTriangles, dynamicTriangles: stats.dynamicTriangles, doors: stats.doors, doorPivots: stats.doorPivots },
  { colliders: fixture.colliders, dynamic: fixture.dynamic, staticTriangles: fixture.staticTriangles, dynamicTriangles: fixture.dynamicTriangles, doors: fixture.doors, doorPivots: fixture.doorPivots }, 'collider stats');
const fixturePath = resolve('packages/farm/fixtures/play-colliders.json');
if (existsSync(fixturePath)) assert.deepEqual(JSON.parse(readFileSync(fixturePath, 'utf8')), fixture, 'Frozen collider oracle changed');
else if (process.env.ORACLE === '1') throw Error('Missing frozen collider fixture');
else writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');
const output = {
  method: 'Sealed r33 play.mjs, collision.mjs, interaction-rig.mjs, site-layout.mjs, terrain.mjs, bridge.mjs and bvh.mjs (receipt-verified) beside the Farm port on the sealed GLBs; lockstep frames, one key sequence, the pilot camera direction fed to both; byte-identical collision soups.',
  frames: frame, comparisons: compared, tolerance: 1e-9, worst, counts, scenario, colliders: fixture,
  coverage: { statuses: [...seen.statuses].filter(Boolean).sort(), prompts: [...seen.prompts].sort(), missing },
  excluded: ['Rowan root visibility and the camera pose (follow camera: B-08)', 'touch tractor help (keyboard path only)'], hashes,
};
mkdirSync('evidence/m2/play', { recursive: true }); writeFileSync('evidence/m2/play/oracle.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ frames: frame, comparisons: compared, worst, counts, missing, colliders: { count: fixture.colliders, dynamic: fixture.dynamic, staticTriangles: fixture.staticTriangles, dynamicTriangles: fixture.dynamicTriangles } }, null, 2));
assert.deepEqual(missing, { statuses: [], prompts: [] }, 'scenario coverage');
colliders.dispose(); placements.dispose(); prepared.dispose(); pilot.dispose();
globals.document = previous.document; globals.window = previous.window;
