// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Museum Kinetic Wave Sculpture',
  category: 'prop',
  role: 'prop',
};

// Generates an aerodynamic sculpted wave fin mesh with smooth mathematical curvature
function createFinBladeGeo(u, height, sweepX, archZ, twistDeg, chordBase, thicknessBase) {
  const K = 20; // Height stations
  const M = 16; // Perimeter samples
  const positions = [];
  const uvs = [];
  const indices = [];

  // Bottom center vertex for watertight root closure
  const bottomCenterIdx = 0;
  positions.push(0, 0.04, 0);
  uvs.push(0.5, 0.0);

  // Slices 0 to K-2
  for (let k = 0; k < K - 1; k++) {
    const t = k / (K - 1);
    const y = 0.045 + height * t;
    const curl = 0.035 * Math.sin(Math.PI * u) * Math.pow(Math.max(0, t - 0.65) / 0.35, 2.0);
    const sx = sweepX * Math.pow(t, 1.75) - curl;
    const sz = archZ * Math.sin(Math.PI * t);
    const currentTwist = (twistDeg * Math.PI / 180) * t;

    // Sculpted chord envelope: swells in lower-mid body, tapers to fine tip
    const chord = chordBase * (1.0 + 0.65 * Math.sin(Math.PI * Math.pow(t, 0.7))) * (1.0 - 0.92 * Math.pow(t, 1.4));
    const thick = thicknessBase * (1.0 - 0.82 * t);

    const cosTw = Math.cos(currentTwist);
    const sinTw = Math.sin(currentTwist);

    for (let j = 0; j < M; j++) {
      const alpha = (2 * Math.PI * j) / M;
      const cx = -Math.cos(alpha) * chord * 0.5;
      const cz = Math.sin(alpha) * thick * 0.5 * (1.0 - 0.45 * Math.cos(alpha));

      // Rotate by local twist angle
      const rx = cx * cosTw - cz * sinTw;
      const rz = cx * sinTw + cz * cosTw;

      positions.push(sx + rx, y, sz + rz);
      uvs.push(j / M, t);
    }
  }

  // Tip apex vertex for clean watertight convergence with cresting hook
  const tipIdx = positions.length / 3;
  const tipSx = sweepX - 0.035 * Math.sin(Math.PI * u);
  const tipSz = 0;
  const tipY = 0.045 + height;
  positions.push(tipSx, tipY, tipSz);
  uvs.push(0.5, 1.0);

  // Bottom cap
  for (let j = 0; j < M; j++) {
    const nextJ = (j + 1) % M;
    indices.push(bottomCenterIdx, 1 + nextJ, 1 + j);
  }

  // Side quads
  for (let k = 0; k < K - 2; k++) {
    const rowA = 1 + k * M;
    const rowB = 1 + (k + 1) * M;
    for (let j = 0; j < M; j++) {
      const nextJ = (j + 1) % M;
      const a0 = rowA + j;
      const a1 = rowA + nextJ;
      const b0 = rowB + j;
      const b1 = rowB + nextJ;
      indices.push(a0, a1, b1);
      indices.push(a0, b1, b0);
    }
  }

  // Top cap
  const lastRow = 1 + (K - 2) * M;
  for (let j = 0; j < M; j++) {
    const nextJ = (j + 1) % M;
    indices.push(lastRow + j, lastRow + nextJ, tipIdx);
  }

  return meshGeo({ positions, indices, uvs });
}

function build() {
  const root = createRoot('MuseumKineticWaveSculpture');

  // Museum Materials
  const stoneMat = gameMaterial(0x1a1c20, { roughness: 0.82, metalness: 0.08, flatShading: false });
  const stoneStepMat = gameMaterial(0x22252a, { roughness: 0.78, metalness: 0.10, flatShading: false });
  const subBaseMat = gameMaterial(0x0f1012, { roughness: 0.90, metalness: 0.05, flatShading: false });
  const bronzeMat = gameMaterial(0xba8548, { roughness: 0.26, metalness: 0.88, flatShading: false });
  const polishedBronzeMat = gameMaterial(0xd49b42, { roughness: 0.20, metalness: 0.92, flatShading: false });
  const tealMat = gameMaterial(0x187a82, { roughness: 0.32, metalness: 0.45, flatShading: false });
  const darkMetalMat = gameMaterial(0x262a30, { roughness: 0.55, metalness: 0.75, flatShading: false });

  // 1. Museum Plinth Base
  // Recessed reveal foot (shadow gap at floor contact Y=0)
  createPart('SubBaseFoot', boxGeo(0.52, 0.03, 1.72), subBaseMat, {
    position: [0, 0.015, 0],
    parent: root,
  });

  // Main dark stone plinth body
  createPart('PlinthBody', boxGeo(0.60, 0.32, 1.80), stoneMat, {
    position: [0, 0.19, 0],
    parent: root,
  });

  // Inset top gallery tier step
  createPart('PlinthTopTier', boxGeo(0.48, 0.04, 1.68), stoneStepMat, {
    position: [0, 0.37, 0],
    parent: root,
  });

  // Inset bronze reveal borders around top deck
  createPart('InlayTrimFront', boxGeo(0.015, 0.01, 1.66), bronzeMat, {
    position: [0.22, 0.392, 0],
    parent: root,
  });
  createPart('InlayTrimBack', boxGeo(0.015, 0.01, 1.66), bronzeMat, {
    position: [-0.22, 0.392, 0],
    parent: root,
  });
  createPart('InlayTrimLeft', boxGeo(0.425, 0.01, 0.015), bronzeMat, {
    position: [0, 0.392, -0.82],
    parent: root,
  });
  createPart('InlayTrimRight', boxGeo(0.425, 0.01, 0.015), bronzeMat, {
    position: [0, 0.392, 0.82],
    parent: root,
  });

  // Museum catalog plaque on front face (+X face) with bronze frame and dark etched inlay
  createPart('MuseumPlaqueFrame', boxGeo(0.008, 0.075, 0.17), polishedBronzeMat, {
    position: [0.304, 0.20, 0],
    parent: root,
  });
  createPart('MuseumPlaqueInlay', boxGeo(0.006, 0.063, 0.158), darkMetalMat, {
    position: [0.306, 0.20, 0],
    parent: root,
  });
  createPart('PlaqueScrewLeft', cylinderXGeo(0.002, 0.002, 0.008, 8), polishedBronzeMat, {
    position: [0.3065, 0.20, -0.065],
    parent: root,
  });
  createPart('PlaqueScrewRight', cylinderXGeo(0.002, 0.002, 0.008, 8), polishedBronzeMat, {
    position: [0.3065, 0.20, 0.065],
    parent: root,
  });

  // Base plinth bronze trim reveal
  createPart('BasePlinthTrimFront', boxGeo(0.012, 0.006, 1.76), bronzeMat, {
    position: [0.285, 0.036, 0],
    parent: root,
  });
  createPart('BasePlinthTrimBack', boxGeo(0.012, 0.006, 1.76), bronzeMat, {
    position: [-0.285, 0.036, 0],
    parent: root,
  });
  createPart('BasePlinthTrimLeft', boxGeo(0.558, 0.006, 0.012), bronzeMat, {
    position: [0, 0.036, -0.875],
    parent: root,
  });
  createPart('BasePlinthTrimRight', boxGeo(0.558, 0.006, 0.012), bronzeMat, {
    position: [0, 0.036, 0.875],
    parent: root,
  });

  // 2. Mechanical Bed & Track
  createPart('MechanismBed', boxGeo(0.14, 0.025, 1.54), darkMetalMat, {
    position: [0, 0.4025, 0],
    parent: root,
  });
  // Twin polished bronze guide rods running the full length
  createPart('GuideRodFront', cylinderZGeo(0.007, 0.007, 1.52, 12), polishedBronzeMat, {
    position: [0.045, 0.42, 0],
    parent: root,
  });
  createPart('GuideRodBack', cylinderZGeo(0.007, 0.007, 1.52, 12), polishedBronzeMat, {
    position: [-0.045, 0.42, 0],
    parent: root,
  });

  // 3. Articulated Stations & Kinetic Wave Fins
  const NUM_FINS = 17;
  const START_Z = -0.68;
  const STEP_Z = 0.085;

  for (let i = 0; i < NUM_FINS; i++) {
    const zi = START_Z + i * STEP_Z;
    const u = i / (NUM_FINS - 1); // 0 to 1 along wave

    // Stationary bearing pillow blocks on track
    createPart(`PillowBlockFront_${i}`, boxGeo(0.026, 0.065, 0.035), bronzeMat, {
      position: [0.048, 0.4475, zi],
      parent: root,
    });
    createPart(`PillowBlockBack_${i}`, boxGeo(0.026, 0.065, 0.035), bronzeMat, {
      position: [-0.048, 0.4475, zi],
      parent: root,
    });
    createPart(`BearingCapFront_${i}`, cylinderXGeo(0.014, 0.014, 0.015, 12), polishedBronzeMat, {
      position: [0.055, 0.48, zi],
      parent: root,
    });
    createPart(`BearingCapBack_${i}`, cylinderXGeo(0.014, 0.014, 0.015, 12), polishedBronzeMat, {
      position: [-0.055, 0.48, zi],
      parent: root,
    });

    // Rooted Articulated Pivot Node
    const pivot = createPivot(`Fin_${i}`, [0, 0.48, zi], root);

    // Transverse axle through the bearings
    createPart(`Axle_${i}`, cylinderXGeo(0.008, 0.008, 0.125, 16), polishedBronzeMat, {
      parent: pivot,
    });
    createPart(`CentralHub_${i}`, cylinderXGeo(0.016, 0.016, 0.045, 16), bronzeMat, {
      parent: pivot,
    });

    // Articulated root clasp gripping the fin blade
    createPart(`RootClasp_${i}`, boxGeo(0.038, 0.042, 0.034), bronzeMat, {
      position: [0, 0.024, 0],
      parent: pivot,
    });

    // Downward counterweight pendulum
    createPart(`CounterweightArm_${i}`, cylinderYGeo(0.0055, 0.0055, 0.12, 12), darkMetalMat, {
      position: [0, -0.06, 0],
      parent: pivot,
    });
    createPart(`CounterweightBob_${i}`, cylinderYGeo(0.018, 0.022, 0.045, 16), polishedBronzeMat, {
      position: [0, -0.13, 0],
      parent: pivot,
    });

    // Stationary mounting plate anchoring bearing to stone plinth
    createPart(`AnchorPlate_${i}`, boxGeo(0.12, 0.008, 0.05), bronzeMat, {
      position: [0, 0.418, zi],
      parent: root,
    });

    // Coherent Progressive Silhouette Parameters: undulating wave crescendo
    const height = 0.46 + 0.30 * Math.sin(Math.PI * u) + 0.32 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 2.5);
    const sweepX = 0.10 + 0.24 * Math.pow(u, 1.15) + 0.04 * Math.sin(Math.PI * u);
    const archZ = 0.12 * Math.sin(2.0 * Math.PI * u);
    const twistDeg = -12.0 * Math.cos(Math.PI * u) + 14.0 * (u - 0.5);
    const chordBase = 0.068 + 0.022 * Math.sin(Math.PI * u);
    const thicknessBase = 0.017;

    // Fin blade material: alternate rich teal and warm bronze
    const isTeal = (i % 2 === 0);
    const finMat = isTeal ? tealMat : bronzeMat;

    const bladeGeo = createFinBladeGeo(u, height, sweepX, archZ, twistDeg, chordBase, thicknessBase);
    createPart(`Blade_${i}`, bladeGeo, finMat, {
      parent: pivot,
    });

    // Articulated bronze clamping cuffs and aerodynamic heel spur
    const upperT = 0.09;
    const upperY = 0.045 + height * upperT;
    const upperSx = sweepX * Math.pow(upperT, 1.75);
    const upperSz = archZ * Math.sin(Math.PI * upperT);

    createPart(`ClampBandLower_${i}`, boxGeo(0.042, 0.014, 0.038), polishedBronzeMat, {
      position: [0, 0.045, 0],
      parent: pivot,
    });
    createPart(`ClampBandUpper_${i}`, boxGeo(0.036, 0.012, 0.032), polishedBronzeMat, {
      position: [upperSx, upperY, upperSz],
      parent: pivot,
    });
    createPart(`ClampingBolt_${i}`, cylinderXGeo(0.003, 0.003, 0.044, 8), polishedBronzeMat, {
      position: [0, 0.045, 0],
      parent: pivot,
    });
    createPart(`HeelSpur_${i}`, cylinderYGeo(0.009, 0.004, 0.075, 12), polishedBronzeMat, {
      position: [-0.014, 0.055, 0],
      rotation: [0, 0, 16],
      parent: pivot,
    });
  }

  return root;
}

// Coordinated flowing wave animation
function animate(root) {
  const NUM_FINS = 17;
  const duration = 4.0;
  const tracks = [];
  const keyframeTimes = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];

  for (let i = 0; i < NUM_FINS; i++) {
    // 2 complete wave crests propagating along the 17 stations
    const phase = (2 * Math.PI * i) / 8.0;
    const keyframes = [];

    for (const t of keyframeTimes) {
      const angle = (2 * Math.PI * t) / duration - phase;
      // Primary tilt forward/backward (Z rotation)
      const rotZ = 15.0 * Math.sin(angle);
      // Secondary lateral sway (X rotation)
      const rotX = 5.5 * Math.cos(angle);
      // Subtle compound yaw precession
      const rotY = 2.0 * Math.sin(2.0 * angle);

      keyframes.push({
        time: t,
        rotation: [rotX, rotY, rotZ],
      });
    }

    tracks.push(rotationTrack(`Joint_Fin_${i}`, keyframes));
  }

  return [createClip('FlowingWave', duration, tracks)];
}
