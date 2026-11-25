const meta = {
  name: 'foliage-palm-lean',
  role: 'prop',
};

function mergeGeos(geos) {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    totalVerts += pos.count;
    totalIdx += g.index ? g.index.count : pos.count;
  }
  const positions = new Array(totalVerts * 3);
  const normals = new Array(totalVerts * 3);
  const uvs = new Array(totalVerts * 2);
  const indices = new Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const vi = (vOff + i) * 3;
      positions[vi] = pos.getX(i);
      positions[vi + 1] = pos.getY(i);
      positions[vi + 2] = pos.getZ(i);

      let nx = norm ? norm.getX(i) : 0;
      let ny = norm ? norm.getY(i) : 1;
      let nz = norm ? norm.getZ(i) : 0;
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-6) {
        nx /= nl;
        ny /= nl;
        nz /= nl;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      normals[vi] = nx;
      normals[vi + 1] = ny;
      normals[vi + 2] = nz;

      const ui = (vOff + i) * 2;
      uvs[ui] = uv ? uv.getX(i) : 0;
      uvs[ui + 1] = uv ? uv.getY(i) : 0;
    }

    if (g.index) {
      const arr = g.index.array;
      for (let i = 0; i < arr.length; i++) {
        indices[iOff++] = arr[i] + vOff;
      }
    } else {
      for (let i = 0; i < count; i++) {
        indices[iOff++] = vOff + i;
      }
    }
    vOff += count;
  }
  return meshGeo({ positions, normals, uvs, indices });
}

function buildLeaningTrunk(controlPts, samplesPerSpan, opts) {
  const path = catmullRomPath(controlPts, samplesPerSpan);
  const n = path.length;
  const radii = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let r;
    if (t < 0.08) {
      const k = t / 0.08;
      r = opts.skirtR * (1 - k) + opts.baseR * k;
    } else if (t < 0.86) {
      const k = (t - 0.08) / 0.78;
      const ease = Math.pow(1 - k, 0.70);
      const baseTaper = opts.baseR * ease + opts.topR * (1 - ease);
      const ringWave = Math.sin(k * opts.ringCount * Math.PI * 2);
      const ringBump = 1 + opts.ringAmp * (0.5 + 0.5 * ringWave);
      r = baseTaper * ringBump;
    } else {
      const k = (t - 0.86) / 0.14;
      const swell = Math.sin(k * Math.PI) * opts.collarSwell;
      const topPinch = k > 0.76 ? 1 - ((k - 0.76) / 0.24) * 0.48 : 1.0;
      r = (opts.topR * (1.08 - 0.08 * k) + swell) * topPinch;
    }
    radii.push(Math.max(0.03, r));
  }
  const geo = taperedTube(path, radii, {
    radialSegments: opts.radialSegments || 16,
    creaseAngle: 180,
    cap: true,
  });

  // Explicit vertical UV mapping aligned to top-left V3 atlas (flipY=false):
  // [0.00, 0.14] mossy roots -> [0.14, 0.78] warm ringed palm bark -> [0.78, 0.87] olive-green crownshaft
  // Reserving [0.89, 0.99] cleanly on the same texture for the 3 young green coconuts!
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const minY = -0.35;
  const maxY = path[n - 1][1];
  const spanY = Math.max(0.1, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const hFrac = Math.max(0, Math.min(1, (pos.getY(i) - minY) / spanY));
    const uOrig = uv ? uv.getX(i) : 0;
    uv.setXY(i, uOrig, hFrac * 0.865);
  }
  uv.needsUpdate = true;

  return { geo, path, tip: path[n - 1] };
}

function buildRootButtresses(origin, baseR, rng, count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.22, 0.22);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // Compact grounded mossy root flares gripping bank counterweight side (never spindly spider legs!)
    const counterBoost = ca < 0 ? 1.24 : 0.96;
    const reach = baseR * rng.range(1.24, 1.56) * counterBoost;
    const topY = rng.range(0.18, 0.34);
    const pts = catmullRomPath([
      [origin[0] + ca * baseR * 0.28, topY, origin[2] + sa * baseR * 0.28],
      [origin[0] + ca * baseR * 0.92, topY * 0.34, origin[2] + sa * baseR * 0.92],
      [origin[0] + ca * reach * 0.92, -0.14, origin[2] + sa * reach * 0.92],
      [origin[0] + ca * reach, -0.35, origin[2] + sa * reach],
    ], 1);
    const radii = pts.map((_, idx) => {
      const k = idx / (pts.length - 1);
      return baseR * (0.48 * (1 - k) + 0.30 * k);
    });
    const g = taperedTube(pts, radii, { radialSegments: 5, creaseAngle: 180, cap: true });
    const uv = g.getAttribute('uv');
    for (let j = 0; j < uv.count; j++) {
      uv.setY(j, Math.min(0.13, Math.max(0.0, uv.getY(j) * 0.11)));
    }
    uv.needsUpdate = true;
    geos.push(g);
  }
  return geos;
}

// 3 plump young tropical green coconuts tucked cleanly under the crownshaft petioles
function buildCoconuts(crownTip) {
  const geos = [];
  const specs = [
    { angle: 0.42, radial: 0.122, dy: -0.24, rx: 0.112, ry: 0.138, rz: 0.108, tiltZ: -0.24 },
    { angle: 2.38, radial: 0.116, dy: -0.28, rx: 0.106, ry: 0.130, rz: 0.104, tiltZ: 0.20 },
    { angle: 4.48, radial: 0.124, dy: -0.22, rx: 0.110, ry: 0.134, rz: 0.106, tiltZ: -0.16 },
  ];
  for (const c of specs) {
    const s = copyGeometry(sphereGeo(1, 10, 8));
    const pos = s.getAttribute('position');
    const uv = s.getAttribute('uv');
    const cx = crownTip[0] + Math.cos(c.angle) * c.radial;
    const cy = crownTip[1] + c.dy;
    const cz = crownTip[2] + Math.sin(c.angle) * c.radial;
    const ct = Math.cos(c.tiltZ);
    const st = Math.sin(c.tiltZ);

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      // Natural slightly 3-lobed ovoid coconut husk shape tapering slightly at bottom apex
      const lobe = 1 + 0.048 * Math.cos(Math.atan2(z, x) * 3);
      const yTaper = y < 0 ? 1 + y * 0.16 : 1 - y * 0.08;
      x *= c.rx * lobe * yTaper;
      y *= c.ry;
      z *= c.rz * lobe * yTaper;
      const rx = x * ct - y * st;
      const ry = x * st + y * ct;
      pos.setXYZ(i, cx + rx, cy + ry, cz + z);

      // Map coconut UV.y cleanly into vibrant young green coconut band [0.90, 0.99]
      const uOrig = uv ? uv.getX(i) : 0.5;
      const vOrig = uv ? uv.getY(i) : 0.5;
      uv.setXY(i, uOrig, 0.90 + vOrig * 0.09);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    s.computeVertexNormals();
    geos.push(s);
  }
  return geos;
}

// Smooth 5-station tapered tropical palm leaflet (9 verts, 7 tris per leaflet!)
function buildLeafletUnitGeo() {
  const stations = [
    { s: 0.00, xFwd: 0.00, yOut: 0.00, halfW: 0.027 },
    { s: 0.24, xFwd: 0.08, yOut: 0.25, halfW: 0.070 },
    { s: 0.54, xFwd: 0.18, yOut: 0.55, halfW: 0.060 },
    { s: 0.80, xFwd: 0.28, yOut: 0.81, halfW: 0.032 },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const st of stations) {
    positions.push(st.xFwd - st.halfW, st.yOut, 0);
    uvs.push(0.16, st.s);
    positions.push(st.xFwd + st.halfW, st.yOut, 0);
    uvs.push(0.94, st.s);
  }
  positions.push(0.35, 1.00, 0);
  uvs.push(0.55, 1.0);

  for (let row = 0; row < 3; row++) {
    const a = row * 2;
    const b = (row + 1) * 2;
    indices.push(a, a + 1, b + 1, a, b + 1, b);
  }
  indices.push(6, 7, 8);

  return meshGeo({ positions, uvs, indices });
}

function buildPalmFrond(crownOrigin, spec, leafletUnit, rng) {
  const az = spec.azimuth;
  const dirX = Math.cos(az);
  const dirZ = Math.sin(az);
  const sideX = -dirZ;
  const sideZ = dirX;

  const len = spec.length;
  const lift = spec.lift;
  const droop = spec.droop;
  const lateralSwing = rng.range(-0.12, 0.12) * len;

  const p0 = [
    crownOrigin[0] + dirX * 0.015,
    crownOrigin[1] - 0.08 + spec.yOffset,
    crownOrigin[2] + dirZ * 0.015,
  ];
  const p1 = [
    crownOrigin[0] + dirX * (len * 0.28) + sideX * (lateralSwing * 0.22),
    crownOrigin[1] + lift + spec.yOffset,
    crownOrigin[2] + dirZ * (len * 0.28) + sideZ * (lateralSwing * 0.22),
  ];
  const p2 = [
    crownOrigin[0] + dirX * (len * 0.70) + sideX * (lateralSwing * 0.68),
    crownOrigin[1] + lift * 0.58 - droop * 0.32 + spec.yOffset,
    crownOrigin[2] + dirZ * (len * 0.70) + sideZ * (lateralSwing * 0.68),
  ];
  const p3 = [
    crownOrigin[0] + dirX * len + sideX * lateralSwing,
    crownOrigin[1] + lift * 0.10 - droop + spec.yOffset,
    crownOrigin[2] + dirZ * len + sideZ * lateralSwing,
  ];

  const rachisDense = bezierCurve([p0, p1, p2, p3], 32);
  const rachisCoarse = bezierCurve([p0, p1, p2, p3], 6);

  const rachisRadii = rachisCoarse.map((_, i) => {
    const t = i / (rachisCoarse.length - 1);
    const baseFlare = t < 0.12 ? (1 - t / 0.12) * 0.015 : 0;
    return 0.023 * Math.pow(1 - t, 0.78) + 0.004 + baseFlare;
  });
  const rachisGeo = taperedTube(rachisCoarse, rachisRadii, {
    radialSegments: 4,
    creaseAngle: 180,
    cap: true,
  });
  const rUv = rachisGeo.getAttribute('uv');
  const rPos = rachisGeo.getAttribute('position');
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i) - p0[0];
    const vz = rPos.getZ(i) - p0[2];
    const proj = Math.max(0, Math.min(1, (vx * dirX + vz * dirZ) / Math.max(0.1, len)));
    const uOrig = rUv ? rUv.getX(i) : 0.5;
    rUv.setXY(i, 0.02 + (uOrig % 1) * 0.085, proj);
  }
  rUv.needsUpdate = true;

  const startFrac = 0.13;
  const endFrac = 0.985;
  const leafletsGeo = repeatAlongCurve(leafletUnit, rachisDense, {
    count: spec.pairs,
    align: 'tangent',
    up: [sideX, 0, sideZ],
    scale: spec.leafletScale,
    twist: 0,
    opposite: true,
    start: startFrac,
    end: endFrac,
    merge: true,
    along: true,
  });

  const segLen = [0];
  let totalArc = 0;
  for (let i = 1; i < rachisDense.length; i++) {
    const a = rachisDense[i - 1];
    const b = rachisDense[i];
    totalArc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    segLen.push(totalArc);
  }
  function sampleRachis(frac) {
    const target = frac * totalArc;
    let lo = 0;
    let hi = segLen.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (segLen[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = segLen[hi] - segLen[lo];
    const k = span > 1e-6 ? (target - segLen[lo]) / span : 0;
    const a = rachisDense[lo];
    const b = rachisDense[hi];
    return [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  }

  const pos = leafletsGeo.getAttribute('position');
  const uv = leafletsGeo.getAttribute('uv');
  const alongAttr = leafletsGeo.getAttribute('_along');

  const vertsPerLeaflet = 9;
  const leafletCount = Math.floor(pos.count / vertsPerLeaflet);

  for (let li = 0; li < leafletCount; li++) {
    const baseIdx = li * vertsPerLeaflet;
    const along = alongAttr ? alongAttr.getX(baseIdx) : (li / Math.max(1, leafletCount - 1));
    const rachisFrac = startFrac + along * (endFrac - startFrac);
    const anchor = sampleRachis(rachisFrac);

    const env = 0.42 + 0.68 * Math.sin(Math.PI * Math.pow(along, 0.76));
    const hash = ((Math.sin(li * 12.9898 + spec.seed * 78.233) * 43758.5453) % 1 + 1) * 0.5;
    const jitterScale = 0.90 + 0.20 * hash;
    const finalScale = env * jitterScale;

    const dihedralLift = (0.18 + 0.10 * (1 - along)) * spec.leafletScale * finalScale;
    const gravityDroop = (0.68 + 0.32 * spec.droopFactor) * spec.leafletScale * finalScale;
    const flutterY = Math.sin(li * 3.7 + spec.seed) * 0.024 * spec.leafletScale;
    const louverPitch = (0.045 + 0.012 * hash) * spec.leafletScale * finalScale;

    for (let k = 0; k < vertsPerLeaflet; k++) {
      const idx = baseIdx + k;
      const uVal = uv.getX(idx);
      const s = uv.getY(idx);
      const dx = pos.getX(idx) - anchor[0];
      const dy = pos.getY(idx) - anchor[1];
      const dz = pos.getZ(idx) - anchor[2];

      const wSign = uVal < 0.35 ? -1 : uVal > 0.75 ? 1 : 0;
      const widthEnv = Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.85);

      const nx = anchor[0] + dx * finalScale;
      const nz = anchor[2] + dz * finalScale;
      const ny =
        anchor[1] +
        dy * finalScale +
        dihedralLift * Math.sin(s * Math.PI * 0.68) -
        gravityDroop * Math.pow(s, 1.85) +
        wSign * louverPitch * widthEnv +
        flutterY * s;

      pos.setXYZ(idx, nx, ny, nz);

      const vWind = Math.max(0.02, Math.min(1.0, rachisFrac * 0.70 + s * 0.30));
      uv.setY(idx, vWind);
    }
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  if (leafletsGeo.getAttribute('_along')) {
    leafletsGeo.deleteAttribute('_along');
  }
  leafletsGeo.computeVertexNormals();

  return [rachisGeo, leafletsGeo];
}

async function buildLeanPalmTextures() {
  // 1. Combined Warm Sunlit Ringed Bark + Mossy Root + Olive Crownshaft + Lush Green Coconuts (V3 atlas, flipY=false!)
  const barkOps = [
    {
      op: 'legacy-v2',
      spec: {
        schemaVersion: 2,
        size: 512,
        usage: 'albedo',
        layers: [
          { op: 'solid', color: 0x9c8c75 },
          { op: 'stripes', colorA: 0x625341, colorB: 0xb7a68e, count: 70, angleDeg: 90, blend: 'overlay', opacity: 0.62 },
          { op: 'stripes', colorA: 0x504334, colorB: 0xc4b49c, count: 35, angleDeg: 90, blend: 'multiply', opacity: 0.28 },
          { op: 'noise', colorA: 0x72624e, colorB: 0xb6a68f, scale: 14, octaves: 5, seed: 53, blend: 'overlay', opacity: 0.42 },
        ],
      },
    },
    // Crisp sunlit pale & dark-crevice horizontal palm leaf-scar rings
    { op: 'paint', shape: { kind: 'line', from: [0, 100], to: [511, 100], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 104], to: [511, 104], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 128], to: [511, 128], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 132], to: [511, 132], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 158], to: [511, 158], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 162], to: [511, 162], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 188], to: [511, 188], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 192], to: [511, 192], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 218], to: [511, 218], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 222], to: [511, 222], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 248], to: [511, 248], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 252], to: [511, 252], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 280], to: [511, 280], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 284], to: [511, 284], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 312], to: [511, 312], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 316], to: [511, 316], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 344], to: [511, 344], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 348], to: [511, 348], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 376], to: [511, 376], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 380], to: [511, 380], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },

    // Mossy damp emerald-olive root patina near waterline base (y = 0..84)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 82 }, rgba: [72, 108, 46, 255], opacity: 155 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 38 }, rgba: [56, 88, 36, 255], opacity: 175 },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 52, height: 24 }, rgba: [84, 122, 50, 255], count: 14, seed: 19, area: { x: 0, y: 8, width: 460, height: 78 }, opacity: 120 },

    // Olive-green fibrous crownshaft collar (y = 398..448)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 396, width: 512, height: 22 }, rgba: [114, 126, 68, 255], opacity: 190 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 414, width: 512, height: 36 }, rgba: [98, 140, 54, 255], opacity: 230 },
    { op: 'paint', shape: { kind: 'line', from: [0, 398], to: [511, 398], width: 6 }, rgba: [82, 70, 48, 255], opacity: 165 },

    // Lush young tropical green coconut husk band (y = 452..512 -> UV.y = 0.883..1.00)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 452, width: 512, height: 60 }, rgba: [86, 142, 46, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 452, width: 512, height: 18 }, rgba: [64, 110, 34, 255], opacity: 165 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 486, width: 512, height: 26 }, rgba: [122, 174, 62, 255], opacity: 180 },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 34, height: 14 }, rgba: [144, 194, 76, 255], count: 12, seed: 91, area: { x: 0, y: 456, width: 470, height: 42 }, opacity: 96 },
  ];

  const barkAlbedo = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'lean_bark',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 512,
            height: 512,
            usage: 'albedo',
            background: [156, 140, 117, 255],
            operations: barkOps,
          },
        },
      },
    ],
  });
  const barkNormal = normalMapFromHeight(barkAlbedo, { strength: 5.0, name: 'LeanPalmBarkNormal' });

  // Packed metallicRoughness (G=roughness, B=metalness=0): rough bark (224) vs smooth waxy green coconuts (108)!
  const barkOrm = await textureAtlas({
    schemaVersion: 1,
    width: 128,
    height: 128,
    usage: 'metallicRoughness',
    regions: [
      {
        name: 'lean_orm',
        content: { x: 0, y: 0, width: 128, height: 128 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 128,
            height: 128,
            usage: 'metallicRoughness',
            background: [255, 224, 0, 255],
            operations: [
              { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 98, width: 128, height: 15 }, rgba: [255, 170, 0, 255] },
              { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 113, width: 128, height: 15 }, rgba: [255, 108, 0, 255] },
            ],
          },
        },
      },
    ],
  });

  // 2. V3 RGBA Feathery Pinnate Frond Albedo (flipY=false, mask-rgb-dilate!)
  const frondOps = [
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 64, height: 512 }, rgba: [110, 152, 52, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 180, width: 64, height: 332 }, rgba: [138, 182, 68, 255], opacity: 165 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 340, width: 64, height: 172 }, rgba: [162, 204, 82, 255], opacity: 175 },
    { op: 'paint', shape: { kind: 'line', from: [32, 0], to: [32, 511], width: 12 }, rgba: [176, 214, 96, 255], opacity: 185 },
    { op: 'paint', shape: { kind: 'line', from: [8, 0], to: [8, 511], width: 8 }, rgba: [72, 112, 36, 255], opacity: 150 },
    { op: 'paint', shape: { kind: 'line', from: [56, 0], to: [56, 511], width: 8 }, rgba: [72, 112, 36, 255], opacity: 150 },

    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 0, width: 424, height: 512 }, rgba: [60, 118, 40, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 0, width: 424, height: 155 }, rgba: [46, 96, 32, 255], opacity: 155 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 160, width: 424, height: 352 }, rgba: [88, 148, 52, 255], opacity: 165 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 310, width: 424, height: 202 }, rgba: [114, 168, 60, 255], opacity: 190 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 415, width: 424, height: 97 }, rgba: [140, 190, 72, 255], opacity: 185 },

    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 26, height: 120 }, rgba: [130, 180, 68, 255], count: 14, seed: 131, area: { x: 92, y: 70, width: 380, height: 430 }, opacity: 68 },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 20, height: 95 }, rgba: [42, 88, 28, 255], count: 12, seed: 227, area: { x: 90, y: 0, width: 386, height: 350 }, opacity: 62 },

    { op: 'paint', shape: { kind: 'line', from: [128, 0], to: [128, 511], width: 6 }, rgba: [88, 142, 48, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [178, 0], to: [178, 511], width: 7 }, rgba: [98, 152, 54, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [230, 0], to: [230, 511], width: 8 }, rgba: [108, 162, 58, 255], opacity: 140 },
    { op: 'paint', shape: { kind: 'line', from: [346, 0], to: [346, 511], width: 8 }, rgba: [108, 162, 58, 255], opacity: 140 },
    { op: 'paint', shape: { kind: 'line', from: [398, 0], to: [398, 511], width: 7 }, rgba: [98, 152, 54, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [448, 0], to: [448, 511], width: 6 }, rgba: [88, 142, 48, 255], opacity: 120 },

    { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 24 }, rgba: [126, 178, 64, 255], opacity: 175 },
    { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 11 }, rgba: [176, 218, 100, 255], opacity: 225 },

    { op: 'paint', shape: { kind: 'line', from: [84, 0], to: [84, 511], width: 12 }, rgba: [40, 84, 26, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [490, 0], to: [490, 511], width: 12 }, rgba: [40, 84, 26, 255], opacity: 120 },

    { op: 'mask', shape: { kind: 'polygon', points: [[74, 138], [116, 160], [74, 174]] }, invert: true },
    { op: 'mask', shape: { kind: 'polygon', points: [[498, 224], [456, 246], [498, 260]] }, invert: true },
    { op: 'mask', shape: { kind: 'polygon', points: [[74, 356], [110, 376], [74, 388]] }, invert: true },
  ];

  const frondAlbedo = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'lean_frond',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 512,
            height: 512,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: frondOps,
          },
        },
      },
    ],
  });

  const frondHeight = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'lean_frond_h',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 512,
            height: 512,
            usage: 'albedo',
            background: [108, 108, 108, 255],
            operations: [
              { op: 'paint', shape: { kind: 'line', from: [32, 0], to: [32, 511], width: 22 }, rgba: [215, 215, 215, 255] },
              { op: 'paint', shape: { kind: 'line', from: [178, 0], to: [178, 511], width: 8 }, rgba: [164, 164, 164, 255] },
              { op: 'paint', shape: { kind: 'line', from: [230, 0], to: [230, 511], width: 9 }, rgba: [174, 174, 174, 255] },
              { op: 'paint', shape: { kind: 'line', from: [346, 0], to: [346, 511], width: 9 }, rgba: [174, 174, 174, 255] },
              { op: 'paint', shape: { kind: 'line', from: [398, 0], to: [398, 511], width: 8 }, rgba: [164, 164, 164, 255] },
              { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 26 }, rgba: [238, 238, 238, 255] },
              { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 12 }, rgba: [255, 255, 255, 255] },
            ],
          },
        },
      },
    ],
  });
  const frondNormal = normalMapFromHeight(frondHeight, { strength: 4.0, name: 'LeanPalmFrondNormal' });

  return { barkAlbedo, barkNormal, barkOrm, frondAlbedo, frondNormal };
}

async function build() {
  const root = createRoot('FoliagePalmLean');
  const rng = seededRandom('lagoon-palm-lean-v2');
  const trunkRng = rng.fork('trunk');
  const frondRng = rng.fork('fronds');

  const { barkAlbedo, barkNormal, barkOrm, frondAlbedo, frondNormal } = await buildLeanPalmTextures();

  const barkMat = pbrMaterial({
    albedo: barkAlbedo,
    normal: barkNormal,
    metallicRoughness: barkOrm,
    roughness: 1.0,
    metalness: 0.0,
    name: 'Mat_PalmBark',
  });

  const frondMat = foliageMaterial(frondAlbedo, {
    alphaCutoff: 0.5,
    roughness: 0.52,
    doubleSided: true,
    name: 'Mat_PalmFronds',
  });
  frondMat.normalMap = frondNormal;
  frondMat.normalScale.set(0.7, 0.7);

  // --- 1. Dramatic Leaning Shoreline Ringed Palm Trunk + Mossy Roots + 3 Green Coconuts (Mesh_PalmTrunk) ---
  // Graceful bow-and-upturn shoreline J-curve sweeping out +2.8 m over the turquoise lagoon, turning skyward at crown!
  const trunkGeos = [];
  const mainTrunk = buildLeaningTrunk(
    [
      [-0.08, -0.35, 0.00],
      [0.05, 0.06, -0.02],
      [0.86, 1.18, -0.10],
      [1.82, 2.52, -0.04],
      [2.50, 4.02, 0.06],
      [2.80, 5.52, 0.08],
    ],
    4,
    {
      skirtR: 0.195,
      baseR: 0.150, // 0.30 m diameter at Y = 0
      topR: 0.075,  // 0.15 m diameter at crownshaft
      ringCount: 34,
      ringAmp: 0.052,
      collarSwell: 0.022,
      radialSegments: 12,
    },
  );
  trunkGeos.push(mainTrunk.geo);
  trunkGeos.push(...buildRootButtresses([0.00, 0, -0.01], 0.15, trunkRng, 6));
  trunkGeos.push(...buildCoconuts(mainTrunk.tip));

  const mergedTrunkGeo = mergeGeos(trunkGeos);
  createPart('PalmTrunk', mergedTrunkGeo, barkMat, { parent: root });

  // --- 2. 15 Dense Lush Drooping Feathery Pinnate Fronds (Crown diameter ~4.8 m, height ~6.2 m) ---
  const leafletUnit = buildLeafletUnitGeo();
  const frondGeos = [];
  const crown = [mainTrunk.tip[0], mainTrunk.tip[1] - 0.11, mainTrunk.tip[2]];

  const frondSpecs = [
    // Upper tier (3 asymmetric sun-reaching fronds lifting crown height cleanly to Y ~ 6.22 m)
    { azimuth: 0.25, length: 1.72, lift: 1.12, droop: 0.18, yOffset: 0.06, pairs: 17, leafletScale: 0.45, droopFactor: 0.45, seed: 21 },
    { azimuth: 2.35, length: 1.66, lift: 1.04, droop: 0.18, yOffset: 0.06, pairs: 17, leafletScale: 0.44, droopFactor: 0.44, seed: 22 },
    { azimuth: 4.45, length: 1.68, lift: 1.08, droop: 0.20, yOffset: 0.05, pairs: 17, leafletScale: 0.45, droopFactor: 0.48, seed: 23 },

    // Mid sweeping tier (6 wide signature fronds giving ~4.8 m crown diameter & bold +X reach)
    { azimuth: 0.00, length: 2.36, lift: 0.64, droop: 0.78, yOffset: 0.00, pairs: 19, leafletScale: 0.54, droopFactor: 0.85, seed: 24 },
    { azimuth: 1.05, length: 2.26, lift: 0.60, droop: 0.82, yOffset: 0.00, pairs: 19, leafletScale: 0.53, droopFactor: 0.88, seed: 25 },
    { azimuth: 2.10, length: 2.18, lift: 0.62, droop: 0.76, yOffset: 0.00, pairs: 18, leafletScale: 0.52, droopFactor: 0.82, seed: 26 },
    { azimuth: 3.15, length: 2.12, lift: 0.64, droop: 0.72, yOffset: 0.01, pairs: 18, leafletScale: 0.51, droopFactor: 0.78, seed: 27 },
    { azimuth: 4.20, length: 2.22, lift: 0.60, droop: 0.80, yOffset: 0.00, pairs: 19, leafletScale: 0.53, droopFactor: 0.86, seed: 28 },
    { azimuth: 5.25, length: 2.32, lift: 0.62, droop: 0.84, yOffset: -0.01, pairs: 19, leafletScale: 0.54, droopFactor: 0.90, seed: 29 },

    // Lower cascading shoreline tier (6 lush drooping fronds arching out over the turquoise lagoon)
    { azimuth: 0.52, length: 2.24, lift: 0.26, droop: 1.24, yOffset: -0.06, pairs: 18, leafletScale: 0.52, droopFactor: 1.18, seed: 30 },
    { azimuth: 1.57, length: 2.16, lift: 0.24, droop: 1.18, yOffset: -0.06, pairs: 18, leafletScale: 0.51, droopFactor: 1.15, seed: 31 },
    { azimuth: 2.62, length: 2.04, lift: 0.28, droop: 1.08, yOffset: -0.05, pairs: 17, leafletScale: 0.49, droopFactor: 1.08, seed: 32 },
    { azimuth: 3.67, length: 2.02, lift: 0.27, droop: 1.10, yOffset: -0.05, pairs: 17, leafletScale: 0.49, droopFactor: 1.08, seed: 33 },
    { azimuth: 4.72, length: 2.18, lift: 0.24, droop: 1.20, yOffset: -0.06, pairs: 18, leafletScale: 0.51, droopFactor: 1.16, seed: 34 },
    { azimuth: 5.77, length: 2.28, lift: 0.28, droop: 1.26, yOffset: -0.06, pairs: 18, leafletScale: 0.52, droopFactor: 1.20, seed: 35 },
  ];

  for (const spec of frondSpecs) {
    frondGeos.push(...buildPalmFrond(crown, spec, leafletUnit, frondRng));
  }

  const mergedFrondsGeo = mergeGeos(frondGeos);
  const palmFronds = createPart('PalmFronds', mergedFrondsGeo, frondMat, { parent: root });
  markOpenShell(palmFronds, 'Feathery drooping palm fronds built from double-sided alpha-cutout pinnate leaflets');

  return root;
}
