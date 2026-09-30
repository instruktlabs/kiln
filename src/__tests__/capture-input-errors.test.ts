import { expect, it } from 'bun:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createKilnMcpServer } from '../mcp-server';
import { createKilnProgramToolRegistry } from '../tools/registry';

it('reports numeric shot paths for a tagged capture instead of rejecting valid version fields', async () => {
  let builds = 0;
  const server = createKilnMcpServer({
    evaluatorPort: {
      async render() {
        builds++;
        throw new Error('invalid input reached evaluation');
      },
    },
  });
  const client = new Client({ name: 'capture-error-test', version: '0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const args = {
      code: 'function build(){}',
      capture: {
        version: 'kiln.capture.v1',
        shots: [
          {
            camera: {
              type: 'explicit',
              projection: 'orthographic',
              position: ['4.6', 3, 5],
              target: [0, '1.15', 0],
            },
          },
        ],
      },
    };
    const message = await client.callTool({ name: 'kiln_render', arguments: args }).then(
      (result) =>
        result.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join(' '),
      (error) => error.message as string,
    );
    expect(message).toContain('shots.0.camera.position.0');
    expect(message).toContain('shots.0.camera.target.1');
    expect(message).toContain('expected number');
    expect(message).not.toContain('Unrecognized keys: "version"');
    const original = {
      code: 'function build(){}',
      capture: {
        version: 'kiln.capture.v1',
        size: 900,
        output: 'separate',
        shots: [
          {
            camera: {
              type: 'explicit',
              projection: 'orthographic',
              position: ['4.6', '3.1', '5.2'],
              target: ['0', '1.15', '0'],
              halfHeight: 1.6,
            },
          },
        ],
      },
    };
    const originalMessage = await client
      .callTool({ name: 'kiln_render', arguments: original })
      .then(
        (result) =>
          result.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join(' '),
        (error) => error.message as string,
      );
    expect(originalMessage).toContain('shots.0.camera.position.0');
    expect(originalMessage).toContain('shots.0.camera.target.2');
    expect(originalMessage).not.toContain('Unrecognized keys: "version"');
    expect(builds).toBe(0);
    const schema = createKilnProgramToolRegistry().find(
      (d) => d.name === 'kiln_render',
    )!.inputSchema;
    expect(schema.safeParse(args).success).toBe(false);
    expect(
      schema.safeParse({
        ...args,
        capture: {
          ...args.capture,
          shots: [
            {
              camera: {
                type: 'explicit',
                projection: 'orthographic',
                position: [4.6, 3, 5],
                target: [0, 1.15, 0],
              },
            },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ code: 'function build(){}', capture: { preset: '1x1' } }).success,
    ).toBe(true);
    const legacy = schema.safeParse({
      code: 'function build(){}',
      capture: { preset: '1x1', unknown: true },
    });
    expect(legacy.success).toBe(false);
    if (!legacy.success) expect(legacy.error.message).toContain('unknown');
  } finally {
    await client.close();
    await server.close();
  }
});

it('explains the supported equivalents for common orbit and image-size guesses', async () => {
  let builds = 0;
  const server = createKilnMcpServer({
    evaluatorPort: {
      async render() {
        builds++;
        throw new Error('invalid input reached evaluation');
      },
    },
  });
  const client = new Client({ name: 'capture-guidance-test', version: '0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const messageFor = (capture: Record<string, unknown>) =>
    client
      .callTool({
        name: 'kiln_render',
        arguments: { code: 'function build(){}', capture },
      })
      .then(
        (result) =>
          result.content
            .filter((content) => content.type === 'text')
            .map((content) => content.text)
            .join(' '),
        (error) => error.message as string,
      );
  try {
    const orbit = await messageFor({
      version: 'kiln.capture.v1',
      shots: [
        {
          camera: {
            type: 'orbit',
            target: [0, 1, 0],
            distance: 4,
          },
        },
      ],
    });
    expect(orbit).toContain('Orbit cameras derive target and distance');
    expect(orbit).toContain('subject and padding');

    const lens = await messageFor({
      version: 'kiln.capture.v1',
      shots: [
        {
          camera: {
            type: 'explicit',
            projection: 'perspective',
            position: [3, 3, 3],
            target: [0, 0, 0],
            fov: 40,
          },
        },
      ],
    });
    expect(lens).toContain('Unknown explicit camera key fov; use fovDeg');
    expect(lens).toContain('fovDeg (perspective, degrees)');

    const dimensions = await messageFor({
      version: 'kiln.capture.v1',
      width: 800,
      height: 600,
      shots: [{}],
    });
    expect(dimensions).toContain('square per-shot size');
    expect(dimensions).toContain('size');
    expect(builds).toBe(0);
  } finally {
    await client.close();
    await server.close();
  }
});
