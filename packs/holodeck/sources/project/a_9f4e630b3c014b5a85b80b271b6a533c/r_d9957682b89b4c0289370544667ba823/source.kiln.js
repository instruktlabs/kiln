// Meridian Sanctuary water (plan.md sections 4.3 and 4.6, assets 27-31).
// One program builds every water piece; PIECE selects which one this revision is.
// Moving sheets are alpha-blended, double-sided and bound to Holodeck's asset.flow by their
// Mesh_<name> node: every map scrolls along V at the asset's speed. V is laid out as the
// water's travel time (seconds, at flow speed [0, 1]), so the pattern moves with the water:
// slowly in a spout or over a lip, fast and stretched as it falls. Froth fans at the foot of a
// fall use V as distance from the impact, so their bubbles drift outward. Mist cards are a
// separate, static node.
const meta = { name: 'Meridian water' };
const PIECE = 'overflow-wide';

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const G = 9.81;

// ---------------------------------------------------------------- textures
// Falling water, 512 x 256. The streak region (all of it, or columns 0-383 when the piece has
// froth) holds a faint white base, streaks of strongly varying alpha (mostly faint, a few
// bright bands of white water) in clusters with open gaps, soft patches and drawn-out
// droplets. Columns 384-511 hold froth: overlapping bubbles. Streaks are full-height lines and
// stamps stay inside their region, so the image tiles along V as it scrolls. The emissive twin
// repeats the strokes over dark teal: a little self-light for water seen against the sun.
const FROTH_U = 0.75; // where the froth region starts, as a share of the width
function sheetTextures(seed, o) {
  const R = rng(seed), Wd = o.froth ? 384 : 512, strokes = [];
  let x = 3 + R() * 12;
  for (let i = 0; i < o.lines; i++) {
    const bright = R() < o.bright;
    strokes.push({ x: Math.round(x), w: bright ? 5 + Math.floor(R() * 9) : 1 + Math.floor(R() * R() * 4),
      a: bright ? 150 + Math.floor(R() * 80) : 30 + Math.floor(R() * R() * 190) });
    x += R() < 0.3 ? 1 + R() * 4 : 4 + R() * ((2 * Wd) / o.lines);
    if (x > Wd - 6) x = 3 + R() * 60;
  }
  const ops = (rgb) => {
    const list = [{ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 40, height: 110 }, rgba: [...rgb, 34], count: 14, seed: seed + 3,
      area: { x: 1, y: 1, width: Wd - 42, height: 144 } }];
    for (const s of strokes) list.push({ op: 'paint', shape: { kind: 'line', from: [s.x, -4], to: [s.x, 260], width: s.w }, rgba: [...rgb, s.a] });
    list.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 3, height: 22 }, rgba: [...rgb, 150], count: o.drops, seed: seed + 1,
      area: { x: 1, y: 1, width: Wd - 4, height: 231 } });
    if (o.froth) {
      for (const [w, h, a, n, k] of [[18, 14, 120, 40, 4], [10, 8, 170, 60, 5], [5, 4, 210, 30, 6]]) {
        list.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: w, height: h }, rgba: [...rgb, a], count: n, seed: seed + 10 * k,
          area: { x: 386, y: 1, width: 124 - w, height: 254 - h } });
      }
    }
    return list;
  };
  const albedo = proceduralTexture({ schemaVersion: 3, width: 512, height: 256, usage: 'albedo', background: [...o.tint, o.base], operations: ops([248, 253, 253]) });
  const emissive = proceduralTexture({ schemaVersion: 3, width: 512, height: 256, usage: 'emissive', background: [36, 48, 52, 255], operations: ops([224, 240, 242]) });
  // height for the normal map: fine vertical ridges, so the sheet catches long specular lines
  const height = proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', layers: [
    { op: 'stripes', colorA: 0x707070, colorB: 0x909090, count: 22, angleDeg: 0 },
    { op: 'noise', colorA: 0x606060, colorB: 0xa0a0a0, scale: 8, octaves: 3, seed, blend: 'overlay', opacity: 0.5 },
  ] });
  return { albedo, emissive, normal: normalMapFromHeight(height, { strength: o.relief }) };
}
function sheetMaterial(seed, o) {
  const t = sheetTextures(seed, o);
  return pbrMaterial({ albedo: t.albedo, normal: t.normal, emissive: t.emissive, emissiveIntensity: o.glow,
    roughness: 0.08, metalness: 0, alphaMode: 'blend', doubleSided: true });
}
// Mist and spray: a soft white blob, built up from stacked faint ellipses and cloudy puffs, with
// a near-zero (not zero) alpha floor so filtering never darkens its edge.
function mistMaterial(seed, peak) {
  const ops = [];
  for (let k = 0; k < 18; k++) {
    const s = 126 - k * 6;
    ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 64 - s / 2, y: Math.round(64 - s / 3.2), width: s, height: Math.round(s / 1.6) }, rgba: [255, 255, 255, peak] });
  }
  ops.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 30, height: 24 }, rgba: [255, 255, 255, 14], count: 40, seed, area: { x: 20, y: 24, width: 78, height: 70 } });
  const albedo = proceduralTexture({ schemaVersion: 3, width: 128, height: 128, usage: 'albedo', background: [255, 255, 255, 2], operations: ops });
  const white = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'emissive', layers: [{ op: 'solid', color: 0xffffff }] });
  // Single-sided (one draw); card() emits every card both ways round instead.
  return pbrMaterial({ albedo, emissive: white, emissiveIntensity: 0.3, roughness: 1, metalness: 0, alphaMode: 'blend', doubleSided: false });
}
// Foam lying on the water round a fall's foot (turn 10: the reviews of revision 12 read the
// standing spray cards as cotton-ball sprites on the wall, cut flat at the waterline). Rows run
// out from the impact: a dense bubbly band near it thinning to nothing at the rim, with one faint
// ripple ring, so the foam has a soft edge; columns tile round the ring.
function foamMaterial(seed) {
  // turn 15 (round 5: a dark ellipse at each fall's foot): denser and self-lit, so the ring reads
  // white against the mirrored water round it instead of a duller ring in it
  const W = 256, H = 128, ops = [];
  for (const [y0, h, a] of [[0, 18, 196], [18, 22, 132], [40, 26, 66], [66, 30, 22]]) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: y0, width: W, height: h }, rgba: [252, 254, 254, a] });
  for (const [y, h, w, bh, a, n, k] of [[1, 44, 9, 6, 200, 70, 1], [10, 60, 6, 4, 170, 60, 2], [30, 66, 4, 3, 130, 40, 3]]) {
    ops.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: w, height: bh }, rgba: [255, 255, 255, a], count: n, seed: seed + k, area: { x: 1, y, width: W - w - 2, height: h } });
  }
  ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, 90], to: [W + 4, 90], width: 2 }, rgba: [255, 255, 255, 34] });
  const albedo = proceduralTexture({ schemaVersion: 3, width: W, height: H, usage: 'albedo', background: [255, 255, 255, 2], operations: ops });
  const white = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'emissive', layers: [{ op: 'solid', color: 0xffffff }] });
  return pbrMaterial({ albedo, emissive: white, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0, alphaMode: 'blend', doubleSided: false });
}
// turn 15 (round 5: the falls read as strings, with no bright lip): white water where a sheet
// curls over its edge, densest at the top and thinning into the sheet; it is not a flow node, so
// the curl holds still while the sheet below it runs.
function lipMaterial(seed) {
  const W = 256, H = 64, R = rng(seed), ops = [];
  for (const [y0, h, a] of [[0, 10, 236], [10, 12, 196], [22, 14, 132], [36, 14, 70], [50, 14, 20]]) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: y0, width: W, height: h }, rgba: [252, 254, 254, a] });
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(R() * W);
    ops.push({ op: 'paint', shape: { kind: 'line', from: [x, -2], to: [x, Math.round(40 + R() * 24)], width: 2 + Math.floor(R() * 5) }, rgba: [255, 255, 255, 120 + Math.floor(R() * 100)] });
  }
  const albedo = proceduralTexture({ schemaVersion: 3, width: W, height: H, usage: 'albedo', background: [255, 255, 255, 2], operations: ops });
  const white = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'emissive', layers: [{ op: 'solid', color: 0xffffff }] });
  return pbrMaterial({ albedo, emissive: white, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0, alphaMode: 'blend', doubleSided: true });
}
// Still basin water: azure turquoise (blue at least green) of medium alpha with slow ripples
// (the normal map drifts), and a faint turquoise emission so it stays turquoise in shade.
function basinMaterial() {
  const albedo = proceduralTexture({ schemaVersion: 3, width: 256, height: 256, usage: 'albedo', background: [0, 0, 0, 0], operations: [
    { op: 'legacy-v2', alpha: 168, spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers: [
      { op: 'noise', colorA: 0x1d8cb0, colorB: 0x36b0d2, scale: 3, octaves: 3, seed: 71 }] } },
  ] });
  const height = proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0x585858, colorB: 0xa8a8a8, scale: 6, octaves: 4, seed: 72 }] });
  const glow = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'emissive', layers: [{ op: 'solid', color: 0x2a9cbc }] });
  return pbrMaterial({ albedo, normal: normalMapFromHeight(height, { strength: 0.9 }), emissive: glow, emissiveIntensity: 0.3, roughness: 0.03, metalness: 0, alphaMode: 'blend' });
}
// The overflow weir: white marble with soft veins, and a dark strip (bottom rows) for the
// slot the water leaves from.
function weirMaterial() {
  const R = rng(91), ops = [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xe9e6e1, colorB: 0xfcfbf9, scale: 3, octaves: 4, seed: 91 }] } }];
  for (let i = 0; i < 4; i++) {
    const y0 = Math.floor(R() * 200), y1 = y0 + Math.floor((R() - 0.5) * 60);
    ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, y0], to: [260, y1], width: 1 }, rgba: [168, 161, 152, 255], opacity: 110 });
  }
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 232, width: 256, height: 24 }, rgba: [168, 162, 152, 255] }); // turn 15: a shadowed recess (it read as a near-black bar)
  return pbrMaterial({ albedo: proceduralTexture({ schemaVersion: 3, width: 256, height: 256, usage: 'albedo', operations: ops }), roughness: 0.25, metalness: 0 });
}

// ---------------------------------------------------------------- geometry
// Mesh accumulator: several sweeps, fans and cards can share one node.
function makeMesh() {
  const M = { P: [], N: [], T: [], I: [] };
  M.quad = (a, b, c, d, n, uv) => { // a b c d counterclockwise seen from n's side
    const base = M.P.length / 3;
    for (const [i, v] of [a, b, c, d].entries()) { M.P.push(...v); M.N.push(...n); M.T.push(...uv[i]); }
    M.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  M.geo = () => meshGeo({ positions: M.P, normals: M.N, uvs: M.T, indices: M.I });
  return M;
}
// A sheet swept along one axis from a cross-section profile of [p, y, t] points (p across the
// face, y up, t the water's travel time), into mesh M. axis 'x': p is local z (falls on a +Z
// face); axis 'z': p is local x (spills off a +X edge). u runs from u0 at uPerMetre;
// widthAt(t, i) narrows or roughens the sweep about its middle without changing u.
function sweep(M, profile, axis, a0, a1, u0, uPerMetre, widthAt = () => 1) {
  const mid = (a0 + a1) / 2, base = M.P.length / 3;
  profile.forEach(([p, y, t], i) => {
    const prev = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 1)];
    const dp = next[0] - prev[0], dy = next[1] - prev[1], l = Math.hypot(dp, dy) || 1, np = -dy / l, ny = dp / l; // outward/up
    for (const [k, a] of [a0, a1].entries()) {
      const w = mid + (a - mid) * widthAt(t, i, k);
      M.P.push(...(axis === 'x' ? [w, y, p] : [p, y, w]));
      M.N.push(...(axis === 'x' ? [0, ny, np] : [np, ny, 0]));
      M.T.push(u0 + (a - a0) * uPerMetre, t);
    }
  });
  const at = (k) => M.P.slice(3 * k, 3 * k + 3);
  for (let i = 0; i + 1 < profile.length; i++) {
    const v00 = base + 2 * i, v01 = v00 + 1, v10 = v00 + 2, v11 = v00 + 3;
    // wind each quad so its geometric normal agrees with the supplied normal
    const e1 = at(v10).map((v, j) => v - at(v00)[j]), e2 = at(v11).map((v, j) => v - at(v00)[j]);
    const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const n = M.N.slice(3 * v00, 3 * v00 + 3);
    if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0) M.I.push(v00, v10, v11, v00, v11, v01); else M.I.push(v00, v11, v10, v00, v01, v11);
  }
}
// turn 15: the lip band, the profile's channel and curl (to time tEnd) swept again a few
// millimetres proud of the sheet, its v running 0 - 1 down the band.
function lipBand(M, profile, axis, a0, a1, tEnd, lift = 0.006) {
  const base = M.P.length / 3, pts = profile.filter(([, , t]) => t <= tEnd);
  sweep(M, pts, axis, a0, a1, 0, 1 / (a1 - a0));
  for (let k = base; k < M.P.length / 3; k++) {
    for (let j = 0; j < 3; j++) M.P[3 * k + j] += lift * M.N[3 * k + j];
    M.T[2 * k + 1] /= tEnd;
  }
}
// Low mist where a fall meets the water: wide, faint cards standing just clear of the face,
// centred well above the surface so none is cut by it.
function mistAt(M, c, w, h, n, R) {
  for (let i = 0; i < n; i++) card(M, [c[0] + (R() - 0.5) * w * 0.4, c[1] + h * (0.45 + 0.1 * R()), c[2] + 0.1 + 0.3 * R()], w * (0.8 + 0.4 * R()), h, (R() - 0.5) * 1.1);
}
// Water that runs along a channel at speed v, then leaves its edge at (p0, y0) at speed v0 and
// falls ballistically to yEnd: [p, y, t] points with t from 0 at the channel's start.
function trajectory(channel, v, p0, y0, yEnd, steps, v0 = v) {
  const pts = channel.map(([p, y]) => [p, y, (p - channel[0][0]) / v]), t0 = pts[pts.length - 1][2];
  const tEnd = Math.sqrt((2 * (y0 - yEnd)) / G);
  for (let k = 1; k <= steps; k++) {
    const tau = tEnd * (k / steps) ** 1.4; // denser near the lip, where the sheet curls
    pts.push([p0 + v0 * tau, y0 - 0.5 * G * tau * tau, t0 + tau]);
  }
  return pts;
}
// A flat froth fan on the water at height y around an impact at (0, cz), spread rx by rz in
// front of it (+Z), from radius r0 to 1: froth-region u across the fan, v = distance / 0.3 m,
// so flow speed [0, 1] carries the bubbles outward at 0.3 m/s.
function frothFan(M, cz, y, rx, rz, r0 = 0.12) {
  const rings = [r0, 0.3, 0.5, 0.72, 1.0], fan = 12;
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < fan; j++) {
    const pt = (r, k) => { const th = -Math.PI / 2 + (Math.PI * k) / fan; return [rx * r * Math.sin(th), y, cz + rz * r * Math.cos(th)]; };
    const uv = (r, k) => [FROTH_U + ((1 - FROTH_U) * k) / fan, ((r - r0) * Math.max(rx, rz)) / 0.3];
    const [ra, rb] = [rings[i], rings[i + 1]];
    M.quad(pt(ra, j), pt(ra, j + 1), pt(rb, j + 1), pt(rb, j), [0, 1, 0], [uv(ra, j), uv(ra, j + 1), uv(rb, j + 1), uv(rb, j)].map(([u, v]) => [u, v]));
  }
}
// A flat foam ring on the water at height y round an impact at (0, cz), facing up: from radius
// r0 to 1 of rx by rz, over angles within a of straight out (+Z), so it wraps a little toward the
// wall; u tiles round it, v runs from the inner edge (0) to the outer (1), where the foam fades.
function foamRing(M, cz, y, rx, rz, r0, a = 1.95) {
  const rings = [r0, r0 + (1 - r0) * 0.3, r0 + (1 - r0) * 0.62, 1.0], fan = 14;
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < fan; j++) {
    const pt = (r, k) => { const th = -a + (2 * a * k) / fan; return [rx * r * Math.sin(th), y, cz + rz * r * Math.cos(th)]; };
    const uv = (r, k) => [(2 * k) / fan, (r - r0) / (1 - r0)];
    const [ra, rb] = [rings[i], rings[i + 1]];
    M.quad(pt(ra, j), pt(ra, j + 1), pt(rb, j + 1), pt(rb, j), [0, 1, 0], [uv(ra, j), uv(ra, j + 1), uv(rb, j + 1), uv(rb, j)]);
  }
}
// A vertical card of width w and height h centred at c, facing yaw (radians about +Y from +Z),
// emitted both ways round so a single-sided material shows it from either side.
function card(M, c, w, h, yaw) {
  const ax = [Math.cos(yaw), 0, -Math.sin(yaw)], n = [Math.sin(yaw), 0, Math.cos(yaw)];
  const p = (s, t) => [c[0] + ax[0] * s * w / 2, c[1] + t * h / 2, c[2] + ax[2] * s * w / 2];
  M.quad(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), n, [[0, 1], [1, 1], [1, 0], [0, 0]]);
  M.quad(p(-1, 1), p(1, 1), p(1, -1), p(-1, -1), n.map((v) => -v), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}
// A box with per-face UVs mapped into a texture window [u0, v0, u1, v1].
function boxInto(B, lo, hi, win, skip = []) {
  const faces = [
    ['px', [[hi[0], lo[1], hi[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]]]],
    ['nx', [[lo[0], lo[1], lo[2]], [lo[0], lo[1], hi[2]], [lo[0], hi[1], hi[2]], [lo[0], hi[1], lo[2]]]],
    ['py', [[lo[0], hi[1], hi[2]], [hi[0], hi[1], hi[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]]]],
    ['ny', [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], lo[1], hi[2]], [lo[0], lo[1], hi[2]]]],
    ['pz', [[lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]]],
    ['nz', [[hi[0], lo[1], lo[2]], [lo[0], lo[1], lo[2]], [lo[0], hi[1], lo[2]], [hi[0], hi[1], lo[2]]]],
  ];
  const nrmOf = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
  for (const [f, q] of faces) {
    if (skip.includes(f)) continue;
    const [u0, v0, u1, v1] = win;
    B.quad(q[0], q[1], q[2], q[3], nrmOf[f], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
  }
}

// ---------------------------------------------------------------- pieces
// Falls from a cascade tower's spout, in the tower's frame: spout floor 4.2 m, its back at
// z 1.65 and its lip on the face at z 2.0; the pool or basin surface is 0.9 m above the
// tower's base. A bright white ribbon runs 2.5 cm deep along the spout at 0.5 m/s, falls
// 3.4 m and lands about 0.4 m out from the face, where bubbling froth drifts out from the
// impact and a ring of foam lies on the water round it (turn 10: no standing spray cards).
// turn 15 (round 5: strings, a pale band under the waterline and a dark ring at the foot): the
// sheet ends at the basin surface, denser and brighter, under a bright lip; the foam ring is
// self-lit, and faint mist stands low in front of the impact.
const FALLS = { half: 0.78, profile: () => trajectory([[1.68, 4.225], [1.84, 4.225], [2.0, 4.225]], 0.5, 2.0, 4.225, 0.905, 12),
  widthAt: (t) => (t <= 0.64 ? 1 : 1 - 0.07 * Math.sin(Math.min(1, (t - 0.64) / 0.83) * Math.PI * 0.8)) };
function fallsPiece() {
  const M = makeMesh(), profile = FALLS.profile(), cz = profile[profile.length - 1][0];
  sweep(M, profile, 'x', -FALLS.half, FALLS.half, 0, FROTH_U / (2 * FALLS.half), FALLS.widthAt);
  frothFan(M, cz, 0.925, 0.55, 0.45);
  const F = makeMesh(), L = makeMesh(), S = makeMesh();
  foamRing(F, cz, 0.93, 1.5, 1.25, 0.367); // from the froth's edge (0.55 by 0.45 m) to 1.5 by 1.25 m
  lipBand(L, profile, 'x', -FALLS.half, FALLS.half, 0.94);
  mistAt(S, [0, 0.9, cz], 2.6, 1.0, 2, rng(14));
  return [['falls_sheet', M.geo(), sheetMaterial(11, { tint: [236, 248, 250], base: 104, lines: 40, bright: 0.3, drops: 110, relief: 2.2, glow: 0.75, froth: true })],
    ['falls_lip', L.geo(), lipMaterial(15)], ['falls_foam', F.geo(), foamMaterial(12)], ['falls_mist', S.geo(), mistMaterial(13, 6)]];
}
// Falls from a rim tower's cornice into the cloud sea (turn 10, rule 7: water spilling into the
// cloud sea in view of the arrival; the pools' own rim spills fall below the lip, out of sight
// from eye height), in the cornice's frame: its face is z = 0 (+Z outward) and its top y = 0. A
// bright ribbon 2.2 m wide runs 3 cm deep over the cornice at 0.6 m/s and leaves its edge in
// tongues of different widths that arc 2 - 4 m out and narrow as they fall 100 - 108 m.
function towerFallsPiece() {
  const M = makeMesh(), R = rng(53), half = 1.1, L = makeMesh(), head = trajectory([[-0.3, 0.03], [-0.12, 0.03], [0, 0.03]], 0.6, 0, 0.03, -0.35, 4);
  sweep(M, head, 'x', -half, half, 0, 1 / (2 * half));
  lipBand(L, head, 'x', -half, half, 0.62); // turn 15: a bright lip over the cornice
  for (let x = -half; x < half - 0.1;) {
    const w = Math.min(0.24 + R() * 0.42, half - x), v0 = 0.5 + R() * 0.4, yEnd = -100 - R() * 8, jitter = rng(Math.floor(R() * 1e6));
    const wob = Array.from({ length: 64 }, () => 0.84 + 0.32 * jitter());
    const profile = trajectory([[0, 0.03]], 0.6, 0, 0.03, yEnd, 18, v0).map(([p, y, t]) => [p, y, t + 0.5]);
    const narrow = 0.35 + 0.3 * R();
    sweep(M, profile, 'x', x, x + w, R(), 1 / 2, (t, i, k) => (1 - (1 - narrow) * Math.min(1, (t - 0.5) / 2.5)) * (i > 1 ? wob[2 * i + k] : 1));
    x += w + 0.04 + R() * 0.12;
  }
  return [['falls_sheet', M.geo(), sheetMaterial(53, { tint: [236, 248, 250], base: 96, lines: 50, bright: 0.34, drops: 130, relief: 2.0, glow: 0.7 })],
    ['falls_lip', L.geo(), lipMaterial(54)]];
}
// Overflow weir on a terrace wall, in the wall's frame: the face is z = 0 (+Z toward the pool)
// and y = 0 is the terrace top. A marble ledge 4.2 m wide projects 0.2 m at y -0.36..-0.26
// under a dark slot; the sheet slides over it at 0.4 m/s and falls 2.3 m to 5 cm under the
// pool surface (y -2.5), with a froth band where it lands.
function overflowPiece() {
  const B = makeMesh(), marble = [0.02, 0.02, 0.98, 0.86], dark = [0.02, 0.92, 0.98, 0.98];
  boxInto(B, [-2.1, -0.36, 0], [2.1, -0.26, 0.2], marble, ['nz']);
  boxInto(B, [-2.0, -0.26, 0], [2.0, -0.17, 0.004], dark, ['nz', 'ny', 'py', 'px', 'nx']);
  // turn 15: the sheet stops at the pool surface (it showed through the water as a pale band),
  // under a bright lip, with faint mist at its foot
  const M = makeMesh(), profile = trajectory([[0.006, -0.24], [0.1, -0.243], [0.2, -0.245]], 0.4, 0.2, -0.245, -2.49, 12);
  sweep(M, profile, 'x', -1.95, 1.95, 0, FROTH_U / 3.9);
  const L = makeMesh(), S = makeMesh();
  lipBand(L, profile, 'x', -1.95, 1.95, 0.9);
  mistAt(S, [0, -2.5, profile[profile.length - 1][0]], 3.6, 0.9, 2, rng(24));
  for (let j = 0; j < 6; j++) { // froth band on the pool, drifting outward
    const xa = -1.95 + 0.65 * j, xb = xa + 0.65, y = -2.475, ua = FROTH_U + ((1 - FROTH_U) * j) / 6, ub = FROTH_U + ((1 - FROTH_U) * (j + 1)) / 6;
    M.quad([xa, y, 0.3], [xb, y, 0.3], [xb, y, 1.25], [xa, y, 1.25], [0, 1, 0], [[ua, 0], [ub, 0], [ub, 0.95 / 0.3], [ua, 0.95 / 0.3]]);
  }
  return [['overflow_weir', B.geo(), weirMaterial()],
    ['overflow_sheet', M.geo(), sheetMaterial(23, { tint: [236, 248, 250], base: 96, lines: 52, bright: 0.3, drops: 100, relief: 1.6, glow: 0.7, froth: true })],
    ['overflow_lip', L.geo(), lipMaterial(25)], ['overflow_mist', S.geo(), mistMaterial(26, 6)]];
}
// Rim spill over an infinity lip, in the lip's frame: x = 0 is the pool's water edge (+X
// outward), y = 0 the water level, z along the lip (±11.95). Water slides 1 cm deep over the
// 0.25 m coping at 0.3 m/s along the whole lip, then breaks into ragged ribbons of different
// widths, arcs and lengths that narrow as they fall 22 - 30 m into the cloud deck; mist hangs
// where they meet the deck.
const SPILL = { half: 11.95 };
function spillPiece() {
  const M = makeMesh(), R = rng(37), lip = [[-0.02, -0.004], [0.1, -0.008], [0.25, -0.012]], head = trajectory(lip, 0.3, 0.25, -0.012, -0.3, 4);
  sweep(M, head, 'z', -SPILL.half, SPILL.half, 0, 1 / 3);
  const L = makeMesh();
  lipBand(L, head, 'z', -SPILL.half, SPILL.half, 1.2); // turn 15: a bright lip along the whole edge
  for (let z = -SPILL.half + R() * 0.3; z < SPILL.half - 0.3;) {
    // turn 15 (round 5: a striped wall of strings): mostly broad sheets 1.4 - 3.6 m wide with
    // tight gaps, a few narrow tongues, each thinning as it falls; arcs from 0.16 to 0.5 m/s
    const w = Math.min(R() < 0.15 ? 0.4 + R() * 0.5 : 1.4 + R() * 2.2, SPILL.half - z), v0 = 0.16 + R() * 0.34;
    const yEnd = -92 - R() * 12, seed = Math.floor(R() * 1e6), jitter = rng(seed); // turn 8: into the deck, now 80 m down
    const wob = Array.from({ length: 64 }, () => 0.82 + 0.36 * jitter());
    const profile = trajectory([[0.25, -0.012]], 0.3, 0.25, -0.012, yEnd, 16, v0).map(([p, y, t]) => [p, y, t + 0.9]);
    const narrow = 0.3 + 0.35 * R(); // how much of its width each tongue keeps at the bottom
    sweep(M, profile, 'z', z, z + w, R(), 1 / 3, (t, i, k) => (1 - (1 - narrow) * Math.min(1, (t - 0.9) / 2.2)) * (i > 1 ? wob[2 * i + k] : 1));
    z += w + (R() < 0.2 ? 0.3 + R() * 0.6 : 0.03 + R() * 0.15);
  }
  const S = makeMesh();
  // crossed mist cards, kept inside the lip's length (each reaches 3.44 m along z)
  for (const zc of [-8, -2.8, 2.6, 7.6]) for (const yaw of [Math.PI / 2 - 0.7, Math.PI / 2 + 0.7]) card(S, [1.0 + 1.2 * R(), -78 + R() * 2, zc + R() - 0.5], 9, 5.5, yaw);
  return [['spill_sheet', M.geo(), sheetMaterial(37, { tint: [236, 248, 250], base: 64, lines: 52, bright: 0.3, drops: 130, relief: 1.8, glow: 0.62 })],
    ['spill_lip', L.geo(), lipMaterial(39)], ['spill_mist', S.geo(), mistMaterial(38, 12)]];
}
// Still water over a T1 basin: 8 x 16 m at the surface (y = 0), 2 mm inside the basin walls,
// with ripple UVs at 2 m per repeat.
function basinPiece() {
  const hx = 3.998, hz = 7.998;
  const geo = meshGeo({ positions: [-hx, 0, hz, hx, 0, hz, hx, 0, -hz, -hx, 0, -hz], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 8, 4, 8, 4, 0, 0, 0], indices: [0, 1, 2, 0, 2, 3] });
  return [['basin_surface', geo, basinMaterial()]];
}

// Review only (never saved): the falls in front of a stand-in tower and pool, and the overflow
// on a stand-in wall over a stand-in pool.
function previewPieces() {
  const stone = pbrMaterial({ albedo: proceduralTexture({ schemaVersion: 2, size: 64, usage: 'albedo', layers: [{ op: 'noise', colorA: 0xe7dfd0, colorB: 0xf8f4ec, scale: 4, octaves: 2, seed: 5 }] }), roughness: 0.7, metalness: 0 });
  const pool = pbrMaterial({ albedo: proceduralTexture({ schemaVersion: 2, size: 4, usage: 'albedo', layers: [{ op: 'solid', color: 0x2fa8b0 }] }), roughness: 0.1, metalness: 0 });
  const box = (lo, hi) => { const B = makeMesh(); boxInto(B, lo, hi, [0, 0, 1, 1]); return B.geo(); };
  const shift = (geo, d) => { geo.translate(d[0], d[1], d[2]); return geo; };
  const out = [['stand_tower', box([-2, 0, -2], [2, 6.4, 2]), stone], ['stand_pool', box([-6, 0, 2], [12, 0.9, 7]), pool]];
  for (const piece of fallsPiece()) out.push(piece);
  out.push(['stand_wall', box([4, -0.5, -2], [10, 3.4, 2]), stone]);
  for (const [name, geo, mat] of overflowPiece()) out.push([name, shift(geo, [7, 3.4, 2]), mat]);
  return out;
}

const PIECES = { 'falls-narrow': fallsPiece, 'overflow-wide': overflowPiece, 'rim-spill': spillPiece, 'basin-water': basinPiece, 'tower-falls': towerFallsPiece, 'preview-water': previewPieces };

async function build() {
  const root = createRoot(PIECE);
  for (const [name, geo, mat] of PIECES[PIECE]()) createPart(name, geo, mat, { parent: root });
  return root;
}
