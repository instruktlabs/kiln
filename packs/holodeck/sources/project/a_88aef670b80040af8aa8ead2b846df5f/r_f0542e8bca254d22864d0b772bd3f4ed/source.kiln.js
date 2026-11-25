const meta = {
  name: 'foliage-monstera-a',
  role: 'prop',
};

function mergeGeos(geos) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const raw of geos) {
    const g = raw;
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

function makeCordateOutline(w, h, opts) {
  const cx = w * 0.5;
  const sinusY = opts.sinusY;
  const tipY = opts.tipY;
  const lobeTopY = opts.lobeTopY;
  const maxHalfW = opts.maxHalfW;
  const asym = opts.asym || 0;
  const pts = [];

  // Sinus center (top)
  pts.push([Math.round(cx), Math.round(sinusY)]);

  // Smooth rounded right basal ear
  const rightEar = [
    [cx + maxHalfW * 0.14, sinusY - 22],
    [cx + maxHalfW * 0.30, lobeTopY + 8],
    [cx + maxHalfW * 0.50, lobeTopY],
    [cx + maxHalfW * 0.72, lobeTopY + 12],
    [cx + maxHalfW * 0.90, lobeTopY + 46],
    [cx + maxHalfW * 1.00, lobeTopY + 98],
  ];
  for (const [x, y] of rightEar) pts.push([Math.round(x), Math.round(y)]);

  // Full broad rounded-heart outer margin down to graceful acuminate tip
  const sideSteps = 10;
  for (let i = 1; i <= sideSteps; i++) {
    const t = i / sideSteps;
    const y = lobeTopY + 98 + t * (tipY - (lobeTopY + 98));
    // Fuller rounder Monstera deliciosa heart-ovate envelope (not a skinny triangle!)
    const widthFactor = Math.pow(Math.cos(t * Math.PI * 0.5), 0.76) * (1 + 0.10 * Math.sin(t * Math.PI));
    const x = cx + (maxHalfW * (1 + asym * 0.04)) * Math.max(0.015, widthFactor);
    pts.push([Math.round(x), Math.round(y)]);
  }

  // Softly pointed acuminate drip-tip
  pts.push([Math.round(cx), Math.round(tipY)]);

  // Left outer margin back up
  for (let i = sideSteps; i >= 1; i--) {
    const t = i / sideSteps;
    const y = lobeTopY + 98 + t * (tipY - (lobeTopY + 98));
    const widthFactor = Math.pow(Math.cos(t * Math.PI * 0.5), 0.76) * (1 + 0.10 * Math.sin(t * Math.PI));
    const x = cx - (maxHalfW * (1 - asym * 0.04)) * Math.max(0.015, widthFactor);
    pts.push([Math.round(x), Math.round(y)]);
  }

  // Smooth rounded left basal ear back to sinus
  const leftEar = [
    [cx - maxHalfW * 1.00, lobeTopY + 98],
    [cx - maxHalfW * 0.90, lobeTopY + 46],
    [cx - maxHalfW * 0.72, lobeTopY + 12],
    [cx - maxHalfW * 0.50, lobeTopY],
    [cx - maxHalfW * 0.30, lobeTopY + 8],
    [cx - maxHalfW * 0.14, sinusY - 22],
  ];
  for (const [x, y] of leftEar) pts.push([Math.round(x), Math.round(y)]);

  return pts;
}

function makeFenestrationSlit(side, innerX, innerY, outerX, outerY, halfWInner, halfWOuter, bendY) {
  // Builds a smooth curved channel from well past the outer margin to a rounded inner tear-drop tip
  const dx = outerX - innerX;
  const dy = outerY - innerY;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  // Perpendicular normal
  const nx = -ty;
  const ny = tx;

  const upper = [];
  const lower = [];
  const steps = 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Slight organic arc curving forward toward leaf tip
    const arc = Math.sin(t * Math.PI) * bendY;
    const px = innerX + dx * t;
    const py = innerY + dy * t + arc;
    const hw = halfWInner + (halfWOuter - halfWInner) * Math.pow(t, 1.15);
    upper.push([Math.round(px + nx * hw), Math.round(py + ny * hw)]);
    lower.push([Math.round(px - nx * hw), Math.round(py - ny * hw)]);
  }

  // Rounded inner cap around (innerX, innerY)
  const cap = [];
  const capSteps = 3;
  for (let i = 1; i < capSteps; i++) {
    const a = (i / capSteps) * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Goes from -n side around -t (back of tip) to +n side
    const rx = innerX + (-nx * c - tx * s) * halfWInner;
    const ry = innerY + (-ny * c - ty * s) * halfWInner;
    cap.push([Math.round(rx), Math.round(ry)]);
  }

  const pts = [];
  for (let i = 0; i < upper.length; i++) pts.push(upper[i]);
  for (let i = lower.length - 1; i >= 0; i--) pts.push(lower[i]);
  for (let i = 0; i < cap.length; i++) pts.push(cap[i]);
  return pts;
}

function makeOvalHole(cx, cy, rx, ry, angleRad) {
  const pts = [];
  const n = 14;
  const ca = Math.cos(angleRad);
  const sa = Math.sin(angleRad);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lx = Math.cos(a) * rx;
    const ly = Math.sin(a) * ry;
    pts.push([
      Math.round(cx + lx * ca - ly * sa),
      Math.round(cy + lx * sa + ly * ca),
    ]);
  }
  return pts;
}

function buildMonsteraColumnSpecs(variant) {
  const S = 512;
  const cx = 256;
  const isA = variant === 'a';

  const outlineOpts = isA
    ? { sinusY: 78, lobeTopY: 16, tipY: 494, maxHalfW: 228, asym: 0.30 }
    : { sinusY: 72, lobeTopY: 20, tipY: 492, maxHalfW: 220, asym: -0.40 };

  const outlinePts = makeCordateOutline(S, S, outlineOpts);

  // Lush, bold, organically spaced Monstera deliciosa lateral veins (thicker near midrib, softer outward)
  const veins = isA ? [
    // Right side (4 strong primary lobe ribs)
    { y0: 108, xm: 360, ym: 82,  x2: 446, y2: 88,  w: 6 },
    { y0: 176, xm: 374, ym: 168, x2: 472, y2: 184, w: 6 },
    { y0: 262, xm: 368, ym: 266, x2: 454, y2: 298, w: 5 },
    { y0: 348, xm: 344, ym: 358, x2: 404, y2: 394, w: 4 },
    // Left side (staggered naturally)
    { y0: 104, xm: 152, ym: 80,  x2: 68,  y2: 92,  w: 6 },
    { y0: 192, xm: 138, ym: 188, x2: 44,  y2: 208, w: 6 },
    { y0: 284, xm: 146, ym: 290, x2: 64,  y2: 326, w: 5 },
    { y0: 366, xm: 170, ym: 376, x2: 112, y2: 410, w: 4 },
  ] : [
    // Variant B: distinct rhythm
    { y0: 102, xm: 356, ym: 80,  x2: 438, y2: 92,  w: 6 },
    { y0: 186, xm: 370, ym: 182, x2: 462, y2: 204, w: 6 },
    { y0: 278, xm: 360, ym: 286, x2: 438, y2: 320, w: 5 },
    { y0: 360, xm: 334, ym: 372, x2: 386, y2: 406, w: 4 },
    // Left side
    { y0: 108, xm: 156, ym: 86,  x2: 74,  y2: 96,  w: 6 },
    { y0: 174, xm: 142, ym: 168, x2: 48,  y2: 184, w: 6 },
    { y0: 258, xm: 146, ym: 264, x2: 62,  y2: 296, w: 5 },
    { y0: 344, xm: 172, ym: 354, x2: 114, y2: 390, w: 4 },
  ];

  // Bold, wide sculptural Monstera fenestration splits (4 per side, rich broad glossy lobes between!)
  const slits = isA ? [
    // Right splits (between the 4 right veins + tip lobe)
    { from: [318, 134], to: [524, 134], w: 26 },
    { from: [302, 218], to: [524, 240], w: 30 },
    { from: [298, 304], to: [508, 344], w: 28 },
    { from: [294, 386], to: [458, 430], w: 22 },
    // Left splits (staggered naturally for authentic organic asymmetry)
    { from: [194, 144], to: [-12, 148], w: 27 },
    { from: [208, 236], to: [-12, 264], w: 30 },
    { from: [214, 326], to: [12,  368], w: 26 },
    { from: [222, 404], to: [68,  444], w: 20 },
  ] : [
    // Variant B: 4 right + 3 deep left splits
    { from: [314, 142], to: [524, 146], w: 28 },
    { from: [300, 230], to: [524, 258], w: 32 },
    { from: [298, 318], to: [502, 360], w: 27 },
    { from: [296, 398], to: [446, 440], w: 20 },
    // Left splits
    { from: [198, 136], to: [-12, 138], w: 25 },
    { from: [210, 214], to: [-12, 238], w: 31 },
    { from: [214, 300], to: [8,   340], w: 28 },
    { from: [222, 384], to: [58,  426], w: 21 },
  ];

  // Classic interior oval fenestration perforations nestled cleanly between veins
  const holes = isA ? [
    { kind: 'ellipse', x: 274, y: 158, width: 22, height: 13 },
    { kind: 'ellipse', x: 214, y: 248, width: 22, height: 13 },
  ] : [
    { kind: 'ellipse', x: 214, y: 156, width: 22, height: 13 },
    { kind: 'ellipse', x: 274, y: 252, width: 21, height: 12 },
  ];

  // ---- ALBEDO V3 SPEC ----
  const albedoOps = [];

  // 1. Rich organic rainforest foliage green base with natural gradient & mottling
  albedoOps.push({
    op: 'legacy-v2',
    spec: {
      schemaVersion: 2,
      size: S,
      usage: 'albedo',
      layers: [
        { op: 'solid', color: isA ? 0x295721 : 0x2f6025 },
        { op: 'gradient', from: isA ? 0x1e4419 : 0x234c1d, to: isA ? 0x3b6f2c : 0x427731, angleDeg: 90, blend: 'normal', opacity: 0.52 },
        { op: 'noise', colorA: isA ? 0x1b3f16 : 0x21491b, colorB: isA ? 0x467a33 : 0x4d8237, scale: 6, octaves: 2, seed: isA ? 101 : 207, blend: 'overlay', opacity: 0.48 },
      ],
    },
  });

  // 2. Soft sunlit tropical lobe cushion shading
  albedoOps.push({
    op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: 84, height: 48 },
    rgba: isA ? [66, 118, 46, 255] : [74, 128, 52, 255],
    opacity: 32,
    count: 6,
    seed: isA ? 1409 : 2819,
    area: { x: 42, y: 40, width: 390, height: 410 },
  });

  // 3. Soft recessed groove shadow flanking central midrib
  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 74], to: [cx, 480], width: 20 },
    rgba: [24, 56, 20, 255],
    opacity: 85,
  });

  // 4. Gently curving tapered lateral veins (inner stronger -> outer softer & thinner)
  const veinInnerRgba = isA ? [86, 134, 54, 255] : [94, 144, 60, 255];
  const veinOuterRgba = isA ? [74, 120, 48, 255] : [82, 128, 54, 255];
  for (const v of veins) {
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, v.y0], to: [v.xm, v.ym], width: v.w },
      rgba: veinInnerRgba,
      opacity: 145,
    });
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.xm, v.ym], to: [v.x2, v.y2], width: Math.max(2, v.w - 3) },
      rgba: veinOuterRgba,
      opacity: 105,
    });
  }

  // 5. Tapered central midrib
  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 70], to: [cx, 250], width: 10 },
    rgba: [104, 152, 62, 255],
    opacity: 210,
  });
  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 246], to: [cx, 482], width: 5 },
    rgba: [90, 138, 56, 255],
    opacity: 175,
  });

  // 6. Outer Monstera cordate leaf silhouette mask
  albedoOps.push({
    op: 'mask',
    shape: { kind: 'polygon', points: outlinePts },
    invert: false,
  });

  // 7. Deep fenestration side slits
  for (const s of slits) {
    albedoOps.push({
      op: 'mask',
      shape: { kind: 'line', from: s.from, to: s.to, width: s.w },
      invert: true,
    });
  }

  // 8. Interior oval fenestration perforations
  for (const holeShape of holes) {
    albedoOps.push({
      op: 'mask',
      shape: holeShape,
      invert: true,
    });
  }

  // ---- DEDICATED HEIGHT V3 SPEC FOR CRISP BOTANICAL NORMAL MAP ----
  const heightOps = [];
  heightOps.push({
    op: 'legacy-v2',
    spec: {
      schemaVersion: 2,
      size: S,
      usage: 'albedo',
      layers: [
        { op: 'solid', color: 0x808080 },
        { op: 'noise', colorA: 0x6a6a6a, colorB: 0x989898, scale: 6, octaves: 3, seed: isA ? 901 : 907, blend: 'normal', opacity: 0.48 },
      ],
    },
  });

  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 70], to: [cx, 484], width: 22 },
    rgba: [94, 94, 94, 255],
    opacity: 150,
  });
  for (const v of veins) {
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, v.y0], to: [v.xm, v.ym], width: v.w + 2 },
      rgba: [192, 192, 192, 255],
      opacity: 185,
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.xm, v.ym], to: [v.x2, v.y2], width: Math.max(2, v.w - 2) },
      rgba: [168, 168, 168, 255],
      opacity: 145,
    });
  }
  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 70], to: [cx, 250], width: 11 },
    rgba: [224, 224, 224, 255],
    opacity: 225,
  });
  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 246], to: [cx, 486], width: 5 },
    rgba: [192, 192, 192, 255],
    opacity: 190,
  });

  return {
    albedoSpec: {
      schemaVersion: 3,
      width: S,
      height: S,
      usage: 'albedo',
      background: [0, 0, 0, 0],
      operations: albedoOps,
    },
    heightSpec: {
      schemaVersion: 3,
      width: S,
      height: S,
      usage: 'albedo',
      background: [128, 128, 128, 255],
      operations: heightOps,
    },
  };
}

function buildSculptedMonsteraBlade(opts) {
  const {
    length,
    width,
    uSegs = 10,
    vSegs = 14,
    baseLift = 0.16,
    droop = 1.05,
    cupAmt = 0.11,
    edgeRoll = 0.09,
    waveAmt = 0.028,
    wavePhase = 0,
    sinusV = 0.145,
    twistTip = 0,
  } = opts;

  // Integrate curved centerline along v in [0, 1] with origin at sinusV
  const dv = 1 / vSegs;
  const cxArr = new Array(vSegs + 1).fill(0);
  const cyArr = new Array(vSegs + 1).fill(0);
  const pitchArr = new Array(vSegs + 1).fill(0);

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    pitchArr[j] = baseLift - droop * Math.pow(v, 1.48);
  }

  // Integrate forward from j = 0
  for (let j = 1; j <= vSegs; j++) {
    const pMid = 0.5 * (pitchArr[j - 1] + pitchArr[j]);
    cxArr[j] = cxArr[j - 1] + Math.cos(pMid) * (length * dv);
    cyArr[j] = cyArr[j - 1] + Math.sin(pMid) * (length * dv);
  }

  // Shift so sinusV sits right at (0, 0, 0) for exact petiole attachment
  const sinusIdxF = sinusV * vSegs;
  const s0 = Math.floor(sinusIdxF);
  const s1 = Math.min(vSegs, s0 + 1);
  const sf = sinusIdxF - s0;
  const ox = cxArr[s0] + (cxArr[s1] - cxArr[s0]) * sf;
  const oy = cyArr[s0] + (cyArr[s1] - cyArr[s0]) * sf;
  for (let j = 0; j <= vSegs; j++) {
    cxArr[j] -= ox;
    cyArr[j] -= oy;
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    const pitch = pitchArr[j];
    // Local blade-up normal along centerline
    const upX = -Math.sin(pitch);
    const upY = Math.cos(pitch);
    const twist = twistTip * v * v;
    const ct = Math.cos(twist);
    const st = Math.sin(twist);

    const envV = Math.sin(Math.min(1, v) * Math.PI);
    const earLift = v < 0.22 ? Math.pow((0.22 - v) / 0.22, 1.6) * 0.032 * length : 0;

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const uc = u * 2 - 1; // -1 (left) to +1 (right)
      const absU = Math.abs(uc);

      // Transverse cupping (V-channel along midrib) + outer lobe gentle roll + natural wave
      const cup = cupAmt * length * Math.pow(absU, 1.38) * (0.28 + 0.72 * envV);
      const roll = -edgeRoll * length * Math.pow(absU, 3.3) * (0.20 + 0.80 * envV);
      const wave = waveAmt * length * Math.sin(v * Math.PI * 3.8 + wavePhase + (uc >= 0 ? 0.55 : -0.2)) * (uc * uc);
      const localH = cup + roll + wave + earLift * (0.3 + 0.7 * absU);

      // Slight lateral arch pull-in when cupped so geometry doesn't stretch wide
      const localZ = uc * (width * 0.5) * (1 - 0.06 * absU * absU);

      // Apply twist around centerline tangent
      const rz = localZ * ct - localH * st;
      const rh = localZ * st + localH * ct;

      const px = cxArr[j] + upX * rh;
      const py = cyArr[j] + upY * rh;
      const pz = rz;

      positions.push(px, py, pz);
      // UV.y continuously 0.0 at base -> 1.0 at tip!
      uvs.push(u, v);
    }
  }

  // Counterclockwise winding when viewed from +Y (top of leaf: +X forward, +Z right)
  // Triangle (a, b, c) where a=(i,j), b=(i,j+1) [+X], c=(i+1,j) [+Z]:
  // (b - a) x (c - a) = (+X) x (+Z) = -Y! So to face +Y, wind (a, c, b) = (i,j) -> (i+1,j) -> (i,j+1)!
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
  return {
    geo,
    // Return midrib continuation points slightly below underside for seamless petiole join
    ribPoints: [0.16, 0.25, 0.35].map((tv) => {
      const idxF = tv * vSegs;
      const k0 = Math.floor(idxF);
      const k1 = Math.min(vSegs, k0 + 1);
      const kf = idxF - k0;
      const rx = cxArr[k0] + (cxArr[k1] - cxArr[k0]) * kf;
      const ry = cyArr[k0] + (cyArr[k1] - cyArr[k0]) * kf;
      const rp = pitchArr[k0] + (pitchArr[k1] - pitchArr[k0]) * kf;
      // Offset 6.5 mm underneath the leaf surface so zero z-fighting or poke-through
      return [rx + Math.sin(rp) * 0.0065, ry - Math.cos(rp) * 0.0065, 0];
    }),
  };
}

function transformGeo(geo, pos, yawRad, pitchRad, rollRad) {
  const g = copyGeometry(geo);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rollRad, yawRad, pitchRad, 'YXZ'));
  m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function transformPoint(pt, pos, yawRad, pitchRad, rollRad) {
  const v = new THREE.Vector3(pt[0], pt[1], pt[2]);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rollRad, yawRad, pitchRad, 'YXZ'));
  v.applyQuaternion(q).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
  return [v.x, v.y, v.z];
}

async function build() {
  const root = createRoot('MonsteraHeroA');
  const rng = seededRandom('lagoon-monstera-a-v1');

  // 1. Build 1024x512 full-height 2-column RGBA cutout atlas (mask-rgb-dilate, gutter: 0)
  const colA = buildMonsteraColumnSpecs('a');
  const colB = buildMonsteraColumnSpecs('b');

  const leafAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'leaf_a',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colA.albedoSpec },
      },
      {
        name: 'leaf_b',
        content: { x: 512, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colB.albedoSpec },
      },
    ],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'leaf_a',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: colA.heightSpec },
      },
      {
        name: 'leaf_b',
        content: { x: 512, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: colB.heightSpec },
      },
    ],
  });

  const leafNormal = normalMapFromHeight(heightAtlas, { strength: 4.0, name: 'MonsteraLeafNormal' });

  const leafMat = pbrMaterial({
    albedo: leafAtlas,
    normal: leafNormal,
    roughness: 0.44,
    metalness: 0,
    alphaMode: 'mask',
    alphaCutoff: 0.5,
    doubleSided: true,
    name: 'MonsteraLeaves',
  });

  // 2. Fibrous rainforest stem material
  const stemAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'MonsteraStemAlbedo',
    layers: [
      { op: 'solid', color: 0x345824 },
      { op: 'stripes', colorA: 0x2c4d1e, colorB: 0x426c2d, count: 18, angleDeg: 0, blend: 'overlay', opacity: 0.32 },
      { op: 'noise', colorA: 0x27451a, colorB: 0x477030, scale: 12, octaves: 4, seed: 71, blend: 'overlay', opacity: 0.35 },
    ],
  });
  const stemNormal = normalMapFromHeight(stemAlbedo, { strength: 3.2, name: 'MonsteraStemNormal' });
  const stemMat = pbrMaterial({
    albedo: stemAlbedo,
    normal: stemNormal,
    roughness: 0.65,
    metalness: 0,
    name: 'MonsteraStems',
  });

  // 3. Sculpt 15 arching petioles & 15 3D curved Monstera leaves across 3 overlapping botanical tiers
  // Target bounds: ~1.75 m wide x 1.35 m tall x 1.65 m deep, root collar to Y = -0.10 m
  const specs = [
    // Inner crown tier (5 lush sculptural leaves filling the crown dome without any center gap!)
    { azDeg: 28,  reach: 0.18, tipY: 1.11, len: 0.56, wid: 0.46, pitchDeg: -16, rollDeg: 5,  droop: 1.08, col: 'leaf_a' },
    { azDeg: 132, reach: 0.25, tipY: 1.08, len: 0.58, wid: 0.47, pitchDeg: -20, rollDeg: -6, droop: 1.10, col: 'leaf_b' },
    { azDeg: 238, reach: 0.24, tipY: 1.14, len: 0.59, wid: 0.48, pitchDeg: -22, rollDeg: 6,  droop: 1.08, col: 'leaf_a' },
    { azDeg: 324, reach: 0.27, tipY: 0.98, len: 0.55, wid: 0.45, pitchDeg: -20, rollDeg: -7, droop: 1.10, col: 'leaf_b' },
    { azDeg: 82,  reach: 0.15, tipY: 0.88, len: 0.46, wid: 0.38, pitchDeg: -12, rollDeg: 4,  droop: 0.94, col: 'leaf_b' },

    // Mid hero tier (6 sweeping outward leaves, height 0.62 - 0.86 m)
    { azDeg: 52,  reach: 0.53, tipY: 0.83, len: 0.58, wid: 0.47, pitchDeg: -24, rollDeg: 8,  droop: 1.14, col: 'leaf_b' },
    { azDeg: 162, reach: 0.52, tipY: 0.79, len: 0.56, wid: 0.46, pitchDeg: -26, rollDeg: -8, droop: 1.18, col: 'leaf_a' },
    { azDeg: 204, reach: 0.48, tipY: 0.71, len: 0.53, wid: 0.43, pitchDeg: -30, rollDeg: 7,  droop: 1.16, col: 'leaf_b' },
    { azDeg: 274, reach: 0.57, tipY: 0.85, len: 0.58, wid: 0.48, pitchDeg: -22, rollDeg: -9, droop: 1.14, col: 'leaf_a' },
    { azDeg: 350, reach: 0.49, tipY: 0.75, len: 0.55, wid: 0.45, pitchDeg: -26, rollDeg: 6,  droop: 1.18, col: 'leaf_a' },
    { azDeg: 96,  reach: 0.55, tipY: 0.68, len: 0.52, wid: 0.42, pitchDeg: -30, rollDeg: -7, droop: 1.20, col: 'leaf_a' },

    // Lower skirt tier (4 low spreading leaves spilling outward over steps & banks)
    { azDeg: 14,  reach: 0.50, tipY: 0.46, len: 0.46, wid: 0.38, pitchDeg: -34, rollDeg: -6, droop: 1.14, col: 'leaf_b' },
    { azDeg: 124, reach: 0.51, tipY: 0.42, len: 0.45, wid: 0.37, pitchDeg: -36, rollDeg: 8,  droop: 1.16, col: 'leaf_a' },
    { azDeg: 234, reach: 0.52, tipY: 0.44, len: 0.47, wid: 0.39, pitchDeg: -32, rollDeg: -7, droop: 1.14, col: 'leaf_b' },
    { azDeg: 318, reach: 0.48, tipY: 0.38, len: 0.43, wid: 0.35, pitchDeg: -38, rollDeg: 6,  droop: 1.18, col: 'leaf_b' },
  ];

  const stemGeos = [];
  const leafGeos = [];

  // Compact organic rhizome crown anchoring stems at (0, -0.095..0.055, 0)
  const collarPath = [
    [0, -0.095, 0],
    [0.012, -0.04, 0.008],
    [0.006, 0.01, -0.006],
    [0, 0.055, 0],
  ];
  stemGeos.push(taperedTube(collarPath, [0.048, 0.054, 0.046, 0.032], { radialSegments: 8, creaseAngle: 180, cap: true }));

  for (let idx = 0; idx < specs.length; idx++) {
    const s = specs[idx];
    const f = rng.fork(`leaf-${idx}`);
    const az = (s.azDeg + f.range(-5, 5)) * (Math.PI / 180);
    const dirX = Math.cos(az);
    const dirZ = Math.sin(az);
    const perpX = -dirZ;
    const perpZ = dirX;
    const sideBend = f.range(-0.045, 0.045);

    // Staggered organic emergence from basal rhizome clump
    const baseR = f.range(0.016, 0.062);
    const baseY = -0.092 + f.range(0, 0.03);
    const p0 = [dirX * baseR, baseY, dirZ * baseR];
    const p1 = [dirX * (baseR + s.reach * 0.22) + perpX * sideBend * 0.5, s.tipY * 0.36, dirZ * (baseR + s.reach * 0.22) + perpZ * sideBend * 0.5];
    const p2 = [dirX * (s.reach * 0.68) + perpX * sideBend, s.tipY * 0.84, dirZ * (s.reach * 0.68) + perpZ * sideBend];
    const tipPos = [dirX * s.reach, s.tipY, dirZ * s.reach];

    const yawRad = -az + f.range(-0.09, 0.09);
    const pitchRad = (s.pitchDeg + f.range(-3, 3)) * (Math.PI / 180);
    const rollRad = (s.rollDeg + f.range(-4, 4)) * (Math.PI / 180);

    const { geo: localBlade, ribPoints } = buildSculptedMonsteraBlade({
      length: s.len,
      width: s.wid,
      uSegs: 8,
      vSegs: 11,
      baseLift: 0.14 + f.range(-0.04, 0.05),
      droop: s.droop + f.range(-0.08, 0.08),
      cupAmt: 0.11 + f.range(-0.015, 0.02),
      edgeRoll: 0.09 + f.range(-0.01, 0.015),
      waveAmt: 0.028 + f.range(-0.006, 0.008),
      wavePhase: f.range(0, Math.PI * 2),
      twistTip: f.range(-0.14, 0.14),
    });

    const remappedBlade = remapUVToAtlas(localBlade, leafAtlas, s.col, {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    const worldBlade = transformGeo(remappedBlade, tipPos, yawRad, pitchRad, rollRad);
    leafGeos.push(worldBlade);

    // Smooth curved petiole joining cleanly onto underside midrib with zero top poke-through
    const worldSinusUnder = transformPoint([-0.008, -0.011, 0], tipPos, yawRad, pitchRad, rollRad);
    const worldRibPts = ribPoints.map((pt) => transformPoint(pt, tipPos, yawRad, pitchRad, rollRad));
    const fullStemCtrl = [p0, p1, p2, worldSinusUnder, worldRibPts[0], worldRibPts[2]];
    const stemPath = catmullRomPath(fullStemCtrl, 3);
    const nPts = stemPath.length;
    const baseRadius = 0.0135 + (s.len - 0.42) * 0.016;
    const radii = stemPath.map((_, k) => {
      const t = k / (nPts - 1);
      if (t < 0.14) return baseRadius * (1.25 - 1.6 * t);
      if (t < 0.72) return baseRadius * (1.02 - 0.42 * ((t - 0.14) / 0.58));
      const rt = (t - 0.72) / 0.28;
      return Math.max(0.0018, baseRadius * 0.60 * (1 - 0.82 * rt));
    });
    stemGeos.push(taperedTube(stemPath, radii, { radialSegments: 6, creaseAngle: 180, cap: true }));
  }

  const mergedStems = mergeGeos(stemGeos);
  const mergedLeaves = mergeGeos(leafGeos);

  createPart('MonsteraStems', mergedStems, stemMat, { parent: root });
  const leavesPart = createPart('MonsteraLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided botanical Monstera leaf blades with alpha cutout silhouette');

  return root;
}
