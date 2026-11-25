const meta = { name: 'lagoon-curved-viaduct', role: 'building' };

// ============================================================================
// Lagoon Sanctuary V2 — ONE Seamless Continuous Curved Mayan Limestone Viaduct
// World-space asset: plugs into Holodeck at position [0,0,0], rotation [0,0,0], scale [1,1,1]
// Total arc length: 37.2176 m, smooth S-curve rise from Y = -0.600 m (u=0) to Y = +0.500 m (u=1)
//   - Start (u=0): flush with arrival-stair-terrace-v2 X=+4.80, Y=-0.60, Z=-0.90 (ZERO extension past u=0!)
//   - End   (u=1): flush with sanctuary-wing-left west face (ZERO extension past u=1!), framed by twin
//                  carved abutment entrance pilasters at s = ±1.35 (top y + 0.85 m) across u = 0.985..1.000
//   - Walkable Deck: s in [-1.20, +1.20] (2.40 m clear), smooth curved weathered flagstones along y(u)
//   - +s Lagoon Parapet: s in [+1.20, +1.50], height y(u)+0.68 m, open at u=0.36..0.44 into brazier alcove
//   - -s Cliff Kerb: s in [-1.50, -1.20], height y(u)+0.22 m (matches arrival -Z kerb -0.38 m dead-flush!)
//   - 7 Tapered Deep Piers extending down to Y = -5.40 m with stepped damp waterline plinths around Y = -2.20 m
//   - 6 Curved Vaulted Masonry Arches (crowns at y(u)-0.42 m, springing Y=-3.40 m, closed solid undersides,
//     projecting stone voussoir trim rings on BOTH +s and -s elevations)
//   - Semicircular Cantilevered Brazier Alcove at u = 0.40 ([-11.1527, -0.2128, -25.5812]), dead-flat floor
//     at exact Y = -0.210 m, stepped corbelled masonry bracket tapering down into Pier 3 / waterline (-2.85 m)
// Shared Materials: LimestoneWeathered, CarvedReliefGrout, DampLowerMasonry, VelvetStoneMoss (4 draws total).
// ZERO FLUSH_FACES. ZERO water geometry.
// ============================================================================

// EXACT SPLINE MATHEMATICS (VERBATIM FROM BRIEF)
const P_START = [-4.4209, -0.6000, -11.7728]; // Flush center of arrival-stair-terrace X=+4.80, Y=-0.60, Z=-0.90
const T_START = [-0.2499,  0.0000,  -0.9683]; // Arrival local +X unit tangent
const P_MID   = [-12.0000, 0.0000, -29.5000]; // Scenic bend midpoint hugging shaded left bank
const T_MID   = [-0.0800,  0.0000,  -0.9968]; // Midpoint unit tangent
const P_END   = [-3.8403,  0.5000, -41.9528]; // Exact flush outer west face of sanctuary-wing-left (local X=0, Y=0, Z=+2.90)
const T_END   = [ 0.9820,  0.0000,   0.1886]; // Exact sanctuary-wing-left entering tangent (local -Z aisle)

const SEG1 = [
  P_START,
  [P_START[0] + 6.5 * T_START[0], 0, P_START[2] + 6.5 * T_START[2]],
  [P_MID[0]   - 7.0 * T_MID[0],   0, P_MID[2]   - 7.0 * T_MID[2]],
  P_MID,
];
const SEG2 = [
  P_MID,
  [P_MID[0] + 8.2 * T_MID[0], 0, P_MID[2] + 8.2 * T_MID[2]],
  [P_END[0] - 6.5 * T_END[0], 0, P_END[2] - 6.5 * T_END[2]],
  P_END,
];

function evalViaduct(u) {
  const uc = Math.max(0, Math.min(1, u));
  const seg = uc <= 0.5 ? SEG1 : SEG2;
  const t = uc <= 0.5 ? uc * 2 : (uc - 0.5) * 2;
  const o = 1 - t;
  const x = o*o*o*seg[0][0] + 3*o*o*t*seg[1][0] + 3*o*t*t*seg[2][0] + t*t*t*seg[3][0];
  const z = o*o*o*seg[0][2] + 3*o*o*t*seg[1][2] + 3*o*t*t*seg[2][2] + t*t*t*seg[3][2];
  const tx = 3*o*o*(seg[1][0]-seg[0][0]) + 6*o*t*(seg[2][0]-seg[1][0]) + 3*t*t*(seg[3][0]-seg[2][0]);
  const tz = 3*o*o*(seg[1][2]-seg[0][2]) + 6*o*t*(seg[2][2]-seg[1][2]) + 3*t*t*(seg[3][2]-seg[2][2]);
  const len = Math.hypot(tx, tz) || 1;
  const dirX = tx / len, dirZ = tz / len;
  const rightX = -dirZ, rightZ = dirX;
  const sy = uc * uc * (3 - 2 * uc);
  const y = -0.60 + 1.10 * sy;
  return { x, y, z, dirX, dirZ, rightX, rightZ };
}

function buildArcTable(samples) {
  const N = samples || 1200;
  const arc = new Float64Array(N + 1);
  let prev = evalViaduct(0);
  for (let i = 1; i <= N; i++) {
    const p = evalViaduct(i / N);
    arc[i] = arc[i - 1] + Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  const totalL = arc[N];
  function uAtArc(sTarget) {
    if (sTarget <= 0) return 0;
    if (sTarget >= totalL) return 1;
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < sTarget) lo = mid + 1;
      else hi = mid;
    }
    const f = (sTarget - arc[lo - 1]) / (arc[lo] - arc[lo - 1] || 1);
    return (lo - 1 + f) / N;
  }
  function arcAtU(u) {
    const uc = Math.max(0, Math.min(1, u));
    const idx = uc * N;
    const i0 = Math.floor(idx);
    const i1 = Math.min(N, i0 + 1);
    const frac = idx - i0;
    return arc[i0] * (1 - frac) + arc[i1] * frac;
  }
  return { arc, totalL, uAtArc, arcAtU };
}

function rockNoise3(x, y, z, seedOffset) {
  const s = seedOffset || 0;
  const n1 = Math.sin(x * 7.3 + y * 5.1 + s) * Math.cos(z * 6.7 - y * 4.3 + s * 1.7);
  const n2 = Math.sin(x * 17.9 - z * 14.3 + y * 11.7 + s * 2.3) * 0.5;
  const n3 = Math.cos(x * 31.1 + y * 27.7 + z * 23.9 - s * 0.9) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

// Strict end-plane clamping ensures ZERO geometry ever juts past u=0 or u=1!
const T_START_LEN = Math.hypot(T_START[0], T_START[2]) || 1;
const TS_X = T_START[0] / T_START_LEN, TS_Z = T_START[2] / T_START_LEN;
const T_END_LEN = Math.hypot(T_END[0], T_END[2]) || 1;
const TE_X = T_END[0] / T_END_LEN, TE_Z = T_END[2] / T_END_LEN;

function clampEndPlanes(pt, uHint, minEndInset) {
  let x = pt[0], y = pt[1], z = pt[2];
  const inset = minEndInset || 0;
  if (uHint < 0.08) {
    const d0 = (x - P_START[0]) * TS_X + (z - P_START[2]) * TS_Z;
    if (d0 < inset) {
      x += (inset - d0) * TS_X;
      z += (inset - d0) * TS_Z;
    }
  }
  if (uHint > 0.92) {
    const d1 = (x - P_END[0]) * TE_X + (z - P_END[2]) * TE_Z;
    if (d1 > -inset) {
      x -= (d1 + inset) * TE_X;
      z -= (d1 + inset) * TE_Z;
    }
  }
  return [x, y, z];
}

// ============================================================================
// SWEPT CLOSED-SECTION CURVED SOLID BUILDER
// rings: array of { pts: [[x,y,z], ...] } all with same count M (CCW in (s,y)!)
// Outward CCW winding verified for right-handed (T, U, R).
// ============================================================================
function buildSweptSolid(rings, opts) {
  const o = opts || {};
  const capStart = o.capStart !== false;
  const capEnd = o.capEnd !== false;
  const numRings = rings.length;
  const M = rings[0].pts.length;
  const positions = [];

  const pushTri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const pushQuad = (a, b, c, d) => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  for (let i = 0; i < numRings - 1; i++) {
    const r0 = rings[i].pts;
    const r1 = rings[i + 1].pts;
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      pushQuad(r0[k], r1[k], r1[kn], r0[kn]);
    }
  }

  if (capStart && M >= 3) {
    const r0 = rings[0].pts;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < M; k++) { cx += r0[k][0]; cy += r0[k][1]; cz += r0[k][2]; }
    const ctr = [cx / M, cy / M, cz / M];
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      pushTri(ctr, r0[k], r0[kn]);
    }
  }

  if (capEnd && M >= 3) {
    const rL = rings[numRings - 1].pts;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < M; k++) { cx += rL[k][0]; cy += rL[k][1]; cz += rL[k][2]; }
    const ctr = [cx / M, cy / M, cz / M];
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      pushTri(ctr, rL[kn], rL[k]);
    }
  }

  const raw = meshGeo({ positions });
  const uvGeo = projectUV(raw, {
    projection: 'box',
    metersPerUnit: o.metersPerUnit || 1.25,
    frame: { origin: [o.uvOffsetX || 0, o.uvOffsetY || 0, o.uvOffsetZ || 0] },
  });
  return creaseNormals(uvGeo, { angle: o.creaseAngle != null ? o.creaseAngle : 44 });
}

function buildViaductSweep(uList, profileFn, opts) {
  const o = opts || {};
  const erode = o.erode || 0.0;
  const seed = o.seed || 17;
  const endInset = o.endInset || 0.0;
  const rings = [];
  for (let i = 0; i < uList.length; i++) {
    const u = uList[i];
    const f = evalViaduct(u);
    const prof = profileFn(f, u, i);
    const isEnd = (i === 0 && u <= 0.002) || (i === uList.length - 1 && u >= 0.998);
    const pts = [];
    for (let k = 0; k < prof.length; k++) {
      const s = prof[k][0];
      const y = prof[k][1];
      let px = f.x + s * f.rightX;
      let py = y;
      let pz = f.z + s * f.rightZ;
      if (erode > 0 && !isEnd) {
        const n = rockNoise3(px * 0.8, py * 0.8, pz * 0.8, seed + k * 7);
        px += f.rightX * n * erode;
        pz += f.rightZ * n * erode;
        if (!o.flatTop || k < prof.length - 2) {
          py += n * erode * 0.45;
        }
      }
      pts.push(clampEndPlanes([px, py, pz], u, endInset));
    }
    rings.push({ pts });
  }
  return buildSweptSolid(rings, o);
}

// Single curved beveled flagstone slab strictly following evalViaduct(u)
function buildCurvedFlagstone(arcTbl, arc0, arc1, s0, s1, dyTop, thick, seed) {
  const bev = 0.013;
  const uA = arcTbl.uAtArc(arc0);
  const uB = arcTbl.uAtArc(arc1);
  const uMid = arcTbl.uAtArc((arc0 + arc1) * 0.5);
  const isStart = arc0 <= 0.002;
  const isEnd = arc1 >= arcTbl.totalL - 0.002;
  const uList = [uA, uMid, uB];
  const rings = [];

  for (let i = 0; i < uList.length; i++) {
    const u = uList[i];
    const f = evalViaduct(u);
    const yT = f.y + dyTop;
    const yB = f.y - thick;
    const endBevel = (i === 0 && !isStart) || (i === 2 && !isEnd);
    const topDrop = endBevel ? bev * 0.55 : 0;
    const sIn = endBevel ? bev * 0.35 : 0;
    const prof = [
      [s0 + sIn,         yB],
      [s1 - sIn,         yB],
      [s1 - sIn,         yT - bev],
      [s1 - bev - sIn,   yT - topDrop],
      [s0 + bev + sIn,   yT - topDrop],
      [s0 + sIn,         yT - bev],
    ];
    const pts = [];
    for (let k = 0; k < prof.length; k++) {
      let px = f.x + prof[k][0] * f.rightX;
      let py = prof[k][1];
      let pz = f.z + prof[k][0] * f.rightZ;
      if (!(i === 0 && isStart) && !(i === 2 && isEnd)) {
        const n = rockNoise3(px * 2.2, py * 2.2, pz * 2.2, seed + k);
        px += f.rightX * n * 0.003;
        pz += f.rightZ * n * 0.003;
        py += (k === 3 || k === 4) ? n * 0.0018 : n * 0.003;
      }
      pts.push(clampEndPlanes([px, py, pz], u, 0));
    }
    rings.push({ pts });
  }
  return buildSweptSolid(rings, {
    metersPerUnit: 1.05,
    uvOffsetX: (arc0 + arc1) * 0.35,
    uvOffsetZ: (s0 + s1) * 0.35,
    creaseAngle: 42,
  });
}

function buildWeatheredBlock(w, h, d, opts) {
  const o = opts || {};
  const sx = o.sx || 2;
  const sy = o.sy || 2;
  const sz = o.sz || 2;
  const bevel = Math.min(o.bevel != null ? o.bevel : 0.015, Math.min(w, h, d) * 0.35);
  const erode = o.erode != null ? o.erode : 0.006;
  const seed = o.seed || 11;
  const taperTopX = o.taperTopX != null ? o.taperTopX : 1.0;
  const taperTopZ = o.taperTopZ != null ? o.taperTopZ : 1.0;

  const baseGeo = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const pos = baseGeo.attributes.position;
  const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (taperTopX !== 1.0 || taperTopZ !== 1.0) {
      const ty = (y + hh) / h;
      x *= 1.0 + (taperTopX - 1.0) * ty;
      z *= 1.0 + (taperTopZ - 1.0) * ty;
    }
    const dx = Math.max(0, Math.abs(x) - (hw - bevel));
    const dy = Math.max(0, Math.abs(y) - (hh - bevel));
    const dz = Math.max(0, Math.abs(z) - (hd - bevel));
    const edgeSum = (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0) + (dz > 0 ? 1 : 0);
    if (edgeSum >= 2 && bevel > 0) {
      const pull = bevel * 0.36;
      const fx = dx / bevel, fy = dy / bevel, fz = dz / bevel;
      if (dx > 0 && dy > 0) { const c = fx * fy * pull; x -= Math.sign(x) * c; y -= Math.sign(y) * c; }
      if (dy > 0 && dz > 0) { const c = fy * fz * pull; y -= Math.sign(y) * c; z -= Math.sign(z) * c; }
      if (dx > 0 && dz > 0) { const c = fx * fz * pull; x -= Math.sign(x) * c; z -= Math.sign(z) * c; }
    }
    if (erode > 0) {
      const nx = rockNoise3(x + 1.3, y - 0.7, z + 2.1, seed);
      const ny = rockNoise3(x - 2.1, y + 1.9, z - 0.4, seed + 17);
      const nz = rockNoise3(x + 0.5, y + 2.7, z - 1.8, seed + 37);
      x += nx * erode; y += ny * erode * 0.5; z += nz * erode;
    }
    if (o.clampBounds) {
      x = Math.max(-hw, Math.min(hw, x));
      y = Math.max(-hh, Math.min(hh, y));
      z = Math.max(-hd, Math.min(hd, z));
    }
    pos.setXYZ(i, x, y, z);
  }
  const uvGeo = projectUV(baseGeo, {
    projection: 'box',
    metersPerUnit: o.metersPerUnit || 1.15,
    frame: { origin: [o.uvOffsetX || 0, o.uvOffsetY || 0, o.uvOffsetZ || 0] },
  });
  return creaseNormals(uvGeo, { angle: o.creaseAngle || 48 });
}

function placeInFrame(geo, f, dFwd, dY, dRight, uHint, minEndInset) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position;
  const norm = g.attributes.normal;
  const ox = f.x + dFwd * f.dirX + dRight * f.rightX;
  const oy = dY;
  const oz = f.z + dFwd * f.dirZ + dRight * f.rightZ;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
    let wx = ox + lx * f.dirX + lz * f.rightX;
    let wy = oy + ly;
    let wz = oz + lx * f.dirZ + lz * f.rightZ;
    if (uHint != null) {
      const cl = clampEndPlanes([wx, wy, wz], uHint, minEndInset || 0);
      wx = cl[0]; wy = cl[1]; wz = cl[2];
    }
    pos.setXYZ(i, wx, wy, wz);
    if (norm) {
      const nlx = norm.getX(i), nly = norm.getY(i), nlz = norm.getZ(i);
      const nwx = nlx * f.dirX + nlz * f.rightX;
      const nwz = nlx * f.dirZ + nlz * f.rightZ;
      const nlen = Math.hypot(nwx, nly, nwz) || 1;
      norm.setXYZ(i, nwx / nlen, nly / nlen, nwz / nlen);
    }
  }
  return g;
}

function buildArcSectorSolid(cx, cz, dirX, dirZ, rightX, rightZ, rIn, rOut, yBot, yTop, ang0, ang1, segs, opts) {
  const o = opts || {};
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const a = ang0 + (ang1 - ang0) * (i / segs);
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = ca * rightX + sa * dirX;
    const rz = ca * rightZ + sa * dirZ;
    let pts;
    if (o.bevelTop && (rOut - rIn) > 0.05) {
      const b = o.bevelTop;
      pts = [
        [cx + rIn * rx,          yBot,     cz + rIn * rz],
        [cx + rOut * rx,         yBot,     cz + rOut * rz],
        [cx + rOut * rx,         yTop - b, cz + rOut * rz],
        [cx + (rOut - b) * rx,   yTop,     cz + (rOut - b) * rz],
        [cx + (rIn + b) * rx,    yTop,     cz + (rIn + b) * rz],
        [cx + rIn * rx,          yTop - b, cz + rIn * rz],
      ];
    } else {
      pts = [
        [cx + rIn * rx,  yBot, cz + rIn * rz],
        [cx + rOut * rx, yBot, cz + rOut * rz],
        [cx + rOut * rx, yTop, cz + rOut * rz],
        [cx + rIn * rx,  yTop, cz + rIn * rz],
      ];
    }
    rings.push({ pts });
  }
  return buildSweptSolid(rings, {
    metersPerUnit: o.metersPerUnit || 1.15,
    creaseAngle: o.creaseAngle != null ? o.creaseAngle : 44,
  });
}

function buildSemicircleSlab(cx, cz, dirX, dirZ, rightX, rightZ, rOut, yBot, yTop, segs, opts) {
  const o = opts || {};
  const positions = [];
  const pushTri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const pushQuad = (a, b, c, d) => { pushTri(a, b, c); pushTri(a, c, d); };

  const rimBot = [];
  const rimTop = [];
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI * 0.5 + Math.PI * (i / segs);
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = ca * rightX + sa * dirX;
    const rz = ca * rightZ + sa * dirZ;
    rimBot.push([cx + rOut * rx, yBot, cz + rOut * rz]);
    rimTop.push([cx + rOut * rx, yTop, cz + rOut * rz]);
  }
  const cBot = [cx, yBot, cz];
  const cTop = [cx, yTop, cz];

  for (let i = 0; i < segs; i++) {
    pushTri(cTop, rimTop[i], rimTop[i + 1]);
    pushTri(cBot, rimBot[i + 1], rimBot[i]);
    pushQuad(rimBot[i], rimBot[i + 1], rimTop[i + 1], rimTop[i]);
  }
  pushQuad(rimBot[segs], rimBot[0], rimTop[0], rimTop[segs]);

  const raw = meshGeo({ positions });
  const uvGeo = projectUV(raw, { projection: 'box', metersPerUnit: o.metersPerUnit || 1.15 });
  return creaseNormals(uvGeo, { angle: o.creaseAngle != null ? o.creaseAngle : 46 });
}

function buildMossCushion(rx, ry, rz, seed, opts) {
  const o = opts || {};
  const wSeg = o.wSeg || 8;
  const hSeg = o.hSeg || 5;
  const drape = o.drape || 0.0;
  const baseGeo = new THREE.SphereGeometry(1, wSeg, hSeg);
  const pos = baseGeo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < 0) y *= 0.25;
    else y = Math.pow(y, 0.78);
    const rHoriz = Math.hypot(x, z);
    const n1 = rockNoise3(x * 1.8, y * 1.5, z * 1.8, seed);
    const n2 = rockNoise3(x * 4.2, y * 3.6, z * 4.2, seed + 53) * 0.42;
    const lump = 1.0 + (n1 * 0.22 + n2 * 0.14);
    let px = x * rx * lump;
    let py = y * ry * (1.0 + n1 * 0.24 + n2 * 0.15);
    let pz = z * rz * lump;
    if (drape > 0 && rHoriz > 0.65 && y <= 0.15) {
      py -= drape * Math.pow((rHoriz - 0.65) / 0.35, 1.5) * (0.7 + 0.3 * Math.max(0, n1));
    }
    pos.setXYZ(i, px, py, pz);
  }
  const uvGeo = projectUV(baseGeo, { projection: 'box', metersPerUnit: 0.45 });
  return creaseNormals(uvGeo, { angle: 85 });
}

function mergeEntries(entries) {
  let totalVerts = 0;
  const prepared = [];
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vPos = new THREE.Vector3();
  const vSc = new THREE.Vector3();
  const nMat = new THREE.Matrix3();
  const vTmp = new THREE.Vector3();
  const nTmp = new THREE.Vector3();

  for (let i = 0; i < entries.length; i++) {
    const ent = entries[i];
    const g = ent.geo.index ? ent.geo.toNonIndexed() : ent.geo;
    const count = g.attributes.position.count;
    totalVerts += count;
    prepared.push({ ent, g, count });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  let vOffset = 0;
  for (let i = 0; i < prepared.length; i++) {
    const { ent, g, count } = prepared[i];
    const p = ent.pos || [0, 0, 0];
    const r = ent.rot || [0, 0, 0];
    const s = ent.scale || [1, 1, 1];
    vPos.set(p[0], p[1], p[2]);
    eul.set((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180, 'XYZ');
    q.setFromEuler(eul);
    vSc.set(s[0], s[1], s[2]);
    mat4.compose(vPos, q, vSc);
    nMat.getNormalMatrix(mat4);

    const posAttr = g.attributes.position;
    const normAttr = g.attributes.normal;
    const uvAttr = g.attributes.uv;
    const baseCol = ent.color || [1, 1, 1];

    for (let j = 0; j < count; j++) {
      vTmp.set(posAttr.getX(j), posAttr.getY(j), posAttr.getZ(j)).applyMatrix4(mat4);
      if (normAttr) {
        nTmp.set(normAttr.getX(j), normAttr.getY(j), normAttr.getZ(j)).applyMatrix3(nMat).normalize();
      } else {
        nTmp.set(0, 1, 0);
      }

      const idx3 = (vOffset + j) * 3;
      const idx2 = (vOffset + j) * 2;
      positions[idx3] = vTmp.x;
      positions[idx3 + 1] = vTmp.y;
      positions[idx3 + 2] = vTmp.z;
      normals[idx3] = nTmp.x;
      normals[idx3 + 1] = nTmp.y;
      normals[idx3 + 2] = nTmp.z;
      if (uvAttr) {
        uvs[idx2] = uvAttr.getX(j);
        uvs[idx2 + 1] = uvAttr.getY(j);
      }

      let cr = baseCol[0], cg = baseCol[1], cb = baseCol[2];
      if (ent.colorFn) {
        const mod = ent.colorFn(vTmp.x, vTmp.y, vTmp.z, nTmp.x, nTmp.y, nTmp.z);
        cr *= mod[0]; cg *= mod[1]; cb *= mod[2];
      }
      colors[idx3] = Math.max(0.05, Math.min(1.0, cr));
      colors[idx3 + 1] = Math.max(0.05, Math.min(1.0, cg));
      colors[idx3 + 2] = Math.max(0.05, Math.min(1.0, cb));
    }
    vOffset += count;
  }

  const out = meshGeo({
    positions: Array.from(positions),
    normals: Array.from(normals),
    uvs: Array.from(uvs),
  });
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

// EXACT 4 SHARED SANCTUARY MATERIALS (identical recipes to arrival-stair-terrace!)
function createSanctuaryMaterials() {
  const packedMR = (roughByte) => (255 << 16) | (roughByte << 8);

  const stoneBeds = { cellsX: 5, cellsY: 9, seed: 41, jitterX: 0.72, jitterY: 0.34, metricY: 1.75, weight: 0.22 };
  const stoneFacets = { ...stoneBeds, feature: 'facet', facetSlope: 0.55, facetBlend: 0.32 };
  const stoneCracks = { ...stoneBeds, feature: 'border', borderOpen: 0.42, borderWidth: 0.030, blend: 'multiply' };

  const limestoneAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LimestoneWeatheredAlbedo',
    layers: [
      { op: 'cellular', ...stoneBeds, feature: 'cell', colorA: 0xb5ab94, colorB: 0xd0c6ae },
      { op: 'noise', colorA: 0x9c927d, colorB: 0xddd4be, scale: 18, octaves: 5, seed: 42, blend: 'overlay', opacity: 0.44 },
      { op: 'noise', colorA: 0x827966, colorB: 0xede6d5, scale: 48, octaves: 4, seed: 43, blend: 'overlay', opacity: 0.28 },
      { op: 'cellular', ...stoneFacets, colorA: 0xb8b0a0, colorB: 0xffffff, blend: 'multiply', opacity: 0.26 },
      { op: 'cellular', ...stoneCracks, colorA: 0xffffff, colorB: 0x6f6757, opacity: 0.65 },
    ],
  });
  const limestoneHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LimestoneWeatheredHeight',
    layers: [
      { op: 'cellular', ...stoneFacets, colorA: 0x555555, colorB: 0xe6e6e6 },
      { op: 'noise', colorA: 0x404040, colorB: 0xd8d8d8, scale: 26, octaves: 5, seed: 42, blend: 'overlay', opacity: 0.55 },
      { op: 'cellular', ...stoneCracks, colorA: 0xffffff, colorB: 0x101010 },
    ],
  });
  const limestoneMR = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'LimestoneWeatheredMR',
    layers: [
      { op: 'cellular', ...stoneBeds, feature: 'cell', colorA: packedMR(217), colorB: packedMR(235) },
      { op: 'noise', colorA: packedMR(214), colorB: packedMR(238), scale: 14, octaves: 3, seed: 44, blend: 'overlay', opacity: 0.35 },
    ],
  });
  const limestoneMat = pbrMaterial({
    albedo: limestoneAlbedo,
    normal: normalMapFromHeight(limestoneHeight, { strength: 4.5, name: 'LimestoneWeatheredNormal' }),
    metallicRoughness: limestoneMR,
    roughness: 1,
    metalness: 0,
    name: 'LimestoneWeathered',
  });
  limestoneMat.vertexColors = true;

  const groutAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'CarvedGroutAlbedo',
    layers: [
      { op: 'solid', color: 0x847b69 },
      { op: 'noise', colorA: 0x5d5648, colorB: 0xa29884, scale: 22, octaves: 5, seed: 61, blend: 'overlay', opacity: 0.52 },
      { op: 'cellular', cellsX: 8, cellsY: 8, seed: 62, jitterX: 0.85, jitterY: 0.85, feature: 'f2-f1', range: 0.35, colorA: 0x696152, colorB: 0x998f7c, blend: 'multiply', opacity: 0.42 },
    ],
  });
  const groutMat = pbrMaterial({
    albedo: groutAlbedo,
    normal: normalMapFromHeight(groutAlbedo, { strength: 5.0, name: 'CarvedGroutNormal' }),
    roughness: 0.90,
    metalness: 0,
    name: 'CarvedReliefGrout',
  });
  groutMat.vertexColors = true;

  const dampBeds = { cellsX: 6, cellsY: 10, seed: 71, jitterX: 0.75, jitterY: 0.35, metricY: 1.85, weight: 0.25 };
  const dampFacets = { ...dampBeds, feature: 'facet', facetSlope: 0.65, facetBlend: 0.28 };
  const dampCracks = { ...dampBeds, feature: 'border', borderOpen: 0.55, borderWidth: 0.035, blend: 'multiply' };
  const dampAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerMasonryAlbedo',
    layers: [
      { op: 'cellular', ...dampBeds, feature: 'cell', colorA: 0x626052, colorB: 0x7c796a },
      { op: 'noise', colorA: 0x4b4c40, colorB: 0x908c7a, scale: 16, octaves: 5, seed: 72, blend: 'overlay', opacity: 0.48 },
      { op: 'cellular', ...dampCracks, colorA: 0xffffff, colorB: 0x3b3a31, opacity: 0.72 },
    ],
  });
  const dampHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerMasonryHeight',
    layers: [
      { op: 'cellular', ...dampFacets, colorA: 0x454545, colorB: 0xdfdfdf },
      { op: 'noise', colorA: 0x383838, colorB: 0xd0d0d0, scale: 24, octaves: 4, seed: 73, blend: 'overlay', opacity: 0.5 },
      { op: 'cellular', ...dampCracks, colorA: 0xffffff, colorB: 0x101010 },
    ],
  });
  const dampMat = pbrMaterial({
    albedo: dampAlbedo,
    normal: normalMapFromHeight(dampHeight, { strength: 5.2, name: 'DampLowerMasonryNormal' }),
    roughness: 0.78,
    metalness: 0,
    name: 'DampLowerMasonry',
  });
  dampMat.vertexColors = true;

  const mossAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'VelvetMossAlbedo',
    layers: [
      { op: 'solid', color: 0x4a6e31 },
      { op: 'cellular', cellsX: 18, cellsY: 18, seed: 91, jitterX: 0.9, jitterY: 0.9, feature: 'f1', range: 0.85, colorA: 0x5c833c, colorB: 0x314e20, blend: 'overlay', opacity: 0.65 },
      { op: 'noise', colorA: 0x2c471d, colorB: 0x6f9449, scale: 36, octaves: 5, seed: 92, blend: 'overlay', opacity: 0.55 },
    ],
  });
  const mossMat = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossAlbedo, { strength: 6.5, name: 'VelvetMossNormal' }),
    roughness: 0.92,
    metalness: 0,
    name: 'VelvetStoneMoss',
  });
  mossMat.vertexColors = true;

  return { limestoneMat, groutMat, dampMat, mossMat };
}

async function build() {
  const root = createRoot('LagoonCurvedViaduct');
  const rng = seededRandom('lagoon-curved-viaduct-v2');
  const mats = createSanctuaryMaterials();
  const arcTbl = buildArcTable(1400);
  const L = arcTbl.totalL;

  const limestoneParts = [];
  const groutParts = [];
  const dampParts = [];
  const mossParts = [];

  const stoneTint = (tone, warm) => (x, y, z, nx, ny, nz) => {
    const up = ny > 0.35 ? 1.03 : (ny < -0.35 ? 0.78 : 0.95);
    const wb = warm || 0;
    // Smooth organic vertical damp weathering toward lagoon waterline Y = -2.10m
    const dampT = Math.max(0, Math.min(1, (-y - 1.00) / 1.45));
    const hFade = 1.0 - 0.24 * dampT;
    const oliveR = 1.0 - 0.06 * dampT;
    const oliveB = 0.97 - 0.05 * dampT;
    const nVar = 1.0 + rockNoise3(x * 0.25, y * 0.3, z * 0.25, 19) * 0.04;
    return [
      tone * up * hFade * oliveR * nVar * (1.0 + wb * 0.04),
      tone * up * hFade * nVar * (1.0 + wb * 0.01),
      tone * up * hFade * oliveB * nVar * (1.0 - wb * 0.03),
    ];
  };

  const dampTint = (tone) => (x, y, z, nx, ny, nz) => {
    const h = Math.max(0, Math.min(1, (y + 5.40) / 3.60));
    const downShade = ny < -0.3 ? 0.84 : 1.0;
    const v = tone * downShade * (0.68 + 0.34 * h);
    return [v * 0.95, v * 0.98, v * 0.91];
  };

  const mossTint = (tone) => (x, y, z, nx, ny, nz) => {
    const top = Math.max(0, Math.min(1, (ny + 0.35) / 1.35));
    return [
      tone * (0.68 + 0.44 * top),
      tone * (0.72 + 0.38 * top),
      tone * (0.64 + 0.32 * top),
    ];
  };

  function sampleArcU(arc0, arc1, steps) {
    const arr = [];
    for (let i = 0; i <= steps; i++) {
      arr.push(arcTbl.uAtArc(arc0 + (arc1 - arc0) * (i / steps)));
    }
    return arr;
  }

  // Exact 7 Pier Arc Stations:
  // Pier 0 (u=0.000) & Pier 6 (u=1.000) are flat-ended abutments strictly inside [0, L].
  // Pier 2 (1-based Pier 3, u=0.400, arc=15.406 m) sits DIRECTLY beneath the Semicircular Brazier Alcove!
  const arcAlcove = arcTbl.arcAtU(0.40);
  const arcAlcOpen0 = arcTbl.arcAtU(0.36);
  const arcAlcOpen1 = arcTbl.arcAtU(0.44);

  const piers = [
    { idx: 0, arc0: 0.00,                                      arc1: 0.90,                                      arcC: 0.00,                                      u: 0.000, isStart: true },
    { idx: 1, arc0: arcAlcove * 0.5 - 0.62,                    arc1: arcAlcove * 0.5 + 0.62,                    arcC: arcAlcove * 0.5,                           u: arcTbl.uAtArc(arcAlcove * 0.5) },
    { idx: 2, arc0: arcAlcove - 0.72,                          arc1: arcAlcove + 0.72,                          arcC: arcAlcove,                                 u: 0.400, isAlcove: true },
    { idx: 3, arc0: arcAlcove + (L - arcAlcove) * 0.25 - 0.56, arc1: arcAlcove + (L - arcAlcove) * 0.25 + 0.56, arcC: arcAlcove + (L - arcAlcove) * 0.25,        u: arcTbl.uAtArc(arcAlcove + (L - arcAlcove) * 0.25) },
    { idx: 4, arc0: arcAlcove + (L - arcAlcove) * 0.50 - 0.56, arc1: arcAlcove + (L - arcAlcove) * 0.50 + 0.56, arcC: arcAlcove + (L - arcAlcove) * 0.50,        u: arcTbl.uAtArc(arcAlcove + (L - arcAlcove) * 0.50) },
    { idx: 5, arc0: arcAlcove + (L - arcAlcove) * 0.75 - 0.56, arc1: arcAlcove + (L - arcAlcove) * 0.75 + 0.56, arcC: arcAlcove + (L - arcAlcove) * 0.75,        u: arcTbl.uAtArc(arcAlcove + (L - arcAlcove) * 0.75) },
    { idx: 6, arc0: L - 0.90,                                  arc1: L,                                         arcC: L,                                         u: 1.000, isEnd: true },
  ];

  // -------------------------------------------------------------------------
  // 1. CONTINUOUS CURVED WALKABLE DECK & OVERHANGING DECK CORNICE
  //    End-cap staggering (0..25mm) guarantees ZERO FLUSH_FACES on u=0 and u=1!
  // -------------------------------------------------------------------------
  const uGroutDeck = sampleArcU(0.028, L - 0.028, 64);
  const uCornice = sampleArcU(0.004, L - 0.004, 64);
  const uFasciaFull = sampleArcU(0.008, L - 0.008, 64);

  // Recessed dark mortar sub-deck tucked 2.8cm inside end planes so brown grout NEVER bleeds on u=0 / u=1!
  groutParts.push({
    geo: buildViaductSweep(uGroutDeck, (f) => [
      [-1.36, f.y - 0.160],
      [ 1.36, f.y - 0.160],
      [ 1.36, f.y - 0.022],
      [-1.36, f.y - 0.022],
    ], { metersPerUnit: 1.4 }),
    color: [0.76, 0.74, 0.70],
  });

  // Curved Running-Bond Weathered Flagstones across 48 longitudinal courses (strictly flush at u=0 and u=1!)
  const deckRng = rng.fork('curved-deck');
  const numCourses = 48;
  const courseLen = L / numCourses;
  for (let ic = 0; ic < numCourses; ic++) {
    const a0 = ic * courseLen;
    const a1 = (ic + 1) * courseLen;
    const gapA = 0.016;
    const sa0 = (ic === 0) ? 0.0 : (a0 + gapA * 0.5);
    const sa1 = (ic === numCourses - 1) ? L : (a1 - gapA * 0.5);

    const sSplits = (ic % 2 === 0)
      ? [-1.22, -0.44, 0.34, 1.22]
      : [-1.22, -0.68, 0.06, 0.74, 1.22];

    for (let iz = 0; iz < sSplits.length - 1; iz++) {
      const s0 = sSplits[iz] + 0.008;
      const s1 = sSplits[iz + 1] - 0.008;
      const dy = deckRng.range(-0.0035, 0.0035);
      const tone = deckRng.range(0.90, 1.06);
      const warm = deckRng.range(-0.6, 0.6);

      limestoneParts.push({
        geo: buildCurvedFlagstone(arcTbl, sa0, sa1, s0, s1, dy, 0.138, 100 + ic * 13 + iz),
        colorFn: stoneTint(tone, warm),
      });
    }
  }

  // Continuous Overhanging Beveled Limestone Deck Cornice (y - 0.30 .. y - 0.142, 4mm inside end planes -> 0 FLUSH_FACES!)
  limestoneParts.push({
    geo: buildViaductSweep(uCornice, (f) => [
      [-1.47, f.y - 0.300],
      [ 1.47, f.y - 0.300],
      [ 1.51, f.y - 0.255],
      [ 1.51, f.y - 0.142],
      [-1.51, f.y - 0.142],
      [-1.51, f.y - 0.255],
    ], { metersPerUnit: 1.35, erode: 0.004, seed: 205, endInset: 0.004 }),
    colorFn: stoneTint(0.92, -0.08),
  });

  // Outer edge fascia strips under -s cliff kerb & +s parapet (8mm inside end planes -> 0 FLUSH_FACES!)
  limestoneParts.push({
    geo: buildViaductSweep(uFasciaFull, (f) => [
      [-1.495, f.y - 0.146],
      [-1.210, f.y - 0.146],
      [-1.210, f.y - 0.016],
      [-1.495, f.y - 0.016],
    ], { metersPerUnit: 1.25, endInset: 0.008 }),
    colorFn: stoneTint(0.94, -0.05),
  });
  const uFasciaA = sampleArcU(0.008, arcAlcOpen0, 24);
  const uFasciaB = sampleArcU(arcAlcOpen1, L - 0.008, 36);
  for (let fi = 0; fi < 2; fi++) {
    const uf = fi === 0 ? uFasciaA : uFasciaB;
    limestoneParts.push({
      geo: buildViaductSweep(uf, (f) => [
        [1.210, f.y - 0.146],
        [1.495, f.y - 0.146],
        [1.495, f.y - 0.016],
        [1.210, f.y - 0.016],
      ], { metersPerUnit: 1.25, endInset: 0.008 }),
      colorFn: stoneTint(0.94, -0.05),
    });
  }

  // Carved Cornice Corbel Brackets along BOTH +s and -s elevations beneath cornice
  for (let spanIdx = 0; spanIdx < 6; spanIdx++) {
    const aStart = piers[spanIdx].arc1 + 0.30;
    const aEnd = piers[spanIdx + 1].arc0 - 0.30;
    const nCorbels = (spanIdx < 2) ? 4 : 3;
    for (let c = 0; c < nCorbels; c++) {
      const ca = aStart + (aEnd - aStart) * ((c + 0.5) / nCorbels);
      const u = arcTbl.uAtArc(ca);
      const f = evalViaduct(u);
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        if (sgn > 0 && Math.abs(ca - arcAlcove) < 1.75) continue;
        const cg = buildWeatheredBlock(0.24, 0.20, 0.17, {
          sx: 1, sy: 1, sz: 1, bevel: 0.014, erode: 0.005, seed: 240 + spanIdx * 11 + c * 2 + (sgn > 0 ? 1 : 0),
          taperTopX: 1.08, taperTopZ: 1.22, clampBounds: true,
        });
        limestoneParts.push({
          geo: placeInFrame(cg, f, 0, f.y - 0.39, sgn * 1.40, u, 0.01),
          colorFn: stoneTint(0.95 + (c % 2) * 0.03, 0.05),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. CLIFF-SIDE (-s) CONTINUOUS CURVED RETAINING KERB
  //    s in [-1.50, -1.20], height y(u) to y(u) + 0.22 m (exact -0.38 m at u=0!)
  //    Stops cleanly inside u=1 abutment entrance pilaster so ZERO FLUSH_FACES!
  // -------------------------------------------------------------------------
  const arcEndPil0 = arcTbl.arcAtU(0.985);
  const uKerb = sampleArcU(0.000, arcEndPil0 + 0.02, 62);
  limestoneParts.push({
    geo: buildViaductSweep(uKerb, (f) => [
      [-1.500, f.y - 0.014],
      [-1.200, f.y - 0.014],
      [-1.200, f.y + 0.195],
      [-1.222, f.y + 0.220],
      [-1.478, f.y + 0.220],
      [-1.500, f.y + 0.195],
    ], { metersPerUnit: 1.20, erode: 0.004, flatTop: true, seed: 300 }),
    colorFn: stoneTint(0.94, -0.10),
  });

  for (let k = 1; k < 22; k++) {
    const ka = (k / 22) * L;
    if (ka < 0.70 || ka > arcEndPil0 - 0.25) continue;
    const u = arcTbl.uAtArc(ka);
    const f = evalViaduct(u);
    const rib = buildWeatheredBlock(0.055, 0.214, 0.312, {
      sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.002, seed: 310 + k, clampBounds: true,
    });
    groutParts.push({
      geo: placeInFrame(rib, f, 0, f.y + 0.098, -1.35, u, 0.01),
      color: [0.78, 0.76, 0.72],
    });
  }

  // -------------------------------------------------------------------------
  // 3. LAGOON-SIDE (+s) CARVED STONE PARAPET WITH ALCOVE OPENING (u = 0.36..0.44)
  //    Starts cleanly inside Pier 0 start pilaster (arc=0.35) & ends inside Pier 6 entrance pilaster!
  //    Guarantees ZERO dark grout bleed & ZERO FLUSH_FACES on u=0 and u=1!
  // -------------------------------------------------------------------------
  const paraSegs = [
    { arc0: 0.34,        arc1: arcAlcOpen0 - 0.32, steps: 24, seed: 410 },
    { arc0: arcAlcOpen1 + 0.32, arc1: arcEndPil0 + 0.03, steps: 36, seed: 420 },
  ];
  for (let ps = 0; ps < paraSegs.length; ps++) {
    const seg = paraSegs[ps];
    const uSeg = sampleArcU(seg.arc0, seg.arc1, seg.steps);
    const uGroutSeg = sampleArcU(seg.arc0 + 0.02, seg.arc1 - 0.02, seg.steps);

    // Lower solid plinth rail (y - 0.016 .. y + 0.16, s in [1.20, 1.50])
    limestoneParts.push({
      geo: buildViaductSweep(uSeg, (f) => [
        [1.200, f.y - 0.016],
        [1.500, f.y - 0.016],
        [1.500, f.y + 0.160],
        [1.200, f.y + 0.160],
      ], { metersPerUnit: 1.25, seed: seg.seed + 1 }),
      colorFn: stoneTint(0.95, 0.05),
    });

    // Recessed dark carved grout core (y + 0.155 .. y + 0.555, s in [1.26, 1.44])
    groutParts.push({
      geo: buildViaductSweep(uGroutSeg, (f) => [
        [1.260, f.y + 0.155],
        [1.440, f.y + 0.155],
        [1.440, f.y + 0.555],
        [1.260, f.y + 0.555],
      ], { metersPerUnit: 1.20, seed: seg.seed + 2 }),
      color: [0.78, 0.76, 0.72],
    });

    // Overhanging beveled stone coping cap (y + 0.545 .. y + 0.680, s in [1.17, 1.53]) -> EXACT y + 0.68 m!
    limestoneParts.push({
      geo: buildViaductSweep(uSeg, (f) => [
        [1.175, f.y + 0.545],
        [1.525, f.y + 0.545],
        [1.530, f.y + 0.655],
        [1.508, f.y + 0.680],
        [1.192, f.y + 0.680],
        [1.170, f.y + 0.655],
      ], { metersPerUnit: 1.25, erode: 0.004, flatTop: true, seed: seg.seed + 3 }),
      colorFn: stoneTint(1.01, 0.15),
    });
  }

  // Helper: add a solid carved square parapet pier pilaster (staggered cap inset when flush at u=0!)
  function addParapetPilaster(arcMin, arcMax, sCenter, topOff, widthS, seed, isFlushStart) {
    const uShaft = sampleArcU(arcMin, arcMax, 2);
    const uCap = sampleArcU(isFlushStart ? arcMin + 0.004 : arcMin, arcMax, 2);
    const hw = widthS * 0.5;
    const capHw = hw + 0.025;
    limestoneParts.push({
      geo: buildViaductSweep(uShaft, (f) => [
        [sCenter - hw, f.y - 0.014],
        [sCenter + hw, f.y - 0.014],
        [sCenter + hw, f.y + topOff - 0.095],
        [sCenter - hw, f.y + topOff - 0.095],
      ], { metersPerUnit: 1.1, seed }),
      colorFn: stoneTint(0.98, 0.15),
    });
    limestoneParts.push({
      geo: buildViaductSweep(uCap, (f) => [
        [sCenter - capHw,        f.y + topOff - 0.105],
        [sCenter + capHw,        f.y + topOff - 0.105],
        [sCenter + capHw,        f.y + topOff - 0.018],
        [sCenter + capHw - 0.02, f.y + topOff],
        [sCenter - capHw + 0.02, f.y + topOff],
        [sCenter - capHw,        f.y + topOff - 0.018],
      ], { metersPerUnit: 1.1, seed: seed + 1, endInset: isFlushStart ? 0.004 : 0 }),
      colorFn: stoneTint(1.03, 0.18),
    });
  }

  const pilasterArcs = [
    { a0: 0.00,                 a1: 0.38,                 s: 1.35, h: 0.78, w: 0.34, sd: 450, start: true }, // Pier 0 Start (clean solid limestone u=0!)
    { a0: piers[1].arcC - 0.19, a1: piers[1].arcC + 0.19, s: 1.35, h: 0.78, w: 0.35, sd: 455 },
    { a0: arcAlcOpen0 - 0.36,   a1: arcAlcOpen0 + 0.02,   s: 1.35, h: 0.78, w: 0.36, sd: 460 },
    { a0: arcAlcOpen1 - 0.02,   a1: arcAlcOpen1 + 0.36,   s: 1.35, h: 0.78, w: 0.36, sd: 465 },
    { a0: piers[3].arcC - 0.19, a1: piers[3].arcC + 0.19, s: 1.35, h: 0.78, w: 0.35, sd: 470 },
    { a0: piers[4].arcC - 0.19, a1: piers[4].arcC + 0.19, s: 1.35, h: 0.78, w: 0.35, sd: 475 },
    { a0: piers[5].arcC - 0.19, a1: piers[5].arcC + 0.19, s: 1.35, h: 0.78, w: 0.35, sd: 480 },
  ];
  for (let p = 0; p < pilasterArcs.length; p++) {
    const pl = pilasterArcs[p];
    addParapetPilaster(pl.a0, pl.a1, pl.s, pl.h, pl.w, pl.sd, !!pl.start);
  }

  // Twin Carved Mayan Abutment Entrance Pilasters at u = 0.985..1.000 (s = +1.35 & s = -1.35, top y + 0.85 m!)
  // Clean solid limestone flat back face at u = 1.000 (grout core tucked 4cm inside -> ZERO dark bleed & ZERO FLUSH_FACES!)
  for (let side = -1; side <= 1; side += 2) {
    const sc = side * 1.35;
    const uPilPlinth = sampleArcU(arcEndPil0, L - 0.006, 2);
    const uPilGrout = sampleArcU(arcEndPil0 + 0.04, L - 0.045, 2);
    const uPilBackFace = sampleArcU(L - 0.06, L, 1); // solid clean limestone abutment face strictly on u=1!
    const uPilCap = sampleArcU(arcEndPil0, L - 0.003, 2);

    // Base plinth (y - 0.014 .. y + 0.18, s in [sc-0.145, sc+0.145])
    limestoneParts.push({
      geo: buildViaductSweep(uPilPlinth, (f) => [
        [sc - 0.145, f.y - 0.014],
        [sc + 0.145, f.y - 0.014],
        [sc + 0.145, f.y + 0.180],
        [sc - 0.145, f.y + 0.180],
      ], { metersPerUnit: 1.0, seed: 490 + side, endInset: 0.006 }),
      colorFn: stoneTint(0.96, 0.08),
    });
    // Solid clean limestone flush end slab on u = 1.000 (y - 0.012 .. y + 0.728)
    limestoneParts.push({
      geo: buildViaductSweep(uPilBackFace, (f) => [
        [sc - 0.140, f.y - 0.012],
        [sc + 0.140, f.y - 0.012],
        [sc + 0.140, f.y + 0.728],
        [sc - 0.140, f.y + 0.728],
      ], { metersPerUnit: 1.0, seed: 491 + side }),
      colorFn: stoneTint(0.98, 0.14),
    });
    // Recessed dark grout core strictly tucked inside the limestone frame (4.5cm away from u=1!)
    groutParts.push({
      geo: buildViaductSweep(uPilGrout, (f) => [
        [sc - 0.105, f.y + 0.175],
        [sc + 0.105, f.y + 0.175],
        [sc + 0.105, f.y + 0.730],
        [sc - 0.105, f.y + 0.730],
      ], { metersPerUnit: 1.0, seed: 492 + side, endInset: 0.045 }),
      color: [0.77, 0.75, 0.71],
    });
    // Sculpted pier front/back corner ribs + Mayan carved bosses on walkway & outer sides
    const uMidPil = (0.985 + 1.0) * 0.5;
    const fPil = evalViaduct(uMidPil);
    const pilLen = L - arcEndPil0;
    const cornerOffX = pilLen * 0.34;
    for (let cx = -1; cx <= 1; cx += 2) {
      for (let cz = -1; cz <= 1; cz += 2) {
        const rib = buildWeatheredBlock(0.11, 0.55, 0.082, {
          sx: 1, sy: 2, sz: 1, bevel: 0.008, erode: 0.003, seed: 494 + side * 3 + cx + cz, clampBounds: true,
        });
        limestoneParts.push({
          geo: placeInFrame(rib, fPil, cx * cornerOffX, fPil.y + 0.455, sc + cz * 0.098, uMidPil, 0.012),
          colorFn: stoneTint(1.00, 0.18),
        });
      }
    }
    for (let face = -1; face <= 1; face += 2) {
      const boss = buildWeatheredBlock(pilLen * 0.40, 0.28, 0.036, {
        sx: 1, sy: 1, sz: 1, bevel: 0.007, erode: 0.002, seed: 498 + side + face, clampBounds: true,
      });
      limestoneParts.push({
        geo: placeInFrame(boss, fPil, -0.02, fPil.y + 0.455, sc + face * 0.120, uMidPil, 0.03),
        colorFn: stoneTint(1.04, 0.25),
      });
    }
    // Overhanging beveled entrance pilaster cap (EXACT top y + 0.85 m, strictly inside s in [-1.50, +1.50]!)
    limestoneParts.push({
      geo: buildViaductSweep(uPilCap, (f) => [
        [sc - 0.150, f.y + 0.725],
        [sc + 0.150, f.y + 0.725],
        [sc + 0.150, f.y + 0.830],
        [sc + 0.130, f.y + 0.850],
        [sc - 0.130, f.y + 0.850],
        [sc - 0.150, f.y + 0.830],
      ], { metersPerUnit: 1.0, seed: 499 + side, endInset: 0.003 }),
      colorFn: stoneTint(1.03, 0.18),
    });
  }

  // Carved Mayan Step-Fret Relief Motifs along BOTH lagoon (+s) & walkway (-s) parapet faces
  const bayIntervals = [
    [0.44,                 piers[1].arcC - 0.24],
    [piers[1].arcC + 0.24, arcAlcOpen0 - 0.40],
    [arcAlcOpen1 + 0.40,   piers[3].arcC - 0.24],
    [piers[3].arcC + 0.24, piers[4].arcC - 0.24],
    [piers[4].arcC + 0.24, piers[5].arcC - 0.24],
    [piers[5].arcC + 0.24, arcEndPil0 - 0.08],
  ];
  for (let b = 0; b < bayIntervals.length; b++) {
    const [b0, b1] = bayIntervals[b];
    const span = b1 - b0;
    if (span < 0.60) continue;
    const nMotifs = Math.max(2, Math.round(span / 0.74));
    const stepA = span / nMotifs;
    for (let m = 0; m < nMotifs; m++) {
      const ma = b0 + stepA * (m + 0.5);
      const u = arcTbl.uAtArc(ma);
      const f = evalViaduct(u);
      const mw = Math.min(0.46, stepA * 0.74);
      for (let fz = -1; fz <= 1; fz += 2) {
        const sFace = 1.35 + fz * 0.106;
        const tab = buildWeatheredBlock(mw, 0.25, 0.044, {
          sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.002, seed: 510 + b * 23 + m * 3 + fz, clampBounds: true,
        });
        limestoneParts.push({
          geo: placeInFrame(tab, f, 0, f.y + 0.355, sFace, u, 0.02),
          colorFn: stoneTint(1.01, 0.18),
        });
        const eye = buildWeatheredBlock(mw * 0.56, 0.145, 0.020, {
          sx: 1, sy: 1, sz: 1, bevel: 0.003, erode: 0.001, seed: 520 + b * 23 + m * 3 + fz, clampBounds: true,
        });
        groutParts.push({
          geo: placeInFrame(eye, f, 0, f.y + 0.355, sFace + fz * 0.018, u, 0.02),
          color: [0.75, 0.73, 0.69],
        });
        const boss = buildWeatheredBlock(mw * 0.26, 0.075, 0.024, {
          sx: 1, sy: 1, sz: 1, bevel: 0.005, erode: 0.001, seed: 530 + b * 23 + m * 3 + fz, clampBounds: true,
        });
        limestoneParts.push({
          geo: placeInFrame(boss, f, 0, f.y + 0.355, sFace + fz * 0.025, u, 0.02),
          colorFn: stoneTint(1.05, 0.25),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. SEVEN STURDY TAPERED DAMP-MASONRY STONE PIERS (y(u)-0.16 down to Y = -5.40 m!)
  //    Clean non-overlapping vertical stratification at Y = -2.10m waterline -> ZERO FLUSH_FACES!
  // -------------------------------------------------------------------------
  for (let p = 0; p < piers.length; p++) {
    const pr = piers[p];
    const uPier = sampleArcU(pr.arc0, pr.arc1, 2);
    const a0Collar = pr.isStart ? 0.006 : Math.max(0, pr.arc0 - 0.06);
    const a1Collar = pr.isEnd ? (L - 0.006) : Math.min(L, pr.arc1 + 0.06);
    const uCollar = sampleArcU(a0Collar, a1Collar, 2);
    const a0Foot = pr.isStart ? 0.000 : Math.max(0, pr.arc0 - 0.14);
    const a1Foot = pr.isEnd ? L : Math.min(L, pr.arc1 + 0.14);
    const uFoot = sampleArcU(a0Foot, a1Foot, 2);

    // 4a. Upper Weathered Limestone Pier Shaft (Y = -2.10 .. f.y - 0.295, s in [-1.45, +1.45])
    // Strictly above waterline -2.10 and below cornice -0.295 -> ZERO coplanar end ties!
    limestoneParts.push({
      geo: buildViaductSweep(uPier, (f) => [
        [-1.45, -2.10],
        [ 1.45, -2.10],
        [ 1.45, f.y - 0.295],
        [-1.45, f.y - 0.295],
      ], { metersPerUnit: 1.3, erode: 0.006, seed: 600 + p * 10 }),
      colorFn: stoneTint(0.92 + (p % 2) * 0.03, -0.15),
    });

    // 4b. Stepped Damp Waterline Plinth Collar around Y = -2.20 m (Y = -2.38 .. -2.08, s in [-1.57, +1.57])
    // Inset 6mm from u=0 / u=1 end planes -> ZERO FLUSH_FACES!
    dampParts.push({
      geo: buildViaductSweep(uCollar, (f) => [
        [-1.57, -2.38],
        [ 1.57, -2.38],
        [ 1.57, -2.14],
        [ 1.52, -2.08],
        [-1.52, -2.08],
        [-1.57, -2.14],
      ], { metersPerUnit: 1.25, erode: 0.008, seed: 604 + p * 10, endInset: (pr.isStart || pr.isEnd) ? 0.006 : 0 }),
      colorFn: dampTint(0.99),
    });

    // 4c. Tapered Deep Submerged Damp Masonry Pier Shaft & Seabed Footing (Y = -5.40 .. -2.36!)
    // Strictly below -2.36 -> ZERO overlap with upper limestone shaft, roots deeply into seabed below -4.7 m!
    dampParts.push({
      geo: buildViaductSweep(uFoot, (f) => [
        [-1.70, -5.40],
        [ 1.70, -5.40],
        [ 1.54, -2.36],
        [-1.54, -2.36],
      ], { metersPerUnit: 1.45, erode: 0.010, seed: 606 + p * 10 }),
      colorFn: dampTint(0.95 + (p % 2) * 0.04),
    });

    // 4d. Sculpted Arch-Springing Impost Ledge at Y = -3.48 .. -3.20 (projecting s ± 1.66, 8mm inset at end planes!)
    const a0Imp = pr.isStart ? 0.008 : Math.max(0, pr.arc0 - 0.16);
    const a1Imp = pr.isEnd ? (L - 0.008) : Math.min(L, pr.arc1 + 0.16);
    const uImp = sampleArcU(a0Imp, a1Imp, 2);
    dampParts.push({
      geo: buildViaductSweep(uImp, (f) => [
        [-1.63, -3.48],
        [ 1.63, -3.48],
        [ 1.67, -3.40],
        [ 1.67, -3.20],
        [-1.67, -3.20],
        [-1.67, -3.40],
      ], { metersPerUnit: 1.25, erode: 0.006, seed: 608 + p * 10, endInset: (pr.isStart || pr.isEnd) ? 0.008 : 0 }),
      colorFn: dampTint(0.92),
    });
  }

  // -------------------------------------------------------------------------
  // 5. SIX GRACEFUL CURVED VAULTED MASONRY ARCHES & PROJECTING VOUSSOIR RINGS
  //    Arch crowns reach y(u) - 0.42 m, springing smoothly down to Y = -3.40 m at piers!
  //    Solid closed curved barrel-vault undersides (ZERO hollow bottoms!)
  // -------------------------------------------------------------------------
  const ySpring = -3.40;
  for (let sp = 0; sp < 6; sp++) {
    const aStart = piers[sp].arc1 - 0.06;
    const aEnd = piers[sp + 1].arc0 + 0.06;
    const spanLen = aEnd - aStart;
    const nSeg = 16;

    const archU = [];
    const archUDamp = [];
    const archThetas = [];
    const aStartSpan = Math.max(0.010, aStart - 0.010);
    const aEndSpan = Math.min(L - 0.010, aEnd + 0.010);
    const spanLenSpan = aEndSpan - aStartSpan;
    const aStartDamp = Math.max(0.022, aStart - 0.025);
    const aEndDamp = Math.min(L - 0.022, aEnd + 0.025);
    const spanLenDamp = aEndDamp - aStartDamp;
    for (let j = 0; j <= nSeg; j++) {
      const th = (j / nSeg) * Math.PI;
      const frac = 0.5 * (1 - Math.cos(th));
      archThetas.push(th);
      archU.push(arcTbl.uAtArc(aStartSpan + frac * spanLenSpan));
      archUDamp.push(arcTbl.uAtArc(aStartDamp + frac * spanLenDamp));
    }

    // 5a. Solid Closed Damp-Masonry Barrel Vault Liner (s in [-1.39, +1.39], y in [yIntr, yIntr + 0.24])
    // End caps staggered 2cm deeper inside piers than spandrel wall -> ZERO FLUSH_FACES!
    dampParts.push({
      geo: buildViaductSweep(archUDamp, (f, u, i) => {
        const yCrown = f.y - 0.42;
        const yIntr = ySpring + (yCrown - ySpring) * Math.sin(archThetas[i]);
        const yTop = Math.min(f.y - 0.24, yIntr + 0.24);
        return [
          [-1.39, yIntr],
          [ 1.39, yIntr],
          [ 1.39, yTop],
          [-1.39, yTop],
        ];
      }, { metersPerUnit: 1.35, erode: 0.005, seed: 700 + sp * 17 }),
      colorFn: dampTint(1.02),
    });

    // 5b. Solid Curved Weathered Limestone Spandrel Wall above arch extrados (s in [-1.42, +1.42])
    limestoneParts.push({
      geo: buildViaductSweep(archU, (f, u, i) => {
        const yCrown = f.y - 0.42;
        const yIntr = ySpring + (yCrown - ySpring) * Math.sin(archThetas[i]);
        const yBot = Math.min(f.y - 0.30, yIntr + 0.14);
        const yTop = f.y - 0.23;
        return [
          [-1.42, yBot],
          [ 1.42, yBot],
          [ 1.42, yTop],
          [-1.42, yTop],
        ];
      }, { metersPerUnit: 1.30, erode: 0.005, seed: 710 + sp * 17 }),
      colorFn: stoneTint(0.93 + (sp % 2) * 0.03, -0.10),
    });

    // 5c. Projecting Curved Stone Arch Voussoir Trim Rings on BOTH outer (+s) & inner (-s) elevations!
    // Lower springing voussoirs below waterline (v <= 1 or v >= 11) transition organically into DampLowerMasonry!
    const nVous = 13;
    for (let v = 0; v < nVous; v++) {
      const th0 = ((v + 0.04) / nVous) * Math.PI;
      const th1 = ((v + 0.96) / nVous) * Math.PI;
      const isKey = (v === 6);
      const isDampSpring = (v <= 1 || v >= nVous - 2);
      const frac0 = 0.5 * (1 - Math.cos(th0));
      const frac1 = 0.5 * (1 - Math.cos(th1));
      const u0 = arcTbl.uAtArc(aStart + frac0 * spanLen);
      const u1 = arcTbl.uAtArc(aStart + frac1 * spanLen);
      const f0 = evalViaduct(u0);
      const f1 = evalViaduct(u1);

      const yIn0 = ySpring + (f0.y - 0.42 - ySpring) * Math.sin(th0) - 0.015;
      const yIn1 = ySpring + (f1.y - 0.42 - ySpring) * Math.sin(th1) - 0.015;
      const radialThick = isKey ? 0.27 : (0.21 + (v % 2) * 0.025);
      const rx = spanLen * 0.5;
      const ry0 = (f0.y - 0.42) - ySpring;
      const ry1 = (f1.y - 0.42) - ySpring;
      const nx0 = -Math.cos(th0) * ry0, ny0 = Math.sin(th0) * rx;
      const nl0 = Math.hypot(nx0, ny0) || 1;
      const nx1 = -Math.cos(th1) * ry1, ny1 = Math.sin(th1) * rx;
      const nl1 = Math.hypot(nx1, ny1) || 1;

      const arcOut0 = Math.max(aStart + 0.008, Math.min(aEnd - 0.008, (aStart + frac0 * spanLen) + (nx0 / nl0) * radialThick));
      const arcOut1 = Math.max(aStart + 0.008, Math.min(aEnd - 0.008, (aStart + frac1 * spanLen) + (nx1 / nl1) * radialThick));
      const yOut0 = Math.min(f0.y - 0.16, yIn0 + (ny0 / nl0) * radialThick);
      const yOut1 = Math.min(f1.y - 0.16, yIn1 + (ny1 / nl1) * radialThick);
      const fOut0 = evalViaduct(arcTbl.uAtArc(arcOut0));
      const fOut1 = evalViaduct(arcTbl.uAtArc(arcOut1));

      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const sIn = sgn * 1.375;
        const sOut = sgn * (isKey ? 1.52 : 1.495);
        const sMin = Math.min(sIn, sOut);
        const sMax = Math.max(sIn, sOut);

        const r0 = [
          [f0.x + sMin * f0.rightX, yIn0, f0.z + sMin * f0.rightZ],
          [f0.x + sMax * f0.rightX, yIn0, f0.z + sMax * f0.rightZ],
          [fOut0.x + sMax * fOut0.rightX, yOut0, fOut0.z + sMax * fOut0.rightZ],
          [fOut0.x + sMin * fOut0.rightX, yOut0, fOut0.z + sMin * fOut0.rightZ],
        ];
        const r1 = [
          [f1.x + sMin * f1.rightX, yIn1, f1.z + sMin * f1.rightZ],
          [f1.x + sMax * f1.rightX, yIn1, f1.z + sMax * f1.rightZ],
          [fOut1.x + sMax * fOut1.rightX, yOut1, fOut1.z + sMax * fOut1.rightZ],
          [fOut1.x + sMin * fOut1.rightX, yOut1, fOut1.z + sMin * fOut1.rightZ],
        ];
        const vGeo = buildSweptSolid([{ pts: r0 }, { pts: r1 }], { metersPerUnit: 1.0, creaseAngle: 42 });
        if (isDampSpring) {
          dampParts.push({ geo: vGeo, colorFn: dampTint(1.04) });
        } else {
          limestoneParts.push({
            geo: vGeo,
            colorFn: stoneTint(isKey ? 1.06 : (0.94 + (v % 3) * 0.03), isKey ? 0.2 : 0.05),
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. SEMICIRCULAR CANTILEVERED BRAZIER ALCOVE AT u = 0.40 (Lagoon +s Side)
  //    Centered at evalViaduct(0.40) + 1.15 * right, radius 1.20 m (s = +1.20 .. +2.35 m)
  //    Dead-flat weathered flagstone floor at EXACT Y = -0.210 m!
  //    Brazier spot s = +1.70 -> [-9.5481, -0.2100, -26.1427] completely off main 2.40 m walkway!
  //    Curved carved parapet (0.68 m tall -> Y = +0.470 m) + Mayan fretwork reliefs!
  //    Stepped curved corbelled masonry bracket tapering down cleanly into Pier 3 / waterline (-2.85 m)!
  // -------------------------------------------------------------------------
  const alc = evalViaduct(0.40);
  const alcY = -0.210;
  const alcCx = alc.x + 1.15 * alc.rightX;
  const alcCz = alc.z + 1.15 * alc.rightZ;
  const alcSegs = 16;

  // 6a. Recessed dark mortar sub-slab beneath alcove flagstones (inset 3cm from chord & rim!)
  groutParts.push({
    geo: buildSemicircleSlab(alcCx + 0.02 * alc.rightX, alcCz + 0.02 * alc.rightZ, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.42, alcY - 0.148, alcY - 0.024, alcSegs, { metersPerUnit: 1.2 }),
    color: [0.77, 0.75, 0.71],
  });

  // 6b. Radial Weathered Limestone Flagstones on Alcove Floor (DEAD FLAT at exact Y = -0.210 m!)
  limestoneParts.push({
    geo: buildSemicircleSlab(alcCx + 0.008 * alc.rightX, alcCz + 0.008 * alc.rightZ, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 0.52, alcY - 0.130, alcY, 10, { metersPerUnit: 1.0 }),
    colorFn: stoneTint(1.01, 0.12),
  });
  const alcStones = 6;
  for (let k = 0; k < alcStones; k++) {
    const a0 = -Math.PI * 0.5 + (Math.PI * k) / alcStones + 0.014;
    const a1 = -Math.PI * 0.5 + (Math.PI * (k + 1)) / alcStones - 0.014;
    limestoneParts.push({
      geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 0.536, 1.21, alcY - 0.128, alcY, a0, a1, 3, {
        bevelTop: 0.010, metersPerUnit: 1.0,
      }),
      colorFn: stoneTint(0.93 + (k % 3) * 0.045, (k % 2 === 0 ? 0.2 : -0.2)),
    });
  }
  // Curved threshold transition bridging main sloping deck to dead-flat alcove floor
  const uThresh = sampleArcU(arcAlcOpen0 + 0.08, arcAlcOpen1 - 0.08, 8);
  limestoneParts.push({
    geo: buildViaductSweep(uThresh, (f) => [
      [1.04, Math.min(f.y, alcY) - 0.138],
      [1.22, Math.min(f.y, alcY) - 0.138],
      [1.22, alcY - 0.002],
      [1.04, f.y - 0.002],
    ], { metersPerUnit: 1.05 }),
    colorFn: stoneTint(0.98, 0.05),
  });

  // 6c. Curved Carved Stone Alcove Parapet (r in [1.20, 1.50], Y = -0.21 .. +0.470 m)
  const pAng0 = -Math.PI * 0.5 - 0.08;
  const pAng1 =  Math.PI * 0.5 + 0.08;
  limestoneParts.push({
    geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.20, 1.50, alcY - 0.018, alcY + 0.160, pAng0, pAng1, alcSegs),
    colorFn: stoneTint(0.95, 0.06),
  });
  groutParts.push({
    geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.26, 1.44, alcY + 0.155, alcY + 0.555, pAng0 + 0.03, pAng1 - 0.03, alcSegs),
    color: [0.78, 0.76, 0.72],
  });
  limestoneParts.push({
    geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.17, 1.53, alcY + 0.545, alcY + 0.680, pAng0, pAng1, alcSegs, {
      bevelTop: 0.018,
    }),
    colorFn: stoneTint(1.02, 0.15),
  });
  // Central outer crest pier cap at angle = 0 (+right) with stepped collar crowning the lookout nose!
  limestoneParts.push({
    geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.16, 1.54, alcY - 0.015, alcY + 0.690, -0.14, 0.14, 2),
    colorFn: stoneTint(0.99, 0.14),
  });
  limestoneParts.push({
    geo: buildArcSectorSolid(alcCx, alcCz, alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, 1.14, 1.56, alcY + 0.675, alcY + 0.765, -0.15, 0.15, 2, {
      bevelTop: 0.016,
    }),
    colorFn: stoneTint(1.04, 0.20),
  });
  // 4 Carved Mayan Step-Fret Relief Tablets (outer frame + dark eye groove + central boss) on BOTH outer & inner curved faces!
  const alcReliefAngs = [-1.12, -0.56, 0.56, 1.12];
  for (let ar = 0; ar < alcReliefAngs.length; ar++) {
    const ang = alcReliefAngs[ar];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = ca * alc.rightX + sa * alc.dirX;
    const rz = ca * alc.rightZ + sa * alc.dirZ;
    const tx = -sa * alc.rightX + ca * alc.dirX;
    const tz = -sa * alc.rightZ + ca * alc.dirZ;
    const localF = { x: alcCx, y: alcY, z: alcCz, dirX: tx, dirZ: tz, rightX: rx, rightZ: rz };
    for (let fz = -1; fz <= 1; fz += 2) {
      const rPos = 1.35 + fz * 0.105;
      const tab = buildWeatheredBlock(0.42, 0.24, 0.044, {
        sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.002, seed: 810 + ar * 5 + fz, clampBounds: true,
      });
      limestoneParts.push({
        geo: placeInFrame(tab, localF, 0, alcY + 0.355, rPos),
        colorFn: stoneTint(1.01, 0.18),
      });
      const eye = buildWeatheredBlock(0.24, 0.14, 0.020, {
        sx: 1, sy: 1, sz: 1, bevel: 0.003, erode: 0.001, seed: 815 + ar * 5 + fz, clampBounds: true,
      });
      groutParts.push({
        geo: placeInFrame(eye, localF, 0, alcY + 0.355, rPos + fz * 0.018),
        color: [0.75, 0.73, 0.69],
      });
      const boss = buildWeatheredBlock(0.11, 0.072, 0.024, {
        sx: 1, sy: 1, sz: 1, bevel: 0.005, erode: 0.001, seed: 820 + ar * 5 + fz, clampBounds: true,
      });
      limestoneParts.push({
        geo: placeInFrame(boss, localF, 0, alcY + 0.355, rPos + fz * 0.025),
        colorFn: stoneTint(1.05, 0.25),
      });
    }
  }

  // 6d. Curved Stepped Corbelled Masonry Bracket beneath Alcove tapering cleanly down into Pier 3 / waterline (-2.85 m)!
  // Staggered chord offsets (+0.004*cr) eliminate any coplanar chord-plane ties between rings!
  const corbelRings = [
    [1.56, alcY - 0.20, alcY - 0.016, false, 0.94],
    [1.42, alcY - 0.44, alcY - 0.18,  false, 0.92],
    [1.24, alcY - 0.72, alcY - 0.42,  false, 0.90],
    [1.04, alcY - 1.04, alcY - 0.70,  false, 0.88],
    [0.84, alcY - 1.42, alcY - 1.02,  false, 0.85],
    [0.64, alcY - 1.88, alcY - 1.40,  true,  0.98],
    [0.48, alcY - 2.34, alcY - 1.86,  true,  0.95],
    [0.36, -2.85,       alcY - 2.32,  true,  0.92],
  ];
  for (let cr = 0; cr < corbelRings.length; cr++) {
    const [rOut, yB, yT, isDamp, tone] = corbelRings[cr];
    const chordShift = -0.01 * cr;
    const slab = buildSemicircleSlab(
      alcCx + chordShift * alc.rightX,
      alcCz + chordShift * alc.rightZ,
      alc.dirX, alc.dirZ, alc.rightX, alc.rightZ, rOut, yB, yT, 14, { metersPerUnit: 1.2 }
    );
    if (isDamp) {
      dampParts.push({ geo: slab, colorFn: dampTint(tone) });
    } else {
      limestoneParts.push({ geo: slab, colorFn: stoneTint(tone, -0.15) });
    }
  }

  // -------------------------------------------------------------------------
  // 7. ASYMMETRIC ORGANIC 3D MOSS CUSHIONS (Parapet corners, alcove lip, kerb & pier ledges!)
  // -------------------------------------------------------------------------
  const mossPlacements = [
    { a: 3.10,                 s:  1.41, dy: 0.684, rx: 0.24, ry: 0.048, rz: 0.13, dr: 0.04, sd: 901 },
    { a: 3.32,                 s:  1.45, dy: 0.682, rx: 0.14, ry: 0.036, rz: 0.10, dr: 0.03, sd: 902 },
    { a: piers[1].arcC + 0.04, s:  1.42, dy: 0.784, rx: 0.16, ry: 0.046, rz: 0.14, dr: 0.03, sd: 903 },
    { a: 10.60,                s:  1.38, dy: 0.684, rx: 0.22, ry: 0.044, rz: 0.12, dr: 0.04, sd: 904 },
    { a: arcAlcOpen0 - 0.18,   s:  1.40, dy: 0.784, rx: 0.15, ry: 0.044, rz: 0.13, dr: 0.03, sd: 905 },
    { a: arcAlcOpen1 + 0.18,   s:  1.38, dy: 0.784, rx: 0.14, ry: 0.040, rz: 0.12, dr: 0.03, sd: 906 },
    { a: piers[3].arcC - 0.03, s:  1.41, dy: 0.784, rx: 0.16, ry: 0.048, rz: 0.14, dr: 0.03, sd: 907 },
    { a: 23.60,                s:  1.42, dy: 0.684, rx: 0.25, ry: 0.046, rz: 0.13, dr: 0.04, sd: 908 },
    { a: piers[4].arcC + 0.04, s:  1.39, dy: 0.784, rx: 0.15, ry: 0.042, rz: 0.13, dr: 0.03, sd: 909 },
    { a: 29.40,                s:  1.40, dy: 0.684, rx: 0.21, ry: 0.044, rz: 0.12, dr: 0.03, sd: 910 },
    { a: piers[5].arcC - 0.02, s:  1.42, dy: 0.784, rx: 0.17, ry: 0.048, rz: 0.14, dr: 0.03, sd: 911 },
    { a: 34.40,                s:  1.39, dy: 0.684, rx: 0.20, ry: 0.042, rz: 0.12, dr: 0.03, sd: 912 },
    // Cliff-side (-s) kerb moss clusters
    { a: 4.60,                 s: -1.36, dy: 0.224, rx: 0.24, ry: 0.048, rz: 0.13, dr: 0.03, sd: 920 },
    { a: 4.82,                 s: -1.31, dy: 0.222, rx: 0.14, ry: 0.036, rz: 0.10, dr: 0.02, sd: 921 },
    { a: 12.10,                s: -1.38, dy: 0.224, rx: 0.26, ry: 0.052, rz: 0.14, dr: 0.03, sd: 922 },
    { a: 19.20,                s: -1.35, dy: 0.224, rx: 0.23, ry: 0.046, rz: 0.13, dr: 0.03, sd: 923 },
    { a: 27.60,                s: -1.37, dy: 0.224, rx: 0.24, ry: 0.048, rz: 0.13, dr: 0.03, sd: 924 },
    { a: 33.20,                s: -1.35, dy: 0.224, rx: 0.21, ry: 0.042, rz: 0.12, dr: 0.03, sd: 925 },
  ];
  for (let m = 0; m < mossPlacements.length; m++) {
    const mp = mossPlacements[m];
    const u = arcTbl.uAtArc(mp.a);
    const f = evalViaduct(u);
    const mg = buildMossCushion(mp.rx, mp.ry, mp.rz, mp.sd, { wSeg: 7, hSeg: 5, drape: mp.dr });
    mossParts.push({
      geo: placeInFrame(mg, f, 0, f.y + mp.dy, mp.s, u, 0.05),
      colorFn: mossTint(0.95 + (m % 3) * 0.05),
    });
  }

  // Organic moss tufts tucked onto the semicircular alcove parapet lip
  const alcMossAngs = [-0.82, 0.08, 0.94];
  for (let am = 0; am < alcMossAngs.length; am++) {
    const ang = alcMossAngs[am];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = ca * alc.rightX + sa * alc.dirX;
    const rz = ca * alc.rightZ + sa * alc.dirZ;
    const my = (am === 1) ? (alcY + 0.768) : (alcY + 0.684);
    const mg = buildMossCushion(0.16, 0.042, 0.13, 940 + am, { wSeg: 7, hSeg: 5, drape: 0.035 });
    mossParts.push({
      geo: mg,
      pos: [alcCx + 1.40 * rx, my, alcCz + 1.40 * rz],
      colorFn: mossTint(0.97 + (am % 2) * 0.07),
    });
  }

  // Waterline mossy shelves hugging damp pier plinth ledges at Y = -2.08 m (piers 1..5)
  for (let p = 1; p <= 5; p++) {
    const pr = piers[p];
    const f = evalViaduct(pr.u);
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      if (p === 2 && sgn > 0) continue;
      const mg = buildMossCushion(0.36, 0.055, 0.11, 960 + p * 3 + sgn, { wSeg: 7, hSeg: 4, drape: 0.04 });
      mossParts.push({
        geo: placeInFrame(mg, f, (p % 2 === 0 ? 0.12 : -0.10), -2.075, sgn * 1.51, pr.u, 0.05),
        colorFn: mossTint(0.86 + (p % 2) * 0.08),
      });
    }
  }

  const limestoneGeo = mergeEntries(limestoneParts);
  const groutGeo = mergeEntries(groutParts);
  const dampGeo = mergeEntries(dampParts);
  const mossGeo = mergeEntries(mossParts);

  createPart('ViaductLimestone', limestoneGeo, mats.limestoneMat, { parent: root });
  createPart('ViaductCarvedGrout', groutGeo, mats.groutMat, { parent: root });
  createPart('ViaductDampMasonry', dampGeo, mats.dampMat, { parent: root });
  createPart('ViaductMossCushions', mossGeo, mats.mossMat, { parent: root });

  return root;
}
