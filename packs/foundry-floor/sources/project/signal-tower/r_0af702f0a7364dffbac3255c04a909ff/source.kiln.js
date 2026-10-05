// Signal tower (stack light): four lit tiers with unlit twins.
// Metres, +X forward, +Y up, +Z right. Base bottom at Y = 0, centred on X and Z.
const meta = { name: 'signal-tower' };

const RADIUS = 0.035;            // 0.07 m wide in X and Z
const SEG = 12;                  // a 12-gon has vertices on the +-X and +-Z extremes
const BASE_H = 0.03;
const POLE_H = 0.15;
const POLE_R = 0.012;
const POLE_SEG = 8;
const LAMP_H = 0.06;
const CAP_H = 0.03;
const LENS_INSET = 0.0004;       // unlit twin sits this far inside its lit twin: no coplanar faces
const TIERS = [                  // bottom to top
  { name: 'Blue', mat: 'status-blue', hex: 0x2F7FE0 },
  { name: 'Green', mat: 'status-green', hex: 0x22B14C },
  { name: 'Amber', mat: 'status-amber', hex: 0xF5A623 },
  { name: 'Red', mat: 'status-red', hex: 0xE0352B },
];
const Y_POLE = BASE_H;                              // pole 0.03..0.18
const Y_LAMP0 = BASE_H + POLE_H;                    // lamps 0.18..0.42
const Y_CAP = Y_LAMP0 + TIERS.length * LAMP_H;      // cap 0.42..0.45

function newAcc() { return { p: [], n: [], i: [] }; }

// Vertical 12-gon tube with smooth radial normals; caps are optional.
function addCyl(a, r, y0, y1, seg, opts) {
  const o = opts || {};
  const b = a.p.length / 3;
  for (let k = 0; k < seg; k++) {
    const t = (k / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    a.p.push(r * c, y0, r * s, r * c, y1, r * s);
    a.n.push(c, 0, s, c, 0, s);
  }
  for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg;
    const b0 = b + 2 * k, t0 = b0 + 1, b1 = b + 2 * k2, t1 = b1 + 1;
    a.i.push(b0, t0, t1, b0, t1, b1);
  }
  for (const [y, ny, on] of [[y1, 1, o.top], [y0, -1, o.bottom]]) {
    if (!on) continue;
    const c0 = a.p.length / 3;
    a.p.push(0, y, 0); a.n.push(0, ny, 0);
    for (let k = 0; k < seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      a.p.push(r * Math.cos(t), y, r * Math.sin(t)); a.n.push(0, ny, 0);
    }
    for (let k = 0; k < seg; k++) {
      const p0 = c0 + 1 + k, p1 = c0 + 1 + ((k + 1) % seg);
      if (ny > 0) a.i.push(c0, p1, p0); else a.i.push(c0, p0, p1);
    }
  }
}

function attachMesh(parent, name, acc, material) {
  const m = new THREE.Mesh(meshGeo({ positions: acc.p, indices: acc.i, normals: acc.n }), material);
  m.name = name;
  parent.add(m);
  return m;
}

function makeMat(name, hex, roughness, metalness, extra) {
  const m = gameMaterial(hex, Object.assign({ roughness, metalness }, extra || {}));
  m.name = name;
  return m;
}

function makeMaterials() {
  const M = {
    graphite: makeMat('trim-graphite', 0x3B4148, 0.50, 0.1),
    smoked: glassMaterial(0x5E6A73, { opacity: 0.6, roughness: 0.1, metalness: 0.0 }),
  };
  M.smoked.name = 'glass-smoked';
  for (const t of TIERS) M[t.mat] = makeMat(t.mat, t.hex, 0.40, 0.0, { emissive: t.hex, emissiveIntensity: 1.0 });
  return M;
}

function buildTowerParts(root, M) {
  let a = newAcc();
  addCyl(a, RADIUS, 0, BASE_H, SEG, { top: true, bottom: true });
  attachMesh(root, 'base', a, M.graphite);

  a = newAcc();
  addCyl(a, POLE_R, Y_POLE, Y_LAMP0, POLE_SEG, {});
  attachMesh(root, 'pole', a, M.graphite);

  TIERS.forEach((t, i) => {
    const y0 = Y_LAMP0 + i * LAMP_H;
    a = newAcc();
    addCyl(a, RADIUS, y0, y0 + LAMP_H, SEG, { bottom: i === 0 });
    attachMesh(root, 'lamp' + t.name, a, M[t.mat]);
  });

  TIERS.forEach((t, i) => {
    const y0 = Y_LAMP0 + i * LAMP_H;
    a = newAcc();
    addCyl(a, RADIUS - LENS_INSET, i === 0 ? y0 + LENS_INSET : y0, y0 + LAMP_H, SEG, { bottom: i === 0 });
    attachMesh(root, 'lamp' + t.name + 'Off', a, M.smoked);
  });

  a = newAcc();
  addCyl(a, RADIUS, Y_CAP, Y_CAP + CAP_H, SEG, { top: true, bottom: true });
  attachMesh(root, 'cap', a, M.graphite);
}

function build() {
  const M = makeMaterials();
  const root = createRoot('signal-tower');
  buildTowerParts(root, M);
  return root;
}
