// Seed -> street plan. Pure: no imports, no clock, no Math.random, integer tenths of a metre for every
// length that has to add up. The same function runs in Node (stage 1 builds GLBs from it) and in a
// browser (stage 2 re-dresses the street from the values the kits carry).

// ---- deterministic random numbers: a keyed stream, forked by label so one lot never disturbs another ----
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export function random(key) {
  let a = hash32(String(key));
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const api = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p,
    weighted(pairs) {                       // [[value, weight], ...]
      let total = 0; for (const [, w] of pairs) total += w;
      let r = next() * total;
      for (const [v, w] of pairs) { r -= w; if (r < 0) return v; }
      return pairs[pairs.length - 1][0];
    },
    fork: label => random(`${key}/${label}`),
  };
  return api;
}

// ---- which lot widths can add up to a given street length (tenths of a metre) ----
const BAYS = [2, 3, 4, 5], WIDTHS = [16, 17, 18, 19, 20];
const ONE = new Set(); for (const n of BAYS) for (const w of WIDTHS) ONE.add(n * w);
export const REACH = [new Set([0]), ONE];
for (let k = 2; k <= 12; k++) { const s = new Set(); for (const a of REACH[k - 1]) for (const b of ONE) s.add(a + b); REACH.push(s); }

export const PALETTE = {
  stucco: ['#d9c7a3', '#e3d2b0', '#c9b08a', '#d8b9a0', '#b9c3b0', '#c4cfd6', '#e9dfc8', '#d6a77a', '#c98f7a', '#cdbf9a'],
  brick: ['#9a5a44', '#8a4a3a', '#a86a4c', '#7d4a3c', '#b07a5a'],
  timber: ['#e9dfc8', '#e3d6b8', '#d9cdb5', '#e6d2ae'],
  trim: ['#efe8d8', '#e6dcc6', '#f1ece0', '#d9d0bd'],
  joinery: ['#3f5a4a', '#22364a', '#7a2f2a', '#4a3528', '#1f2d3a', '#5a5f3a', '#2f4a4a', '#f1ece0'],
  roof: ['#6b4a3a', '#8a4a32', '#4a4f57', '#4f5660', '#5a4038', '#7a5546'],
  accent: ['#a33a2a', '#27405a', '#2f4a38', '#7a2f2a', '#c9a23a', '#e8d9b0', '#5a2a22'],
  flowers: ['#b23b4a', '#d9a03a', '#e6e0d0', '#8a4a9a', '#d96a4a'],
  stone: [
    { flag: '#b9b0a0', kerb: '#8e8a84', sett: '#6f6a66' },
    { flag: '#c9b48a', kerb: '#a8977a', sett: '#7a6f62' },
    { flag: '#a9a9a4', kerb: '#7e7f80', sett: '#5f6266' },
  ],
};
const TRADES = { key: 'locksmith', boot: 'cobbler', cup: 'cafe', book: 'bookshop', shears: 'tailor', pretzel: 'bakery' };

export function lotsFor(R, total, count) {
  const out = []; let rem = total;
  for (let i = 0; i < count; i++) {
    const left = count - i - 1, options = [];
    for (const n of BAYS) for (const w of WIDTHS) if (REACH[left].has(rem - n * w)) options.push([[n, w], n === 3 ? 4 : n === 4 ? 3 : n === 2 ? 2 : 1.5]);
    const [bays, bw] = R.weighted(options);
    out.push({ bays, bw, start: total - rem });
    rem -= bays * bw;
  }
  return out;
}

export function designBuilding(R, lot, prev, ctx) {
  const { bays, bw } = lot;
  const gate = ctx.gate === true;
  let type = gate ? 'gate' : R.weighted([['shop', 0.6], ['house', 0.28], ...(bays >= 3 ? [['inn', 0.12]] : [])]);
  if (type === 'inn' && ctx.lastEmblem === 'cup') type = 'shop';            // never two cups side by side
  const storeys = ctx.closing ? (gate ? 3 : R.pick([2, 3])) : R.weighted([[1, 0.2], [2, 0.55], [3, 0.25]]);
  const shop = R.int(32, 38), storey = R.int(27, 33);
  const finish = R.weighted([['stucco', 0.5], ['brick', 0.3], ['timber', 0.2]]);
  const wall = R.pick(PALETTE[finish].filter(c => c !== prev?.wall));
  const trim = R.pick(PALETTE.trim);
  const joinery = R.pick(PALETTE.joinery.filter(c => finish === 'brick' || c !== '#f1ece0'));
  const roofColour = R.pick(PALETTE.roof);
  const accent = R.pick(PALETTE.accent);

  const forms = gate ? [] : [['sideGable', 3]];
  if (bays <= 3) forms.push(['frontGable', finish === 'timber' ? 4 : 2]);
  if (bays <= 3 && finish !== 'timber') forms.push(['stepped', finish === 'brick' ? 4 : 0.6]);      // crow steps are a brick form first
  if (bays >= 3 && finish !== 'timber' && !gate) forms.push(['mansard', 2.5]);
  const allowed = forms.filter(f => f[0] !== prev?.form);
  const form = R.weighted(allowed.length ? allowed : forms);
  const widthT = bays * bw;
  const rise = form === 'frontGable' || form === 'stepped' ? Math.max(26, Math.min(38, Math.round(widthT * 0.65))) : R.int(24, 32);   // street gables are steep: about 52 degrees
  const dormers = form === 'sideGable' || form === 'mansard' ? R.pick(bays >= 4 ? ['one', 'two', 'two'] : bays === 3 ? ['none', 'one', 'two'] : ['none', 'one']) : 'none';
  const chimney = R.chance(0.7);

  // Upper storeys: one window order per storey, read from the first floor up.
  const shutters = finish !== 'timber' && R.chance(0.35) && bw >= 18;      // open shutters need a pier to fold back on
  const balcony = finish === 'timber' ? 'none' : R.weighted([['none', 0.5], [bays % 2 === 1 && bays >= 3 ? 'centre' : 'none', 0.3], ['all', 0.2]]);
  const blindBay = R.chance(0.1) ? R.int(0, bays - 1) : -1;
  const floors = [];
  for (let s = 0; s < storeys; s++) {
    const first = s === 0, top = s === storeys - 1;
    const window = finish === 'timber' ? 'casement' : finish === 'brick' ? 'sash' : first ? R.pick(['arched', 'sash', 'sash']) : R.pick(['sash', 'casement']);
    const head = finish === 'timber' ? 'plain' : first ? R.pick(['pediment', 'keystone', 'keystone']) : R.pick(['keystone', 'plain']);
    // A gable that faces the street rises flush from the wall: the dentil cornice belongs under street eaves only.
    floors.push({ window, head, cornice: top && finish !== 'timber' && R.chance(0.8) && (form === 'sideGable' || form === 'mansard'), shutters: shutters && window !== 'arched' });
  }

  // Ground storey.
  const fronts = [];
  let door = R.int(0, bays - 1), passage = -1;
  if (type === 'inn') { passage = R.chance(0.5) ? 0 : bays - 1; door = passage === 0 ? 1 : bays - 2; }
  if (gate) { passage = (bays - 1) >> 1; door = -1; }
  const house = type === 'house' || gate;
  for (let i = 0; i < bays; i++) fronts.push(i === passage ? 'passage' : house ? (i === door ? 'houseDoor' : 'houseWindow') : (i === door ? 'shopDoor' : 'shopWindow'));
  const awning = !house && !ctx.closing && R.chance(0.6);
  const awningDepth = Math.min(R.int(8, 14), ctx.pavement - 10);
  const emblem = house ? null : type === 'inn' ? 'cup' : R.pick(Object.keys(TRADES).filter(e => e !== ctx.lastEmblem));
  const sign = emblem && !ctx.closing ? { emblem, board: R.pick(['oval', 'rect', 'shield']), reach: R.int(14, 22) * 5, at: door + (R.chance(0.5) ? 0 : 1) } : null;

  return { ...lot, type, trade: type === 'inn' ? 'inn' : emblem ? TRADES[emblem] : type, storeys, shop, storey, finish, wall, trim, joinery, roofColour, accent, form, rise, dormers, chimney, balcony, blindBay, floors, fronts, door, passage, awning, awningDepth, sign, height: shop + storeys * storey, flowers: R.pick(PALETTE.flowers) };
}

export const closable = total => { for (const n1 of [2, 3]) for (const w1 of WIDTHS) for (const w2 of WIDTHS) for (const n3 of [2, 3]) for (const w3 of WIDTHS) if (n1 * w1 + 3 * w2 + n3 * w3 === total) return true; return false; };

/** Three lots that close a street end exactly, the middle one three bays wide for the gate arch. */
export function closingLots(R, total) {
  const options = [];
  for (const n1 of [2, 3]) for (const w1 of WIDTHS) for (const w2 of WIDTHS) for (const n3 of [2, 3]) for (const w3 of WIDTHS) if (n1 * w1 + 3 * w2 + n3 * w3 === total) options.push([[n1, w1], [3, w2], [n3, w3]]);
  if (!options.length) return null;
  let start = 0;
  return R.pick(options).map(([bays, bw]) => { const lot = { bays, bw, start }; start += bays * bw; return lot; });
}

/**
 * Plan one street block. Lengths in the plan are metres; `seed` is any string or number.
 * Returns { seed, street, sides: [{ name, frame, buildings }], placements: [{ id, kit, values, pos, yaw }] }.
 * The street runs along +Z from 0 to its length, centred on X = 0; pavements are at Y = 0.
 */
export function planStreet(seed, { dusk = false, buildingsPerSide = 7, length = 0, closed = true } = {}) {
  const R = random(`seed-street:${seed}`);
  const S = R.fork('street');
  const pavement = S.pick([24, 26, 28, 30]);                                                   // tenths
  // Only street widths that three closing lots can span exactly.
  const roads = [28, 30, 32, 34, 36].filter(r => !closed || closable(2 * (pavement + 4.5 + r)));
  const road = S.pick(roads.length ? roads : [32]), kerbHeight = S.pick([12, 14, 16]);          // tenths, hundredths
  const stone = S.pick(PALETTE.stone);
  const lamp = { arms: S.weighted([['post', 2], ['twin', 1]]), height: S.int(36, 44), iron: S.pick(['#1f2a26', '#1d1f22', '#23201d', '#1c2a33']) };
  const count = buildingsPerSide;
  let total = length ? Math.round(length * 10) : count * S.int(54, 60);
  while (!REACH[count].has(total)) total++;
  const half = pavement + 4.5 + road;                       // building line to centre line, tenths (kerb 0.15 + gutter 0.30)
  const m = t => t / 10;
  const placements = [];
  const put = (id, kit, values, pos, yaw) => placements.push({ id, kit, values, pos, yaw });
  const sides = [];

  // A row of buildings in its own frame: lx runs out from the building line, lz along the row.
  function row(name, frame, lots, { street }) {
    const [ox, oy, oz] = frame.origin, yaw0 = frame.yaw;
    const world = (lx, y, lz) => (yaw0 === 0 ? [ox + lx, oy + y, oz + lz] : yaw0 === 180 ? [ox - lx, oy + y, oz - lz] : yaw0 === 90 ? [ox + lz, oy + y, oz - lx] : [ox - lz, oy + y, oz + lx]);
    const lines = []; for (const lot of lots) for (let i = 0; i < lot.bays; i++) lines.push(lot.start + i * lot.bw);
    const length = lots.reduce((n, lot) => n + lot.bays * lot.bw, 0);

    // Lamps first: staggered between the sides, snapped to the nearest bay line.
    const lampAt = new Set();
    if (street) {
      for (let z = frame.lampStart; z < length - 15; z += 110) lampAt.add(lines.reduce((best, l) => (Math.abs(l - z) < Math.abs(best - z) ? l : best), lines[0]));
      for (const z of lampAt) put(`${name}-lamp-${z}`, 'street-lamp', { height: m(lamp.height), arms: lamp.arms, iron: lamp.iron, lit: dusk }, world(m(pavement) - 0.45, 0, m(z)), yaw0);
    }

    const buildings = []; let prev = null, lastEmblem = null, bayIndex = 0;
    const manholeBay = street ? R.fork(`manhole-${name}`).int(2, lines.length - 5) : -1;      // clear of the end aprons
    for (let b = 0; b < lots.length; b++) {
      const L = R.fork(`lot-${name}-${b}`), D = L.fork('dusk'), F = L.fork('furniture');
      const d = designBuilding(L, lots[b], prev, { pavement, lastEmblem, closing: !street, gate: !street && lots.length === 3 && b === 1 });
      prev = d; if (d.sign || d.type === 'inn') lastEmblem = d.type === 'inn' ? 'cup' : d.sign.emblem;
      buildings.push(d);
      const bw = m(d.bw), z0 = m(d.start), colours = { wall: d.wall, trim: d.trim, joinery: d.joinery };
      const lit = p => dusk && D.chance(p);
      const cafe = d.type === 'shop' && d.sign?.emblem === 'cup';

      for (let i = 0; i < d.bays; i++) {
        const z = z0 + i * bw, front = d.fronts[i];
        put(`${name}${b}-ground-${i}`, 'ground-bay', { bayWidth: bw, shopHeight: m(d.shop), front, awning: d.awning && front === 'shopWindow', awningDepth: m(d.awningDepth), accent: d.accent, lit: lit(0.75), ...colours }, world(0, 0, z), yaw0);
        for (let s = 0; s < d.storeys; s++) {
          const f = d.floors[s];
          put(`${name}${b}-floor${s + 1}-${i}`, 'facade-bay', {
            bayWidth: bw, storeyHeight: m(d.storey), finish: d.finish, window: s === d.storeys - 1 && i === d.blindBay ? 'blind' : f.window, head: f.head,
            cornice: f.cornice, shutters: f.shutters, balcony: s === 0 && (d.balcony === 'all' || (d.balcony === 'centre' && i === (d.bays - 1) / 2)), lit: lit(0.55), ...colours,
          }, world(0, m(d.shop + s * d.storey), z), yaw0);
        }
        if (street) {
          // Paving under the bay; one piece of ironwork at most.
          const grate = front === 'shopWindow' && !cafe && F.chance(0.18);
          const feature = bayIndex % 5 === 2 ? 'drain' : bayIndex === manholeBay ? 'manhole' : grate ? 'cellarGrate' : 'none';
          put(`${name}${b}-paving-${i}`, 'paving', { bayWidth: bw, pavement: m(pavement), road: m(road), kerbHeight: kerbHeight / 100, feature, extent: 'street', ...stone }, world(0, 0, z), yaw0);
        }
        bayIndex++;
      }

      // The roof's side walls depend on both neighbours' heights; its values are filled in after the row.
      put(`${name}${b}-roof`, 'roof', null, world(0, m(d.height), z0), yaw0);
      if (d.sign) put(`${name}${b}-sign`, 'signage', { reach: d.sign.reach / 100, board: d.sign.board, emblem: d.sign.emblem, accent: d.accent }, world(0, m(d.shop) + 0.62, z0 + d.sign.at * bw), yaw0);
      if (!street) continue;

      // Furniture: what the trade puts out on the pavement.
      const free = z => !lampAt.has(Math.round(z * 10));
      const piece = (id, values, lx, lz, turn = 0) => put(`${name}${b}-${id}`, 'street-furniture', { timber: '#6e4a2c', iron: lamp.iron, accent: d.flowers, ...values }, world(lx, 0, lz), (yaw0 + turn) % 360);
      if (cafe) {
        let n = 0;
        for (let i = 0; i < d.bays && n < 2; i++) if (d.fronts[i] === 'shopWindow') piece(`cafe-${n++}`, { piece: 'cafe', timber: '#8a6a45' }, 1.25, z0 + (i + 0.5) * bw);
      } else if (d.type === 'inn') {
        // Barrels stand against the piers either side of the door, never in front of it.
        const near = d.passage === 0 ? 1 : d.bays - 1, far = d.passage === 0 ? 2 : d.bays - 2;
        piece('barrel-0', { piece: 'barrel' }, 0.46, z0 + near * bw);
        piece('barrel-1', { piece: 'barrel' }, 0.46, z0 + far * bw);
        for (const k of [d.passage, d.passage + 1]) if (free(z0 + k * bw)) piece(`bollard-${k}`, { piece: 'bollard' }, m(pavement) - 0.28, z0 + k * bw);
      } else {
        // A house gets planters by its door, or a bench under a window with its back to the wall, facing the
        // street; a shop gets planters only.
        const dress = F.next(), windows = d.fronts.map((f, i) => (f === 'houseWindow' ? i : -1)).filter(i => i >= 0);
        if (dress < (d.type === 'house' ? 0.45 : 0.45)) for (const k of [d.door, d.door + 1]) piece(`planter-${k}`, { piece: 'planter' }, 0.52, z0 + k * bw);
        else if (d.type === 'house' && dress < 0.8 && windows.length) piece('bench', { piece: 'bench', length: m(d.bw - 2) }, 0.36, z0 + (windows[Math.floor(F.next() * windows.length)] + 0.5) * bw);
      }
    }

    // Roofs need both neighbours' heights: fill them in now. A row end shows its whole side wall.
    for (let b = 0; b < buildings.length; b++) {
      const d = buildings[b], next = buildings[b + 1], before = buildings[b - 1];
      const left = before ? Math.max(2, d.height - before.height) : d.height, right = next ? Math.max(2, d.height - next.height) : d.height;
      const D = R.fork(`lot-${name}-${b}`).fork('roof-dusk');
      placements.find(p => p.id === `${name}${b}-roof`).values = { width: m(d.bays * d.bw), rise: m(d.rise), form: d.form, finish: d.finish === 'brick' ? 'brick' : 'stucco', dormers: d.dormers, chimney: d.chimney, skirtLeft: m(left), skirtRight: m(right), skirtBack: m(d.height), lit: dusk && D.chance(0.4), roof: d.roofColour, wall: d.wall, trim: d.trim, joinery: d.joinery };
    }
    sides.push({ name, frame: { origin: frame.origin, yaw: yaw0 }, buildings });
  }

  row('A', { origin: [m(-half), 0, 0], yaw: 0, lampStart: 30 }, lotsFor(R.fork('lots-A'), total, count), { street: true });
  row('B', { origin: [m(half), 0, m(total)], yaw: 180, lampStart: 85 }, lotsFor(R.fork('lots-B'), total, count), { street: true });

  // Each end is closed by a gatehouse row. The carriageway stops at a kerb in front of it: an apron of
  // pavement-only paving runs across the street end, between the two side kerbs, up to the closing wall.
  let closedEnds = false;
  if (closed) {
    const north = closingLots(R.fork('lots-N'), 2 * half), south = closingLots(R.fork('lots-S'), 2 * half);
    if (north && south) {
      row('N', { origin: [m(-half), 0, m(total)], yaw: 90 }, north, { street: false });
      row('S', { origin: [m(half), 0, 0], yaw: 270 }, south, { street: false });
      // Four apron segments share the width between the side kerbs (twice the gutter and half carriageway).
      const span = 2 * road + 6, base = Math.floor(span / 4), extra = span - 4 * base;
      for (const [name, origin, yaw] of [['N', [m(-half), 0, m(total)], 90], ['S', [m(half), 0, 0], 270]]) {
        let lz = pavement + 1.5;
        for (let i = 0; i < 4; i++) {
          const bw = base + (i < extra ? 1 : 0), z = m(lz);
          const pos = yaw === 90 ? [origin[0] + z, 0, origin[2]] : [origin[0] - z, 0, origin[2]];
          put(`${name}-apron-${i}`, 'paving', { bayWidth: m(bw), pavement: m(pavement), road: m(road), kerbHeight: kerbHeight / 100, feature: 'none', extent: 'pavement', ...stone }, pos, yaw);
          lz += bw;
        }
      }
      closedEnds = true;
    }
  }
  return { seed: String(seed), dusk, street: { length: m(total), pavement: m(pavement), road: m(road), kerbHeight: kerbHeight / 100, width: m(2 * half), closedEnds, stone, lamp }, sides, placements };
}
