// ---- Shared fence-kit dimensions (identical in fence-straight, fence-corner, fence-gate) ----
const KIT = {
  post: 0.15,          // square post section (m)
  postChamfer: 0.018,  // vertical edge chamfer
  postShaft: 1.1,      // height of the vertical shaft
  postCapRise: 0.06,   // chamfered (truncated-pyramid) weathering top
  postCapInset: 0.035,
  railH: 0.12,         // rail depth (Y)
  railT: 0.06,         // rail thickness (Z)
  railChamfer: 0.012,
  railY: [0.42, 0.86], // rail centre heights, shared by every module
  railEmbed: 0.02,     // rail tenon hidden inside the post (no exposed end caps)
  bay: 2.0,            // post-centre spacing
};
const HALF = KIT.post / 2;

const WOOD_SPEC = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Farm honey wood (subdued grain derivative)","baseColor":0xF0B47A,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness"}}};
// Pinned farm-brushed-metal, darkened by base-colour factor for forged/blackened fittings.
const METAL_SPEC = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Brushed neutral metal (dark fittings factor)","baseColor":0x4a4845,"roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.metallic-roughness"}}};

// Grain runs along texture V; U crosses the timber. UVs are in metres (material tile = 1 m).
const GRAIN_ALONG_V = true;

const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Accumulates flat-shaded faces for one material into a single draw.
function makeBatch() { return { p: [], n: [], uv: [], idx: [] }; }
function pushPoly(b, pts, uvs, normal) {
  const base = b.p.length / 3;
  let nrm = normal;
  if (!nrm) nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  for (let i = 0; i < pts.length; i++) {
    b.p.push(pts[i][0], pts[i][1], pts[i][2]);
    b.n.push(nrm[0], nrm[1], nrm[2]);
    const uv = GRAIN_ALONG_V ? uvs[i] : [uvs[i][1], uvs[i][0]];
    b.uv.push(uv[0], uv[1]);
  }
  for (let i = 1; i < pts.length - 1; i++) b.idx.push(base, base + i, base + i + 1);
}
function batchGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Chamfered rectangular section (8 points, CCW around the axis) in (s, t) coordinates.
function section(w, h, c) {
  const a = w / 2, d = h / 2;
  if (c <= 0) return [[a, -d], [a, d], [-a, d], [-a, -d]];
  return [[a, -d + c], [a, d - c], [a - c, d], [-a + c, d], [-a, d - c], [-a, -d + c], [-a + c, -d], [a - c, -d]];
}

// Timber prism from p0 to p1. sAxis = direction of section width. Grain follows the length.
// endCap: 'flat' | 'none' ; topCap at p1: 'flat' | 'none' | { rise, inset } (chamfered weathering top)
function timber(b, p0, p1, w, h, chamfer, sHint, opts = {}) {
  const ax = norm(sub(p1, p0));
  const len = Math.hypot(...sub(p1, p0));
  let s = norm(sub(sHint, mul(ax, dot(sHint, ax))));
  const t = cross(ax, s);
  const sec = section(w, h, chamfer);
  const vOff = opts.vOffset || 0;
  const P = (pt, along, base) => add(add(add(base, mul(s, pt[0])), mul(t, pt[1])), mul(ax, along));
  let per = 0;
  for (let i = 0; i < sec.length; i++) {
    const A = sec[i], B = sec[(i + 1) % sec.length];
    const el = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const u0 = per + (opts.uOffset || 0), u1 = per + el + (opts.uOffset || 0);
    pushPoly(b, [P(A, 0, p0), P(B, 0, p0), P(B, len, p0), P(A, len, p0)],
      [[u0, vOff], [u1, vOff], [u1, vOff + len], [u0, vOff + len]]);
    per += el;
  }
  const capUV = (pt) => [pt[0] + 0.37, pt[1] + 0.61];
  if (opts.bottomCap !== 'none') {
    const pts = sec.slice().reverse();
    pushPoly(b, pts.map((q) => P(q, 0, p0)), pts.map(capUV));
  }
  const top = opts.topCap || 'flat';
  if (top === 'flat') {
    pushPoly(b, sec.map((q) => P(q, len, p0)), sec.map(capUV));
  } else if (top && top.rise) {
    const sc = (q) => [Math.sign(q[0]) * Math.max(Math.abs(q[0]) - top.inset, 0.004), Math.sign(q[1]) * Math.max(Math.abs(q[1]) - top.inset, 0.004)];
    const inner = sec.map(sc);
    for (let i = 0; i < sec.length; i++) {
      const A = sec[i], B = sec[(i + 1) % sec.length], Ai = inner[i], Bi = inner[(i + 1) % sec.length];
      pushPoly(b, [P(A, len, p0), P(B, len, p0), P(Bi, len + top.rise, p0), P(Ai, len + top.rise, p0)],
        [[A[0] + A[1], vOff + len], [B[0] + B[1], vOff + len], [B[0] + B[1], vOff + len + 0.05], [A[0] + A[1], vOff + len + 0.05]]);
    }
    pushPoly(b, inner.map((q) => P(q, len + top.rise, p0)), inner.map(capUV));
  }
}

// Axis-aligned box (for metal fittings), no chamfer.
function block(b, c, size) {
  const [x, y, z] = c, [w, h, d] = size;
  timber(b, [x, y - h / 2, z], [x, y + h / 2, z], w, d, 0, [1, 0, 0]);
}
// Hex bolt head / cylinder along an axis.
function cyl(b, p0, p1, r, sides, sHint) {
  const ax = norm(sub(p1, p0));
  const len = Math.hypot(...sub(p1, p0));
  let s = norm(sub(sHint, mul(ax, dot(sHint, ax))));
  const t = cross(ax, s);
  const ring = [];
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const P = (q, along) => add(add(add(p0, mul(s, q[0])), mul(t, q[1])), mul(ax, along));
  for (let i = 0; i < sides; i++) {
    const A = ring[i], B = ring[(i + 1) % sides];
    const u0 = (i / sides) * 2 * Math.PI * r, u1 = ((i + 1) / sides) * 2 * Math.PI * r;
    pushPoly(b, [P(A, 0), P(B, 0), P(B, len), P(A, len)], [[u0, 0], [u1, 0], [u1, len], [u0, len]]);
  }
  pushPoly(b, ring.slice().reverse().map((q) => P(q, 0)), ring.slice().reverse().map((q) => [q[0], q[1]]));
  pushPoly(b, ring.map((q) => P(q, len)), ring.map((q) => [q[0], q[1]]));
}

// Oak peg heads pinning the rail tenons, driven through the post faces.
function pegs(b, c, faceAxis, offsets) {
  KIT.railY.forEach((y) => offsets.forEach((o) => [-1, 1].forEach((sgn) => {
    const p0 = faceAxis === 'z' ? [c[0] + o, y, c[2] + sgn * (HALF - 0.004)] : [c[0] + sgn * (HALF - 0.004), y, c[2] + o];
    const p1 = faceAxis === 'z' ? [p0[0], y, p0[2] + sgn * 0.01] : [p0[0] + sgn * 0.01, y, p0[2]];
    cyl(b, p0, p1, 0.013, 6, [0, 1, 0]);
  })));
}
// One kit post in its own local frame: footprint centred at origin, base at Y=0.
function postBatch(vOffset) {
  const b = makeBatch();
  timber(b, [0, 0, 0], [0, KIT.postShaft, 0], KIT.post, KIT.post, KIT.postChamfer, [1, 0, 0],
    { topCap: { rise: KIT.postCapRise, inset: KIT.postCapInset }, vOffset });
  pegs(b, [0, 0, 0], 'z', [-0.045, 0.045]);
  return b;
}
// Two kit rails between post centres a and b (world XZ), meeting the inner post faces.
function railsBetween(b, a, c, seed) {
  const dir = norm(sub(c, a));
  const start = add(a, mul(dir, HALF - KIT.railEmbed));
  const end = sub(c, mul(dir, HALF - KIT.railEmbed));
  const across = norm(cross([0, 1, 0], dir)); // horizontal, perpendicular to the run
  KIT.railY.forEach((y, i) => {
    timber(b, add(start, [0, y, 0]), add(end, [0, y, 0]), KIT.railT, KIT.railH, KIT.railChamfer, across,
      { vOffset: seed * 0.71 + i * 0.37, uOffset: seed * 0.13 + i * 0.29 });
  });
}
function group(name, parent, pos) {
  const g = new THREE.Group();
  g.name = name;
  if (pos) g.position.set(pos[0], pos[1], pos[2]);
  parent.add(g);
  return g;
}
async function kitMaterials() {
  const wood = await compilePortableMaterialSpecV2(WOOD_SPEC);
  wood.name = 'HoneyWood';
  const metal = await compilePortableMaterialSpecV2(METAL_SPEC);
  metal.name = 'DarkFittingMetal';
  return { wood, metal };
}

const meta = { name: 'Fence Straight', role: 'fill' };

// SNAP CONTRACT (fence-straight)
// Root = footprint centre at ground. Post centres at local (-1,0,0) and (+1,0,0); fence runs along X, thickness along Z.
// Removable endpoint post assemblies: FenceStraight/Post_End_NegX and FenceStraight/Post_End_PosX.
// Chaining along +X: place the next module at +2 m in its local X and omit ITS Post_End_NegX; its rails meet the kept post's inner face.
// Rails: FenceStraight/Mesh_Rails (fixed members merged into one wood draw).
async function build() {
  const root = createRoot('FenceStraight');
  const { wood } = await kitMaterials();
  const postGeo = batchGeo(postBatch(0.3));
  const endA = group('Post_End_NegX', root, [-KIT.bay / 2, 0, 0]);
  createPart('PostNegX', postGeo, wood, { parent: endA });
  const endB = group('Post_End_PosX', root, [KIT.bay / 2, 0, 0]);
  createPart('PostPosX', postGeo, wood, { parent: endB });
  const rails = makeBatch();
  railsBetween(rails, [-KIT.bay / 2, 0, 0], [KIT.bay / 2, 0, 0], 1);
  createPart('Rails', batchGeo(rails), wood, { parent: root });
  return root;
}
