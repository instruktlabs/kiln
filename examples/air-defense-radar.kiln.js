// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 7 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opus, via claude.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.
//
// Refined later, in this repository, with `kiln_edit`: four fittings brought
// back onto the parts they bolt to, and the two bare-metal materials taken off
// a light base at metalness 0.9, which had been returning the studio dome at
// full brightness in the shape of a hub cap.
// The attribution above is for the authoring run, which had none of this in
// scope. Both passes went through the same tools; only the second one could
// see the gallery it was going into.

const meta = { name: 'AirDefenseRadar', category: 'prop', role: 'vehicle' };

// Truck-mounted air-defense phased-array radar, deployed on level ground.
// Frame: +X forward (cab), +Y up, +Z asset right. Ground plane at Y = 0.
//
// Layout along X:
//   +5.75 .. +3.10  flat cab-over cab, bumper, whips
//   +3.00 .. -2.85  load deck: generator box, cable trunk, lift rams, spare wheel
//   -0.40            array hinge line; the 4.5 x 5.5 m panel leans back at 60 deg
//                    and passes clear over the shelter roof
//   -2.60 .. -5.40  rear equipment shelter (door on the -X face)
// Axles at x = +4.05, +2.65, -2.75, -4.15 (8 wheels). Outrigger feet at Y = 0.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- helpers

// createPart auto-parents; position/rotation are set on the returned object so
// no assumption is made about the option-bag key names.
function part(name, geo, material, parent, pos, rot) {
  const p = createPart(name, geo, material, { parent: parent });
  if (pos && p && p.position) p.position.set(pos[0], pos[1], pos[2]);
  if (rot && p && p.rotation) p.rotation.set(rot[0], rot[1], rot[2]);
  return p;
}

function pivot(name, pos, parent) {
  const g = createPivot(name, [pos[0], pos[1], pos[2]], parent);
  if (g && g.position) g.position.set(pos[0], pos[1], pos[2]);
  return g;
}

// Verify a geometry actually came out the size we asked for; fall back to a box
// of the intended dimensions if it did not.
function checkGeo(geo, w, h, d, fallback) {
  try {
    if (!geo) return fallback();
    if (geo.computeBoundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    if (!b) return geo;
    const got = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const want = [w, h, d];
    for (let i = 0; i < 3; i++) {
      const tol = Math.max(0.06, want[i] * 0.3);
      if (Math.abs(got[i] - want[i]) > tol) return fallback();
    }
    return geo;
  } catch (e) {
    return fallback();
  }
}

function cylY(r, h, seg) {
  const s = seg || 16;
  try { return checkGeo(cylinderYGeo(r, h, s), r * 2, h, r * 2, function () { return boxGeo(r * 2, h, r * 2); }); }
  catch (e) { return boxGeo(r * 2, h, r * 2); }
}

function cylX(r, len, seg) {
  const s = seg || 16;
  try { return checkGeo(cylinderXGeo(r, len, s), len, r * 2, r * 2, function () { return boxGeo(len, r * 2, r * 2); }); }
  catch (e) { return boxGeo(len, r * 2, r * 2); }
}

function cylZ(r, len, seg) {
  const s = seg || 16;
  try { return checkGeo(cylinderZGeo(r, len, s), r * 2, r * 2, len, function () { return boxGeo(r * 2, r * 2, len); }); }
  catch (e) { return boxGeo(r * 2, r * 2, len); }
}

// Chamfered box for manufactured masses. Awaits WASM, hence async build().
async function rbox(w, h, d, r) {
  try {
    const g = await roundedBoxGeo(w, h, d, r === undefined ? 0.04 : r, 2);
    return checkGeo(g, w, h, d, function () { return boxGeo(w, h, d); });
  } catch (e) {
    return boxGeo(w, h, d);
  }
}

function mkMat(color, rough, metal) {
  let m;
  try {
    m = gameMaterial({ color: color, roughness: rough, metalness: metal });
  } catch (e) {
    try { m = gameMaterial(color); } catch (e2) { m = null; }
  }
  if (m) {
    if (m.color && m.color.setHex) m.color.setHex(color);
    if (rough !== undefined && 'roughness' in m) m.roughness = rough;
    if (metal !== undefined && 'metalness' in m) m.metalness = metal;
  }
  return m;
}

function mkGlass(color) {
  try {
    const g = glassMaterial({ color: color, roughness: 0.1 });
    if (g) {
      if (g.color && g.color.setHex) g.color.setHex(color);
      return g;
    }
  } catch (e) { /* fall through */ }
  return mkMat(color, 0.12, 0.35);
}

// ---------------------------------------------------------------- materials

const MAT = {};

// ---------------------------------------------------------------- sub-builders

// One road wheel. Axle runs along Z; `side` is +1 for the right-hand side so the
// lug nuts and hub cap sit on the outboard face.
function buildWheel(name, parent, x, y, z, side) {
  const R = 0.66;
  const W = 0.44;
  const g = pivot(name, [x, y, z], parent);

  part(name + '_Tire', cylZ(R, W, 20), MAT.rubber, g);
  part(name + '_Sidewall', cylZ(R - 0.10, W + 0.03, 16), MAT.rubberDark, g);
  part(name + '_Rim', cylZ(0.40, W + 0.05, 16), MAT.dark, g);
  part(name + '_HubCap', cylZ(0.17, W + 0.20, 12), MAT.steel, g);

  // tread blocks
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    part(name + '_Tread' + i, boxGeo(0.11, 0.17, W - 0.03), MAT.rubberDark, g,
      [Math.cos(a) * (R - 0.03), Math.sin(a) * (R - 0.03), 0], [0, 0, a]);
  }
  // lug nuts on the outboard face
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    part(name + '_Lug' + i, cylZ(0.045, 0.09, 8), MAT.steel, g,
      [Math.cos(a) * 0.27, Math.sin(a) * 0.27, side * (W * 0.5 + 0.06)]);
  }
  return g;
}

// One hydraulic outrigger jack: swing beam, housing, extended ram, foot pad on Y=0.
function buildOutrigger(name, parent, x, z, side) {
  const g = pivot(name, [x, 1.05, z], parent);
  part(name + '_Beam', boxGeo(0.34, 0.24, 0.95), MAT.body, g, [0, 0.12, -side * 0.50]);
  part(name + '_BeamCap', boxGeo(0.40, 0.30, 0.16), MAT.dark, g, [0, 0.12, 0]);
  part(name + '_Gusset', boxGeo(0.30, 0.16, 0.60), MAT.body, g, [0, -0.02, -side * 0.42]);
  part(name + '_Housing', cylY(0.15, 0.62, 14), MAT.dark, g, [0, -0.18, 0]);
  part(name + '_HousingCap', cylY(0.166, 0.08, 14), MAT.steel, g, [0, 0.14, 0]);
  part(name + '_Ram', cylY(0.095, 0.62, 12), MAT.chrome, g, [0, -0.55, 0]);
  part(name + '_Swivel', cylY(0.13, 0.16, 12), MAT.dark, g, [0, -0.85, 0]);
  part(name + '_Foot', cylY(0.32, 0.13, 18), MAT.dark, g, [0, -0.94, 0]);
  part(name + '_FootRib', boxGeo(0.56, 0.06, 0.10), MAT.dark, g, [0, -0.90, 0]);
  part(name + '_FootPad', cylY(0.34, 0.05, 18), MAT.rubberDark, g, [0, -1.023, 0]);
  // feed hoses
  part(name + '_Hose', cylY(0.035, 0.55, 8), MAT.rubberDark, g, [0.16, -0.15, side * 0.06]);
  part(name + '_HoseElbow', cylX(0.035, 0.22, 8), MAT.rubberDark, g, [0.06, 0.10, side * 0.06]);
  return g;
}

// One panel lift ram, built along local +Y then swung into place about Z.
function buildRam(name, parent, ax, ay, z, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const g = pivot(name, [ax, ay, z], parent);
  if (g && g.rotation) g.rotation.z = Math.atan2(-dx, dy);

  part(name + '_Clevis', boxGeo(0.20, 0.22, 0.26), MAT.dark, g, [0, 0.10, 0]);
  part(name + '_Pin', cylZ(0.07, 0.40, 10), MAT.steel, g, [0, 0.10, 0]);
  part(name + '_Barrel', cylY(0.115, len * 0.58, 16), MAT.body, g, [0, len * 0.32, 0]);
  part(name + '_BarrelRib', cylY(0.135, 0.09, 16), MAT.dark, g, [0, len * 0.14, 0]);
  part(name + '_Gland', cylY(0.135, 0.12, 16), MAT.steel, g, [0, len * 0.61, 0]);
  part(name + '_Rod', cylY(0.062, len * 0.42, 12), MAT.chrome, g, [0, len * 0.80, 0]);
  part(name + '_RodEye', cylZ(0.095, 0.24, 12), MAT.steel, g, [0, len - 0.02, 0]);
  part(name + '_RodPin', cylZ(0.05, 0.36, 10), MAT.chrome, g, [0, len - 0.02, 0]);
  part(name + '_FeedHose', cylY(0.032, len * 0.5, 8), MAT.rubberDark, g, [0.15, len * 0.30, 0]);
  part(name + '_FeedBlock', boxGeo(0.14, 0.16, 0.14), MAT.dark, g, [0.13, len * 0.10, 0]);
  return g;
}

// A louvred vent panel lying in the XY plane, facing +/-Z.
function buildVent(name, parent, x, y, z, w, h, slats, dir) {
  const d = dir === undefined ? 1 : dir;
  const g = pivot(name, [x, y, z], parent);
  part(name + '_Frame', boxGeo(w, h, 0.05), MAT.dark, g);
  part(name + '_Surround', boxGeo(w + 0.10, h + 0.10, 0.04), MAT.body, g, [0, 0, -d * 0.02]);
  const pitch = h / slats;
  for (let i = 0; i < slats; i++) {
    part(name + '_Slat' + i, boxGeo(w - 0.08, pitch * 0.55, 0.07), MAT.dark, g,
      [0, -h / 2 + pitch * (i + 0.5), d * 0.04], [d * 0.5, 0, 0]);
  }
  return g;
}

// ---------------------------------------------------------------- build

async function build() {
  const root = createRoot('AirDefenseRadar');

  MAT.body = mkMat(0x4c5344, 0.85, 0.10);       // olive drab paint
  MAT.dark = mkMat(0x2f342c, 0.80, 0.20);       // dark green / cast fittings
  // These two were 0xa4a9ae at metalness 0.90 and 0xc8ccd0 at 0.95, and every
  // fitting made of them -- hub caps, tow eyes, grab rails, the exhaust, the
  // ram rod -- came back as flat white silhouettes. A metal returns the
  // environment tinted by its base colour rather than a diffuse response, so a
  // light base at that metalness has nothing left to shade with: it is the
  // studio dome, at full brightness, in the shape of a part. Bringing both
  // nearer the panel elements (0x7a828b at 0.60, which reads correctly two
  // metres away in the same render) gives them back their cylinders.
  MAT.steel = mkMat(0x6a7076, 0.55, 0.55);      // bare steel
  MAT.chrome = mkMat(0x7a8087, 0.35, 0.62);     // hydraulic rod
  MAT.rubber = mkMat(0x1e1f22, 0.95, 0.05);     // tyre
  MAT.rubberDark = mkMat(0x121315, 0.95, 0.05); // tread / hoses / flaps
  MAT.face = mkMat(0x2c3138, 0.55, 0.35);       // array face plate
  MAT.elem = mkMat(0x7a828b, 0.40, 0.60);       // radiating elements
  MAT.amber = mkMat(0xc4761a, 0.45, 0.30);      // lamps
  MAT.glass = mkGlass(0x93aab8);

  // ============================================================ chassis
  const chassis = pivot('Chassis', [0, 0, 0], root);

  for (let s = -1; s <= 1; s += 2) {
    part('FrameRail' + (s < 0 ? 'L' : 'R'), boxGeo(11.0, 0.30, 0.20), MAT.dark, chassis,
      [-0.05, 1.03, s * 0.62]);
    part('FrameFlangeTop' + (s < 0 ? 'L' : 'R'), boxGeo(11.0, 0.06, 0.30), MAT.dark, chassis,
      [-0.05, 1.16, s * 0.62]);
    part('FrameFlangeBot' + (s < 0 ? 'L' : 'R'), boxGeo(11.0, 0.06, 0.30), MAT.dark, chassis,
      [-0.05, 0.90, s * 0.62]);
  }
  for (let i = 0; i < 9; i++) {
    const x = -5.0 + i * 1.25;
    part('CrossMember' + i, boxGeo(0.16, 0.24, 1.32), MAT.dark, chassis, [x, 1.02, 0]);
  }
  part('BellyPlate', boxGeo(6.6, 0.10, 1.34), MAT.dark, chassis, [-0.4, 0.86, 0]);
  part('Deck', await rbox(6.10, 0.12, 2.50, 0.04), MAT.body, chassis, [0.20, 1.24, 0]);
  part('DeckRibA', boxGeo(6.10, 0.06, 0.10), MAT.dark, chassis, [0.20, 1.31, 0.85]);
  part('DeckRibB', boxGeo(6.10, 0.06, 0.10), MAT.dark, chassis, [0.20, 1.31, -0.85]);
  part('DeckKerbL', boxGeo(6.10, 0.14, 0.09), MAT.dark, chassis, [0.20, 1.36, -1.24]);
  part('DeckKerbR', boxGeo(6.10, 0.14, 0.09), MAT.dark, chassis, [0.20, 1.36, 1.24]);

  // under-frame tankage
  part('FuelTank', cylX(0.34, 1.70, 18), MAT.steel, chassis, [0.10, 0.86, -1.02]);
  part('FuelTankStrapA', boxGeo(0.08, 0.76, 0.76), MAT.dark, chassis, [-0.40, 0.86, -1.02]);
  part('FuelTankStrapB', boxGeo(0.08, 0.76, 0.76), MAT.dark, chassis, [0.60, 0.86, -1.02]);
  part('FuelCap', cylZ(0.10, 0.12, 10), MAT.steel, chassis, [0.10, 0.98, -1.40]);
  part('AirTankA', cylX(0.20, 0.85, 14), MAT.steel, chassis, [1.30, 0.80, 1.02]);
  part('AirTankB', cylX(0.20, 0.85, 14), MAT.steel, chassis, [0.26, 0.80, 1.02]);
  part('BatteryBox', await rbox(0.70, 0.44, 0.52, 0.03), MAT.dark, chassis, [-0.70, 0.90, 1.05]);
  part('BatteryLid', boxGeo(0.74, 0.05, 0.56), MAT.body, chassis, [-0.70, 1.14, 1.05]);
  part('ToolBox', await rbox(0.90, 0.40, 0.48, 0.03), MAT.body, chassis, [-1.75, 0.92, -1.05]);
  part('ToolBoxLatch', boxGeo(0.06, 0.12, 0.10), MAT.steel, chassis, [-1.29, 0.92, -1.05]);

  // ============================================================ running gear
  const axleX = [4.05, 2.65, -2.75, -4.15];
  const running = pivot('RunningGear', [0, 0, 0], root);
  for (let i = 0; i < axleX.length; i++) {
    const x = axleX[i];
    part('Axle' + i, cylZ(0.10, 2.40, 14), MAT.dark, running, [x, 0.66, 0]);
    part('Diff' + i, cylZ(0.26, 0.46, 14), MAT.dark, running, [x, 0.66, 0.10]);
    for (let s = -1; s <= 1; s += 2) {
      buildWheel('Wheel' + i + (s < 0 ? 'L' : 'R'), running, x, 0.66, s * 1.30, s);
      part('Hub' + i + (s < 0 ? 'L' : 'R'), cylZ(0.22, 0.30, 12), MAT.dark, running, [x, 0.66, s * 1.05]);
      part('Spring' + i + (s < 0 ? 'L' : 'R'), boxGeo(1.10, 0.10, 0.16), MAT.dark, running, [x, 0.86, s * 0.78]);
      part('Damper' + i + (s < 0 ? 'L' : 'R'), cylY(0.07, 0.46, 10), MAT.steel, running,
        [x + 0.22, 0.88, s * 0.82], [0, 0, s * 0.18]);
      part('BrakeLine' + i + (s < 0 ? 'L' : 'R'), cylZ(0.03, 0.42, 6), MAT.rubberDark, running, [x - 0.12, 0.80, s * 0.85]);
    }
  }
  // drive shafts between the bogies
  part('DriveShaftF', cylX(0.07, 1.30, 10), MAT.steel, running, [3.35, 0.68, 0.10]);
  part('DriveShaftM', cylX(0.07, 2.20, 10), MAT.steel, running, [-0.05, 0.75, 0.10]);
  part('DriveShaftR', cylX(0.07, 1.30, 10), MAT.steel, running, [-3.45, 0.68, 0.10]);

  // mudguards: one flat guard per bogie per side, with turned-down lips
  const bogie = [[3.35, 2.90], [-3.45, 2.90]];
  for (let b = 0; b < bogie.length; b++) {
    for (let s = -1; s <= 1; s += 2) {
      const tag = 'Guard' + b + (s < 0 ? 'L' : 'R');
      const cx = bogie[b][0];
      const gl = bogie[b][1];
      part(tag + '_Top', boxGeo(gl, 0.07, 0.72), MAT.body, running, [cx, 1.52, s * 1.32]);
      part(tag + '_Skirt', boxGeo(gl, 0.26, 0.06), MAT.body, running, [cx, 1.40, s * 1.66]);
      part(tag + '_LipF', boxGeo(0.34, 0.06, 0.72), MAT.body, running,
        [cx + gl * 0.5 + 0.13, 1.45, s * 1.32], [0, 0, 0.45]);
      part(tag + '_LipR', boxGeo(0.34, 0.06, 0.72), MAT.body, running,
        [cx - gl * 0.5 - 0.13, 1.45, s * 1.32], [0, 0, -0.45]);
      part(tag + '_Brace', boxGeo(0.08, 0.30, 0.60), MAT.dark, running, [cx, 1.38, s * 1.02]);
      part(tag + '_Flap', boxGeo(0.04, 0.416, 0.66), MAT.rubberDark, running,
        [cx - gl * 0.5 - 0.26, 1.262, s * 1.32]);
    }
  }

  // spare wheel slung on the right of the deck
  buildWheel('SpareWheel', root, -1.30, 0.78, 1.55, 1);
  part('SpareCarrierArm', boxGeo(0.10, 0.90, 0.55), MAT.dark, root, [-1.30, 1.05, 1.25]);
  part('SpareCarrierPlate', boxGeo(0.80, 0.10, 0.30), MAT.dark, root, [-1.30, 1.44, 1.32]);
  part('SpareStrap', boxGeo(0.08, 1.32, 0.06), MAT.rubberDark, root, [-1.30, 0.78, 1.55]);

  // ============================================================ cab
  const cab = pivot('Cab', [4.28, 0, 0], root);
  part('CabShell', await rbox(2.35, 1.75, 2.44, 0.09), MAT.body, cab, [0, 2.14, 0]);
  part('CabRoof', await rbox(2.42, 0.10, 2.50, 0.05), MAT.body, cab, [0, 3.05, 0]);
  part('CabRoofRailL', boxGeo(2.30, 0.09, 0.08), MAT.dark, cab, [0, 3.14, -1.12]);
  part('CabRoofRailR', boxGeo(2.30, 0.09, 0.08), MAT.dark, cab, [0, 3.14, 1.12]);
  part('CabRoofHatch', await rbox(0.72, 0.09, 0.72, 0.03), MAT.dark, cab, [-0.20, 3.14, 0]);
  part('CabRoofHatchHandle', cylZ(0.03, 0.30, 8), MAT.steel, cab, [0.10, 3.20, 0]);
  part('CabFloorPan', boxGeo(2.35, 0.14, 2.40), MAT.dark, cab, [0, 1.28, 0]);
  part('CabWindshield', boxGeo(0.06, 0.72, 2.10), MAT.glass, cab, [1.19, 2.62, 0]);
  part('CabWindshieldPillar', boxGeo(0.10, 0.76, 0.10), MAT.body, cab, [1.19, 2.62, 0]);
  part('CabWindshieldSill', boxGeo(0.12, 0.10, 2.20), MAT.dark, cab, [1.18, 2.22, 0]);
  part('CabWindshieldHead', boxGeo(0.12, 0.10, 2.20), MAT.dark, cab, [1.18, 3.02, 0]);
  for (let s = -1; s <= 1; s += 2) {
    const t = s < 0 ? 'L' : 'R';
    part('CabDoor' + t, await rbox(1.30, 1.55, 0.06, 0.03), MAT.body, cab, [-0.15, 2.14, s * 1.24]);
    part('CabDoorWindow' + t, boxGeo(1.00, 0.58, 0.05), MAT.glass, cab, [-0.05, 2.60, s * 1.27]);
    part('CabDoorHandle' + t, boxGeo(0.22, 0.06, 0.07), MAT.steel, cab, [-0.68, 2.24, s * 1.29]);
    part('CabDoorHingeA' + t, boxGeo(0.08, 0.14, 0.10), MAT.dark, cab, [0.48, 2.62, s * 1.28]);
    part('CabDoorHingeB' + t, boxGeo(0.08, 0.14, 0.10), MAT.dark, cab, [0.48, 1.76, s * 1.28]);
    part('CabStepA' + t, boxGeo(0.60, 0.06, 0.34), MAT.dark, cab, [-0.30, 1.06, s * 1.30]);
    part('CabStepB' + t, boxGeo(0.60, 0.06, 0.34), MAT.dark, cab, [-0.30, 0.62, s * 1.30]);
    part('CabStepBracket' + t, boxGeo(0.08, 0.60, 0.30), MAT.dark, cab, [-0.02, 0.84, s * 1.30]);
    part('MirrorArm' + t, cylY(0.035, 0.80, 8), MAT.dark, cab, [1.02, 2.96, s * 1.34]);
    part('MirrorArmOut' + t, cylZ(0.035, 0.30, 8), MAT.dark, cab, [1.02, 3.34, s * 1.46]);
    part('Mirror' + t, boxGeo(0.07, 0.52, 0.20), MAT.dark, cab, [1.02, 3.02, s * 1.60]);
    part('MirrorGlass' + t, boxGeo(0.03, 0.44, 0.15), MAT.glass, cab, [0.98, 3.02, s * 1.60]);
    part('GrabRail' + t, cylY(0.035, 0.90, 8), MAT.steel, cab, [0.62, 2.10, s * 1.25]);
    part('Headlight' + t, cylX(0.15, 0.14, 14), MAT.glass, cab, [1.25, 1.62, s * 0.86]);
    part('HeadlightRim' + t, cylX(0.18, 0.10, 14), MAT.dark, cab, [1.22, 1.62, s * 0.86]);
    part('MarkerLamp' + t, boxGeo(0.076, 0.096, 0.16), MAT.amber, cab, [1.20, 3.02, s * 1.00]);
    part('ConvoyLamp' + t, cylX(0.07, 0.10, 10), MAT.amber, cab, [1.24, 1.30, s * 0.42]);
  }
  part('CabFrontPlate', await rbox(0.10, 0.60, 2.36, 0.03), MAT.body, cab, [1.20, 1.72, 0]);
  for (let i = 0; i < 6; i++) {
    part('CabGrille' + i, boxGeo(0.06, 0.07, 1.70), MAT.dark, cab, [1.26, 1.94 + i * 0.10, 0]);
  }
  part('Bumper', await rbox(0.34, 0.42, 2.62, 0.05), MAT.dark, cab, [1.42, 1.00, 0]);
  part('BumperStepL', boxGeo(0.30, 0.06, 0.50), MAT.steel, cab, [1.42, 1.22, -0.80]);
  part('BumperStepR', boxGeo(0.30, 0.06, 0.50), MAT.steel, cab, [1.42, 1.22, 0.80]);
  part('TowEyeL', boxGeo(0.30, 0.22, 0.09), MAT.steel, cab, [1.50, 0.90, -0.55]);
  part('TowEyeR', boxGeo(0.30, 0.22, 0.09), MAT.steel, cab, [1.50, 0.90, 0.55]);
  part('CabRearPanel', boxGeo(0.08, 1.75, 2.44), MAT.dark, cab, [-1.20, 2.14, 0]);
  part('ExhaustStack', cylY(0.09, 1.90, 12), MAT.steel, cab, [-1.10, 2.30, 1.32]);
  part('ExhaustCap', cylY(0.11, 0.12, 12), MAT.dark, cab, [-1.10, 3.30, 1.32]);
  part('ExhaustHeatShield', boxGeo(0.18, 0.80, 0.24), MAT.dark, cab, [-1.02, 2.10, 1.32]);
  part('AirIntake', cylY(0.13, 1.60, 12), MAT.dark, cab, [-1.10, 2.20, -1.32]);
  part('AirIntakeHead', await rbox(0.30, 0.30, 0.30, 0.04), MAT.dark, cab, [-1.10, 3.12, -1.32]);

  // antenna whips on the cab roof
  for (let s = -1; s <= 1; s += 2) {
    const t = s < 0 ? 'L' : 'R';
    const w = pivot('Whip' + t, [3.30, 3.12, s * 1.02], root);
    if (w && w.rotation) w.rotation.z = 0.11;   // slight rearward lean
    part('WhipBase' + t, cylY(0.09, 0.16, 10), MAT.dark, w, [0, 0.06, 0]);
    part('WhipInsulator' + t, cylY(0.055, 0.22, 10), MAT.rubberDark, w, [0, 0.24, 0]);
    part('WhipSegA' + t, cylY(0.035, 1.00, 8), MAT.dark, w, [0, 0.86, 0]);
    part('WhipSegB' + t, cylY(0.024, 0.90, 8), MAT.dark, w, [0, 1.80, 0]);
    part('WhipSegC' + t, cylY(0.014, 0.80, 6), MAT.dark, w, [0, 2.62, 0]);
    part('WhipTip' + t, cylY(0.022, 0.08, 6), MAT.amber, w, [0, 3.04, 0]);
    part('WhipTieDown' + t, cylY(0.012, 0.70, 6), MAT.rubberDark, w, [0.18, 0.60, 0], [0, 0, 0.5]);
  }

  // ============================================================ generator box
  const gen = pivot('GeneratorBox', [1.85, 0, -0.60], root);
  part('GenShell', await rbox(1.90, 1.02, 1.20, 0.05), MAT.body, gen, [0, 1.82, 0]);
  part('GenBase', boxGeo(1.96, 0.10, 1.26), MAT.dark, gen, [0, 1.34, 0]);
  part('GenRoof', await rbox(1.98, 0.08, 1.28, 0.03), MAT.dark, gen, [0, 2.36, 0]);
  part('GenRoofRib', boxGeo(0.10, 0.07, 1.28), MAT.body, gen, [0, 2.42, 0]);
  part('GenLiftEyeA', cylZ(0.06, 0.06, 8), MAT.steel, gen, [0.70, 2.46, -0.40]);
  part('GenLiftEyeB', cylZ(0.06, 0.06, 8), MAT.steel, gen, [-0.70, 2.46, -0.40]);
  buildVent('GenVentIn', gen, 0.45, 1.82, -0.62, 0.70, 0.66, 6, -1);
  buildVent('GenVentOut', gen, -0.45, 1.82, -0.62, 0.70, 0.66, 6, -1);
  part('GenAccessDoor', await rbox(1.10, 0.80, 0.05, 0.02), MAT.dark, gen, [0.10, 1.80, 0.61]);
  part('GenDoorHandle', boxGeo(0.18, 0.05, 0.06), MAT.steel, gen, [-0.38, 1.80, 0.66]);
  part('GenDoorHingeA', boxGeo(0.07, 0.12, 0.06), MAT.steel, gen, [0.60, 2.10, 0.64]);
  part('GenDoorHingeB', boxGeo(0.07, 0.12, 0.06), MAT.steel, gen, [0.60, 1.50, 0.64]);
  part('GenPanel', boxGeo(0.44, 0.34, 0.05), MAT.dark, gen, [-0.62, 2.02, 0.62]);
  part('GenPanelFace', boxGeo(0.34, 0.24, 0.04), MAT.steel, gen, [-0.62, 2.02, 0.65]);
  part('GenPanelLamp', cylZ(0.035, 0.05, 8), MAT.amber, gen, [-0.72, 2.10, 0.67]);
  part('GenExhaust', cylY(0.10, 0.95, 12), MAT.steel, gen, [0.78, 2.84, -0.42]);
  part('GenExhaustElbow', cylX(0.10, 0.30, 12), MAT.steel, gen, [0.78, 3.28, -0.42], [0, 0, 0]);
  part('GenExhaustCap', cylY(0.13, 0.09, 12), MAT.dark, gen, [0.78, 3.32, -0.42]);
  part('GenFuelCap', cylY(0.09, 0.09, 10), MAT.steel, gen, [-0.80, 2.42, 0.30]);
  part('GenMountA', boxGeo(0.16, 0.14, 1.26), MAT.dark, gen, [0.78, 1.24, 0]);
  part('GenMountB', boxGeo(0.16, 0.14, 1.26), MAT.dark, gen, [-0.78, 1.24, 0]);

  // ============================================================ cable trunk
  const trunk = pivot('CableTrunk', [0, 0, 0], root);
  part('TrunkRun', cylX(0.11, 2.30, 12), MAT.rubberDark, trunk, [0.02, 1.42, -1.05]);
  part('TrunkRunB', cylX(0.07, 2.30, 10), MAT.rubberDark, trunk, [0.02, 1.42, -0.86]);
  part('TrunkRiser', cylY(0.11, 0.45, 12), MAT.rubberDark, trunk, [1.16, 1.62, -1.05]);
  part('TrunkElbow', cylZ(0.11, 0.24, 12), MAT.rubberDark, trunk, [1.16, 1.422, -1.05]);
  part('TrunkGland', cylY(0.14, 0.12, 12), MAT.steel, trunk, [1.16, 1.84, -1.05]);
  for (let i = 0; i < 5; i++) {
    part('TrunkClamp' + i, boxGeo(0.09, 0.34, 0.14), MAT.dark, trunk, [-0.95 + i * 0.52, 1.34, -1.05]);
  }
  part('TrunkJunction', await rbox(0.50, 0.46, 0.42, 0.03), MAT.dark, trunk, [-1.24, 1.58, -1.05]);
  part('TrunkJunctionLid', boxGeo(0.54, 0.05, 0.46), MAT.body, trunk, [-1.24, 1.83, -1.05]);
  // slack loop climbing to the panel hinge
  part('TrunkLoopA', cylY(0.09, 0.46, 10), MAT.rubberDark, trunk, [-1.30, 2.02, -1.05], [0, 0, -0.30]);
  part('TrunkLoopB', cylX(0.09, 0.52, 10), MAT.rubberDark, trunk, [-1.08, 2.26, -1.05], [0, 0, 0.45]);
  part('TrunkLoopC', cylY(0.09, 0.44, 10), MAT.rubberDark, trunk, [-0.86, 2.10, -1.05], [0, 0, 0.35]);
  part('TrunkPanelGland', cylY(0.13, 0.14, 12), MAT.steel, trunk, [-0.80, 1.92, -1.05]);

  // stowage on the deck under the raised panel
  part('DeckCrate', await rbox(1.10, 0.62, 1.00, 0.04), MAT.body, root, [-1.95, 1.62, 0.55]);
  part('DeckCrateLid', boxGeo(1.16, 0.06, 1.06), MAT.dark, root, [-1.95, 1.95, 0.55]);
  part('DeckCrateStrapA', boxGeo(0.07, 0.66, 1.06), MAT.dark, root, [-1.60, 1.62, 0.55]);
  part('DeckCrateStrapB', boxGeo(0.07, 0.66, 1.06), MAT.dark, root, [-2.30, 1.62, 0.55]);
  part('DeckWaveguide', cylX(0.10, 1.80, 12), MAT.steel, root, [-1.70, 1.42, -0.30]);
  part('DeckWaveguideClampA', boxGeo(0.08, 0.30, 0.13), MAT.dark, root, [-1.20, 1.34, -0.30]);
  part('DeckWaveguideClampB', boxGeo(0.08, 0.30, 0.13), MAT.dark, root, [-2.20, 1.34, -0.30]);

  // ============================================================ rear shelter
  const shel = pivot('EquipmentShelter', [-4.00, 0, 0], root);
  part('ShelterShell', await rbox(2.80, 1.72, 2.42, 0.06), MAT.body, shel, [0, 2.16, 0]);
  part('ShelterBase', boxGeo(2.86, 0.10, 2.48), MAT.dark, shel, [0, 1.32, 0]);
  part('ShelterSubframe', boxGeo(2.80, 0.16, 2.10), MAT.dark, shel, [0, 1.20, 0]);
  part('ShelterSubBearerL', boxGeo(2.80, 0.10, 0.26), MAT.dark, shel, [0, 1.12, -0.62]);
  part('ShelterSubBearerR', boxGeo(2.80, 0.10, 0.26), MAT.dark, shel, [0, 1.12, 0.62]);
  part('ShelterRoof', await rbox(2.88, 0.09, 2.50, 0.04), MAT.dark, shel, [0, 3.05, 0]);
  part('ShelterRoofRibA', boxGeo(0.09, 0.07, 2.50), MAT.body, shel, [0.80, 3.12, 0]);
  part('ShelterRoofRibB', boxGeo(0.09, 0.07, 2.50), MAT.body, shel, [0, 3.12, 0]);
  part('ShelterRoofRibC', boxGeo(0.09, 0.07, 2.50), MAT.body, shel, [-0.80, 3.12, 0]);
  part('ShelterCornerFL', boxGeo(0.10, 1.72, 0.10), MAT.dark, shel, [1.38, 2.16, -1.18]);
  part('ShelterCornerFR', boxGeo(0.10, 1.72, 0.10), MAT.dark, shel, [1.38, 2.16, 1.18]);
  part('ShelterCornerBL', boxGeo(0.10, 1.72, 0.10), MAT.dark, shel, [-1.38, 2.16, -1.18]);
  part('ShelterCornerBR', boxGeo(0.10, 1.72, 0.10), MAT.dark, shel, [-1.38, 2.16, 1.18]);
  // door on the -X face
  part('ShelterDoor', await rbox(0.07, 1.52, 0.86, 0.02), MAT.dark, shel, [-1.42, 2.14, 0.42]);
  part('ShelterDoorFrame', boxGeo(0.05, 1.66, 1.00), MAT.body, shel, [-1.38, 2.14, 0.42]);
  part('ShelterDoorWindow', boxGeo(0.05, 0.34, 0.40), MAT.glass, shel, [-1.46, 2.62, 0.42]);
  part('ShelterDoorHandle', cylZ(0.05, 0.26, 10), MAT.steel, shel, [-1.48, 2.10, 0.06]);
  part('ShelterDoorLever', boxGeo(0.06, 0.24, 0.06), MAT.steel, shel, [-1.50, 1.98, 0.06]);
  part('ShelterDoorHingeA', boxGeo(0.08, 0.16, 0.10), MAT.steel, shel, [-1.46, 2.72, 0.84]);
  part('ShelterDoorHingeB', boxGeo(0.08, 0.16, 0.10), MAT.steel, shel, [-1.46, 2.14, 0.84]);
  part('ShelterDoorHingeC', boxGeo(0.08, 0.16, 0.10), MAT.steel, shel, [-1.46, 1.56, 0.84]);
  part('ShelterDoorSill', boxGeo(0.24, 0.07, 0.94), MAT.dark, shel, [-1.44, 1.34, 0.42]);
  // access ladder below the door
  part('LadderStileL', boxGeo(0.07, 1.20, 0.07), MAT.dark, shel, [-1.48, 0.72, 0.06]);
  part('LadderStileR', boxGeo(0.07, 1.20, 0.07), MAT.dark, shel, [-1.48, 0.72, 0.78]);
  for (let i = 0; i < 3; i++) {
    part('LadderRung' + i, cylZ(0.035, 0.78, 8), MAT.steel, shel, [-1.48, 0.34 + i * 0.36, 0.42]);
  }
  // vents and fittings on the flanks
  buildVent('ShelterVentA', shel, 0.70, 2.30, 1.22, 0.80, 0.70, 7, 1);
  buildVent('ShelterVentB', shel, -0.30, 2.30, 1.22, 0.80, 0.70, 7, 1);
  buildVent('ShelterVentC', shel, 0.70, 2.30, -1.22, 0.80, 0.70, 7, -1);
  buildVent('ShelterVentD', shel, -0.30, 2.30, -1.22, 0.80, 0.70, 7, -1);
  part('ShelterAC', await rbox(0.80, 0.44, 0.66, 0.04), MAT.dark, shel, [0.60, 3.32, -0.60]);
  part('ShelterACGrille', boxGeo(0.06, 0.32, 0.54), MAT.steel, shel, [0.24, 3.32, -0.60]);
  part('ShelterCableDuct', await rbox(2.20, 0.16, 0.20, 0.03), MAT.dark, shel, [0, 3.20, 0.92]);
  part('ShelterAntennaMount', boxGeo(0.20, 0.20, 0.20), MAT.dark, shel, [-1.10, 3.20, -0.90]);
  part('ShelterAntenna', cylY(0.03, 0.90, 8), MAT.dark, shel, [-1.10, 3.72, -0.90]);
  part('ShelterHandrail', cylX(0.035, 2.40, 8), MAT.steel, shel, [0, 3.34, 1.14]);
  part('ShelterHandrailPostA', cylY(0.035, 0.30, 8), MAT.steel, shel, [1.10, 3.20, 1.14]);
  part('ShelterHandrailPostB', cylY(0.035, 0.30, 8), MAT.steel, shel, [-1.10, 3.20, 1.14]);
  part('ShelterStowRack', boxGeo(1.20, 0.09, 0.60), MAT.dark, shel, [-0.60, 3.16, -0.30]);
  part('ShelterTailLampL', boxGeo(0.09, 0.26, 0.20), MAT.amber, shel, [-1.44, 1.60, -0.92]);
  part('ShelterTailLampR', boxGeo(0.09, 0.26, 0.20), MAT.amber, shel, [-1.44, 1.60, 1.10]);
  part('ShelterRearTowEyeL', boxGeo(0.26, 0.20, 0.09), MAT.steel, shel, [-1.52, 1.02, -0.60]);
  part('ShelterRearTowEyeR', boxGeo(0.26, 0.20, 0.09), MAT.steel, shel, [-1.52, 1.02, 0.60]);

  // ============================================================ outriggers
  buildOutrigger('OutriggerFL', root, 1.55, -1.60, -1);
  buildOutrigger('OutriggerFR', root, 1.55, 1.60, 1);
  buildOutrigger('OutriggerRL', root, -4.95, -1.60, -1);
  buildOutrigger('OutriggerRR', root, -4.95, 1.60, 1);

  // ============================================================ array hinge
  const HX = -0.40;
  const HY = 1.60;
  const hinge = pivot('ArrayHinge', [HX, HY, 0], root);
  part('HingeBeam', boxGeo(0.34, 0.30, 3.104), MAT.dark, hinge, [0, -0.12, 0]);
  part('HingePin', cylZ(0.11, 3.40, 14), MAT.steel, hinge, [0, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const z = [-1.42, -0.62, 0.62, 1.42][i];
    part('HingeLug' + i, boxGeo(0.40, 0.60, 0.20), MAT.dark, hinge, [0, -0.22, z]);
  }
  part('HingePedestalL', boxGeo(0.50, 0.46, 0.34), MAT.body, root, [HX, 1.22, -1.10]);
  part('HingePedestalR', boxGeo(0.50, 0.46, 0.34), MAT.body, root, [HX, 1.22, 1.10]);
  // ram base mounts on the deck, forward of the hinge
  for (let s = -1; s <= 1; s += 2) {
    part('RamMount' + (s < 0 ? 'L' : 'R'), boxGeo(0.42, 0.34, 0.30), MAT.dark, root, [0.55, 1.42, s * 1.20]);
    part('RamMountGusset' + (s < 0 ? 'L' : 'R'), boxGeo(0.28, 0.22, 0.10), MAT.body, root, [0.55, 1.26, s * 1.20]);
  }

  // ============================================================ array panel
  // Local frame: +X up the panel from the hinge, +Z across its width,
  // -Y is the radiating face. Swung 120 deg about Z -> 60 deg from horizontal,
  // leaning back over the shelter, face pointing forward and up.
  const panel = pivot('ArrayPanel', [HX, HY, 0], root);
  if (panel && panel.rotation) panel.rotation.z = TAU / 3;

  const PL = 5.45;   // length up the panel
  const PW = 4.42;   // width across
  const PCX = 0.10 + PL * 0.5;

  part('PanelBacking', await rbox(PL, 0.14, PW, 0.04), MAT.dark, panel, [PCX, 0.09, 0]);
  part('PanelFacePlate', boxGeo(PL - 0.20, 0.08, PW - 0.16), MAT.face, panel, [PCX, -0.04, 0]);

  // back structure: longerons, cross ribs, diagonal braces
  for (let i = 0; i < 4; i++) {
    const z = [-1.72, -0.58, 0.58, 1.72][i];
    part('PanelLongeron' + i, boxGeo(PL - 0.10, 0.26, 0.13), MAT.dark, panel, [PCX, 0.28, z]);
  }
  for (let i = 0; i < 8; i++) {
    const x = 0.35 + i * 0.72;
    part('PanelCrossRib' + i, boxGeo(0.12, 0.24, PW - 0.10), MAT.dark, panel, [x, 0.28, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const x = 0.70 + i * 0.85;
    const sgn = i % 2 === 0 ? 1 : -1;
    part('PanelBraceA' + i, boxGeo(0.90, 0.10, 0.09), MAT.dark, panel, [x, 0.40, sgn * 1.15], [0, sgn * 0.62, 0]);
    part('PanelBraceB' + i, boxGeo(0.90, 0.10, 0.09), MAT.dark, panel, [x, 0.40, -sgn * 1.15], [0, -sgn * 0.62, 0]);
  }
  part('PanelSpineBeam', boxGeo(PL - 0.10, 0.20, 0.22), MAT.dark, panel, [PCX, 0.44, 0]);
  part('PanelHingeBoss', cylZ(0.20, 3.10, 14), MAT.steel, panel, [0.12, 0.06, 0]);
  for (let i = 0; i < 4; i++) {
    const z = [-1.42, -0.62, 0.62, 1.42][i];
    part('PanelHingeLug' + i, boxGeo(0.46, 0.46, 0.22), MAT.dark, panel, [0.16, 0.12, z]);
  }

  // coolant manifold and waveguide runs on the back
  part('PanelManifold', cylZ(0.14, PW - 0.30, 14), MAT.steel, panel, [0.60, 0.46, 0]);
  part('PanelManifoldB', cylZ(0.10, PW - 0.60, 12), MAT.steel, panel, [1.30, 0.48, 0]);
  for (let i = 0; i < 5; i++) {
    part('PanelCoolantRun' + i, boxGeo(PL - 1.4, 0.10, 0.10), MAT.steel, panel, [PCX + 0.30, 0.50, -1.60 + i * 0.80]);
  }
  part('PanelJunctionBox', await rbox(0.60, 0.36, 0.50, 0.03), MAT.body, panel, [0.85, 0.52, -1.90]);
  part('PanelFeedTrunk', cylY(0.11, 0.60, 12), MAT.rubberDark, panel, [0.55, 0.52, -1.90], [0, 0, 1.2]);

  // ram attach lugs
  for (let s = -1; s <= 1; s += 2) {
    part('PanelRamLug' + (s < 0 ? 'L' : 'R'), boxGeo(0.36, 0.44, 0.20), MAT.dark, panel, [1.80, 0.30, s * 1.20]);
    part('PanelRamPin' + (s < 0 ? 'L' : 'R'), cylZ(0.06, 0.32, 10), MAT.steel, panel, [1.80, 0.342, s * 1.20]);
  }

  // ---- lattice border standing proud of the face
  const BY = -0.16;
  part('BorderRailL', boxGeo(PL, 0.34, 0.16), MAT.body, panel, [PCX, BY, -PW * 0.5 + 0.08]);
  part('BorderRailR', boxGeo(PL, 0.34, 0.16), MAT.body, panel, [PCX, BY, PW * 0.5 - 0.08]);
  part('BorderRailBottom', boxGeo(0.16, 0.34, PW), MAT.body, panel, [0.18, BY, 0]);
  part('BorderRailTop', boxGeo(0.16, 0.34, PW), MAT.body, panel, [PL, BY, 0]);
  part('BorderCornerBL', boxGeo(0.26, 0.36, 0.26), MAT.dark, panel, [0.18, BY, -PW * 0.5 + 0.10]);
  part('BorderCornerBR', boxGeo(0.26, 0.36, 0.26), MAT.dark, panel, [0.18, BY, PW * 0.5 - 0.10]);
  part('BorderCornerTL', boxGeo(0.26, 0.36, 0.26), MAT.dark, panel, [PL, BY, -PW * 0.5 + 0.10]);
  part('BorderCornerTR', boxGeo(0.26, 0.36, 0.26), MAT.dark, panel, [PL, BY, PW * 0.5 - 0.10]);
  // diagonal lattice ties along the long sides
  for (let i = 0; i < 16; i++) {
    const x = 0.50 + i * 0.31;
    const sgn = i % 2 === 0 ? 1 : -1;
    for (let s = -1; s <= 1; s += 2) {
      part('LatticeTie' + i + (s < 0 ? 'L' : 'R'), boxGeo(0.34, 0.06, 0.26), MAT.dark, panel,
        [x, BY - 0.02, s * (PW * 0.5 - 0.17)], [0, sgn * s * 0.72, 0]);
    }
  }
  // ties across the ends
  for (let i = 0; i < 12; i++) {
    const z = -1.95 + i * 0.355;
    const sgn = i % 2 === 0 ? 1 : -1;
    part('LatticeTieBot' + i, boxGeo(0.26, 0.06, 0.34), MAT.dark, panel, [0.42, BY - 0.02, z], [0, sgn * 0.72, 0]);
    part('LatticeTieTop' + i, boxGeo(0.26, 0.06, 0.34), MAT.dark, panel, [PL - 0.24, BY - 0.02, z], [0, -sgn * 0.72, 0]);
  }

  // ---- dense grid of square radiating elements
  const COLS = 18;
  const ROWS = 20;
  const PZ = 0.205;
  const PXP = 0.215;
  const z0 = -((COLS - 1) * PZ) * 0.5;
  const x0 = 0.75;
  const face = pivot('RadiatingArray', [0, 0, 0], panel);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      part('Element_r' + r + '_c' + c, boxGeo(0.15, 0.09, 0.15), MAT.elem, face,
        [x0 + r * PXP, -0.125, z0 + c * PZ]);
    }
  }
  // element sub-array separators, every 5 columns / 6 rows
  for (let c = 5; c < COLS; c += 5) {
    part('ArraySeamC' + c, boxGeo(ROWS * PXP + 0.10, 0.05, 0.04), MAT.dark, face,
      [x0 + (ROWS - 1) * PXP * 0.5, -0.10, z0 + (c - 0.5) * PZ]);
  }
  for (let r = 6; r < ROWS; r += 6) {
    part('ArraySeamR' + r, boxGeo(0.04, 0.05, COLS * PZ + 0.10), MAT.dark, face,
      [x0 + (r - 0.5) * PXP, -0.10, 0]);
  }
  // boresight / IFF fittings on the face
  part('BoresightHorn', cylX(0.10, 0.34, 12), MAT.steel, face, [PL - 0.14, -0.30, 0], [0, 0, -Math.PI / 2]);
  part('BoresightPlate', boxGeo(0.22, 0.06, 0.34), MAT.dark, face, [PL - 0.14, -0.20, 0]);

  // ============================================================ lift rams
  // Attach point on the panel: hinge + 1.80 along the panel, 0.30 behind it.
  // Panel local axes in world: +X -> (-0.5, 0.866), +Y -> (-0.866, -0.5).
  const dirX = -0.5, dirY = Math.sqrt(3) / 2;
  const bx = HX + 1.80 * dirX + 0.30 * (-dirY);
  const by = HY + 1.80 * dirY + 0.30 * (dirX);
  buildRam('LiftRamL', root, 0.55, 1.48, -1.20, bx, by);
  buildRam('LiftRamR', root, 0.55, 1.48, 1.20, bx, by);

  // hydraulic power pack feeding the rams
  part('HydPack', await rbox(0.70, 0.50, 0.60, 0.03), MAT.dark, root, [0.55, 1.60, 0.72]);
  part('HydPackMotor', cylX(0.16, 0.42, 12), MAT.steel, root, [0.95, 1.60, 0.72]);
  part('HydPackHoseA', cylX(0.045, 0.90, 8), MAT.rubberDark, root, [0.10, 1.46, 0.72]);
  part('HydPackHoseB', cylZ(0.045, 2.10, 8), MAT.rubberDark, root, [0.55, 1.34, 0]);

  return root;
}
