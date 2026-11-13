// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Art Deco Botanical Conservatory',
  category: 'architecture',
  role: 'building'
};

function build() {
  const root = createRoot('ArtDecoConservatory');

  // ==========================================
  // MATERIALS PALETTE (Art Deco & Botanical)
  // ==========================================
  const copper = gameMaterial(0xc87442, { metalness: 0.85, roughness: 0.32 });
  const copperDark = gameMaterial(0x8e4726, { metalness: 0.88, roughness: 0.38 });
  const copperPatina = gameMaterial(0x489688, { metalness: 0.55, roughness: 0.5 });
  const goldAccent = gameMaterial(0xdfa538, { metalness: 0.86, roughness: 0.28 });
  const glass = glassMaterial(0x8ee0d6, { opacity: 0.34, roughness: 0.12, metalness: 0.05 });
  
  const stonePaver = gameMaterial(0xe0d8cb, { roughness: 0.85, metalness: 0.05 });
  const stoneBase = gameMaterial(0xbaa793, { roughness: 0.9, metalness: 0.04 });
  const stoneTrim = gameMaterial(0xc8bea8, { roughness: 0.85, metalness: 0.04 });
  const soil = gameMaterial(0x302115, { roughness: 0.95 });

  const trunkMat = gameMaterial(0x6a4f38, { roughness: 0.88 });
  const palmGreen = gameMaterial(0x2d6f2e, { roughness: 0.65 });
  const deepGreen = gameMaterial(0x1e4e22, { roughness: 0.7 });
  const lightGreen = gameMaterial(0x428e30, { roughness: 0.6 });
  const vineGreen = gameMaterial(0x265f24, { roughness: 0.65 });
  const flowerPink = gameMaterial(0xe84a62, { roughness: 0.5 });
  const flowerGold = gameMaterial(0xf5a823, { roughness: 0.5 });
  const flowerWhite = gameMaterial(0xf2ede4, { roughness: 0.6 });

  // ==========================================
  // SHARED GEOMETRIES
  // ==========================================
  const potGeo = lathe([[0.15, 0], [0.38, 0.45], [0.32, 0.65], [0.42, 0.8], [0.42, 0.9]], 16);
  const cypressGeo = coneGeo(0.65, 2.8, 12);
  const bushBlobGeo = sphereGeo(0.5, 8, 6);
  const leafSpillGeo = sphereGeo(0.35, 7, 5);

  // ==========================================
  // 1. LOWER PODIUM & PLAZA (Tier 0: Y = 0 to 0.8m)
  // ==========================================
  const podiumGroup = createPivot('PodiumGroup', [0, 0, 0], root);

  // Base plinth: 18m wide (Z: -9 to +9) x 20m long (X: -10 to +10)
  createPart('PlinthBase', boxGeo(20.4, 0.2, 18.4), stoneBase, {
    position: [0, 0.1, 0],
    parent: podiumGroup
  });
  createPart('PlinthMain', boxGeo(20.0, 0.6, 18.0), stoneTrim, {
    position: [0, 0.5, 0],
    parent: podiumGroup
  });
  createPart('PlinthPaving', boxGeo(19.6, 0.08, 17.6), stonePaver, {
    position: [0, 0.84, 0],
    parent: podiumGroup
  });

  // Grand Front Staircase (Facing +X, from X = 9.8m to 12.6m, width 6.0m)
  const stairSteps = 5;
  const stairRise = 0.16;
  const stairRun = 0.56;
  for (let s = 0; s < stairSteps; s++) {
    const y = (stairSteps - 1 - s) * stairRise + stairRise / 2;
    const x = 10.0 + s * stairRun + stairRun / 2;
    createPart('StairStep_' + s, boxGeo(stairRun + (s === 0 ? 0.02 : 0.04), stairRise, 6.2), stonePaver, {
      position: [x + (s === 0 ? 0.01 : 0), y, 0],
      parent: podiumGroup
    });
  }
  // Staircase cheek parapets flanking the front stairs (Z = ±3.3m)
  for (const side of [-1, 1]) {
    createPart('StairCheek_' + side, boxGeo(3.2, 1.1, 0.5), stoneTrim, {
      position: [11.2, 0.55, side * 3.35],
      parent: podiumGroup
    });
    createPart('StairCheekCap_' + side, boxGeo(3.3, 0.08, 0.56), copper, {
      position: [11.2, 1.14, side * 3.35],
      parent: podiumGroup
    });
    // Art Deco Pedestal Lanterns flanking the staircase
    createPart('StairLanternBase_' + side, boxGeo(0.44, 0.16, 0.44), copperDark, {
      position: [12.4, 1.26, side * 3.35],
      parent: podiumGroup
    });
    createPart('StairLanternGlass_' + side, cylinderGeo(0.18, 0.14, 0.38, 8), glass, {
      position: [12.4, 1.53, side * 3.35],
      parent: podiumGroup
    });
    createPart('StairLanternCap_' + side, coneGeo(0.24, 0.2, 8), copper, {
      position: [12.4, 1.82, side * 3.35],
      parent: podiumGroup
    });
    createPart('StairLanternFinial_' + side, sphereGeo(0.06, 6, 6), goldAccent, {
      position: [12.4, 1.96, side * 3.35],
      parent: podiumGroup
    });
  }

  // Front Garden Terrace Beds flanking the grand stairs (at X = 8.6m, Z = ±5.8m)
  for (const frontSide of [-1, 1]) {
    const fz = frontSide * 5.8;
    createPart('FrontBedParapet_' + frontSide, boxGeo(2.4, 0.6, 0.35), stoneTrim, {
      position: [9.4, 0.5, fz],
      parent: podiumGroup
    });
    createPart('FrontBedCap_' + frontSide, boxGeo(2.5, 0.06, 0.42), copper, {
      position: [9.4, 0.83, fz],
      parent: podiumGroup
    });
    createPart('FrontBedSoil_' + frontSide, boxGeo(2.2, 0.15, 2.6), soil, {
      position: [8.2, 0.75, fz],
      parent: podiumGroup
    });
    // Lush shrubs and tropical blooms in front beds
    createPart('FrontBush1_' + frontSide, bushBlobGeo, deepGreen, {
      position: [8.2, 1.05, fz - 0.5],
      scale: [1.1, 0.8, 1.1],
      parent: podiumGroup
    });
    createPart('FrontBush2_' + frontSide, bushBlobGeo, lightGreen, {
      position: [8.4, 1.1, fz + 0.5],
      scale: [1.0, 0.9, 1.0],
      parent: podiumGroup
    });
    createPart('FrontFlower_' + frontSide, sphereGeo(0.24, 6, 5), flowerPink, {
      position: [8.3, 1.35, fz],
      parent: podiumGroup
    });
    // Cascading vine over front wall
    createPart('FrontVine_' + frontSide, leafSpillGeo, vineGreen, {
      position: [9.55, 0.75, fz],
      scale: [0.8, 1.3, 1.2],
      parent: podiumGroup
    });
  }

  // 4 Stepped Art Deco Corner Pylons
  const cornerCoords = [
    [-9.2, -8.2], [-9.2, 8.2],
    [9.2, -8.2], [9.2, 8.2]
  ];
  cornerCoords.forEach(([cx, cz], idx) => {
    // Stepped plinth
    createPart('PylonBase_' + idx, boxGeo(1.6, 1.4, 1.6), stoneTrim, {
      position: [cx, 0.7, cz],
      parent: podiumGroup
    });
    // Fluted central shaft
    createPart('PylonShaft_' + idx, boxGeo(1.25, 0.8, 1.25), stonePaver, {
      position: [cx, 1.8, cz],
      parent: podiumGroup
    });
    // Tiered copper cap
    createPart('PylonCap1_' + idx, boxGeo(1.4, 0.1, 1.4), copper, {
      position: [cx, 2.25, cz],
      parent: podiumGroup
    });
    createPart('PylonCap2_' + idx, boxGeo(1.1, 0.12, 1.1), copperPatina, {
      position: [cx, 2.36, cz],
      parent: podiumGroup
    });
    // Fluted urn with floral bouquet on each pylon
    createPart('PylonUrn_' + idx, potGeo, copper, {
      position: [cx, 2.42, cz],
      parent: podiumGroup
    });
    createPart('PylonUrnSoil_' + idx, cylinderGeo(0.38, 0.38, 0.1, 12), soil, {
      position: [cx, 3.25, cz],
      parent: podiumGroup
    });
    // Spilling plants in urn
    for (let f = 0; f < 6; f++) {
      const ang = (f * Math.PI * 2) / 6;
      createPart('UrnFlower_' + idx + '_' + f, sphereGeo(0.18, 6, 5), (f % 2 === 0 ? flowerPink : flowerGold), {
        position: [cx + 0.28 * Math.cos(ang), 3.38, cz + 0.28 * Math.sin(ang)],
        parent: podiumGroup
      });
      createPart('UrnSpill_' + idx + '_' + f, leafSpillGeo, vineGreen, {
        position: [cx + 0.38 * Math.cos(ang), 3.15, cz + 0.38 * Math.sin(ang)],
        parent: podiumGroup
      });
    }
  });

  // ==========================================
  // 2. MID PROMENADE & PLANTED TERRACES (Tier 1: Y = 0.8 to 1.6m)
  // ==========================================
  const terraceGroup = createPivot('TerraceGroup', [0, 0, 0], root);

  // Raised terrace podium (X: -8 to +8, Z: -8 to +8, height 0.8m up to Y = 1.6m)
  createPart('TerracePodium', boxGeo(16.4, 0.76, 16.4), stoneTrim, {
    position: [0, 1.18, 0],
    parent: terraceGroup
  });
  createPart('TerraceFloor', boxGeo(16.0, 0.08, 16.0), stonePaver, {
    position: [0, 1.6, 0],
    parent: terraceGroup
  });

  // North & South Exterior Garden Terraces (Z = -7.2m to -4.6m and Z = +4.6m to +7.2m)
  for (const side of [-1, 1]) {
    const tz = side * 5.9;
    // Retaining planter box along exterior wings
    createPart('TerraceParapet_' + side, boxGeo(14.8, 0.7, 0.35), stoneTrim, {
      position: [0, 1.95, side * 7.6],
      parent: terraceGroup
    });
    createPart('TerraceParapetCap_' + side, boxGeo(15.0, 0.08, 0.42), copper, {
      position: [0, 2.34, side * 7.6],
      parent: terraceGroup
    });
    // Front and back retaining walls of side terraces
    createPart('TerraceWallFront_' + side, boxGeo(0.35, 0.7, 3.2), stoneTrim, {
      position: [7.3, 1.95, tz],
      parent: terraceGroup
    });
    createPart('TerraceWallFrontCap_' + side, boxGeo(0.42, 0.08, 3.3), copper, {
      position: [7.3, 2.34, tz],
      parent: terraceGroup
    });
    createPart('TerraceWallBack_' + side, boxGeo(0.35, 0.7, 3.2), stoneTrim, {
      position: [-7.3, 1.95, tz],
      parent: terraceGroup
    });
    createPart('TerraceWallBackCap_' + side, boxGeo(0.42, 0.08, 3.3), copper, {
      position: [-7.3, 2.34, tz],
      parent: terraceGroup
    });

    // Deep planter soil bed
    createPart('TerraceSoil_' + side, boxGeo(14.2, 0.25, 2.6), soil, {
      position: [0, 1.8, tz],
      parent: terraceGroup
    });

    // Cascading Vines Spilling Over Terrace Parapet
    for (let v = 0; v < 8; v++) {
      const vx = -6.0 + v * 1.7;
      // Clustered trailing foliage cascading down exterior wall
      createPart('VineTop_' + side + '_' + v, leafSpillGeo, vineGreen, {
        position: [vx, 2.32, side * 7.8],
        scale: [1.2, 0.8, 1.1],
        parent: terraceGroup
      });
      createPart('VineMid_' + side + '_' + v, leafSpillGeo, deepGreen, {
        position: [vx, 1.9, side * 7.85],
        scale: [0.9, 1.4, 0.8],
        parent: terraceGroup
      });
      createPart('VineLow_' + side + '_' + v, leafSpillGeo, vineGreen, {
        position: [vx, 1.35, side * 7.88],
        scale: [0.7, 1.3, 0.6],
        parent: terraceGroup
      });
    }

    // Dense Plantings in Terrace Beds:
    // Stately Palm Trees (2 per terrace)
    const palmPositions = [[-4.2, tz], [4.2, tz]];
    palmPositions.forEach(([px, pz], pIdx) => {
      // Curved ringed trunk
      const trunkPts = [
        [px, 1.9, pz],
        [px + 0.1, 2.9, pz + 0.05 * side],
        [px + 0.25, 4.0, pz + 0.15 * side],
        [px + 0.45, 5.2, pz + 0.3 * side]
      ];
      const trunkGeo = pipeAlongPath(trunkPts, 0.14, { radialSegments: 10 });
      createPart('PalmTrunk_' + side + '_' + pIdx, trunkGeo, trunkMat, { parent: terraceGroup });

      // Palm Crown: 12 radiating arching fronds
      const crownHead = [px + 0.45, 5.2, pz + 0.3 * side];
      const frondCount = 12;
      for (let f = 0; f < frondCount; f++) {
        const fAng = (f * Math.PI * 2) / frondCount;
        const frondPts = [
          [crownHead[0], crownHead[1], crownHead[2]],
          [crownHead[0] + 0.7 * Math.cos(fAng), crownHead[1] + 0.35, crownHead[2] + 0.7 * Math.sin(fAng)],
          [crownHead[0] + 1.5 * Math.cos(fAng), crownHead[1] + 0.2, crownHead[2] + 1.5 * Math.sin(fAng)],
          [crownHead[0] + 2.1 * Math.cos(fAng), crownHead[1] - 0.45, crownHead[2] + 2.1 * Math.sin(fAng)]
        ];
        const frondStemGeo = pipeAlongPath(frondPts, 0.032, { radialSegments: 6 });
        createPart('PalmFrond_' + side + '_' + pIdx + '_' + f, frondStemGeo, palmGreen, { parent: terraceGroup });
        // Cascading feathered leaflets along frond
        for (let leaf = 1; leaf <= 3; leaf++) {
          const frac = leaf / 3.5;
          const lx = crownHead[0] + (0.7 + frac * 1.3) * Math.cos(fAng);
          const ly = crownHead[1] + 0.3 - frac * 0.6;
          const lz = crownHead[2] + (0.7 + frac * 1.3) * Math.sin(fAng);
          createPart('PalmLeaflet_' + side + '_' + pIdx + '_' + f + '_' + leaf, boxGeo(0.18, 0.02, 0.75 - frac * 0.15), lightGreen, {
            position: [lx, ly, lz],
            rotation: [18 * Math.sin(fAng) + 12, (-fAng * 180) / Math.PI + (leaf % 2 === 0 ? 25 : -25), 20],
            parent: terraceGroup
          });
        }
      }
    });

    // Conical Cypress / Topiary Evergreens (3 per terrace)
    [-6.2, 0, 6.2].forEach((cx, cIdx) => {
      createPart('Cypress_' + side + '_' + cIdx, cypressGeo, deepGreen, {
        position: [cx, 1.9 + 1.4, tz],
        parent: terraceGroup
      });
      // Tiered copper ring base for topiary
      createPart('CypressRing_' + side + '_' + cIdx, torusGeo(0.68, 0.04, 6, 16), copper, {
        position: [cx, 1.95, tz],
        rotation: [90, 0, 0],
        parent: terraceGroup
      });
    });

    // Layered Tropical Bushes & Flowers between trees
    [-2.2, -1.1, 1.1, 2.2].forEach((bx, bIdx) => {
      createPart('Bush_' + side + '_' + bIdx, bushBlobGeo, (bIdx % 2 === 0 ? deepGreen : lightGreen), {
        position: [bx, 2.2, tz + (bIdx % 2 === 0 ? 0.3 : -0.3)],
        scale: [1.2, 1.0, 1.2],
        parent: terraceGroup
      });
      // Bright tropical blossoms dotted on the bushes
      createPart('Flowers_' + side + '_' + bIdx, sphereGeo(0.22, 6, 5), (bIdx % 3 === 0 ? flowerPink : (bIdx % 3 === 1 ? flowerGold : flowerWhite)), {
        position: [bx, 2.55, tz + (bIdx % 2 === 0 ? 0.3 : -0.3)],
        parent: terraceGroup
      });
    });
  }

  // Art Deco Copper Balustrades along Front & Back Terrace Walkways
  for (const fSide of [-1, 1]) {
    const bx = fSide * 7.5;
    // Top handrail
    createPart('BalustradeRail_' + fSide, boxGeo(0.1, 0.06, 9.2), copper, {
      position: [bx, 2.35, 0],
      parent: terraceGroup
    });
    // Bottom rail
    createPart('BalustradeBase_' + fSide, boxGeo(0.08, 0.04, 9.2), copperDark, {
      position: [bx, 1.72, 0],
      parent: terraceGroup
    });
    // Posts & Art Deco Geometric Balusters
    for (let p = -4; p <= 4; p++) {
      const bz = p * 1.1;
      createPart('BalustradePost_' + fSide + '_' + p, boxGeo(0.09, 0.65, 0.09), copper, {
        position: [bx, 2.02, bz],
        parent: terraceGroup
      });
      if (p < 4) {
        // Central vertical mullion connecting base and rail
        createPart('BalustradeMullion_' + fSide + '_' + p, boxGeo(0.05, 0.63, 0.05), copperDark, {
          position: [bx, 2.03, bz + 0.55],
          parent: terraceGroup
        });
        // Art Deco Diamond Medallion overlapping the central mullion
        createPart('BalustradeDiamond_' + fSide + '_' + p, boxGeo(0.07, 0.32, 0.32), goldAccent, {
          position: [bx, 2.03, bz + 0.55],
          rotation: [0, 0, 45],
          parent: terraceGroup
        });
      }
    }
  }

  // ==========================================
  // 3. MAIN CONSERVATORY PAVILION & WINGS (Y = 1.6m to 6.6m)
  // ==========================================
  const pavilionGroup = createPivot('PavilionGroup', [0, 0, 0], root);

  // Central Rotunda Base Wall / Sill (Octagonal, radius 4.3m, height 0.6m)
  const octSegments = 16;
  for (let i = 0; i < octSegments; i++) {
    const ang1 = (i * Math.PI * 2) / octSegments;
    const ang2 = ((i + 1) * Math.PI * 2) / octSegments;
    const midAng = (ang1 + ang2) / 2;
    const segWidth = 2 * 4.3 * Math.sin(Math.PI / octSegments);
    const rad = 4.3 * Math.cos(Math.PI / octSegments);
    const mx = rad * Math.cos(midAng);
    const mz = rad * Math.sin(midAng);
    const rotYDeg = (-midAng * 180) / Math.PI + 90;

    // Stone base panel under windows
    createPart('SillPanel_' + i, boxGeo(segWidth + 0.05, 0.6, 0.25), stoneTrim, {
      position: [mx, 1.9, mz],
      rotation: [0, rotYDeg, 0],
      parent: pavilionGroup
    });
    // Copper sill trim
    createPart('SillCopper_' + i, boxGeo(segWidth + 0.08, 0.06, 0.28), copper, {
      position: [mx, 2.22, mz],
      rotation: [0, rotYDeg, 0],
      parent: pavilionGroup
    });

    // Tall Glazed Windows (omit at front entrance door bay)
    const isDoorBay = (i === 0 || i === octSegments - 1);
    if (!isDoorBay) {
      createPart('WindowGlass_' + i, boxGeo(segWidth - 0.18, 3.8, 0.04), glass, {
        position: [mx, 4.15, mz],
        rotation: [0, rotYDeg, 0],
        parent: pavilionGroup
      });
      // Horizontal copper transoms dividing window panes
      createPart('WindowTransom1_' + i, boxGeo(segWidth, 0.05, 0.08), copper, {
        position: [mx, 3.4, mz],
        rotation: [0, rotYDeg, 0],
        parent: pavilionGroup
      });
      createPart('WindowTransom2_' + i, boxGeo(segWidth, 0.05, 0.08), copper, {
        position: [mx, 4.8, mz],
        rotation: [0, rotYDeg, 0],
        parent: pavilionGroup
      });
    }

    // Vertical Fluted Copper Columns / Mullions at each vertex
    const vx = 4.35 * Math.cos(ang1);
    const vz = 4.35 * Math.sin(ang1);
    createPart('RotundaMullion_' + i, boxGeo(0.2, 4.3, 0.2), copper, {
      position: [vx, 4.25, vz],
      rotation: [0, (-ang1 * 180) / Math.PI, 0],
      parent: pavilionGroup
    });
    // Tiered Art Deco Capital on column
    createPart('MullionCap1_' + i, boxGeo(0.28, 0.12, 0.28), copperDark, {
      position: [vx, 6.42, vz],
      rotation: [0, (-ang1 * 180) / Math.PI, 0],
      parent: pavilionGroup
    });
    createPart('MullionCap2_' + i, boxGeo(0.24, 0.08, 0.24), goldAccent, {
      position: [vx, 6.52, vz],
      rotation: [0, (-ang1 * 180) / Math.PI, 0],
      parent: pavilionGroup
    });
  }

  // Symmetrical East & West Glass Wings (Terraced glass galleries: Z = ±3.8m to ±6.8m, X = -2.8m to +2.8m)
  for (const side of [-1, 1]) {
    const wz = side * 5.3;
    // Wing end wall glass & frames
    createPart('WingGlassSide_' + side, boxGeo(5.2, 3.2, 0.04), glass, {
      position: [0, 3.4, side * 6.8],
      parent: pavilionGroup
    });
    // Wing mullions
    for (let wx = -2; wx <= 2; wx++) {
      createPart('WingMullion_' + side + '_' + wx, boxGeo(0.12, 3.2, 0.14), copper, {
        position: [wx * 1.2, 3.4, side * 6.8],
        parent: pavilionGroup
      });
    }
    // Sloped copper glass wing roof
    createPart('WingRoofGlass_' + side, boxGeo(5.4, 0.04, 2.8), glass, {
      position: [0, 5.2, side * 5.4],
      rotation: [side * 18, 0, 0],
      parent: pavilionGroup
    });
    // Roof copper rafters
    for (let rx = -2; rx <= 2; rx++) {
      createPart('WingRafter_' + side + '_' + rx, boxGeo(0.08, 0.12, 2.9), copper, {
        position: [rx * 1.2, 5.24, side * 5.4],
        rotation: [side * 18, 0, 0],
        parent: pavilionGroup
      });
    }
    // Wing ridge cornice
    createPart('WingCornice_' + side, boxGeo(5.6, 0.16, 0.22), copperDark, {
      position: [0, 5.65, side * 4.1],
      parent: pavilionGroup
    });
  }

  // ==========================================
  // 4. ART DECO GRAND ENTRANCE PORTAL (Facing +X)
  // ==========================================
  const portalGroup = createPivot('PortalGroup', [4.3, 1.6, 0], root);

  // Stepped Portal Jambs / Columns in Copper
  for (const pSide of [-1, 1]) {
    // Outer fluted pylon
    createPart('PortalPylonOuter_' + pSide, boxGeo(0.4, 4.4, 0.35), copper, {
      position: [0.15, 2.2, pSide * 1.6],
      parent: portalGroup
    });
    // Inner stepped jamb
    createPart('PortalPylonInner_' + pSide, boxGeo(0.35, 4.0, 0.25), copperDark, {
      position: [0.2, 2.0, pSide * 1.25],
      parent: portalGroup
    });
    // Art Deco Tiered Capital
    createPart('PortalCap_' + pSide, boxGeo(0.48, 0.18, 0.42), goldAccent, {
      position: [0.15, 4.45, pSide * 1.6],
      parent: portalGroup
    });
  }

  // Grand Tiered Entablature & Lintel
  createPart('PortalLintel1', boxGeo(0.42, 0.22, 3.5), copperDark, {
    position: [0.18, 4.0, 0],
    parent: portalGroup
  });
  createPart('PortalLintel2', boxGeo(0.48, 0.26, 3.8), copper, {
    position: [0.15, 4.3, 0],
    parent: portalGroup
  });
  createPart('PortalLintel3', boxGeo(0.54, 0.18, 4.0), copperPatina, {
    position: [0.12, 4.54, 0],
    parent: portalGroup
  });

  // Projecting Art Deco Marquee / Canopy
  createPart('CanopySlab', boxGeo(1.4, 0.12, 3.6), copper, {
    position: [0.8, 3.9, 0],
    parent: portalGroup
  });
  createPart('CanopyFascia', boxGeo(1.44, 0.08, 3.64), goldAccent, {
    position: [0.8, 3.98, 0],
    parent: portalGroup
  });

  // Radiant Art Deco Sunburst Pediment above Entrance
  // Central golden half-sun medallion
  createPart('SunburstMedallion', cylinderGeo(0.5, 0.5, 0.12, 16), goldAccent, {
    position: [0.22, 4.65, 0],
    rotation: [0, 0, 90],
    parent: portalGroup
  });
  // Radiating copper sun rays
  const sunRays = 9;
  for (let r = 0; r < sunRays; r++) {
    const rayAngDeg = -60 + r * 15;
    const rayRad = (rayAngDeg * Math.PI) / 180;
    createPart('SunRay_' + r, boxGeo(0.04, 0.75, 0.06), (r % 2 === 0 ? copper : goldAccent), {
      position: [0.24, 4.65 + 0.65 * Math.cos(rayRad), 0.65 * Math.sin(rayRad)],
      rotation: [0, 0, -rayAngDeg],
      parent: portalGroup
    });
  }

  // Glazed Double Doors with Art Deco Copper Grilles
  for (const dSide of [-1, 1]) {
    // Glass door leaf
    createPart('DoorGlass_' + dSide, boxGeo(0.06, 2.8, 0.85), glass, {
      position: [0.1, 1.4, dSide * 0.48],
      parent: portalGroup
    });
    // Copper door frame
    createPart('DoorFrameTop_' + dSide, boxGeo(0.09, 0.12, 0.92), copperDark, {
      position: [0.1, 2.8, dSide * 0.48],
      parent: portalGroup
    });
    createPart('DoorFrameBot_' + dSide, boxGeo(0.09, 0.28, 0.92), copperDark, {
      position: [0.1, 0.14, dSide * 0.48],
      parent: portalGroup
    });
    // Art Deco Geometric Grille (chevron & diagonal bars)
    createPart('DoorGrilleMid_' + dSide, boxGeo(0.08, 0.08, 0.85), goldAccent, {
      position: [0.11, 1.4, dSide * 0.48],
      parent: portalGroup
    });
    createPart('DoorGrilleBar1_' + dSide, boxGeo(0.05, 1.1, 0.04), copper, {
      position: [0.11, 2.0, dSide * 0.48 + 0.2],
      rotation: [22, 0, 0],
      parent: portalGroup
    });
    createPart('DoorGrilleBar2_' + dSide, boxGeo(0.05, 1.1, 0.04), copper, {
      position: [0.11, 2.0, dSide * 0.48 - 0.2],
      rotation: [-22, 0, 0],
      parent: portalGroup
    });
    // Sleek vertical copper push handle
    createPart('DoorHandle_' + dSide, cylinderGeo(0.025, 0.025, 0.7, 8), goldAccent, {
      position: [0.16, 1.35, dSide * 0.12],
      parent: portalGroup
    });
  }

  // ==========================================
  // 5. UPPER FRIEZE & CLERESTORY DRUM (Y = 6.4m to 7.5m)
  // ==========================================
  const drumGroup = createPivot('DrumGroup', [0, 0, 0], root);

  // Main Art Deco Entablature Frieze Rings (Hollow open rings so interior is visible!)
  createPart('MainFriezeBase', torusGeo(4.34, 0.1, 8, 32), copperDark, {
    position: [0, 6.55, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });
  createPart('MainFriezePatina', torusGeo(4.35, 0.11, 8, 32), copperPatina, {
    position: [0, 6.72, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });
  createPart('MainCornice', torusGeo(4.4, 0.12, 8, 32), copper, {
    position: [0, 6.88, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });

  // Clerestory Drum: 16 perimeter posts and glass windows (completely hollow atrium inside!)
  for (let c = 0; c < 16; c++) {
    const cAng = (c * Math.PI * 2) / 16;
    const cx = 4.25 * Math.cos(cAng);
    const cz = 4.25 * Math.sin(cAng);
    const rotDeg = (-cAng * 180) / Math.PI + 90;
    // Structural copper post between clerestory windows
    createPart('ClerestoryPost_' + c, boxGeo(0.12, 0.6, 0.16), copperDark, {
      position: [cx, 7.22, cz],
      rotation: [0, rotDeg, 0],
      parent: drumGroup
    });
    // Arched clerestory window pane
    createPart('ClerestoryWindow_' + c, boxGeo(0.7, 0.44, 0.04), glass, {
      position: [cx, 7.22, cz],
      rotation: [0, rotDeg, 0],
      parent: drumGroup
    });
    createPart('ClerestoryArch_' + c, torusGeo(0.35, 0.03, 6, 12), copper, {
      position: [cx, 7.42, cz],
      rotation: [0, rotDeg, 0],
      parent: drumGroup
    });
  }

  // Stepped Dome Base Rings / Collars (Hollow open rings supporting the dome)
  createPart('DomeBaseRing1', torusGeo(4.3, 0.1, 8, 32), copper, {
    position: [0, 7.55, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });
  createPart('DomeBaseRing2', torusGeo(4.22, 0.08, 8, 32), copperPatina, {
    position: [0, 7.66, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });
  createPart('DomeBaseRing3', torusGeo(4.16, 0.06, 8, 32), goldAccent, {
    position: [0, 7.74, 0],
    rotation: [90, 0, 0],
    parent: drumGroup
  });

  // ==========================================
  // 6. THE RIBBED GLASS DOME (Y = 7.7m to 11.4m)
  // ==========================================
  const domeGroup = createPivot('DomeGroup', [0, 7.7, 0], root);

  const domeRadius = 4.15;
  const domeHeight = 3.65;

  // Translucent Glass Dome Shell
  const domeGlassGeo = parametricSurface((u, v) => {
    const phi = v * (Math.PI * 0.48);
    const r = domeRadius * Math.cos(phi);
    const y = domeHeight * Math.sin(phi);
    return [r * Math.cos(u), y, r * Math.sin(u)];
  }, { u: [0, Math.PI * 2], v: [0.03, 0.98], uSegments: 32, vSegments: 16 });

  createPart('DomeGlassShell', domeGlassGeo, glass, {
    position: [0, 0, 0],
    parent: domeGroup
  });

  // 16 Curved Copper Structural Meridian Ribs
  const ribCount = 16;
  const ribSteps = 16;
  const ribCurvePts = [];
  for (let s = 0; s <= ribSteps; s++) {
    const t = s / ribSteps;
    const phi = t * (Math.PI * 0.48);
    // Project 0.05m outward from the glass so the ribs stand out boldly
    const r = domeRadius * Math.cos(phi) + 0.05;
    const y = domeHeight * Math.sin(phi);
    ribCurvePts.push([r, y, 0]);
  }
  const ribBeamGeo = pipeAlongPath(ribCurvePts, 0.055, { radialSegments: 8 });

  for (let i = 0; i < ribCount; i++) {
    const ribDeg = (i * 360) / ribCount;
    // The structural arch rib
    createPart('DomeRib_' + i, ribBeamGeo, copper, {
      position: [0, 0, 0],
      rotation: [0, ribDeg, 0],
      parent: domeGroup
    });

    // Decorative Art Deco stepped copper corbel at the base of each rib
    const baseAng = (i * Math.PI * 2) / ribCount;
    createPart('RibCorbel_' + i, boxGeo(0.18, 0.28, 0.16), copperDark, {
      position: [4.24 * Math.cos(baseAng), 0.1, 4.24 * Math.sin(baseAng)],
      rotation: [0, (-baseAng * 180) / Math.PI, 0],
      parent: domeGroup
    });
  }

  // 3 Concentric Horizontal Copper Glazing Rings (Purlins)
  const ringParams = [
    { phiFrac: 0.24, tube: 0.045 },
    { phiFrac: 0.52, tube: 0.04 },
    { phiFrac: 0.78, tube: 0.035 }
  ];
  ringParams.forEach((rp, rIdx) => {
    const phi = rp.phiFrac * (Math.PI * 0.48);
    const r = domeRadius * Math.cos(phi) + 0.045;
    const y = domeHeight * Math.sin(phi);
    createPart('DomeRing_' + rIdx, torusGeo(r, rp.tube, 8, 32), copper, {
      position: [0, y, 0],
      rotation: [90, 0, 0],
      parent: domeGroup
    });
  });

  // ==========================================
  // 7. APEX LANTERN & ART DECO SPIRE (Y = 11.3m to 16.0m)
  // ==========================================
  const lanternGroup = createPivot('LanternGroup', [0, 7.7 + domeHeight * Math.sin(Math.PI * 0.48), 0], root);

  // Lantern Base Ring Collar
  createPart('LanternBaseCollar', cylinderGeo(1.05, 1.25, 0.16, 16), copperDark, {
    position: [0, 0.08, 0],
    parent: lanternGroup
  });

  // Octagonal Glazed Lantern Cupola (height 0.9m)
  createPart('LanternGlassCore', cylinderGeo(0.9, 0.9, 0.85, 16), glass, {
    position: [0, 0.56, 0],
    parent: lanternGroup
  });
  // 8 Vertical Copper Lantern Struts
  for (let l = 0; l < 8; l++) {
    const lAng = (l * Math.PI * 2) / 8;
    createPart('LanternStrut_' + l, boxGeo(0.1, 0.9, 0.12), copper, {
      position: [0.92 * Math.cos(lAng), 0.56, 0.92 * Math.sin(lAng)],
      rotation: [0, (-lAng * 180) / Math.PI, 0],
      parent: lanternGroup
    });
  }
  // Lantern Cornice
  createPart('LanternCornice', cylinderGeo(1.1, 0.98, 0.14, 16), copper, {
    position: [0, 1.05, 0],
    parent: lanternGroup
  });

  // Stepped Ziggurat Art Deco Crown (3 stepped copper tiers)
  createPart('CrownTier1', cylinderGeo(0.85, 1.02, 0.22, 16), copperPatina, {
    position: [0, 1.22, 0],
    parent: lanternGroup
  });
  createPart('CrownTier2', cylinderGeo(0.62, 0.82, 0.22, 16), copper, {
    position: [0, 1.42, 0],
    parent: lanternGroup
  });
  createPart('CrownTier3', cylinderGeo(0.42, 0.6, 0.22, 16), goldAccent, {
    position: [0, 1.62, 0],
    parent: lanternGroup
  });

  // 8 Radiating Art Deco Fin Blades / Sunburst Crown Crests (4 cardinal + 4 intercardinal)
  for (let k = 0; k < 8; k++) {
    const kDeg = k * 45;
    const isCardinal = (k % 2 === 0);
    createPart('SpireFin_' + k, boxGeo(0.04, isCardinal ? 0.95 : 0.7, isCardinal ? 0.72 : 0.52), (isCardinal ? copper : goldAccent), {
      position: [0, 1.8, 0],
      rotation: [0, kDeg, 0],
      parent: lanternGroup
    });
  }

  // Tapered Needle Spire (Reaching up to Y = 16.0m)
  createPart('SpireShaft', coneGeo(0.18, 2.2, 12), copper, {
    position: [0, 2.6, 0],
    parent: lanternGroup
  });
  createPart('SpireNeedle', coneGeo(0.04, 1.2, 8), goldAccent, {
    position: [0, 4.0, 0],
    parent: lanternGroup
  });
  createPart('SpireFinialOrb', sphereGeo(0.14, 8, 8), goldAccent, {
    position: [0, 4.65, 0],
    parent: lanternGroup
  });
  createPart('SpireTip', coneGeo(0.015, 0.5, 6), copper, {
    position: [0, 4.95, 0],
    parent: lanternGroup
  });

  // ==========================================
  // 8. INTERIOR BOTANICAL CONSERVATORY FEATURES (Visible through glass!)
  // ==========================================
  const interiorGroup = createPivot('InteriorGroup', [0, 1.6, 0], root);

  // Conservatory Interior Tiled Floor
  createPart('InteriorFloor', cylinderGeo(4.1, 4.1, 0.1, 24), stonePaver, {
    position: [0, 0.05, 0],
    parent: interiorGroup
  });

  // Central Raised Planter Bed (Circular with stepped copper rim)
  createPart('CentralPlanterWall', cylinderGeo(1.8, 1.9, 0.45, 20), stoneTrim, {
    position: [0, 0.25, 0],
    parent: interiorGroup
  });
  createPart('CentralPlanterRim', torusGeo(1.82, 0.06, 6, 24), copper, {
    position: [0, 0.48, 0],
    rotation: [90, 0, 0],
    parent: interiorGroup
  });
  createPart('CentralPlanterSoil', cylinderGeo(1.75, 1.75, 0.1, 20), soil, {
    position: [0, 0.42, 0],
    parent: interiorGroup
  });

  // Majestic Giant Interior Palm Tree (rising up into the glass dome!)
  const intTrunkPts = [
    [0, 0.45, 0],
    [0.15, 2.0, -0.1],
    [0.1, 4.2, 0.15],
    [-0.1, 6.2, 0.05]
  ];
  const intTrunkGeo = pipeAlongPath(intTrunkPts, 0.18, { radialSegments: 10 });
  createPart('InteriorTreeTrunk', intTrunkGeo, trunkMat, { parent: interiorGroup });

  // Spreading Tropical Palm Canopy under the dome
  const intHead = [-0.1, 6.2, 0.05];
  const intFrondCount = 14;
  for (let j = 0; j < intFrondCount; j++) {
    const jAng = (j * Math.PI * 2) / intFrondCount;
    const jPts = [
      [intHead[0], intHead[1], intHead[2]],
      [intHead[0] + 1.1 * Math.cos(jAng), intHead[1] + 0.6, intHead[2] + 1.1 * Math.sin(jAng)],
      [intHead[0] + 2.2 * Math.cos(jAng), intHead[1] + 0.3, intHead[2] + 2.2 * Math.sin(jAng)],
      [intHead[0] + 2.9 * Math.cos(jAng), intHead[1] - 0.7, intHead[2] + 2.9 * Math.sin(jAng)]
    ];
    const jFrondGeo = pipeAlongPath(jPts, 0.038, { radialSegments: 6 });
    createPart('InteriorFrond_' + j, jFrondGeo, palmGreen, { parent: interiorGroup });
    createPart('InteriorFrondLeaf_' + j, boxGeo(0.7, 0.04, 1.6), lightGreen, {
      position: [intHead[0] + 1.8 * Math.cos(jAng), intHead[1] + 0.35, intHead[2] + 1.8 * Math.sin(jAng)],
      rotation: [12 * Math.sin(jAng), (-jAng * 180) / Math.PI, 20],
      parent: interiorGroup
    });
  }

  // Understory Exotic Flora (Monsteras & Ferns) in Central Planter
  for (let u = 0; u < 6; u++) {
    const uAng = (u * Math.PI * 2) / 6;
    createPart('InteriorFern_' + u, sphereGeo(0.45, 6, 6), deepGreen, {
      position: [1.1 * Math.cos(uAng), 0.7, 1.1 * Math.sin(uAng)],
      scale: [1.2, 0.8, 1.2],
      parent: interiorGroup
    });
    createPart('InteriorOrchid_' + u, sphereGeo(0.18, 5, 5), (u % 2 === 0 ? flowerPink : flowerGold), {
      position: [1.1 * Math.cos(uAng), 0.95, 1.1 * Math.sin(uAng)],
      parent: interiorGroup
    });
  }

  return root;
}
