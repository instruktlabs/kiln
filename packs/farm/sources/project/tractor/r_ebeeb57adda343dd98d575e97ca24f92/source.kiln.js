const meta = { name: 'Vintage tractor', role: 'vehicle' };

// Shared dimensions (metres; +X forward, +Y up, +Z right)
const REAR = { r: 0.72, rIn: 0.46, w: 0.42, lugs: 16, depth: 0.075, x: -0.8, z: 0.64 };
const FRONT = { r: 0.40, rIn: 0.25, w: 0.24, lugs: 14, depth: 0.035, x: 0.95, z: 0.64 };
const STEER_DEG = 25;

// Merge transformed geometries into one owned mesh (fewer draws for small repeated fittings)
// A UV set is emitted only when at least one input has UVs (then UV-less inputs are padded with 0,0 as before).
function mergeGeos(items) {
  const positions = [], normals = [], uvs = [];
  const withUv = items.some(([geo]) => !!geo.attributes.uv);
  for (const [geo, pos, rotDeg] of items) {
    let g = geo.clone();
    if (rotDeg) {
      const e = new THREE.Euler(rotDeg[0] * Math.PI / 180, rotDeg[1] * Math.PI / 180, rotDeg[2] * Math.PI / 180);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    }
    g.translate(pos[0], pos[1], pos[2]);
    if (g.index) g = g.toNonIndexed();
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { positions.push(pa[i]); normals.push(na[i]); }
    if (g.attributes.uv) { const ua = g.attributes.uv.array; for (let i = 0; i < ua.length; i++) uvs.push(ua[i]); }
    else if (withUv) for (let i = 0; i < g.attributes.position.count; i++) uvs.push(0, 0);
  }
  return meshGeo(withUv ? { positions, normals, uvs } : { positions, normals });
}

// Faceted tire with staggered block lugs on each half (chevron-like tread). Axle along +Z.
function lugTire(R, rIn, w, lugs, depth) {
  const positions = [], indices = [], uvs = [];
  const quad = (a, b, c, d, u0, u1) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const P = (Math.PI * 2) / lugs;
  for (const half of [0, 1]) {
    const z0 = half ? 0 : -w / 2, z1 = half ? w / 2 : 0;
    const phase = half ? 0.5 : 0;
    const pts = [];
    for (let k = 0; k < lugs; k++) {
      const a = (k + phase) * P;
      pts.push([a, R - depth], [a + 0.1 * P, R], [a + 0.52 * P, R], [a + 0.62 * P, R - depth]);
    }
    const O = (p, z) => [Math.cos(p[0]) * p[1], Math.sin(p[0]) * p[1], z];
    const I = (p, z) => [Math.cos(p[0]) * rIn, Math.sin(p[0]) * rIn, z];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const u0 = i / pts.length, u1 = (i + 1) / pts.length;
      quad(O(p, z0), O(q, z0), O(q, z1), O(p, z1), u0, u1);
      quad(I(p, z0), I(p, z1), I(q, z1), I(q, z0), u0, u1);
      quad(O(p, z1), O(q, z1), I(q, z1), I(p, z1), u0, u1);
      quad(O(p, z0), I(p, z0), I(q, z0), O(q, z0), u0, u1);
    }
  }
  return meshGeo({ positions, indices, uvs });
}

// Faceted open ring (annulus) centred on z=0, axis +Z: used for the stepped rim lip.
function ringGeo(rO, rI, len, seg) {
  const positions = [], indices = [], uvs = [];
  const quad = (a, b, c, d, u0, u1) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const z0 = -len / 2, z1 = len / 2;
  const P = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    const u0 = i / seg, u1 = (i + 1) / seg;
    quad(P(a, rO, z0), P(b, rO, z0), P(b, rO, z1), P(a, rO, z1), u0, u1);
    quad(P(a, rI, z0), P(a, rI, z1), P(b, rI, z1), P(b, rI, z0), u0, u1);
    quad(P(a, rO, z1), P(b, rO, z1), P(b, rI, z1), P(a, rI, z1), u0, u1);
    quad(P(a, rO, z0), P(a, rI, z0), P(b, rI, z0), P(b, rO, z0), u0, u1);
  }
  return meshGeo({ positions, indices, uvs });
}

async function build() {
  const root = createRoot('Tractor');
  // Shared profile roles: painted-red #B94D36, dark-rubber #30312E (tires and seat)
  const paint = gameMaterial(0xb94d36, { roughness: 0.75, metalness: 0 });
  const rubber = gameMaterial(0x30312e, { roughness: 0.92, metalness: 0 });
  const seatVinyl = gameMaterial(0x30312e, { roughness: 0.88, metalness: 0 });
  const darkIron = gameMaterial(0x3b3c3a, { roughness: 0.7, metalness: 0.45 });
  const fitting = gameMaterial(0x777a76, { roughness: 0.6, metalness: 0.8 });

  const cb = (w, h, d, r = 0.035) => roundedBoxGeo(w, h, d, r, { style: 'chamfer' });
  // Draw consolidation: parts are collected per (rigid parent, material) and merged in flushParts().
  // Merging never crosses a spin/steer pivot. Single-part buckets keep their original Mesh_<name>.
  // Merged meshes keep each component's name and triangle range in userData.components.
  const buckets = new Map();
  const groupLabel = new Map([[root, 'Body']]);
  const matLabel = new Map([[paint, 'Paint'], [rubber, 'Rubber'], [seatVinyl, 'Seat'], [darkIron, 'Iron'], [fitting, 'Fittings']]);
  const part = (name, geo, mat, position, rotation, parent = root) => {
    const hasUv = !!geo.attributes.uv; // UV-less parts are bucketed separately so merged UVs stay exact
    const key = parent.uuid + '|' + mat.uuid + '|' + hasUv;
    if (!buckets.has(key)) buckets.set(key, { parent, mat, hasUv, items: [], names: [] });
    const b = buckets.get(key);
    b.items.push([geo, position, rotation || [0, 0, 0]]);
    b.names.push(name);
  };
  function flushParts() {
    for (const b of buckets.values()) {
      if (b.items.length === 1) {
        const [geo, position, rotation] = b.items[0];
        createPart(b.names[0], geo, b.mat, { position, rotation, parent: b.parent });
        continue;
      }
      const components = [];
      let tri = 0;
      b.items.forEach(([geo], i) => {
        const n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        components.push({ name: b.names[i], firstTriangle: tri, triangles: n });
        tri += n;
      });
      const merged = createPart(`${groupLabel.get(b.parent)}_${matLabel.get(b.mat)}${b.hasUv ? '' : '_NoUV'}`, mergeGeos(b.items), b.mat, { position: [0, 0, 0], parent: b.parent });
      // Note: the GLB exporter does not carry this userData; the delivered component table is a sidecar JSON.
      merged.userData.components = components;
    }
  }

  // ---- Chassis and drivetrain (dark) ----
  part('ChassisRails', boxGeo(1.6, 0.17, 0.5), darkIron, [0.6, 0.535, 0]);
  part('FrontAxleBeam', boxGeo(0.12, 0.12, 0.88), darkIron, [FRONT.x, FRONT.r, 0]);
  part('FrontWeight', await cb(0.3, 0.18, 0.56, 0.03), darkIron, [1.4, 0.51, 0]);
  part('Transmission', await cb(1.25, 0.36, 0.64, 0.04), darkIron, [-0.33, 0.63, 0]);
  part('RearAxleHousing', cylinderGeo(0.1, 0.1, 0.9, 8), darkIron, [REAR.x, REAR.r, 0], [90, 0, 0]);

  // Engine block visible through the hood side openings
  part('EngineBlock', await cb(0.66, 0.36, 0.6, 0.03), darkIron, [0.87, 0.8, 0]);
  const cyl = await cb(0.15, 0.15, 0.08, 0.02);
  const engineBits = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) engineBits.push([cyl, [0.68 + k * 0.19, 0.8, s * 0.32]]);
    engineBits.push([cylinderGeo(0.03, 0.03, 0.58, 6), [0.87, 0.93, s * 0.35], [0, 0, 90]]);
  }
  part('EngineDetail', mergeGeos(engineBits), darkIron, [0, 0, 0]);

  // ---- Red bodywork ----
  part('Hood', await cb(1.25, 0.4, 0.8, 0.07), paint, [0.875, 1.2, 0]);
  part('Nose', await cb(0.22, 0.8, 0.8, 0.05), paint, [1.41, 1.0, 0]);
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    part(`HoodSkirtRear_${tag}`, boxGeo(0.3, 0.22, 0.05), paint, [0.4, 0.9, s * 0.375]);
  }
  part('Cowl', await cb(0.28, 0.5, 0.74, 0.05), paint, [0.16, 1.23, 0]);
  part('Deck', await cb(1.3, 0.2, 0.74, 0.03), paint, [-0.4, 0.9, 0]);

  // Grille on the nose face
  part('GrilleRecess', boxGeo(0.02, 0.56, 0.58), darkIron, [1.525, 1.0, 0]);
  const barBits = [];
  for (let k = 0; k < 4; k++) barBits.push([boxGeo(0.04, 0.05, 0.62), [1.535, 0.8 + k * 0.135, 0]]);
  part('GrilleBars', mergeGeos(barBits), paint, [0, 0, 0]);

  // Rear fenders: flat top, sloped front/back, inner wall to the deck
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const zc = s * 0.655;
    part(`FenderTop_${tag}`, await cb(0.92, 0.07, 0.5, 0.025), paint, [REAR.x, 1.59, zc]);
    part(`FenderFront_${tag}`, await cb(0.46, 0.07, 0.5, 0.025), paint, [-0.2, 1.4, zc], [0, 0, -52]);
    part(`FenderRear_${tag}`, await cb(0.46, 0.07, 0.5, 0.025), paint, [-1.4, 1.4, zc], [0, 0, 52]);
    part(`FenderWall_${tag}`, boxGeo(1.0, 0.62, 0.05), paint, [REAR.x, 1.29, s * 0.37]);
  }

  // Upright exhaust
  part('ExhaustPipe', cylinderGeo(0.055, 0.055, 0.7, 6), darkIron, [1.0, 1.72, -0.22]);
  part('ExhaustCap', cylinderGeo(0.075, 0.075, 0.24, 6), darkIron, [1.0, 2.18, -0.22]);

  // Steering column and wheel
  const colBase = [0.14, 1.46], colTop = [-0.12, 1.74];
  const tilt = Math.atan2(colBase[0] - colTop[0], colTop[1] - colBase[1]) * 180 / Math.PI;
  const colLen = Math.hypot(colBase[0] - colTop[0], colTop[1] - colBase[1]);
  part('SteeringColumn', cylinderGeo(0.03, 0.035, colLen, 6), darkIron,
    [(colBase[0] + colTop[0]) / 2, (colBase[1] + colTop[1]) / 2, 0], [0, 0, tilt]);
  const wheelMount = createPivot('SteeringWheelMount', [colTop[0], colTop[1], 0], root);
  wheelMount.rotation.z = tilt * Math.PI / 180;
  groupLabel.set(wheelMount, 'SteeringWheel');
  part('SteeringWheelRim', new THREE.TorusGeometry(0.2, 0.024, 6, 18), seatVinyl, [0, 0, 0], [90, 0, 0], wheelMount);
  part('SteeringWheelSpokes', mergeGeos([
    [boxGeo(0.38, 0.02, 0.03), [0, 0, 0]],
    [boxGeo(0.03, 0.02, 0.38), [0, 0, 0]],
    [cylinderGeo(0.04, 0.04, 0.05, 6), [0, 0, 0]],
  ]), seatVinyl, [0, 0, 0], [0, 0, 0], wheelMount);

  // Seat: stem, cushion, backrest; attachment reference on cushion top
  part('SeatStem', boxGeo(0.14, 0.14, 0.14), darkIron, [-0.6, 1.06, 0]);
  part('SeatCushion', await cb(0.46, 0.11, 0.52, 0.03), seatVinyl, [-0.58, 1.18, 0]);
  part('SeatBack', await cb(0.11, 0.46, 0.52, 0.03), seatVinyl, [-0.84, 1.43, 0], [0, 0, 10]);
  createPivot('SeatAttach', [-0.58, 1.235, 0], root);

  // Drawbar and hitch reference
  // Drawbar top lowered to Y 0.48 so a trailer hitch ring (Y 0.48-0.52, outer r 0.08) rests on it at Joint_Hitch;
  // the bar runs 0.155 m into the transmission and a bracket ties it to the housing's rear face.
  part('Drawbar', boxGeo(0.6, 0.06, 0.2), darkIron, [-1.1, 0.45, 0]);
  part('DrawbarBracket', boxGeo(0.12, 0.22, 0.24), darkIron, [-0.96, 0.56, 0]);
  part('HitchPin', cylinderGeo(0.025, 0.025, 0.16, 6), fitting, [-1.32, 0.52, 0]);
  createPivot('Hitch', [-1.32, 0.5, 0], root);

  // ---- Wheels ----
  const rearTire = lugTire(REAR.r, REAR.rIn, REAR.w, REAR.lugs, REAR.depth);
  const frontTire = lugTire(FRONT.r, FRONT.rIn, FRONT.w, FRONT.lugs, FRONT.depth);

  function wheel(spin, spec, tire, side, tag) {
    // side: -1 left (outer face toward -Z), +1 right
    part(`Tire_${tag}`, tire, rubber, [0, 0, 0], [0, 0, 0], spin);
    // Stepped/sloped wheel profile: tire bead -> rim lip (barrel step) -> recessed disk -> sloped bowl -> hub
    const w = spec.w, rimR = spec.rIn + 0.006, hubR = spec.rIn * 0.36;
    const diskT = w * 0.35, face = diskT / 2;
    const lipZ0 = face, lipZ1 = w / 2 - w * 0.05;
    const bowlH = w * 0.21, bowlTop = hubR * 1.25;
    const hubLen = face + bowlH + w * 0.1;
    part(`RimDisk_${tag}`, cylinderGeo(rimR, rimR, diskT, 16), paint, [0, 0, 0], [90, 0, 0], spin);
    part(`RimLip_${tag}`, ringGeo(rimR, spec.rIn * 0.86, lipZ1 - lipZ0, 16), paint, [0, 0, side * (lipZ0 + lipZ1) / 2], [0, 0, 0], spin);
    part(`RimBowl_${tag}`, cylinderGeo(bowlTop, spec.rIn * 0.72, bowlH, 16), paint, [0, 0, side * (face + bowlH / 2)], [side * 90, 0, 0], spin);
    part(`Hub_${tag}`, cylinderGeo(hubR, hubR, hubLen, 8), paint, [0, 0, side * hubLen / 2], [90, 0, 0], spin);
    const hubFace = side * hubLen;
    const n = 5;
    const bolts = [[cylinderGeo(hubR * 0.4, hubR * 0.4, 0.04, 6), [0, 0, hubFace + side * 0.02], [90, 0, 0]]];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const br = hubR * 0.72;
      bolts.push([cylinderGeo(0.014, 0.014, 0.024, 6), [Math.cos(a) * br, Math.sin(a) * br, hubFace + side * 0.012], [90, 0, 0]]);
    }
    part(`Bolts_${tag}`, mergeGeos(bolts), fitting, [0, 0, 0], [0, 0, 0], spin);
  }

  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const rearSpin = createPivot(`Wheel_R${tag}`, [REAR.x, REAR.r, s * REAR.z], root);
    groupLabel.set(rearSpin, `Wheel_R${tag}`);
    wheel(rearSpin, REAR, rearTire, s, `R${tag}`);
    const steer = createPivot(`Steer_F${tag}`, [FRONT.x, FRONT.r, s * FRONT.z], root);
    groupLabel.set(steer, `Steer_F${tag}`);
    // Fixed kingpin boss on the axle-beam end; short spindle turns with the steering pivot inside it
    part(`KingpinBoss_F${tag}`, cylinderGeo(0.07, 0.07, 0.2, 6), darkIron, [FRONT.x, FRONT.r, s * 0.47], [0, 0, 0]);
    part(`Spindle_F${tag}`, cylinderGeo(0.045, 0.045, 0.12, 6), darkIron, [0, 0, -s * 0.06], [90, 0, 0], steer);
    const frontSpin = createPivot(`Wheel_F${tag}`, [0, 0, 0], steer);
    groupLabel.set(frontSpin, `Wheel_F${tag}`);
    wheel(frontSpin, FRONT, frontTire, s, `F${tag}`);
  }

  flushParts();
  return root;
}

function animate(root) {
  const T = 4;
  const steps = 16;
  const tracks = [];
  const spinKeys = (turns) => {
    const keys = [];
    for (let i = 0; i <= steps; i++) keys.push({ time: (i / steps) * T, rotation: [0, 0, -360 * turns * (i / steps)] });
    return keys;
  };
  for (const tag of ['L', 'R']) {
    tracks.push(rotationTrack(`Joint_Wheel_R${tag}`, spinKeys(1)));
    tracks.push(rotationTrack(`Joint_Wheel_F${tag}`, spinKeys(2)));
    tracks.push(rotationTrack(`Joint_Steer_F${tag}`, [
      { time: 0, rotation: [0, 0, 0] },
      { time: 0.5, rotation: [0, 0, 0] },
      { time: 1.5, rotation: [0, STEER_DEG, 0] },
      { time: 3.0, rotation: [0, -STEER_DEG, 0] },
      { time: 4.0, rotation: [0, 0, 0] },
    ]));
  }
  // Wheels: forward roll (+X) with equal ground travel. Contact radii are the lug tops: rear 0.72 m, front 0.40 m.
  // 5 rear and 9 front revolutions both cover 5*2*PI*0.72 = 9*2*PI*0.40 = 22.62 m in 8 s (2.827 m/s).
  // A negative rotation about the +Z axle moves the tire top toward +X. Constant rate, so the loop is seamless.
  const WT = 8, WN = 72;
  const roll = (revs) => { const k = []; for (let i = 0; i <= WN; i++) k.push({ time: (i / WN) * WT, rotation: [0, 0, -360 * revs * (i / WN)] }); return k; };
  const wheels = [];
  for (const tag of ['L', 'R']) {
    wheels.push(rotationTrack(`Joint_Wheel_R${tag}`, roll(5)));
    wheels.push(rotationTrack(`Joint_Wheel_F${tag}`, roll(9)));
  }
  // Steer: smooth sine sweep center -> left (+Y turns +X toward -Z) -> center -> right -> center, 4 s loop, +/-STEER_DEG.
  const ST = 4, SN = 32;
  const steerKeys = [];
  for (let i = 0; i <= SN; i++) steerKeys.push({ time: (i / SN) * ST, rotation: [0, i === SN ? 0 : STEER_DEG * Math.sin((2 * Math.PI * i) / SN), 0] });
  const steerTracks = ['L', 'R'].map((tag) => rotationTrack(`Joint_Steer_F${tag}`, steerKeys));
  return [createClip('ArticulationProbe', T, tracks), createClip('Wheels', WT, wheels), createClip('Steer', ST, steerTracks)];
}
