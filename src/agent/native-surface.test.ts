import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import * as skin from './tools';
import * as agent from './index';
import { createKilnNativeToolRegistry } from '../tools/registry';
import * as publicTools from '@instruktlabs/kiln/tools';

test('native discovery uses the registry presentation once, preserving long structured detail', async () => {
  const def = createKilnNativeToolRegistry({}, {}).find((t) => t.name === 'kiln_discover')!;
  const tool = skin
    .makeKilnNativeTools({}, {})
    .find((t) => t.name === 'kiln_discover')! as unknown as {
    invoke(input: unknown): Promise<unknown>;
  };
  for (const input of [{}, { ids: ['proceduralTexture'] }, { ids: ['unknown-helper'] }]) {
    const data = await def.run(input);
    const native = (await tool.invoke(input)) as unknown as { type: string; text: string }[];
    expect(native).toHaveLength(1);
    expect(native[0]!.type).toBe('textBlock');
    expect(native[0]!.text).toBe(def.text!(data)!);
  }
  const detail = (await def.run({ ids: ['proceduralTexture'] })) as Record<string, unknown>;
  const { text: _text, ...structured } = detail;
  const rendered = def.text!({ ...detail, text: 'incomplete preview', textTruncated: true });
  expect(JSON.parse(rendered!)).toEqual(structured);
});

test('public tools cannot recreate the retired four-tool workflow', () => {
  for (const name of ['createKilnToolRegistry', 'kilnToolRegistry'])
    expect(Object.hasOwn(publicTools, name)).toBe(false);
  expect(publicTools.createKilnProgramToolRegistry().map((tool) => tool.name)).not.toContain(
    'kiln_screenshot',
  );
});

test('the retired category-driven prompt module has no public or source fallback', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  expect(Object.hasOwn(pkg.exports, './prompt')).toBe(false);
  expect(existsSync(new URL('../prompt.ts', import.meta.url))).toBe(false);
  expect(() => import.meta.resolve('@instruktlabs/kiln/prompt')).toThrow();
  expect(typeof agent.runKilnAgent).toBe('function');
});

test('native skin exposes only the canonical registry and no old factory fallback', () => {
  for (const name of [
    'makeKilnTools',
    'makeKilnEditTools',
    'makeKilnUnifiedTools',
    'makeKilnProgramTools',
    'KILN_SUBMIT_TOOL_NAME',
  ])
    expect(Object.hasOwn(skin, name)).toBe(false);
  expect(skin.makeKilnNativeTools({}, {}).map((t) => t.name)).toEqual(
    createKilnNativeToolRegistry({}, {}).map((d) => d.name),
  );
});

test('public native entrypoint cannot invoke retired post-finish grade repair or buffer factories', () => {
  for (const name of [
    'assessProgramGrade',
    'shouldGradeRefine',
    'buildGradeRefineMessage',
    'GRADE_REFINE_TARGET',
    'installMutatorBatchGuard',
    'makeKilnTools',
    'makeKilnUnifiedTools',
  ])
    expect(Object.hasOwn(agent, name)).toBe(false);
});
