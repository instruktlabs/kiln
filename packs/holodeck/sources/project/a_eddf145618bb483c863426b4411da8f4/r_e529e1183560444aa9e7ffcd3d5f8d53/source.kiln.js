const meta = {
  name: 'mossy-boulder-hero',
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

// Smooth minimum for crisp faceted limestone rock cleavage planes (never a blobby potato!)
function smin(a, b, k) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
}

// Build a uniform geodesic subdivided icosahedron (frequency N -> 20 * N * N triangles, ZERO poles, strictly CCW outward)
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

    // Barycentric grid rows i = 0..freq, j = 0..(freq - i)
    const rows = [];
    for (let i = 0; i <= freq; i++) {
      const row = [];
      for (let j = 0; j <= freq - i; j++) {
        const k = freq - i - j;
        const x = (A[0] * k + B[0] * i + C[0] * j) / freq;
        const y = (A[1] * k + B[1] * i + C[1] * j) / freq;
        const z = (A[2] * k + B[2] * i + C[2] * j) / freq;
        row.push(getVert(x, y, z));
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

// Sculpted angular-stratified karst limestone boulder evaluator on unit sphere direction [dx, dy, dz]
function evaluateHeroBoulder(dx, dy, dz) {
  // Asymmetric massive shore-boulder ellipsoid proportion (3.6m X x 2.0m Y x 2.9m Z)
  // Slightly wider heavy grounded base, stepped shoulder on +X/-Z, higher weathered crown toward -X/+Z
  let rx = 1.84;
  let ry = 1.06;
  let rz = 1.48;

  // Heavy lower foundation skirt flare so boulder sits solidly into sloped island banks
  const baseBroaden = 1.0 + 0.16 * clamp01(-dy + 0.25);
  let x = dx * rx * baseBroaden;
  let y = dy * ry + 0.62; // center near Y=0.62 so bottom reaches ~-0.35 and crown reaches ~+1.65
  let z = dz * rz * baseBroaden;

  // 8 crisp angled karst rock cleavage planes (creates authentic faceted limestone planes & beveled shelves!)
  const planes = [
    { nx:  0.86, ny:  0.42, nz:  0.28, d: 1.46 },
    { nx: -0.78, ny:  0.52, nz: -0.35, d: 1.42 },
    { nx:  0.22, ny:  0.94, nz:  0.24, d: 1.48 }, // weathered flat-ish tilted sunlit top ledge
    { nx: -0.26, ny:  0.88, nz: -0.39, d: 1.56 }, // secondary stepped upper limestone shoulder
    { nx:  0.34, ny:  0.30, nz:  0.89, d: 1.24 },
    { nx: -0.32, ny:  0.24, nz: -0.92, d: 1.28 },
    { nx:  0.72, ny: -0.22, nz: -0.66, d: 1.38 },
    { nx: -0.68, ny: -0.18, nz:  0.71, d: 1.34 },
  ];

  let scaleClip = 1.0;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    const proj = (x * p.nx + (y - 0.58) * p.ny + z * p.nz);
    if (proj > 0.05) {
      const ratio = p.d / proj;
      scaleClip = smin(scaleClip, ratio, 0.12);
    }
  }

  x *= scaleClip;
  y = 0.58 + (y - 0.58) * scaleClip;
  z *= scaleClip;

  // Horizontal sedimentary karst limestone bedding cracks & terraced ledges (3 clear horizontal seams!)
  const yBed = y + 0.12 * Math.sin(x * 0.9 + z * 0.7) + 0.07 * fbm3(x * 0.8, y * 0.8, z * 0.8, 2, 111);
  const strataPhase = yBed * 1.95;
  const bedIdx = Math.floor(strataPhase);
  const f = strataPhase - bedIdx;
  let seamCut = 0;
  if (f < 0.18) {
    seamCut = -0.11 * Math.sin((f / 0.18) * Math.PI);
  }
  const bedLedge = (hash3(bedIdx, 5, 17, 211) * 2 - 1) * 0.095 + (f > 0.20 ? 0.045 * smoothstep(clamp01((f - 0.20) / 0.25)) : 0);

  // Diagonal karst fissure splitting across the front-right shoulder
  const fissDist = Math.abs(x * 0.55 - z * 0.83 + 0.18 * y - 0.22);
  const diagCrack = fissDist < 0.26 ? -0.13 * Math.pow(1 - smoothstep(fissDist / 0.26), 2) * clamp01(y + 0.2) : 0;

  // Macro rocky blockiness + crisp weathered karst crags (clean macro planes, normal map carries micro-grain)
  const nMacro = 0.17 * fbm3(dx * 1.85, dy * 2.1, dz * 1.85, 3, 307);
  const nCrag = 0.055 * (ridged3(dx * 3.4, dy * 3.8, dz * 3.4, 3, 419) - 0.48);

  const radialOffset = bedLedge + seamCut + diagCrack + nMacro + nCrag;
  const hLen = Math.hypot(x, z) + 1e-6;
  x += (x / hLen) * radialOffset;
  z += (z / hLen) * radialOffset;
  y += nMacro * 0.45 + nCrag * 0.35 + diagCrack * 0.35;

  // Flatten and extend the buried embedding skirt gently below Y = 0 down to Y = -0.35m
  if (y < -0.05) {
    y = -0.05 + (y + 0.05) * 0.62;
  }

  return {
    x,
    y,
    z,
    seamDepth: clamp01(-(seamCut + diagCrack) / 0.16),
    bedTone: hash3(bedIdx, 9, 27, 251) * 2 - 1,
  };
}

function buildHeroBoulderAndMoss() {
  // Geodesic sphere freq 15 => 20 * 225 = 4,500 tris (clean, uniform, zero poles!)
  const sphere = createGeodesicSphere(15);
  const positions = [];
  const meta = [];

  for (let i = 0; i < sphere.verts.length; i++) {
    const [dx, dy, dz] = sphere.verts[i];
    const p = evaluateHeroBoulder(dx, dy, dz);
    positions.push(p.x, p.y, p.z);
    meta.push({ dx, dy, dz, seamDepth: p.seamDepth, bedTone: p.bedTone });
  }

  // Calibrate boulder bounds accurately to X in [-1.80, +1.80] (3.6m), Z in [-1.45, +1.45] (2.9m), Y in [-0.35, +1.56]
  // (leaving +1.56..+1.65 for the pillowed 3D velvety moss crown -> exact combined height 2.00m!)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }
  const mapX = (vx) => -1.8 + ((vx - minX) / (maxX - minX)) * 3.6;
  const mapY = (vy) => -0.35 + ((vy - minY) / (maxY - minY)) * 1.91; // -0.35 .. +1.56
  const mapZ = (vz) => -1.45 + ((vz - minZ) / (maxZ - minZ)) * 2.9;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = mapX(positions[i]);
    positions[i + 1] = mapY(positions[i + 1]);
    positions[i + 2] = mapZ(positions[i + 2]);
  }

  // Vertex colors for weathered stratified karst limestone (authored in DRY AIR colors #8e897d!)
  const colors = [];
  for (let i = 0; i < meta.length; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const m = meta[i];

    let r = 0.99;
    let g = 0.99;
    let b = 0.98;

    // Horizontal limestone strata tonal variation (#6d6a62..#a7a092)
    const band = 0.13 * m.bedTone + 0.07 * Math.sin(y * 3.8 + x * 0.5);
    r += band;
    g += band * 0.99;
    b += band * 0.96;

    // Horizontal bedding crevices & diagonal fissure AO
    const cav = 1.0 - 0.36 * m.seamDepth;
    r *= cav;
    g *= cav;
    b *= cav * 1.02;

    // Subtle damp mineral darkening near shore waterline / base skirt (Y < 0.25m)
    if (y < 0.25) {
      const wet = clamp01((0.25 - y) / 0.60);
      r *= 1.0 - 0.22 * wet;
      g *= 1.0 - 0.19 * wet;
      b *= 1.0 - 0.17 * wet;
    }

    // Gentle sunlit crown pale buff limestone highlight & subtle moss-transition stain
    if (y > 0.85) {
      const topT = clamp01((y - 0.85) / 0.72);
      const patch = clamp01(0.45 + 0.55 * fbm3(x * 1.1, y * 1.1, z * 1.1, 2, 541));
      r *= 1.0 + 0.06 * topT - 0.12 * topT * patch;
      g *= 1.0 + 0.06 * topT + 0.04 * topT * patch;
      b *= 1.0 + 0.03 * topT - 0.16 * topT * patch;
    }

    const macro = 0.06 * fbm3(x * 0.65, y * 0.65, z * 0.65, 2, 601);
    colors.push(clamp01(r + macro), clamp01(g + macro), clamp01(b + macro * 0.96));
  }

  let rockGeo = meshGeo({ positions, indices: sphere.indices });
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  rockGeo = projectUV(rockGeo, { projection: 'box', metersPerUnit: 2.2 });
  rockGeo = remapUV(rockGeo, { scale: [0.78, 1.25] });
  rockGeo = creaseNormals(rockGeo, { angle: 56 });
  rockGeo = mergeVertices(rockGeo, { tolerance: 1e-4 });

  // Build thick pillowed velvety 3D moss cap hugging the boulder's sunlit upper shoulders!
  // Uses polar cap grid projected directly onto the EXACT calibrated boulder surface + controlled pillow thickness!
  const rings = 14;
  const segs = 32;
  const topPts = [];
  const botPts = [];
  const topCols = [];
  const botCols = [];

  // Organic scalloped moss apron coverage (covers sunlit crown & hugs upper shoulders smoothly with zero pinholes!)
  function sampleMossPoint(rho, theta) {
    // Softly lobed natural moss cushion footprint (avoids thin pointed tips that could clip rock ridges)
    const lobe =
      0.86 +
      0.13 * Math.cos(2 * theta - 0.5) +
      0.09 * Math.sin(3 * theta + 0.8) +
      0.06 * Math.cos(4 * theta - 0.3) +
      0.05 * fbm3(Math.cos(theta) * 1.4, 0.7, Math.sin(theta) * 1.4, 2, 709);
    const maxAlpha = clamp01(lobe * 0.48) * Math.PI * 0.84;
    const alpha = rho * maxAlpha;

    // Slight offset toward the sheltered sunlit crown shoulder (-0.08 in X, +0.06 in Z)
    const sx = Math.sin(alpha) * Math.cos(theta);
    const sy = Math.cos(alpha);
    const sz = Math.sin(alpha) * Math.sin(theta);
    const dirLen = Math.hypot(sx - 0.06 * (1 - rho), sy + 0.12, sz + 0.04 * (1 - rho));
    const dx = (sx - 0.06 * (1 - rho)) / dirLen;
    const dy = (sy + 0.12) / dirLen;
    const dz = (sz + 0.04 * (1 - rho)) / dirLen;

    const raw = evaluateHeroBoulder(dx, dy, dz);
    const bx = mapX(raw.x);
    const by = mapY(raw.y);
    const bz = mapZ(raw.z);

    // Outward approximate normal direction from boulder core (0, 0.45, 0)
    let nx = bx;
    let ny = by - 0.45;
    let nz = bz;
    const nl = Math.hypot(nx, ny, nz) + 1e-6;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    // Plush pillowed moss cushions across entire crown, curving smoothly into stone at perimeter with zero pinholes!
    const edgeProfile = Math.pow(Math.max(0, 1.0 - Math.pow(rho, 4.5)), 0.45);
    const tuft = 0.5 + 0.5 * fbm3(bx * 1.5, by * 1.5, bz * 1.5, 3, 811);
    const clump = 0.5 + 0.5 * ridged3(bx * 2.4, by * 2.4, bz * 2.4, 2, 853);
    const pillow = (0.095 + 0.095 * tuft + 0.045 * clump) * edgeProfile;

    // Outer pillow surface sits cleanly outside rock; bottom surface tucks -0.10m inside rock!
    const tx = bx + nx * pillow;
    const ty = by + ny * pillow + 0.035 * edgeProfile;
    const tz = bz + nz * pillow;

    const ix = bx - nx * 0.10;
    const iy = by - ny * 0.10;
    const iz = bz - nz * 0.10;

    // Rich sunlit olive-emerald pillow variation
    const sun = clamp01((ty - 0.85) / 0.80) * (0.45 + 0.55 * edgeProfile);
    const cr = 0.84 + 0.22 * sun + 0.08 * (tuft - 0.5);
    const cg = 0.90 + 0.18 * sun + 0.08 * (tuft - 0.5);
    const cb = 0.78 + 0.12 * sun;

    return {
      top: [tx, ty, tz],
      bot: [ix, iy, iz],
      col: [clamp01(cr), clamp01(cg), clamp01(cb)],
    };
  }

  const mPositions = [];
  const mColors = [];
  const mIndices = [];

  // Center crown vertices
  const cSample = sampleMossPoint(0, 0);
  const topCenterIdx = 0;
  mPositions.push(cSample.top[0], cSample.top[1], cSample.top[2]);
  mColors.push(cSample.col[0], cSample.col[1], cSample.col[2]);

  const topRingStarts = [];
  for (let r = 1; r <= rings; r++) {
    const rho = r / rings;
    topRingStarts.push(mPositions.length / 3);
    for (let s = 0; s < segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const p = sampleMossPoint(rho, theta);
      mPositions.push(p.top[0], p.top[1], p.top[2]);
      mColors.push(p.col[0], p.col[1], p.col[2]);
    }
  }

  const botCenterIdx = mPositions.length / 3;
  mPositions.push(cSample.bot[0], cSample.bot[1], cSample.bot[2]);
  mColors.push(0.55, 0.62, 0.48);

  const botRingStarts = [];
  for (let r = 1; r <= rings; r++) {
    const rho = r / rings;
    botRingStarts.push(mPositions.length / 3);
    for (let s = 0; s < segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const p = sampleMossPoint(rho, theta);
      mPositions.push(p.bot[0], p.bot[1], p.bot[2]);
      mColors.push(0.55, 0.62, 0.48);
    }
  }

  // Calibrate top moss crown maxY cleanly to exact +1.65m (so total asset height = 1.65 - (-0.35) = 2.00m!)
  let mossPeakY = -Infinity;
  for (let i = 0; i < botCenterIdx; i++) {
    if (mPositions[i * 3 + 1] > mossPeakY) mossPeakY = mPositions[i * 3 + 1];
  }
  if (mossPeakY > 1.2) {
    const targetPeak = 1.65;
    const floorY = 1.15;
    const scaleY = (targetPeak - floorY) / (mossPeakY - floorY);
    for (let i = 0; i < botCenterIdx; i++) {
      if (mPositions[i * 3 + 1] > floorY) {
        mPositions[i * 3 + 1] = floorY + (mPositions[i * 3 + 1] - floorY) * scaleY;
      }
    }
  }

  // Clamp moss horizontal extents safely inside boulder bounds ([-1.80..+1.80], [-1.45..+1.45])
  for (let i = 0; i < mPositions.length; i += 3) {
    mPositions[i] = Math.max(-1.79, Math.min(1.79, mPositions[i]));
    mPositions[i + 2] = Math.max(-1.44, Math.min(1.44, mPositions[i + 2]));
  }

  // Top dome skin (+Y outward: theta runs +X -> +Z, so center -> s+1 -> s is +Y outward!)
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    mIndices.push(topCenterIdx, topRingStarts[0] + next, topRingStarts[0] + s);
  }
  for (let r = 0; r < rings - 1; r++) {
    const r0 = topRingStarts[r];
    const r1 = topRingStarts[r + 1];
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      mIndices.push(r0 + s, r0 + next, r1 + next);
      mIndices.push(r0 + s, r1 + next, r1 + s);
    }
  }

  // Bottom tucked skin (-Y outward: reversed)
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    mIndices.push(botCenterIdx, botRingStarts[0] + s, botRingStarts[0] + next);
  }
  for (let r = 0; r < rings - 1; r++) {
    const r0 = botRingStarts[r];
    const r1 = botRingStarts[r + 1];
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      mIndices.push(r0 + s, r1 + next, r0 + next);
      mIndices.push(r0 + s, r1 + s, r1 + next);
    }
  }

  // Perimeter rim closing top outer ring to bottom outer ring
  const tOut = topRingStarts[rings - 1];
  const bOut = botRingStarts[rings - 1];
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    mIndices.push(tOut + s, tOut + next, bOut + next);
    mIndices.push(tOut + s, bOut + next, bOut + s);
  }

  let mossGeo = meshGeo({ positions: mPositions, indices: mIndices });
  mossGeo.setAttribute('color', new THREE.Float32BufferAttribute(mColors, 3));
  mossGeo = projectUV(mossGeo, { projection: 'box', metersPerUnit: 1.4 });
  mossGeo = creaseNormals(mossGeo, { angle: 82 });
  mossGeo = mergeVertices(mossGeo, { tolerance: 1e-4 });

  return { rockGeo, mossGeo };
}

async function createMaterials() {
  const [rockNormal, rockArm] = await Promise.all([
    loadApprovedTexture('kiln.texture.rock-face-normal.v1'),
    loadApprovedTexture('kiln.texture.rock-face-arm.v1'),
  ]);

  // Cohesive Stratified Karst Limestone (#8e897d, strata #6d6a62..#a7a092, roughness 0.86..0.94)
  const beds = {
    cellsX: 5,
    cellsY: 11,
    seed: 421,
    jitterX: 0.90,
    jitterY: 0.48,
    metricX: 1,
    metricY: 2.2,
    weight: 0.44,
  };
  const facets = { ...beds, feature: 'facet', facetSlope: 0.80, facetBlend: 0.30 };
  const joints = { ...beds, feature: 'border', borderOpen: 0.50, borderWidth: 0.045, blend: 'multiply' };

  const rockAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'KarstBoulderAlbedo',
    layers: [
      { op: 'cellular', ...beds, feature: 'cell', colorA: 0x807c72, colorB: 0xa29c8f },
      { op: 'stripes', colorA: 0x6d6a62, colorB: 0xa7a092, count: 10, angleDeg: 90, blend: 'overlay', opacity: 0.32 },
      { op: 'noise', colorA: 0x626059, colorB: 0xb4aea2, scale: 9, octaves: 5, seed: 433, blend: 'overlay', opacity: 0.46 },
      { op: 'noise', colorA: 0x56544d, colorB: 0xbdb7a9, scale: 34, octaves: 4, seed: 439, blend: 'overlay', opacity: 0.44 },
      { op: 'cellular', ...facets, colorA: 0x888888, colorB: 0xffffff, blend: 'multiply', opacity: 0.24 },
      { op: 'cellular', ...joints, colorA: 0xffffff, colorB: 0x45443e, opacity: 0.50 },
    ],
  });

  const rockMat = pbrMaterial({
    albedo: rockAlbedo,
    normal: rockNormal,
    metallicRoughness: rockArm,
    roughness: 0.92,
    metalness: 0,
    name: 'KarstLimestone',
  });
  rockMat.normalScale.set(1.4, 1.4);
  rockMat.vertexColors = true;

  // Velvety Cenote Moss Cap (#3d5f2b / #4f7436, roughness 0.92)
  const packed = (r) => (255 << 16) | (r << 8);
  const mossCells = {
    cellsX: 18,
    cellsY: 18,
    seed: 511,
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
    name: 'CenoteMossAlbedo',
    layers: [
      { op: 'solid', color: 0x466b30 },
      { op: 'noise', colorA: 0x2e4c1e, colorB: 0x5c833d, scale: 11, octaves: 5, seed: 523, blend: 'normal', opacity: 0.72 },
      { op: 'cellular', ...mossCells, feature: 'f2-f1', range: 0.85, colorA: 0x345423, colorB: 0x567e39, blend: 'overlay', opacity: 0.32 },
      { op: 'noise', colorA: 0x274018, colorB: 0x628a42, scale: 50, octaves: 5, seed: 529, blend: 'overlay', opacity: 0.58 },
    ],
  });
  const mossHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CenoteMossHeight',
    layers: [
      { op: 'noise', colorA: 0x202020, colorB: 0xe0e0e0, scale: 14, octaves: 5, seed: 523 },
      { op: 'noise', colorA: 0x161616, colorB: 0xeaeaea, scale: 48, octaves: 5, seed: 529, blend: 'overlay', opacity: 0.65 },
    ],
  });
  const mossMR = proceduralTexture({
    schemaVersion: 2,
    size: 128,
    usage: 'metallicRoughness',
    name: 'CenoteMossMR',
    layers: [
      { op: 'noise', colorA: packed(230), colorB: packed(242), scale: 14, octaves: 3, seed: 539 },
    ],
  });

  const mossMat = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossHeight, { strength: 4.5, name: 'CenoteMossNormal' }),
    metallicRoughness: mossMR,
    roughness: 1,
    metalness: 1,
    name: 'CenoteMoss',
  });
  mossMat.vertexColors = true;

  return { rockMat, mossMat };
}

async function build() {
  const root = createRoot('MossyBoulderHero');
  const { rockMat, mossMat } = await createMaterials();
  const { rockGeo, mossGeo } = buildHeroBoulderAndMoss();

  createPart('KarstBoulderBody', rockGeo, rockMat, { parent: root });
  createPart('VelvetMossCap', mossGeo, mossMat, { parent: root });

  return root;
}
