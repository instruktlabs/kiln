import { resolveRequirementsContext } from '../requirements-context';
import { createRequirementsQaReport } from '../qa/requirements-report';
import { describe, expect, spyOn, test } from 'bun:test';

import type { RenderResult } from '../render';
import {
  createEvaluatorRequestV2,
  decodeEvaluatorResultV2,
  evaluateEvaluatorRequestV2,
} from './index';

const GLB = Buffer.from('glTF strict evaluator fixture');
const HASH = `sha256:${new Bun.CryptoHasher('sha256').update(GLB).digest('hex')}` as const;
const RENDER: RenderResult = {
  glb: GLB,
  requirements: resolveRequirementsContext(),
  artifactGlbSha256: HASH,
  tris: 1,
  meta: {
    qaReport: createRequirementsQaReport(resolveRequirementsContext(), { executedRules: [] }),
  },
  warnings: [],
  integrationManifest: {
    schemaVersion: 'kiln.integration-manifest.v1',
    analyzerVersion: 1,
    artifactSha256: HASH.slice(7),
    units: 'm',
    axes: { forward: '+X', up: '+Y', right: '+Z' },
    bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1], center: [0.5, 0.5, 0.5] },
    pivot: { convention: 'author-origin', position: [0, 0, 0] },
    ground: { groundY: 0, contactTolerance: 0.02, minY: 0, offsetToGround: 0, grounded: true },
    defaultScene: { index: 0, name: 'Scene' },
    renderMetrics: {
      triangles: 1,
      drawCalls: 1,
      uniqueGeometries: 1,
      uniqueMaterials: 1,
      textureCount: 0,
      transparentMaterials: 0,
      skinned: false,
    },
    structuralQa: {
      hasDefaultScene: true,
      finiteBounds: true,
      validatorErrors: 0,
      validatorWarnings: 0,
    },
    visualQa: 'not_assessed',
  },
};

describe('transport-neutral evaluator handler', () => {
  test('legacy envelopes fail before evaluation with current-version migration guidance', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'legacy', code: 'PRIVATE_SOURCE_MARKER' });
    let evaluated = false;
    const out = await evaluateEvaluatorRequestV2(
      JSON.stringify({ ...built.request, version: 'kiln.evaluator.request.v1' }),
      {
        render: async () => {
          evaluated = true;
          return RENDER;
        },
      },
    );
    expect(evaluated).toBe(false);
    expect(JSON.parse(out).error.code).toBe('INPUT_INVALID');
    expect(JSON.parse(out).error.message).toContain('kiln.evaluator.request.v2');
    expect(out).toContain('migration');
    expect(out).not.toContain('PRIVATE_SOURCE_MARKER');
  });
  test('reuses the strict protocol and canonical result encoding', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'http-1', code: 'fixture' });
    const resultJson = await evaluateEvaluatorRequestV2(built.json, {
      render: async () => RENDER,
    });
    expect(decodeEvaluatorResultV2(resultJson, 1024, 'http-1')).toMatchObject({
      ok: true,
      requestId: 'http-1',
      render: { artifactGlbSha256: HASH },
    });
  });

  test('sanitizes execution failures and refuses oversized encoded output', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'http-2', code: 'private source marker' });
    const failed = await evaluateEvaluatorRequestV2(built.json, {
      render: async () => {
        throw new Error('private source marker and /secret/path');
      },
    });
    expect(failed).not.toContain('private source marker');
    expect(failed).not.toContain('/secret/path');
    expect(decodeEvaluatorResultV2(failed, 1024, 'http-2')).toMatchObject({
      ok: false,
      error: { code: 'EXECUTION_REJECTED' },
    });
    await expect(
      evaluateEvaluatorRequestV2(
        built.json,
        { render: async () => RENDER },
        {
          maxResponseBytes: 32,
        },
      ),
    ).rejects.toMatchObject({ code: 'OUTPUT_LIMIT_EXCEEDED' });
  });

  test('bounds the transport-neutral execution deadline', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'http-deadline', code: 'fixture' });
    const failed = await evaluateEvaluatorRequestV2(
      built.json,
      { render: () => new Promise(() => {}) },
      { deadlineMs: 5 },
    );
    expect(decodeEvaluatorResultV2(failed, 1024, 'http-deadline')).toMatchObject({
      ok: false,
      error: { code: 'DEADLINE_EXCEEDED' },
    });
  });

  // The fd3 worker leaves its deadline to the host that kills it. A host calling this entry has
  // only this timer, so naming no deadline has to keep meaning the default.
  test('a host entry naming no deadline keeps the 60-second default', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'http-default', code: 'fixture' });
    const timers = spyOn(globalThis, 'setTimeout');
    try {
      await evaluateEvaluatorRequestV2(built.json, { render: async () => RENDER });
      expect(timers.mock.calls.map(([, ms]) => ms)).toEqual([60_000]);
    } finally {
      timers.mockRestore();
    }
  });

  test('accepts a deadline up to the protocol maximum and refuses one above it', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'http-maximum', code: 'fixture' });
    const render = { render: async () => RENDER };
    const accepted = await evaluateEvaluatorRequestV2(built.json, render, { deadlineMs: 120_000 });
    expect(decodeEvaluatorResultV2(accepted, 1024, 'http-maximum').ok).toBe(true);
    await expect(
      evaluateEvaluatorRequestV2(built.json, render, { deadlineMs: 120_001 }),
    ).rejects.toMatchObject({ code: 'INPUT_INVALID' });
  });
});
