const meta = { name: 'Trojan Horse', role: 'wonder' };

const TIMBER_SPEC = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm straight wood grain',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
  },
};
const BRONZE_SPEC = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};

// Named dimensions (metres)
const P = {
  deckHalfW: 1.6, deckHalfL: 3.2, deckTop: 1.0, deckThick: 0.26,
  wheelR: 0.6, wheelX: 1.9, axleZ: 2.1,
  torsoY: 4.7, wall: 0.14, bellyY: 3.85,
  hatchW: 0.8, hatchL: 1.5, hatchOpenDeg: 85,
};

// Cross-section for lofts, in the profile's XZ plane. zn is the extent toward -z' (the crest/top side), zp toward +z'.
function ring(w, zn, zp) {
  return [[0.7 * w, -zn], [w, -0.5 * zn], [w, 0.5 * zp], [0.7 * w, zp],
    [-0.7 * w, zp], [-w, 0.5 * zp], [-w, -0.5 * zn], [-0.7 * w, -zn]];
}
// Loft along local Y; rings: [y, w, zn, zp]
function loftY(rings) {
  return loftProfiles(rings.map(([y, w, zn, zp]) => ({ profile: ring(w, zn, zp), frame: { origin: [0, y, 0] } })), { cap: true });
}
// Tapered cylinder from point a to point b in the YZ plane (x equal); rA at a, rB at b.
function limb(name, a, b, rA, rB, mat, parent, segs = 6) {
  const dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dy, dz);
  return createPart(name, cylinderGeo(rB, rA, len, segs), mat, {
    position: [a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rotation: [Math.atan2(dz, dy) * 180 / Math.PI, 0, 0], parent,
  });
}

async function build() {
  // Tints are factors over the pack textures, chosen so factor x texture lands near the palette (timber #6b4a2e, bronze #b08d57).
  const timber = await compilePortableMaterialSpecV2({ ...TIMBER_SPEC, baseColor: 0xb0a89e });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE_SPEC, baseColor: 0xf7ca80 });
  const dark = await compilePortableMaterialSpecV2({ ...TIMBER_SPEC, baseColor: 0x6a6a6a });
  const labels = new Map([[timber, 'timber'], [dark, 'dark'], [bronze, 'bronze']]);

  const root = createRoot('TrojanHorse');

  // ---- Wheeled platform ----
  const deckY = P.deckTop - P.deckThick / 2;
  createPart('platform_deck', boxGeo(P.deckHalfW * 2, P.deckThick, P.deckHalfL * 2), timber, { position: [0, deckY, 0], parent: root });
  for (const s of [-1, 1]) {
    createPart('platform_rail_' + (s < 0 ? 'right' : 'left'), boxGeo(0.2, 0.22, P.deckHalfL * 2 + 0.3), dark,
      { position: [s * (P.deckHalfW + 0.1), deckY - 0.02, 0], parent: root });
  }
  for (const s of [-1, 1]) {
    createPart('axle_' + (s < 0 ? 'rear' : 'front'), cylinderGeo(0.15, 0.15, P.wheelX * 2, 8), dark,
      { position: [0, P.wheelR, s * P.axleZ], rotation: [0, 0, 90], parent: root });
  }
  createPart('tow_bracket', boxGeo(0.5, 0.12, 0.5), bronze, { position: [0, deckY, P.deckHalfL + 0.1], parent: root });

  // Wheels: each a named pivot at its axle, spinning about X
  const tireRaw = await extrudeProfile(
    Array.from({ length: 16 }, (_, i) => [P.wheelR * Math.cos(i / 16 * 2 * Math.PI), P.wheelR * Math.sin(i / 16 * 2 * Math.PI)]),
    { depth: 0.26, axis: 'x', holes: [Array.from({ length: 16 }, (_, i) => [0.5 * Math.cos(i / 16 * 2 * Math.PI), 0.5 * Math.sin(i / 16 * 2 * Math.PI)])] });
  const tireGeo = await autoUnwrap(tireRaw, { resolution: 256 });
  const wheelNames = [];
  for (const [fz, fname] of [[1, 'front'], [-1, 'rear']]) {
    for (const [sx, sname] of [[1, 'left'], [-1, 'right']]) {
      const name = `wheel_${fname}_${sname}`;
      wheelNames.push(name);
      const pivot = createPivot(name, [sx * P.wheelX, P.wheelR, fz * P.axleZ], root);
      pivot.name = name;
      createPart(name + '_disc', cylinderGeo(0.54, 0.54, 0.3, 14), timber, { rotation: [0, 0, 90], parent: pivot });
      createPart(name + '_tire', tireGeo, bronze, { parent: pivot });
      createPart(name + '_hub', cylinderGeo(0.2, 0.2, 0.44, 8), bronze, { rotation: [0, 0, 90], parent: pivot });
      createPart(name + '_plank_a', boxGeo(0.06, 1.0, 0.2), timber, { position: [sx * 0.18, 0, 0], parent: pivot });
      createPart(name + '_plank_b', boxGeo(0.06, 1.0, 0.2), timber, { position: [sx * 0.21, 0, 0], rotation: [90, 0, 0], parent: pivot });
    }
  }

  // ---- Hollow torso ----
  const wallT = P.wall;
  const outerRings = [[-2.15, 0.5, 0.55, 0.5], [-1.75, 0.82, 0.85, 0.9], [-0.4, 0.85, 0.85, 0.9],
    [1.2, 0.85, 0.95, 0.9], [1.75, 0.78, 0.85, 0.9], [2.1, 0.55, 0.65, 0.7]];
  const innerRings = [[-2.0, 0.48, 0.53, 0.52], [-1.75, 0.82 - wallT, 0.85 - wallT, 0.9 - wallT], [-0.4, 0.85 - wallT, 0.85 - wallT, 0.9 - wallT],
    [1.2, 0.85 - wallT, 0.95 - wallT, 0.9 - wallT], [1.75, 0.78 - wallT, 0.85 - wallT, 0.9 - wallT], [1.95, 0.51, 0.60, 0.65]];
  const bake = (g) => { g.rotateX(Math.PI / 2); g.translate(0, P.torsoY, 0); return g; };
  const outer = new THREE.Mesh(bake(loftY(outerRings)), timber);
  const inner = new THREE.Mesh(bake(loftY(innerRings)), timber);
  const hatchCut = new THREE.Mesh(new THREE.BoxGeometry(P.hatchW, 0.7, P.hatchL).translate(0, P.bellyY, 0), timber);
  const torso = await boolDiff('Torso', outer, inner, hatchCut, { preserveAttributes: true });
  root.add(torso);

  const wAt = (z) => (z < 1.2 ? 0.85 : 0.85 - (z - 1.2) / 0.55 * 0.07);
  for (const z of [-1.4, -0.7, 0, 0.7, 1.4]) {
    for (const s of [-1, 1]) {
      createPart('batten', boxGeo(0.1, 0.8, 0.2), dark, { position: [s * wAt(z), P.torsoY - 0.01, z], parent: root });
    }
  }

  // ---- Hatch in the belly ----
  const hatch = createPivot('hatch', [0, P.bellyY, -P.hatchL / 2 + 0.01], root);
  hatch.name = 'hatch';
  createPart('hatch_panel', boxGeo(P.hatchW - 0.04, 0.12, P.hatchL - 0.04), timber, { position: [0, 0.06, (P.hatchL - 0.04) / 2 + 0.01], parent: hatch });
  for (const z of [0.35, 1.1]) {
    createPart('hatch_strap', boxGeo(P.hatchW + 0.02, 0.03, 0.12), bronze, { position: [0, -0.012, z], parent: hatch });
  }
  createPart('hatch_pull', boxGeo(0.2, 0.05, 0.06), bronze, { position: [0, -0.03, 1.32], parent: hatch });
  createPart('hatch_hinge', cylinderGeo(0.05, 0.05, P.hatchW + 0.1, 8), bronze,
    { position: [0, P.bellyY - 0.02, -P.hatchL / 2 + 0.01], rotation: [0, 0, 90], parent: root });

  // ---- Legs ----
  for (const [s, side] of [[1, 'left'], [-1, 'right']]) {
    const x = s * 0.55;
    limb(`leg_front_${side}`, [x, 3.97, 1.4], [x, 1.2, 1.52], 0.4, 0.22, timber, root);
    limb(`leg_rear_upper_${side}`, [x, 3.97, -1.3], [x, 2.3, -1.9], 0.42, 0.28, timber, root);
    limb(`leg_rear_lower_${side}`, [x, 2.3, -1.9], [x, 1.2, -1.65], 0.28, 0.2, timber, root);
    createPart(`hoof_front_${side}`, boxGeo(0.5, 0.2, 0.56), dark, { position: [x, 1.1, 1.54], parent: root });
    createPart(`hoof_rear_${side}`, boxGeo(0.5, 0.2, 0.56), dark, { position: [x, 1.1, -1.67], parent: root });
  }

  // ---- Neck and head ----
  const nb = [4.95, 1.95], np = [6.4, 2.9];
  const ndy = np[0] - nb[0], ndz = np[1] - nb[1];
  const nlen = Math.hypot(ndy, ndz), nang = Math.atan2(ndz, ndy);
  createPart('neck', loftY([[0, 0.6, 0.6, 0.55], [0.8, 0.5, 0.5, 0.48], [nlen, 0.4, 0.42, 0.4]]), timber,
    { position: [0, nb[0], nb[1]], rotation: [nang * 180 / Math.PI, 0, 0], parent: root });
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + i * (nlen - 0.4) / 6;
    const zn = 0.6 - 0.2 * (t / nlen);
    const off = zn + 0.1;
    createPart('mane', boxGeo(0.14, 0.3, 0.3), dark, {
      position: [0, nb[0] + t * Math.cos(nang) + off * Math.sin(nang), nb[1] + t * Math.sin(nang) - off * Math.cos(nang)],
      rotation: [nang * 180 / Math.PI, 0, 0], parent: root,
    });
  }
  const h0 = [6.45, 2.85], hl = 1.35;
  const hang = Math.atan2(1.1, -0.75);
  createPart('head', loftY([[0, 0.42, 0.44, 0.44], [0.55, 0.36, 0.38, 0.4], [1.0, 0.27, 0.28, 0.3], [hl, 0.25, 0.25, 0.27]]), timber,
    { position: [0, h0[0], h0[1]], rotation: [hang * 180 / Math.PI, 0, 0], parent: root });
  for (const s of [-1, 1]) {
    // Place the base from the head's rotated local crest, with a small join overlap.
    const earStation = 0.12;
    const earCrest = -0.44 + (0.44 - 0.38) * earStation / 0.55;
    const earBaseY = h0[0] + earStation * Math.cos(hang) - earCrest * Math.sin(hang);
    const earBaseZ = h0[1] + earStation * Math.sin(hang) + earCrest * Math.cos(hang);
    createPart('ear', cylinderGeo(0, 0.09, 0.35, 4), dark, {
      position: [s * 0.2, earBaseY + 0.12, earBaseZ], rotation: [-10, 0, -s * 8], parent: root });
    createPart('eye', boxGeo(0.06, 0.12, 0.12), bronze, {
      position: [s * 0.39, h0[0] + 0.45 * Math.cos(hang), h0[1] + 0.45 * Math.sin(hang)], rotation: [hang * 180 / Math.PI, 0, 0], parent: root });
  }

  // ---- Tail ----
  limb('tail', [0, 5.15, -2.1], [0, 3.7, -2.55], 0.16, 0.07, dark, root, 5);

  // Bake static parts into one mesh per material; moving nodes keep their own merged meshes.
  // One call per material: a single multi-material pass was rejected by the evaluator.
  const movers = [hatch.name, ...wheelNames];
  const pivots = [hatch, ...wheelNames.map((n) => root.getObjectByName(n))];
  for (const only of ['timber', 'dark', 'bronze']) {
    mergeMeshes(root, 'static', movers, ['Torso'], labels, only);
    for (const node of pivots) mergeMeshes(node, node.name, [], [], labels, only);
  }

  return root;
}

// Merge the meshes under container (stopping at movers) into one baked mesh per material.
function mergeMeshes(container, prefix, movers, skipName, labels, only) {
  const all = [];
  const collect = (node) => {
    for (const c of node.children.slice()) {
      if (movers.includes(c.name) || skipName.includes(c.name)) continue;
      if (c.isMesh && labels.get(c.material) === only) all.push(c);
      collect(c);
    }
  };
  collect(container);
  const mats = [];
  for (const m of all) if (!mats.includes(m.material)) mats.push(m.material);
  for (const mat of mats) {
    const meshes = all.filter((m) => m.material === mat);
    const pos = [], nor = [], uv = [], idx = [];
    let base = 0;
    for (const m of meshes) {
      const g = m.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
      else for (let i = 0; i < p.count; i++) idx.push(i + base);
      base += p.count;
      m.parent.remove(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `Mesh_${prefix}_${labels.get(mat)}`;
    container.add(mesh);
  }
}

function animate(root) {
  const wheels = ['wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right'];
  const spin = [0, 90, 180, 270, 360].map((d, i) => ({ time: i * 0.5, rotation: [d, 0, 0] }));
  return [
    createClip('hatch_open', 1.2, [rotationTrack('hatch', [
      { time: 0, rotation: [0, 0, 0] }, { time: 1.2, rotation: [P.hatchOpenDeg, 0, 0] }], 'EASE_IN_OUT')], { loop: false }),
    createClip('wheels_roll', 2, wheels.map((w) => rotationTrack(w, spin)), { loop: true }),
  ];
}
