/**
 * Contract rules 7, 8 and 13 over the packaged host's tools, in process.
 *
 * Rule 7: a default result is at most 20,000 characters and no result is over
 * 40,000 for any detail value or action; JSON goes out on one line; larger
 * content is paged or stays in the retained report file. Rule 8: a render or
 * edit result leads with the verdict, the blockers, what changed, the current
 * programRef and the next step. Rule 13: a result that carries an image never
 * also carries structuredContent.
 *
 * The baseline sessions of 1 October 2026 measured why: Codex cut a 79,078
 * character `detail: 'full'` render near 40,000, Agy wrote every result over
 * about 4,000 characters to a file the model then had to read back, and a
 * pretty-printed result cost 24% more tokens than the same JSON on one line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { FileAssetLibrary } from '../assets-node';
import { buildRenderPort } from '../cli-render-mode';
import { FileLiveReview } from '../live-review-node';
import { createPackagedLocalToolContext } from '../local-runtime';
import { FileMaterialLibrary } from '../material-library-node';
import { createKilnToolHost, type KilnToolResult } from '../mcp-engine';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
export const DEFAULT_RESULT_LIMIT = 20_000;
export const MAX_RESULT_LIMIT = 40_000;
/** Agy returns a result inline below a size measured between 3,878 and 6,529 characters. */
export const LEAN_RESULT_LIMIT = 3_800;

/** 130 overlapping boxes sharing one name: many parts, many repeated findings. */
const HEAVY =
  "const meta = { name: 'Heavy', category: 'prop' };\n" +
  'function build() {\n' +
  "  const root = createRoot('Heavy');\n" +
  '  for (let i = 0; i < 130; i++) {\n' +
  '    const row = Math.floor(i / 13), col = i % 13;\n' +
  "    createPart('Block', boxGeo(1.2, 1, 1.2), gameMaterial(0x888888), { parent: root, position: [col, 0.5, row] });\n" +
  '  }\n' +
  '  return root;\n' +
  '}\n';
/** 60 uniquely named boxes: every part renamed by one edit, for the comparison's shape. */
const GRID =
  "const meta = { name: 'Grid', category: 'prop' };\n" +
  'function build() {\n' +
  "  const r = createRoot('Grid');\n" +
  '  for (let i = 0; i < 60; i++)\n' +
  "    createPart('Block' + i, boxGeo(0.4, 0.4, 0.4), gameMaterial(0x888888), { parent: r, position: [(i % 10) * 0.5, 0.2, Math.floor(i / 10) * 0.5] });\n" +
  '  return r;\n' +
  '}\n';
const ANIMATED =
  "const meta = { name: 'Spin', category: 'prop' };\n" +
  'function build() {\n' +
  "  const r = createRoot('Spin');\n" +
  "  createPart('Blade', boxGeo(2, 0.1, 0.2), gameMaterial(0x888888), { parent: r, position: [0, 1, 0] });\n" +
  '  return r;\n' +
  '}\n' +
  "function animate() { return [createClip('spin', 1, [rotationTrack('Mesh_Blade', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.5, rotation: [0, 90, 0] }, { time: 1, rotation: [0, 180, 0] }])])]; }\n";
/** A jointed figure with swinging legs and arms: fifteen named nodes to measure per frame. */
const WALKER =
  "const meta = { name: 'Walker', category: 'character' };\n" +
  'function build() {\n' +
  "  const r = createRoot('Walker');\n" +
  "  const hips = createPivot('Hips', [0, 1, 0], r);\n" +
  "  createPart('Torso', boxGeo(0.4, 0.6, 0.2), gameMaterial(0x888888), { parent: hips, position: [0, 0.3, 0] });\n" +
  "  createPart('Head', boxGeo(0.2, 0.2, 0.2), gameMaterial(0x888888), { parent: hips, position: [0, 0.75, 0] });\n" +
  "  for (const [side, x] of [['L', -0.1], ['R', 0.1]]) {\n" +
  "    const leg = createPivot('Leg' + side, [x, 0, 0], hips);\n" +
  "    createPart('Shin' + side, boxGeo(0.1, 0.8, 0.1), gameMaterial(0x888888), { parent: leg, position: [0, -0.4, 0] });\n" +
  "    createPart('Foot' + side, boxGeo(0.1, 0.1, 0.3), gameMaterial(0x666666), { parent: leg, position: [0, -0.85, 0.1] });\n" +
  "    const arm = createPivot('Arm' + side, [x * 2.5, 0.55, 0], hips);\n" +
  "    createPart('UpperArm' + side, boxGeo(0.08, 0.5, 0.08), gameMaterial(0x888888), { parent: arm, position: [0, -0.25, 0] });\n" +
  "    createPart('Hand' + side, boxGeo(0.08, 0.1, 0.1), gameMaterial(0x666666), { parent: arm, position: [0, -0.55, 0] });\n" +
  '  }\n' +
  '  return r;\n' +
  '}\n' +
  "function animate() { return [createClip('walk', 1, [rotationTrack('Joint_LegL', [{ time: 0, rotation: [30, 0, 0] }, { time: 0.5, rotation: [-30, 0, 0] }, { time: 1, rotation: [30, 0, 0] }]), rotationTrack('Joint_LegR', [{ time: 0, rotation: [-30, 0, 0] }, { time: 0.5, rotation: [30, 0, 0] }, { time: 1, rotation: [-30, 0, 0] }]), rotationTrack('Joint_ArmL', [{ time: 0, rotation: [-30, 0, 0] }, { time: 0.5, rotation: [30, 0, 0] }, { time: 1, rotation: [-30, 0, 0] }]), rotationTrack('Joint_ArmR', [{ time: 0, rotation: [30, 0, 0] }, { time: 0.5, rotation: [-30, 0, 0] }, { time: 1, rotation: [30, 0, 0] }])])]; }\n";
/** Every exported node of the walker: pivots are `Joint_<name>`, parts `Mesh_<name>`. */
const WALKER_PARTS = [
  'Joint_Hips',
  'Mesh_Torso',
  'Mesh_Head',
  'Joint_LegL',
  'Mesh_ShinL',
  'Mesh_FootL',
  'Joint_ArmL',
  'Mesh_UpperArmL',
  'Mesh_HandL',
  'Joint_LegR',
  'Mesh_ShinR',
  'Mesh_FootR',
  'Joint_ArmR',
  'Mesh_UpperArmR',
  'Mesh_HandR',
];
const NINE_PHASES = [0, 0.15, 0.25, 0.32, 0.4, 0.5, 0.6, 0.8, 1];

type Host = ReturnType<typeof createKilnToolHost>;
let root: string;
let host: Host;
let liveReview: FileLiveReview;

const textOf = (result: KilnToolResult): string =>
  result.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n');

async function call(name: string, args: Record<string, unknown>) {
  const result = await host.callTool(name, args, { signal: new AbortController().signal });
  const text = textOf(result);
  const json = text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  return { result, text, json };
}

/** Rule 7 for one result: inside the limit and, when JSON, on one line. */
function bounded(label: string, text: string, limit = DEFAULT_RESULT_LIMIT) {
  expect(text.length, `${label}: ${text.length} characters`).toBeLessThanOrEqual(limit);
  if (text.startsWith('{')) expect(text.includes('\n'), `${label}: JSON on one line`).toBe(false);
}

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'result-contract-'));
  const materials = new FileMaterialLibrary(join(root, '.kiln', 'materials'));
  liveReview = new FileLiveReview(root, { transport: 'mcp' });
  const context = await createPackagedLocalToolContext(
    {
      // The packaged host's render wiring on the CPU route: status without a renderer.
      ...(await buildRenderPort('cpu', undefined, { autoSpawn: false })),
      assetLibrary: new FileAssetLibrary(
        { project: join(root, 'assets', 'kiln'), library: join(root, 'library') },
        materials,
      ),
      liveReview,
    },
    {
      KILN_WORKSPACE: root,
      KILN_RENDER: 'cpu',
      KILN_BUILD_CACHE: 'memory',
      KILN_EVALUATOR_MODE: 'in-process',
    },
  );
  host = createKilnToolHost(context);
});
afterAll(async () => {
  await liveReview.flush();
  await rm(root, { recursive: true, force: true });
});

describe('contract rule 7: bounded results on one line', () => {
  it('every tool and action stays inside the default limit on a heavy asset', async () => {
    const rendered = await call('kiln_render', { code: HEAVY });
    expect(rendered.result.isError, rendered.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_render default', rendered.text);
    const programRef = rendered.json!['programRef'] as string;
    expect(programRef).toMatch(/^p_/u);

    const edited = await call('kiln_edit', {
      programRef,
      edits: [{ oldString: 'boxGeo(1.2, 1, 1.2)', newString: 'boxGeo(1.1, 1, 1.1)' }],
    });
    expect(edited.result.isError, edited.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit default', edited.text);

    // w26: an edit sent by `code` (a 13,173-character program) echoed the patched source
    // and reached 28,539 characters. The retained programRef serves the source; includeCode
    // asks for it, bounded with the rest of the result.
    const longSource = `${HEAVY}\n// ${'detail '.repeat(2000)}`;
    const byCode = await call('kiln_edit', {
      code: longSource,
      edits: [{ oldString: 'boxGeo(1.2, 1, 1.2)', newString: 'boxGeo(1.1, 1, 1.1)' }],
    });
    expect(byCode.result.isError, byCode.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit default by code', byCode.text);
    expect(byCode.json!['code']).toBeUndefined();
    expect(byCode.json!['programRef']).toMatch(/^p_/u);
    const withCode = await call('kiln_edit', {
      code: longSource,
      edits: [{ oldString: 'boxGeo(1.2, 1, 1.2)', newString: 'boxGeo(1.1, 1, 1.1)' }],
      includeCode: true,
    });
    expect(withCode.result.isError, withCode.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit default by code with includeCode', withCode.text);
    expect(typeof withCode.json!['code']).toBe('string');
    expect(withCode.json!['codeOmitted'] as number).toBeGreaterThan(0);
    expect(String(withCode.json!['codeHint'])).toContain('kiln_source');

    // Renaming every part (the f07 shape: 22 of 49 parts renamed put a compact edit at
    // 20,069 characters) keeps the comparison to paths, statuses and changed fields. The
    // comparison needs unique sibling names, so this is the uniquely named grid.
    const grid = await call('kiln_render', { code: GRID });
    expect(grid.result.isError, grid.text.slice(0, 400)).not.toBe(true);
    const renamed = await call('kiln_edit', {
      programRef: grid.json!['programRef'] as string,
      edits: [{ oldString: "'Block' + i", newString: "'Cube' + i" }],
    });
    expect(renamed.result.isError, renamed.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit default, every part renamed', renamed.text);
    const comparison = (renamed.json!['preservation'] as { comparison: Record<string, unknown> })
      .comparison;
    const changes = comparison['changes'] as Record<string, unknown>[];
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThanOrEqual(12);
    for (const change of changes) {
      expect(Object.keys(change).sort()).toEqual(
        Array.isArray(change['fields'])
          ? ['fields', 'name', 'path', 'status']
          : ['name', 'path', 'status'],
      );
    }
    expect(comparison['scope']).toBeUndefined();
    expect(comparison['summary']).toBeDefined();

    // Six named shots (the f13 shape: a six-shot compact edit of 22,417 characters carried
    // 4,672 of per-view receipts repeating the summary and the cameras of cameraShots).
    const shots = await call('kiln_edit', {
      programRef: renamed.json!['programRef'] as string,
      edits: [{ oldString: "'Cube' + i", newString: "'Brick' + i" }],
      capture: {
        version: 'kiln.capture.v1',
        size: 384,
        cols: 3,
        shots: [55, 140, 0, 90, 270, 0].map((azimuthDeg, i) => ({
          name: `shot ${i}`,
          camera: { type: 'orbit', azimuthDeg, elevationDeg: i === 5 ? 89 : 10 + i },
        })),
      },
    });
    expect(shots.result.isError, shots.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit default, six shots', shots.text);
    const shotRender = shots.json!['render'] as Record<string, unknown>;
    expect((shotRender['cameraShots'] as unknown[]).length).toBe(6);
    const receipts = shotRender['derivativeReceipts'] as Record<string, unknown>[];
    expect(receipts.length).toBe(6);
    for (const receipt of receipts) {
      expect(receipt['camera']).toBeUndefined();
      expect(receipt['derivativeLabel']).toMatch(/^shot \d$/u);
      expect(receipt['cameraFidelity']).toBeDefined();
    }
    expect(shotRender['viewFidelity']).toBeDefined();

    // Nine frame times with one custom shot and two measured parts (the c37 shape: 24,223
    // characters, the shot repeated per frame and every number at 17 digits) state the shot
    // once and keep every frame.
    const walked = await call('kiln_screenshot_animation', {
      code: WALKER,
      clip: 'walk',
      size: 300,
      frameTimes: NINE_PHASES,
      shot: { name: 'Side', camera: { type: 'orbit', azimuthDeg: 150, elevationDeg: 10 } },
      measureParts: [{ name: 'Mesh_FootL' }, { name: 'Mesh_FootR' }],
    });
    expect(walked.result.isError, walked.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_screenshot_animation default, nine frames', walked.text);
    const sharedShots = walked.json!['cameraShots'] as Record<string, unknown>[];
    expect(sharedShots).toHaveLength(1);
    expect(sharedShots[0]!['frames']).toBe(9);
    expect((walked.json!['poseBounds'] as unknown[]).length).toBe(9);
    expect(walked.json!['poseBoundsOmitted']).toBeUndefined();
    expect(walked.text).not.toMatch(/\d\.\d{7}|\de-\d/u);

    // Nine frame times and fifteen measured parts, near the schema's maximum of each, stay
    // inside the default limit by counting the frames they leave out.
    const measured = await call('kiln_screenshot_animation', {
      code: WALKER,
      clip: 'walk',
      frameTimes: NINE_PHASES,
      measureParts: WALKER_PARTS.map((name) => ({ name })),
    });
    expect(measured.result.isError, measured.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_screenshot_animation default, nine frames and fifteen parts', measured.text);
    const frames = (measured.json!['poseBounds'] as unknown[]).length;
    expect(frames + ((measured.json!['poseBoundsOmitted'] as number | undefined) ?? 0)).toBe(9);

    // The same comparison asked of kiln_inspect (f10 measured 38,952 characters for a 50-entry
    // page with bounds) is a compact page too.
    const compared = await call('kiln_inspect', {
      programRef: renamed.json!['programRef'] as string,
      compare: { programRef: grid.json!['programRef'] as string },
      image: false,
    });
    expect(compared.result.isError, compared.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_inspect compare default', compared.text);
    const inspected = compared.json!['comparison'] as Record<string, unknown>;
    expect(inspected['scope']).toBeUndefined();
    expect((inspected['changes'] as unknown[]).length).toBeGreaterThan(12);
    for (const change of inspected['changes'] as Record<string, unknown>[]) {
      expect(Object.keys(change).sort()).toEqual(
        Array.isArray(change['fields'])
          ? ['fields', 'name', 'path', 'status']
          : ['name', 'path', 'status'],
      );
    }

    const project = await call('kiln_project', {
      action: 'create',
      draft: {
        projectId: 'heavy-pack',
        name: 'Heavy pack',
        brief: 'A pack with a long inventory, to measure the project result size.',
        inventory: Array.from({ length: 40 }, (_, index) => ({
          id: `item-${index}`,
          name: `Item ${index}`,
          kind: 'asset',
          brief: `Inventory item ${index}: a readable brief of about one line, like a real pack would carry.`,
        })),
      },
    });
    expect(project.result.isError, project.text.slice(0, 400)).not.toBe(true);
    const revisionId = (project.json!['project'] as { revisionId: string }).revisionId;

    const saved = await call('kiln_save', { programRef, name: 'Heavy', collection: 'project' });
    expect(saved.result.isError, saved.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_save', saved.text);
    const asset = saved.json!['asset'] as { assetId: string; revisionId: string };

    const presets = await call('kiln_material', { action: 'presets' });
    const presetId = (presets.json!['presets'] as { id: string }[])[0]!.id;
    const material = await call('kiln_material', {
      action: 'create-preset',
      presetId,
      seed: 7,
      creator: 'Result contract test',
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: 'Kiln tests',
      },
    });
    expect(material.result.isError, material.text.slice(0, 400)).not.toBe(true);
    const created = material.json!['material'] as { materialId: string; revisionId: string };

    // Revision comparison needs unique sibling names, which the heavy fixture lacks on purpose.
    const spin = await call('kiln_render', { code: ANIMATED, capture: { preset: '1x1' } });
    const spinEdited = await call('kiln_edit', {
      programRef: spin.json!['programRef'] as string,
      edits: [{ oldString: 'boxGeo(2, 0.1, 0.2)', newString: 'boxGeo(2.5, 0.1, 0.2)' }],
      render: false,
    });

    await liveReview.flush();
    const operations = (await liveReview.snapshot()).operations;
    const operation = operations.find((entry) => entry.tool === 'kiln_render')!;

    const matrix: [string, Record<string, unknown>][] = [
      ['kiln_discover', {}],
      ['kiln_discover', { query: 'curved hollow tube' }],
      ['kiln_discover', { capabilities: true }],
      [
        'kiln_discover',
        {
          ids: ['createRoot', 'createPart', 'boxGeo', 'gameMaterial', 'sweepProfile', 'createClip'],
        },
      ],
      [
        'kiln_discover',
        {
          ids: [
            'shape:project-draft',
            'shape:material-draft',
            'shape:capture',
            'shape:camera-shot',
            'shape:project-patch',
            'shape:material-import',
          ],
        },
      ],
      ['kiln_renderer', { action: 'status' }],
      ['kiln_validate', { code: HEAVY }],
      ['kiln_render', { programRef, capture: { preset: '1x1' } }],
      ['kiln_screenshot_animation', { code: ANIMATED, clip: 'spin', frames: 2 }],
      ['kiln_view_interior', { programRef }],
      ['kiln_inspect', { programRef, image: false, listParts: { limit: 100 } }],
      ['kiln_inspect', { programRef, image: false, listParts: { limit: 100, placement: true } }],
      [
        'kiln_inspect',
        {
          programRef: spinEdited.json!['programRef'] as string,
          image: false,
          compare: { programRef: spin.json!['programRef'] as string },
        },
      ],
      [
        'kiln_edit',
        {
          programRef,
          edits: [{ oldString: '0x888888', newString: '0x886644' }],
          includeCode: true,
        },
      ],
      ['kiln_source', { programRef }],
      ['kiln_source', { programRef, query: 'createPart' }],
      ['kiln_project', { action: 'list' }],
      ['kiln_project', { action: 'get', projectId: 'heavy-pack' }],
      [
        'kiln_project',
        {
          action: 'update',
          projectId: 'heavy-pack',
          expectedRevision: revisionId,
          patch: { brief: 'Updated brief.' },
        },
      ],
      ['kiln_project', { action: 'export', projectId: 'heavy-pack' }],
      ['kiln_material', { action: 'presets' }],
      ['kiln_material', { action: 'list' }],
      [
        'kiln_material',
        { action: 'get', materialId: created.materialId, revisionId: created.revisionId },
      ],
      ['kiln_review', { action: 'list' }],
      ['kiln_review', { action: 'get', operationId: operation.operationId }],
      ['kiln_review', { action: 'pin', operationId: operation.operationId, pinned: true }],
      ['kiln_assets', { action: 'collections' }],
      ['kiln_assets', { action: 'list', collection: 'project' }],
      ['kiln_assets', { action: 'catalog' }],
      [
        'kiln_assets',
        {
          action: 'get',
          collection: 'project',
          assetId: asset.assetId,
          revisionId: asset.revisionId,
        },
      ],
      [
        'kiln_assets',
        {
          action: 'restore',
          collection: 'project',
          assetId: asset.assetId,
          revisionId: asset.revisionId,
        },
      ],
      [
        'kiln_present',
        { collection: 'project', assetId: asset.assetId, revisionId: asset.revisionId },
      ],
      [
        'kiln_export',
        { collection: 'project', assetId: asset.assetId, revisionId: asset.revisionId },
      ],
      [
        'kiln_export',
        {
          collection: 'project',
          assetId: asset.assetId,
          revisionId: asset.revisionId,
          profile: 'runtime',
        },
      ],
      [
        'kiln_import',
        {
          collection: 'library',
          sourceCollection: 'project',
          assetId: asset.assetId,
          revisionId: asset.revisionId,
        },
      ],
    ];
    const failures: string[] = [];
    for (const [name, args] of matrix) {
      const label = `${name} ${JSON.stringify(args).slice(0, 80)}`;
      const { result, text } = await call(name, args);
      if (result.isError === true) failures.push(`${label}: ${text.slice(0, 300)}`);
      bounded(label, text);
    }
    expect(failures).toEqual([]);
  }, 240_000);

  it("detail: 'full' stays inside the hard limit and names the retained report", async () => {
    const rendered = await call('kiln_render', { code: HEAVY, detail: 'full' });
    expect(rendered.result.isError, rendered.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_render full', rendered.text, MAX_RESULT_LIMIT);
    const report = rendered.json!['retainedReport'] as { operationId: string; path: string };
    expect(report.operationId).toMatch(/^op_/u);
    expect(report.path).toBe(`.kiln/review/${report.operationId}/evaluation.json`);
    const qa = rendered.json!['qaReport'] as { rules?: unknown[] };
    expect(Array.isArray(qa.rules)).toBe(true);

    const edited = await call('kiln_edit', {
      programRef: rendered.json!['programRef'] as string,
      edits: [{ oldString: 'boxGeo(1.2, 1, 1.2)', newString: 'boxGeo(1.3, 1, 1.3)' }],
      detail: 'full',
    });
    expect(edited.result.isError, edited.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit full', edited.text, MAX_RESULT_LIMIT);

    const animated = await call('kiln_screenshot_animation', {
      code: ANIMATED,
      clip: 'spin',
      frames: 2,
      detail: 'full',
    });
    bounded('kiln_screenshot_animation full', animated.text, MAX_RESULT_LIMIT);

    // w21 (Agy horse, 1 October 2026): a full edit of 40,533 characters, its render bounded at
    // 40,000 on its own and an 8,177-character diff on top. The whole edit is bounded.
    const longEdit = await call('kiln_edit', {
      programRef: rendered.json!['programRef'] as string,
      edits: [
        {
          oldString: "createPart('Block'",
          newString: `// ${'a long comment '.repeat(200)}\n    createPart('Block'`,
        },
      ],
      detail: 'full',
    });
    expect(longEdit.result.isError, longEdit.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit full, long diff', longEdit.text, MAX_RESULT_LIMIT);
    expect(longEdit.json!['retainedReport'] ?? longEdit.json!['render']).toBeDefined();

    // Every part renamed with the bounds of every change: the comparison is bounded too.
    const grid = await call('kiln_render', { code: GRID, detail: 'full' });
    const renamed = await call('kiln_edit', {
      programRef: grid.json!['programRef'] as string,
      edits: [{ oldString: "'Block' + i", newString: `'Cube' + i // ${'x'.repeat(4000)}` }],
      detail: 'full',
    });
    expect(renamed.result.isError, renamed.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_edit full, every part renamed', renamed.text, MAX_RESULT_LIMIT);

    // Nine frames and fifteen measured parts in full: every frame that fits, the rest counted.
    const measured = await call('kiln_screenshot_animation', {
      code: WALKER,
      clip: 'walk',
      frameTimes: NINE_PHASES,
      measureParts: WALKER_PARTS.map((name) => ({ name })),
      detail: 'full',
    });
    expect(measured.result.isError, measured.text.slice(0, 400)).not.toBe(true);
    bounded(
      'kiln_screenshot_animation full, nine frames and fifteen parts',
      measured.text,
      MAX_RESULT_LIMIT,
    );
  }, 180_000); // Seven CPU evaluations, two of the 130-part asset: the file ran in 13 s warm on the Windows gate host; cold starts there have been several times slower.

  it('the review listing returns short records in pages', async () => {
    // More operations than any page: a realistic result summary on each.
    for (let index = 0; index < 45; index++)
      await liveReview.observe('kiln_render', { programRef: `p_${index}` }, async () => ({
        ok: true,
        programRef: `p_${index}`,
        warnings: Array.from(
          { length: 20 },
          (_, w) => `warning ${w} of operation ${index}: a sentence of ordinary length`,
        ),
        requirements: { binding: null, policy: 'none' },
        qaReport: { acceptance: 'accepted', disposition: 'warn', dimensions: {} },
      }));
    await liveReview.flush();
    const first = await call('kiln_review', { action: 'list' });
    expect(first.result.isError, first.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_review list', first.text);
    const page = first.json!['operations'] as Record<string, unknown>[];
    expect(page.length).toBeLessThanOrEqual(20);
    expect(first.json!['nextOffset']).toBe(page.length);
    expect(first.json!['total']).toBeGreaterThan(40);
    // A listing record is the summary, not the operation: no result, no phases.
    expect(page[0]!['result']).toBeUndefined();
    expect(page[0]!['phases']).toBeUndefined();
    const second = await call('kiln_review', { action: 'list', offset: page.length, limit: 100 });
    bounded('kiln_review list page 2', second.text);
    expect((second.json!['operations'] as unknown[]).length).toBeGreaterThan(0);
    const one = await call('kiln_review', {
      action: 'get',
      operationId: page[0]!['operationId'] as string,
    });
    expect((one.json!['operation'] as { result?: unknown }).result).toBeDefined();
  }, 60_000);

  it('the part listing pages paths by default and placement on request', async () => {
    const rendered = await call('kiln_render', { code: HEAVY, capture: { preset: '1x1' } });
    const programRef = rendered.json!['programRef'] as string;
    const paths = await call('kiln_inspect', {
      programRef,
      image: false,
      listParts: { limit: 100 },
    });
    const listing = paths.json!['partListing'] as {
      parts: Record<string, unknown>[];
      nextOffset?: number;
      total: number;
    };
    // Every exported node, so each part and its mesh child: more than the 130 parts.
    expect(listing.total).toBeGreaterThanOrEqual(130);
    expect(listing.parts).toHaveLength(100);
    expect(listing.nextOffset).toBe(100);
    expect(Object.keys(listing.parts[0]!).sort()).toEqual(['name', 'path']);
    const placed = await call('kiln_inspect', {
      programRef,
      image: false,
      listParts: { limit: 100, placement: true },
    });
    const placement = (placed.json!['partListing'] as { parts: Record<string, unknown>[] })
      .parts[0]!;
    expect(placement['bounds'] ?? placement['worldBounds']).toBeDefined();
  }, 60_000);
});

describe('contract rule 8: the newest result stands alone', () => {
  it('a render leads with the verdict, blockers, the programRef and the next step', async () => {
    const rendered = await call('kiln_render', { code: HEAVY, capture: { preset: '1x1' } });
    const keys = Object.keys(rendered.json!);
    expect(keys.slice(0, 7)).toEqual([
      'programRef',
      'ok',
      'acceptance',
      'disposition',
      'blockers',
      'findings',
      'next',
    ]);
    expect(rendered.json!['next']).toMatch(/kiln_(edit|save|render)/u);
    const findings = rendered.json!['findings'] as Record<string, number>;
    expect(findings['observe']).toBeGreaterThan(0);
    // Repeated findings are grouped by code with the repair text once.
    const qa = rendered.json!['qaReport'] as {
      dimensions: Record<string, { findings: { code: string; count?: number }[] }>;
    };
    const grouped = Object.values(qa.dimensions).flatMap((dimension) => dimension.findings);
    const codes = grouped.map((finding) => finding.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(grouped.some((finding) => (finding.count ?? 1) > 1)).toBe(true);
    expect(rendered.text).not.toContain('notRequested');
  }, 60_000);

  it('an edit leads with the refs, what changed and the next step', async () => {
    const rendered = await call('kiln_render', { code: HEAVY, capture: { preset: '1x1' } });
    const edited = await call('kiln_edit', {
      programRef: rendered.json!['programRef'] as string,
      edits: [{ oldString: '0x888888', newString: '0x886644' }],
      capture: { preset: '1x1' },
    });
    const keys = Object.keys(edited.json!);
    expect(keys.slice(0, 6)).toEqual([
      'programRef',
      'parentRef',
      'ok',
      'applied',
      'changed',
      'next',
    ]);
    expect(edited.json!['next']).toMatch(/kiln_/u);
    const render = edited.json!['render'] as Record<string, unknown>;
    expect(Object.keys(render).slice(0, 5)).toEqual([
      'ok',
      'acceptance',
      'disposition',
      'blockers',
      'findings',
    ]);
  }, 60_000);

  it('a lean result fits the inline threshold of the strictest harness', async () => {
    const rendered = await call('kiln_render', {
      code: HEAVY,
      capture: { preset: '1x1' },
      detail: 'lean',
    });
    expect(rendered.result.isError, rendered.text.slice(0, 400)).not.toBe(true);
    bounded('kiln_render lean', rendered.text, LEAN_RESULT_LIMIT);
    expect(Object.keys(rendered.json!).slice(0, 7)).toEqual([
      'programRef',
      'ok',
      'acceptance',
      'disposition',
      'blockers',
      'findings',
      'next',
    ]);
    const fidelity = rendered.json!['viewFidelity'] as Record<string, unknown>;
    expect(fidelity['materialFaithful']).toBe(false);
    expect(rendered.json!['qaReport']).toBeUndefined();
    const edited = await call('kiln_edit', {
      programRef: rendered.json!['programRef'] as string,
      edits: [{ oldString: '0x888888', newString: '0x886644' }],
      capture: { preset: '1x1' },
      detail: 'lean',
    });
    bounded('kiln_edit lean', edited.text, LEAN_RESULT_LIMIT);
    expect(edited.json!['diff']).toBeDefined();
  }, 60_000);
});

describe('contract rule 13: no structured copy beside a picture', () => {
  it('image results carry no structuredContent and the presenter carries no image', async () => {
    const rendered = await host.callTool(
      'kiln_render',
      { code: ANIMATED, capture: { preset: '1x1' } },
      { signal: new AbortController().signal },
    );
    expect(rendered.content.some((block) => block.type === 'image')).toBe(true);
    expect('structuredContent' in rendered).toBe(false);
    const frames = await host.callTool(
      'kiln_screenshot_animation',
      { code: ANIMATED, clip: 'spin', frames: 2 },
      { signal: new AbortController().signal },
    );
    expect(frames.content.some((block) => block.type === 'image')).toBe(true);
    expect('structuredContent' in frames).toBe(false);
    const spin = await call('kiln_validate', { code: ANIMATED });
    const saved = await call('kiln_save', {
      programRef: spin.json!['programRef'] as string,
      name: 'Spin',
      collection: 'project',
    });
    const asset = saved.json!['asset'] as { assetId: string; revisionId: string };
    const presented = await host.callTool(
      'kiln_present',
      { collection: 'project', assetId: asset.assetId, revisionId: asset.revisionId },
      { signal: new AbortController().signal },
    );
    expect(presented.content.some((block) => block.type === 'image')).toBe(false);
    expect(presented.structuredContent).toBeDefined();
  }, 60_000);
});
