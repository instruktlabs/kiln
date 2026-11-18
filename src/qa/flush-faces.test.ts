/**
 * Flush faces: two faces on one plane, facing the same way, that share area. A renderer cannot
 * order them, so they flicker (z-fighting). Faces that only touch, face each other, or sit a
 * clear gap apart are not reported.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  analyzeFlushFaces,
  findFlushFaces,
  flushFaceWarnings,
  type FlushPart,
} from './flush-faces';

/** A flat quad at height `y` over [x0, x1] × [z0, z1], facing +Y (or −Y when `down`). */
function quad(x0: number, z0: number, x1: number, z1: number, y = 0, down = false): number[] {
  const a = [x0, y, z0];
  const b = [x0, y, z1];
  const c = [x1, y, z1];
  const d = [x1, y, z0];
  return down ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d];
}
const part = (ref: string, positions: number[], more: Partial<FlushPart> = {}): FlushPart => ({
  ref,
  positions,
  ...more,
});
const floor = part('Floor', quad(0, 0, 2, 1));

describe('findFlushFaces', () => {
  test('reports two parts that share area on one plane, with the area and the gap', () => {
    const report = findFlushFaces([floor, part('Plaque', quad(0.5, 0.25, 1.5, 0.75))]);
    expect(report.pairs).toHaveLength(1);
    const [pair] = report.pairs;
    expect(pair!.parts).toEqual(['Floor', 'Plaque']);
    expect(pair!.sharedArea).toBeCloseTo(0.5, 6);
    expect(pair!.maxGap).toBe(0);
    expect(pair!.facing).toBe('same');
    expect(pair!.normal).toEqual([0, 1, 0]);
    expect(pair!.at[1]).toBe(0);
    expect(report).toMatchObject({
      version: 'kiln.flush-faces.v1',
      triangles: 4,
      truncated: false,
      omitted: 0,
    });
  });

  test('a face a hair above another still fights; one 2 mm clear does not', () => {
    const near = findFlushFaces([floor, part('Plaque', quad(0.5, 0.25, 1.5, 0.75, 0.0003))]);
    expect(near.pairs).toHaveLength(1);
    expect(near.pairs[0]!.maxGap).toBeCloseTo(0.0003, 6);
    expect(
      findFlushFaces([floor, part('Plaque', quad(0.5, 0.25, 1.5, 0.75, 0.002))]).pairs,
    ).toEqual([]);
  });

  test('faces that only meet along an edge or at a corner are not reported', () => {
    expect(findFlushFaces([floor, part('Next', quad(2, 0, 4, 1))]).pairs).toEqual([]);
    expect(findFlushFaces([floor, part('Corner', quad(2, 1, 3, 2))]).pairs).toEqual([]);
    // The two triangles of one quad share their diagonal and nothing else.
    expect(findFlushFaces([floor]).pairs).toEqual([]);
  });

  test('faces that face each other are contact, unless one of them is drawn on both sides', () => {
    const underside = quad(0.5, 0.25, 1.5, 0.75, 0, true);
    expect(findFlushFaces([floor, part('Crate', underside)]).pairs).toEqual([]);
    const both = findFlushFaces([floor, part('Leaf', underside, { doubleSided: true })]);
    expect(both.pairs).toHaveLength(1);
    expect(both.pairs[0]!.facing).toBe('opposite');
  });

  test('a face laid over another inside one part is reported against itself', () => {
    const report = findFlushFaces([
      part('Wall', [...quad(0, 0, 2, 1), ...quad(0.5, 0.25, 1.5, 0.75)]),
    ]);
    expect(report.pairs).toHaveLength(1);
    expect(report.pairs[0]!.parts).toEqual(['Wall', 'Wall']);
    expect(report.pairs[0]!.sharedArea).toBeCloseTo(0.5, 6);
  });

  test('triangles that share corners are still measured when they overlap', () => {
    // A fan around the origin: neighbours share an edge or a corner and no area.
    const fan: number[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const b = ((k + 1) * Math.PI) / 3;
      fan.push(0, 0, 0, Math.cos(a), 0, -Math.sin(a), Math.cos(b), 0, -Math.sin(b));
    }
    expect(findFlushFaces([part('Fan', fan)]).pairs).toEqual([]);

    // A triangle folded back over its neighbour across their shared edge.
    const folded = [...fan, 0, 0, 0, 1, 0, 0, 0.5, 0, -0.5];
    const overEdge = findFlushFaces([part('Fan', folded)]);
    expect(overEdge.pairs).toHaveLength(1);
    expect(overEdge.pairs[0]!.parts).toEqual(['Fan', 'Fan']);
    expect(overEdge.pairs[0]!.sharedArea).toBeCloseTo(0.25, 6);

    // A triangle that shares only the centre, laid across two of the fan's triangles.
    const across = [...fan, 0, 0, 0, 0.9, 0, -0.2, 0.2, 0, -0.9];
    const overCorner = findFlushFaces([part('Fan', across)]);
    expect(overCorner.pairs).toHaveLength(1);
    expect(overCorner.pairs[0]!.trianglePairs).toBe(2);

    // The same across two parts, and with the new triangle turned the other way and drawn on
    // both sides.
    const turned = [0, 0, 0, 0.2, 0, -0.9, 0.9, 0, -0.2];
    const other = findFlushFaces([part('Fan', fan), part('Leaf', turned, { doubleSided: true })]);
    expect(other.pairs).toHaveLength(1);
    expect(other.pairs[0]).toMatchObject({ parts: ['Fan', 'Leaf'], facing: 'opposite' });
  });

  test('crossing and perpendicular faces are not flush', () => {
    const tilted = quad(0.5, 0.25, 1.5, 0.75).map((value, index) =>
      index % 3 === 1 ? value + (index % 9 < 3 ? 0.03 : -0.01) : value,
    );
    expect(findFlushFaces([floor, part('Tilted', tilted)]).pairs).toEqual([]);
    const upright = [0, 0, 0.5, 0, 1, 0.5, 2, 1, 0.5, 0, 0, 0.5, 2, 1, 0.5, 2, 0, 0.5];
    expect(findFlushFaces([floor, part('Upright', upright)]).pairs).toEqual([]);
  });

  test('a sliver too small to see for the size of the asset is not reported', () => {
    // 1 mm × 10 mm on an asset about 2 m across.
    expect(findFlushFaces([floor, part('Sliver', quad(1.999, 0.5, 2.5, 0.51))]).pairs).toEqual([]);
    // The same sliver is most of a 2 cm asset.
    const small = findFlushFaces([
      part('Chip', quad(0, 0, 0.02, 0.01)),
      part('Label', quad(0.01, 0, 0.011, 0.01)),
    ]);
    expect(small.pairs).toHaveLength(1);
  });

  test('alternates that are never drawn together are not compared', () => {
    const lod0 = part('Detail', quad(0, 0, 2, 1), { alternate: { chain: 'door', level: 0 } });
    const lod1 = part('Proxy', quad(0, 0, 2, 1), { alternate: { chain: 'door', level: 1 } });
    expect(findFlushFaces([lod0, lod1]).pairs).toEqual([]);
    expect(findFlushFaces([lod0, part('Always', quad(0, 0, 2, 1))]).pairs).toHaveLength(1);
    // Another chain's level is drawn alongside this one.
    const other = part('Sign', quad(0, 0, 2, 1), { alternate: { chain: 'sign', level: 1 } });
    expect(findFlushFaces([lod0, other]).pairs).toHaveLength(1);
  });

  test('the worst pairs come first, and what is left out is counted', () => {
    const parts = [floor];
    for (let i = 0; i < 5; i++)
      parts.push(part(`Tile${i}`, quad(0.1 + i * 0.3, 0.1, 0.1 + i * 0.3 + 0.05 * (i + 1), 0.9)));
    const report = findFlushFaces(parts, { maxFindings: 3 });
    expect(report.pairs.map((pair) => pair.parts[1])).toEqual(['Tile4', 'Tile3', 'Tile2']);
    expect(report.candidates).toBe(5);
    expect(report.omitted).toBe(2);
    expect(findFlushFaces(parts, { maxFindings: 3 })).toEqual(report);
  });

  test('says so when its budget stops it before every pair is tested', () => {
    const parts = [floor, part('Plaque', quad(0.5, 0.25, 1.5, 0.75))];
    expect(findFlushFaces(parts, { maxPairTests: 1 }).truncated).toBe(true);
    expect(findFlushFaces(parts, { maxWork: 1 }).truncated).toBe(true);
    const capped = findFlushFaces(parts, { maxTriangles: 2 });
    expect(capped).toMatchObject({ truncated: true, triangles: 4, examined: 2 });
  });

  test('the work budget counts every box comparison, to the last one', () => {
    // Four triangles in one leaf: one comparison of the leaf with itself, then six pairs.
    const parts = [floor, part('Plaque', quad(0.5, 0.25, 1.5, 0.75))];
    const full = findFlushFaces(parts, { maxWork: 7 });
    expect(full).toMatchObject({ truncated: false, candidates: 1 });
    expect(findFlushFaces(parts, { maxWork: 6 })).toMatchObject({ truncated: true });

    // Sixteen triangles in a tree of leaves: the pass needs exactly 124 box comparisons, the
    // count from before box comparisons were counted a leaf pair at a time.
    const tiles = part('Tiles', [
      ...quad(0, 0, 0.5, 1),
      ...quad(0.5, 0, 1, 1),
      ...quad(1, 0, 1.5, 1),
    ]);
    const strip = [...Array(5).keys()].flatMap((k) => quad(k * 0.4, 0.1, k * 0.4 + 0.3, 0.9));
    const many = [tiles, part('Strip', strip)];
    const unbounded = findFlushFaces(many);
    expect(unbounded.truncated).toBe(false);
    expect(findFlushFaces(many, { maxWork: 124 })).toEqual(unbounded);
    expect(findFlushFaces(many, { maxWork: 123 }).truncated).toBe(true);
  });

  test('ignores degenerate triangles and empty parts', () => {
    const report = findFlushFaces([
      floor,
      part('Empty', []),
      part('Line', [0, 0, 0, 1, 0, 0, 2, 0, 0]),
    ]);
    expect(report.pairs).toEqual([]);
    expect(report.examined).toBe(2);
  });
});

describe('analyzeFlushFaces', () => {
  let shade = 0;
  const plane = (name: string, width: number, depth: number, material?: THREE.Material) => {
    shade += 0x050505;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      material ?? new THREE.MeshStandardMaterial({ color: shade }),
    );
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };

  test('measures parts where they are drawn and names them as the author did', () => {
    const root = new THREE.Group();
    const floor = plane('Mesh_Floor', 2, 1);
    const plaque = plane('Mesh_Plaque', 1, 0.5);
    const holder = new THREE.Group();
    holder.position.set(0.25, 0, 0);
    holder.add(plaque);
    root.add(floor, holder);
    const report = analyzeFlushFaces(root);
    expect(report.pairs).toHaveLength(1);
    expect(report.pairs[0]).toMatchObject({
      parts: ['Mesh_Floor', 'Mesh_Plaque'],
      maxGap: 0,
      facing: 'same',
    });
    expect(report.pairs[0]!.sharedArea).toBeCloseTo(0.5, 6);
    expect(report.unexaminedParts).toBe(0);
    expect(flushFaceWarnings(report)).toEqual([
      'FLUSH_FACES: 1 pair of parts has faces on one plane that will flicker (z-fighting) in any renderer. It is Mesh_Floor and Mesh_Plaque, on one plane, sharing 0.5 m² near [' +
        report.pairs[0]!.at.join(', ') +
        '], normal (0, 1, 0). Move the smaller face at least 2 mm along that normal, remove the covered face, or cut the opening it sits in.',
    ]);

    // A gap is stated only when it is large enough to read.
    plaque.position.y = 0.000001;
    expect(flushFaceWarnings(analyzeFlushFaces(root))[0]).toContain('Mesh_Plaque, on one plane,');
    plaque.position.y = 0.0003;
    expect(flushFaceWarnings(analyzeFlushFaces(root))[0]).toContain(
      'Mesh_Plaque, 0.3 mm apart, too close to order,',
    );

    plaque.position.y = 0.002;
    expect(analyzeFlushFaces(root).pairs).toEqual([]);
    expect(flushFaceWarnings(analyzeFlushFaces(root))).toEqual([]);
  });

  test('skips hidden parts and levels of one chain, and counts what it cannot measure', () => {
    const root = new THREE.Group();
    const hidden = plane('Mesh_Hidden', 1, 0.5);
    hidden.visible = false;
    root.add(plane('Mesh_Floor', 2, 1), hidden);
    expect(analyzeFlushFaces(root).pairs).toEqual([]);

    const lods = new THREE.Group();
    lods.add(plane('Door_LOD0', 2, 1), plane('Door_LOD1', 2, 1));
    expect(analyzeFlushFaces(lods).pairs).toEqual([]);

    const instanced = new THREE.Group();
    const many = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), undefined, 2);
    instanced.add(plane('Mesh_Floor', 2, 1), many);
    expect(analyzeFlushFaces(instanced)).toMatchObject({ unexaminedParts: 1, candidates: 0 });
  });

  test('reads corners the same from plain, indexed, interleaved and normalized attributes', () => {
    const build = (store: (geometry: THREE.BufferGeometry) => void) => {
      const root = new THREE.Group();
      const plaque = plane('Mesh_Plaque', 1, 0.5);
      plaque.position.set(0.25, 0.0002, 0.1);
      plaque.scale.set(1, 1, 1.5);
      store(plaque.geometry);
      root.add(plane('Mesh_Floor', 2, 1), plaque);
      return analyzeFlushFaces(root);
    };
    const plain = build(() => {});
    expect(plain.pairs).toHaveLength(1);
    // Without an index, the corners listed in order.
    expect(build((geometry) => geometry.copy(geometry.toNonIndexed()))).toEqual(plain);
    // Corners in an interleaved buffer, with a spare value after each.
    expect(
      build((geometry) => {
        const source = geometry.getAttribute('position');
        const data = new Float32Array(source.count * 4);
        for (let k = 0; k < source.count; k++)
          data.set([source.getX(k), source.getY(k), source.getZ(k), 7], k * 4);
        const buffer = new THREE.InterleavedBuffer(data, 4);
        geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
      }),
    ).toEqual(plain);
    // Corners stored as normalized integers: -0.5 and 0.5 are -16384 / 32767 off by a little,
    // so this compares with the same corners read through the attribute.
    const quantized = (geometry: THREE.BufferGeometry) => {
      const source = geometry.getAttribute('position');
      const data = new Int16Array(source.count * 3);
      for (let k = 0; k < source.count * 3; k++)
        data[k] = Math.round((source.array as Float32Array)[k]! * 32767);
      geometry.setAttribute('position', new THREE.BufferAttribute(data, 3, true));
    };
    const normalized = build(quantized);
    expect(normalized.pairs).toHaveLength(1);
    expect(normalized.pairs[0]!.sharedArea).toBeCloseTo(plain.pairs[0]!.sharedArea, 4);
  });

  test('a face drawn on both sides fights the face it lies against', () => {
    const root = new THREE.Group();
    const leaf = plane(
      'Mesh_Leaf',
      1,
      0.5,
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
    leaf.rotation.x = Math.PI / 2;
    root.add(plane('Mesh_Floor', 2, 1), leaf);
    const report = analyzeFlushFaces(root);
    expect(report.pairs[0]).toMatchObject({ facing: 'opposite' });
    expect(flushFaceWarnings(report)[0]).toContain('one drawn on both sides');
  });

  test('parts that look the same do not show the tie, and are counted instead of reported', () => {
    const steel = () => new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6 });
    const build = (plaqueMaterial: THREE.Material, colours = false) => {
      const root = new THREE.Group();
      const plaque = plane('Mesh_Plaque', 1, 0.5, plaqueMaterial);
      if (colours)
        plaque.geometry.setAttribute(
          'color',
          new THREE.BufferAttribute(
            new Float32Array(plaque.geometry.attributes.position!.count * 3),
            3,
          ),
        );
      root.add(plane('Mesh_Floor', 2, 1, steel()), plaque);
      return analyzeFlushFaces(root);
    };

    // Two material objects with the same values: one look.
    const same = build(steel());
    expect(same).toMatchObject({ candidates: 0, matching: 1, pairs: [] });
    expect(flushFaceWarnings(same)).toEqual([]);

    // Any difference a renderer would draw brings the pair back.
    expect(
      build(new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.6 })),
    ).toMatchObject({
      candidates: 1,
      matching: 0,
    });
    expect(
      build(new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.5 })),
    ).toMatchObject({
      candidates: 1,
    });
    const textured = steel();
    textured.map = new THREE.Texture();
    expect(build(textured)).toMatchObject({ candidates: 1, matching: 0 });
    expect(build(steel(), true)).toMatchObject({ candidates: 1, matching: 0 });
  });

  test('names the worst pairs and counts the rest', () => {
    const root = new THREE.Group();
    root.add(plane('Mesh_Floor', 4, 1));
    for (let i = 0; i < 5; i++) {
      const tile = plane(`Mesh_Tile${i}`, 0.1 * (i + 1), 0.5);
      tile.position.x = -1.6 + i * 0.7;
      root.add(tile);
    }
    const warnings = flushFaceWarnings(analyzeFlushFaces(root));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toStartWith('FLUSH_FACES: 5 pairs of parts have faces on one plane');
    expect(warnings[0]).toContain(
      'Worst: Mesh_Floor and Mesh_Tile4, on one plane, sharing 0.25 m²',
    );
    expect(warnings[0]).toContain(
      'Also: Mesh_Floor and Mesh_Tile3 (0.2 m²); Mesh_Floor and Mesh_Tile2 (0.15 m²); and 2 more. For each pair, move the smaller face',
    );
    expect(warnings[0]!.length).toBeLessThan(1000);
  });
});

test('faces tilted between two axes are still compared, once', () => {
  // Two coincident quads on a 45 degree slope: their normals sit on the boundary between the
  // +Y and +Z facing classes.
  const slope = [0, 0, 0, 1, 0, 0, 1, 1, -1, 0, 0, 0, 1, 1, -1, 0, 1, -1];
  const report = findFlushFaces([
    { ref: 'Roof', positions: slope },
    { ref: 'Tiles', positions: slope },
  ]);
  expect(report.pairs).toHaveLength(1);
  expect(report.pairs[0]!.sharedArea).toBeCloseTo(Math.SQRT2, 6);
  expect(report.pairs[0]!.trianglePairs).toBe(2);
});

test('parts given one surface are counted as matching, not reported', () => {
  const quad = [0, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 1, 0, -1, 0, 0, -1];
  const report = findFlushFaces([
    { ref: 'A', positions: quad, surface: 'steel' },
    { ref: 'B', positions: quad, surface: 'steel' },
    { ref: 'C', positions: quad, surface: 'brass' },
    { ref: 'D', positions: quad },
  ]);
  expect(report.matching).toBe(1);
  expect(report.pairs.map((pair) => pair.parts.join('+'))).toEqual([
    'A+C',
    'A+D',
    'B+C',
    'B+D',
    'C+D',
  ]);
});

test('a face cut into thousands of triangles is measured in full, whatever the order', () => {
  // A 2 m floor of 60 x 60 cells and a 1 m overlay of 30 x 30 cells on the same plane, with
  // the overlay's cell edges off the floor's, so every overlay triangle meets several others.
  const grid = (cells: number, side: number, shift: number): number[] => {
    const out: number[] = [];
    const step = side / cells;
    for (let x = 0; x < cells; x++)
      for (let z = 0; z < cells; z++) {
        const x0 = shift + x * step;
        const z0 = -shift - z * step;
        out.push(x0, 0, z0, x0 + step, 0, z0, x0 + step, 0, z0 - step);
        out.push(x0, 0, z0, x0 + step, 0, z0 - step, x0, 0, z0 - step);
      }
    return out;
  };
  const floor = grid(60, 2, 0);
  const overlay = grid(30, 1, 0.3371);
  const report = findFlushFaces([
    { ref: 'Floor', positions: floor },
    { ref: 'Overlay', positions: overlay },
  ]);
  expect(report).toMatchObject({
    triangles: 9000,
    examined: 9000,
    truncated: false,
    candidates: 1,
  });
  expect(report.pairs[0]!.parts).toEqual(['Floor', 'Overlay']);
  expect(report.pairs[0]!.sharedArea).toBeCloseTo(1, 6);

  // The same triangles given back to front find the same area.
  const reversed = (positions: number[]): number[] => {
    const out: number[] = [];
    for (let offset = positions.length - 9; offset >= 0; offset -= 9)
      out.push(...positions.slice(offset, offset + 9));
    return out;
  };
  const again = findFlushFaces([
    { ref: 'Floor', positions: reversed(floor) },
    { ref: 'Overlay', positions: reversed(overlay) },
  ]);
  expect(again.pairs[0]!.sharedArea).toBeCloseTo(1, 6);
  expect(again.pairs[0]!.trianglePairs).toBe(report.pairs[0]!.trianglePairs);
});

describe("what is worth an author's attention", () => {
  // Two quads facing straight down, the second covering half of the first.
  const under = (y: number, x0: number, x1: number): number[] => [
    x0,
    y,
    0,
    x1,
    y,
    -1,
    x1,
    y,
    0,
    x0,
    y,
    0,
    x0,
    y,
    -1,
    x1,
    y,
    -1,
  ];
  const lid = [0, 1, 0, 2, 1, 0, 2, 1, -1, 0, 1, 0, 2, 1, -1, 0, 1, -1];

  test('undersides on the lowest plane of the asset are counted, not reported', () => {
    const resting = findFlushFaces([
      { ref: 'Plinth', positions: under(0, 0, 2) },
      { ref: 'Tower', positions: under(0, 1, 2) },
      { ref: 'Lid', positions: lid },
    ]);
    expect(resting).toMatchObject({ candidates: 0, hidden: 1, pairs: [] });

    // The same undersides held above the lowest plane can be seen from below.
    const raised = findFlushFaces([
      { ref: 'Plinth', positions: under(0.5, 0, 2) },
      { ref: 'Tower', positions: under(0.5, 1, 2) },
      { ref: 'Foot', positions: under(0, 0, 0.1) },
    ]);
    expect(raised).toMatchObject({ candidates: 1, hidden: 0 });
    expect(raised.pairs[0]!.parts).toEqual(['Plinth', 'Tower']);
  });

  test('faces buried against a face of another part are counted, not reported', () => {
    // Two undersides at y = 1 share 1 m², and stand on the top of a deck.
    const top = (x0: number, x1: number): number[] => [
      x0,
      1,
      0,
      x1,
      1,
      0,
      x1,
      1,
      -1,
      x0,
      1,
      0,
      x1,
      1,
      -1,
      x0,
      1,
      -1,
    ];
    const pair = [
      { ref: 'Bearing', positions: under(1, 0, 2) },
      { ref: 'Turntable', positions: under(1, 1, 2) },
      { ref: 'Foot', positions: under(0, 0, 0.1) },
    ];
    const exposed = findFlushFaces(pair);
    expect(exposed).toMatchObject({ candidates: 1, hidden: 0 });
    expect(exposed.pairs[0]!.sharedArea).toBeCloseTo(1, 6);

    const buried = findFlushFaces([...pair, { ref: 'Deck', positions: top(0, 2) }]);
    expect(buried).toMatchObject({ candidates: 0, hidden: 1, pairs: [] });

    // A deck under half of the shared face leaves the other half to be seen.
    const half = findFlushFaces([...pair, { ref: 'Deck', positions: top(0, 1.5) }]);
    expect(half).toMatchObject({ candidates: 1, hidden: 0 });
    expect(half.pairs[0]!.parts).toEqual(['Bearing', 'Turntable']);
    expect(half.pairs[0]!.sharedArea).toBeGreaterThan(0.2);
    expect(half.pairs[0]!.sharedArea).toBeLessThan(0.8);
  });

  test("a shared patch under a hundredth of the asset's size on a side is not reported", () => {
    // The asset is about 2.24 m across, so the least area is 5 cm²: a 2 cm square is under it.
    const patch = (side: number): number[] => [
      0,
      1,
      0,
      side,
      1,
      0,
      side,
      1,
      -side,
      0,
      1,
      0,
      side,
      1,
      -side,
      0,
      1,
      -side,
    ];
    const small = findFlushFaces([
      { ref: 'Lid', positions: lid },
      { ref: 'Stud', positions: patch(0.02) },
    ]);
    expect(small.minArea).toBeCloseTo(0.0005, 6);
    expect(small.pairs).toEqual([]);
    const large = findFlushFaces([
      { ref: 'Lid', positions: lid },
      { ref: 'Stud', positions: patch(0.03) },
    ]);
    expect(large.pairs).toHaveLength(1);
  });
});

describe('an estimate of which reported pairs other parts hide', () => {
  type Side = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  /** A quad through four corners in order, wound so it faces `facing`. */
  const face = (corners: number[][], facing: number[]): number[] => {
    const [a, b, c, d] = corners as [number[], number[], number[], number[]];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const out = n[0]! * facing[0]! + n[1]! * facing[1]! + n[2]! * facing[2]! > 0;
    return (out ? [a, b, c, a, c, d] : [a, c, b, a, d, c]).flat();
  };
  /** A box from `lo` to `hi`, faces pointing out (or in), leaving out the sides in `open`. */
  const box = (lo: number[], hi: number[], open: Side[] = [], inward = false): number[] => {
    const [x0, y0, z0] = lo as [number, number, number];
    const [x1, y1, z1] = hi as [number, number, number];
    const s = inward ? -1 : 1;
    const sides: [Side, number[][], number[]][] = [
      [
        '+x',
        [
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x1, y0, z1],
        ],
        [s, 0, 0],
      ],
      [
        '-x',
        [
          [x0, y0, z0],
          [x0, y1, z0],
          [x0, y1, z1],
          [x0, y0, z1],
        ],
        [-s, 0, 0],
      ],
      [
        '+y',
        [
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, s, 0],
      ],
      [
        '-y',
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ],
        [0, -s, 0],
      ],
      [
        '+z',
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, 0, s],
      ],
      [
        '-z',
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y1, z0],
          [x0, y1, z0],
        ],
        [0, 0, -s],
      ],
    ];
    return sides.filter(([side]) => !open.includes(side)).flatMap(([, c, n]) => face(c, n));
  };
  const plaque = part('Plaque', quad(0.5, 0.25, 1.5, 0.75));
  // A closed housing over the plaque, its floor below the floor's plane so nothing lies against it.
  const housing = (open: Side[] = [], more: Partial<FlushPart> = {}, inward = false) =>
    part('Housing', box([0.4, -0.1, 0.15], [1.6, 0.3, 0.85], open, inward), more);

  test('a pair inside a closed housing is estimated hidden, and is still reported', () => {
    const plain = findFlushFaces([floor, plaque]);
    expect(plain.pairs[0]!.occlusion).toBe('visible');
    expect(plain.occlusion).toMatchObject({ visible: 1, occluded: 0, notEstimated: 0 });

    const report = findFlushFaces([floor, plaque, housing()]);
    expect(report.candidates).toBe(1);
    expect(report.pairs[0]).toMatchObject({ parts: ['Floor', 'Plaque'], occlusion: 'occluded' });
    expect(report.pairs[0]!.sharedArea).toBeCloseTo(0.5, 6);
    expect(report.occlusion).toMatchObject({ visible: 0, occluded: 1, notEstimated: 0 });
    expect(report.occlusion!.rays).toBeGreaterThan(0);
    expect(report.occlusion!.rays).toBeLessThanOrEqual(report.occlusion!.maxRays);
  });

  test('a gap in the housing, faces turned away, or glass leave the pair in view', () => {
    expect(findFlushFaces([floor, plaque, housing(['+y'])]).pairs[0]!.occlusion).toBe('visible');
    // Faces pointing in are culled from outside, so a camera sees through them.
    expect(findFlushFaces([floor, plaque, housing([], {}, true)]).pairs[0]!.occlusion).toBe(
      'visible',
    );
    // Drawn on both sides, the same faces hide it.
    expect(
      findFlushFaces([floor, plaque, housing([], { doubleSided: true }, true)]).pairs[0]!.occlusion,
    ).toBe('occluded');
    expect(
      findFlushFaces([floor, plaque, housing([], { seeThrough: true })]).pairs[0]!.occlusion,
    ).toBe('visible');
    // A closed far level of a cover whose near level is open: up close the pair shows.
    const near = part('CoverNear', box([0.4, -0.1, 0.15], [1.6, 0.3, 0.85], ['+y']), {
      alternate: { chain: 'cover', level: 0 },
    });
    const far = housing([], { alternate: { chain: 'cover', level: 1 } });
    expect(findFlushFaces([floor, plaque, near, far]).pairs[0]!.occlusion).toBe('visible');
    // The nearest level of a chain hides like any other part.
    expect(findFlushFaces([floor, plaque, far]).pairs[0]!.occlusion).toBe('occluded');
  });

  test('a small region in view outweighs larger hidden regions of the same pair', () => {
    // The plaque shares a large patch with the floor under the housing and a small one in the
    // open, on another plane: a raised step of the floor.
    const step = part('Floor', [...quad(0, 0, 2, 1), ...quad(2, 0, 3, 1, 0.5)]);
    // The hidden patch in eight strips, so it alone holds more regions than are sampled.
    const strips = [...Array(8).keys()].flatMap((k) =>
      quad(0.5 + k * 0.125, 0.25, 0.625 + k * 0.125, 0.75),
    );
    const plaqueWithTab = part('Plaque', [...strips, ...quad(2.3, 0.3, 2.5, 0.5, 0.5)]);
    const report = findFlushFaces([step, plaqueWithTab, housing()]);
    expect(report.pairs).toHaveLength(1);
    expect(report.pairs[0]!.occlusion).toBe('visible');
  });

  test('changes no count, area or order of the reported pairs, and can be turned off', () => {
    const parts = [floor, plaque, housing(), part('Tag', quad(1.7, 0.1, 1.9, 0.9))];
    const estimated = findFlushFaces(parts);
    const off = findFlushFaces(parts, { maxOcclusionRays: 0 });
    expect(off.occlusion).toBeUndefined();
    expect(off.pairs.every((pair) => !('occlusion' in pair))).toBe(true);
    const { occlusion: _summary, ...rest } = estimated;
    expect({
      ...rest,
      pairs: rest.pairs.map(({ occlusion: _o, ...pair }) => pair),
    }).toEqual(off);
    expect(estimated.pairs.map((pair) => [pair.parts[1], pair.occlusion])).toEqual([
      ['Plaque', 'occluded'],
      ['Tag', 'visible'],
    ]);
    // No pairs, no estimate.
    expect('occlusion' in findFlushFaces([floor])).toBe(false);
  });

  test('stops at its ray budget and says which pairs it did not estimate', () => {
    const second = part('Badge', quad(2.5, 0.25, 3.3, 0.75));
    const cover = part('Cover', box([2.4, -0.1, 0.15], [3.4, 0.3, 0.85]));
    const parts = [part('Floor', quad(0, 0, 4, 1)), plaque, housing(), second, cover];
    const full = findFlushFaces(parts);
    expect(full.occlusion).toMatchObject({ visible: 0, occluded: 2, notEstimated: 0 });
    const first = findFlushFaces([parts[0]!, plaque, housing()]).occlusion!.rays;
    const capped = findFlushFaces(parts, { maxOcclusionRays: full.occlusion!.rays - 1 });
    expect(capped.occlusion).toMatchObject({ occluded: 1, notEstimated: 1, rays: first });
    expect(capped.pairs.map((pair) => pair.occlusion)).toEqual(['occluded', undefined]);
    const exact = findFlushFaces(parts, { maxOcclusionRays: full.occlusion!.rays });
    expect(exact.occlusion).toMatchObject({ occluded: 2, notEstimated: 0 });
  });

  test('gives the same split on every run and for any order of the triangles', () => {
    const parts = [floor, plaque, housing(), part('Tag', quad(1.7, 0.1, 1.9, 0.9))];
    const once = findFlushFaces(parts);
    expect(findFlushFaces(parts)).toEqual(once);
    const backwards = parts.map((p) => {
      const out: number[] = [];
      const positions = p.positions as number[];
      for (let offset = positions.length - 9; offset >= 0; offset -= 9)
        out.push(...positions.slice(offset, offset + 9));
      return { ...p, positions: out };
    });
    expect(findFlushFaces(backwards).pairs.map((pair) => pair.occlusion)).toEqual(
      once.pairs.map((pair) => pair.occlusion),
    );
  });

  test('the warning names pairs in view first and says the split is an estimate', () => {
    const root = new THREE.Group();
    const material = (color: number) => new THREE.MeshStandardMaterial({ color });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), material(0x202020));
    floorMesh.name = 'Mesh_Floor';
    floorMesh.rotation.x = -Math.PI / 2;
    const tile = (name: string, width: number, x: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.5), material(color));
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.x = x;
      return mesh;
    };
    const shown = tile('Mesh_TileA', 0.4, -1.4, 0x404040);
    const covered = tile('Mesh_TileB', 1, 1, 0x606060);
    // A closed box over the second tile, its bottom below the floor.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.8), material(0x808080));
    box.name = 'Mesh_Housing';
    box.position.set(1, 0.1, 0);
    root.add(floorMesh, shown, covered, box);
    const report = analyzeFlushFaces(root);
    expect(report.pairs.map((pair) => [pair.parts[1], pair.occlusion])).toEqual([
      ['Mesh_TileB', 'occluded'],
      ['Mesh_TileA', 'visible'],
    ]);
    const shownPair = report.pairs[1]!;
    expect(flushFaceWarnings(report)).toEqual([
      'FLUSH_FACES: 2 pairs of parts have faces on one plane that will flicker (z-fighting) in any renderer. ' +
        'By a ray estimate, not a render: 1 in view, 1 hidden behind other parts. ' +
        `Worst in view: Mesh_Floor and Mesh_TileA, on one plane, sharing 0.2 m² near [${shownPair.at.join(', ')}], normal (0, 1, 0). ` +
        'Also: Mesh_Floor and Mesh_TileB (0.5 m², hidden). ' +
        'For each pair, move the smaller face at least 2 mm along the shared normal, remove the covered face, or cut the opening it sits in.',
    ]);

    // One pair, hidden.
    root.remove(shown);
    const single = analyzeFlushFaces(root);
    expect(flushFaceWarnings(single)[0]).toStartWith(
      'FLUSH_FACES: 1 pair of parts has faces on one plane that will flicker (z-fighting) in any renderer. ' +
        'A ray estimate, not a render, finds it hidden behind other parts. It is Mesh_Floor and Mesh_TileB, on one plane,',
    );

    // Glass over the tile leaves it in view, and the warning is today's.
    (box.material as THREE.MeshStandardMaterial).transparent = true;
    (box.material as THREE.MeshStandardMaterial).opacity = 0.4;
    const glass = analyzeFlushFaces(root);
    expect(glass.pairs[0]!.occlusion).toBe('visible');
    expect(flushFaceWarnings(glass)[0]).toStartWith(
      'FLUSH_FACES: 1 pair of parts has faces on one plane that will flicker (z-fighting) in any renderer. It is Mesh_Floor and Mesh_TileB,',
    );
  });
});
