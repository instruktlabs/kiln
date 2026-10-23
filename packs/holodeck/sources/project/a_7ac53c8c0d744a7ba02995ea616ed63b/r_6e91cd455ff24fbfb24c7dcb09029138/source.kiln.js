const meta = { name: 'statue-figure', role: 'poi' };

// ---------- plinth ----------
const PLINTH_W = 1.0;      // overall footprint (corona and foot block)
const PLINTH_H = 1.2;      // top of plinth
const FOOT_H = 0.12;       // dark weathered foot block
const BASE_SLAB_H = 0.07;  // figure's own carved self-base
const FIG_S = 1.1;         // figure scale from 1.75 m human units
const QA_SPLIT = false;   // true only for a measurement build that splits the figure for inspect

// ---------- signed-distance helpers (negative inside) ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
function cone(x, y, z, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
}
function sph(x, y, z, cx, cy, cz, r) { return Math.hypot(x - cx, y - cy, z - cz) - r; }

// Draped fall of cloth: elliptical radial shell with vertical flutes.
function drape(x, y, z, o) {
  const t = clamp((y - o.y0) / (o.y1 - o.y0), 0, 1);
  const rx = o.rx0 + (o.rx1 - o.rx0) * Math.pow(t, o.pow || 1);
  const rz = o.rz0 + (o.rz1 - o.rz0) * Math.pow(t, o.pow || 1);
  const cx = o.cx0 + (o.cx1 - o.cx0) * t;
  const lx = (x - cx) / rx, lz = z / rz;
  const rho = Math.hypot(lx, lz);
  const th = Math.atan2(lz, lx);
  const amp = o.a0 + (o.a1 - o.a0) * t;
  let g = Math.sin(o.n * th + o.wob * Math.sin(3 * th + 4 * y) + o.ph);
  g = Math.sign(g) * Math.pow(Math.abs(g), 0.7);
  const g2 = Math.sin(o.n2 * th + 1.3 + 2.0 * y);
  const fold = amp * (0.75 * g + 0.25 * g2);
  const rmin = Math.min(rx, rz);
  return (rho - 1) * rmin - fold;
}

// Deep, rounded-ridge flutes: |sin| gives soft ridges and sharp shadowed valleys.
function flute(th, n, ph) { return 2 * Math.abs(Math.sin(0.5 * n * th + ph)) - 1; }

// Head pose: nod forward and tilt away from the vessel (inverse-rotate sample points).
function headFrame(x, y, z) {
  const px = x - 0.015, py = y - 1.53, pz = z;
  const a = 8 * Math.PI / 180, b = -7 * Math.PI / 180;
  let hx = px * Math.cos(a) - py * Math.sin(a);
  let hy = px * Math.sin(a) + py * Math.cos(a);
  const hz = pz * Math.cos(b) - hy * Math.sin(b);
  hy = pz * Math.sin(b) + hy * Math.cos(b);
  return [hx + 0.015, hy + 1.53, hz];
}

// Head and neck in human units (fine sampling).
function headSdfH(x, y, z) {
  const neck = cone(x, y, z, [0, 1.40, 0], [0.018, 1.56, 0.004], 0.054, 0.048);
  const [hx, hy, hz] = headFrame(x, y, z);
  // cranium and face
  let head = ell(hx, hy, hz, 0.0, 1.645, 0, 0.094, 0.1, 0.077);
  head = smin(head, ell(hx, hy, hz, 0.035, 1.6, 0, 0.066, 0.078, 0.058), 0.03);
  // jaw/chin
  head = smin(head, ell(hx, hy, hz, 0.062, 1.552, 0, 0.03, 0.026, 0.03), 0.02);
  // brow ridge and eye sockets
  head = smin(head, ell(hx, hy, hz, 0.082, 1.648, 0, 0.018, 0.012, 0.055), 0.012);
  const eyeL = sph(hx, hy, hz, 0.098, 1.628, -0.03, 0.016), eyeR = sph(hx, hy, hz, 0.098, 1.628, 0.03, 0.016);
  head = smax(head, -Math.min(eyeL, eyeR), 0.012);
  // nose (straight Greek profile running from the brow)
  head = smin(head, cone(hx, hy, hz, [0.09, 1.64, 0], [0.112, 1.592, 0], 0.009, 0.014), 0.01);
  // lips
  head = smin(head, ell(hx, hy, hz, 0.094, 1.57, 0, 0.01, 0.009, 0.022), 0.008);
  // hair: center-parted waves drawn back to a bun, with a fillet band
  let hair = ell(hx, hy, hz, -0.008, 1.66, 0, 0.103, 0.1, 0.085);
  hair = Math.max(hair, (1.648 + 0.5 * (hx - 0.05)) - hy);
  const hang = Math.atan2(hy - 1.6, hx);
  hair -= 0.004 * Math.sin(70 * Math.abs(hz) + 8 * hang) * clamp((hy - 1.6) * 20, 0, 1);
  hair = smin(hair, ell(hx, hy, hz, -0.105, 1.645, 0, 0.05, 0.048, 0.06), 0.03);
  hair = smin(hair, sph(hx, hy, hz, -0.14, 1.625, 0, 0.033), 0.02);
  const band = Math.hypot(Math.hypot(hx + 0.006, hz) - 0.093, hy - 1.685 - 0.22 * hx) - 0.008;
  head = smin(head, hair, 0.012);
  head = smin(head, band, 0.004);
  return smin(neck, head, 0.025);
}

function figureSdfH(x, y, z, withHead) {
  // --- skirt (chiton to the floor), flared, with deep folds that grow toward the hem
  const t = clamp(y / 0.98, 0, 1);
  const tp = Math.pow(t, 0.8);
  const rx = 0.205 + (0.125 - 0.205) * tp, rz = 0.258 + (0.18 - 0.258) * tp;
  const cx = 0.02 * (1 - t);
  const lx = (x - cx) / rx, lz = z / rz;
  const rho = Math.hypot(lx, lz), th = Math.atan2(lz, lx);
  // folds: the cloth clings over the relaxed left knee
  const cling = Math.exp(-Math.pow((th + 0.45) / 0.35, 2)) * clamp((y - 0.25) * 4, 0, 1) * clamp((0.8 - y) * 5, 0, 1);
  const amp = (0.008 + 0.03 * Math.pow(1 - t, 1.3)) * (1 - 0.75 * cling);
  const fold = amp * (0.8 * flute(th + 0.08 * Math.sin(6 * y), 11, 0.3) + 0.2 * Math.sin(19 * th + 2 * y));
  let skirt = (rho - 1) * Math.min(rx, rz) - fold;
  // hem lifted a little at the front to reveal the toes
  const front = Math.max(0, Math.cos(th));
  skirt = Math.max(skirt, 0.04 * Math.pow(front, 6) - y);
  skirt = Math.max(skirt, y - 1.0);

  // legs under the cloth: left (-Z) leg relaxed and forward, the knee pushes the drapery
  const thighL = cone(x, y, z, [0.0, 0.86, -0.08], [0.108, 0.50, -0.085], 0.085, 0.066);
  const shinL = cone(x, y, z, [0.108, 0.50, -0.085], [0.07, 0.08, -0.09], 0.06, 0.044);
  skirt = smin(skirt, Math.min(thighL, shinL), 0.06);
  const footL = ell(x, y, z, 0.205, 0.035, -0.09, 0.085, 0.04, 0.046);
  const footR = ell(x, y, z, 0.17, 0.03, 0.085, 0.08, 0.036, 0.043);
  let body = smin(skirt, Math.min(footL, footR), 0.02);

  // --- overfold (apoptygma) blousing over the belt, hem dipping to points at the sides
  {
    const to = clamp((y - 0.95) / 0.27, 0, 1);
    const orx = 0.16 + (0.118 - 0.16) * to, orz = 0.218 + (0.158 - 0.218) * to;
    const olx = (x - 0.01 * (1 - to)) / orx, olz = z / orz;
    const oth = Math.atan2(olz, olx);
    const ofold = (0.004 + 0.011 * (1 - to)) * flute(oth, 9, 1.1);
    let over = (Math.hypot(olx, olz) - 1) * Math.min(orx, orz) - ofold;
    const hem = 0.985 - 0.04 * Math.pow(Math.abs(Math.sin(oth)), 3) + 0.006 * Math.sin(9 * oth);
    over = Math.max(over, hem - y);
    over = Math.max(over, y - 1.22);
    body = smin(body, over, 0.01);
  }

  // --- torso under the upper chiton (hips shifted over the weight leg)
  let torso = ell(x, y, z, 0, 0.94, 0.018, 0.12, 0.14, 0.178);
  torso = smin(torso, ell(x, y, z, 0, 1.11, 0, 0.105, 0.15, 0.135), 0.06);
  torso = smin(torso, ell(x, y, z, -0.005, 1.285, 0, 0.115, 0.16, 0.162), 0.06);
  torso = smin(torso, Math.min(sph(x, y, z, 0.06, 1.28, 0.062, 0.062), sph(x, y, z, 0.06, 1.28, -0.062, 0.062)), 0.06);
  torso = smin(torso, cone(x, y, z, [0, 1.405, -0.16], [0, 1.405, 0.16], 0.058, 0.058), 0.07);
  // broad chiton folds falling from the shoulder fastenings over the breast
  {
    const w = clamp((y - 1.215) * 14, 0, 1) * clamp((1.44 - y) * 12, 0, 1);
    const ang = Math.atan2(z, x);
    const fan = ang + 0.9 * (1.44 - y) * Math.sin(2 * ang);
    torso -= 0.007 * flute(fan, 9, 0.2) * w;
  }
  body = smin(body, torso, 0.03);

  // --- belt (zone) under the bust
  const bl = Math.hypot(x / 0.112, z / 0.148);
  body = smin(body, Math.hypot((bl - 1) * 0.12, y - 1.205) - 0.012, 0.006);

  // --- right arm (+Z) hanging, hand gathering a fall of drapery
  {
    const sh = [0.0, 1.40, 0.185], el = [-0.02, 1.13, 0.218], wr = [0.085, 0.905, 0.222];
    let arm = cone(x, y, z, sh, el, 0.05, 0.039);
    arm = smin(arm, cone(x, y, z, el, wr, 0.037, 0.027), 0.02);
    arm = smin(arm, ell(x, y, z, 0.102, 0.85, 0.218, 0.033, 0.062, 0.024), 0.02);
    arm = smin(arm, ell(x, y, z, 0.0, 1.36, 0.195, 0.058, 0.075, 0.05), 0.03);
    // gathered cloth: a flat fluted fall widening below the fist, swallowtail hem
    const ft = clamp((0.82 - y) / 0.5, 0, 1);
    const fcx = 0.1 - 0.01 * ft, fcz = 0.242 + 0.03 * ft;
    const fax = 0.024 + 0.07 * ft, faz = 0.02 + 0.008 * ft;
    const fl = Math.hypot((x - fcx) / fax, (z - fcz) / faz);
    let fall = (fl - 1) * faz - 0.006 * ft * flute((x - fcx) * 90, 1, 0.0);
    fall = Math.max(fall, 0.3 + 0.7 * Math.abs(x - fcx) + 0.03 * Math.abs(Math.sin((x - fcx) * 50)) - y);
    fall = Math.max(fall, y - 0.86);
    arm = smin(arm, fall, 0.02);
    body = smin(body, arm, 0.025);
  }

  // --- left arm (-Z) raised, steadying the hydria on the shoulder
  {
    const sh = [0.0, 1.41, -0.185], el = [0.045, 1.52, -0.405], wr = [0.015, 1.735, -0.33];
    let arm = cone(x, y, z, sh, el, 0.05, 0.039);
    arm = smin(arm, cone(x, y, z, el, wr, 0.037, 0.028), 0.02);
    arm = smin(arm, ell(x, y, z, 0.01, 1.775, -0.318, 0.04, 0.055, 0.026), 0.02);
    arm = smin(arm, ell(x, y, z, 0.0, 1.43, -0.215, 0.058, 0.062, 0.062), 0.03);
    body = smin(body, arm, 0.025);
  }

  // neck stub (the finely sampled head mesh covers it)
  body = smin(body, cone(x, y, z, [0, 1.40, 0], [0.018, 1.55, 0.004], 0.05, 0.044), 0.04);
  if (withHead) body = smin(body, headSdfH(x, y, z), 0.02);

  // flat underside: the figure is carved standing on its own base slab
  return Math.max(body, -y);
}

// ---------- draw-call consolidation: exactly one welded, indexed mesh per distinct material ----------
// Bakes every mesh's world transform, buckets triangles by material (honouring geometry groups),
// welds identical position+normal corners (hard creases keep their split normals) and replaces
// the parts with one named mesh per material. The materials carry no textures, so UVs are dropped.
function mergeByMaterial(root, names) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const g = mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal;
    nm.getNormalMatrix(mesh.matrixWorld);
    const idx = g.index ? g.index.array : null;
    const count = idx ? idx.length : pos.count;
    const groups = (Array.isArray(mesh.material) && g.groups.length) ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = Array.isArray(mesh.material) ? mesh.material[grp.materialIndex] : mesh.material;
      if (!buckets.has(mat)) buckets.set(mat, { map: new Map(), pos: [], nrm: [], index: [] });
      const b = buckets.get(mat);
      const end = Math.min(count, grp.start + grp.count);
      for (let k = grp.start; k < end; k++) {
        const v = idx ? idx[k] : k;
        p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nrm, v).applyMatrix3(nm).normalize();
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)},${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
        let id = b.map.get(key);
        if (id === undefined) {
          id = b.pos.length / 3;
          b.map.set(key, id);
          b.pos.push(p.x, p.y, p.z);
          b.nrm.push(n.x, n.y, n.z);
        }
        b.index.push(id);
      }
    }
  }
  for (const mesh of meshes) mesh.parent.remove(mesh);
  for (const child of [...root.children]) root.remove(child);
  for (const [mat, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
    geo.setIndex(b.index);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const name = names.get(mat) || 'Merged';
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    root.add(m);
  }
  return root;
}

async function build() {
  const root = createRoot('StatueFigure');

  const figureStone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#ddd2bb', roughness: 0.82 });
  const limestone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#d6c8a8', roughness: 0.88 });
  const weathered = await materialRecipe('kiln.material.stone.v1', { baseColor: '#9c8d70', roughness: 0.94 });

  // ---------- plinth: square mouldings by a 4-segment revolution turned 45 deg ----------
  const R = Math.SQRT2; // half-width -> radius of a 4-segment revolution
  const prof = [];
  const P = (w, y) => prof.push([w * R, y]);
  prof.push([0, FOOT_H]);
  P(0.485, FOOT_H);
  // base torus
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + Math.PI * i / 6; P(0.468 + 0.022 * Math.cos(a), 0.165 + 0.042 * Math.sin(a)); }
  P(0.455, 0.207); P(0.455, 0.222);
  // scotia (concave)
  for (let i = 1; i <= 5; i++) { const a = Math.PI / 2 * i / 5; P(0.425 + 0.03 * Math.cos(a) * Math.cos(a), 0.222 + 0.05 * Math.sin(a)); }
  P(0.43, 0.272); P(0.43, 0.282); P(0.42, 0.285);
  // die
  P(0.42, 0.955); P(0.432, 0.958); P(0.432, 0.975);
  // ovolo under the cornice
  for (let i = 1; i <= 6; i++) { const a = Math.PI / 2 * i / 6; P(0.432 + 0.045 * Math.sin(a), 0.975 + 0.075 * (1 - Math.cos(a))); }
  P(0.5, 1.05); P(0.5, 1.13);
  // cyma to the top
  P(0.49, 1.14); P(0.478, 1.152); P(0.472, 1.17); P(0.468, PLINTH_H);
  prof.push([0, PLINTH_H]);
  let plinthGeo = await revolveProfile(prof, { segments: 4, smooth: false });
  plinthGeo = creaseNormals(plinthGeo, { angle: 40 });
  const plinthBody = createPart('PlinthBody', plinthGeo, limestone, { rotation: [0, 45, 0] });

  // recessed panels on all four faces of the die, with sloped reveals
  const panelW = 0.56, panelH = 0.5, panelY = 0.62, depth = 0.03;
  const cutters = [];
  for (let k = 0; k < 4; k++) {
    const rect = [[-panelW / 2, -panelH / 2], [panelW / 2, -panelH / 2], [panelW / 2, panelH / 2], [-panelW / 2, panelH / 2]];
    const g = await extrudeProfile(rect, { depth: 0.08, axis: 'x', taper: 0.93, center: false });
    // axis x: depth runs +X from 0; flip so taper narrows inward
    const m = new THREE.Mesh(g, limestone);
    const ang = k * 90;
    const rad = ang * Math.PI / 180;
    const surf = 0.42 - depth;
    m.position.set(Math.cos(rad) * (surf + 0.08), panelY, -Math.sin(rad) * (surf + 0.08));
    m.rotation.set(0, rad + Math.PI, 0);
    m.updateMatrixWorld(true);
    cutters.push(m);
  }
  const plinth = await boolDiff('Plinth', plinthBody, ...cutters);
  plinth.material = limestone;
  root.add(plinth);

  // dark weathered foot block
  let footProf = [[0, 0], [0.5 * R, 0], [0.5 * R, FOOT_H - 0.012], [0.488 * R, FOOT_H], [0, FOOT_H]];
  const footGeo = creaseNormals(await revolveProfile(footProf, { segments: 4, smooth: false }), { angle: 40 });
  createPart('PlinthFoot', footGeo, weathered, { parent: root, rotation: [0, 45, 0] });

  // figure's own carved base slab
  const slabGeo = await roundedBoxGeo(0.74, BASE_SLAB_H, 0.7, 0.02, { segments: 3 });
  createPart('BaseSlab', slabGeo, figureStone, { parent: root, position: [0.0, PLINTH_H + BASE_SLAB_H / 2 - 0.002, 0] });

  // ---------- figure ----------
  const figY = PLINTH_H + BASE_SLAB_H - 0.004;
  const S = FIG_S;
  const figGeo = await implicitSurface(([x, y, z]) => -figureSdfH(x / S, y / S, z / S, false) * S, {
    bounds: { min: [-0.27, -0.012, -0.55], max: [0.37, 2.03, 0.42] }, edgeLength: 0.024,
  });
  if (QA_SPLIT) {
    // measurement-only variant: the same triangles split at 0.9 m so each piece fits inspect's budget
    const g = figGeo.index ? figGeo.toNonIndexed() : figGeo;
    const pa = g.attributes.position.array;
    const lo = [], hi = [];
    for (let t = 0; t < pa.length; t += 9) ((pa[t + 1] + pa[t + 4] + pa[t + 7]) / 3 < 0.9 ? lo : hi).push(...pa.slice(t, t + 9));
    createPart('FigureLower', meshGeo({ positions: lo }), figureStone, { parent: root, position: [0, figY, 0] });
    createPart('FigureUpper', meshGeo({ positions: hi }), figureStone, { parent: root, position: [0, figY, 0] });
  } else {
    createPart('Figure', figGeo, figureStone, { parent: root, position: [0, figY, 0] });
  }
  // head and neck sampled finer so the face, hair and fillet read up close;
  // its neck sits just proud of the body's coarser neck stub and is buried below in the shoulders
  const headGeo = await implicitSurface(([x, y, z]) => -(headSdfH(x / S, y / S, z / S) - 0.002) * S, {
    bounds: { min: [-0.22, 1.555, -0.15], max: [0.17, 1.98, 0.15] }, edgeLength: 0.0135,
  });
  createPart('Head', headGeo, figureStone, { parent: root, position: [0, figY, 0] });

  // hydria resting on the left shoulder (tilted outward), steadied by the raised hand
  const vProf = [[0, 0], [0.062, 0], [0.07, 0.012], [0.062, 0.03], [0.1, 0.09], [0.128, 0.165], [0.13, 0.2], [0.118, 0.25],
    [0.09, 0.3], [0.058, 0.33], [0.044, 0.355], [0.043, 0.39], [0.058, 0.41], [0.062, 0.425], [0, 0.425]];
  const vesselGeo = await revolveProfile(vProf, { segments: 28 });
  const tilt = -25 * Math.PI / 180;
  const vc = [-0.022, 1.765, -0.268];
  const ax = [0, Math.cos(tilt), Math.sin(tilt)];
  const vh = 0.425 / 2;
  createPart('Hydria', vesselGeo, figureStone, {
    parent: root,
    position: [vc[0], figY + vc[1] - ax[1] * vh, vc[2] - ax[2] * vh],
    rotation: [-25, 0, 0],
  });

  if (!QA_SPLIT) mergeByMaterial(root, new Map([[figureStone, 'Figure_Stone'], [limestone, 'Plinth_Limestone'], [weathered, 'Plinth_Weathered']]));
  return root;
}
