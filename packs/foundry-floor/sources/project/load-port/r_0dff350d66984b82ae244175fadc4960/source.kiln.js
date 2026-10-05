// Load port (FOUP interface at the tool front). Metres. +X = toward the aisle (working face), +Y up, +Z right.
// Origin = floor level on the tool mounting plane (X = 0), centred on the port width.
const meta = { name: 'load-port' };

// ---------- envelope (brief: 0.55 x 1.40 x 0.50) ----------
const HALF_W = 0.25;                         // frame / pedestal half width -> 0.50, under the 0.505 pitch
const H = 1.40;
const FRAME_T = 0.06;
const FRAME_CHAMFER = 0.006;
const OPEN_HW = 0.20;                        // door opening 0.40 x 0.34, bottom at Y 0.92
const OPEN_BOT = 0.92;
const OPEN_H = 0.34;
const OPEN_CY = OPEN_BOT + OPEN_H / 2;       // 1.09
const OPEN_R = 0.020;
const SEAM = 0.001;
const DOOR_T = 0.02;                         // X 0.04..0.06, flush with the frame face
const DOOR_OUT = 0.08;                       // -X travel behind the frame
const DOOR_DOWN = 0.40;                      // -Y travel

// ---------- pedestal / stage ----------
const PED_X0 = FRAME_T;
const PED_X1 = 0.51;                         // 0.45 deep
const PED_TOP = 0.85;
const PED_R = 0.010;
const STAGE_X0 = 0.14;
const STAGE_X1 = 0.55;
const STAGE_HW = 0.20;
const STAGE_TOP = 0.90;
const PAD_T = 0.005;
const SLAB_TOP = STAGE_TOP - PAD_T;
const DOCK = 0.0735;
const SEAT_X = 0.30;

// ---------- kinematic pins: mirror the FOUP base grooves turned 180 degrees about Y ----------
const PIN_RING = 0.085;
const PIN_ANGLES = [180, 300, 60];           // degrees from +X toward +Z, about the seat
const PIN_R0 = 0.0085;
const PIN_R1 = 0.0012;
const PIN_H = 0.0055;                        // FOUP groove is 0.007 deep

// ---------- status panel ----------
const PANEL_CY = 1.33;
const PANEL_T = 0.006;
const LAMP_R = 0.013;
const LAMP_T = 0.005;
const LAMP_Z = 0.045;

const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const shift = (pts, du, dv) => pts.map(([u, v]) => [u + du, v + dv]);

function chamferedRect(w, h, c) {
  const x = w / 2, y = h / 2;
  return [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]];
}

function roundedRectPts(w, h, r, n) {
  const cx = w / 2 - r, cy = h / 2 - r;
  const pts = [];
  for (const [x0, y0, a0] of [[cx, cy, 0], [-cx, cy, 90], [-cx, -cy, 180], [cx, -cy, 270]]) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      pts.push([x0 + r * Math.cos(a), y0 + r * Math.sin(a)]);
    }
  }
  return pts;
}

// plan outline of the stage slab (u = X, v = -Z): chamfered back corners, rounded nose corners
function stageOutline(n = 4) {
  const rf = 0.02, cb = 0.008;
  const pts = [[STAGE_X0 + cb, -STAGE_HW]];
  for (let i = 0; i <= n; i++) {
    const a = ((-90 + (90 * i) / n) * Math.PI) / 180;
    pts.push([STAGE_X1 - rf + rf * Math.cos(a), -STAGE_HW + rf + rf * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = ((90 * i) / n * Math.PI) / 180;
    pts.push([STAGE_X1 - rf + rf * Math.cos(a), STAGE_HW - rf + rf * Math.sin(a)]);
  }
  pts.push([STAGE_X0 + cb, STAGE_HW], [STAGE_X0, STAGE_HW - cb], [STAGE_X0, -STAGE_HW + cb]);
  return pts;
}

async function build() {
  const root = createRoot('load-port');

  const M = (name, hex, r, m) => {
    const x = gameMaterial(hex, { roughness: r, metalness: m });
    x.name = name;
    return x;
  };
  const grey = M('tool-panel-grey', 0xC5CBD1, 0.60, 0.0);
  const graphite = M('trim-graphite', 0x3B4148, 0.50, 0.1);
  const steel = M('stainless', 0xB9BEC3, 0.35, 1.0);
  const green = M('status-green', 0x22B14C, 0.40, 0.0);
  const amber = M('status-amber', 0xF5A623, 0.40, 0.0);

  const mesh = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  };
  const part = (name, m, parent = root) => {
    m.name = name;
    parent.add(m);
    return m;
  };

  // ---------- frame: 0.06 plate on the mounting plane with the door opening ----------
  const frameGeo = await extrudeProfile(shift(chamferedRect(2 * HALF_W, H, FRAME_CHAMFER), 0, H / 2), {
    depth: FRAME_T,
    holes: [shift(roundedRectPts(2 * OPEN_HW, OPEN_H, OPEN_R, 3), 0, OPEN_CY)],
    axis: 'x',
  });
  part('frame', mesh(frameGeo, grey, FRAME_T / 2, 0, 0));

  // ---------- pedestal: lower cabinet in front of the frame ----------
  const pedestal = new THREE.Group();
  part('pedestal', pedestal);
  const pedH = PED_TOP;
  part('pedestalBody', mesh(await roundedBoxGeo(PED_X1 - PED_X0, pedH, 2 * HALF_W, PED_R, { style: 'round', segments: 2 }), grey, (PED_X0 + PED_X1) / 2, pedH / 2, 0), pedestal);
  const panelGeo = await extrudeProfile(chamferedRect(0.32, 0.50, 0.012), { depth: 0.004, axis: 'x' });
  part('pedestalPanel', mesh(panelGeo, grey, PED_X1 + 0.002, 0.42, 0), pedestal);

  // ---------- stage: slab + seat pad + three kinematic pins; origin at the mounting datum so clips are plain X offsets ----------
  const stage = new THREE.Group();
  part('stage', stage);
  const slabH = SLAB_TOP - PED_TOP;
  const slabGeo = await extrudeProfile(stageOutline(), { depth: slabH, axis: 'y' });
  part('stageSlab', mesh(slabGeo, graphite, 0, PED_TOP + slabH / 2, 0), stage);
  const padW = 0.394;
  const padGeo = await extrudeProfile(chamferedRect(padW, 0.38, 0.012), { depth: PAD_T, axis: 'y' });
  part('stagePad', mesh(padGeo, graphite, 0.146 + padW / 2, SLAB_TOP + PAD_T / 2, 0), stage);
  const pinGeo = cylinderGeo(PIN_R1, PIN_R0, PIN_H, 10);
  PIN_ANGLES.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    part(`pin${i + 1}`, mesh(pinGeo, steel, SEAT_X + PIN_RING * Math.cos(a), STAGE_TOP + PIN_H / 2, PIN_RING * Math.sin(a)), stage);
  });
  const seat = new THREE.Object3D();
  seat.position.set(SEAT_X, STAGE_TOP, 0);
  part('foupSeat', seat, stage);

  // ---------- port door: fills the opening, X 0.04..0.06 ----------
  const doorGeo = await extrudeProfile(shift(roundedRectPts(2 * OPEN_HW - 2 * SEAM, OPEN_H - 2 * SEAM, OPEN_R - SEAM, 3), 0, OPEN_CY), {
    depth: DOOR_T,
    axis: 'x',
  });
  doorGeo.translate(FRAME_T - DOOR_T / 2, 0, 0);
  part('portDoor', mesh(doorGeo, graphite));

  // ---------- status panel above the opening, +X face ----------
  const panel = new THREE.Group();
  part('statusPanel', panel);
  const bodyGeo = await extrudeProfile(chamferedRect(0.22, 0.075, 0.008), { depth: PANEL_T, axis: 'x' });
  part('statusPanelBody', mesh(bodyGeo, graphite, FRAME_T + PANEL_T / 2, PANEL_CY, 0), panel);
  const lampGeo = cylinderGeo(LAMP_R, LAMP_R, LAMP_T, 12);
  part('lamp1', mesh(lampGeo, green, FRAME_T + PANEL_T + LAMP_T / 2, PANEL_CY, LAMP_Z, 0, 0, -Math.PI / 2), panel);
  part('lamp2', mesh(lampGeo, amber, FRAME_T + PANEL_T + LAMP_T / 2, PANEL_CY, -LAMP_Z, 0, 0, -Math.PI / 2), panel);

  // ---------- lod1: frame, pedestal and stage boxes plus the door panel, inset inside the detailed surfaces ----------
  const lod1 = new THREE.Group();
  lod1.name = 'lod1';
  lod1.userData.hideable = true;
  root.add(lod1);
  part('lodPortFrame', mesh(boxGeo(0.054, 1.390, 0.488), grey, 0.030, 0.699, 0), lod1);
  part('lodPortPedestal', mesh(boxGeo(0.440, 0.840, 0.490), grey, 0.285, 0.425, 0), lod1);
  part('lodPortStage', mesh(boxGeo(0.398, 0.042, 0.388), graphite, 0.345, 0.873, 0), lod1);
  part('lodPortDoor', mesh(planeGeo(0.38, 0.32), graphite, FRAME_T - 0.0015, OPEN_CY, 0, 0, Math.PI / 2, 0), lod1);
  lod1.visible = false;

  return root;
}

function animate(root) {
  const ease = (s) => s * s * (3 - 2 * s);
  const N = 10;
  const stageKeys = (from, to) =>
    Array.from({ length: N + 1 }, (_, i) => ({ time: (2 * i) / N, position: [from + (to - from) * ease(i / N), 0, 0] }));
  const doorOpen = [
    { time: 0, position: [0, 0, 0] },
    { time: 0.6, position: [-DOOR_OUT, 0, 0] },
    { time: 2, position: [-DOOR_OUT, -DOOR_DOWN, 0] },
  ];
  const doorClose = [
    { time: 0, position: [-DOOR_OUT, -DOOR_DOWN, 0] },
    { time: 1.4, position: [-DOOR_OUT, 0, 0] },
    { time: 2, position: [0, 0, 0] },
  ];
  return [
    createClip('Dock', 2, [positionTrack('stage', stageKeys(0, -DOCK))]),
    createClip('Undock', 2, [positionTrack('stage', stageKeys(-DOCK, 0))]),
    createClip('DoorOpen', 2, [positionTrack('portDoor', doorOpen)]),
    createClip('DoorClose', 2, [positionTrack('portDoor', doorClose)]),
  ];
}
