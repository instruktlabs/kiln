// Subfab pump and abatement kit. Metres, +X service side (pump fronts), +Y up, +Z right.
// Brief sizes pump 0.9 x 0.5 x 0.7 and cabinet 1.2 x 1.0 x 2.2 are read as length(X) x width(Z) x height(Y).
const meta = { name: 'Subfab pump and abatement kit' };

const PAD_X = 3.6, PAD_Z = 2.4, PAD_H = 0.15, BAND = 0.1;
const TOP_Y = 6.0;
const PUMP_L = 0.9, PUMP_W = 0.5, PUMP_X = 0.1;
const PUMP_ZS = [-0.85, -0.33, 0.33, 0.85];
const PIPE_R = 0.05, BEND_R = 0.10;
const LINE_Z = [-0.18, -0.06, 0.06, 0.18];
const LINE_RUN_Y = [1.45, 1.15, 1.15, 1.45];
const CAB_X = -1.1, CAB_W = 1.2, CAB_D = 1.0, CAB_H = 2.2;
const CAB_FRONT = CAB_X + CAB_W / 2;
const CAB_TOP = PAD_H + CAB_H;
const FAN_X = -1.3, FAN_Y = CAB_TOP + 0.12;
const DUCT_X = -0.72, DUCT_R = 0.15;
const TRAY_Y = 3.0, TRAY_Z = -0.9;
const TRAY_POSTS_X = [-1.6, -0.55, 0.95, 1.6];

function makeMat(name, hex, roughness, metalness, glow) {
  const o = { roughness: roughness, metalness: metalness, flatShading: false };
  if (glow) { o.emissive = hex; o.emissiveIntensity = 1; }
  const m = gameMaterial(hex, o);
  m.name = name;
  return m;
}
function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}
function part(name, geo, m, parent, pos, rot) {
  const p = createPart(name, geo, m, { position: pos, rotation: rot || [0, 0, 0], parent: parent });
  p.name = name;
  return p;
}
function box(name, m, parent, w, h, d, x, y, z) {
  return part(name, boxGeo(w, h, d), m, parent, [x, y, z]);
}
function circle(r, n) {
  const a = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; a.push([r * Math.cos(t), r * Math.sin(t)]); }
  return a;
}
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
// Rounds each 90 degree corner with one 45 degree midpoint between the tangent points.
function roundedPath(pts, R) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const din = unit([p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
    const dout = unit([b[0] - p[0], b[1] - p[1], b[2] - p[2]]);
    const s = [p[0] - din[0] * R, p[1] - din[1] * R, p[2] - din[2] * R];
    const c = [s[0] + dout[0] * R, s[1] + dout[1] * R, s[2] + dout[2] * R];
    const k = Math.SQRT1_2;
    out.push(s);
    out.push([c[0] - dout[0] * R * k + din[0] * R * k, c[1] - dout[1] * R * k + din[1] * R * k, c[2] - dout[2] * R * k + din[2] * R * k]);
    out.push([p[0] + dout[0] * R, p[1] + dout[1] * R, p[2] + dout[2] * R]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function build() {
  const pumpBlue = makeMat('pump-blue-grey', 0x4F5B66, 0.6, 0.1);
  const galv = makeMat('galvanized-duct', 0xA3A8AB, 0.5, 0.8);
  const steel = makeMat('stainless', 0xB9BEC3, 0.35, 1.0);
  const pvc = makeMat('pvc-grey', 0x8D9399, 0.7, 0.0);
  const panelGrey = makeMat('tool-panel-grey', 0xC5CBD1, 0.6, 0.0);
  const graphite = makeMat('trim-graphite', 0x3B4148, 0.5, 0.1);
  const yellow = makeMat('safety-yellow', 0xE9B824, 0.6, 0.0);
  const green = makeMat('status-green', 0x22B14C, 0.4, 0.0, true);
  const screenMat = makeMat('screen-glow', 0x9FD3F5, 0.3, 0.0, true);

  const root = createRoot('SubfabPumpAbatementKit');

  // pad: graphite core with flush yellow perimeter bands
  const pad = group('pad', root);
  const cx = PAD_X - 2 * BAND, cz = PAD_Z - 2 * BAND;
  box('pad_core', graphite, pad, cx, PAD_H, cz, 0, PAD_H / 2, 0);
  box('pad_band_front', yellow, pad, BAND, PAD_H, PAD_Z, PAD_X / 2 - BAND / 2, PAD_H / 2, 0);
  box('pad_band_rear', yellow, pad, BAND, PAD_H, PAD_Z, -PAD_X / 2 + BAND / 2, PAD_H / 2, 0);
  box('pad_band_right', yellow, pad, cx, PAD_H, BAND, 0, PAD_H / 2, PAD_Z / 2 - BAND / 2);
  box('pad_band_left', yellow, pad, cx, PAD_H, BAND, 0, PAD_H / 2, -PAD_Z / 2 + BAND / 2);

  // four dry pumps in two pairs, fronts to +X, one run lamp each
  const pumps = group('dryPumps', root);
  PUMP_ZS.forEach((z, i) => {
    const n = i + 1;
    const g = group('dryPump' + n, pumps, [PUMP_X, PAD_H, z]);
    box('dryPump' + n + '_skid', pumpBlue, g, PUMP_L, 0.065, PUMP_W, 0, 0.0325, 0);
    box('dryPump' + n + '_body', pumpBlue, g, 0.86, 0.30, 0.44, 0, 0.21, 0);
    part('dryPump' + n + '_motor', cylinderGeo(0.17, 0.17, 0.66, 12), pumpBlue, g, [-0.10, 0.53, 0], [0, 0, 90]);
    box('dryPump' + n + '_head', pumpBlue, g, 0.21, 0.34, 0.40, 0.335, 0.53, 0);
    box('dryPump' + n + '_lamp', green, g, 0.03, 0.05, 0.05, 0.435, 0.55, 0);
  });

  // abatement cabinet at the -X end, doors, handles, control panel
  const cab = group('abatementUnit', root);
  box('cabinet_body', panelGrey, cab, CAB_W, CAB_H, CAB_D, CAB_X, PAD_H + CAB_H / 2, 0);
  box('cabinet_door_left', panelGrey, cab, 0.02, 1.9, 0.48, CAB_FRONT + 0.005, 1.30, -0.245);
  box('cabinet_door_right', panelGrey, cab, 0.02, 1.9, 0.48, CAB_FRONT + 0.005, 1.30, 0.245);
  box('cabinet_handle_left', graphite, cab, 0.02, 0.30, 0.025, CAB_FRONT + 0.023, 1.30, -0.05);
  box('cabinet_handle_right', graphite, cab, 0.02, 0.30, 0.025, CAB_FRONT + 0.023, 1.30, 0.05);
  part('fan_shroud', lathe([[0.30, 0], [0.34, 0], [0.34, 0.16], [0.30, 0.16], [0.30, 0]], 16), panelGrey, cab, [FAN_X, CAB_TOP - 0.005, 0]);
  part('fan_pedestal', cylinderGeo(0.06, 0.06, 0.125, 10), panelGrey, cab, [FAN_X, CAB_TOP - 0.005 + 0.0625, 0]);

  const panel = group('controlPanel', root);
  box('panel_bezel', graphite, panel, 0.05, 0.32, 0.24, CAB_FRONT + 0.015 + 0.02, 1.81, 0.36);
  box('panel_screen', screenMat, panel, 0.006, 0.22, 0.17, CAB_FRONT + 0.015 + 0.045 + 0.002, 1.81, 0.36);

  // fan: pivot on its vertical axis, five pitched blades
  const fan = group('abatementFan', root, [FAN_X, FAN_Y, 0]);
  part('fan_hub', cylinderGeo(0.075, 0.075, 0.07, 10), graphite, fan, [0, 0.03, 0]);
  for (let i = 0; i < 5; i++) {
    const holder = group('fanBlade' + (i + 1), fan, [0, 0.03, 0]);
    holder.rotation.y = (i * 72) * Math.PI / 180;
    part('fanBlade' + (i + 1) + '_vane', boxGeo(0.21, 0.012, 0.10), graphite, holder, [0.17, 0, 0], [25, 0, 0]);
  }

  // forelines: four pipes up to exactly TOP_Y, clustered around (0, TOP_Y, 0)
  const lines = group('forelines', root);
  PUMP_ZS.forEach((z, i) => {
    const n = i + 1;
    const path = roundedPath([[0, 0.86, z], [0, LINE_RUN_Y[i], z], [0, LINE_RUN_Y[i], LINE_Z[i]], [0, TOP_Y, LINE_Z[i]]], BEND_R);
    part('foreline' + n, sweepProfile(circle(PIPE_R, 8), path, { cap: true, up: [1, 0, 0] }), steel, lines, [0, 0, 0]);
    part('foreline' + n + '_collar', cylinderGeo(0.07, 0.07, 0.07, 12), steel, lines, [0, 0.855, z]);
  });

  // exhaust duct from the cabinet roof to TOP_Y
  const duct = group('exhaustDuct', root);
  const ductBase = CAB_TOP - 0.05;
  part('duct_pipe', cylinderGeo(DUCT_R, DUCT_R, TOP_Y - 0.03 - ductBase, 12), galv, duct, [DUCT_X, (TOP_Y - 0.03 + ductBase) / 2, 0]);
  part('duct_collar', cylinderGeo(0.19, 0.19, 0.08, 12), galv, duct, [DUCT_X, CAB_TOP + 0.03, 0]);
  [2.7, 3.6, 4.5].forEach((y, i) => part('duct_band' + (i + 1), cylinderGeo(0.17, 0.17, 0.06, 12), galv, duct, [DUCT_X, y, 0]));
  part('duct_flange', cylinderGeo(0.19, 0.19, 0.06, 12), galv, duct, [DUCT_X, TOP_Y - 0.03, 0]);

  // drain lines: rear header behind the pumps, front header with one stub per pump
  const drains = group('drainLines', root);
  const dr = 0.03, dy = PAD_H + dr;
  part('drain_rear_header', cylinderGeo(dr, dr, 2.0, 8), pvc, drains, [-0.43, dy, 0], [90, 0, 0]);
  part('drain_cabinet_stub', cylinderGeo(dr, dr, 0.08, 8), pvc, drains, [-0.47, dy, 0], [0, 0, 90]);
  part('drain_front_header', cylinderGeo(dr, dr, 2.0, 8), pvc, drains, [0.85, dy, 0], [90, 0, 0]);
  PUMP_ZS.forEach((z, i) => part('drain_stub' + (i + 1), cylinderGeo(dr, dr, 0.31, 8), pvc, drains, [0.695, dy, z], [0, 0, 90]));

  // cable tray at Y 3.0 on four posts
  const tray = group('cableTray', root);
  box('tray_base', graphite, tray, 3.4, 0.02, 0.30, 0, TRAY_Y - 0.03, TRAY_Z);
  box('tray_rail_a', graphite, tray, 3.4, 0.06, 0.02, 0, TRAY_Y + 0.01, TRAY_Z - 0.14);
  box('tray_rail_b', graphite, tray, 3.4, 0.06, 0.02, 0, TRAY_Y + 0.01, TRAY_Z + 0.14);
  const postTop = TRAY_Y - 0.03;
  TRAY_POSTS_X.forEach((x, i) => box('tray_post' + (i + 1), graphite, tray, 0.06, postTop - PAD_H, 0.06, x, (PAD_H + postTop) / 2, TRAY_Z));

  group('toolAbove', root, [0, TOP_Y, 0]);
  return root;
}

function animate(root) {
  return [createClip('FanSpin', 1, [rotationTrack('abatementFan', [
    { time: 0, rotation: [0, 0, 0] },
    { time: 0.25, rotation: [0, 90, 0] },
    { time: 0.5, rotation: [0, 180, 0] },
    { time: 0.75, rotation: [0, 270, 0] },
    { time: 1, rotation: [0, 360, 0] }
  ])])];
}
