const meta = { name: 'Wildlife Fish Silver' };

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

function buildSilverFishBodyGeo() {
  const b = makeBuilder();

  // Silky-smooth slender cenote tetra / barracuda-minnow silhouette (distinctly sleeker than gold fish!)
  const stations = [
    { x:  0.184, yc:  0.001, ryT: 0.0062, ryB: 0.0055, rz: 0.0058, u: 0.03 },
    { x:  0.169, yc:  0.002, ryT: 0.0135, ryB: 0.0118, rz: 0.0112, u: 0.09 },
    { x:  0.149, yc:  0.004, ryT: 0.0205, ryB: 0.0180, rz: 0.0158, u: 0.17 },
    { x:  0.123, yc:  0.004, ryT: 0.0275, ryB: 0.0245, rz: 0.0198, u: 0.26 },
    { x:  0.092, yc:  0.004, ryT: 0.0340, ryB: 0.0305, rz: 0.0226, u: 0.36 },
    { x:  0.056, yc:  0.003, ryT: 0.0385, ryB: 0.0355, rz: 0.0235, u: 0.48 },
    { x:  0.018, yc:  0.003, ryT: 0.0380, ryB: 0.0355, rz: 0.0228, u: 0.60 },
    { x: -0.018, yc:  0.002, ryT: 0.0335, ryB: 0.0310, rz: 0.0195, u: 0.72 },
    { x: -0.052, yc:  0.001, ryT: 0.0255, ryB: 0.0230, rz: 0.0148, u: 0.83 },
    { x: -0.080, yc:  0.000, ryT: 0.0175, ryB: 0.0155, rz: 0.0102, u: 0.92 },
    { x: -0.104, yc:  0.000, ryT: 0.0120, ryB: 0.0110, rz: 0.0068, u: 0.98 },
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
      const zShape = 1.0 + 0.06 * Math.max(0, c) - 0.14 * Math.max(0, -c);
      const y = st.yc + c * ry;
      const z = s * st.rz * zShape;
      const v = 0.03 + 0.94 * (0.5 * (1 - c));
      ring.push(b.addVert(st.x, y, z, st.u, v));
    }
    rings.push(ring);
  }

  const snoutApex = b.addVert(0.190, 0.001, 0, 0.01, 0.50);
  const rearApex = b.addVert(-0.110, 0.000, 0, 1.0, 0.50);

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
      const ht = isEdge ? 0.00050 : baseHalfThick * (1 - 0.72 * t);
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

function buildSilverFishFinsGeo() {
  const b = makeBuilder();

  // Crisp swept triangular tetra/minnow dorsal fin (reaches exact Y = +0.068)
  appendFinBlade(
    b,
    [
      [ 0.052, 0.037, 0],
      [ 0.032, 0.037, 0],
      [ 0.012, 0.036, 0],
      [-0.008, 0.032, 0],
      [-0.028, 0.027, 0],
      [-0.048, 0.022, 0],
    ],
    [
      [ 0.018, 0.0680, 0],
      [-0.002, 0.0655, 0],
      [-0.022, 0.055, 0],
      [-0.038, 0.044, 0],
      [-0.052, 0.034, 0],
      [-0.060, 0.024, 0],
    ],
    [0, 0, 1],
    0.0028,
    false
  );

  // Sleek anal fin dipping to Y = -0.046
  appendFinBlade(
    b,
    [
      [-0.022, -0.026, 0],
      [-0.046, -0.021, 0],
      [-0.068, -0.015, 0],
      [-0.084, -0.011, 0],
    ],
    [
      [-0.038, -0.046, 0],
      [-0.060, -0.044, 0],
      [-0.078, -0.034, 0],
      [-0.089, -0.020, 0],
    ],
    [0, 0, 1],
    0.0022,
    true
  );

  // Sleek angled pectoral fins reaching exact Z = +/-0.040 -> 0.080m width!
  for (const side of [1, -1]) {
    appendFinBlade(
      b,
      [
        [0.090, -0.008, 0.017 * side],
        [0.082, -0.014, 0.016 * side],
        [0.072, -0.020, 0.014 * side],
        [0.060, -0.023, 0.012 * side],
      ],
      [
        [0.046, -0.018, 0.03976 * side],
        [0.024, -0.027, 0.0392 * side],
        [0.016, -0.032, 0.030 * side],
        [0.028, -0.033, 0.020 * side],
      ],
      [0.2, 0.85, 0.48 * side],
      0.0018,
      side > 0
    );

    // Sleek pelvic fins dipping to exact Y = -0.052 (0.120m height!)
    appendFinBlade(
      b,
      [
        [0.038, -0.030, 0.006 * side],
        [0.022, -0.031, 0.006 * side],
        [0.008, -0.030, 0.005 * side],
      ],
      [
        [0.014, -0.049, 0.016 * side],
        [-0.004, -0.05173, 0.015 * side],
        [-0.012, -0.042, 0.010 * side],
      ],
      [0.1, 0.55, 0.82 * side],
      0.0016,
      side > 0
    );
  }

  return creaseNormals(b.toGeometry(), { angle: 50 });
}

function buildSilverTailFinGeo() {
  // Local to Joint_Tail at (-0.10, 0, 0)
  // Razor-crisp 9-column deeply forked swallowtail caudal fin to local x = -0.090 (world X = -0.190 -> 0.380m length!)
  const b = makeBuilder();

  const rootPts = [
    [ 0.012,  0.0118, 0],
    [ 0.014,  0.0090, 0],
    [ 0.015,  0.0060, 0],
    [ 0.016,  0.0030, 0],
    [ 0.016,  0.0000, 0],
    [ 0.016, -0.0030, 0],
    [ 0.015, -0.0060, 0],
    [ 0.014, -0.0090, 0],
    [ 0.012, -0.0118, 0],
  ];
  const tipPts = [
    [-0.080,  0.050, 0],
    [-0.090,  0.042, 0],
    [-0.076,  0.026, 0],
    [-0.052,  0.011, 0],
    [-0.036,  0.000, 0],
    [-0.052, -0.011, 0],
    [-0.076, -0.026, 0],
    [-0.090, -0.042, 0],
    [-0.080, -0.050, 0],
  ];

  appendFinBlade(b, rootPts, tipPts, [0, 0, 1], 0.0036, false);
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
  const root = createRoot('WildlifeFishSilver');

  // Shimmering silver-pearl flanks (#d4e4e8), muted teal-slate dorsal stripe (#3c7684)
  const scaleTex = proceduralTexture({
    schemaVersion: 3,
    width: 512,
    height: 512,
    usage: 'albedo',
    name: 'SilverFishScales',
    background: [212, 228, 232, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 512,
          usage: 'albedo',
          layers: [
            { op: 'gradient', from: 0x3c7684, to: 0xe6eff2, angleDeg: 90 },
            {
              op: 'cellular',
              colorA: 0xb2ccd4,
              colorB: 0xf0f7f9,
              cellsX: 32,
              cellsY: 18,
              seed: 31,
              jitterX: 0.22,
              jitterY: 0.20,
              metricX: 1.0,
              metricY: 1.5,
              feature: 'f1',
              range: 0.9,
              blend: 'overlay',
              opacity: 0.22,
            },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 152 },
        rgba: [60, 118, 132, 95],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 118 },
        rgba: [56, 112, 126, 135],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 78 },
        rgba: [42, 88, 102, 145],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 162, width: 512, height: 225 },
        rgba: [212, 228, 232, 130],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 192, width: 512, height: 185 },
        rgba: [218, 234, 238, 120],
      },
      {
        op: 'paint',
        shape: { kind: 'line', from: [110, 178], to: [495, 198], width: 16 },
        rgba: [152, 206, 216, 95],
      },
      {
        op: 'paint',
        shape: { kind: 'line', from: [110, 196], to: [495, 214], width: 16 },
        rgba: [236, 246, 249, 135],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 365, width: 512, height: 147 },
        rgba: [236, 243, 246, 140],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [122, 148], [130, 184], [136, 228], [136, 270], [130, 312], [118, 348],
            [111, 346], [122, 310], [128, 270], [128, 228], [122, 186], [115, 150],
          ],
        },
        rgba: [108, 146, 158, 56],
      },
    ],
  });

  // Crisp smoky-teal root to luminous silver-pearl fins with delicate ray lines
  const finTex = proceduralTexture({
    schemaVersion: 3,
    width: 256,
    height: 256,
    usage: 'albedo',
    name: 'SilverFishFins',
    background: [190, 216, 224, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 256,
          usage: 'albedo',
          layers: [
            { op: 'gradient', from: 0x6296a4, to: 0xe2eef2, angleDeg: 90 },
            { op: 'stripes', colorA: 0x528391, colorB: 0xeef6f8, count: 30, angleDeg: 0, blend: 'overlay', opacity: 0.28 },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 196, width: 256, height: 60 },
        rgba: [228, 240, 244, 150],
      },
    ],
  });

  // Crisp dark glossy eye with luminous silver iris ring & catchlight
  const eyeTex = proceduralTexture({
    schemaVersion: 3,
    width: 128,
    height: 128,
    usage: 'albedo',
    name: 'SilverFishEye',
    background: [96, 134, 146, 255],
    operations: [
      { op: 'paint', shape: { kind: 'ellipse', x: 6, y: 6, width: 116, height: 116 }, rgba: [204, 224, 232, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 18, y: 18, width: 92, height: 92 }, rgba: [228, 242, 246, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 35, y: 35, width: 58, height: 58 }, rgba: [12, 16, 22, 255] },
      { op: 'paint', shape: { kind: 'ellipse', x: 46, y: 42, width: 16, height: 16 }, rgba: [242, 248, 252, 215] },
    ],
  });

  const bodyMat = pbrMaterial({
    albedo: scaleTex,
    roughness: 0.24,
    metalness: 0.35,
    name: 'SilverFishScales',
  });

  const finMat = pbrMaterial({
    albedo: finTex,
    roughness: 0.26,
    metalness: 0.22,
    name: 'SilverFishFins',
  });

  const eyeMat = pbrMaterial({
    albedo: eyeTex,
    roughness: 0.10,
    metalness: 0.14,
    name: 'SilverFishEye',
  });

  createPart('FishBody', buildSilverFishBodyGeo(), bodyMat, { parent: root });
  createPart('Fins', buildSilverFishFinsGeo(), finMat, { parent: root });
  createPart('Eyes', buildFishEyesGeo(0.142, 0.008, 0.0138, 0.0072, 0.0072, 0.0043), eyeMat, { parent: root });

  // Exact named rigid tail pivot group for Holodeck motion.gait@1 (axis: "y")
  const jointTail = new THREE.Group();
  jointTail.name = 'Joint_Tail';
  jointTail.position.set(-0.10, 0, 0);
  root.add(jointTail);
  createPart('TailFin', buildSilverTailFinGeo(), finMat, { parent: jointTail });

  return root;
}
