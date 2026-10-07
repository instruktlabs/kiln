import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPublicTools, HOSTED_TOOL_SURFACE, hostedInstructions } from '../src/public-tools.ts';

const { tools: engine } = JSON.parse(
  await readFile(new URL('../src/generated/edge-manifest.json', import.meta.url), 'utf8'),
);

test('every reviewed engine operation has a separate hosted name and registry-derived fields', () => {
  const before = structuredClone(engine);
  const surface = createPublicTools(engine);
  assert.equal(HOSTED_TOOL_SURFACE, 'kiln.hosted-tools.v1');
  assert.equal(surface.tools.length, 26);
  for (const tool of engine) {
    const actions = tool.inputSchema.properties.action?.enum;
    const variants = actions
      ? actions.map((action) => [`${tool.name}_${action.replaceAll('-', '_')}`, { action }])
      : tool.name === 'kiln_discover'
        ? [
            ['kiln_discover', {}],
            ['kiln_capabilities', { capabilities: true }],
          ]
        : [[tool.name, {}]];
    for (const [name, fixed] of variants) {
      const publicTool = surface.tools.find((tool) => tool.name === name);
      assert.ok(publicTool, name);
      assert.deepEqual(surface.resolve(name, {}), { name: tool.name, arguments: fixed });
      assert.equal(publicTool.inputSchema.additionalProperties, false);
      assert.equal(publicTool.inputSchema.properties.action, undefined);
      assert.equal(publicTool.inputSchema.properties.capabilities, undefined);
      for (const [field, schema] of Object.entries(publicTool.inputSchema.properties))
        assert.deepEqual(schema, tool.inputSchema.properties[field], `${name}.${field}`);
      for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint'])
        assert.equal(typeof publicTool.annotations[key], 'boolean');
      assert.equal(publicTool.annotations.readOnlyHint, name === 'kiln_discover');
      assert.equal(publicTool.annotations.destructiveHint, false);
      assert.equal(publicTool.annotations.openWorldHint, false);
    }
    if (actions) assert.equal(surface.resolve(tool.name, { action: actions[0] }), undefined);
  }
  assert.deepEqual(engine, before, 'the installed engine manifest must not be mutated');
  assert.doesNotMatch(hostedInstructions, /render-service\/|dist\/|read the matching SKILL/);
});

test('registry drift cannot silently expose an unreviewed operation or drop a mapped input', () => {
  const more = structuredClone(engine);
  more
    .find((tool) => tool.name === 'kiln_material')
    .inputSchema.properties.action.enum.push('delete');
  assert.throws(() => createPublicTools(more), /Unreviewed engine actions/);
  assert.throws(
    () => createPublicTools([...engine, { name: 'new_operation', inputSchema: {} }]),
    /Unreviewed engine tool/,
  );
  assert.throws(() => createPublicTools(engine.slice(1)), /Missing engine tools/);
  const missingField = structuredClone(engine);
  delete missingField.find((tool) => tool.name === 'kiln_material').inputSchema.properties.draft;
  assert.throws(() => createPublicTools(missingField), /Missing engine field/);
  assert.throws(() => createPublicTools([...engine, engine[0]]), /Duplicate engine tool/);
});

test('action selection and argument widening cannot turn reads into another engine operation', () => {
  const surface = createPublicTools(engine);
  for (const name of ['kiln_material_get', 'kiln_assets_get', 'kiln_renderer_status']) {
    for (const args of [
      { action: 'import' },
      { payload: {} },
      JSON.parse('{"__proto__":{"action":"import"}}'),
    ])
      assert.equal(surface.resolve(name, args), undefined);
  }
  for (const name of [
    'constructor',
    '__proto__',
    'kiln_material_delete',
    'kiln_project',
    'kiln_review',
  ])
    assert.equal(surface.resolve(name, {}), undefined);
  assert.equal(surface.resolve('kiln_discover', { capabilities: true }), undefined);
  assert.equal(surface.resolve('kiln_capabilities', { ids: ['box'] }), undefined);
});
