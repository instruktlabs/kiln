// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opus, via claude.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.
//
// Refined later, in this repository, with `kiln_edit`. First the lower hull
// strakes were brought back onto the plating they sit on and the two satcom
// plates onto the whip masts beside them -- 46 floating parts, none of them
// visible at ship scale and all of them fatal to a structural gate. Then the
// hull, the flight deck and the deck-edge netting were rebuilt off their own
// planform curves instead of out of slabs squared to the keel, which is what
// the teeth around the counter and down both deck edges had always been.
// The attribution above is for the authoring run, which had none of this in
// scope. Both passes went through the same tools; only the second one could
// see the gallery it was going into.

const meta = { name: 'AircraftCarrier', category: 'prop' };

// Nuclear supercarrier, Nimitz-class proportions.
//   LOA          330 m   (x from -165 stern to +165 bow)
//   Flight deck  78 m max beam (port edge -44, starboard edge +34)
//   Draft        12 m    (hull bottom at Y = -12; the asset sits on Y = 0 at the WATERLINE,
//                         so the keel is intentionally below grade)
//   Flight deck  Y = 20  (top surface)
// Frame: +X forward (bow), +Y up, +Z starboard.

const LOA_FWD = 165;
const LOA_AFT = -165;
const DECK_Y = 20.0;        // top of the flight deck
const DECK_T = 1.7;         // flight deck slab thickness
const KEEL_Y = -12.0;       // draft

function lerp(a, b, t) {
  const c = t < 0 ? 0 : (t > 1 ? 1 : t);
  return a + (b - a) * c;
}

// ---------------------------------------------------------------- planform
// Starboard edge of the flight deck as a function of x.
function deckStb(x) {
  if (x >= 152) return lerp(18, 4, (x - 152) / 13);      // flared bow point
  if (x >= 118) return lerp(34, 18, (x - 118) / 34);     // bow taper
  if (x >= -142) return 34;                              // constant starboard edge
  return lerp(13, 34, (x - LOA_AFT) / 23);               // stern round-in
}

// Port edge of the flight deck as a function of x. The bulge from x -60..+85 is
// the angled landing area sponson, which is what pushes max beam to 78 m.
function deckPort(x) {
  if (x >= 152) return lerp(-16, -4, (x - 152) / 13);
  if (x >= 112) return lerp(-30, -16, (x - 112) / 40);
  if (x >= 85) return lerp(-44, -30, (x - 85) / 27);
  if (x >= -60) return -44;                              // angled-deck sponson
  if (x >= -95) return lerp(-30, -44, (x + 95) / 35);
  if (x >= -142) return -30;
  return lerp(-12, -30, (x - LOA_AFT) / 23);
}

// Hull half-beam at the waterline.
function hullHB(x) {
  if (x >= 142) return lerp(13, 2.2, (x - 142) / 23);    // fine entry
  if (x >= 104) return lerp(20.5, 13, (x - 104) / 38);
  if (x >= -138) return 20.5;
  return lerp(15.5, 20.5, (x - LOA_AFT) / 27);           // transom run
}

// Hull half-width at station x and height y: the whole shell in one function,
// from the flat of keel at Y=-12 up through the turn of bilge, the parallel
// side, and the flare out to the deck-edge knuckle. It is piecewise linear in
// both x and y, which is what lets the loft below be exact with a handful of
// stations -- every breakpoint is a station, and between breakpoints a straight
// line is the right answer rather than an approximation of one.
function hullZ(x, y) {
  const hb = hullHB(x);
  const ub = Math.min(hb + 3.2, 23.6);
  if (y <= -8) return hb * lerp(0.34, 0.88, (y - KEEL_Y) / 4);   // rise of floor
  if (y <= -1) return hb * lerp(0.88, 1.0, (y + 8) / 7);         // turn of bilge
  if (y <= 8) return hb;                                         // parallel side
  if (y <= 11) return lerp(hb, ub, (y - 8) / 3);                 // knuckle flare
  return ub;
}

// Skinned loft over a series of equal-length rings, capped at both ends and
// wound outward by signed volume. Same helper the fighter jet uses for its
// fuselage; a hull is the same problem at forty times the scale.
function loftGeo(sections) {
  const M = sections.length;
  const N = sections[0].length;
  const verts = [];
  for (let s = 0; s < M; s++) {
    for (let i = 0; i < N; i++) {
      verts.push(sections[s][i][0], sections[s][i][1], sections[s][i][2]);
    }
  }
  const idx = [];
  for (let s = 0; s < M - 1; s++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = s * N + i;
      const b = s * N + j;
      const c = (s + 1) * N + i;
      const d = (s + 1) * N + j;
      idx.push(a, c, d, a, d, b);
    }
  }
  for (let e = 0; e < 2; e++) {
    const base = e === 0 ? 0 : (M - 1) * N;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < N; i++) {
      cx += sections[e === 0 ? 0 : M - 1][i][0];
      cy += sections[e === 0 ? 0 : M - 1][i][1];
      cz += sections[e === 0 ? 0 : M - 1][i][2];
    }
    const ci = verts.length / 3;
    verts.push(cx / N, cy / N, cz / N);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (e === 0) idx.push(ci, base + j, base + i);
      else idx.push(ci, base + i, base + j);
    }
  }
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t] * 3;
    const i1 = idx[t + 1] * 3;
    const i2 = idx[t + 2] * 3;
    vol += verts[i0] * (verts[i1 + 1] * verts[i2 + 2] - verts[i1 + 2] * verts[i2 + 1]);
    vol += verts[i0 + 1] * (verts[i1 + 2] * verts[i2] - verts[i1] * verts[i2 + 2]);
    vol += verts[i0 + 2] * (verts[i1] * verts[i2 + 1] - verts[i1 + 1] * verts[i2]);
  }
  if (vol < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tmp;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const ANGLE_DEG = 9;                                     // angled deck, to port
const D2R = Math.PI / 180;

function build() {
  const root = createRoot('AircraftCarrier');

  // ------------------------------------------------------------- materials
  const matHullGray = gameMaterial(0x4a5259);   // topside haze gray
  const matHullRed = gameMaterial(0x6d2b24);    // antifouling, below waterline
  const matDeck = gameMaterial(0x33373b);       // nonskid flight deck
  const matDeckWorn = gameMaterial(0x3d4247);   // elevator platforms / patches
  const matIsland = gameMaterial(0x545c63);     // island superstructure
  const matDark = gameMaterial(0x1b1e21);       // glass, netting, wires, tracks
  const matWhite = gameMaterial(0xd6d9d4);      // deck markings
  const matYellow = gameMaterial(0xb99a2c);     // centerline / cat markings
  const matRed = gameMaterial(0x8c3b2f);        // foul lines, JBD faces
  const matRadar = gameMaterial(0x9aa0a4);      // phased-array faces

  function box(name, parent, sx, sy, sz, px, py, pz, mat, rx, ry, rz) {
    const p = createPart(name, boxGeo(sx, sy, sz), mat, {
      parent: parent,
      position: [px, py, pz]
    });
    if (rx || ry || rz) p.rotation.set(rx || 0, ry || 0, rz || 0);
    return p;
  }

  // =====================================================================
  // HULL
  // =====================================================================
  const hull = createPivot('Hull', [0, 0, 0], root);

  // The shell is lofted, not stacked.
  //
  // It used to be a run of axis-aligned slabs, one per station, each held at the
  // half-beam of its own centre. Where the beam changes -- the fine entry, the
  // whole counter -- every join left an end cap facing aft, and an end cap is
  // lit as a different surface from the plating either side of it. So the ship
  // wore a comb of red teeth around the stern, and halving the station spacing
  // only ever doubled the number of teeth, because the discontinuity was in the
  // normals and not in the size of the step. A loft shares its vertices, so
  // there is no cap to catch the light and no step to refine.
  //
  // Ten stations, placed on every breakpoint in hullHB with a few spares on the
  // straight runs. hullZ is piecewise linear in x and in y, so between two
  // breakpoints the straight line the loft draws is the exact answer.
  const HSTATIONS = [-165, -152, -138, -60, 20, 104, 124, 142, 154, 165];

  // One ring of the shell between two heights: up the starboard side through
  // `levels`, across the top, down the port side, closed along the bottom.
  // `bulge` pushes the ring outboard, which is how the boot topping stands proud
  // of the plating instead of fighting it for the same surface.
  function shellRing(x, levels, bulge) {
    const ring = [];
    for (let i = 0; i < levels.length; i++) {
      ring.push([x, levels[i], hullZ(x, levels[i]) + bulge]);
    }
    for (let i = levels.length - 1; i >= 0; i--) {
      ring.push([x, levels[i], -(hullZ(x, levels[i]) + bulge)]);
    }
    return ring;
  }

  function shellBand(name, levels, bulge, mat) {
    const sections = [];
    for (let i = 0; i < HSTATIONS.length; i++) {
      sections.push(shellRing(HSTATIONS[i], levels, bulge));
    }
    createPart(name, loftGeo(sections), mat, { parent: hull });
  }

  // Every crease is doubled 0.2 m apart rather than shared, and that includes
  // the top and bottom edge of each band. A vertex on the edge of a band belongs
  // to the vertical plating and to the horizontal face that closes the band off,
  // so sharing it tilts the averaged normal 45 degrees and then bleeds that all
  // the way up the next crease -- six and a half metres of topside shaded as a
  // curve. Doubling confines the blend to a hand's width and the flat of the
  // side stays flat.
  shellBand('HullUnderbody', [KEEL_Y, -8, -1.1, -0.9, -0.2, 0], 0, matHullRed);
  shellBand('HullBoot', [0, 0.2, 1, 1.2], 0.12, matDark);
  shellBand('HullTopside', [1.2, 1.4, 7.9, 8.1, 10.9, 11.1, 18.1, 18.3], 0, matHullGray);

  // Bulbous bow and forefoot (kept inside the 330 m LOA)
  box('BulbousBow', hull, 18, 8, 8.5, 156, -7.5, 0, matHullRed);
  box('BowStem', hull, 6, 20, 5.0, 162, 6, 0, matHullGray);
  box('BowFlareStb', hull, 34, 9.2, 7, 146, 13.6, 12.5, matHullGray, 0, 0, 0);
  box('BowFlarePort', hull, 34, 9.2, 7, 146, 13.6, -12.5, matHullGray, 0, 0, 0);
  // Transom
  box('Transom', hull, 2, 24, 32, -164, 3, 0, matHullGray);
  box('TransomShelf', hull, 6, 2.2, 34, -161, 15.5, 0, matHullGray);

  // Hull plating strakes -- long thin ribs that break up the slab sides.
  for (let s = 0; s < 3; s++) {
    const sy = [3.0, 8.0, 12.6][s];
    for (let k = 0; k < 10; k++) {
      // Confined to the parallel midbody, which is where a strake runs on a
      // real hull and, more to the point, the only place a straight one can.
      // These were fourteen 22 m boxes on a 23 m pitch spanning the whole 330 m,
      // each held at the half-beam of its own centre. That is exact amidships
      // and wrong at both ends: the entry narrows 11 m over a single strake's
      // length, so every forward one stood out past the plating and the ship
      // grew a row of teeth along the bow. Between -136 and +102 the beam is
      // flat 20.5 m, so a straight rib is straight.
      //
      // The offsets: the lower two rows stood 0.44 m off the plating they are
      // welded to -- 44 floating-part warnings, invisible at ship scale and
      // fatal to a structural gate -- because the outward offset was larger
      // than the rib is deep. Asking the shell itself where its surface is at
      // that height settles it for every row at once, including the one above
      // the knuckle where the plating has already flared out.
      const xc = -125 + k * 24;
      const hb = hullZ(xc, sy) + 0.15;
      box('StrakeStb_' + s + '_' + k, hull, 22, 0.55, 0.5, xc, sy, hb, matHullGray);
      box('StrakePort_' + s + '_' + k, hull, 22, 0.55, 0.5, xc, sy, -hb, matHullGray);
    }
  }

  // Anchor pockets and hawse
  box('AnchorPocketStb', hull, 5, 4, 1.2, 150, 9, 10.6, matDark);
  box('AnchorPocketPort', hull, 5, 4, 1.2, 150, 9, -10.6, matDark);

  // =====================================================================
  // SPONSONS -- the shelves that carry the flight-deck overhang
  // =====================================================================
  const spons = createPivot('Sponsons', [0, 0, 0], root);
  let si = 0;
  for (let x = -150; x <= 130; x += 11) {
    const outStb = deckStb(x) - 1.0;
    const outPort = deckPort(x) + 1.0;
    // The shelf is 8.5 m long and the shell is not parallel under all of it, so
    // the inner edge has to reach the narrowest point of the run, not the
    // half-beam at its centre. Anything less leaves the forward or after corner
    // hanging in air over the counter.
    const hb = Math.min(hullZ(x - 4.25, 16.6), hullZ(x + 4.25, 16.6)) - 0.3;

    if (outStb - hb > 1.5) {
      const w = outStb - hb;
      box('SponsonStb_' + si, spons, 8.5, 2.4, w, x, 16.6, hb + w / 2, matHullGray);
      // knee brace under the shelf
      box('SponsonBraceStb_' + si, spons, 1.0, 5.0, w * 0.85, x, 13.2,
        hb + w / 2, matHullGray, 0, 0, 0);
    }
    if (outPort + hb < -1.5) {
      const w = -outPort - hb;
      box('SponsonPort_' + si, spons, 8.5, 2.4, w, x, 16.6, -(hb + w / 2), matHullGray);
      box('SponsonBracePort_' + si, spons, 1.0, 5.0, w * 0.85, x, 13.2,
        -(hb + w / 2), matHullGray, 0, 0, 0);
    }
    si++;
  }

  // Weapon / CIWS sponsons at the four quarters
  // Tubs sit under the deck overhang, so their tops stay clear of the deck soffit (Y 18.3).
  const gunSpots = [
    [146, 15, 'BowStb'], [146, -13, 'BowPort'],
    [-152, 22, 'QuarterStb'], [-152, -21, 'QuarterPort'],
    [40, 33, 'MidStb'], [-20, -43, 'MidPort']
  ];
  for (let g = 0; g < gunSpots.length; g++) {
    const gx = gunSpots[g][0];
    const gz = gunSpots[g][1];
    const nm = gunSpots[g][2];
    const sgn = gz > 0 ? 1 : -1;
    const ghb = Math.min(hullZ(gx - 4.5, 12.6), hullZ(gx + 4.5, 12.6)) - 0.3;
    // Shelf spanning hull side out to the tub, so no tub is left floating.
    const span = Math.abs(gz) + 4 - ghb;
    if (span > 0.5) {
      box('GunShelf_' + nm, spons, 9, 2.6, span, gx, 12.6,
        sgn * (ghb + span / 2), matHullGray);
    }
    box('GunSponson_' + nm, spons, 11, 2.6, 8, gx, 12.6, gz, matHullGray);
    box('GunTub_' + nm, spons, 8, 2.4, 6, gx, 15.1, gz, matHullGray);
    box('GunMount_' + nm, spons, 2.4, 2.4, 2.4, gx, 17.1, gz, matDark);
    box('GunBarrel_' + nm, spons, 4.2, 0.9, 0.9, gx + 3, 17.6, gz, matDark);
  }

  // =====================================================================
  // FLIGHT DECK
  // =====================================================================
  const deck = createPivot('FlightDeck', [0, 0, 0], root);

  // The slab is lofted along its own planform, for the same reason the shell is.
  // Three-metre plates each squared to the keel turned the stern round-in --
  // where the starboard edge sweeps 21 m outboard in 23 -- into a staircase with
  // treads nearly three metres deep, and no amount of coaming laid over the top
  // of it hid the tread ends. deckPort and deckStb are piecewise linear, so a
  // station on every breakpoint draws both edges exactly, in nine sections
  // instead of a hundred and ten plates.
  const DSTATIONS = [-165, -142, -95, -60, 85, 112, 118, 152, 165];
  const deckSections = [];
  for (let i = 0; i < DSTATIONS.length; i++) {
    const x = DSTATIONS[i];
    const zS = deckStb(x);
    const zP = deckPort(x);
    deckSections.push([
      [x, DECK_Y, zS],
      [x, DECK_Y, zP],
      [x, DECK_Y - DECK_T, zP],
      [x, DECK_Y - DECK_T, zS]
    ]);
  }
  createPart('FlightDeckSlab', loftGeo(deckSections), matDeck, { parent: deck });

  // Lay a run of boxes along a planform edge.
  //
  // The coaming and the catwalks were axis-aligned boxes dropped at edge(x),
  // which is exact only where the edge is parallel to the keel. It is not
  // parallel at the bow taper, at the round-down aft, or anywhere along the
  // angled deck, so each run climbed its own staircase and the ship carried a
  // comb of dark teeth down both sides -- the single most visible thing in the
  // hero render, and nothing a six-view sheet at ship scale shows you. A
  // segment now spans station to station and is yawed onto the chord between
  // them, so the same part count draws a polyline that follows the shape.
  //
  // A Y rotation of `a` carries +X to (cos a, 0, -sin a), so aligning a box's
  // length with (dx, 0, dz) wants -atan2(dz, dx).
  function edgeStrip(name, parent, edge, inset, step, x0, x1, h, d, y, mat) {
    let i = 0;
    for (let x = x0; x < x1; x += step) {
      const xa = x;
      const xb = Math.min(x + step, x1);
      const za = edge(xa) + inset;
      const zb = edge(xb) + inset;
      const dx = xb - xa;
      const dz = zb - za;
      box(name + i, parent, Math.sqrt(dx * dx + dz * dz) + 0.02, h, d,
        (xa + xb) / 2, y, (za + zb) / 2, mat, 0, -Math.atan2(dz, dx), 0);
      i++;
    }
  }

  // Deck-edge coaming strip (reads as the deck edge from any angle)
  edgeStrip('CoamingStb_', deck, deckStb, -0.4, 6, LOA_AFT + 2, LOA_FWD - 2, 0.5, 0.8, DECK_Y + 0.2, matDark);
  edgeStrip('CoamingPort_', deck, deckPort, 0.4, 6, LOA_AFT + 2, LOA_FWD - 2, 0.5, 0.8, DECK_Y + 0.2, matDark);

  // =====================================================================
  // CATWALKS -- continuous walkway one level below the deck edge
  // =====================================================================
  const cats = createPivot('Catwalks', [0, 0, 0], root);
  edgeStrip('CatwalkStb_', cats, deckStb, 0.0, 6, -156, 140, 0.35, 2.6, 17.9, matDark);
  edgeStrip('CatwalkPort_', cats, deckPort, 0.0, 6, -156, 140, 0.35, 2.6, 17.9, matDark);
  edgeStrip('CatwalkRailStb_', cats, deckStb, 1.1, 6, -156, 140, 0.18, 0.18, 19.2, matDark);
  edgeStrip('CatwalkRailPort_', cats, deckPort, -1.1, 6, -156, 140, 0.18, 0.18, 19.2, matDark);

  // =====================================================================
  // DECK-EDGE SAFETY NETTING -- sloping panels + stanchions all round
  // =====================================================================
  const nets = createPivot('SafetyNetting', [0, 0, 0], root);
  // A panel spans station to station along the deck edge, is offset along the
  // outboard NORMAL to that edge rather than straight out in Z, and is yawed
  // onto the chord. Squared to the keel, the same panels stepped 3.6 m per 4 m
  // section around the round-in and laid a second comb of teeth directly under
  // the first one.
  //
  // Euler order matters here. The default XYZ applies the outboard tilt after
  // the yaw and rolls the panel out of its own plane; YXZ tilts first, about the
  // panel's own length, and then yaws, which is the order the bracket is welded.
  function netRun(name, edge, side, x0, x1, step) {
    let i = 0;
    for (let x = x0; x < x1; x += step) {
      const xa = x;
      const xb = Math.min(x + step, x1);
      const za = edge(xa);
      const zb = edge(xb);
      const dx = xb - xa;
      const dz = zb - za;
      const len = Math.sqrt(dx * dx + dz * dz);
      const nx = (-dz / len) * side;
      const nz = (dx / len) * side;
      const yaw = -Math.atan2(dz, dx);
      const p = box(name + i, nets, len + 0.02, 0.14, 3.4,
        (xa + xb) / 2 + nx * 1.5, DECK_Y - 0.9, (za + zb) / 2 + nz * 1.5, matDark);
      p.rotation.set(side * 0.62, yaw, 0, 'YXZ');
      const q = box(name + 'Post' + i, nets, 0.22, 0.22, 3.6,
        xa + nx * 1.5, DECK_Y - 0.9, za + nz * 1.5, matDark);
      q.rotation.set(side * 0.62, yaw, 0, 'YXZ');
      i++;
    }
  }
  netRun('NetStb_', deckStb, 1, -152, 138, 4);
  netRun('NetPort_', deckPort, -1, -152, 138, 4);
  // Bow and stern netting runs (transverse)
  for (let k = 0; k < 8; k++) {
    const z = -13 + k * 3.8;
    box('NetStern_' + k, nets, 3.4, 0.14, 3.6, LOA_AFT + 1.5, DECK_Y - 0.9, z,
      matDark, 0, 0, -0.62);
  }

  // =====================================================================
  // DECK-EDGE ELEVATORS (4) -- 3 starboard, 1 port
  // =====================================================================
  const elevs = createPivot('Elevators', [0, 0, 0], root);
  const elevDefs = [
    ['Stb1', 95, 1], ['Stb2', 55, 1], ['Stb3', -35, 1], ['Port1', -45, -1]
  ];
  for (let e = 0; e < elevDefs.length; e++) {
    const nm = elevDefs[e][0];
    const ex = elevDefs[e][1];
    const side = elevDefs[e][2];
    const edge = side > 0 ? deckStb(ex) : deckPort(ex);
    const zc = edge - side * 8.0;   // 16 m platform, outer edge flush with deck edge
    box('Elevator_' + nm, elevs, 26, 0.45, 16, ex, DECK_Y + 0.2, zc, matDeckWorn);
    // seam gap markings
    box('ElevSeamF_' + nm, elevs, 0.4, 0.5, 16, ex + 13, DECK_Y + 0.22, zc, matDark);
    box('ElevSeamA_' + nm, elevs, 0.4, 0.5, 16, ex - 13, DECK_Y + 0.22, zc, matDark);
    box('ElevSeamI_' + nm, elevs, 26, 0.5, 0.4, ex, DECK_Y + 0.22, zc - side * 8, matDark);
    // outboard support arms below the platform
    for (let a = 0; a < 3; a++) {
      box('ElevArm_' + nm + '_' + a, elevs, 1.6, 3.0, 12, ex - 10 + a * 10, 16.6,
        zc + side * 2, matHullGray);
    }
    box('ElevRail_' + nm, elevs, 26, 0.9, 0.5, ex, DECK_Y + 0.7, edge - side * 0.3, matDark);
  }

  // =====================================================================
  // ANGLED LANDING AREA (offset to port, 9 degrees)
  // =====================================================================
  const angled = createPivot('AngledDeck', [-30, DECK_Y, -6], root);
  angled.rotation.set(0, ANGLE_DEG * D2R, 0);   // +Ry sends +X forward-and-to-port

  // Landing area surface patch (sits just proud of the deck so it reads in top view)
  box('LandingArea', angled, 250, 0.12, 27, 2, 0.16, 0, matDeckWorn);
  // Runway edge lines
  box('LandingEdgePort', angled, 250, 0.14, 0.7, 2, 0.24, -13.0, matWhite);
  box('LandingEdgeStb', angled, 250, 0.14, 0.7, 2, 0.24, 13.0, matWhite);
  // Dashed centreline
  for (let k = 0; k < 26; k++) {
    box('LandingCL_' + k, angled, 6, 0.14, 0.65, -120 + k * 9.6, 0.24, 0, matWhite);
  }
  // Touchdown box
  box('TouchdownFwd', angled, 0.8, 0.14, 27, -60, 0.24, 0, matWhite);
  box('TouchdownAft', angled, 0.8, 0.14, 27, -112, 0.24, 0, matWhite);

  // Arresting wires (4) across the landing area, with deck sheaves
  for (let w = 0; w < 4; w++) {
    const wx = -105 + w * 13;
    box('ArrestWire_' + w, angled, 0.32, 0.28, 27.5, wx, 0.5, 0, matDark);
    box('WireSheavePort_' + w, angled, 1.8, 0.7, 2.2, wx, 0.4, -14.2, matDark);
    box('WireSheaveStb_' + w, angled, 1.8, 0.7, 2.2, wx, 0.4, 14.2, matDark);
    box('WireMark_' + w, angled, 1.2, 0.14, 27, wx, 0.22, 0, matYellow);
  }

  // Landing-area edge lighting
  for (let k = 0; k < 34; k++) {
    box('LandLightP_' + k, angled, 0.5, 0.3, 0.5, -122 + k * 7.4, 0.32, -13.4, matWhite);
    box('LandLightS_' + k, angled, 0.5, 0.3, 0.5, -122 + k * 7.4, 0.32, 13.4, matWhite);
  }

  // Foul line (red, port of the landing area)
  for (let k = 0; k < 22; k++) {
    box('FoulLine_' + k, angled, 6, 0.13, 0.55, -118 + k * 11, 0.22, 16.5, matRed);
  }

  // =====================================================================
  // CATAPULTS -- two bow tracks (parallel to centreline) + two waist tracks
  // =====================================================================
  const catapults = createPivot('Catapults', [0, DECK_Y, 0], root);

  // bothGuides=false paints only the inboard guide line, for the waist tracks
  // that already sit hard against the port deck edge.
  function buildCatapult(nm, parent, x0, x1, z, jbdBack, bothGuides) {
    const len = x1 - x0;
    const xc = (x0 + x1) / 2;
    // slotted track: two rails with the shuttle slot between them
    box('CatRailA_' + nm, parent, len, 0.35, 0.55, xc, 0.25, z - 0.55, matDark);
    box('CatRailB_' + nm, parent, len, 0.35, 0.55, xc, 0.25, z + 0.55, matDark);
    box('CatSlot_' + nm, parent, len, 0.3, 0.55, xc, 0.2, z, matDark);
    // guide markings either side of the track
    box('CatGuideStb_' + nm, parent, len, 0.13, 0.45, xc, 0.2, z + 5.5, matWhite);
    if (bothGuides) {
      box('CatGuidePort_' + nm, parent, len, 0.13, 0.45, xc, 0.2, z - 5.5, matWhite);
    }
    // shuttle at the aft (start) end
    box('CatShuttle_' + nm, parent, 2.4, 0.6, 1.6, x0 + 6, 0.45, z, matDark);
    // holdback / launch bar detail
    box('CatHoldback_' + nm, parent, 1.4, 0.5, 2.6, x0 + 2, 0.4, z, matDark);
    box('CatBridle_' + nm, parent, 3.0, 0.35, 3.4, x1 - 3, 0.35, z, matDark);

    // Jet blast deflector behind the catapult start, leaning aft
    const jx = x0 - jbdBack;
    for (let s = 0; s < 3; s++) {
      const sz = z - 7.0 + s * 7.0;
      box('JBD_' + nm + '_' + s, parent, 1.0, 6.6, 6.6, jx, 3.0, sz, matRed, 0, 0, 0.62);
      box('JBDFrame_' + nm + '_' + s, parent, 1.3, 0.5, 6.8, jx - 1.6, 5.9, sz,
        matDark, 0, 0, 0.62);
      box('JBDHinge_' + nm + '_' + s, parent, 2.2, 0.7, 6.8, jx + 1.8, 0.35, sz, matDark);
    }
    box('JBDRecess_' + nm, parent, 8, 0.14, 21, jx + 1, 0.16, z, matDark);
  }

  // Bow catapults 1 and 2 -- parallel to the centreline
  buildCatapult('Cat1', catapults, 34, 152, -6, 5, true);
  buildCatapult('Cat2', catapults, 34, 152, 14, 5, true);
  // Waist catapults 3 and 4, built inside the angled-deck pivot so they share its axis
  const waist = createPivot('WaistCatapults', [0, 0.02, 0], angled);
  buildCatapult('Cat3', waist, -36, 58, -17, 5, false);
  buildCatapult('Cat4', waist, -36, 58, -26, 5, false);

  // Bow deck markings (kept inboard of the narrowing bow deck edge)
  for (let k = 0; k < 12; k++) {
    box('BowMarkA_' + k, deck, 4, 0.13, 0.5, 40 + k * 8, DECK_Y + 0.06, 20, matYellow);
  }

  // =====================================================================
  // ISLAND SUPERSTRUCTURE (starboard)
  // =====================================================================
  const island = createPivot('Island', [14, DECK_Y, 25], root);

  // Main tower stack
  box('IslandBase', island, 44, 7.5, 14, 0, 3.75, 0, matIsland);
  box('IslandLevel2', island, 40, 5.5, 13, -1, 10.2, 0, matIsland);
  box('IslandLevel3', island, 34, 5.0, 12, -2, 15.4, 0, matIsland);
  box('IslandLevel4', island, 22, 4.6, 11, -4, 20.2, 0, matIsland);
  box('IslandCap', island, 14, 3.4, 9.5, -5, 24.2, 0, matIsland);

  // Navigation bridge -- projects forward and outboard, glazed
  box('NavBridge', island, 15, 4.4, 16, 15, 12.6, 0.5, matIsland);
  box('NavBridgeGlassF', island, 0.5, 2.6, 16, 22.6, 13.2, 0.5, matDark);
  box('NavBridgeGlassStb', island, 15, 2.6, 0.5, 15, 13.2, 8.5, matDark);
  box('NavBridgeGlassPort', island, 15, 2.6, 0.5, 15, 13.2, -7.5, matDark);
  box('NavBridgeWingStb', island, 6, 0.4, 4, 20, 10.4, 10, matIsland);
  box('NavBridgeWingPort', island, 6, 0.4, 4, 20, 10.4, -9, matIsland);
  box('NavBridgeRoof', island, 16, 0.6, 17, 15, 15.1, 0.5, matIsland);

  // Flag bridge, one level down
  box('FlagBridge', island, 13, 4.0, 15, 14, 7.8, 0.5, matIsland);
  box('FlagBridgeGlass', island, 0.5, 2.2, 15, 20.6, 8.2, 0.5, matDark);

  // Primary Flight Control -- aft-facing, overhangs the deck
  box('PriFly', island, 11, 4.4, 15, -14, 17.8, 0.5, matIsland);
  box('PriFlyGlassAft', island, 0.5, 2.8, 15, -19.6, 18.4, 0.5, matDark);
  box('PriFlyGlassPort', island, 11, 2.8, 0.5, -14, 18.4, -7.2, matDark);
  box('PriFlyRoof', island, 12, 0.6, 16, -14, 20.3, 0.5, matIsland);

  // Level window bands on the main stack
  for (let k = 0; k < 3; k++) {
    const wy = [4.5, 10.6, 15.6][k];
    const wl = [42, 38, 32][k];
    const wx = [0, -1, -2][k];
    box('IslandBandPort_' + k, island, wl, 1.5, 0.4, wx, wy, -6.6, matDark);
    box('IslandBandStb_' + k, island, wl, 1.5, 0.4, wx, wy, 6.6, matDark);
  }

  // Island catwalks and ladders
  for (let k = 0; k < 4; k++) {
    const cy = [7.6, 13.0, 18.2, 23.0][k];
    const cl = [42, 36, 24, 15][k];
    const cx = [0, -1, -3, -5][k];
    box('IslandCatwalk_' + k, island, cl, 0.3, 15.4, cx, k === 0 ? cy - 0.002 : cy, 0, matDark);
    box('IslandRailPort_' + k, island, cl, 1.1, 0.16, cx, cy + 0.7, -7.6, matDark);
    box('IslandRailStb_' + k, island, cl, 1.1, 0.16, cx, cy + 0.7, 7.6, matDark);
  }
  for (let k = 0; k < 4; k++) {
    box('IslandLadder_' + k, island, 3.4, 5.4, 1.0, -18, 3.0 + k * 5.2, 7.4,
      matDark, 0, 0, 0.5);
  }

  // Island deck-edge fairing where it meets the flight deck
  box('IslandFairingFwd', island, 6, 1.2, 14, 24, 0.6, 0, matIsland);
  box('IslandFairingAft', island, 6, 1.2, 14, -24, 0.6, 0, matIsland);

  // ---------------------------------------------- flat phased-array radars
  // Four fixed faces: forward, aft, outboard (stb), inboard (port).
  const arrays = createPivot('PhasedArrays', [0, 0, 0], island);
  box('ArrayFwd', arrays, 0.9, 7.5, 7.5, 17.4, 20.0, 3.0, matRadar, 0, 0, -0.16);
  box('ArrayFwdFrame', arrays, 0.4, 8.4, 8.4, 17.9, 20.0, 3.0, matIsland, 0, 0, -0.16);
  box('ArrayAft', arrays, 0.9, 7.5, 7.5, -12.4, 20.0, 3.0, matRadar, 0, 0, 0.16);
  box('ArrayAftFrame', arrays, 0.4, 8.4, 8.4, -12.9, 20.0, 3.0, matIsland, 0, 0, 0.16);
  box('ArrayStb', arrays, 7.5, 7.5, 0.9, 2.0, 20.0, 6.2, matRadar, -0.16, 0, 0);
  box('ArrayStbFrame', arrays, 8.4, 8.4, 0.4, 2.0, 20.0, 6.7, matIsland, -0.16, 0, 0);
  box('ArrayPort', arrays, 7.5, 7.5, 0.9, 2.0, 20.0, -5.2, matRadar, 0.16, 0, 0);
  box('ArrayPortFrame', arrays, 8.4, 8.4, 0.4, 2.0, 20.0, -5.7, matIsland, 0.16, 0, 0);
  // Smaller fire-control panels lower down
  box('FCPanelFwd', arrays, 0.7, 3.4, 3.4, 20.4, 6.5, 5.0, matRadar, 0, 0, -0.18);
  box('FCPanelAft', arrays, 0.7, 3.4, 3.4, -20.4, 6.5, 5.0, matRadar, 0, 0, 0.18);

  // ---------------------------------------------------------- lattice mast
  // Base sits ON the island cap (island-local Y 25.9), not floating above it.
  const mast = createPivot('LatticeMast', [-3, 25.9, 0], island);
  const MAST_H = 26;
  const legs = [[2.4, 2.4], [2.4, -2.4], [-2.4, 2.4], [-2.4, -2.4]];
  for (let l = 0; l < 4; l++) {
    const lx = legs[l][0];
    const lz = legs[l][1];
    // legs taper inboard as they rise -- built as three stacked segments
    for (let s = 0; s < 3; s++) {
      const t0 = s / 3, t1 = (s + 1) / 3;
      const k0 = lerp(1.0, 0.45, t0);
      const k1 = lerp(1.0, 0.45, t1);
      const km = (k0 + k1) / 2;
      box('MastLeg_' + l + '_' + s, mast, 0.55, MAST_H / 3 + 0.1, 0.55,
        lx * km, MAST_H * (t0 + t1) / 2, lz * km, matIsland);
    }
  }
  // Cross bracing -- horizontal rings plus diagonals, 9 bays
  for (let b = 0; b <= 9; b++) {
    const t = b / 9;
    const k = lerp(1.0, 0.45, t);
    const y = MAST_H * t;
    const sp = 4.8 * k;
    box('MastRingF_' + b, mast, 0.35, 0.35, sp, 2.4 * k, y, 0, matIsland);
    box('MastRingA_' + b, mast, 0.35, 0.35, sp, -2.4 * k, y, 0, matIsland);
    box('MastRingP_' + b, mast, sp, 0.35, 0.35, 0, y, -2.4 * k, matIsland);
    box('MastRingS_' + b, mast, sp, 0.35, 0.35, 0, y, 2.4 * k, matIsland);
    if (b < 9) {
      const yd = MAST_H / 9;
      const kd = lerp(1.0, 0.45, (b + 0.5) / 9);
      const diag = Math.sqrt(yd * yd + (4.8 * kd) * (4.8 * kd));
      const ang = Math.atan2(4.8 * kd, yd);
      box('MastDiagP_' + b, mast, 0.3, diag, 0.3, 0, y + yd / 2, -2.4 * kd,
        matIsland, b % 2 ? ang : -ang, 0, 0);
      box('MastDiagS_' + b, mast, 0.3, diag, 0.3, 0, y + yd / 2, 2.4 * kd,
        matIsland, b % 2 ? -ang : ang, 0, 0);
      box('MastDiagF_' + b, mast, 0.3, diag, 0.3, 2.4 * kd, y + yd / 2, 0,
        matIsland, 0, 0, b % 2 ? ang : -ang);
      box('MastDiagA_' + b, mast, 0.3, diag, 0.3, -2.4 * kd, y + yd / 2, 0,
        matIsland, 0, 0, b % 2 ? -ang : ang);
    }
  }
  // Yardarms and mast-head fit
  box('YardarmLower', mast, 0.5, 0.5, 22, 0, 14, 0, matIsland);
  box('YardarmUpper', mast, 0.5, 0.5, 15, 0, 20, 0, matIsland);
  box('YardarmStay', mast, 0.35, 6.2, 0.35, 0, 17, 0, matIsland);
  for (let k = 0; k < 6; k++) {
    const zz = -9 + k * 3.6;
    box('YardLight_' + k, mast, 0.6, 0.9, 0.6, 0, 14.7, zz, matDark);
  }
  // Flat air-search array on the mast head, plus whip antennas
  box('AirSearchArray', mast, 0.6, 5.0, 8.5, 0, 24, 0, matRadar, 0, 0, 0);
  box('AirSearchFrame', mast, 1.0, 0.5, 9.2, 0, 21.3, 0, matIsland);
  box('MastHead', mast, 0.4, 5.0, 0.4, 0, 28.5, 0, matIsland);
  // Whips stand on the topmost island catwalk (island-local Y 23.0)
  for (let k = 0; k < 6; k++) {
    box('Whip_' + k, island, 0.22, 9.0, 0.22, -11 + k * 2.6, 27.5,
      (k % 2 ? 6.2 : -6.2), matIsland, 0, 0, (k % 2 ? 0.12 : -0.12));
  }
  // Aft island antenna dome-frames (flat plates, no dishes)
  // Moved out to +/-5.8 so each plate reaches the whip mast beside it at
  // +/-6.2. At 5.6 they hung 0.19 m clear of anything and were the only two
  // parts on the ship attached to nothing at all.
  box('SatPlateA', island, 3.2, 3.2, 0.6, -8, 27.5, 5.8, matRadar);
  box('SatPlateB', island, 3.2, 3.2, 0.6, -8, 27.5, -5.8, matRadar);

  // =====================================================================
  // FLIGHT DECK LIGHTING AND MISC DECK FURNITURE
  // =====================================================================
  const furniture = createPivot('DeckFurniture', [0, 0, 0], root);
  let li = 0;
  for (let x = -150; x <= 140; x += 6) {
    box('DeckLightStb_' + li, furniture, 0.5, 0.3, 0.5, x, DECK_Y + 0.15,
      deckStb(x) - 1.6, matWhite);
    box('DeckLightPort_' + li, furniture, 0.5, 0.3, 0.5, x, DECK_Y + 0.15,
      deckPort(x) + 1.6, matWhite);
    li++;
  }
  // Tie-down pad rows -- only where the deck actually exists at that station
  for (let r = 0; r < 6; r++) {
    for (let k = 0; k < 16; k++) {
      const tx = -130 + k * 17;
      const tz = -34 + r * 12;
      if (tz < deckPort(tx) + 3 || tz > deckStb(tx) - 3) continue;
      // Seated 3 cm into the deck rather than balanced 2 cm above it. The pads
      // amidships happened to overlap a taxi line or a tractor and passed on
      // that; the two rows forward of the last marking sat on bare deck and
      // showed the gap for what it always was.
      box('TieDown_' + r + '_' + k, furniture, 0.7, 0.16, 0.7,
        tx, DECK_Y + 0.05, tz, matDeckWorn);
    }
  }
  // Optical landing system, on the port sponson abreast the touchdown area
  box('OLS_Platform', furniture, 7, 1.4, 6, -70, DECK_Y - 0.4, -37, matHullGray);
  box('OLS_Mirror', furniture, 1.0, 2.2, 5.2, -70, DECK_Y + 1.6, -37, matDark);
  for (let k = 0; k < 5; k++) {
    box('OLS_Cell_' + k, furniture, 1.2, 0.8, 0.8, -70, DECK_Y + 1.6, -39.4 + k * 1.2,
      matWhite);
  }
  // Deck-edge crane, starboard aft
  box('CraneBase', furniture, 6, 2.0, 6, -120, DECK_Y + 1.0, 29, matHullGray);
  box('CraneTower', furniture, 3, 8.0, 3, -120, DECK_Y + 6.0, 29, matIsland);
  box('CraneJib', furniture, 18, 1.0, 1.6, -112, DECK_Y + 10.5, 29, matIsland, 0, 0, -0.18);
  box('CraneHook', furniture, 0.8, 3.0, 0.8, -104, DECK_Y + 7.5, 29, matDark);
  // Deck tractors / support equipment ranged along the starboard aft deck
  for (let k = 0; k < 4; k++) {
    box('DeckTractor_' + k, furniture, 4.4, 1.6, 2.2, -95 + k * 9, DECK_Y + 0.9,
      26, matDeckWorn);
  }

  return root;
}
