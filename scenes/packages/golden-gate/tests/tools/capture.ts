// Review capture script (SCENE-TASK "Deliverables", WATER-SPEC "Determinism for review").
// Every image comes from a fresh page whose URL alone fixes the scene: `time` (frozen wave and
// fog time), `preset`, `tier` and `cam`. Each record names the backend, the GPU, the parameters,
// the tier knobs and scripted judgements; images captured on both backends are compared.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/capture.ts <set> [--backends=webgpu,webgl2] [--label=before|after]
// Sets: water (the WATER-REVIEW-READY checkpoint: five cameras x three presets on High, plus
// postcard and pier on Low); traffic (the TRAFFIC-REVIEW-READY checkpoint: four traffic views x three
// presets on High, all six lanes on Medium and Low, and a deterministic motion strip); views (all ten
// named cameras plus the bridge fix-up author's two review cameras x three presets on High); flights
// (the four flyovers at Low, four points each, held by `flight` and `flightAt` on the frozen clock);
// pairs (the fix-up author's two cameras by preset on High and at Golden on Medium, written to
// views/pairs/<label>; the `after` run also writes before|after sheets when the `before` run exists).
// Fix round 2 (golden-gate-scene/SCENE-REVIEW-2.md): views also holds the review's four south pier poses
// and two side poses; approaches (the eight deck-end poses and four driver's-eye poses entering and
// leaving the deck, High Day, with Medium and Low views) and pier (the pier and side poses on High and the
// pier poses on Low) are labelled like pairs: <set>/<label>, with before|after sheets on the after run.
// joints (bridge review 3, the flush expansion-joint plates): the south tower and north pylon joints at the
// driver's eye on Low, Medium and High and from 30, 60 and 240 m above them on Low, the range views at
// three lateral offsets with a crop sheet of the joint for depth fighting (tests/tools/joint-depth.ts sweeps
// flyover paths and the driver's eye at all four joints).
// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md), permanent sets of the approaches' dressing: plaza (the toll
// plaza from the driver's eye south of it, the deck end and above) and vista (Vista Point from the northbound lane,
// from the lot, from its overlook wall and from above); climb (the Marin climb's benched cut: the driver's eye where
// the car turns, from the northbound lane 100 m short of the cut, at its toe and from above), labelled like pairs;
// pylons (item 6: the anchorage housings and art-deco pylons at the driver's eye entering and leaving each end and
// from 100 m, at High Day and Golden hour).
// The chase camera at Golden is captured by drive-check.ts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { compareImages, downsample, extremes, luma, montage, paintStats, readPng, regionMean, round, writePng, type Image } from './image.ts';

type Backend = 'webgpu' | 'webgl2';
interface Shot { tier: string; preset: string; cam: string; time: number; /** Traffic seconds advanced in fixed steps before the shot. */ advance?: number; /** A flyover held at `at` (0..1). */ flight?: string; at?: number;
  /** A pose moved sideways by this many metres (position and target), as a flyover drifts across a view. */ nudge?: number;
  /** Traffic hidden (setPartVisible), for a static pose in a lane where a vehicle would dissolve through the camera. */ hideTraffic?: boolean }
interface SetSpec { shots: Shot[]; columns: number; description: string }
const WIDTH = 1280, HEIGHT = 720, TIME = 12;
const WATER_CAMS = ['postcard', 'pier', 'topdown', 'horizon', 'deck'], PRESETS = ['day', 'golden', 'fog'];
const TRAFFIC_CAMS = ['lanes', 'sidewalk', 'traffic', 'deck'];
const ALL_CAMS = ['postcard', 'pier', 'topdown', 'horizon', 'deck', 'tower', 'span', 'lanes', 'sidewalk', 'traffic'];
/**
 * The bridge fix-up author's review cameras (showcase/authors/sonnet-gg-bridge-fix/REPORT.md, "Before/after
 * GPU pairs" (a) and (c)): not scene cameras, so the page loads at the postcard and the test hook `setPose`
 * holds this exact pose. The author rendered 1024 x 1024 at a 62 degree field of view; the same vertical
 * field here keeps the author's framing top to bottom and adds width at 16:9.
 */
const FIXUP = 'showcase/authors/sonnet-gg-bridge-fix/REPORT.md', REVIEW2 = 'golden-gate-scene/SCENE-REVIEW-2.md';
/** Driver's-eye poses: 1.2 m above the middle lane's centre looking 60 m (entering) or 80 m (leaving) along the lane, computed from the g3 route (scripts/layout.ts data). */
const DRIVER = 'fix round 2: driver\'s eye 1.2 m above the middle lane (g3 route)';
const JOINTS = 'bridge review 3 (coordinator 23:13): expansion-joint plates, driver\'s eye and range (g3 roadway)';
const DRESSING = 'fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md): the approaches\' dressing, poses from the approach stations (layout.json dressing)';
const PYLONS = 'fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md item 6): the anchorage housings and art-deco pylons (g3 bridge GLB)';
const POSES: Record<string, { position: [number, number, number]; target: [number, number, number]; fov: number; source: string }> = {
  'fixup-pier': { position: [60, 3, -560], target: [0, 8, -640], fov: 62, source: FIXUP },
  'fixup-deck': { position: [2, 78.5, -300], target: [0, 77, 0], fov: 62, source: FIXUP },
  // SCENE-REVIEW-2 poses (the coordinator's setPose captures, at the hook's default 55 degree field).
  'sp-high-w': { position: [90, 70, -560], target: [0, 4, -640], fov: 55, source: REVIEW2 },
  'sp-high-e': { position: [-90, 70, -720], target: [0, 4, -640], fov: 55, source: REVIEW2 },
  'sp-top': { position: [30, 150, -600], target: [0, 2, -640], fov: 55, source: REVIEW2 },
  'sp-deck': { position: [0, 95, -480], target: [0, 5, -640], fov: 55, source: REVIEW2 },
  'side-span': { position: [450, 85, -300], target: [0, 68, -300], fov: 55, source: REVIEW2 },
  'side-full': { position: [900, 120, 0], target: [0, 70, 0], fov: 55, source: REVIEW2 },
  'send-side': { position: [140, 110, -1000], target: [0, 70, -1040], fov: 55, source: REVIEW2 },
  'send-high': { position: [0, 200, -900], target: [0, 60, -1060], fov: 55, source: REVIEW2 },
  'send-drive': { position: [0, 78.5, -960], target: [0, 74, -1100], fov: 55, source: REVIEW2 },
  'send-back': { position: [20, 90, -1150], target: [0, 72, -1000], fov: 55, source: REVIEW2 },
  'nend-side': { position: [140, 110, 1000], target: [0, 70, 1040], fov: 55, source: REVIEW2 },
  'nend-high': { position: [0, 200, 900], target: [0, 60, 1060], fov: 55, source: REVIEW2 },
  'nend-drive': { position: [0, 78.5, 960], target: [0, 74, 1100], fov: 55, source: REVIEW2 },
  'nend-back': { position: [20, 90, 1150], target: [0, 72, 1000], fov: 55, source: REVIEW2 },
  'send-enter': { position: [-13.34, 60.2, -1151.59], target: [-5.95, 61.71, -1092.63], fov: 55, source: DRIVER },
  'send-leave': { position: [4.8, 65.66, -972.98], target: [4.8, 62.92, -1052.98], fov: 55, source: DRIVER },
  'nend-enter': { position: [4.8, 65.22, 1152.98], target: [4.8, 63.13, 1092.98], fov: 55, source: DRIVER },
  'nend-leave': { position: [-4.8, 65.66, 972.98], target: [-4.8, 63.08, 1052.98], fov: 55, source: DRIVER },
  // Bridge review 3: the flush joint plates (0.6 m, top 1.5 mm above the Roadway, which runs on beneath them) at
  // the south tower (z -640.08) and the north pylon (z 982.98): the driver's eye 20 m before each, northbound in
  // the middle lane, and from above along the bridge axis (target: the plate's centre). Fix round 3 item 0 (the
  // polygon offset) moved the range views to the flyover heights 30, 60 and 240 m above the joint, each at a range
  // where the round-2 sweep (tests/tools/joint-depth.ts) lost the plate: 100 m back at 30 and 240 m, 150 m (tower)
  // and 110 m (pylon) back at 60 m.
  'tjoint-drive': { position: [-4.8, 75.29, -660.08], target: [-4.8, 75.94, -600.08], fov: 55, source: JOINTS },
  'pjoint-drive': { position: [-4.8, 65.98, 962.98], target: [-4.8, 63.87, 1022.98], fov: 55, source: JOINTS },
  'tjoint-h30': { position: [0, 104.46, -540.08], target: [0, 74.46, -640.08], fov: 55, source: JOINTS },
  'tjoint-h60': { position: [0, 134.46, -490.08], target: [0, 74.46, -640.08], fov: 55, source: JOINTS },
  'tjoint-h240': { position: [0, 314.46, -540.08], target: [0, 74.46, -640.08], fov: 55, source: JOINTS },
  'pjoint-h30': { position: [0, 94.14, 882.98], target: [0, 64.14, 982.98], fov: 55, source: JOINTS },
  'pjoint-h60': { position: [0, 124.14, 872.98], target: [0, 64.14, 982.98], fov: 55, source: JOINTS },
  'pjoint-h240': { position: [0, 304.14, 882.98], target: [0, 64.14, 982.98], fov: 55, source: JOINTS },
  // Fix round 3 item 1, the toll plaza (canopy at south-approach stations 404.5 to 413.5): the driver's eye 1.2 m
  // above the northbound middle lane 150 m south of it looking north at it; the deck end looking south at it, 20 m
  // above the centreline (at the driver's eye there, 400 m off, the plaza is a few pixels behind the oncoming
  // traffic); and a view from 45 m above its extra-width (west) side.
  'plaza-drive': { position: [-225.33, 55.53, -1528.21], target: [-132.97, 57.01, -1409.92], fov: 55, source: DRESSING },
  'plaza-deck': { position: [0, 82.55, -1032.98], target: [-125.7, 56.01, -1415.23], fov: 55, source: DRESSING },
  'plaza-high': { position: [-118.33, 99.05, -1508.54], target: [-128.12, 54.01, -1413.46], fov: 55, source: DRESSING },
  // Fix round 3 item 2, Vista Point (north-approach stations 333 to 479, east of the northbound lanes): the
  // driver's eye 1.2 m above the northbound right lane at station 398 looking at the barrier opening and the
  // ramp up to the lot; 1.6 m above the lot at station 372, 46 m east of the route, across the parked rows to the
  // north tower; 1.6 m above it by the overlook wall (station 352, 68 m east) looking at the tower; and a view
  // from 55 m above the road's west side.
  'vista-drive': { position: [67.28, 74.25, 1418.42], target: [65.05, 75.7, 1454.2], fov: 55, source: DRESSING },
  'vista-lot': { position: [19.86, 76.8, 1419.88], target: [0, 120, 640], fov: 45, source: DRESSING },
  'vista-wall': { position: [-11.68, 76.8, 1412.46], target: [0, 120, 640], fov: 40, source: DRESSING },
  'vista-high': { position: [76.27, 130.2, 1376.72], target: [31.71, 75.2, 1468.7], fov: 55, source: DRESSING },
  // The Marin climb (item 3), north approach stations s and lane offsets x (+ west): the driver's eye (1.2 m) in the
  // northbound middle lane at s 600 where the car turns and at s 850, looking at the cut at s 950-960; the southbound
  // middle lane at s 935 looking along the toe wall to s 975; and 30 m above x -20 at s 880 looking at s 950, x 30.
  'climb-drive': { position: [219.92, 79.11, 1552.17], target: [410.73, 98.67, 1840.21], fov: 55, source: DRESSING },
  'climb-road': { position: [357.63, 89.77, 1753.2], target: [409.49, 98.28, 1851.32], fov: 55, source: DRESSING },
  'climb-toe': { position: [395.98, 94.94, 1829.66], target: [420.3, 98.68, 1863.33], fov: 55, source: DRESSING },
  'climb-high': { position: [353.72, 120.32, 1786.6], target: [424.81, 99.67, 1835.04], fov: 55, source: DRESSING },
  // The anchorage housings and art-deco pylons (item 6; bridge GLB SouthAnchorage and NorthAnchorage, the pylons at
  // x +-16.2, z +-985.98, their crowns to 70.7 m): the driver's eye (1.2 m) in the outer lane 60 m before the
  // pylons entering (the approach at s 13) and leaving (the deck at z +-926, its road about 65.96 m), looking along
  // the lane; and from 100 m of the east pylon (the west pylon for 'spylon-100w'), clear of the terrain: from the
  // bay side east and west at the south end, from the bay side east and the land side north-east at the north end
  // (the bay-side camera 120 m up, over the bluff east of the north side span, which hides the housing from lower).
  'spylon-enter': { position: [-7.8, 63.34, -1045.98], target: [-7.8, 65.84, -956], fov: 55, source: PYLONS },
  'spylon-leave': { position: [7.8, 67.16, -926], target: [7.8, 65.66, -1046], fov: 55, source: PYLONS },
  'spylon-100e': { position: [-66.2, 85, -899.4], target: [-16.2, 50, -985.98], fov: 55, source: PYLONS },
  'spylon-100w': { position: [66.2, 80, -899.4], target: [16.2, 50, -985.98], fov: 55, source: PYLONS },
  'npylon-enter': { position: [7.8, 63.41, 1045.98], target: [7.8, 65.91, 956], fov: 55, source: PYLONS },
  'npylon-leave': { position: [-7.8, 67.16, 926], target: [-7.8, 65.66, 1046], fov: 55, source: PYLONS },
  'npylon-100e': { position: [-66.2, 120, 899.4], target: [-16.2, 45, 985.98], fov: 55, source: PYLONS },
  'npylon-100ne': { position: [-86.9, 80, 1056.7], target: [-16.2, 50, 985.98], fov: 55, source: PYLONS },
};
const PLAZA_CAMS = ['plaza-drive', 'plaza-deck', 'plaza-high'], VISTA_CAMS = ['vista-drive', 'vista-lot', 'vista-wall', 'vista-high'];
const CLIMB_CAMS = ['climb-drive', 'climb-road', 'climb-toe', 'climb-high'];
const PYLON_CAMS = ['spylon-enter', 'spylon-leave', 'spylon-100e', 'spylon-100w', 'npylon-enter', 'npylon-leave', 'npylon-100e', 'npylon-100ne'];
const JOINT_RANGES = ['tjoint-h30', 'tjoint-h60', 'tjoint-h240', 'pjoint-h30', 'pjoint-h60', 'pjoint-h240'], JOINT_NUDGES = [0, .3, .6];
/** The joint's neighbourhood in a range view (the target is the image centre), cropped and enlarged for the crop sheet. */
const JOINT_CROP = { x: 480, y: 330, w: 320, h: 60, scale: 3 };
const POSE_CAMS = ['fixup-pier', 'fixup-deck'], PIER_CAMS = ['sp-high-w', 'sp-high-e', 'sp-top', 'sp-deck'], SIDE_CAMS = ['side-span', 'side-full'];
const END_CAMS = ['send-side', 'send-high', 'send-drive', 'send-back', 'nend-side', 'nend-high', 'nend-drive', 'nend-back'], DRIVER_CAMS = ['send-enter', 'send-leave', 'nend-enter', 'nend-leave'];
/** Sets captured as before|after pairs under <set>/<label>. */
const LABELLED = new Set(['pairs', 'approaches', 'pier', 'climb']);
const FLIGHTS: [string, string, string][] = [['postcard-sweep', 'day', 'economy'], ['tower-rise', 'day', 'economy'], ['fog-roll', 'fog', 'economy'], ['deck-run', 'golden', 'economy'], ['fog-roll', 'fog', 'high']], FLIGHT_POINTS = [.1, .4, .7, .98];
const SETS: Record<string, SetSpec> = {
  views: {
    description: 'All ten named cameras, the bridge fix-up author\'s two review cameras (fixup-pier, fixup-deck), and SCENE-REVIEW-2\'s four south pier poses and two side poses x Day, Golden hour and Fog on High',
    columns: ALL_CAMS.length + POSE_CAMS.length + PIER_CAMS.length + SIDE_CAMS.length,
    shots: PRESETS.flatMap(preset => [...ALL_CAMS, ...POSE_CAMS, ...PIER_CAMS, ...SIDE_CAMS].map(cam => ({ tier: 'high', preset, cam, time: TIME }))),
  },
  approaches: {
    description: 'SCENE-REVIEW-2 deck ends: the four send-* and four nend-* poses and four driver\'s-eye poses entering and leaving the deck at High Day; the side and high poses on Low and the drive poses at Medium Golden hour',
    columns: 4,
    shots: [
      ...[...END_CAMS, ...DRIVER_CAMS].map(cam => ({ tier: 'high', preset: 'day', cam, time: TIME })),
      ...['send-side', 'send-high', 'nend-side', 'nend-high'].map(cam => ({ tier: 'economy', preset: 'day', cam, time: TIME })),
      ...['send-drive', 'nend-drive', 'send-leave', 'nend-leave'].map(cam => ({ tier: 'balanced', preset: 'golden', cam, time: TIME })),
    ],
  },
  plaza: {
    description: 'Fix round 3 item 1, the toll plaza: the driver\'s eye 150 m south of it looking north, the deck end looking south and a view from above its extra-width side, at High Day and Golden hour, Medium Fog and Low Day',
    columns: PLAZA_CAMS.length,
    shots: [['high', 'day'], ['high', 'golden'], ['balanced', 'fog'], ['economy', 'day']].flatMap(([tier, preset]) => PLAZA_CAMS.map(cam => ({ tier: tier!, preset: preset!, cam, time: TIME }))),
  },
  vista: {
    description: 'Fix round 3 item 2, Vista Point: the driver\'s eye in the northbound right lane at its entrance, from the lot and from the overlook wall looking at the north tower, and a view from above the road, at High Day and Golden hour, Medium Fog and Low Day',
    columns: VISTA_CAMS.length,
    shots: [['high', 'day'], ['high', 'golden'], ['balanced', 'fog'], ['economy', 'day']].flatMap(([tier, preset]) => VISTA_CAMS.map(cam => ({ tier: tier!, preset: preset!, cam, time: TIME }))),
  },
  climb: {
    description: 'Fix round 3 item 3, the Marin climb\'s benched cut: the driver\'s eye where the car turns and 100 m short of the cut, at its toe along the retaining wall and from above, at High Day and Golden hour, Medium Fog and Low Day',
    columns: CLIMB_CAMS.length,
    shots: [['high', 'day'], ['high', 'golden'], ['balanced', 'fog'], ['economy', 'day']].flatMap(([tier, preset]) => CLIMB_CAMS.map(cam => ({ tier: tier!, preset: preset!, cam, time: TIME }))),
  },
  pylons: {
    description: 'Fix round 3 item 6, the anchorage housings and art-deco pylons: the driver\'s eye 60 m before each end\'s pylons entering and leaving the deck, and from 100 m, at High Day and Golden hour',
    columns: 4,
    shots: [['high', 'day'], ['high', 'golden']].flatMap(([tier, preset]) => PYLON_CAMS.map(cam => ({ tier: tier!, preset: preset!, cam, time: TIME }))),
  },
  pier: {
    description: 'SCENE-REVIEW-2 south pier (wake and fender ring) and side poses: the four pier and two side poses at High Day, the pier poses at High Golden hour and at Low Day',
    columns: PIER_CAMS.length + SIDE_CAMS.length,
    shots: [
      ...[...PIER_CAMS, ...SIDE_CAMS].map(cam => ({ tier: 'high', preset: 'day', cam, time: TIME })),
      ...PIER_CAMS.map(cam => ({ tier: 'high', preset: 'golden', cam, time: TIME })),
      ...PIER_CAMS.map(cam => ({ tier: 'economy', preset: 'day', cam, time: TIME })),
    ],
  },
  joints: {
    description: 'Bridge review 3 expansion-joint plates: the south tower and north pylon joints at the driver\'s eye 20 m before them on Low, Medium and High at Day and Golden hour and on Medium in Fog (traffic hidden: a vehicle dissolving through the static camera hid the Medium tower joint); from 30, 60 and 240 m above them along the bridge axis on Low (Day; 100 m back, and at 60 m 150 m back from the tower and 110 m from the pylon), each at lateral offsets 0, 0.3 and 0.6 m, with an enlarged crop of each joint (depth fighting; the plates draw with the polygon offset of fix round 3 item 0)',
    columns: 6,
    shots: [
      ...['economy', 'balanced', 'high'].flatMap(tier => ['day', 'golden'].flatMap(preset => ['tjoint-drive', 'pjoint-drive'].map(cam => ({ tier, preset, cam, time: TIME, hideTraffic: true })))),
      ...['tjoint-drive', 'pjoint-drive'].map(cam => ({ tier: 'balanced', preset: 'fog', cam, time: TIME, hideTraffic: true })),
      ...JOINT_RANGES.flatMap(cam => JOINT_NUDGES.map(nudge => ({ tier: 'economy', preset: 'day', cam, time: TIME, nudge }))),
    ],
  },
  pairs: {
    description: 'Bridge before/after pairs: the fix-up author\'s south pier and deck cameras x Day, Golden hour and Fog on High, and at Golden hour on Medium (contact shadows, the drive view\'s tier and light)',
    columns: POSE_CAMS.length,
    shots: [...PRESETS.flatMap(preset => POSE_CAMS.map(cam => ({ tier: 'high', preset, cam, time: TIME }))), ...POSE_CAMS.map(cam => ({ tier: 'balanced', preset: 'golden', cam, time: TIME }))],
  },
  flights: {
    description: 'The four flyovers on Low (economy) at 10, 40, 70 and 98 percent of their time: postcard sweep and tower rise at Day, fog roll at Fog, deck run at Golden hour; then the fog roll on High (with the fog banks)',
    columns: FLIGHT_POINTS.length,
    shots: FLIGHTS.flatMap(([flight, preset, tier]) => FLIGHT_POINTS.map(at => ({ tier, preset, cam: 'postcard', time: TIME, flight, at }))),
  },
  traffic: {
    description: 'Traffic: lanes, sidewalk, traffic and deck views x three presets on High; lanes and traffic (all six lanes) on Medium and Low; lanes at +1 s and +2 s of flow on High',
    columns: TRAFFIC_CAMS.length,
    shots: [
      ...PRESETS.flatMap(preset => TRAFFIC_CAMS.map(cam => ({ tier: 'high', preset, cam, time: TIME }))),
      ...['balanced', 'economy'].flatMap(tier => ['lanes', 'traffic'].map(cam => ({ tier, preset: 'day', cam, time: TIME }))),
      { tier: 'high', preset: 'day', cam: 'lanes', time: TIME, advance: 1 }, { tier: 'high', preset: 'day', cam: 'lanes', time: TIME, advance: 2 },
    ],
  },
  water: {
    description: 'WATER-SPEC: five cameras x three presets on High, plus postcard and pier on Low (all three presets)',
    columns: WATER_CAMS.length,
    shots: [
      ...PRESETS.flatMap(preset => WATER_CAMS.map(cam => ({ tier: 'high', preset, cam, time: TIME }))),
      ...PRESETS.flatMap(preset => ['postcard', 'pier'].map(cam => ({ tier: 'economy', preset, cam, time: TIME }))),
    ],
  },
};
/** Judged regions per camera at 1280x720 (x0, y0, x1, y1). */
const REGIONS: Record<string, Record<string, [number, number, number, number]>> = {
  postcard: { sky: [300, 5, 1000, 60], water: [1150, 500, 1270, 700] },
  pier: { water: [0, 500, 1280, 720] },
  topdown: { water: [200, 100, 1080, 620] },
  horizon: { sky: [0, 0, 1280, 120], water: [0, 520, 1280, 720] },
  deck: { road: [500, 560, 780, 720] },
  'fixup-deck': { road: [440, 600, 840, 720] },
};

const setName = process.argv[2] ?? 'water', spec = SETS[setName];
if (!spec) throw new Error(`Unknown capture set ${setName}; sets: ${Object.keys(SETS).join(', ')}`);
const backendsArg = process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2';
const backends = backendsArg.split(/[,+ ]+/).filter(Boolean) as Backend[];
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) ?? 'after', labelled = LABELLED.has(setName);
if (labelled && !['before', 'after'].includes(label)) throw new Error('--label is before or after');
const pairsRoot = setName === 'pairs' ? resolve(PACKAGE_ROOT, 'evidence/captures/views/pairs') : resolve(PACKAGE_ROOT, 'evidence/captures', setName);
const outDir = labelled ? resolve(pairsRoot, label) : resolve(PACKAGE_ROOT, 'evidence/captures', setName); mkdirSync(outDir, { recursive: true });
const keyOf = (s: Shot) => s.flight ? `${s.tier}-${s.preset}-${s.flight}-${Math.round((s.at ?? 0) * 100)}` : `${s.tier}-${s.preset}-${s.cam}${s.advance ? `-plus${s.advance}s` : ''}${s.nudge !== undefined ? `-x${s.nudge.toFixed(1)}` : ''}`;
/** A region of an image enlarged by pixel replication. */
function crop(img: Image, x0: number, y0: number, w: number, h: number, k: number): Image {
  const out: Image = { width: w * k, height: h * k, data: new Uint8Array(w * k * h * k * 4) };
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const s = ((y0 + Math.floor(y / k)) * img.width + x0 + Math.floor(x / k)) * 4;
    out.data.set(img.data.subarray(s, s + 4), (y * w * k + x) * 4);
  }
  return out;
}
/** The pose of a shot: its named pose, moved sideways by `nudge` metres. */
const poseOf = (s: Shot) => { const p = POSES[s.cam]; if (!p || !s.nudge) return p; return { ...p, position: [p.position[0] + s.nudge, p.position[1], p.position[2]] as [number, number, number], target: [p.target[0] + s.nudge, p.target[1], p.target[2]] as [number, number, number] }; };
const fileFor = (backend: Backend, s: Shot) => resolve(outDir, backend, `${keyOf(s)}.png`);

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless(`gg-capture-${setName}`, WIDTH, HEIGHT);
const records: Record<string, unknown>[] = [], images = new Map<string, Image>();
try {
  const capture = async (backend: Backend, shot: Shot) => {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    try {
      const pose = poseOf(shot);
      const params = `capture=1&hud=0&tier=${shot.tier}&preset=${shot.preset}&cam=${pose ? 'postcard' : shot.cam}&time=${shot.time}${shot.flight ? `&flight=${shot.flight}&flightAt=${shot.at ?? 0}` : ''}${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
      const url = `${hosted.url}/?${params}`; assertOwnedUrl(url, owned);
      await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 });
      const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
      if (!snapshot.readyCount) throw new Error(`${backend} ${params}: ${JSON.stringify(snapshot.errors)}`);
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(12));
      if (pose) {
        const mode = await page.evaluate(p => (window as any).__kilnScene.invoke('setPose', p), pose);
        if (mode !== 'pose') throw new Error(`${params}: setPose ${shot.cam} left the camera in ${mode}`);
        await page.evaluate(() => (window as any).__kilnScene.waitFrames(12));
      }
      if (shot.hideTraffic && !await page.evaluate(() => (window as any).__kilnScene.invoke('setPartVisible', 'traffic', false))) throw new Error(`${params}: setPartVisible traffic failed`);
      if (shot.advance) { await page.evaluate(s => (window as any).__kilnScene.invoke('advanceTraffic', s), shot.advance); await page.evaluate(() => (window as any).__kilnScene.waitFrames(4)); }
      const stats = await page.evaluate(() => (window as any).__kilnScene.invoke('ggStats'));
      const traffic = await page.evaluate(() => (window as any).__kilnScene.invoke('trafficStats'));
      if (shot.flight && stats.camera.mode !== 'flight') throw new Error(`${params}: the flight is not playing (camera ${stats.camera.mode})`);
      const p = stats.camera.position as number[], ground = shot.flight ? await page.evaluate((x, z) => (window as any).__kilnScene.invoke('heightAt', x, z) as number, p[0]!, p[2]!) : null;
      const bytes = Buffer.from(await page.screenshot({ type: 'png' })), img = readPng(bytes);
      return { params, snapshot, stats, traffic, bytes, img, clearance: ground === null ? null : +(p[1]! - Math.max(0, ground)).toFixed(2), unexpected: unexpectedMessages(messages) };
    } finally { await page.close(); }
  };
  for (const backend of backends) {
    for (const shot of spec.shots) {
      const r = await capture(backend, shot), file = fileFor(backend, shot);
      mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, r.bytes);
      images.set(`${backend}|${keyOf(shot)}`, r.img);
      const regions = Object.fromEntries(Object.entries(shot.flight ? {} : REGIONS[shot.cam] ?? {}).map(([name, box]) => { const c = regionMean(r.img, ...box); return [name, { srgb: round(c), luma: Math.round(luma(c)) }]; }));
      const w = r.stats.water.description;
      records.push({
        file: relative(PACKAGE_ROOT, file).replace(/\\/g, '/'), sha256: createHash('sha256').update(r.bytes).digest('hex'),
        backend: r.snapshot.backend.backend, fellBack: r.snapshot.backend.fellBack, gpu: r.snapshot.backend.adapter,
        url: `/?${r.params}`, parameters: shot, ...(POSES[shot.cam] ? { pose: { ...poseOf(shot), hook: 'setPose' } } : {}), viewport: [WIDTH, HEIGHT],
        renderer: { toneMapping: 'NeutralToneMapping', toneMappingId: r.stats.toneMapping, exposure: r.stats.exposure, samples: r.stats.samples, pixelRatio: r.stats.knobs.pixelRatio },
        tier: { name: r.stats.tier, feature: r.stats.knobs.feature, shadows: r.stats.knobs.shadows, terrainTiles: r.stats.terrainTiles, fogBankPuffs: r.stats.fogBankPuffs, vegetation: r.stats.vegetation },
        water: { reflection: w.reflection, grid: w.grid, displacedWaves: w.displacedWaves, fragmentWaves: w.fragmentWaves, detailLayers: w.detailLayers, depthContact: w.depthContact, waveFade: w.waveFade, vertices: r.stats.water.vertices, tiles: r.stats.water.tiles },
        camera: r.stats.camera, ...(shot.flight ? { flight: { name: shot.flight, at: shot.at, clearanceAboveGrid: r.clearance } } : {}),
        traffic: r.traffic ? { vehicles: r.traffic.vehicles, drawn: r.traffic.drawn, draws: r.traffic.draws, triangles: r.traffic.triangles, perLevel: r.traffic.perLevel, perType: r.traffic.perType, braking: r.traffic.braking, fading: r.traffic.fading, density: r.traffic.density } : null,
        judgement: { regions, paint: shot.preset === 'day' ? paintStats(r.img) : null, extremes: extremes(r.img), unexpectedConsole: r.unexpected.slice(0, 5) },
      });
      console.log(JSON.stringify({ backend, ...shot, unexpected: r.unexpected.length, regions, ...(shot.flight ? { clearance: r.clearance } : {}) }));
    }
  }
  // Reproducibility: the first shot again in a fresh page must match its first capture.
  const first = spec.shots[0]!, again = await capture(backends[0]!, first);
  const reproducibility = { backend: backends[0], shot: first, ...compareImages(images.get(`${backends[0]}|${keyOf(first)}`)!, again.img) };
  // Backend parity per shot (max-channel absolute difference).
  const parity = backends.length < 2 ? [] : spec.shots.map(s => ({ ...s, ...compareImages(images.get(`webgpu|${keyOf(s)}`)!, images.get(`webgl2|${keyOf(s)}`)!) }));
  const sheets: string[] = [];
  for (const backend of backends) {
    const sheet = resolve(outDir, `${backend}-sheet.png`);
    writeFileSync(sheet, writePng(montage(spec.shots.map(s => downsample(images.get(`${backend}|${keyOf(s)}`)!, 4)), spec.columns)));
    sheets.push(relative(PACKAGE_ROOT, sheet).replace(/\\/g, '/'));
    // The joints set: each range view's joint enlarged, one row per view, one column per lateral offset.
    const ranged = spec.shots.filter(s => s.nudge !== undefined);
    if (ranged.length) {
      const c = JOINT_CROP, file = resolve(outDir, `${backend}-joint-crops.png`);
      writeFileSync(file, writePng(montage(ranged.map(s => crop(images.get(`${backend}|${keyOf(s)}`)!, c.x, c.y, c.w, c.h, c.scale)), JOINT_NUDGES.length)));
      sheets.push(relative(PACKAGE_ROOT, file).replace(/\\/g, '/'));
    }
  }
  // The staged release the test build carries (g1, g2, ...), so every records file names its bridge.
  const built = resolve(outputFor('test'), 'assets');
  const release = { release: (JSON.parse(readFileSync(resolve(built, 'data/scene.json'), 'utf8')) as { release: string }).release, packSha256: createHash('sha256').update(readFileSync(resolve(built, 'pack.json'))).digest('hex') };
  const summary = { set: setName, ...(labelled ? { label } : {}), description: spec.description, captured: new Date().toISOString(), build: 'dist/test (development build with test hooks)', ...release, images: records.length, sheets, reproducibility, parity, records };
  writeJson(resolve(outDir, 'captures.json'), summary);
  // Before|after sheets (half size, one pair per row) once both runs exist.
  if (labelled && label === 'after') {
    const comparisons: Record<string, unknown>[] = [];
    for (const backend of backends) {
      const rows: Image[] = [];
      for (const shot of spec.shots) {
        const before = resolve(pairsRoot, 'before', backend, `${keyOf(shot)}.png`); if (!existsSync(before)) continue;
        const a = readPng(readFileSync(before)), b = images.get(`${backend}|${keyOf(shot)}`)!;
        rows.push(downsample(a, 2), downsample(b, 2));
        const road = REGIONS[shot.cam]?.road;
        comparisons.push({ backend, shot: keyOf(shot), ...compareImages(a, b), ...(road ? { roadLuma: { before: Math.round(luma(regionMean(a, ...road))), after: Math.round(luma(regionMean(b, ...road))) } } : {}) });
      }
      if (!rows.length) continue;
      const sheet = resolve(pairsRoot, `${backend}-${setName === 'pairs' ? 'pairs' : 'before-after'}-sheet.png`); writeFileSync(sheet, writePng(montage(rows, 2)));
      console.log(JSON.stringify({ pairsSheet: relative(PACKAGE_ROOT, sheet).replace(/\\/g, '/'), pairs: rows.length / 2 }));
    }
    const rel = setName === 'pairs' ? 'views/pairs' : setName;
    writeJson(resolve(pairsRoot, setName === 'pairs' ? 'pairs.json' : 'before-after.json'), { description: `Before | after pairs of the ${setName} set (each side's release is in its captures.json): left column before, right column after, rows in the order of the records`, before: `${rel}/before/captures.json`, after: `${rel}/after/captures.json`, comparisons });
  }
  const worst = parity.reduce((a, p) => p.mean > a.mean ? p : a, { mean: 0, p99: 0, over24: 0 } as { mean: number; p99: number; over24: number });
  console.log(JSON.stringify({ images: records.length, sheets, reproducibility: { mean: reproducibility.mean, p99: reproducibility.p99 }, worstParity: worst, unexpected: records.reduce((n, r) => n + ((r.judgement as { unexpectedConsole: unknown[] }).unexpectedConsole.length), 0) }));
} finally { await chrome.close(); await hosted.close(); }
