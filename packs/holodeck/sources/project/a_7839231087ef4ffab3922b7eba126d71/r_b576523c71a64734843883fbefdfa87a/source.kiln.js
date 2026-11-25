const meta = {
  name: 'mossy-boulder-cluster',
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

function smin(a, b, k) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
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

function ridged3(x, y, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq, seed + i * 47));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.13;
  }
  return sum / norm;
}

function createGeodesicSphere(freq) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const rawVerts = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const verts = [];
  const vertMap = new Map();
  const indices = [];

  function getVert(x, y, z) {
    const l = Math.hypot(x, y, z);
    const nx = x / l;
    const ny = y / l;
    const nz = z / l;
    const key = `${Math.round(nx * 10000)},${Math.round(ny * 10000)},${Math.round(nz * 10000)}`;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;
    const idx = verts.length;
    verts.push([nx, ny, nz]);
    vertMap.set(key, idx);
    return idx;
  }

  for (let f = 0; f < faces.length; f++) {
    const [ia, ib, ic] = faces[f];
    const A = rawVerts[ia];
    const B = rawVerts[ib];
    const C = rawVerts[ic];
    const rows = [];
    for (let i = 0; i <= freq; i++) {
      const row = [];
      for (let j = 0; j <= freq - i; j++) {
        const k = freq - i - j;
        row.push(getVert(
          (A[0] * k + B[0] * i + C[0] * j) / freq,
          (A[1] * k + B[1] * i + C[1] * j) / freq,
          (A[2] * k + B[2] * i + C[2] * j) / freq
        ));
      }
      rows.push(row);
    }
    for (let i = 0; i < freq; i++) {
      for (let j = 0; j < freq - i; j++) {
        const v0 = rows[i][j];
        const v1 = rows[i + 1][j];
        const v2 = rows[i][j + 1];
        indices.push(v0, v1, v2);
        if (j < freq - i - 1) {
          const v3 = rows[i + 1][j + 1];
          indices.push(v1, v3, v2);
        }
      }
    }
  }
  return { verts, indices };
}

// Sculpt one stratified angular karst outcrop rock in its local frame, then transform to cluster space
function evaluateClusterRock(dx, dy, dz, cfg) {
  const { sx, sy, sz, seed, yaw, tiltX, tiltZ, cx, cy, cz, strataScale } = cfg;

  // Heavy grounded foundation broadening below rock equator
  const baseBroaden = 1.0 + 0.18 * clamp01(-dy + 0.22);
  let lx = dx * sx * baseBroaden;
  let ly = dy * sy;
  let lz = dz * sz * baseBroaden;

  // 7 angular limestone cleavage planes rotated deterministically by seed
  const a1 = seed * 0.7;
  const planes = [
    { nx: Math.cos(a1) * 0.85, ny: 0.45, nz: Math.sin(a1) * 0.85, d: 0.84 * Math.min(sx, sz) + 0.12 * sx },
    { nx: Math.cos(a1 + 2.1) * 0.82, ny: 0.50, nz: Math.sin(a1 + 2.1) * 0.82, d: 0.82 * Math.min(sx, sz) + 0.10 * sz },
    { nx: Math.cos(a1 + 4.2) * 0.86, ny: 0.36, nz: Math.sin(a1 + 4.2) * 0.86, d: 0.86 * Math.min(sx, sz) + 0.08 * sx },
    { nx: 0.18 * Math.cos(a1), ny: 0.96, nz: 0.18 * Math.sin(a1), d: sy * 0.84 }, // flat-ish weathered limestone top ledge
    { nx: -0.35 * Math.sin(a1), ny: 0.86, nz: 0.35 * Math.cos(a1), d: sy * 0.90 },
    { nx: Math.cos(a1 + 1.1) * 0.94, ny: -0.18, nz: Math.sin(a1 + 1.1) * 0.94, d: 0.90 * sx },
    { nx: Math.cos(a1 + 3.4) * 0.94, ny: -0.15, nz: Math.sin(a1 + 3.4) * 0.94, d: 0.88 * sz },
  ];

  let clip = 1.0;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    const proj = lx * p.nx + ly * p.ny + lz * p.nz;
    if (proj > 0.04) {
      clip = smin(clip, p.d / proj, 0.11);
    }
  }
  lx *= clip;
  ly *= clip;
  lz *= clip;

  // Horizontal limestone sedimentary strata beds & crisp recessed bedding seams
  const yBed = ly + 0.07 * Math.sin(lx * 1.6 + lz * 1.4 + seed);
  const ph = (yBed + 2.0) * strataScale;
  const bIdx = Math.floor(ph);
  const f = ph - bIdx;
  const seamCut = f < 0.19 ? -0.072 * Math.sin((f / 0.19) * Math.PI) : 0;
  const bedStep = (hash3(bIdx, seed, 13, 307) * 2 - 1) * 0.065 + (f > 0.22 ? 0.032 * smoothstep(clamp01((f - 0.22) / 0.24)) : 0);

  // Macro angular rock blockiness & weathered karst pits (clean sculpted faces, normal map adds fine grain)
  const nMacro = 0.095 * fbm3(dx * 1.9, dy * 2.1, dz * 1.9, 3, seed * 41 + 17);
  const nCrag = 0.036 * (ridged3(dx * 3.6, dy * 3.6, dz * 3.6, 3, seed * 67 + 29) - 0.48);

  const rOff = bedStep + seamCut + nMacro + nCrag;
  const hLen = Math.hypot(lx, lz) + 1e-6;
  lx += (lx / hLen) * rOff;
  lz += (lz / hLen) * rOff;
  ly += nMacro * 0.42 + nCrag * 0.30;

  // Rotate by gentle geological tilt (tiltX, tiltZ) then yaw around Y
  const cxR = Math.cos(tiltX), sxR = Math.sin(tiltX);
  const y1 = ly * cxR - lz * sxR;
  const z1 = ly * sxR + lz * cxR;

  const czR = Math.cos(tiltZ), szR = Math.sin(tiltZ);
  const x2 = lx * czR - y1 * szR;
  const y2 = lx * szR + y1 * czR;

  const cyR = Math.cos(yaw), syR = Math.sin(yaw);
  const wx = cx + x2 * cyR + z1 * syR;
  const wz = cz - x2 * syR + z1 * cyR;
  let wy = cy + y2;

  // Softly seat the bottom embedding skirt near Y = -0.30m without sharp clipping
  if (wy < -0.10) {
    wy = -0.10 + (wy + 0.10) * 0.55;
  }

  return {
    x: wx,
    y: wy,
    z: wz,
    seamDepth: clamp01(-seamCut / 0.075),
    bedTone: hash3(bIdx, seed, 29, 353) * 2 - 1,
  };
}

function buildClusterGeometry() {
  // 4 cohesive interlocking karst shoreline & reef rocks (merged into 1 mesh!)
  const rocks = [
    // 1. Primary angular stratified hero slab (tall focal peak)
    { freq: 8, sx: 0.72, sy: 0.62, sz: 0.62, cx: -0.16, cy: 0.24, cz: -0.06, yaw: 0.35, tiltX: 0.10, tiltZ: -0.09, strataScale: 3.1, seed: 11, moss: true, mossCoverage: 0.52, mossThick: 0.072 },
    // 2. Secondary wedged flank boulder (+X/+Z facing the lagoon)
    { freq: 7, sx: 0.56, sy: 0.48, sz: 0.50, cx:  0.48, cy: 0.10, cz:  0.34, yaw: 1.45, tiltX: -0.08, tiltZ: 0.11, strataScale: 3.4, seed: 23, moss: true, mossCoverage: 0.48, mossThick: 0.060 },
    // 3. Low broad foreground reef ledge (+X/-Z — catches turquoise water caustics!)
    { freq: 6, sx: 0.54, sy: 0.34, sz: 0.48, cx:  0.40, cy: -0.02, cz: -0.44, yaw: 2.35, tiltX: 0.06, tiltZ: -0.07, strataScale: 3.8, seed: 37, moss: false, mossCoverage: 0, mossThick: 0 },
    // 4. Rear shoulder anchor boulder (-X/+Z completing compact interlocking cluster)
    { freq: 6, sx: 0.52, sy: 0.44, sz: 0.48, cx: -0.52, cy: 0.06, cz:  0.38, yaw: 4.10, tiltX: -0.11, tiltZ: -0.06, strataScale: 3.5, seed: 53, moss: true, mossCoverage: 0.45, mossThick: 0.056 },
  ];

  // Collect all rock vertices & indices into one merged buffer
  const rPositions = [];
  const rIndices = [];
  const rMeta = [];

  for (let r = 0; r < rocks.length; r++) {
    const cfg = rocks[r];
    const sphere = createGeodesicSphere(cfg.freq);
    const baseIdx = rPositions.length / 3;
    for (let i = 0; i < sphere.verts.length; i++) {
      const [dx, dy, dz] = sphere.verts[i];
      const p = evaluateClusterRock(dx, dy, dz, cfg);
      rPositions.push(p.x, p.y, p.z);
      rMeta.push({ seamDepth: p.seamDepth, bedTone: p.bedTone, rockIdx: r });
    }
    for (let i = 0; i < sphere.indices.length; i++) {
      rIndices.push(baseIdx + sphere.indices[i]);
    }
  }

  // Calibrate merged cluster rock bounds cleanly to X in [-1.10, +1.10] (2.2m), Z in [-0.95, +0.95] (1.9m), Y in [-0.30, +0.78]
  // (leaving +0.78..+0.85 for the velvety moss crest -> exact combined height 1.15m!)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < rPositions.length; i += 3) {
    if (rPositions[i] < minX) minX = rPositions[i];
    if (rPositions[i] > maxX) maxX = rPositions[i];
    if (rPositions[i + 1] < minY) minY = rPositions[i + 1];
    if (rPositions[i + 1] > maxY) maxY = rPositions[i + 1];
    if (rPositions[i + 2] < minZ) minZ = rPositions[i + 2];
    if (rPositions[i + 2] > maxZ) maxZ = rPositions[i + 2];
  }
  const mapX = (vx) => -1.10 + ((vx - minX) / (maxX - minX)) * 2.20;
  const mapY = (vy) => -0.30 + ((vy - minY) / (maxY - minY)) * 1.08; // -0.30..+0.78
  const mapZ = (vz) => -0.95 + ((vz - minZ) / (maxZ - minZ)) * 1.90;

  for (let i = 0; i < rPositions.length; i += 3) {
    rPositions[i] = mapX(rPositions[i]);
    rPositions[i + 1] = mapY(rPositions[i + 1]);
    rPositions[i + 2] = mapZ(rPositions[i + 2]);
  }

  // Vertex colors for bright dry-air limestone (#9a9384) — Holodeck applies underwater turquoise absorption & caustics!
  const rColors = [];
  for (let i = 0; i < rMeta.length; i++) {
    const x = rPositions[i * 3];
    const y = rPositions[i * 3 + 1];
    const z = rPositions[i * 3 + 2];
    const m = rMeta[i];

    // Slight tonal variation per interlocking boulder so each stone reads distinctly yet cohesively
    const rockShift = (m.rockIdx % 2 === 0 ? 0.03 : -0.025) + (m.rockIdx === 2 ? 0.04 : 0);
    let r = 1.00 + rockShift;
    let g = 1.00 + rockShift;
    let b = 0.99 + rockShift * 0.95;

    // Sedimentary strata bands
    const band = 0.11 * m.bedTone + 0.06 * Math.sin(y * 5.8 + x * 0.7);
    r += band;
    g += band * 0.99;
    b += band * 0.96;

    // Bedding crevice AO
    const cav = 1.0 - 0.34 * m.seamDepth;
    r *= cav;
    g *= cav;
    b *= cav * 1.02;

    // Interlocking pocket AO where rocks meet tightly near cluster core
    const coreDist = Math.hypot(x * 0.9, z * 0.9);
    if (y < 0.25 && coreDist < 0.72) {
      const pocket = clamp01((0.25 - y) / 0.50) * clamp01((0.72 - coreDist) / 0.72);
      const pm = 1.0 - 0.22 * pocket;
      r *= pm;
      g *= pm;
      b *= pm;
    }

    // Subtle mossy staining near sunlit crests of mossy stones
    if (y > 0.32 && m.rockIdx !== 2) {
      const topT = clamp01((y - 0.32) / 0.46) * clamp01(0.45 + 0.55 * fbm3(x * 1.6, y * 1.6, z * 1.6, 2, 733));
      r *= 1.0 - 0.10 * topT;
      g *= 1.0 + 0.04 * topT;
      b *= 1.0 - 0.14 * topT;
    }

    const macro = 0.05 * fbm3(x * 1.1, y * 1.1, z * 1.1, 2, 787);
    rColors.push(clamp01(r + macro), clamp01(g + macro), clamp01(b + macro * 0.95));
  }

  let rockGeo = meshGeo({ positions: rPositions, indices: rIndices });
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rColors, 3));
  rockGeo = projectUV(rockGeo, { projection: 'box', metersPerUnit: 1.6 });
  rockGeo = remapUV(rockGeo, { scale: [0.80, 1.25] });
  rockGeo = creaseNormals(rockGeo, { angle: 56 });
  rockGeo = mergeVertices(rockGeo, { tolerance: 1e-4 });

  // Build organic 3D pillowed moss crests on the upper crowns of rocks 1, 2, and 4 (merged into 1 single mesh!)
  const mPositions = [];
  const mColors = [];
  const mIndices = [];

  function appendMossCap(cfg) {
    const rings = 7;
    const segs = 20;

    function samplePt(rho, theta) {
      const lobe =
        0.88 +
        0.16 * Math.cos(2 * theta + cfg.seed) +
        0.12 * Math.sin(3 * theta - cfg.seed * 0.7) +
        0.08 * Math.cos(5 * theta + cfg.seed * 1.3);
      const maxAlpha = clamp01(lobe * cfg.mossCoverage) * Math.PI * 0.85;
      const alpha = rho * maxAlpha;

      const dx = Math.sin(alpha) * Math.cos(theta);
      const dy = Math.cos(alpha);
      const dz = Math.sin(alpha) * Math.sin(theta);

      const raw = evaluateClusterRock(dx, dy, dz, cfg);
      const bx = mapX(raw.x);
      const by = mapY(raw.y);
      const bz = mapZ(raw.z);

      const coreX = mapX(cfg.cx);
      const coreY = mapY(cfg.cy);
      const coreZ = mapZ(cfg.cz);
      let nx = bx - coreX;
      let ny = by - coreY + 0.12;
      let nz = bz - coreZ;
      const nl = Math.hypot(nx, ny, nz) + 1e-6;
      nx /= nl;
      ny /= nl;
      nz /= nl;

      const edgeProfile = Math.pow(Math.max(0, 1.0 - Math.pow(rho, 3.6)), 0.62);
      const tuft = 0.5 + 0.5 * fbm3(bx * 2.2, by * 2.2, bz * 2.2, 3, 911 + cfg.seed);
      const pillow = (0.032 + cfg.mossThick * (0.48 + 0.72 * tuft)) * edgeProfile;

      const tx = bx + nx * pillow;
      const ty = by + ny * pillow + 0.018 * edgeProfile;
      const tz = bz + nz * pillow;

      const ix = bx - nx * 0.065;
      const iy = by - ny * 0.065;
      const iz = bz - nz * 0.065;

      const sun = clamp01((ty - 0.30) / 0.55) * (0.45 + 0.55 * edgeProfile);
      const cr = 0.85 + 0.22 * sun + 0.08 * (tuft - 0.5);
      const cg = 0.91 + 0.18 * sun + 0.08 * (tuft - 0.5);
      const cb = 0.80 + 0.12 * sun;

      return {
        top: [Math.max(-1.09, Math.min(1.09, tx)), ty, Math.max(-0.94, Math.min(0.94, tz))],
        bot: [Math.max(-1.08, Math.min(1.08, ix)), iy, Math.max(-0.93, Math.min(0.93, iz))],
        col: [clamp01(cr), clamp01(cg), clamp01(cb)],
      };
    }

    const cS = samplePt(0, 0);
    const topCenter = mPositions.length / 3;
    mPositions.push(cS.top[0], cS.top[1], cS.top[2]);
    mColors.push(cS.col[0], cS.col[1], cS.col[2]);

    const topRings = [];
    for (let r = 1; r <= rings; r++) {
      const rho = r / rings;
      topRings.push(mPositions.length / 3);
      for (let s = 0; s < segs; s++) {
        const p = samplePt(rho, (s / segs) * Math.PI * 2);
        mPositions.push(p.top[0], p.top[1], p.top[2]);
        mColors.push(p.col[0], p.col[1], p.col[2]);
      }
    }

    const botCenter = mPositions.length / 3;
    mPositions.push(cS.bot[0], cS.bot[1], cS.bot[2]);
    mColors.push(0.55, 0.62, 0.48);

    const botRings = [];
    for (let r = 1; r <= rings; r++) {
      const rho = r / rings;
      botRings.push(mPositions.length / 3);
      for (let s = 0; s < segs; s++) {
        const p = samplePt(rho, (s / segs) * Math.PI * 2);
        mPositions.push(p.bot[0], p.bot[1], p.bot[2]);
        mColors.push(0.55, 0.62, 0.48);
      }
    }

    // Top dome (+Y outward)
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      mIndices.push(topCenter, topRings[0] + next, topRings[0] + s);
    }
    for (let r = 0; r < rings - 1; r++) {
      const r0 = topRings[r];
      const r1 = topRings[r + 1];
      for (let s = 0; s < segs; s++) {
        const next = (s + 1) % segs;
        mIndices.push(r0 + s, r0 + next, r1 + next);
        mIndices.push(r0 + s, r1 + next, r1 + s);
      }
    }
    // Bottom tucked skin (-Y outward)
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      mIndices.push(botCenter, botRings[0] + s, botRings[0] + next);
    }
    for (let r = 0; r < rings - 1; r++) {
      const r0 = botRings[r];
      const r1 = botRings[r + 1];
      for (let s = 0; s < segs; s++) {
        const next = (s + 1) % segs;
        mIndices.push(r0 + s, r1 + next, r0 + next);
        mIndices.push(r0 + s, r1 + s, r1 + next);
      }
    }
    // Outer seam rim
    const tOut = topRings[rings - 1];
    const bOut = botRings[rings - 1];
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      mIndices.push(tOut + s, tOut + next, bOut + next);
      mIndices.push(tOut + s, bOut + next, bOut + s);
    }
  }

  for (let i = 0; i < rocks.length; i++) {
    if (rocks[i].moss) appendMossCap(rocks[i]);
  }

  // Calibrate highest moss peak cleanly to exact +0.85m (so total asset height = 0.85 - (-0.30) = 1.15m!)
  let peakY = -Infinity;
  for (let i = 1; i < mPositions.length; i += 3) {
    if (mPositions[i] > peakY) peakY = mPositions[i];
  }
  const liftFloor = 0.50;
  if (peakY > liftFloor) {
    const sc = (0.85 - liftFloor) / (peakY - liftFloor);
    for (let i = 1; i < mPositions.length; i += 3) {
      if (mPositions[i] > liftFloor) {
        mPositions[i] = liftFloor + (mPositions[i] - liftFloor) * sc;
      }
    }
  }

  let mossGeo = meshGeo({ positions: mPositions, indices: mIndices });
  mossGeo.setAttribute('color', new THREE.Float32BufferAttribute(mColors, 3));
  mossGeo = projectUV(mossGeo, { projection: 'box', metersPerUnit: 1.2 });
  mossGeo = creaseNormals(mossGeo, { angle: 82 });
  mossGeo = mergeVertices(mossGeo, { tolerance: 1e-4 });

  return { rockGeo, mossGeo };
}

async function createMaterials() {
  const [rockNormal, rockArm] = await Promise.all([
    loadApprovedTexture('kiln.texture.rock-face-normal.v1'),
    loadApprovedTexture('kiln.texture.rock-face-arm.v1'),
  ]);

  // Dry-air pale weathered limestone (#9a9384) so submerged reef placements receive turquoise absorption & caustics authentically!
  const beds = {
    cellsX: 5,
    cellsY: 10,
    seed: 613,
    jitterX: 0.90,
    jitterY: 0.48,
    metricX: 1,
    metricY: 2.1,
    weight: 0.44,
  };
  const facets = { ...beds, feature: 'facet', facetSlope: 0.78, facetBlend: 0.30 };
  const joints = { ...beds, feature: 'border', borderOpen: 0.48, borderWidth: 0.045, blend: 'multiply' };

  const rockAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'KarstReefLimestoneAlbedo',
    layers: [
      { op: 'cellular', ...beds, feature: 'cell', colorA: 0x8c8678, colorB: 0xaca596 },
      { op: 'stripes', colorA: 0x7b7568, colorB: 0xb2ab9c, count: 10, angleDeg: 90, blend: 'overlay', opacity: 0.30 },
      { op: 'noise', colorA: 0x706c62, colorB: 0xbeb7a8, scale: 10, octaves: 5, seed: 619, blend: 'overlay', opacity: 0.46 },
      { op: 'noise', colorA: 0x625e55, colorB: 0xc6bfb0, scale: 34, octaves: 4, seed: 631, blend: 'overlay', opacity: 0.42 },
      { op: 'cellular', ...facets, colorA: 0x8a8a8a, colorB: 0xffffff, blend: 'multiply', opacity: 0.22 },
      { op: 'cellular', ...joints, colorA: 0xffffff, colorB: 0x524f47, opacity: 0.48 },
    ],
  });

  const rockMat = pbrMaterial({
    albedo: rockAlbedo,
    normal: rockNormal,
    metallicRoughness: rockArm,
    roughness: 0.91,
    metalness: 0,
    name: 'KarstReefLimestone',
  });
  rockMat.normalScale.set(1.35, 1.35);
  rockMat.vertexColors = true;

  // Cenote Moss Crests (#466931, roughness 0.92)
  const packed = (r) => (255 << 16) | (r << 8);
  const mossCells = {
    cellsX: 16,
    cellsY: 16,
    seed: 719,
    jitterX: 0.95,
    jitterY: 0.95,
    metricX: 1,
    metricY: 1,
    weight: 0.48,
  };
  const mossAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CenoteReefMossAlbedo',
    layers: [
      { op: 'solid', color: 0x466931 },
      { op: 'noise', colorA: 0x315021, colorB: 0x5d843e, scale: 11, octaves: 5, seed: 727, blend: 'normal', opacity: 0.72 },
      { op: 'cellular', ...mossCells, feature: 'f2-f1', range: 0.85, colorA: 0x365724, colorB: 0x58803a, blend: 'overlay', opacity: 0.32 },
      { op: 'noise', colorA: 0x284119, colorB: 0x648c44, scale: 48, octaves: 5, seed: 733, blend: 'overlay', opacity: 0.56 },
    ],
  });
  const mossHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CenoteReefMossHeight',
    layers: [
      { op: 'noise', colorA: 0x202020, colorB: 0xe0e0e0, scale: 14, octaves: 5, seed: 727 },
      { op: 'noise', colorA: 0x161616, colorB: 0xeaeaea, scale: 48, octaves: 5, seed: 733, blend: 'overlay', opacity: 0.64 },
    ],
  });
  const mossMR = proceduralTexture({
    schemaVersion: 2,
    size: 128,
    usage: 'metallicRoughness',
    name: 'CenoteReefMossMR',
    layers: [
      { op: 'noise', colorA: packed(230), colorB: packed(242), scale: 14, octaves: 3, seed: 739 },
    ],
  });

  const mossMat = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossHeight, { strength: 4.5, name: 'CenoteReefMossNormal' }),
    metallicRoughness: mossMR,
    roughness: 1,
    metalness: 1,
    name: 'CenoteMoss',
  });
  mossMat.vertexColors = true;

  return { rockMat, mossMat };
}

async function build() {
  const root = createRoot('MossyBoulderCluster');
  const { rockMat, mossMat } = await createMaterials();
  const { rockGeo, mossGeo } = buildClusterGeometry();

  createPart('KarstOutcropRocks', rockGeo, rockMat, { parent: root });
  createPart('OutcropMossCrests', mossGeo, mossMat, { parent: root });

  return root;
}
