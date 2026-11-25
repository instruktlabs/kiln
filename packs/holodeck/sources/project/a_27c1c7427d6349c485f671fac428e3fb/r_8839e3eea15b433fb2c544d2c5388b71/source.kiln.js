const meta = { name: 'Wildlife Swallow' };

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

function buildSwallowBodyGeo() {
  const b = makeBuilder();

  // Sleek aerodynamic swallow torso + contoured neck + streamlined head (+X forward)
  // Smooth aerodynamic teardrop silhouette with full dorsal shoulders & streamlined chest
  const stations = [
    { x:  0.111, yc:  0.0190, ryT: 0.0052, ryB: 0.0046, rz: 0.0056, u: 0.03 },
    { x:  0.101, yc:  0.0220, ryT: 0.0145, ryB: 0.0102, rz: 0.0140, u: 0.09 },
    { x:  0.088, yc:  0.0225, ryT: 0.0185, ryB: 0.0128, rz: 0.0172, u: 0.16 },
    { x:  0.072, yc:  0.0205, ryT: 0.0185, ryB: 0.0138, rz: 0.0185, u: 0.24 },
    { x:  0.056, yc:  0.0165, ryT: 0.0195, ryB: 0.0155, rz: 0.0215, u: 0.32 },
    { x:  0.038, yc:  0.0120, ryT: 0.0255, ryB: 0.0200, rz: 0.0305, u: 0.41 },
    { x:  0.018, yc:  0.0100, ryT: 0.0280, ryB: 0.0215, rz: 0.0355, u: 0.51 },
    { x: -0.004, yc:  0.0095, ryT: 0.0255, ryB: 0.0195, rz: 0.0320, u: 0.61 },
    { x: -0.026, yc:  0.0090, ryT: 0.0205, ryB: 0.0155, rz: 0.0255, u: 0.71 },
    { x: -0.046, yc:  0.0085, ryT: 0.0145, ryB: 0.0110, rz: 0.0190, u: 0.80 },
    { x: -0.062, yc:  0.0080, ryT: 0.0095, ryB: 0.0075, rz: 0.0148, u: 0.87 },
    { x: -0.075, yc:  0.0078, ryT: 0.0052, ryB: 0.0045, rz: 0.0125, u: 0.93 },
  ];

  const radial = 20;
  const rings = [];
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const ry = c >= 0 ? st.ryT : st.ryB;
      const y = st.yc + c * ry;
      const z = s * st.rz;
      const v = 0.04 + 0.92 * (0.5 * (1 - c));
      ring.push(b.addVert(st.x, y, z, st.u, v));
    }
    rings.push(ring);
  }

  const frontApex = b.addVert(0.115, 0.0190, 0, 0.01, 0.42);
  const rearApex = b.addVert(-0.081, 0.0078, 0, 0.96, 0.22);

  for (let j = 0; j < radial; j++) {
    b.addTri(frontApex, rings[0][j], rings[0][j + 1]);
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

  // Deeply forked swallowtail fused smoothly into the rump (-0.056 to -0.150)
  // Separate thin top/bottom surfaces with closed crisp feather edge (zero normal pinching)
  const spanW = [-1.0, -0.82, -0.60, -0.34, 0.0, 0.34, 0.60, 0.82, 1.0];
  const tipX = [-0.144, -0.150, -0.128, -0.098, -0.086, -0.098, -0.128, -0.150, -0.144];
  const tipZ = [-0.038, -0.033, -0.022, -0.010,  0.000,  0.010,  0.022,  0.033,  0.038];
  const longT = [0.0, 0.32, 0.68, 1.0];

  const topGrid = [];
  const botGrid = [];
  for (let ti = 0; ti < longT.length; ti++) {
    const t = longT[ti];
    const tRow = [];
    const bRow = [];
    for (let wi = 0; wi < spanW.length; wi++) {
      const w = spanW[wi];
      const x0 = -0.056;
      const z0 = w * 0.0120;
      const x = x0 + (tipX[wi] - x0) * t;
      const z = z0 + (tipZ[wi] - z0) * t;
      const yc = 0.0076 + 0.0014 * t * t + 0.0010 * w * w * t;
      const isEdge = ti === longT.length - 1 || wi === 0 || wi === spanW.length - 1;
      const halfThick = isEdge
        ? 0.00055
        : 0.0038 * (1 - 0.72 * t) * (0.45 + 0.55 * (1 - 0.55 * w * w));

      const uTail = 0.78 + 0.20 * t;
      const vTop = 0.06 + 0.10 * Math.abs(w);
      const vBot = t < 0.34 && Math.abs(w) < 0.62 ? 0.68 : 0.24 + 0.08 * Math.abs(w);

      tRow.push(b.addVert(x, yc + halfThick, z, uTail, vTop));
      bRow.push(b.addVert(x, yc - halfThick, z, uTail, vBot));
    }
    topGrid.push(tRow);
    botGrid.push(bRow);
  }

  for (let ti = 0; ti < longT.length - 1; ti++) {
    for (let wi = 0; wi < spanW.length - 1; wi++) {
      b.addQuad(topGrid[ti][wi], topGrid[ti + 1][wi], topGrid[ti + 1][wi + 1], topGrid[ti][wi + 1]);
      b.addQuad(botGrid[ti][wi], botGrid[ti][wi + 1], botGrid[ti + 1][wi + 1], botGrid[ti + 1][wi]);
    }
  }
  // Close root (+X), trailing fork edge (-X), and outer streamer edges (+/-Z)
  const lastTi = longT.length - 1;
  const lastWi = spanW.length - 1;
  for (let wi = 0; wi < lastWi; wi++) {
    b.addQuad(topGrid[0][wi], topGrid[0][wi + 1], botGrid[0][wi + 1], botGrid[0][wi]);
    b.addQuad(topGrid[lastTi][wi + 1], topGrid[lastTi][wi], botGrid[lastTi][wi], botGrid[lastTi][wi + 1]);
  }
  for (let ti = 0; ti < lastTi; ti++) {
    b.addQuad(topGrid[ti + 1][0], topGrid[ti][0], botGrid[ti][0], botGrid[ti + 1][0]);
    b.addQuad(topGrid[ti][lastWi], topGrid[ti + 1][lastWi], botGrid[ti + 1][lastWi], botGrid[ti][lastWi]);
  }

  return creaseNormals(b.toGeometry(), { angle: 55 });
}

function buildSwallowWingGeo(side) {
  // side: +1 for Right (+Z, under Joint_WingR at [0.02, 0.02, +0.04])
  //       -1 for Left  (-Z, under Joint_WingL at [0.02, 0.02, -0.04])
  // Seamless shoulder seating into dorsal torso + butter-smooth swept crescent swallow silhouette
  const b = makeBuilder();

  const stations = [
    { z: -0.024, xL:  0.026, xT: -0.048, y: -0.0080, thick: 0.0130, s: 0.00 },
    { z: -0.002, xL:  0.030, xT: -0.050, y: -0.0040, thick: 0.0124, s: 0.09 },
    { z:  0.024, xL:  0.035, xT: -0.049, y:  0.0010, thick: 0.0114, s: 0.19 },
    { z:  0.054, xL:  0.039, xT: -0.044, y:  0.0065, thick: 0.0102, s: 0.30 },
    { z:  0.086, xL:  0.040, xT: -0.038, y:  0.0105, thick: 0.0088, s: 0.42 },
    { z:  0.118, xL:  0.030, xT: -0.037, y:  0.0110, thick: 0.0074, s: 0.54 },
    { z:  0.148, xL:  0.011, xT: -0.042, y:  0.0095, thick: 0.0058, s: 0.65 },
    { z:  0.178, xL: -0.013, xT: -0.052, y:  0.0072, thick: 0.0044, s: 0.76 },
    { z:  0.204, xL: -0.040, xT: -0.066, y:  0.0050, thick: 0.0030, s: 0.86 },
    { z:  0.224, xL: -0.062, xT: -0.078, y:  0.0032, thick: 0.0019, s: 0.94 },
    { z:  0.235, xL: -0.076, xT: -0.085, y:  0.0022, thick: 0.0012, s: 0.98 },
  ];

  const halfPts = 6;
  const ringPts = halfPts * 2;
  const rings = [];

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const chord = st.xL - st.xT;
    const ring = [];
    for (let j = 0; j <= ringPts; j++) {
      let frac, dy, v;
      if (j <= halfPts) {
        frac = j / halfPts;
        const camber = 0.66 * Math.sin(Math.pow(frac, 0.72) * Math.PI);
        dy = st.thick * camber;
        v = 0.04 + 0.42 * frac;
      } else {
        frac = (ringPts - j) / halfPts;
        const under = -0.24 * Math.sin(Math.pow(frac, 0.80) * Math.PI);
        dy = st.thick * under;
        v = 0.54 + 0.42 * frac;
      }
      const x = st.xL - chord * frac;
      const y = st.y + dy;
      const z = st.z * side;
      ring.push(b.addVert(x, y, z, st.s, v));
    }
    rings.push(ring);
  }

  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < ringPts; j++) {
      const a = rings[i][j];
      const e = rings[i + 1][j];
      const c = rings[i + 1][j + 1];
      const d = rings[i][j + 1];
      if (side > 0) {
        b.addTri(a, d, c);
        b.addTri(a, c, e);
      } else {
        b.addTri(a, e, c);
        b.addTri(a, c, d);
      }
    }
  }

  // Sharp swept wingtip apex (world Z = +/-0.280)
  const tipIdx = b.addVert(-0.083, 0.0018, 0.240 * side, 1.0, 0.25);
  const last = rings[rings.length - 1];
  for (let j = 0; j < ringPts; j++) {
    if (side > 0) {
      b.addTri(tipIdx, last[j], last[j + 1]);
    } else {
      b.addTri(tipIdx, last[j + 1], last[j]);
    }
  }

  const st0 = stations[0];
  const rootIdx = b.addVert((st0.xL + st0.xT) * 0.5, st0.y + st0.thick * 0.15, st0.z * side, 0.0, 0.50);
  const first = rings[0];
  for (let j = 0; j < ringPts; j++) {
    if (side > 0) {
      b.addTri(rootIdx, first[j + 1], first[j]);
    } else {
      b.addTri(rootIdx, first[j], first[j + 1]);
    }
  }

  return creaseNormals(b.toGeometry(), { angle: 65 });
}

function buildBeakAndEyesGeo() {
  const b = makeBuilder();

  // Sculpted 3D pointed swallow beak from x=+0.104 to exact tip x=+0.130
  const beakBase = [
    [0.104, 0.0225,  0.000],
    [0.104, 0.0195,  0.0055],
    [0.104, 0.0155,  0.0045],
    [0.104, 0.0145,  0.000],
    [0.104, 0.0155, -0.0045],
    [0.104, 0.0195, -0.0055],
  ];
  const beakMid = [
    [0.118, 0.0205,  0.000],
    [0.118, 0.0185,  0.0030],
    [0.118, 0.0165,  0.0024],
    [0.118, 0.0160,  0.000],
    [0.118, 0.0165, -0.0024],
    [0.118, 0.0185, -0.0030],
  ];
  const baseIdx = beakBase.map((p) => b.addVert(p[0], p[1], p[2], 0.2, 0.2));
  const midIdx = beakMid.map((p) => b.addVert(p[0], p[1], p[2], 0.6, 0.5));
  const tipIdx = b.addVert(0.130, 0.0172, 0.0, 1.0, 0.5);
  const backIdx = b.addVert(0.101, 0.0185, 0.0, 0.0, 0.5);

  const n = beakBase.length;
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    b.addQuad(baseIdx[i], baseIdx[ni], midIdx[ni], midIdx[i]);
    b.addTri(midIdx[i], midIdx[ni], tipIdx);
    b.addTri(backIdx, baseIdx[ni], baseIdx[i]);
  }

  // Two subtle glossy 3D eye beads seated cleanly on left & right sides of head
  const addEye = (cx, cy, cz, rx, ry, rz) => {
    const rings = 5;
    const segs = 8;
    const rows = [];
    const topV = b.addVert(cx, cy + ry, cz, 0.5, 0.0);
    const botV = b.addVert(cx, cy - ry, cz, 0.5, 1.0);
    for (let r = 1; r < rings; r++) {
      const phi = (r / rings) * Math.PI;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      const row = [];
      for (let s = 0; s < segs; s++) {
        const th = (s / segs) * Math.PI * 2;
        row.push(
          b.addVert(
            cx + Math.cos(th) * sp * rx,
            cy + cp * ry,
            cz + Math.sin(th) * sp * rz,
            s / segs,
            r / rings
          )
        );
      }
      rows.push(row);
    }
    for (let s = 0; s < segs; s++) {
      const ns = (s + 1) % segs;
      b.addTri(topV, rows[0][ns], rows[0][s]);
      b.addTri(botV, rows[rows.length - 1][s], rows[rows.length - 1][ns]);
    }
    for (let r = 0; r < rows.length - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const ns = (s + 1) % segs;
        b.addQuad(rows[r][s], rows[r][ns], rows[r + 1][ns], rows[r + 1][s]);
      }
    }
  };

  addEye(0.094, 0.0235,  0.0145, 0.0044, 0.0044, 0.0030);
  addEye(0.094, 0.0235, -0.0145, 0.0044, 0.0044, 0.0030);

  return b.toGeometry();
}

function build() {
  const root = createRoot('WildlifeSwallow');

  // Procedural plumage texture for body/head/forked tail (512x512)
  // v=0 (top y=0): deep glossy slate-indigo dorsal back (#1e293b)
  // v=1 (bottom y=511): warm crisp cream-white throat, chest & belly (#ebe6da)
  const bodyTex = proceduralTexture({
    schemaVersion: 3,
    width: 512,
    height: 512,
    usage: 'albedo',
    name: 'SwallowBodyPlumage',
    background: [30, 41, 59, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 512,
          usage: 'albedo',
          layers: [
            { op: 'solid', color: 0x1e293b },
            { op: 'noise', colorA: 0x172030, colorB: 0x2b3b54, scale: 14, octaves: 3, seed: 11, blend: 'normal', opacity: 0.45 },
            { op: 'stripes', colorA: 0x1b2638, colorB: 0x26354d, count: 44, angleDeg: 90, blend: 'overlay', opacity: 0.25 },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 30, y: 12, width: 320, height: 95 },
        rgba: [43, 62, 92, 95],
      },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 400, y: 0, width: 112, height: 240 },
        rgba: [21, 29, 43, 185],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [0, 224], [64, 212], [130, 226], [210, 250], [310, 266], [420, 284], [512, 310],
            [512, 512], [0, 512],
          ],
        },
        rgba: [235, 230, 218, 255],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [0, 218], [64, 206], [130, 220], [210, 244], [310, 260], [420, 278], [512, 304],
            [512, 322], [420, 296], [310, 278], [210, 262], [130, 238], [64, 224], [0, 236],
          ],
        },
        rgba: [185, 188, 188, 120],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 36, y: 300, width: 260, height: 190 },
        rgba: [244, 240, 230, 145],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 112, y: 214, width: 72, height: 34 },
        rgba: [34, 47, 68, 140],
      },
      {
        op: 'paint',
        shape: { kind: 'line', from: [40, 360], to: [380, 375], width: 3 },
        rgba: [215, 208, 194, 70],
      },
      {
        op: 'paint',
        shape: { kind: 'line', from: [60, 415], to: [410, 425], width: 3 },
        rgba: [215, 208, 194, 70],
      },
    ],
  });

  // Procedural plumage texture for swept wings (512x512)
  // Top half (y=0..250): deep glossy slate-indigo upper wing (#1e293b) with primary feather shafts
  // Bottom half (y=260..512): crisp cream-white underwing coverts (#ebe6da) + slate trailing flight feathers
  const wingTex = proceduralTexture({
    schemaVersion: 3,
    width: 512,
    height: 512,
    usage: 'albedo',
    name: 'SwallowWingPlumage',
    background: [30, 41, 59, 255],
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2,
          size: 512,
          usage: 'albedo',
          layers: [
            { op: 'solid', color: 0x1e293b },
            { op: 'noise', colorA: 0x182233, colorB: 0x2c3d58, scale: 12, octaves: 3, seed: 23, blend: 'normal', opacity: 0.42 },
          ],
        },
        opacity: 255,
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: -40, y: 12, width: 390, height: 120 },
        rgba: [43, 60, 88, 95],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: -20, y: 24, width: 320, height: 85 },
        rgba: [50, 70, 102, 75],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 240, y: -30, width: 320, height: 310 },
        rgba: [22, 31, 46, 110],
      },
      {
        op: 'paint',
        shape: { kind: 'ellipse', x: 310, y: -20, width: 240, height: 290 },
        rgba: [18, 25, 38, 120],
      },
      { op: 'paint', shape: { kind: 'line', from: [90, 105], to: [140, 245], width: 3 }, rgba: [15, 22, 34, 130] },
      { op: 'paint', shape: { kind: 'line', from: [150, 100], to: [210, 245], width: 3 }, rgba: [15, 22, 34, 130] },
      { op: 'paint', shape: { kind: 'line', from: [215, 92], to: [285, 245], width: 3 }, rgba: [15, 22, 34, 130] },
      { op: 'paint', shape: { kind: 'line', from: [280, 82], to: [365, 245], width: 3 }, rgba: [15, 22, 34, 145] },
      { op: 'paint', shape: { kind: 'line', from: [345, 72], to: [440, 245], width: 3 }, rgba: [15, 22, 34, 155] },
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: 0, y: 256, width: 512, height: 256 },
        rgba: [235, 230, 218, 255],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [0, 412], [180, 398], [310, 362], [410, 300], [512, 256],
            [512, 512], [0, 512],
          ],
        },
        rgba: [48, 62, 82, 235],
      },
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [[330, 355], [440, 285], [512, 256], [512, 512], [290, 512]],
        },
        rgba: [28, 38, 54, 195],
      },
      { op: 'paint', shape: { kind: 'line', from: [80, 405], to: [120, 508], width: 3 }, rgba: [26, 35, 48, 110] },
      { op: 'paint', shape: { kind: 'line', from: [170, 396], to: [220, 508], width: 3 }, rgba: [26, 35, 48, 110] },
      { op: 'paint', shape: { kind: 'line', from: [260, 376], to: [320, 508], width: 3 }, rgba: [24, 32, 45, 120] },
      { op: 'paint', shape: { kind: 'line', from: [350, 338], to: [420, 508], width: 3 }, rgba: [20, 28, 40, 130] },
    ],
  });

  const bodyMat = pbrMaterial({
    albedo: bodyTex,
    roughness: 0.44,
    metalness: 0.08,
    name: 'SwallowPlumage',
  });

  const wingMat = pbrMaterial({
    albedo: wingTex,
    roughness: 0.46,
    metalness: 0.08,
    name: 'SwallowWingPlumage',
  });

  const eyeBeakMat = gameMaterial(0x161c26, {
    roughness: 0.16,
    metalness: 0.08,
    flatShading: false,
    name: 'SwallowEyeBeak',
  });

  createPart('Body', buildSwallowBodyGeo(), bodyMat, { parent: root });
  createPart('BeakEyes', buildBeakAndEyesGeo(), eyeBeakMat, { parent: root });

  // Exact named rigid wing pivot groups for Holodeck motion.gait@1 (axis: "x")
  const wingL = new THREE.Group();
  wingL.name = 'Joint_WingL';
  wingL.position.set(0.02, 0.02, -0.04);
  root.add(wingL);
  createPart('WingL', buildSwallowWingGeo(-1), wingMat, { parent: wingL });

  const wingR = new THREE.Group();
  wingR.name = 'Joint_WingR';
  wingR.position.set(0.02, 0.02, 0.04);
  root.add(wingR);
  createPart('WingR', buildSwallowWingGeo(1), wingMat, { parent: wingR });

  return root;
}
