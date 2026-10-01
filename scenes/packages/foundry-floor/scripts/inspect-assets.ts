// SPDX-License-Identifier: MIT
// Writes data/assets.json (foundry-floor.asset-map/2), the scene's asset truth (D-21): every Foundry Floor entity with
//   - its accepted GLB: the author workspace, file, Kiln revision, coordinator review and the pinned bytes and SHA-256
//     (checked here against the file; staging copies the file into the pack and checks it again);
//   - the scene rules from the coordinator reviews (curated below): what the twin drives, what hides near and far,
//     variants, tints, clearances, mounts;
//   - the facts measured from the GLB itself: nodes with their triangle counts, clips with their targets, duration and
//     loop closure, locators, and the bounds of the detailed parts, the lod1 parts and the named subtrees.
// Pending entities (still being authored or unassigned) carry a proxy and no GLB; the scene draws the proxy until an
// entry gains `source` and `pins`, which is all it takes to wire a new GLB.
// Every value is a design estimate (E) unless it carries its own label. Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/inspect-assets.ts [--write | --check]
// `--check` rebuilds in memory and fails when data/assets.json differs (or a pinned GLB does not verify).
// FF-C1 adds `structures`: the twelve campus structure exports (scripts/structures.ts), each verified against the
// newest revision in its author's Kiln library, with its revision ids and measured facts. The interior scene reads
// `entities` only, so the section is additive (schema unchanged).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clips, emptyBox, growBox, identity, isClosedLoop, isUnder, meshTriangles, multiply, nodesBounds, parseGlb, samplePose, sceneTree, transformPoint, triangleCount, worldMatrices } from './glb';
import type { Box, GlbFile, M4, SceneTree } from './glb';
import { structuresSection } from './structures';

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The kiln-commons checkout that holds the authors' workspaces (read-only inputs). */
export const COMMONS = resolve(PACKAGE_ROOT, '../../..');
export const AUTHORS = resolve(COMMONS, 'showcase/authors');

type LodClass = 'tool' | 'stocker' | 'port' | 'mover' | 'robot' | 'people' | 'rail' | 'storage' | 'building' | 'tower' | 'wall';
type Play = 'productive-loop' | 'down-open' | 'down-close' | 'lot-start' | 'batch-start' | 'batch-end' | 'port-state' | 'handoff' | 'running-loop' | 'people' | 'floor-move' | 'driven' | 'not-played';
interface ClipRule { play: Play; emitted: string }
interface Source { author: string; file: string; packFile?: string; revision: string; review: string; bytes: number; sha256: string; hashFrom: string }
/** A wired entity's interface as the coordinator stated it before the file was final: names and poses to plan with.
 *  The measured values replace it once the entry gains source and pins (clip durations are always read from the GLB). */
interface Expected {
  author: string; file: string; basis: string; root: string; sizeM: number[]; nodes: string[]; clips: string[];
  locators: Record<string, number[]>; facts: Record<string, unknown>;
}
interface Curated {
  asset: string;
  /** accepted: prior reviewed GLB pinned and staged. review-candidate: exact new revision awaiting owner review.
   *  wired: names, clips and locators wired from the stated interface, file fields
   *  waiting for the final revision (drawn as its proxy). pending: not delivered. */
  status: 'accepted' | 'review-candidate' | 'wired' | 'pending';
  class: LodClass;
  sim: string;
  source?: Source;
  expected?: Expected;
  instances: { pilot: number; megafab: number; phone: number };
  /** Top-level nodes the scene may hide by name where a placement asks (the review's list). */
  hideable?: string[];
  /** Subtrees whose measured bounds (asset frame) are walk obstacles. */
  obstacles?: string[];
  /** Scene-side people rules (the people interface: walk speed, clip per activity). */
  people?: Record<string, unknown>;
  /** Nodes hidden at load in every instance (besides lod1, which the distance rule switches). */
  hideByDefault?: string[];
  /** Subtrees that are alternatives: each instance shows the subtrees of its variant and hides the others. */
  variants?: Record<string, { show?: string[]; root?: string; materials?: Record<string, string>; note?: string }>;
  tint?: { material: string; by: string; colours: Record<string, string | null>; note: string };
  clips?: Record<string, ClipRule>;
  drive?: Record<string, string>;
  clearance?: Record<string, unknown>;
  mount?: Record<string, unknown>;
  scale?: { value: number; why: string };
  proxy?: Record<string, unknown>;
  placements?: string;
  /** Interface facts stated by the author or coordinator that the scene and FF3's floor moves plan with. */
  facts?: Record<string, unknown>;
  /** Locator positions (asset frame) measured at a clip's start or end, or at rest, each checked against its stated
   *  value within 1 mm when one is given: the hand-off geometry of sim-spec test 4 rests on these. */
  poses?: Record<string, { locator: string; clip?: string; at?: 'start' | 'end'; stated?: number[] }>;
  note?: string;
}

const REVIEW = (author: string, n = 1) => `showcase/authors/${author}/COORDINATOR-REVIEW-${n}.md`;
const src = (author: string, file: string, revision: string, bytes: number, sha256: string, hashFrom: string, review = REVIEW(author), packFile?: string): Source =>
  ({ author, file: `outputs/${file}`, ...(packFile ? { packFile } : {}), revision, review, bytes, sha256, hashFrom });
const all = (n: number) => ({ pilot: n, megafab: n, phone: n });
const DOWN = 'the twin enters SCHEDULED_DOWN or UNSCHEDULED_DOWN (a failure or a PM)';
const UP = 'the twin leaves the down state (repair done, or PM done into qualification)';
const PRODUCTIVE = 'loops while the tool (or its litho cell) is PRODUCTIVE; held at the rest pose otherwise';

/** The scene rules, one entry per entity. Keys are the scene's entity ids. */
export const CURATED: Record<string, Curated> = {
  foup: {
    asset: 'foup', status: 'review-candidate', class: 'mover',
    sim: 'lot (one FOUP per lot; synthetic FOUPs ride synthetic vehicles)',
    source: src('codex-ff-lod-migration', 'foup/asset.glb', 'r_f639b02180994fdd978a427bffb4de15', 73760, 'a8ca511d996868d12c5b2ae3bdec5a58da5e7e008e34a56f60026ce92b610790', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/foup/preservation.json', 'foup.glb'),
    instances: { pilot: 75, megafab: 256, phone: 120 },
    hideByDefault: ['waferStack'],
    tint: { material: 'foup-amber-plastic', by: 'lot class', colours: { normal: null, hot: '#C0392B', engineering: '#2E8F4E', synthetic: '#9AA3AB' }, note: 'normal lots keep the GLB colour; hot, engineering and synthetic FOUPs are recoloured so the classes read apart' },
    clips: {
      DoorRemove: { play: 'port-state', emitted: 'the load port is OPENING (with its DoorOpen)' },
      DoorReplace: { play: 'port-state', emitted: 'the load port is CLOSING (with its DoorClose)' },
    },
    drive: { waferStack: 'shown while the FOUP door is off (its port OPENING, OPEN or CLOSING) and the FOUP is drawn detailed; hidden otherwise' },
    mount: {
      onVehicle: { locator: 'foupGrip', foupLocator: 'gripPoint', yawDeg: -90, note: 'door toward the vehicle +Z (its right)' },
      atLoadPort: { locator: 'foupSeat', yawDeg: 180, note: 'FOUP base on the seat, door toward the tool; the FOUP rides the stage through Dock and Undock' },
      atUts: { locator: 'seatA or seatB', note: 'as carried: the vehicle heading, then -90 degrees' },
      atStockerPort: { note: 'seat under the rail; slides 1.15 m inward over 3 s to the inner seat' },
    },
  },
  vehicle: {
    asset: 'oht-vehicle', status: 'review-candidate', class: 'mover',
    sim: 'vehicle (IDLE, TO_PICKUP, HANDOFF_PICK, TO_DROP, HANDOFF_DROP, WAIT_BLOCK)',
    source: src('codex-ff-lod-migration', 'vehicle/asset.glb', 'r_a4fd2dfb3a3f4276b28464458cb0fbb9', 107472, '27dd159eeeaeb4ed0748159e550096dda1e8faac895bfd4a1d86ed8f808a3024', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/vehicle/preservation.json', 'oht-vehicle.glb'),
    instances: { pilot: 6, megafab: 40, phone: 16 },
    tint: { material: 'accent-amhs', by: 'traffic', colours: { pilot: null, synthetic: '#71849A' }, note: 'synthetic through-traffic wears a muted slate band so it never reads as a pilot vehicle' },
    clips: {
      HoistDown: { play: 'handoff', emitted: 'handoff start plus the E84 wait (0.5 s at load and stocker ports; a 1.5 s partial hoist at UTS seats)' },
      HoistUp: { play: 'handoff', emitted: 'after the grip' },
      GripClose: { play: 'handoff', emitted: 'pick handoff, after HoistDown' },
      GripOpen: { play: 'handoff', emitted: 'drop handoff, after HoistDown' },
    },
    drive: { hoist: 'the twin gives the hoist extension in metres (linear in time); the scene finds the HoistDown time that reaches it and samples hoist and belts there, so partial UTS hoists and full port hoists share one curve' },
    mount: { rail: 'origin on the rail datum (Y 4.9), +X along the direction of travel' },
  },
  loadPort: {
    asset: 'load-port', status: 'review-candidate', class: 'port',
    sim: 'load port (EMPTY ... UNLOADING)',
    source: src('codex-ff-lod-migration', 'loadPort/asset.glb', 'r_b45a5f436cd14d7294bc6866dcebb5f7', 32652, '500fa5d0a1e41879e2f20ebd18d8c064a13c0f86d49798830a0273aa08aa0ed2', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/loadPort/preservation.json', 'load-port.glb'),
    instances: all(103),
    clips: {
      Dock: { play: 'port-state', emitted: 'DOCKING' },
      Undock: { play: 'port-state', emitted: 'UNDOCKING' },
      DoorOpen: { play: 'port-state', emitted: 'OPENING' },
      DoorClose: { play: 'port-state', emitted: 'CLOSING' },
    },
    mount: { tool: 'origin on the tool locator lpN (the tool face), +X toward the aisle' },
  },
  stocker: {
    asset: 'stocker', status: 'review-candidate', class: 'stocker',
    sim: 'stocker (crane IDLE, MOVING, FORK; ports pass through 1.15 m in 3 s)',
    source: src('codex-ff-lod-migration', 'stocker/asset.glb', 'r_2719dba3ca554c159e41daa769233182', 299000, 'cd4e7bb6d5341a5a86b613d2657be919a106cde63d0d2d2b05d343fd597ebcf2', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/stocker/preservation.json', 'stocker.glb'),
    instances: all(2),
    clips: { CraneCycle: { play: 'not-played', emitted: 'review and idle display only: the scene drives craneMast (Z) and craneCarriage (Y) from the twin\'s crane moves instead' } },
    drive: { craneMast: 'translation Z = the twin crane Z (stocker-local)', craneCarriage: 'translation Y = the twin crane Y (the FOUP base level)', craneFork: 'held centred' },
    note: 'usable slots: the GLB has a shelf under 243 slots; the twin keeps the 234 the FF1 data derived (18 front-rack slots behind the five inner seats)',
  },
  signalTower: {
    asset: 'signal-tower', status: 'accepted', class: 'tower',
    sim: 'tool E10 state lamp: PRODUCTIVE green, STANDBY amber, ENGINEERING and SCHEDULED_DOWN blue, UNSCHEDULED_DOWN red, NON_SCHEDULED all off',
    source: src('sonnet-ff-stocker', 'signal-tower.glb', 'r_0af702f0a7364dffbac3255c04a909ff', 13844, '82f69eb2a5471bc0ea242ef79aa3686a7e8025d8172437813484c5f58fe881b9', 'the Kiln build receipt in the author workspace (.kiln/cache/builds/86e87760...json); the review gives bytes only'),
    instances: all(44),
    variants: {
      PRODUCTIVE: { show: ['lampGreen', 'lampBlueOff', 'lampAmberOff', 'lampRedOff'] },
      STANDBY: { show: ['lampAmber', 'lampBlueOff', 'lampGreenOff', 'lampRedOff'] },
      ENGINEERING: { show: ['lampBlue', 'lampGreenOff', 'lampAmberOff', 'lampRedOff'] },
      SCHEDULED_DOWN: { show: ['lampBlue', 'lampGreenOff', 'lampAmberOff', 'lampRedOff'] },
      UNSCHEDULED_DOWN: { show: ['lampRed', 'lampBlueOff', 'lampGreenOff', 'lampAmberOff'] },
      NON_SCHEDULED: { show: ['lampBlueOff', 'lampGreenOff', 'lampAmberOff', 'lampRedOff'] },
    },
    scale: { value: 1.5, why: 'the review found the tower marginal at 40 m (a 4 px patch that reads by colour only); sim-spec open item 5 lets the scene scale towers by up to 1.5x; the GLB stays at true size' },
    mount: { tool: 'on the tool\'s signalTowerMount locator (a litho cell\'s track and scanner both show the cell state)', stocker: 'on the stocker\'s signalTowerMount; a stocker has no E10 state here, so it shows STANDBY (amber) unless its crane is moving (green)' },
  },
  uts: {
    asset: 'under-track-storage', status: 'review-candidate', class: 'storage',
    sim: 'UTS shelf (seats EMPTY, RESERVED, OCCUPIED)',
    source: src('codex-ff-lod-migration', 'uts/asset.glb', 'r_093ce3746e9c449585f6543f9db94f87', 32200, 'f5818ef0791c74470d2d034ba9022d9f0243fa36da4f3fe15ba4ea308b2de15e', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/uts/preservation.json', 'under-track-storage.glb'),
    instances: all(32),
    mount: { rail: 'seat plane at Y 3.2 under the rail; rods reach the rail datum' },
  },
  railStraight: {
    asset: 'oht-rail-straight', status: 'review-candidate', class: 'rail',
    sim: 'rail graph piece (straight, fillers scaled 0.25 to 1.0 along X)',
    source: src('codex-ff-lod-migration', 'railStraight/asset.glb', 'r_ed0c4b464c3f44419b6efed936349a64', 15968, '7289d13da5a095aa5483c28864e0a96de71d0e353b4040836cc52774e05d856b', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/railStraight/preservation.json', 'oht-rail-straight.glb'),
    instances: all(96),
  },
  railCurve: {
    asset: 'oht-rail-curve', status: 'review-candidate', class: 'rail',
    sim: 'rail graph piece (curve)',
    source: src('codex-ff-lod-migration', 'railCurve/asset.glb', 'r_a2af1537d2cc4396a4d94bce0c19598c', 33072, '66f22a7b40bf28454611578047744e5ea2400a35dbce83b2006ac2b0f1155fa9', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/railCurve/preservation.json', 'oht-rail-curve.glb'),
    instances: all(20),
  },
  railSwitch: {
    asset: 'oht-rail-switch', status: 'review-candidate', class: 'rail',
    sim: 'rail graph piece (switch; one branch used per placement)',
    source: src('codex-ff-lod-migration', 'railSwitch/asset.glb', 'r_b7fcebf6547545eab077be69796ec893', 61820, '1190709b4b55201db020cbb375001eb1d3c535ac9e8f93fefae20a11207753f4', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/railSwitch/preservation.json', 'oht-rail-switch.glb'),
    instances: all(16),
    variants: {
      diverge: { show: ['branchDiverge', 'gateDiverge', 'lod1BranchDiverge'], note: 'the review\'s rule: hide branchDiverge or branchMerge (group nodes, plate included), never the track meshes alone; the branch\'s gate and lod1 branch go with it (the rail graph pieces hide the same names)' },
      merge: { show: ['branchMerge', 'gateMerge', 'lod1BranchMerge'] },
    },
    clips: { Toggle: { play: 'not-played', emitted: 'presentation only (sim-spec open item 6); the twin emits no switch clips' } },
  },
  floorModule: {
    asset: 'raised-floor-module', status: 'review-candidate', class: 'building',
    sim: 'static building',
    source: src('codex-ff-lod-migration', 'floorModule/asset.glb', 'r_f0104891f44a4c99a52739033e900757', 26336, '30b8cfddbfaccfd572f79c40a0483e9726b69fddc3b8bea36cd708b7612008fc', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/floorModule/preservation.json', 'raised-floor-module.glb'),
    instances: all(280),
    note: 'the 14 modules along the section cut (X 32.4 to 36) always draw detailed, so their pedestals show in the cut',
  },
  ceilingModule: {
    asset: 'ffu-ceiling-module', status: 'review-candidate', class: 'building',
    sim: 'static building; hidden while the camera is above the FFU face',
    source: src('codex-ff-lod-migration', 'ceilingModule/asset.glb', 'r_6d370c36023f401ea7ee526631bcf4df', 37112, 'db5aa12a0b890785664a300393484ee175f91e626cabbe5b9900cc4be2d86642', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/ceilingModule/preservation.json', 'ffu-ceiling-module.glb'),
    instances: all(280),
    variants: {
      white: {},
      amber: { materials: { 'light-strip-white': 'light-strip-amber' }, note: 'the 56 modules over the litho zone (sim-spec 5.4: yellow light in litho bays [C])' },
    },
    note: 'the 14 modules along the section cut always draw detailed, so their FFU housings show in the cut',
  },
  wallKit: {
    asset: 'cleanroom-wall-kit', status: 'accepted', class: 'wall',
    sim: 'static building',
    source: src('sonnet-ff-building', 'cleanroom-wall-kit.glb', 'r_4e0249fdfb804779a0adb8c6cae9d2dd', 31156, 'd4d24890f74cffa60d6cf57b656b4ef6206cb829026aedf2ed34f7fbbd0cffde', 'the coordinator review 2', REVIEW('sonnet-ff-building', 2)),
    instances: all(75),
    variants: {
      solid: { root: 'wallPanelSolid' },
      glazed: { root: 'wallPanelGlazed' },
      glazedAmber: { root: 'wallPanelGlazed', materials: { 'glass-clear': 'glass-amber' }, note: 'the litho partitions; glass-amber is the pack palette\'s value and the swap belongs to the scene (review 2, answer r)' },
      door: { root: 'wallPanelDoor' },
      cornerPost: { root: 'cornerPost' },
    },
    clips: {
      DoorOpen: { play: 'people', emitted: 'the people door (layout.people.door) opens as the nearest person walking in or out comes within 3 m of its centre and is fully open at 0.6 m: 2.4 m at 1.2 m/s is the clip\'s own 2 s, so the leaves move at the clip\'s speed; every other door stays closed' },
      DoorClose: { play: 'people', emitted: 'the same distance rule played backwards as the person walks away (the pose is DoorOpen sampled by distance, so both directions share one curve)' },
    },
    clearance: { doors: 'a door panel is never placed against a corner post (one panel between them) nor at a free end (review 2, answer p)' },
  },
  'tool:etch': {
    asset: 'etch-cluster-tool', status: 'review-candidate', class: 'tool', sim: 'tool group etch',
    source: src('codex-ff-lod-migration', 'tool-etch/asset.glb', 'r_6456090ae2cb42f09b3ff18670f55c3e', 452424, '24d3ebb6818f54e7e341f9b4081ea29231b64f165ab6ffc3f2af562dea915c30', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-etch/preservation.json', 'etch-cluster-tool.glb'),
    instances: all(6),
    clips: { RobotTransfer: { play: 'productive-loop', emitted: PRODUCTIVE }, LidOpen: { play: 'down-open', emitted: DOWN }, LidClose: { play: 'down-close', emitted: UP } },
    clearance: { plusZ: 0.45, why: 'LidOpen at 80 degrees reaches Z 2.213 (0.41 m beyond the 1.8 m half width): keep at least 0.45 m clear on the +Z side (cluster review)' },
  },
  'tool:cvd-ald': {
    asset: 'cvd-ald-cluster-tool', status: 'review-candidate', class: 'tool', sim: 'tool group cvdald',
    source: src('codex-ff-lod-migration', 'tool-cvd-ald/asset.glb', 'r_5555be8ebedc496ba137ba5d47132e1b', 460756, '6c097a2ddad1305ea349f37ab44757722204b71b07323bca157d8d8a21619649', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-cvd-ald/preservation.json', 'cvd-ald-cluster-tool.glb'),
    instances: all(6),
    clips: { RobotTransfer: { play: 'productive-loop', emitted: PRODUCTIVE }, LidOpen: { play: 'down-open', emitted: DOWN }, LidClose: { play: 'down-close', emitted: UP } },
    clearance: { plusZ: 0.45, why: 'LidOpen reaches Z 1.978 (0.18 m beyond 1.8): keep at least 0.45 m clear on the +Z side (cluster review)' },
  },
  'tool:pvd': {
    asset: 'pvd-cluster-tool', status: 'review-candidate', class: 'tool', sim: 'tool group pvd',
    source: src('codex-ff-lod-migration', 'tool-pvd/asset.glb', 'r_3ef2fa3a9e594f94b65dffe40253bd0c', 416676, 'e87669b3c87279389f7ef1035dc3994e81f74803c9b4ec2b81eec035da8998fb', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-pvd/preservation.json', 'pvd-cluster-tool.glb'),
    instances: all(3),
    clips: { RobotTransfer: { play: 'productive-loop', emitted: PRODUCTIVE }, LidOpen: { play: 'down-open', emitted: DOWN }, LidClose: { play: 'down-close', emitted: UP } },
    clearance: { plusZ: 0, why: 'the PVD lid stays inside the rest envelope (cluster review)' },
  },
  'tool:clean': {
    asset: 'single-wafer-clean-tool', status: 'review-candidate', class: 'tool', sim: 'tool group clean',
    source: src('codex-ff-lod-migration', 'tool-clean/asset.glb', 'r_c268a0f6f6174f7ba2b87e120c4344e8', 63304, 'dcc8f518e828db258990e737db96aa87b440d7772122c735f67ab32c5174b429', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-clean/preservation.json', 'single-wafer-clean-tool.glb'),
    instances: all(2),
    clips: { RobotTransfer: { play: 'productive-loop', emitted: PRODUCTIVE } },
  },
  'tool:cmp': {
    asset: 'cmp-polisher', status: 'review-candidate', class: 'tool', sim: 'tool group cmp',
    source: src('codex-ff-lod-migration', 'tool-cmp/asset.glb', 'r_a8c4d8680a7f4aca96b240daa294bc4b', 127912, '0e479e5ee9dfd2a4f389f18ccf82d1cd2fc39e628a18a577643503980b81b344', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-cmp/preservation.json', 'cmp-polisher.glb'),
    instances: all(4),
    clips: { PlatenSpin: { play: 'productive-loop', emitted: PRODUCTIVE }, ArmSweep: { play: 'productive-loop', emitted: PRODUCTIVE }, CarouselIndex: { play: 'lot-start', emitted: 'one-shot at each lot start (the twin logs CarouselIndex); the carousel keeps a quarter turn per lot' } },
  },
  'tool:furnace': {
    asset: 'vertical-furnace', status: 'review-candidate', class: 'tool', sim: 'tool group furnace (batch)',
    source: src('codex-ff-lod-migration', 'tool-furnace/asset.glb', 'r_72680f2e5830442f93afff6a94519629', 98668, '8f92dbbe43e0ae51e7a36f955fe1edc8f4e4cbbdf020c1ae80b8ed84a6eb36b4', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-furnace/preservation.json', 'vertical-furnace.glb'),
    instances: all(3),
    clips: { BoatLoad: { play: 'batch-start', emitted: 'batch start (PRODUCTIVE); the boat stays up through the batch' }, BoatUnload: { play: 'batch-end', emitted: 'batch end' } },
  },
  'tool:implanter': {
    asset: 'ion-implanter', status: 'review-candidate', class: 'tool', sim: 'tool group implant',
    source: src('codex-ff-lod-migration', 'tool-implanter/asset.glb', 'r_703483bb04b240bbaada2327534f7eef', 138320, 'ad1a6f19be7894c0835e24cfaf4495819f25d7994ec0c5a8897aa01b4bb2af15', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-implanter/preservation.json', 'ion-implanter.glb'),
    instances: all(2),
    clips: { EndStationRobot: { play: 'productive-loop', emitted: PRODUCTIVE }, ServiceOpen: { play: 'down-open', emitted: DOWN }, ServiceClose: { play: 'down-close', emitted: UP } },
    clearance: { serviceDoor: 1.2, why: 'ServiceOpen swings the door 100 degrees about the hinge at (2.25, 0, -3.25): keep about 1.2 m clear in front of the -Z end of the front face (special-a review)' },
  },
  'tool:metrology': {
    asset: 'metrology-inspection-tool', status: 'review-candidate', class: 'tool', sim: 'tool group metrology',
    source: src('codex-ff-lod-migration', 'tool-metrology/asset.glb', 'r_a8395c71bb304806b3093749f7ab4ed4', 108984, '16e618ba8266ff1a87d03975b1e1b91b5e7f619bbf13152695683705ccef7f58', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-metrology/preservation.json', 'metrology-inspection-tool.glb'),
    instances: all(4),
    variants: {
      column: { show: ['column'], note: 'the review\'s rule: each placed instance shows exactly one of column and opticalHead' },
      opticalHead: { show: ['opticalHead'] },
    },
    clips: { StageScan: { play: 'productive-loop', emitted: PRODUCTIVE } },
  },
  'tool:prober': {
    asset: 'wafer-prober-tester', status: 'review-candidate', class: 'tool', sim: 'tool group probe',
    source: src('codex-ff-lod-migration', 'tool-prober/asset.glb', 'r_7357b53066af464abb6556bdde7866d4', 125036, '4a53871b19898e53b7f057107eee9d2f40bbe3ba72948df3b190d21e910662af', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-prober/preservation.json', 'wafer-prober-tester.glb'),
    instances: all(4),
    clips: { HeadOpen: { play: 'down-open', emitted: DOWN }, HeadClose: { play: 'down-close', emitted: UP }, ChuckIndex: { play: 'productive-loop', emitted: PRODUCTIVE } },
    clearance: { headroomY: 3.4, why: 'HeadOpen swings the head 90 degrees about +X and reaches Y 3.36: keep about 3.4 m of headroom above the tool; lod1 carries the head docked, so the tool draws detailed while a head clip plays or the head is open (special-b review)' },
  },
  'tool:track': {
    asset: 'coater-developer-track', status: 'review-candidate', class: 'tool', sim: 'litho cell (track half; the cell is one resource using the track ports)',
    source: src('codex-ff-lod-migration', 'tool-track/asset.glb', 'r_a2be2a40435341b9b196f678130109b4', 363352, '5b3436743daecbbff7cfdda351e67f324950767cf6d475a967d26f3aca05a11a', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-track/preservation.json', 'coater-developer-track.glb'),
    instances: all(4),
    clips: { RobotShuttle: { play: 'productive-loop', emitted: 'loops while the litho cell is PRODUCTIVE' } },
  },
  'tool:euv-scanner': {
    asset: 'euv-scanner', status: 'review-candidate', class: 'tool', sim: 'litho cell (scanner half)',
    source: src('codex-ff-lod-migration', 'tool-euv-scanner/asset.glb', 'r_5fb445d57eec47fa9c7238b1a5ee4242', 591660, '0da38997d744b40180edb9d114a4fda63b336b2356747bcb8277dfc152ca69eb', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-euv-scanner/preservation.json', 'euv-scanner.glb'),
    instances: all(2),
    clips: { ServiceOpen: { play: 'down-open', emitted: DOWN }, ServiceClose: { play: 'down-close', emitted: UP }, Expose: { play: 'productive-loop', emitted: 'loops while the litho cell is PRODUCTIVE' } },
    clearance: { doorSweep: 'both local Z sides', why: 'ServiceOpen swings the side doors outward on both Z sides (pivots at Z +-2.0): keep the sweep clear on both sides (litho review)' },
  },
  'tool:duv-scanner': {
    asset: 'duv-immersion-scanner', status: 'review-candidate', class: 'tool', sim: 'litho cell (scanner half)',
    source: src('codex-ff-lod-migration', 'tool-duv-scanner/asset.glb', 'r_21ec88e7bb5b4c2c9ceae59c8142d978', 408276, '53e7026c98abb8e13b5b85b51b8bc5e58ee1baec74291c6971762ee6a2853efd', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/tool-duv-scanner/preservation.json', 'duv-immersion-scanner.glb'),
    instances: all(2),
    clips: { ServiceOpen: { play: 'down-open', emitted: DOWN }, ServiceClose: { play: 'down-close', emitted: UP }, Expose: { play: 'productive-loop', emitted: 'loops while the litho cell is PRODUCTIVE' } },
    clearance: { doorSweep: 'both local Z sides', why: 'ServiceOpen swings the side doors outward on both Z sides (pivots at Z +-1.6): keep the sweep clear on both sides (litho review)' },
  },
  // ---- utility kit (coordinator message 23:32 and review 1: final files, accepted) ----------------------------------
  subfabKit: {
    asset: 'subfab-pump-abatement-kit', status: 'accepted', class: 'building', sim: 'the pump and abatement kit in each section module\'s subfab; it runs unless the tool above it is NON_SCHEDULED (none in the configuration). FF2 placed none (the kit, 3.6 x 6.0 x 2.4 m, fits the module\'s zone of 1.7 x 2.0 x 3.6 m in no quarter turn); FF3 places one per module in the zone the owner\'s decision D-42 enlarged in the layout (layout.sectionCut.kitZone), the GLB unchanged',
    source: src('sonnet-ff-utility', 'subfab-pump-abatement-kit.glb', 'r_d0ff94d7e74c487b9b822f61a1ccd171', 64780, '14b884d16dc0e56217ca8c07a0a1979b53b972750e8499ffb8eacf2ccd1d844d', 'the coordinator message of 23:32 (full SHA-256) and the review\'s prefix'),
    instances: all(7), placements: 'layout.sectionCut.subfabKits',
    clips: { FanSpin: { play: 'running-loop', emitted: 'a 360-degree loop, played looped while the kit runs (the GLB carries no loop flag; looping is scene knowledge per clip name)' } },
    drive: {
      dryPump1_lamp: 'status-green while the kit runs, off otherwise', dryPump2_lamp: 'as dryPump1_lamp', dryPump3_lamp: 'as dryPump1_lamp', dryPump4_lamp: 'as dryPump1_lamp',
      controlPanel: 'screen-glow while the kit runs',
    },
    mount: { subfab: 'D-42 (owner, 2026-09-30): one kit per section module, root on the subfab floor (Y -7.5) at module-frame X 0.63, Z 0, yaw 90 (the 23:32 rule: the 3.6 m side along Z, the pipes ending at the waffle slab underside), inside the kit zone the layout enlarges from the module\'s own (X -0.5..1.2, Y -7.5..-5.5, Z -1.8..1.8, coordinator 00:33) to take the kit as built. X 0.63 is the least whole centimetre east of the mount (0.35) at which the kit clears every drawn module part by 0.10 m at micrometre resolution; the module\'s subfab is shallower than the kit, so it reaches 0.63 m past the section plane (layout.sectionCut.kitZone; evidence/sim-spec/ff3/kit-clearance.json)', toolAbove: 'the locator (0, 6, 0) where the pipes meet the slab; layout records the tool standing over it, if any' },
  },
  gallerySegment: {
    asset: 'visitor-gallery-segment', status: 'accepted', class: 'building', sim: 'static (visitor gallery)',
    source: src('sonnet-ff-utility', 'visitor-gallery-segment.glb', 'r_cf68f8f819f34684ac183610c45596cc', 32104, '0b0e16c3b0b6a71392e47b40a58fd36c64f20c594edcf69ac83f9f0a38326830', 'the coordinator message of 23:32 (full SHA-256) and the review\'s prefix'),
    instances: all(10), placements: 'layout.gallery.segmentPlacements',
    hideable: ['ceilingPanel', 'ceilingLight', 'infoKiosk', 'bench'],
    obstacles: ['bench', 'infoKiosk'],
    mount: {
      floor: 'lowered 0.05 m so the walking surface (local Y 0.045 to 0.050) is flush with the visitor level (Y 0)',
      tiling: '7.2 m along local X: every long part ends on X +-3.6; the +X end is capped and the -X end open, so neighbours share one seam face',
      glazing: 'local +Z (Z 1.8) is the glazing line, carried by the fab\'s glazed wall; the handrail is at local Z 1.65, top 1.10',
      tourCamera: 'the tour eye point (0, 1.6, 0.8)',
    },
  },
  technician: {
    asset: 'cleanroom-technician', status: 'accepted', class: 'people',
    sim: 'people: the qualification visits of the twin (sim/service.ts, the stub provider); the scene walks a technician in from the fab door, idles beside the qualifying tool and walks out (scene/people.ts). FF3 gives the repair and PM visits to the humanoid work robot, a second class behind the same people interface (sim-config movers `visits`)',
    source: src('sonnet-ff-utility', 'cleanroom-technician.glb', 'r_e1d7c6935493484d9586bcf0c21604de', 103868, 'd7eb534f128a6133e0c21feb0b371e0294e1b2aca551e596cba30e73590f9fbd', 'the coordinator message of 00:13 (the final file, full SHA-256); it replaces r_1053692a929b459c92f762db2b4914c0 of 23:32'),
    instances: { pilot: 12, megafab: 12, phone: 6 },
    clips: {
      Walk: { play: 'people', emitted: 'looped while the figure walks; no root motion: baked in place for people.walkDesignSpeedMps, so the scene moves the figure at that speed along its facing, or scales the playback rate by speed / walkDesignSpeedMps' },
      Idle: { play: 'people', emitted: 'looped while the figure waits' },
      Service: { play: 'people', emitted: 'looped while the figure services a tool (the visit is open)' },
    },
    people: {
      walkSpeedMps: 1.2, walkDesignSpeedMps: 1.2, activities: { walk: 'Walk', idle: 'Idle', service: 'Service' }, facing: '+X forward, right +Z', loops: 'all three clips loop (closed keys; no loop flag in the GLB)',
      walkRule: 'coordinator (owner review of the utility sheet): Walk is baked in place for exactly 1.2 m/s; while it plays the figure moves at 1.2 m/s along +X, or the playback rate is speed / 1.2, so the feet never skate. The same rule applies to the Walk of the humanoid',
      walk: 'final file (coordinator, 00:13): a heel-to-toe cycle with knees (shinLeft and shinRight under legLeft and legRight) and ankles; the contact point is pinned to ground moving back at exactly 1.2 m/s in the figure frame (worst slide 0.34 mm), torso bob 35 mm, swing clearance 85 mm; rest pose, bounds and materials unchanged',
    },
  },
  // ---- humanoid work robot (coordinator message received 00:45: final file; review 1 accepted 00:43). FF3's second
  // people class: FF2 wired it as data only (the 22:25 rule); FF3 gives it the repair and PM visits in sim-config (the
  // technician keeps the qualifications) and these instances, and it draws through the technician's people path with
  // no scene code of its own. Its hand-carried FOUP moves (Carry, Handoff) need a floor route in the twin, which FF3
  // does not add (the twin moves every FOUP by the overhead rail; PROGRESS FF3 decision 1).
  humanoidWorkRobot: {
    asset: 'humanoid-work-robot', status: 'accepted', class: 'people',
    sim: 'people (FF3): the repair and PM visits of the twin (sim/service.ts, the stub provider); the scene walks the robot in from the fab door along the aisle path, services the tool and walks it out (scene/people.ts), the technician keeping the qualifications (sim-config movers `visits`). Carry and Handoff are not played: the twin moves every FOUP by the overhead rail, so no floor move has a source',
    source: src('sonnet-ff-humanoid', 'humanoid-work-robot.glb', 'r_9f717d17eec74f2dbd4c338612207ed5', 200656, 'cd118485e113219ce8de9bb6d3b873634fb7dadebf81028142d0f6a644f88aa2', 'the coordinator message received 00:45 (the final file, full SHA-256) and review 1'),
    instances: { pilot: 12, megafab: 12, phone: 6 },
    clips: {
      Walk: { play: 'people', emitted: 'looped while the robot walks without a FOUP; baked in place for people.walkDesignSpeedMps (1.2 m/s): move it at that speed along +X, or scale the rate by speed / 1.2' },
      Idle: { play: 'people', emitted: 'looped while the robot waits' },
      Service: { play: 'people', emitted: 'looped while the robot services a tool (FF3: the PM and repair visits)' },
      Carry: { play: 'floor-move', emitted: 'FF3: looped while the robot walks with a FOUP on foupCarry; baked in place for 1.2 m/s like Walk' },
      Handoff: { play: 'floor-move', emitted: 'FF3: one-shot at a load port, cross-faded in from Carry over about 0.3 s; the FOUP base centre goes from foupCarry to foupHandoff over 0 to 1.5 s, holds to 2.0 s (re-parented to the load port then), and the arms return by 3 s' },
    },
    people: {
      walkSpeedMps: 1.2, walkDesignSpeedMps: 1.2, activities: { walk: 'Walk', idle: 'Idle', service: 'Service' }, carry: { walk: 'Carry', handoff: 'Handoff', locator: 'foupCarry', handoffLocator: 'foupHandoff' },
      facing: '+X forward, the robot\'s left is -Z', loops: 'Walk, Carry, Idle and Service loop; Handoff is a one-shot (no loop flags in the GLB)',
      walkRule: 'Walk and Carry are in-place heel-to-toe cycles baked at 0.05 s whose contact point is pinned to ground moving back at exactly 1.2 m/s (0.0 mm and -1.200 m/s at every key, both feet; torso bob 38 mm): move the robot at exactly 1.2 m/s along its facing while either plays, or scale the playback rate by speed / 1.2 (the technician\'s rule)',
    },
    facts: {
      frame: 'root on the floor between the feet, facing +X, the robot\'s left is -Z; bounds X -0.20..0.20, Y 0..1.73, Z -0.31..0.31; 4 materials',
      hierarchy: 'torso parents head, armLeft and armRight (forearmLeft, forearmRight), legLeft and legRight (shinLeft, shinRight and the ankle nodes footLeft, footRight) and the locator foupCarry; foupHandoff stays at the root; rest world positions unchanged against the earlier passes',
      carry: 'parent a carried FOUP (base centre) to foupCarry: it bobs with the torso and hands (the hands stay 4.0 mm from the box sides at every Carry key)',
      crossFade: 'Carry never stands still and Handoff keeps the legs at rest: cross-fade Carry to Handoff over about 0.3 s (AnimationAction.crossFadeTo) rather than cutting; the FOUP on foupCarry settles with the torso',
      handoff: 'Handoff animates the arms and forearms only; the FOUP base centre moves from foupCarry to foupHandoff over 0 to 1.5 s by the stated timing, holds to 2.0 s (re-parent it to the load port then) and the arms return by 3 s',
    },
    poses: {
      foupCarryRest: { locator: 'foupCarry', stated: [0.32, 0.92, 0] },
      foupHandoffRest: { locator: 'foupHandoff', stated: [0.6, 0.92, 0] },
      foupCarryAtCarryStart: { locator: 'foupCarry', clip: 'Carry', at: 'start' },
    },
  },
  // Floor robots: new explicit fit repairs for local review. Original acceptance/bytes remain in the older packs.
  amrFloorRobot: {
    asset: 'amr-floor-robot-fit', status: 'review-candidate', class: 'robot',
    sim: 'moves real production FOUPs between stocker transfer docks and the metrology/probe stations; one shared aisle reservation; deck raises for actual arm handoffs',
    source: src('codex-ff-lod-migration', 'amrFloorRobot/asset.glb', 'r_a27481224b474e9cb1dd747c45a71e23', 77144, 'ceb4d9565c396bed03d9ffd704447caac5e38e665e61224e0c092ec6df05da32', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/amrFloorRobot/preservation.json', 'amr-floor-robot.glb'),
    instances: all(4), placements: 'layout.floorRobots.amrs',
    clips: {
      DeckUp: { play: 'floor-move', emitted: 'FF3: lifts a FOUP on foup1 by 0.15 m to the arm deck pose; FF2 draws the rest pose (deck down)' },
      DeckDown: { play: 'floor-move', emitted: 'FF3: the reverse of DeckUp' },
    },
    drive: { statusLamp: 'the authored status-green material; transfer state is observable through motion and the scene transfer panel' },
    facts: {
      travel: '+X', footprint: 'root on the floor at the centre of its 1.00 x 0.70 footprint, top 1.25 m, mast at the rear-right corner',
      foupLocators: 'foup1 and foup2 are children of deck: FOUP base centres, doors toward +Z', deckRiseM: 0.15,
      chassis: 'chassis is a group (chassisSkirt, bumperRing, chassisBody): hide or recolour by those names',
      lod1: 'declared as the off-scene coarse tier, 2 mm inside the skins (lod1Deck follows the deck clips): the class distance rule switches it',
      handoff: 'an AMR at deckPark after DeckUp has foup1 at (0, 1.30, -0.65) in the arm frame, under deckLifted minus the FOUP height: run DeckUp before HomeToDeck reaches deckLifted, or keep the deck down and let the arm lift from the deck pose (FF3 timing)',
    },
    poses: {
      foup1Rest: { locator: 'foup1', stated: [0.23, 1.15, 0] },
      foup1Up: { locator: 'foup1', clip: 'DeckUp', at: 'end', stated: [0.23, 1.3, 0] },
      foup1Down: { locator: 'foup1', clip: 'DeckDown', at: 'end', stated: [0.23, 1.15, 0] },
    },
  },
  toolFrontRobotArm: {
    asset: 'tool-front-robot-arm-fit', status: 'review-candidate', class: 'robot',
    sim: 'four station arms and two stocker transfer arms perform real production pickups and placements from the floor-transport state',
    source: src('codex-ff-lod-migration', 'toolFrontRobotArm/asset.glb', 'r_14bc5f09d6064a6aa8c20234c34b5d78', 135444, '3ae581fbee8b2e7a184b9ef22d5594c6a75f85dcc5e72b2da16bc1dec06e3010', 'saved revision and exact source-backed LOD preservation proof', 'showcase/authors/codex-ff-lod-migration/outputs/toolFrontRobotArm/preservation.json', 'tool-front-robot-arm.glb'),
    instances: all(6), placements: 'layout.floorRobots.arms plus the two reserved stocker transfer docks',
    clips: {
      DeckToSeat: { play: 'floor-move', emitted: 'FF3: deck to seat carrying the FOUP (the FOUP parents to gripCentre at 1 s and is released at 7 s; the gripper yaws 180 degrees during the 2 to 6 s swing)' },
      SeatToDeck: { play: 'floor-move', emitted: 'FF3: the reverse of DeckToSeat (same parenting times)' },
      SeatToHome: { play: 'floor-move', emitted: 'FF3: from the seat, fingers open, no FOUP' },
      HomeToDeck: { play: 'floor-move', emitted: 'FF3: to the deck pose, no FOUP' },
    },
    drive: { statusLamp: 'the authored status-green material; transfer state is observable through motion and the scene transfer panel' },
    facts: {
      workingFace: '+X', pedestal: '0.4 x 0.8 x 0.4 at the origin',
      seatRef: 'the FOUP base centre at the seat: placed on the load port foupSeat it serves (arm +X toward the tool)',
      deckPark: 'where the AMR root parks, facing the arm +X, so its foup1 sits under the deck pose',
      gripPoses: { home: [0.35, 1.1, 0], homeClear: [0.35, 1.45, 0], seatAbove: [0.65, 1.335, 0], transferAbove: [0.55, 1.45, 0], seat: [0.65, 1.235, 0], deck: [0, 1.635, -0.65], deckLifted: [0, 1.735, -0.65] },
      chains: 'HomeToDeck then DeckToSeat then SeatToHome, and DeckToSeat then SeatToDeck, are jump-free (identical joint angles at each chain point)',
      foupParenting: 'parent the FOUP to gripCentre at 1 s of DeckToSeat or SeatToDeck and release it at 7 s; fingers close from 160 to 110 mm in the first second of the carrying clips',
      gripper: '180-degree yaw during the swing: the FOUP door faces the tool (+X) at the seat and +Z at the deck',
      clearance: 'local technical qualification samples the actual FOUP, moving arm, AMR, ports and transfer extensions; owner visual review remains pending',
    },
    poses: {
      gripHome: { locator: 'gripCentre', stated: [0.35, 1.1, 0] },
      gripDeck: { locator: 'gripCentre', clip: 'DeckToSeat', at: 'start', stated: [0, 1.635, -0.65] },
      gripSeat: { locator: 'gripCentre', clip: 'DeckToSeat', at: 'end', stated: [0.65, 1.235, 0] },
      gripSeatToDeckEnd: { locator: 'gripCentre', clip: 'SeatToDeck', at: 'end', stated: [0, 1.635, -0.65] },
      gripHomeToDeckEnd: { locator: 'gripCentre', clip: 'HomeToDeck', at: 'end', stated: [0, 1.635, -0.65] },
      gripSeatToHomeEnd: { locator: 'gripCentre', clip: 'SeatToHome', at: 'end', stated: [0.35, 1.1, 0] },
    },
  },
  // ---- section module (coordinator messages received 00:27 and 00:33: the tiling interface is final; the 00:33 file
  // is the review pass with the mains on a back-wall rack and the kit zone cleared) ------------------------------------
  sectionModule: {
    asset: 'level-section-module', status: 'accepted', class: 'building', sim: 'static (section cut)', instances: all(7), placements: 'layout.sectionCut.modulePlacements',
    source: src('sonnet-ff-section', 'level-section-module.glb', 'r_3b3d090fa0494380bdcaafaf6f3a22f2', 322096, '20d5f55ea0f97f29d5adccc45e090bcb605fad99e05733163a89c15a29d4cd2c', 'the coordinator message received 00:33 (the final file, full SHA-256); it replaces r_31297086f3b44715ba632212acc6c728 of 00:27, which was never staged', 'showcase/authors/sonnet-ff-section/FEEDBACK-review-1.md'),
    // The fab's raised-floor and FFU ceiling modules run to the cut, so the module's own raisedFloor and ffuPlenum and
    // the cut-face caps of those two levels are hidden; the concrete caps close the slabs.
    hideByDefault: ['raisedFloor', 'ffuPlenum', 'cutFaceCaps_raisedFloor', 'cutFaceCaps_ffuWhite', 'cutFaceCaps_ffuHousing'],
    hideable: ['raisedFloor', 'ffuPlenum'],
    obstacles: ['returnAirShaft'],
    // Sim-spec 12 test 3 measured the spine's east U-turn running through module 4's shaft (0.00 m). Moving the U-turn
    // clear needs the east bays about 0.5 m west, which the east half's 0.8 m of slack cannot give (FF2 report), so the
    // one module whose shaft lies in the U-turn's swept vehicle envelope draws without it; build-layout.ts picks it.
    variants: {
      withShaft: { show: ['returnAirShaft'] },
      withoutShaft: { show: [], note: 'only where the spine\'s east U-turn sweeps a vehicle through the shaft (layout.sectionCut.modulePlacements[].variant, chosen by build-layout.ts); every other module keeps its shaft' },
    },
    mount: {
      row: 'tiles the east cut along Z at exactly 7.2 m (every tiling part carries identical vertex sets on Z +-3.6 and no triangle in either plane), the row centred on the clean room; root at the module centre, Y 0 the clean-room walking surface, the cut face (local X +1.2) on the section plane',
      ends: 'the row ends are open: closed by end walls below the clean-room floor and above the FFU face; the fab walls close the clean-room band',
      floorAndCeiling: 'the fab\'s raised-floor and FFU ceiling modules run to the cut: raisedFloor, ffuPlenum and their caps are hidden (hideByDefault)',
      subfabKitMount: 'the base centre of the kit zone: place the subfab kit only inside it (the author\'s zone, facts.kitZone; the owner\'s decision D-42 enlarges it in the scene layout to take the kit as built, layout.sectionCut.kitZone)',
      returnAirShaft: 'rises from the subfab (Y -6.6) through the waffle slab, raised floor, clean room and FFU band to 11.4: in the clean room it is an obstacle that tool rows and the walker keep clear of',
    },
    facts: {
      tileM: 7.2,
      bands: { floorSlab: [-8, -7.5], subfab: [-7.5, -1.5], waffleSlab: [-1.5, -0.6], raisedFloor: [-0.6, 0], cleanRoom: [0, 6], ffu: [6, 6.4], interstitial: [6.4, 13.4], roofSlab: [13.4, 14] },
      kitZone: { min: [-0.5, -7.5, -1.8], max: [1.2, -5.5, 1.8], note: 'coordinator 00:33: 3.6 m along Z by 1.6 m along X, up to 2.0 m tall, clear of every part (their vertex scan); the subfab kit goes only inside it' },
      mains: 'four stainless mains stacked on a back-wall rack (tubes X -1.03..-0.67, Y -7.17..-5.63; collars X -1.06..-0.64, Y -7.20..-5.60) on trim-graphite brackets mainsPipes_brackets at Z -2.4, 0, 2.4; laterals vertical at X -0.58 within Z +-2.31',
    },
  },
};

const LOD = {
  note: 'distance from the camera to an instance centre. An instance draws detailed nearer than nearM and lod1 farther than farM; between the two it keeps its current form (hysteresis). Classes without lod1 always draw detailed. E',
  classes: {
    tool: { nearM: 34, farM: 38 }, stocker: { nearM: 40, farM: 44 }, port: { nearM: 20, farM: 23 }, mover: { nearM: 22, farM: 25 }, robot: { nearM: 22, farM: 25 }, people: null,
    rail: { nearM: 22, farM: 25 }, storage: { nearM: 22, farM: 25 }, building: { nearM: 13, farM: 15 }, tower: null, wall: null,
  } as Record<LodClass, { nearM: number; farM: number } | null>,
};

const PALETTE = {
  basis: 'the shared material palette of the pack\'s briefs (E); the family accent colours are invented for readability and are not any maker\'s livery (research pack report, section c). The GLBs carry these in their own materials; the scene uses them for proxies, tints and material swaps',
  family: { etch: '#6A5BAE', cvdald: '#C9892B', pvd: '#C9892B', clean: '#3A9FC6', cmp: '#4E8F4A', furnace: '#C8642D', implant: '#C4553A', metrology: '#9C4D8E', probe: '#56657A', duv: '#2E8B8B', euv: '#2E8B8B' },
  shell: '#E8EBEE', panel: '#C5CBD1', graphite: '#3B4148', amhs: '#E07B22', floor: '#D3D7DA', litho: '#E9B824',
  foup: { normal: '#C98B2E', hot: '#C0392B', engineering: '#2E8F4E', synthetic: '#9AA3AB' },
  lamps: { PRODUCTIVE: '#22B14C', STANDBY: '#F5A623', ENGINEERING: '#2F7FE0', SCHEDULED_DOWN: '#2F7FE0', UNSCHEDULED_DOWN: '#E0352B', NON_SCHEDULED: '#3B4148' },
  swaps: {
    'glass-amber': { color: '#E7B24A', roughness: 0.1, metalness: 0, opacity: 0.35, basis: 'the pack palette (briefs/assets.json)' },
    'light-strip-amber': { color: '#F1CF72', emissive: '#F1CF72', roughness: 0.5, metalness: 0, basis: 'E: FF1\'s amber ceiling colour' },
  },
};

// ---------------------------------------------------------------- reading and verifying the accepted GLBs

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function sourcePath(s: Pick<Source, 'author' | 'file'>): string { return resolve(AUTHORS, s.author, s.file); }

/** Reads an accepted GLB from the staged pack (when staged and current) or from its author workspace, and checks the
 *  pins. A staged copy that differs from new pins is stale (a file swap before restaging) and is skipped; an author
 *  file that differs is an error. */
export function readAcceptedGlb(entry: { glb?: string; source?: Source; pins?: { bytes: number; sha256: string } }, stagedDir = resolve(PACKAGE_ROOT, 'staged/ff2')): { bytes: Uint8Array; from: string } | null {
  const pins = entry.pins ?? (entry.source ? { bytes: entry.source.bytes, sha256: entry.source.sha256 } : null);
  if (!pins) return null;
  const staged = entry.glb ? resolve(stagedDir, entry.glb) : null, source = entry.source ? sourcePath(entry.source) : null;
  for (const path of [staged, source]) {
    if (!path || !existsSync(path)) continue;
    const bytes = new Uint8Array(readFileSync(path));
    if (bytes.length === pins.bytes && sha256(bytes) === pins.sha256) return { bytes, from: path };
    if (path !== source) continue;
    throw new Error(`${path}: bytes or SHA-256 differ from the pins (${bytes.length} B, ${sha256(bytes)})`);
  }
  return null;
}

// ---------------------------------------------------------------- measuring

const r4 = (v: number) => { const x = Math.round(v * 10000) / 10000; return Object.is(x, -0) ? 0 : x; };
const box = (b: Box) => (Number.isFinite(b.min[0]) ? { min: b.min.map(r4), max: b.max.map(r4), size: b.max.map((v, i) => r4(v - (b.min[i] as number))) } : null);

function isLocator(tree: SceneTree, i: number): boolean {
  const n = tree.nodes[i]!;
  return n.mesh === null && n.children.length === 0 && tree.roots.indexOf(i) < 0;
}

/** Bounds of a subtree in its own frame (the subtree root's translation removed), for sub-assets like the wall panels. */
function subtreeBounds(file: GlbFile, tree: SceneTree, rootName: string): ReturnType<typeof box> {
  const ri = tree.byName.get(rootName);
  if (ri === undefined) throw new Error(`no node ${rootName}`);
  const world = worldMatrices(tree), inv = identity();
  const w = world[ri]!;
  // Undo the root's world translation only (the kit subtrees are translated, not rotated).
  inv[12] = -(w[12] as number); inv[13] = -(w[13] as number); inv[14] = -(w[14] as number);
  const local: M4[] = world.map(m => multiply(inv, m));
  return box(nodesBounds(file, tree, local, i => isUnder(tree, i, ri)));
}

function measure(key: string, c: Curated, file: GlbFile) {
  const tree = sceneTree(file), world = worldMatrices(tree), lod = tree.byName.get('lod1');
  const underLod = (i: number) => lod !== undefined && isUnder(tree, i, lod);
  const hidden = new Set(c.hideByDefault ?? []);
  const underHidden = (i: number) => [...hidden].some(n => { const h = tree.byName.get(n); return h !== undefined && isUnder(tree, i, h); });
  let detailed = 0, lod1 = 0, hiddenTris = 0;
  for (const n of tree.nodes) {
    if (n.mesh === null) continue;
    const t = triangleCount(file, n.mesh);
    if (underLod(n.index)) lod1 += t; else if (underHidden(n.index)) hiddenTris += t; else detailed += t;
  }
  const materials = (file.json.materials ?? []).map(m => m.name ?? '');
  const usedMaterials = new Set<string>();
  for (const n of tree.nodes) if (n.mesh !== null) for (const tri of meshTriangles(file, n.mesh)) usedMaterials.add(materials[tri.material] ?? '');
  const locators: Record<string, number[]> = {};
  for (const n of tree.nodes) if (isLocator(tree, n.index)) locators[n.name] = transformPoint(world[n.index]!, 0, 0, 0).map(r4);
  // The operating envelope of each clip: the moving parts (the clip targets' subtrees, detailed geometry) swept over
  // 24 samples, recorded when it leaves the asset's rest bounds (lids, doors, heads, hoists).
  const shown = (i: number) => !underLod(i) && !underHidden(i);
  const rest = nodesBounds(file, tree, world, shown);
  const clipList = clips(file).map(cl => {
    const rule = c.clips?.[cl.name];
    if (!rule) throw new Error(`${key}: clip ${cl.name} has no scene rule`);
    const targets = [...new Set(cl.channels.map(ch => ch.node))], moving = (i: number) => shown(i) && targets.some(t => isUnder(tree, i, t));
    const swept = emptyBox();
    for (let k = 0; k <= 24; k++) { const b = nodesBounds(file, tree, worldMatrices(tree, samplePose(cl, cl.seconds * k / 24)), moving); if (Number.isFinite(b.min[0])) { growBox(swept, b.min); growBox(swept, b.max); } }
    const leaves = Number.isFinite(swept.min[0]) && (swept.min.some((v, i) => v < (rest.min[i] as number) - 1e-3) || swept.max.some((v, i) => v > (rest.max[i] as number) + 1e-3));
    return { name: cl.name, seconds: r4(cl.seconds), closed: isClosedLoop(cl), targets: [...new Set(cl.channels.map(ch => `${tree.nodes[ch.node]!.name}.${ch.path}`))], play: rule.play, emitted: rule.emitted, ...(leaves ? { sweep: box(swept) } : {}) };
  });
  for (const name of Object.keys(c.clips ?? {})) if (!clipList.some(cl => cl.name === name)) throw new Error(`${key}: the scene rule names clip ${name}, which the GLB lacks`);
  const poses: Record<string, number[]> = {};
  for (const [name, p] of Object.entries(c.poses ?? {})) {
    const li = tree.byName.get(p.locator);
    if (li === undefined) throw new Error(`${key}: pose ${name} names locator ${p.locator}, which the GLB lacks`);
    const cl = p.clip ? clips(file).find(x => x.name === p.clip) : undefined;
    if (p.clip && !cl) throw new Error(`${key}: pose ${name} names clip ${p.clip}, which the GLB lacks`);
    const w = cl ? worldMatrices(tree, samplePose(cl, p.at === 'end' ? cl.seconds : 0)) : world;
    const at = transformPoint(w[li]!, 0, 0, 0).map(r4);
    if (p.stated && at.some((v, i) => Math.abs(v - (p.stated![i] as number)) > 0.001)) throw new Error(`${key}: pose ${name} is ${JSON.stringify(at)}, stated ${JSON.stringify(p.stated)}`);
    poses[name] = at;
  }
  const nodeNames = new Set(tree.nodes.map(n => n.name));
  const named = [...(c.hideByDefault ?? []), ...(c.hideable ?? []), ...(c.obstacles ?? []), ...Object.values(c.variants ?? {}).flatMap(v => [...(v.show ?? []), ...(v.root ? [v.root] : [])]), ...Object.keys(c.drive ?? {})];
  for (const n of named) if (!nodeNames.has(n)) throw new Error(`${key}: the scene rules name node ${n}, which the GLB lacks`);
  if (c.tint && !materials.includes(c.tint.material)) throw new Error(`${key}: tint material ${c.tint.material} is not in the GLB`);
  for (const v of Object.values(c.variants ?? {})) for (const m of Object.keys(v.materials ?? {})) if (!materials.includes(m)) throw new Error(`${key}: swapped material ${m} is not in the GLB`);
  const subtrees: Record<string, unknown> = {};
  for (const v of Object.values(c.variants ?? {})) if (v.root) subtrees[v.root] = subtreeBounds(file, tree, v.root);
  // Obstacle subtrees in the asset frame (not re-centred): the walker collides with these boxes.
  const nodeBounds: Record<string, unknown> = {};
  for (const n of c.obstacles ?? []) { const ni = tree.byName.get(n)!; nodeBounds[n] = box(nodesBounds(file, tree, world, i => isUnder(tree, i, ni))); }
  const parentName = (i: number) => { const p = tree.nodes[i]!.parent; return p >= 0 ? tree.nodes[p]!.name : null; };
  return {
    measured: {
      root: tree.roots.map(i => tree.nodes[i]!.name).join(','),
      bounds: box(nodesBounds(file, tree, world, i => !underLod(i))),
      lod1Bounds: lod !== undefined ? box(nodesBounds(file, tree, world, underLod)) : null,
      ...(Object.keys(subtrees).length ? { subtrees } : {}),
      ...(Object.keys(nodeBounds).length ? { nodeBounds } : {}),
      ...(Object.keys(poses).length ? { poses } : {}),
      triangles: { detailed, lod1, hiddenByDefault: hiddenTris },
      materials: materials.filter(m => usedMaterials.has(m)),
      textures: (file.json as { textures?: unknown[] }).textures?.length ?? 0,
      extensions: file.json.extensionsUsed ?? [],
    },
    locators,
    clips: clipList,
    nodes: tree.nodes.map(n => [n.name, parentName(n.index), n.mesh !== null ? triangleCount(file, n.mesh) : 0]),
  };
}

/** A wired entity's stated names (nodes, clips, locators) against the file its author delivered so far, when present.
 *  Names only: the fix revision may move locators and change durations, never names. Reported, never written. */
export function checkWired(c: Curated): { file: string; present: boolean; missing: string[] } | null {
  if (c.status !== 'wired' || !c.expected) return null;
  const path = resolve(AUTHORS, c.expected.author, c.expected.file);
  if (!existsSync(path)) return { file: c.expected.file, present: false, missing: [] };
  const file = parseGlb(new Uint8Array(readFileSync(path))), tree = sceneTree(file);
  const names = new Set(tree.nodes.map(n => n.name)), clipNames = new Set(clips(file).map(cl => cl.name));
  const missing = [
    ...[c.expected.root, ...c.expected.nodes, ...Object.keys(c.expected.locators)].filter(n => !names.has(n)).map(n => `node ${n}`),
    ...c.expected.clips.filter(n => !clipNames.has(n)).map(n => `clip ${n}`),
    ...[...clipNames].filter(n => !c.expected!.clips.includes(n)).map(n => `unexpected clip ${n}`),
  ];
  return { file: c.expected.file, present: true, missing };
}

export function buildAssetMap(): { map: unknown; problems: string[] } {
  const problems: string[] = [];
  const entities: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(CURATED)) {
    const { source, ...rules } = c;
    if (!['accepted', 'review-candidate'].includes(c.status) || !source) { entities[key] = { ...rules, glb: null }; continue; }
    const glb = `models/${source.packFile ?? source.file.replace(/^outputs\//, '')}`;
    let read: { bytes: Uint8Array; from: string } | null;
    try { read = readAcceptedGlb({ glb, source }); } catch (error) { problems.push(String(error)); continue; }
    if (!read) { problems.push(`${key}: ${sourcePath(source)} is missing`); continue; }
    const file = parseGlb(read.bytes);
    if ((file.json.extensionsRequired ?? []).length) problems.push(`${key}: requires extensions ${String(file.json.extensionsRequired)}`);
    entities[key] = {
      ...rules, glb, source: { author: source.author, file: source.file, revision: source.revision, review: source.review, hashFrom: source.hashFrom },
      pins: { bytes: source.bytes, sha256: source.sha256 }, lod: LOD.classes[c.class] ? c.class : null, ...measure(key, c, file),
    };
  }
  const map = {
    schema: 'foundry-floor.asset-map/2',
    generatedBy: 'scripts/inspect-assets.ts: the scene rules are curated in the script from the coordinator reviews; measured, locators, clips and nodes are read from the pinned GLBs',
    basis: 'E unless a value carries its own label; measured values are the GLBs\' own (metres, the asset frame: +X forward, +Y up, +Z right)',
    packRoot: 'GLB paths are relative to the scene pack root; staging (scripts/stage.ts) copies each accepted GLB to models/ and checks its bytes and SHA-256 against the pins; the scene loads them through the kit\'s pack loader',
    licence: { spdx: 'CC0-1.0', note: 'Authored asset content only, designated CC0-1.0 by the project owner to the extent of the owner\'s rights: the Farm pack\'s licence and scope (DECISIONS D-35). The author workspaces and revision manifests carry no licence file; staging writes licenses/ASSET-LICENSE.txt' },
    conventions: {
      lod1: 'MSFT_lod keeps lower tiers outside the default scene. The scene resolves the declared chain and switches detailed/coarse instance forms per the class distance rule; hideByDefault names are hidden at load',
      clipSync: 'The scene poses parts from twin state: one-shots start at the state or clip-log time and use clock.oneShotTime (at 60x and above they jump to the end pose); loops use clock.loopPhase (sim time at 1x, wall time above). Nothing feeds back into the twin',
      lampColours: { PRODUCTIVE: 'green', STANDBY: 'amber', ENGINEERING: 'blue', SCHEDULED_DOWN: 'blue', UNSCHEDULED_DOWN: 'red', NON_SCHEDULED: 'off' },
      wiring: 'an entity draws from its GLB when it has glb and pins; otherwise it draws its proxy. A new accepted asset needs only its entry (source, pins and rules). A wired entity carries the names, clips and locators its author stated (expected) and draws its proxy until the final file is pinned',
      looping: 'the GLBs carry no loop flags (engine limit): the play rule of each clip says whether the scene loops it',
    },
    lod: LOD,
    palette: PALETTE,
    entities,
    structures: structuresSection(problems),
  };
  return { map, problems };
}

if (import.meta.main) {
  const { map, problems } = buildAssetMap();
  if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
  const text = `${JSON.stringify(map, null, 1)}\n`, path = resolve(PACKAGE_ROOT, 'data/assets.json');
  const entities = Object.values((map as { entities: Record<string, { status: string; measured?: { triangles: { detailed: number; lod1: number } } }> }).entities);
  const wired = Object.fromEntries(Object.entries(CURATED).map(([k, c]) => [k, checkWired(c)]).filter(([, v]) => v));
  const structures = Object.keys((map as { structures: Record<string, unknown> }).structures).length;
  const summary = { accepted: entities.filter(e => e.status === 'accepted').length, reviewCandidates: entities.filter(e => e.status === 'review-candidate').length, wired: entities.filter(e => e.status === 'wired').length, pending: entities.filter(e => e.status === 'pending').length, structures, bytes: text.length, wiredNames: wired };
  if (process.argv.includes('--check')) {
    const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
    console.log(JSON.stringify({ ...summary, stale: old !== text }));
    if (old !== text) process.exit(1);
  } else if (process.argv.includes('--write')) {
    writeFileSync(path, text);
    console.log(JSON.stringify({ ...summary, wrote: 'data/assets.json' }));
  } else console.log(JSON.stringify(summary));
}
