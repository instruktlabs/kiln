// amr-floor-robot: Foundry Floor AMR. Metres, +X forward, +Y up, +Z right.
// ---- core ----
const meta = { name: 'amr-floor-robot' };

const CH = { w: 1.00, d: 0.70, y0: 0.06, y1: 0.40, r: 0.12 };
const RING = { y0: 0.12, y1: 0.22 };
const DRIVE = { r: 0.10, w: 0.05, hub: 0.06, hubW: 0.056, z: 0.30 };
const CASTER = { r: 0.05, w: 0.03, hub: 0.03, hubW: 0.034, x: 0.38, z: 0.24 };
const LIDAR = { y0: 0.28, y1: 0.34, proud: 0.004, ext: 0.10 };
const MAST = { x0: -0.48, x1: -0.30, z0: 0.24, z1: 0.35, y0: 0.40, y1: 1.23, rr: [0.005, 0.09, 0.01, 0.005], lampR: 0.05 };
const BAND = { y0: 1.00, y1: 1.10, proud: 0.005 };
const SCREEN = { y0: 0.70, y1: 0.95, z0: 0.245, z1: 0.345, proud: 0.01 };
const LIFT = { w: 0.50, d: 0.40, r: 0.04, y0: 0.40, top: 1.10 };
const DECK = { w: 0.90, d: 0.60, y0: 1.10, y1: 1.15, r: 0.03, rimH: 0.02, rimT: 0.0015, notchX: -0.28, notchZ: 0.22 };
const PIN = { ring: 0.085, h: 0.006, rBase: 0.0075, rTop: 0.0008 }; // match the actual FOUP's 7 mm deep V-grooves
const FOUP_X = [0.23, -0.23];
const RISE = 0.15, CLIP_S = 2.0, EASE_S = 0.3;
const LOD_INSET = 0.002;

const rad = (d) => d * Math.PI / 180;

function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
const ccw = (pts) => (area(pts) < 0 ? pts.slice().reverse() : pts);
const uv = (xz) => xz.map(([x, z]) => [x, -z]);

function rrect(w, d, r, n) {
  const hx = w / 2 - r, hz = d / 2 - r, out = [];
  const cs = [[hx, hz, 0], [-hx, hz, 90], [-hx, -hz, 180], [hx, -hz, 270]];
  for (const [cx, cz, a0] of cs) {
    for (let i = 0; i <= n; i++) {
      const a = rad(a0 + 90 * i / n);
      out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return out;
}

async function slab(xz, y0, y1, holesXZ) {
  const opts = { depth: y1 - y0, center: false };
  if (holesXZ) opts.holes = holesXZ.map((h) => uv(h));
  return extrudeProfile(ccw(uv(xz)), opts);
}

function put(parent, name, geo, mat, opts) {
  const m = createPart(name, geo, mat, Object.assign({ parent }, opts || {}));
  m.name = name;
  return m;
}

function group(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  return g;
}

function mat(name, color, o) {
  const m = gameMaterial(color, Object.assign({ flatShading: false }, o));
  m.name = name;
  return m;
}

function makeMaterials() {
  const M = {
    white: mat('tool-shell-white', 0xE8EBEE, { roughness: 0.55, metalness: 0 }),
    orange: mat('accent-amhs', 0xE07B22, { roughness: 0.5, metalness: 0 }),
    graphite: mat('trim-graphite', 0x3B4148, { roughness: 0.5, metalness: 0.1 }),
    rubber: mat('rubber-black', 0x1E2226, { roughness: 0.9, metalness: 0 }),
    glass: mat('glass-smoked', 0x5E6A73, { roughness: 0.1, metalness: 0 }),
    steel: mat('stainless', 0xB9BEC3, { roughness: 0.35, metalness: 1 }),
    green: mat('status-green', 0x22B14C, { roughness: 0.4, metalness: 0, emissive: 0x22B14C, emissiveIntensity: 0.8 }),
  };
  M.glass.transparent = true;
  M.glass.opacity = 0.6;
  return M;
}

function deckOutline(inset, n) {
  const hx = DECK.w / 2 - inset, hz = DECK.d / 2 - inset, r = DECK.r - inset;
  const nx = DECK.notchX + inset, nz = DECK.notchZ - inset;
  const arc = (cx, cz, a0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + 90 * i / n);
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
  return [
    ...arc(hx - r, hz - r, 0),
    [nx, hz], [nx, nz], [-hx, nz],
    ...arc(-(hx - r), -(hz - r), 180),
    ...arc(hx - r, -(hz - r), 270),
  ];
}

function mastOutline(off, n) {
  const x0 = MAST.x0 + off, x1 = MAST.x1 - off, z0 = MAST.z0 + off, z1 = MAST.z1 - off;
  const rs = MAST.rr.map((v) => Math.max(0.002, v - off));
  const cs = [[x1 - rs[0], z1 - rs[0], 0, rs[0]], [x0 + rs[1], z1 - rs[1], 90, rs[1]], [x0 + rs[2], z0 + rs[2], 180, rs[2]], [x1 - rs[3], z0 + rs[3], 270, rs[3]]];
  const out = [];
  for (const [cx, cz, a0, r] of cs) {
    for (let i = 0; i <= n; i++) {
      const a = rad(a0 + 90 * i / n);
      out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return out;
}

async function lidarStrip() {
  const cx = CH.w / 2 - CH.r, cz = CH.d / 2 - CH.r;
  const Ro = CH.r + LIDAR.proud, Ri = CH.r - 0.002, E = LIDAR.ext, n = 6;
  const pts = [[cx + Ro, cz - E]];
  for (let i = 0; i <= n; i++) {
    const a = rad(90 * i / n);
    pts.push([cx + Ro * Math.cos(a), cz + Ro * Math.sin(a)]);
  }
  pts.push([cx - E, cz + Ro], [cx - E, cz + Ri]);
  for (let i = n; i >= 0; i--) {
    const a = rad(90 * i / n);
    pts.push([cx + Ri * Math.cos(a), cz + Ri * Math.sin(a)]);
  }
  pts.push([cx + Ri, cz - E]);
  return slab(pts, 0, LIDAR.y1 - LIDAR.y0);
}

function addWheel(parent, tag, x, z, R, W, hubR, hubW, nT, nH, M) {
  put(parent, 'tyre' + tag, cylinderGeo(R, R, W, nT), M.rubber, { position: [x, R, z], rotation: [90, 0, 0] });
  put(parent, 'hub' + tag, cylinderGeo(hubR, hubR, hubW, nH), M.graphite, { position: [x, R, z], rotation: [90, 0, 0] });
}

function addCaster(parent, tag, x, z, M) {
  addWheel(parent, tag, x, z, CASTER.r, CASTER.w, CASTER.hub, CASTER.hubW, 16, 8, M);
  put(parent, 'forkA' + tag, boxGeo(0.032, 0.07, 0.004), M.graphite, { position: [x, 0.055, z + 0.022] });
  put(parent, 'forkB' + tag, boxGeo(0.032, 0.07, 0.004), M.graphite, { position: [x, 0.055, z - 0.022] });
}

async function buildAmr(root) {
  const M = makeMaterials();

  const chOutline = rrect(CH.w, CH.d, CH.r, 8);
  const chassis = group(root, 'chassis');
  put(chassis, 'chassisSkirt', await slab(chOutline, 0, RING.y0 - CH.y0), M.white, { position: [0, CH.y0, 0] });
  put(chassis, 'chassisBody', await slab(chOutline, 0, CH.y1 - RING.y1), M.white, { position: [0, RING.y1, 0] });
  put(root, 'bumperRing', await slab(chOutline, 0, RING.y1 - RING.y0), M.orange, { position: [0, RING.y0, 0] });

  const wheels = group(root, 'wheels');
  addWheel(wheels, 'DriveR', 0, DRIVE.z, DRIVE.r, DRIVE.w, DRIVE.hub, DRIVE.hubW, 24, 16, M);
  addWheel(wheels, 'DriveL', 0, -DRIVE.z, DRIVE.r, DRIVE.w, DRIVE.hub, DRIVE.hubW, 24, 16, M);
  addCaster(wheels, 'FrontR', CASTER.x, CASTER.z, M);
  addCaster(wheels, 'FrontL', CASTER.x, -CASTER.z, M);
  addCaster(wheels, 'RearR', -CASTER.x, CASTER.z, M);
  addCaster(wheels, 'RearL', -CASTER.x, -CASTER.z, M);

  const lidar = group(root, 'lidarWindows');
  put(lidar, 'lidarWindowFrontRight', await lidarStrip(), M.glass, { position: [0, LIDAR.y0, 0] });
  put(lidar, 'lidarWindowRearLeft', await lidarStrip(), M.glass, { position: [0, LIDAR.y0, 0], rotation: [0, 180, 0] });

  put(root, 'mast', await slab(mastOutline(0, 4), 0, MAST.y1 - MAST.y0), M.white, { position: [0, MAST.y0, 0] });
  put(root, 'mastBand', await slab(mastOutline(-BAND.proud, 4), 0, BAND.y1 - BAND.y0), M.orange, { position: [0, BAND.y0, 0] });

  const sx1 = MAST.x1 + SCREEN.proud, sx0 = MAST.x1 - 0.001;
  put(root, 'screen', boxGeo(sx1 - sx0, SCREEN.y1 - SCREEN.y0, SCREEN.z1 - SCREEN.z0), M.glass, {
    position: [(sx0 + sx1) / 2, (SCREEN.y0 + SCREEN.y1) / 2, (SCREEN.z0 + SCREEN.z1) / 2],
  });

  const k = MAST.lampR / 0.06;
  const dome = [[0, 0], [0.06 * k, 0], [0.048 * k, 0.0077], [0.034 * k, 0.0140], [0.018 * k, 0.0184], [0, 0.02]];
  put(root, 'statusLamp', await revolveProfile(dome, { segments: 12, axis: 'y' }), M.green, {
    position: [(MAST.x0 + MAST.x1) / 2, MAST.y1, (MAST.z0 + MAST.z1) / 2],
  });

  const liftGeo = await slab(rrect(LIFT.w, LIFT.d, LIFT.r, 3), 0, LIFT.top - LIFT.y0 + 0.004);
  liftGeo.translate(0, -0.002, 0);
  put(root, 'deckLift', liftGeo, M.graphite, { position: [0, LIFT.y0, 0] });

  const deck = group(root, 'deck');
  put(deck, 'deckPlate', await slab(deckOutline(0, 4), 0, DECK.y1 - DECK.y0), M.graphite, { position: [0, DECK.y0, 0] });
  const rimZ0 = -DECK.d / 2, rimZ1 = DECK.notchZ;
  put(deck, 'deckRim', boxGeo(DECK.rimT, DECK.rimH + 0.001, rimZ1 - rimZ0), M.graphite, {
    position: [-DECK.w / 2 + DECK.rimT / 2, DECK.y1 + DECK.rimH / 2 - 0.0005, (rimZ0 + rimZ1) / 2],
  });
  const pins = group(deck, 'seatPins');
  FOUP_X.forEach((px, si) => {
    for (let k = 0; k < 3; k++) {
      const a = rad(90 + 120 * k); // carried FOUP door faces +Z, so its coupling rotates with it
      put(pins, 'seatPin' + (si + 1) + 'abc'[k], cylinderGeo(PIN.rTop, PIN.rBase, PIN.h + 0.001, 8), M.steel, {
        position: [px + PIN.ring * Math.cos(a), DECK.y1 + PIN.h / 2 - 0.0005, PIN.ring * Math.sin(a)],
      });
    }
  });
  FOUP_X.forEach((px, i) => {
    const loc = group(deck, 'foup' + (i + 1));
    loc.position.set(px, DECK.y1, 0);
  });

  const g = LOD_INSET;
  const lod1 = group(root, 'lod1');
  const g2 = g + 0.0005;
  put(lod1, 'lod1Chassis', await slab(rrect(CH.w - 2 * g2, CH.d - 2 * g2, CH.r - g2, 2), 0, CH.y1 - CH.y0 - 2 * g), M.white, { position: [0, CH.y0 + g, 0] });
  put(lod1, 'lod1Ring', await slab(rrect(CH.w - 2 * g, CH.d - 2 * g, CH.r - g, 2), 0, RING.y1 - RING.y0 - 2 * g), M.orange, { position: [0, RING.y0 + g, 0] });
  put(lod1, 'lod1Mast', await slab(mastOutline(g, 1), 0, MAST.y1 - MAST.y0 - 2 * g), M.white, { position: [0, MAST.y0 + g, 0] });
  put(lod1, 'lod1Band', await slab(mastOutline(g - BAND.proud, 1), 0, BAND.y1 - BAND.y0 - 2 * g), M.orange, { position: [0, BAND.y0 + g, 0] });
  const lodDeck = group(lod1, 'lod1Deck');
  put(lodDeck, 'lod1DeckSlab', await slab(deckOutline(g, 1), 0, DECK.y1 - DECK.y0 - 2 * g), M.graphite, { position: [0, DECK.y0 + g, 0] });

  return { M, deck };
}

function riseAt(t) {
  const v = RISE / (CLIP_S - EASE_S);
  if (t <= EASE_S) return v * t * t / (2 * EASE_S);
  if (t >= CLIP_S - EASE_S) {
    const s = CLIP_S - t;
    return RISE - v * s * s / (2 * EASE_S);
  }
  return v * EASE_S / 2 + v * (t - EASE_S);
}

function amrClips() {
  const ts = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0];
  const H = LIFT.top - LIFT.y0;
  const tracks = (f) => [
    positionTrack('deck', ts.map((t) => ({ time: t, position: [0, f(t), 0] }))),
    positionTrack('lod1Deck', ts.map((t) => ({ time: t, position: [0, f(t), 0] }))),
    scaleTrack('deckLift', ts.map((t) => ({ time: t, scale: [1, 1 + f(t) / H, 1] }))),
  ];
  return [
    createClip('DeckUp', CLIP_S, tracks((t) => riseAt(t))),
    createClip('DeckDown', CLIP_S, tracks((t) => riseAt(CLIP_S - t))),
  ];
}

// ---- entry ----
// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing robot far distance (25 m),
// at 50 degrees vertical FOV and 16:9. The final zero keeps the coarse tier.
function applyFoundryStandardLod(root) {
  const coarse = root.children.find((node) => node.name === 'lod1');
  if (!coarse) throw new Error('Expected one root-level lod1 branch');
  const detail = new THREE.Group(); detail.name = 'LOD0';
  const distant = new THREE.Group(); distant.name = 'LOD1';
  for (const child of [...root.children]) {
    if (child === coarse) continue;
    let hasMesh = false;
    child.traverse((node) => { if (node.isMesh) hasMesh = true; });
    if (hasMesh) detail.add(child);
  }
  // Older authors hid this overlapping proxy. Standard off-scene LOD membership
  // now controls its selection; all other authored visibility is preserved.
  coarse.visible = true;
  distant.add(coarse);
  root.add(detail, distant);
  root.updateMatrixWorld(true);
  const radius = new THREE.Box3().setFromObject(detail).getSize(new THREE.Vector3()).length() / 2;
  const coverage = Math.min(1, Math.PI * (radius / (2 * 25 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

async function build() {
  const root = createRoot('AmrFloorRobot');
  await buildAmr(root);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  return amrClips();
}
