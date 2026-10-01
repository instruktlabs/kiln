// Bridge review 3 (coordinator, 23:13): the expansion joints are flush 0.6 m steel plates whose top lies
// 1.5 mm above the Roadway, which runs on beneath them, so at range the depth buffer may not separate the two.
// On Low (economy) at Day with the traffic hidden, this sweeps the camera toward each of the four joints (both
// towers, both pylons), always looking at the plate's centre (the image centre):
//  - flyover paths: H m above the joint, d m from it on the midspan side, d in 10 m steps from 10 to 800 m;
//  - the driver's eye: 1.2 m above the road in the middle lane, 5 to 60 m before the joint, at three lateral
//    offsets across the lane.
// Per image it measures the plate line: the largest median luma excess, across the road's inner width, of a row
// near the centre over the asphalt beyond the plate's projected half-height (3 px margin). Where the plate should
// cover at least 0.2 px it counts as drawn at an excess of 3 or more; a path whose plate is drawn at one step and
// missing at the next flickers as the camera moves.
// Prediction: the separation along the view ray is h / sin(theta) (h = 1.5 mm, theta the grazing angle), and the
// depth quantum of a standard 24-bit buffer with near n = 0.5 m is L^2 / (n 2^24) at slant distance L.
// Fix round 3 item 0 sets a polygon offset on the plates' material (data/layout.json bridge.jointPlates) and leaves
// the GLB alone, so the tool also raycasts the staged web GLB straight down every metre across the road at each joint
// and requires the plate top to stay 1.5 mm (within 0.1 mm) above the Roadway.
// Writes evidence/captures/joints/<backend>-depth.json and <backend>-depth-sheet.png (the south tower at 120 m:
// the plate's neighbourhood at each step from 100 to 400 m, top to bottom).
// Usage: bun tests/tools/joint-depth.ts [--backends=webgpu,webgl2]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Raycaster, Vector3, type Object3D } from 'three/webgpu';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { luma, montage, readPng, writePng, type Image } from './image.ts';
import { bridgeWebPath, nodeMeshes, readGlb } from '../../scripts/layout.ts';
import { LAYOUT } from '../../src/data';

type Backend = 'webgpu' | 'webgl2';
const WIDTH = 1280, HEIGHT = 720, FOV = 55, FOCAL = HEIGHT / 2 / Math.tan(FOV / 2 * Math.PI / 180);
const NEAR = .5, DEPTH_BITS = 24, PLATE = { top: .0015, length: .6 }, ROAD_WIDTH = 18.9, LANE_X = -4.8, EYE = 1.2;
const GRADE = .0318, END = { z: 1032.98, y: 62.55 }, CREST = { outer: 715.08, length: 150, tower: 640.08 };
/** The g3 Roadway top at |z| on the side spans and through the towers' crest curves (coordinator's measured profile: 62.55 m at the deck end, 3.18 % to 715.08, a 150 m crest curve centred on the tower, 74.461 m at the tower). */
function roadY(z: number): number {
  const a = Math.abs(z);
  if (a >= CREST.outer) return END.y + GRADE * (END.z - a);
  const s = CREST.outer - a, atOuter = END.y + GRADE * (END.z - CREST.outer), tower = 74.461, t = CREST.outer - CREST.tower;
  const k = (atOuter + GRADE * t - tower) / (t * t); // grade falls linearly across the crest: y = atOuter + GRADE s - k s^2
  return atOuter + GRADE * s - k * s * s;
}
const JOINTS = [
  { name: 'south-pylon', z: -982.98 }, { name: 'south-tower', z: -640.08 }, { name: 'north-tower', z: 640.08 }, { name: 'north-pylon', z: 982.98 },
];
const HEIGHTS = [30, 60, 120, 240], PATH = Array.from({ length: 80 }, (_, i) => 10 + i * 10), EYE_DISTANCES = [5, 10, 15, 20, 25, 30, 40, 50, 60], EYE_OFFSETS = [-1, 0, 1];
const GEOMETRY_X = Array.from({ length: 19 }, (_, i) => i - 9), GEOMETRY_TOLERANCE_MM = .1;
const CLIP = { x: 440, y: 320, width: 400, height: 80 }, ROW0 = 360 - CLIP.y, DRAWN = 3, MIN_PX = .2, SOLID_PX = .3;

const backends = (process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const L = (img: Image, x: number, y: number) => { const i = (y * img.width + x) * 4; return luma([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]); };
/** The plate line in a clip: the row within 4 px of the centre with the largest median excess over the rows `r` px above and below. */
function plateLine(img: Image, half: number, r: number): number {
  let best = -1e9;
  for (let y = ROW0 - 4; y <= ROW0 + 4; y++) {
    const ex: number[] = [];
    for (let x = CLIP.width / 2 - half; x <= CLIP.width / 2 + half; x++) ex.push(L(img, x, y) - (L(img, x, y - r) + L(img, x, y + r)) / 2);
    best = Math.max(best, ex.sort((a, b) => a - b)[ex.length >> 1]!);
  }
  return +best.toFixed(1);
}
/** Geometry of a view of the plate from `eye`: grazing angle on the (graded) road, projected plate height, separation over the depth quantum. */
function predict(eye: [number, number, number], joint: { z: number }) {
  const y = roadY(joint.z), dz = joint.z - eye[2], dy = y - eye[1], slant = Math.hypot(dz, dy, 0);
  const slope = (roadY(joint.z + .5) - roadY(joint.z - .5)); // rise per metre northward
  const theta = Math.abs(Math.atan2(-dy, Math.abs(dz)) + Math.atan(slope) * Math.sign(dz)); // view ray against the road plane
  const platePx = PLATE.length * Math.sin(theta) * FOCAL / slant, separation = PLATE.top / Math.sin(theta), quantum = slant * slant / (NEAR * 2 ** DEPTH_BITS);
  return { slant: +slant.toFixed(1), grazingDeg: +(theta * 180 / Math.PI).toFixed(2), platePx: +platePx.toFixed(2), sepOverQuantum: +(separation / quantum).toFixed(2), half: Math.max(2, Math.floor(ROAD_WIDTH * FOCAL / slant / 2) - 3), r: Math.ceil(platePx / 2) + 3 };
}
/**
 * Visibility along a path: steps where the plate should show (at least MIN_PX), whether it was drawn, the number of
 * drawn/missing changes, and the steps missed although the plate should cover SOLID_PX or more (below that a
 * plate thinner than a pixel comes and goes with the sampling phase, depth or not).
 */
function runs(steps: { platePx: number; excess: number }[]) {
  const seen = steps.filter(s => s.platePx >= MIN_PX).map(s => s.excess >= DRAWN);
  let toggles = 0; for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) toggles++;
  const missedSolid = steps.filter(s => s.platePx >= SOLID_PX && s.excess < DRAWN).length;
  return { expected: seen.length, drawn: seen.filter(Boolean).length, toggles, missedSolid };
}
/** The GLB is not patched: the plate top minus the Roadway top, raycast straight down every metre across the road at each joint. */
function plateGeometry() {
  const path = bridgeWebPath(), bytes = new Uint8Array(readFileSync(path)), node = readGlb(bytes).json.nodes.map(n => n.name ?? '').find(n => /joint/i.test(n));
  if (!node) throw new Error(`no joint node in ${path}`);
  const road = nodeMeshes(bytes, 'Roadway'), plate = nodeMeshes(bytes, node), ray = new Raycaster(), down = new Vector3(0, -1, 0);
  road.updateMatrixWorld(true); plate.updateMatrixWorld(true);
  const top = (o: Object3D, x: number, z: number) => { ray.set(new Vector3(x, 200, z), down); return ray.intersectObject(o, true)[0]?.point.y ?? NaN; };
  const joints = JOINTS.map(j => {
    const mm = GEOMETRY_X.map(x => +((top(plate, x, j.z) - top(road, x, j.z)) * 1000).toFixed(3));
    return { joint: j.name, z: j.z, minMm: Math.min(...mm), maxMm: Math.max(...mm), pass: mm.every(v => Math.abs(v - PLATE.top * 1000) <= GEOMETRY_TOLERANCE_MM), mm };
  });
  return { glb: basename(path), sha256: createHash('sha256').update(bytes).digest('hex'), node, x: GEOMETRY_X, expectedMm: PLATE.top * 1000, toleranceMm: GEOMETRY_TOLERANCE_MM, pass: joints.every(j => j.pass), joints };
}
const geometry = plateGeometry();
console.log(`geometry (${geometry.glb}, ${geometry.node}): plate top minus Roadway ${geometry.joints.map(j => `${j.joint} ${j.minMm}..${j.maxMm} mm`).join(', ')} at x -9..9 m every metre: ${geometry.pass ? 'pass' : 'FAIL'}`);

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-joint-depth', WIDTH, HEIGHT);
try {
  for (const backend of backends) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    const url = `${hosted.url}/?capture=1&hud=0&tier=economy&preset=day&cam=postcard&time=12${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 });
    const invoke = <T>(name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args) as Promise<T>;
    const frames = (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n);
    if (!await invoke<boolean>('setPartVisible', 'traffic', false)) throw new Error('setPartVisible traffic failed');
    const shoot = async (position: [number, number, number], target: [number, number, number]) => {
      const mode = await invoke<string>('setPose', { position, target, fov: FOV });
      if (mode !== 'pose') throw new Error(`setPose left the camera in ${mode}`);
      await frames(3);
      return readPng(Buffer.from(await page.screenshot({ type: 'png', clip: CLIP })));
    };
    const paths: Record<string, unknown>[] = [], eyes: Record<string, unknown>[] = [], strip: Image[] = [];
    for (const j of JOINTS) {
      const y = roadY(j.z), toward = Math.sign(j.z);
      for (const H of HEIGHTS) {
        const steps: { d: number; platePx: number; sepOverQuantum: number; excess: number }[] = [];
        for (const d of PATH) {
          const eye: [number, number, number] = [0, y + H, j.z - toward * d], p = predict(eye, j);
          const img = await shoot(eye, [0, y, j.z]);
          steps.push({ d, platePx: p.platePx, sepOverQuantum: p.sepOverQuantum, excess: plateLine(img, p.half, p.r) });
          if (j.name === 'south-tower' && H === 120 && d >= 100 && d <= 400) strip.push({ width: 200, height: 24, data: (() => { const out = new Uint8Array(200 * 24 * 4); for (let r = 0; r < 24; r++) out.set(img.data.subarray(((ROW0 - 12 + r) * CLIP.width + 100) * 4, ((ROW0 - 12 + r) * CLIP.width + 300) * 4), r * 200 * 4); return out; })() });
        }
        const unresolved = steps.filter(s => s.sepOverQuantum < 1);
        paths.push({ joint: j.name, height: H, unresolvedFrom: unresolved[0]?.d ?? null, ...runs(steps), steps });
      }
      // The driver's eye in the middle lane, approaching from the side where the road runs on (towers: the side span; pylons: the midspan side).
      const from = j.name.endsWith('tower') ? toward : -toward;
      for (const d of EYE_DISTANCES) for (const o of EYE_OFFSETS) {
        const z = j.z + from * d, eye: [number, number, number] = [LANE_X + o, roadY(z) + EYE, z], p = predict(eye, j);
        const img = await shoot(eye, [LANE_X + o, y, j.z]);
        eyes.push({ joint: j.name, distance: d, offset: o, platePx: p.platePx, sepOverQuantum: p.sepOverQuantum, excess: plateLine(img, p.half, p.r) });
      }
    }
    const unexpected = unexpectedMessages(messages);
    await page.close();
    const eyeRuns = JOINTS.map(j => ({ joint: j.name, ...runs(eyes.filter(e => e.joint === j.name) as { platePx: number; excess: number }[]) }));
    writeJson(resolve(PACKAGE_ROOT, 'evidence/captures/joints', `${backend}-depth.json`), {
      description: `Bridge review 3 joint plates on Low (economy) at Day, traffic hidden, looking at the plate centre. Flyover paths: H m above the joint, d m from it on the midspan side, d = 10..800 m in 10 m steps. Driver's eye: ${EYE} m above the road in the middle lane (x ${LANE_X} +- 1 m), 5 to 60 m before the joint. excess = the plate line's median luma over the asphalt beyond its projected half-height; drawn = excess >= ${DRAWN} where the plate should cover >= ${MIN_PX} px; toggles = drawn/missing changes between consecutive steps; missedSolid = steps missed where the plate should cover >= ${SOLID_PX} px; sepOverQuantum = plate-to-road separation along the ray over the depth quantum of a standard ${DEPTH_BITS}-bit buffer with near ${NEAR} m. The plates' material draws with polygonOffset (fix round 3 item 0, data/layout.json bridge.jointPlates). geometry: the staged web GLB raycast straight down, plate top minus Roadway top in mm every metre from x -9 to 9 m`,
      backend, near: NEAR, depthBits: DEPTH_BITS, polygonOffset: LAYOUT.bridge.jointPlates.polygonOffset, geometry, unexpected, paths, eyeRuns, eyes,
    });
    if (strip.length) writeFileSync(resolve(PACKAGE_ROOT, 'evidence/captures/joints', `${backend}-depth-sheet.png`), writePng(montage(strip, 1)));
    console.log(`${backend}: ${paths.length} flyover paths x ${PATH.length} steps, ${eyes.length} driver's-eye views; unexpected messages ${unexpected.length}`);
    for (const p of paths) console.log(`  ${String(p.joint).padEnd(11)} H ${String(p.height).padStart(3)}: unresolved from d ${p.unresolvedFrom ?? '-'}; plate expected at ${p.expected} steps, drawn at ${p.drawn}, toggles ${p.toggles}, missed at >= ${SOLID_PX} px ${p.missedSolid}`);
    for (const r of eyeRuns) console.log(`  ${r.joint.padEnd(11)} driver's eye: expected ${r.expected}, drawn ${r.drawn}, toggles ${r.toggles}, missed at >= ${SOLID_PX} px ${r.missedSolid}`);
  }
} finally { await chrome.close(); await hosted.close(); }
if (!geometry.pass) throw new Error('joint plates: the GLB no longer puts the plate top 1.5 mm above the Roadway at every metre');
