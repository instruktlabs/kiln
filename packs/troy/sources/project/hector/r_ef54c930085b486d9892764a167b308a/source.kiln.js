const meta = { name: 'Hector' };

// Troy pack conventions: metres, +Y up, the soldier faces +Z, so his right side is -X.
// Rigid segments on named joints (the runtime exports no skinning); joint rotations are
// Euler XYZ degrees. For hanging limbs negative X swings forward; for the spine positive X
// leans forward.
const D2R = Math.PI / 180;

// Pinned pack materials (portableSpec copied from kiln_material get).
const LINEN = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Neutral woven fabric',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' },
  },
};
const BRONZE = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};
// Base-colour factors chosen so factor x mean map colour (linear) ~= the palette colour:
// trojan-crimson #8c2f2a, skin #c59a78 (red clamps at 1), bronze #b08d57.
const TINT = { crimson: 0xcb4d50, skin: 0xffecd2, bronze: 0xfcc77b };

// Body: hips joint height, segment lengths, joint offsets.
const BODY = {
  hipsY: 0.95, hipX: 0.095, hipDrop: -0.03, thigh: 0.42, shin: 0.415, ankleY: 0.085,
  spineUp: 0.10, neckUp: 0.40, headUp: 0.08,
  shoulderX: 0.205, shoulderUp: 0.35, upperArm: 0.29, forearm: 0.25,
};
// Pack hand grip: every held item has a 0.03 m radius, 0.11 m grip centred on its origin
// along its +Y; the fist closes to it. The socket tilts the grip 45 deg forward-down from
// the forearm, as a sword sits diagonally across a closed palm.
const GRIP = { radius: 0.014, length: 0.11, fistOuter: 0.05, fistLength: 0.09, socket: [0, -0.07, 0.01], tilt: 135 };
// Feet stay planted at these depths in every clip; legs are solved from the hips position.
const STANCE = { left: 0.15, right: -0.14 };

// A human grip: tapered palm, four individually curled fingers and opposed thumb.
// The smaller shaft is occupied by the held item, rather than an empty tube.
function curledFinger(y,r,mirror) {
 const centers=[-155,-110,-65,-20,25,65].map(a=>new THREE.Vector3(mirror*.022*Math.cos(a*D2R),y,.022*Math.sin(a*D2R))),rings=[],s=soup();
 for(let i=0;i<centers.length;i++){const tangent=centers[Math.min(i+1,centers.length-1)].clone().sub(centers[Math.max(0,i-1)]).normalize(),side=new THREE.Vector3().crossVectors(tangent,new THREE.Vector3(0,1,0)).normalize();rings.push(Array.from({length:6},(_,j)=>centers[i].clone().addScaledVector(new THREE.Vector3(0,1,0),r*Math.cos(j*Math.PI/3)).addScaledVector(side,r*Math.sin(j*Math.PI/3))));}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<6;j++){const k=(j+1)%6,out=rings[i][j].clone().add(rings[i][k]).multiplyScalar(.5).sub(centers[i]);s.quad(rings[i][j].toArray(),rings[i][k].toArray(),rings[i+1][k].toArray(),rings[i+1][j].toArray(),out.toArray());}
 for(const i of [0,rings.length-1])for(let j=0;j<6;j++)s.tri(centers[i].toArray(),rings[i][j].toArray(),rings[i][(j+1)%6].toArray(),centers[i].clone().sub(centers[i===0?1:i-1]).toArray());return s.geo();
}
// A tapered palm, four bent fingers, opposed thumb; no annular fist mesh.
function humanGrip(side) {
 const s=shape(.04),mirror=side==='left'?1:-1;
 s.add(sphereGeo(1,6,4),{p:[0,0,-.031],s:[.035,.047,.016]});
 for(const [i,y] of [-.033,-.011,.011,.032].entries())s.add(curledFinger(y,.0085-(i===3?.001:0),mirror));
 s.add(sphereGeo(1,6,4),{p:[mirror*.026,.023,-.014],s:[.014,.026,.020]});
 s.add(sphereGeo(1,6,4),{p:[mirror*.021,.017,.017],s:[.014,.025,.011],r:[0,0,mirror*25]});
 return s.geometry();
}

// ---------- geometry helpers ----------
function xf(t = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r || [0, 0, 0]).map(d => d * D2R), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), q, new THREE.Vector3(...(t.s || [1, 1, 1])));
}

// Collects transformed triangles for one mesh (one material, one rigid segment).
function shape(uvScale) {
  const pos = [];
  const v = new THREE.Vector3();
  const api = {
    add(geo, ...ts) {
      const m = new THREE.Matrix4();
      for (const t of ts) m.multiply(xf(t));
      const src = geo.index ? geo.toNonIndexed() : geo;
      const a = src.getAttribute('position');
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      return api;
    },
    geometry() {
      const uvs = [];
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
        for (let k = 0; k < 9; k += 3) {
          const x = pos[i + k], y = pos[i + k + 1], z = pos[i + k + 2];
          if (nx >= ny && nx >= nz) uvs.push(z / uvScale, y / uvScale);
          else if (ny >= nz) uvs.push(x / uvScale, z / uvScale);
          else uvs.push(x / uvScale, y / uvScale);
        }
      }
      return meshGeo({ positions: pos, uvs });
    },
  };
  return api;
}

// Triangle soup whose faces are turned to face `out`; zero-area faces are dropped.
function soup() {
  const pos = [];
  const tri = (a, b, c, out) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...n) < 1e-12) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  return { tri, quad, geo };
}

// Surface of revolution about Y. Profile entries [r, y, zScale?] run up the outside and back
// down any inside, so (dy, -dr) is the outward profile normal.
function revolve(profile, segs) {
  const s = soup();
  const P = (e, a) => [e[0] * Math.cos(a), e[1], e[0] * Math.sin(a) * (e[2] ?? 1)];
  for (let k = 0; k < profile.length - 1; k++) {
    const e0 = profile[k], e1 = profile[k + 1];
    const nr = e1[1] - e0[1], ny = -(e1[0] - e0[0]);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
      s.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  return s.geo();
}

// Convex polygon [[u, v]] in the Z-Y plane (u -> z, v -> y), extruded across X.
function prism(poly, width) {
  const s = soup(), h = width / 2;
  const c = poly.reduce((m, p) => [m[0] + p[0] / poly.length, m[1] + p[1] / poly.length], [0, 0]);
  for (let i = 1; i < poly.length - 1; i++) {
    s.tri([h, poly[0][1], poly[0][0]], [h, poly[i][1], poly[i][0]], [h, poly[i + 1][1], poly[i + 1][0]], [1, 0, 0]);
    s.tri([-h, poly[0][1], poly[0][0]], [-h, poly[i][1], poly[i][0]], [-h, poly[i + 1][1], poly[i + 1][0]], [-1, 0, 0]);
  }
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const out = [0, (p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0]];
    s.quad([h, p[1], p[0]], [h, q[1], q[0]], [-h, q[1], q[0]], [-h, p[1], p[0]], out);
  });
  return s.geo();
}

// Band between two matching polylines in the Z-Y plane, extruded across X (crest).
function band(outer, inner, width) {
  const s = soup(), h = width / 2, n = outer.length;
  const V = (p, x) => [x, p[1], p[0]];
  for (let i = 0; i < n - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    s.quad(V(o0, h), V(o1, h), V(i1, h), V(i0, h), [1, 0, 0]);
    s.quad(V(o0, -h), V(o1, -h), V(i1, -h), V(i0, -h), [-1, 0, 0]);
    const oo = [0, (o0[1] + o1[1] - i0[1] - i1[1]) / 2, (o0[0] + o1[0] - i0[0] - i1[0]) / 2];
    s.quad(V(o0, h), V(o1, h), V(o1, -h), V(o0, -h), oo);
    s.quad(V(i0, h), V(i1, h), V(i1, -h), V(i0, -h), oo.map(x => -x));
  }
  const cap = (k, j) => {
    const out = [0, outer[k][1] + inner[k][1] - outer[j][1] - inner[j][1], outer[k][0] + inner[k][0] - outer[j][0] - inner[j][0]];
    s.quad(V(outer[k], h), V(inner[k], h), V(inner[k], -h), V(outer[k], -h), out);
  };
  cap(0, 1); cap(n - 1, n - 2);
  return s.geo();
}

// Thick tube along Y: the closed fist around the pack grip.
function tube(rIn, rOut, length, segs) {
  const s = soup(), h = length / 2;
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
    const rad = [Math.cos(am), 0, Math.sin(am)];
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), rad);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), rad.map(x => -x));
    s.quad(P(rIn, a0, h), P(rIn, a1, h), P(rOut, a1, h), P(rOut, a0, h), [0, 1, 0]);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rOut, a1, -h), P(rOut, a0, -h), [0, -1, 0]);
  }
  return s.geo();
}

// Leaf-shaped blade along +Y with a diamond section: width along Z, ribbed thickness along X.
function blade(stations) {
  const s = soup();
  const ring = st => [[0, st[0], st[1]], [st[2], st[0], 0], [0, st[0], -st[1]], [-st[2], st[0], 0]];
  for (let k = 0; k < stations.length - 1; k++) {
    const r0 = ring(stations[k]), r1 = ring(stations[k + 1]);
    for (let j = 0; j < 4; j++) {
      const a = r0[j], b = r0[(j + 1) % 4], c = r1[(j + 1) % 4], d = r1[j];
      s.quad(a, b, c, d, [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4]);
    }
  }
  const r0 = ring(stations[0]);
  s.quad(r0[0], r0[1], r0[2], r0[3], [0, -1, 0]);
  return s.geo();
}

// Cloak sheet hanging down the back. Rows [y, halfWidth, zCentre, zEdge] run from over the
// shoulders to the hem; each row curves forward to its edges and soft folds deepen toward the
// hem. Thickness is taken across the sheet; faces turn away from the spine axis.
function drape(rows, segs, thick, fold) {
  const s = soup(), n = rows.length;
  const nrm = rows.map((_, k) => {
    const a = rows[Math.max(k - 1, 0)], b = rows[Math.min(k + 1, n - 1)];
    const ty = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(ty, tz);
    return [-tz / l, ty / l];
  });
  const P = (k, j, side) => {
    const [y, hw, zc, ze] = rows[k], u = (2 * j) / segs - 1, v = k / (n - 1), h = (side * thick) / 2;
    const z = zc + (ze - zc) * u * u - fold * v * v * Math.cos(2.5 * Math.PI * u);
    return [u * hw, y + h * nrm[k][0], z + h * nrm[k][1]];
  };
  for (let k = 0; k < n - 1; k++) {
    const ny = (nrm[k][0] + nrm[k + 1][0]) / 2, nz = (nrm[k][1] + nrm[k + 1][1]) / 2;
    for (let j = 0; j < segs; j++) {
      const out = [((2 * j + 1) / segs - 1) * rows[k][1], ny, nz];
      s.quad(P(k, j, 1), P(k, j + 1, 1), P(k + 1, j + 1, 1), P(k + 1, j, 1), out);
      s.quad(P(k, j, -1), P(k, j + 1, -1), P(k + 1, j + 1, -1), P(k + 1, j, -1), out.map(c => -c));
    }
    for (const j of [0, segs]) s.quad(P(k, j, 1), P(k + 1, j, 1), P(k + 1, j, -1), P(k, j, -1), [j ? 1 : -1, 0, 0]);
  }
  for (const [k, l] of [[0, 1], [n - 1, n - 2]]) {
    const out = [0, rows[k][0] - rows[l][0], rows[k][2] - rows[l][2]];
    for (let j = 0; j < segs; j++) s.quad(P(k, j, 1), P(k, j + 1, 1), P(k, j + 1, -1), P(k, j, -1), out);
  }
  return s.geo();
}

// ---------- pose ----------
const UPPER = ['spine', 'neck', 'head', 'shoulder_right', 'elbow_right', 'wrist_right', 'shoulder_left', 'elbow_left', 'wrist_left'];
const LEGS = ['hip_right', 'knee_right', 'ankle_right', 'hip_left', 'knee_left', 'ankle_left'];

// Guard stance: left foot leads, sword held forward and up, left arm relaxed.
const GUARD = {
  hips: [0, 0.91, 0.01],
  spine: [6, -12, 0], neck: [-2, 0, 0], head: [-2, 10, 0],
  shoulder_right: [-20, 0, -10], elbow_right: [-55, 0, 0], wrist_right: [-15, 0, 0],
  shoulder_left: [-8, 0, 10], elbow_left: [-30, 0, 0], wrist_left: [0, 0, 0],
};
const pose = o => ({ ...GUARD, ...o });

const IDLE_KEYS = [
  { t: 0, ...GUARD },
  { t: 1.5, ...pose({ hips: [0, 0.898, 0.02], spine: [8, -8, 1], neck: [-3, 0, 0], head: [-1, -2, 0], shoulder_right: [-24, 0, -11], elbow_right: [-63, 0, 0], wrist_right: [-10, 0, 0], shoulder_left: [-11, 0, 12], elbow_left: [-36, 0, 0] }) },
  { t: 3, ...GUARD },
];

// Forehand diagonal cut: cock the sword behind the right shoulder, swing down across to
// the left hip while the weight shifts onto the lead leg, then recover to guard.
const ATTACK_KEYS = [
  { t: 0, ...GUARD },
  { t: 0.38, ...pose({ hips: [0, 0.905, -0.04], spine: [-6, -38, 4], neck: [0, 0, 0], head: [0, 25, 0], shoulder_right: [-150, 0, -25], elbow_right: [-60, 0, 0], wrist_right: [-25, 0, 0], shoulder_left: [-70, 0, 15], elbow_left: [-20, 0, 0] }) },
  { t: 0.54, ...pose({ hips: [0, 0.87, 0.07], spine: [14, 10, -3], head: [-6, -8, 0], shoulder_right: [-75, 0, -5], elbow_right: [-5, 0, 0], wrist_right: [40, 0, 0], shoulder_left: [-18, 0, 30], elbow_left: [-48, 0, 0], wrist_left: [31, 0, 0] }) },
  { t: 0.7, ...pose({ hips: [0, 0.865, 0.08], spine: [18, 30, -4], head: [-8, -22, 0], shoulder_right: [-55, 0, 15], elbow_right: [-10, 0, 0], wrist_right: [45, 0, 0], shoulder_left: [-18, 0, 30], elbow_left: [-48, 0, 0], wrist_left: [31, 0, 0] }) },
  { t: 1.1, ...pose({ hips: [0, 0.9, 0.03], spine: [8, -5, 0], head: [-3, 6, 0], shoulder_right: [-30, 0, -8], elbow_right: [-50, 0, 0], wrist_right: [-5, 0, 0], shoulder_left: [-5, 0, 10], elbow_left: [-40, 0, 0] }) },
  { t: 1.5, ...GUARD },
];

// Two-bone leg in its sagittal plane, foot kept level at its planted depth.
function legIK(hips, side) {
  const hy = hips[1] + BODY.hipDrop, hz = hips[2];
  const dy = BODY.ankleY - hy, dz = STANCE[side] - hz;
  const L = Math.min(Math.hypot(dy, dz), BODY.thigh + BODY.shin - 1e-4);
  const a = Math.acos((BODY.thigh ** 2 + L * L - BODY.shin ** 2) / (2 * BODY.thigh * L));
  const b = Math.acos((BODY.shin ** 2 + L * L - BODY.thigh ** 2) / (2 * BODY.shin * L));
  const phi = Math.atan2(dz, -dy);
  const hip = -(phi + a) / D2R, knee = (a + b) / D2R;
  return { ['hip_' + side]: [hip, 0, 0], ['knee_' + side]: [knee, 0, 0], ['ankle_' + side]: [-(hip + knee), 0, 0] };
}
const solve = p => ({ ...p, ...legIK(p.hips, 'right'), ...legIK(p.hips, 'left') });

// Monotone cubic (Fritsch-Carlson) through the key values; flat at the ends.
function pchip(ts, vs, t) {
  const n = ts.length;
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const slope = k => {
    if (k === 0 || k === n - 1) return 0;
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const d0 = (vs[k] - vs[k - 1]) / h0, d1 = (vs[k + 1] - vs[k]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * slope(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * slope(i + 1) * h;
}
function poseAt(keys, t) {
  const ts = keys.map(k => k.t);
  const p = {};
  for (const name of ['hips', ...UPPER]) p[name] = [0, 1, 2].map(c => pchip(ts, keys.map(k => k[name][c]), t));
  return solve(p);
}

// Samples the key poses so the planted feet stay consistent with the hips between keys.
function sampleClip(name, keys, fps, loop) {
  const duration = keys[keys.length - 1].t;
  const n = Math.round(duration * fps);
  const times = [...Array(n + 1)].map((_, i) => (i * duration) / n);
  const poses = times.map(t => poseAt(keys, t));
  const tracks = [positionTrack('Joint_hips', times.map((time, i) => ({ time, position: poses[i].hips })), 'LINEAR')];
  for (const j of [...UPPER, ...LEGS]) {
    tracks.push(rotationTrack('Joint_' + j, times.map((time, i) => ({ time, rotation: poses[i][j] })), 'LINEAR'));
  }
  return createClip(name, duration, tracks, { loop });
}

// ---------- build ----------
async function build() {
  const crimson = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Trojan crimson linen', baseColor: TINT.crimson });
  const skin = gameMaterial(0xc59a78); // Skin is matte, without cloth weave.
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE, name: 'Bronze', baseColor: TINT.bronze });
  // UV repeat in metres: cloth and bronze at their physical map size; skin samples the linen
  // maps at a fine repeat so the weave averages out to an even tone.
  const champion=copyMaterial(bronze);champion.metalness=.38;champion.roughness=.52;
  const mats = { crimson: [crimson, 0.5], skin: [skin, 0.04], bronze: [champion, 1], champion: [champion, 1] };
  const part = (name, mat, parent, fill) => {
    const sh = shape(mats[mat][1]);
    fill(sh);
    return createPart(name, sh.geometry(), mats[mat][0], { parent });
  };

  const root = createRoot('Hector');
  const J = {};
  J.hips = createPivot('hips', [0, BODY.hipsY, 0], root);
  J.spine = createPivot('spine', [0, BODY.spineUp, 0], J.hips);
  J.neck = createPivot('neck', [0, BODY.neckUp, 0], J.spine);
  J.head = createPivot('head', [0, BODY.headUp, 0], J.neck);

  // Kilt of linen strips: flares so the thighs swing inside it; top tucks under the cuirass.
  part('kilt', 'crimson', J.hips, s => s
    .add(revolve([[0.225, -0.27, 0.95], [0.19, -0.05, 0.85], [0.14, 0.06, 0.72], [0.128, 0.06, 0.72], [0.178, -0.05, 0.85], [0.213, -0.27, 0.95], [0.225, -0.27, 0.95]], 12))
    .add(boxGeo(0.24, 0.14, 0.17), { p: [0, -0.07, 0] }));

  // Bronze bell cuirass with a flared lower rim, shoulder plates and the cloak's brooches;
  // crimson sash at the waist.
  part('cuirass', 'champion', J.spine, s => {
    s.add(revolve([[0.178, -0.092], [0.171, -0.075], [0.152, -0.05], [0.147, -0.02], [0.15, 0.08], [0.17, 0.2], [0.174, 0.29], [0.152, 0.36], [0.09, 0.4], [0.05, 0.41], [0, 0.41]], 10), { s: [1, 1, 0.72] });
    for (const x of [-1, 1]) s.add(boxGeo(0.15, 0.025, 0.2), { p: [x * 0.125, 0.39, 0], r: [0, 0, -x * 12] });
    for (const x of [-1, 1]) s.add(cylinderGeo(0.024, 0.024, 0.012, 8), { p: [x * 0.14, 0.445, 0.004], r: [30, 0, 0] });
  });
  part('hero_chest_lames','champion',J.spine,s=>{for(let i=0;i<4;i++)s.add(boxGeo(.26-i*.012,.048,.016),{p:[0,.06+i*.067,.124-i*.003]});});
  part('belt', 'crimson', J.spine, s => s.add(revolve([[0.152, -0.048], [0.157, -0.04], [0.157, -0.012], [0.151, -0.004]], 10), { s: [1, 1, 0.72] }));
  // Crimson cloak pinned at both shoulders, over the shoulder plates and down the back to
  // above the knees. Rigid on the spine joint, so the rig and its channels are unchanged.
  part('cloak', 'crimson', J.spine, s => s.add(drape([[0.435, 0.14, -0.07, 0], [0.425, 0.165, -0.128, -0.07], [0.33, 0.178, -0.158, -0.098], [0.15, 0.2, -0.182, -0.125], [-0.1, 0.24, -0.226, -0.156], [-0.47, 0.3, -0.31, -0.2]], 10, 0.012, 0.022)));

  part('neck', 'skin', J.neck, s => s.add(cylinderGeo(0.05, 0.056, 0.14, 8), { p: [0, 0.05, 0] }));

  // Head and helmet. The helmet frame sits on the brow, above the eyes.
  const HELM = { p: [0, 0.145, 0.005] };
  part('head', 'skin', J.head, s => s
    .add(sphereGeo(1, 10, 8), { p: [0, 0.115, 0.005], s: [0.085, 0.118, 0.098] })
    .add(prism([[0, 0.03], [0.026, -0.022], [0, -0.032]], 0.026), { p: [0, 0.1, 0.09] }));
  part('helmet', 'bronze', J.head, s => {
    s.add(revolve([[0.124, -0.012], [0.113, 0.008], [0.113, 0.04], [0.102, 0.075], [0.078, 0.104], [0.042, 0.122], [0, 0.128]], 12), HELM, { s: [0.92, 1, 1.05] });
    for (const x of [-1, 1]) s.add(prism([[-0.035, 0.012], [0.07, 0.012], [0.058, -0.06], [0.03, -0.095], [-0.028, -0.085]], 0.012), HELM, { p: [x * 0.099, 0, 0], r: [0, 0, -x * 9] });
    s.add(boxGeo(0.15, 0.055, 0.012), HELM, { p: [0, -0.025, -0.118], r: [25, 0, 0] });
    s.add(boxGeo(0.022, 0.03, 0.2), HELM, { p: [0, 0.135, -0.01] });
  });
  // Champion's tall horsehair crest sweeping from the brow over the crown and down the back.
  const crestArc = (cz, cy, rz, ry) => [...Array(12)].map((_, i) => {
    const a = (35 + (150 * i) / 11) * D2R;
    return [cz + rz * Math.cos(a), cy + ry * Math.sin(a)];
  });
  part('crest', 'crimson', J.head, s => s.add(band(crestArc(-0.03, 0.04, 0.24, 0.34), crestArc(0, 0, 0.122, 0.138), 0.055), HELM));

  for (const side of ['right', 'left']) {
    const x = side === 'right' ? -1 : 1;
    J['shoulder_' + side] = createPivot('shoulder_' + side, [x * BODY.shoulderX, BODY.shoulderUp, 0], J.spine);
    J['elbow_' + side] = createPivot('elbow_' + side, [0, -BODY.upperArm, 0], J['shoulder_' + side]);
    J['wrist_' + side] = createPivot('wrist_' + side, [0, -BODY.forearm, 0], J['elbow_' + side]);
    const socket = createPivot('socket_' + side, GRIP.socket, J['wrist_' + side]);
    socket.name = 'socket_hand_' + side;
    socket.rotation.set(GRIP.tilt * D2R, 0, 0);

    part('sleeve_' + side, 'crimson', J['shoulder_' + side], s => s
      .add(cylinderGeo(0.06, 0.056, 0.11, 8), { p: [0, -0.045, 0] })
      .add(sphereGeo(0.062, 8, 6), { p: [0, 0, 0] }));
    part('upper_arm_' + side, 'skin', J['shoulder_' + side], s => s.add(cylinderGeo(0.05, 0.042, 0.3, 8), { p: [0, -0.145, 0] }));
    part('forearm_' + side, 'skin', J['elbow_' + side], s => s
      .add(cylinderGeo(0.042, 0.032, 0.26, 8), { p: [0, -0.125, 0] })
      .add(sphereGeo(0.043, 8, 6)));
    part('hand_' + side, 'skin', J['wrist_' + side], s => s.add(humanGrip(side), {p:GRIP.socket,r:[GRIP.tilt,0,0]}).add(sphereGeo(1,6,4),{p:[0,-.022,.006],s:[.028,.037,.028]}));

    J['hip_' + side] = createPivot('hip_' + side, [x * BODY.hipX, BODY.hipDrop, 0], J.hips);
    J['knee_' + side] = createPivot('knee_' + side, [0, -BODY.thigh, 0], J['hip_' + side]);
    J['ankle_' + side] = createPivot('ankle_' + side, [0, -BODY.shin, 0], J['knee_' + side]);
    part('thigh_' + side, 'skin', J['hip_' + side], s => s.add(cylinderGeo(0.072, 0.052, 0.44, 8), { p: [0, -0.21, 0] }));
    part('shin_' + side, 'skin', J['knee_' + side], s => s.add(cylinderGeo(0.05, 0.034, 0.45, 8), { p: [0, -0.215, 0] }));
    part('greave_' + side, 'bronze', J['knee_' + side], s => s.add(cylinderGeo(0.062, 0.044, 0.4, 8), { p: [0, -0.17, 0] }));
    part('foot_' + side, 'skin', J['ankle_' + side], s => s.add(prism([[-0.055, -0.085], [0.185, -0.085], [0.185, -0.058], [0.04, -0.01], [-0.055, -0.02]], 0.095)));
  }

  // Bronze leaf sword, grip centred on its origin in the right-hand socket (pack sword ~0.7 m).
  const sword = part('sword', 'bronze', root.getObjectByName('socket_hand_right'), s => s
    .add(cylinderGeo(GRIP.radius, GRIP.radius, GRIP.length, 8))
    .add(cylinderGeo(0.03, 0.042, 0.03, 8), { p: [0, -GRIP.length / 2 - 0.015, 0] })
    .add(boxGeo(0.034, 0.024, 0.11), { p: [0, GRIP.length / 2 + 0.012, 0] })
    .add(blade([[0.079, 0.022, 0.007], [0.12, 0.02, 0.007], [0.3, 0.018, 0.0065], [0.47, 0.028, 0.0065], [0.57, 0.022, 0.005], [0.635, 0.008, 0.003], [0.665, 0, 0]])));
  sword.name = 'sword';
  const shieldFrame=createPivot('shield_frame',[0,-.06,.055],J.wrist_left);shieldFrame.rotation.x=35*D2R;
  const shield=part('shield','champion',shieldFrame,s=>s.add(revolve([[0,-.012],[0.33,-.012],[0.33,.012],[0.30360000000000004,.035],[0.18150000000000002,.065],[0,.073]],28),{r:[90,0,0],s:[1,1,1.32]}));shield.name='shield';
  part('shield_grip','bronze',root.getObjectByName('socket_hand_left'),s=>s.add(cylinderGeo(GRIP.radius,GRIP.radius,GRIP.length,8)));
  part('shield_mount','bronze',shieldFrame,s=>s.add(boxGeo(.10,.045,.08),{p:[0,0,-.02]}));
  part('shield_emblem','crimson',shieldFrame,s=>{
   for(const poly of [[[-.08,-.18],[.05,-.18],[.06,.10],[-.08,.15]],[[-.08,.15],[-.04,.23],[.10,.15],[.17,.05],[.08,.01],[-.04,.07]],[[-.07,.14],[-.075,.25],[-.025,.20]]])s.add(prism(poly,.03),{p:[0,0,.066],r:[0,90,0]});
  });


  // Rest pose is the first idle frame, so a static instance stands in guard.
  const p0 = solve(GUARD);
  J.hips.position.set(...p0.hips);
  for (const j of [...UPPER, ...LEGS]) J[j].rotation.set(...p0[j].map(d => d * D2R), 'XYZ');
  return root;
}

function animate() {
  return [sampleClip('idle', IDLE_KEYS, 15, true), sampleClip('attack', ATTACK_KEYS, 30, false)];
}
