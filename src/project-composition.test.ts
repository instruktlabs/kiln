/**
 * #277 — modules that are correct alone and wrong together.
 *
 * The fixtures are real GLBs from the real builder, stored in a real library, because
 * the failure this exists for only appears after a GLB round trip: separately saved
 * modules composed at one origin, each of which passes on its own.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { FileAssetLibrary } from './assets-node';
import { createGltfIO } from './gltf-io';
import type { AssetLibrary } from './assets';
import {
  composeProjectModules,
  placementMatrix,
  type ProjectCompositionReportV1,
} from './project-composition';
import { projectDraftSchema, projectRevisionSchema, type ProjectRevision } from './projects';
import { FileProjectStore } from './projects-node';
import { analyzeOpenSurfacePenetration } from './qa/open-surface-penetration';
import { analyzePartPenetration } from './qa/self-intersection';
import { renderGLBInProcess as render } from './render';
import { loadGlbReviewScene } from './views/glb';

const box = (name: string, size: number[], at: number[]) =>
  `createPart('${name}', boxGeo(${size.join(',')}), gameMaterial(0x888888), {parent: r, position: [${at.join(',')}]});`;
const sheet = (name: string, at: number[], rotation = [0, 0, 0]) =>
  `createPart('${name}', planeGeo(1, 1, 8, 8), gameMaterial(0xaa4444), {parent: r, position: [${at.join(',')}], rotation: [${rotation.join(',')}]});`;
const program = (name: string, ...parts: string[]) =>
  `function build() { const r = createRoot('${name}'); ${parts.join(' ')} return r; }`;

const MODULES = {
  // A 12 cm wall, and a cloth in another module running straight through it.
  wall: program('WallModule', box('CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4])),
  throw: program('ThrowModule', sheet('ThrowBlanket', [0, 0.7, 0.4])),
  // A seat, and a cloth resting exactly on its top.
  seat: program('SeatModule', box('Seat', [2, 0.5, 1], [0, 0.25, 0])),
  drape: program('DrapeModule', sheet('Drape', [0, 0.5, 0], [-90, 0, 0])),
  // Two closed solids that share volume at the shared origin.
  post: program('PostModule', box('Post', [0.4, 1, 0.4], [0, 0.5, 0])),
  beam: program('BeamModule', box('Beam', [1, 0.2, 0.2], [0, 0.5, 0])),
  // Overlaps only inside itself: normal QA reports this, the composed check must not.
  knot: program(
    'KnotModule',
    box('KnotA', [0.5, 0.5, 0.5], [10, 0.25, 0]),
    box('KnotB', [0.5, 0.5, 0.5], [10.2, 0.25, 0]),
  ),
  // Many internal overlaps to exhaust a budget, far from one real neighbour overlap.
  clutter: program(
    'ClutterModule',
    ...Array.from({ length: 16 }, (_, i) => box(`Clutter${i}`, [1, 1, 1], [20 + i * 0.01, 0.5, 0])),
    box('Reach', [0.2, 0.2, 0.2], [-5, 0.5, 0]),
  ),
  target: program('TargetModule', box('Target', [0.2, 0.2, 0.2], [-5.05, 0.5, 0])),
  // Nine by nine neighbour overlaps: 81 pairs against the real 64-boolean budget.
  many: program(
    'ManyModule',
    ...Array.from({ length: 9 }, (_, i) => box(`Crowd${i}`, [0.1, 0.1, 0.1], [i * 0.001, 0.5, 0])),
  ),
  crowd: program(
    'CrowdModule',
    ...Array.from({ length: 9 }, (_, i) =>
      box(`Cover${i}`, [0.1, 0.1, 0.1], [0.02 + i * 0.001, 0.5, 0]),
    ),
  ),
  // Its level 1 alternate alone reaches the post; level 0 stands clear of it.
  tiered: program(
    'TieredModule',
    `const near = ${box('Stand_LOD0', [0.2, 1, 0.2], [3, 0.5, 0])}`,
    `const far = ${box('Stand_LOD1', [0.2, 1, 0.2], [0, 0.5, 0])}`,
    'defineLod([near, far], { screenCoverage: [0.25, 0.06] });',
  ),
} as const;
type ModuleName = keyof typeof MODULES;

const glbs = {} as Record<ModuleName, Uint8Array>;
let library: AssetLibrary;
const pins = {} as Record<
  ModuleName,
  { collectionId: string; assetId: string; revisionId: string }
>;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-composition-'));
  library = new FileAssetLibrary({ project: join(root, 'project') });
  for (const name of Object.keys(MODULES) as ModuleName[]) {
    glbs[name] = (await render(MODULES[name])).glb;
    const manifest = await library.save('project', { name, assetId: name, glb: glbs[name] });
    pins[name] = { collectionId: 'project', assetId: name, revisionId: manifest.revisionId };
  }
  return async () => rm(root, { recursive: true, force: true });
}, 60_000);

type Item = {
  id: string;
  asset?: { collectionId: string; assetId: string; revisionId: string };
  placement?: ProjectRevision['inventory'][number]['placement'];
};
const project = (items: Item[]): ProjectRevision =>
  projectRevisionSchema.parse({
    version: 'kiln.project.v1',
    projectId: 'cove',
    revisionId: `r_0000000001_${'0'.repeat(64)}`,
    createdAt: '2026-11-06T00:00:00.000Z',
    name: 'Cove',
    inventory: items.map((item) => ({ name: item.id, ...item })),
  });
/** Each named module pinned and explicitly placed at the shared origin. */
const composed = (...names: ModuleName[]): Item[] =>
  names.map((name) => ({ id: name, asset: pins[name], placement: {} }));

describe('the issue: modules correct alone, wrong together', () => {
  test('each module alone reports nothing, and the composition names both parts and the depth', async () => {
    for (const name of ['wall', 'throw'] as const) {
      const alone = (await loadGlbReviewScene(glbs[name])).root as THREE.Object3D;
      expect(analyzeOpenSurfacePenetration(alone).penetrations).toEqual([]);
      expect((await analyzePartPenetration(alone)).penetrations).toEqual([]);
    }
    const report = await composeProjectModules(project(composed('wall', 'throw')), library);
    expect(report.openSurfaces).toHaveLength(1);
    const [finding] = report.openSurfaces;
    expect(finding!.open.inventoryId).toBe('throw');
    expect(finding!.open.part).toContain('ThrowBlanket');
    expect(finding!.solid.inventoryId).toBe('wall');
    expect(finding!.solid.part).toContain('CurvedWall');
    expect(finding!.depth).toBeCloseTo(0.06, 3);
    expect(report.coverage).toBe('complete');
  });

  test('a cloth resting on a declared surface within tolerance is not reported', async () => {
    const report = await composeProjectModules(project(composed('seat', 'drape')), library);
    expect(report.openSurfaces).toEqual([]);
    expect(report.overlaps).toEqual([]);
    // Resting is contact, measured: the cloth's volume being unmeasurable does not make
    // the whole check partial, because the surface pass sampled that part instead.
    expect(report.coverage).toBe('complete');
  });

  test('two closed solids in different modules report shared volume with both parts named', async () => {
    const report = await composeProjectModules(project(composed('post', 'beam')), library);
    expect(report.overlaps).toHaveLength(1);
    const [overlap] = report.overlaps;
    expect(
      [overlap!.a, overlap!.b].map((side) => side.inventoryId).sort((x, y) => x.localeCompare(y)),
    ).toEqual(['beam', 'post']);
    expect(overlap!.a.part + overlap!.b.part).toContain('Post');
    expect(overlap!.a.part + overlap!.b.part).toContain('Beam');
    // The beam's middle 0.4 m of its 1 m length sits inside the post: 0.4 × 0.2 × 0.2.
    expect(overlap!.volume).toBeCloseTo(0.016, 5);
    expect(overlap!.fraction).toBeCloseTo(0.4, 5);
  });

  test('negative control: moving the same modules apart clears what the origin reported', async () => {
    const apart = await composeProjectModules(
      project([
        { id: 'wall', asset: pins.wall, placement: {} },
        { id: 'throw', asset: pins.throw, placement: { translation: [0, 0, 3] } },
        { id: 'post', asset: pins.post, placement: { translation: [10, 0, 0] } },
        { id: 'beam', asset: pins.beam, placement: { translation: [10, 0, 3] } },
      ]),
      library,
    );
    expect(apart.openSurfaces).toEqual([]);
    expect(apart.overlaps).toEqual([]);
    expect(apart.coverage).toBe('complete');
  });
});

describe('placement', () => {
  test('rotation is Euler XYZ degrees and scale is applied, so both change what overlaps', async () => {
    const wall = { id: 'wall', asset: pins.wall, placement: {} };
    const moved = await composeProjectModules(
      project([wall, { id: 'throw', asset: pins.throw, placement: { translation: [0, 0, 2] } }]),
      library,
    );
    expect(moved.openSurfaces).toEqual([]);
    // Turned 90 degrees about Y at the origin, the sheet stands at x=0.4 and crosses the
    // wall edge on: its row at z=0.375 lies 3.5 cm inside the wall's near face at z=0.34.
    const turned = await composeProjectModules(
      project([wall, { id: 'throw', asset: pins.throw, placement: { rotation: [0, 90, 0] } }]),
      library,
    );
    expect(turned.openSurfaces[0]!.depth).toBeCloseTo(0.035, 3);
    const scaled = await composeProjectModules(
      project([
        { id: 'post', asset: pins.post, placement: {} },
        // Halved, the beam's half-length shrinks to 0.25 m but still crosses the 0.2 m post.
        { id: 'beam', asset: pins.beam, placement: { scale: [0.5, 1, 1] } },
      ]),
      library,
    );
    expect(scaled.overlaps[0]!.volume).toBeCloseTo(0.016, 5);
    const clear = await composeProjectModules(
      project([
        { id: 'post', asset: pins.post, placement: {} },
        { id: 'beam', asset: pins.beam, placement: { scale: [0.3, 1, 1] } },
      ]),
      library,
    );
    // 0.3 m long, it now lies wholly inside the post: all of the beam, none of it outside.
    expect(clear.overlaps[0]!.fraction).toBeCloseTo(1, 3);
  });

  test('placementMatrix treats an empty placement as identity', () => {
    expect(placementMatrix({}).equals(new THREE.Matrix4())).toBe(true);
  });
});

describe('only cross-module pairs are measured', () => {
  test('a module overlapping itself is not reported here: normal QA already does', async () => {
    const report = await composeProjectModules(project(composed('knot', 'seat')), library);
    expect(report.overlaps).toEqual([]);
    expect(report.openSurfaces).toEqual([]);
  });

  test('negative control: the same module overlap is real, and only the filter hides it', async () => {
    const alone = (await loadGlbReviewScene(glbs.knot)).root as THREE.Object3D;
    expect((await analyzePartPenetration(alone)).penetrations).toHaveLength(1);
  });

  test('internal overlaps do not spend the neighbour budget', async () => {
    // Clutter alone holds 120 overlapping internal pairs, about twice the 64-boolean
    // budget. Unfiltered, its near-total box overlaps sort first and the budget runs out
    // before the neighbour's pair is reached.
    const alone = (await loadGlbReviewScene(glbs.clutter)).root as THREE.Object3D;
    expect((await analyzePartPenetration(alone)).truncated).toBe(true);
    const report = await composeProjectModules(project(composed('clutter', 'target')), library);
    expect(report.truncated).toBe(false);
    expect(report.overlaps).toHaveLength(1);
    expect(report.overlaps[0]!.a.part + report.overlaps[0]!.b.part).toContain('Reach');
  });
});

describe('LOD alternates are not present beside a neighbour', () => {
  test('a declared lower level reaching a neighbour is not compared, and level 0 is', async () => {
    const report = await composeProjectModules(project(composed('tiered', 'post')), library);
    expect(report.overlaps).toEqual([]);
    // Negative control: at a placement that brings level 0 onto the post, it is measured.
    const moved = await composeProjectModules(
      project([
        { id: 'tiered', asset: pins.tiered, placement: { translation: [-3, 0, 0] } },
        { id: 'post', asset: pins.post, placement: {} },
      ]),
      library,
    );
    expect(moved.overlaps).toHaveLength(1);
    expect(moved.overlaps[0]!.a.part + moved.overlaps[0]!.b.part).toContain('Stand');
  });

  test('a mesh only named as a lower level is counted and left out', async () => {
    const io = createGltfIO();
    const document = await io.readBinary(glbs.post);
    for (const node of document.getRoot().listNodes())
      if (node.getMesh()) node.setName(`${node.getName()}_LOD1`);
    const named = await library.save('project', {
      name: 'Named',
      assetId: 'named',
      glb: await io.writeBinary(document),
    });
    const report = await composeProjectModules(
      project([
        {
          id: 'named',
          asset: { collectionId: 'project', assetId: 'named', revisionId: named.revisionId },
          placement: {},
        },
        { id: 'beam', asset: pins.beam, placement: {} },
      ]),
      library,
    );
    expect(report.overlaps).toEqual([]);
    expect(report.lodAlternatesExcluded).toBe(1);
  });
});

describe('membership and the items that cannot be measured', () => {
  test('a missing placement means not composed, never identity', async () => {
    const report = await composeProjectModules(
      project([
        { id: 'wall', asset: pins.wall },
        { id: 'throw', asset: pins.throw },
      ]),
      library,
    );
    expect(report.openSurfaces).toEqual([]);
    expect(report.modules).toEqual([]);
    expect(report.unmeasured).toEqual([]);
    expect(report.notComposed).toEqual({ count: 2, ids: ['wall', 'throw'] });
    expect(report.coverage).toBe('nothing-to-compare');
  });

  test('one composed module has nothing to compare', async () => {
    const report = await composeProjectModules(project(composed('wall')), library);
    expect(report.modules).toHaveLength(1);
    expect(report.coverage).toBe('nothing-to-compare');
  });

  test('a placed item with no pin is unmeasured rather than clear', async () => {
    const report = await composeProjectModules(
      project([...composed('wall', 'throw'), { id: 'planned', placement: {} }]),
      library,
    );
    expect(report.unmeasured).toEqual([
      expect.objectContaining({ inventoryId: 'planned', reason: 'unpinned' }),
    ]);
    expect(report.coverage).toBe('partial');
    expect(report.openSurfaces).toHaveLength(1);
  });

  test('a missing revision or an unregistered collection is unavailable and partial', async () => {
    const report = await composeProjectModules(
      project([
        ...composed('seat', 'drape'),
        {
          id: 'gone',
          asset: { collectionId: 'project', assetId: 'wall', revisionId: 'r_gone' },
          placement: {},
        },
        {
          id: 'elsewhere',
          asset: { collectionId: 'nowhere', assetId: 'wall', revisionId: pins.wall.revisionId },
          placement: {},
        },
      ]),
      library,
    );
    expect(report.unmeasured.map(({ inventoryId, reason }) => [inventoryId, reason])).toEqual([
      ['gone', 'unavailable'],
      ['elsewhere', 'unavailable'],
    ]);
    expect(report.coverage).toBe('partial');
    // The path to a user's collection stays out of a record that travels with the asset.
    expect(JSON.stringify(report)).not.toContain(root);
  });

  test('an unreadable sibling is unmeasured rather than clear', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-composition-corrupt-'));
    try {
      const damaged = new FileAssetLibrary({ project: dir });
      const manifest = await damaged.save('project', {
        name: 'Broken',
        assetId: 'broken',
        glb: glbs.wall,
      });
      const revision = join(dir, 'broken', 'revisions', manifest.revisionId);
      await writeFile(join(revision, 'asset.glb'), new Uint8Array([1, 2, 3]));
      const healthy = await damaged.save('project', {
        name: 'Throw',
        assetId: 'throw',
        glb: glbs.throw,
      });
      const report = await composeProjectModules(
        project([
          {
            id: 'broken',
            asset: { collectionId: 'project', assetId: 'broken', revisionId: manifest.revisionId },
            placement: {},
          },
          {
            id: 'throw',
            asset: { collectionId: 'project', assetId: 'throw', revisionId: healthy.revisionId },
            placement: {},
          },
        ]),
        damaged,
      );
      expect(report.unmeasured).toEqual([
        expect.objectContaining({ inventoryId: 'broken', reason: 'unreadable' }),
      ]);
      expect(report.coverage).toBe('partial');
      expect(report.openSurfaces).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a stored asset with no GLB is unreadable', async () => {
    const stub: AssetLibrary = {
      collections: () => [{ id: 'project', label: 'Project' }],
      list: async () => [],
      save: async () => {
        throw new Error('unused');
      },
      import: async () => [],
      read: async (_collection, assetId) => {
        const files: Record<string, Uint8Array> =
          assetId === 'wall' ? { 'asset.glb': glbs.wall } : {};
        return { manifest: {} as never, files };
      },
    };
    const report = await composeProjectModules(
      project([
        { id: 'wall', asset: pins.wall, placement: {} },
        { id: 'empty', asset: pins.throw, placement: {} },
      ]),
      stub,
    );
    expect(report.unmeasured).toEqual([
      expect.objectContaining({ inventoryId: 'empty', reason: 'unreadable' }),
    ]);
  });
});

describe('budgets', () => {
  test('modules past the module budget are named as unmeasured, and the report is truncated', async () => {
    const report = await composeProjectModules(
      project(composed('wall', 'throw', 'seat')),
      library,
      { limits: { maxModules: 2 } },
    );
    expect(report.modules.map((module) => module.inventoryId)).toEqual(['wall', 'throw']);
    expect(report.unmeasured).toEqual([
      expect.objectContaining({ inventoryId: 'seat', reason: 'budget' }),
    ]);
    expect(report.truncated).toBe(true);
    expect(report.coverage).toBe('partial');
  });

  test('the byte budget stops loading further siblings', async () => {
    const report = await composeProjectModules(project(composed('wall', 'throw')), library, {
      limits: { maxBytes: glbs.wall.length },
    });
    expect(report.modules.map((module) => module.inventoryId)).toEqual(['wall']);
    expect(report.unmeasured[0]).toMatchObject({ inventoryId: 'throw', reason: 'budget' });
    expect(report.truncated).toBe(true);
  });

  test('the part budget stops composing further siblings', async () => {
    const report = await composeProjectModules(project(composed('wall', 'many')), library, {
      limits: { maxParts: 5 },
    });
    expect(report.modules.map((module) => module.inventoryId)).toEqual(['wall']);
    expect(report.unmeasured[0]).toMatchObject({ inventoryId: 'many', reason: 'budget' });
  });

  test('pass budgets surface as truncation, never as a clean result', async () => {
    const report = await composeProjectModules(project(composed('many', 'crowd')), library);
    expect(report.overlaps).toHaveLength(64);
    expect(report.solids.pairsNotReached).toBe(17);
    expect(report.truncated).toBe(true);
    expect(report.coverage).toBe('partial');
  });

  test('reported pairs and listed ids are capped with the remainder counted', async () => {
    const report = await composeProjectModules(project(composed('many', 'crowd')), library, {
      limits: { maxReportedPairs: 2 },
    });
    expect(report.overlaps).toHaveLength(2);
    expect(report.overlapsOmitted).toBe(62);
    const planned = await composeProjectModules(
      project(Array.from({ length: 40 }, (_, i) => ({ id: `item${i}` }))),
      library,
    );
    expect(planned.notComposed.count).toBe(40);
    expect(planned.notComposed.ids).toHaveLength(32);
  });
});

describe('a saved revision being measured', () => {
  const subject = () => ({ collectionId: 'project', assetId: 'throw', glb: glbs.throw });

  test('the revision being saved replaces the older pin, and is marked rather than named', async () => {
    // The pin is the harmless drape; the bytes being saved are the throw through the wall.
    const report = await composeProjectModules(
      project([
        { id: 'wall', asset: pins.wall, placement: {} },
        { id: 'throw', asset: { ...pins.drape, assetId: 'throw' }, placement: {} },
      ]),
      library,
      { subject: subject() },
    );
    expect(report.openSurfaces).toHaveLength(1);
    expect(report.subject).toEqual(['throw']);
    const saved = report.modules.find((module) => module.inventoryId === 'throw')!;
    expect(saved.saved).toBe(true);
    expect(saved.revisionId).toBeUndefined();
    // Modules list the saved revision first so the budget always reaches it.
    expect(report.modules[0]!.inventoryId).toBe('throw');
  });

  test('sibling pairs that do not involve it are left to the project check', async () => {
    const report = await composeProjectModules(
      project([
        ...composed('post', 'beam'),
        { id: 'throw', asset: { ...pins.throw }, placement: { translation: [0, 0, 8] } },
      ]),
      library,
      { subject: subject() },
    );
    expect(report.overlaps).toEqual([]);
    expect(report.openSurfaces).toEqual([]);
  });

  test('the same asset in another collection is a different item', async () => {
    const report = await composeProjectModules(
      project([
        { id: 'wall', asset: pins.wall, placement: {} },
        {
          id: 'throw',
          asset: { collectionId: 'other', assetId: 'throw', revisionId: pins.throw.revisionId },
          placement: {},
        },
      ]),
      library,
      { subject: subject() },
    );
    expect(report.subject).toEqual([]);
    expect(report.unmeasured[0]).toMatchObject({ inventoryId: 'throw', reason: 'unavailable' });
  });
});

test('the report is deterministic and JSON-clean', async () => {
  const items = composed('wall', 'throw', 'post', 'beam');
  const a: ProjectCompositionReportV1 = await composeProjectModules(project(items), library);
  const b = await composeProjectModules(project(items), library);
  expect(a).toEqual(b);
  expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  expect(a.schemaVersion).toBe(1);
  expect(a.projectId).toBe('cove');
});

describe('the placement field on a stored record', () => {
  // Written by the engine at 6bf1e5f, before placement existed.
  const LEGACY = {
    version: 'kiln.project.v1',
    projectId: 'legacy',
    revisionId: 'r_0000000001_cc09d2ab255e90625de5ff364294fb3874078a97a3bdb836ca09fb5a99f2ddde',
    createdAt: '2026-11-06T09:18:56.835Z',
    name: 'Legacy pack',
    brief: '',
    design: {
      style: '',
      scale: '',
      palette: [],
      materialRoles: [],
      conventions: [],
      exceptions: [],
    },
    inventory: [
      {
        id: 'bench',
        name: 'Bench',
        kind: 'asset',
        brief: '',
        references: [],
        asset: { collectionId: 'project', assetId: 'bench', revisionId: 'r_0123' },
      },
      { id: 'planned', name: 'Planned', kind: 'environment', brief: '', references: [] },
    ],
    deliveryProfiles: [],
    materialDependencies: [],
    references: [],
    reviews: [],
  };

  test('a revision stored before placement existed still loads under its own id', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'kiln-placement-legacy-'));
    try {
      const directory = join(workspace, '.kiln', 'projects', 'legacy', 'revisions');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, '0000000001.json'), JSON.stringify(LEGACY, null, 2));
      const store = new FileProjectStore(workspace);
      const read = await store.read('legacy');
      expect(read.revisionId).toBe(LEGACY.revisionId);
      expect(Object.keys(read.inventory[0]!)).not.toContain('placement');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test('an absent placement is omitted, a stated one survives, and an empty one stays stated', async () => {
    const parsed = projectDraftSchema.parse({
      name: 'Pack',
      inventory: [
        { id: 'absent', name: 'Absent' },
        { id: 'identity', name: 'Identity', placement: {} },
        {
          id: 'moved',
          name: 'Moved',
          placement: { translation: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 2, 2] },
        },
      ],
    });
    expect('placement' in parsed.inventory[0]!).toBe(false);
    expect(parsed.inventory[1]!.placement).toEqual({});
    expect(parsed.inventory[2]!.placement).toEqual({
      translation: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: [2, 2, 2],
    });
  });

  test('a stated placement survives an immutable update and a later read', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'kiln-placement-store-'));
    try {
      const store = new FileProjectStore(workspace);
      const first = await store.create({
        projectId: 'pack',
        name: 'Pack',
        inventory: [{ id: 'a', name: 'A', placement: { translation: [1, 0, 0] } }],
      });
      const second = await store.update('pack', first.revisionId, { brief: 'Changed' });
      expect((await store.read('pack', second.revisionId)).inventory[0]!.placement).toEqual({
        translation: [1, 0, 0],
      });
      expect(
        (await readdir(join(workspace, '.kiln', 'projects', 'pack', 'revisions'))).length,
      ).toBe(2);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test.each([
    ['a zero scale, which collapses the module', { scale: [0, 1, 1] }],
    ['a two-element translation', { translation: [1, 2] }],
    ['a quaternion where Euler angles are expected', { rotation: [0, 0, 0, 1] }],
    ['an unknown key', { position: [0, 0, 0] }],
    ['an unbounded coordinate', { translation: [1e9, 0, 0] }],
  ])('rejects %s', (_label, placement) => {
    expect(() =>
      projectDraftSchema.parse({
        name: 'Pack',
        inventory: [{ id: 'a', name: 'A', placement }],
      }),
    ).toThrow();
  });
});
