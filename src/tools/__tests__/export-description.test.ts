/**
 * The kiln_export description states what the runtime profile changes: besides moving
 * Kiln review clips out of GLB extras, it marks the parameters the file carries and
 * lists them in the sidecar (docs/export-profiles.md, "What runtime changes").
 */
import { describe, expect, test } from 'bun:test';
import { createKilnProgramToolRegistry } from '../registry';

describe('kiln_export description', () => {
  const tool = createKilnProgramToolRegistry().find((def) => def.name === 'kiln_export');

  test('does not claim the runtime profile only moves review clips', () => {
    expect(tool?.description).not.toContain('moving only');
  });

  test('says the runtime file marks the parameters it carries', () => {
    expect(tool?.description).toMatch(/carrie[sd] parameters|parameters it carries/u);
  });
});
