const stationStep = 5; // 5 = full export, 10 = far export
const far = false;     // true: floorSlab, walls, roof, glazingBand only

const meta = { name: far ? 's5-split-bridge-far' : 's5-split-bridge' };

function build() {
  const Y0 = 29.4, YS = 30.0, YT = 42.0, YB0 = 33.0, YB1 = 39.0, GY0 = far ? YB0 : 30.1; // far has no grooves, so no plinth course
  const LEDGE = 0.2, RECESS = 0.15, GD = 0.05, GW = 0.05, RSW = 0.3, RSH = 0.1, SSH = 0.1, SEAM = 12;
  const sides = [1, -1];

  // ---- the one outline: stations, half-width polyline, offsets from it
  const Zs = [-140];
  for (let i = 0; i <= Math.round(220 / stationStep); i++) Zs.push(-110 + i * stationStep);
  Zs.push(140);
  const Ws = Zs.map(z => (Math.abs(z) >= 110 ? 80 : 30 + 50 * (z / 110) ** 2));
  const wPoly = z => {
    let k = 0;
    while (k < Zs.length - 2 && z > Zs[k + 1]) k++;
    return Ws[k] + ((z - Zs[k]) / (Zs[k + 1] - Zs[k])) * (Ws[k + 1] - Ws[k]);
  };
  const xf = z => wPoly(z) - LEDGE;   // wall face (slab edge is wPoly)
  const xb = z => xf(z) - RECESS;     // glazing plane
  const xg = z => xf(z) - GD;         // groove floor

  // ---- seam grooves: every 12 m of polyline arc length from Z = 0, mirrored
  const G = [];
  if (!far) {
    const pos = Zs.filter(z => z >= 0 && z <= 110);
    const arc = [0];
    for (let i = 1; i < pos.length; i++) arc.push(arc[i - 1] + Math.hypot(pos[i] - pos[i - 1], wPoly(pos[i]) - wPoly(pos[i - 1])));
    const zAt = s => {
      let i = 0;
      while (i < pos.length - 2 && s > arc[i + 1]) i++;
      return pos[i] + ((s - arc[i]) / (arc[i + 1] - arc[i])) * (pos[i + 1] - pos[i]);
    };
    for (let j = 0; SEAM * j < arc[arc.length - 1] - 1e-9; j++) {
      const s = SEAM * j;
      const b = zAt(s + GW / 2);
      if (j === 0) G.push([-b, b]);
      else { const a = zAt(s - GW / 2); G.push([a, b], [-b, -a]); }
    }
  }
  const ZR = [...new Set([...Zs, ...G.flat()].map(z => Math.round(z * 1e7) / 1e7))].sort((p, q) => p - q);
  const inGroove = z => G.some(([a, b]) => z > a && z < b);

  // ---- flat-shaded mesh builder; quads are oriented toward a hint normal
  const mk = () => {
    const P = [], N = [], I = [];
    const tri = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return;
      nx /= l; ny /= l; nz /= l;
      const o = P.length / 3;
      P.push(...a, ...b, ...c);
      N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      I.push(o, o + 1, o + 2);
    };
    const quad = (a, b, c, d, h) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const dot = (uy * vz - uz * vy) * h[0] + (uz * vx - ux * vz) * h[1] + (ux * vy - uy * vx) * h[2];
      if (dot >= 0) { tri(a, b, c); tri(a, c, d); } else { tri(a, d, c); tri(a, c, b); }
    };
    return { quad, geo: () => meshGeo({ positions: P, normals: N, indices: I }) };
  };

  // ---- floorSlab: closed swept prism on the station outline
  const slab = mk();
  for (let i = 0; i < Zs.length - 1; i++) {
    const z0 = Zs[i], z1 = Zs[i + 1], x0 = Ws[i], x1 = Ws[i + 1];
    slab.quad([-x0, YS, z0], [x0, YS, z0], [x1, YS, z1], [-x1, YS, z1], [0, 1, 0]);
    slab.quad([-x0, Y0, z0], [x0, Y0, z0], [x1, Y0, z1], [-x1, Y0, z1], [0, -1, 0]);
    for (const sg of sides) slab.quad([sg * x0, Y0, z0], [sg * x1, Y0, z1], [sg * x1, YS, z1], [sg * x0, YS, z0], [sg, 0, 0]);
  }
  for (const [z, hz] of [[-140, -1], [140, 1]]) slab.quad([-80, Y0, z], [80, Y0, z], [80, YS, z], [-80, YS, z], [0, 0, hz]);

  // ---- walls, glazingBand, panelSeams on the refined outline
  const walls = mk(), band = mk(), seams = mk();
  for (let i = 0; i < ZR.length - 1; i++) {
    const z0 = ZR[i], z1 = ZR[i + 1];
    const inG = inGroove((z0 + z1) / 2);
    const f0 = xf(z0), f1 = xf(z1), b0 = xb(z0), b1 = xb(z1), g0 = xg(z0), g1 = xg(z1);
    for (const sg of sides) {
      const P = (x, y, z) => [sg * x, y, z];
      const h = [sg, 0, 0];
      walls.quad(P(f0, YS, z0), P(f1, YS, z1), P(f1, GY0, z1), P(f0, GY0, z0), h);
      if (!inG) {
        walls.quad(P(f0, GY0, z0), P(f1, GY0, z1), P(f1, YB0, z1), P(f0, YB0, z0), h);
        walls.quad(P(f0, YB1, z0), P(f1, YB1, z1), P(f1, YT, z1), P(f0, YT, z0), h);
      } else {
        seams.quad(P(g0, GY0, z0), P(g1, GY0, z1), P(g1, YB0, z1), P(g0, YB0, z0), h);
        seams.quad(P(g0, YB1, z0), P(g1, YB1, z1), P(g1, YT, z1), P(g0, YT, z0), h);
        seams.quad(P(g0, GY0, z0), P(f0, GY0, z0), P(f1, GY0, z1), P(g1, GY0, z1), [0, 1, 0]);
      }
      const o0 = inG ? g0 : f0, o1 = inG ? g1 : f1;
      walls.quad(P(o0, YB0, z0), P(o1, YB0, z1), P(b1, YB0, z1), P(b0, YB0, z0), [0, 1, 0]);
      walls.quad(P(o0, YB1, z0), P(o1, YB1, z1), P(b1, YB1, z1), P(b0, YB1, z0), [0, -1, 0]);
      band.quad(P(b0, YB0, z0), P(b1, YB0, z1), P(b1, YB1, z1), P(b0, YB1, z0), h);
    }
  }
  for (const [a, b] of G) for (const sg of sides) {
    const P = (x, y, z) => [sg * x, y, z];
    for (const [z, hz] of [[a, 1], [b, -1]]) {
      const f = xf(z), g = xg(z);
      seams.quad(P(g, GY0, z), P(f, GY0, z), P(f, YB0, z), P(g, YB0, z), [0, 0, hz]);
      seams.quad(P(g, YB1, z), P(f, YB1, z), P(f, YT, z), P(g, YT, z), [0, 0, hz]);
    }
  }
  for (const [z, hz] of [[-140, -1], [140, 1]]) {
    const f = xf(z), b = xb(z);
    walls.quad([-f, YS, z], [f, YS, z], [f, YB0, z], [-f, YB0, z], [0, 0, hz]);
    walls.quad([-f, YB1, z], [f, YB1, z], [f, YT, z], [-f, YT, z], [0, 0, hz]);
    walls.quad([-b, YB0, z], [b, YB0, z], [b, YB1, z], [-b, YB1, z], [0, 0, hz]);
  }

  // ---- roof plane on the station outline
  const roof = mk();
  for (let i = 0; i < Zs.length - 1; i++) {
    const z0 = Zs[i], z1 = Zs[i + 1], f0 = Ws[i] - LEDGE, f1 = Ws[i + 1] - LEDGE;
    roof.quad([-f0, YT, z0], [f0, YT, z0], [f1, YT, z1], [-f1, YT, z1], [0, 1, 0]);
  }

  // ---- edgeLights: closed swept strips, Z -140..140 without gaps
  const lights = mk();
  const strip = (sg, xi, xo, y0, y1) => {
    const P = (x, y, z) => [sg * x, y, z];
    for (let i = 0; i < Zs.length - 1; i++) {
      const z0 = Zs[i], z1 = Zs[i + 1];
      const i0 = xi(z0), i1 = xi(z1), o0 = xo(z0), o1 = xo(z1);
      lights.quad(P(i0, y1, z0), P(o0, y1, z0), P(o1, y1, z1), P(i1, y1, z1), [0, 1, 0]);
      lights.quad(P(i0, y0, z0), P(o0, y0, z0), P(o1, y0, z1), P(i1, y0, z1), [0, -1, 0]);
      lights.quad(P(o0, y0, z0), P(o1, y0, z1), P(o1, y1, z1), P(o0, y1, z0), [sg, 0, 0]);
      lights.quad(P(i0, y0, z0), P(i1, y0, z1), P(i1, y1, z1), P(i0, y1, z0), [-sg, 0, 0]);
    }
    for (const [z, hz] of [[-140, -1], [140, 1]])
      lights.quad(P(xi(z), y0, z), P(xo(z), y0, z), P(xo(z), y1, z), P(xi(z), y1, z), [0, 0, hz]);
  };
  if (!far) for (const sg of sides) {
    strip(sg, z => xf(z) - RSW, xf, YT, YT + RSH);
    strip(sg, xf, wPoly, YS, YS + SSH);
  }

  // ---- materials (contract palette)
  const mat = (name, color, o) => { const m = gameMaterial(color, o); m.name = name; return m; };
  const mClad = mat('cladding-steel', 0xC9CDD1, { metalness: 1.0, roughness: 0.30 });
  const mRoof = mat('roof-steel', 0xBFC4C9, { metalness: 1.0, roughness: 0.40 });
  const mPlinth = mat('plinth-graphite', 0x1C2128, { metalness: 0.3, roughness: 0.60 });
  const mGlaze = mat('glazing-dark', 0x1E2A33, { metalness: 0.0, roughness: 0.15 });
  const mLit = mat('edge-lit', 0xFFE7C2, { metalness: 0.0, roughness: 0.40, emissive: 0xFFE7C2, emissiveIntensity: 1.0 });

  const root = createRoot(far ? 's5-split-bridge-far' : 's5-split-bridge');
  const part = (name, mb, m) => { const p = createPart(name, mb.geo(), m, { parent: root }); p.name = name; return p; };
  part('floorSlab', slab, mPlinth);
  part('walls', walls, mClad);
  part('roof', roof, mRoof);
  part('glazingBand', band, mGlaze);
  if (!far) { part('edgeLights', lights, mLit); part('panelSeams', seams, mClad); }
  for (const [nm, z] of [['centre', 0], ['faceW', -110], ['faceE', 110], ['landingW', -140], ['landingE', 140]]) {
    const p = createPivot(nm, [0, YS, z], root);
    p.name = nm;
  }
  return root;
}
