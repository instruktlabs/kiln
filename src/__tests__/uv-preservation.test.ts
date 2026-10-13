import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { autoUnwrap } from '../uv';
import { prepareUnwrap, validateAtlasRemap, type AtlasMesh } from '../uv-data';

function tetrahedron() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1], 3),
  );
  geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  geometry.setAttribute('vertexId', new THREE.Uint16BufferAttribute([0, 1, 2, 3], 1));
  return geometry;
}

describe('autoUnwrap attribute correspondence', () => {
  for (const relative of [false, true]) {
    test(`remaps seams without losing typed attributes, groups or ${relative ? 'relative' : 'absolute'} morphs`, async () => {
      const input = tetrahedron();
      input.setAttribute(
        'color',
        new THREE.Uint8BufferAttribute(
          [255, 0, 0, 128, 0, 255, 0, 64, 0, 0, 255, 32, 20, 40, 60, 255],
          4,
          true,
        ),
      );
      input.setAttribute(
        'skinIndex',
        new THREE.Uint16BufferAttribute([0, 1, 0, 0, 1, 2, 0, 0, 2, 3, 0, 0, 3, 0, 0, 0], 4),
      );
      input.setAttribute(
        'skinWeight',
        new THREE.Float32BufferAttribute(
          [0.75, 0.25, 0, 0, 0.5, 0.5, 0, 0, 0.25, 0.75, 0, 0, 1, 0, 0, 0],
          4,
        ),
      );
      input.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      input.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(Array(4).fill([0, 1, 0]).flat(), 3),
      );
      input.setAttribute(
        'tangent',
        new THREE.Float32BufferAttribute(Array(4).fill([1, 0, 0, 1]).flat(), 4),
      );
      input.morphAttributes.position = [
        new THREE.Float32BufferAttribute([0.2, 0, 0, 0, 0.3, 0, 0, 0, 0.4, 0.1, 0.2, 0.3], 3),
      ];
      input.morphAttributes.normal = [
        new THREE.Float32BufferAttribute(Array(4).fill([0, 0, 0.2]).flat(), 3),
      ];
      input.morphTargetsRelative = relative;
      input.name = 'Painted weighted mesh';
      input.userData = { recipe: { version: 2 }, atlas: { obsolete: true } };
      input.addGroup(6, 6, 1);
      input.addGroup(0, 6, 0);
      input.setDrawRange(3, 6);
      const color = input.getAttribute('color') as THREE.BufferAttribute;
      color.name = 'Tint';
      color.setUsage(THREE.DynamicDrawUsage);
      const before = JSON.stringify(input.toJSON());
      const output = await autoUnwrap(input, { resolution: 128, useNormals: true });
      expect(output.getAttribute('vertexId')).toBeDefined();
      expect(output.getAttribute('position').count).toBeGreaterThan(4);
      expect(output.groups).toEqual(input.groups);
      expect(output.drawRange).toEqual(input.drawRange);
      expect(output.name).toBe(input.name);
      expect(output.userData.recipe).toEqual(input.userData.recipe);
      expect(output.userData.recipe).not.toBe(input.userData.recipe);
      expect(output.userData.atlas.obsolete).toBeUndefined();
      expect(output.morphTargetsRelative).toBe(relative);
      expect(output.getAttribute('tangent')).toBeUndefined(); // UV0 changed.
      for (const [name, source] of Object.entries(input.attributes)) {
        if (name === 'tangent') continue;
        const target = output.getAttribute(name) as THREE.BufferAttribute;
        expect(target.array.constructor).toBe(source.array.constructor);
        expect(target.normalized).toBe(source.normalized);
        expect(target.array).not.toBe(source.array);
        for (let i = 0; i < target.count; i++) {
          const oldIndex = output.getAttribute('vertexId').getX(i);
          for (let c = 0; c < source.itemSize; c++) {
            expect(target.getComponent(i, c)).toBe(source.getComponent(oldIndex, c));
          }
        }
      }
      expect((output.getAttribute('color') as THREE.BufferAttribute).usage).toBe(
        THREE.DynamicDrawUsage,
      );
      expect(output.getAttribute('color').name).toBe('Tint');
      for (const key of ['position', 'normal'] as const) {
        const target = output.morphAttributes[key]![0]!;
        const source = input.morphAttributes[key]![0]!;
        expect(target.array).not.toBe(source.array);
        for (let i = 0; i < target.count; i++) {
          for (let c = 0; c < 3; c++) {
            expect(target.getComponent(i, c)).toBe(
              source.getComponent(output.getAttribute('vertexId').getX(i), c),
            );
          }
        }
      }
      for (let i = 0; i < input.index!.count; i++) {
        expect(output.getAttribute('vertexId').getX(output.index!.getX(i))).toBe(
          input.index!.getX(i),
        );
      }
      expect(JSON.stringify(input.toJSON())).toBe(before);
    });
  }

  test('keeps coincident corners distinct and reads interleaved positions at their actual stride', async () => {
    const geometry = new THREE.BufferGeometry();
    const data = new THREE.InterleavedBuffer(
      new Float32Array([
        0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0.5,
        0, -1, 0, 0, 0, 0, 0.5,
      ]),
      6,
    );
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(data, 3, 3));
    geometry.setAttribute('vertexId', new THREE.Uint16BufferAttribute([0, 1, 2, 3, 4, 5], 1));
    const half = new THREE.Float16BufferAttribute(new Uint16Array(6), 1);
    for (let i = 0; i < 6; i++) half.setX(i, i / 4);
    geometry.setAttribute('half', half);
    const before = data.array.slice();
    const output = await autoUnwrap(geometry, { resolution: 128 });
    expect(output.getAttribute('vertexId')).toBeDefined();
    expect(output.getAttribute('half')).toBeInstanceOf(THREE.Float16BufferAttribute);
    for (const name of ['position', 'color', 'half']) {
      const target = output.getAttribute(name);
      const source = geometry.getAttribute(name);
      for (let i = 0; i < target.count; i++) {
        for (let c = 0; c < source.itemSize; c++) {
          expect(target.getComponent(i, c)).toBe(
            source.getComponent(output.getAttribute('vertexId').getX(i), c),
          );
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      expect(output.getAttribute('vertexId').getX(output.index!.getX(i))).toBe(i);
    }
    expect(data.array).toEqual(before);
  });

  test('decodes normalized and half-float positions for charting, while retaining storage', async () => {
    const reference = tetrahedron();
    const original = reference.getAttribute('position');
    const expected = await autoUnwrap(reference, { resolution: 128 });
    for (const attribute of [
      new THREE.Int16BufferAttribute(new Int16Array(12), 3, true),
      new THREE.Float16BufferAttribute(new Uint16Array(12), 3),
    ]) {
      for (let i = 0; i < 4; i++)
        attribute.setXYZ(i, original.getX(i), original.getY(i), original.getZ(i));
      const input = reference.clone().setAttribute('position', attribute);
      const output = await autoUnwrap(input, { resolution: 128 });
      expect(output.getAttribute('uv').array).toEqual(expected.getAttribute('uv').array);
      expect(output.getAttribute('position').array.constructor).toBe(attribute.array.constructor);
      for (let i = 0; i < output.getAttribute('position').count; i++) {
        expect(output.getAttribute('position').getX(i)).toBe(
          expected.getAttribute('position').getX(i),
        );
      }
    }
  });

  test('rejects unsupported or malformed inputs before native allocation', () => {
    const invalid: Array<[string, (g: THREE.BufferGeometry) => void, RegExp]> = [
      [
        'missing positions',
        (g) => {
          g.deleteAttribute('position');
        },
        /position/,
      ],
      [
        'oversized input',
        (g) => {
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(65537 * 3), 3),
          );
        },
        /65536/,
      ],
      [
        'partial triangles',
        (g) => {
          g.setIndex([0, 1]);
        },
        /whole number/,
      ],
      [
        'index range',
        (g) => {
          g.setIndex([0, 1, 4]);
        },
        /invalid source vertex/,
      ],
      [
        'non-finite positions',
        (g) => {
          g.getAttribute('position').setX(0, NaN);
        },
        /non-finite/,
      ],
      [
        'wrong count',
        (g) => {
          g.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0], 3));
        },
        /matching per-vertex/,
      ],
      [
        'instance attribute',
        (g) => {
          g.setAttribute('instance', new THREE.InstancedBufferAttribute(new Float32Array(4), 1));
        },
        /per-instance/,
      ],
      [
        'morph UV',
        (g) => {
          (g.morphAttributes as Record<string, THREE.BufferAttribute[]>).uv = [
            new THREE.Float32BufferAttribute(new Float32Array(8), 2),
          ];
        },
        /morph uv is unsupported/,
      ],
      [
        'normal morph reference',
        (g) => {
          g.morphAttributes.normal = [new THREE.Float32BufferAttribute(new Float32Array(12), 3)];
        },
        /normal morphs require/,
      ],
      [
        'bad group',
        (g) => {
          g.addGroup(1, 3, 0);
        },
        /groups/,
      ],
    ];
    for (const [, change, error] of invalid) {
      const input = tetrahedron();
      change(input);
      expect(() => prepareUnwrap(input, {})).toThrow(error);
    }
    for (const resolution of [0, 4097, 1.5, Infinity])
      expect(() => prepareUnwrap(tetrahedron(), { resolution })).toThrow(/resolution/);
    for (const padding of [-1, 1.5, 1025, NaN])
      expect(() => prepareUnwrap(tetrahedron(), { padding })).toThrow(/padding/);
    expect(() => prepareUnwrap(tetrahedron(), { useNormals: 'yes' as unknown as boolean })).toThrow(
      /boolean/,
    );
  });

  test('validates triangle correspondence and the adapter Uint16 boundary independently of WASM', () => {
    const indices = new Uint32Array([0, 1, 2]);
    const valid = (): AtlasMesh => ({
      vertexCount: 3,
      index: new Uint16Array([0, 1, 2]),
      oldIndexes: new Uint16Array([0, 1, 2]),
      vertex: { coords1: new Float32Array([0, 0, 1, 0, 0, 1]) },
    });
    expect(Array.from(validateAtlasRemap(valid(), indices, 3).index)).toEqual(Array.from(indices));
    const changes: Array<[(mesh: AtlasMesh) => void, RegExp]> = [
      [
        (m) => {
          m.vertexCount = 65537;
        },
        /65536/,
      ],
      [
        (m) => {
          m.oldIndexes = [0, 1];
        },
        /incomplete source-vertex/,
      ],
      [
        (m) => {
          m.oldIndexes = [0, -1, 2];
        },
        /invalid source-vertex/,
      ],
      [
        (m) => {
          m.index = [0, 1];
        },
        /triangle count/,
      ],
      [
        (m) => {
          m.index = [0, 2, 1];
        },
        /triangle correspondence/,
      ],
      [
        (m) => {
          m.index = [0, 1, 3];
        },
        /triangle correspondence/,
      ],
      [
        (m) => {
          m.vertex.coords1 = [0, 0, 1, 0, 0, NaN];
        },
        /UV coordinates/,
      ],
      [
        (m) => {
          m.vertex.coords1 = undefined;
        },
        /UV coordinates/,
      ],
    ];
    for (const [change, error] of changes) {
      const mesh = valid();
      change(mesh);
      expect(() => validateAtlasRemap(mesh, indices, 3)).toThrow(error);
    }
    const edge = valid();
    edge.vertexCount = 65536;
    edge.oldIndexes = new Uint16Array(65536);
    edge.oldIndexes[1] = 1;
    edge.oldIndexes[65535] = 2;
    edge.index = new Uint16Array([0, 1, 65535]);
    edge.vertex.coords1 = new Float32Array(65536 * 2);
    expect(validateAtlasRemap(edge, indices, 3).index[2]).toBe(65535);
  });
});
