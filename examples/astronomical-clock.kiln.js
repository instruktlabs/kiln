// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'AstronomicalClock', category: 'prop' };

function build() {
  const root = createRoot('AstronomicalClock');

  // --- Shared Materials ---
  const stoneLight = gameMaterial(0xa09a8f, { roughness: 0.85, metalness: 0.04 });
  const stoneMid = gameMaterial(0x7e786e, { roughness: 0.88, metalness: 0.05 });
  const stoneDark = gameMaterial(0x48443e, { roughness: 0.92, metalness: 0.06 });
  const stoneRoof = gameMaterial(0x3e4244, { roughness: 0.8, metalness: 0.1 }); // slate roofing
  const gilt = gameMaterial(0xdfb43a, { roughness: 0.32, metalness: 0.88 }); // polished gold leaf
  const brass = gameMaterial(0xba8f30, { roughness: 0.38, metalness: 0.82 });
  const dialBlue = gameMaterial(0x13274e, { roughness: 0.42, metalness: 0.18 }); // deep lapis/cobalt
  const dialDark = gameMaterial(0x0a1426, { roughness: 0.5, metalness: 0.15 }); // night horizon
  const dialEarth = gameMaterial(0x2d4838, { roughness: 0.6, metalness: 0.1 }); // terra centrum
  const iron = gameMaterial(0x1f2024, { roughness: 0.68, metalness: 0.72 }); // wrought iron
  const moonLight = gameMaterial(0xe8e5db, { roughness: 0.35, metalness: 0.35 });
  const moonDark = gameMaterial(0x151618, { roughness: 0.75, metalness: 0.2 });

  // =========================================================================
  // 1. PLINTH & FOUNDATION (sitting firmly on Y=0)
  // =========================================================================
  createPart('PlinthStep1', boxGeo(1.0, 0.25, 3.4), stoneDark, {
    position: [-0.15, 0.125, 0],
    parent: root
  });
  createPart('PlinthStep2', boxGeo(0.92, 0.2, 3.2), stoneMid, {
    position: [-0.15, 0.35, 0],
    parent: root
  });
  createPart('PlinthMoulding', boxGeo(0.86, 0.1, 3.08), stoneLight, {
    position: [-0.13, 0.5, 0],
    parent: root
  });

  for (const side of [-1, 1]) {
    createPart(`PlinthButtress_${side}`, boxGeo(0.96, 0.48, 0.36), stoneDark, {
      position: [-0.15, 0.24, side * 1.55],
      parent: root
    });
  }

  createPart('TowerBackWall', boxGeo(0.5, 5.0, 2.9), stoneDark, {
    position: [-0.4, 3.05, 0],
    parent: root
  });
  createPart('TowerBackGable', boxGeo(0.48, 1.4, 2.7), stoneDark, {
    position: [-0.38, 6.2, 0],
    parent: root
  });

  // =========================================================================
  // 2. LOWER NICHE: CLOCKWORK & PENDULUM CHAMBER (Y = 0.55 to 2.3)
  // =========================================================================
  createPart('ChamberBack', boxGeo(0.1, 1.694, 1.5), stoneDark, {
    position: [-0.22, 1.451, 0],
    parent: root
  });
  createPart('ChamberFloor', boxGeo(0.4, 0.08, 1.5), stoneMid, {
    position: [-0.05, 0.58, 0],
    parent: root
  });
  createPart('ChamberWallLeft', boxGeo(0.45, 1.696, 0.3), stoneMid, {
    position: [-0.05, 1.45, -0.85],
    parent: root
  });
  createPart('ChamberWallRight', boxGeo(0.45, 1.696, 0.3), stoneMid, {
    position: [-0.05, 1.45, 0.85],
    parent: root
  });

  for (const side of [-1, 1]) {
    createPart(`NicheJamb_${side}`, boxGeo(0.12, 1.3, 0.14), stoneLight, {
      position: [0.12, 1.25, side * 0.7],
      parent: root
    });
    createPart(`NicheJambCap_${side}`, boxGeo(0.16, 0.08, 0.18), stoneLight, {
      position: [0.12, 1.94, side * 0.7],
      parent: root
    });
  }
  createPart('NicheLintel', boxGeo(0.18, 0.18, 1.6), stoneLight, {
    position: [0.11, 2.05, 0],
    parent: root
  });
  createPart('NicheKeystone', boxGeo(0.22, 0.24, 0.16), stoneLight, {
    position: [0.13, 2.08, 0],
    parent: root
  });

  // Clockwork Mechanism inside chamber
  createPart('GearBigDisc', cylinderXGeo(0.32, 0.32, 0.03, 16), brass, {
    position: [-0.15, 1.65, 0.25],
    parent: root
  });
  createPart('GearBigRim', torusGeo(0.32, 0.015, 6, 20), gilt, {
    position: [-0.15, 1.65, 0.25],
    rotation: [0, 90, 0],
    parent: root
  });
  for (let t = 0; t < 12; t++) {
    const tAng = (t / 12) * Math.PI * 2;
    createPart(`GearBigTooth_${t}`, boxGeo(0.03, 0.06, 0.03), brass, {
      position: [-0.15, 1.65 + Math.cos(tAng) * 0.33, 0.25 + Math.sin(tAng) * 0.33],
      rotation: [0, 0, -(tAng * 180 / Math.PI)],
      parent: root
    });
  }

  createPart('GearPinionDisc', cylinderXGeo(0.14, 0.14, 0.04, 12), iron, {
    position: [-0.13, 1.65, -0.22],
    parent: root
  });
  for (let p = 0; p < 8; p++) {
    const pAng = (p / 8) * Math.PI * 2;
    createPart(`GearPinTooth_${p}`, boxGeo(0.04, 0.04, 0.025), iron, {
      position: [-0.13, 1.65 + Math.cos(pAng) * 0.15, -0.22 + Math.sin(pAng) * 0.15],
      rotation: [0, 0, -(pAng * 180 / Math.PI)],
      parent: root
    });
  }

  createPart('GearArborBig', cylinderXGeo(0.03, 0.03, 0.18, 8), iron, {
    position: [-0.14, 1.65, 0.25],
    parent: root
  });
  createPart('GearArborSmall', cylinderXGeo(0.025, 0.025, 0.18, 8), iron, {
    position: [-0.13, 1.65, -0.22],
    parent: root
  });
  // The movement frame, bolted to the back wall rather than standing 30 mm in
  // front of it. The wall face is at x = -0.15 and these uprights were centred
  // at -0.10, which left the left-hand one touching nothing at all -- the right
  // one only escaped the warning because a gear arbor happened to reach it.
  // At -0.14 both bite 10 mm into the stone, which is where a clock frame is
  // actually fixed.
  createPart('FrameStrutLeft', boxGeo(0.04, 1.2, 0.04), iron, {
    position: [-0.14, 1.45, -0.45],
    parent: root
  });
  createPart('FrameStrutRight', boxGeo(0.04, 1.2, 0.04), iron, {
    position: [-0.14, 1.45, 0.45],
    parent: root
  });

  // PENDULUM ASSEMBLY (Lifted cleanly above the chamber floor)
  const pendulumPivot = createPivot('Pendulum', [0.02, 2.15, 0], root);
  createPart('SuspensionBlock', boxGeo(0.06, 0.08, 0.08), iron, {
    position: [0, 0, 0],
    parent: pendulumPivot
  });
  createPart('PendulumRod', cylinderGeo(0.014, 0.014, 1.2, 8), iron, {
    position: [0, -0.6, 0],
    parent: pendulumPivot
  });
  createPart('PendulumBobLens', cylinderXGeo(0.24, 0.24, 0.05, 20), brass, {
    position: [0, -1.12, 0],
    parent: pendulumPivot
  });
  createPart('PendulumBobRim', torusGeo(0.24, 0.02, 6, 20), gilt, {
    position: [0, -1.12, 0],
    rotation: [0, 90, 0],
    parent: pendulumPivot
  });
  createPart('PendulumBobCenter', sphereGeo(0.07, 10, 8), gilt, {
    position: [0.028, -1.12, 0],
    parent: pendulumPivot
  });
  createPart('PendulumRatingNut', cylinderGeo(0.022, 0.022, 0.08, 8), brass, {
    position: [0, -1.28, 0],
    parent: pendulumPivot
  });

  // =========================================================================
  // 3. MAIN STONE SURROUND & FLANKING PILASTERS (Y = 2.1 to 5.3)
  // =========================================================================
  const dialCenterY = 3.8;
  const dialRadius = 1.22;

  createPart('MidCornice', boxGeo(0.72, 0.16, 3.0), stoneLight, {
    position: [-0.08, 2.22, 0],
    parent: root
  });

  createPart('DialSurroundWall', boxGeo(0.3, 2.9, 2.8), stoneMid, {
    position: [-0.15, dialCenterY, 0],
    parent: root
  });

  for (const side of [-1, 1]) {
    const z = side * 1.4;
    createPart(`PilasterPlinth_${side}`, boxGeo(0.5, 0.35, 0.38), stoneDark, {
      position: [-0.02, 2.45, z],
      parent: root
    });
    createPart(`PilasterBaseMould_${side}`, boxGeo(0.46, 0.12, 0.34), stoneLight, {
      position: [0.01, 2.68, z],
      parent: root
    });
    createPart(`PilasterShaft_${side}`, cylinderGeo(0.14, 0.15, 2.25, 12), stoneLight, {
      position: [0.06, 3.85, z],
      parent: root
    });
    for (let f = -2; f <= 2; f++) {
      const fAng = (f * 25) * Math.PI / 180;
      createPart(`Flute_${side}_${f}`, boxGeo(0.02, 2.15, 0.02), stoneDark, {
        position: [0.06 + Math.cos(fAng) * 0.14, 3.85, z + Math.sin(fAng) * 0.14],
        parent: root
      });
    }
    createPart(`PilasterCapitalMould_${side}`, boxGeo(0.42, 0.12, 0.36), stoneLight, {
      position: [0.03, 5.03, z],
      parent: root
    });
    createPart(`PilasterAbacus_${side}`, boxGeo(0.48, 0.12, 0.42), stoneDark, {
      position: [0.02, 5.15, z],
      parent: root
    });
  }

  createPart('ArchivoltOuter', torusGeo(1.36, 0.07, 6, 24), stoneLight, {
    position: [0.02, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('ArchivoltInner', torusGeo(1.26, 0.04, 6, 24), stoneDark, {
    position: [0.03, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });

  const spandrelR = 1.32;
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      createPart(`SpandrelBoss_${sy}_${sz}`, cylinderXGeo(0.08, 0.08, 0.04, 10), gilt, {
        position: [0.04, dialCenterY + sy * spandrelR * 0.72, sz * spandrelR * 0.72],
        parent: root
      });
    }
  }

  // =========================================================================
  // 4. CANOPY, ENTABLATURE & GOTHIC PEDIMENT (Y = 5.2 to 6.8)
  // =========================================================================
  createPart('Architrave', boxGeo(0.56, 0.14, 3.2), stoneLight, {
    position: [0.02, 5.28, 0],
    parent: root
  });
  createPart('Frieze', boxGeo(0.52, 0.2, 3.12), stoneMid, {
    position: [0.01, 5.45, 0],
    parent: root
  });
  for (let c = -4; c <= 4; c++) {
    createPart(`Corbel_${c}`, boxGeo(0.18, 0.12, 0.08), stoneLight, {
      position: [0.15, 5.46, c * 0.35],
      parent: root
    });
  }
  createPart('CorniceBand', boxGeo(0.66, 0.14, 3.38), stoneLight, {
    position: [0.06, 5.62, 0],
    parent: root
  });

  createPart('TympanumWall', boxGeo(0.4, 0.9, 2.5), stoneMid, {
    position: [0.02, 6.1, 0],
    parent: root
  });
  createPart('TympanumSun', cylinderXGeo(0.2, 0.2, 0.04, 12), gilt, {
    position: [0.22, 6.1, 0],
    parent: root
  });
  for (let tr = 0; tr < 8; tr++) {
    const trAng = (tr / 8) * Math.PI * 2;
    createPart(`TympanumRay_${tr}`, coneGeo(0.04, 0.16, 5), gilt, {
      position: [0.23, 6.1 + Math.cos(trAng) * 0.26, Math.sin(trAng) * 0.26],
      rotation: [0, 0, (-tr * 45)],
      parent: root
    });
  }

  const rakeLength = 1.7;
  createPart('GableRakeLeft', boxGeo(0.5, 0.14, rakeLength), stoneLight, {
    position: [0.06, 6.15, -0.75],
    rotation: [36, 0, 0],
    parent: root
  });
  createPart('GableRakeRight', boxGeo(0.5, 0.14, rakeLength), stoneLight, {
    position: [0.06, 6.15, 0.75],
    rotation: [-36, 0, 0],
    parent: root
  });

  createPart('RoofSlopeLeft', boxGeo(0.46, 0.08, rakeLength), stoneRoof, {
    position: [-0.08, 6.16, -0.75],
    rotation: [36, 0, 0],
    parent: root
  });
  createPart('RoofSlopeRight', boxGeo(0.46, 0.08, rakeLength), stoneRoof, {
    position: [-0.08, 6.16, 0.75],
    rotation: [-36, 0, 0],
    parent: root
  });

  createPart('PinnacleApexBase', boxGeo(0.3, 0.2, 0.3), stoneLight, {
    position: [0.06, 6.7, 0],
    parent: root
  });
  createPart('PinnacleApexSpire', coneGeo(0.18, 0.65, 8), stoneLight, {
    position: [0.06, 7.1, 0],
    parent: root
  });
  createPart('ApexGiltCross', boxGeo(0.04, 0.22, 0.14), gilt, {
    position: [0.08, 7.45, 0],
    parent: root
  });

  for (const side of [-1, 1]) {
    const pz = side * 1.45;
    createPart(`PinnacleBase_${side}`, boxGeo(0.28, 0.3, 0.28), stoneLight, {
      position: [0.04, 5.8, pz],
      parent: root
    });
    createPart(`PinnacleShaft_${side}`, cylinderGeo(0.1, 0.12, 0.45, 8), stoneLight, {
      position: [0.04, 6.15, pz],
      parent: root
    });
    createPart(`PinnacleSpire_${side}`, coneGeo(0.13, 0.55, 8), stoneLight, {
      position: [0.04, 6.6, pz],
      parent: root
    });
    createPart(`PinnacleBall_${side}`, sphereGeo(0.06, 10, 8), gilt, {
      position: [0.04, 6.9, pz],
      parent: root
    });
  }

  // =========================================================================
  // 5. ASTRONOMICAL CLOCK FACE (Facing +X, normal along +X)
  // =========================================================================
  createPart('DialSkyDisc', cylinderXGeo(dialRadius, dialRadius, 0.035, 32), dialBlue, {
    position: [0.02, dialCenterY, 0],
    parent: root
  });
  createPart('DialHorizonDisc', cylinderXGeo(0.72, 0.72, 0.04, 24), dialDark, {
    position: [0.024, dialCenterY - 0.1, 0],
    parent: root
  });
  createPart('DialEarthDisc', cylinderXGeo(0.24, 0.24, 0.045, 16), dialEarth, {
    position: [0.028, dialCenterY, 0],
    parent: root
  });

  createPart('RingTropicCancer', torusGeo(1.18, 0.015, 6, 28), gilt, {
    position: [0.03, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('RingEquator', torusGeo(0.88, 0.012, 6, 24), gilt, {
    position: [0.03, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('RingTropicCapricorn', torusGeo(0.55, 0.012, 6, 24), gilt, {
    position: [0.03, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });

  createPart('DialOuterGiltBezel', torusGeo(dialRadius, 0.038, 8, 32), gilt, {
    position: [0.035, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('DialInnerGiltBezel', torusGeo(1.04, 0.024, 6, 28), gilt, {
    position: [0.035, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });

  for (let h = 0; h < 12; h++) {
    const hAngle = (h / 12) * Math.PI * 2;
    const hy = dialCenterY + Math.cos(hAngle) * 1.11;
    const hz = Math.sin(hAngle) * 1.11;
    const rotDeg = -h * 30;

    createPart(`HourCartouche_${h}`, cylinderXGeo(0.06, 0.06, 0.018, 10), gilt, {
      position: [0.038, hy, hz],
      parent: root
    });

    if (h === 0) {
      createPart('Num_XII_L', boxGeo(0.022, 0.07, 0.015), iron, {
        position: [0.048, hy, hz - 0.02],
        parent: root
      });
      createPart('Num_XII_R', boxGeo(0.022, 0.07, 0.015), iron, {
        position: [0.048, hy, hz + 0.02],
        parent: root
      });
    } else if (h === 3) {
      createPart('Num_III_1', boxGeo(0.022, 0.07, 0.012), iron, {
        position: [0.048, hy, hz - 0.02],
        parent: root
      });
      createPart('Num_III_2', boxGeo(0.022, 0.07, 0.012), iron, {
        position: [0.048, hy, hz + 0.02],
        parent: root
      });
    } else if (h === 6) {
      createPart('Num_VI_V', boxGeo(0.022, 0.07, 0.02), iron, {
        position: [0.048, hy, hz - 0.015],
        parent: root
      });
      createPart('Num_VI_I', boxGeo(0.022, 0.07, 0.012), iron, {
        position: [0.048, hy, hz + 0.02],
        parent: root
      });
    } else if (h === 9) {
      createPart('Num_IX_I', boxGeo(0.022, 0.07, 0.012), iron, {
        position: [0.048, hy, hz - 0.02],
        parent: root
      });
      createPart('Num_IX_X', boxGeo(0.022, 0.07, 0.02), iron, {
        position: [0.048, hy, hz + 0.015],
        parent: root
      });
    } else {
      createPart(`HourStud_${h}`, coneGeo(0.03, 0.035, 4), gilt, {
        position: [0.048, hy, hz],
        rotation: [0, 0, rotDeg + 45],
        parent: root
      });
    }
  }

  // =========================================================================
  // 6. INNER ROTATING ZODIAC RING (Eccentric Astrolabe Ecliptic Circle)
  // =========================================================================
  const zodiacCenterY = dialCenterY + 0.18;
  const zodiacCenterZ = -0.14;
  const zodiacR = 0.65;
  const zodiacBandWidth = 0.14;

  createPart('ZodiacOuterRim', torusGeo(zodiacR, 0.02, 6, 28), gilt, {
    position: [0.042, zodiacCenterY, zodiacCenterZ],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('ZodiacInnerRim', torusGeo(zodiacR - zodiacBandWidth, 0.016, 6, 24), brass, {
    position: [0.042, zodiacCenterY, zodiacCenterZ],
    rotation: [0, 90, 0],
    parent: root
  });

  for (let z = 0; z < 12; z++) {
    const zAng = (z / 12) * Math.PI * 2;
    const midRad = zodiacR - (zodiacBandWidth * 0.5);
    const zy = zodiacCenterY + Math.cos(zAng) * midRad;
    const zz = zodiacCenterZ + Math.sin(zAng) * midRad;
    const zRot = -z * 30;

    createPart(`ZodiacDivider_${z}`, boxGeo(0.018, zodiacBandWidth, 0.014), gilt, {
      position: [0.044, zy, zz],
      rotation: [0, 0, zRot],
      parent: root
    });

    const starAng = zAng + (Math.PI / 12);
    const starY = zodiacCenterY + Math.cos(starAng) * midRad;
    const starZ = zodiacCenterZ + Math.sin(starAng) * midRad;
    createPart(`ZodiacStar_${z}`, sphereGeo(0.022, 8, 6), gilt, {
      position: [0.046, starY, starZ],
      parent: root
    });
    createPart(`ZodiacPointer_${z}`, coneGeo(0.016, 0.07, 4), brass, {
      position: [0.044, zodiacCenterY + Math.cos(starAng) * (zodiacR + 0.035), zodiacCenterZ + Math.sin(starAng) * (zodiacR + 0.035)],
      rotation: [0, 0, -(starAng * 180 / Math.PI) - 90],
      parent: root
    });
  }

  // =========================================================================
  // 7. ARBOR, SUN HAND, MOON PHASE SPHERE & IRON HANDS
  // =========================================================================
  createPart('CenterArborBase', cylinderXGeo(0.14, 0.16, 0.06, 16), brass, {
    position: [0.05, dialCenterY, 0],
    parent: root
  });
  createPart('CenterArborBezel', torusGeo(0.14, 0.018, 6, 16), gilt, {
    position: [0.075, dialCenterY, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('CenterArborDome', sphereGeo(0.075, 10, 8), gilt, {
    position: [0.09, dialCenterY, 0],
    parent: root
  });

  const sunAngle = -Math.PI * 0.28;
  const sunPivot = createPivot('SunHand', [0.056, dialCenterY, 0], root);
  createPart('SunHandArm', boxGeo(0.022, 0.96, 0.026), gilt, {
    position: [0, 0.48 * Math.cos(sunAngle), 0.48 * Math.sin(sunAngle)],
    rotation: [0, 0, (sunAngle * 180 / Math.PI) + 90],
    parent: sunPivot
  });
  const sunDist = 0.94;
  const sunPosY = sunDist * Math.cos(sunAngle);
  const sunPosZ = sunDist * Math.sin(sunAngle);

  createPart('SunDiscCore', cylinderXGeo(0.11, 0.11, 0.022, 16), gilt, {
    position: [0.01, sunPosY, sunPosZ],
    parent: sunPivot
  });
  createPart('SunFaceEmboss', sphereGeo(0.07, 10, 8), gilt, {
    position: [0.02, sunPosY, sunPosZ],
    parent: sunPivot
  });
  for (let r = 0; r < 12; r++) {
    const rAng = (r / 12) * Math.PI * 2;
    const rayR = 0.14;
    const ry = sunPosY + Math.cos(rAng) * rayR;
    const rz = sunPosZ + Math.sin(rAng) * rayR;
    if (r % 2 === 0) {
      createPart(`SunRayLong_${r}`, coneGeo(0.028, 0.14, 5), gilt, {
        position: [0.01, ry, rz],
        rotation: [0, 0, (-r * 30)],
        parent: sunPivot
      });
    } else {
      createPart(`SunRayShort_${r}`, coneGeo(0.022, 0.09, 4), brass, {
        position: [0.01, ry, rz],
        rotation: [0, 0, (-r * 30) + 45],
        parent: sunPivot
      });
    }
  }

  const moonAngle = Math.PI * 0.42;
  const moonPivot = createPivot('MoonHand', [0.065, dialCenterY, 0], root);
  createPart('MoonHandArm', boxGeo(0.02, 0.8, 0.02), brass, {
    position: [0, 0.4 * Math.cos(moonAngle), 0.4 * Math.sin(moonAngle)],
    rotation: [0, 0, (moonAngle * 180 / Math.PI) + 90],
    parent: moonPivot
  });
  const moonDist = 0.78;
  const moonY = moonDist * Math.cos(moonAngle);
  const moonZ = moonDist * Math.sin(moonAngle);

  createPart('MoonSphereDark', sphereGeo(0.082, 12, 10), moonDark, {
    position: [0.01, moonY, moonZ],
    parent: moonPivot
  });
  createPart('MoonPhaseLightCap', cylinderXGeo(0.084, 0.084, 0.025, 16), moonLight, {
    position: [0.02, moonY, moonZ],
    parent: moonPivot
  });
  createPart('MoonPhaseGiltBezel', torusGeo(0.086, 0.012, 6, 16), gilt, {
    position: [0.02, moonY, moonZ],
    rotation: [0, 90, 0],
    parent: moonPivot
  });
  createPart('MoonCrescentTip', coneGeo(0.018, 0.11, 5), brass, {
    position: [0.01, (moonDist + 0.13) * Math.cos(moonAngle), (moonDist + 0.13) * Math.sin(moonAngle)],
    rotation: [0, 0, (moonAngle * 180 / Math.PI) - 90],
    parent: moonPivot
  });

  const ironHourAng = Math.PI * 0.78;
  const hourPivot = createPivot('IronHourHand', [0.076, dialCenterY, 0], root);
  createPart('IronHourStem', boxGeo(0.018, 0.62, 0.03), iron, {
    position: [0, 0.28 * Math.cos(ironHourAng), 0.28 * Math.sin(ironHourAng)],
    rotation: [0, 0, (ironHourAng * 180 / Math.PI) + 90],
    parent: hourPivot
  });
  createPart('IronHourRing', torusGeo(0.09, 0.016, 6, 16), iron, {
    position: [0, 0.52 * Math.cos(ironHourAng), 0.52 * Math.sin(ironHourAng)],
    rotation: [0, 90, 0],
    parent: hourPivot
  });
  createPart('IronHourSpadeTip', coneGeo(0.042, 0.15, 4), iron, {
    position: [0, 0.68 * Math.cos(ironHourAng), 0.68 * Math.sin(ironHourAng)],
    rotation: [0, 0, (ironHourAng * 180 / Math.PI) - 90],
    parent: hourPivot
  });
  createPart('IronHourCounter', sphereGeo(0.045, 8, 6), iron, {
    position: [0, -0.16 * Math.cos(ironHourAng), -0.16 * Math.sin(ironHourAng)],
    parent: hourPivot
  });

  const ironMinAng = -Math.PI * 0.08;
  const minPivot = createPivot('IronMinuteHand', [0.086, dialCenterY, 0], root);
  createPart('IronMinStem', boxGeo(0.016, 1.05, 0.024), iron, {
    position: [0, 0.45 * Math.cos(ironMinAng), 0.45 * Math.sin(ironMinAng)],
    rotation: [0, 0, (ironMinAng * 180 / Math.PI) + 90],
    parent: minPivot
  });
  createPart('IronMinSpear', coneGeo(0.032, 0.16, 4), iron, {
    position: [0, 1.02 * Math.cos(ironMinAng), 1.02 * Math.sin(ironMinAng)],
    rotation: [0, 0, (ironMinAng * 180 / Math.PI) - 90],
    parent: minPivot
  });
  createPart('IronMinCrossbar', boxGeo(0.014, 0.02, 0.14), iron, {
    position: [0, 0.88 * Math.cos(ironMinAng), 0.88 * Math.sin(ironMinAng)],
    rotation: [0, 0, (ironMinAng * 180 / Math.PI) + 90],
    parent: minPivot
  });
  createPart('IronMinCounter', coneGeo(0.036, 0.15, 5), iron, {
    position: [0, -0.22 * Math.cos(ironMinAng), -0.22 * Math.sin(ironMinAng)],
    rotation: [0, 0, (ironMinAng * 180 / Math.PI) + 90],
    parent: minPivot
  });

  return root;
}
