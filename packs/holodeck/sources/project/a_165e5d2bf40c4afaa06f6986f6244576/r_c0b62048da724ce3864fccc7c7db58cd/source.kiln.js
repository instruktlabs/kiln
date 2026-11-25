const meta = {
  name: 'Sanctuary Wing',
  role: 'building',
  description: 'Modular flanking Mayan limestone colonnaded portico wing with 6 carved square columns, coffered ceiling, stepped-fret frieze, projecting cornice roof, and velvety 3D moss eaves.',
};

// Shared material palette matching Sanctuary Portal exactly (4 materials)
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

  emitBox(reliefBatch, u0, u1, v0, v1, -0.012, 0.032, 0);
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
      emitBox(stoneBatch, cu0 + cw * 0.08, cu1 - cw * 0.08, innerV0, innerV0 + innerH * 0.34, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.24, cu1 - cw * 0.24, innerV0 + innerH * 0.34, innerV0 + innerH * 0.68, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.38, cu1 - cw * 0.38, innerV0 + innerH * 0.68, innerV1, 0.032, dFront, 0);
    } else {
      const bar = Math.min(cw * 0.22, innerH * 0.22);
      emitBox(stoneBatch, cu0 + cw * 0.08, cu1 - cw * 0.08, innerV1 - bar, innerV1, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.08, cu0 + cw * 0.08 + bar, innerV0, innerV1 - bar, 0.032, dFront, 0);
      emitBox(stoneBatch, cu1 - cw * 0.08 - bar, cu1 - cw * 0.08, innerV0 + innerH * 0.28, innerV1 - bar, 0.032, dFront, 0);
      emitBox(stoneBatch, cu0 + cw * 0.08 + bar, cu1 - cw * 0.08, innerV0, innerV0 + bar, 0.032, dFront, 0);
      emitBox(stoneBatch, midU - bar * 0.55, midU + bar * 0.55, midV - bar * 0.55, midV + bar * 0.55, 0.032, dFront + 0.012, 0);
    }
  }
}

// Carved square Mayan limestone column (0.52 x 0.52 m shaft, stepped plinth base & double-step capital to Y=3.10)
function addCarvedColumn(colBatch, reliefBatch, dampBatch, cx, cz, rng) {
  const uo = () => ({ ox: rng.range(0, 1), oy: rng.range(0, 1), uvScale: 2.0 });

  // Stepped double plinth base (Y = 0.00..0.30)
  dampBatch.addChamferBox(cx, 0.08, cz, 0.64, 0.16, 0.64, 0.02, uo());
  colBatch.addChamferBox(cx, 0.23, cz, 0.58, 0.14, 0.58, 0.018, uo());

  // 4 stacked chamfered limestone shaft drums with crisp mortar shadow reveals (Y = 0.30..2.66)
  // Recessed core runs inside the reveals so joints read as genuine carved stone drums
  reliefBatch.addBoxBounds(cx - 0.235, cx + 0.235, 0.30, 2.66, cz - 0.235, cz + 0.235, 0, { uvScale: 1.6 });

  const drumH = (2.66 - 0.30) / 4;
  for (let d = 0; d < 4; d++) {
    const y0 = 0.30 + d * drumH + (d === 0 ? 0 : 0.008);
    const y1 = 0.30 + (d + 1) * drumH - (d === 3 ? 0 : 0.008);
    colBatch.addChamferBox(cx, (y0 + y1) * 0.5, cz, 0.52, y1 - y0, 0.52, 0.026, uo());

    // Subtle recessed vertical fluted panel & carved rib on the middle two drums (all 4 faces!)
    if (d === 1 || d === 2) {
      const py0 = y0 + 0.06, py1 = y1 - 0.06;
      // Front/back (+X/-X) & side (+Z/-Z) carved vertical flute bands proud by 16 mm
      for (const s of [-1, 1]) {
        reliefBatch.addBoxBounds(
          s > 0 ? cx + 0.26 : cx - 0.276,
          s > 0 ? cx + 0.276 : cx - 0.26,
          py0,
          py1,
          cz - 0.14,
          cz + 0.14,
          0,
          { uvScale: 1.5 }
        );
        // Vertical twin carved ribs inside flute panel
        for (const rOff of [-0.075, 0.0, 0.075]) {
          colBatch.addBoxBounds(
            s > 0 ? cx + 0.276 : cx - 0.296,
            s > 0 ? cx + 0.296 : cx - 0.276,
            py0 + 0.02,
            py1 - 0.02,
            cz + rOff - 0.022,
            cz + rOff + 0.022,
            0,
            uo()
          );
        }

        reliefBatch.addBoxBounds(
          cx - 0.14,
          cx + 0.14,
          py0,
          py1,
          s > 0 ? cz + 0.26 : cz - 0.276,
          s > 0 ? cz + 0.276 : cz - 0.26,
          0,
          { uvScale: 1.5 }
        );
        for (const rOff of [-0.075, 0.0, 0.075]) {
          colBatch.addBoxBounds(
            cx + rOff - 0.022,
            cx + rOff + 0.022,
            py0 + 0.02,
            py1 - 0.02,
            s > 0 ? cz + 0.276 : cz - 0.296,
            s > 0 ? cz + 0.296 : cz - 0.276,
            0,
            uo()
          );
        }
      }
    }
  }

  // Carved Mayan Double-Step Capital reaching exact Y = 3.10 m!
  // Astragal necking collar (Y = 2.66..2.74)
  colBatch.addChamferBox(cx, 2.70, cz, 0.56, 0.08, 0.56, 0.016, uo());
  // Lower stepped echinus block (Y = 2.74..2.91)
  colBatch.addChamferBox(cx, 2.825, cz, 0.65, 0.17, 0.65, 0.022, uo());
  // Broad projecting abacus slab (Y = 2.91..3.10)
  colBatch.addChamferBox(cx, 3.005, cz, 0.74, 0.19, 0.74, 0.024, uo());
}

function build() {
  const root = createRoot('SanctuaryWing');
  const rng = seededRandom('lagoon-sanctuary-wing-v1');
  const mats = createSanctuaryMaterials();

  // 5 semantic mesh parts -> 4 distinct materials, 5 draw slots (<= 8 target!)
  const masonry = new GeoBatch('Wing_Masonry', mats.paleLimestone, 2.3);
  const columns = new GeoBatch('Wing_Columns', mats.paleLimestone, 2.0);
  const relief = new GeoBatch('Wing_Relief', mats.carvedRelief, 1.8);
  const dampBase = new GeoBatch('Wing_DampBase', mats.dampMasonry, 2.2);
  const moss = new GeoBatch('Wing_Moss', mats.velvetyMoss, 0.85);

  const clampWing = { x0: -2.295, x1: 2.295, y0: -0.60, y1: 4.35, z0: -2.895, z1: 2.895 };

  // =========================================================================
  // 1. WALKABLE TERRACE DECK & FOUNDATION SKIRT (X[-2.3, 2.3], Z[-2.9, 2.9], Y[-0.60, 0.00])
  // =========================================================================
  dampBase.addBoxBounds(-2.30, 2.30, -0.60, -0.18, -2.90, 2.90, 0.03, { uvScale: 2.4 });
  dampBase.addBoxBounds(-2.26, 2.26, -0.18, -0.036, -2.86, 2.86, 0.024, { uvScale: 2.3 });
  relief.addBoxBounds(-2.22, 2.22, -0.036, -0.022, -2.82, 2.82, 0, { uvScale: 2.0 });

  // Coursed beveled weathered flagstones flush at exact Y = 0.00 m
  const flagRng = rng.fork('deck');
  const nxF = 5, nzF = 6;
  const dxF = 4.60 / nxF, dzF = 5.80 / nzF;
  const gap = 0.018;
  for (let ix = 0; ix < nxF; ix++) {
    const x0 = -2.30 + ix * dxF + (ix === 0 ? 0 : gap * 0.5);
    const x1 = -2.30 + (ix + 1) * dxF - (ix === nxF - 1 ? 0 : gap * 0.5);
    const zShift = (ix % 2 === 1) ? dzF * 0.45 : 0;
    const zSplits = [-2.90];
    for (let iz = 0; iz < nzF; iz++) {
      const zv = -2.90 + iz * dzF + zShift;
      if (zv > -2.62 && zv < 2.62) zSplits.push(zv);
    }
    zSplits.push(2.90);
    for (let j = 0; j < zSplits.length - 1; j++) {
      const z0 = zSplits[j] + (j === 0 ? 0 : gap * 0.5);
      const z1 = zSplits[j + 1] - (j === zSplits.length - 2 ? 0 : gap * 0.5);
      masonry.addBoxBounds(x0, x1, -0.034, 0.00, z0, z1, 0.012, {
        ox: flagRng.range(0, 1),
        oy: flagRng.range(0, 1),
        uvScale: 2.1,
      });
    }
  }

  // =========================================================================
  // 2. OPEN COLONNADE — 6 CARVED SQUARE LIMESTONE COLUMNS (Y in [0.00, 3.10])
  // Front row: X = +1.85 at Z = -2.30, 0.00, +2.30
  // Rear row:  X = -1.85 at Z = -2.30, 0.00, +2.30
  // Interior clear passage: X in [-1.53, +1.53] (exceeds [-1.4, +1.4]), Y in [0.00, +3.10]!
  // =========================================================================
  const colRng = rng.fork('columns');
  for (const cx of [-1.85, 1.85]) {
    for (const cz of [-2.30, 0.00, 2.30]) {
      addCarvedColumn(columns, relief, dampBase, cx, cz, colRng);
    }
  }

  // =========================================================================
  // 3. ENTABLATURE, COFFERED CEILING, CARVED FRIEZE & CORNICE ROOF (Y in [3.10, 4.15])
  // =========================================================================
  // Lower architrave perimeter beams resting squarely atop the 6 column capitals (Y = 3.10..3.40)
  // Non-overlapping clean framing (front/rear beams full Z, cross beams cleanly between X[-1.52, +1.52])
  masonry.addBoxBounds(1.52, 2.18, 3.10, 3.40, -2.78, 2.78, 0.025, { uvScale: 2.2 });
  masonry.addBoxBounds(-2.18, -1.52, 3.10, 3.40, -2.78, 2.78, 0.025, { uvScale: 2.2 });
  // Transverse architrave tie beams aligned over column centers (Z = -2.30, 0.00, +2.30)
  masonry.addBoxBounds(-1.52, 1.52, 3.10, 3.40, -2.78, -1.96, 0.022, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.52, 1.52, 3.10, 3.40, 1.96, 2.78, 0.022, { uvScale: 2.1 });
  masonry.addBoxBounds(-1.52, 1.52, 3.14, 3.40, -0.28, 0.28, 0.020, { uvScale: 2.0 });

  // Recessed carved stone coffered ceiling panels between transverse beams (Y = 3.28..3.40)
  relief.addBoxBounds(-1.52, 1.52, 3.28, 3.40, -1.96, -0.28, 0, { uvScale: 1.9 });
  relief.addBoxBounds(-1.52, 1.52, 3.28, 3.40, 0.28, 1.96, 0, { uvScale: 1.9 });
  // Coffer interior rib moldings
  for (const bz of [-1.12, 1.12]) {
    masonry.addBoxBounds(-1.48, 1.48, 3.22, 3.28, bz - 0.14, bz + 0.14, 0.012, { uvScale: 1.8 });
    masonry.addBoxBounds(-0.14, 0.14, 3.22, 3.28, bz - 0.78, bz - 0.14, 0.012, { uvScale: 1.8 });
    masonry.addBoxBounds(-0.14, 0.14, 3.22, 3.28, bz + 0.14, bz + 0.78, 0.012, { uvScale: 1.8 });
  }

  // Solid Frieze Core Block (Y = 3.40..3.82, X in [-2.06, +2.06], Z in [-2.68, +2.68])
  masonry.addBoxBounds(-2.06, 2.06, 3.40, 3.82, -2.68, 2.68, 0.02, { uvScale: 2.2 });

  // Continuous 3D Carved Mayan Stepped-Fret Frieze wrapping ALL FOUR FACES (Y = 3.42..3.80)
  const friezeRng = rng.fork('frieze');
  addMayanFretStrip(relief, masonry, '+X', 2.06, -2.54, 2.54, 3.42, 3.80, 0.11, 9, friezeRng);
  addMayanFretStrip(relief, masonry, '-X', -2.06, -2.54, 2.54, 3.42, 3.80, 0.11, 9, friezeRng);
  addMayanFretStrip(relief, masonry, '+Z', 2.68, -1.92, 1.92, 3.42, 3.80, 0.10, 7, friezeRng);
  addMayanFretStrip(relief, masonry, '-Z', -2.68, -1.92, 1.92, 3.42, 3.80, 0.10, 7, friezeRng);

  // Projecting Stepped Mayan Cornice (Y = 3.82..4.15)
  // Lower cornice step (Y = 3.82..3.96, reaching X=+-2.20, Z=+-2.80)
  masonry.addBoxBounds(-2.20, 2.20, 3.82, 3.96, -2.80, 2.80, 0.022, { uvScale: 2.1 });
  // Upper projecting cornice rim & weathered flagstone roof deck (Y = 3.96..4.15, outer X=+-2.30, Z=+-2.90)
  masonry.addBoxBounds(-2.30, 2.30, 3.96, 4.10, -2.90, 2.90, 0.025, { uvScale: 2.2 });

  // Subtle stepped perimeter roof parapet curb + coursed weathered roof flagstones (Y = 4.10..4.15)
  const roofRng = rng.fork('roof');
  const rnx = 4, rnz = 5;
  const rdx = 4.56 / rnx, rdz = 5.76 / rnz;
  for (let ix = 0; ix < rnx; ix++) {
    const x0 = -2.28 + ix * rdx + (ix === 0 ? 0 : 0.01);
    const x1 = -2.28 + (ix + 1) * rdx - (ix === rnx - 1 ? 0 : 0.01);
    for (let iz = 0; iz < rnz; iz++) {
      const z0 = -2.88 + iz * rdz + (iz === 0 ? 0 : 0.01);
      const z1 = -2.88 + (iz + 1) * rdz - (iz === rnz - 1 ? 0 : 0.01);
      masonry.addBoxBounds(x0, x1, 4.10, 4.15, z0, z1, 0.012, {
        ox: roofRng.range(0, 1),
        oy: roofRng.range(0, 1),
        uvScale: 2.0,
      });
    }
  }

  // =========================================================================
  // 4. ORGANIC 3D SCULPTED VELVETY MOSS PILLOWS ALONG ROOF EAVES (Y in [4.10, 4.35])
  // =========================================================================
  const mossRng = rng.fork('moss');
  const addMossRun = (x0, x1, y, z0, z1, count, scale, drapeX, drapeZ) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + mossRng.range(-0.22, 0.22)) / count;
      const mx = x0 + (x1 - x0) * t + mossRng.range(-0.04, 0.04);
      const mz = z0 + (z1 - z0) * t + mossRng.range(-0.04, 0.04);
      const rx = mossRng.range(0.26, 0.44) * scale;
      const rz = mossRng.range(0.26, 0.44) * scale;
      const ry = mossRng.range(0.14, 0.22) * scale;
      moss.addMossPillow(mx, y, mz, rx, ry, rz, mossRng, {
        drapeX,
        drapeZ,
        clamp: clampWing,
      });
    }
  };

  // Front & rear lush draping moss eaves (hugging close to the cornice lip, clear of Y=3.96 underside!)
  addMossRun(2.04, 2.04, 4.14, -2.66, 2.66, 12, 1.04, 0.09, 0);
  addMossRun(-2.04, -2.04, 4.14, -2.66, 2.66, 12, 0.98, -0.085, 0);
  // End eaves (+Z and -Z)
  addMossRun(-1.82, 1.82, 4.14, 2.64, 2.64, 8, 0.98, 0, 0.085);
  addMossRun(-1.82, 1.82, 4.14, -2.64, -2.64, 8, 0.98, 0, -0.085);
  // Lush secondary moss drifts creeping softly inward from the mossy cornice corners
  addMossRun(1.56, 1.56, 4.14, -2.35, -1.35, 3, 0.95, 0, 0);
  addMossRun(1.56, 1.56, 4.14, 1.35, 2.35, 3, 0.95, 0, 0);
  addMossRun(-1.56, -1.56, 4.14, -2.35, -1.35, 3, 0.90, 0, 0);
  addMossRun(-1.56, -1.56, 4.14, 1.35, 2.35, 3, 0.90, 0, 0);

  // Subtle damp base moss tufts tucked against outer column plinth corners
  for (const cz of [-2.30, 2.30]) {
    moss.addMossPillow(2.04, 0.16, cz + (cz > 0 ? 0.20 : -0.20), 0.18, 0.08, 0.18, mossRng, { drapeX: 0.04, clamp: clampWing });
  }

  masonry.buildPart(root);
  columns.buildPart(root);
  relief.buildPart(root);
  dampBase.buildPart(root);
  moss.buildPart(root);

  return root;
}
