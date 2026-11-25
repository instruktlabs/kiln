const meta = { name: 'Wildlife Fish Gold' };

function makeBuilder() {
  const positions = [];
  const uvs = [];
  const indices = [];
  return {
    positions,
    uvs,
    indices,
    addVert(x, y, z, u, v) {
      const idx = positions.length / 3;
      positions.push(x, y, z);
      uvs.push(u, v);
      return idx;
    },
    addTri(a, b, c) {
      indices.push(a, b, c);
    },
    addQuad(a, b, c, d) {
      indices.push(a, b, c, a, c, d);
    },
    toGeometry() {
      return meshGeo({ positions, uvs, indices });
    },
  };
}

function buildGoldFishBodyGeo() {
  const b = makeBuilder();

  // Silky-smooth fusiform koi/cichlid body: snout at +0.210, caudal peduncle to -0.108
  const stations = [
    { x:  0.205, yc:  0.001, ryT: 0.0075, ryB: 0.0068, rz: 0.0072, u: 0.03 },
    { x:  0.191, yc:  0.003, ryT: 0.0175, ryB: 0.0145, rz: 0.0145, u: 0.09 },
    { x:  0.171, yc:  0.005, ryT: 0.0265, ryB: 0.0225, rz: 0.0205, u: 0.16 },
    { x:  0.145, yc:  0.006, ryT: 0.0355, ryB: 0.0305, rz: 0.0255, u: 0.24 },
    { x:  0.112, yc:  0.006, ryT: 0.0445, ryB: 0.0390, rz: 0.0292, u: 0.34 },
    { x:  0.074, yc:  0.005, ryT: 0.0495, ryB: 0.0450, rz: 0.0305, u: 0.46 },
    { x:  0.034, yc:  0.005, ryT: 0.0495, ryB: 0.0460, rz: 0.0298, u: 0.58 },
    { x: -0.006, yc:  0.004, ryT: 0.0445, ryB: 0.0415, rz: 0.0265, u: 0.70 },
    { x: -0.044, yc:  0.003, ryT: 0.0355, ryB: 0.0320, rz: 0.0205, u: 0.81 },
    { x: -0.078, yc:  0.002, ryT: 0.0235, ryB: 0.0210, rz: 0.0138, u: 0.91 },
    { x: -0.105, yc:  0.000, ryT: 0.0150, ryB: 0.0140, rz: 0.0085, u: 0.98 },
  ];

  const radial = 24;
  const rings = [];
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const ry = c >= 0 ? st.ryT : st.ryB;
      const zShape = 1.0 + 0.07 * Math.max(0, c) - 0.10 * Math.max(0, -c);
      const y = st.yc + c * ry;
      const z = s * st.rz * zShape;
      const v = 0.03 + 0.94 * (0.5 * (1 - c));
      ring.push(b.addVert(st.x, y, z, st.u, v));
    }
    rings.push(ring);
  }

  const snoutApex = b.addVert(0.210, 0.000, 0, 0.01, 0.52);
  const rearApex = b.addVert(-0.112, 0.000, 0, 1.0, 0.50);

  for (let j = 0; j < radial; j++) {
    b.addTri(snoutApex, rings[0][j], rings[0][j + 1]);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      b.addQuad(rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1]);
    }
  }
  const lastRing = rings[rings.length - 1];
  for (let j = 0; j < radial; j++) {
    b.addTri(rearApex, lastRing[j + 1], lastRing[j]);
  }

  return b.toGeometry();
}

// Closed thin-edged 3D beveled fin blade (avoids opposite-normal rim pinching)
function appendFinBlade(b, rootPts, tipPts, normalDir, baseHalfThick, flipWinding) {
  const cols = rootPts.length;
  const rowsT = [0.0, 0.45, 1.0];
  const nLen = Math.hypot(normalDir[0], normalDir[1], normalDir[2]) || 1;
  const nx = normalDir[0] / nLen;
  const ny = normalDir[1] / nLen;
  const nz = normalDir[2] / nLen;

  const sideA = [];
  const sideB = [];
  for (let ri = 0; ri < rowsT.length; ri++) {
    const t = rowsT[ri];
    const rowA = [];
    const rowB = [];
    for (let ci = 0; ci < cols; ci++) {
      const r = rootPts[ci];
      const p = tipPts[ci];
      const x = r[0] + (p[0] - r[0]) * t;
      const y = r[1] + (p[1] - r[1]) * t;
      const z = r[2] + (p[2] - r[2]) * t;
      const isEdge = ri === rowsT.length - 1 || ci === 0 || ci === cols - 1;
      const ht = isEdge ? 0.00055 : baseHalfThick * (1 - 0.72 * t);
      const u = ci / (cols - 1);
      const v = 0.06 + 0.88 * t;
      rowA.push(b.addVert(x + nx * ht, y + ny * ht, z + nz * ht, u, v));
      rowB.push(b.addVert(x - nx * ht, y - ny * ht, z - nz * ht, u, v));
    }
    sideA.push(rowA);
    sideB.push(rowB);
  }

  for (let ri = 0; ri < rowsT.length - 1; ri++) {
    for (let ci = 0; ci < cols - 1; ci++) {
      if (!flipWinding) {
        b.addQuad(sideA[ri][ci], sideA[ri + 1][ci], sideA[ri + 1][ci + 1], sideA[ri][ci + 1]);
        b.addQuad(sideB[ri][ci], sideB[ri][ci + 1], sideB[ri + 1][ci + 1], sideB[ri + 1][ci]);
      } else {
        b.addQuad(sideA[ri][ci], sideA[ri][ci + 1], sideA[ri + 1][ci + 1], sideA[ri + 1][ci]);
        b.addQuad(sideB[ri][ci], sideB[ri + 1][ci], sideB[ri + 1][ci + 1], sideB[ri][ci + 1]);
      }
    }
  }
  const lastR = rowsT.length - 1;
  const lastC = cols - 1;
  for (let ci = 0; ci < lastC; ci++) {
    if (!flipWinding) {
      b.addQuad(sideA[0][ci], sideA[0][ci + 1], sideB[0][ci + 1], sideB[0][ci]);
      b.addQuad(sideA[lastR][ci + 1], sideA[lastR][ci], sideB[lastR][ci], sideB[lastR][ci + 1]);
    } else {
      b.addQuad(sideA[0][ci + 1], sideA[0][ci], sideB[0][ci], sideB[0][ci + 1]);
      b.addQuad(sideA[lastR][ci], sideA[lastR][ci + 1], sideB[lastR][ci + 1], sideB[lastR][ci]);
    }
  }
  for (let ri = 0; ri < lastR; ri++) {
    if (!flipWinding) {
      b.addQuad(sideA[ri + 1][0], sideA[ri][0], sideB[ri][0], sideB[ri + 1][0]);
      b.addQuad(sideA[ri][lastC], sideA[ri + 1][lastC], sideB[ri + 1][lastC], sideB[ri][lastC]);
    } else {
      b.addQuad(sideA[ri][0], sideA[ri + 1][0], sideB[ri + 1][0], sideB[ri][0]);
      b.addQuad(sideA[ri + 1][lastC], sideA[ri][lastC], sideB[ri][lastC], sideB[ri + 1][lastC]);
    }
  }
}

function buildGoldFishFinsGeo() {
  const b = makeBuilder();

  // Graceful arched flowing dorsal fin (reaches exact Y = +0.080)
  appendFinBlade(
    b,
    [
      [ 0.086, 0.045, 0],
      [ 0.062, 0.049, 0],
      [ 0.036, 0.049, 0],
      [ 0.010, 0.046, 0],
      [-0.016, 0.040, 0],
      [-0.042, 0.032, 0],
      [-0.064, 0.024, 0],
      [-0.080, 0.018, 0],
    ],
    [
      [ 0.066, 0.072, 0],
      [ 0.040, 0.0800, 0],
      [ 0.012, 0.0800, 0],
      [-0.016, 0.076, 0],
      [-0.044, 0.070, 0],
      [-0.070, 0.060, 0],
      [-0.086, 0.044, 0],
      [-0.090, 0.024, 0],
    ],
    [0, 0, 1],
    0.0034,
    false
  );

  // Anal fin on lower rear belly
  appendFinBlade(
    b,
    [
      [-0.018, -0.033, 0],
      [-0.040, -0.027, 0],
      [-0.062, -0.020, 0],
      [-0.082, -0.014, 0],
    ],
    [
      [-0.032, -0.056, 0],
      [-0.056, -0.056, 0],
      [-0.078, -0.046, 0],
      [-0.089, -0.026, 0],
    ],
    [0, 0, 1],
    0.0026,
    true
  );

  // Pair of graceful swept pectoral fins (reach exact Z = +/-0.045 -> 0.090m width!)
  for (const side of [1, -1]) {
    appendFinBlade(
      b,
      [
        [0.106, -0.010, 0.022 * side],
        [0.098, -0.017, 0.021 * side],
        [0.088, -0.023, 0.019 * side],
        [0.076, -0.028, 0.016 * side],
      ],
      [
        [0.062, -0.022, 0.04474 * side],
        [0.038, -0.033, 0.04474 * side],
        [0.024, -0.039, 0.036 * side],
        [0.034, -0.040, 0.025 * side],
      ],
      [0.2, 0.85, 0.48 * side],
      0.0020,
      side > 0
    );

    // Pair of neat ventral/pelvic fins dipping to exact Y = -0.060 (0.140m height!)
    appendFinBlade(
      b,
      [
        [0.052, -0.037, 0.008 * side],
        [0.036, -0.038, 0.008 * side],
        [0.020, -0.037, 0.007 * side],
      ],
      [
        [0.026, -0.057, 0.020 * side],
        [0.006, -0.05970, 0.019 * side],
        [-0.004, -0.051, 0.012 * side],
      ],
      [0.1, 0.55, 0.82 * side],
      0.0018,
      side > 0
    );
  }

  return creaseNormals(b.toGeometry(), { angle: 50 });
}

function buildGoldTailFinGeo() {
  // Local to Joint_Tail at (-0.10, 0, 0)
  // Smoothly curved 9-column flowing forked caudal tail fin to local x = -0.110 (world X = -0.210 -> 0.420m length!)
  const b = makeBuilder();

  const rootPts = [
    [ 0.012,  0.0145, 0],
    [ 0.014,  0.0110, 0],
    [ 0.015,  0.0072, 0],
    [ 0.016,  0.0035, 0],
    [ 0.016,  0.0000, 0],
    [ 0.016, -0.0035, 0],
    [ 0.015, -0.0072, 0],
    [ 0.014, -0.0110, 0],
    [ 0.012, -0.0145, 0],
  ];
  const tipPts = [
    [-0.098,  0.057, 0],
    [-0.110,  0.048, 0],
    [-0.100,  0.032, 0],
    [-0.074,  0.014, 0],
    [-0.054,  0.000, 0],
    [-0.074, -0.014, 0],
    [-0.100, -0.032, 0],
    [-0.110, -0.048, 0],
    [-0.098, -0.057, 0],
  ];

  appendFinBlade(b, rootPts, tipPts, [0, 0, 1], 0.0044, false);
  return creaseNormals(b.toGeometry(), { angle: 50 });
}

function buildFishEyesGeo(cx, cy, cz, rx, ry, rz) {
  const b = makeBuilder();
  const addEye = (side) => {
    const rings = 6;
    const segs = 14;
    const rows = [];
    const outerPole = b.addVert(cx, cy, (cz + rz) * side, 0.5, 0.5);
    const innerPole = b.addVert(cx, cy, (cz - rz) * side, 0.0, 0.0);
    for (let r = 1; r < rings; r++) {
      const phi = (r / rings) * Math.PI;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      const row = [];
      for (let s = 0; s < segs; s++) {
        const th = (s / segs) * Math.PI * 2;
        const px = cx + Math.cos(th) * sp * rx;
        const py = cy + Math.sin(th) * sp * ry;
        const pz = (cz + cp * rz) * side;
        const u = 0.5 + 0.45 * Math.cos(th) * Math.min(1, r / (rings * 0.55));
        const v = 0.5 + 0.45 * Math.sin(th) * Math.min(1, r / (rings * 0.55));
        row.push(b.addVert(px, py, pz, u, v));
      }
      rows.push(row);
    }
    for (let s = 0; s < segs; s++) {
      const ns = (s + 1) % segs;
      if (side > 0) {
        b.addTri(outerPole, rows[0][s], rows[0][ns]);
        b.addTri(innerPole, rows[rows.length - 1][ns], rows[rows.length - 1][s]);
      } else {
        b.addTri(outerPole, rows[0][ns], rows[0][s]);
        b.addTri(innerPole, rows[rows.length - 1][s], rows[rows.length - 1][ns]);
      }
    }
    for (let r = 0; r < rows.length - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const ns = (s + 1) % segs;
        if (side > 0) {
          b.addQuad(rows[r][s], rows[r + 1][s], rows[r + 1][ns], rows[r][ns]);
        } else {
          b.addQuad(rows[r][s], rows[r][ns], rows[r + 1][ns], rows[r + 1][s]);
        }
      }
    }
  };
  addEye(1);
  addEye(-1);
  return b.toGeometry();
}

function build() {
  const root = createRoot('WildlifeFishGold');

  // Vibrant natural golden-tangerine scales (#e87d24 dorsal -> warm sunlit cream-gold belly #f5d89e)
  const scaleTex = proceduralTexture({
    schemaVersion: 3,
    width: 512,
    height: 512,
    usage: 'albedo',
    name: 'GoldFishScales',
    background: [232, 125, 36, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 512,
          usage: 'albedo',
          layers: [
            { op: 'gradient', from: 0xd96b18, to: 0xf5d89e, angleDeg: 90 },
            {
              op: 'cellular',
              colorA: 0xc95e12,
              colorB: 0xfbe1a8,
              cellsX: 28,
              cellsY: 16,
              seed: 17,
              jitterX: 0.25,
              jitterY: 0.22,
              metricX: 1.0,
              metricY: 1.5,
              feature: 'f1',
              range: 0.9,
              blend: 'overlay',
              opacity: 0.26,
            },
            { op: 'noise', colorA: 0xe37820, colorB: 0xf7b95c, scale: 10, octaves: 3, seed: 5, blend: 'overlay', opacity: 0.18 },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 112 },
        rgba: [222, 102, 22, 120],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 40, y: -35, width: 430, height: 130 },
        rgba: [208, 86, 16, 110],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 45, y: 170, width: 440, height: 105 },
        rgba: [248, 178, 72, 115],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 340, width: 512, height: 172 },
        rgba: [246, 220, 166, 90],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 385, width: 512, height: 127 },
        rgba: [248, 228, 182, 115],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [126, 138], [134, 178], [140, 224], [140, 268], [134, 312], [122, 352],
            [115, 350], [126, 310], [132, 268], [132, 224], [126, 180], [119, 140],
          ],
        },
        rgba: [188, 92, 24, 58],
      },
    ],
  });

  // Delicate translucent-looking apricot-gold fins with pale sunlit edges & fine fin rays
  const finTex = proceduralTexture({
    schemaVersion: 3,
    width: 256,
    height: 256,
    usage: 'albedo',
    name: 'GoldFishFins',
    background: [238, 146, 56, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 256,
          usage: 'albedo',
          layers: [
            { op: 'gradient', from: 0xe68428, to: 0xfce7bc, angleDeg: 90 },
            { op: 'stripes', colorA: 0xd9751f, colorB: 0xfef0d2, count: 32, angleDeg: 0, blend: 'overlay', opacity: 0.30 },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 196, width: 256, height: 60 },
        rgba: [253, 238, 204, 145],
      },
    ],
  });

  // Glossy dark fish eye with crisp golden-amber iris ring & lifelike catchlight
  const eyeTex = proceduralTexture({
    schemaVersion: 3,
    width: 128,
    height: 128,
    usage: 'albedo',
    name: 'GoldFishEye',
    background: [158, 92, 28, 255],
    operations: [
      { op: 'paint', shape: { kind: 'ellipse', x: 6, y: 6, width: 116, height: 116 }, rgba: [244, 198, 92, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 18, y: 18, width: 92, height: 92 }, rgba: [252, 218, 126, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 35, y: 35, width: 58, height: 58 }, rgba: [14, 18, 24, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 46, y: 42, width: 16, height: 16 }, rgba: [242, 246, 252, 210] },
    ],
  });

  const bodyMat = pbrMaterial({
    albedo: scaleTex,
    roughness: 0.28,
    metalness: 0.12,
    name: 'GoldFishScales',
  });

  const finMat = pbrMaterial({
    albedo: finTex,
    roughness: 0.28,
    metalness: 0.06,
    name: 'GoldFishFins',
  });

  const eyeMat = pbrMaterial({
    albedo: eyeTex,
    roughness: 0.12,
    metalness: 0.08,
    name: 'GoldFishEye',
  });

  createPart('FishBody', buildGoldFishBodyGeo(), bodyMat, { parent: root });
  createPart('Fins', buildGoldFishFinsGeo(), finMat, { parent: root });
  createPart('Eyes', buildFishEyesGeo(0.160, 0.011, 0.0190, 0.0086, 0.0086, 0.0054), eyeMat, { parent: root });

  // Exact named rigid tail pivot group for Holodeck motion.gait@1 (axis: "y")
  const jointTail = new THREE.Group();
  jointTail.name = 'Joint_Tail';
  jointTail.position.set(-0.10, 0, 0);
  root.add(jointTail);
  createPart('TailFin', buildGoldTailFinGeo(), finMat, { parent: jointTail });

  return root;
}
