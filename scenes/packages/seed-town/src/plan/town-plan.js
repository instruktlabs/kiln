// Seed -> small town plan. Pure, like plan.mjs: no clock, no Math.random, integer tenths of a metre for
// every length that has to add up. A town is a few parallel streets. Between two streets stands a column
// of blocks, two rows of buildings back to back (16 m); each column is cut once, by a side lane or by the
// market square. The buildings on a cut are corner buildings: their flank onto the lane or square is
// dressed with the same bays as their front. The middle street is the high street: it is open at both
// ends, where the road leaves the town. Every other street is open at one end and closed at the other by
// a gatehouse row.
import { random, REACH, PALETTE, lotsFor, designBuilding, closingLots, closable } from './plan.js';

const DEPTH = 80;                 // building depth, tenths
const FLANK_PROUD = 0.005;        // a flank's bays stand 5 mm proud of the roof's side wall, so the two never share a plane
const m = t => t / 10;

/** How many lots suit a block of this length (tenths): the count whose mean lot is nearest 5.7 m, or 0. */
function countFor(len) {
  let best = 0, score = Infinity;
  for (let n = 2; n < REACH.length; n++) if (REACH[n].has(len)) { const s = Math.abs(len / n - 57); if (s < score) { score = s; best = n; } }
  return score <= 7 ? best : 0;
}

const frameWorld = frame => {
  const [ox, oy, oz] = frame.origin, yaw = frame.yaw;
  return (lx, y, lz) => (yaw === 0 ? [ox + lx, oy + y, oz + lz] : yaw === 180 ? [ox - lx, oy + y, oz - lz] : yaw === 90 ? [ox + lz, oy + y, oz - lx] : [ox - lz, oy + y, oz + lx]);
};

/** The flank of a corner building: its parent's storeys, finish and colours, plain windows, no shopfront. */
function designFlank(L, lot, parent) {
  const fronts = lot.fronts ? lot.fronts.slice() : Array.from({ length: lot.bays }, () => 'houseWindow');
  const plain = fronts.map((f, i) => (f === 'houseWindow' ? i : -1)).filter(i => i >= 0);
  if (plain.length > 2 && L.chance(0.4)) fronts[plain[L.int(1, plain.length - 2)]] = 'houseDoor';      // a side or back door
  const blind = parent.floors.map(() => Array.from({ length: lot.bays }, (_, i) => i).filter(() => L.chance(0.22)));
  return {
    ...parent, ...lot, type: 'flank', trade: 'flank', fronts, blind, door: -1, passage: -1, awning: false, sign: null, balcony: 'none', blindBay: -1,
    floors: parent.floors.map(f => ({ ...f, cornice: false, shutters: false })),
  };
}

/**
 * Lay one row of lots in its frame (lx out from the building line, lz along the row).
 * frame: { origin [m], yaw, pavement, road (tenths), lampStart? }.  lots: { bays, bw, start, cornerStart?, cornerEnd?, gate?, flankOf? }.
 * mode: 'street' (paving, lamps, furniture), 'closing' (a street end), 'square' or 'bare' (flanks and backs: no paving of their own).
 */
function layRow(ctx, name, frame, lots, mode) {
  const { R, dusk, put, placements, stone, lamp, kerbHeight } = ctx;
  const world = frameWorld(frame), yaw0 = frame.yaw, street = mode === 'street', pavement = frame.pavement;
  const lines = []; for (const lot of lots) for (let i = 0; i < lot.bays; i++) lines.push(lot.start + i * lot.bw);
  const span = Math.max(...lots.map(lot => lot.start + lot.bays * lot.bw));

  const lampAt = new Set();
  if (frame.lampStart !== undefined) {
    for (let z = frame.lampStart; z < span - 15; z += 110) lampAt.add(lines.reduce((best, l) => (Math.abs(l - z) < Math.abs(best - z) ? l : best), lines[0]));
    for (const z of lampAt) put(`${name}-lamp-${z}`, 'street-lamp', { height: m(lamp.height), arms: lamp.arms, iron: lamp.iron, lit: dusk }, world(m(pavement) - 0.45, 0, m(z)), yaw0);
  }

  const buildings = []; let prev = null, lastEmblem = null, bayIndex = 0;
  const manholeBay = street && lines.length >= 9 ? R.fork(`manhole-${name}`).int(2, lines.length - 5) : -1;
  for (let b = 0; b < lots.length; b++) {
    const lot = lots[b], flank = lot.flankOf !== undefined;
    const L = R.fork(`lot-${name}-${b}`), D = L.fork('dusk'), F = L.fork('furniture');
    const d = flank ? designFlank(L, { bays: lot.bays, bw: lot.bw, start: lot.start, fronts: lot.fronts }, lot.flankOf)
      : designBuilding(L, lot, prev, { pavement, lastEmblem, closing: mode === 'closing', gate: lot.gate === true });
    if (!flank) { prev = d; if (d.sign || d.type === 'inn') lastEmblem = d.type === 'inn' ? 'cup' : d.sign.emblem; }
    buildings.push(d);
    const bw = m(d.bw), z0 = m(d.start), colours = { wall: d.wall, trim: d.trim, joinery: d.joinery }, out = flank ? FLANK_PROUD : 0;
    const lit = p => dusk && D.chance(p);
    const cafe = d.type === 'shop' && d.sign?.emblem === 'cup';

    for (let i = 0; i < d.bays; i++) {
      const z = z0 + i * bw, front = d.fronts[i];
      put(`${name}${b}-ground-${i}`, 'ground-bay', { bayWidth: bw, shopHeight: m(d.shop), front, awning: d.awning && front === 'shopWindow', awningDepth: m(d.awningDepth), accent: d.accent, lit: lit(0.75), ...colours }, world(out, 0, z), yaw0);
      for (let s = 0; s < d.storeys; s++) {
        const f = d.floors[s], blind = (s === d.storeys - 1 && i === d.blindBay) || d.blind?.[s]?.includes(i);
        put(`${name}${b}-floor${s + 1}-${i}`, 'facade-bay', {
          bayWidth: bw, storeyHeight: m(d.storey), finish: d.finish, window: blind ? 'blind' : f.window, head: f.head,
          cornice: f.cornice, shutters: f.shutters, balcony: s === 0 && (d.balcony === 'all' || (d.balcony === 'centre' && i === (d.bays - 1) / 2)), lit: lit(0.55), ...colours,
        }, world(out, m(d.shop + s * d.storey), z), yaw0);
      }
      if (street) {
        const grate = front === 'shopWindow' && !cafe && F.chance(0.18);
        const feature = bayIndex % 5 === 2 ? 'drain' : bayIndex === manholeBay ? 'manhole' : grate ? 'cellarGrate' : 'none';
        put(`${name}${b}-paving-${i}`, 'paving', { bayWidth: bw, pavement: m(pavement), road: m(frame.road), kerbHeight: kerbHeight / 100, feature, extent: 'street', ...stone }, world(0, 0, z), yaw0);
      }
      bayIndex++;
    }
    if (flank) continue;

    put(`${name}${b}-roof`, 'roof', null, world(0, m(d.height), z0), yaw0);          // values follow, once the neighbours are known
    if (d.sign) put(`${name}${b}-sign`, 'signage', { reach: d.sign.reach / 100, board: d.sign.board, emblem: d.sign.emblem, accent: d.accent }, world(0, m(d.shop) + 0.62, z0 + d.sign.at * bw), yaw0);
    if (!street) continue;

    const free = z => !lampAt.has(Math.round(z * 10));
    const piece = (id, values, lx, lz, turn = 0) => put(`${name}${b}-${id}`, 'street-furniture', { timber: '#6e4a2c', iron: lamp.iron, accent: d.flowers, ...values }, world(lx, 0, lz), (yaw0 + turn) % 360);
    if (cafe) {
      let n = 0;
      for (let i = 0; i < d.bays && n < 2; i++) if (d.fronts[i] === 'shopWindow') piece(`cafe-${n++}`, { piece: 'cafe', timber: '#8a6a45' }, 1.25, z0 + (i + 0.5) * bw);
    } else if (d.type === 'inn') {
      const near = d.passage === 0 ? 1 : d.bays - 1, far = d.passage === 0 ? 2 : d.bays - 2;
      piece('barrel-0', { piece: 'barrel' }, 0.46, z0 + near * bw);
      piece('barrel-1', { piece: 'barrel' }, 0.46, z0 + far * bw);
      for (const k of [d.passage, d.passage + 1]) if (free(z0 + k * bw)) piece(`bollard-${k}`, { piece: 'bollard' }, m(pavement) - 0.28, z0 + k * bw);
    } else {
      const dress = F.next(), windows = d.fronts.map((f, i) => (f === 'houseWindow' ? i : -1)).filter(i => i >= 0);
      if (dress < 0.45) for (const k of [d.door, d.door + 1]) piece(`planter-${k}`, { piece: 'planter' }, 0.52, z0 + k * bw);
      else if (d.type === 'house' && dress < 0.8 && windows.length) piece('bench', { piece: 'bench', length: m(d.bw - 2) }, 0.36, z0 + (windows[Math.floor(F.next() * windows.length)] + 0.5) * bw);
    }
  }

  // Roofs: a side wall shows above a lower neighbour; a row end shows it whole; a corner's flank is dressed by its own bays.
  for (let b = 0; b < buildings.length; b++) {
    const d = buildings[b], lot = lots[b]; if (lot.flankOf !== undefined) continue;
    const joined = (x, y) => x && y && x.start + x.bays * x.bw === y.start;
    const before = joined(buildings[b - 1], d) ? buildings[b - 1] : null, next = joined(d, buildings[b + 1]) ? buildings[b + 1] : null;
    const left = lot.cornerStart || lot.endStart ? 2 : before ? Math.max(2, d.height - before.height) : d.height;
    const right = lot.cornerEnd || lot.endEnd ? 2 : next ? Math.max(2, d.height - next.height) : d.height;
    const D = R.fork(`lot-${name}-${b}`).fork('roof-dusk');
    placements.find(p => p.id === `${name}${b}-roof`).values = { width: m(d.bays * d.bw), rise: m(d.rise), form: d.form, finish: d.finish === 'brick' ? 'brick' : 'stucco', dormers: d.dormers, chimney: d.chimney, skirtLeft: m(left), skirtRight: m(right), skirtBack: m(lot.backed ? 2 : d.height), lit: dusk && D.chance(0.4), roof: d.roofColour, wall: d.wall, trim: d.trim, joinery: d.joinery };
  }
  const side = { name, mode, frame: { origin: frame.origin, yaw: yaw0, pavement: m(pavement), road: m(frame.road) }, buildings, ...(frame.touch ? { touch: frame.touch } : {}) };
  ctx.sides.push(side);
  return side;
}

/**
 * Dress the walls of a laid row that face out of the town: a row end (`endStart`, `endEnd`) gets the
 * building's flank, a `backed` lot gets a back front as wide as its street front. Passages come out the back.
 */
function dressOutside(ctx, name, frame, lots, side) {
  const world = frameWorld(frame), widths = { pavement: frame.pavement, road: frame.road };
  const span = Math.max(...lots.map(lot => lot.start + lot.bays * lot.bw));
  const flankOf = parent => { const wide = parent.bw >= 18; return { bays: wide ? 4 : 5, bw: wide ? 20 : 16, start: 0, flankOf: parent }; };
  lots.forEach((lot, b) => {
    const d = side.buildings[b], end = lot.start + lot.bays * lot.bw;
    // The flank at the start faces back along the row and runs from the back corner to the front one; at the end it runs from the front corner back.
    if (lot.endStart) layRow(ctx, `${name}${b}s`, { origin: world(-m(DEPTH), 0, m(lot.start)), yaw: (frame.yaw + 90) % 360, ...widths, touch: [world(0, 0, m(lot.start))] }, [flankOf(d)], 'bare');
    if (lot.endEnd) layRow(ctx, `${name}${b}e`, { origin: world(0, 0, m(end)), yaw: (frame.yaw + 270) % 360, ...widths, touch: [world(0, 0, m(end))] }, [flankOf(d)], 'bare');
  });
  const backs = [];
  for (let b = lots.length - 1; b >= 0; b--) {
    const lot = lots[b], d = side.buildings[b]; if (!lot.backed) continue;
    backs.push({ bays: d.bays, bw: d.bw, start: span - (lot.start + d.bays * d.bw), flankOf: d, fronts: d.fronts.map(f => (f === 'passage' ? 'passage' : 'houseWindow')).reverse() });
  }
  if (backs.length) layRow(ctx, `${name}b`, { origin: world(-m(DEPTH), 0, m(span)), yaw: (frame.yaw + 180) % 360, ...widths, touch: [world(-m(DEPTH), 0, m(span)), world(-m(DEPTH), 0, m(lots[0].start))] }, backs, 'bare');
}

/**
 * Plan a small town. Lengths in the plan are metres; `seed` is any string or number.
 * Returns { seed, town, streets, gaps, ends, sides, placements, cameras }. Streets run along +Z from 0 to the
 * town's length; street 'a' is centred on X = 0 and the others follow to the east (+X).
 */
export function planTown(seed, { dusk = false, streets = 3, buildings = 10, square = true } = {}) {
  const R = random(`seed-town:${seed}`);
  const T = R.fork('town');
  const stone = T.pick(PALETTE.stone), kerbHeight = T.pick([12, 14, 16]);
  const lamp = { arms: T.weighted([['post', 2], ['twin', 1]]), height: T.int(36, 44), iron: T.pick(['#1f2a26', '#1d1f22', '#23201d', '#1c2a33']) };
  let total = buildings * T.int(54, 60);
  while (!REACH[buildings].has(total)) total++;
  const placements = [], sides = [];
  const put = (id, kit, values, pos, yaw) => placements.push({ id, kit, values, pos, yaw });
  const ctx = { R, dusk, put, placements, sides, stone, lamp, kerbHeight };
  const ground = { ...stone, kerbHeight: kerbHeight / 100 };

  // ---- streets: each its own width, laid side by side with a block column between ----
  const S = [];
  for (let s = 0; s < streets; s++) {
    const Q = R.fork(`street-${s}`), pavement = Q.pick([24, 26, 28, 30]);
    const roads = [28, 30, 32, 34, 36].filter(r => closable(2 * (pavement + 4.5 + r)));
    const road = Q.pick(roads.length ? roads : [32]), half = pavement + 4.5 + road;
    const x = s === 0 ? 0 : S[s - 1].x + S[s - 1].half + 2 * DEPTH + half;
    S.push({ name: 'abcdefgh'[s], pavement, road, half, x });
  }

  // ---- one cut per column: a lane, or the market square ----
  const squareAt = square && streets > 1 ? T.int(0, streets - 2) : -1;
  const gaps = [];
  for (let c = 0; c < streets - 1; c++) {
    const Q = R.fork(`gap-${c}`), isSquare = c === squareAt;
    const lanePavement = Q.pick([20, 22]), laneRoad = Q.pick([26, 28]);
    const w = isSquare ? Q.pick([180, 200]) : 2 * lanePavement + 9 + 2 * laneRoad;
    const all = [];
    for (let zl = 110; zl <= total - w - 110; zl++) if (countFor(zl) && countFor(total - w - zl)) all.push(zl);
    if (!all.length) throw new Error(`town ${seed}: no place for the cut in column ${c}`);
    const centred = all.filter(zl => zl >= (total - w) * 0.3 && zl <= (total - w) * 0.7);
    // Cuts in neighbouring columns never line up: each lane ends on a facade.
    const before = gaps[c - 1], apart = (centred.length ? centred : all).filter(zl => !before || Math.abs(zl + w / 2 - (before.zl + before.w / 2)) >= 90);
    const zl = Q.pick(apart.length ? apart : centred.length ? centred : all);
    gaps.push({ column: c, type: isSquare ? 'square' : 'lane', zl, zh: zl + w, w, lanePavement, laneRoad, xw: S[c].x + S[c].half, xe: S[c].x + S[c].half + 2 * DEPTH });
  }

  // ---- the rows along the streets ----
  const rows = {};
  for (let s = 0; s < streets; s++) {
    const st = S[s];
    for (const sideName of ['W', 'E']) {
      const name = st.name + sideName, west = sideName === 'W';
      const gap = west ? gaps[s - 1] : gaps[s];
      let lots;
      if (!gap) lots = lotsFor(R.fork(`lots-${name}`), total, buildings);
      else {
        // In this row's own direction: the first block, the cut, the second block.
        const first = west ? gap.zl : total - gap.zh, second = total - gap.w - first;
        const a = lotsFor(R.fork(`lots-${name}-0`), first, countFor(first)), b = lotsFor(R.fork(`lots-${name}-1`), second, countFor(second));
        a[a.length - 1].cornerEnd = true; b[0].cornerStart = true;
        lots = [...a, ...b.map(lot => ({ ...lot, start: lot.start + first + gap.w }))];
      }
      // Both row ends look out of the town, and so does the back of a row with no block behind it.
      lots[0].endStart = true; lots[lots.length - 1].endEnd = true;
      if (!gap) for (const lot of lots) lot.backed = true;
      const frame = { ...(west ? { origin: [m(st.x - st.half), 0, 0], yaw: 0, lampStart: 30 } : { origin: [m(st.x + st.half), 0, m(total)], yaw: 180, lampStart: 85 }), pavement: st.pavement, road: st.road };
      rows[name] = { side: layRow(ctx, name, frame, lots, 'street'), lots };
      dressOutside(ctx, name, frame, lots, rows[name].side);
    }
  }

  // ---- each cut: four flanks, then a lane with its two junctions or the square's paving ----
  const corner = (rowName, which) => { const { side, lots } = rows[rowName]; return side.buildings[lots.findIndex(lot => lot[which])]; };
  const flankLots = parents => parents.map((parent, i) => { const wide = parent.bw >= 18; return { bays: wide ? 4 : 5, bw: wide ? 20 : 16, start: i * DEPTH, flankOf: parent }; });
  for (const g of gaps) {
    const west = S[g.column], east = S[g.column + 1], id = `g${g.column}`, lane = g.type === 'lane';
    const mode = lane ? 'street' : 'square', widths = { pavement: g.lanePavement, road: g.laneRoad };
    // South of the cut, facing north: the row runs west from the east street. North of it, facing south: east from the west street.
    layRow(ctx, `${id}S`, { origin: [m(g.xe), 0, m(g.zl)], yaw: 270, ...widths, ...(lane ? { lampStart: 40 } : {}) }, flankLots([corner(east.name + 'W', 'cornerEnd'), corner(west.name + 'E', 'cornerStart')]), mode);
    layRow(ctx, `${id}N`, { origin: [m(g.xw), 0, m(g.zh)], yaw: 90, ...widths, ...(lane ? { lampStart: 120 } : {}) }, flankLots([corner(west.name + 'E', 'cornerEnd'), corner(east.name + 'W', 'cornerStart')]), mode);
    const eastSide = frameWorld({ origin: [m(west.x + west.half), 0, m(total)], yaw: 180 }), westSide = frameWorld({ origin: [m(east.x - east.half), 0, 0], yaw: 0 });
    if (lane) {
      const mouth = { lanePavement: m(g.lanePavement), laneRoad: m(g.laneRoad), ...ground };
      put(`${id}-junction-${west.name}`, 'junction', { pavement: m(west.pavement), road: m(west.road), ...mouth }, eastSide(0, 0, m(total - g.zh)), 180);
      put(`${id}-junction-${east.name}`, 'junction', { pavement: m(east.pavement), road: m(east.road), ...mouth }, westSide(0, 0, m(g.zl)), 0);
      // Two bollards guard each corner of the mouth.
      for (const [tag, at, st, yaw] of [[west.name, eastSide, west, 180], [east.name, westSide, east, 0]]) {
        const z0 = tag === west.name ? total - g.zh : g.zl;
        for (const [k, lz] of [[0, z0 + g.lanePavement - 3], [1, z0 + g.w - g.lanePavement + 3]]) put(`${id}-bollard-${tag}-${k}`, 'street-furniture', { piece: 'bollard', iron: lamp.iron }, at(m(st.pavement) - 0.3, 0, m(lz)), yaw);
      }
    } else {
      // The streets' own paving runs on past the square; the square is paved in setts at pavement level.
      const n = g.w / 20;
      for (let i = 0; i < n; i++) {
        const feature = i % 5 === 2 ? 'drain' : 'none';
        put(`${id}-paving-${west.name}-${i}`, 'paving', { bayWidth: 2, pavement: m(west.pavement), road: m(west.road), feature, extent: 'street', ...ground }, eastSide(0, 0, m(total - g.zh + i * 20)), 180);
        put(`${id}-paving-${east.name}-${i}`, 'paving', { bayWidth: 2, pavement: m(east.pavement), road: m(east.road), feature, extent: 'street', ...ground }, westSide(0, 0, m(g.zl + i * 20)), 0);
        for (let k = 0; k < 5; k++) put(`${id}-plaza-${k}-${i}`, 'paving', { bayWidth: 2, pavement: 3.2, road: 3.2, feature: 'none', extent: 'plaza', ...ground }, [m(g.xw + k * 32), 0, m(g.zl + i * 20)], 0);
      }
      // Dressing: lamps on the four corners, a fountain in the middle with benches round it, market stalls.
      const Q = R.fork(`square-${g.column}`), cx = m(g.xw + DEPTH), cz = m((g.zl + g.zh) / 2);
      for (const [k, x, z] of [[0, g.xw + 12, g.zl + 12], [1, g.xe - 12, g.zl + 12], [2, g.xw + 12, g.zh - 12], [3, g.xe - 12, g.zh - 12]]) put(`${id}-lamp-${k}`, 'street-lamp', { height: m(lamp.height), arms: 'twin', iron: lamp.iron, lit: dusk }, [m(x), 0, m(z)], k % 2 ? 180 : 0);
      put(`${id}-fountain`, 'street-furniture', { piece: 'fountain', iron: lamp.iron }, [cx, 0, cz], 0);
      for (const [k, dx, dz, yaw] of [[0, -3.6, 0, 0], [1, 3.6, 0, 180], [2, 0, -3.6, 270], [3, 0, 3.6, 90]]) put(`${id}-bench-${k}`, 'street-furniture', { piece: 'bench', length: 2, timber: '#6e4a2c', iron: lamp.iron }, [cx + dx, 0, cz + dz], yaw);
      const canvas = PALETTE.accent.filter(c => c !== '#e8d9b0');
      for (const [k, dx, dz, yaw] of [[0, -5.2, -m(g.w) / 2 + 3.4, 270], [1, 0.4, -m(g.w) / 2 + 3.4, 270], [2, 5.2, m(g.w) / 2 - 3.4, 90], [3, -0.4, m(g.w) / 2 - 3.4, 90]]) {
        if (k === 3 && g.w < 200) continue;                                   // a short square takes three stalls
        put(`${id}-stall-${k}`, 'street-furniture', { piece: 'stall', timber: '#7a5a3a', accent: Q.pick(canvas) }, [cx + dx, 0, cz + dz], yaw);
      }
    }
  }

  // ---- street ends: the high street runs through the town and out at both ends; every other street
  // leaves by one end and is closed at the other by a gatehouse row behind an apron of pavement ----
  const high = Math.min(1, streets - 1), streetEnds = [];
  let sideOpen = T.fork('side-roads').pick(['N', 'S']);
  for (const st of S) {
    const north = closingLots(R.fork(`lots-${st.name}N`), 2 * st.half), south = closingLots(R.fork(`lots-${st.name}S`), 2 * st.half);
    const ends = [['N', north, [m(st.x - st.half), 0, m(total)], 90], ['S', south, [m(st.x + st.half), 0, 0], 270]];
    // Side streets take turns, so both edges of the town have more than one road.
    const open = S.indexOf(st) === high ? 'NS' : sideOpen;
    if (S.indexOf(st) !== high) sideOpen = sideOpen === 'N' ? 'S' : 'N';
    for (const [tag, lots, origin, yaw] of ends) {
      const isOpen = open.includes(tag);
      streetEnds.push({ street: st.name, end: tag, open: isOpen, x: m(st.x), z: tag === 'N' ? m(total) : 0, road: m(st.road) });
      if (isOpen) continue;
      lots[1].gate = true; lots[0].endStart = true; lots[2].endEnd = true;
      for (const lot of lots) lot.backed = true;
      const frame = { origin, yaw, pavement: st.pavement, road: st.road };
      dressOutside(ctx, st.name + tag, frame, lots, layRow(ctx, st.name + tag, frame, lots, 'closing'));
      const span = 2 * st.road + 6, base = Math.floor(span / 4), extra = span - 4 * base;
      let lz = st.pavement + 1.5;
      for (let i = 0; i < 4; i++) {
        const bw = base + (i < extra ? 1 : 0), z = m(lz);
        put(`${st.name}${tag}-apron-${i}`, 'paving', { bayWidth: m(bw), pavement: m(st.pavement), road: m(st.road), feature: 'none', extent: 'pavement', ...ground }, yaw === 90 ? [origin[0] + z, 0, origin[2]] : [origin[0] - z, 0, origin[2]], yaw);
        lz += bw;
      }
    }
  }

  // ---- cameras: explicit world shots, so every build of a seed is looked at the same way ----
  const x0 = m(S[0].x - S[0].half - DEPTH), x1 = m(S[streets - 1].x + S[streets - 1].half + DEPTH), L = m(total), cx = (x0 + x1) / 2;
  const shot = (name, position, target, fovDeg) => ({ name, camera: { type: 'explicit', projection: 'perspective', relativeTo: 'world', position, target, fovDeg } });
  const mid = S[Math.min(1, streets - 1)], cameras = {};
  cameras.TOWN = shot('TOWN', [x0 - 30, 64, -50], [cx, 0, L * 0.5], 46);
  cameras.TOWN_BACK = shot('TOWN BACK', [x1 + 30, 64, L + 50], [cx, 0, L * 0.5], 46);
  cameras.PLAN = shot('PLAN', [cx, 150, L / 2 - 0.5], [cx, 0, L / 2], 38);
  cameras.STREET = shot('STREET', [m(mid.x) + 1.0, 1.65, 1.5], [m(mid.x) - 1.5, 4.0, L * 0.6], 62);
  cameras.STREET_BACK = shot('STREET BACK', [m(S[0].x) - 1.0, 1.65, L - 1.5], [m(S[0].x) + 1.5, 4.0, L * 0.4], 62);
  for (const g of gaps) {
    const west = S[g.column], zc = m((g.zl + g.zh) / 2), tag = g.type === 'square' ? 'SQUARE' : 'LANE';
    // From the far pavement of the west street, looking through the cut to the facade that closes it.
    cameras[tag] = shot(tag, [m(west.x - west.half + west.pavement) - 0.8, 1.65, zc - (g.type === 'square' ? 5 : 2.2)], [m(g.xe), 3.2, zc + (g.type === 'square' ? 1.5 : 0.6)], g.type === 'square' ? 72 : 62);
    cameras[`${tag}_OVER`] = shot(`${tag} OVER`, [m(g.xw) - 9, 17, m(g.zl) - 9], [m(g.xw + DEPTH), 1, zc], 60);
    cameras[`${tag}_CORNER`] = shot(`${tag} CORNER`, [m(west.x) - 0.5, 1.65, m(g.zh) + 5.5], [m(g.xw) + 2, 4.2, m(g.zl) - 1], 64);
  }

  return {
    seed: String(seed), dusk,
    town: { length: L, x0, x1, kerbHeight: kerbHeight / 100, stone, lamp, buildings: sides.reduce((n, s) => n + s.buildings.filter(b => b.type !== 'flank').length, 0) },
    streets: S.map(st => ({ name: st.name, x: m(st.x), pavement: m(st.pavement), road: m(st.road), width: m(2 * st.half) })),
    gaps: gaps.map(g => ({ column: g.column, type: g.type, from: m(g.zl), to: m(g.zh), x0: m(g.xw), x1: m(g.xe), lanePavement: m(g.lanePavement), laneRoad: m(g.laneRoad) })),
    ends: streetEnds, sides, placements, cameras,
  };
}
