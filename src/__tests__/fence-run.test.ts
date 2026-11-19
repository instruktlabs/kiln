/** `fenceRun` (#411): posts at path points, rails between neighbouring posts. */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { listDiscoveryEntries } from '../discovery';
import { geometryDiagnostics } from '../geometry';
import { createPart, createRoot, fenceRun, gameMaterial } from '../primitives';
import { analyzeFlushFaces } from '../qa/flush-faces';
import { executeKilnCode } from '../render';
import { sameFacts, sceneDigest, sceneFacts } from './helpers/scene-digest';

const wood = () => gameMaterial(0xdcae78);
const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) out.push(node as THREE.Mesh);
  });
  return out;
};
const textured = (seed: number) => {
  const texture = new THREE.DataTexture(new Uint8Array([seed, seed, seed, 255]), 1, 1);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
};
const degrees = (post: THREE.Object3D) => THREE.MathUtils.radToDeg(post.rotation.y);
const worldBox = (node: THREE.Object3D) => new THREE.Box3().setFromObject(node);
/** A closed regular polygon of posts, counter-clockwise from +X. */
const ring = (n: number, r: number) =>
  Array.from({ length: n }, (_, i): [number, number, number] => [
    r * Math.cos((2 * Math.PI * i) / n),
    0,
    r * Math.sin((2 * Math.PI * i) / n),
  ]);

test('the default run is pinned', () => {
  const run = fenceRun('Fence', {
    path: [
      [0, 0, 0],
      [2, 0, 0],
    ],
    material: wood(),
  });
  expect(sceneDigest(run.root)).toBe(
    '2098db4b930acc936e27dc0a4a4c0e18138dda833b360f9acecc5a29eb419a17',
  );
  expect(run.posts.map((post) => post.name)).toEqual(['Fence_Post1', 'Fence_Post2']);
  expect(run.parts.map((part) => part.name)).toEqual([
    'Mesh_Fence_Post1',
    'Mesh_Fence_Post2',
    'Mesh_Fence_Rail1_1',
    'Mesh_Fence_Rail1_2',
  ]);
});

describe('the farm straight bay, rebuilt with fenceRun', () => {
  const SOURCE = new URL(
    '../../packs/farm/sources/project/fence-straight/r_05420c8a915d45e69257f61914d02ec3/source.kiln.js',
    import.meta.url,
  );
  async function saved(): Promise<THREE.Object3D> {
    const program = `${readFileSync(SOURCE, 'utf8')}\nreturn build;`;
    const build = new Function(
      'THREE',
      'createRoot',
      'createPart',
      'compilePortableMaterialSpecV2',
      program,
    )(THREE, createRoot, createPart, async () => wood()) as () => Promise<THREE.Object3D>;
    return build();
  }
  // The study's mock-up, with the kit table's values written in.
  function rebuilt(): THREE.Object3D {
    const root = createRoot('FenceStraight');
    fenceRun('Fence', {
      path: [
        [-1, 0, 0],
        [1, 0, 0],
      ],
      post: {
        section: [0.15, 0.15],
        height: 1.1,
        chamfer: 0.018,
        cap: { rise: 0.06, inset: 0.035 },
        pegs: { radius: 0.013, sides: 6, length: 0.01, offsets: [-0.045, 0.045] },
        groups: ['Post_End_NegX', 'Post_End_PosX'],
        names: ['PostNegX', 'PostPosX'],
      },
      rails: {
        heights: [0.42, 0.86],
        section: [0.06, 0.12],
        chamfer: 0.012,
        embed: 0.02,
        merge: 'Rails',
      },
      uv: { seed: 1 },
      material: wood(),
      parent: root,
    });
    return root;
  }
  const attribute = (root: THREE.Object3D, mesh: string, name: string) =>
    Array.from(
      (root.getObjectByName(mesh) as THREE.Mesh).geometry.getAttribute(name).array as Float32Array,
    );

  test('parts, triangles, bounds and anchors match the saved revision', async () => {
    const before = await saved();
    const after = rebuilt();
    const facts = (root: THREE.Object3D) => ({
      ...sceneFacts(root),
      parts: meshes(root).map((mesh) => mesh.name),
      anchors: ['Post_End_NegX', 'Post_End_PosX'].map((name) =>
        root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).toArray(),
      ),
    });
    expect(facts(after)).toEqual(facts(before));
    expect(facts(after)).toEqual({
      meshes: 3,
      triangles: 464,
      min: [-1.0750000029802322, 0, -0.08100000023841858],
      max: [1.0750000029802322, 1.159999966621399, 0.08100000023841858],
      parts: ['Mesh_PostNegX', 'Mesh_PostPosX', 'Mesh_Rails'],
      anchors: [
        [-1, 0, 0],
        [1, 0, 0],
      ],
    });
  });

  test('the geometry is the same vertex for vertex', async () => {
    const before = await saved();
    const after = rebuilt();
    for (const name of ['position', 'normal', 'uv'])
      for (const mesh of ['Mesh_PostNegX', 'Mesh_Rails'])
        expect(attribute(after, mesh, name)).toEqual(attribute(before, mesh, name));
    // The second post's grain starts elsewhere: the saved bay reused one post geometry.
    for (const name of ['position', 'normal'])
      expect(attribute(after, 'Mesh_PostPosX', name)).toEqual(
        attribute(before, 'Mesh_PostPosX', name),
      );
  });
});

describe('paths, turns, names and materials', () => {
  test('a closed square pen keeps each corner post square to both of its rails', () => {
    const run = fenceRun('Pen', {
      path: [
        [0, 0, 0],
        [3, 0, 0],
        [3, 0, 3],
        [0, 0, 3],
      ],
      closed: true,
      material: wood(),
    });
    expect(run.parts.filter((part) => part.name.includes('Rail')).length).toBe(8);
    // Each post faces its incoming run; the outgoing rail meets its side face straight on.
    expect(run.posts.map((post) => Math.round(degrees(post)))).toEqual([90, 0, -90, 180]);
    // The first rail leaves post 1 through the face 5 cm out and stops 2 cm inside it.
    const rail = worldBox(run.root.getObjectByName('Mesh_Pen_Rail1_1')!);
    expect(rail.min.x).toBeCloseTo(0.03, 6);
    expect(rail.max.x).toBeCloseTo(2.97, 6);
  });

  test('a post bisects a turn of up to 45 degrees', () => {
    const run = fenceRun('Bend', {
      path: [
        [0, 0, 0],
        [2, 0, 0],
        [3.5, 0, 1.5],
      ],
      material: wood(),
    });
    expect(run.posts.map(degrees)).toEqual([0, -22.5, -45].map((d) => expect.closeTo(d, 9)));
  });

  test('an octagonal pen in the farm kit builds: thick rails may enter through a chamfer', () => {
    const run = fenceRun('Pen', {
      path: ring(8, 3),
      closed: true,
      post: {
        section: 0.15,
        height: 1.1,
        chamfer: 0.018,
        cap: { rise: 0.06, inset: 0.035 },
        pegs: { radius: 0.013, length: 0.01, offsets: [-0.045, 0.045] },
      },
      rails: { heights: [0.42, 0.86], section: [0.06, 0.12], chamfer: 0.012 },
      material: wood(),
    });
    expect(run.parts.length).toBe(24);
    // Each post bisects its 45 degree turn, so local +X is the ring's tangent.
    expect(run.posts.map(degrees)).toEqual(
      [-90, -135, 180, 135, 90, 45, 0, -45].map((d) => expect.closeTo(d, 9)),
    );
    expect(analyzeFlushFaces(run.root).candidates).toBe(0);
  });

  test('at a sharper turn a post bisects what is left after a right angle', () => {
    const run = fenceRun('Bend', {
      path: [
        [0, 0, 0],
        [2, 0, 0],
        [3, 0, Math.sqrt(3)],
      ],
      material: wood(),
    });
    // A 60 degree turn: the post turns 15 degrees back, so each rail is 15 degrees off square.
    expect(degrees(run.posts[1]!)).toBeCloseTo(15, 9);
  });

  test('rails follow a sloping path and stay inside the posts', () => {
    const run = fenceRun('Slope', {
      path: [
        [0, 0, 0],
        [2, 0.4, 0],
      ],
      material: wood(),
    });
    const rail = run.root.getObjectByName('Mesh_Slope_Rail1_1')!;
    expect(rail.position.y).toBeCloseTo(0.2 + 0.35, 9);
  });

  test('materials by role, rail merge and part names', () => {
    const post = gameMaterial(0x6b4f2a);
    const rail = gameMaterial(0xdcae78);
    const run = fenceRun('F', {
      path: [
        [0, 0, 0],
        [2, 0, 0],
        [4, 0, 0],
      ],
      material: wood(),
      materials: { post, rail },
      post: { names: ['A', 'B', 'C'], groups: ['GA', 'GB', 'GC'] },
      rails: { merge: 'AllRails' },
    });
    expect(run.parts.map((part) => [part.name, part.material === post ? 'post' : 'rail'])).toEqual([
      ['Mesh_A', 'post'],
      ['Mesh_B', 'post'],
      ['Mesh_C', 'post'],
      ['Mesh_AllRails', 'rail'],
    ]);
    expect(run.root.getObjectByName('GB')!.children.map((c) => c.name)).toEqual(['Mesh_B']);
  });

  test("merge: 'byMaterial' keeps the post frames as anchors and the triangles and bounds", () => {
    const options = {
      path: [
        [0, 0, 0],
        [2, 0, 0],
        [4, 0, 1],
      ] as [number, number, number][],
      material: wood(),
      post: { cap: { rise: 0.04, inset: 0.02 } },
    };
    const pieces = fenceRun('F', options);
    const merged = fenceRun('F', { ...options, merge: 'byMaterial' });
    expect(merged.parts.map((part) => part.name)).toEqual(['Mesh_F']);
    expect(merged.posts.every((post) => post.children.length === 0)).toBe(true);
    expect(
      merged.posts.map((post) => [post.name, ...post.position.toArray(), degrees(post)]),
    ).toEqual(pieces.posts.map((post) => [post.name, ...post.position.toArray(), degrees(post)]));
    sameFacts(merged.root, pieces.root, 1);
    const twoMaterials = fenceRun('F', {
      ...options,
      materials: { rail: gameMaterial(0x6b4f2a) },
      merge: 'byMaterial',
    });
    expect(twoMaterials.parts.map((part) => part.name)).toEqual(['Mesh_F', 'Mesh_F_Rails']);
  });
});

describe('runs that do not fit are refused before anything is built', () => {
  const run2: [number, number, number][] = [
    [0, 0, 0],
    [2, 0, 0],
  ];
  const square: [number, number, number][] = [
    [0, 0, 0],
    [3, 0, 0],
    [3, 0, 3],
    [0, 0, 3],
  ];
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['one point', { path: [[0, 0, 0]] }, /two or more post centres/],
    [
      'posts too close',
      {
        path: [
          [0, 0, 0],
          [0.1, 0, 0],
        ],
      },
      /too close for a rail/,
    ],
    [
      'two posts in one place',
      {
        path: [
          [0, 0, 0],
          [0, 1, 0],
        ],
      },
      /stand at the same place/,
    ],
    ['a closed pair', { path: run2, closed: true }, /three or more posts/],
    ['a rail above the post', { path: run2, rails: { heights: [0.98] } }, /outside the post shaft/],
    ['rails on top of each other', { path: run2, rails: { heights: [0.5, 0.55] } }, /apart/],
    ['a wide chamfer', { path: run2, post: { chamfer: 0.05 } }, /chamfer must be under half/],
    [
      'a peg off the face',
      { path: run2, post: { pegs: { radius: 0.01, length: 0.01, offsets: [0.05] } } },
      /off the flat of the post face/,
    ],
    [
      'pegs without rails',
      { path: run2, rails: false, post: { pegs: { radius: 0.01, length: 0.01, offsets: [0] } } },
      /give rails or drop post\.pegs/,
    ],
    [
      'pegs where a corner rail enters the side',
      { path: square, closed: true, post: { pegs: { radius: 0.01, length: 0.01, offsets: [0] } } },
      /post\.pegs on post 1 meet the rail from post 1 to post 2/,
    ],
    [
      'a thick rail round a post corner',
      { path: ring(8, 3), closed: true, rails: { section: [0.07, 0.08], embed: 0.04 } },
      /meets post 1 across its edge/,
    ],
    [
      'a run that doubles back',
      {
        path: [
          [0, 0, 0],
          [2, 0, 0],
          [0.5, 0, 0.4],
        ],
      },
      /cross outside the post/,
    ],
    [
      'a steep slope with a shallow embed',
      {
        path: [
          [0, 0, 0],
          [1, 1, 0],
        ],
        rails: { embed: 0.005 },
      },
      /shows its end at post 1/,
    ],
    ['too few names', { path: run2, post: { names: ['A'] } }, /one name per path point/],
    ['a repeated name', { path: run2, post: { names: ['A', 'A'] } }, /must not repeat a name/],
    ['a null post', { path: run2, post: null }, /post must be an options object/],
    ['an unknown option', { path: run2, gate: true }, /options\.gate is not an option/],
    ['an unknown merge', { path: run2, merge: 'all' }, /merge must be 'byMaterial'/],
  ];
  for (const [label, options, error] of cases)
    test(label, () => {
      const parent = new THREE.Object3D();
      expect(() => fenceRun('F', { material: wood(), parent, ...options } as never)).toThrow(error);
      expect(parent.children).toEqual([]);
    });
});

test('the Discovery example runs in the sandbox', async () => {
  const entry = listDiscoveryEntries().find((e) => e.id === 'assembly:fenceRun')!;
  if (entry.kind !== 'assembly') throw new Error('fenceRun is an assembly entry');
  const { root } = await executeKilnCode(`const meta = { name: 'Example' };
function build() {
  const root = createRoot('Example');
  const wood = gameMaterial(0x8b6f3d);
  ${entry.contract.example}
  return root;
}`);
  expect(meshes(root).map((mesh) => mesh.name)).toEqual([
    'Mesh_Fence_Post1',
    'Mesh_Fence_Post2',
    'Mesh_Fence_Post3',
    'Mesh_Fence_Rails',
  ]);
  expect(root.getObjectByName('Fence_Post3')!.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
});

describe('solid, UV and flush checks', () => {
  const variants: [string, (m: () => THREE.Material) => THREE.Object3D][] = [
    [
      'defaults',
      (m) =>
        fenceRun('F', {
          path: [
            [0, 0, 0],
            [2, 0, 0],
          ],
          material: m(),
        }).root,
    ],
    [
      'the farm bay: chamfer, cap, pegs, merged rails',
      (m) =>
        fenceRun('F', {
          path: [
            [-1, 0, 0],
            [1, 0, 0],
            [3, 0, 0],
          ],
          post: {
            section: 0.15,
            height: 1.1,
            chamfer: 0.018,
            cap: { rise: 0.06, inset: 0.035 },
            pegs: { radius: 0.013, length: 0.01, offsets: [-0.045, 0.045] },
          },
          rails: {
            heights: [0.42, 0.86],
            section: [0.06, 0.12],
            chamfer: 0.012,
            merge: 'Rails',
          },
          material: m(),
          materials: { rail: m() },
        }).root,
    ],
    [
      'a closed, sloping, turning loop with rectangular posts',
      (m) =>
        fenceRun('F', {
          path: [
            [0, 0, 0],
            [2.5, 0.2, 0],
            [3, 0.3, 2],
            [0.5, 0.1, 2.5],
          ],
          closed: true,
          post: { section: [0.12, 0.09], height: 1.2, cap: { rise: 0.03, inset: 0.02 } },
          rails: { heights: [0.3, 0.6, 0.9], section: [0.03, 0.07], chamfer: 0.005 },
          material: m(),
          materials: { post: m(), rail: m() },
        }).root,
    ],
  ];
  for (const [label, build] of variants)
    test(label, () => {
      let seed = 30;
      const root = build(() => {
        seed += 11;
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
      }).toEqual({ candidates: 0, matching: 0, truncated: false });
    });
});
