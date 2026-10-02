/**
 * Contract rule 9: a failure sets `isError: true`, names the cause and the next
 * call to make, and carries no absolute local path. Measured over the built
 * server on stdio, the way a harness receives it.
 *
 * The baseline sessions of 1 October 2026 showed each gap: a failed build came
 * back as `ok: false` without `isError` and without a next step (S4), a project
 * import refused its own id with a sentence that named no fix (S1), and an
 * invalid input returned zod's JSON issue dump.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  REPO_ROOT,
  resultJson,
  startStdioServer,
  type StdioServer,
} from './stdio-mcp';

const LOCAL_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var)\//u;
const NEXT_CALL = /kiln_[a-z_]+|kiln [a-z]+|KILN_[A-Z_]+/u;

let root: string;
const servers: StdioServer[] = [];
const start = async (env: Record<string, string> = {}) => {
  const server = await startStdioServer({ cwd: root, env });
  servers.push(server);
  const init = await server.request('initialize', {
    protocolVersion: LEGACY_REVISIONS[0],
    capabilities: {},
    clientInfo: { name: 'kiln-contract-tests', version: '0' },
  });
  expect(init.error, server.stderr()).toBeUndefined();
  server.notify('notifications/initialized');
  return server;
};
const text = (message: Awaited<ReturnType<StdioServer['request']>>) =>
  (message.result?.['content'] as { text?: string }[] | undefined)
    ?.map((block) => block.text ?? '')
    .join('\n') ?? '';

/** The rule, applied to one tool result. */
function teaches(label: string, message: Awaited<ReturnType<StdioServer['request']>>) {
  const body = text(message);
  expect(message.error, label).toBeUndefined();
  expect(message.result!['isError'], `${label}: ${body.slice(0, 300)}`).toBe(true);
  expect(body, `${label} names a next call`).toMatch(NEXT_CALL);
  expect(body, `${label} carries a local path`).not.toMatch(LOCAL_PATH);
  expect(body.startsWith('['), `${label} is a raw issue dump`).toBe(false);
  // An issue text that ends with a period must not meet the template's own period (f09).
  expect(body, `${label} ends a sentence twice`).not.toMatch(/\.\.(?:\s|$)/u);
  return body;
}

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-errors-'));
});
afterAll(async () => {
  for (const server of servers) {
    server.kill();
    await server.exited;
  }
  await rm(root, { recursive: true, force: true });
});

describe('contract rule 9: errors that teach', () => {
  it('a failed build is an error that names the handle and the next call', async () => {
    const server = await start();
    const failed = await server.request('tools/call', {
      name: 'kiln_render',
      arguments: { code: "function build() { throw new Error('boom'); }" },
    });
    const body = teaches('failed build', failed);
    expect(body).toContain('boom');
    expect(body).toMatch(/kiln_edit|kiln_render/u);
    expect(body).toContain('programRef');
    await server.close();
  });

  it('an invalid input is a readable sentence, not an issue dump', async () => {
    const server = await start();
    const invalid = await server.request('tools/call', {
      name: 'kiln_render',
      arguments: { code: CUBE_PROGRAM, capture: { preset: '9x9' } },
    });
    const body = teaches('invalid capture', invalid);
    expect(body).toContain('capture');
    expect(body).toContain('preset');
    const action = await server.request('tools/call', {
      name: 'kiln_project',
      arguments: { action: 'frobnicate' },
    });
    const actions = teaches('invalid action', action);
    expect(actions).toContain('kiln_project');
    for (const name of ['list', 'get', 'create', 'update']) expect(actions).toContain(name);
    const missing = await server.request('tools/call', {
      name: 'kiln_project',
      arguments: { action: 'get' },
    });
    expect(teaches('missing field', missing)).toContain('projectId');
    const noProgram = await server.request('tools/call', {
      name: 'kiln_inspect',
      arguments: { image: false, listParts: { limit: 30 } },
    });
    expect(teaches('no program', noProgram)).toContain('programRef');
    // w28: the key a project's palette lists, passed to the material tool, is answered
    // with the keys the tool takes.
    const alias = await server.request('tools/call', {
      name: 'kiln_material',
      arguments: {
        action: 'get',
        resourceId: 'troy-timber',
        revisionId: `sha256:${'0'.repeat(64)}`,
      },
    });
    const aliased = teaches('unknown key', alias);
    expect(aliased).toContain('resourceId');
    expect(aliased).toContain('materialId');
    // w35: a shot with the camera fields at its root reached the capture guard, which
    // answered ok: false with zod's issue dump under "Fix the error in the source".
    const rootCamera = await server.request('tools/call', {
      name: 'kiln_screenshot_animation',
      arguments: {
        code: CUBE_PROGRAM,
        clip: 'spin',
        frameTimes: [0, 0.5],
        shot: { type: 'orbit', azimuthDeg: 50, elevationDeg: -8 },
      },
    });
    const shot = teaches('shot without camera', rootCamera);
    expect(shot).toContain('shot');
    expect(shot).toContain('shape:camera-shot');
    expect(shot).not.toContain('"code"');
    expect(shot).not.toContain('Fix the error in the source');
    await server.close();
  });

  it('an unknown id names the listing call', async () => {
    const server = await start();
    for (const [name, args, next] of [
      ['kiln_project', { action: 'get', projectId: 'nope' }, 'list'],
      [
        'kiln_review',
        { action: 'get', operationId: 'op_00000000-0000-4000-8000-000000000000' },
        'list',
      ],
      [
        'kiln_assets',
        {
          action: 'get',
          collection: 'project',
          assetId: 'nope',
          revisionId: `r_0000000001_${'0'.repeat(64)}`,
        },
        'list',
      ],
      [
        'kiln_material',
        { action: 'get', materialId: 'nope', revisionId: `sha256:${'0'.repeat(64)}` },
        'list',
      ],
    ] as const) {
      const call = await server.request('tools/call', { name, arguments: args });
      const body = teaches(`${name} unknown id`, call);
      expect(body, name).toContain(name);
      expect(body, name).toContain(next);
    }
    await server.close();
  });

  it('a required renderer that is unavailable names the setting and the reprobe', async () => {
    const server = await start({
      KILN_RENDER: 'gpu',
      KILN_RENDER_PORT_URL: 'http://127.0.0.1:1',
    });
    const rendered = await server.request('tools/call', {
      name: 'kiln_render',
      arguments: { code: CUBE_PROGRAM, capture: { preset: '1x1' } },
    });
    const body = teaches('renderer unavailable', rendered);
    expect(body).toMatch(/KILN_RENDER|kiln_renderer|kiln service/u);
    await server.close();
  });

  it('a review save without a retained artifact names the cause and the listing', async () => {
    const server = await start();
    const failed = await server.request('tools/call', {
      name: 'kiln_render',
      arguments: { code: "function build() { throw new Error('boom'); }" },
    });
    expect(failed.result!['isError']).toBe(true);
    const listed = await server.request('tools/call', {
      name: 'kiln_review',
      arguments: { action: 'list' },
    });
    const operations = resultJson(listed)['operations'] as {
      operationId: string;
      revision: number;
    }[];
    expect(operations.length).toBeGreaterThan(0);
    const operation = operations[0]!;
    const save = await server.request('tools/call', {
      name: 'kiln_review',
      arguments: {
        action: 'save',
        operationId: operation.operationId,
        expectedRevision: operation.revision,
        name: 'Nothing',
      },
    });
    const body = teaches('review save without artifact', save);
    expect(body).toContain(operation.operationId);
    expect(body).toContain('kiln_review');
    await server.close();
  });
});
