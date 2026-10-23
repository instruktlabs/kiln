// gate-pier — Kiln 1.3.1 enclosure family for the courtyard plaza.
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
// ---- Enclosure helpers (wall family; built on the shared paving helpers above) ----
const WALL = {
  plinthTop: 0.245,   // top of the weathered plinth course
  plinthProject: 0.03,
  plinthChamfer: 0.035, // sloped set-off on the plinth top
  joint: 0.01,        // full joint width between stones
  recess: 0.02,       // depth of recessed mortar joints behind the stone face
  arris: 0.01,        // chamfer on stone face edges
};

/** Axis-aligned box as a closed solid (12 triangles). */
function addBox(buf, x0, x1, y0, y1, z0, z1, uvOffset) {
  loftSolid(buf, rectPoly(x0, x1, z0, z1), PLAN, [{ inset: 0, t: y0 }, { inset: 0, t: y1 }], { uvOffset });
}

/** Long trim along X: section in (a=Z, b=Y), lofted along +X. */
const ALONG_X = {
  map: (a, b, t) => [t, b, a],
  dir: (a, b, t) => [t, b, a],
};

/** Plan rectangle with chamfered vertical corners (8-gon). */
function chamferRect(x0, x1, z0, z1, c) {
  return [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
}

/** Stone block in plan with chamfered top/bottom arrises (and optional vertical corner chamfer). */
function addBlock(buf, x0, x1, y0, y1, z0, z1, r, cornerChamfer, uvOffset) {
  const plan = cornerChamfer ? chamferRect(x0, x1, z0, z1, cornerChamfer) : rectPoly(x0, x1, z0, z1);
  loftSolid(buf, plan, PLAN, [
    { inset: r, t: y0 }, { inset: 0, t: y0 + r }, { inset: 0, t: y1 - r }, { inset: r, t: y1 },
  ], { uvOffset });
}

/**
 * Solid of revolution about the Y axis at (cx, cz): stations [{ r, y, rot }] bottom to top,
 * `rot` in fractions of one segment (0.5 staggers the ring for faceted scales).
 */
function addLathe(buf, cx, cz, n, stations) {
  const rings = stations.map(s => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = ((i + (s.rot || 0)) / n) * Math.PI * 2;
      out.push([cx + s.r * Math.cos(a), s.y, cz + s.r * Math.sin(a)]);
    }
    return out;
  });
  for (let k = 0; k < stations.length - 1; k++) {
    const dy = stations[k + 1].y - stations[k].y;
    const dIn = stations[k].r - stations[k + 1].r;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
      const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - cx, mz = (a[2] + b[2] + c[2] + d[2]) / 4 - cz;
      const ml = Math.hypot(mx, mz) || 1;
      const exp = [dy * mx / ml, dIn, dy * mz / ml];
      pushTri(buf, a, b, c, exp);
      pushTri(buf, a, c, d, exp);
    }
  }
  const caps = [[0, -1], [stations.length - 1, 1]];
  for (const [k, sgn] of caps) {
    if (stations[k].r < 1e-6) continue;
    const ctr = [cx, stations[k].y, cz];
    for (let i = 0; i < n; i++) pushTri(buf, ctr, rings[k][i], rings[k][(i + 1) % n], [0, sgn, 0]);
  }
}
// ---- end enclosure helpers ----

const meta = { name: 'gate-pier', role: 'building' };

// Gateway pier 0.60 (X) x 0.70 (Z) m shaft, 2.50 m to the top of a moulded cap,
// recessed travertine panels on all four faces, pineapple finial (~0.47 m) above.
const SX = 0.6;
const SZ = 0.7;
const PLINTH_TOP = 0.3;
const BASE_TOP = 0.4;
const SHAFT_TOP = 2.2;
const CAP_TOP = 2.5;
const PANEL_DEPTH = 0.025;   // recess of the face panels
const PANEL_MARGIN = 0.1;    // frame width around each panel
const LATHE_SEGMENTS = 14;

async function build() {
  const root = createRoot('GatePier');
  const mats = await pavingMaterials();
  const bufL = makeBuffer(), bufT = makeBuffer();
  const hx = SX / 2, hz = SZ / 2, d = PANEL_DEPTH, m = PANEL_MARGIN;
  const plan = rectPoly(-hx, hx, -hz, hz);

  // Plinth (travertine), weathered top.
  loftSolid(bufT, plan, PLAN, [
    { inset: -0.04, t: 0 }, { inset: -0.04, t: PLINTH_TOP - 0.03 }, { inset: -0.02, t: PLINTH_TOP },
  ]);
  // Base moulding: plinth band, torus-like roll, fillet.
  loftSolid(bufL, plan, PLAN, [
    { inset: -0.02, t: PLINTH_TOP }, { inset: -0.03, t: PLINTH_TOP + 0.012 }, { inset: -0.03, t: PLINTH_TOP + 0.03 },
    { inset: -0.022, t: PLINTH_TOP + 0.048 }, { inset: -0.008, t: PLINTH_TOP + 0.058 },
    { inset: -0.008, t: PLINTH_TOP + 0.075 }, { inset: 0, t: PLINTH_TOP + 0.082 }, { inset: 0, t: BASE_TOP },
  ]);

  // Shaft: travertine core is the recessed panel surface; limestone stiles and rails frame it.
  addBox(bufT, -hx + d, hx - d, BASE_TOP, SHAFT_TOP, -hz + d, hz - d);
  for (const sx of [-1, 1]) {            // +-X faces: stiles include the pier corners
    const x0 = sx > 0 ? hx - d : -hx, x1 = sx > 0 ? hx : -hx + d;
    addBox(bufL, x0, x1, BASE_TOP, SHAFT_TOP, -hz, -hz + m);
    addBox(bufL, x0, x1, BASE_TOP, SHAFT_TOP, hz - m, hz);
    addBox(bufL, x0, x1, BASE_TOP, BASE_TOP + m, -hz + m, hz - m);
    addBox(bufL, x0, x1, SHAFT_TOP - m * 1.2, SHAFT_TOP, -hz + m, hz - m);
  }
  for (const sz of [-1, 1]) {            // +-Z faces fit between the X-face stiles
    const z0 = sz > 0 ? hz - d : -hz, z1 = sz > 0 ? hz : -hz + d;
    addBox(bufL, -hx + d, -hx + m, BASE_TOP, SHAFT_TOP, z0, z1);
    addBox(bufL, hx - m, hx - d, BASE_TOP, SHAFT_TOP, z0, z1);
    addBox(bufL, -hx + m, hx - m, BASE_TOP, BASE_TOP + m, z0, z1);
    addBox(bufL, -hx + m, hx - m, SHAFT_TOP - m * 1.2, SHAFT_TOP, z0, z1);
  }

  // Moulded cap: astragal, frieze, bed mould, cavetto, corona and weathered top.
  loftSolid(bufL, plan, PLAN, [
    { inset: 0, t: SHAFT_TOP }, { inset: -0.012, t: SHAFT_TOP }, { inset: -0.014, t: SHAFT_TOP + 0.016 },
    { inset: -0.012, t: SHAFT_TOP + 0.03 }, { inset: 0, t: SHAFT_TOP + 0.032 },
    { inset: 0, t: SHAFT_TOP + 0.1 }, { inset: -0.02, t: SHAFT_TOP + 0.1 }, { inset: -0.02, t: SHAFT_TOP + 0.12 },
    { inset: -0.045, t: SHAFT_TOP + 0.135 }, { inset: -0.07, t: SHAFT_TOP + 0.16 }, { inset: -0.08, t: SHAFT_TOP + 0.18 },
    { inset: -0.08, t: SHAFT_TOP + 0.235 }, { inset: -0.07, t: SHAFT_TOP + 0.245 }, { inset: 0.04, t: CAP_TOP },
  ]);

  // Pineapple finial on a square socle: cup, then an ovoid body whose rings alternate by half a
  // segment so the facets read as scales, then a small crown.
  const sTop = CAP_TOP + 0.04;
  addBlock(bufL, -0.12, 0.12, CAP_TOP, sTop, -0.12, 0.12, 0.008, 0);
  const st = [
    { r: 0.085, y: sTop }, { r: 0.085, y: sTop + 0.014 }, { r: 0.062, y: sTop + 0.028 },
    { r: 0.04, y: sTop + 0.045 }, { r: 0.04, y: sTop + 0.058 }, { r: 0.072, y: sTop + 0.072 },
    { r: 0.08, y: sTop + 0.088 }, { r: 0.066, y: sTop + 0.094 },
  ];
  const b0 = sTop + 0.094, b1 = sTop + 0.35, R = 0.098;
  const rows = 9;
  for (let i = 1; i <= rows; i++) {
    const u = i / (rows + 1);                       // 0..1 up the body
    const shape = Math.sin(Math.PI * Math.pow(u, 0.85)); // ovoid, fuller low
    st.push({ r: 0.04 + (R - 0.04) * shape + (i % 2 ? 0.006 : -0.002), y: b0 + (b1 - b0) * u, rot: (i % 2) * 0.5 });
  }
  st.push({ r: 0.035, y: b1 }, { r: 0.05, y: b1 + 0.03, rot: 0.5 }, { r: 0.022, y: b1 + 0.06 }, { r: 0, y: b1 + 0.085 });
  addLathe(bufL, 0, 0, LATHE_SEGMENTS, st);

  createPart('Stone_Limestone', bufferGeo(bufL), mats.limestone, { parent: root });
  createPart('Panels_Plinth_Travertine', bufferGeo(bufT), mats.travertine, { parent: root });
  return root;
}
