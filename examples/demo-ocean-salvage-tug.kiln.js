// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = { name: 'Ocean salvage tug', category: 'vehicle', role: 'vehicle' };

// Dimensions in metres. +X forward, +Y up, +Z starboard.
// Stylized ocean salvage tug: navy hull, cream cabin/bulwark, safety-orange
// working deck trim, A-frame, winch and funnel. Keel at Y=0 (drydock sit).

const NAVY = 0x1e3a5c;
const CREAM = 0xf2e8d5;
const ORANGE = 0xff5a1f;
const RUBBER = 0x1b1b1e;
const STEEL = 0x3a4148;
const DARKSTEEL = 0x23272d;
const WINDOW = 0x22394e;
const DECKFORE = 0xe4d9c2;
const CABLE = 0x22262b;

// Plan-view outline of the hull (X forward, Z starboard), ordered
// stern-port -> bow -> stern-starboard so the loop closes across the transom.
function hullOutline(beamScale, sternInset = 0) {
  const pts = [
    [-2.4, -1.05],
    [-0.6, -1.15],
    [1.4, -0.85],
    [2.5, 0.0],
    [1.4, 0.85],
    [-0.6, 1.15],
    [-2.4, 1.05],
  ];
  return pts.map(([x, z]) => [x === -2.4 ? x + sternInset : x, z * beamScale]);
}

/** Vertical tire fender hung against the hull side. */
function tireFender(name, pos, parent, mats) {
  createPart(name, torusGeo(0.17, 0.065, 10, 20), mats.rubber, {
    position: pos, parent,
  });
}

/** Pair of bollard posts with a top plate. */
function bollard(name, x, z, deckY, parent, mats) {
  const g = createPivot(name, [x, deckY, z], parent);
  createPart('PostA', cylinderGeo(0.05, 0.06, 0.28, 12), mats.steel, {
    position: [-0.09, 0.14, 0], parent: g,
  });
  createPart('PostB', cylinderGeo(0.05, 0.06, 0.28, 12), mats.steel, {
    position: [0.09, 0.14, 0], parent: g,
  });
  createPart('TopPlate', boxGeo(0.3, 0.05, 0.12), mats.steel, {
    position: [0, 0.3, 0], parent: g,
  });
  return g;
}

function build() {
  const root = createRoot('SalvageTug');

  const mats = {
    navy: gameMaterial(NAVY),
    cream: gameMaterial(CREAM),
    orange: gameMaterial(ORANGE),
    rubber: gameMaterial(RUBBER),
    steel: gameMaterial(STEEL),
    dark: gameMaterial(DARKSTEEL),
    window: gameMaterial(WINDOW),
    deckFore: gameMaterial(DECKFORE),
    cable: gameMaterial(CABLE),
  };

  // ---- Hull: loft three plan sections (keel -> waterline -> deck edge) ----
  const hullGeo = loftProfiles([
    { profile: hullOutline(0.72), frame: { origin: [0, 0.15, 0], rotation: [0, 0, 0] } },
    { profile: hullOutline(0.92), frame: { origin: [0, 0.55, 0], rotation: [0, 0, 0] } },
    { profile: hullOutline(1.0), frame: { origin: [0, 1.05, 0], rotation: [0, 0, 0] } },
  ]);
  createPart('Hull', hullGeo, mats.navy, { parent: root });

  // Waterline boot stripe (thin loft band just above the waterline).
  // Kept slightly proud of the hull surface to avoid z-fighting.
  const stripeGeo = loftProfiles([
    { profile: hullOutline(0.945, 0.002), frame: { origin: [0, 0.64, 0], rotation: [0, 0, 0] } },
    { profile: hullOutline(0.965, 0.002), frame: { origin: [0, 0.76, 0], rotation: [0, 0, 0] } },
  ]);
  createPart('BootStripe', stripeGeo, mats.orange, { parent: root });

  // ---- Decks ----
  // Aft working deck (safety orange) and foredeck (cream).
  createPart('WorkingDeck', boxGeo(2.9, 0.07, 1.86), mats.orange, {
    position: [-0.95, 1.09, 0], parent: root,
  });
  createPart('ForeDeck', boxGeo(1.7, 0.07, 1.5), mats.deckFore, {
    position: [1.35, 1.09, 0], parent: root,
  });
  // Deck anti-slip strips.
  for (let i = 0; i < 4; i++) {
    createPart('DeckStrip' + i, boxGeo(2.5, 0.016, 0.05), mats.dark, {
      position: [-0.95, 1.132, -0.6 + i * 0.4], parent: root,
    });
  }

  // ---- Bulwark (cream) with orange cap rail ----
  const bulwarkH = 0.42;
  const bulwarkY = 1.05 + bulwarkH / 2;
  // Straight side walls.
  createPart('BulwarkPort', boxGeo(3.0, bulwarkH, 0.08), mats.cream, {
    position: [-0.9, bulwarkY, -1.06], parent: root,
  });
  createPart('BulwarkStbd', boxGeo(3.0, bulwarkH, 0.08), mats.cream, {
    position: [-0.9, bulwarkY, 1.06], parent: root,
  });
  // Transom wall.
  createPart('BulwarkTransom', boxGeo(0.08, bulwarkH, 2.2), mats.cream, {
    position: [-2.38, bulwarkY, 0], parent: root,
  });
  // Angled bow walls (port/starboard).
  createPart('BulwarkBowPort', boxGeo(1.5, bulwarkH, 0.08), mats.cream, {
    position: [1.55, bulwarkY, -0.78], rotation: [0, -28, 0], parent: root,
  });
  createPart('BulwarkBowStbd', boxGeo(1.5, bulwarkH, 0.08), mats.cream, {
    position: [1.55, bulwarkY, 0.78], rotation: [0, 28, 0], parent: root,
  });
  // Orange cap rail on top of each wall.
  const capY = 1.05 + bulwarkH + 0.03;
  createPart('CapPort', boxGeo(3.0, 0.06, 0.12), mats.orange, {
    position: [-0.9, capY, -1.06], parent: root,
  });
  createPart('CapStbd', boxGeo(3.0, 0.06, 0.12), mats.orange, {
    position: [-0.9, capY, 1.06], parent: root,
  });
  createPart('CapTransom', boxGeo(0.12, 0.06, 2.2), mats.orange, {
    position: [-2.38, capY, 0], parent: root,
  });
  createPart('CapBowPort', boxGeo(1.5, 0.06, 0.12), mats.orange, {
    position: [1.55, capY, -0.78], rotation: [0, -28, 0], parent: root,
  });
  createPart('CapBowStbd', boxGeo(1.5, 0.06, 0.12), mats.orange, {
    position: [1.55, capY, 0.78], rotation: [0, 28, 0], parent: root,
  });

  // ---- Rubber fenders ----
  // Vertical side fenders (cylinders) + hanging tire fenders (torus).
  const fenderX = [-1.9, -0.9, 0.1];
  for (let i = 0; i < fenderX.length; i++) {
    createPart('FenderPort' + i, cylinderGeo(0.11, 0.11, 0.55, 14), mats.rubber, {
      position: [fenderX[i], 0.82, -1.13], parent: root,
    });
    createPart('FenderStbd' + i, cylinderGeo(0.11, 0.11, 0.55, 14), mats.rubber, {
      position: [fenderX[i], 0.82, 1.13], parent: root,
    });
  }
  tireFender('TirePortA', [-1.4, 0.95, -1.2], root, mats);
  tireFender('TirePortB', [-0.4, 0.95, -1.22], root, mats);
  tireFender('TireStbdA', [-1.4, 0.95, 1.2], root, mats);
  tireFender('TireStbdB', [-0.4, 0.95, 1.22], root, mats);
  // Bow stem fender.
  createPart('StemFender', cylinderGeo(0.1, 0.1, 0.7, 12), mats.rubber, {
    position: [2.5, 0.82, 0], parent: root,
  });
  // Stern push fender (horizontal log across transom).
  createPart('SternFender', cylinderGeo(0.13, 0.13, 1.9, 14), mats.rubber, {
    position: [-2.5, 0.85, 0], rotation: [90, 0, 0], parent: root,
  });

  // ---- Cabin block (cream) with navy roof ----
  createPart('CabinBase', boxGeo(1.5, 0.95, 1.5), mats.cream, {
    position: [0.55, 1.6, 0], parent: root,
  });
  createPart('Wheelhouse', boxGeo(1.3, 0.75, 1.35), mats.cream, {
    position: [0.55, 2.45, 0], parent: root,
  });
  createPart('CabinRoof', boxGeo(1.55, 0.1, 1.6), mats.navy, {
    position: [0.55, 2.88, 0], parent: root,
  });
  // Window band (dark) around wheelhouse + front windshields.
  createPart('WindowBand', boxGeo(1.32, 0.3, 1.37), mats.window, {
    position: [0.55, 2.55, 0], parent: root,
  });
  // Mullions to break the band into windows (cream posts).
  for (let i = -1; i <= 1; i++) {
    createPart('MullionFront' + i, boxGeo(0.06, 0.32, 0.06), mats.cream, {
      position: [1.22, 2.55, i * 0.4], parent: root,
    });
  }
  // Cabin door (aft face) + portholes.
  createPart('CabinDoor', boxGeo(0.06, 0.7, 0.4), mats.navy, {
    position: [-0.23, 1.6, 0.3], parent: root,
  });
  for (let i = 0; i < 2; i++) {
    createPart('PortholePort' + i, cylinderGeo(0.09, 0.09, 0.06, 16), mats.navy, {
      position: [0.2 + i * 0.5, 1.65, -0.76], rotation: [90, 0, 0], parent: root,
    });
    createPart('PortholeStbd' + i, cylinderGeo(0.09, 0.09, 0.06, 16), mats.navy, {
      position: [0.2 + i * 0.5, 1.65, 0.76], rotation: [90, 0, 0], parent: root,
    });
  }
  // Orange cabin trim stripe.
  createPart('CabinStripe', boxGeo(1.52, 0.1, 1.52), mats.orange, {
    position: [0.55, 2.02, 0], parent: root,
  });

  // ---- Funnel (safety orange with dark cap) ----
  createPart('Funnel', cylinderGeo(0.28, 0.34, 0.7, 18), mats.orange, {
    position: [-0.55, 2.35, 0], parent: root,
  });
  createPart('FunnelCap', cylinderGeo(0.29, 0.29, 0.14, 18), mats.dark, {
    position: [-0.55, 2.75, 0], parent: root,
  });

  // ---- Mast + radar + lights ----
  createPart('Mast', cylinderGeo(0.05, 0.07, 1.1, 10), mats.steel, {
    position: [0.55, 3.45, 0], parent: root,
  });
  createPart('RadarPedestal', cylinderGeo(0.09, 0.11, 0.16, 12), mats.cream, {
    position: [0.55, 3.1, 0], parent: root,
  });
  // Radar scanner bar (stylized, static forward pose).
  createPart('RadarBar', boxGeo(0.16, 0.07, 0.85), mats.cream, {
    position: [0.55, 3.24, 0], parent: root,
  });
  createPart('RadarDome', sphereGeo(0.11, 16, 12), mats.cream, {
    position: [0.15, 3.0, 0], parent: root,
  });
  // Navigation lights: port red-ish? Keep palette: small cream masthead + orange stern.
  createPart('MastheadLight', sphereGeo(0.05, 10, 8), mats.orange, {
    position: [0.55, 4.02, 0], parent: root,
  });

  // ---- Towing winch drum on working deck ----
  const winch = createPivot('Winch', [-1.15, 1.12, 0], root);
  createPart('WinchBaseL', boxGeo(0.7, 0.18, 0.12), mats.steel, {
    position: [0, 0.09, -0.55], parent: winch,
  });
  createPart('WinchBaseR', boxGeo(0.7, 0.18, 0.12), mats.steel, {
    position: [0, 0.09, 0.55], parent: winch,
  });
  createPart('WinchFrameL', boxGeo(0.12, 0.55, 0.1), mats.orange, {
    position: [-0.25, 0.4, -0.55], parent: winch,
  });
  createPart('WinchFrameR', boxGeo(0.12, 0.55, 0.1), mats.orange, {
    position: [-0.25, 0.4, 0.55], parent: winch,
  });
  createPart('Drum', cylinderGeo(0.26, 0.26, 0.95, 20), mats.dark, {
    position: [-0.25, 0.55, 0], rotation: [90, 0, 0], parent: winch,
  });
  // Wound cable wrap (slightly larger, cable color) + flange discs.
  createPart('CableWrap', cylinderGeo(0.29, 0.29, 0.6, 20), mats.cable, {
    position: [-0.25, 0.55, 0], rotation: [90, 0, 0], parent: winch,
  });
  createPart('FlangeL', cylinderGeo(0.4, 0.4, 0.06, 20), mats.orange, {
    position: [-0.25, 0.55, -0.5], rotation: [90, 0, 0], parent: winch,
  });
  createPart('FlangeR', cylinderGeo(0.4, 0.4, 0.06, 20), mats.orange, {
    position: [-0.25, 0.55, 0.5], rotation: [90, 0, 0], parent: winch,
  });
  // Orange cable drum guards: side frames standing clear of the flanges.
  createPart('DrumGuardLegFL', boxGeo(0.08, 0.9, 0.08), mats.orange, {
    position: [-0.55, 0.45, -0.62], parent: winch,
  });
  createPart('DrumGuardLegRL', boxGeo(0.08, 0.9, 0.08), mats.orange, {
    position: [0.05, 0.45, -0.62], parent: winch,
  });
  createPart('DrumGuardLegFR', boxGeo(0.08, 0.9, 0.08), mats.orange, {
    position: [-0.55, 0.45, 0.62], parent: winch,
  });
  createPart('DrumGuardLegRR', boxGeo(0.08, 0.9, 0.08), mats.orange, {
    position: [0.05, 0.45, 0.62], parent: winch,
  });
  createPart('DrumGuardTopL', boxGeo(0.68, 0.08, 0.08), mats.orange, {
    position: [-0.25, 0.92, -0.62], parent: winch,
  });
  createPart('DrumGuardTopR', boxGeo(0.68, 0.08, 0.08), mats.orange, {
    position: [-0.25, 0.92, 0.62], parent: winch,
  });
  // Tow cable running aft off the drum toward the stern roller.
  createPart('TowCable', cylinderGeo(0.025, 0.025, 1.3, 8), mats.cable, {
    position: [-0.95, 0.5, 0], rotation: [0, 0, 78], parent: winch,
  });

  // Stern roller for the tow wire.
  createPart('SternRoller', cylinderGeo(0.09, 0.09, 0.7, 12), mats.steel, {
    position: [-2.25, 1.2, 0], rotation: [90, 0, 0], parent: root,
  });

  // ---- A-frame crane (safety orange) over the stern ----
  // Feet sit on the aft deck at the transom so the hook hangs over the water.
  const frameX = -2.3;
  // Legs lean inward in Z; feet at deck, apexes high and close together.
  createPart('AFrameLegPort', cylinderGeo(0.07, 0.09, 2.3, 12), mats.orange, {
    position: [frameX, 2.2, -0.68], rotation: [20, 0, 0], parent: root,
  });
  createPart('AFrameLegStbd', cylinderGeo(0.07, 0.09, 2.3, 12), mats.orange, {
    position: [frameX, 2.2, 0.68], rotation: [-20, 0, 0], parent: root,
  });
  // Crossbeam between apexes + top pulley block.
  createPart('AFrameBeam', cylinderGeo(0.07, 0.07, 0.75, 12), mats.orange, {
    position: [frameX, 3.28, 0], rotation: [90, 0, 0], parent: root,
  });
  createPart('CraneBlock', boxGeo(0.18, 0.24, 0.14), mats.dark, {
    position: [frameX, 3.08, 0], parent: root,
  });
  // Hook cable + hook (hanging aft of the transom, under the block).
  createPart('HookCable', cylinderGeo(0.02, 0.02, 1.2, 8), mats.cable, {
    position: [frameX - 0.05, 2.36, 0], parent: root,
  });
  createPart('Hook', torusGeo(0.09, 0.03, 8, 16), mats.steel, {
    position: [frameX - 0.05, 1.7, 0], parent: root,
  });

  // ---- Deck fittings ----
  bollard('BollardSternPort', -2.0, -0.75, 1.12, root, mats);
  bollard('BollardSternStbd', -2.0, 0.75, 1.12, root, mats);
  bollard('BollardBowPort', 1.9, -0.5, 1.12, root, mats);
  bollard('BollardBowStbd', 1.9, 0.5, 1.12, root, mats);
  // Foredeck hatch + vent.
  createPart('ForeHatch', boxGeo(0.6, 0.18, 0.6), mats.steel, {
    position: [1.35, 1.2, 0], parent: root,
  });
  createPart('Vent', cylinderGeo(0.09, 0.11, 0.4, 12), mats.orange, {
    position: [0.0, 1.5, -0.6], parent: root,
  });
  createPart('VentHead', sphereGeo(0.11, 12, 8), mats.orange, {
    position: [0.0, 1.72, -0.6], parent: root,
  });

  return root;
}
