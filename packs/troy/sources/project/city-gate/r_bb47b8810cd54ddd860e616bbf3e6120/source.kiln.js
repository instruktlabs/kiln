const meta = { name: 'City gate', role: 'building' };

// Gate module between two 6 m wall sections. Origin on the ground at the footprint centre.
// X runs along the wall, Y is up, +Z faces the plain (outside); doors swing inward (-Z).
const P = {
  width: 6.0,        // module length along the wall, matches the 6 m wall tiling
  depth: 3.2,        // wall thickness at the walk: 2 m walk + two 0.6 m parapets
  footingDepth: 4.0, // footing flares out at the base
  footingH: 1.5,
  passage: 3.0,      // clear width of the passage
  passageH: 3.8,     // clear height under the lintel
  lintelH: 0.4,
  deckY: 7.0,
  parapetH: 1.0,     // wall top is deckY + parapetH = 8 m
  doorT: 0.18,
  doorZ: 0.6,        // closed door plane, inside the passage
  openDeg: 86,
};

// UVs from world position so brick courses and grain stay continuous across separate blocks.
function worldUV(geo, c, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + c[0], y = p.getY(i) + c[1], z = p.getZ(i) + c[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z / tile, y / tile);
    else if (ay >= az) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

// Static geometry is baked per (parent, material) so the gate costs a handful of draw calls.
const LABELS = new Map();
const BUCKETS = new Map();

function bucketAdd(parent, mat, geo, pos) {
  if (!BUCKETS.has(parent)) BUCKETS.set(parent, new Map());
  const byMat = BUCKETS.get(parent);
  if (!byMat.has(mat)) byMat.set(mat, []);
  byMat.get(mat).push({ geo, pos });
}

function flushBuckets() {
  for (const [parent, byMat] of BUCKETS) {
    for (const [mat, items] of byMat) {
      const positions = [], normals = [], uvs = [], indices = [];
      for (const { geo, pos } of items) {
        const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        const base = positions.length / 3;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i) + pos[0], p.getY(i) + pos[1], p.getZ(i) + pos[2]);
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          uvs.push(uv.getX(i), uv.getY(i));
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) indices.push(base + geo.index.getX(i));
        else for (let i = 0; i < p.count; i++) indices.push(base + i);
      }
      createPart(parent.name + '_' + LABELS.get(mat), meshGeo({ positions, normals, uvs, indices }), mat, { parent });
    }
  }
  BUCKETS.clear();
}

function block(name, w, h, d, pos, mat, tile, parent) {
  bucketAdd(parent, mat, worldUV(copyGeometry(boxGeo(w, h, d)), pos, tile), pos);
}

// Sloped footing: trapezoid in Z/Y, running along X from x0 to x1.
function footingGeo(x0, x1, tile) {
  const hw0 = P.footingDepth / 2, hw1 = P.depth / 2, h = P.footingH;
  const v = [
    [x0, 0, -hw0], [x1, 0, -hw0], [x1, 0, hw0], [x0, 0, hw0],
    [x0, h, -hw1], [x1, h, -hw1], [x1, h, hw1], [x0, h, hw1],
  ];
  const mid = [(x0 + x1) / 2, h / 2, 0];
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 6, 7], [0, 1, 5, 4], [0, 3, 7, 4], [1, 2, 6, 5]];
  const positions = [], indices = [], uvs = [];
  for (let f of faces) {
    let q = f.map(i => v[i]);
    const a = q[0], b = q[1], c = q[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
    const cx = (q[0][0] + q[2][0]) / 2 - mid[0], cy = (q[0][1] + q[2][1]) / 2 - mid[1], cz = (q[0][2] + q[2][2]) / 2 - mid[2];
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) q = [q[0], q[3], q[2], q[1]];
    const base = positions.length / 3;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    for (const p of q) {
      positions.push(p[0], p[1], p[2]);
      if (ax >= ay && ax >= az) uvs.push(p[2] / tile, p[1] / tile);
      else if (ay >= az) uvs.push(p[0] / tile, p[2] / tile);
      else uvs.push(p[0] / tile, p[1] / tile);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return meshGeo({ positions, indices, uvs });
}

async function build() {
  BUCKETS.clear();
  const root = createRoot('CityGate');
  const portable = (spec) => compilePortableMaterialSpecV2(spec);

  const mudbrickSpec = {
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Mudbrick', baseColor: 0xcdf5ff,
    roughness: 1, metalness: 1,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness' },
    },
  };
  const mudbrick = await portable(mudbrickSpec);
  const limestone = await portable({ ...mudbrickSpec, name: 'Limestone footing', baseColor: 0xb8e0f0 });
  const timber = await portable({
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Timber', baseColor: 0xb8afa8,
    roughness: 1, metalness: 1,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
    },
  });
  const bronze = await portable({
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Bronze', baseColor: 0xffcf7a,
    roughness: 0.7, metalness: 0.9,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
    },
  });

  LABELS.set(mudbrick, 'mudbrick'); LABELS.set(limestone, 'limestone');
  LABELS.set(timber, 'timber'); LABELS.set(bronze, 'bronze');
  const MT = 3, TT = 1; // texture tile sizes in metres (coarse masonry for 20 m readability)
  const hw = P.width / 2, hp = P.passage / 2, hd = P.depth / 2;
  const pierTop = P.passageH + P.lintelH;

  // Footings and jambs (the passage stays open between them)
  const walls = createPivot('Walls', [0, 0, 0], root);
  walls.name = 'walls';
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : hp, x1 = s < 0 ? -hp : hw;
    bucketAdd(walls, limestone, footingGeo(x0, x1, MT), [0, 0, 0]);
    block(s < 0 ? 'pier_left' : 'pier_right', hw - hp, pierTop - P.footingH, P.depth,
      [s * (hw + hp) / 2, (P.footingH + pierTop) / 2, 0], mudbrick, MT, walls);
  }
  // Mudbrick over the passage up to the wall walk
  block('gate_head', P.width, P.deckY - pierTop, P.depth, [0, (pierTop + P.deckY) / 2, 0], mudbrick, MT, walls);

  // Timber lintel: four beams side by side, bearing into the piers, proud of the faces by 0.05
  const lintelLen = P.passage + 0.8, lintelD = P.depth + 0.1, nb = 4;
  for (let i = 0; i < nb; i++) {
    block('lintel_beam_' + (i + 1), lintelLen, P.lintelH, lintelD / nb,
      [0, P.passageH + P.lintelH / 2, -lintelD / 2 + lintelD / nb * (i + 0.5)], timber, TT, walls);
  }

  // Parapet: low wall with merlons on a 1.5 m pitch so it repeats across 6 m wall sections
  const pitch = 1.5, pT = 0.6, baseH = P.parapetH / 2;
  for (const s of [-1, 1]) {
    const z = s * (hd - pT / 2);
    const side = s > 0 ? 'front' : 'back';
    block('parapet_' + side, P.width, baseH, pT, [0, P.deckY + baseH / 2, z], mudbrick, MT, walls);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * pitch;
      block('merlon_' + side + '_' + (k + 1), 1.0, P.parapetH - baseH, pT, [x, P.deckY + baseH + (P.parapetH - baseH) / 2, z], mudbrick, MT, walls);
      // beam head projecting under the walk
      block('beam_head_' + side + '_' + (k + 1), 0.3, 0.3, 0.2, [x, P.deckY - 0.45, s * (hd + 0.1)], timber, TT, walls);
    }
  }

  // Doors: pivot on the jamb face, leaf thickness on the +Z side so it folds flat against the jamb inward
  const leafW = hp - 0.01, leafH = P.passageH - 0.1, leafY = 0.05 + leafH / 2;
  function door(s) {
    const name = s < 0 ? 'door_left' : 'door_right';
    const pivot = createPivot(name, [s * hp, 0, P.doorZ], root);
    pivot.name = name;
    const cx = -s * leafW / 2;
    block('leaf', leafW, leafH, P.doorT, [cx, leafY, P.doorT / 2], timber, TT, pivot);
    for (const y of [0.55, leafH / 2 + 0.05, leafH - 0.45]) {
      block('batten', leafW - 0.1, 0.22, 0.06, [cx, y, P.doorT + 0.03], timber, TT, pivot);
    }
    for (const y of [0.55, leafH - 0.45]) {
      block('strap', 0.7, 0.12, 0.04, [-s * 0.35, y, P.doorT + 0.08], bronze, 1, pivot);
      block('pin', 0.08, 0.08, 0.06, [-s * 0.62, y, P.doorT + 0.11], bronze, 1, pivot);
    }
    return pivot;
  }
  door(-1);
  door(1);
  flushBuckets();
  return root;
}

function animate(root) {
  const a = P.openDeg;
  const track = (name, sign, from, to) => rotationTrack(name, [
    { time: 0, rotation: [0, sign * from, 0] }, { time: 2, rotation: [0, sign * to, 0] },
  ], 'EASE_IN_OUT');
  return [
    createClip('open', 2, [track('door_left', 1, 0, a), track('door_right', -1, 0, a)], { loop: false }),
    createClip('close', 2, [track('door_left', 1, a, 0), track('door_right', -1, a, 0)], { loop: false }),
  ];
}
