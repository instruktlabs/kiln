const meta = {
  name: 'stalactite-cluster',
  role: 'prop',
};

function hash3(ix, iy, iz, seed) {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(iz, 2147483647) +
    Math.imul(seed, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function noise3(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const fz = smoothstep(z - iz);

  const c000 = hash3(ix, iy, iz, seed);
  const c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed);
  const c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed);
  const c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;

  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return (y0 + (y1 - y0) * fz) * 2 - 1;
}

function fbm3(x, y, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2.09;
  }
  return sum / norm;
}

// Helper to accumulate multiple watertight sub-meshes into a single merged meshGeo
function createMeshBuilder() {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  function addVertex(x, y, z, u, v, r, g, b) {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(r, g, b);
    return idx;
  }

  function addTri(a, b, c) {
    indices.push(a, b, c);
  }

  return { positions, uvs, colors, indices, addVertex, addTri };
}

// Build one organically fluted, ribbed, tapered karst dripstone stalactite hanging downward from ceiling collar
function appendStalactite(builder, cfg) {
  const {
    cx,
    cz,
    yTop,
    length,
    rBase,
    aspectX,
    aspectZ,
    rotY,
    flutes,
    fluteDepth,
    taperPow,
    ringFreq,
    nSeg,
    nRad,
    seed,
  } = cfg;

  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const yTip = yTop - length;
  const ringStarts = [];

  // Create longitudinal rings from ceiling collar (i=0) down to near-tip (i=nSeg)
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg; // 0 at buried top collar -> 1 just above sharp drip tip
    // Leave tiny 0.04m vertical run to the explicit apex vertex so no degenerate ring occurs
    const y = mix(yTop, yTip + 0.045, Math.pow(t, 0.96));

    // Flared organic travertine ceiling apron in top 18% so it fuses naturally into ceiling boss
    const flare = Math.pow(clamp01((0.20 - t) / 0.20), 2.0) * 0.42;
    // Main organic conical-parabolic taper
    const baseTaper = Math.pow(1.0 - t * 0.94, taperPow);
    // Natural dripstone calcite swell nodes along the column
    const swell =
      1.0 +
      0.13 * Math.sin(t * ringFreq * Math.PI * 2 + seed) * Math.sin(t * Math.PI) +
      0.08 * Math.cos(t * ringFreq * 1.9 * Math.PI * 2 - seed * 0.7) * (1 - t);
    // Slight organic mineral meander (gravity keeps stalactites nearly plumb, max ~3-5cm wander)
    const driftX = 0.045 * Math.sin(t * Math.PI * 1.6 + seed * 1.3) * t;
    const driftZ = 0.045 * Math.cos(t * Math.PI * 1.4 - seed * 0.9) * t;

    const rRing = Math.max(0.022, rBase * (baseTaper + flare) * swell);
    const ringIdx = builder.positions.length / 3;
    ringStarts.push(ringIdx);

    // Extra seam vertex (j = nRad) so cylindrical U wraps cleanly 0..circumTiles without seam smear
    const circumTiles = Math.max(1, Math.round(rBase * 4.5));
    const vCoord = -y / 2.2;

    for (let j = 0; j <= nRad; j++) {
      const frac = j / nRad;
      const theta = frac * Math.PI * 2;
      // Vertical fluted karst drapery ribs (deep ribs along middle/upper body, refining toward tip)
      const fluteEnv = 0.45 + 0.55 * Math.sin(clamp01(t * 1.15) * Math.PI);
      const rib1 = Math.cos(flutes * theta + seed * 0.6 + 0.25 * Math.sin(t * 5.0 + seed));
      const rib2 = Math.cos((flutes * 2 - 1) * theta - seed * 1.1);
      const rib3 = Math.sin((flutes + 2) * theta + seed * 1.7);
      // Ridged concave scallops between sharp vertical travertine flutes
      const ribShape = 0.55 * rib1 + 0.28 * rib2 + 0.17 * rib3;
      const fluteMul = 1.0 + fluteDepth * fluteEnv * (ribShape * 0.68 + 0.32 * Math.abs(rib1));

      // Subtle multi-octave mineral crust roughness
      const lx0 = Math.cos(theta) * aspectX;
      const lz0 = Math.sin(theta) * aspectZ;
      const nCrust = 0.09 * fbm3(cx + lx0 * 1.6, y * 1.1, cz + lz0 * 1.6, 3, seed * 37);

      const rad = Math.max(0.016, rRing * fluteMul * (1.0 + nCrust));
      const rx = lx0 * rad;
      const rz = lz0 * rad;
      const wx = cx + driftX + rx * cosR - rz * sinR;
      const wz = cz + driftZ + rx * sinR + rz * cosR;

      // Vertex color: warm ochre-grey mineral ribs (#938a79), shaded flute valleys, darker wet tips (#6c685c)!
      const grooveAO = 1.0 - 0.18 * clamp01(-ribShape * 0.65 + 0.35);
      // Wet damp darkening toward lower drip tips + mineral banding
      const wetTip = Math.pow(t, 1.55);
      const band = 0.05 * Math.sin(y * 3.8 + seed);
      let cr = (1.03 - 0.25 * wetTip + band) * grooveAO;
      let cg = (1.00 - 0.22 * wetTip + band * 0.95) * grooveAO;
      let cb = (0.95 - 0.20 * wetTip + band * 0.90) * grooveAO;
      // Subtle damp ceiling-root darkening near Y = 0..+0.5
      if (t < 0.16) {
        const rootDark = 1.0 - 0.14 * ((0.16 - t) / 0.16);
        cr *= rootDark;
        cg *= rootDark;
        cb *= rootDark;
      }

      builder.addVertex(wx, y, wz, frac * circumTiles, vCoord, clamp01(cr), clamp01(cg), clamp01(cb));
    }
  }

  const ringStride = nRad + 1;

  // Side quads:
  // Going j -> j+1 increases theta (from +X toward +Z, so tangent dP/dtheta = (-sin, 0, cos)).
  // Going i -> i+1 goes downward (-Y).
  // Wait: check outward normal! At theta=0 (point at +X):
  //   dP/dtheta = (0, 0, +1) = +Z
  //   dP/dt = (0, -1, 0) = -Y
  //   dP/dtheta x dP/dt = (0,0,1) x (0,-1,0) = (+1, 0, 0) = +X (OUTWARD)!!
  // So for quad a=(i,j), b=(i,j+1), c=(i+1,j+1), d=(i+1,j):
  //   (b - a) x (d - a) = dP/dtheta x dP/dt = +X (OUTWARD CCW)!
  // Therefore triangles (a, b, c) and (a, c, d) are strictly OUTWARD CCW!
  for (let i = 0; i < nSeg; i++) {
    const r0 = ringStarts[i];
    const r1 = ringStarts[i + 1];
    for (let j = 0; j < nRad; j++) {
      const a = r0 + j;
      const b = r0 + j + 1;
      const c = r1 + j + 1;
      const d = r1 + j;
      builder.addTri(a, b, c);
      builder.addTri(a, c, d);
    }
  }

  // Top cap at yTop (outward normal +Y):
  // From center C to ring0(j) at +X=(1,0,0), ring0(j+1) at (+cos, 0, +sin):
  // (P(j+1)-C) x (P(j)-C) = (0,0,1) x (1,0,0) = (0, +1, 0) = +Y (OUTWARD)!
  const topCenter = builder.addVertex(cx, yTop, cz, 0.5, 0.5, 0.82, 0.80, 0.76);
  const topRing = ringStarts[0];
  for (let j = 0; j < nRad; j++) {
    builder.addTri(topCenter, topRing + j + 1, topRing + j);
  }

  // Bottom sharp mineral drip apex (outward normal -Y):
  // (P(j)-Apex) x (P(j+1)-Apex) = (1,0,0) x (0,0,1) = (0, -1, 0) = -Y (OUTWARD)!
  const driftTipX = 0.045 * Math.sin(Math.PI * 1.6 + seed * 1.3);
  const driftTipZ = 0.045 * Math.cos(Math.PI * 1.4 - seed * 0.9);
  const tipCenter = builder.addVertex(
    cx + driftTipX,
    yTip,
    cz + driftTipZ,
    0.5,
    -yTip / 2.2,
    0.72,
    0.70,
    0.65
  );
  const botRing = ringStarts[nSeg];
  for (let j = 0; j < nRad; j++) {
    builder.addTri(tipCenter, botRing + j, botRing + j + 1);
  }
}

// Scalloped rocky travertine ceiling boss / mounting collar (Y = +0.50m down to sculpted hanging flowstone lobes)
function appendCeilingBoss(builder, stalactites) {
  const rings = 12;
  const segs = 36;

  function bossSurface(rho, theta) {
    // Organic lobed karst rock ceiling canopy spanning Z in [-2.6, +2.6], X in [-1.5, +1.5]
    const lobe =
      1.0 +
      0.13 * Math.cos(3 * theta + 0.5) +
      0.09 * Math.sin(5 * theta - 0.8) +
      0.07 * Math.cos(7 * theta + 1.2) +
      0.05 * fbm3(Math.cos(theta) * 1.4, 0.3, Math.sin(theta) * 1.4, 2, 419);
    const rx = 1.44 * lobe;
    const rz = 2.50 * lobe;
    const x = Math.cos(theta) * rx * rho;
    const z = Math.sin(theta) * rz * rho;

    // Pull underside deeply downward around each stalactite root AND fuse neighboring roots into flowstone drapery webs!
    let rootPull = 0;
    let sumPull = 0;
    for (let i = 0; i < stalactites.length; i++) {
      const s = stalactites[i];
      const dx = (x - s.cx) / (s.rBase * 2.55);
      const dz = (z - s.cz) / (s.rBase * 2.55);
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.0) {
        const w = 1.0 - d2;
        const p = w * w * (0.48 + s.rBase * 1.15);
        rootPull = Math.max(rootPull, p);
        sumPull += p * 0.25;
      }
    }
    const fusedDrop = Math.min(1.45, rootPull + sumPull * 0.45);

    // Taper smoothly UPWARD to the buried ceiling plane at outer perimeter (NO sharp pancake cylinder edge!)
    const dome = Math.pow(Math.max(0, 1.0 - rho * rho), 0.72);
    const rimBevel = smoothstep(clamp01((1.0 - rho) / 0.22));
    const flowNoise = 0.22 * fbm3(x * 0.95, 0.15, z * 0.95, 3, 409);
    const cragRib = 0.14 * Math.sin(theta * 9.0 + rho * 4.0) * dome;

    const botY = 0.34 - (0.62 * dome + fusedDrop * (0.28 + 0.72 * rimBevel)) + (flowNoise + cragRib) * rimBevel;
    const topY = 0.50 - 0.10 * Math.pow(rho, 2.4) + 0.04 * flowNoise;
    return { x, z, topY: Math.max(topY, botY + 0.06), botY };
  }

  // Top buried mounting cap (+Y outward)
  const topC = builder.addVertex(0, 0.50, 0, 0.5, 0.5, 0.85, 0.84, 0.80);
  const topRings = [];
  for (let r = 1; r <= rings; r++) {
    const rho = r / rings;
    const start = builder.positions.length / 3;
    topRings.push(start);
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const p = bossSurface(rho, theta);
      builder.addVertex(p.x, p.topY, p.z, p.z * 0.35 + 0.5, p.x * 0.35 + 0.5, 0.85, 0.84, 0.80);
    }
  }
  // Sculpted scalloped travertine cave ceiling underside (-Y outward)
  const botCenterSample = bossSurface(0, 0);
  const botC = builder.addVertex(0, botCenterSample.botY, 0, 0.5, 0.5, 0.94, 0.92, 0.86);
  const botRings = [];
  for (let r = 1; r <= rings; r++) {
    const rho = r / rings;
    const start = builder.positions.length / 3;
    botRings.push(start);
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const p = bossSurface(rho, theta);
      const dropNorm = clamp01((0.35 - p.botY) / 1.35);
      const shade = 0.82 + 0.20 * dropNorm;
      builder.addVertex(
        p.x,
        p.botY,
        p.z,
        p.z * 0.42 + 0.5,
        p.x * 0.42 + 0.5,
        clamp01(shade * 1.00),
        clamp01(shade * 0.98),
        clamp01(shade * 0.93)
      );
    }
  }

  // Triangulate top surface (+Y outward)
  for (let s = 0; s < segs; s++) {
    builder.addTri(topC, topRings[0] + s + 1, topRings[0] + s);
  }
  for (let r = 0; r < rings - 1; r++) {
    const r0 = topRings[r];
    const r1 = topRings[r + 1];
    for (let s = 0; s < segs; s++) {
      builder.addTri(r0 + s, r0 + s + 1, r1 + s + 1);
      builder.addTri(r0 + s, r1 + s + 1, r1 + s);
    }
  }

  // Triangulate bottom surface (-Y outward)
  for (let s = 0; s < segs; s++) {
    builder.addTri(botC, botRings[0] + s, botRings[0] + s + 1);
  }
  for (let r = 0; r < rings - 1; r++) {
    const r0 = botRings[r];
    const r1 = botRings[r + 1];
    for (let s = 0; s < segs; s++) {
      builder.addTri(r0 + s, r1 + s + 1, r0 + s + 1);
      builder.addTri(r0 + s, r1 + s, r1 + s + 1);
    }
  }

  // Stitch thin tapered outer collar edge cleanly
  const tOut = topRings[rings - 1];
  const bOut = botRings[rings - 1];
  for (let s = 0; s < segs; s++) {
    const a = tOut + s;
    const b = tOut + s + 1;
    const c = bOut + s + 1;
    const d = bOut + s;
    builder.addTri(a, b, c);
    builder.addTri(a, c, d);
  }
}

function buildStalactiteClusterGeometry() {
  const builder = createMeshBuilder();

  // 13 varied karst dripstone stalactites arranged in a dramatic curtain-like organ-pipe cluster!
  // Spread: Z in [-2.6, +2.6], X in [-1.5, +1.5], hanging from Y = +0.50m down to Y = -6.80m
  const stalactites = [
    // Massive ribbed curtain-like central hero speleothems (5.5..6.8m long, 0.55..0.82m thick at ceiling)
    { cx:  0.12, cz: -0.18, yTop: 0.44, length: 7.24, rBase: 0.44, aspectX: 0.92, aspectZ: 1.16, rotY: 0.20, flutes: 9,  fluteDepth: 0.24, taperPow: 1.18, ringFreq: 4.5, nSeg: 18, nRad: 18, seed: 11 },
    { cx: -0.22, cz:  0.62, yTop: 0.42, length: 6.42, rBase: 0.39, aspectX: 1.08, aspectZ: 0.92, rotY: 0.75, flutes: 8,  fluteDepth: 0.22, taperPow: 1.12, ringFreq: 4.0, nSeg: 17, nRad: 16, seed: 23 },
    { cx:  0.34, cz: -0.96, yTop: 0.40, length: 5.95, rBase: 0.36, aspectX: 0.95, aspectZ: 1.12, rotY: 1.30, flutes: 8,  fluteDepth: 0.23, taperPow: 1.22, ringFreq: 3.8, nSeg: 16, nRad: 16, seed: 37 },
    // Secondary stalactite ribs fused into drapery curtain (3.8..5.2m long)
    { cx: -0.58, cz: -0.44, yTop: 0.38, length: 5.10, rBase: 0.32, aspectX: 1.00, aspectZ: 1.05, rotY: 0.45, flutes: 7,  fluteDepth: 0.21, taperPow: 1.15, ringFreq: 3.5, nSeg: 15, nRad: 14, seed: 53 },
    { cx:  0.52, cz:  0.34, yTop: 0.38, length: 4.78, rBase: 0.29, aspectX: 1.10, aspectZ: 0.88, rotY: 1.85, flutes: 7,  fluteDepth: 0.22, taperPow: 1.25, ringFreq: 3.4, nSeg: 15, nRad: 14, seed: 67 },
    { cx: -0.15, cz:  1.42, yTop: 0.36, length: 4.92, rBase: 0.31, aspectX: 0.94, aspectZ: 1.10, rotY: 2.20, flutes: 7,  fluteDepth: 0.20, taperPow: 1.18, ringFreq: 3.6, nSeg: 15, nRad: 14, seed: 79 },
    { cx: -0.28, cz: -1.62, yTop: 0.36, length: 4.48, rBase: 0.28, aspectX: 1.05, aspectZ: 0.96, rotY: 0.95, flutes: 7,  fluteDepth: 0.20, taperPow: 1.20, ringFreq: 3.2, nSeg: 14, nRad: 14, seed: 97 },
    { cx:  0.74, cz: -0.35, yTop: 0.35, length: 3.92, rBase: 0.25, aspectX: 0.96, aspectZ: 1.06, rotY: 2.65, flutes: 6,  fluteDepth: 0.20, taperPow: 1.28, ringFreq: 3.0, nSeg: 13, nRad: 12, seed: 109 },
    // Delicate flanking dripstone icicles (1.9..3.6m long) giving jagged organic outer silhouette
    { cx:  0.22, cz:  2.08, yTop: 0.32, length: 3.65, rBase: 0.23, aspectX: 0.95, aspectZ: 1.05, rotY: 1.10, flutes: 6,  fluteDepth: 0.19, taperPow: 1.32, ringFreq: 2.8, nSeg: 13, nRad: 12, seed: 127 },
    { cx:  0.18, cz: -2.14, yTop: 0.32, length: 3.28, rBase: 0.22, aspectX: 1.04, aspectZ: 0.94, rotY: 2.05, flutes: 6,  fluteDepth: 0.18, taperPow: 1.30, ringFreq: 2.6, nSeg: 12, nRad: 12, seed: 139 },
    { cx: -0.88, cz:  0.24, yTop: 0.30, length: 3.12, rBase: 0.21, aspectX: 1.02, aspectZ: 0.98, rotY: 0.35, flutes: 6,  fluteDepth: 0.19, taperPow: 1.28, ringFreq: 2.5, nSeg: 12, nRad: 12, seed: 151 },
    { cx:  0.92, cz:  0.96, yTop: 0.28, length: 2.62, rBase: 0.18, aspectX: 0.96, aspectZ: 1.04, rotY: 1.55, flutes: 5,  fluteDepth: 0.18, taperPow: 1.35, ringFreq: 2.4, nSeg: 11, nRad: 12, seed: 167 },
    { cx: -0.78, cz: -1.08, yTop: 0.28, length: 2.34, rBase: 0.17, aspectX: 1.05, aspectZ: 0.96, rotY: 2.85, flutes: 5,  fluteDepth: 0.18, taperPow: 1.35, ringFreq: 2.2, nSeg: 11, nRad: 12, seed: 181 },
  ];

  appendCeilingBoss(builder, stalactites);
  for (let i = 0; i < stalactites.length; i++) {
    appendStalactite(builder, stalactites[i]);
  }

  // Exact bounds calibration: X in [-1.50, +1.50], Y in [-6.80, +0.50], Z in [-2.60, +2.60]
  const pos = builder.positions;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  const tMinX = -1.5, tMaxX = 1.5;
  const tMinY = -6.8, tMaxY = 0.5;
  const tMinZ = -2.6, tMaxZ = 2.6;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = tMinX + ((pos[i] - minX) / (maxX - minX)) * (tMaxX - tMinX);
    pos[i + 1] = tMinY + ((pos[i + 1] - minY) / (maxY - minY)) * (tMaxY - tMinY);
    pos[i + 2] = tMinZ + ((pos[i + 2] - minZ) / (maxZ - minZ)) * (tMaxZ - tMinZ);
  }

  let geo = meshGeo({
    positions: builder.positions,
    indices: builder.indices,
    uvs: builder.uvs,
  });
  geo.setAttribute('color', new THREE.Float32BufferAttribute(builder.colors, 3));
  // Crease at 55 deg: preserves crisp vertical travertine flute ridges while keeping mineral ribs organic
  geo = creaseNormals(geo, { angle: 55 });
  geo = mergeVertices(geo, { tolerance: 1e-4 });
  return geo;
}

async function createTravertineMaterial() {
  // Damp Grotto Stalactite Travertine: cool mineral ochre-grey #938a79, vertical mineral flutes, wet tips #6c685c, roughness 0.78..0.88
  // Combines organic mineral travertine albedo (zero woody stripe look!) with crisp stone normal relief!
  const fluteCells = {
    cellsX: 12,
    cellsY: 5,
    seed: 311,
    jitterX: 0.85,
    jitterY: 0.88,
    metricX: 2.0,
    metricY: 1,
    weight: 0.46,
  };
  const flutesFacet = { ...fluteCells, feature: 'facet', facetSlope: 0.80, facetBlend: 0.30 };
  const flutesCrevice = { ...fluteCells, feature: 'border', borderOpen: 0.50, borderWidth: 0.045, blend: 'multiply' };

  const albedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'TravertineDripstoneAlbedo',
    layers: [
      { op: 'cellular', ...fluteCells, feature: 'cell', colorA: 0x867e6f, colorB: 0xa49b89 },
      // Subtle vertical mineral calcite streaks (low opacity so stone never looks like wood)
      { op: 'stripes', colorA: 0x777164, colorB: 0xa9a08f, count: 14, angleDeg: 0, blend: 'overlay', opacity: 0.16 },
      // Multi-scale porous travertine mineral limestone mottling
      { op: 'noise', colorA: 0x6b665a, colorB: 0xb3ab9b, scale: 10, octaves: 5, seed: 317, blend: 'overlay', opacity: 0.50 },
      { op: 'noise', colorA: 0x5c584e, colorB: 0xbcb5a6, scale: 34, octaves: 4, seed: 325, blend: 'overlay', opacity: 0.45 },
      { op: 'cellular', ...flutesFacet, colorA: 0x868686, colorB: 0xffffff, blend: 'multiply', opacity: 0.25 },
      { op: 'cellular', ...flutesCrevice, colorA: 0xffffff, colorB: 0x504c43, opacity: 0.45 },
    ],
  });

  const height = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'TravertineDripstoneHeight',
    layers: [
      { op: 'cellular', ...flutesFacet, colorA: 0x262626, colorB: 0xdcdcdc },
      { op: 'noise', colorA: 0x222222, colorB: 0xdedede, scale: 16, octaves: 5, seed: 317, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x1c1c1c, colorB: 0xe4e4e4, scale: 42, octaves: 4, seed: 325, blend: 'overlay', opacity: 0.48 },
      { op: 'cellular', ...flutesCrevice, colorA: 0xffffff, colorB: 0x181818 },
    ],
  });

  const packed = (r) => (255 << 16) | (r << 8);
  const mr = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'TravertineDripstoneMR',
    layers: [
      // Damp travertine mineral sheen: roughness 0.78 (199) to 0.88 (224), metalness = 0
      { op: 'cellular', ...fluteCells, feature: 'cell', colorA: packed(199), colorB: packed(224) },
      { op: 'noise', colorA: packed(196), colorB: packed(226), scale: 18, octaves: 3, seed: 331, blend: 'overlay', opacity: 0.42 },
    ],
  });

  const mat = pbrMaterial({
    albedo,
    normal: normalMapFromHeight(height, { strength: 5.5, name: 'TravertineDripstoneNormal' }),
    metallicRoughness: mr,
    roughness: 1,
    metalness: 1,
    name: 'TravertineDripstone',
  });
  mat.vertexColors = true;
  return mat;
}

async function build() {
  const root = createRoot('StalactiteCluster');
  const mat = await createTravertineMaterial();
  const geo = buildStalactiteClusterGeometry();
  createPart('DripstoneCluster', geo, mat, { parent: root });
  return root;
}
