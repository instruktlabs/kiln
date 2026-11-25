const meta = {
  name: 'foliage-bromeliad',
  role: 'prop',
};

function mergeGeos(geos) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < count; i++) {
        indices.push(i + vertexOffset);
      }
    }
    vertexOffset += count;
  }

  return meshGeo({ positions, normals, uvs, indices });
}

function lerpColor(c0, c1, t) {
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t),
    255,
  ];
}

function sampleStops(stops, t) {
  if (t <= stops[0].t) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const f = (t - stops[i - 1].t) / Math.max(1e-6, stops[i].t - stops[i - 1].t);
      return lerpColor(stops[i - 1].c, stops[i].c, f);
    }
  }
  return stops[stops.length - 1].c;
}

function makeStrapOutline(w, h, opts) {
  const cx = w * 0.5;
  const maxHW = opts.maxHW;
  const baseHW = opts.baseHW;
  const tipY = opts.tipY;
  const peakV = opts.peakV;
  const pts = [];

  // Sheathing base (top edge y=0, V=0.0)
  pts.push([Math.round(cx - baseHW), 0]);
  pts.push([Math.round(cx + baseHW), 0]);

  const steps = 8;
  // Right lanceolate margin down to dagger tip
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = Math.round(t * tipY);
    let wf;
    if (t < peakV) {
      const u = t / peakV;
      wf = baseHW + (maxHW - baseHW) * Math.sin(u * Math.PI * 0.5);
    } else {
      const u = (t - peakV) / (1 - peakV);
      wf = maxHW * Math.pow(1 - u, opts.tipPower || 0.92);
    }
    pts.push([Math.round(cx + Math.max(2, wf)), y]);
  }

  // Sharp botanical acuminate tip
  pts.push([Math.round(cx), Math.round(tipY + 4)]);

  // Left lanceolate margin back up to base
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const y = Math.round(t * tipY);
    let wf;
    if (t < peakV) {
      const u = t / peakV;
      wf = baseHW + (maxHW - baseHW) * Math.sin(u * Math.PI * 0.5);
    } else {
      const u = (t - peakV) / (1 - peakV);
      wf = maxHW * Math.pow(1 - u, opts.tipPower || 0.92);
    }
    pts.push([Math.round(cx - Math.max(2, wf)), y]);
  }

  return pts;
}

function buildBromeliadColumn(kind) {
  const W = 256;
  const H = 512;
  const cx = 128;

  let stops;
  let veinLight;
  let veinDark;
  let mottleRgba;
  let outlineOpts;
  let seed;

  if (kind === 'outer') {
    // Deep waxy tropical green strap leaf with burgundy-tinted sheathing base
    stops = [
      { t: 0.00, c: [64, 28, 28] },   // burgundy-wine sheathing base
      { t: 0.16, c: [38, 66, 28] },   // deep forest green
      { t: 0.45, c: [36, 78, 30] },   // rich waxy green (#244e1e)
      { t: 0.78, c: [52, 102, 40] },  // lush mid botanical green (#346628)
      { t: 1.00, c: [68, 114, 46] },  // sun-warmed green tip
    ];
    veinLight = [84, 134, 58, 255];
    veinDark = [22, 48, 18, 255];
    mottleRgba = [74, 122, 50, 255];
    outlineOpts = { baseHW: 98, maxHW: 112, peakV: 0.34, tipY: 500, tipPower: 0.88 };
    seed = 301;
  } else if (kind === 'mid') {
    // Rich transition whorl: olive-burgundy base blazing into fiery crimson upper blade & tip!
    stops = [
      { t: 0.00, c: [58, 48, 22] },   // deep olive-bronze sheath
      { t: 0.22, c: [52, 74, 28] },   // olive-jungle green lower blade
      { t: 0.42, c: [112, 34, 30] },  // rich wine-crimson transition (#70221e)
      { t: 0.68, c: [168, 34, 34] },  // vibrant crimson (#a82222)
      { t: 0.88, c: [200, 42, 38] },  // fiery crimson (#c82a26)
      { t: 1.00, c: [220, 56, 42] },  // bright scarlet-crimson tip
    ];
    veinLight = [232, 84, 62, 255];
    veinDark = [88, 16, 18, 255];
    mottleRgba = [196, 42, 38, 255];
    outlineOpts = { baseHW: 92, maxHW: 110, peakV: 0.36, tipY: 500, tipPower: 0.90 };
    seed = 409;
  } else if (kind === 'bract') {
    // Inner glowing scarlet-crimson floral bract star with warm golden-amber throat
    stops = [
      { t: 0.00, c: [198, 118, 34] }, // warm golden-orange throat
      { t: 0.18, c: [192, 42, 34] },  // deep glowing scarlet
      { t: 0.52, c: [214, 44, 36] },  // radiant crimson (#d62c24)
      { t: 0.82, c: [232, 66, 46] },  // vivid scarlet-flame (#e8422e)
      { t: 1.00, c: [242, 92, 54] },  // luminous scarlet-coral apex
    ];
    veinLight = [250, 128, 74, 255];
    veinDark = [148, 20, 22, 255];
    mottleRgba = [245, 98, 56, 255];
    outlineOpts = { baseHW: 84, maxHW: 108, peakV: 0.32, tipY: 500, tipPower: 0.94 };
    seed = 509;
  } else {
    // Tight warm-gold central floral bud petals with warm amber/scarlet tips
    stops = [
      { t: 0.00, c: [168, 108, 26] }, // deep honey amber base
      { t: 0.35, c: [219, 168, 52] }, // warm gold (#dba834)
      { t: 0.72, c: [240, 198, 72] }, // radiant golden yellow
      { t: 1.00, c: [230, 96, 46] },  // warm fiery orange-red tip
    ];
    veinLight = [252, 224, 112, 255];
    veinDark = [154, 92, 20, 255];
    mottleRgba = [246, 204, 86, 255];
    outlineOpts = { baseHW: 78, maxHW: 104, peakV: 0.38, tipY: 498, tipPower: 0.95 };
    seed = 613;
  }

  const albedoOps = [];
  // Smooth 10-band continuous base-to-tip botanical color ramp
  const bands = 10;
  for (let b = 0; b < bands; b++) {
    const y0 = Math.round((b / bands) * H);
    const y1 = Math.round(((b + 1) / bands) * H);
    const tMid = (b + 0.5) / bands;
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'rectangle', x: 0, y: y0, width: W, height: Math.max(1, y1 - y0) },
      rgba: sampleStops(stops, tMid),
    });
  }

  // Subtle organic waxy mottling
  albedoOps.push({
    op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: 32, height: 110 },
    rgba: mottleRgba,
    opacity: 28,
    count: 6,
    seed,
    area: { x: 24, y: 20, width: 180, height: 360 },
  });

  // Crisp parallel longitudinal bromeliad striations & central gutter rib
  const striationOffsets = [-74, -46, -22, 0, 22, 46, 74];
  for (let i = 0; i < striationOffsets.length; i++) {
    const dx = striationOffsets[i];
    const isCenter = dx === 0;
    // Slight convergence toward tip
    const xBase = cx + dx;
    const xTip = cx + Math.round(dx * 0.25);
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xBase, 0], to: [xTip, 494], width: isCenter ? 7 : 3 },
      rgba: isCenter ? veinDark : (i % 2 === 0 ? veinLight : veinDark),
      opacity: isCenter ? 85 : 58,
    });
  }
  // Luminous central mid-nerve highlight
  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 12], to: [cx, 488], width: 3 },
    rgba: veinLight,
    opacity: 90,
  });

  // Tapered lanceolate strap silhouette mask
  const outlinePts = makeStrapOutline(W, H, outlineOpts);
  albedoOps.push({
    op: 'mask',
    shape: { kind: 'polygon', points: outlinePts },
    invert: false,
  });

  // ---- DEDICATED HEIGHT MAP (clean longitudinal parallel ribs, zero color crosstalk!) ----
  const heightOps = [];
  // Central recessed V-trough shadow in height map
  heightOps.push({
    op: 'paint',
    shape: { kind: 'rectangle', x: cx - 18, y: 0, width: 36, height: H },
    rgba: [106, 106, 106, 255],
    opacity: 140,
  });
  for (let i = 0; i < striationOffsets.length; i++) {
    const dx = striationOffsets[i];
    const xBase = cx + dx;
    const xTip = cx + Math.round(dx * 0.25);
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xBase, 0], to: [xTip, 496], width: dx === 0 ? 5 : 4 },
      rgba: dx === 0 ? [186, 186, 186, 255] : [166, 166, 166, 255],
      opacity: 175,
    });
  }

  return {
    albedoSpec: {
      schemaVersion: 3,
      width: W,
      height: H,
      usage: 'albedo',
      background: [0, 0, 0, 0],
      operations: albedoOps,
    },
    heightSpec: {
      schemaVersion: 3,
      width: W,
      height: H,
      usage: 'albedo',
      background: [128, 128, 128, 255],
      operations: heightOps,
    },
  };
}

function buildChanneledStrapBlade(opts) {
  const {
    length,
    width,
    uSegs = 4,
    vSegs = 8,
    startElevRad = 0.65,
    archDroopRad = 1.15,
    troughDepth = 0.24,
    twistTip = 0,
    baseRadiusOffset = 0.025,
    baseYOffset = -0.04,
  } = opts;

  const dv = 1 / vSegs;
  const rxArr = new Array(vSegs + 1).fill(0);
  const ryArr = new Array(vSegs + 1).fill(0);
  const pitchArr = new Array(vSegs + 1).fill(0);

  rxArr[0] = baseRadiusOffset;
  ryArr[0] = baseYOffset;

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    // Graceful botanical bromeliad arch: rises steep from cup, arches smoothly outward & downward at tip
    pitchArr[j] = startElevRad - archDroopRad * Math.pow(v, 1.38);
  }
  for (let j = 1; j <= vSegs; j++) {
    const pMid = 0.5 * (pitchArr[j - 1] + pitchArr[j]);
    rxArr[j] = rxArr[j - 1] + Math.cos(pMid) * (length * dv);
    ryArr[j] = ryArr[j - 1] + Math.sin(pMid) * (length * dv);
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    const pitch = pitchArr[j];
    const upX = -Math.sin(pitch);
    const upY = Math.cos(pitch);
    const twist = twistTip * v * v;
    const ct = Math.cos(twist);
    const st = Math.sin(twist);

    // Subtle geometric envelope taper so bases nest tightly and tips narrow gracefully (never zero!)
    const wEnv = (0.76 + 0.30 * Math.sin(Math.pow(v, 0.72) * Math.PI)) * (1 - 0.52 * Math.pow(v, 2.2));
    const halfW = width * 0.5 * Math.max(0.28, wEnv);

    // Channeled V/U-trough deepest near rosette tank base, relaxing slightly toward the tip
    const troughScale = 1.0 - 0.55 * v;

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const uc = u * 2 - 1; // -1..+1
      const absU = Math.abs(uc);

      // Authentic bromeliad channeled V-trough cross-section (edges curl UP around central gutter)
      const localH = troughDepth * width * Math.pow(absU, 1.45) * troughScale;
      // Pull edges slightly inward in Z as they curve up into the U-channel
      const localZ = uc * halfW * (1 - 0.14 * absU * absU * troughScale);

      const rz = localZ * ct - localH * st;
      const rh = localZ * st + localH * ct;

      positions.push(rxArr[j] + upX * rh, ryArr[j] + upY * rh, rz);
      // UV.y strictly 0.0 at anchored rosette base -> 1.0 at free tip!
      uvs.push(u, v);
    }
  }

  const row = uSegs + 1;
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = (j + 1) * row + i;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = meshGeo({ positions, uvs, indices });
  geo.computeVertexNormals();
  return geo;
}

function transformGeoMatrix(geo, matrix) {
  const g = copyGeometry(geo);
  g.applyMatrix4(matrix);
  return g;
}

function addBromeliadRosette(leafGeos, baseGeos, leafAtlas, rng, opts) {
  const {
    origin,
    tiltXDeg = 0,
    tiltZDeg = 0,
    scale = 1.0,
    outerCount = 14,
    midCount = 11,
    bractCount = 9,
    budCount = 6,
    phaseDeg = 0,
  } = opts;

  const rosetteMat = new THREE.Matrix4();
  const rosetteQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(tiltXDeg * Math.PI / 180, 0, tiltZDeg * Math.PI / 180, 'XYZ'),
  );
  rosetteMat.compose(
    new THREE.Vector3(origin[0], origin[1], origin[2]),
    rosetteQ,
    new THREE.Vector3(scale, scale, scale),
  );

  // Compact organic tapering root-bulb core tucked neatly inside overlapping leaf bases (no cylinder pot!)
  const corePath = [
    [0, -0.090, 0],
    [0, -0.045, 0],
    [0,  0.005, 0],
    [0,  0.055, 0],
  ];
  const coreGeo = taperedTube(corePath, [0.022, 0.042, 0.046, 0.024], { radialSegments: 8, creaseAngle: 180, cap: true });
  baseGeos.push(transformGeoMatrix(coreGeo, rosetteMat));

  const GOLDEN = 137.507764;

  // 1. Outer spreading waxy green strap-leaf whorl (bold arching fountain!)
  for (let i = 0; i < outerCount; i++) {
    const f = rng.fork(`outer-${i}`);
    const t = i / Math.max(1, outerCount - 1);
    const az = (phaseDeg + i * GOLDEN + f.range(-7, 7)) * (Math.PI / 180);
    const blade = buildChanneledStrapBlade({
      length: f.range(0.44, 0.53) * (1.06 - 0.10 * t),
      width: f.range(0.088, 0.106),
      uSegs: 4,
      vSegs: 8,
      startElevRad: (38 + t * 22 + f.range(-4, 4)) * (Math.PI / 180),
      archDroopRad: (74 + f.range(-8, 12)) * (Math.PI / 180),
      troughDepth: f.range(0.24, 0.30),
      twistTip: f.range(-0.18, 0.18),
      baseRadiusOffset: 0.018 + (1 - t) * 0.016,
      baseYOffset: -0.052 + t * 0.036,
    });
    const remapped = remapUVToAtlas(blade, leafAtlas, 'outer', {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    const m = rosetteMat.clone().multiply(new THREE.Matrix4().makeRotationY(az));
    leafGeos.push(transformGeoMatrix(remapped, m));
  }

  // 2. Mid upright-splaying olive-to-crimson transition whorl (tall sculptural arch!)
  for (let i = 0; i < midCount; i++) {
    const f = rng.fork(`mid-${i}`);
    const t = i / Math.max(1, midCount - 1);
    const az = (phaseDeg + 52 + i * GOLDEN + f.range(-6, 6)) * (Math.PI / 180);
    const blade = buildChanneledStrapBlade({
      length: f.range(0.52, 0.64) * (1.04 - 0.10 * t),
      width: f.range(0.080, 0.096),
      uSegs: 4,
      vSegs: 8,
      startElevRad: (62 + t * 14 + f.range(-4, 4)) * (Math.PI / 180),
      archDroopRad: (50 + f.range(-8, 10)) * (Math.PI / 180),
      troughDepth: f.range(0.26, 0.32),
      twistTip: f.range(-0.15, 0.15),
      baseRadiusOffset: 0.014 + (1 - t) * 0.010,
      baseYOffset: -0.016 + t * 0.032,
    });
    const remapped = remapUVToAtlas(blade, leafAtlas, 'mid', {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    const m = rosetteMat.clone().multiply(new THREE.Matrix4().makeRotationY(az));
    leafGeos.push(transformGeoMatrix(remapped, m));
  }

  // 3. Inner glowing scarlet-crimson floral bract star (proud botanical flame crown -> ~0.78 m tall!)
  for (let i = 0; i < bractCount; i++) {
    const f = rng.fork(`bract-${i}`);
    const t = i / Math.max(1, bractCount - 1);
    const az = (phaseDeg + 114 + i * GOLDEN + f.range(-5, 5)) * (Math.PI / 180);
    const blade = buildChanneledStrapBlade({
      length: f.range(0.54, 0.68) * (1.05 - 0.14 * t),
      width: f.range(0.068, 0.082),
      uSegs: 4,
      vSegs: 7,
      startElevRad: (74 + t * 11 + f.range(-3, 3)) * (Math.PI / 180),
      archDroopRad: (30 + f.range(-5, 7)) * (Math.PI / 180),
      troughDepth: f.range(0.28, 0.34),
      twistTip: f.range(-0.12, 0.12),
      baseRadiusOffset: 0.010 + (1 - t) * 0.008,
      baseYOffset: 0.018 + t * 0.030,
    });
    const remapped = remapUVToAtlas(blade, leafAtlas, 'bract', {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    const m = rosetteMat.clone().multiply(new THREE.Matrix4().makeRotationY(az));
    leafGeos.push(transformGeoMatrix(remapped, m));
  }

  // 4. Tight warm-gold central floral bud nested inside the glowing scarlet crown
  for (let i = 0; i < budCount; i++) {
    const f = rng.fork(`bud-${i}`);
    const az = (phaseDeg + 20 + (i / budCount) * 360 + f.range(-10, 10)) * (Math.PI / 180);
    const blade = buildChanneledStrapBlade({
      length: f.range(0.28, 0.36),
      width: f.range(0.044, 0.056),
      uSegs: 3,
      vSegs: 5,
      startElevRad: (80 + f.range(-4, 5)) * (Math.PI / 180),
      archDroopRad: (16 + f.range(-4, 6)) * (Math.PI / 180),
      troughDepth: 0.35,
      twistTip: f.range(-0.08, 0.08),
      baseRadiusOffset: 0.006,
      baseYOffset: 0.052 + f.range(0, 0.018),
    });
    const remapped = remapUVToAtlas(blade, leafAtlas, 'bud', {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    const m = rosetteMat.clone().multiply(new THREE.Matrix4().makeRotationY(az));
    leafGeos.push(transformGeoMatrix(remapped, m));
  }
}

async function build() {
  const root = createRoot('CrimsonBromeliadClump');
  const rng = seededRandom('lagoon-bromeliad-v1');

  const colOuter = buildBromeliadColumn('outer');
  const colMid = buildBromeliadColumn('mid');
  const colBract = buildBromeliadColumn('bract');
  const colBud = buildBromeliadColumn('bud');

  const leafAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'outer',
        content: { x: 0, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colOuter.albedoSpec },
      },
      {
        name: 'mid',
        content: { x: 256, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colMid.albedoSpec },
      },
      {
        name: 'bract',
        content: { x: 512, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colBract.albedoSpec },
      },
      {
        name: 'bud',
        content: { x: 768, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colBud.albedoSpec },
      },
    ],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      { name: 'outer', content: { x: 0, y: 0, width: 256, height: 512 }, gutter: 0, edgeMode: 'copy-edge', source: { kind: 'procedural', spec: colOuter.heightSpec } },
      { name: 'mid',   content: { x: 256, y: 0, width: 256, height: 512 }, gutter: 0, edgeMode: 'copy-edge', source: { kind: 'procedural', spec: colMid.heightSpec } },
      { name: 'bract', content: { x: 512, y: 0, width: 256, height: 512 }, gutter: 0, edgeMode: 'copy-edge', source: { kind: 'procedural', spec: colBract.heightSpec } },
      { name: 'bud',   content: { x: 768, y: 0, width: 256, height: 512 }, gutter: 0, edgeMode: 'copy-edge', source: { kind: 'procedural', spec: colBud.heightSpec } },
    ],
  });

  const leafNormal = normalMapFromHeight(heightAtlas, { strength: 4.2, name: 'BromeliadLeafNormal' });

  const leafMat = pbrMaterial({
    albedo: leafAtlas,
    normal: leafNormal,
    roughness: 0.42,
    metalness: 0,
    alphaMode: 'mask',
    alphaCutoff: 0.5,
    doubleSided: true,
    name: 'BromeliadLeaves',
  });

  // Compact fibrous dark olive-burgundy basal sheath crown (blends seamlessly with sheathing leaf bases!)
  const baseAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 128,
    usage: 'albedo',
    name: 'BromeliadCrownAlbedo',
    layers: [
      { op: 'solid', color: 0x2d3a1e },
      { op: 'gradient', from: 0x3a201b, to: 0x26441c, angleDeg: 90, blend: 'normal', opacity: 0.55 },
      { op: 'noise', colorA: 0x241916, colorB: 0x3c5226, scale: 10, octaves: 3, seed: 41, blend: 'overlay', opacity: 0.42 },
    ],
  });
  const baseMat = pbrMaterial({
    albedo: baseAlbedo,
    roughness: 0.68,
    metalness: 0,
    name: 'BromeliadBase',
  });

  const leafGeos = [];
  const baseGeos = [];

  // Primary hero crimson rosette -> target clump ~1.05 m wide x 0.78 m tall x 1.00 m deep!
  addBromeliadRosette(leafGeos, baseGeos, leafAtlas, rng.fork('hero'), {
    origin: [-0.02, 0.01, -0.02],
    tiltXDeg: -2,
    tiltZDeg: 2,
    scale: 1.06,
    outerCount: 15,
    midCount: 12,
    bractCount: 10,
    budCount: 6,
    phaseDeg: 18,
  });

  // Cohesively nested side pup A (front-right leaning gracefully outward)
  addBromeliadRosette(leafGeos, baseGeos, leafAtlas, rng.fork('pup-a'), {
    origin: [0.16, -0.01, 0.17],
    tiltXDeg: 11,
    tiltZDeg: -9,
    scale: 0.62,
    outerCount: 9,
    midCount: 6,
    bractCount: 5,
    budCount: 4,
    phaseDeg: 75,
  });

  // Cohesively nested side pup B (back-left leaning gracefully outward)
  addBromeliadRosette(leafGeos, baseGeos, leafAtlas, rng.fork('pup-b'), {
    origin: [-0.15, -0.015, -0.14],
    tiltXDeg: -10,
    tiltZDeg: 11,
    scale: 0.54,
    outerCount: 8,
    midCount: 5,
    bractCount: 5,
    budCount: 3,
    phaseDeg: 195,
  });

  createPart('BromeliadBase', mergeGeos(baseGeos), baseMat, { parent: root });
  const leavesPart = createPart('BromeliadLeaves', mergeGeos(leafGeos), leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided channeled 3D bromeliad strap leaves and scarlet bracts');

  return root;
}
