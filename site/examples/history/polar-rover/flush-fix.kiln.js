// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 7 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Polar Research Rover',
  category: 'vehicle',
  role: 'vehicle',
};

async function build() {
  const root = createRoot('PolarRover');

  // --- Materials ---
  // Expedition safety orange bodywork
  const matOrange = gameMaterial(0xee5511, { roughness: 0.35, metalness: 0.15 });
  // Arctic ivory / white aerodynamic fairings and roof
  const matIvory = gameMaterial(0xf5f3ec, { roughness: 0.28, metalness: 0.12 });
  // Heavy chassis structural steel / gunmetal
  const matChassis = gameMaterial(0x1e2226, { roughness: 0.65, metalness: 0.75 });
  // High-durability reinforced rubber track composite
  const matTrack = gameMaterial(0x131518, { roughness: 0.88, metalness: 0.05 });
  // Machined titanium / alloy sprockets and hubs
  const matMachined = gameMaterial(0x4a525d, { roughness: 0.38, metalness: 0.85 });
  // Polar expedition tinted glass
  const matGlass = glassMaterial(0x203f5b, { opacity: 0.55, roughness: 0.12, metalness: 0.80 });
  // Dark window trim and gaskets
  const matGasket = gameMaterial(0x151618, { roughness: 0.90, metalness: 0.10 });
  // Photovoltaic solar cells
  const matSolar = gameMaterial(0x0c1e36, { roughness: 0.18, metalness: 0.90 });
  // Gold thermal insulation foil
  const matGoldFoil = gameMaterial(0xd8b030, { roughness: 0.35, metalness: 0.85 });
  // Scientific instrument anodized cobalt
  const matSciBlue = gameMaterial(0x225588, { roughness: 0.40, metalness: 0.60 });
  // Polished chrome / optical mirror
  const matChrome = gameMaterial(0xbbbbbb, { roughness: 0.15, metalness: 0.95 });
  // LED headlight cluster (bright cool white)
  const matLedWhite = gameMaterial(0xffffff, { emissive: 0xeef6ff, emissiveIntensity: 3.2 });
  // Amber expedition fog / hazard lamps
  const matAmber = gameMaterial(0xffaa00, { emissive: 0xff8800, emissiveIntensity: 2.2 });
  // Red LED taillights / beacon
  const matRed = gameMaterial(0xff2211, { emissive: 0xee1100, emissiveIntensity: 2.0 });

  // ==========================================
  // 1. CHASSIS & UNDERBODY
  // ==========================================
  // Main structural hull
  const chassisGeo = await roundedBoxGeo(2.30, 0.36, 1.22, 0.05, { style: 'chamfer', segments: 8 });
  createPart('ChassisTub', chassisGeo, matChassis, { position: [0.0, 0.44, 0.0], parent: root });

  // Underbody skid plate (angled nose deflection)
  const skidPlateGeo = await extrudeProfile([
    [-1.10, 0.28],
    [0.70, 0.28],
    [1.15, 0.44],
    [1.12, 0.48],
    [0.68, 0.32],
    [-1.10, 0.32]
  ], { depth: 1.16, axis: 'z', center: true });
  createPart('SkidPlate', skidPlateGeo, matChassis, { parent: root });

  // Front heavy-duty bumper & bullbar
  const bumperCenterGeo = await roundedBoxGeo(0.18, 0.14, 1.28, 0.03, { style: 'chamfer' });
  createPart('BumperBar', bumperCenterGeo, matChassis, { position: [1.16, 0.46, 0.0], parent: root });

  // Winch assembly
  const winchBodyGeo = await roundedBoxGeo(0.20, 0.16, 0.38, 0.02, { style: 'chamfer' });
  createPart('WinchHousing', winchBodyGeo, matMachined, { position: [1.22, 0.48, 0.0], parent: root });
  const winchDrumGeo = cylinderZGeo(0.06, 0.06, 0.22, 16);
  createPart('WinchDrum', winchDrumGeo, matSciBlue, { position: [1.22, 0.48, 0.0], parent: root });

  // Front recovery D-rings (red)
  for (const zSign of [-1, 1]) {
    const shackleGeo = torusGeo(0.045, 0.012, 8, 16);
    createPart(`RecoveryShackle_${zSign > 0 ? 'R' : 'L'}`, shackleGeo, matRed, {
      position: [1.26, 0.42, zSign * 0.45],
      rotation: [90, 0, 0],
      parent: root
    });
  }

  // Rear towing hitch & tow pintle
  const hitchGeo = await roundedBoxGeo(0.16, 0.12, 0.20, 0.02);
  createPart('RearHitch', hitchGeo, matChassis, { position: [-1.20, 0.42, 0.0], parent: root });

  // Rear red marker / tail lamps
  for (const zSign of [-1, 1]) {
    const tailLampGeo = await roundedBoxGeo(0.05, 0.08, 0.16, 0.01);
    createPart(`TailLamp_${zSign > 0 ? 'R' : 'L'}`, tailLampGeo, matRed, {
      position: [-1.16, 0.52, zSign * 0.52],
      parent: root
    });
  }

  // ==========================================
  // 2. TRACKS AND SUSPENSION
  // ==========================================
  // Build track side profile polygon
  const rRear = 0.34;
  const xRear = -0.75;
  const yRear = 0.36;

  const rFront = 0.26;
  const xFront = 0.75;
  const yFront = 0.40;

  const trackThick = 0.04;
  const trackDepth = 0.30;

  // Outer track profile (CCW)
  const outerOutline = [];
  // Bottom straight
  outerOutline.push([xRear, 0.02]);
  outerOutline.push([0.45, 0.02]);
  // Approach ramp to front idler
  const frontBottomAngle = -Math.PI * 0.42;
  const frontTopAngle = Math.PI * 0.40;
  for (let i = 0; i <= 8; i++) {
    const a = frontBottomAngle + (frontTopAngle - frontBottomAngle) * (i / 8);
    outerOutline.push([xFront + rRear * 0.76 * Math.cos(a), yFront + rRear * 0.76 * Math.sin(a)]);
  }
  // Top straight back to rear sprocket
  const rearTopAngle = Math.PI * 0.50;
  const rearBackAngle = Math.PI * 1.50;
  for (let i = 0; i <= 10; i++) {
    const a = rearTopAngle + (rearBackAngle - rearTopAngle) * (i / 10);
    outerOutline.push([xRear + rRear * Math.cos(a), yRear + rRear * Math.sin(a)]);
  }

  // Inner track hole (offset inward)
  const innerHole = [];
  innerHole.push([xRear, 0.02 + trackThick]);
  innerHole.push([0.45, 0.02 + trackThick]);
  for (let i = 0; i <= 8; i++) {
    const a = frontBottomAngle + (frontTopAngle - frontBottomAngle) * (i / 8);
    innerHole.push([xFront + (rRear * 0.76 - trackThick) * Math.cos(a), yFront + (rRear * 0.76 - trackThick) * Math.sin(a)]);
  }
  for (let i = 0; i <= 10; i++) {
    const a = rearTopAngle + (rearBackAngle - rearTopAngle) * (i / 10);
    innerHole.push([xRear + (rRear - trackThick) * Math.cos(a), yRear + (rRear - trackThick) * Math.sin(a)]);
  }

  // Extrude continuous track geometry
  const trackGeo = await extrudeProfile(outerOutline, {
    depth: trackDepth,
    holes: [innerHole],
    axis: 'z',
    center: true,
  });

  // Grousers / tread cleats
  const grouserGeo = await roundedBoxGeo(0.045, 0.018, trackDepth + 0.02, 0.004);

  // Build left and right track assemblies
  for (const zSign of [-1, 1]) {
    const sideName = zSign > 0 ? 'Right' : 'Left';
    const zTrack = zSign * 0.80;

    // Track belt
    createPart(`TrackBelt_${sideName}`, trackGeo, matTrack, { position: [0, 0, zTrack], parent: root });

    // Grousers around track belt
    // Bottom run grousers
    for (let gx = -0.70; gx <= 0.42; gx += 0.14) {
      createPart(`GrouserBot_${sideName}_${gx.toFixed(2)}`, grouserGeo, matChassis, {
        position: [gx, 0.01, zTrack],
        parent: root
      });
    }
    // Top run grousers
    for (let gx = -0.70; gx <= 0.70; gx += 0.15) {
      createPart(`GrouserTop_${sideName}_${gx.toFixed(2)}`, grouserGeo, matChassis, {
        position: [gx, 0.69 - (gx > 0 ? (gx - 0) * 0.05 : 0), zTrack],
        parent: root
      });
    }
    // Rear curved grousers
    for (let a = 90; a <= 270; a += 30) {
      const rad = a * Math.PI / 180;
      const gx = xRear + (rRear + 0.008) * Math.cos(rad);
      const gy = yRear + (rRear + 0.008) * Math.sin(rad);
      createPart(`GrouserRear_${sideName}_${a}`, grouserGeo, matChassis, {
        position: [gx, gy, zTrack],
        rotation: [0, 0, -a + 90],
        parent: root
      });
    }
    // Front curved grousers around front idler
    for (let a = -60; a <= 60; a += 30) {
      const rad = a * Math.PI / 180;
      const gx = xFront + (rRear * 0.76 + 0.008) * Math.cos(rad);
      const gy = yFront + (rRear * 0.76 + 0.008) * Math.sin(rad);
      createPart(`GrouserFront_${sideName}_${a}`, grouserGeo, matChassis, {
        position: [gx, gy, zTrack],
        rotation: [0, 0, -a + 90],
        parent: root
      });
    }

    // Rear drive sprocket wheel
    const sprocketRimGeo = cylinderZGeo(0.30, 0.30, 0.26, 20);
    createPart(`SprocketRim_${sideName}`, sprocketRimGeo, matMachined, {
      position: [xRear, yRear, zTrack],
      parent: root
    });
    const sprocketHubGeo = cylinderZGeo(0.14, 0.14, 0.32, 16);
    createPart(`SprocketHub_${sideName}`, sprocketHubGeo, matChassis, {
      position: [xRear, yRear, zTrack],
      parent: root
    });
    // Sprocket teeth ring
    const toothRingGeo = torusGeo(0.30, 0.015, 8, 24);
    createPart(`SprocketTeeth_${sideName}`, toothRingGeo, matChassis, {
      position: [xRear, yRear, zTrack],
      parent: root
    });

    // Front idler wheel
    const idlerRimGeo = cylinderZGeo(0.22, 0.22, 0.26, 18);
    createPart(`IdlerRim_${sideName}`, idlerRimGeo, matMachined, {
      position: [xFront, yFront, zTrack],
      parent: root
    });
    const idlerHubGeo = cylinderZGeo(0.10, 0.10, 0.32, 12);
    createPart(`IdlerHub_${sideName}`, idlerHubGeo, matChassis, {
      position: [xFront, yFront, zTrack],
      parent: root
    });
    // Front track tensioner hydraulic cylinder
    const tensionerArmGeo = cylinderXGeo(0.035, 0.035, 0.28, 8);
    createPart(`Tensioner_${sideName}`, tensionerArmGeo, matChassis, {
      position: [xFront - 0.16, yFront - 0.04, zTrack - zSign * 0.08],
      rotation: [0, 0, -15],
      parent: root
    });

    // 4 Road wheels along bottom run
    const roadXPositions = [-0.48, -0.16, 0.16, 0.46];
    for (let rIdx = 0; rIdx < roadXPositions.length; rIdx++) {
      const rx = roadXPositions[rIdx];
      const ry = 0.20;

      // Road wheel rim (dual rubber wheel)
      const roadWheelGeo = cylinderZGeo(0.14, 0.14, 0.252, 16);
      createPart(`RoadWheel_${sideName}_${rIdx}`, roadWheelGeo, matTrack, {
        position: [rx, ry, zTrack],
        parent: root
      });
      // Center alloy hub
      const roadHubGeo = cylinderZGeo(0.08, 0.08, 0.29, 12);
      createPart(`RoadHub_${sideName}_${rIdx}`, roadHubGeo, matMachined, {
        position: [rx, ry, zTrack],
        parent: root
      });
      // Trailing suspension arm to chassis
      const armGeo = cylinderXGeo(0.025, 0.025, 0.18, 8);
      createPart(`SuspensionArm_${sideName}_${rIdx}`, armGeo, matChassis, {
        position: [rx - 0.08, ry + 0.08, zTrack - zSign * 0.08],
        rotation: [0, 0, 40],
        parent: root
      });
      // Coilover shock damper
      const shockGeo = cylinderGeo(0.02, 0.02, 0.14, 8);
      createPart(`Shock_${sideName}_${rIdx}`, shockGeo, matSciBlue, {
        position: [rx - 0.02, ry + 0.16, zTrack - zSign * 0.08],
        rotation: [0, 0, -20],
        parent: root
      });
    }

    // 2 Top track return rollers
    for (const rx of [-0.25, 0.22]) {
      const rollerGeo = cylinderZGeo(0.065, 0.065, 0.26, 12);
      createPart(`ReturnRoller_${sideName}_${rx > 0 ? 'F' : 'R'}`, rollerGeo, matMachined, {
        position: [rx, 0.58, zTrack],
        parent: root
      });
    }
  }

  // ==========================================
  // 3. CABIN (ORANGE & IVORY ROUNDED CAB)
  // ==========================================
  // Main lower cab body (polar safety orange)
  const cabBodyGeo = await roundedBoxGeo(1.50, 0.72, 1.26, 0.14, { style: 'round', segments: 16 });
  createPart('CabBodyOrange', cabBodyGeo, matOrange, { position: [0.15, 0.98, 0.0], parent: root });

  // Aerodynamic nose / front snout transition (orange)
  const noseSlopeGeo = await extrudeProfile([
    [0.70, 0.65],
    [1.08, 0.65],
    [0.98, 0.95],
    [0.65, 0.95]
  ], { depth: 1.18, axis: 'z', center: true, bevel: 0.015 });
  createPart('CabNoseSlope', noseSlopeGeo, matOrange, { parent: root });

  // Upper aerodynamic roof fairing & visor (arctic ivory)
  const roofCapGeo = await roundedBoxGeo(1.64, 0.20, 1.30, 0.08, { style: 'round', segments: 14 });
  createPart('RoofCapIvory', roofCapGeo, matIvory, { position: [0.18, 1.42, 0.0], parent: root });

  // Roof grab rails along left and right edges
  for (const zSign of [-1, 1]) {
    const railGeo = cylinderXGeo(0.015, 0.015, 1.10, 8);
    createPart(`RoofRail_${zSign > 0 ? 'R' : 'L'}`, railGeo, matMachined, {
      position: [0.10, 1.55, zSign * 0.58],
      parent: root
    });
    for (const rx of [-0.40, 0.10, 0.60]) {
      const stanchionGeo = cylinderGeo(0.012, 0.012, 0.06, 8);
      createPart(`RoofStanchion_${zSign > 0 ? 'R' : 'L'}_${rx.toFixed(1)}`, stanchionGeo, matChassis, {
        position: [rx, 1.53, zSign * 0.58],
        parent: root
      });
    }
  }

  // Emergency escape hatch on roof center
  const hatchGeo = await roundedBoxGeo(0.42, 0.04, 0.42, 0.015, { style: 'chamfer' });
  createPart('RoofEscapeHatch', hatchGeo, matOrange, { position: [0.05, 1.53, 0.0], parent: root });
  const hatchHandleGeo = torusGeo(0.05, 0.01, 6, 12);
  createPart('RoofHatchHandle', hatchHandleGeo, matMachined, {
    position: [0.05, 1.56, 0.0],
    rotation: [90, 0, 0],
    parent: root
  });

  // Front aerodynamic sunvisor brow jutting forward (ivory)
  const visorBrowGeo = await roundedBoxGeo(0.24, 0.08, 1.28, 0.03, { style: 'round' });
  createPart('VisorBrowIvory', visorBrowGeo, matIvory, { position: [0.98, 1.42, 0.0], parent: root });

  // Hood matte black anti-glare panel in front of windscreen
  const antiGlareGeo = boxGeo(0.38, 0.015, 0.96);
  createPart('HoodAntiGlarePanel', antiGlareGeo, matGasket, { position: [0.70, 1.01, 0.0], parent: root });

  // Lower nose front sensor fairing (ivory)
  const noseFairingGeo = await roundedBoxGeo(0.22, 0.22, 0.96, 0.05, { style: 'round' });
  createPart('NoseFairingIvory', noseFairingGeo, matIvory, { position: [1.02, 0.758, 0.0], parent: root });

  // Radiator cooling intake grille slats
  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const grilleSlatGeo = boxGeo(0.02, 0.018, 0.72);
    createPart(`NoseGrilleSlat_${sIdx}`, grilleSlatGeo, matChassis, {
      position: [1.13, 0.70 + sIdx * 0.05, 0.0],
      parent: root
    });
  }

  // Forward LIDAR / radar sensor lens in the nose fairing
  const noseSensorGeo = cylinderXGeo(0.08, 0.08, 0.08, 16);
  createPart('NoseRadarLens', noseSensorGeo, matGlass, { position: [1.13, 0.76, 0.0], parent: root });

  // ==========================================
  // 4. WINDOWS & LIGHTS
  // ==========================================
  // Panoramic front windscreen
  const windshieldFrameGeo = await roundedBoxGeo(0.06, 0.44, 1.12, 0.02, { style: 'chamfer' });
  createPart('WindshieldFrame', windshieldFrameGeo, matGasket, {
    position: [0.88, 1.15, 0.0],
    rotation: [0, 0, -18],
    parent: root
  });
  const windshieldGlassGeo = await roundedBoxGeo(0.04, 0.40, 1.08, 0.015);
  createPart('WindshieldGlass', windshieldGlassGeo, matGlass, {
    position: [0.892, 1.15, 0.0],
    rotation: [0, 0, -18],
    parent: root
  });

  // Windshield wipers
  for (const zSign of [-1, 1]) {
    const wiperBladeGeo = cylinderGeo(0.008, 0.008, 0.28, 6);
    createPart(`WiperBlade_${zSign > 0 ? 'R' : 'L'}`, wiperBladeGeo, matChassis, {
      position: [0.93, 1.12, zSign * 0.28],
      rotation: [0, 0, -28],
      parent: root
    });
  }

  // Side observation windows (left and right)
  for (const zSign of [-1, 1]) {
    const sideName = zSign > 0 ? 'Right' : 'Left';
    const zWindow = zSign * 0.635;

    // Forward crew window
    const winFrontFrameGeo = await roundedBoxGeo(0.42, 0.32, 0.04, 0.012, { style: 'chamfer' });
    createPart(`SideWinFrontFrame_${sideName}`, winFrontFrameGeo, matGasket, {
      position: [0.42, 1.12, zWindow],
      parent: root
    });
    const winFrontGlassGeo = await roundedBoxGeo(0.38, 0.28, 0.03, 0.01);
    createPart(`SideWinFrontGlass_${sideName}`, winFrontGlassGeo, matGlass, {
      position: [0.42, 1.12, zWindow + zSign * 0.007],
      parent: root
    });

    // Aft science observation port
    const winAftFrameGeo = await roundedBoxGeo(0.36, 0.30, 0.04, 0.012, { style: 'chamfer' });
    createPart(`SideWinAftFrame_${sideName}`, winAftFrameGeo, matGasket, {
      position: [-0.14, 1.12, zWindow],
      parent: root
    });
    const winAftGlassGeo = await roundedBoxGeo(0.32, 0.26, 0.03, 0.01);
    createPart(`SideWinAftGlass_${sideName}`, winAftGlassGeo, matGlass, {
      position: [-0.14, 1.12, zWindow + zSign * 0.007],
      parent: root
    });

    // Expedition cabin door handle
    const doorHandleGeo = boxGeo(0.08, 0.02, 0.02);
    createPart(`DoorHandle_${sideName}`, doorHandleGeo, matMachined, {
      position: [0.15, 1.05, zWindow + zSign * 0.01],
      parent: root
    });

    // Scientific expedition insignia mission plate
    const badgePlateGeo = boxGeo(0.22, 0.12, 0.015);
    createPart(`ExpeditionBadge_${sideName}`, badgePlateGeo, matIvory, {
      position: [0.15, 0.88, zWindow + zSign * 0.01],
      parent: root
    });
    const chevronGeo = boxGeo(0.14, 0.03, 0.018);
    createPart(`BadgeChevron_${sideName}`, chevronGeo, matSciBlue, {
      position: [0.15, 0.88, zWindow + zSign * 0.012],
      parent: root
    });

    // Amber side clearance marker lamp
    const sideMarkerGeo = cylinderZGeo(0.025, 0.025, 0.02, 8);
    createPart(`SideMarker_${sideName}`, sideMarkerGeo, matAmber, {
      position: [0.82, 1.34, zWindow + zSign * 0.015],
      parent: root
    });
  }

  // High-intensity expedition LED light bar in visor brow
  const lightBarHousingGeo = await roundedBoxGeo(0.08, 0.06, 1.04, 0.015);
  createPart('LightBarHousing', lightBarHousingGeo, matChassis, { position: [1.08, 1.42, 0.0], parent: root });
  const lightBarLedsGeo = await roundedBoxGeo(0.04, 0.035, 0.98, 0.01);
  createPart('LightBarLeds', lightBarLedsGeo, matLedWhite, { position: [1.11, 1.42, 0.0], parent: root });

  // Auxiliary amber fog lights in front bumper
  for (const zSign of [-1, 1]) {
    const fogLampHousingGeo = cylinderXGeo(0.07, 0.07, 0.08, 16);
    createPart(`FogLampHousing_${zSign > 0 ? 'R' : 'L'}`, fogLampHousingGeo, matChassis, {
      position: [1.22, 0.52, zSign * 0.42],
      parent: root
    });
    const fogLampLensGeo = cylinderXGeo(0.055, 0.055, 0.03, 16);
    createPart(`FogLampLens_${zSign > 0 ? 'R' : 'L'}`, fogLampLensGeo, matAmber, {
      position: [1.26, 0.52, zSign * 0.42],
      parent: root
    });
    // Protective steel wire cage
    const fogGuardGeo = torusGeo(0.065, 0.006, 6, 16);
    createPart(`FogLampGuard_${zSign > 0 ? 'R' : 'L'}`, fogGuardGeo, matMachined, {
      position: [1.27, 0.52, zSign * 0.42],
      rotation: [0, 90, 0],
      parent: root
    });
  }

  // ==========================================
  // 5. REAR INSTRUMENT PACKAGES & EQUIPMENT BAY
  // ==========================================
  // Rear equipment deck diamond plate
  const equipDeckGeo = await roundedBoxGeo(0.85, 0.05, 1.20, 0.02);
  createPart('EquipmentDeck', equipDeckGeo, matChassis, { position: [-0.85, 0.64, 0.0], parent: root });

  // Cryogenic ice-core sampling storage dewar flask
  const cryoTankGeo = cylinderXGeo(0.20, 0.20, 0.65, 20);
  createPart('CryoTankBody', cryoTankGeo, matMachined, { position: [-0.88, 0.85, 0.28], parent: root });
  // Tank end cap domes
  for (const xSign of [-1, 1]) {
    const endCapGeo = sphereGeo(0.19, 16, 12);
    createPart(`CryoTankCap_${xSign > 0 ? 'F' : 'R'}`, endCapGeo, matMachined, {
      position: [-0.88 + xSign * 0.32, 0.85, 0.28],
      scale: [0.5, 1, 1],
      parent: root
    });
  }
  // Tank saddle mounting brackets
  for (const xOffset of [-0.20, 0.20]) {
    const saddleGeo = await roundedBoxGeo(0.08, 0.22, 0.44, 0.015);
    createPart(`CryoSaddle_${xOffset > 0 ? 'F' : 'R'}`, saddleGeo, matChassis, {
      position: [-0.88 + xOffset, 0.74, 0.28],
      parent: root
    });
  }
  // Cryogenic pressure gauge & valve
  const gaugeBezelGeo = cylinderGeo(0.045, 0.045, 0.03, 12);
  createPart('CryoPressureGauge', gaugeBezelGeo, matGoldFoil, {
    position: [-0.75, 1.07, 0.28],
    rotation: [0, 0, 0],
    parent: root
  });
  const gaugeFaceGeo = cylinderGeo(0.038, 0.038, 0.01, 12);
  createPart('CryoGaugeFace', gaugeFaceGeo, matIvory, {
    position: [-0.75, 1.09, 0.28],
    parent: root
  });

  // Atmospheric Spectrometer instrument chassis
  const spectrometerGeo = await roundedBoxGeo(0.60, 0.36, 0.44, 0.03, { style: 'chamfer', segments: 8 });
  createPart('SpectrometerHousing', spectrometerGeo, matSciBlue, { position: [-0.88, 0.84, -0.28], parent: root });
  // Cooling heatsink fins on spectrometer
  for (let fIdx = 0; fIdx < 6; fIdx++) {
    const finGeo = await roundedBoxGeo(0.56, 0.012, 0.42, 0.003);
    createPart(`SpecCoolingFin_${fIdx}`, finGeo, matMachined, {
      position: [-0.88, 0.72 + fIdx * 0.05, -0.28],
      parent: root
    });
  }
  // Spectrometer optical sampling aperture
  const specOpticGeo = cylinderXGeo(0.04, 0.03, 0.08, 12);
  createPart('SpectrometerOptic', specOpticGeo, matChrome, {
    position: [-0.562, 0.92, -0.28],
    parent: root
  });

  // Atmospheric air particle sampling intake tower
  const airIntakeMastGeo = cylinderGeo(0.02, 0.02, 0.45, 8);
  createPart('AirSamplingMast', airIntakeMastGeo, matChassis, { position: [-1.15, 0.88, 0.0], parent: root });
  const airCycloneLeftGeo = coneGeo(0.045, 0.12, 10);
  createPart('AirCycloneL', airCycloneLeftGeo, matMachined, {
    position: [-1.15, 1.12, -0.08],
    rotation: [180, 0, 0],
    parent: root
  });
  const airCycloneRightGeo = coneGeo(0.045, 0.12, 10);
  createPart('AirCycloneR', airCycloneRightGeo, matMachined, {
    position: [-1.15, 1.12, 0.08],
    rotation: [180, 0, 0],
    parent: root
  });

  // Ground penetrating radar sled under rear chassis
  const gprAntennaGeo = boxGeo(0.24, 0.04, 0.88);
  createPart('GprAntennaSled', gprAntennaGeo, matOrange, { position: [-1.18, 0.278, 0.0], parent: root });
  for (const zSign of [-1, 1]) {
    const gprSkidGeo = cylinderXGeo(0.015, 0.015, 0.28, 8);
    createPart(`GprSkid_${zSign > 0 ? 'R' : 'L'}`, gprSkidGeo, matMachined, {
      position: [-1.18, 0.24, zSign * 0.40],
      parent: root
    });
  }

  // Ice-core sample canister carousel rack (next to spectrometer)
  for (let cIdx = 0; cIdx < 3; cIdx++) {
    const canisterGeo = cylinderGeo(0.04, 0.04, 0.30, 12);
    createPart(`SampleCanister_${cIdx}`, canisterGeo, matMachined, {
      position: [-0.60 - cIdx * 0.11, 0.82, -0.05],
      parent: root
    });
    const canisterCapGeo = cylinderGeo(0.045, 0.045, 0.03, 12);
    createPart(`SampleCanisterCap_${cIdx}`, canisterCapGeo, matOrange, {
      position: [-0.60 - cIdx * 0.11, 0.98, -0.05],
      parent: root
    });
  }

  // Instrument cabling conduit bundle
  const cableGeo = cylinderGeo(0.018, 0.018, 0.50, 8);
  createPart('InstrumentCableLoom', cableGeo, matGasket, {
    position: [-0.62, 0.72, 0.12],
    rotation: [0, 25, 80],
    parent: root
  });

  // ==========================================
  // 6. ROOF EXPEDITION GEAR & COMMUNICATIONS
  // ==========================================
  // High-gain satellite communications dish
  const satGimbalGeo = cylinderGeo(0.05, 0.05, 0.08, 12);
  createPart('SatGimbalBase', satGimbalGeo, matChassis, { position: [-0.42, 1.56, -0.32], parent: root });
  // Parabolic dish
  const dishBowlGeo = cylinderGeo(0.24, 0.06, 0.10, 20);
  createPart('SatDishBowl', dishBowlGeo, matIvory, {
    position: [-0.42, 1.68, -0.32],
    rotation: [25, 0, -20],
    parent: root
  });
  // Sub-reflector feed horn
  const dishFeedGeo = cylinderGeo(0.02, 0.03, 0.12, 8);
  createPart('SatDishFeed', dishFeedGeo, matMachined, {
    position: [-0.40, 1.74, -0.30],
    rotation: [25, 0, -20],
    parent: root
  });

  // Ultrasonic weather station / anemometer
  const weatherPostGeo = cylinderGeo(0.018, 0.018, 0.28, 8);
  createPart('WeatherPost', weatherPostGeo, matChassis, { position: [-0.42, 1.66, 0.32], parent: root });
  // Radiation shield louvers (conical disks)
  for (let lIdx = 0; lIdx < 4; lIdx++) {
    const louverGeo = cylinderGeo(0.05, 0.06, 0.015, 12);
    createPart(`WeatherLouver_${lIdx}`, louverGeo, matIvory, {
      position: [-0.42, 1.62 + lIdx * 0.025, 0.32],
      parent: root
    });
  }
  // Anemometer cross-arms and cups
  const cupArmGeo = cylinderZGeo(0.006, 0.006, 0.12, 6);
  createPart('AnemometerArm', cupArmGeo, matMachined, { position: [-0.42, 1.78, 0.32], parent: root });
  for (const cupSign of [-1, 1]) {
    const cupGeo = sphereGeo(0.018, 8, 8);
    createPart(`AnemometerCup_${cupSign > 0 ? 'R' : 'L'}`, cupGeo, matOrange, {
      position: [-0.42, 1.78, 0.32 + cupSign * 0.06],
      parent: root
    });
  }

  // Whip antennas
  for (const zSign of [-1, 1]) {
    const whipGeo = cylinderGeo(0.004, 0.006, 0.65, 6);
    createPart(`WhipAntenna_${zSign > 0 ? 'R' : 'L'}`, whipGeo, matChrome, {
      position: [-0.55, 1.82, zSign * 0.48],
      rotation: [-15, 0, zSign * 8],
      parent: root
    });
  }

  // ==========================================
  // 7. ARTICULATED MAST & SENSOR HEAD (ANIMATED)
  // ==========================================
  // Fixed mounting base collar on the forward roof
  const mastCollarGeo = cylinderGeo(0.09, 0.11, 0.06, 16);
  createPart('MastCollar', mastCollarGeo, matChassis, { position: [0.50, 1.55, 0.28], parent: root });

  // Joint 1: Azimuth rotation base (yaw)
  const mastBase = createPivot('MastBase', [0.50, 1.58, 0.28], root);

  // Azimuth turret platform
  const turretPlatformGeo = cylinderGeo(0.08, 0.08, 0.05, 16);
  createPart('MastTurretPlatform', turretPlatformGeo, matMachined, { position: [0, 0.025, 0], parent: mastBase });

  // Lower boom twin carbon spars
  for (const zSign of [-1, 1]) {
    const sparGeo = cylinderGeo(0.015, 0.018, 0.42, 8);
    createPart(`MastLowerSpar_${zSign > 0 ? 'R' : 'L'}`, sparGeo, matChassis, {
      position: [0, 0.24, zSign * 0.045],
      parent: mastBase
    });
  }
  // Cross bracing
  const mastBraceGeo = cylinderZGeo(0.01, 0.01, 0.10, 6);
  createPart('MastLowerBrace', mastBraceGeo, matMachined, { position: [0, 0.26, 0], parent: mastBase });

  // Linear elevation hydraulic actuator cylinder
  const actuatorBodyGeo = cylinderGeo(0.016, 0.016, 0.20, 8);
  createPart('MastActuatorBody', actuatorBodyGeo, matChassis, {
    position: [-0.03, 0.22, 0],
    rotation: [-18, 0, 0],
    parent: mastBase
  });
  const actuatorRodGeo = cylinderGeo(0.009, 0.009, 0.14, 8);
  createPart('MastActuatorRod', actuatorRodGeo, matChrome, {
    position: [-0.03, 0.32, 0],
    rotation: [-18, 0, 0],
    parent: mastBase
  });

  // Joint 2: Articulated elbow / pan-tilt head pivot
  const mastElbow = createPivot('MastElbow', [0, 0.46, 0], mastBase);

  // Articulated sensor head pod
  const sensorPodGeo = await roundedBoxGeo(0.18, 0.14, 0.28, 0.025, { style: 'chamfer', segments: 8 });
  createPart('SensorHeadPod', sensorPodGeo, matIvory, { position: [0.04, 0.06, 0], parent: mastElbow });

  // Stereoscopic scientific camera eyes
  for (const zSign of [-1, 1]) {
    const eyeBarrelGeo = cylinderXGeo(0.04, 0.04, 0.07, 16);
    createPart(`StereoCamBarrel_${zSign > 0 ? 'R' : 'L'}`, eyeBarrelGeo, matMachined, {
      position: [0.15, 0.06, zSign * 0.09],
      parent: mastElbow
    });
    const eyeLensGeo = cylinderXGeo(0.032, 0.032, 0.015, 16);
    createPart(`StereoCamLens_${zSign > 0 ? 'R' : 'L'}`, eyeLensGeo, matGlass, {
      position: [0.185, 0.06, zSign * 0.09],
      parent: mastElbow
    });
  }

  // Central pulsed LIDAR rangefinder aperture
  const lidarRingGeo = cylinderXGeo(0.03, 0.03, 0.05, 14);
  createPart('MastLidarRing', lidarRingGeo, matGoldFoil, {
    position: [0.14, 0.09, 0.0],
    parent: mastElbow
  });

  // High-power masthead spotlight (bright white)
  const spotHousingGeo = cylinderXGeo(0.038, 0.045, 0.06, 14);
  createPart('MastSpotHousing', spotHousingGeo, matChassis, {
    position: [0.12, 0.01, 0.0],
    parent: mastElbow
  });
  const spotLensGeo = cylinderXGeo(0.035, 0.035, 0.015, 14);
  createPart('MastSpotLens', spotLensGeo, matLedWhite, {
    position: [0.155, 0.01, 0.0],
    parent: mastElbow
  });

  // ==========================================
  // 8. HINGED SOLAR ARRAY (ANIMATED)
  // ==========================================
  const panelLength = 0.82;
  const panelWidth = 0.44;
  const panelThick = 0.025;

  // Left solar panel wing
  const solarLeft = createPivot('SolarLeft', [-0.08, 1.52, -0.65], root);
  // Left panel frame
  const panelFrameLGeo = await roundedBoxGeo(panelLength, panelThick, panelWidth, 0.008);
  createPart('SolarFrame_L', panelFrameLGeo, matMachined, {
    position: [0, 0, -panelWidth * 0.5],
    parent: solarLeft
  });
  // Top PV cells
  const panelPvsLGeo = boxGeo(panelLength - 0.04, 0.006, panelWidth - 0.04);
  createPart('SolarCells_L', panelPvsLGeo, matSolar, {
    position: [0, panelThick * 0.5 + 0.002, -panelWidth * 0.5],
    parent: solarLeft
  });
  // Silver busbar grid lines across PV cells
  for (const bx of [-0.22, 0.0, 0.22]) {
    const busbarGeo = boxGeo(0.008, 0.007, panelWidth - 0.04);
    createPart(`SolarBusbar_L_${bx.toFixed(2)}`, busbarGeo, matChrome, {
      position: [bx, panelThick * 0.5 + 0.005, -panelWidth * 0.5],
      parent: solarLeft
    });
  }
  // Bottom gold thermal insulation
  const panelGoldLGeo = boxGeo(panelLength - 0.02, 0.004, panelWidth - 0.02);
  createPart('SolarGold_L', panelGoldLGeo, matGoldFoil, {
    position: [0, -panelThick * 0.5 - 0.001, -panelWidth * 0.5],
    parent: solarLeft
  });
  // Hinge brackets
  for (const hx of [-0.25, 0.25]) {
    const hingeGeo = cylinderXGeo(0.02, 0.02, 0.06, 10);
    createPart(`SolarHinge_L_${hx > 0 ? 'F' : 'R'}`, hingeGeo, matChassis, {
      position: [hx, 0, 0],
      parent: solarLeft
    });
  }

  // Right solar panel wing
  const solarRight = createPivot('SolarRight', [-0.08, 1.52, 0.65], root);
  // Right panel frame
  const panelFrameRGeo = await roundedBoxGeo(panelLength, panelThick, panelWidth, 0.008);
  createPart('SolarFrame_R', panelFrameRGeo, matMachined, {
    position: [0, 0, panelWidth * 0.5],
    parent: solarRight
  });
  // Top PV cells
  const panelPvsRGeo = boxGeo(panelLength - 0.04, 0.006, panelWidth - 0.04);
  createPart('SolarCells_R', panelPvsRGeo, matSolar, {
    position: [0, panelThick * 0.5 + 0.002, panelWidth * 0.5],
    parent: solarRight
  });
  // Silver busbar grid lines across PV cells
  for (const bx of [-0.22, 0.0, 0.22]) {
    const busbarGeo = boxGeo(0.008, 0.007, panelWidth - 0.04);
    createPart(`SolarBusbar_R_${bx.toFixed(2)}`, busbarGeo, matChrome, {
      position: [bx, panelThick * 0.5 + 0.005, panelWidth * 0.5],
      parent: solarRight
    });
  }
  // Bottom gold thermal insulation
  const panelGoldRGeo = boxGeo(panelLength - 0.02, 0.004, panelWidth - 0.02);
  createPart('SolarGold_R', panelGoldRGeo, matGoldFoil, {
    position: [0, -panelThick * 0.5 - 0.001, panelWidth * 0.5],
    parent: solarRight
  });
  // Hinge brackets
  for (const hx of [-0.25, 0.25]) {
    const hingeGeo = cylinderXGeo(0.02, 0.02, 0.06, 10);
    createPart(`SolarHinge_R_${hx > 0 ? 'F' : 'R'}`, hingeGeo, matChassis, {
      position: [hx, 0, 0],
      parent: solarRight
    });
  }

  return root;
}

function animate(root) {
  return [
    createClip('ExpeditionScan', 4.0, [
      // Mast Azimuth pan (Joint_MastBase)
      rotationTrack('Joint_MastBase', [
        { time: 0.0, rotation: [0, 0, 0] },
        { time: 1.0, rotation: [0, 35, 0] },
        { time: 2.0, rotation: [0, -30, 0] },
        { time: 3.0, rotation: [0, 15, 0] },
        { time: 4.0, rotation: [0, 0, 0] },
      ]),
      // Mast Elevation tilt (Joint_MastElbow)
      rotationTrack('Joint_MastElbow', [
        { time: 0.0, rotation: [0, 0, 0] },
        { time: 1.0, rotation: [12, 0, 0] },
        { time: 2.0, rotation: [-8, 0, 0] },
        { time: 3.0, rotation: [16, 0, 0] },
        { time: 4.0, rotation: [0, 0, 0] },
      ]),
      // Left Solar Wing tilt deployment
      rotationTrack('Joint_SolarLeft', [
        { time: 0.0, rotation: [-38, 0, 0] },
        { time: 1.2, rotation: [18, 0, 0] },
        { time: 2.8, rotation: [18, 0, 0] },
        { time: 4.0, rotation: [-38, 0, 0] },
      ]),
      // Right Solar Wing tilt deployment
      rotationTrack('Joint_SolarRight', [
        { time: 0.0, rotation: [38, 0, 0] },
        { time: 1.2, rotation: [-18, 0, 0] },
        { time: 2.8, rotation: [-18, 0, 0] },
        { time: 4.0, rotation: [38, 0, 0] },
      ]),
    ])
  ];
}
