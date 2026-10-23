const meta = { name: 'Fountain Cascade', role: 'prop' };

// Falling-water ribbons for plaza-fountain. SAME origin as the fountain (basin centre, ground Y=0),
// centred on the fountain axis so the host can spin it slowly around Y.
// Middle bowl lip: outer r 1.10, lip top y 2.06; water below at y 1.96 (r 1.01).
// Upper bowl lip: outer r 0.55, lip top y 2.89; lower basin water y 0.42.

const D2R = Math.PI / 180, TAU = Math.PI * 2, G = 9.81;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// One ribbon: wraps over the lip then falls on a ballistic arc; edges and surface wander.
function addSheet(b, o) {
  const { thc, hw, lip, launch, v0, yEnd, cols, rows, seed } = o;
  const R = rng(seed);
  const ph = [R() * TAU, R() * TAU, R() * TAU];
  const drop = launch[1] - yEnd, T = Math.sqrt(2 * drop / G);
  const stations = [lip, [launch[0] - 0.012, launch[1] + 0.012]];
  for (let i = 0; i <= rows; i++) {
    const t = T * Math.pow(i / rows, 0.85);
    stations.push([launch[0] + v0 * t, launch[1] - 0.5 * G * t * t]);
  }
  stations[stations.length - 1][1] = yEnd;
  const base = b.pos.length / 3, n = stations.length;
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    // sheet narrows as it falls and frays at the edges
    const w = hw * (1 - 0.38 * v) * (1 + 0.12 * Math.sin(5 * v + ph[0]));
    for (let j = 0; j <= cols; j++) {
      const u = j / cols * 2 - 1;
      const edge = Math.abs(u) > 0.99 ? 0.25 * v * Math.sin(17 * v + ph[1] + u) : 0;
      const th = thc + (u + edge) * w + 0.04 * hw * Math.sin(9 * v + ph[2]) * v;
      const ripple = 0.008 * Math.sin(6 * u + 11 * v + ph[1]) * v + 0.01 * u * u * v; // slight bow outward at edges
      const r = stations[i][0] + ripple;
      b.pos.push(r * Math.cos(th), stations[i][1], r * Math.sin(th));
      b.uv.push(j / cols, v);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols; j++) {
    const a = base + i * (cols + 1) + j, c = a + cols + 1;
    b.idx.push(a, c, c + 1, a, c + 1, a + 1);
  }
}

async function build() {
  const root = createRoot('FountainCascade');
  const water = await materialRecipe('kiln.material.glass.v1', { baseColor: '#dcecf4', roughness: 0.06, opacity: 0.42, doubleSided: true });
  water.name = 'FallingWater';

  // middle bowl -> lower basin (drop ~1.6 m); launch clear of the lion masks and spouts
  const mid = { pos: [], idx: [], uv: [] };
  const R1 = rng(11);
  let th = 7 * D2R;
  while (th < 360 * D2R - 6 * D2R) {
    const wide = R1() < 0.6;
    const hw = (wide ? 6 + R1() * 9 : 0.9 + R1() * 1.2) * D2R;
    addSheet(mid, {
      thc: th + hw, hw, lip: [1.062, 2.064], launch: [1.108, 2.032], v0: 0.62 + R1() * 0.18,
      yEnd: 0.40, cols: wide ? 6 : 1, rows: 13, seed: Math.floor(R1() * 1e6),
    });
    th += 2 * hw + (4 + R1() * 16) * D2R;
  }

  // upper bowl -> middle bowl (drop ~0.9 m)
  const up = mid; // one mesh for both tiers (Holodeck is draw-bound)
  const R2 = rng(29);
  th = 0;
  while (th < 360 * D2R - 8 * D2R) {
    const wide = R2() < 0.65;
    const hw = (wide ? 8 + R2() * 12 : 1.5 + R2() * 2) * D2R;
    addSheet(up, {
      thc: th + hw, hw, lip: [0.505, 2.893], launch: [0.566, 2.866], v0: 0.35 + R2() * 0.12,
      yEnd: 1.94, cols: wide ? 5 : 1, rows: 10, seed: Math.floor(R2() * 1e6),
    });
    th += 2 * hw + (5 + R2() * 18) * D2R;
  }
  createPart('Cascade', mergeVertices(meshGeo({ positions: mid.pos, indices: mid.idx, uvs: mid.uv })), water, { parent: root }).name = 'Cascade';
  return root;
}
