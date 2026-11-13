// Maintainer revision: Kiln UV API migration replaces the old UV-preserving wrapper with copyGeometry; geometry and existing UV values are unchanged.
// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// A 6-pounder field gun: the kind of asset a studio artist would build.
//
// This is the repository's hero, and it exists to show what the loop produces
// when the author actually spends geometry. Roughly 15k triangles across a
// turned bronze barrel, an oak carriage with real stepped cheeks, ironwork with
// bolt heads, and two twelve-spoke wheels. Kiln has no triangle budget, and this
// is what that is for.
//
// Every surface carries a procedural albedo plus a derived normal map, so the
// difference between the CPU rasterizer and a GPU PBR render is the whole story
// the contact sheet tells.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by the model itself,
// looking at its own renders through the Kiln tools and revising.
const meta = { name: 'FieldGun', category: 'prop', role: 'poi' };

async function build() {
  const root = createRoot('FieldGun');
  const uv = (g) => autoUnwrap(g, { resolution: 512 });

  // ---------- Materials ----------
  // Three materials, each albedo + derived normal, reused across every part. The
  // draw-call cost tracks distinct materials, not triangles, so detail is free
  // and material sprawl is not.
  const oakAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Oak',
    layers: [
      // Weathered oak, and the saturation is the load-bearing part. Two earlier
      // passes raised the VALUE to fix a dark render and both came back bright
      // orange, because a 30%-saturation mid-brown reads as painted plastic once
      // it is bright enough to see. Wood needs the grey kept in it: this sits
      // near 15% saturation, so it can be light without turning into a carrot.
      { op: 'solid', color: 0x87715b },
      { op: 'noise', colorA: 0x695641, colorB: 0xa38b70, scale: 14, octaves: 4, seed: 7, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x574734, colorB: 0x87715b, scale: 3, octaves: 3, seed: 21, blend: 'multiply', opacity: 0.22 },
    ],
  });
  const oak = pbrMaterial({
    albedo: oakAlbedo, normal: normalMapFromHeight(oakAlbedo, { strength: 4 }),
    roughness: 0.85, metalness: 0,
  });

  const ironAlbedo = proceduralTexture({
    schemaVersion: 2, size: 256, usage: 'albedo', name: 'Iron',
    layers: [
      { op: 'solid', color: 0x5d626b },
      { op: 'noise', colorA: 0x3b3f46, colorB: 0x828892, scale: 9, octaves: 4, seed: 3, blend: 'overlay', opacity: 0.7 },
    ],
  });
  const iron = pbrMaterial({
    albedo: ironAlbedo, normal: normalMapFromHeight(ironAlbedo, { strength: 3 }),
    roughness: 0.55, metalness: 0.9,
  });

  // Gun-metal bronze, not gold. At metalness 1 and roughness 0.34 this read as
  // polished brass on the first pass; a real barrel is darker, greener and much
  // less mirror-like.
  const bronzeAlbedo = proceduralTexture({
    schemaVersion: 2, size: 256, usage: 'albedo', name: 'Bronze',
    layers: [
      { op: 'solid', color: 0x8a7040 },
      { op: 'noise', colorA: 0x66532e, colorB: 0xa98a4f, scale: 7, octaves: 3, seed: 11, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x565c40, colorB: 0x8a7040, scale: 2, octaves: 2, seed: 31, blend: 'multiply', opacity: 0.22 },
    ],
  });
  const bronze = pbrMaterial({
    albedo: bronzeAlbedo, normal: normalMapFromHeight(bronzeAlbedo, { strength: 1.8 }),
    roughness: 0.42, metalness: 0.82,
  });

  // ---------- Carriage cheeks ----------
  // A stepped bracket, extruded and bevelled. The steps are what a real carriage
  // has so the breech can drop between them; a plain tapered plank reads as a
  // blockout immediately.
  // The trail runs back to -2.50. An earlier pass stopped it at -1.50 and the
  // whole gun read as a squat toy: on a real field piece the trail is roughly
  // twice the wheel diameter, and that length is most of the silhouette.
  const cheek = [
    [-2.50, 0.16], [-1.90, 0.30], [-1.30, 0.46], [-0.75, 0.62], [-0.32, 0.74],
    [-0.32, 0.90], [0.06, 0.94], [0.06, 1.06], [0.50, 1.08], [0.66, 1.08],
    [0.66, 0.66], [0.28, 0.52], [-0.30, 0.36], [-1.10, 0.20], [-1.90, 0.08], [-2.50, 0.02],
  ];
  const CHEEK_Z = 0.235;
  const CHEEK_T = 0.085;

  // Upper and lower envelopes of that outline, so ironwork and transoms can be
  // placed ON the cheek rather than at a guessed height. Straps that ignored
  // this are why an earlier pass left one hanging below ground.
  const topEdge = [[-2.50, 0.16], [-1.90, 0.30], [-1.30, 0.46], [-0.75, 0.62], [-0.32, 0.90], [0.06, 1.06], [0.50, 1.08], [0.66, 1.08]];
  const botEdge = [[-2.50, 0.02], [-1.90, 0.08], [-1.10, 0.20], [-0.30, 0.36], [0.28, 0.52], [0.66, 0.66]];
  const edgeAt = (edge, x) => {
    if (x <= edge[0][0]) return edge[0][1];
    if (x >= edge[edge.length - 1][0]) return edge[edge.length - 1][1];
    for (let i = 0; i < edge.length - 1; i++) {
      const [x0, y0] = edge[i];
      const [x1, y1] = edge[i + 1];
      if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return edge[edge.length - 1][1];
  };

  const cheekGeo = await uv(await extrudeProfile(cheek, { depth: CHEEK_T, bevel: 0.012, axis: 'z', segments: 8 }));
  for (const sz of [-1, 1]) {
    createPart(`Cheek_${sz > 0 ? 'R' : 'L'}`, cheekGeo, oak, { position: [0, 0, sz * CHEEK_Z], parent: root });
  }

  // ---------- Barrel ----------
  // One revolved profile: breech ring, first reinforce, chase taper, astragal,
  // muzzle swell. A stack of cylinders cannot produce this silhouette.
  // Just under 2 m, and slim. An earlier pass sized this to a real 6-pounder
  // (1.70 m against a 1.26 m wheel) and it still read stubby, because the 4.15 m
  // carriage dominates the frame. Matching the reference measurement is not the
  // same as matching how the reference reads, and the picture is what ships.
  const barrelProfile = [
    [0.000, -0.68], [0.145, -0.68], [0.145, -0.50], [0.124, -0.48],
    [0.124, -0.28], [0.136, -0.26], [0.136, -0.20], [0.104, -0.18],
    [0.092,  0.55], [0.082,  1.02], [0.096,  1.06], [0.096,  1.105],
    [0.111,  1.145], [0.111,  1.30], [0.000, 1.30],
  ];
  const barrelSolid = new THREE.Mesh(
    await revolveProfile(barrelProfile, { segments: 48, axis: 'x', smooth: true }), bronze,
  );
  const bore = new THREE.Mesh(cylinderXGeo(0.054, 0.054, 1.85, 24), bronze);
  bore.position.set(0.40, 0, 0);
  const barrel = await boolDiff('Barrel', barrelSolid, bore);
  barrel.name = 'Barrel';
  barrel.geometry = await uv(barrel.geometry);

  // Trunnions sit on the cheek tops and the muzzle oversails the wheels. Both are
  // load-bearing proportions: a muzzle that stops short of the wheel rim reads as
  // a stubby toy no matter how much detail sits on it.
  const GUN_X = 0.41;
  const GUN_Y = 1.09;
  const gun = createPivot('GunAssembly', [GUN_X, GUN_Y, 0], root);
  gun.rotation.z = (3 * Math.PI) / 180;
  gun.add(barrel);

  createPart('CascabelNeck', cylinderXGeo(0.045, 0.055, 0.09, 16), bronze, { position: [-0.725, 0, 0], parent: gun });
  createPart('CascabelKnob', sphereGeo(0.072, 20, 14), bronze, { position: [-0.795, 0, 0], parent: gun });

  for (const sz of [-1, 1]) {
    const side = sz > 0 ? 'R' : 'L';
    createPart(`Trunnion_${side}`, cylinderZGeo(0.058, 0.058, 0.14, 20), bronze, { position: [-0.06, -0.04, sz * 0.19], parent: gun });
    createPart(`TrunnionCap_${side}`, cylinderZGeo(0.070, 0.070, 0.022, 20), bronze, { position: [-0.06, -0.04, sz * 0.26], parent: gun });
    // Capsquare: the iron strap that actually holds a trunnion down.
    createPart(`Capsquare_${side}`, copyGeometry(boxGeo(0.10, 0.13, 0.016)), iron, { position: [-0.06, -0.10, sz * 0.285], parent: gun });
  }

  // Dolphins: the cast lifting handles on top of a real barrel.
  for (const sx of [-1, 1]) {
    const arc = bezierCurve([
      [sx * 0.10, 0.10, 0], [sx * 0.16, 0.23, 0], [sx * -0.02, 0.24, 0], [sx * -0.07, 0.11, 0],
    ], 18);
    createPart(`Dolphin_${sx > 0 ? 'F' : 'R'}`, curveToMesh(arc, 0.022, 20, 8), bronze, {
      position: [sx * 0.10 - 0.02, 0.03, 0], parent: gun,
    });
  }

  // ---------- Transoms and ironwork ----------
  // Transoms are placed at the mid-height of the cheek at their own x, so they
  // land inside the bracket instead of at a height guessed once and reused.
  const transomX = [0.52, -0.15, -1.20, -2.35];
  const transomGeo = await uv(await roundedBoxGeo(0.16, 0.13, 0.40, 0.014));
  for (let i = 0; i < transomX.length; i++) {
    const x = transomX[i];
    createPart(`Transom_${i}`, transomGeo, oak, {
      position: [x, (edgeAt(topEdge, x) + edgeAt(botEdge, x)) / 2, 0], parent: root,
    });
  }

  // Straps sized to the cheek at their own x, so each one lies on the bracket.
  const boltGeo = cylinderZGeo(0.017, 0.017, 0.022, 8);
  const strapX = [0.56, 0.10, -0.60, -1.50, -2.30];
  for (const sz of [-1, 1]) {
    const side = sz > 0 ? 'R' : 'L';
    for (let i = 0; i < strapX.length; i++) {
      const x = strapX[i];
      const top = edgeAt(topEdge, x) - 0.02;
      const bot = edgeAt(botEdge, x) + 0.02;
      const h = top - bot;
      const cy = (top + bot) / 2;
      createPart(`Strap_${side}${i}`, copyGeometry(boxGeo(0.06, h, 0.014)), iron, {
        position: [x, cy, sz * (CHEEK_Z + CHEEK_T / 2 + 0.007)], parent: root,
      });
      for (const t of [0.22, 0.78]) {
        createPart(`Bolt_${side}${i}${t > 0.5 ? 'a' : 'b'}`, boltGeo, iron, {
          position: [x, bot + h * t, sz * (CHEEK_Z + CHEEK_T / 2 + 0.019)], parent: root,
        });
      }
    }
  }

  // Quoin: the wedge that sets elevation, seated under the breech.
  // The breech drops into the channel between the cheeks and rests on this. It
  // spans the full channel width, as the real wedge does.
  createPart('Quoin', await uv(await extrudeProfile([[0, 0], [0.55, 0], [0.55, 0.24]], { depth: 0.34, axis: 'z', bevel: 0.012 })), oak, {
    position: [-0.20, 0.78, 0], parent: root,
  });

  // ---------- Axle ----------
  const AXLE_X = 0.35;
  const AXLE_Y = 0.62;
  createPart('Axle', cylinderZGeo(0.075, 0.075, 1.20, 20), oak, { position: [AXLE_X, AXLE_Y, 0], parent: root });
  for (const sz of [-1, 1]) {
    createPart(`AxleArm_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.055, 0.048, 0.22, 16), iron, { position: [AXLE_X, AXLE_Y, sz * 0.66], parent: root });
  }

  // ---------- Wheels: hub, twelve spokes, felloe, iron tyre, nails ----------
  const hubGeo = await uv(await revolveProfile(
    [[0.045, -0.13], [0.115, -0.13], [0.155, -0.07], [0.155, 0.07], [0.115, 0.13], [0.045, 0.13]],
    { segments: 24, axis: 'z', bevel: 0.008 },
  ));
  const hubBandGeo = cylinderZGeo(0.162, 0.162, 0.035, 24);
  const spokeGeo = cylinderGeo(0.028, 0.042, 0.38, 8);
  const felloeGeo = await uv(await revolveProfile(
    [[0.495, -0.058], [0.600, -0.058], [0.600, 0.058], [0.495, 0.058]], { segments: 48, axis: 'z', bevel: 0.012 },
  ));
  const tyreGeo = await uv(await revolveProfile(
    [[0.598, -0.064], [0.632, -0.064], [0.632, 0.064], [0.598, 0.064]], { segments: 48, axis: 'z', bevel: 0.006 },
  ));
  const nailGeo = cylinderGeo(0.016, 0.016, 0.02, 6);

  for (const sz of [-1, 1]) {
    const side = sz > 0 ? 'R' : 'L';
    const wheel = createPivot(`Wheel_${side}`, [AXLE_X, AXLE_Y, sz * 0.60], root);
    createPart(`Hub_${side}`, hubGeo, oak, { parent: wheel });
    createPart(`HubBandOut_${side}`, hubBandGeo, iron, { position: [0, 0, 0.09], parent: wheel });
    createPart(`HubBandIn_${side}`, hubBandGeo, iron, { position: [0, 0, -0.09], parent: wheel });
    const spoke = createPart(`Spoke_${side}0`, spokeGeo, oak, { position: [0, 0.33, 0], parent: wheel });
    arrayRadial(`Spoke_${side}`, spoke, 12, 'z', wheel);
    createPart(`Felloe_${side}`, felloeGeo, oak, { parent: wheel });
    createPart(`Tyre_${side}`, tyreGeo, iron, { parent: wheel });
    const nail = createPart(`Nail_${side}0`, nailGeo, iron, { position: [0, 0.636, 0], parent: wheel });
    arrayRadial(`Nail_${side}`, nail, 16, 'z', wheel);
  }

  // ---------- Trail furniture ----------
  createPart('Lunette', await uv(await extrudeProfile(circleProfile(0.10, 20), {
    depth: 0.032, axis: 'y', holes: [circleProfile(0.062, 20)], bevel: 0.008,
  })), iron, { position: [-2.62, 0.09, 0], parent: root });

  createPart('TrailShoe', await uv(await roundedBoxGeo(0.22, 0.10, 0.396, 0.016)), iron, {
    position: [-2.44, 0.05, 0], parent: root,
  });

  // Handspike seated against the outer face of the right cheek.
  createPart('Handspike', cylinderXGeo(0.032, 0.046, 0.90, 12), oak, {
    position: [-1.70, 0.34, CHEEK_Z + CHEEK_T / 2 + 0.05], rotation: [0, 0, 12], parent: root,
  });

  return root;
}
