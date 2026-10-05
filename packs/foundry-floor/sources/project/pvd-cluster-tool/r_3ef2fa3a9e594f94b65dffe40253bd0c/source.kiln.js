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
    // box rotated about Y: local +X maps to world (dx,dz), local +Z to (-dz,dx); half sizes hx,hy,hz; skip letters are local
    rbx(cx, cy, cz, hx, hy, hz, dx, dz, skip) {
      skip = skip || '';
      const R = (v) => [v[0] * dx - v[2] * dz, v[1], v[0] * dz + v[2] * dx];
      const h = [hx, hy, hz];
      for (const F of FACES) {
        if (skip.indexOf(F.k) >= 0) continue;
        const ext = (a) => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];
        const hn = ext(F.n), hu = ext(F.u), hv = ext(F.v);
        const pt = (su, sv) => {
          const r = R([F.n[0] * hn + F.u[0] * hu * su + F.v[0] * hv * sv, F.n[1] * hn + F.u[1] * hu * su + F.v[1] * hv * sv, F.n[2] * hn + F.u[2] * hu * su + F.v[2] * hv * sv]);
          return [cx + r[0], cy + r[1], cz + r[2]];
        };
        const nn = R(F.n), p0 = pt(-1, -1), p1 = pt(1, -1), p2 = pt(1, 1), p3 = pt(-1, 1);
        addTri(p0, nn, p1, nn, p2, nn);
        addTri(p0, nn, p2, nn, p3, nn);
      }
    },
    tri: addTri,
    // cylinder / frustum centred at (cx,cy,cz); axis y|x|z or a unit vector [ax,ay,az]; caps 't','b','tb',''
    cyl(cx, cy, cz, rt, rb, h, seg, axis, caps, phase) {
      axis = axis || 'y'; caps = caps === undefined ? 'tb' : caps; phase = phase || 0;
      const frameM = (a) => {
        const u = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let e2 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
        const l = Math.hypot(e2[0], e2[1], e2[2]); e2 = e2.map((v) => v / l);
        const e3 = [a[1] * e2[2] - a[2] * e2[1], a[2] * e2[0] - a[0] * e2[2], a[0] * e2[1] - a[1] * e2[0]];
        return (x, y, z) => [x * e2[0] + y * a[0] + z * e3[0], x * e2[1] + y * a[1] + z * e3[1], x * e2[2] + y * a[2] + z * e3[2]];
      };
      const M = Array.isArray(axis) ? frameM(axis) : axis === 'x' ? (x, y, z) => [y, -x, z] : axis === 'z' ? (x, y, z) => [x, -z, y] : (x, y, z) => [x, y, z];
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
  const fhw = o.fanHW || 0.55;
  for (const zc of o.fans || [-1.2, 0, 1.2]) {
    wh.bx(xb + 0.04, sf - 0.04, top, fy1, zc - fhw, zc + fhw, 'b');
    dk.bx(xb + 0.10, sf - 0.10, fy1 - 0.005, top + o.fanH, zc - (fhw - 0.06), zc + (fhw - 0.06), 'b');
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

// ===== pvd-cluster-tool (asset part) =====
const meta = { name: 'PVD cluster tool' };
const REVIEW = { detail: true, lod: true, lidDeg: 0, robotDeg: 0, bladeX: 0, fit: false, row: 1, pitch: 5.4, noGlass: false };

const XF = 2.5, EFEM_D = 0.8, EFEM_HW = 2.1, EFEM_H = 2.4, FAN_H = 0.4, FANS = [-1.4, 0, 1.4], FAN_HW = 0.65;
const HC = [-0.6, 0], HR = 0.8, APO = HR * Math.cos(PI / 8), HUB_T = 0.05;
const FLOOR_Y = 0.9, TOP_Y = 1.5, HUB_FLOOR_TOP = 0.94;
const CH_R = 1.45, CH_RO = 0.40, CH_RI = 0.36, CH_Y1 = 1.45, LID_Y = 1.5;
const SLOT_W = 0.30, SLOT_Y0 = 1.24, SLOT_Y1 = 1.34;
const ROBOT = [-0.6, 1.2, 0];
const HINGE = [-0.6, 1.5, 1.85];
const LL = { x0: 1.1, x1: 1.7, y0: 0.9, y1: 1.5, zs: [-0.30, 0.30] };
const LP = { x: 2.5, zs: [-0.505, 0, 0.505] };
// chamber angle: degrees from the -X direction toward +Z, measured at the hub centre
const CH = [-90, -45, 0, 45, 90].map((a) => {
  const r = a * PI / 180, u = [-Math.cos(r), Math.sin(r)];
  return { a, u, cx: HC[0] + CH_R * u[0], cz: HC[1] + CH_R * u[1], svc: a === 90 };
});
// cryo pump per chamber: horizontal axis d, outer end s1 (distance from chamber centre)
const PUMP_Y = 1.15;
const pumpOf = (c) => {
  if (c.a === 0) return { d: [0, -1], s1: 0.62 };
  if (Math.abs(c.a) === 90) return { d: c.u, s1: 0.62 };
  return { d: c.u, s1: 0.72 };
};

// box in a hub-face frame: n outward normal, u along the face tangent, v along n from the hub centre
function fbx(gb, n, u0, u1, v0, v1, y0, y1, skip) {
  const t = [n[1], -n[0]], uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  gb.rbx(HC[0] + t[0] * uc + n[0] * vc, (y0 + y1) / 2, HC[1] + t[1] * uc + n[1] * vc, (u1 - u0) / 2, (y1 - y0) / 2, (v1 - v0) / 2, t[0], t[1], skip);
}

function hubFace(gb, n, slotted) {
  const v0 = APO - HUB_T, v1 = APO, hl = APO * Math.tan(PI / 8) + 0.02, s = SLOT_W / 2;
  if (!slotted) { fbx(gb, n, -hl, hl, v0, v1, FLOOR_Y, TOP_Y, 'lr'); return; }
  fbx(gb, n, -hl, -s, v0, v1, FLOOR_Y, TOP_Y, 'l');
  fbx(gb, n, s, hl, v0, v1, FLOOR_Y, TOP_Y, 'r');
  fbx(gb, n, -s, s, v0, v1, SLOT_Y1, TOP_Y, 'lr');
  fbx(gb, n, -s, s, v0, v1, FLOOR_Y, SLOT_Y0, 'lr');
}

function buildHub(root, M) {
  const g = grp(root, 'transferHub');
  const st = GB(), dk = GB(), gl = GB();
  const faces = CH.map((c) => c.u);
  faces.push([1, 0], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]);
  faces.forEach((n, i) => hubFace(st, n, i < CH.length));
  st.cyl(HC[0], (FLOOR_Y + HUB_FLOOR_TOP) / 2, HC[1], 0.76, 0.76, HUB_FLOOR_TOP - FLOOR_Y, 8, 'y', 't', PI / 8);
  // rim around the smoked lid
  const rimHl = APO * Math.tan(PI / 8) + 0.02;
  for (let i = 0; i < 8; i++) {
    const a = i * PI / 4, n = [Math.cos(a), Math.sin(a)];
    fbx(st, n, -rimHl, rimHl, APO - 0.07, APO, TOP_Y, TOP_Y + 0.03, 'lrb');
  }
  gl.cyl(HC[0], TOP_Y + 0.0125, HC[1], 0.735, 0.735, 0.015, 8, 'y', 'tb', PI / 8);
  // neck and vestibule toward the load locks
  st.bx(HC[0] + APO - 0.04, 0.60, FLOOR_Y, TOP_Y, -0.34, 0.34, 'lb');
  st.bx(0.60, LL.x0, FLOOR_Y, TOP_Y, -0.60, 0.60, 'rb');
  dk.bx(0.30, 0.34, TOP_Y, TOP_Y + 0.012, -0.34, 0.34, 'b');
  dk.bx(0.90, 0.94, TOP_Y, TOP_Y + 0.012, -0.60, 0.60, 'b');
  // slit-valve ducts from each hub face to its chamber
  for (const c of CH) {
    const n = c.u, w = 0.19, wi = SLOT_W / 2, ve = 1.10, hidden = 'kf';
    fbx(dk, n, -w, w, APO, ve, SLOT_Y1, 1.40, hidden);
    fbx(dk, n, -w, w, APO, ve, 1.18, SLOT_Y0, hidden);
    fbx(dk, n, -w, -wi, APO, ve, SLOT_Y0, SLOT_Y1, hidden + 'tb');
    fbx(dk, n, wi, w, APO, ve, SLOT_Y0, SLOT_Y1, hidden + 'tb');
  }
  put(g, 'transferHub_wall', st, M.steel);
  put(g, 'transferHub_dark', dk, M.graphite);
  if (!REVIEW.noGlass) put(g, 'transferHub_glass', gl, M.glass);
}

function buildRobotPvd(root, M) {
  const r = grp(root, 'transferRobot', ROBOT);
  const dk = GB();
  const baseLo = HUB_FLOOR_TOP - ROBOT[1], baseHi = -0.06;
  dk.cyl(0, (baseLo + baseHi) / 2, 0, 0.17, 0.17, baseHi - baseLo, 24, 'y', 't');
  dk.cyl(0, -0.005, 0, 0.11, 0.11, 0.11, 20, 'y', 'tb');
  dk.bx(-0.50, 0, -0.03, 0.03, -0.05, 0.05);
  dk.bx(-0.50, -0.02, -0.03, 0.05, -0.08, -0.05);
  dk.bx(-0.50, -0.02, -0.03, 0.05, 0.05, 0.08);
  put(r, 'transferRobot_body', dk, M.graphite);
  const b = grp(r, 'robotBlade', [0, 0, 0]);
  const bd = GB(), bs = GB();
  bd.bx(-0.08, 0.10, 0.05, 0.08, -0.07, 0.07, 'b');
  bs.bx(-0.36, 0.06, 0.08, 0.093, -0.07, 0.07);
  bs.bx(-0.66, -0.36, 0.08, 0.093, -0.07, -0.035);
  bs.bx(-0.66, -0.36, 0.08, 0.093, 0.035, 0.07);
  put(b, 'robotBlade_carriage', bd, M.graphite);
  put(b, 'robotBlade_paddle', bs, M.steel);
  return r;
}

// hollow chamber wall ring with a hub-facing slot spanning 3 of 24 segments centred on phi0
function ringSlot(gb, cx, cz, phi0, y0, y1, top) {
  const N = 24, d = 2 * PI / N, up = [0, 1, 0], dn = [0, -1, 0];
  const ph = (k) => phi0 + (k - 1.5) * d;
  const V = (r, y, k) => [cx + r * Math.cos(ph(k)), y, cz + r * Math.sin(ph(k))];
  const nO = (k) => [Math.cos(ph(k)), 0, Math.sin(ph(k))];
  const nI = (k) => [-Math.cos(ph(k)), 0, -Math.sin(ph(k))];
  const band = (r, na, ya, yb, k) => {
    const a0 = V(r, ya, k), a1 = V(r, ya, k + 1), b0 = V(r, yb, k), b1 = V(r, yb, k + 1);
    gb.tri(a0, na(k), a1, na(k + 1), b1, na(k + 1));
    gb.tri(a0, na(k), b1, na(k + 1), b0, na(k));
  };
  const flat = (y, k, n) => {
    const p0 = V(CH_RO, y, k), p1 = V(CH_RO, y, k + 1), p2 = V(CH_RI, y, k + 1), p3 = V(CH_RI, y, k);
    gb.tri(p0, n, p1, n, p2, n);
    gb.tri(p0, n, p2, n, p3, n);
  };
  for (let k = 0; k < N; k++) {
    const slot = k <= 2;
    for (const [r, na] of [[CH_RO, nO], [CH_RI, nI]]) {
      if (!slot) band(r, na, y0, y1, k);
      else { band(r, na, y0, SLOT_Y0, k); band(r, na, SLOT_Y1, y1, k); }
    }
    if (slot) { flat(SLOT_Y0, k, up); flat(SLOT_Y1, k, dn); }
    if (top) flat(y1, k, up);
    gb.tri([cx, HUB_FLOOR_TOP, cz], up, V(CH_RI, HUB_FLOOR_TOP, k), up, V(CH_RI, HUB_FLOOR_TOP, k + 1), up);
  }
  for (const [k, s] of [[0, 1], [3, -1]]) {
    const n = [-Math.sin(ph(k)) * s, 0, Math.cos(ph(k)) * s];
    const p0 = V(CH_RO, SLOT_Y0, k), p1 = V(CH_RI, SLOT_Y0, k), p2 = V(CH_RI, SLOT_Y1, k), p3 = V(CH_RO, SLOT_Y1, k);
    gb.tri(p0, n, p1, n, p2, n);
    gb.tri(p0, n, p2, n, p3, n);
  }
}

function chamberCommon(c, ac) {
  const phi0 = Math.atan2(-c.u[1], -c.u[0]);
  ringSlot(ac.body, c.cx, c.cz, phi0, FLOOR_Y, c.svc ? CH_Y1 - 0.001 : CH_Y1, c.svc);
  ac.steel.cyl(c.cx, (HUB_FLOOR_TOP + 1.16) / 2, c.cz, 0.18, 0.18, 1.16 - HUB_FLOOR_TOP, 16, 'y', 't');
  const p = pumpOf(c), a = [p.d[0], 0, p.d[1]], s0 = 0.37;
  const at = (s) => [c.cx + p.d[0] * s, PUMP_Y, c.cz + p.d[1] * s];
  const m = at((s0 + p.s1 - 0.03) / 2);
  ac.steel.cyl(m[0], m[1], m[2], 0.10, 0.10, p.s1 - 0.03 - s0, 16, a, '');
  const f = at(p.s1 - 0.015);
  ac.dark.cyl(f[0], f[1], f[2], 0.14, 0.14, 0.03, 16, a, 'tb');
}

function buildChambers(root, M) {
  const g = grp(root, 'processChambers'), sv = grp(root, 'serviceChamber');
  const P = { body: GB(), dark: GB(), steel: GB(), copper: GB() }, S = { body: GB(), dark: GB(), steel: GB() };
  for (const c of CH) {
    if (c.svc) { chamberCommon(c, S); continue; }
    chamberCommon(c, P);
    P.steel.cyl(c.cx, LID_Y - 0.025, c.cz, 0.42, 0.42, 0.05, 24, 'y', 't');
    P.copper.cyl(c.cx, LID_Y + 0.075, c.cz, 0.30, 0.30, 0.15, 24, 'y', 't');
    P.dark.cyl(c.cx, LID_Y + 0.156, c.cz, 0.12, 0.12, 0.012, 12, 'y', 't');
  }
  // hinge brackets on the +Z chamber wall
  S.dark.bx(HINGE[0] - 0.25, HINGE[0] - 0.19, 1.36, 1.52, 1.80, 1.90);
  S.dark.bx(HINGE[0] + 0.19, HINGE[0] + 0.25, 1.36, 1.52, 1.80, 1.90);
  put(g, 'processChambers_body', P.body, M.grey);
  put(g, 'processChambers_dark', P.dark, M.graphite);
  put(g, 'processChambers_steel', P.steel, M.steel);
  put(g, 'processChambers_copper', P.copper, M.copper);
  put(sv, 'serviceChamber_body', S.body, M.grey);
  put(sv, 'serviceChamber_dark', S.dark, M.graphite);
  put(sv, 'serviceChamber_steel', S.steel, M.steel);
}

function buildLid(root, M) {
  const g = grp(root, 'serviceLid', HINGE);
  const c = CH[4], lz = c.cz - HINGE[2], lx = c.cx - HINGE[0];
  const st = GB(), cu = GB(), dk = GB();
  st.cyl(lx, -0.025, lz, 0.42, 0.42, 0.05, 24, 'y', 'tb');
  cu.cyl(lx, 0.075, lz, 0.30, 0.30, 0.15, 24, 'y', 't');
  dk.cyl(lx, 0.156, lz, 0.12, 0.12, 0.012, 12, 'y', 't');
  dk.cyl(0, 0, 0, 0.03, 0.03, 0.38, 12, 'x', 'tb');
  dk.bx(-0.05, 0.05, -0.05, 0.02, -0.12, 0.0);
  put(g, 'serviceLid_plate', st, M.steel);
  put(g, 'serviceLid_copper', cu, M.copper);
  put(g, 'serviceLid_dark', dk, M.graphite);
  g.rotation.x = REVIEW.lidDeg * PI / 180;
}

function buildFrame(root, M) {
  const g = grp(root, 'frame');
  const gy = GB(), dk = GB();
  for (const c of CH) {
    dk.cyl(c.cx, 0.04, c.cz, 0.45, 0.45, 0.08, 16, 'y', 't');
    gy.cyl(c.cx, 0.47, c.cz, 0.41, 0.41, 0.78, 16, 'y', '');
    dk.cyl(c.cx, 0.88, c.cz, 0.45, 0.45, 0.04, 16, 'y', 't');
    fbx(gy, c.u, -0.22, 0.22, APO - 0.10, 1.13, 0.20, 0.80, 'kfbt');
  }
  gy.cyl(HC[0], 0.48, HC[1], HR, HR, 0.84, 8, 'y', '', PI / 8);
  dk.cyl(HC[0], 0.03, HC[1], HR + 0.02, HR + 0.02, 0.06, 8, 'y', 't', PI / 8);
  gy.bx(HC[0] + APO - 0.04, 0.60, 0.06, FLOOR_Y, -0.34, 0.34, 'lb');
  dk.bx(HC[0] + APO - 0.04, 0.60, 0, 0.06, -0.344, 0.344, 'lb');
  gy.bx(0.60, LL.x1, 0.06, FLOOR_Y, -0.60, 0.60, 'rb');
  dk.bx(0.60, LL.x1, 0, 0.06, -0.604, 0.604, 'rb');
  put(g, 'frame_body', gy, M.grey);
  put(g, 'frame_dark', dk, M.graphite);
}

function buildLod(root, M) {
  const g = grp(root, 'lod1');
  const wh = GB(), gy = GB(), st = GB(), ac = GB(), cu = GB();
  const e = 0.002, xf = XF - 0.004, xb = XF - EFEM_D, hw = EFEM_HW - 0.004;
  wh.bx(xb + e, xf - e, e, EFEM_H - e, -(hw - e), hw - e, 'b');
  ac.bx(xf - e, XF - e, 1.9, 2.0, -(EFEM_HW - e), EFEM_HW - e, 'l');
  ac.bx(xb + e, xf - e, 1.9, 2.0, hw - e, EFEM_HW - e, 'kr');
  ac.bx(xb + e, xf - e, 1.9, 2.0, -(EFEM_HW - e), -(hw - e), 'fr');
  for (const zc of FANS) wh.bx(xb + 0.04 + e, xf - 0.04 - e, EFEM_H - e, EFEM_H + FAN_H - 0.005 - e, zc - FAN_HW + e, zc + FAN_HW - e, 'b');
  for (const zc of LL.zs) gy.bx(LL.x0 + e, LL.x1 - e, LL.y0, LL.y1 - e, zc - 0.27 + e, zc + 0.27 - e, 'b');
  gy.bx(0.60 + e, LL.x1 - e, e, FLOOR_Y, -(0.60 - e), 0.60 - e, 'br');
  gy.bx(HC[0] + APO - 0.04, 0.60, e, FLOOR_Y, -0.34 + e, 0.34 - e, 'bl');
  gy.cyl(HC[0], (FLOOR_Y + e) / 2, HC[1], 0.797, 0.797, FLOOR_Y - e, 8, 'y', '', PI / 8);
  st.cyl(HC[0], (FLOOR_Y + TOP_Y - e) / 2, HC[1], 0.797, 0.797, TOP_Y - e - FLOOR_Y, 8, 'y', 't', PI / 8);
  st.bx(HC[0] + APO - 0.04, 0.60, FLOOR_Y, TOP_Y - e, -0.34 + e, 0.34 - e, 'lb');
  st.bx(0.60, LL.x0 - e, FLOOR_Y, TOP_Y - e, -(0.60 - e), 0.60 - e, 'rb');
  for (const c of CH) {
    gy.cyl(c.cx, (FLOOR_Y + e) / 2, c.cz, 0.399, 0.399, FLOOR_Y - e, 8, 'y', '');
    st.cyl(c.cx, (FLOOR_Y + LID_Y - e) / 2, c.cz, 0.394, 0.394, LID_Y - e - FLOOR_Y, 8, 'y', 't');
    cu.cyl(c.cx, (LID_Y - e + LID_Y + 0.15 - e) / 2, c.cz, 0.2954, 0.2954, 0.15, 8, 'y', 't');
  }
  put(g, 'lod1_white', wh, M.white);
  put(g, 'lod1_grey', gy, M.grey);
  put(g, 'lod1_steel', st, M.steel);
  put(g, 'lod1_accent', ac, M.accent);
  put(g, 'lod1_copper', cu, M.copper);
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
    buildEfem(root, M, { xf: XF, depth: EFEM_D, hw: EFEM_HW, h: EFEM_H, fanH: FAN_H, fans: FANS, fanHW: FAN_HW });
    buildLoadLocks(root, M, LL);
    buildHub(root, M);
    const robot = buildRobotPvd(root, M);
    robot.rotation.y = REVIEW.robotDeg * PI / 180;
    robot.getObjectByName('robotBlade').position.x = REVIEW.bladeX;
    buildChambers(root, M);
    buildLid(root, M);
    buildFrame(root, M);
    LP.zs.forEach((z, i) => grp(root, 'lp' + (i + 1), [LP.x, 0, z]));
    grp(root, 'signalTowerMount', [2.35, 2.8, 1.9]);
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
  const root = createRoot('pvd-cluster-tool');
  const M = makeMaterials('accent-deposition', 0xC9892B);
  M.copper = gameMaterial(0xB8733D, { flatShading: false, roughness: 0.35, metalness: 1.0 });
  M.copper.name = 'copper';
  const N = REVIEW.row;
  for (let i = 0; i < N; i++) buildTool(N > 1 ? grp(root, 'tool' + i, [0, 0, (i - (N - 1) / 2) * REVIEW.pitch]) : root, M);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  if (REVIEW.row > 1) return [];
  const k = robotClipKeys(45, -45);
  return [
    createClip('RobotTransfer', 4, [
      rotationTrack('transferRobot', k.rot.map((e) => ({ time: e[0], rotation: [0, e[1], 0] }))),
      positionTrack('robotBlade', k.blade.map((e) => ({ time: e[0], position: [-e[1], 0, 0] }))),
    ]),
    createClip('LidOpen', 3, [rotationTrack('serviceLid', lidClipKeys(true).map((e) => ({ time: e[0], rotation: [e[1], 0, 0] })))]),
    createClip('LidClose', 3, [rotationTrack('serviceLid', lidClipKeys(false).map((e) => ({ time: e[0], rotation: [e[1], 0, 0] })))]),
  ];
}
