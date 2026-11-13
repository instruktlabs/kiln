/**
 * A build tells its author about flush faces: kiln_render names the parts that will flicker
 * and what to do, in the warnings every detail level returns, and says nothing once fixed.
 */
import { describe, expect, test } from 'bun:test';
import { MemoryProgramStore } from '../../program-store';
import { createKilnProgramToolRegistry } from '../registry';

const program = (lift: number) => `const meta = { name: 'Sign' };
function build() {
  const root = createRoot('Sign');
  createPart('Board', boxGeo(1, 0.6, 0.04), gameMaterial(0x6b4a2b), { parent: root, position: [0, 0.3, 0] });
  // With no lift the plaque's back rests on the board's front face.
  createPart('Plaque', boxGeo(0.4, 0.2, 0.01), gameMaterial(0xd8c690), { parent: root, position: [0, 0.3, 0.02 + 0.005 + ${lift}] });
  return root;
}`;

const flushWarnings = async (code: string, detail?: string) => {
  const programStore = new MemoryProgramStore();
  const render = createKilnProgramToolRegistry({ programStore }).find(
    (def) => def.name === 'kiln_render',
  )!;
  const result = (await render.run({
    programRef: await programStore.put(code),
    image: false,
    ...(detail ? { detail } : {}),
  })) as { ok: boolean; warnings?: string[] };
  expect(result.ok).toBe(true);
  return (result.warnings ?? []).filter((warning) => warning.startsWith('FLUSH_FACES'));
};

describe('flush faces in kiln_render', () => {
  test('a face laid flush on another is named with its fix', async () => {
    // Sunk by its own depth, the plaque's front face lies in the board's front face.
    const sunk = program(-0.01);
    const warnings = await flushWarnings(sunk);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'It is Mesh_Board and Mesh_Plaque, on one plane, sharing 0.08 m²',
    );
    expect(warnings[0]).toContain('normal (0, 0, 1)');
    expect(warnings[0]).toContain('Move the smaller face at least 2 mm along that normal');
    expect(await flushWarnings(sunk, 'lean')).toHaveLength(1);
  }, 60_000);

  test('a plaque resting on the board, or standing 2 mm proud, is not reported', async () => {
    // Resting: the two touching faces face each other, so only one is ever drawn.
    expect(await flushWarnings(program(0))).toEqual([]);
    expect(await flushWarnings(program(-0.008))).toEqual([]);
  }, 60_000);
});
