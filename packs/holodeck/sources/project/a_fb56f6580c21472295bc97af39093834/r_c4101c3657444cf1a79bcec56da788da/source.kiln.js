const meta = {
  name: 'foliage-waterlily',
};

function mergeGeometries(geos) {
  let totalVerts = 0;
  let totalIndices = 0;
  let hasColor = false;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    totalIndices += g.index ? g.index.count : pos.count;
    if (g.getAttribute('color')) hasColor = true;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const col = g.getAttribute('color');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const dst3 = (vOffset + i) * 3;
      const dst2 = (vOffset + i) * 2;
      positions[dst3] = pos.getX(i);
      positions[dst3 + 1] = pos.getY(i);
      positions[dst3 + 2] = pos.getZ(i);
      if (norm) {
        normals[dst3] = norm.getX(i);
        normals[dst3 + 1] = norm.getY(i);
        normals[dst3 + 2] = norm.getZ(i);
      } else {
        normals[dst3] = 0;
        normals[dst3 + 1] = 1;
        normals[dst3 + 2] = 0;
      }
      if (uv) {
        uvs[dst2] = uv.getX(i);
        uvs[dst2 + 1] = uv.getY(i);
      }
      if (colors) {
        if (col) {
          colors[dst3] = col.getX(i);
          colors[dst3 + 1] = col.getY(i);
          colors[dst3 + 2] = col.getZ(i);
        } else {
          colors[dst3] = 1;
          colors[dst3 + 1] = 1;
          colors[dst3 + 2] = 1;
        }
      }
    }

    if (g.index) {
      const idx = g.index;
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.getX(i) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let i = 0; i < count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += count;
    }
    vOffset += count;
  }

  const out = meshGeo({
    positions: Array.from(positions),
    normals: Array.from(normals),
    uvs: Array.from(uvs),
    indices: Array.from(indices),
  });
  if (colors) {
    out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return out;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRgb(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function tintGeometryGradient(geo, baseHex, tipHex, getT) {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const c0 = hexToLinearRgb(baseHex);
  const c1 = hexToLinearRgb(tipHex);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(1, getT(pos.getX(i), pos.getY(i), pos.getZ(i), i)));
    arr[i * 3] = c0[0] + (c1[0] - c0[0]) * t;
    arr[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    arr[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Rich V3 RGBA 512x512 radial-veined tropical lily pad texture + height normal map.
 * Olive-emerald green (#3d762b..#5a8e36) with warm bronze-burgundy upturned rim & crisp forked veins.
 */
async function buildLilyPadTextures() {
  const W = 512;
  const H = 512;
  const cx = 256;
  const cy = 256;

  const albedoOps = [
    // Subtle warm bronze-burgundy outer rim halo
    { op: 'paint', shape: { kind: 'ellipse', x: 10, y: 10, width: 492, height: 492 }, rgba: [122, 82, 46, 255] },
    // Warm olive-bronze sub-rim transition
    { op: 'paint', shape: { kind: 'ellipse', x: 20, y: 20, width: 472, height: 472 }, rgba: [94, 128, 48, 255] },
    // Lush sunlit mid-outer emerald-olive lamina (#5a8e36)
    { op: 'paint', shape: { kind: 'ellipse', x: 32, y: 32, width: 448, height: 448 }, rgba: [96, 148, 56, 255] },
    // Rich vibrant emerald mid blade
    { op: 'paint', shape: { kind: 'ellipse', x: 74, y: 74, width: 364, height: 364 }, rgba: [76, 134, 46, 230] },
    // Deeper lush olive-emerald central saucer (#3d762b)
    { op: 'paint', shape: { kind: 'ellipse', x: 132, y: 132, width: 248, height: 248 }, rgba: [64, 118, 42, 210] },
    // Subtle botanical surface variegation blotches
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 36, height: 28 }, rgba: [110, 160, 62, 34], count: 42, seed: 109, area: { x: 48, y: 48, width: 380, height: 380 } },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 30, height: 24 }, rgba: [54, 98, 34, 38], count: 38, seed: 211, area: { x: 64, y: 64, width: 350, height: 350 } },
  ];

  const heightOps = [
    // Raised outer upturned lip on height map
    { op: 'paint', shape: { kind: 'ellipse', x: 10, y: 10, width: 492, height: 492 }, rgba: [168, 168, 168, 255] },
    { op: 'paint', shape: { kind: 'ellipse', x: 26, y: 26, width: 460, height: 460 }, rgba: [122, 122, 122, 255] },
    { op: 'paint', shape: { kind: 'ellipse', x: 180, y: 180, width: 152, height: 152 }, rgba: [108, 108, 108, 255] },
  ];

  // 17 primary radiating veins + 17 forked secondary outer veins = 51 ops (total <= 64!)
  const veinCount = 17;
  for (let i = 0; i < veinCount; i++) {
    // Keep crisp margin clear of the V-cleft notch sector (centered around angle = 0)
    const ang = 0.38 + (i / (veinCount - 1)) * (Math.PI * 2 - 0.76);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rMid = 140;
    const rEnd = 228;
    const x1 = Math.round(cx + ca * rEnd);
    const y1 = Math.round(cy + sa * rEnd);
    const xm = Math.round(cx + ca * rMid);
    const ym = Math.round(cy + sa * rMid);

    // Primary luminous yellow-green radiating vein
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, cy], to: [x1, y1], width: 5 },
      rgba: [130, 178, 72, 195],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, cy], to: [x1, y1], width: 6 },
      rgba: [204, 204, 204, 255],
    });

    // Forked secondary branches near outer half of pad
    const forkAngA = ang + 0.14;
    const forkAngB = ang - 0.14;
    const xa = Math.round(cx + Math.cos(forkAngA) * 226);
    const ya = Math.round(cy + Math.sin(forkAngA) * 226);
    const xb = Math.round(cx + Math.cos(forkAngB) * 226);
    const yb = Math.round(cy + Math.sin(forkAngB) * 226);

    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xm, ym], to: [xa, ya], width: 3 },
      rgba: [124, 170, 68, 155],
    });
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xm, ym], to: [xb, yb], width: 3 },
      rgba: [124, 170, 68, 155],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xm, ym], to: [xa, ya], width: 4 },
      rgba: [176, 176, 176, 255],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xm, ym], to: [xb, yb], width: 4 },
      rgba: [176, 176, 176, 255],
    });
  }

  // Central petiole dimple hub (warm olive-gold node)
  albedoOps.push({ op: 'paint', shape: { kind: 'ellipse', x: cx - 18, y: cy - 18, width: 36, height: 36 }, rgba: [134, 168, 68, 220] });
  albedoOps.push({ op: 'paint', shape: { kind: 'ellipse', x: cx - 8, y: cy - 8, width: 16, height: 16 }, rgba: [92, 114, 48, 240] });
  heightOps.push({ op: 'paint', shape: { kind: 'ellipse', x: cx - 14, y: cy - 14, width: 28, height: 28 }, rgba: [220, 220, 220, 255] });

  const albedo = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'lilypad',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'mask-rgb-dilate',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [96, 148, 56, 255],
          operations: albedoOps,
        },
      },
    }],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'lilypad-h',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'copy-edge',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [122, 122, 122, 255],
          operations: heightOps,
        },
      },
    }],
  });

  const normal = normalMapFromHeight(heightAtlas, { strength: 4.5, name: 'LilyPadNormal' });
  normal.flipY = false;
  return { albedo, normal };
}

/**
 * 2-column 512x512 V3 botanical bloom texture:
 * Left half (U = 0..0.5): silky creamy-white lotus petal with warm pale-buttercup base & delicate vertical veining.
 * Right half (U = 0.5..1.0): rich golden-amber stamen & pollen crown.
 */
async function buildBloomTextures() {
  const W = 512;
  const H = 512;
  const albedoOps = [
    // Left half: silky ivory-white petal (#f8f4e8)
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 256, height: 512 }, rgba: [248, 244, 232, 255] },
    // Soft warm cream-buttercup glow near petal base (V=0 at top y=0)
    { op: 'paint', shape: { kind: 'ellipse', x: 16, y: 0, width: 224, height: 155 }, rgba: [244, 224, 152, 185] },
    { op: 'paint', shape: { kind: 'ellipse', x: 40, y: 0, width: 176, height: 96 }, rgba: [238, 206, 114, 155] },
    // Pure luminous pearl-ivory upper half
    { op: 'paint', shape: { kind: 'ellipse', x: 12, y: 210, width: 232, height: 296 }, rgba: [252, 250, 244, 175] },
    // Right half: rich golden-amber stamen base (#e8b32e)
    { op: 'paint', shape: { kind: 'rectangle', x: 256, y: 0, width: 256, height: 512 }, rgba: [232, 178, 44, 255] },
    // Deeper warm honey-amber base (y=0..190)
    { op: 'paint', shape: { kind: 'rectangle', x: 256, y: 0, width: 256, height: 190 }, rgba: [204, 134, 24, 210] },
    // Bright sunlit pollen-gold tips (y=310..512)
    { op: 'paint', shape: { kind: 'rectangle', x: 256, y: 310, width: 256, height: 202 }, rgba: [250, 212, 82, 220] },
    // Fine pollen granule texture on golden half
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 14, height: 14 }, rgba: [255, 228, 112, 110], count: 60, seed: 307, area: { x: 264, y: 12, width: 224, height: 472 } },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 12, height: 12 }, rgba: [184, 114, 18, 90], count: 48, seed: 409, area: { x: 264, y: 12, width: 224, height: 472 } },
  ];

  const heightOps = [
    { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 256, height: 512 }, rgba: [128, 128, 128, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: 256, y: 0, width: 256, height: 512 }, rgba: [132, 132, 132, 255] },
  ];

  // Delicate parallel silky vertical petal veins on left half (11 veins)
  for (let i = 0; i < 11; i++) {
    const uFrac = (i - 5) / 5; // -1..+1
    const xBase = Math.round(128 + uFrac * 36);
    const xMid = Math.round(128 + uFrac * 96);
    const xTip = Math.round(128 + uFrac * 24);
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xBase, 8], to: [xMid, 270], width: 3 },
      rgba: [232, 224, 200, 95],
    });
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xMid, 270], to: [xTip, 502], width: 2 },
      rgba: [236, 230, 212, 85],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xBase, 8], to: [xMid, 270], width: 4 },
      rgba: [164, 164, 164, 255],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [xMid, 270], to: [xTip, 502], width: 3 },
      rgba: [158, 158, 158, 255],
    });
  }

  const albedo = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'bloom',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'copy-edge',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [248, 244, 232, 255],
          operations: albedoOps,
        },
      },
    }],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'bloom-h',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'copy-edge',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [128, 128, 128, 255],
          operations: heightOps,
        },
      },
    }],
  });

  const normal = normalMapFromHeight(heightAtlas, { strength: 3.2, name: 'LotusBloomNormal' });
  normal.flipY = false;
  return { albedo, normal };
}

/**
 * Builds ONE sculpted notched floating tropical lily pad (36 angular x 5 radial rings = ~360 tris).
 * Real geometric V-cleft notch, radial saucer dish curvature, upturned rim margin (+0.014..0.022m),
 * subtle organic perimeter ripple, and planar radial UVs matching the V3 veined texture.
 */
function buildLilyPadGeo(opts) {
  const {
    cx, cz, baseY, radius, notchAngleRad, notchHalfSpreadRad,
    rimLift, seedPhase, innerHex, outerHex,
  } = opts;

  const angSegs = 36;
  const radRings = 5;
  const startAng = notchHalfSpreadRad;
  const endAng = Math.PI * 2 - notchHalfSpreadRad;
  const spanAng = endAng - startAng;

  const cIn = hexToLinearRgb(innerHex);
  const cOut = hexToLinearRgb(outerHex);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  // Ring 0 is small smooth inner sinus arc (r = 0.055 * radius) around petiole hub to avoid degenerate pole
  const rFracs = [0.055, 0.24, 0.50, 0.76, 0.91, 1.0];

  // Center petiole hub vertex (index 0)
  positions.push(cx, baseY - 0.002, cz);
  uvs.push(0.5, 0.5);
  colors.push(cIn[0], cIn[1], cIn[2]);

  for (let rr = 0; rr <= radRings; rr++) {
    const rf = rFracs[rr];
    for (let aa = 0; aa <= angSegs; aa++) {
      const aFrac = aa / angSegs;
      const localTheta = startAng + aFrac * spanAng;
      const worldTheta = localTheta + notchAngleRad;

      // Subtle organic perimeter waviness + slight natural oval eccentricity
      const edgeWave = 1 + 0.032 * Math.sin(localTheta * 5 + seedPhase)
        + 0.020 * Math.cos(localTheta * 3 - seedPhase * 1.4);
      const notchTaper = (aa === 0 || aa === angSegs) ? 0.96 : 1.0;
      const r = radius * rf * (1 + (edgeWave - 1) * rf) * notchTaper;

      // Gentle radial dish + sculpted upturned margin curl at outer 20% + subtle organic wave
      const saucer = 0.004 * Math.pow(rf, 1.4);
      const upturnedRim = rimLift * Math.pow(Math.max(0, (rf - 0.72) / 0.28), 2.0);
      const microRipple = 0.0032 * rf * Math.sin(localTheta * 6 + seedPhase * 2.1);
      // Slight dip along the notch edge so notch feels softly organic
      const edgeEase = Math.sin(Math.min(1, Math.min(aFrac, 1 - aFrac) * 7.5) * Math.PI * 0.5);
      const y = baseY + saucer + (upturnedRim + microRipple) * (0.35 + 0.65 * edgeEase);

      const px = cx + r * Math.cos(worldTheta);
      const pz = cz + r * Math.sin(worldTheta);

      // Planar UV aligned with localTheta (notch centered at localTheta = 0 -> texture right edge)
      const uvR = 0.475 * rf;
      const u = 0.5 + uvR * Math.cos(localTheta);
      const v = 0.5 + uvR * Math.sin(localTheta);

      const colT = Math.pow(rf, 0.9);
      const cr = cIn[0] + (cOut[0] - cIn[0]) * colT;
      const cg = cIn[1] + (cOut[1] - cIn[1]) * colT;
      const cb = cIn[2] + (cOut[2] - cIn[2]) * colT;

      positions.push(px, y, pz);
      uvs.push(u, v);
      colors.push(cr, cg, cb);
    }
  }

  const stride = angSegs + 1;
  // Center fan connecting vertex 0 to ring 0 (CCW looking from +Y down)
  for (let aa = 0; aa < angSegs; aa++) {
    const v1 = 1 + aa;
    const v2 = 1 + aa + 1;
    indices.push(0, v2, v1);
  }
  // Quad rings from ring 0 to outer margin
  for (let rr = 0; rr < radRings; rr++) {
    for (let aa = 0; aa < angSegs; aa++) {
      const a = 1 + rr * stride + aa;
      const b = a + 1;
      const d = 1 + (rr + 1) * stride + aa;
      const e = d + 1;
      indices.push(a, b, e, a, e, d);
    }
  }

  const geo = meshGeo({ positions, uvs, indices });
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  return geo;
}

/**
 * Builds ONE sculpted spoon-cupped pointed lotus petal (or outer calyx sepal).
 * uSlot = [uMin, uMax] maps to petal column of bloom texture (0.02..0.48).
 */
function buildSculptedPetalGeo(opts) {
  const {
    cx, cy, cz, azRad, tiltFromVertRad, length, maxWidth,
    cupDepth, tipCurl, baseHex, tipHex, uMin, uMax,
  } = opts;

  const rows = 5; // 0 = base receptacle, 1..4 = smooth spoon belly, 5 = elegant lotus point
  const cols = 3; // concave spoon cup across width (u = 0, 0.33, 0.67, 1)
  const c0 = hexToLinearRgb(baseHex);
  const c1 = hexToLinearRgb(tipHex);

  const ca = Math.cos(azRad);
  const sa = Math.sin(azRad);
  // Outward radial direction R, sideways tangent S, upward Y
  const sideX = -sa;
  const sideZ = ca;

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Lotus petal width envelope: narrow base -> lush rounded spoon belly at v=0.48 -> graceful pointed tip
    const wEnv = Math.max(0.05, Math.sin(Math.pow(v, 0.72) * Math.PI) * (1 - 0.08 * v));
    const halfW = maxWidth * 0.5 * wEnv;

    // Lengthwise graceful upward-then-outward S-curve
    const pitch = tiltFromVertRad * (0.72 + 0.36 * v) + tipCurl * Math.pow(v, 2.2);
    const arcLen = length * v;
    const radDist = 0.012 + arcLen * Math.sin(pitch);
    const upDist = arcLen * Math.cos(pitch);

    // Normal direction pointing inward/upward toward blossom center
    const inX = -ca * Math.cos(pitch);
    const inY = Math.sin(pitch);
    const inZ = -sa * Math.cos(pitch);

    const colT = Math.pow(v, 0.72);
    const cr = c0[0] + (c1[0] - c0[0]) * colT;
    const cg = c0[1] + (c1[1] - c0[1]) * colT;
    const cb = c0[2] + (c1[2] - c0[2]) * colT;

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const s = (u - 0.5) * 2; // -1..+1
      // Concave spoon cup: edges curve inward toward blossom center!
      const cup = cupDepth * (s * s) * Math.sin(v * Math.PI);
      const lat = s * halfW;

      const px = cx + ca * radDist + sideX * lat + inX * cup;
      const py = cy + upDist + inY * cup;
      const pz = cz + sa * radDist + sideZ * lat + inZ * cup;

      positions.push(px, py, pz);
      uvs.push(uMin + (uMax - uMin) * u, v);
      colors.push(cr, cg, cb);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      indices.push(a, b, e, a, e, d);
    }
  }

  const geo = meshGeo({ positions, uvs, indices });
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  return geo;
}

/**
 * Builds one complete multi-petal creamy-white tropical water lily / lotus blossom + golden stamen crown
 * (petals + stamens go to bloomGeos; dark-olive outer calyx sepals go to stemGeos).
 */
function buildLotusBlossom(opts, bloomGeos, stemGeos) {
  const {
    cx, baseY, cz, scale, openFactor, rotOffset,
    outerCount, midCount, innerCount, stamenCount,
  } = opts;

  // 1. 4 Dark-olive outer calyx sepals cradling the underside of the blossom (in Mesh_LilyStems!)
  for (let i = 0; i < 4; i++) {
    const az = rotOffset + (i / 4) * Math.PI * 2 + 0.35;
    stemGeos.push(buildSculptedPetalGeo({
      cx, cy: baseY - 0.004 * scale, cz,
      azRad: az,
      tiltFromVertRad: 1.18 * (0.78 + 0.22 * openFactor),
      length: 0.115 * scale,
      maxWidth: 0.044 * scale,
      cupDepth: 0.009 * scale,
      tipCurl: 0.14,
      baseHex: 0x3b5826,
      tipHex: 0x5d7a36,
      uMin: 0.05, uMax: 0.95,
    }));
  }

  // 2. Outer wide splayed ivory-white petals (slight cream blush at base)
  for (let i = 0; i < outerCount; i++) {
    const az = rotOffset + (i / outerCount) * Math.PI * 2;
    bloomGeos.push(buildSculptedPetalGeo({
      cx, cy: baseY + 0.002 * scale, cz,
      azRad: az,
      tiltFromVertRad: (0.62 + 0.56 * openFactor),
      length: 0.140 * scale,
      maxWidth: 0.054 * scale,
      cupDepth: 0.013 * scale,
      tipCurl: 0.12 * openFactor,
      baseHex: 0xf4e8c4,
      tipHex: 0xfcfaf2,
      uMin: 0.03, uMax: 0.47,
    }));
  }

  // 3. Middle staggered cupped ivory petals
  for (let i = 0; i < midCount; i++) {
    const az = rotOffset + ((i + 0.5) / midCount) * Math.PI * 2;
    bloomGeos.push(buildSculptedPetalGeo({
      cx, cy: baseY + 0.008 * scale, cz,
      azRad: az,
      tiltFromVertRad: (0.40 + 0.38 * openFactor),
      length: 0.122 * scale,
      maxWidth: 0.048 * scale,
      cupDepth: 0.015 * scale,
      tipCurl: -0.04,
      baseHex: 0xf7ebc4,
      tipHex: 0xffffff,
      uMin: 0.03, uMax: 0.47,
    }));
  }

  // 4. Inner upright incurved petals cradling the golden stamen crown
  for (let i = 0; i < innerCount; i++) {
    const az = rotOffset + ((i + 0.25) / innerCount) * Math.PI * 2;
    bloomGeos.push(buildSculptedPetalGeo({
      cx, cy: baseY + 0.013 * scale, cz,
      azRad: az,
      tiltFromVertRad: (0.18 + 0.22 * openFactor),
      length: 0.096 * scale,
      maxWidth: 0.038 * scale,
      cupDepth: 0.014 * scale,
      tipCurl: -0.18,
      baseHex: 0xfbe9ac,
      tipHex: 0xfcfaf0,
      uMin: 0.03, uMax: 0.47,
    }));
  }

  // 5. Golden-amber central receptacle dome (mapped to right half U=0.54..0.96, preserving analytic sphere normals!)
  const domeGeo = copyGeometry(sphereGeo(0.025 * scale, 10, 6));
  const dPos = domeGeo.getAttribute('position');
  const dNorm = domeGeo.getAttribute('normal');
  const dUv = domeGeo.getAttribute('uv');
  for (let i = 0; i < dPos.count; i++) {
    const x = dPos.getX(i);
    const y = dPos.getY(i) * 0.65;
    const z = dPos.getZ(i);
    dPos.setXYZ(i, cx + x, baseY + 0.026 * scale + y, cz + z);
    const nx = dNorm.getX(i);
    const ny = dNorm.getY(i) / 0.65;
    const nz = dNorm.getZ(i);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    dNorm.setXYZ(i, nx / nLen, ny / nLen, nz / nLen);
    dUv.setXY(i, 0.54 + 0.42 * dUv.getX(i), dUv.getY(i));
  }
  tintGeometryGradient(domeGeo, 0xd4921c, 0xf8cc48, (_x, y) => (y - baseY) / (0.05 * scale));
  bloomGeos.push(domeGeo);

  // 6. Sculpted radiating golden-amber stamen filaments (2 lush rings around receptacle)
  for (let i = 0; i < stamenCount; i++) {
    const isOuter = i % 2 === 0;
    const az = rotOffset + (i / stamenCount) * Math.PI * 2;
    const rBase = (isOuter ? 0.024 : 0.015) * scale;
    const tilt = isOuter ? (0.38 + 0.16 * openFactor) : (0.16 + 0.10 * openFactor);
    const len = (isOuter ? 0.064 : 0.054) * scale;

    // 2-segment tiny curved tapered stamen blade (4 tris each)
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const sx = -sa;
    const sz = ca;
    const w0 = 0.0048 * scale;
    const w1 = 0.0060 * scale;
    const w2 = 0.0028 * scale;

    const p0x = cx + ca * rBase;
    const p0y = baseY + 0.018 * scale;
    const p0z = cz + sa * rBase;

    const p1x = p0x + ca * len * 0.55 * Math.sin(tilt);
    const p1y = p0y + len * 0.55 * Math.cos(tilt);
    const p1z = p0z + sa * len * 0.55 * Math.sin(tilt);

    // Anther tip curls slightly inward toward the bright center
    const p2x = p1x + ca * len * 0.45 * Math.sin(tilt * 0.45);
    const p2y = p1y + len * 0.48 * Math.cos(tilt * 0.45);
    const p2z = p1z + sa * len * 0.45 * Math.sin(tilt * 0.45);

    const sPositions = [
      p0x - sx * w0, p0y, p0z - sz * w0,
      p0x + sx * w0, p0y, p0z + sz * w0,
      p1x - sx * w1, p1y, p1z - sz * w1,
      p1x + sx * w1, p1y, p1z + sz * w1,
      p2x - sx * w2, p2y, p2z - sz * w2,
      p2x + sx * w2, p2y, p2z + sz * w2,
    ];
    const sUvs = [
      0.56, 0.05, 0.94, 0.05,
      0.56, 0.55, 0.94, 0.55,
      0.56, 0.96, 0.94, 0.96,
    ];
    const sIdx = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4];
    const sGeo = meshGeo({ positions: sPositions, uvs: sUvs, indices: sIdx });
    tintGeometryGradient(sGeo, 0xd89018, 0xffe066, (_x, y) => (y - p0y) / Math.max(0.01, len));
    bloomGeos.push(sGeo);
  }
}

/**
 * Builds one organically bowed dark underwater petiole or flower stalk dipping smoothly down to Y=-0.22..-0.25m.
 */
function buildUnderwaterStem(topX, topY, topZ, driftX, driftZ, bowX, bowZ, bottomY, topRad, botRad) {
  const p0 = [topX, topY, topZ];
  const p1 = [topX + driftX * 0.25 + bowX, topY - (topY - bottomY) * 0.34, topZ + driftZ * 0.25 + bowZ];
  const p2 = [topX + driftX * 0.78 - bowX * 0.45, topY - (topY - bottomY) * 0.72, topZ + driftZ * 0.78 - bowZ * 0.45];
  const p3 = [topX + driftX, bottomY, topZ + driftZ];
  const pts = bezierCurve([p0, p1, p2, p3], 6);
  const radii = pts.map((_, idx) => {
    const t = idx / (pts.length - 1);
    return topRad + (botRad - topRad) * t;
  });
  const tube = taperedTube(pts, radii, { radialSegments: 4, creaseAngle: 180, cap: true });
  tintGeometryGradient(tube, 0x2a3c1d, 0x4b682e, (_x, y) => Math.max(0, Math.min(1, (y - bottomY) / Math.max(0.05, topY - bottomY))));
  return tube;
}

async function build() {
  const root = createRoot('foliage-waterlily');
  const rng = seededRandom('lagoon-waterlily-v1');

  const { albedo: padAlbedo, normal: padNormal } = await buildLilyPadTextures();
  const { albedo: bloomAlbedo, normal: bloomNormal } = await buildBloomTextures();

  // Underwater stems & calyx sepals material
  const stemTex = proceduralTexture({
    schemaVersion: 2,
    size: 128,
    usage: 'albedo',
    name: 'LilyStemAlbedo',
    layers: [
      { op: 'solid', color: 0x526e32 },
      { op: 'stripes', colorA: 0x3b5222, colorB: 0x62803c, count: 10, angleDeg: 0, blend: 'overlay', opacity: 0.4 },
      { op: 'noise', colorA: 0x32451d, colorB: 0x6c8c42, scale: 6, octaves: 3, seed: 53, blend: 'multiply', opacity: 0.45 },
    ],
  });
  const stemNormal = normalMapFromHeight(stemTex, { strength: 3.5, name: 'LilyStemNormal' });

  const padMat = pbrMaterial({
    albedo: padAlbedo,
    normal: padNormal,
    roughness: 0.38,
    metalness: 0.0,
    doubleSided: true,
    name: 'Mat_LilyPads',
  });
  padMat.vertexColors = true;

  const stemMat = pbrMaterial({
    albedo: stemTex,
    normal: stemNormal,
    roughness: 0.52,
    metalness: 0.0,
    doubleSided: true,
    name: 'Mat_LilyStems',
  });
  stemMat.vertexColors = true;

  const bloomMat = pbrMaterial({
    albedo: bloomAlbedo,
    normal: bloomNormal,
    roughness: 0.34,
    metalness: 0.0,
    doubleSided: true,
    name: 'Mat_LilyBlooms',
  });
  bloomMat.vertexColors = true;

  // 9 overlapping notched floating tropical lily pads spanning ~2.30m (X) x ~2.10m (Z)!
  // Pivot Y=0.00m is exact lagoon water plane; overlapping pads staggered by >=0.012m in Y -> ZERO FLUSH_FACES!
  const padSpecs = [
    // Hero right-center cluster (cradling Bloom 1 & Bloom 2)
    { cx:  0.42, cz:  0.14, baseY: 0.012, radius: 0.265, notch: 2.35, rimLift: 0.019, innerHex: 0xd0e0be, outerHex: 0xf4fae8 },
    { cx:  0.86, cz: -0.14, baseY: 0.026, radius: 0.252, notch: 4.10, rimLift: 0.018, innerHex: 0xbdd0ac, outerHex: 0xe6f0d8 },
    { cx:  0.54, cz: -0.70, baseY: 0.014, radius: 0.240, notch: 0.85, rimLift: 0.018, innerHex: 0xc8dab6, outerHex: 0xf0f6e4 },
    { cx:  0.76, cz:  0.76, baseY: 0.018, radius: 0.228, notch: 5.20, rimLift: 0.017, innerHex: 0xd6e6c4, outerHex: 0xf8fce8 },
    { cx:  0.14, cz:  0.74, baseY: 0.030, radius: 0.222, notch: 1.55, rimLift: 0.017, innerHex: 0xc2d6b0, outerHex: 0xecf4dc },

    // Left-forward drifting sub-cluster (cradling Bloom 3)
    { cx: -0.58, cz:  0.26, baseY: 0.012, radius: 0.260, notch: 5.65, rimLift: 0.019, innerHex: 0xc4d8b2, outerHex: 0xedf5de },
    { cx: -0.94, cz: -0.22, baseY: 0.026, radius: 0.230, notch: 1.25, rimLift: 0.018, innerHex: 0xb8cca6, outerHex: 0xe2ecd2 },
    { cx: -0.36, cz: -0.76, baseY: 0.016, radius: 0.248, notch: 3.35, rimLift: 0.019, innerHex: 0xd2e2c0, outerHex: 0xf5fae6 },
    // Small bright young satellite pad bridging center
    { cx: -0.12, cz: -0.04, baseY: 0.028, radius: 0.148, notch: 2.15, rimLift: 0.014, innerHex: 0xdcedc8, outerHex: 0xffffec },
  ];

  const padGeos = [];
  const stemGeos = [];
  const bloomGeos = [];

  for (let i = 0; i < padSpecs.length; i++) {
    const p = padSpecs[i];
    padGeos.push(buildLilyPadGeo({
      cx: p.cx,
      cz: p.cz,
      baseY: p.baseY,
      radius: p.radius,
      notchAngleRad: p.notch,
      notchHalfSpreadRad: rng.range(0.22, 0.28),
      rimLift: p.rimLift,
      seedPhase: i * 1.7 + 0.5,
      innerHex: p.innerHex,
      outerHex: p.outerHex,
    }));

    // Slender organically bowed underwater petiole stem dipping gently below water plane to Y=-0.22..-0.25m
    const driftX = -p.cx * 0.18 + rng.range(-0.07, 0.07);
    const driftZ = -p.cz * 0.18 + rng.range(-0.07, 0.07);
    const bowX = rng.range(-0.045, 0.045);
    const bowZ = rng.range(-0.045, 0.045);
    const botY = rng.range(-0.25, -0.21);
    stemGeos.push(buildUnderwaterStem(p.cx, p.baseY - 0.002, p.cz, driftX, driftZ, bowX, bowZ, botY, 0.0062, 0.0046));
  }

  // 3 Sculpted multi-petal creamy-white water lily / lotus blossoms with golden stamen crowns!
  const bloomSpecs = [
    // Bloom 1: Hero wide-open creamy-white lotus (~0.27m across, rising ~0.16m above water, clear of pad rims)
    {
      cx: 0.34, baseY: 0.056, cz: -0.24,
      scale: 1.04, openFactor: 0.92, rotOffset: 0.25,
      outerCount: 8, midCount: 8, innerCount: 6, stamenCount: 18,
    },
    // Bloom 2: Medium open lotus (~0.23m across, nestled cleanly between front-right pads)
    {
      cx: 0.45, baseY: 0.054, cz: 0.52,
      scale: 0.88, openFactor: 0.82, rotOffset: 1.40,
      outerCount: 7, midCount: 7, innerCount: 5, stamenCount: 16,
    },
    // Bloom 3: Half-open emerging graceful lotus (~0.18m across, rising on left sub-cluster)
    {
      cx: -0.54, baseY: 0.068, cz: -0.32,
      scale: 0.80, openFactor: 0.46, rotOffset: 2.65,
      outerCount: 6, midCount: 6, innerCount: 5, stamenCount: 12,
    },
  ];

  for (const b of bloomSpecs) {
    buildLotusBlossom(b, bloomGeos, stemGeos);
    // Thicker gently bowed underwater flower peduncle stalk anchoring the blossom down to Y=-0.24m
    stemGeos.push(buildUnderwaterStem(
      b.cx, b.baseY - 0.002, b.cz,
      -b.cx * 0.15, -b.cz * 0.15,
      0.032, -0.028,
      -0.245, 0.0095, 0.0072
    ));
  }

  const padsPart = createPart('LilyPads', mergeGeometries(padGeos), padMat, { parent: root });
  markOpenShell(padsPart, 'Floating double-sided notched water lily pad leaf blades');

  const stemsPart = createPart('LilyStems', mergeGeometries(stemGeos), stemMat, { parent: root });
  markOpenShell(stemsPart, 'Underwater lily stems and double-sided outer calyx sepals');

  const bloomsPart = createPart('LilyBlooms', mergeGeometries(bloomGeos), bloomMat, { parent: root });
  markOpenShell(bloomsPart, 'Sculpted double-sided multi-petal lotus blossoms and stamen filaments');

  return root;
}
