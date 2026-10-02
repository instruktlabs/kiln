import { describe, expect, test } from 'bun:test';

import { executeKilnCode } from '../render';
import { validate } from '../validation';

const wrap = (body: string): string => `
const meta = { name: 'Policy test' };
function build() {
  const root = createRoot('Root');
  ${body}
  return root;
}
`;

const policyCodes = (source: string): string[] =>
  validate(source).issues.map((issue) => issue.code);

describe('H6.5 generated-source policy', () => {
  test.each([
    ['globalThis', 'void globalThis;'],
    ['global', 'void global;'],
    ['process', 'void process;'],
    ['fetch', "fetch('https://example.invalid');"],
    ['XMLHttpRequest', 'new XMLHttpRequest();'],
    ['WebSocket', "new WebSocket('wss://example.invalid');"],
    ['Function', "Function('return 1')();"],
    ['eval', "eval('1 + 1');"],
  ])('rejects the ambient %s capability', (_name, expression) => {
    expect(policyCodes(wrap(expression))).toContain('UNSAFE_GLOBAL_ACCESS');
  });

  test.each(["this['pro' + 'cess']", "globalThis['fe' + 'tch']", 'globalThis[`WebSocket`]'])(
    'rejects computed ambient-global access: %s',
    (expression) => {
      expect(policyCodes(wrap(`void ${expression};`))).toContain('UNSAFE_GLOBAL_ACCESS');
    },
  );

  test('rejects dynamic import without echoing its specifier', async () => {
    const source = wrap("return import('node:fs');");
    const result = validate(source);
    expect(result.issues.map(({ code }) => code)).toContain('DYNAMIC_IMPORT');
    expect(result.errors.join('\n')).not.toContain('node:fs');
    await expect(executeKilnCode(source)).rejects.toMatchObject({
      name: 'GeneratedSourcePolicyError',
      code: 'DYNAMIC_IMPORT',
    });
    try {
      await executeKilnCode(source);
    } catch (error) {
      expect(String(error)).not.toContain('node:fs');
    }
  });

  test.each([
    '(()=>{}).constructor',
    "(()=>{})['constructor']",
    "(()=>{})['con' + 'structor']",
    '(()=>{})[`constructor`]',
    "const key = 'con' + 'structor'; (()=>{})[key]",
    "Reflect.get(()=>{}, 'constructor')",
    'const { constructor: makeFunction } = (()=>{}); void makeFunction;',
  ])('rejects constructor-chain access: %s', (expression) => {
    expect(policyCodes(wrap(`${expression};`))).toContain('DYNAMIC_CODE_ACCESS');
  });

  test.each([
    'new THREE.DataTexture()',
    "new THREE['DataTexture']()",
    "new THREE['Data' + 'Texture']()",
    'new THREE[`DataTexture`]()',
    'new THREE.ShaderMaterial()',
    "new THREE['Shader' + 'Material']()",
    'new THREE.RawShaderMaterial()',
    "new THREE['RawShaderMaterial']()",
    'const { DataTexture: TextureCtor } = THREE; new TextureCtor();',
  ])('rejects generated raw material or texture construction: %s', (expression) => {
    expect(policyCodes(wrap(`${expression};`))).toContain('UNSAFE_THREE_CONSTRUCTOR');
  });

  test.each(['const T = THREE; new T.DataTexture();', 'let T; T = THREE; new T.ShaderMaterial();'])(
    'rejects aliasing the THREE namespace: %s',
    (expression) => {
      expect(policyCodes(wrap(expression))).toContain('UNSAFE_THREE_ALIAS');
    },
  );

  test('rejects non-static computed THREE access while preserving direct safe constructors', () => {
    expect(
      policyCodes(wrap("const name = Math.random() ? 'Mesh' : 'Group'; new THREE[name]();")),
    ).toContain('UNSAFE_THREE_COMPUTED_ACCESS');
    expect(policyCodes(wrap('new THREE.Mesh(); new THREE.Vector3();'))).not.toContain(
      'UNSAFE_THREE_COMPUTED_ACCESS',
    );
  });

  test('rejects descriptor-based constructor retrieval', () => {
    expect(
      policyCodes(wrap("Object.getOwnPropertyDescriptor((()=>{}), 'con' + 'structor').value;")),
    ).toContain('DYNAMIC_CODE_ACCESS');
  });

  test('blocks policy violations before generated source has any side effect', async () => {
    const marker = '__kilnH65ShouldNeverExecute';
    delete (globalThis as Record<string, unknown>)[marker];
    try {
      await expect(executeKilnCode(wrap(`globalThis['${marker}'] = true;`))).rejects.toMatchObject({
        name: 'GeneratedSourcePolicyError',
        code: 'UNSAFE_GLOBAL_ACCESS',
      });
      expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[marker];
    }
  });

  test('keeps safe THREE constructors and ordinary computed properties valid', async () => {
    const source = wrap(`
      const labels = { process: 'paint process', fetch: 'fetch detail', constructorLabel: 'constructor' };
      const axis = new THREE.Vector3(1, 0, 0);
      const mesh = new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0x884422));
      mesh.position[axis.x === 1 ? 'x' : 'z'] = labels['process'].length * 0.01;
      root.add(mesh);
    `);
    expect(validate(source).valid).toBe(true);
    await expect(executeKilnCode(source)).resolves.toMatchObject({
      root: { isObject3D: true },
    });
  });

  // Decision 23 of 2 October 2026 (F28: w29's mesh batcher was an object literal whose
  // `add` method read `this`). A method receiver is the object or instance the program
  // built; the evaluator runs generated code in strict mode, so no `this` outside a
  // method can be the host global, and the safety net keeps refusing those.
  test.each([
    [
      'an object-literal method',
      'const batch = { parts: [], add(m) { this.parts.push(m); return this; } }; batch.add(root);',
    ],
    [
      'an object-literal function property',
      'const batch = { n: 0, add: function (m) { this.n += 1; return m; } }; batch.add(root);',
    ],
    [
      'an object-literal getter',
      'const box = { w: 2, get half() { return this.w / 2; } }; root.userData.half = box.half;',
    ],
    [
      'a class method and constructor',
      'class Batch { constructor() { this.parts = []; } add(m) { this.parts.push(m); return this; } } new Batch().add(root);',
    ],
    [
      'a class field initializer',
      'class Rig { base = 1; top = this.base + 1; } root.userData.top = new Rig().top;',
    ],
    [
      'an arrow inside a method',
      'const rig = { parts: [1, 2], count() { return this.parts.map(() => this.parts.length); } }; root.userData.count = rig.count();',
    ],
  ])('allows this inside %s', async (_where, body) => {
    const source = wrap(body);
    expect(policyCodes(source)).not.toContain('UNSAFE_GLOBAL_ACCESS');
    expect(validate(source).valid).toBe(true);
    await expect(executeKilnCode(source)).resolves.toMatchObject({ root: { isObject3D: true } });
  });

  test.each([
    ['the program top level', 'void this;'],
    ['a function declaration', 'function size() { return this ? 1 : 2; } size();'],
    [
      'a function expression bound to a variable',
      'const size = function () { return this; }; size();',
    ],
    ['an arrow at the top level', 'const size = () => this; size();'],
    [
      'a function nested inside a method',
      'const rig = { count() { function inner() { return this; } return inner(); } }; rig.count();',
    ],
    [
      'an arrow nested inside a plain function',
      'function size() { return (() => this)(); } size();',
    ],
  ])('still refuses this inside %s', (_where, body) => {
    expect(policyCodes(wrap(body))).toContain('UNSAFE_GLOBAL_ACCESS');
  });

  test('still refuses module beside this', () => {
    expect(policyCodes(wrap('void module;'))).toContain('UNSAFE_GLOBAL_ACCESS');
  });

  test('runs generated code in strict mode: an undeclared assignment is an unbound variable', async () => {
    // Sloppy code would create a host global here; strict code throws a ReferenceError
    // that the engine answers with the unbound-variable advice.
    const marker = '__kilnStrictModeShouldNeverLeak';
    delete (globalThis as Record<string, unknown>)[marker];
    try {
      await expect(executeKilnCode(wrap(`${marker} = 1;`))).rejects.toMatchObject({
        name: 'AuthoringDiagnosticError',
        diagnostic: 'UNBOUND_VARIABLE',
      });
      expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[marker];
    }
  });

  test('validate reads strict-only syntax errors before the evaluator does', () => {
    // `with` and legacy octal literals are syntax errors in strict mode; naming the line
    // here keeps rule 9 for a construct the evaluator would otherwise reject generically.
    for (const body of ['with (root) { position; }', 'const mode = 010;']) {
      const result = validate(wrap(body));
      expect(result.valid).toBe(false);
      expect(result.issues.find((issue) => issue.code === 'SYNTAX_ERROR')?.line).toBe(5);
    }
  });

  test('does not scan comments, strings, or benign object keys as capabilities', () => {
    const source = wrap(`
      // fetch(globalThis.process) and new THREE.DataTexture() are forbidden examples only.
      const notes = ['eval', 'Function', 'WebSocket', 'constructor'];
      const metadata = { globalThis: false, process: false, DataTexture: false };
      root.userData.notes = notes;
      root.userData.metadata = metadata;
    `);
    expect(validate(source).valid).toBe(true);
  });
});
