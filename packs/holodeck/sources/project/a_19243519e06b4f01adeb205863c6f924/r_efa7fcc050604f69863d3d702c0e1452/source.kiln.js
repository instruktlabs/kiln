const meta = {
  name: 'karst-overhang-ledge',
  role: 'ground',
};

// Deterministic 3D value noise & FBM
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
    freq *= 2.07;
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

// Horizontal karst sedimentary limestone strata shelves & recessed bedding seams
function strataProfile(y, z) {
  // Natural slight geological dip/undulation along the 15m cenote wall
  const yBed = y + 0.22 * Math.sin(z * 0.24 + 0.5) + 0.14 * Math.cos(z * 0.52 - 0.8);
  // 5-6 bold blocky limestone beds (~1.05m average bed thickness)
  const phase = yBed * 0.96;
  const bedIdx = Math.floor(phase);
  const f = phase - bedIdx; // 0..1 within a limestone course

  // Sharp recessed bedding crevice at bottom of each course
  let seam = 0;
  if (f < 0.20) {
    const t = f / 0.20;
    seam = -0.56 * Math.sin(t * Math.PI);
  }
  // Each sedimentary course protrudes boldly in stepped horizontal limestone slabs
  const bedStep = (hash3(bedIdx, 11, 23, 107) * 2 - 1) * 0.52;
  const upperLip = f > 0.22 ? 0.26 * smoothstep(clamp01((f - 0.22) / 0.22)) : 0;

  // Finer secondary sedimentary bedding seams inside each main limestone block
  const subP = yBed * 2.65 + 0.25 * noise3(0.5, y * 0.4, z * 0.35, 199);
  const sf = subP - Math.floor(subP);
  const subSeam = sf < 0.16 ? -0.18 * Math.sin((sf / 0.16) * Math.PI) : 0.05;

  return {
    offset: bedStep + upperLip + seam + subSeam,
    seamDepth: clamp01(-(seam + subSeam) / 0.56),
    bedTone: hash3(bedIdx, 3, 19, 131) * 2 - 1, // -1..1 distinct rock course tone
  };
}

// Deep vertical / slightly diagonal karst fracture clefts dividing the cliff brow into rugged rock buttresses
function karstFissure(z, y) {
  const clefts = [
    { z0: -4.9, slope: 0.10, width: 0.72, depth: 0.95 },
    { z0: -1.65, slope: -0.08, width: 0.82, depth: 1.15 },
    { z0: 1.85, slope: 0.12, width: 0.78, depth: 1.05 },
    { z0: 4.95, slope: -0.09, width: 0.68, depth: 0.88 },
  ];
  let cut = 0;
  for (let i = 0; i < clefts.length; i++) {
    const c = clefts[i];
    const zc = c.z0 + c.slope * (y - 1.5) + 0.26 * noise3(0.4, y * 0.38, c.z0, 307 + i * 29);
    const d = Math.abs(z - zc) / c.width;
    if (d < 1) {
      const k = 1 - smoothstep(d);
      cut = Math.max(cut, k * k * c.depth);
    }
  }
  return cut;
}

// Natural undulating rocky skyline height at (x, z)
function cliffTopY(x, z) {
  const zAbs = Math.abs(z) / 7.5;
  // Natural stepped rock crest dipping slightly toward the overlapping flank ends
  const flankDrop = 0.58 * Math.pow(clamp01((zAbs - 0.55) / 0.45), 1.8);
  const xNorm = clamp01((x + 4.5) / 8.5);
  // Broad craggy rock rises along Z so skyline never reads as a flat ruler
  const skyline =
    0.34 * Math.sin(z * 0.48 + 0.4) +
    0.22 * Math.cos(z * 1.05 - 0.9) +
    0.30 * fbm3(x * 0.24, 1.7, z * 0.25, 3, 419);
  const fissDip = -0.35 * karstFissure(z, 4.2) * (0.4 + 0.6 * xNorm);
  // Slight terraced drop toward outer cliff lip
  const lipSlope = -0.32 * Math.pow(xNorm, 1.9);
  return 4.38 - flankDrop + skyline + fissDip + lipSlope;
}

// Front cliff brow overhang reach (+X) for the vertical stratified brow (Y >= browY)
function cliffBrowX(y, z) {
  const zAbs = Math.abs(z) / 7.5;
  // Smooth organic wrap-back at ends so modules overlap seamlessly around the circular cenote rim
  const wrapBack = 1.65 * Math.pow(clamp01((zAbs - 0.58) / 0.42), 1.75);
  // 3 bold jutting karst rock buttresses separated by recessed clefts
  const buttress =
    0.72 * Math.cos(z * 0.46 - 0.25) +
    0.42 * Math.sin(z * 0.92 + 0.8) +
    0.45 * fbm3(0.4, y * 0.22, z * 0.28, 3, 521);

  // Upper brow steps progressively outward toward the top rim (dramatic overhanging limestone cliff!)
  const browT = clamp01((y - 0.2) / 4.2);
  const stepForward = mix(2.55, 3.65, Math.pow(browT, 0.72));

  const st = strataProfile(y, z);
  const fiss = karstFissure(z, y);
  const crag = 0.28 * (ridged3(0.7, y * 0.6, z * 0.55, 3, 617) - 0.42);

  const x = stepForward + buttress - wrapBack + st.offset - fiss + crag;
  return {
    x: Math.max(-2.4, Math.min(4.02, x)),
    seamDepth: st.seamDepth,
    bedTone: st.bedTone,
    fissure: fiss,
  };
}

// Lower brow lip height (where vertical stratified brow turns sharply inward under the vaulted overhang!)
function browTurnY(z) {
  return (
    0.35 +
    0.34 * Math.sin(z * 0.42 + 0.8) +
    0.20 * Math.cos(z * 0.95 - 0.4) +
    0.22 * fbm3(1.4, 0.3, z * 0.35, 2, 743)
  );
}

// Vaulted concave cave overhang soffit (sweeps sharply back horizontally under the brow, then down into deep throat!)
function soffitPoint(t, z, yMid, xMid, yThroat, xThroat) {
  // t = 0 at outer overhanging brow lip (xMid, yMid), t = 1 at deep recessed grotto throat (xThroat, yThroat)
  // True concave cave vault: moves rapidly inward in X first (creating a genuine overhanging ceiling!), then sweeps down in Y!
  const xCurve = 1.0 - Math.pow(t, 0.58);
  const yCurve = Math.pow(t, 1.52);

  // Scalloped horizontal karst dissolution arches & hanging ceiling ribs along Z
  const archVault = 0.48 * Math.sin(t * Math.PI) * Math.sin(z * 0.58 + 0.3);
  const ceilingRib = -0.34 * Math.sin(t * Math.PI) * ridged3(xMid * 0.35, t * 2.4, z * 0.52, 3, 811);
  const strataStep = 0.24 * Math.sin(t * Math.PI * 5.0 + 0.6 * Math.sin(z * 0.35));

  const x = mix(xThroat, xMid, xCurve) + strataStep * (1 - t * 0.5);
  const y = mix(yMid, yThroat, yCurve) + archVault + ceilingRib;

  const st = strataProfile(y, z);
  const fiss = karstFissure(z, y) * (1 - 0.55 * t);
  return {
    x: Math.max(-3.8, x - fiss * 0.45 + st.offset * 0.35),
    y: Math.max(-3.5, y),
    seamDepth: st.seamDepth,
    bedTone: st.bedTone,
    fissure: fiss,
  };
}

function buildKarstCliffGeometry() {
  const NZ = 68;
  const nTop = 10;    // back-top -> front-top cliff lip
  const nFront = 18;  // bold vertical stratified cliff brow
  const nSoffit = 16; // deeply vaulted horizontal-to-vertical concave grotto ceiling!
  const nBot = 3;     // recessed throat -> buried bottom back
  const nBack = 7;    // buried back wall
  const NS = nTop + nFront + nSoffit + nBot + nBack; // 54 ring vertices

  // Z stations clustered tightly at both flanks so the +/-7.5m ends sculpt into organic rounded rocky crags!
  const zStations = [];
  for (let iz = 0; iz <= NZ; iz++) {
    const u = (iz / NZ) * 2 - 1; // -1..1
    // Smooth cosine blend near endpoints gives crisp sculpted rock end-shoulders
    const z = 7.5 * (0.76 * u + 0.24 * Math.sin(u * Math.PI * 0.5));
    zStations.push(z);
  }

  const ringCount = NZ + 1;
  const positions = [];
  const indices = [];
  const metaList = [];

  for (let iz = 0; iz < ringCount; iz++) {
    const z = zStations[iz];
    const uEnd = Math.abs(iz / NZ * 2 - 1); // 0 at center, 1 at end caps
    // Organic rounded craggy end-nose taper (NO flat vertical cake-slice ends!)
    const shoulder = smoothstep(clamp01((uEnd - 0.80) / 0.20));
    const capShrink = shoulder * shoulder; // 0..1 over last 15% on each end

    const yMidBase = browTurnY(z);
    const browBottom = cliffBrowX(yMidBase, z);
    const topLipRaw = cliffBrowX(4.15, z);
    const yTopLip = cliffTopY(topLipRaw.x, z);
    const yThroat = -3.48 + 0.22 * fbm3(0.5, -3.3, z * 0.35, 2, 709) + capShrink * 1.15;
    const xThroat = -2.85 + 0.35 * fbm3(-2.6, -3.2, z * 0.3, 2, 719) - capShrink * 0.65;
    const xBack = -4.50 + capShrink * 0.35;

    // Pull outer lip smoothly back toward the buried rock core at extreme ends
    const xTopLip = mix(topLipRaw.x, xBack + 1.2, capShrink * 0.85);
    const xMid = mix(browBottom.x, xBack + 0.9, capShrink * 0.88);
    const yMid = mix(yMidBase, 0.8, capShrink * 0.5);

    for (let is = 0; is < NS; is++) {
      let x = 0;
      let y = 0;
      let seam = 0;
      let fiss = 0;
      let bedTone = 0;
      let zone = 0; // 0=top, 1=front brow, 2=vaulted soffit, 3=bottom, 4=back

      if (is < nTop) {
        zone = 0;
        const t = is / nTop;
        x = mix(xBack, xTopLip, t);
        y = cliffTopY(x, z) - capShrink * 0.85 + 0.12 * fbm3(x * 0.8, 2.2, z * 0.75, 2, 733);
        const st = strataProfile(y, z);
        bedTone = st.bedTone;
      } else if (is < nTop + nFront) {
        zone = 1;
        const t = (is - nTop) / nFront;
        y = mix(yTopLip - capShrink * 0.85, yMid, t);
        const cf = cliffBrowX(y, z);
        x = mix(cf.x, xBack + 0.9 + 0.35 * (1 - t), capShrink * 0.86);
        seam = cf.seamDepth;
        fiss = cf.fissure;
        bedTone = cf.bedTone;
      } else if (is < nTop + nFront + nSoffit) {
        zone = 2;
        const t = (is - nTop - nFront) / nSoffit;
        const sp = soffitPoint(t, z, yMid, xMid, yThroat, xThroat);
        x = mix(sp.x, xBack + 0.65, capShrink * 0.78);
        y = sp.y;
        seam = sp.seamDepth;
        fiss = sp.fissure;
        bedTone = sp.bedTone;
      } else if (is < nTop + nFront + nSoffit + nBot) {
        zone = 3;
        const t = (is - nTop - nFront - nSoffit) / nBot;
        x = mix(xThroat, xBack, t);
        y = yThroat + 0.10 * fbm3(x * 0.5, -3.4, z * 0.5, 2, 853);
      } else {
        zone = 4;
        const t = (is - nTop - nFront - nSoffit - nBot) / nBack;
        // Organic irregular back wall (buried in cliff terrain)
        x = xBack + 0.14 * fbm3(-4.4, t * 4.0, z * 0.38, 2, 887);
        const yBackTop = cliffTopY(xBack, z) - capShrink * 0.85;
        y = mix(yThroat, yBackTop, t);
      }

      // Sculpt rocky crag displacement along Z too (keeps ends organically jagged within +/-7.5m)
      const zCrag =
        iz > 0 && iz < NZ
          ? 0.22 * fbm3(x * 0.42, y * 0.42, z * 0.42, 2, 919) * (zone === 1 || zone === 2 ? 1.0 : 0.45)
          : 0;
      positions.push(x, y, z + zCrag);
      metaList.push({ zone, seam, fiss, bedTone, capShrink });
    }
  }

  // Calibrate rock bounds accurately: X in [-4.50, +4.00], Y in [-3.50, +4.62], Z in [-7.50, +7.50]
  // (Moss crown adds the velvety turf height cleanly up to Y = +5.00m!)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }
  const tMinX = -4.5, tMaxX = 4.0;
  const tMinY = -3.5, tMaxY = 4.62;
  const tMinZ = -7.5, tMaxZ = 7.5;
  const mapX = (vx) => tMinX + ((vx - minX) / (maxX - minX)) * (tMaxX - tMinX);
  const mapY = (vy) => tMinY + ((vy - minY) / (maxY - minY)) * (tMaxY - tMinY);
  const mapZ = (vz) => tMinZ + ((vz - minZ) / (maxZ - minZ)) * (tMaxZ - tMinZ);

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = mapX(positions[i]);
    positions[i + 1] = mapY(positions[i + 1]);
    positions[i + 2] = mapZ(positions[i + 2]);
  }

  // Side quads (CCW outward: dP/dz x dP/ds)
  for (let iz = 0; iz < NZ; iz++) {
    const r0 = iz * NS;
    const r1 = (iz + 1) * NS;
    for (let is = 0; is < NS; is++) {
      const next = (is + 1) % NS;
      const a = r0 + is;
      const b = r1 + is;
      const c = r1 + next;
      const d = r0 + next;
      if ((iz + is) % 2 === 0) {
        indices.push(a, b, c, a, c, d);
      } else {
        indices.push(a, b, d, b, c, d);
      }
    }
  }

  // Close the small tapered end-noses cleanly at iz=0 (-Z) and iz=NZ (+Z)
  function closeEnd(ringIndex, posZ) {
    const rStart = ringIndex * NS;
    let cx = 0, cy = 0;
    for (let is = 0; is < NS; is++) {
      cx += positions[(rStart + is) * 3];
      cy += positions[(rStart + is) * 3 + 1];
    }
    cx /= NS;
    cy /= NS;
    const cz = posZ ? tMaxZ : tMinZ;
    const cIdx = positions.length / 3;
    positions.push(cx, cy, cz);
    metaList.push({ zone: 4, seam: 0.2, fiss: 0.1, bedTone: 0, capShrink: 1 });
    for (let is = 0; is < NS; is++) {
      const next = (is + 1) % NS;
      if (posZ) {
        indices.push(cIdx, rStart + next, rStart + is);
      } else {
        indices.push(cIdx, rStart + is, rStart + next);
      }
    }
  }
  closeEnd(0, false);
  closeEnd(NZ, true);

  // Vertex colors: authentic karst limestone palette (#8e897d base, strata #6d6a62..#a7a092, damp drip streaks #4a4c46)
  // Remember rock-face-albedo.v1 is mid-grey rock; keep average multiplier bright-neutral (~0.92..1.05) so we never double-darken!
  const colors = [];
  const vCount = positions.length / 3;
  for (let i = 0; i < vCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const m = metaList[i];

    // Cool weathered grey-buff limestone base multiplier (preserving #8e897d albedo)
    let r = 0.98;
    let g = 0.98;
    let b = 0.97;

    // Distinct horizontal sedimentary strata color bands (#6d6a62 to #a7a092)
    const band = 0.15 * m.bedTone + 0.09 * Math.sin(y * 2.1 + 0.35 * Math.sin(z * 0.24));
    r += band * 1.00;
    g += band * 0.99;
    b += band * 0.96;

    // Recessed horizontal bedding crevices & vertical karst fissures (natural rock cavity AO)
    const cav = clamp01(m.seam * 0.78 + m.fiss * 0.52);
    const cavMul = 1.0 - 0.38 * cav;
    r *= cavMul * 0.98;
    g *= cavMul * 0.99;
    b *= cavMul * 1.02;

    // Vaulted grotto overhang underside: cooler, damper shaded mineral limestone
    if (m.zone === 2 || y < 0.2) {
      const under = clamp01((0.55 - y) / 3.9);
      const damp = 1.0 - 0.28 * under;
      r *= damp * 0.94;
      g *= damp * 0.98;
      b *= damp * 1.04;
    }

    // Organic dark damp water-drip streaks streaming down beneath upper mossy clefts (#4a4c46 tone)
    const dripPattern = fbm3(0.5, y * 0.11, z * 1.35, 3, 977);
    const dripMask = clamp01((y + 1.2) / 5.2) * (m.zone === 1 ? 1.0 : m.zone === 2 ? 0.5 : 0.2);
    if (dripPattern > 0.20 && dripMask > 0.05) {
      const st = clamp01((dripPattern - 0.20) / 0.42) * dripMask;
      r *= 1.0 - 0.42 * st;
      g *= 1.0 - 0.38 * st;
      b *= 1.0 - 0.39 * st;
    }

    // Subtle olive-moss mineral transition patina near the top rim (Y = 3.1..4.6)
    if (y > 3.1 && x > -2.8) {
      const rim = clamp01((y - 3.1) / 1.5) * clamp01(0.42 + 0.58 * fbm3(x * 0.45, y * 0.5, z * 0.45, 2, 1021));
      r *= 1.0 - 0.14 * rim;
      g *= 1.0 + 0.05 * rim;
      b *= 1.0 - 0.18 * rim;
    }

    // Low-frequency geological mottling across 15m span
    const macro = 0.07 * fbm3(x * 0.14, y * 0.18, z * 0.14, 2, 1093);
    colors.push(clamp01(r + macro), clamp01(g + macro), clamp01(b + macro * 0.96));
  }

  let geo = meshGeo({ positions, indices });
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Box UV projection + horizontal stratification stretch so rock-face texture reads as horizontally bedded karst limestone!
  geo = projectUV(geo, { projection: 'box', metersPerUnit: 3.8 });
  geo = remapUV(geo, { scale: [0.72, 1.32] });
  // Crease at 42 degrees: bold chiseled fractured limestone ledges without blobby softening
  geo = creaseNormals(geo, { angle: 42 });
  geo = mergeVertices(geo, { tolerance: 1e-4 });

  return { geo, mapX, mapY, mapZ, NZ, NS, positions };
}

// Sculpted pillowy velvety moss turf crowning the upper rim & draping cleanly over the sunlit outer edge
function buildMossCrownGeometry(cal) {
  const NU = 48; // along Z
  const NV = 16; // back -> front draping lip

  const topPts = [];
  const botPts = [];
  const topCols = [];
  const botCols = [];

  for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU; // 0..1
    const rawZ = -6.85 + u * 13.70;
    const zEdge = Math.sin(u * Math.PI);
    const zPillow = smoothstep(clamp01(zEdge / 0.16));

    // Exact safe front cliff lip X across the top strata courses so moss sits snugly atop rim with ZERO poke-through!
    const rawLipX = Math.min(cliffBrowX(4.15, rawZ).x, cliffBrowX(3.70, rawZ).x, cliffBrowX(3.30, rawZ).x);
    const fissHere = karstFissure(rawZ, 4.15);
    const pillowReach = 0.12 * clamp01(0.5 + 0.5 * fbm3(0.4, 4.3, rawZ * 0.58, 3, 1201));
    const frontX = rawLipX - 0.42 + (pillowReach - 0.28 * fissHere) * zPillow;
    // Irregular organic back edge so the moss reads as a living natural turf mat rather than a rectangle!
    const backX = -4.16 + 0.65 * clamp01(0.5 + 0.5 * fbm3(-3.8, 4.4, rawZ * 0.34, 3, 1249));

    for (let iv = 0; iv <= NV; iv++) {
      const v = iv / NV; // 0=back, 1=front rounded mossy cushion rim
      const rawX = mix(backX, frontX, v);

      // Compute rock elevation cleanly under this (rawX, rawZ)
      const rockSampleX = Math.min(rawX, rawLipX - 0.25);
      const uEnd = Math.abs(rawZ / 7.5);
      const shoulder = smoothstep(clamp01((uEnd - 0.80) / 0.20));
      const capShrink = shoulder * shoulder;
      const rockYRaw = cliffTopY(rockSampleX, rawZ) - capShrink * 0.85;
      const baseRockY = cal.mapY(rockYRaw);

      const wx = Math.min(3.72, cal.mapX(rawX));
      const wz = cal.mapZ(rawZ);

      // Billowing organic velvety moss hummocks
      const vEdge = Math.sin(v * Math.PI);
      const vPillow = smoothstep(clamp01(vEdge / 0.24));
      const mound1 = 0.5 + 0.5 * fbm3(wx * 0.45, 4.5, wz * 0.45, 3, 1307);
      const mound2 = 0.5 + 0.5 * ridged3(wx * 0.92, 4.6, wz * 0.92, 2, 1361);

      // Rounded pillowed moss cushion tapering gently onto the upper limestone rim (never dropping into lower bedding seams!)
      const drapeT = clamp01((v - 0.84) / 0.16);
      const drapeDrop = drapeT * drapeT * 0.10;

      const thickness = (0.20 + 0.34 * mound1 + 0.16 * mound2) * zPillow * (0.22 + 0.78 * vPillow);
      const topY = baseRockY + 0.09 + thickness - drapeDrop;
      // Bottom skin tucks strictly inside the solid upper rock shelf and pulls inward away from the cliff edge!
      const botY = baseRockY - 0.08;
      const botWx = wx - 0.42 * v * v;

      topPts.push([wx, topY, wz]);
      botPts.push([botWx, botY, wz]);

      // Rich dappled tropical shade-moss vertex colors (#3d5f2b deep folds -> #5a823c sunlit pillow crowns)
      const sunCrown = clamp01((thickness - 0.20) / 0.45) * (1.0 - 0.45 * drapeT);
      const patch = fbm3(wx * 0.55, 4.8, wz * 0.55, 3, 1423);
      const mr = 0.86 + 0.24 * sunCrown + 0.10 * patch;
      const mg = 0.90 + 0.20 * sunCrown + 0.08 * patch;
      const mb = 0.78 + 0.14 * sunCrown + 0.06 * patch;
      topCols.push([clamp01(mr), clamp01(mg), clamp01(mb)]);
      botCols.push([0.52, 0.58, 0.46]);
    }
  }

  // Calibrate upper peak of moss crown cleanly to exact Y = +5.00m
  let peakY = -Infinity;
  for (let i = 0; i < topPts.length; i++) {
    if (topPts[i][1] > peakY) peakY = topPts[i][1];
  }
  const baseFloor = 4.15;
  if (peakY > baseFloor) {
    const scaleY = (5.0 - baseFloor) / (peakY - baseFloor);
    for (let i = 0; i < topPts.length; i++) {
      if (topPts[i][1] > baseFloor) {
        topPts[i][1] = baseFloor + (topPts[i][1] - baseFloor) * scaleY;
      }
    }
  }

  const stride = NV + 1;
  const nGrid = (NU + 1) * stride;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i < nGrid; i++) {
    positions.push(topPts[i][0], topPts[i][1], topPts[i][2]);
    colors.push(topCols[i][0], topCols[i][1], topCols[i][2]);
  }
  for (let i = 0; i < nGrid; i++) {
    positions.push(botPts[i][0], botPts[i][1], botPts[i][2]);
    colors.push(botCols[i][0], botCols[i][1], botCols[i][2]);
  }

  // Top skin (+Y outward)
  for (let iu = 0; iu < NU; iu++) {
    for (let iv = 0; iv < NV; iv++) {
      const a = iu * stride + iv;
      const b = (iu + 1) * stride + iv;
      const c = (iu + 1) * stride + (iv + 1);
      const d = iu * stride + (iv + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  // Bottom skin (-Y outward)
  for (let iu = 0; iu < NU; iu++) {
    for (let iv = 0; iv < NV; iv++) {
      const a = nGrid + iu * stride + iv;
      const b = nGrid + (iu + 1) * stride + iv;
      const c = nGrid + (iu + 1) * stride + (iv + 1);
      const d = nGrid + iu * stride + (iv + 1);
      indices.push(a, c, b, a, d, c);
    }
  }
  // Stitch perimeter rims cleanly with verified outward CCW manifold winding
  // Front lip (iv = NV, +X outward): opposes top edge t1->t0
  for (let iu = 0; iu < NU; iu++) {
    const t0 = iu * stride + NV;
    const t1 = (iu + 1) * stride + NV;
    indices.push(t0, t1, nGrid + t1, t0, nGrid + t1, nGrid + t0);
  }
  // Back edge (iv = 0, -X outward): opposes top edge t0->t1
  for (let iu = 0; iu < NU; iu++) {
    const t0 = iu * stride;
    const t1 = (iu + 1) * stride;
    indices.push(t1, t0, nGrid + t0, t1, nGrid + t0, nGrid + t1);
  }
  // Left end (iu = 0, -Z outward): opposes top edge t1->t0
  for (let iv = 0; iv < NV; iv++) {
    const t0 = iv;
    const t1 = iv + 1;
    indices.push(t0, t1, nGrid + t1, t0, nGrid + t1, nGrid + t0);
  }
  // Right end (iu = NU, +Z outward): opposes top edge t0->t1
  for (let iv = 0; iv < NV; iv++) {
    const t0 = NU * stride + iv;
    const t1 = NU * stride + iv + 1;
    indices.push(t1, t0, nGrid + t0, t1, nGrid + t0, nGrid + t1);
  }

  let geo = meshGeo({ positions, indices });
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo = projectUV(geo, { projection: 'box', metersPerUnit: 2.0 });
  geo = creaseNormals(geo, { angle: 80 });
  geo = mergeVertices(geo, { tolerance: 1e-4 });
  return geo;
}

async function createMaterials() {
  // Weathered cool grey-buff stratified karst limestone (#8e897d, strata #6d6a62..#a7a092, roughness 0.86..0.94)
  // Combines exact-palette procedural limestone albedo (NO plaid!) with photorealistic approved rock-face normal & ARM!
  const [rockNormal, rockArm] = await Promise.all([
    loadApprovedTexture('kiln.texture.rock-face-normal.v1'),
    loadApprovedTexture('kiln.texture.rock-face-arm.v1'),
  ]);

  const beds = {
    cellsX: 4,
    cellsY: 11,
    seed: 173,
    jitterX: 0.92,
    jitterY: 0.52,
    metricX: 1,
    metricY: 2.3,
    weight: 0.44,
  };
  const facets = { ...beds, feature: 'facet', facetSlope: 0.80, facetBlend: 0.32 };
  const joints = { ...beds, feature: 'border', borderOpen: 0.48, borderWidth: 0.045, blend: 'multiply' };

  const rockAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'KarstLimestoneAlbedo',
    layers: [
      { op: 'cellular', ...beds, feature: 'cell', colorA: 0x7f7b71, colorB: 0xa19b8e },
      // Irregular horizontal sedimentary limestone strata bands (NO orthogonal stripes -> zero plaid!)
      { op: 'stripes', colorA: 0x6d6a62, colorB: 0xa7a092, count: 10, angleDeg: 90, blend: 'overlay', opacity: 0.34 },
      // Broad cool-grey weathered chalky mottling
      { op: 'noise', colorA: 0x626059, colorB: 0xb2aca0, scale: 8, octaves: 5, seed: 181, blend: 'overlay', opacity: 0.48 },
      // Fine crystalline limestone & mineral pitting grain
      { op: 'noise', colorA: 0x56544d, colorB: 0xbcb6a8, scale: 32, octaves: 4, seed: 193, blend: 'overlay', opacity: 0.44 },
      { op: 'cellular', ...facets, colorA: 0x868686, colorB: 0xffffff, blend: 'multiply', opacity: 0.24 },
      { op: 'cellular', ...joints, colorA: 0xffffff, colorB: 0x45443e, opacity: 0.52 },
    ],
  });

  const rockMat = pbrMaterial({
    albedo: rockAlbedo,
    normal: rockNormal,
    metallicRoughness: rockArm,
    roughness: 0.94,
    metalness: 0,
    name: 'KarstLimestone',
  });
  rockMat.normalScale.set(1.45, 1.45);
  rockMat.vertexColors = true;

  // Velvety Cenote Moss Cap PBR Material (#3d5f2b / #4f7436, roughness 0.92)
  const packed = (r) => (255 << 16) | (r << 8);
  const mossCells = {
    cellsX: 18,
    cellsY: 18,
    seed: 211,
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
      { op: 'noise', colorA: 0x2e4c1e, colorB: 0x5c833d, scale: 10, octaves: 5, seed: 223, blend: 'normal', opacity: 0.72 },
      { op: 'cellular', ...mossCells, feature: 'f2-f1', range: 0.85, colorA: 0x345423, colorB: 0x567e39, blend: 'overlay', opacity: 0.34 },
      { op: 'noise', colorA: 0x274018, colorB: 0x628a42, scale: 48, octaves: 5, seed: 229, blend: 'overlay', opacity: 0.58 },
    ],
  });
  const mossHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CenoteMossHeight',
    layers: [
      { op: 'noise', colorA: 0x202020, colorB: 0xe0e0e0, scale: 14, octaves: 5, seed: 223 },
      { op: 'noise', colorA: 0x161616, colorB: 0xeaeaea, scale: 46, octaves: 5, seed: 229, blend: 'overlay', opacity: 0.65 },
    ],
  });
  const mossMR = proceduralTexture({
    schemaVersion: 2,
    size: 128,
    usage: 'metallicRoughness',
    name: 'CenoteMossMR',
    layers: [
      { op: 'noise', colorA: packed(230), colorB: packed(242), scale: 14, octaves: 3, seed: 239 },
    ],
  });

  const mossMat = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossHeight, { strength: 4.2, name: 'CenoteMossNormal' }),
    metallicRoughness: mossMR,
    roughness: 1,
    metalness: 1,
    name: 'CenoteMoss',
  });
  mossMat.vertexColors = true;

  return { rockMat, mossMat };
}

async function build() {
  const root = createRoot('KarstOverhangLedge');
  const { rockMat, mossMat } = await createMaterials();

  const cliff = buildKarstCliffGeometry();
  createPart('KarstCliffBody', cliff.geo, rockMat, { parent: root });

  const mossGeo = buildMossCrownGeometry(cliff);
  createPart('MossRimCrown', mossGeo, mossMat, { parent: root });

  return root;
}
