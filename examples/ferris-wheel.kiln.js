// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.

const meta = { name: 'FerrisWheel', category: 'prop' };

function build() {
  const root = createRoot('FerrisWheel');

  // =========================================================================
  // Materials Palette
  // =========================================================================
  // Lattice structure: antique off-white painted industrial steel
  const steelLattice = gameMaterial(0xdfdbd2, { metalness: 0.25, roughness: 0.5 });
  // Base skid & ground frame: deep dark iron
  const steelDark = gameMaterial(0x282c30, { metalness: 0.6, roughness: 0.4 });
  // Wheel rim & structural rings: carnival crimson red
  const steelCrimson = gameMaterial(0xa71d2a, { metalness: 0.35, roughness: 0.4 });
  // Spoke tension rods: bright nickel / galvanized wire
  const spokeWire = gameMaterial(0xcccccc, { metalness: 0.85, roughness: 0.25 });
  // Mechanical drive & decorative accents: polished carnival brass / gold
  const goldBrass = gameMaterial(0xdfab2a, { metalness: 0.88, roughness: 0.2 });
  // Boarding platform planks: weathered boardwalk pine
  const woodDeck = gameMaterial(0x6b4c35, { metalness: 0.0, roughness: 0.8 });
  // Railings and operator console
  const ironRail = gameMaterial(0x1e2124, { metalness: 0.5, roughness: 0.5 });

  // Gondola carriage colors (festive carnival tri-color theme)
  const gondolaRed = gameMaterial(0xc1121f, { metalness: 0.2, roughness: 0.35 });
  const gondolaBlue = gameMaterial(0x1d3557, { metalness: 0.2, roughness: 0.35 });
  const gondolaGold = gameMaterial(0xf4a261, { metalness: 0.2, roughness: 0.35 });
  const gondolaMats = [gondolaRed, gondolaBlue, gondolaGold];

  // Illuminated bulbs & lantern glow
  const bulbGlowWarm = gameMaterial(0xfff5cc, {
    emissive: 0xffd166,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  const bulbGlowGold = gameMaterial(0xffe89e, {
    emissive: 0xff9f1c,
    emissiveIntensity: 3.2,
    roughness: 0.2,
  });

  // Shared geometry helpers (optimized for target triangle budget: 4,000 - 12,000)
  const geoGusset = boxGeo(0.15, 0.15, 0.035);
  const geoRivet = boxGeo(0.024, 0.024, 0.035);
  const geoBulb = sphereGeo(0.038, 4, 3); // 18 tris each

  // =========================================================================
  // 1. Foundation Skid Frame & Footings (Sitting on Y = 0)
  // =========================================================================
  const baseFrame = createPivot('BaseFrame', [0, 0, 0], root);

  // 4 Concrete / Cast-iron Footing Pedestals at the base corners
  const footingZ = 2.45;
  const footingX = 1.15;
  let boltIdx = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cornerTag = `${sx > 0 ? 'F' : 'B'}_${sz > 0 ? 'R' : 'L'}`;
      createPart(`Footing_${cornerTag}`, boxGeo(0.42, 0.10, 0.42), steelDark, {
        position: [sx * footingX, 0.05, sz * footingZ],
        parent: baseFrame,
      });
      // Anchor bolts
      for (const bx of [-0.14, 0.14]) {
        for (const bz of [-0.14, 0.14]) {
          createPart(`AnchorBolt_${boltIdx++}`, boxGeo(0.03, 0.05, 0.03), goldBrass, {
            position: [sx * footingX + bx, 0.11, sz * footingZ + bz],
            parent: baseFrame,
          });
        }
      }
    }
  }

  // Longitudinal Skid Girders (along X at Z = +/- footingZ)
  for (const sz of [-1, 1]) {
    createPart(`SkidBeam_${sz > 0 ? 'R' : 'L'}`, boxGeo(footingX * 2 + 0.3, 0.12, 0.16), steelDark, {
      position: [0, 0.11, sz * footingZ],
      parent: baseFrame,
    });
  }
  // Transverse Ground Ties (along Z at X = +/- footingX)
  for (const sx of [-1, 1]) {
    createPart(`CrossTie_${sx > 0 ? 'F' : 'B'}`, boxGeo(0.16, 0.10, footingZ * 2), steelDark, {
      position: [sx * footingX, 0.11, 0],
      parent: baseFrame,
    });
  }

  // =========================================================================
  // 2. Riveted Lattice A-Frame Towers
  // =========================================================================
  const hubY = 5.20;
  const towerX = 0.88;

  // The wheel's swept envelope, declared up here because the towers may only be
  // braced where the ride is not. Section 4 builds the wheel from these same
  // numbers, so the clearance test below cannot drift away from the geometry it
  // is protecting.
  const rimRadius = 3.60;
  const innerRimRadius = 2.20;
  const gondolaDrop = 0.88; // pin to the underside of a car
  const gondolaHalfZ = 0.26;
  const swingRadius = rimRadius + Math.hypot(gondolaDrop, gondolaHalfZ);
  const legBottomZ = 2.40;
  const legTopZ = 0.16;
  const legBottomY = 0.12;

  // Build Front (X = +towerX) and Rear (X = -towerX) A-Frames
  for (const sx of [-1, 1]) {
    const sideName = sx > 0 ? 'Front' : 'Rear';
    const currentX = sx * towerX;
    const aFrame = createPivot(`AFrame_${sideName}`, [currentX, 0, 0], root);

    // Main Chords (Heavy tubular legs from base to hub bearing)
    beamBetween(`${sideName}Leg_L`, [0, legBottomY, -legBottomZ], [0, hubY, -legTopZ], 0.065, steelLattice, {
      segments: 5,
      parent: aFrame,
    });
    beamBetween(`${sideName}Leg_R`, [0, legBottomY, legBottomZ], [0, hubY, legTopZ], 0.065, steelLattice, {
      segments: 5,
      parent: aFrame,
    });

    // Horizontal Lattice Rungs and Diagonal X-Bracing
    const rungHeights = [0.95, 1.80, 2.65, 3.50, 4.35];
    const rungWidths = [];

    for (let k = 0; k < rungHeights.length; k++) {
      const y = rungHeights[k];
      const frac = (y - legBottomY) / (hubY - legBottomY);
      const halfW = legBottomZ * (1 - frac) + legTopZ * frac;
      rungWidths.push(halfW);

      // Horizontal strut connecting Left and Right legs
      beamBetween(`${sideName}Rung_${k}`, [0, y, -halfW], [0, y, halfW], 0.036, steelLattice, {
        segments: 4,
        parent: aFrame,
      });

      // Riveted Gusset plates at the joints
      for (const sz of [-1, 1]) {
        const gussetTag = sz > 0 ? 'R' : 'L';
        createPart(`${sideName}Gusset_${k}_${gussetTag}`, geoGusset, steelLattice, {
          position: [0, y, sz * halfW],
          parent: aFrame,
        });
        // Decorative rivet cluster on gusset
        let rivetSub = 0;
        for (const ry of [-0.04, 0.04]) {
          createPart(`${sideName}Rivet_${k}_${gussetTag}_${rivetSub++}`, geoRivet, steelDark, {
            position: [sx * 0.02, y + ry, sz * halfW],
            parent: aFrame,
          });
        }
      }

      // Diagonal X-Lacing between rung k and rung k-1
      if (k > 0) {
        const prevY = rungHeights[k - 1];
        const prevHalfW = rungWidths[k - 1];
        beamBetween(`${sideName}DiagA_${k}`, [0, prevY, -prevHalfW], [0, y, halfW], 0.020, steelLattice, {
          segments: 4,
          parent: aFrame,
        });
        beamBetween(`${sideName}DiagB_${k}`, [0, prevY, prevHalfW], [0, y, -halfW], 0.020, steelLattice, {
          segments: 4,
          parent: aFrame,
        });
      }
    }

    // Hub Bearing Block at apex of A-Frame
    createPart(`${sideName}BearingBlock`, boxGeo(0.24, 0.28, 0.36), steelDark, {
      position: [0, hubY, 0],
      parent: aFrame,
    });
    createPart(`${sideName}BearingCap`, cylinderXGeo(0.13, 0.13, 0.28, 8), goldBrass, {
      position: [0, hubY + 0.04, 0],
      parent: aFrame,
    });
  }

  // Cross-bracing between the front and rear A-frames.
  //
  // The towers can only be tied to each other where the wheel is not. A strut
  // spanning X at mid-height is cut in half by the rotating disc, and the cars
  // hang below the rim again, so the honest keep-out is `swingRadius` about the
  // hub. Real double-A-frame wheels answer this the same way: heavy portal
  // bracing down at the base, and above that the axle is the only thing joining
  // the two towers. Candidate heights are filtered rather than hand-picked, so
  // the clearance is checked instead of assumed.
  const halfWidthAt = (y) =>
    legBottomZ + (legTopZ - legBottomZ) * ((y - legBottomY) / (hubY - legBottomY));
  const clearsWheel = (y, z) => Math.hypot(hubY - y, z) > swingRadius + 0.12;

  const braceHeights = [0.45, 0.90, 1.45, 2.10, 2.90, 3.70].filter((y) =>
    clearsWheel(y, halfWidthAt(y)),
  );
  for (let k = 0; k < braceHeights.length; k++) {
    const y = braceHeights[k];
    const halfW = halfWidthAt(y);
    for (const sz of [-1, 1]) {
      const tag = `Y${Math.round(y * 100)}_${sz > 0 ? 'R' : 'L'}`;
      beamBetween(`SwayTie_${tag}`, [towerX, y, sz * halfW], [-towerX, y, sz * halfW], 0.034, steelLattice, {
        segments: 4,
        parent: root,
      });

      // X-brace up to the next tie, but only where that whole panel stays out
      // of the swept disc as well -- the crossing point is what matters.
      const nextY = braceHeights[k + 1];
      if (nextY === undefined) continue;
      const nextHalfW = halfWidthAt(nextY);
      if (!clearsWheel((y + nextY) / 2, (halfW + nextHalfW) / 2)) continue;
      beamBetween(`SwayDiagA_${tag}`, [towerX, y, sz * halfW], [-towerX, nextY, sz * nextHalfW], 0.018, steelLattice, {
        segments: 4,
        parent: root,
      });
      beamBetween(`SwayDiagB_${tag}`, [-towerX, y, sz * halfW], [towerX, nextY, sz * nextHalfW], 0.018, steelLattice, {
        segments: 4,
        parent: root,
      });
    }
  }

  // Maintenance Service Ladder on Rear Left A-Frame leg
  createLadder('MaintenanceLadder', {
    bottom: [-towerX - 0.08, 0.15, -legBottomZ * 0.95],
    top: [-towerX - 0.08, hubY - 0.35, -legTopZ - 0.10],
    material: ironRail,
    width: 0.34,
    rungCount: 14,
    railRadius: 0.016,
    rungRadius: 0.011,
    parent: root,
  });
  // Service platform attached securely to rear bearing block
  const catwalkY = hubY - 0.20;
  const catwalkZ = -legTopZ - 0.18;
  createPart('MaintenanceCatwalk', boxGeo(0.38, 0.04, 0.38), steelDark, {
    position: [-towerX - 0.05, catwalkY, catwalkZ],
    parent: root,
  });
  // Catwalk handrails firmly seated on the platform deck
  beamBetween('CatwalkPost1', [-towerX - 0.22, catwalkY + 0.02, catwalkZ - 0.16], [-towerX - 0.22, catwalkY + 0.40, catwalkZ - 0.16], 0.015, ironRail, {
    segments: 4,
    parent: root,
  });
  beamBetween('CatwalkPost2', [-towerX - 0.22, catwalkY + 0.02, catwalkZ + 0.16], [-towerX - 0.22, catwalkY + 0.40, catwalkZ + 0.16], 0.015, ironRail, {
    segments: 4,
    parent: root,
  });
  beamBetween('CatwalkTopRail', [-towerX - 0.22, catwalkY + 0.40, catwalkZ - 0.16], [-towerX - 0.22, catwalkY + 0.40, catwalkZ + 0.16], 0.015, ironRail, {
    segments: 4,
    parent: root,
  });

  // =========================================================================
  // 3. Central Axle, Drive Machinery & Ornate Carnival Starburst
  // =========================================================================
  createPart('MainAxle', cylinderXGeo(0.080, 0.080, towerX * 2 + 0.36, 8), steelDark, {
    position: [0, hubY, 0],
    parent: root,
  });

  // Mechanical Drive Motor & Bull Gear (on rear A-frame)
  createPart('DriveMotorHousing', boxGeo(0.34, 0.34, 0.30), steelDark, {
    position: [-towerX + 0.14, hubY - 0.70, -0.44],
    parent: root,
  });
  createPart('DriveMotorCylinder', cylinderXGeo(0.11, 0.11, 0.36, 8), steelCrimson, {
    position: [-towerX + 0.14, hubY - 0.70, -0.44],
    parent: root,
  });
  createPart('BullGearRear', cylinderXGeo(0.36, 0.36, 0.05, 12), goldBrass, {
    position: [-0.66, hubY, 0],
    parent: root,
  });

  // Front Hub Ornate Starburst Medallion (Facing +X)
  const hubStarburst = createPivot('HubStarburst', [towerX + 0.03, hubY, 0], root);
  // Concentric decorative rings and discs
  createPart('StarburstOuterRing', torusGeo(0.44, 0.018, 5, 20), goldBrass, {
    rotation: [0, 90, 0],
    parent: hubStarburst,
  });
  createPart('StarburstBackDisc', cylinderXGeo(0.42, 0.42, 0.03, 12), steelCrimson, {
    parent: hubStarburst,
  });
  createPart('StarburstFrontPlate', cylinderXGeo(0.24, 0.24, 0.045, 10), goldBrass, {
    position: [0.01, 0, 0],
    parent: hubStarburst,
  });
  createPart('StarburstCenterDome', geoBulb, bulbGlowGold, {
    position: [0.035, 0, 0],
    parent: hubStarburst,
  });
  // 12 Radiating Star Rays with illuminated cabochon bulbs
  for (let s = 0; s < 12; s++) {
    const starAngle = (s / 12) * Math.PI * 2;
    const sy = Math.cos(starAngle) * 0.34;
    const sz = Math.sin(starAngle) * 0.34;
    createPart(`StarBulb_${s}`, geoBulb, s % 2 === 0 ? bulbGlowWarm : bulbGlowGold, {
      position: [0.025, sy, sz],
      parent: hubStarburst,
    });
    beamBetween(`StarRay_${s}`, [0.015, 0.14 * Math.cos(starAngle), 0.14 * Math.sin(starAngle)], [0.015, 0.42 * Math.cos(starAngle), 0.42 * Math.sin(starAngle)], 0.013, goldBrass, {
      segments: 4,
      parent: hubStarburst,
    });
  }

  // =========================================================================
  // 4. Rotating Spoked Double-Rim Wheel (Joint_Wheel)
  // =========================================================================
  const wheelPivot = createPivot('Wheel', [0, hubY, 0], root);

  const rimSpacingX = 0.50; // +/- rimSpacingX
  const gondolaCount = 12;

  // Hub Spoke Flanges at +/- rimSpacingX
  for (const sx of [-1, 1]) {
    const side = sx > 0 ? 'F' : 'R';
    createPart(`HubFlange_${side}`, cylinderXGeo(0.40, 0.40, 0.07, 12), goldBrass, {
      position: [sx * rimSpacingX, 0, 0],
      parent: wheelPivot,
    });
    createPart(`HubCore_${side}`, cylinderXGeo(0.24, 0.24, 0.14, 8), steelCrimson, {
      position: [sx * (rimSpacingX + 0.05), 0, 0],
      parent: wheelPivot,
    });
  }

  // Concentric Rims (Outer & Inner) on Front and Rear planes
  for (const sx of [-1, 1]) {
    const side = sx > 0 ? 'Front' : 'Rear';
    createPart(`${side}OuterRim`, torusGeo(rimRadius, 0.033, 5, 32), steelCrimson, {
      position: [sx * rimSpacingX, 0, 0],
      rotation: [0, 90, 0],
      parent: wheelPivot,
    });
    createPart(`${side}InnerRim`, torusGeo(innerRimRadius, 0.023, 4, 24), steelLattice, {
      position: [sx * rimSpacingX, 0, 0],
      rotation: [0, 90, 0],
      parent: wheelPivot,
    });
  }

  // Radial Spokes, Web Trussing & Perimeter Lights
  for (let i = 0; i < gondolaCount; i++) {
    const angle = (i / gondolaCount) * Math.PI * 2;
    const midAngle = ((i + 0.5) / gondolaCount) * Math.PI * 2;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosMid = Math.cos(midAngle);
    const sinMid = Math.sin(midAngle);

    // Rim coordinates
    const outY = rimRadius * cosA;
    const outZ = rimRadius * sinA;
    const inY = innerRimRadius * cosA;
    const inZ = innerRimRadius * sinA;
    const midOutY = rimRadius * cosMid;
    const midOutZ = rimRadius * sinMid;

    // Both Front and Rear Spoke sets
    for (const sx of [-1, 1]) {
      const side = sx > 0 ? 'F' : 'R';
      const curX = sx * rimSpacingX;

      // Radial spoke from hub flange (r = 0.40) to outer rim
      beamBetween(`Spoke_${side}_${i}`, [curX, 0.40 * cosA, 0.40 * sinA], [curX, outY, outZ], 0.019, spokeWire, {
        segments: 4,
        parent: wheelPivot,
      });

      // Diagonal web truss between inner rim and outer rim
      beamBetween(`TrussA_${side}_${i}`, [curX, inY, inZ], [curX, midOutY, midOutZ], 0.014, spokeWire, {
        segments: 4,
        parent: wheelPivot,
      });
      beamBetween(`TrussB_${side}_${i}`, [curX, midOutY, midOutZ], [curX, innerRimRadius * Math.cos((i + 1) * Math.PI * 2 / gondolaCount), innerRimRadius * Math.sin((i + 1) * Math.PI * 2 / gondolaCount)], 0.014, spokeWire, {
        segments: 4,
        parent: wheelPivot,
      });
    }

    // Heavy Spreader Crossbar between Front and Rear outer rims (Gondola Hanger Pin)
    beamBetween(`RimSpreader_${i}`, [rimSpacingX, outY, outZ], [-rimSpacingX, outY, outZ], 0.035, steelCrimson, {
      segments: 5,
      parent: wheelPivot,
    });

    // Outer Rim Fairground Lights
    createPart(`RimBulb_${i}`, geoBulb, i % 2 === 0 ? bulbGlowWarm : bulbGlowGold, {
      position: [rimSpacingX + 0.04, outY, outZ],
      parent: wheelPivot,
    });
    createPart(`RimBulbMid_${i}`, geoBulb, i % 2 === 0 ? bulbGlowGold : bulbGlowWarm, {
      position: [rimSpacingX + 0.04, midOutY, midOutZ],
      parent: wheelPivot,
    });

    // =======================================================================
    // 5. Lit Hanging Gondolas (Maintained Upright at each spoke pin)
    // =======================================================================
    const gondolaPivot = createPivot(`Gondola_${i}`, [0, outY, outZ], wheelPivot);
    const carMat = gondolaMats[i % 3];

    // Suspension Hanger: Inverted V-yoke dropping from pin to canopy
    // Top central pivot sleeve on the spreader pin
    createPart(`HangerSleeve_${i}`, cylinderXGeo(0.042, 0.042, 0.20, 6), steelDark, {
      position: [0, 0, 0],
      parent: gondolaPivot,
    });

    // Elegant Front & Rear A-frame suspension arms from pin to canopy
    const canopyTopY = -0.38;
    const canL = 0.68; // along X
    const canW = 0.52; // along Z
    for (const sx of [-canL / 2 + 0.08, canL / 2 - 0.08]) {
      beamBetween(`HangerArmA_${i}_${sx > 0 ? 'F' : 'B'}`, [sx, 0, 0], [sx, canopyTopY, -canW / 2 + 0.06], 0.015, ironRail, {
        segments: 4,
        parent: gondolaPivot,
      });
      beamBetween(`HangerArmB_${i}_${sx > 0 ? 'F' : 'B'}`, [sx, 0, 0], [sx, canopyTopY, canW / 2 - 0.06], 0.015, ironRail, {
        segments: 4,
        parent: gondolaPivot,
      });
    }

    // Canopy / Roof: Arched carnival awning with gold finial
    createPart(`CanopyTop_${i}`, boxGeo(canL, 0.035, canW), carMat, {
      position: [0, canopyTopY, 0],
      parent: gondolaPivot,
    });
    // Curved roof crown
    createPart(`CanopyArch_${i}`, cylinderXGeo(0.24, 0.24, canL - 0.04, 6), carMat, {
      position: [0, canopyTopY + 0.04, 0],
      scale: [1, 0.35, 1],
      parent: gondolaPivot,
    });
    // Gold decorative roof finial
    createPart(`CanopyFinial_${i}`, cylinderGeo(0.035, 0.035, 0.08, 5), goldBrass, {
      position: [0, canopyTopY + 0.12, 0],
      parent: gondolaPivot,
    });

    // Carriage Tub Body (Molded passenger basket)
    const tubBottomY = -gondolaDrop;
    const tubH = 0.26;
    const tubY = tubBottomY + tubH / 2;
    createPart(`CarriageTub_${i}`, boxGeo(canL - 0.02, tubH, canW - 0.02), carMat, {
      position: [0, tubY, 0],
      parent: gondolaPivot,
    });
    // Polished gold belt molding
    createPart(`TubBelt_${i}`, boxGeo(canL + 0.01, 0.035, canW + 0.01), goldBrass, {
      position: [0, tubY + tubH / 2 - 0.02, 0],
      parent: gondolaPivot,
    });

    // Contoured Passenger Benches (Facing each other along X)
    for (const sx of [-0.20, 0.20]) {
      createPart(`Bench_${i}_${sx > 0 ? 'F' : 'B'}`, boxGeo(0.18, 0.12, canW - 0.10), woodDeck, {
        position: [sx, tubBottomY + 0.18, 0],
        parent: gondolaPivot,
      });
    }

    // 4 Corner Stanchions connecting carriage tub to canopy
    let postIdx = 0;
    for (const sx of [-canL / 2 + 0.04, canL / 2 - 0.04]) {
      for (const sz of [-canW / 2 + 0.04, canW / 2 - 0.04]) {
        beamBetween(`CornerPost_${i}_${postIdx++}`, [sx, tubY + tubH / 2, sz], [sx, canopyTopY, sz], 0.012, goldBrass, {
          segments: 4,
          parent: gondolaPivot,
        });
      }
    }

    // Side Safety Railings (Spanning along X on Left and Right)
    for (const sz of [-canW / 2 + 0.04, canW / 2 - 0.04]) {
      beamBetween(`SideRail_${i}_${sz > 0 ? 'R' : 'L'}`, [-canL / 2 + 0.04, tubY + tubH / 2 + 0.10, sz], [canL / 2 - 0.04, tubY + tubH / 2 + 0.10, sz], 0.011, ironRail, {
        segments: 4,
        parent: gondolaPivot,
      });
    }

    // Lit Gondola Illumination: Warm Ceiling Lantern + Glowing Exterior Marker Bulbs
    createPart(`CeilingLantern_${i}`, cylinderGeo(0.032, 0.042, 0.065, 5), bulbGlowWarm, {
      position: [0, canopyTopY - 0.06, 0],
      parent: gondolaPivot,
    });
    // Front and Rear glowing marker lights on carriage exterior
    createPart(`GondolaMarkerF_${i}`, geoBulb, bulbGlowWarm, {
      position: [canL / 2 + 0.02, tubY + 0.04, 0],
      parent: gondolaPivot,
    });
    createPart(`GondolaMarkerB_${i}`, geoBulb, bulbGlowWarm, {
      position: [-canL / 2 - 0.02, tubY + 0.04, 0],
      parent: gondolaPivot,
    });
  }

  // =========================================================================
  // 6. Boarding Platform, Entrance Marquee & Operator Station
  // =========================================================================
  const platform = createPivot('BoardingPlatform', [0, 0, 0], root);
  const platH = 0.44;
  const platW = 1.60;
  const platL = 1.50;

  // Platform Decking & Timber Post Frame
  createPart('PlatformDeck', boxGeo(platL, 0.06, platW), woodDeck, {
    position: [0.15, platH - 0.03, 0],
    parent: platform,
  });
  createPart('PlatformFascia', boxGeo(platL, platH - 0.06, platW), steelDark, {
    position: [0.15, (platH - 0.06) / 2, 0],
    parent: platform,
  });

  // Access Stairs on the front (+X) side
  const stepCount = 3;
  const stepRise = platH / stepCount;
  const stepRun = 0.26;
  for (let s = 0; s < stepCount; s++) {
    const sy = (s + 0.5) * stepRise;
    const sx = 0.15 + platL / 2 + (s + 0.5) * stepRun;
    createPart(`Step_${s}`, boxGeo(stepRun, stepRise, platW * 0.75), woodDeck, {
      position: [sx, sy, 0],
      parent: platform,
    });
  }

  // Safety Handrails around platform perimeter
  const railH = 0.55;
  for (const sz of [-1, 1]) {
    const railSide = sz > 0 ? 'R' : 'L';
    beamBetween(`PlatRail_${railSide}`, [-platL / 2 + 0.15, platH + railH, sz * (platW / 2 - 0.05)], [platL / 2 + 0.15, platH + railH, sz * (platW / 2 - 0.05)], 0.016, ironRail, {
      segments: 4,
      parent: platform,
    });
    beamBetween(`PlatRailMid_${railSide}`, [-platL / 2 + 0.15, platH + railH * 0.5, sz * (platW / 2 - 0.05)], [platL / 2 + 0.15, platH + railH * 0.5, sz * (platW / 2 - 0.05)], 0.013, ironRail, {
      segments: 4,
      parent: platform,
    });
    let stanchionIdx = 0;
    for (const sx of [-platL / 2 + 0.15, 0.15, platL / 2 + 0.15]) {
      beamBetween(`PlatStanchion_${railSide}_${stanchionIdx++}`, [sx, platH, sz * (platW / 2 - 0.05)], [sx, platH + railH, sz * (platW / 2 - 0.05)], 0.016, ironRail, {
        segments: 4,
        parent: platform,
      });
    }
  }

  // Entrance Marquee Arch at the top of the stairs
  const archX = 0.15 + platL / 2;
  const archZ1 = -0.55;
  const archZ2 = 0.55;
  const archTopY = platH + 1.10;
  // Left and Right Arch Posts
  beamBetween('EntrancePost_L', [archX, platH, archZ1], [archX, archTopY, archZ1], 0.022, steelCrimson, {
    segments: 4,
    parent: platform,
  });
  beamBetween('EntrancePost_R', [archX, platH, archZ2], [archX, archTopY, archZ2], 0.022, steelCrimson, {
    segments: 4,
    parent: platform,
  });
  // Arch Header Beam
  beamBetween('EntranceHeader', [archX, archTopY, archZ1], [archX, archTopY, archZ2], 0.025, steelCrimson, {
    segments: 4,
    parent: platform,
  });
  // Entrance Signboard ("FERRIS WHEEL")
  createPart('EntranceSignboard', boxGeo(0.04, 0.16, 0.90), goldBrass, {
    position: [archX + 0.01, archTopY + 0.08, 0],
    parent: platform,
  });
  createPart('EntranceSignFascia', boxGeo(0.05, 0.10, 0.82), steelCrimson, {
    position: [archX + 0.013, archTopY + 0.08, 0],
    parent: platform,
  });
  // Glowing Entrance Lanterns on posts
  createPart('EntranceLantern_L', geoBulb, bulbGlowGold, {
    position: [archX + 0.03, archTopY + 0.02, archZ1],
    parent: platform,
  });
  createPart('EntranceLantern_R', geoBulb, bulbGlowGold, {
    position: [archX + 0.03, archTopY + 0.02, archZ2],
    parent: platform,
  });

  // Operator Console & Shelter on platform side
  const consolePivot = createPivot('OperatorConsole', [0.65, platH, 0.95], platform);
  createPart('ConsolePedestal', boxGeo(0.24, 0.65, 0.32), steelDark, {
    position: [0, 0.325, 0],
    parent: consolePivot,
  });
  createPart('ConsoleDesk', boxGeo(0.28, 0.04, 0.36), ironRail, {
    position: [0, 0.67, 0],
    rotation: [15, 0, 0],
    parent: consolePivot,
  });
  createPart('ControlLever', cylinderGeo(0.012, 0.012, 0.16, 4), goldBrass, {
    position: [-0.05, 0.76, 0],
    rotation: [0, 0, 20],
    parent: consolePivot,
  });
  createPart('EmergencyStop', cylinderGeo(0.022, 0.022, 0.03, 6), gondolaRed, {
    position: [0.06, 0.70, 0.05],
    parent: consolePivot,
  });
  // Operator stool
  createPart('OperatorStoolSeat', cylinderGeo(0.14, 0.14, 0.04, 8), woodDeck, {
    position: [0.32, 0.42, 0],
    parent: consolePivot,
  });
  beamBetween('StoolLeg', [0.32, 0, 0], [0.32, 0.40, 0], 0.02, ironRail, {
    segments: 4,
    parent: consolePivot,
  });

  return root;
}
