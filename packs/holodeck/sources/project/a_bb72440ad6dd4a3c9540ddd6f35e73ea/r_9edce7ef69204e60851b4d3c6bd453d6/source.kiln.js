// pave-curb — Kiln 1.3.1 paving/trim family for the courtyard plaza.
// Code MIT. Shared helpers first, asset definition below.
// ---- Shared paving/trim helpers (identical in every paving asset) ----
// Frame: metres, +X forward, +Y up, +Z right. Host ground at Y=0.
const PAVE = {
  top: 0.03,        // finished paving surface
  under: -0.05,     // underside of every paving/trim unit
  jointGap: 0.009,  // full joint width between stones (half at module edges)
  jointY: 0.022,    // sunken joint (mortar) surface, 8 mm below the top
};

/** The three shared stone definitions used by the whole paving family. */
async function pavingMaterials() {
  const limestone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#d6c8a8', roughness: 0.9 });
  limestone.name = 'Limestone';
  const travertine = await materialRecipe('kiln.material.stone.v1', { baseColor: '#c9b48c', roughness: 0.86 });
  travertine.name = 'Travertine';
  const mortar = await materialRecipe('kiln.material.stone.v1', { baseColor: '#857860', roughness: 0.97 });
  mortar.name = 'JointMortar';
  return { limestone, travertine, mortar };
}

/** Deterministic hash in [0,1). */
function hash01(i, salt) {
  let h = (i * 374761393 + (salt || 0) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Triangle accumulator: flat-shaded, box-projected UVs (metres). */
function makeBuffer() { return { pos: [], nor: [], uv: [], tris: 0 }; }
function pushTri(buf, a, b, c, expected, uvOffset) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return; // drop degenerate
  nx /= len; ny /= len; nz /= len;
  if (expected && nx * expected[0] + ny * expected[1] + nz * expected[2] < 0) {
    const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz;
  }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const o = uvOffset || [0, 0];
  for (const p of [a, b, c]) {
    buf.pos.push(p[0], p[1], p[2]);
    buf.nor.push(nx, ny, nz);
    if (ay >= ax && ay >= az) buf.uv.push(p[0] + o[0], p[2] + o[1]);
    else if (ax >= az) buf.uv.push(p[2] + o[0], p[1] + o[1]);
    else buf.uv.push(p[0] + o[0], p[1] + o[1]);
  }
  buf.tris++;
}
function bufferGeo(buf) {
  return meshGeo({ positions: buf.pos, normals: buf.nor, uvs: buf.uv });
}

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a0, b0] = poly[i], [a1, b1] = poly[(i + 1) % poly.length];
    s += a0 * b1 - a1 * b0;
  }
  return s / 2;
}
/** Miter offset of a CCW polygon inward by d (small d only). */
function insetPoly(poly, d) {
  if (!d) return poly.map(p => p.slice());
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], pp = poly[(i - 1 + n) % n], pn = poly[(i + 1) % n];
    const e1 = [p[0] - pp[0], p[1] - pp[1]], e2 = [pn[0] - p[0], pn[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2]; // inward for CCW
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    out.push([p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]);
  }
  return out;
}

/**
 * Closed solid lofted through stations of one 2D section.
 * poly: 2D outline [[a,b],...]; frame.map(a,b,t) -> [x,y,z]; frame.dir(a,b,t) -> vector;
 * stations: [{ inset, t }] in increasing t. deform(p, frac) optionally offsets points.
 */
function loftSolid(buf, poly, frame, stations, opts) {
  opts = opts || {};
  let P = poly;
  if (signedArea(P) < 0) P = P.slice().reverse();
  const n = P.length;
  const t0 = stations[0].t, t1 = stations[stations.length - 1].t;
  const rings2 = stations.map(s => insetPoly(P, s.inset));
  const rings = rings2.map((r, k) => r.map(([a, b]) => {
    let p = frame.map(a, b, stations[k].t);
    if (opts.deform) p = opts.deform(p, (stations[k].t - t0) / (t1 - t0));
    return p;
  }));
  const axis = frame.dir(0, 0, 1);
  const uvo = opts.uvOffset;
  for (let k = 0; k < stations.length - 1; k++) {
    const dt = stations[k + 1].t - stations[k].t;
    const dIn = stations[k + 1].inset - stations[k].inset;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ea = P[j][0] - P[i][0], eb = P[j][1] - P[i][1];
      const el = Math.hypot(ea, eb);
      const outward = frame.dir(eb / el, -ea / el, 0); // outward normal of a CCW edge
      const exp = [dt * outward[0] + dIn * axis[0], dt * outward[1] + dIn * axis[1], dt * outward[2] + dIn * axis[2]];
      const a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
      pushTri(buf, a, b, c, exp, uvo);
      pushTri(buf, a, c, d, exp, uvo);
    }
  }
  for (const [k, sign] of [[0, -1], [stations.length - 1, 1]]) {
    if (opts.skipCap && opts.skipCap(k === 0 ? 'start' : 'end')) continue;
    const contour = rings2[k].map(([a, b]) => new THREE.Vector2(a, b));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const exp = [axis[0] * sign, axis[1] * sign, axis[2] * sign];
    for (const f of faces) pushTri(buf, rings[k][f[0]], rings[k][f[1]], rings[k][f[2]], exp, uvo);
  }
}

/** Horizontal slabs: section in plan (a=X, b=Z), lofted up +Y. */
const PLAN = {
  map: (a, b, t) => [a, t, b],
  dir: (a, b, t) => [a, t, b],
};
/** Long trim: section in (a=X, b=Y), lofted along +Z. */
const ALONG_Z = {
  map: (a, b, t) => [a, b, t],
  dir: (a, b, t) => [a, b, t],
};

/**
 * Bevelled paving slab from a plan polygon (already shrunk by the half joints).
 * Worn quarter-round arris of radius r. tilt: { dy, gx, gz } in metres (≤ 0 at top).
 */
function addSlab(buf, plan, r, tilt, uvOffset) {
  const yb = PAVE.jointY, yt = PAVE.top;
  const s = Math.SQRT1_2;
  const stations = [
    { inset: 0, t: yb },
    { inset: 0, t: yt - r },
    { inset: r * (1 - s), t: yt - r * (1 - s) },
    { inset: r, t: yt },
  ];
  let cx = 0, cz = 0;
  for (const p of plan) { cx += p[0]; cz += p[1]; }
  cx /= plan.length; cz /= plan.length;
  const deform = tilt ? (p, f) => [p[0], p[1] + f * (tilt.dy + tilt.gx * (p[0] - cx) + tilt.gz * (p[2] - cz)), p[2]] : null;
  loftSolid(buf, plan, PLAN, stations, { deform, uvOffset });
}

/** Rectangle polygon helper in (a,b). */
function rectPoly(a0, a1, b0, b1) { return [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]; }

/**
 * Tilt that keeps every corner of the slab at or below the nominal top (≤ maxDrop).
 * Returns { dy, gx, gz } with the highest corner 0..1 mm below the top.
 */
function wearTilt(plan, seed, maxDrop) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [a, b] of plan) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b); }
  const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const sx = (hash01(seed, 3) - 0.5) * 2, sz = (hash01(seed, 4) - 0.5) * 2;
  const span = maxDrop * (0.45 + 0.4 * hash01(seed, 5)); // drop between high and low corner
  const gx = sx * span / (2 * hx) * 0.5, gz = sz * span / (2 * hz) * 0.5;
  const highest = Math.abs(gx) * hx + Math.abs(gz) * hz;
  const extra = 0.001 * hash01(seed, 6);
  return { dy: -highest - extra, gx, gz };
}
// ---- end shared helpers ----

const meta = { name: 'pave-curb', role: 'prop' };

// Straight curb 4.0 m along Z (z -2..+2), 0.35 m wide (x -0.175..+0.175), 0.12 m above ground.
// Bullnose (r 0.04) on the +X (plaza/walker) top edge, 15 mm chamfer on the -X (bed) top edge.
const LENGTH = 4.0;
const WIDTH = 0.35;
const HEIGHT = 0.12;
const NOSE_R = 0.04;
const CHAMFER = 0.015;
const PIECES = [1.3, 1.4, 1.3];   // stone lengths along Z, sum = LENGTH
const END_ARRIS = 0.004;          // chamfer on each stone end at the joints
const MORTAR_RECESS = 0.005;      // joint mortar set back from the stone faces

function curbProfile() {
  const w = WIDTH / 2;
  const pts = [[-w, PAVE.under], [w, PAVE.under], [w, HEIGHT - NOSE_R]];
  const cx = w - NOSE_R, cy = HEIGHT - NOSE_R;
  for (let k = 1; k < 4; k++) {
    const a = (k / 4) * Math.PI / 2;
    pts.push([cx + NOSE_R * Math.cos(a), cy + NOSE_R * Math.sin(a)]);
  }
  pts.push([cx, HEIGHT], [-w + CHAMFER, HEIGHT], [-w, HEIGHT - CHAMFER]);
  return pts;
}

async function build() {
  const root = createRoot('PaveCurb');
  const mats = await pavingMaterials();
  const prof = curbProfile();
  const h = LENGTH / 2, g = PAVE.jointGap / 2;
  const bufL = makeBuffer(), bufT = makeBuffer(), bufM = makeBuffer();
  const mortarProf = insetPoly(signedArea(prof) < 0 ? prof.slice().reverse() : prof, MORTAR_RECESS);
  // half joint at the module start
  loftSolid(bufM, mortarProf, ALONG_Z, [{ inset: 0, t: -h }, { inset: 0, t: -h + g }]);
  let z = -h;
  PIECES.forEach((len, i) => {
    const z0 = z + g, z1 = z + len - g;
    const tone = i === 1 ? bufT : bufL;
    loftSolid(tone, prof, ALONG_Z, [
      { inset: END_ARRIS, t: z0 }, { inset: 0, t: z0 + END_ARRIS },
      { inset: 0, t: z1 - END_ARRIS }, { inset: END_ARRIS, t: z1 },
    ], { uvOffset: [i * 1.7, 0] });
    const zn = z + len;
    const end = Math.abs(zn - h) < 1e-9;
    loftSolid(bufM, mortarProf, ALONG_Z, [{ inset: 0, t: zn - g }, { inset: 0, t: end ? h : zn + g }]);
    z = zn;
  });
  createPart('Curb_Limestone', bufferGeo(bufL), mats.limestone, { parent: root });
  createPart('Curb_Travertine', bufferGeo(bufT), mats.travertine, { parent: root });
  createPart('Curb_Joints', bufferGeo(bufM), mats.mortar, { parent: root });
  return root;
}
