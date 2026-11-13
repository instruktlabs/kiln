// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: meituan/longcat-2.0:free, via hermes.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'FireLookoutTower', category: 'architecture', role: 'building' };

function build() {
  const root = createRoot('FireLookoutTower');

  const steel = gameMaterial(0x8B7355, { roughness: 0.6, metalness: 0.7 });
  const darkSteel = gameMaterial(0x404040, { roughness: 0.5, metalness: 0.8 });
  const glass = glassMaterial(0x88CCFF, { opacity: 0.35 });
  const brass = gameMaterial(0xB8860B, { roughness: 0.3, metalness: 0.9 });

  const H = 10;
  const baseHalf = 1.5;
  const topHalf = 0.75;

  function halfW(y) {
    return baseHalf * (1 - y / H) + topHalf * (y / H);
  }

  function corner(y, sx, sz) {
    return [sx * halfW(y), y, sz * halfW(y)];
  }

  const levels = [0, 2, 4, 6, 8, 10];

  // Four battered legs
  const signs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of signs) {
    beamBetween(`Leg_${sx}_${sz}`, corner(0, sx, sz), corner(H, sx, sz), 0.05, steel, { parent: root, segments: 12 });
  }

  // Horizontal rings at each level
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i];
    const hw = halfW(y);
    const r = 0.03;
    beamBetween(`Ring_${i}_FR`, [hw, y, hw], [hw, y, -hw], r, steel, { parent: root });
    beamBetween(`Ring_${i}_FL`, [hw, y, -hw], [-hw, y, -hw], r, steel, { parent: root });
    beamBetween(`Ring_${i}_BL`, [-hw, y, -hw], [-hw, y, hw], r, steel, { parent: root });
    beamBetween(`Ring_${i}_BR`, [-hw, y, hw], [hw, y, hw], r, steel, { parent: root });
  }

  // X-bracing on each face between levels
  for (let i = 0; i < levels.length - 1; i++) {
    const yLow = levels[i];
    const yHigh = levels[i + 1];
    const r = 0.025;

    const faceDefs = [
      { name: 'F', c1: [1, 1], c2: [1, -1] },
      { name: 'L', c1: [1, -1], c2: [-1, -1] },
      { name: 'B', c1: [-1, -1], c2: [-1, 1] },
      { name: 'R', c1: [-1, 1], c2: [1, 1] },
    ];

    for (const face of faceDefs) {
      const pLow1 = corner(yLow, face.c1[0], face.c1[1]);
      const pLow2 = corner(yLow, face.c2[0], face.c2[1]);
      const pHigh1 = corner(yHigh, face.c1[0], face.c1[1]);
      const pHigh2 = corner(yHigh, face.c2[0], face.c2[1]);

      beamBetween(`Brace_${face.name}_${i}A`, pLow1, pHigh2, r, steel, { parent: root });
      beamBetween(`Brace_${face.name}_${i}B`, pLow2, pHigh1, r, steel, { parent: root });
    }
  }

  // Switchback stairs climbing the front face (+X)
  const stairLevels = [0, 2, 4, 6, 8];
  for (let i = 0; i < stairLevels.length; i++) {
    const yBase = stairLevels[i];
    const yTop = yBase + 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const stepsPerFlight = 10;
    const stepDepth = 0.3;
    const stairWidth = 0.7;

    for (let s = 0; s < stepsPerFlight; s++) {
      const frac0 = s / stepsPerFlight;
      const frac1 = (s + 1) / stepsPerFlight;
      const y0 = yBase + frac0 * 2;
      const y1 = yBase + frac1 * 2;
      const hw0 = halfW(y0);
      const hw1 = halfW(y1);
      const z0 = dir * (stairWidth / 2) * (1 - 2 * frac0);
      const z1 = dir * (stairWidth / 2) * (1 - 2 * frac1);

      const midY = (y0 + y1) / 2;
      const midHW = halfW(midY);
      const midZ = (z0 + z1) / 2;

      // Step tread — sits right on the tower face
      createPart(`Stair_${i}_${s}`, boxGeo(stepDepth, 0.04, stairWidth / stepsPerFlight + 0.02), darkSteel, {
        position: [midHW + 0.05, midY + 0.05, midZ],
        parent: root,
      });
    }

    // Stringers (side beams) for this flight
    const zStart = dir * stairWidth / 2;
    const zEnd = -dir * stairWidth / 2;
    const hwLow = halfW(yBase);
    const hwHigh = halfW(yTop);
    beamBetween(`Stringer_${i}_L`, [hwLow + 0.05, yBase + 0.02, zStart], [hwHigh + 0.05, yTop + 0.02, zEnd], 0.02, steel, { parent: root });
    beamBetween(`Stringer_${i}_R`, [hwLow + 0.05 + stepDepth, yBase + 0.02, zStart], [hwHigh + 0.05 + stepDepth, yTop + 0.02, zEnd], 0.02, steel, { parent: root });

    // Landing at top of each flight
    const hwTop = halfW(yTop);
    createPart(`Landing_${i}`, boxGeo(stepDepth + 0.1, 0.05, stairWidth + 0.2), darkSteel, {
      position: [hwTop + 0.1, yTop + 0.025, 0],
      parent: root,
    });
  }

  // Cab on top - square glazed room
  const cabSize = 1.8;
  const cabY = H;
  const cabWallH = 2.2;
  const wallThk = 0.06;
  const cabHalf = cabSize / 2;

  createPart('CabFloor', boxGeo(cabSize, 0.1, cabSize), darkSteel, { position: [0, cabY, 0], parent: root });

  // Build each wall as a frame with glass infill
  // Front wall (+X) — door opening
  const frontFrameZ = cabHalf - 0.2;
  createPart('FrameFrontL', boxGeo(wallThk, cabWallH, 0.4), steel, { position: [cabHalf, cabY + 0.1 + cabWallH / 2, -frontFrameZ], parent: root });
  createPart('FrameFrontR', boxGeo(wallThk, cabWallH, 0.4), steel, { position: [cabHalf, cabY + 0.1 + cabWallH / 2, frontFrameZ], parent: root });
  createPart('FrameFrontTop', boxGeo(wallThk, 0.25, cabSize), steel, { position: [cabHalf, cabY + 0.1 + cabWallH - 0.125, 0], parent: root });
  createPart('FrameFrontBot', boxGeo(wallThk, 0.15, cabSize), steel, { position: [cabHalf, cabY + 0.1 + 0.075, 0], parent: root });
  createPart('GlassFront', boxGeo(0.02, cabWallH - 0.5, cabSize - 0.792), glass, { position: [cabHalf + 0.02, cabY + 0.1 + cabWallH / 2, 0], parent: root });
  createPart('MullionFrontV', boxGeo(wallThk + 0.01, cabWallH - 0.5, 0.04), steel, { position: [cabHalf, cabY + 0.1 + cabWallH / 2, 0], parent: root });

  // Back wall (-X) — full glass with mullions
  createPart('FrameBackL', boxGeo(wallThk, cabWallH, 0.4), steel, { position: [-cabHalf, cabY + 0.1 + cabWallH / 2, -frontFrameZ], parent: root });
  createPart('FrameBackR', boxGeo(wallThk, cabWallH, 0.4), steel, { position: [-cabHalf, cabY + 0.1 + cabWallH / 2, frontFrameZ], parent: root });
  createPart('FrameBackTop', boxGeo(wallThk, 0.25, cabSize), steel, { position: [-cabHalf, cabY + 0.1 + cabWallH - 0.125, 0], parent: root });
  createPart('FrameBackBot', boxGeo(wallThk, 0.15, cabSize), steel, { position: [-cabHalf, cabY + 0.1 + 0.075, 0], parent: root });
  createPart('GlassBack', boxGeo(0.02, cabWallH - 0.5, cabSize - 0.792), glass, { position: [-cabHalf - 0.02, cabY + 0.1 + cabWallH / 2, 0], parent: root });
  createPart('MullionBackV', boxGeo(wallThk + 0.01, cabWallH - 0.5, 0.04), steel, { position: [-cabHalf, cabY + 0.1 + cabWallH / 2, 0], parent: root });

  // Left wall (-Z) — full glass with mullions
  createPart('FrameLeftF', boxGeo(0.4, cabWallH, wallThk), steel, { position: [-frontFrameZ, cabY + 0.1 + cabWallH / 2, -cabHalf], parent: root });
  createPart('FrameLeftB', boxGeo(0.4, cabWallH, wallThk), steel, { position: [frontFrameZ, cabY + 0.1 + cabWallH / 2, -cabHalf], parent: root });
  createPart('FrameLeftTop', boxGeo(cabSize, 0.25, wallThk), steel, { position: [0, cabY + 0.1 + cabWallH - 0.125, -cabHalf], parent: root });
  createPart('FrameLeftBot', boxGeo(cabSize, 0.15, wallThk), steel, { position: [0, cabY + 0.1 + 0.075, -cabHalf], parent: root });
  createPart('GlassLeft', boxGeo(cabSize - 0.792, cabWallH - 0.5, 0.02), glass, { position: [0, cabY + 0.1 + cabWallH / 2, -cabHalf - 0.02], parent: root });
  createPart('MullionLeftV', boxGeo(0.04, cabWallH - 0.5, wallThk + 0.01), steel, { position: [0, cabY + 0.1 + cabWallH / 2, -cabHalf], parent: root });

  // Right wall (+Z) — full glass with mullions
  createPart('FrameRightF', boxGeo(0.4, cabWallH, wallThk), steel, { position: [-frontFrameZ, cabY + 0.1 + cabWallH / 2, cabHalf], parent: root });
  createPart('FrameRightB', boxGeo(0.4, cabWallH, wallThk), steel, { position: [frontFrameZ, cabY + 0.1 + cabWallH / 2, cabHalf], parent: root });
  createPart('FrameRightTop', boxGeo(cabSize, 0.25, wallThk), steel, { position: [0, cabY + 0.1 + cabWallH - 0.125, cabHalf], parent: root });
  createPart('FrameRightBot', boxGeo(cabSize, 0.15, wallThk), steel, { position: [0, cabY + 0.1 + 0.075, cabHalf], parent: root });
  createPart('GlassRight', boxGeo(cabSize - 0.792, cabWallH - 0.5, 0.02), glass, { position: [0, cabY + 0.1 + cabWallH / 2, cabHalf + 0.02], parent: root });
  createPart('MullionRightV', boxGeo(0.04, cabWallH - 0.5, wallThk + 0.01), steel, { position: [0, cabY + 0.1 + cabWallH / 2, cabHalf], parent: root });

  // Hipped roof (pyramid)
  const roofBaseY = cabY + 0.1 + cabWallH;
  const roofH = 0.9;
  const roofOverhang = 0.3;
  const roofHalf = cabSize / 2 + roofOverhang;

  createPart('Roof', coneGeo(roofHalf, roofH, 4), darkSteel, {
    position: [0, roofBaseY + roofH / 2, 0],
    parent: root,
  });

  // Roof fascia (trim at eave edge)
  const fasciaH = 0.08;
  beamBetween('FasciaFront', [roofHalf, roofBaseY + fasciaH / 2, roofHalf], [roofHalf, roofBaseY + fasciaH / 2, -roofHalf], 0.02, steel, { parent: root });
  beamBetween('FasciaBack', [-roofHalf, roofBaseY + fasciaH / 2, roofHalf], [-roofHalf, roofBaseY + fasciaH / 2, -roofHalf], 0.02, steel, { parent: root });
  beamBetween('FasciaLeft', [roofHalf, roofBaseY + fasciaH / 2, -roofHalf], [-roofHalf, roofBaseY + fasciaH / 2, -roofHalf], 0.02, steel, { parent: root });
  beamBetween('FasciaRight', [roofHalf, roofBaseY + fasciaH / 2, roofHalf], [-roofHalf, roofBaseY + fasciaH / 2, roofHalf], 0.02, steel, { parent: root });

  // Catwalk around cab
  const cwWidth = 0.9;
  const cwY = cabY + 0.1;
  const outerHalf = cabSize / 2 + cwWidth;

  // Catwalk floor
  createPart('CatwalkFront', boxGeo(cwWidth, 0.04, cabSize + cwWidth * 2), darkSteel, { position: [cabSize / 2 + cwWidth / 2, cwY, 0], parent: root });
  createPart('CatwalkBack', boxGeo(cwWidth, 0.04, cabSize + cwWidth * 2), darkSteel, { position: [-cabSize / 2 - cwWidth / 2, cwY, 0], parent: root });
  createPart('CatwalkLeft', boxGeo(cabSize + cwWidth * 2, 0.04, cwWidth), darkSteel, { position: [0, cwY, -cabSize / 2 - cwWidth / 2], parent: root });
  createPart('CatwalkRight', boxGeo(cabSize + cwWidth * 2, 0.04, cwWidth), darkSteel, { position: [0, cwY, cabSize / 2 + cwWidth / 2], parent: root });

  // Pipe railings around catwalk
  const railH = 1.0;
  const railR = 0.02;

  // Top rails
  beamBetween('RailFrontTop', [outerHalf, cwY + railH, -outerHalf], [outerHalf, cwY + railH, outerHalf], railR, steel, { parent: root });
  beamBetween('RailBackTop', [-outerHalf, cwY + railH, -outerHalf], [-outerHalf, cwY + railH, outerHalf], railR, steel, { parent: root });
  beamBetween('RailLeftTop', [-outerHalf, cwY + railH, -outerHalf], [outerHalf, cwY + railH, -outerHalf], railR, steel, { parent: root });
  beamBetween('RailRightTop', [-outerHalf, cwY + railH, outerHalf], [outerHalf, cwY + railH, outerHalf], railR, steel, { parent: root });

  // Mid rails
  beamBetween('RailFrontMid', [outerHalf, cwY + 0.5, -outerHalf], [outerHalf, cwY + 0.5, outerHalf], railR, steel, { parent: root });
  beamBetween('RailBackMid', [-outerHalf, cwY + 0.5, -outerHalf], [-outerHalf, cwY + 0.5, outerHalf], railR, steel, { parent: root });
  beamBetween('RailLeftMid', [-outerHalf, cwY + 0.5, -outerHalf], [outerHalf, cwY + 0.5, -outerHalf], railR, steel, { parent: root });
  beamBetween('RailRightMid', [-outerHalf, cwY + 0.5, outerHalf], [outerHalf, cwY + 0.5, outerHalf], railR, steel, { parent: root });

  // Corner posts
  const corners = [[outerHalf, -outerHalf], [outerHalf, outerHalf], [-outerHalf, -outerHalf], [-outerHalf, outerHalf]];
  for (const [x, z] of corners) {
    beamBetween(`Post_${x}_${z}`, [x, cwY, z], [x, cwY + railH, z], railR * 1.5, steel, { parent: root });
  }
  // Midpoint posts
  const mids = [[outerHalf, 0], [-outerHalf, 0], [0, -outerHalf], [0, outerHalf]];
  for (const [x, z] of mids) {
    beamBetween(`PostMid_${x}_${z}`, [x, cwY, z], [x, cwY + railH, z], railR, steel, { parent: root });
  }

  // Lightning rod and antenna on the roof peak
  const rodBaseY = roofBaseY + roofH;
  createPart('LightningRod', cylinderGeo(0.008, 0.015, 1.8, 8), steel, { position: [0, rodBaseY + 0.9, 0], parent: root });
  createPart('Antenna', cylinderGeo(0.006, 0.01, 2.5, 8), steel, { position: [0.5, rodBaseY + 1.25, 0.3], parent: root });

  // Toe board around catwalk (small lip at floor edge)
  const toeH = 0.1;
  beamBetween('ToeFront', [outerHalf, cwY + toeH / 2, -outerHalf], [outerHalf, cwY + toeH / 2, outerHalf], 0.015, steel, { parent: root });
  beamBetween('ToeBack', [-outerHalf, cwY + toeH / 2, -outerHalf], [-outerHalf, cwY + toeH / 2, outerHalf], 0.015, steel, { parent: root });
  beamBetween('ToeLeft', [-outerHalf, cwY + toeH / 2, -outerHalf], [outerHalf, cwY + toeH / 2, -outerHalf], 0.015, steel, { parent: root });
  beamBetween('ToeRight', [-outerHalf, cwY + toeH / 2, outerHalf], [outerHalf, cwY + toeH / 2, outerHalf], 0.015, steel, { parent: root });

  return root;
}
