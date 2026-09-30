/**
 * Intentionally open shells (R52).
 *
 * `markOpenShell(part, reason)` records that a part is open on purpose. The mark lives under the
 * engine's `kilnOpenShell` key, exports as that node's extras under both exporters and imports
 * back to userData, so QA of the source, of the written bytes and of a derivative all read it.
 * QA reports a marked part that cannot be built as a closed solid as acknowledged, with the
 * reason, and still counts the overlap it could not measure.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { listHelperSpecs } from '../discovery/helper-specs';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import { markOpenShell, OPEN_SHELL_KEY, openShellIntent } from '../open-shell';
import { buildSandboxGlobals } from '../primitives';
import { analyzePartPenetration } from '../qa/self-intersection';
import { renderGLBInProcess, renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';

const REASON = 'Tube closed by the end plates';
const MARK = { schemaVersion: 1, reason: REASON };

/** An open tube between two end plates; `mark` is inserted after the tube is made. */
const railProgram = (mark: string) => `const meta={name:'Open Rail'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#888888');
  const rail=createPart('Rail',new THREE.CylinderGeometry(0.2,0.2,2,12,1,true),m,{parent:root,position:[0,1,0]});
  ${mark}
  createPart('CapTop',boxGeo(0.5,0.1,0.5),m,{parent:root,position:[0,2,0]});
  createPart('CapBottom',boxGeo(0.5,0.1,0.5),m,{parent:root,position:[0,0.05,0]});
  return root;
}`;
const MARKED = railProgram(`markOpenShell(rail,'${REASON}');`);

interface NodeJson {
  name?: string;
  extras?: Record<string, unknown>;
}

/** The JSON chunk of a GLB, read from the bytes alone. */
function gltfNodes(glb: Uint8Array): NodeJson[] {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))).nodes;
}

function findings(report: unknown): { code: string; message: string }[] {
  const found: { code: string; message: string }[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.disposition === 'string')
      found.push({ code: record.code, message: String(record.message) });
    for (const item of Object.values(record)) walk(item);
  };
  walk(report);
  return found;
}

function openShellError(run: () => unknown): AuthoringDiagnosticError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthoringDiagnosticError);
    expect((error as AuthoringDiagnosticError).diagnostic).toBe('OPEN_SHELL');
    return error as AuthoringDiagnosticError;
  }
  throw new Error('expected an OPEN_SHELL authoring error');
}

describe('markOpenShell', () => {
  test('records the trimmed reason under the engine key and is a sandbox helper', () => {
    const part = new THREE.Mesh(new THREE.BoxGeometry());
    expect(markOpenShell(part, `  ${REASON} `)).toBe(part);
    expect(OPEN_SHELL_KEY).toBe('kilnOpenShell');
    expect(part.userData.kilnOpenShell).toEqual(MARK);
    // A mark on a node covers the meshes under it.
    const child = new THREE.Mesh();
    part.add(child);
    expect(openShellIntent(child)).toBe(REASON);
    expect(openShellIntent(new THREE.Mesh())).toBeUndefined();
    expect(typeof buildSandboxGlobals().markOpenShell).toBe('function');
    expect(listHelperSpecs().map((spec) => spec.name)).toContain('markOpenShell');
  });

  test('a part that is not a node, or a missing, blank or long reason, is an OPEN_SHELL error', () => {
    for (const run of [
      () => markOpenShell(undefined as never, REASON),
      () => markOpenShell({ userData: {} } as never, REASON),
      () => markOpenShell(new THREE.Mesh(), undefined as never),
      () => markOpenShell(new THREE.Mesh(), '   '),
      () => markOpenShell(new THREE.Mesh(), 'x'.repeat(201)),
    ])
      expect(openShellError(run).message).toContain('markOpenShell(part, reason)');
    expect(() => markOpenShell(new THREE.Mesh(), 'x'.repeat(200))).not.toThrow();
  });
});

describe('the mark in the written GLB', () => {
  for (const gltfExporter of ['legacy', 'three'] as const) {
    test(`exports as kilnOpenShell extras on the marked node only (${gltfExporter})`, async () => {
      const nodes = gltfNodes((await renderGLBInProcess(MARKED, { gltfExporter })).glb);
      expect(nodes.find((node) => node.name === 'Mesh_Rail')?.extras?.kilnOpenShell).toEqual(MARK);
      expect(nodes.filter((node) => node.extras?.kilnOpenShell !== undefined)).toHaveLength(1);
    });
  }

  test('QA acknowledges the marked tube where the unmarked one reads as unmeasured', async () => {
    const marked = findings((await renderGLBInProcess(MARKED)).meta.qaReport).filter((f) =>
      f.code.startsWith('GEO_PART_SELF_INTERSECTION'),
    );
    expect(marked.map((f) => f.code)).toEqual(['GEO_PART_SELF_INTERSECTION_ACKNOWLEDGED']);
    expect(marked[0]!.message).toBe(
      '1 part marked intentionally open (markOpenShell) was not measured as a closed solid. 1 marked "Tube closed by the end plates", because a valid closed solid could not be measured (Not manifold): "Mesh_Rail". 2 overlapping part pairs were not measured because of this part alone; overlap there is not ruled out.',
    );
    const unmarked = findings((await renderGLBInProcess(railProgram(''))).meta.qaReport).filter(
      (f) => f.code.startsWith('GEO_PART_SELF_INTERSECTION'),
    );
    expect(unmarked.map((f) => f.code)).toEqual(['GEO_PART_SELF_INTERSECTION_UNMEASURED']);
    expect(unmarked[0]!.message).toContain('"Mesh_Rail"');
  });

  test('the review scene restores the mark for QA of the bytes and for a derivative', async () => {
    const { root } = await loadGlbReviewScene((await renderGLBInProcess(MARKED)).glb);
    expect(root.getObjectByName('Mesh_Rail')!.userData.kilnOpenShell).toEqual(MARK);
    const evidence = await analyzePartPenetration(root);
    expect(evidence.skipped).toEqual([]);
    expect(evidence.acknowledged?.map((part) => part.intent)).toEqual([REASON]);
    expect(evidence.pairsUnmeasurableAcknowledged).toBe(2);
    const derivative = await renderSceneToGLB(root, { derivative: true });
    expect(
      gltfNodes(derivative.bytes).find((node) => node.name === 'Mesh_Rail')?.extras?.kilnOpenShell,
    ).toEqual(MARK);
  });

  test('a malformed kilnOpenShell value fails the build instead of exporting', async () => {
    const error = await renderGLBInProcess(
      railProgram(`rail.userData.kilnOpenShell={schemaVersion:1,reason:''};`),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthoringDiagnosticError);
    expect((error as AuthoringDiagnosticError).diagnostic).toBe('OPEN_SHELL');
    expect(String(error)).toContain('markOpenShell(part, reason)');
  });

  test('the worker boundary carries only the closed cause and its advice', async () => {
    const { evaluateEvaluatorRequestV2 } = await import('../evaluator/handler');
    const { createEvaluatorRequestV2 } = await import('../evaluator/protocol');
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'shell', code: railProgram(`markOpenShell(rail,'');`) })
        .json,
    );
    expect(JSON.parse(wire).error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
      diagnostic: 'OPEN_SHELL',
    });
    const { authoringDiagnosticAdvice } = await import('../evaluator/authoring-diagnostic');
    expect(authoringDiagnosticAdvice('OPEN_SHELL')).toContain('markOpenShell(part, reason)');
  });
});
