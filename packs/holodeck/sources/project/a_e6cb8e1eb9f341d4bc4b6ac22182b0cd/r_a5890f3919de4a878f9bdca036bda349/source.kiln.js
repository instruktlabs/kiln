const meta = {
  name: 'foliage-palm-island',
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

function buildRingedTrunk(controlPts, samplesPerSpan, opts) {
  const path = catmullRomPath(controlPts, samplesPerSpan);
  const n = path.length;
  const radii = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let r;
    if (t < 0.08) {
      // Flared root embed skirt (-0.35 m -> 0.0 m)
      const k = t / 0.08;
      r = opts.skirtR * (1 - k) + opts.baseR * k;
    } else if (t < 0.85) {
      const k = (t - 0.08) / 0.77;
      const ease = Math.pow(1 - k, 0.72);
      const baseTaper = opts.baseR * ease + opts.topR * (1 - ease);
      // Distinct tropical palm leaf-scar growth rings
      const ringWave = Math.sin(k * opts.ringCount * Math.PI * 2);
      const ringBump = 1 + opts.ringAmp * (0.5 + 0.5 * ringWave);
      r = baseTaper * ringBump;
    } else {
      // Smooth olive-green clasping crownshaft sheath tapering to rounded heart apex
      const k = (t - 0.85) / 0.15;
      const swell = Math.sin(k * Math.PI) * opts.collarSwell;
      const topPinch = k > 0.78 ? 1 - ((k - 0.78) / 0.22) * 0.48 : 1.0;
      r = (opts.topR * (1.06 - 0.08 * k) + swell) * topPinch;
    }
    radii.push(Math.max(0.025, r));
  }
  const geo = taperedTube(path, radii, {
    radialSegments: opts.radialSegments || 14,
    creaseAngle: 180,
    cap: true,
  });

  // Explicit vertical UV mapping aligned to top-left V3 atlas (flipY=false):
  // V = 0.00..0.16 mossy root flare, 0.16..0.82 warm ringed bark, 0.82..0.99 olive-green crownshaft!
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const minY = path[0][1];
  const maxY = path[n - 1][1];
  const spanY = Math.max(0.1, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const hFrac = Math.max(0, Math.min(1, (pos.getY(i) - minY) / spanY));
    const uOrig = uv ? uv.getX(i) : 0;
    uv.setXY(i, uOrig, hFrac * 0.985);
  }
  uv.needsUpdate = true;

  return { geo, path, tip: path[n - 1] };
}

function buildRootButtresses(origin, baseR, rng, count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.24, 0.24);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // Compact grounded mossy root bole flares hugging trunk base (never spindly spider legs!)
    const reach = baseR * rng.range(1.26, 1.56);
    const topY = rng.range(0.16, 0.30);
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
    // Keep roots firmly inside the mossy damp root band [0.00, 0.14]
    const uv = g.getAttribute('uv');
    for (let j = 0; j < uv.count; j++) {
      uv.setY(j, Math.min(0.14, Math.max(0.0, uv.getY(j) * 0.12)));
    }
    uv.needsUpdate = true;
    geos.push(g);
  }
  return geos;
}

// Smooth 5-station tapered tropical palm leaflet (9 verts, 7 tris per leaflet!)
// Local +X = forward along rachis, +Y = outward along leaflet length (0..1), +Z = blade normal
// Width is lush realistic tropical pinna width (halfW 0.062 -> ~6 cm wide on 0.50 m leaflet!)
// UV.x encodes side edge (0.16 trailing, 0.94 leading, 0.55 tip); UV.y stores local s (0..1) for post-remap.
function buildLeafletUnitGeo() {
  const stations = [
    { s: 0.00, xFwd: 0.00, yOut: 0.00, halfW: 0.026 },
    { s: 0.24, xFwd: 0.08, yOut: 0.25, halfW: 0.068 },
    { s: 0.54, xFwd: 0.18, yOut: 0.55, halfW: 0.058 },
    { s: 0.80, xFwd: 0.28, yOut: 0.81, halfW: 0.032 },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const st of stations) {
    // Trailing edge (u = 0.16)
    positions.push(st.xFwd - st.halfW, st.yOut, 0);
    uvs.push(0.16, st.s);
    // Leading edge (u = 0.94)
    positions.push(st.xFwd + st.halfW, st.yOut, 0);
    uvs.push(0.94, st.s);
  }
  // Tapered acuminate needle tip (vertex 8)
  positions.push(0.35, 1.00, 0);
  uvs.push(0.55, 1.0);

  for (let row = 0; row < 3; row++) {
    const a = row * 2;
    const b = (row + 1) * 2;
    indices.push(a, a + 1, b + 1, a, b + 1, b);
  }
  // Tip triangle from station 3 to vertex 8
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

  // Embedded cleanly inside the crownshaft core so zero gap exists
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
    crownOrigin[1] + lift * 0.62 - droop * 0.28 + spec.yOffset,
    crownOrigin[2] + dirZ * (len * 0.70) + sideZ * (lateralSwing * 0.68),
  ];
  const p3 = [
    crownOrigin[0] + dirX * len + sideX * lateralSwing,
    crownOrigin[1] + lift * 0.12 - droop + spec.yOffset,
    crownOrigin[2] + dirZ * len + sideZ * lateralSwing,
  ];

  // Dense bezier samples for smooth rachis & leaflet tangent alignment
  const rachisDense = bezierCurve([p0, p1, p2, p3], 32);
  const rachisCoarse = bezierCurve([p0, p1, p2, p3], 6);

  // 1. Graceful curved tapered rachis stem (UV.x in rachis column 0.02..0.11, UV.y 0.0 -> 1.0)
  const rachisRadii = rachisCoarse.map((_, i) => {
    const t = i / (rachisCoarse.length - 1);
    // Flared petiole clasp at base tapering smoothly into slender green rachis
    const baseFlare = t < 0.12 ? (1 - t / 0.12) * 0.014 : 0;
    return 0.022 * Math.pow(1 - t, 0.78) + 0.0038 + baseFlare;
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

  // 2. Pinnate leaflets along curve via Kiln 1.9.0 repeatAlongCurve({ opposite: true, merge: true, along: true })
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

  // Precompute rachis arc-length lookup
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

    // Rich botanical bell envelope: compact basal pinnae, long lush mid pinnae, slender graceful tip
    const env = 0.42 + 0.68 * Math.sin(Math.PI * Math.pow(along, 0.76));
    const hash = ((Math.sin(li * 12.9898 + spec.seed * 78.233) * 43758.5453) % 1 + 1) * 0.5;
    const jitterScale = 0.90 + 0.20 * hash;
    const finalScale = env * jitterScale;

    // Symmetric V-dihedral upward arch near rachis + lush weeping tropical cascade droop toward tips!
    const dihedralLift = (0.18 + 0.10 * (1 - along)) * spec.leafletScale * finalScale;
    const gravityDroop = (0.64 + 0.30 * spec.droopFactor) * spec.leafletScale * finalScale;
    const flutterY = Math.sin(li * 3.7 + spec.seed) * 0.022 * spec.leafletScale;
    // Louver pitch rolls each leaflet ~38 deg so blades show lush surface area from ALL horizontal views!
    const louverPitch = (0.044 + 0.012 * hash) * spec.leafletScale * finalScale;

    for (let k = 0; k < vertsPerLeaflet; k++) {
      const idx = baseIdx + k;
      const uVal = uv.getX(idx);
      const s = uv.getY(idx); // 0 at rachis -> 1 at leaflet tip
      const dx = pos.getX(idx) - anchor[0];
      const dy = pos.getY(idx) - anchor[1];
      const dz = pos.getZ(idx) - anchor[2];

      // Side sign across leaflet blade width (-1 trailing, +1 leading, 0 tip)
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

      // Continuous Holodeck asset.foliage UV.y: 0.0 at crown -> 1.0 at free tips!
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

async function buildPalmTextures() {
  // 1. Warm sunlit ringed cenote palm bark + mossy root flare + olive-green crownshaft collar (V3 atlas, flipY=false!)
  // Top-left origin: y=0..82 mossy roots (UV.y 0..0.16), y=82..420 warm ringed palm bark (UV.y 0.16..0.82),
  // y=420..512 smooth fibrous olive-green crownshaft sheath (UV.y 0.82..1.00)!
  const barkOps = [
    {
      op: 'legacy-v2',
      spec: {
        schemaVersion: 2,
        size: 512,
        usage: 'albedo',
        layers: [
          // Warm sunlit driftwood-tan cenote bark matching references/lagoon-sanctuary.png (NOT near-black!)
          { op: 'solid', color: 0x9b8b74 },
          { op: 'stripes', colorA: 0x625341, colorB: 0xb5a48c, count: 64, angleDeg: 90, blend: 'overlay', opacity: 0.62 },
          { op: 'stripes', colorA: 0x4f4233, colorB: 0xc2b29a, count: 32, angleDeg: 90, blend: 'multiply', opacity: 0.30 },
          { op: 'noise', colorA: 0x70604c, colorB: 0xb4a48d, scale: 14, octaves: 5, seed: 41, blend: 'overlay', opacity: 0.42 },
          {
            op: 'cellular',
            colorA: 0x5c4e3d,
            colorB: 0x9f8f79,
            cellsX: 16,
            cellsY: 40,
            jitterX: 0.85,
            jitterY: 0.22,
            metricX: 1.0,
            metricY: 2.5,
            feature: 'border',
            borderWidth: 0.06,
            borderOpen: 0.58,
            seed: 73,
            blend: 'multiply',
            opacity: 0.24,
          },
        ],
      },
    },
    // Crisp warm ash-tan & dark-crevice horizontal palm leaf-scar rings across mid trunk
    { op: 'paint', shape: { kind: 'line', from: [0, 106], to: [511, 106], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 110], to: [511, 110], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 134], to: [511, 134], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 138], to: [511, 138], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 164], to: [511, 164], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 168], to: [511, 168], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 196], to: [511, 196], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 200], to: [511, 200], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 228], to: [511, 228], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 232], to: [511, 232], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 260], to: [511, 260], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 264], to: [511, 264], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 294], to: [511, 294], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 298], to: [511, 298], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 328], to: [511, 328], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 332], to: [511, 332], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    { op: 'paint', shape: { kind: 'line', from: [0, 362], to: [511, 362], width: 3 }, rgba: [192, 176, 152, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [0, 366], to: [511, 366], width: 2 }, rgba: [74, 60, 44, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [0, 394], to: [511, 394], width: 3 }, rgba: [188, 172, 148, 255], opacity: 115 },
    { op: 'paint', shape: { kind: 'line', from: [0, 398], to: [511, 398], width: 2 }, rgba: [74, 60, 44, 255], opacity: 125 },
    // Damp mossy emerald-olive patina near root flare (y = 0..92)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 86 }, rgba: [74, 108, 48, 255], opacity: 155 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 512, height: 40 }, rgba: [58, 90, 38, 255], opacity: 175 },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 52, height: 24 }, rgba: [86, 124, 52, 255], count: 16, seed: 19, area: { x: 0, y: 8, width: 460, height: 84 }, opacity: 120 },
    // Smooth olive-green fibrous crownshaft sheath transition at crown apex (y = 418..512)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 416, width: 512, height: 34 }, rgba: [112, 124, 66, 255], opacity: 185 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 444, width: 512, height: 68 }, rgba: [94, 136, 52, 255], opacity: 230 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 472, width: 512, height: 40 }, rgba: [110, 154, 58, 255], opacity: 215 },
    { op: 'paint', shape: { kind: 'line', from: [0, 420], to: [511, 420], width: 7 }, rgba: [84, 72, 50, 255], opacity: 160 },
  ];

  const barkAlbedo = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'island_bark',
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
            background: [155, 139, 116, 255],
            operations: barkOps,
          },
        },
      },
    ],
  });
  const barkNormal = normalMapFromHeight(barkAlbedo, { strength: 5.0, name: 'CenotePalmBarkNormal' });

  // 2. V3 RGBA Palm Frond Albedo via textureAtlas (flipY=false, top-left origin, mask-rgb-dilate!)
  // Lush tropical palm green (#3d7629) at crown base warming to sunlit chartreuse-olive (#6ca03a -> #8ec04c) at tips!
  const frondOps = [
    // Rachis stem column (x = 0..64, full height y = 0..512)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 64, height: 512 }, rgba: [112, 154, 54, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 180, width: 64, height: 332 }, rgba: [138, 182, 68, 255], opacity: 165 },
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 340, width: 64, height: 172 }, rgba: [162, 204, 82, 255], opacity: 175 },
    { op: 'paint', shape: { kind: 'line', from: [32, 0], to: [32, 511], width: 12 }, rgba: [176, 214, 96, 255], opacity: 185 },
    { op: 'paint', shape: { kind: 'line', from: [8, 0], to: [8, 511], width: 8 }, rgba: [74, 114, 38, 255], opacity: 150 },
    { op: 'paint', shape: { kind: 'line', from: [56, 0], to: [56, 511], width: 8 }, rgba: [74, 114, 38, 255], opacity: 150 },

    // Leaflet blade column (x = 74..498, full height y = 0..512)
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 0, width: 424, height: 512 }, rgba: [61, 118, 41, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 0, width: 424, height: 155 }, rgba: [48, 98, 33, 255], opacity: 155 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 160, width: 424, height: 352 }, rgba: [86, 146, 50, 255], opacity: 165 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 310, width: 424, height: 202 }, rgba: [112, 166, 60, 255], opacity: 190 },
    { op: 'paint', shape: { kind: 'rectangle', x: 74, y: 415, width: 424, height: 97 }, rgba: [138, 188, 72, 255], opacity: 185 },

    // Organic sunlit chlorophyll mottling & backlit variation
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 26, height: 120 }, rgba: [128, 178, 66, 255], count: 14, seed: 109, area: { x: 92, y: 70, width: 380, height: 430 }, opacity: 68 },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 20, height: 95 }, rgba: [44, 90, 30, 255], count: 12, seed: 211, area: { x: 90, y: 0, width: 386, height: 350 }, opacity: 62 },

    // Parallel tropical palm venation lines along blade length
    { op: 'paint', shape: { kind: 'line', from: [128, 0], to: [128, 511], width: 6 }, rgba: [88, 142, 48, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [178, 0], to: [178, 511], width: 7 }, rgba: [98, 152, 54, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [230, 0], to: [230, 511], width: 8 }, rgba: [108, 162, 58, 255], opacity: 140 },
    { op: 'paint', shape: { kind: 'line', from: [346, 0], to: [346, 511], width: 8 }, rgba: [108, 162, 58, 255], opacity: 140 },
    { op: 'paint', shape: { kind: 'line', from: [398, 0], to: [398, 511], width: 7 }, rgba: [98, 152, 54, 255], opacity: 130 },
    { op: 'paint', shape: { kind: 'line', from: [448, 0], to: [448, 511], width: 6 }, rgba: [88, 142, 48, 255], opacity: 120 },

    // Bright sunlit yellow-green central leaflet midrib (u = 0.55 -> x = 282)
    { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 24 }, rgba: [126, 178, 64, 255], opacity: 175 },
    { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 11 }, rgba: [174, 216, 98, 255], opacity: 225 },

    // Subtle darker edge contour along leaflet margins
    { op: 'paint', shape: { kind: 'line', from: [84, 0], to: [84, 511], width: 12 }, rgba: [42, 86, 28, 255], opacity: 120 },
    { op: 'paint', shape: { kind: 'line', from: [490, 0], to: [490, 511], width: 12 }, rgba: [42, 86, 28, 255], opacity: 120 },

    // Subtle wind-fray alpha cutout notches along outer margins (mask-rgb-dilate keeps crisp green edges!)
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
        name: 'palm_frond',
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
        name: 'palm_frond_h',
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
              { op: 'paint', shape: { kind: 'line', from: [128, 0], to: [128, 511], width: 7 }, rgba: [152, 152, 152, 255] },
              { op: 'paint', shape: { kind: 'line', from: [178, 0], to: [178, 511], width: 8 }, rgba: [164, 164, 164, 255] },
              { op: 'paint', shape: { kind: 'line', from: [230, 0], to: [230, 511], width: 9 }, rgba: [174, 174, 174, 255] },
              { op: 'paint', shape: { kind: 'line', from: [346, 0], to: [346, 511], width: 9 }, rgba: [174, 174, 174, 255] },
              { op: 'paint', shape: { kind: 'line', from: [398, 0], to: [398, 511], width: 8 }, rgba: [164, 164, 164, 255] },
              { op: 'paint', shape: { kind: 'line', from: [448, 0], to: [448, 511], width: 7 }, rgba: [152, 152, 152, 255] },
              { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 26 }, rgba: [238, 238, 238, 255] },
              { op: 'paint', shape: { kind: 'line', from: [282, 0], to: [282, 511], width: 12 }, rgba: [255, 255, 255, 255] },
            ],
          },
        },
      },
    ],
  });
  const frondNormal = normalMapFromHeight(frondHeight, { strength: 4.0, name: 'PalmFrondNormal' });

  return { barkAlbedo, barkNormal, frondAlbedo, frondNormal };
}

async function build() {
  const root = createRoot('FoliagePalmIsland');
  const rng = seededRandom('lagoon-palm-island-v2');
  const trunkRng = rng.fork('trunks');
  const frondRng = rng.fork('fronds');

  const { barkAlbedo, barkNormal, frondAlbedo, frondNormal } = await buildPalmTextures();

  const barkMat = pbrMaterial({
    albedo: barkAlbedo,
    normal: barkNormal,
    roughness: 0.86,
    metalness: 0,
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

  // --- 1. Twin Ringed Cenote Palm Trunks + Mossy Root Buttresses (Mesh_PalmTrunk) ---
  const trunkGeos = [];

  // Primary tall gently S-curved ringed trunk (Y = -0.35 embed -> Y = +4.86 crownshaft, ~5.0 m)
  const mainTrunk = buildRingedTrunk(
    [
      [0.05, -0.35, -0.04],
      [0.10, 0.05, -0.06],
      [0.24, 1.35, -0.14],
      [0.40, 2.75, -0.02],
      [0.32, 3.92, 0.08],
      [0.20, 4.86, 0.08],
    ],
    4,
    {
      skirtR: 0.168,
      baseR: 0.130, // 0.26 m base diameter
      topR: 0.075,  // 0.15 m crownshaft diameter
      ringCount: 28,
      ringAmp: 0.052,
      collarSwell: 0.020,
      radialSegments: 10,
    },
  );
  trunkGeos.push(mainTrunk.geo);

  // Shorter companion young offshoot trunk (Y = -0.35 embed -> Y = +3.10 crownshaft, ~3.1 m)
  const sideTrunk = buildRingedTrunk(
    [
      [-0.08, -0.35, 0.06],
      [-0.18, 0.05, 0.14],
      [-0.48, 1.05, 0.30],
      [-0.78, 2.15, 0.44],
      [-0.94, 3.10, 0.52],
    ],
    4,
    {
      skirtR: 0.125,
      baseR: 0.095,
      topR: 0.056,
      ringCount: 19,
      ringAmp: 0.050,
      collarSwell: 0.015,
      radialSegments: 9,
    },
  );
  trunkGeos.push(sideTrunk.geo);

  trunkGeos.push(...buildRootButtresses([0.08, 0, -0.05], 0.13, trunkRng, 5));
  trunkGeos.push(...buildRootButtresses([-0.14, 0, 0.11], 0.095, trunkRng, 4));

  const mergedTrunkGeo = mergeGeos(trunkGeos);
  createPart('PalmTrunk', mergedTrunkGeo, barkMat, { parent: root });

  // --- 2. 17 Arching Feathery Pinnate Fronds across both crowns (Mesh_PalmFronds) ---
  const leafletUnit = buildLeafletUnitGeo();
  const frondGeos = [];

  // Primary crown: 12 lush fronds (4 sun-lifting asymmetric upper, 5 wide sweeping mid, 3 cascading lower skirt)
  const mainCrown = [mainTrunk.tip[0], mainTrunk.tip[1] - 0.12, mainTrunk.tip[2]];
  const mainSpecs = [
    // Upper sun-reaching tier (asymmetrical airy fountain cresting right around Y ~ 5.42 m!)
    { azimuth: 0.30, length: 1.48, lift: 0.98, droop: 0.14, yOffset: 0.06, pairs: 18, leafletScale: 0.43, droopFactor: 0.44, seed: 1 },
    { azimuth: 1.85, length: 1.50, lift: 0.88, droop: 0.18, yOffset: 0.06, pairs: 18, leafletScale: 0.44, droopFactor: 0.48, seed: 2 },
    { azimuth: 3.45, length: 1.44, lift: 0.96, droop: 0.14, yOffset: 0.05, pairs: 17, leafletScale: 0.43, droopFactor: 0.44, seed: 3 },
    { azimuth: 5.02, length: 1.48, lift: 0.84, droop: 0.18, yOffset: 0.05, pairs: 18, leafletScale: 0.43, droopFactor: 0.48, seed: 17 },
    // Mid broad sweeping tier (giving lush ~4.4 m crown diameter)
    { azimuth: 0.02, length: 2.02, lift: 0.58, droop: 0.58, yOffset: 0.00, pairs: 20, leafletScale: 0.51, droopFactor: 0.78, seed: 4 },
    { azimuth: 1.24, length: 1.96, lift: 0.54, droop: 0.62, yOffset: -0.01, pairs: 20, leafletScale: 0.50, droopFactor: 0.82, seed: 5 },
    { azimuth: 2.52, length: 1.98, lift: 0.56, droop: 0.60, yOffset: 0.00, pairs: 20, leafletScale: 0.50, droopFactor: 0.80, seed: 6 },
    { azimuth: 3.78, length: 2.04, lift: 0.60, droop: 0.56, yOffset: 0.00, pairs: 20, leafletScale: 0.51, droopFactor: 0.75, seed: 7 },
    { azimuth: 5.04, length: 1.95, lift: 0.52, droop: 0.64, yOffset: -0.01, pairs: 20, leafletScale: 0.49, droopFactor: 0.84, seed: 8 },
    // Lower gracefully drooping outer skirt tier
    { azimuth: 0.72, length: 1.88, lift: 0.28, droop: 0.94, yOffset: -0.06, pairs: 18, leafletScale: 0.48, droopFactor: 1.05, seed: 9 },
    { azimuth: 2.95, length: 1.82, lift: 0.26, droop: 0.90, yOffset: -0.06, pairs: 18, leafletScale: 0.47, droopFactor: 1.02, seed: 10 },
    { azimuth: 5.55, length: 1.86, lift: 0.30, droop: 0.92, yOffset: -0.06, pairs: 18, leafletScale: 0.48, droopFactor: 1.05, seed: 11 },
  ];

  for (const spec of mainSpecs) {
    frondGeos.push(...buildPalmFrond(mainCrown, spec, leafletUnit, frondRng));
  }

  // Companion crown: 5 lush arching fronds fanning organically outward away from main trunk
  const sideCrown = [sideTrunk.tip[0], sideTrunk.tip[1] - 0.10, sideTrunk.tip[2]];
  const sideSpecs = [
    { azimuth: 1.85, length: 1.22, lift: 0.56, droop: 0.20, yOffset: 0.04, pairs: 14, leafletScale: 0.38, droopFactor: 0.48, seed: 12 },
    { azimuth: 3.45, length: 1.28, lift: 0.54, droop: 0.24, yOffset: 0.04, pairs: 15, leafletScale: 0.39, droopFactor: 0.52, seed: 13 },
    { azimuth: 1.08, length: 1.42, lift: 0.32, droop: 0.56, yOffset: -0.02, pairs: 16, leafletScale: 0.42, droopFactor: 0.82, seed: 14 },
    { azimuth: 2.65, length: 1.48, lift: 0.34, droop: 0.62, yOffset: -0.02, pairs: 16, leafletScale: 0.43, droopFactor: 0.88, seed: 15 },
    { azimuth: 4.35, length: 1.34, lift: 0.30, droop: 0.52, yOffset: -0.03, pairs: 15, leafletScale: 0.41, droopFactor: 0.78, seed: 16 },
  ];

  for (const spec of sideSpecs) {
    frondGeos.push(...buildPalmFrond(sideCrown, spec, leafletUnit, frondRng));
  }

  const mergedFrondsGeo = mergeGeos(frondGeos);
  const palmFronds = createPart('PalmFronds', mergedFrondsGeo, frondMat, { parent: root });
  markOpenShell(palmFronds, 'Feathery palm fronds built from double-sided alpha-cutout pinnate leaflets');

  return root;
}
