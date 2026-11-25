const meta = {
  name: 'Sanctuary Grand Stairs',
  role: 'building',
  description: 'Monumental 14-step weathered Mayan limestone island staircase with water-edge landing, sloped cheek alfardas, twin carved sunburst pedestals, damp seabed foundation, and velvety 3D moss caps.',
};

// Shared material palette matching Sanctuary Portal & Wing exactly (4 materials)
function createSanctuaryMaterials() {
  const packRough = (r) => (255 << 16) | (Math.max(0, Math.min(255, Math.round(r * 255))) << 8);

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

  // Watertight sloped prism extruded along Z from 4 XY corners: (x0,y0b), (x1,y1b), (x1,y1t), (x0,y0t)
  addSlopedPrismZ(x0, y0b, y0t, x1, y1b, y1t, z0, z1, opts = {}) {
    const a0 = [x0, y0b, z0], b0 = [x1, y1b, z0], c0 = [x1, y1t, z0], d0 = [x0, y0t, z0];
    const a1 = [x0, y0b, z1], b1 = [x1, y1b, z1], c1 = [x1, y1t, z1], d1 = [x0, y0t, z1];
    const cx = (x0 + x1) * 0.5;
    const cy = (y0b + y1b + y0t + y1t) * 0.25;
    // Z- sides
    this.addQuad(a0, d0, c0, b0, [0, 0, -1], opts);
    this.addQuad(a1, b1, c1, d1, [0, 0, 1], opts);
    // Top sloped face (d -> c)
    const tx = x1 - x0, ty = y1t - y0t;
    this.addQuad(d0, d1, c1, c0, [-ty, tx, 0], opts);
    // Bottom face (a -> b)
    const bx = x1 - x0, by = y1b - y0b;
    this.addQuad(a0, b0, b1, a1, [by, -bx, 0], opts);
    // Ends (x0 and x1)
    this.addQuad(a0, a1, d1, d0, [x0 - cx, 0, 0], opts);
    this.addQuad(b0, c0, c1, b1, [x1 - cx, 0, 0], opts);
  }

  addCylinderX(x0, x1, cy, cz, rBack, rFront, segs = 20, opts = {}) {
    const cBack = [x0, cy, cz], cFront = [x1, cy, cz];
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

  addCylinderZ(cx, cy, z0, z1, rBack, rFront, segs = 20, opts = {}) {
    const cBack = [cx, cy, z0], cFront = [cx, cy, z1];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const p0 = [cx + Math.cos(a0) * rBack, cy + Math.sin(a0) * rBack, z0];
      const p1 = [cx + Math.cos(a1) * rBack, cy + Math.sin(a1) * rBack, z0];
      const q0 = [cx + Math.cos(a0) * rFront, cy + Math.sin(a0) * rFront, z1];
      const q1 = [cx + Math.cos(a1) * rFront, cy + Math.sin(a1) * rFront, z1];
      this.addQuad(p0, q0, q1, p1, [Math.cos(am), Math.sin(am), 0], opts);
      this.addTri(cFront, q0, q1, [0, 0, 1], opts);
      this.addTri(cBack, p1, p0, [0, 0, -1], opts);
    }
  }

  addMossPillow(cx, cy, cz, rx, ry, rz, rng, opts = {}) {
    const uSeg = opts.uSeg ?? 10;
    const vSeg = opts.vSeg ?? 4;
    const p1 = rng.range(0, Math.PI * 2);
    const p2 = rng.range(0, Math.PI * 2);
    const p3 = rng.range(0, Math.PI * 2);
    const drapeX = opts.drapeX ?? 0;
    const drapeZ = opts.drapeZ ?? 0;
    const clamp = opts.clamp ?? null;

    const yBase = cy + rng.range(-0.008, 0.008);
    const buryRim = rng.range(0.014, 0.030);
    const buryCenter = buryRim + rng.range(0.015, 0.032);

    let effRx = rx, effRz = rz, effRy = ry;
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
        if (drapeX > 0 && lx > effRx * 0.25) drop += Math.min(1, (lx - effRx * 0.25) / (effRx * 0.75)) * drapeX * sinP;
        else if (drapeX < 0 && lx < -effRx * 0.25) drop += Math.min(1, (-lx - effRx * 0.25) / (effRx * 0.75)) * (-drapeX) * sinP;
        if (drapeZ > 0 && lz > effRz * 0.25) drop += Math.min(1, (lz - effRz * 0.25) / (effRz * 0.75)) * drapeZ * sinP;
        else if (drapeZ < 0 && lz < -effRz * 0.25) drop += Math.min(1, (-lz - effRz * 0.25) / (effRz * 0.75)) * (-drapeZ) * sinP;
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

// Mini carved Mayan sunburst & fretwork relief plaque for the heroic flanking staircase pedestals
function addPedestalCarvedFace(stoneBatch, reliefBatch, face, coord, uCenter, yBot, yTop, halfW, rng) {
  const dir = (face === '+X' || face === '+Z') ? 1 : -1;
  const emitBox = (batch, au0, au1, av0, av1, d0, d1, bevel = 0) => {
    const c0 = coord + dir * Math.min(d0, d1);
    const c1 = coord + dir * Math.max(d0, d1);
    const mn = Math.min(c0, c1), mx = Math.max(c0, c1);
    const opts = { ox: rng.range(0, 1), oy: rng.range(0, 1), uvScale: 1.4 };
    if (face === '+X' || face === '-X') {
      batch.addBoxBounds(mn, mx, av0, av1, au0, au1, bevel, opts);
    } else {
      batch.addBoxBounds(au0, au1, av0, av1, mn, mx, bevel, opts);
    }
  };

  const u0 = uCenter - halfW, u1 = uCenter + halfW;
  const fT = 0.042;
  // Shadowed recess panel embedded 12 mm into pedestal core -> zero gap & zero FLUSH_FACES!
  emitBox(reliefBatch, u0, u1, yBot, yTop, -0.012, 0.032, 0);
  // Crisp outer carved stone border frame
  emitBox(stoneBatch, u0, u1, yTop - fT, yTop, 0.032, 0.074, 0.008);
  emitBox(stoneBatch, u0, u1, yBot, yBot + fT, 0.032, 0.074, 0.008);
  emitBox(stoneBatch, u0, u0 + fT, yBot + fT, yTop - fT, 0.032, 0.070, 0);
  emitBox(stoneBatch, u1 - fT, u1, yBot + fT, yTop - fT, 0.032, 0.070, 0);

  // Lower carved Mayan stepped-fret bar (bottom 28% of plaque, echoing foreground pillar in reference!)
  const splitY = yBot + (yTop - yBot) * 0.30;
  emitBox(stoneBatch, u0 + fT, u1 - fT, splitY, splitY + 0.028, 0.032, 0.070, 0);
  const fY0 = yBot + fT + 0.015, fY1 = splitY - 0.015;
  const fH = fY1 - fY0;
  const innerSpan = (u1 - u0) - 2 * fT - 0.03;
  const cellW = innerSpan / 3;
  for (let i = 0; i < 3; i++) {
    const cu0 = u0 + fT + 0.015 + i * cellW + 0.012;
    const cu1 = u0 + fT + 0.015 + (i + 1) * cellW - 0.012;
    const cw = cu1 - cu0;
    emitBox(stoneBatch, cu0, cu1, fY0, fY0 + fH * 0.45, 0.032, 0.064, 0);
    emitBox(stoneBatch, cu0 + cw * 0.22, cu1 - cw * 0.22, fY0 + fH * 0.45, fY1, 0.032, 0.064, 0);
  }

  // Upper carved radial Mayan sunburst relief medallion!
  const sunCy = (splitY + 0.028 + yTop - fT) * 0.5;
  const sunR = Math.min(halfW - fT - 0.04, (yTop - fT - splitY - 0.028) * 0.45);
  const dBack = coord + dir * 0.032;
  const dPeak = coord + dir * 0.088;
  const dRay = coord + dir * 0.066;

  // 12 sculpted pointed solar rays radiating from center
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const da = 0.16;
    const r0 = sunR * 0.42;
    const r1 = (i % 2 === 0) ? sunR : sunR * 0.78;
    const makePt = (d, rad, ang) => {
      if (face === '+X' || face === '-X') return [d, sunCy + Math.sin(ang) * rad, uCenter + Math.cos(ang) * rad];
      return [uCenter + Math.cos(ang) * rad, sunCy + Math.sin(ang) * rad, d];
    };
    const out = (face === '+X' || face === '-X') ? [dir, 0, 0] : [0, 0, dir];
    const pL = makePt(dBack, r0, a - da);
    const pR = makePt(dBack, r0, a + da);
    const pM = makePt(dRay, r0, a);
    const pT = makePt(coord + dir * 0.048, r1, a);
    stoneBatch.addTri(pM, pT, pL, out, { uvScale: 1.2 });
    stoneBatch.addTri(pM, pR, pT, out, { uvScale: 1.2 });
  }
  // Raised central sun disc
  if (face === '+X' || face === '-X') {
    const x0 = Math.min(dBack, dPeak), x1 = Math.max(dBack, dPeak);
    stoneBatch.addCylinderX(x0, x1, sunCy, uCenter, sunR * 0.48, sunR * 0.40, 16, { uvScale: 1.2 });
  } else {
    const z0 = Math.min(dBack, dPeak), z1 = Math.max(dBack, dPeak);
    stoneBatch.addCylinderZ(uCenter, sunCy, z0, z1, sunR * 0.48, sunR * 0.40, 16, { uvScale: 1.2 });
  }
}

function build() {
  const root = createRoot('SanctuaryGrandStairs');
  const rng = seededRandom('lagoon-sanctuary-stairs-v1');
  const mats = createSanctuaryMaterials();

  // 5 semantic mesh parts -> 4 distinct materials, 5 draw slots (<= 8 target!)
  const treads = new GeoBatch('Stairs_Treads', mats.paleLimestone, 2.2);
  const cheeks = new GeoBatch('Stairs_CheeksAndPedestals', mats.paleLimestone, 2.2);
  const relief = new GeoBatch('Stairs_Relief', mats.carvedRelief, 1.8);
  const dampBase = new GeoBatch('Stairs_DampBase', mats.dampMasonry, 2.2);
  const moss = new GeoBatch('Stairs_Moss', mats.velvetyMoss, 0.85);

  const clampStairs = { x0: -3.195, x1: 3.595, y0: -1.20, y1: 3.60, z0: -3.095, z1: 3.095 };

  // =========================================================================
  // 1. SOLID SEABED FOUNDATION & BOTTOM WATER-EDGE LANDING (Y in [-1.20, 0.12])
  // Bottom landing: X in [+2.20, +3.60], top at Y = +0.12 m, foundation down to Y = -1.20 m
  // =========================================================================
  // Massive submerged damp masonry foundation block spanning the entire staircase footprint!
  dampBase.addBoxBounds(-3.20, 3.60, -1.20, -0.35, -3.06, 3.06, 0.03, { uvScale: 2.4 });
  // Lower water-edge apron body (-0.35 to 0.085, X in [-3.20, +3.60], Z in [-3.02, +3.02])
  dampBase.addBoxBounds(-3.20, 3.60, -0.35, 0.082, -3.02, 3.02, 0.024, { uvScale: 2.3 });
  // Recessed mortar grout bed beneath bottom landing flagstones (inset 2 cm from X=2.20 -> zero FLUSH_FACES!)
  relief.addBoxBounds(2.22, 3.56, 0.082, 0.098, -2.98, 2.98, 0, { uvScale: 2.0 });

  // Coursed beveled damp water-edge landing flagstones (X in [+2.20, +3.60], top exact Y = 0.12 m!)
  const landRng = rng.fork('landing');
  const lnx = 2, lnz = 7;
  const ldx = 1.40 / lnx, ldz = 6.00 / lnz;
  for (let ix = 0; ix < lnx; ix++) {
    const x0 = 2.20 + ix * ldx + (ix === 0 ? 0 : 0.008);
    const x1 = 2.20 + (ix + 1) * ldx - (ix === lnx - 1 ? 0 : 0.008);
    for (let iz = 0; iz < lnz; iz++) {
      const z0 = -3.00 + iz * ldz + (iz === 0 ? 0 : 0.009);
      const z1 = -3.00 + (iz + 1) * ldz - (iz === lnz - 1 ? 0 : 0.009);
      dampBase.addBoxBounds(x0, x1, 0.086, 0.12, z0, z1, 0.014, {
        ox: landRng.range(0, 1),
        oy: landRng.range(0, 1),
        uvScale: 2.1,
      });
    }
  }

  // =========================================================================
  // 2. MONOLITHIC STAIR CORE + 14 BROAD WEATHERED STONE STAIRS (Y = 0.12 -> 2.70 m)
  // Clear stair width: 4.40 m (Z in [-2.20, +2.20])
  // 14 steps: X from +2.20 up to -2.70 (tread = 0.35 m), Y from 0.12 up to 2.70 (rise = 0.1843 m)
  // =========================================================================
  const numSteps = 14;
  const xStart = 2.20;
  const xEnd = -2.70;
  const treadD = (xStart - xEnd) / numSteps; // exact 0.35 m
  const yStart = 0.12;
  const yEnd = 2.70;
  const stepRise = (yEnd - yStart) / numSteps; // exact 0.1842857 m

  // Solid sloped stone undercarriage core stopping cleanly at X = -2.68 (zero overlap with rear wall!)
  dampBase.addSlopedPrismZ(
    -2.68, 0.082, 0.55,
    1.85, 0.082, 0.082,
    -2.20, 2.20,
    { uvScale: 2.3 }
  );
  dampBase.addBoxBounds(-3.20, -2.68, 0.082, 0.55, -2.20, 2.20, 0.015, { uvScale: 2.3 });
  cheeks.addSlopedPrismZ(
    -2.68, 0.55, 2.52,
    1.85, 0.082, 0.16,
    -2.18, 2.18,
    { uvScale: 2.3 }
  );
  // Solid rear retaining masonry wall under top landing (X in [-3.20, -2.68], Y in [0.55, 2.655])
  cheeks.addBoxBounds(-3.20, -2.68, 0.55, 2.655, -2.18, 2.18, 0.02, { uvScale: 2.2 });

  // Build all 14 broad ashlar stone steps (5 staggered beveled limestone blocks per tread!)
  const stepRng = rng.fork('steps');
  for (let i = 1; i <= numSteps; i++) {
    const xFront = xStart - (i - 1) * treadD;
    const xBack = xStart - i * treadD - (i < numSteps ? 0.04 : 0.0); // tuck cleanly under next riser!
    const yTop = yStart + i * stepRise;
    const yBot = yStart + (i - 1) * stepRise - 0.03;

    // Bottom 2 steps near water-line use DampLowerMasonry; upper 12 steps use PaleLimestone!
    const targetBatch = i <= 2 ? dampBase : treads;

    // Dark recessed mortar strip along riser seam
    relief.addBoxBounds(xBack + 0.01, xFront - 0.015, yBot + 0.01, yTop - 0.02, -2.19, 2.19, 0, { uvScale: 2.0 });

    // Staggered ashlar tread blocks spanning Z in [-2.20, +2.20] (exact 4.40 m clear width!)
    const cols = 5;
    const colW = 4.40 / cols;
    const shift = (i % 2 === 1) ? colW * 0.42 : 0;
    const zSplits = [-2.20];
    for (let c = 0; c < cols; c++) {
      const zv = -2.20 + c * colW + shift;
      if (zv > -1.96 && zv < 1.96) zSplits.push(zv);
    }
    zSplits.push(2.20);

    for (let j = 0; j < zSplits.length - 1; j++) {
      const z0 = zSplits[j] + (j === 0 ? 0 : 0.008);
      const z1 = zSplits[j + 1] - (j === zSplits.length - 2 ? 0 : 0.008);
      // Subtle organic weathered stone nosing variation (keeps walking height dead-consistent!)
      const noseJit = stepRng.range(-0.005, 0.005);
      const topJit = (i === numSteps) ? 0 : stepRng.range(-0.003, 0.003);
      targetBatch.addBoxBounds(
        xBack,
        xFront + noseJit,
        yBot,
        yTop + topJit,
        z0,
        z1,
        0.018,
        { ox: stepRng.range(0, 1), oy: stepRng.range(0, 1), uvScale: 2.1 }
      );
    }
  }

  // Top Flush Landing Lip (X in [-3.20, -2.70], Z in [-2.20, +2.20], top exact Y = 2.70 m!)
  relief.addBoxBounds(-3.18, -2.71, 2.655, 2.675, -2.18, 2.18, 0, { uvScale: 2.0 });
  const topCols = 5;
  const topColW = 4.40 / topCols;
  for (let c = 0; c < topCols; c++) {
    const z0 = -2.20 + c * topColW + (c === 0 ? 0 : 0.008);
    const z1 = -2.20 + (c + 1) * topColW - (c === topCols - 1 ? 0 : 0.008);
    treads.addBoxBounds(-3.20, -2.708, 2.66, 2.70, z0, z1, 0.012, {
      ox: stepRng.range(0, 1),
      oy: stepRng.range(0, 1),
      uvScale: 2.1,
    });
  }

  // =========================================================================
  // 3. FLANKING SLOPED CHEEK WALLS / ALFARDAS (0.80 m wide each: Z in [+-2.22, +-3.02])
  // Slope parallel to the 14 stairs from bottom pedestals (X=+2.20) to top landing (X=-3.20)
  // =========================================================================
  const cheekRng = rng.fork('cheeks');
  for (const sz of [-1, 1]) {
    const zIn = sz > 0 ? 2.22 : -3.02;
    const zOut = sz > 0 ? 3.02 : -2.22;
    const zOuterFace = sz > 0 ? 3.02 : -3.02;
    const face = sz > 0 ? '+Z' : '-Z';

    // Damp lower cheek wall base along full length (Y = 0.082..0.58)
    dampBase.addBoxBounds(-3.20, 2.20, 0.082, 0.58, zIn, zOut, 0.02, { uvScale: 2.2 });

    // Main sloped cheek wall limestone body (X in [-2.68, +2.20], rising parallel to steps + 0.56 m!)
    // At X=+2.20: top = 0.72 m; at X=-2.68: top = 3.26 m!
    cheeks.addSlopedPrismZ(-2.68, 0.58, 3.26, 2.20, 0.58, 0.72, zIn, zOut, { uvScale: 2.3 });

    // Projecting beveled sloped Alfarda balustrade coping slab capping the sloped cheek wall!
    // Starts cleanly at X=-2.64 against upper die cap & Y=3.26..3.44 -> ZERO FLUSH_FACES!
    const capZIn = sz > 0 ? 2.18 : -3.06;
    const capZOut = sz > 0 ? 3.06 : -2.18;
    cheeks.addSlopedPrismZ(-2.64, 3.26, 3.44, 2.20, 0.72, 0.90, capZIn, capZOut, { uvScale: 2.0 });

    // Horizontal Mayan Upper Alfarda Return Die at top landing (X in [-3.20, -2.68], Y = 0.58..3.46)
    cheeks.addBoxBounds(-3.20, -2.68, 0.58, 3.26, zIn, zOut, 0.02, { uvScale: 2.1 });
    // Projecting upper die cornice cap (X in [-3.20, -2.64], Y = 3.26..3.46, proud 4 cm on Z)
    cheeks.addBoxBounds(-3.20, -2.64, 3.26, 3.46, capZIn, capZOut, 0.022, { uvScale: 2.0 });

    // Crisp stepped Mayan framed glyph cartouches climbing along the outer cheek wall face (Z = +-3.02)
    const plaques = [
      { x0: 0.45, x1: 1.35, y0: 0.66, y1: 1.16 },
      { x0: -0.70, x1: 0.25, y0: 0.84, y1: 1.54 },
      { x0: -1.90, x1: -0.92, y0: 1.24, y1: 2.08 },
      { x0: -3.04, x1: -2.14, y0: 1.84, y1: 2.74 },
    ];
    for (let pi = 0; pi < plaques.length; pi++) {
      const p = plaques[pi];
      const z0 = sz > 0 ? zOuterFace - 0.012 : zOuterFace - 0.030;
      const z1 = sz > 0 ? zOuterFace + 0.030 : zOuterFace + 0.012;
      const zf0 = sz > 0 ? zOuterFace + 0.030 : zOuterFace - 0.064;
      const zf1 = sz > 0 ? zOuterFace + 0.064 : zOuterFace - 0.030;
      relief.addBoxBounds(p.x0, p.x1, p.y0, p.y1, z0, z1, 0, { uvScale: 1.6 });
      const bT = 0.036;
      // Outer crisp carved frame around each cheek plaque
      cheeks.addBoxBounds(p.x0, p.x1, p.y1 - bT, p.y1, zf0, zf1, 0.006, { uvScale: 1.5 });
      cheeks.addBoxBounds(p.x0, p.x1, p.y0, p.y0 + bT, zf0, zf1, 0.006, { uvScale: 1.5 });
      cheeks.addBoxBounds(p.x0, p.x0 + bT, p.y0 + bT, p.y1 - bT, zf0, zf1, 0, { uvScale: 1.5 });
      cheeks.addBoxBounds(p.x1 - bT, p.x1, p.y0 + bT, p.y1 - bT, zf0, zf1, 0, { uvScale: 1.5 });
      // Inner Mayan stepped-pyramid / cross relief motif
      const ix0 = p.x0 + bT + 0.03, ix1 = p.x1 - bT - 0.03;
      const iy0 = p.y0 + bT + 0.03, iy1 = p.y1 - bT - 0.03;
      const iw = ix1 - ix0, ih = iy1 - iy0;
      const mx = (ix0 + ix1) * 0.5, my = (iy0 + iy1) * 0.5;
      if (pi % 2 === 0) {
        cheeks.addBoxBounds(ix0, ix1, iy0, iy0 + ih * 0.32, zf0, zf1, 0, { uvScale: 1.4 });
        cheeks.addBoxBounds(ix0 + iw * 0.18, ix1 - iw * 0.18, iy0 + ih * 0.32, iy0 + ih * 0.65, zf0, zf1, 0, { uvScale: 1.4 });
        cheeks.addBoxBounds(mx - iw * 0.16, mx + iw * 0.16, iy0 + ih * 0.65, iy1, zf0, zf1, 0, { uvScale: 1.4 });
      } else {
        cheeks.addBoxBounds(ix0, ix1, my - ih * 0.16, my + ih * 0.16, zf0, zf1, 0, { uvScale: 1.4 });
        cheeks.addBoxBounds(mx - iw * 0.16, mx + iw * 0.16, my + ih * 0.16, iy1, zf0, zf1, 0, { uvScale: 1.4 });
        cheeks.addBoxBounds(mx - iw * 0.16, mx + iw * 0.16, iy0, my - ih * 0.16, zf0, zf1, 0, { uvScale: 1.4 });
        cheeks.addBoxBounds(mx - iw * 0.22, mx + iw * 0.22, my - ih * 0.22, my + ih * 0.22, zf0, sz > 0 ? zOuterFace + 0.074 : zOuterFace - 0.074, 0, { uvScale: 1.4 });
      }
    }
  }

  // =========================================================================
  // 4. TWO HEROIC CARVED LIMESTONE PEDESTALS AT BOTTOM OF CHEEK WALLS
  // Size: 1.05 x 1.55 x 1.05 m (X in [+2.20, +3.25], Z in [+-2.05, +-3.10], Y in [0.12, 1.67])
  // Sits cleanly in front of step 1 (X=+2.20), outer face hits exact Z = +-3.10 m (6.20 m total width!)
  // =========================================================================
  const pedRng = rng.fork('pedestals');
  const pedCx = 2.725;
  for (const sz of [-1, 1]) {
    const pedCz = sz * 2.575; // 2.575 + 0.525 = 3.100 m exact!

    // Lower damp stepped pedestal plinth (Y = 0.12..0.38, 1.05 x 1.05 m!)
    dampBase.addChamferBox(pedCx, 0.25, pedCz, 1.05, 0.26, 1.05, 0.024, { uvScale: 2.0 });
    // Upper limestone base collar (Y = 0.38..0.52, 0.96 x 0.96 m)
    cheeks.addChamferBox(pedCx, 0.45, pedCz, 0.96, 0.14, 0.96, 0.02, { uvScale: 2.0 });
    // Carved limestone pedestal shaft body (Y = 0.52..1.38, 0.85 x 0.85 m so carved reliefs stay within exact +-3.10 m!)
    cheeks.addChamferBox(pedCx, 0.95, pedCz, 0.85, 0.86, 0.85, 0.022, { uvScale: 1.9 });

    // Sculpted recessed Mayan Sunburst & Stepped-Fretwork Plaques on ALL 3 VISIBLE FACES!
    // Front (+X) facing lagoon viewer
    addPedestalCarvedFace(cheeks, relief, '+X', pedCx + 0.425, pedCz, 0.58, 1.32, 0.33, pedRng);
    // Outer side (+Z or -Z)
    addPedestalCarvedFace(cheeks, relief, sz > 0 ? '+Z' : '-Z', pedCz + sz * 0.425, pedCx, 0.58, 1.32, 0.33, pedRng);
    // Inner stair-facing side (-Z or +Z)
    addPedestalCarvedFace(cheeks, relief, sz > 0 ? '-Z' : '+Z', pedCz - sz * 0.425, pedCx, 0.58, 1.32, 0.33, pedRng);

    // Double-stepped projecting Mayan cornice cap (Y = 1.38..1.67 -> exact 1.55 m height above Y=0.12!)
    cheeks.addChamferBox(pedCx, 1.45, pedCz, 0.98, 0.14, 0.98, 0.022, { uvScale: 1.9 });
    cheeks.addChamferBox(pedCx, 1.595, pedCz, 1.05, 0.15, 1.05, 0.026, { uvScale: 2.0 });
  }

  // =========================================================================
  // 5. LUSH VELVETY 3D MOSS CAPS ON PEDESTALS, CHEEK WALLS & STAIR EDGES
  // =========================================================================
  const mossRng = rng.fork('moss');

  // Heroic velvety 3D moss crowns capping BOTH bottom pedestals (Y = 1.66..1.85 m!)
  for (const sz of [-1, 1]) {
    const pedCz = sz * 2.575;
    // Central plump moss crown + 4 corner overhanging draping moss cushions (seated cleanly atop 1.05 m cap!)
    moss.addMossPillow(pedCx, 1.665, pedCz, 0.36, 0.18, 0.36, mossRng, { clamp: clampStairs });
    moss.addMossPillow(pedCx + 0.19, 1.66, pedCz + sz * 0.19, 0.23, 0.13, 0.23, mossRng, { drapeX: 0.045, drapeZ: sz * 0.045, clamp: clampStairs });
    moss.addMossPillow(pedCx + 0.19, 1.66, pedCz - sz * 0.19, 0.23, 0.12, 0.23, mossRng, { drapeX: 0.045, drapeZ: -sz * 0.04, clamp: clampStairs });
    moss.addMossPillow(pedCx - 0.19, 1.66, pedCz + sz * 0.19, 0.23, 0.13, 0.23, mossRng, { drapeZ: sz * 0.045, clamp: clampStairs });
    moss.addMossPillow(pedCx - 0.18, 1.66, pedCz - sz * 0.18, 0.22, 0.12, 0.22, mossRng, { drapeZ: -sz * 0.04, clamp: clampStairs });

    // Lush mossy upper horizontal alfarda die cap (3 clustered overlapping pillows!)
    moss.addMossPillow(-2.96, 3.45, sz * 2.60, 0.30, 0.16, 0.36, mossRng, { drapeZ: sz * 0.085, clamp: clampStairs });
    moss.addMossPillow(-2.74, 3.45, sz * 2.74, 0.25, 0.13, 0.28, mossRng, { drapeZ: sz * 0.08, clamp: clampStairs });
    moss.addMossPillow(-2.82, 3.45, sz * 2.40, 0.22, 0.11, 0.24, mossRng, { drapeZ: -sz * 0.07, clamp: clampStairs });

    // Natural organic moss drifts (clustered pairs along lower, mid, and upper cheek wall ledges)
    const driftClusters = [
      { t: 0.14, count: 3 },
      { t: 0.52, count: 3 },
      { t: 0.84, count: 2 },
    ];
    for (const cl of driftClusters) {
      for (let k = 0; k < cl.count; k++) {
        const tk = cl.t + (k - 0.5) * 0.065;
        const mx = 2.15 - tk * 4.75;
        const my = 0.88 + tk * (3.42 - 0.88) - 0.025;
        const mz = sz * (2.64 + mossRng.range(-0.16, 0.18));
        moss.addMossPillow(mx, my, mz, mossRng.range(0.24, 0.36), mossRng.range(0.09, 0.14), mossRng.range(0.22, 0.32), mossRng, {
          drapeZ: sz * 0.075,
          clamp: clampStairs,
        });
      }
    }

    // Tiny authentic damp moss tufts tucked into bottom stair-cheek corners (clear of walking path!)
    for (const stepIdx of [1, 3, 6, 10]) {
      const sx = xStart - (stepIdx - 0.5) * treadD;
      const sy = yStart + stepIdx * stepRise;
      moss.addMossPillow(sx, sy, sz * 2.12, 0.12, 0.055, 0.11, mossRng, { clamp: clampStairs });
    }
  }

  treads.buildPart(root);
  cheeks.buildPart(root);
  relief.buildPart(root);
  dampBase.buildPart(root);
  moss.buildPart(root);

  return root;
}
