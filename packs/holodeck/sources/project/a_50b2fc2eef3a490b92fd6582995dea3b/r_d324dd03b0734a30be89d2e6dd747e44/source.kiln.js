const meta = {
  name: 'Sanctuary Portal',
  role: 'wonder',
  description: 'Hero centerpiece weathered Mayan limestone temple pavilion with open sunlit portals, corbelled skylight oculus, carved radial sunburst medallion, interior sun altar, and velvety 3D moss cushions.',
};

// Shared material palette for Lagoon Sanctuary temple kit (4 materials)
function createSanctuaryMaterials() {
  const packRough = (r) => (255 << 16) | (Math.max(0, Math.min(255, Math.round(r * 255))) << 8);

  // 1. Pale Weathered Limestone (#c9bfa8 ivory-buff travertine, roughness 0.84-0.92)
  const ashlarBeds = {
    cellsX: 4,
    cellsY: 8,
    seed: 41,
    jitterX: 0.22,
    jitterY: 0.06,
    metricX: 1,
    metricY: 2.2,
    weight: 0.12,
  };
  const paleAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'PaleLimestoneAlbedo',
    layers: [
      { op: 'cellular', ...ashlarBeds, feature: 'cell', colorA: 0xbeb39b, colorB: 0xd6cdb7 },
      { op: 'noise', colorA: 0xa0957e, colorB: 0xe4dcc8, scale: 14, octaves: 5, seed: 42, blend: 'overlay', opacity: 0.45 },
      { op: 'noise', colorA: 0xa89f8a, colorB: 0xd9d2c0, scale: 5, octaves: 3, seed: 43, blend: 'multiply', opacity: 0.22 },
      { op: 'cellular', ...ashlarBeds, feature: 'facet', facetSlope: 0.35, facetBlend: 0.25, colorA: 0xc4baa5, colorB: 0xffffff, blend: 'multiply', opacity: 0.24 },
      { op: 'cellular', ...ashlarBeds, feature: 'border', borderOpen: 0.88, borderWidth: 0.032, colorA: 0xffffff, colorB: 0x5c5446, blend: 'multiply', opacity: 0.72 },
    ],
  });
  const paleHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'PaleLimestoneHeight',
    layers: [
      { op: 'cellular', ...ashlarBeds, feature: 'f2-f1', range: 0.28, colorA: 0x454545, colorB: 0xe6e6e6 },
      { op: 'cellular', ...ashlarBeds, feature: 'facet', facetSlope: 0.55, facetBlend: 0.22, colorA: 0x707070, colorB: 0xffffff, blend: 'multiply', opacity: 0.45 },
      { op: 'noise', colorA: 0x585858, colorB: 0xc8c8c8, scale: 20, octaves: 5, seed: 44, blend: 'overlay', opacity: 0.45 },
      { op: 'cellular', ...ashlarBeds, feature: 'border', borderOpen: 0.88, borderWidth: 0.036, colorA: 0xffffff, colorB: 0x0a0a0a, blend: 'multiply', opacity: 0.9 },
    ],
  });
  const paleRough = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'PaleLimestoneARM',
    layers: [
      { op: 'cellular', ...ashlarBeds, feature: 'cell', colorA: packRough(0.84), colorB: packRough(0.91) },
      { op: 'noise', colorA: packRough(0.82), colorB: packRough(0.93), scale: 12, octaves: 4, seed: 45, blend: 'overlay', opacity: 0.35 },
      { op: 'cellular', ...ashlarBeds, feature: 'border', borderOpen: 0.88, borderWidth: 0.038, colorA: packRough(0.86), colorB: packRough(0.96), blend: 'screen', opacity: 0.25 },
    ],
  });
  const paleLimestone = pbrMaterial({
    albedo: paleAlbedo,
    normal: normalMapFromHeight(paleHeight, { strength: 5.2, name: 'PaleLimestoneNormal' }),
    metallicRoughness: paleRough,
    roughness: 1,
    metalness: 0,
    name: 'PaleWeatheredLimestone',
  });

  // 2. Deep Carved Relief Recesses / Shadowed Limestone (#8c8370, roughness 0.90)
  const reliefBeds = {
    cellsX: 6,
    cellsY: 6,
    seed: 71,
    jitterX: 0.45,
    jitterY: 0.35,
    metricX: 1,
    metricY: 1.4,
    weight: 0.18,
  };
  const reliefAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CarvedReliefAlbedo',
    layers: [
      { op: 'cellular', ...reliefBeds, feature: 'cell', colorA: 0x79705f, colorB: 0x948a76 },
      { op: 'noise', colorA: 0x5c5548, colorB: 0xada38f, scale: 22, octaves: 5, seed: 72, blend: 'overlay', opacity: 0.52 },
      { op: 'cellular', ...reliefBeds, feature: 'border', borderOpen: 0.72, borderWidth: 0.04, colorA: 0xffffff, colorB: 0x3b352c, blend: 'multiply', opacity: 0.68 },
    ],
  });
  const reliefHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CarvedReliefHeight',
    layers: [
      { op: 'noise', colorA: 0x303030, colorB: 0xd8d8d8, scale: 24, octaves: 5, seed: 73 },
      { op: 'cellular', ...reliefBeds, feature: 'f2-f1', range: 0.24, colorA: 0x404040, colorB: 0xffffff, blend: 'multiply', opacity: 0.5 },
    ],
  });
  const reliefRough = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'CarvedReliefARM',
    layers: [
      { op: 'noise', colorA: packRough(0.88), colorB: packRough(0.94), scale: 16, octaves: 4, seed: 74 },
    ],
  });
  const carvedRelief = pbrMaterial({
    albedo: reliefAlbedo,
    normal: normalMapFromHeight(reliefHeight, { strength: 6.2, name: 'CarvedReliefNormal' }),
    metallicRoughness: reliefRough,
    roughness: 1,
    metalness: 0,
    name: 'CarvedReliefLimestone',
  });

  // 3. Damp Water-Stained Lower Masonry (#767364 olive-taupe, roughness 0.78)
  const dampBeds = {
    cellsX: 4,
    cellsY: 6,
    seed: 91,
    jitterX: 0.26,
    jitterY: 0.08,
    metricX: 1,
    metricY: 1.9,
    weight: 0.15,
  };
  const dampAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerAlbedo',
    layers: [
      { op: 'cellular', ...dampBeds, feature: 'cell', colorA: 0x6b695b, colorB: 0x827f6f },
      { op: 'noise', colorA: 0x4f5243, colorB: 0x999582, scale: 14, octaves: 5, seed: 92, blend: 'overlay', opacity: 0.5 },
      { op: 'noise', colorA: 0x48563a, colorB: 0x8e8b7a, scale: 7, octaves: 4, seed: 93, blend: 'multiply', opacity: 0.34 },
      { op: 'cellular', ...dampBeds, feature: 'border', borderOpen: 0.85, borderWidth: 0.038, colorA: 0xffffff, colorB: 0x303329, blend: 'multiply', opacity: 0.78 },
    ],
  });
  const dampHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerHeight',
    layers: [
      { op: 'cellular', ...dampBeds, feature: 'f2-f1', range: 0.3, colorA: 0x353535, colorB: 0xededed },
      { op: 'noise', colorA: 0x555555, colorB: 0xd0d0d0, scale: 18, octaves: 5, seed: 94, blend: 'overlay', opacity: 0.45 },
      { op: 'cellular', ...dampBeds, feature: 'border', borderOpen: 0.85, borderWidth: 0.04, colorA: 0xffffff, colorB: 0x080808, blend: 'multiply', opacity: 0.9 },
    ],
  });
  const dampRough = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'DampLowerARM',
    layers: [
      { op: 'cellular', ...dampBeds, feature: 'cell', colorA: packRough(0.73), colorB: packRough(0.82) },
      { op: 'noise', colorA: packRough(0.70), colorB: packRough(0.85), scale: 10, octaves: 4, seed: 95, blend: 'overlay', opacity: 0.4 },
    ],
  });
  const dampMasonry = pbrMaterial({
    albedo: dampAlbedo,
    normal: normalMapFromHeight(dampHeight, { strength: 5.5, name: 'DampLowerNormal' }),
    metallicRoughness: dampRough,
    roughness: 1,
    metalness: 0,
    name: 'DampLowerMasonry',
  });

  // 4. Velvety Stone Moss Cushions (#43662e / #557a39 warm sun-dappled moss, roughness 0.92)
  const mossCells = {
    cellsX: 16,
    cellsY: 16,
    seed: 121,
    jitterX: 0.9,
    jitterY: 0.9,
    metricX: 1,
    metricY: 1,
    weight: 0.35,
  };
  const mossAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'VelvetyMossAlbedo',
    layers: [
      { op: 'solid', color: 0x4f7434 },
      { op: 'cellular', ...mossCells, feature: 'f1', range: 0.85, colorA: 0x678c43, colorB: 0x3b5b26, blend: 'overlay', opacity: 0.62 },
      { op: 'noise', colorA: 0x365423, colorB: 0x76994d, scale: 26, octaves: 5, seed: 122, blend: 'overlay', opacity: 0.52 },
      { op: 'noise', colorA: 0x43662e, colorB: 0x6a8d45, scale: 9, octaves: 4, seed: 123, blend: 'multiply', opacity: 0.28 },
    ],
  });
  const mossHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'VelvetyMossHeight',
    layers: [
      { op: 'cellular', ...mossCells, feature: 'f1', range: 0.9, colorA: 0xe8e8e8, colorB: 0x282828 },
      { op: 'noise', colorA: 0x303030, colorB: 0xf0f0f0, scale: 34, octaves: 5, seed: 124, blend: 'overlay', opacity: 0.65 },
    ],
  });
  const mossRough = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'VelvetyMossARM',
    layers: [
      { op: 'noise', colorA: packRough(0.89), colorB: packRough(0.95), scale: 18, octaves: 4, seed: 125 },
    ],
  });
  const velvetyMoss = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossHeight, { strength: 6.0, name: 'VelvetyMossNormal' }),
    metallicRoughness: mossRough,
    roughness: 1,
    metalness: 0,
    name: 'VelvetyStoneMoss',
  });

  return { paleLimestone, carvedRelief, dampMasonry, velvetyMoss };
}

// Fast, watertight, outward-wound procedural mesh batcher
class GeoBatch {
  constructor(name, material, uvScale = 2.2) {
    this.name = name;
    this.material = material;
    this.uvScale = uvScale;
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
  }

  _boxUV(p, n, uvScale, ox, oy) {
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    if (ax >= ay && ax >= az) return [p[2] / uvScale + ox, p[1] / uvScale + oy];
    if (ay >= ax && ay >= az) return [p[0] / uvScale + ox, p[2] / uvScale + oy];
    return [p[0] / uvScale + ox, p[1] / uvScale + oy];
  }

  addTri(p0, p1, p2, outHint, opts = {}) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    nx /= len; ny /= len; nz /= len;

    let a = p0, b = p1, c = p2;
    if (outHint) {
      const dot = nx * outHint[0] + ny * outHint[1] + nz * outHint[2];
      if (dot < 0) {
        b = p2; c = p1;
        nx = -nx; ny = -ny; nz = -nz;
      }
    }

    const uvScale = opts.uvScale ?? this.uvScale;
    const ox = opts.ox ?? 0;
    const oy = opts.oy ?? 0;
    const n = [nx, ny, nz];
    const base = this.pos.length / 3;

    for (const pt of [a, b, c]) {
      this.pos.push(pt[0], pt[1], pt[2]);
      this.nrm.push(nx, ny, nz);
      const [u, v] = this._boxUV(pt, n, uvScale, ox, oy);
      this.uv.push(u, v);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  addQuad(p0, p1, p2, p3, outHint, opts = {}) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    nx /= len; ny /= len; nz /= len;

    let pts = [p0, p1, p2, p3];
    if (outHint) {
      const dot = nx * outHint[0] + ny * outHint[1] + nz * outHint[2];
      if (dot < 0) {
        pts = [p0, p3, p2, p1];
        nx = -nx; ny = -ny; nz = -nz;
      }
    }

    const uvScale = opts.uvScale ?? this.uvScale;
    const ox = opts.ox ?? 0;
    const oy = opts.oy ?? 0;
    const n = [nx, ny, nz];
    const base = this.pos.length / 3;

    for (const pt of pts) {
      this.pos.push(pt[0], pt[1], pt[2]);
      this.nrm.push(nx, ny, nz);
      const [u, v] = this._boxUV(pt, n, uvScale, ox, oy);
      this.uv.push(u, v);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addChamferBox(cx, cy, cz, sx, sy, sz, bevel = 0.025, opts = {}) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const b = Math.max(0, Math.min(bevel, hx * 0.35, hy * 0.35, hz * 0.35));

    if (b < 0.002) {
      const x0 = cx - hx, x1 = cx + hx;
      const y0 = cy - hy, y1 = cy + hy;
      const z0 = cz - hz, z1 = cz + hz;
      this.addQuad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], opts);
      this.addQuad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], opts);
      this.addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], opts);
      this.addQuad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], opts);
      this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], opts);
      this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], opts);
      return;
    }

    const ix = hx - b, iy = hy - b, iz = hz - b;
    const pt = (dx, dy, dz) => [cx + dx, cy + dy, cz + dz];

    this.addQuad(pt(hx, -iy, -iz), pt(hx, iy, -iz), pt(hx, iy, iz), pt(hx, -iy, iz), [1, 0, 0], opts);
    this.addQuad(pt(-hx, -iy, iz), pt(-hx, iy, iz), pt(-hx, iy, -iz), pt(-hx, -iy, -iz), [-1, 0, 0], opts);
    this.addQuad(pt(-ix, hy, -iz), pt(-ix, hy, iz), pt(ix, hy, iz), pt(ix, hy, -iz), [0, 1, 0], opts);
    this.addQuad(pt(-ix, -hy, iz), pt(-ix, -hy, -iz), pt(ix, -hy, -iz), pt(ix, -hy, iz), [0, -1, 0], opts);
    this.addQuad(pt(-ix, -iy, hz), pt(ix, -iy, hz), pt(ix, iy, hz), pt(-ix, iy, hz), [0, 0, 1], opts);
    this.addQuad(pt(ix, -iy, -hz), pt(-ix, -iy, -hz), pt(-ix, iy, -hz), pt(ix, iy, -hz), [0, 0, -1], opts);

    for (const sySign of [-1, 1]) {
      for (const szSign of [-1, 1]) {
        this.addQuad(
          pt(-ix, sySign * hy, szSign * iz),
          pt(ix, sySign * hy, szSign * iz),
          pt(ix, sySign * iy, szSign * hz),
          pt(-ix, sySign * iy, szSign * hz),
          [0, sySign, szSign],
          opts
        );
      }
    }
    for (const sxSign of [-1, 1]) {
      for (const szSign of [-1, 1]) {
        this.addQuad(
          pt(sxSign * hx, -iy, szSign * iz),
          pt(sxSign * hx, iy, szSign * iz),
          pt(sxSign * ix, iy, szSign * hz),
          pt(sxSign * ix, -iy, szSign * hz),
          [sxSign, 0, szSign],
          opts
        );
      }
    }
    for (const sxSign of [-1, 1]) {
      for (const sySign of [-1, 1]) {
        this.addQuad(
          pt(sxSign * hx, sySign * iy, -iz),
          pt(sxSign * hx, sySign * iy, iz),
          pt(sxSign * ix, sySign * hy, iz),
          pt(sxSign * ix, sySign * hy, -iz),
          [sxSign, sySign, 0],
          opts
        );
      }
    }
    for (const sxSign of [-1, 1]) {
      for (const sySign of [-1, 1]) {
        for (const szSign of [-1, 1]) {
          this.addTri(
            pt(sxSign * hx, sySign * iy, szSign * iz),
            pt(sxSign * ix, sySign * hy, szSign * iz),
            pt(sxSign * ix, sySign * iy, szSign * hz),
            [sxSign, sySign, szSign],
            opts
          );
        }
      }
    }
  }

  addBoxBounds(x0, x1, y0, y1, z0, z1, bevel = 0.025, opts = {}) {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    if (sx <= 1e-4 || sy <= 1e-4 || sz <= 1e-4) return;
    this.addChamferBox((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5, sx, sy, sz, bevel, opts);
  }

  addCylinderY(cx, y0, y1, cz, rBot, rTop, segs = 24, opts = {}) {
    const cBot = [cx, y0, cz];
    const cTop = [cx, y1, cz];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const p0 = [cx + Math.cos(a0) * rBot, y0, cz + Math.sin(a0) * rBot];
      const p1 = [cx + Math.cos(a1) * rBot, y0, cz + Math.sin(a1) * rBot];
      const q0 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
      const q1 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
      this.addQuad(p0, q0, q1, p1, [Math.cos(am), 0, Math.sin(am)], opts);
      this.addTri(cTop, q0, q1, [0, 1, 0], opts);
      this.addTri(cBot, p1, p0, [0, -1, 0], opts);
    }
  }

  addCylinderX(x0, x1, cy, cz, rBack, rFront, segs = 28, opts = {}) {
    const cBack = [x0, cy, cz];
    const cFront = [x1, cy, cz];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const p0 = [x0, cy + Math.sin(a0) * rBack, cz + Math.cos(a0) * rBack];
      const p1 = [x0, cy + Math.sin(a1) * rBack, cz + Math.cos(a1) * rBack];
      const q0 = [x1, cy + Math.sin(a0) * rFront, cz + Math.cos(a0) * rFront];
      const q1 = [x1, cy + Math.sin(a1) * rFront, cz + Math.cos(a1) * rFront];
      this.addQuad(p0, q0, q1, p1, [0, Math.sin(am), Math.cos(am)], opts);
      this.addTri(cFront, q0, q1, [1, 0, 0], opts);
      this.addTri(cBack, p1, p0, [-1, 0, 0], opts);
    }
  }

  // Sculpted organic pillowed 3D moss cushion with non-coplanar buried underside (ZERO FLUSH_FACES!)
  addMossPillow(cx, cy, cz, rx, ry, rz, rng, opts = {}) {
    const uSeg = opts.uSeg ?? 10;
    const vSeg = opts.vSeg ?? 4;
    const p1 = rng.range(0, Math.PI * 2);
    const p2 = rng.range(0, Math.PI * 2);
    const p3 = rng.range(0, Math.PI * 2);
    const drapeX = opts.drapeX ?? 0;
    const drapeZ = opts.drapeZ ?? 0;
    const clamp = opts.clamp ?? null;

    // Slight vertical jitter + sloped conical buried base ensures no two pillows share a bottom plane
    const yBase = cy + rng.range(-0.008, 0.008);
    const buryRim = rng.range(0.014, 0.032);
    const buryCenter = buryRim + rng.range(0.015, 0.035);

    // Gently shrink radii if needed instead of flattening vertices onto a clamp boundary plane!
    let effRx = rx;
    let effRz = rz;
    let effRy = ry;
    if (clamp) {
      const maxRx = Math.max(0.05, Math.min(cx - clamp.x0, clamp.x1 - cx) / 1.32);
      const maxRz = Math.max(0.05, Math.min(cz - clamp.z0, clamp.z1 - cz) / 1.32);
      const maxRy = Math.max(0.03, (clamp.y1 - yBase) / 1.15);
      effRx = Math.min(rx, maxRx);
      effRz = Math.min(rz, maxRz);
      effRy = Math.min(ry, maxRy);
    }

    const evalPt = (theta, phi, isRim) => {
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const lobe = 1.0 + 0.16 * Math.sin(2 * theta + p1) + 0.10 * Math.cos(3 * theta + p2) + 0.06 * Math.sin(5 * theta + p3);
      const lx = Math.cos(theta) * sinP * effRx * lobe;
      const lz = Math.sin(theta) * sinP * effRz * lobe;
      const tuft = 1.0 + 0.14 * Math.sin(lx * 9.5 + p1) * Math.cos(lz * 9.5 + p2);
      let ly = isRim ? (-buryRim - 0.006 * Math.sin(theta * 3 + p2)) : (cosP * effRy * tuft);
      if (!isRim || drapeX !== 0 || drapeZ !== 0) {
        let drop = 0;
        if (drapeX > 0 && lx > effRx * 0.25) {
          drop += Math.min(1, (lx - effRx * 0.25) / (effRx * 0.75)) * drapeX * sinP;
        } else if (drapeX < 0 && lx < -effRx * 0.25) {
          drop += Math.min(1, (-lx - effRx * 0.25) / (effRx * 0.75)) * (-drapeX) * sinP;
        }
        if (drapeZ > 0 && lz > effRz * 0.25) {
          drop += Math.min(1, (lz - effRz * 0.25) / (effRz * 0.75)) * drapeZ * sinP;
        } else if (drapeZ < 0 && lz < -effRz * 0.25) {
          drop += Math.min(1, (-lz - effRz * 0.25) / (effRz * 0.75)) * (-drapeZ) * sinP;
        }
        const maxDrape = Math.max(Math.abs(drapeX), Math.abs(drapeZ));
        ly -= Math.min(drop, maxDrape);
      }
      return [cx + lx, yBase + ly, cz + lz];
    };

    const topPt = evalPt(0, 0, false);
    const botPt = [cx, yBase - buryCenter, cz];
    const rings = [];
    for (let j = 1; j <= vSeg; j++) {
      const isRim = j === vSeg;
      const phi = (j / vSeg) * (Math.PI * 0.5);
      const ring = [];
      for (let i = 0; i < uSeg; i++) {
        const theta = (i / uSeg) * Math.PI * 2;
        ring.push(evalPt(theta, phi, isRim));
      }
      rings.push(ring);
    }

    const uvOpts = { uvScale: 0.75, ox: rng.range(0, 1), oy: rng.range(0, 1) };
    const center = [cx, yBase - 0.015, cz];
    for (let i = 0; i < uSeg; i++) {
      const i1 = (i + 1) % uSeg;
      this.addTri(topPt, rings[0][i1], rings[0][i], [0, 1, 0], uvOpts);
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < uSeg; i++) {
        const i1 = (i + 1) % uSeg;
        const a = rings[j][i], b = rings[j][i1], c = rings[j + 1][i1], d = rings[j + 1][i];
        const mid = [
          (a[0] + b[0] + c[0] + d[0]) * 0.25 - center[0],
          (a[1] + b[1] + c[1] + d[1]) * 0.25 - center[1],
          (a[2] + b[2] + c[2] + d[2]) * 0.25 - center[2],
        ];
        this.addQuad(a, b, c, d, mid, uvOpts);
      }
    }
    const lastRing = rings[rings.length - 1];
    for (let i = 0; i < uSeg; i++) {
      const i1 = (i + 1) % uSeg;
      this.addTri(botPt, lastRing[i], lastRing[i1], [0, -1, 0], uvOpts);
    }
  }

  buildPart(parent) {
    const geo = meshGeo({
      positions: this.pos,
      normals: this.nrm,
      uvs: this.uv,
      indices: this.idx,
    });
    return createPart(this.name, geo, this.material, { parent });
  }
}

// Helper: Mayan stepped-fret / greca carved relief band (crisp 12-tri bars for economical triangle count!)
function addMayanFretStrip(reliefBatch, stoneBatch, face, coord, u0, u1, v0, v1, depth, count, rng) {
  const dir = (face === '+X' || face === '+Z') ? 1 : -1;
  const spanU = u1 - u0;
  const spanV = v1 - v0;
  const cellW = spanU / count;
  const frameT = Math.min(0.036, spanV * 0.14);

  const emitBox = (batch, au0, au1, av0, av1, d0, d1, bevel = 0) => {
    const c0 = coord + dir * Math.min(d0, d1);
    const c1 = coord + dir * Math.max(d0, d1);
    const x0 = Math.min(c0, c1), x1 = Math.max(c0, c1);
    const opts = { ox: rng.range(0, 1), oy: rng.range(0, 1), uvScale: 1.6 };
    if (face === '+X' || face === '-X') {
      batch.addBoxBounds(x0, x1, av0, av1, au0, au1, bevel, opts);
    } else {
      batch.addBoxBounds(au0, au1, av0, av1, x0, x1, bevel, opts);
    }
  };

  // Recessed shadowed backing panel (embedded 12 mm into host wall -> zero gap & zero FLUSH_FACES!)
  emitBox(reliefBatch, u0, u1, v0, v1, -0.012, 0.032, 0);

  // Outer carved stone border rails (chamfered top/bottom rails proud of backing)
  emitBox(stoneBatch, u0 - 0.012, u1 + 0.012, v0, v0 + frameT, 0.032, depth, 0.008);
  emitBox(stoneBatch, u0 - 0.012, u1 + 0.012, v1 - frameT, v1, 0.032, depth, 0.008);

  const innerV0 = v0 + frameT + 0.016;
  const innerV1 = v1 - frameT - 0.016;
  const innerH = innerV1 - innerV0;
  if (innerH <= 0.04) return;

  for (let i = 0; i < count; i++) {
    const cu0 = u0 + i * cellW + 0.022;
    const cu1 = u0 + (i + 1) * cellW - 0.022;
    const cw = cu1 - cu0;
    const midU = (cu0 + cu1) * 0.5;
    const midV = (innerV0 + innerV1) * 0.5;
    const dFront = depth - 0.007;

    if (i % 2 === 0) {
      // Stepped-T Mayan pyramid glyph
      emitBox(stoneBatch, cu0 + cw * 0.08, cu1 - cw * 0.08, innerV0, innerV0 + innerH * 0.34, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.24, cu1 - cw * 0.24, innerV0 + innerH * 0.34, innerV0 + innerH * 0.68, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.38, cu1 - cw * 0.38, innerV0 + innerH * 0.68, innerV1, 0.032, dFront, 0);
    } else {
      // Interlocking Mayan C-scroll / square glyph cartouche
      const bar = Math.min(cw * 0.22, innerH * 0.22);
      emitBox(stoneBatch, cu0 + cw * 0.08, cu1 - cw * 0.08, innerV1 - bar, innerV1, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.08, cu0 + cw * 0.08 + bar, innerV0, innerV1 - bar, 0.032, dFront, 0);
      emitBox(stoneBatch, cu1 - cw * 0.08 - bar, cu1 - cw * 0.08, innerV0 + innerH * 0.28, innerV1 - bar, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.08 + bar, cu1 - cw * 0.08, innerV0, innerV0 + bar, 0.032, dFront, 0);
      emitBox(stoneBatch, midU - bar * 0.55, midU + bar * 0.55, midV - bar * 0.55, midV + bar * 0.55, 0.032, dFront + 0.012, 0);
    }
  }
}

// Helper: Vertical stack of crisp square Mayan glyph cartouche plaques on pilasters/piers
function addGlyphStack(reliefBatch, stoneBatch, face, coord, u0, u1, v0, v1, depth, rows, rng) {
  const dir = (face === '+X' || face === '+Z') ? 1 : -1;
  const totalH = v1 - v0;
  const gap = 0.055;
  const cellH = (totalH - gap * (rows - 1)) / rows;

  const emitBox = (batch, au0, au1, av0, av1, d0, d1, bevel = 0) => {
    const c0 = coord + dir * Math.min(d0, d1);
    const c1 = coord + dir * Math.max(d0, d1);
    const x0 = Math.min(c0, c1), x1 = Math.max(c0, c1);
    const opts = { ox: rng.range(0, 1), oy: rng.range(0, 1), uvScale: 1.5 };
    if (face === '+X' || face === '-X') {
      batch.addBoxBounds(x0, x1, av0, av1, au0, au1, bevel, opts);
    } else {
      batch.addBoxBounds(au0, au1, av0, av1, x0, x1, bevel, opts);
    }
  };

  for (let r = 0; r < rows; r++) {
    const cv0 = v0 + r * (cellH + gap);
    const cv1 = cv0 + cellH;
    const cw = u1 - u0;
    const ch = cv1 - cv0;
    const bT = Math.min(0.034, cw * 0.12, ch * 0.12);

    // Shadowed square recess backing (embedded 12 mm into host wall -> zero gap & zero FLUSH_FACES!)
    emitBox(reliefBatch, u0, u1, cv0, cv1, -0.012, 0.032, 0);

    // Raised square limestone frame around each glyph plaque (non-overlapping top/bot + side bars)
    emitBox(stoneBatch, u0, u1, cv1 - bT, cv1, 0.032, depth, 0.006);
    emitBox(stoneBatch, u0, u1, cv0, cv0 + bT, 0.032, depth, 0.006);
    emitBox(stoneBatch, u0, u0 + bT, cv0 + bT, cv1 - bT, 0.032, depth - 0.004, 0);
    emitBox(stoneBatch, u1 - bT, u1, cv0 + bT, cv1 - bT, 0.032, depth - 0.004, 0);

    // Inner Mayan geometric glyph motif (alternating stepped cross, double bar-dot, spiral key)
    const iu0 = u0 + bT + 0.025, iu1 = u1 - bT - 0.025;
    const iv0 = cv0 + bT + 0.025, iv1 = cv1 - bT - 0.025;
    const iw = iu1 - iu0, ih = iv1 - iv0;
    const mu = (iu0 + iu1) * 0.5, mv = (iv0 + iv1) * 0.5;
    const df = depth - 0.009;
    if (iw <= 0.04 || ih <= 0.04) continue;

    if (r % 3 === 0) {
      // Mayan Kin (Sun-cross) glyph
      emitBox(stoneBatch, iu0, iu1, mv - ih * 0.16, mv + ih * 0.16, 0.032, df, 0);
      emitBox(stoneBatch, mu - iw * 0.16, mu + iw * 0.16, mv + ih * 0.16, iv1, 0.032, df, 0);
      emitBox(stoneBatch, mu - iw * 0.16, mu + iw * 0.16, iv0, mv - ih * 0.16, 0.032, df, 0);
      emitBox(stoneBatch, mu - iw * 0.22, mu + iw * 0.22, mv - ih * 0.22, mv + ih * 0.22, 0.032, df + 0.014, 0);
    } else if (r % 3 === 1) {
      // Stepped Mayan temple & twin corner dots
      emitBox(stoneBatch, iu0, iu1, iv0, iv0 + ih * 0.30, 0.032, df, 0);
      emitBox(stoneBatch, iu0 + iw * 0.18, iu1 - iw * 0.18, iv0 + ih * 0.30, iv0 + ih * 0.62, 0.032, df, 0);
      emitBox(stoneBatch, mu - iw * 0.18, mu + iw * 0.18, iv0 + ih * 0.62, iv1, 0.032, df, 0);
      emitBox(stoneBatch, iu0, iu0 + iw * 0.20, iv1 - ih * 0.24, iv1, 0.032, df + 0.008, 0);
      emitBox(stoneBatch, iu1 - iw * 0.20, iu1, iv1 - ih * 0.24, iv1, 0.032, df + 0.008, 0);
    } else {
      // Interlocking twin-bar Mayan numeral & glyph frame
      emitBox(stoneBatch, iu0, iu1, iv1 - ih * 0.22, iv1, 0.032, df, 0);
      emitBox(stoneBatch, iu0, iu1, iv0, iv0 + ih * 0.22, 0.032, df, 0);
      emitBox(stoneBatch, iu0 + iw * 0.10, iu0 + iw * 0.34, iv0 + ih * 0.34, iv1 - ih * 0.34, 0.032, df + 0.01, 0);
      emitBox(stoneBatch, iu1 - iw * 0.34, iu1 - iw * 0.10, iv0 + ih * 0.34, iv1 - ih * 0.34, 0.032, df + 0.01, 0);
    }
  }
}

// Helper: Coursed ashlar wall segment
function addAshlarWall(batch, x0, x1, y0, y1, z0, z1, rows, cols, rng, opts = {}) {
  const axisAlong = (x1 - x0) >= (z1 - z0) ? 'x' : 'z';
  const rowH = (y1 - y0) / rows;
  const gap = opts.gap ?? 0.012;
  const bevel = opts.bevel ?? 0.020;
  const stagger = opts.stagger ?? true;

  for (let r = 0; r < rows; r++) {
    const ry0 = y0 + r * rowH + (r === 0 ? 0 : gap * 0.5);
    const ry1 = y0 + (r + 1) * rowH - (r === rows - 1 ? 0 : gap * 0.5);
    const offset = (stagger && r % 2 === 1) ? 0.5 : 0;
    const span = axisAlong === 'x' ? (x1 - x0) : (z1 - z0);
    const colW = span / cols;

    const splits = [0];
    for (let c = 0; c < cols; c++) {
      const u = (c + offset) * colW;
      if (u > 0.18 && u < span - 0.18) splits.push(u);
    }
    splits.push(span);

    for (let i = 0; i < splits.length - 1; i++) {
      const s0 = splits[i] + (i === 0 ? 0 : gap * 0.5);
      const s1 = splits[i + 1] - (i === splits.length - 2 ? 0 : gap * 0.5);
      if (s1 - s0 < 0.05) continue;
      const uvOpts = { ox: rng.range(0, 1), oy: rng.range(0, 1), uvScale: 2.3 };
      if (axisAlong === 'x') {
        batch.addBoxBounds(x0 + s0, x0 + s1, ry0, ry1, z0, z1, bevel, uvOpts);
      } else {
        batch.addBoxBounds(x0, x1, ry0, ry1, z0 + s0, z0 + s1, bevel, uvOpts);
      }
    }
  }
}

// Hero 3D Sculpted Radial Sunburst Medallion (1.85 m diameter, 0.25 m relief depth)
function buildSunburstMedallion(sunBatch, reliefBatch, xBack, cy, cz, rng) {
  // Deeply shadowed carved limestone recess backing (embedded 12 mm into X=2.46 shrine wall -> zero gap!)
  const xEmbed = xBack - 0.042;
  reliefBatch.addBoxBounds(xEmbed, xBack, cy - 0.96, cy + 0.96, cz - 0.96, cz + 0.96, 0, { uvScale: 1.4 });

  // Sculpted mitered stone surround frame (embedded cleanly to shrine wall, non-overlapping top/bottom/side moldings)
  const frameOuter = 1.14;
  const frameInner = 0.96;
  const xFrameFront = xBack + 0.18;
  sunBatch.addBoxBounds(xEmbed, xFrameFront, cy + frameInner, cy + frameOuter, cz - frameOuter, cz + frameOuter, 0.025, { uvScale: 1.8 });
  sunBatch.addBoxBounds(xEmbed, xFrameFront, cy - frameOuter, cy - frameInner, cz - frameOuter, cz + frameOuter, 0.025, { uvScale: 1.8 });
  sunBatch.addBoxBounds(xEmbed, xFrameFront - 0.015, cy - frameInner, cy + frameInner, cz + frameInner, cz + frameOuter, 0.022, { uvScale: 1.8 });
  sunBatch.addBoxBounds(xEmbed, xFrameFront - 0.015, cy - frameInner, cy + frameInner, cz - frameOuter, cz - frameInner, 0.022, { uvScale: 1.8 });

  // Corner carved solar rosettes inside the 4 square niche corners
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rcy = cy + sy * 0.80;
      const rcz = cz + sz * 0.80;
      sunBatch.addCylinderX(xBack, xBack + 0.10, rcy, rcz, 0.125, 0.095, 12, { uvScale: 1.4 });
      sunBatch.addCylinderX(xBack + 0.10, xBack + 0.145, rcy, rcz, 0.062, 0.04, 10, { uvScale: 1.4 });
    }
  }

  // Outer carved circular medallion bezel ring (diameter = 1.85 m -> rOuter = 0.925 m)
  const segs = 32;
  const rOuter = 0.925;
  const rInner = 0.82;
  const xRimMid = xBack + 0.115;
  const xRimPeak = xBack + 0.16;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const cm = Math.cos(am), sm = Math.sin(am);
    const rMidIn = rInner + 0.024;
    const rMidOut = rOuter - 0.024;

    const pOutB0 = [xBack, cy + s0 * rOuter, cz + c0 * rOuter];
    const pOutB1 = [xBack, cy + s1 * rOuter, cz + c1 * rOuter];
    const pOutM0 = [xRimMid, cy + s0 * rOuter, cz + c0 * rOuter];
    const pOutM1 = [xRimMid, cy + s1 * rOuter, cz + c1 * rOuter];
    const pPeakOut0 = [xRimPeak, cy + s0 * rMidOut, cz + c0 * rMidOut];
    const pPeakOut1 = [xRimPeak, cy + s1 * rMidOut, cz + c1 * rMidOut];
    const pPeakIn0 = [xRimPeak, cy + s0 * rMidIn, cz + c0 * rMidIn];
    const pPeakIn1 = [xRimPeak, cy + s1 * rMidIn, cz + c1 * rMidIn];
    const pInM0 = [xRimMid, cy + s0 * rInner, cz + c0 * rInner];
    const pInM1 = [xRimMid, cy + s1 * rInner, cz + c1 * rInner];
    const pInB0 = [xBack, cy + s0 * rInner, cz + c0 * rInner];
    const pInB1 = [xBack, cy + s1 * rInner, cz + c1 * rInner];

    const uo = { uvScale: 1.5 };
    sunBatch.addQuad(pOutB0, pOutM0, pOutM1, pOutB1, [0, sm, cm], uo);
    sunBatch.addQuad(pOutM0, pPeakOut0, pPeakOut1, pOutM1, [0.7, sm * 0.7, cm * 0.7], uo);
    sunBatch.addQuad(pPeakOut0, pPeakIn0, pPeakIn1, pPeakOut1, [1, 0, 0], uo);
    sunBatch.addQuad(pPeakIn0, pInM0, pInM1, pPeakIn1, [0.7, -sm * 0.7, -cm * 0.7], uo);
    sunBatch.addQuad(pInM0, pInB0, pInB1, pInM1, [0, -sm, -cm], uo);
  }

  // 16 Bold Sculpted 3D Faceted Sun Rays (alternating 8 primary spear-rays + 8 secondary rays)
  const rayCount = 16;
  for (let i = 0; i < rayCount; i++) {
    const isPrimary = i % 2 === 0;
    const theta = (i / rayCount) * Math.PI * 2;
    const halfAngle = isPrimary ? 0.155 : 0.11;
    const rBase = 0.36;
    const rTip = isPrimary ? 0.835 : 0.68;
    const xRidgeBase = xBack + (isPrimary ? 0.20 : 0.155);
    const xRidgeTip = xBack + (isPrimary ? 0.105 : 0.082);
    const xEdgeBase = xBack + 0.045;

    const ct = Math.cos(theta), st = Math.sin(theta);
    const cL = Math.cos(theta - halfAngle), sL = Math.sin(theta - halfAngle);
    const cR = Math.cos(theta + halfAngle), sR = Math.sin(theta + halfAngle);

    const pBaseL = [xEdgeBase, cy + sL * rBase, cz + cL * rBase];
    const pBaseR = [xEdgeBase, cy + sR * rBase, cz + cR * rBase];
    const pRidgeB = [xRidgeBase, cy + st * rBase, cz + ct * rBase];
    const pTip = [xRidgeTip, cy + st * rTip, cz + ct * rTip];
    const pTipBack = [xBack, cy + st * (rTip + 0.015), cz + ct * (rTip + 0.015)];
    const pBaseLB = [xBack, cy + sL * rBase, cz + cL * rBase];
    const pBaseRB = [xBack, cy + sR * rBase, cz + cR * rBase];

    const uo = { uvScale: 1.3, ox: rng.range(0, 1), oy: rng.range(0, 1) };
    sunBatch.addTri(pRidgeB, pTip, pBaseL, [0.7, -ct, st], uo);
    sunBatch.addTri(pRidgeB, pBaseR, pTip, [0.7, ct, -st], uo);
    sunBatch.addQuad(pBaseL, pTip, pTipBack, pBaseLB, [0.1, -ct, st], uo);
    sunBatch.addQuad(pBaseRB, pTipBack, pTip, pBaseR, [0.1, ct, -st], uo);
  }

  // Sculpted Central Sun Disc (exact 0.25 m total relief depth: xBack .. xBack + 0.25)
  sunBatch.addCylinderX(xBack, xBack + 0.145, cy, cz, 0.43, 0.395, 28, { uvScale: 1.4 });
  sunBatch.addCylinderX(xBack + 0.145, xBack + 0.195, cy, cz, 0.365, 0.325, 28, { uvScale: 1.4 });
  reliefBatch.addCylinderX(xBack + 0.19, xBack + 0.208, cy, cz, 0.295, 0.28, 24, { uvScale: 1.2 });
  sunBatch.addCylinderX(xBack + 0.202, xBack + 0.236, cy, cz, 0.25, 0.215, 24, { uvScale: 1.3 });
  sunBatch.addCylinderX(xBack + 0.236, xBack + 0.252, cy, cz, 0.175, 0.115, 20, { uvScale: 1.2 });

  // 8 carved solar perimeter beads on the central sun ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    sunBatch.addCylinderX(
      xBack + 0.19,
      xBack + 0.23,
      cy + Math.sin(a) * 0.335,
      cz + Math.cos(a) * 0.335,
      0.032,
      0.022,
      8,
      { uvScale: 1.0 }
    );
  }
}

// Interior Carved Circular Sun Altar / Offering Plinth (1.10 m diameter x 0.78 m tall at X=-1.6, Z=0)
function buildSunAltar(altarBatch, reliefBatch, cx, cz, rng) {
  altarBatch.addCylinderY(cx, 0.00, 0.10, cz, 0.55, 0.53, 24, { uvScale: 1.6 });
  altarBatch.addCylinderY(cx, 0.10, 0.18, cz, 0.50, 0.46, 24, { uvScale: 1.6 });

  reliefBatch.addCylinderY(cx, 0.18, 0.60, cz, 0.39, 0.39, 24, { uvScale: 1.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    altarBatch.addCylinderY(cx + Math.cos(a) * 0.40, 0.19, 0.59, cz + Math.sin(a) * 0.40, 0.055, 0.052, 8, { uvScale: 1.2 });
  }

  altarBatch.addCylinderY(cx, 0.60, 0.67, cz, 0.46, 0.54, 24, { uvScale: 1.5 });
  altarBatch.addCylinderY(cx, 0.67, 0.76, cz, 0.55, 0.53, 24, { uvScale: 1.5 });

  reliefBatch.addCylinderY(cx, 0.755, 0.766, cz, 0.445, 0.445, 24, { uvScale: 1.2 });
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const r0 = 0.445, r1 = 0.525;
    const p00 = [cx + Math.cos(a0) * r0, 0.76, cz + Math.sin(a0) * r0];
    const p01 = [cx + Math.cos(a1) * r0, 0.76, cz + Math.sin(a1) * r0];
    const p10 = [cx + Math.cos(a0) * r1, 0.76, cz + Math.sin(a0) * r1];
    const p11 = [cx + Math.cos(a1) * r1, 0.76, cz + Math.sin(a1) * r1];
    const q00 = [cx + Math.cos(a0) * r0, 0.78, cz + Math.sin(a0) * r0];
    const q01 = [cx + Math.cos(a1) * r0, 0.78, cz + Math.sin(a1) * r0];
    const q10 = [cx + Math.cos(a0) * r1, 0.78, cz + Math.sin(a0) * r1];
    const q11 = [cx + Math.cos(a1) * r1, 0.78, cz + Math.sin(a1) * r1];
    altarBatch.addQuad(q00, q10, q11, q01, [0, 1, 0], { uvScale: 1.2 });
    altarBatch.addQuad(p10, q10, q11, p11, [Math.cos(am), 0, Math.sin(am)], { uvScale: 1.2 });
    altarBatch.addQuad(p01, q01, q00, p00, [-Math.cos(am), 0, -Math.sin(am)], { uvScale: 1.2 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const da = 0.12;
    const rIn = 0.16;
    const rOut = (i % 2 === 0) ? 0.415 : 0.335;
    const pL = [cx + Math.cos(a - da) * rIn, 0.766, cz + Math.sin(a - da) * rIn];
    const pR = [cx + Math.cos(a + da) * rIn, 0.766, cz + Math.sin(a + da) * rIn];
    const pMid = [cx + Math.cos(a) * rIn, 0.78, cz + Math.sin(a) * rIn];
    const pTip = [cx + Math.cos(a) * rOut, 0.774, cz + Math.sin(a) * rOut];
    altarBatch.addTri(pMid, pTip, pL, [0, 1, 0], { uvScale: 1.0, ox: rng.range(0, 1) });
    altarBatch.addTri(pMid, pR, pTip, [0, 1, 0], { uvScale: 1.0, ox: rng.range(0, 1) });
  }
  altarBatch.addCylinderY(cx, 0.76, 0.78, cz, 0.16, 0.13, 20, { uvScale: 1.2 });
}

function build() {
  const root = createRoot('SanctuaryPortal');
  const rng = seededRandom('lagoon-sanctuary-portal-v2');
  const mats = createSanctuaryMaterials();

  // 6 semantic mesh batches -> 4 distinct materials, 6 draw slots (<= 8 target!)
  const masonry = new GeoBatch('Sanctuary_Masonry', mats.paleLimestone, 2.3);
  const relief = new GeoBatch('Sanctuary_Relief', mats.carvedRelief, 1.8);
  const sunburst = new GeoBatch('Sanctuary_Sunburst', mats.paleLimestone, 1.5);
  const altar = new GeoBatch('Sanctuary_Altar', mats.paleLimestone, 1.5);
  const dampBase = new GeoBatch('Sanctuary_DampBase', mats.dampMasonry, 2.2);
  const moss = new GeoBatch('Sanctuary_Moss', mats.velvetyMoss, 0.85);

  const clampPortal = { x0: -3.095, x1: 3.095, y0: -0.60, y1: 8.595, z0: -3.395, z1: 3.395 };

  // =========================================================================
  // 1. PLINTH FOUNDATION & WEATHERED FLAGSTONE FLOOR (Y in [-0.60, 0.00])
  // =========================================================================
  dampBase.addBoxBounds(-3.10, 3.10, -0.60, -0.18, -3.40, 3.40, 0.03, { uvScale: 2.4 });
  dampBase.addBoxBounds(-3.06, 3.06, -0.18, -0.036, -3.36, 3.36, 0.024, { uvScale: 2.3 });
  relief.addBoxBounds(-3.02, 3.02, -0.036, -0.022, -3.32, 3.32, 0, { uvScale: 2.0 });

  // Coursed beveled flagstone paving slab flush at Y = 0.00 m (6 x 7 large weathered flagstones)
  const flagRng = rng.fork('flagstones');
  const nxFlags = 6, nzFlags = 7;
  const dxF = 6.20 / nxFlags, dzF = 6.80 / nzFlags;
  const fGap = 0.018;
  for (let ix = 0; ix < nxFlags; ix++) {
    const x0 = -3.10 + ix * dxF + (ix === 0 ? 0 : fGap * 0.5);
    const x1 = -3.10 + (ix + 1) * dxF - (ix === nxFlags - 1 ? 0 : fGap * 0.5);
    const zShift = (ix % 2 === 1) ? dzF * 0.45 : 0;
    const zSplits = [-3.40];
    for (let iz = 0; iz < nzFlags; iz++) {
      const zv = -3.40 + iz * dzF + zShift;
      if (zv > -3.10 && zv < 3.10) zSplits.push(zv);
    }
    zSplits.push(3.40);
    for (let j = 0; j < zSplits.length - 1; j++) {
      const z0 = zSplits[j] + (j === 0 ? 0 : fGap * 0.5);
      const z1 = zSplits[j + 1] - (j === zSplits.length - 2 ? 0 : fGap * 0.5);
      masonry.addBoxBounds(x0, x1, -0.034, 0.00, z0, z1, 0.012, {
        ox: flagRng.range(0, 1),
        oy: flagRng.range(0, 1),
        uvScale: 2.1,
      });
    }
  }

  // =========================================================================
  // 2. LOWER TEMPLE WALLS, CORNER PIERS & OPENINGS (Y in [0.00, 3.70])
  // Interior sanctum: X in [-2.30, +2.30] (4.60 m), Z in [-2.52, +2.52] (5.04 m)
  // Front doorway (+X): Z in [-1.30, +1.30] (2.60 m) x Y in [0.00, +3.70]
  // Rear archway (-X):  Z in [-1.10, +1.10] (2.20 m) x Y in [0.30, +3.60]
  // Side passages (+Z/-Z): X in [-1.10, +1.10] (2.20 m) x Y in [0.00, +3.00]
  // =========================================================================
  const wallRng = rng.fork('walls');

  // Damp lower wall base trim around exterior masonry piers (non-overlapping corner layout!)
  for (const sz of [-1, 1]) {
    const fZ0 = sz > 0 ? 1.32 : -3.14;
    const fZ1 = sz > 0 ? 3.14 : -1.32;
    dampBase.addBoxBounds(2.26, 2.94, 0.00, 0.36, fZ0, fZ1, 0.02, { uvScale: 2.0 });

    const rZ0 = sz > 0 ? 1.12 : -3.14;
    const rZ1 = sz > 0 ? 3.14 : -1.12;
    dampBase.addBoxBounds(-2.94, -2.26, 0.00, 0.36, rZ0, rZ1, 0.02, { uvScale: 2.0 });

    const sZ0 = sz > 0 ? 2.50 : -3.14;
    const sZ1 = sz > 0 ? 3.14 : -2.50;
    dampBase.addBoxBounds(1.12, 2.26, 0.00, 0.36, sZ0, sZ1, 0.02, { uvScale: 2.0 });
    dampBase.addBoxBounds(-2.26, -1.12, 0.00, 0.36, sZ0, sZ1, 0.02, { uvScale: 2.0 });
  }

  // --- FRONT WALL MASSIVE FLANKING PIERS (+X: X in [2.30, 2.88], Y in [0.36, 3.70]) ---
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 1.30 : -3.10;
    const z1 = sz > 0 ? 3.10 : -1.30;
    addAshlarWall(masonry, 2.30, 2.88, 0.36, 3.70, z0, z1, 7, 3, wallRng, { bevel: 0.02 });

    // Sculpted doorway inner jamb pilaster (X in [2.88, 2.99], Z in [+-1.32, +-1.88])
    const jz0 = sz > 0 ? 1.32 : -1.88;
    const jz1 = sz > 0 ? 1.88 : -1.32;
    masonry.addBoxBounds(2.88, 3.01, 0.36, 0.56, jz0 - 0.02, jz1 + 0.02, 0.018, { uvScale: 1.9 });
    masonry.addBoxBounds(2.88, 2.98, 0.56, 3.44, jz0, jz1, 0.018, { uvScale: 1.9 });
    masonry.addBoxBounds(2.88, 3.04, 3.44, 3.57, jz0 - 0.03, jz1 + 0.03, 0.016, { uvScale: 1.8 });
    masonry.addBoxBounds(2.88, 3.08, 3.57, 3.70, jz0 - 0.05, jz1 + 0.05, 0.016, { uvScale: 1.8 });

    // 4 stacked square Mayan glyph plaques on doorway jamb pilaster
    const gZ0 = sz > 0 ? 1.38 : -1.82;
    const gZ1 = sz > 0 ? 1.82 : -1.38;
    addGlyphStack(relief, masonry, '+X', 2.98, gZ0, gZ1, 0.68, 3.32, 0.068, 4, wallRng);

    // Outer flanking front corner pier: 4 crisp stacked Mayan glyph panels + lower/upper fret bands
    const oz0 = sz > 0 ? 1.98 : -2.92;
    const oz1 = sz > 0 ? 2.92 : -1.98;
    addMayanFretStrip(relief, masonry, '+X', 2.88, oz0, oz1, 0.66, 1.14, 0.092, 2, wallRng);
    addGlyphStack(relief, masonry, '+X', 2.88, oz0 + 0.04, oz1 - 0.04, 1.24, 2.82, 0.092, 2, wallRng);
    addMayanFretStrip(relief, masonry, '+X', 2.88, oz0, oz1, 2.92, 3.40, 0.092, 2, wallRng);
  }

  // --- REAR WALL & OPEN SUNLIT SANCTUARY ARCHWAY (-X: X in [-2.88, -2.30]) ---
  dampBase.addBoxBounds(-2.90, -2.30, 0.00, 0.16, -1.12, 1.12, 0.018, { uvScale: 2.0 });
  masonry.addBoxBounds(-2.92, -2.28, 0.16, 0.30, -1.12, 1.12, 0.02, { uvScale: 2.0 });
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 1.10 : -3.10;
    const z1 = sz > 0 ? 3.10 : -1.10;
    addAshlarWall(masonry, -2.88, -2.30, 0.36, 3.70, z0, z1, 7, 3, wallRng, { bevel: 0.02 });
    const jz0 = sz > 0 ? 1.12 : -1.66;
    const jz1 = sz > 0 ? 1.66 : -1.12;
    masonry.addBoxBounds(-2.98, -2.88, 0.36, 3.55, jz0, jz1, 0.016, { uvScale: 2.0 });
    const oz0 = sz > 0 ? 1.78 : -2.88;
    const oz1 = sz > 0 ? 2.88 : -1.78;
    addGlyphStack(relief, masonry, '-X', -2.88, oz0, oz1, 0.90, 3.20, 0.088, 3, wallRng);
  }
  masonry.addBoxBounds(-2.92, -2.28, 3.60, 3.70, -1.25, 1.25, 0.016, { uvScale: 2.0 });

  // --- SIDE WALLS WITH WIDE COLONNADED PASSAGES (+Z and -Z: Z in [+-2.52, +-3.10]) ---
  for (const sz of [-1, 1]) {
    const zIn = sz > 0 ? 2.52 : -3.10;
    const zOut = sz > 0 ? 3.10 : -2.52;
    const face = sz > 0 ? '+Z' : '-Z';
    const outerZ = sz > 0 ? 3.10 : -3.10;

    // Clean non-overlapping piers running strictly between front/rear walls (X in [1.10, 2.30] and [-2.30, -1.10])
    addAshlarWall(masonry, 1.10, 2.30, 0.36, 3.70, zIn, zOut, 7, 2, wallRng, { bevel: 0.02 });
    addAshlarWall(masonry, -2.30, -1.10, 0.36, 3.70, zIn, zOut, 7, 2, wallRng, { bevel: 0.02 });

    // Side passage jamb capitals (offset 15 mm from pier opening face -> zero FLUSH_FACES, keeps X[-1.10,1.10] clear!)
    for (const sx of [-1, 1]) {
      const px0 = sx > 0 ? 1.115 : -1.54;
      const px1 = sx > 0 ? 1.54 : -1.115;
      const jz0 = sz > 0 ? 2.46 : -3.17;
      const jz1 = sz > 0 ? 3.17 : -2.46;
      masonry.addBoxBounds(px0, px1, 2.82, 3.00, jz0, jz1, 0.016, { uvScale: 1.8 });
    }

    // Lintel & upper wall over side colonnade passage (Y = 3.00..3.70)
    masonry.addBoxBounds(-1.12, 1.12, 3.00, 3.24, sz > 0 ? 2.46 : -3.15, sz > 0 ? 3.15 : -2.46, 0.02, { uvScale: 2.0 });
    addAshlarWall(masonry, -1.10, 1.10, 3.24, 3.70, zIn, zOut, 2, 3, wallRng, { bevel: 0.018 });

    // Crisp stacked square Mayan glyphs on side piers
    addGlyphStack(relief, masonry, face, outerZ, 1.38, 2.60, 0.90, 3.15, 0.084, 3, wallRng);
    addGlyphStack(relief, masonry, face, outerZ, -2.60, -1.38, 0.90, 3.15, 0.084, 3, wallRng);
  }

  // Interior corner pilasters (stop cleanly at Y=3.46, capital stacked cleanly on top Y=3.46..3.70 -> zero flush faces!)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      masonry.addBoxBounds(
        sx > 0 ? 2.04 : -2.30,
        sx > 0 ? 2.30 : -2.04,
        0.00,
        3.46,
        sz > 0 ? 2.26 : -2.52,
        sz > 0 ? 2.52 : -2.26,
        0.02,
        { uvScale: 2.0 }
      );
      masonry.addBoxBounds(
        sx > 0 ? 1.94 : -2.30,
        sx > 0 ? 2.30 : -1.94,
        3.46,
        3.70,
        sz > 0 ? 2.16 : -2.52,
        sz > 0 ? 2.52 : -2.16,
        0.018,
        { uvScale: 1.8 }
      );
    }
  }

  // =========================================================================
  // 3. DOUBLE-LINTEL ARCHITRAVE, CARVED FRIEZE & CORBELLED OCULUS (Y in [3.70, 4.75])
  // Open-sky oculus in center: X in [-1.40, +1.40], Z in [-1.40, +1.40] (2.80 x 2.80 m!)
  // =========================================================================
  // Lower massive lintel / architrave ring (Y = 3.70..4.04) — clean non-overlapping perimeter segments
  masonry.addBoxBounds(2.08, 3.04, 3.70, 4.04, -3.22, 3.22, 0.028, { uvScale: 2.2 });
  masonry.addBoxBounds(-3.04, -2.08, 3.70, 4.04, -3.22, 3.22, 0.028, { uvScale: 2.2 });
  masonry.addBoxBounds(-2.08, 2.08, 3.70, 4.04, 2.28, 3.24, 0.028, { uvScale: 2.2 });
  masonry.addBoxBounds(-2.08, 2.08, 3.70, 4.04, -3.24, -2.28, 0.028, { uvScale: 2.2 });

  // Double-lintel projecting Mayan brow over front doorway (X starts cleanly at 3.04 -> zero overlap!)
  masonry.addBoxBounds(3.04, 3.10, 3.84, 4.04, -1.78, 1.78, 0.018, { uvScale: 1.9 });

  // Frieze core wall wrapping all 4 sides (Y = 4.04..4.46)
  masonry.addBoxBounds(1.78, 2.92, 4.04, 4.46, -3.12, 3.12, 0.02, { uvScale: 2.1 });
  masonry.addBoxBounds(-2.92, -1.78, 4.04, 4.46, -3.12, 3.12, 0.02, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.78, 1.78, 4.04, 4.46, 1.90, 3.12, 0.02, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.78, 1.78, 4.04, 4.46, -3.12, -1.90, 0.02, { uvScale: 2.1 });

  // Continuous 3D Carved Mayan Stepped-Fret Frieze wrapping ALL FOUR FACES (Y = 4.06..4.44)
  const friezeRng = rng.fork('frieze');
  addMayanFretStrip(relief, masonry, '+X', 2.92, -2.96, 2.96, 4.06, 4.44, 0.115, 10, friezeRng);
  addMayanFretStrip(relief, masonry, '-X', -2.92, -2.96, 2.96, 4.06, 4.44, 0.105, 10, friezeRng);
  addMayanFretStrip(relief, masonry, '+Z', 3.12, -2.76, 2.76, 4.06, 4.44, 0.105, 9, friezeRng);
  addMayanFretStrip(relief, masonry, '-Z', -3.12, -2.76, 2.76, 4.06, 4.44, 0.105, 9, friezeRng);

  // Projecting Stepped Upper Cornice Deck (Y = 4.46..4.75) framing exact 2.80 x 2.80 m open-sky oculus
  masonry.addBoxBounds(1.52, 3.02, 4.46, 4.58, -3.30, 3.30, 0.022, { uvScale: 2.1 });
  masonry.addBoxBounds(-3.02, -1.52, 4.46, 4.58, -3.30, 3.30, 0.022, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.52, 1.52, 4.46, 4.58, 1.58, 3.30, 0.022, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.52, 1.52, 4.46, 4.58, -3.30, -1.58, 0.022, { uvScale: 2.1 });

  masonry.addBoxBounds(1.40, 3.10, 4.58, 4.75, -3.40, 3.40, 0.026, { uvScale: 2.2 });
  masonry.addBoxBounds(-3.10, -1.40, 4.58, 4.75, -3.40, 3.40, 0.026, { uvScale: 2.2 });
  masonry.addBoxBounds(-1.40, 1.40, 4.58, 4.75, 1.40, 3.40, 0.026, { uvScale: 2.2 });
  masonry.addBoxBounds(-1.40, 1.40, 4.58, 4.75, -3.40, -1.40, 0.026, { uvScale: 2.2 });

  // Interior Stepped Corbelled Stone Ceiling Courses (non-overlapping inward steps framing the oculus!)
  const corbelSteps = [
    { y0: 3.72, y1: 3.98, ox: 1.90, oz: 2.08, outX: 2.08, outZ: 2.28 },
    { y0: 3.98, y1: 4.28, ox: 1.66, oz: 1.74, outX: 1.90, outZ: 2.08 },
    { y0: 4.28, y1: 4.58, ox: 1.40, oz: 1.40, outX: 1.66, outZ: 1.74 },
  ];
  for (const cs of corbelSteps) {
    masonry.addBoxBounds(cs.ox, cs.outX, cs.y0, cs.y1, -cs.outZ, cs.outZ, 0.018, { uvScale: 2.0 });
    masonry.addBoxBounds(-cs.outX, -cs.ox, cs.y0, cs.y1, -cs.outZ, cs.outZ, 0.018, { uvScale: 2.0 });
    masonry.addBoxBounds(-cs.ox, cs.ox, cs.y0, cs.y1, cs.oz, cs.outZ, 0.018, { uvScale: 2.0 });
    masonry.addBoxBounds(-cs.ox, cs.ox, cs.y0, cs.y1, -cs.outZ, -cs.oz, 0.018, { uvScale: 2.0 });
  }

  // =========================================================================
  // 4. UPPER STEPPED ROOF-COMB / ATTIC TOWER (Z in [-2.3, +2.3], X in [-1.4, +2.6], Y in [4.75, +8.6])
  // Keeps central 2.80 x 2.80 m oculus (X[-1.40, 1.40], Z[-1.40, 1.40]) 100% OPEN TO THE SKY!
  // =========================================================================
  const atticRng = rng.fork('attic');

  // --- Front Roof-Comb Tower Base Plinth (X in [1.42, 2.58], Z in [-2.30, +2.30], Y in [4.75, 5.26]) ---
  addAshlarWall(masonry, 1.42, 2.58, 4.75, 5.26, -2.30, 2.30, 2, 6, atticRng, { bevel: 0.02 });
  // Carved Mayan fretwork band right underneath the Sunburst Medallion!
  addMayanFretStrip(relief, masonry, '+X', 2.58, -1.98, 1.98, 4.82, 5.20, 0.095, 7, atticRng);

  // --- Side Stepped Attic Parapet / Buttress Walls flanking the open oculus (X in [-1.40, +1.42]) ---
  // Clean non-overlapping X tiers: [0.40, 1.42], [-0.55, 0.40], [-1.40, -0.55]
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 1.44 : -2.28;
    const z1 = sz > 0 ? 2.28 : -1.44;
    const face = sz > 0 ? '+Z' : '-Z';
    const zOuter = sz > 0 ? 2.28 : -2.28;

    // Front stepped shoulder beside roof-comb (Y = 4.75..6.86)
    addAshlarWall(masonry, 0.40, 1.42, 4.75, 6.86, z0, z1, 5, 2, atticRng, { bevel: 0.02 });
    masonry.addBoxBounds(0.40, 1.40, 6.86, 7.04, z0 - 0.03, z1 + 0.03, 0.02, { uvScale: 2.0 });

    // Mid stepped parapet wall (Y = 4.75..6.26)
    addAshlarWall(masonry, -0.55, 0.40, 4.75, 6.26, z0, z1, 4, 2, atticRng, { bevel: 0.02 });
    masonry.addBoxBounds(-0.55, 0.40, 6.26, 6.44, z0 - 0.03, z1 + 0.03, 0.02, { uvScale: 2.0 });

    // Rear stepped parapet wall (Y = 4.75..5.68)
    addAshlarWall(masonry, -1.40, -0.55, 4.75, 5.68, z0, z1, 3, 2, atticRng, { bevel: 0.02 });
    masonry.addBoxBounds(-1.40, -0.55, 5.68, 5.86, z0 - 0.03, z1 + 0.03, 0.02, { uvScale: 2.0 });

    // Carved side frieze panels along the attic parapet
    addMayanFretStrip(relief, masonry, face, zOuter, -1.20, 1.25, 5.06, 5.56, 0.075, 4, atticRng);
  }

  // Rear carved attic parapet framing rear edge of oculus (X in [-2.05, -1.42], Z in [-2.18, +2.18], Y = 4.75..5.86)
  addAshlarWall(masonry, -2.05, -1.42, 4.75, 5.68, -2.18, 2.18, 3, 6, atticRng, { bevel: 0.02 });
  masonry.addBoxBounds(-2.10, -1.42, 5.68, 5.86, -2.24, 2.24, 0.022, { uvScale: 2.0 });
  addMayanFretStrip(relief, masonry, '-X', -2.05, -1.85, 1.85, 5.04, 5.54, 0.08, 6, atticRng);
  // Subtle rear corner merlons balancing the silhouette
  for (const sz of [-1, 1]) {
    masonry.addBoxBounds(-1.98, -1.48, 5.86, 6.18, sz > 0 ? 1.48 : -2.06, sz > 0 ? 2.06 : -1.48, 0.018, { uvScale: 1.9 });
  }

  // --- Front Hero Attic Shrine Block (X in [1.44, 2.48], Y in [5.26, 7.62]) ---
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 1.32 : -2.24;
    const z1 = sz > 0 ? 2.24 : -1.32;
    addAshlarWall(masonry, 1.44, 2.48, 5.26, 6.86, z0, z1, 4, 2, atticRng, { bevel: 0.02 });
    const pz0 = sz > 0 ? 1.48 : -2.08;
    const pz1 = sz > 0 ? 2.08 : -1.48;
    addGlyphStack(relief, masonry, '+X', 2.48, pz0, pz1, 5.44, 6.66, 0.085, 2, atticRng);
    // Stepped wing cornice cap (cleanly starting at X = 1.40 so zero overlap with side buttress cap!)
    masonry.addBoxBounds(1.40, 2.58, 6.86, 7.06, sz > 0 ? 1.32 : -2.30, sz > 0 ? 2.30 : -1.32, 0.022, { uvScale: 2.0 });
    masonry.addBoxBounds(1.52, 2.44, 7.06, 7.48, sz > 0 ? 1.46 : -2.06, sz > 0 ? 2.06 : -1.46, 0.02, { uvScale: 2.0 });
  }

  // Central Monumental Shrine Core housing the Sunburst Medallion (Z in [-1.32, +1.32], X in [1.44, 2.46], Y in [5.26, 7.60])
  addAshlarWall(masonry, 1.44, 2.46, 5.26, 7.60, -1.32, 1.32, 6, 4, atticRng, { bevel: 0.02 });
  // Carved Mayan relief frieze & niche on the REAR (-X) face of the roof-comb so back/interior views shine!
  addMayanFretStrip(relief, masonry, '-X', 1.44, -1.10, 1.10, 6.10, 6.72, 0.085, 4, atticRng);
  addMayanFretStrip(relief, masonry, '-X', 1.44, -1.10, 1.10, 6.88, 7.40, 0.075, 4, atticRng);

  // Heavy projecting Attic Crown Cornice above the Sunburst (Y = 7.60..7.96)
  masonry.addBoxBounds(1.40, 2.60, 7.60, 7.76, -1.46, 1.46, 0.022, { uvScale: 2.0 });
  masonry.addBoxBounds(1.36, 2.68, 7.76, 7.96, -1.56, 1.56, 0.025, { uvScale: 2.1 });

  // --- CROWNING STEPPED MAYAN ROOF-COMB MERLONS / CRENELLATIONS (Y in [7.96, 8.60]) ---
  for (const sz of [-1, 1]) {
    const mz0 = sz > 0 ? 0.86 : -1.46;
    const mz1 = sz > 0 ? 1.46 : -0.86;
    masonry.addBoxBounds(1.52, 2.46, 7.96, 8.26, mz0, mz1, 0.02, { uvScale: 1.9 });
    const cz0 = sz > 0 ? 0.96 : -1.36;
    const cz1 = sz > 0 ? 1.36 : -0.96;
    masonry.addBoxBounds(1.62, 2.36, 8.26, 8.44, cz0, cz1, 0.018, { uvScale: 1.8 });
  }
  masonry.addBoxBounds(1.50, 2.50, 7.96, 8.28, -0.64, 0.64, 0.022, { uvScale: 1.9 });
  masonry.addBoxBounds(1.60, 2.40, 8.28, 8.52, -0.44, 0.44, 0.02, { uvScale: 1.8 });
  masonry.addBoxBounds(1.68, 2.32, 8.52, 8.60, -0.24, 0.24, 0.015, { uvScale: 1.7 });

  // =========================================================================
  // 5. HERO 3D SCULPTED RADIAL SUNBURST MEDALLION (Y = 6.35 m, diam 1.85 m, depth 0.25 m)
  // =========================================================================
  buildSunburstMedallion(sunburst, relief, 2.49, 6.35, 0.00, rng.fork('sunburst'));

  // =========================================================================
  // 6. INTERIOR CARVED CIRCULAR SUN ALTAR (X = -1.60, Z = 0.00, 1.10 m diam x 0.78 m tall)
  // =========================================================================
  buildSunAltar(altar, relief, -1.60, 0.00, rng.fork('altar'));

  // =========================================================================
  // 7. LUSH CONTINUOUS CLUSTERED VELVETY 3D MOSS CUSHIONS (ZERO FLUSH_FACES!)
  // =========================================================================
  const mossRng = rng.fork('moss');

  // Overlapping natural clusters (broad base cushions + smaller tufted pillows draping over edges)
  const addMossClusterRun = (x0, x1, y, z0, z1, count, sizeScale, drapeX, drapeZ) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + mossRng.range(-0.22, 0.22)) / count;
      const mx = x0 + (x1 - x0) * t + mossRng.range(-0.04, 0.04);
      const mz = z0 + (z1 - z0) * t + mossRng.range(-0.04, 0.04);
      const rx = mossRng.range(0.24, 0.42) * sizeScale;
      const rz = mossRng.range(0.24, 0.42) * sizeScale;
      const ry = mossRng.range(0.11, 0.21) * sizeScale;
      moss.addMossPillow(mx, y, mz, rx, ry, rz, mossRng, {
        drapeX,
        drapeZ,
        clamp: clampPortal,
      });
    }
  };

  // Front main upper cornice eaves (lush continuous mossy drapery flanking the roof-comb, clear of Y=4.58 underside!)
  addMossClusterRun(2.74, 2.74, 4.74, -3.14, -1.85, 7, 1.05, 0.075, 0);
  addMossClusterRun(2.74, 2.74, 4.74, 1.85, 3.14, 7, 1.05, 0.075, 0);
  addMossClusterRun(2.76, 2.76, 4.74, -1.62, -0.45, 5, 0.85, 0.07, 0);
  addMossClusterRun(2.76, 2.76, 4.74, 0.45, 1.62, 5, 0.85, 0.07, 0);

  // Side main upper cornice eaves (continuous mossy cornice caps!)
  addMossClusterRun(-2.78, 2.74, 4.74, 3.04, 3.04, 13, 1.02, 0, 0.075);
  addMossClusterRun(-2.78, 2.74, 4.74, -3.04, -3.04, 13, 1.02, 0, -0.075);

  // Rear main upper cornice eaves
  addMossClusterRun(-2.74, -2.74, 4.74, -3.04, 3.04, 11, 0.96, -0.075, 0);

  // Roof-comb stepped attic wing ledges (lush cushions spilling over the steps like reference!)
  addMossClusterRun(2.26, 2.26, 7.05, -2.14, -1.42, 4, 0.92, 0.08, -0.05);
  addMossClusterRun(2.26, 2.26, 7.05, 1.42, 2.14, 4, 0.92, 0.08, 0.05);
  addMossClusterRun(1.98, 1.98, 7.47, -1.94, -1.56, 3, 0.72, 0.08, 0);
  addMossClusterRun(1.98, 1.98, 7.47, 1.56, 1.94, 3, 0.72, 0.08, 0);

  // Roof-comb crown cornice & merlon ledges (Y capped <= 8.595 m)
  addMossClusterRun(2.38, 2.38, 7.95, -1.42, -0.62, 4, 0.86, 0.08, 0);
  addMossClusterRun(2.38, 2.38, 7.95, 0.62, 1.42, 4, 0.86, 0.08, 0);
  addMossClusterRun(2.00, 2.00, 8.43, -1.28, -1.04, 2, 0.64, 0.06, 0);
  addMossClusterRun(2.00, 2.00, 8.43, 1.04, 1.28, 2, 0.64, 0.06, 0);
  addMossClusterRun(2.00, 2.00, 8.50, -0.36, 0.36, 3, 0.56, 0.055, 0);

  // Side & rear stepped attic parapet ledges
  for (const sz of [-1, 1]) {
    const mz = sz * 1.90;
    addMossClusterRun(0.52, 1.28, 7.03, mz, mz, 4, 0.86, 0, sz * 0.075);
    addMossClusterRun(-0.45, 0.30, 6.43, mz, mz, 4, 0.86, 0, sz * 0.075);
    addMossClusterRun(-1.30, -0.64, 5.85, mz, mz, 3, 0.82, 0, sz * 0.075);
  }
  addMossClusterRun(-1.80, -1.80, 5.85, -1.42, 1.42, 6, 0.85, -0.075, 0);

  // Front doorway lintel brow & base corner moss pockets
  addMossClusterRun(2.94, 2.94, 4.04, -1.66, -0.82, 3, 0.52, 0.07, 0);
  addMossClusterRun(2.94, 2.94, 4.04, 0.82, 1.66, 3, 0.52, 0.07, 0);
  moss.addMossPillow(2.74, 0.36, 2.60, 0.22, 0.10, 0.22, mossRng, { drapeX: 0.05, clamp: clampPortal });
  moss.addMossPillow(2.74, 0.36, -2.60, 0.23, 0.11, 0.20, mossRng, { drapeX: 0.05, clamp: clampPortal });

  masonry.buildPart(root);
  relief.buildPart(root);
  sunburst.buildPart(root);
  altar.buildPart(root);
  dampBase.buildPart(root);
  moss.buildPart(root);

  return root;
}
