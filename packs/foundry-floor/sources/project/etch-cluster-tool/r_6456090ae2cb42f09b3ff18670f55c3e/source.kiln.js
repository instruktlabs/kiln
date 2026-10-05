// ===== shared family construction (identical block copied into every cluster-tool program) =====
const PI = Math.PI;

function GB() {
  const P = [], N = [], I = [];
  let nv = 0;
  function addTri(pa, na, pb, nb, pc, nc) {
    const e1x = pb[0] - pa[0], e1y = pb[1] - pa[1], e1z = pb[2] - pa[2];
    const e2x = pc[0] - pa[0], e2y = pc[1] - pa[1], e2z = pc[2] - pa[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    const d = cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2]);
    if (d < 0) { const tp = pb; pb = pc; pc = tp; const tn = nb; nb = nc; nc = tn; }
    P.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]);
    N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    I.push(nv, nv + 1, nv + 2);
    nv += 3;
  }
  const FACES = [
    { k: 'r', n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { k: 'l', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { k: 't', n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { k: 'b', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { k: 'f', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { k: 'k', n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
  ];
  const api = {
    // axis-aligned box by ranges; skip letters: r=+X l=-X t=+Y b=-Y f=+Z k=-Z
    bx(x0, x1, y0, y1, z0, z1, skip) {
      skip = skip || '';
      const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
      const hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      const h = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
      for (const F of FACES) {
        if (skip.indexOf(F.k) >= 0) continue;
        const ext = (a) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];
        const hn = ext(F.n), hu = ext(F.u), hv = ext(F.v);
        const ctr = [c[0] + F.n[0] * hn, c[1] + F.n[1] * hn, c[2] + F.n[2] * hn];
        const pt = (su, sv) => [
          ctr[0] + F.u[0] * hu * su + F.v[0] * hv * sv,
          ctr[1] + F.u[1] * hu * su + F.v[1] * hv * sv,
          ctr[2] + F.u[2] * hu * su + F.v[2] * hv * sv];
        const p0 = pt(-1, -1), p1 = pt(1, -1), p2 = pt(1, 1), p3 = pt(-1, 1);
        addTri(p0, F.n, p1, F.n, p2, F.n);
        addTri(p0, F.n, p2, F.n, p3, F.n);
      }
    },
    // cylinder / frustum centred at (cx,cy,cz); axis y|x|z; caps 't','b','tb',''
    cyl(cx, cy, cz, rt, rb, h, seg, axis, caps, phase) {
      axis = axis || 'y'; caps = caps === undefined ? 'tb' : caps; phase = phase || 0;
      const M = axis === 'x' ? (x, y, z) => [y, -x, z] : axis === 'z' ? (x, y, z) => [x, -z, y] : (x, y, z) => [x, y, z];
      const T = (x, y, z) => { const q = M(x, y, z); return [q[0] + cx, q[1] + cy, q[2] + cz]; };
      const slope = (rb - rt) / h, l = Math.hypot(1, slope);
      const up = M(0, 1, 0), dn = M(0, -1, 0);
      for (let i = 0; i < seg; i++) {
        const a0 = phase + (i / seg) * 2 * PI, a1 = phase + ((i + 1) / seg) * 2 * PI;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const n0 = M(c0 / l, slope / l, s0 / l), n1 = M(c1 / l, slope / l, s1 / l);
        const b0 = T(c0 * rb, -h / 2, s0 * rb), b1 = T(c1 * rb, -h / 2, s1 * rb);
        const t0 = T(c0 * rt, h / 2, s0 * rt), t1 = T(c1 * rt, h / 2, s1 * rt);
        addTri(b0, n0, b1, n1, t1, n1);
        addTri(b0, n0, t1, n1, t0, n0);
        if (caps.indexOf('t') >= 0 && rt > 0) addTri(T(0, h / 2, 0), up, t0, up, t1, up);
        if (caps.indexOf('b') >= 0 && rb > 0) addTri(T(0, -h / 2, 0), dn, b0, dn, b1, dn);
      }
    },
    cylY(cx, y0, cz, r, h, seg, caps) { api.cyl(cx, y0 + h / 2, cz, r, r, h, seg, 'y', caps); },
    build() { return meshGeo({ positions: P, indices: I, normals: N }); },
    get tris() { return I.length / 3; },
  };
  return api;
}

function grp(parent, name, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}

function put(parent, name, gb, mat) {
  if (gb.tris === 0) return null;
  const m = createPart(name, gb.build(), mat, { parent });
  m.name = name;
  return m;
}

function makeMaterials(accentName, accentHex) {
  const mk = (hex, name, o) => { const x = gameMaterial(hex, Object.assign({ flatShading: false }, o)); x.name = name; return x; };
  const M = {
    white: mk(0xE8EBEE, 'tool-shell-white', { roughness: 0.55, metalness: 0.0 }),
    grey: mk(0xC5CBD1, 'tool-panel-grey', { roughness: 0.60, metalness: 0.0 }),
    graphite: mk(0x3B4148, 'trim-graphite', { roughness: 0.50, metalness: 0.1 }),
    steel: mk(0xB9BEC3, 'stainless', { roughness: 0.35, metalness: 1.0 }),
    accent: mk(accentHex, accentName, { roughness: 0.50, metalness: 0.0 }),
    screen: mk(0x9FD3F5, 'screen-glow', { roughness: 0.30, metalness: 0.0, emissive: 0x9FD3F5, emissiveIntensity: 0.9 }),
  };
  M.glass = glassMaterial(0x5E6A73, { opacity: 0.6, roughness: 0.1, metalness: 0.0 });
  M.glass.name = 'glass-smoked';
  return M;
}

// wall running along X (thickness w0..w1 in Z) with rectangular slots [[centreX, width], ...]
function slotWall(acc, a0, a1, w0, w1, y0, y1, slots, sy0, sy1) {
  const cuts = slots.slice().sort((p, q) => p[0] - q[0]);
  let cur = a0;
  for (const c of cuts) {
    const s0 = c[0] - c[1] / 2, s1 = c[0] + c[1] / 2;
    if (s0 > cur + 1e-9) acc.bx(cur, s0, y0, y1, w0, w1);
    acc.bx(s0, s1, y0, sy0, w0, w1);
    acc.bx(s0, s1, sy1, y1, w0, w1);
    cur = s1;
  }
  if (a1 > cur + 1e-9) acc.bx(cur, a1, y0, y1, w0, w1);
}

// EFEM + fan filters + window + status screen. o: xf (port mounting plane), depth, hw, h, fanH
function buildEfem(root, M, o) {
  const xf = o.xf, sf = xf - 0.004, xb = xf - o.depth, hwo = o.hw, hw = hwo - 0.004;
  const top = o.h, td = 0.02, xm = (sf + xb) / 2;
  const efem = grp(root, 'efem');
  const wh = GB(), dk = GB(), ac = GB();
  const rowsY = [[0.10, 1.44], [1.452, top - 0.02]];
  const colsZ = [[-(hw - td), -1.308], [-1.300, -0.812], [-0.804, 0.804], [0.812, 1.300], [1.308, hw - td]];
  const win = { z: 0.70, y0: 1.52, y1: 1.84 };
  const scr = { z0: 0.90, z1: 1.21, y0: 1.50, y1: 1.74 };
  dk.bx(xb + 0.02, sf - td, 0.10, top - 0.02, -(hw - td), hw - td);
  dk.bx(xb + 0.02, sf - 0.02, 0, 0.10, -(hw - 0.02), hw - 0.02);
  wh.bx(xb, xb + 0.02, 0.10, top - 0.02, -hw, hw);
  wh.bx(xb, sf, top - 0.02, top, -hw, hw, 'b');
  for (let r = 0; r < 2; r++) {
    const y0 = rowsY[r][0], y1 = rowsY[r][1], sk = r === 1 ? 't' : '';
    for (let c = 0; c < 5; c++) {
      const z0 = colsZ[c][0], z1 = colsZ[c][1];
      if (r === 1 && c === 2) {
        wh.bx(sf - td, sf, y0, win.y0, z0, z1, 'l');
        wh.bx(sf - td, sf, win.y1, y1, z0, z1, 'lt');
        wh.bx(sf - td, sf, win.y0, win.y1, z0, -win.z, 'l');
        wh.bx(sf - td, sf, win.y0, win.y1, win.z, z1, 'l');
      } else if (r === 1 && c === 3) {
        wh.bx(sf - td, sf, y0, scr.y0, z0, z1, 'l');
        wh.bx(sf - td, sf, scr.y1, y1, z0, z1, 'lt');
        wh.bx(sf - td, sf, scr.y0, scr.y1, z0, scr.z0, 'l');
        wh.bx(sf - td, sf, scr.y0, scr.y1, scr.z1, z1, 'l');
      } else {
        wh.bx(sf - td, sf, y0, y1, z0, z1, sk + 'l');
      }
    }
    for (const s of [-1, 1]) {
      const za = s > 0 ? hw - td : -hw, zb = s > 0 ? hw : -(hw - td);
      const ski = sk + (s > 0 ? 'k' : 'f');
      wh.bx(xb + 0.02, xm - 0.004, y0, y1, za, zb, ski);
      wh.bx(xm + 0.004, sf, y0, y1, za, zb, ski);
    }
  }
  // family stripe: Y 1.9..2.0, proud 4 mm on front and both sides
  ac.bx(sf, xf, 1.9, 2.0, -hwo, hwo, 'l');
  ac.bx(xb, sf, 1.9, 2.0, hw, hwo, 'k');
  ac.bx(xb, sf, 1.9, 2.0, -hwo, -hw, 'f');
  // three fan-filter units on the roof
  const fy1 = top + o.fanH - 0.005;
  for (const zc of [-1.2, 0, 1.2]) {
    wh.bx(xb + 0.04, sf - 0.04, top, fy1, zc - 0.55, zc + 0.55, 'b');
    dk.bx(xb + 0.10, sf - 0.10, fy1 - 0.005, top + o.fanH, zc - 0.49, zc + 0.49, 'b');
  }
  put(efem, 'efem_shell', wh, M.white);
  put(efem, 'efem_dark', dk, M.graphite);
  put(efem, 'efem_stripe', ac, M.accent);
  // window
  const w = grp(root, 'efemWindow'), wg = GB(), wd = GB();
  wg.bx(sf - 0.014, sf - 0.010, win.y0 - 0.005, win.y1 + 0.005, -win.z - 0.005, win.z + 0.005);
  wd.bx(sf, xf, win.y0 - 0.03, win.y0, -win.z - 0.03, win.z + 0.03, 'l');
  wd.bx(sf, xf, win.y1, win.y1 + 0.03, -win.z - 0.03, win.z + 0.03, 'l');
  wd.bx(sf, xf, win.y0, win.y1, -win.z - 0.03, -win.z, 'l');
  wd.bx(sf, xf, win.y0, win.y1, win.z, win.z + 0.03, 'l');
  put(w, 'efemWindow_glass', wg, M.glass);
  put(w, 'efemWindow_bezel', wd, M.graphite);
  // status screen
  const s = grp(root, 'statusScreen'), sg = GB(), sd = GB();
  sg.bx(sf - 0.014, sf - 0.010, scr.y0 - 0.005, scr.y1 + 0.005, scr.z0 - 0.005, scr.z1 + 0.005);
  sd.bx(sf, xf, scr.y0 - 0.025, scr.y0, scr.z0 - 0.025, scr.z1 + 0.025, 'l');
  sd.bx(sf, xf, scr.y1, scr.y1 + 0.025, scr.z0 - 0.025, scr.z1 + 0.025, 'l');
  sd.bx(sf, xf, scr.y0, scr.y1, scr.z0 - 0.025, scr.z0, 'l');
  sd.bx(sf, xf, scr.y0, scr.y1, scr.z1, scr.z1 + 0.025, 'l');
  put(s, 'statusScreen_glow', sg, M.screen);
  put(s, 'statusScreen_bezel', sd, M.graphite);
}

// two load locks between the EFEM back (x1) and the hub end wall (x0)
function buildLoadLocks(root, M, o) {
  const g = grp(root, 'loadLocks'), gr = GB(), dk = GB(), st = GB();
  for (const zc of o.zs) {
    gr.bx(o.x0, o.x1, o.y0, o.y1, zc - 0.27, zc + 0.27, 'b');
    dk.bx(o.x0 + 0.06, o.x1 - 0.06, o.y1, o.y1 + 0.02, zc - 0.21, zc + 0.21, 'b');
    st.cylY((o.x0 + o.x1) / 2, o.y1 + 0.02, zc, 0.06, 0.10, 12, 't');
    dk.bx(o.x0 + 0.10, o.x1 - 0.10, o.y0 + 0.10, o.y1 - 0.10, zc + 0.27, zc + 0.276, 'kb');
    dk.bx(o.x0 + 0.10, o.x1 - 0.10, o.y0 + 0.10, o.y1 - 0.10, zc - 0.276, zc - 0.27, 'fb');
  }
  put(g, 'loadLocks_body', gr, M.grey);
  put(g, 'loadLocks_dark', dk, M.graphite);
  put(g, 'loadLocks_port', st, M.steel);
}

// chamber lid + RF unit; base of the lid at y0, centre (cx, cz); geometry into the given accumulators
function lidRF(st, dk, wh, gr, cx, y0, cz, seg) {
  dk.cyl(cx, y0 + 0.015, cz, 0.42, 0.42, 0.03, seg, 'y', 't');
  st.cyl(cx, y0 + 0.09, cz, 0.40, 0.40, 0.12, seg, 'y', 't');
  gr.bx(cx - 0.25, cx + 0.25, y0 + 0.15, y0 + 0.20, cz - 0.25, cz + 0.25, 'b');
  wh.bx(cx - 0.21, cx + 0.21, y0 + 0.20, y0 + 0.50, cz - 0.21, cz + 0.21, 'b');
  dk.cyl(cx, y0 + 0.55, cz, 0.15, 0.15, 0.10, 16, 'y', 't');
  st.cyl(cx, y0 + 0.65, cz, 0.06, 0.06, 0.10, 12, 'y', 't');
  dk.bx(cx + 0.36, cx + 0.44, y0, y0 + 0.12, cz - 0.03, cz + 0.03, 'b');
  dk.bx(cx - 0.44, cx - 0.36, y0, y0 + 0.12, cz - 0.03, cz + 0.03, 'b');
  dk.bx(cx - 0.03, cx + 0.03, y0, y0 + 0.12, cz + 0.36, cz + 0.44, 'b');
  dk.bx(cx - 0.03, cx + 0.03, y0, y0 + 0.12, cz - 0.44, cz - 0.36, 'b');
}

// transfer robot (pivot at px,py,pz) with telescoping wafer blade; reach = retracted tip radius
function buildRobot(hub, M, px, py, pz, floorY) {
  const r = grp(hub, 'transferRobot', [px, py, pz]);
  const dk = GB();
  const baseLo = floorY - py, baseHi = -0.06;
  dk.cyl(0, (baseLo + baseHi) / 2, 0, 0.17, 0.17, baseHi - baseLo, 24, 'y', 't');
  dk.cyl(0, -0.005, 0, 0.11, 0.11, 0.11, 20, 'y', 'tb');
  dk.bx(0, 0.50, -0.03, 0.03, -0.05, 0.05);
  dk.bx(0.02, 0.50, -0.03, 0.05, -0.08, -0.05);
  dk.bx(0.02, 0.50, -0.03, 0.05, 0.05, 0.08);
  put(r, 'transferRobot_body', dk, M.graphite);
  const b = grp(r, 'robotBlade', [0, 0, 0]);
  const bd = GB(), bs = GB();
  bd.bx(-0.10, 0.08, 0.05, 0.08, -0.07, 0.07, 'b');
  bs.bx(-0.06, 0.30, 0.08, 0.093, -0.07, 0.07);
  bs.bx(0.30, 0.52, 0.08, 0.093, -0.07, -0.035);
  bs.bx(0.30, 0.52, 0.08, 0.093, 0.035, 0.07);
  put(b, 'robotBlade_carriage', bd, M.graphite);
  put(b, 'robotBlade_paddle', bs, M.steel);
  return r;
}

// smooth-eased keyframe segments
function smooth(u) { return u * u * (3 - 2 * u); }
function seg(list, t0, t1, a, b, n) {
  for (let i = 0; i <= n; i++) { const u = i / n; list.push([t0 + (t1 - t0) * u, a + (b - a) * smooth(u)]); }
}
function dedupe(list) {
  const out = [];
  for (const k of list) {
    if (out.length && Math.abs(out[out.length - 1][0] - k[0]) < 1e-9) out[out.length - 1] = k; else out.push(k);
  }
  return out;
}
function robotClipKeys(a1, a2) {
  const r = [], b = [];
  seg(r, 0, 0.8, 0, a1, 6); seg(r, 0.8, 1.8, a1, a1, 1); seg(r, 1.8, 2.6, a1, a2, 8);
  seg(r, 2.6, 3.4, a2, a2, 1); seg(r, 3.4, 4.0, a2, 0, 6);
  seg(b, 0, 0.8, 0, 0, 1); seg(b, 0.8, 1.3, 0, 0.45, 5); seg(b, 1.3, 1.8, 0.45, 0, 5);
  seg(b, 1.8, 2.6, 0, 0, 1); seg(b, 2.6, 3.0, 0, 0.45, 5); seg(b, 3.0, 3.4, 0.45, 0, 5); seg(b, 3.4, 4.0, 0, 0, 1);
  return { rot: dedupe(r), blade: dedupe(b) };
}
function lidClipKeys(open) {
  const l = [];
  if (open) seg(l, 0, 3, 0, 80, 12); else seg(l, 0, 3, 80, 0, 12);
  return dedupe(l);
}
function toolClips(a1, a2) {
  const k = robotClipKeys(a1, a2);
  return [
    createClip('RobotTransfer', 4, [
      rotationTrack('transferRobot', k.rot.map((e) => ({ time: e[0], rotation: [0, e[1], 0] }))),
      positionTrack('robotBlade', k.blade.map((e) => ({ time: e[0], position: [e[1], 0, 0] }))),
    ]),
    createClip('LidOpen', 3, [rotationTrack('serviceLid', lidClipKeys(true).map((e) => ({ time: e[0], rotation: [e[1], 0, 0] })))]),
    createClip('LidClose', 3, [rotationTrack('serviceLid', lidClipKeys(false).map((e) => ({ time: e[0], rotation: [e[1], 0, 0] })))]),
  ];
}

// ===== etch-cluster-tool (asset part) =====
const meta = { name: 'Plasma etch cluster tool' };
const REVIEW = { detail: true, lod: true, lidDeg: 0, robotDeg: 0, bladeX: 0, fit: false, row: 1, pitch: 3.9, noGlass: false };

const XF = 2.3, EFEM_D = 0.8, EFEM_HW = 1.8, EFEM_H = 2.3, FAN_H = 0.4;
const HUB_X0 = -2.1, HUB_X1 = 0.9, HUB_HW = 0.6, HUB_WALL = 0.06;
const FLOOR_Y = 0.9, TOP_Y = 1.5, HUB_FLOOR_TOP = 0.94;
const CH_X = [0.4, -0.6, -1.6];
const CH_HW = 0.45, CH_Z0 = 0.6, CH_Z1 = 1.6, CH_WALL = 0.06, CH_ZC = 1.1, CH_OPEN = 0.29;
const SLOT_W = 0.36, SLOT_Y0 = 1.24, SLOT_Y1 = 1.34;
const ROBOT = [-0.6, 1.2, 0];
const HINGE = [0.4, 1.5, 1.6];
const LL = { x0: 0.9, x1: 1.5, y0: 0.9, y1: 1.5, zs: [-0.30, 0.30] };
const LP = { x: 2.3, zs: [-0.505, 0, 0.505] };

function rfBand(ac, cx, y0, cz) {
  const b0 = y0 + 0.40, b1 = y0 + 0.50;
  ac.bx(cx + 0.21, cx + 0.214, b0, b1, cz - 0.214, cz + 0.214, 'lb');
  ac.bx(cx - 0.214, cx - 0.21, b0, b1, cz - 0.214, cz + 0.214, 'rb');
  ac.bx(cx - 0.21, cx + 0.21, b0, b1, cz + 0.21, cz + 0.214, 'kb');
  ac.bx(cx - 0.21, cx + 0.21, b0, b1, cz - 0.214, cz - 0.21, 'fb');
}

function buildHub(root, M) {
  const g = grp(root, 'transferHub');
  const st = GB(), gl = GB();
  const slots = CH_X.map((c) => [c, SLOT_W]);
  const xa = HUB_X0 + HUB_WALL, xb = HUB_X1 - HUB_WALL, hi = HUB_HW - HUB_WALL, rim = 0.07;
  slotWall(st, xa, xb, hi, HUB_HW, FLOOR_Y, TOP_Y, slots, SLOT_Y0, SLOT_Y1);
  slotWall(st, xa, xb, -HUB_HW, -hi, FLOOR_Y, TOP_Y, slots, SLOT_Y0, SLOT_Y1);
  st.bx(xb, HUB_X1, FLOOR_Y, TOP_Y, -HUB_HW, HUB_HW);
  st.bx(HUB_X0, xa, FLOOR_Y, TOP_Y, -HUB_HW, HUB_HW);
  st.bx(xa, xb, FLOOR_Y, HUB_FLOOR_TOP, -hi, hi, 'b');
  const rz = HUB_HW - rim;
  st.bx(xa, xb, TOP_Y, TOP_Y + 0.03, rz, HUB_HW, 'b');
  st.bx(xa, xb, TOP_Y, TOP_Y + 0.03, -HUB_HW, -rz, 'b');
  st.bx(HUB_X0, HUB_X0 + rim, TOP_Y, TOP_Y + 0.03, -rz, rz, 'b');
  st.bx(HUB_X1 - rim, HUB_X1, TOP_Y, TOP_Y + 0.03, -rz, rz, 'b');
  const bars = [-1.1, -0.1];
  for (const xc of bars) st.bx(xc - 0.03, xc + 0.03, TOP_Y, TOP_Y + 0.03, -rz, rz, 'b');
  const edges = [HUB_X0 + rim, bars[0] - 0.03, bars[0] + 0.03, bars[1] - 0.03, bars[1] + 0.03, HUB_X1 - rim];
  for (let i = 0; i < 3; i++) gl.bx(edges[2 * i] + 0.002, edges[2 * i + 1] - 0.002, TOP_Y + 0.008, TOP_Y + 0.022, -rz + 0.002, rz - 0.002);
  put(g, 'transferHub_wall', st, M.steel);
  if (!REVIEW.noGlass) put(g, 'transferHub_glass', gl, M.glass);
}

// chamber body on side s (+1/-1) at X centre c: stainless shell, graphite exterior details
function chamberBody(st, dk, s, c) {
  const zr = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
  const [h0, h1] = zr(CH_Z0, CH_Z0 + CH_WALL), [o0, o1] = zr(CH_Z1 - CH_WALL - 0.02, CH_Z1 - 0.02);
  const [i0, i1] = zr(CH_Z0 + CH_WALL, CH_Z1 - CH_WALL - 0.02), [f0, f1] = zr(CH_Z0, CH_Z1);
  const y0 = FLOOR_Y + 0.04, y1 = TOP_Y - 0.06, zc = s * CH_ZC;
  slotWall(st, c - CH_HW, c + CH_HW, h0, h1, y0, y1, [[c, SLOT_W]], SLOT_Y0, SLOT_Y1);
  st.bx(c - CH_HW, c - CH_HW + CH_WALL, y0, y1, i0, i1);
  st.bx(c + CH_HW - CH_WALL, c + CH_HW, y0, y1, i0, i1);
  st.bx(c - CH_HW, c + CH_HW, y0, y1, o0, o1);
  st.bx(c - CH_HW, c + CH_HW, FLOOR_Y, y0, f0, f1, 'b');
  const zo0 = zc - CH_OPEN, zo1 = zc + CH_OPEN;
  st.bx(c - CH_HW, c + CH_HW, y1, TOP_Y, f0, Math.min(zo0, zo1) , '');
  st.bx(c - CH_HW, c + CH_HW, y1, TOP_Y, Math.max(zo0, zo1), f1, '');
  st.bx(c - CH_HW, c - CH_OPEN, y1, TOP_Y, Math.min(zo0, zo1), Math.max(zo0, zo1), '');
  st.bx(c + CH_OPEN, c + CH_HW, y1, TOP_Y, Math.min(zo0, zo1), Math.max(zo0, zo1), '');
  st.cylY(c, HUB_FLOOR_TOP, zc, 0.16, 0.32, 16, 't');
  dk.cylY(c, 1.26, zc, 0.15, 0.012, 16, 't');
  const zp = s > 0 ? [CH_Z1 - 0.02, CH_Z1 - 0.01] : [-CH_Z1 + 0.01, -CH_Z1 + 0.02], zk = s > 0 ? 'k' : 'f';
  dk.bx(c - 0.18, c + 0.18, 1.02, 1.28, zp[0], zp[1], zk);
  const zq = s > 0 ? [CH_Z1 - 0.02, CH_Z1] : [-CH_Z1, -CH_Z1 + 0.02];
  st.bx(c - 0.30, c - 0.27, 0.98, 1.42, zq[0], zq[1], zk);
  st.bx(c + 0.27, c + 0.30, 0.98, 1.42, zq[0], zq[1], zk);
}

function buildChambers(root, M) {
  const pc = grp(root, 'processChambers'), sc = grp(root, 'serviceChamber');
  const A = { st: GB(), dk: GB(), wh: GB(), gr: GB(), ac: GB() };
  const S = { st: GB(), dk: GB() };
  for (const s of [1, -1]) {
    for (const c of CH_X) {
      if (s > 0 && c === HINGE[0]) {
        chamberBody(S.st, S.dk, s, c);
        S.dk.bx(c - 0.34, c - 0.20, 1.42, 1.50, 1.56, 1.60);
        S.dk.bx(c + 0.20, c + 0.34, 1.42, 1.50, 1.56, 1.60);
      } else {
        chamberBody(A.st, A.dk, s, c);
        lidRF(A.st, A.dk, A.wh, A.gr, c, TOP_Y, s * CH_ZC, 24);
        rfBand(A.ac, c, TOP_Y, s * CH_ZC);
      }
    }
  }
  put(pc, 'processChambers_body', A.st, M.steel);
  put(pc, 'processChambers_dark', A.dk, M.graphite);
  put(pc, 'processChambers_rf', A.wh, M.white);
  put(pc, 'processChambers_plate', A.gr, M.grey);
  put(pc, 'processChambers_accent', A.ac, M.accent);
  put(sc, 'serviceChamber_body', S.st, M.steel);
  put(sc, 'serviceChamber_dark', S.dk, M.graphite);
  const lid = grp(root, 'serviceLid', HINGE);
  const L = { st: GB(), dk: GB(), wh: GB(), gr: GB(), ac: GB() };
  lidRF(L.st, L.dk, L.wh, L.gr, 0, 0, -CH_ZC + 0.6, 24);
  rfBand(L.ac, 0, 0, -CH_ZC + 0.6);
  L.st.cyl(-0.27, 0, 0, 0.03, 0.03, 0.12, 10, 'x', 'tb');
  L.st.cyl(0.27, 0, 0, 0.03, 0.03, 0.12, 10, 'x', 'tb');
  L.dk.bx(-0.33, -0.21, 0, 0.05, -0.20, 0.03, 'b');
  L.dk.bx(0.21, 0.33, 0, 0.05, -0.20, 0.03, 'b');
  put(lid, 'serviceLid_lid', L.st, M.steel);
  put(lid, 'serviceLid_dark', L.dk, M.graphite);
  put(lid, 'serviceLid_rf', L.wh, M.white);
  put(lid, 'serviceLid_plate', L.gr, M.grey);
  put(lid, 'serviceLid_accent', L.ac, M.accent);
  lid.rotation.x = REVIEW.lidDeg * PI / 180;
  return lid;
}

function buildFrame(root, M) {
  const g = grp(root, 'frame');
  const gy = GB(), dk = GB(), wh = GB();
  gy.bx(HUB_X0, LL.x1, 0.06, FLOOR_Y, -HUB_HW, HUB_HW, 'b');
  for (const s of [1, -1]) {
    const za = s > 0 ? CH_Z0 : -(CH_Z1 - 0.012), zb = s > 0 ? CH_Z1 - 0.012 : -CH_Z0;
    gy.bx(-2.05, LL.x1, 0.06, FLOOR_Y, za, zb, 'b');
    dk.bx(-2.05 - 0.004, LL.x1 + 0.0, 0, 0.06, za - 0.004, zb + 0.004, 'b');
    const zp = s > 0 ? [CH_Z1 - 0.012, CH_Z1] : [-CH_Z1, -CH_Z1 + 0.012], zk = s > 0 ? 'k' : 'f';
    for (const c of CH_X) {
      for (const y of [0.24, 0.36, 0.48, 0.60]) dk.bx(c - 0.30, c + 0.30, y, y + 0.04, zp[0], zp[1], zk);
    }
    for (const xg of [-0.10, -1.10]) dk.bx(xg - 0.02, xg + 0.02, 0.10, 0.86, zp[0], zp[1], zk);
  }
  dk.bx(HUB_X0, LL.x1, 0, 0.06, -HUB_HW + 0.004, HUB_HW - 0.004, 'b');
  wh.bx(-2.296, HUB_X0, 0.06, 1.6, -0.85, 0.85);
  for (const y of [0.4, 0.6, 0.8, 1.0, 1.2]) dk.bx(-2.3, -2.296, y, y + 0.05, -0.60, 0.60, 'r');
  dk.bx(-2.296, HUB_X0, 0, 0.06, -0.854, 0.854, 'b');
  put(g, 'frame_body', gy, M.grey);
  put(g, 'frame_dark', dk, M.graphite);
  put(g, 'frame_utility', wh, M.white);
}

function buildLod(root, M) {
  const g = grp(root, 'lod1');
  const wh = GB(), gy = GB(), st = GB(), ac = GB();
  const e = 0.002, xf = XF - 0.004, xb = XF - EFEM_D, hw = EFEM_HW - 0.004;
  wh.bx(xb + e, xf - e, e, EFEM_H - e, -(hw - e), hw - e, 'b');
  ac.bx(xf - e, XF - e, 1.9, 2.0, -(EFEM_HW - e), EFEM_HW - e, 'l');
  ac.bx(xb + e, xf - e, 1.9, 2.0, hw - e, EFEM_HW - e, 'kr');
  ac.bx(xb + e, xf - e, 1.9, 2.0, -(EFEM_HW - e), -(hw - e), 'fr');
  for (const zc of [-1.2, 0, 1.2]) wh.bx(xb + 0.04 + e, xf - 0.04 - e, EFEM_H - e, EFEM_H + FAN_H - 0.005 - e, zc - 0.55 + e, zc + 0.55 - e, 'b');
  for (const zc of LL.zs) gy.bx(LL.x0 + e, LL.x1 - e, LL.y0, LL.y1 - e, zc - 0.27 + e, zc + 0.27 - e, 'b');
  gy.bx(HUB_X0 + e, LL.x1 - e, e, FLOOR_Y, -(HUB_HW - e), HUB_HW - e, 'b');
  for (const s of [1, -1]) {
    const zf = CH_Z1 - 0.012 - e, zh = CH_Z1 - 0.02 - e;
    const za = s > 0 ? CH_Z0 + e : -zf, zb = s > 0 ? zf : -CH_Z0 - e;
    const zca = s > 0 ? CH_Z0 + e : -zh, zcb = s > 0 ? zh : -CH_Z0 - e;
    gy.bx(-2.05 + e, LL.x1 - e, e, FLOOR_Y, za, zb, 'b');
    for (const c of CH_X) {
      st.bx(c - CH_HW + e, c + CH_HW - e, FLOOR_Y, TOP_Y - e, zca, zcb, 'b');
      st.bx(c - 0.28, c + 0.28, TOP_Y - e, TOP_Y + 0.148, s * CH_ZC - 0.28, s * CH_ZC + 0.28, 'b');
      wh.bx(c - 0.208, c + 0.208, TOP_Y + 0.148, TOP_Y + 0.498, s * CH_ZC - 0.208, s * CH_ZC + 0.208, 'b');
    }
  }
  st.bx(HUB_X0 + e, HUB_X1 - e, FLOOR_Y, TOP_Y - e, -(HUB_HW - e), HUB_HW - e, 'b');
  wh.bx(-2.296 + e, HUB_X0 - e, e, 1.6 - e, -0.85 + e, 0.85 - e, 'b');
  put(g, 'lod1_white', wh, M.white);
  put(g, 'lod1_grey', gy, M.grey);
  put(g, 'lod1_steel', st, M.steel);
  put(g, 'lod1_accent', ac, M.accent);
}

function buildFit(root, M) {
  const g = grp(root, 'reviewFit');
  LP.zs.forEach((z, i) => {
    const pb = GB(), fb = GB();
    pb.bx(LP.x, LP.x + 0.55, 0, 1.4, z - 0.25, z + 0.25);
    fb.bx(LP.x + 0.30 - 0.1665, LP.x + 0.30 + 0.1665, 0.90, 1.235, z - 0.208, z + 0.208);
    put(g, 'reviewFitPort' + (i + 1), pb, M.glass);
    put(g, 'reviewFitFoup' + (i + 1), fb, M.screen);
  });
}

function buildTool(root, M) {
  if (REVIEW.detail) {
    buildEfem(root, M, { xf: XF, depth: EFEM_D, hw: EFEM_HW, h: EFEM_H, fanH: FAN_H });
    buildLoadLocks(root, M, LL);
    buildHub(root, M);
    const robot = buildRobot(root, M, ROBOT[0], ROBOT[1], ROBOT[2], HUB_FLOOR_TOP);
    robot.rotation.y = REVIEW.robotDeg * PI / 180;
    robot.getObjectByName('robotBlade').position.x = REVIEW.bladeX;
    buildChambers(root, M);
    buildFrame(root, M);
    LP.zs.forEach((z, i) => grp(root, 'lp' + (i + 1), [LP.x, 0, z]));
    grp(root, 'signalTowerMount', [2.15, 2.7, 1.6]);
  }
  if (REVIEW.lod) buildLod(root, M);
  if (REVIEW.fit) buildFit(root, M);
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing tool far distance (38 m),
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
  const coverage = Math.min(1, Math.PI * (radius / (2 * 38 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

async function build() {
  const root = createRoot('etch-cluster-tool');
  const M = makeMaterials('accent-etch', 0x6A5BAE);
  const N = REVIEW.row;
  for (let i = 0; i < N; i++) buildTool(N > 1 ? grp(root, 'tool' + i, [0, 0, (i - (N - 1) / 2) * REVIEW.pitch]) : root, M);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  return REVIEW.row > 1 ? [] : toolClips(90, -90);
}
