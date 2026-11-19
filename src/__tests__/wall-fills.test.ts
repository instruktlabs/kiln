/**
 * Opening fills on `wallWithOpening` (#410): frame, glazing, bars, sill, lintel, shutters and a
 * leaf on a hinge pivot, placed from the opening and the wall.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { geometryDiagnostics } from '../geometry';
import { gameMaterial, glassMaterial, room, wallWithOpening } from '../primitives';
import { listDiscoveryEntries } from '../discovery';
import { analyzeFlushFaces } from '../qa/flush-faces';
import { executeKilnCode } from '../render';
import { sameFacts, sceneDigest, sceneFacts } from './helpers/scene-digest';

const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) out.push(node as THREE.Mesh);
  });
  return out;
};
const names = (root: THREE.Object3D) => meshes(root).map((mesh) => mesh.name);
const worldBox = (node: THREE.Object3D) => {
  node.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(node);
};
/** A textured material: no plain-colour match can hide a depth tie between two parts. */
const textured = (seed = 200) => {
  const texture = new THREE.DataTexture(new Uint8Array([seed, seed, seed, 255]), 1, 1);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
};

const WINDOW = {
  kind: 'window' as const,
  width: 1.1,
  height: 1.3,
  sill: 0.9,
  fill: { frame: true, glazing: true, sill: true, lintel: true } as const,
};
const DOOR = { kind: 'door' as const, fill: { frame: true, leaf: { handle: true } } } as const;
const base = { length: 4, height: 3, thickness: 0.2 };

describe('default fills', () => {
  test('a filled window and a filled door are pinned', () => {
    const glass = glassMaterial(0x9fc4d0);
    expect({
      window: sceneDigest(
        wallWithOpening('W', gameMaterial(0xd8cfc0), {
          ...base,
          materials: { glazing: glass },
          openings: [WINDOW],
        }),
      ),
      door: sceneDigest(
        wallWithOpening('W', gameMaterial(0xd8cfc0), { ...base, openings: [DOOR] }),
      ),
    }).toEqual({
      window: 'e7b70eabe0a3763a3c4c464d2b839fc9d954134bf642d4305690b5232609c1cd',
      door: 'f2f317e2c81e502d513f25d0ab032d7e193d6c3e1bb6812ef98750cca85e729c',
    });
  });

  test('pieces are named from the wall, the opening kind and the piece', () => {
    const wall = wallWithOpening('Front', gameMaterial(0xd8cfc0), {
      ...base,
      materials: { glazing: glassMaterial(0x9fc4d0) },
      openings: [
        { ...WINDOW, offset: -1 },
        { ...DOOR, offset: 1 },
      ],
    });
    expect(names(wall)).toEqual([
      'Mesh_Front_Panel1',
      'Mesh_Front_Panel2',
      'Mesh_Front_Panel3',
      'Mesh_Front_Panel4',
      'Mesh_Front_Panel5',
      'Mesh_Front_Panel6',
      'Mesh_Front_Window1_FrameStart',
      'Mesh_Front_Window1_FrameEnd',
      'Mesh_Front_Window1_FrameHead',
      'Mesh_Front_Window1_FrameBottom',
      'Mesh_Front_Window1_Glass',
      'Mesh_Front_Window1_Sill',
      'Mesh_Front_Window1_Lintel',
      'Mesh_Front_Door1_FrameStart',
      'Mesh_Front_Door1_FrameEnd',
      'Mesh_Front_Door1_FrameHead',
      'Mesh_Front_Door1_Leaf',
      'Mesh_Front_Door1_Handle',
    ]);
    const pivot = wall.getObjectByName('Joint_Front_Door1_Hinge')!;
    expect(pivot.parent).toBe(wall);
    expect(wall.getObjectByName('Mesh_Front_Door1_Leaf')!.parent).toBe(pivot);
    expect(wall.getObjectByName('Mesh_Front_Door1_Handle')!.parent).toBe(pivot);
  });

  test('every fill lies inside its opening or on the outer face, derived from the opening', () => {
    const T = base.thickness;
    const wall = wallWithOpening('W', gameMaterial(0xd8cfc0), {
      ...base,
      materials: { glazing: glassMaterial(0x9fc4d0) },
      openings: [{ ...WINDOW, offset: 0.5 }],
    });
    const box = (name: string) => worldBox(wall.getObjectByName(`Mesh_W_Window1_${name}`)!);
    const [s0, s1, y0, y1] = [0.5 - 0.55, 0.5 + 0.55, 0.9, 2.2];
    // axis 'z': the run is Z, the outer face is +X at T/2.
    expect(box('FrameStart').min.z).toBeCloseTo(s0, 6);
    expect(box('FrameEnd').max.z).toBeCloseTo(s1, 6);
    expect(box('FrameHead').max.y).toBeCloseTo(y1, 6);
    expect(box('FrameBottom').min.y).toBeCloseTo(y0, 6);
    expect(box('FrameStart').max.x).toBeCloseTo(T / 2, 6);
    expect(box('FrameStart').min.x).toBeCloseTo(-T / 2, 6);
    const glass = box('Glass');
    expect(glass.min.z).toBeCloseTo(s0 + 0.06 + 0.001, 6);
    expect(glass.max.y).toBeCloseTo(y1 - 0.06 - 0.001, 6);
    expect((glass.min.x + glass.max.x) / 2).toBeCloseTo(0, 6);
    const sill = box('Sill');
    expect(sill.min.x).toBeCloseTo(T / 2, 6);
    expect(sill.max.x).toBeCloseTo(T / 2 + 0.05, 6);
    expect(sill.max.y).toBeCloseTo(y0, 6);
    expect(sill.min.z).toBeCloseTo(s0 - 0.05, 6);
    const lintel = box('Lintel');
    expect(lintel.min.y).toBeCloseTo(y1, 6);
    expect(lintel.max.z).toBeCloseTo(s1 + 0.1, 6);
  });

  test('outward and axis choose which face is outside', () => {
    const wall = wallWithOpening('W', gameMaterial(0xd8cfc0), {
      ...base,
      axis: 'x',
      outward: -1,
      openings: [{ ...WINDOW, fill: { sill: true } }],
    });
    const sill = worldBox(wall.getObjectByName('Mesh_W_Window1_Sill')!);
    expect(sill.min.z).toBeCloseTo(-0.1 - 0.05, 6);
    expect(sill.max.z).toBeCloseTo(-0.1, 6);
    expect(sill.min.x).toBeCloseTo(-0.55 - 0.05, 6);
  });

  test('a leaf swings on its pivot at the hinge edge and its handle is on the outer face', () => {
    const wall = wallWithOpening('W', gameMaterial(0xd8cfc0), {
      ...base,
      openings: [
        { kind: 'door', fill: { leaf: { hinge: 'end', pivot: 'FrontDoor', handle: true } } },
      ],
    });
    const pivot = wall.getObjectByName('Joint_FrontDoor')!;
    const leaf = worldBox(wall.getObjectByName('Mesh_W_Door1_Leaf')!);
    expect(pivot.position.z).toBeCloseTo(leaf.max.z, 6);
    expect(pivot.position.x).toBeCloseTo(leaf.max.x, 6);
    expect(leaf.min.y).toBeCloseTo(0.005, 6);
    const handle = worldBox(wall.getObjectByName('Mesh_W_Door1_Handle')!);
    expect(handle.min.x).toBeCloseTo(leaf.max.x, 6);
    expect((handle.min.y + handle.max.y) / 2).toBeCloseTo(0.005 + 1, 6);
    pivot.rotation.y = Math.PI / 2;
    const swung = worldBox(wall.getObjectByName('Mesh_W_Door1_Leaf')!);
    expect(swung.max.x - swung.min.x).toBeCloseTo(leaf.max.z - leaf.min.z, 6);
  });

  test('bars split the glazing into panes that stand clear of every bar', () => {
    const wall = wallWithOpening('W', gameMaterial(0xd8cfc0), {
      ...base,
      materials: { glazing: glassMaterial(0x9fc4d0) },
      openings: [
        {
          ...WINDOW,
          fill: { frame: true, glazing: true, bars: { vertical: [0.5], horizontal: [0.6] } },
        },
      ],
    });
    expect(names(wall).filter((n) => /Bar|Glass/.test(n))).toEqual([
      'Mesh_W_Window1_BarV1',
      'Mesh_W_Window1_BarH1_1',
      'Mesh_W_Window1_BarH1_2',
      'Mesh_W_Window1_Glass1',
      'Mesh_W_Window1_Glass2',
      'Mesh_W_Window1_Glass3',
      'Mesh_W_Window1_Glass4',
    ]);
    const bar = worldBox(wall.getObjectByName('Mesh_W_Window1_BarV1')!);
    const pane = worldBox(wall.getObjectByName('Mesh_W_Window1_Glass1')!);
    expect(bar.min.z - pane.max.z).toBeCloseTo(0.001, 6);
  });

  test('part names from the call replace the defaults', () => {
    const wall = wallWithOpening('W', gameMaterial(0xd8cfc0), {
      ...base,
      openings: [
        {
          kind: 'door',
          name: 'Entry',
          fill: { frame: true, leaf: { pivot: 'FrontDoor' } },
          names: {
            FrameStart: 'DoorJambLeft',
            FrameEnd: 'DoorJambRight',
            FrameHead: 'DoorLintel',
            Leaf: 'DoorLeaf',
          },
        },
      ],
    });
    expect(names(wall).slice(-4)).toEqual([
      'Mesh_DoorJambLeft',
      'Mesh_DoorJambRight',
      'Mesh_DoorLintel',
      'Mesh_DoorLeaf',
    ]);
  });

  test('room passes fills, materials and outward faces to its walls', () => {
    const glass = glassMaterial(0x9fc4d0);
    const { root } = room('R', gameMaterial(0xd8cfc0), {
      materials: { glazing: glass },
      openings: [
        { wall: 'back', kind: 'window', fill: { glazing: true, sill: true } },
        { wall: 'front', kind: 'door', fill: { leaf: true } },
        { wall: 'right', kind: 'window', fill: { sill: true } },
        { wall: 'left', kind: 'window', fill: { sill: true } },
      ],
    });
    const sill = (wall: string) => worldBox(root.getObjectByName(`Mesh_R_${wall}_Window1_Sill`)!);
    // Each sill stands against its wall's outer face, outside the 4 x 4 room (walls 0.15 thick).
    expect(sill('WallBack').max.x).toBeCloseTo(-2 - 0.075, 6);
    expect(sill('WallRight').min.z).toBeCloseTo(2 + 0.075, 6);
    expect(sill('WallLeft').max.z).toBeCloseTo(-2 - 0.075, 6);
    expect(root.getObjectByName('Joint_R_WallFront_Door1_Hinge')).toBeDefined();
  });
});

test('the Discovery example runs in the sandbox', async () => {
  const entry = listDiscoveryEntries().find((e) => e.id === 'assembly:wallWithOpening')!;
  if (entry.kind !== 'assembly') throw new Error('wallWithOpening is an assembly entry');
  const { root } = await executeKilnCode(`const meta = { name: 'Example' };
function build() {
  const root = createRoot('Example');
  const plaster = gameMaterial(0xd8cfc0), trim = gameMaterial(0xffffff), glass = glassMaterial(0x9fc4d0);
  ${entry.contract.example}
  return root;
}`);
  expect(root.getObjectByName('Mesh_Front_Window1_Glass1')).toBeDefined();
  expect(root.getObjectByName('Joint_FrontDoor')!.children.map((c) => c.name)).toEqual([
    'Mesh_Front_Door1_Leaf',
    'Mesh_Front_Door1_Handle',
  ]);
});

describe('fills that do not fit are refused before anything is built', () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    [
      'glazing without a glazing material',
      { openings: [{ ...WINDOW }] },
      /needs materials\.glazing/,
    ],
    [
      'a sill on a door',
      { openings: [{ kind: 'door', fill: { sill: true } }] },
      /sill is for windows/,
    ],
    [
      'a frame wider than the opening',
      { openings: [{ kind: 'door', width: 1, fill: { frame: { width: 0.5 } } }] },
      /no clear width/,
    ],
    [
      'a leaf with glazing',
      {
        materials: { glazing: glassMaterial(0) },
        openings: [{ kind: 'door', fill: { leaf: true, glazing: true } }],
      },
      /cannot also take glazing/,
    ],
    [
      'an unknown fill',
      { openings: [{ kind: 'door', fill: { curtain: true } }] },
      /fill\.curtain is not a fill/,
    ],
    [
      'an unknown fill option',
      { openings: [{ kind: 'door', fill: { frame: { size: 1 } } }] },
      /frame\.size is not an option/,
    ],
    [
      'a name for no piece',
      { openings: [{ kind: 'door', fill: { frame: true }, names: { Leaf: 'X' } }] },
      /names\.Leaf names no piece/,
    ],
    [
      'shutters past the wall end',
      { openings: [{ kind: 'window', offset: 1.3, fill: { shutters: true } }] },
      /runs past the wall/,
    ],
    [
      'shutters over a neighbouring opening',
      {
        openings: [
          { kind: 'window', offset: -0.6, fill: { shutters: true } },
          { kind: 'window', offset: 0.6, width: 0.6 },
        ],
      },
      /covers opening 2/,
    ],
    [
      'a glazing outside the frame depth',
      {
        materials: { glazing: glassMaterial(0) },
        openings: [{ kind: 'window', fill: { frame: true, glazing: { depth: 0.5 } } }],
      },
      /inside the frame depth/,
    ],
    [
      'bars touching the frame',
      { openings: [{ kind: 'window', fill: { frame: true, bars: { vertical: [0.01] } } }] },
      /touch each other or the frame/,
    ],
    [
      'an unknown material role',
      { materials: { glass: gameMaterial(0) }, openings: [] },
      /materials\.glass is not a fill role/,
    ],
    ['outward of 2', { outward: 2, openings: [] }, /outward must be 1 or -1/],
  ];
  for (const [label, options, error] of cases)
    test(label, () => {
      const parent = new THREE.Object3D();
      expect(() =>
        wallWithOpening('W', gameMaterial(0xd8cfc0), { ...base, ...options, parent } as never),
      ).toThrow(error);
      expect(parent.children).toEqual([]);
    });
});

describe("merge: 'byMaterial' with fills", () => {
  test('one part per material; the leaf merges under its pivot', () => {
    const wallMaterial = gameMaterial(0xd8cfc0);
    const frame = gameMaterial(0xffffff);
    const glass = glassMaterial(0x9fc4d0);
    const options = {
      ...base,
      length: 6,
      materials: { frame, glazing: glass, hardware: gameMaterial(0x333333) },
      openings: [
        { ...WINDOW, offset: -1.5, fill: { ...WINDOW.fill, bars: { vertical: [0.5] } } },
        { ...DOOR, offset: 1 },
      ],
    };
    const pieces = wallWithOpening('W', wallMaterial, options);
    const merged = wallWithOpening('W', wallMaterial, { ...options, merge: 'byMaterial' });
    expect(names(merged)).toEqual([
      'Mesh_W_Door1_Leaf',
      'Mesh_W_Door1_Hardware',
      'Mesh_W',
      'Mesh_W_Frame',
      'Mesh_W_Glazing',
    ]);
    expect(merged.getObjectByName('Mesh_W_Door1_Leaf')!.parent!.name).toBe('Joint_W_Door1_Hinge');
    sameFacts(merged, pieces, 5);
  });
});

describe('solid, UV and flush checks', () => {
  const variants: [string, (m: () => THREE.Material) => THREE.Object3D][] = [
    [
      'default window and door fills',
      (m) =>
        wallWithOpening('W', m(), {
          length: 6,
          height: 3,
          thickness: 0.2,
          materials: { glazing: m() },
          openings: [
            { ...WINDOW, offset: -1.5 },
            { ...DOOR, offset: 1 },
          ],
        }),
    ],
    [
      'bars, shutters, proud frame, axis x, outward -1',
      (m) =>
        wallWithOpening('W', m(), {
          length: 6,
          height: 3,
          thickness: 0.3,
          axis: 'x',
          outward: -1,
          materials: { glazing: m(), frame: m(), sill: m(), shutter: m() },
          openings: [
            {
              kind: 'window',
              offset: 0,
              width: 1.2,
              height: 1.4,
              sill: 1,
              fill: {
                frame: { width: 0.07, depth: [-0.02, 0.32] },
                glazing: { depth: 0.15 },
                bars: { vertical: [0.5], horizontal: [0.58] },
                sill: { overhang: 0.07, projection: 0.07, height: 0.08 },
                lintel: { overhang: 0.12, height: 0.16 },
                shutters: { width: 0.55, gap: 0.04, thickness: 0.045 },
              },
            },
          ],
        }),
    ],
    [
      'a casement leaf with a handle and a door with no frame',
      (m) =>
        wallWithOpening('W', m(), {
          length: 5,
          height: 3,
          thickness: 0.25,
          materials: { leaf: m(), hardware: m() },
          openings: [
            {
              kind: 'window',
              offset: -1,
              fill: { frame: true, leaf: { hinge: 'end', handle: true }, lintel: true },
            },
            { kind: 'door', offset: 1, fill: { leaf: { clearance: 0, handle: { height: 0.9 } } } },
          ],
        }),
    ],
  ];
  for (const [label, build] of variants)
    test(label, () => {
      let seed = 40;
      const root = build(() => {
        seed += 9;
        return textured(seed);
      });
      for (const mesh of meshes(root)) {
        const { solid } = geometryDiagnostics(mesh.geometry);
        expect({ name: mesh.name, ...solid, signedVolume: solid.signedVolume > 0 }).toEqual({
          name: mesh.name,
          closed: true,
          manifold: true,
          orientation: 'outward',
          signedVolume: true,
        });
        expect(mesh.geometry.getAttribute('uv')).toBeDefined();
      }
      const flush = analyzeFlushFaces(root);
      expect({
        candidates: flush.candidates,
        matching: flush.matching,
        truncated: flush.truncated,
      }).toEqual({
        candidates: 0,
        matching: 0,
        truncated: false,
      });
    });
});

describe('the Farmhouse front wall, rebuilt with the helper', () => {
  // The saved revision the authored source study measured (lines 98-111 and 139-169).
  const SOURCE = new URL(
    '../../packs/farm/sources/project/a_793e1ebd4c32465ab937d93215ec2a50/r_01f97f5e943e4c2693b6db8596f3e353/source.kiln.js',
    import.meta.url,
  );
  const between = (text: string, from: string, to: string) =>
    text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

  function handBuilt(): THREE.Object3D {
    const text = readFileSync(SOURCE, 'utf8');
    const program = [
      between(text, 'const P = {', 'const TH ='),
      between(text, '// ---------- small vector helpers', 'async function build()'),
      'const B = { masonry: MB(2), stone: MB(3), trim: MB(1), glass: MB(1), olive: MB(1), hinge: MB(1) };',
      between(text, '  function windowUnit(o) {', '  // ---------- Shell:'),
      'const { halfX: HX, halfZ: HZ, wallT: WT, floorY: FY, eaveY: E } = P;',
      between(text, '  const frontWins =', "  wall(B.masonry, 'x', -HX"),
      'for (const w of frontWins) windowUnit({ axis: "x", out: 1, face: HX, ...w, shutters: true });',
      'return B;',
    ].join('\n');
    const meshGeo = (data: {
      positions: number[];
      normals: number[];
      uvs: number[];
      indices: number[];
    }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      g.setIndex(data.indices);
      return g;
    };
    const B = new Function('meshGeo', program)(meshGeo) as Record<
      string,
      { geo(): THREE.BufferGeometry; idx: number[] }
    >;
    const root = new THREE.Object3D();
    for (const [key, builder] of Object.entries(B))
      if (builder.idx.length) {
        const mesh = new THREE.Mesh(builder.geo(), gameMaterial(0x808080));
        mesh.name = key;
        root.add(mesh);
      }
    return root;
  }

  function withHelper(): THREE.Object3D {
    const [HX, HZ, WT, FY, E] = [3.0, 4.0, 0.3, 0.4, 3.6];
    const masonry = gameMaterial(0xeadcbf);
    const window = (offset: number) => ({
      kind: 'window' as const,
      offset,
      width: 1.1,
      sill: 1.15 - FY,
      height: 2.45 - 1.15,
      fill: {
        frame: { width: 0.06, depth: [0.08, 0.2] as [number, number] },
        glazing: { thickness: 0.02, depth: 0.16 },
        bars: {
          vertical: [0.5],
          horizontal: [0.58],
          width: 0.04,
          depth: [0.12, 0.18] as [number, number],
        },
        sill: { overhang: 0.07, projection: 0.07, height: 0.06 },
        lintel: { overhang: 0.12, projection: 0.03, height: 0.16 },
        shutters: { width: 0.55, gap: 0.04, thickness: 0.045 },
      },
    });
    const wall = wallWithOpening('FrontWall', masonry, {
      length: 2 * (HZ - WT),
      height: E - FY,
      thickness: WT,
      materials: {
        frame: gameMaterial(0xe6dcc6),
        glazing: glassMaterial(0xa9cdd4),
        sill: gameMaterial(0xaea796),
        shutter: gameMaterial(0x55622e),
      },
      openings: [{ kind: 'door', width: 1, height: 2.55 - FY }, window(-2), window(2)],
      merge: 'byMaterial',
    });
    wall.position.set(HX - WT / 2, FY, 0);
    return wall;
  }

  test('parts, triangles and bounds against the hand-built wall', () => {
    const facts = (root: THREE.Object3D) => {
      const { meshes, triangles, min, max } = sceneFacts(root);
      const round = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6);
      return { meshes, triangles, min: round(min), max: round(max) };
    };
    const today = facts(handBuilt());
    const helper = facts(withHelper());
    // Today: masonry, stone, trim, glass, olive and hinge buffers. With the helper: masonry,
    // trim (frame and bars), glass, stone (sill and lintel) and olive; no battens or strap
    // hinges, which the helper does not make. The wall blocks are the same nine; per window the
    // helper makes 15 boxes (frame 4, bars 3, panes 4, sill, lintel, two shutters) against 23.
    // Bounds differ only where the shutter hinge knuckles stand 3.3 cm proud of the shutters.
    expect({ today, helper }).toEqual({
      today: { meshes: 6, triangles: 660, min: [2.7, 0.4, -3.7], max: [3.078, 3.6, 3.7] },
      helper: { meshes: 5, triangles: 468, min: [2.7, 0.4, -3.7], max: [3.07, 3.6, 3.7] },
    });
  });
});
