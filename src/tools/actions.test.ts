import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { describeInputError, schemaFields } from './actions';

const input = z.strictObject({
  action: z.enum(['get', 'list']),
  materialId: z.string().optional(),
  revisionId: z.string().optional(),
});

describe('describeInputError', () => {
  it('answers a key the tool does not take with the keys it does', () => {
    // w28: Codex passed the `resourceId` a project's palette lists to kiln_material get.
    const parsed = input.safeParse({ action: 'get', resourceId: 'troy-timber' });
    expect(parsed.success).toBe(false);
    const message = describeInputError('kiln_material', parsed.error, {
      fields: schemaFields(input),
    });
    expect(message).toContain('resourceId');
    expect(message).toContain('kiln_material takes action, materialId and revisionId.');
    expect(message).not.toMatch(/\.\.(?:\s|$)/u);
  });

  it('lists no fields for a wrong value or an unknown key inside a nested record', () => {
    const wrong = input.safeParse({ action: 'frobnicate' });
    expect(
      describeInputError('kiln_material', wrong.error, { fields: schemaFields(input) }),
    ).not.toContain(' takes ');
    const nested = z.strictObject({ draft: z.strictObject({ name: z.string() }) });
    const inner = nested.safeParse({ draft: { name: 'x', colour: 'red' } });
    expect(
      describeInputError('kiln_material', inner.error, { fields: schemaFields(nested) }),
    ).not.toContain(' takes ');
  });

  it('names the Discovery shape of a nested record that failed to parse', () => {
    // w35: the camera fields at the root of a shot instead of under shot.camera.
    const animation = z.object({
      clip: z.string(),
      shot: z.strictObject({ name: z.string().optional(), camera: z.object({}) }).optional(),
    });
    const rootCamera = animation.safeParse({ clip: 'spin', shot: { type: 'orbit' } });
    const message = describeInputError('kiln_screenshot_animation', rootCamera.error, {
      shapes: { shot: 'shape:camera-shot', capture: 'shape:capture' },
    });
    expect(message).toContain('shot');
    expect(message).toContain("shot shape: kiln_discover({ ids: ['shape:camera-shot'] }).");
    expect(message).not.toContain("'shape:...'");
    expect(message).not.toContain('"code"');
    const generic = describeInputError('kiln_screenshot_animation', rootCamera.error);
    expect(generic).toContain("nested shapes: kiln_discover({ ids: ['shape:...'] })");
  });

  it('reads the keys of an advertised object schema and nothing from any other schema', () => {
    expect(schemaFields(input)).toEqual(['action', 'materialId', 'revisionId']);
    expect(schemaFields(z.string())).toEqual([]);
    expect(schemaFields(undefined)).toEqual([]);
  });
});
