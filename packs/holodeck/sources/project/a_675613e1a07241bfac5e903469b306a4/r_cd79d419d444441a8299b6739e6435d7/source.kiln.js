const meta = { name: 'Seagrass clump', role: 'fill' };

// Crescent Cove seagrass clump (broad tape-grass blades) for the shallow lagoon sand;
// clumps stand close together in dense meadow cores.
// Asset frame: metres, +Y up, ground contact at Y=0; blade bases start 2 cm below it.
// One mesh primitive named seagrass with one opaque, double-sided material: no alpha,
// transparency or transmission. Shoots rise from the buried rhizome as flat fans of
// strap blades; the youngest blade is innermost and shortest, older outer blades are
// longer, olive to tan at the tip, and some are broken off. All blades bend toward one
// current direction (+X, spread by the fan planes).
// TEXCOORD_0.y runs from 0 at a blade's base to 1 at its tip; TEXCOORD_0.x picks the
// blade's colour band (young green, mature green, olive with a browned tip, old tan)
// and spans that band across the blade.

const UP = [0, 1, 0];
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

/** Deterministic mulberry32 stream so every rebuild makes the same clump. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function meshBuilder() {
  return {
    p: [],
    n: [],
    uv: [],
    idx: [],
    vert(pos, nor, u, v) {
      this.p.push(pos[0], pos[1], pos[2]);
      this.n.push(nor[0], nor[1], nor[2]);
      this.uv.push(u, v);
      return this.p.length / 3 - 1;
    },
    tri(a, b, c) {
      this.idx.push(a, b, c);
    },
    geometry() {
      return meshGeo({ positions: this.p, indices: this.idx, normals: this.n, uvs: this.uv });
    },
  };
}

// ---------------------------------------------------------------- design
const CLUMP = {
  seed: 17,
  shoots: 12,                 // short shoots from the buried rhizome
  radius: 0.26,               // shoot spread at the sand (m)
  minGap: 0.06,               // between shoots (m)
  blades: [3, 4],             // per shoot
  length: [0.24, 0.55],       // blade length, youngest to oldest (m)
  width: [0.015, 0.020],      // strap width (m)
  bury: 0.02,                 // blade bases below the sand contact (m)
  current: 0,                 // azimuth (deg) the blades bend toward
};

// Blade strip, 64 x 64 px: four 16 px colour bands across (x); rows run from the blade
// base (top row, v = 0) to its tip (bottom row, v = 1). Plain above-water colours: the
// runtime tints underwater placements by their depth.
const BANDS = [
  { sheath: [170, 178, 130], blade: [76, 134, 56], upper: [88, 142, 62], tip: [120, 150, 78] },   // young
  { sheath: [158, 166, 118], blade: [62, 116, 48], upper: [72, 122, 52], tip: [130, 132, 74] },   // mature
  { sheath: [152, 158, 112], blade: [76, 112, 48], upper: [106, 118, 60], tip: [158, 138, 88] },  // olive, browned tip
  { sheath: [148, 148, 106], blade: [106, 114, 62], upper: [140, 130, 76], tip: [174, 152, 104] }, // old, tan
];

function makeMaterial() {
  const rect = (x, y, w, h, rgb, opacity) => ({
    op: 'paint', shape: { kind: 'rectangle', x, y, width: w, height: h }, rgba: [rgb[0], rgb[1], rgb[2], 255],
    ...(opacity ? { opacity } : {}),
  });
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rand = makeRandom(5);
  const ops = [];
  BANDS.forEach((c, g) => {
    const x = 16 * g;
    ops.push(rect(x, 0, 16, 64, c.blade));
    ops.push(rect(x, 0, 16, 6, c.sheath));
    ops.push(rect(x, 6, 16, 5, mix(c.sheath, c.blade, 0.5)));
    ops.push(rect(x, 34, 16, 8, mix(c.blade, c.upper, 0.5)));
    ops.push(rect(x, 42, 16, 10, c.upper));
    ops.push(rect(x, 52, 16, 5, mix(c.upper, c.tip, 0.5)));
    ops.push(rect(x, 57, 16, 7, c.tip));
    // Faint midrib and two side veins.
    ops.push(rect(x + 7, 4, 2, 56, mix(c.blade, [200, 210, 160], 0.35), 110));
    ops.push(rect(x + 3, 8, 1, 50, mix(c.blade, [40, 80, 30], 0.4), 70));
    ops.push(rect(x + 12, 8, 1, 50, mix(c.blade, [40, 80, 30], 0.4), 70));
    // Pale epiphyte specks on the upper blade, more on older blades.
    for (let k = 0; k < 2 + 2 * g; k++) {
      const yy = 26 + Math.floor(rand() * 34);
      const xx = x + 1 + Math.floor(rand() * 13);
      ops.push(rect(xx, yy, 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2), [206, 200, 172], 90 + Math.floor(rand() * 70)));
    }
  });
  const tex = proceduralTexture({
    schemaVersion: 3, width: 64, height: 64, usage: 'albedo', name: 'SeagrassBlades',
    background: [...BANDS[1].blade, 255], operations: ops,
  });
  const mat = pbrMaterial({ albedo: tex, roughness: 0.55, metalness: 0, doubleSided: true });
  mat.name = 'Seagrass';
  return mat;
}

// ---------------------------------------------------------------- blades
/** One strap blade as a ribbon of `segs` quads, base to tip, bending toward bendDir. */
function addBlade(mb, o) {
  const S = o.segs;
  const step = o.length / S;
  const dirAt = (s) => V.norm(V.add(V.add(UP, V.mul(o.fanDir, Math.tan(o.fanTilt))),
    V.mul(o.bendDir, Math.tan(o.bendTip * Math.pow(s, 1.5)))));
  const centres = [o.base.slice()];
  for (let k = 0; k < S; k++) centres.push(V.add(centres[k], V.mul(dirAt((k + 0.5) / S), step)));
  for (let k = 0; k <= S; k++) {
    const s = k / S;
    const d = dirAt(s);
    const w = V.norm(V.sub(o.side, V.mul(d, V.dot(o.side, d))));
    const tau = o.twistTip * s * s;
    const w2 = V.add(V.mul(w, Math.cos(tau)), V.mul(V.cross(d, w), Math.sin(tau)));
    const n = V.norm(V.cross(w2, d));
    const half = 0.5 * o.width * (k === 0 ? 0.8 : k === S ? o.tipWidth : 1);
    const c = centres[k];
    const a = mb.vert(V.sub(c, V.mul(w2, half)), n, o.u0 + 1.5 / 64, s);
    const b = mb.vert(V.add(c, V.mul(w2, half)), n, o.u0 + 14.5 / 64, s);
    if (k > 0) {
      mb.tri(a - 2, b - 2, a);
      mb.tri(b - 2, b, a);
    }
  }
}

function buildClump(mb, c, rand) {
  const shoots = [];
  for (let guard = 0; shoots.length < c.shoots && guard < 400; guard++) {
    const r = c.radius * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    const q = [Math.cos(a) * r, Math.sin(a) * r];
    if (shoots.every((s) => Math.hypot(q[0] - s[0], q[1] - s[1]) >= c.minGap)) shoots.push(q);
  }
  const cur = [Math.cos(rad(c.current)), 0, Math.sin(rad(c.current))];
  let blades = 0;
  for (const [sx, sz] of shoots) {
    const n = c.blades[0] + Math.floor(rand() * (c.blades[1] - c.blades[0] + 1));
    const phi = rand() * Math.PI;                          // fan plane azimuth
    const side = [Math.cos(phi), 0, Math.sin(phi)];        // blade width direction
    const face = [-Math.sin(phi), 0, Math.cos(phi)];       // horizontal face normal
    const toward = V.dot(face, cur) >= 0 ? face : V.mul(face, -1);
    const vigour = lerp(0.75, 1.1, rand());
    for (let b = 0; b < n; b++) {
      const age = (n - 1 - b) / (n - 1);                   // 1 oldest (outer), 0 youngest (inner)
      const broken = age > 0.6 && rand() < 0.22;
      const length = lerp(c.length[0], c.length[1], 0.35 + 0.65 * age) * vigour * lerp(0.88, 1.08, rand()) * (broken ? 0.62 : 1);
      const band = Math.min(3, Math.max(0, Math.round(age * 2.6 + (rand() - 0.5) * 0.9)));
      const sideSign = b % 2 === 0 ? 1 : -1;
      addBlade(mb, {
        base: [sx + side[0] * sideSign * 0.004 * b, -c.bury, sz + side[2] * sideSign * 0.004 * b],
        length,
        width: lerp(c.width[0], c.width[1], rand()) * lerp(0.85, 1, age),
        side,
        fanDir: V.mul(side, sideSign),
        fanTilt: rad(4 + 16 * age + 5 * rand()),
        bendDir: toward,
        bendTip: rad(lerp(34, 80, Math.min(1, length / c.length[1])) * lerp(0.85, 1.08, rand())),
        twistTip: rad((rand() - 0.5) * 70),
        u0: (band * 16) / 64,
        segs: length > 0.36 ? 4 : 3,
        tipWidth: broken ? 0.9 : 0.42,
      });
      blades++;
    }
  }
  return { shoots: shoots.length, blades };
}

function build() {
  const mat = makeMaterial();
  const root = createRoot('SeagrassClump');
  const mb = meshBuilder();
  const counts = buildClump(mb, CLUMP, makeRandom(CLUMP.seed));
  const part = createPart('seagrass', mb.geometry(), mat, { parent: root, position: [0, 0, 0] });
  part.name = 'seagrass';
  markOpenShell(part, 'Single-sheet strap blades on a double-sided opaque material; bases buried 2 cm below the sand contact.');
  root.userData = {
    shoots: counts.shoots,
    blades: counts.blades,
    windWeight: 'TEXCOORD_0.y: 0 at blade base, 1 at blade tip',
  };
  return root;
}
