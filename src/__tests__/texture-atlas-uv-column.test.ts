/**
 * Column-atlas UV remapping (#293).
 *
 * A foliage runtime carries the wind sway weight in UV0's V coordinate — the
 * `uv-y` convention — so V is a per-vertex gradient from anchored base to free
 * tip, not an atlas coordinate. The default `axes: 'uv'` remap replaces both
 * components, which is correct for ordinary assets and destroys that gradient.
 * `axes: 'u-only'` rescales U into a full-height species column and passes V
 * through untouched.
 */
import { afterEach, expect, test } from 'bun:test';
import * as THREE from 'three';
import { remapUVToAtlas, textureAtlas } from '../texture-atlas';
import { collectAtlasProvenance, expandAtlasBinding } from '../atlas-provenance';
import { renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';
import { inspectAtlasScene } from '../qa/atlas';

const previousQaMode = process.env['KILN_QA_MODE'];
afterEach(() => {
  if (previousQaMode === undefined) delete process.env['KILN_QA_MODE'];
  else process.env['KILN_QA_MODE'] = previousQaMode;
});

const sampler = {
  minFilter: 'linear',
  magFilter: 'linear',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
};

function leafSource(tint: number) {
  return {
    kind: 'procedural',
    spec: {
      schemaVersion: 3,
      width: 32,
      height: 32,
      operations: [
        {
          op: 'paint',
          shape: { kind: 'rectangle', x: 0, y: 0, width: 32, height: 32 },
          rgba: [tint, 255, 0, 255],
        },
      ],
    },
  };
}

/** Three full-height species columns in a 96x32 sheet, no gutter. */
const columnSpec = {
  schemaVersion: 1,
  width: 96,
  height: 32,
  usage: 'albedo',
  sampler,
  regions: [0, 1, 2].map((i) => ({
    name: `species_${i}`,
    content: { x: i * 32, y: 0, width: 32, height: 32 },
    gutter: 0,
    source: leafSource(10 * i),
  })),
};

/** A packed sheet: MaxRects places each region with the default gutter of 2. */
const packedSpec = {
  schemaVersion: 1,
  usage: 'albedo',
  sampler,
  pack: { edge: 1024 as const },
  regions: [0, 1, 2].map((i) => ({ name: `species_${i}`, source: leafSource(10 * i) })),
};

/** One blade: V runs 0 at the anchored base to 1 at the free tip. */
function blade(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.01, 0, 0, 0.01, 0, 0, -0.01, 1, 0, 0.01, 1, 0], 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}

const vs = (geometry: THREE.BufferGeometry) => {
  const uv = geometry.getAttribute('uv');
  return [uv.getY(0), uv.getY(1), uv.getY(2), uv.getY(3)];
};
const us = (geometry: THREE.BufferGeometry) => {
  const uv = geometry.getAttribute('uv');
  return [uv.getX(0), uv.getX(1), uv.getX(2), uv.getX(3)];
};

test('u-only rescales U into the column band and leaves the uv-y gradient exact', async () => {
  const atlas = await textureAtlas(columnSpec);
  const output = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'content-boundary',
    axes: 'u-only',
  });
  expect(us(output)).toEqual([1 / 3, 2 / 3, 1 / 3, 2 / 3].map(Math.fround));
  expect(vs(output)).toEqual([0, 0, 1, 1]);
});

test('u-only insets U at texel centers while V stays exact', async () => {
  const atlas = await textureAtlas(columnSpec);
  const output = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'texel-center',
    axes: 'u-only',
  });
  // 32-texel column at x=32 in a 96-wide sheet: first/last texel centers.
  expect(us(output)).toEqual([32.5 / 96, 63.5 / 96, 32.5 / 96, 63.5 / 96].map(Math.fround));
  expect(vs(output)).toEqual([0, 0, 1, 1]);
  // The same inset applied to V is what squeezes a sway gradient.
  const both = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'texel-center',
  });
  expect(vs(both)).not.toEqual([0, 0, 1, 1]);
});

test('u-only preserves every V value in a dense gradient bit-for-bit', async () => {
  const atlas = await textureAtlas(columnSpec);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < 64; i++) {
    const v = i / 63;
    positions.push(0, v, 0);
    uvs.push(i % 2, v);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const before = Float32Array.from(geometry.getAttribute('uv').array);
  const output = remapUVToAtlas(geometry, atlas, 'species_2', {
    inputOrigin: 'top-left',
    mode: 'texel-center',
    axes: 'u-only',
  });
  const after = output.getAttribute('uv');
  for (let i = 0; i < 64; i++) expect(after.getY(i)).toBe(before[i * 2 + 1]!);
});

test('u-only rejects a region that does not span the full atlas height', async () => {
  const atlas = await textureAtlas(packedSpec);
  expect(() =>
    remapUVToAtlas(blade(), atlas, 'species_1', {
      inputOrigin: 'top-left',
      mode: 'content-boundary',
      axes: 'u-only',
    }),
  ).toThrow(/full atlas height/i);
});

test('u-only rejects a bottom-left input origin, which would invert base and tip', async () => {
  const atlas = await textureAtlas(columnSpec);
  expect(() =>
    remapUVToAtlas(blade(), atlas, 'species_1', {
      inputOrigin: 'bottom-left',
      mode: 'content-boundary',
      axes: 'u-only',
    }),
  ).toThrow(/top-left/i);
});

test('u-only rejects an unknown axes value', async () => {
  const atlas = await textureAtlas(columnSpec);
  expect(() =>
    remapUVToAtlas(blade(), atlas, 'species_1', {
      inputOrigin: 'top-left',
      mode: 'content-boundary',
      axes: 'v-only',
    } as never),
  ).toThrow();
});

test('u-only records axes in the binding and round-trips through provenance', async () => {
  const atlas = await textureAtlas(columnSpec);
  const output = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'texel-center',
    axes: 'u-only',
  });
  const binding = output.userData.kilnAtlasBinding;
  expect(binding.axes).toBe('u-only');
  expect(binding.scale).toEqual([31 / 96, 1]);
  expect(binding.offset).toEqual([32.5 / 96, 0]);

  const material = new THREE.MeshStandardMaterial({ map: atlas });
  const mesh = new THREE.Mesh(output, material);
  const root = new THREE.Group();
  root.add(mesh);
  const provenance = collectAtlasProvenance(root);
  const compact = provenance.binding(output);
  expect(compact?.axes).toBe('u-only');
  expect(expandAtlasBinding(compact, provenance.table!)).toEqual(binding);
});

test('atlas QA accepts a u-only binding whose V spans the full column', async () => {
  // texel-center insets U only, so the V domain this binding must satisfy is the
  // content boundary, not the inset one.
  const atlas = await textureAtlas(columnSpec);
  for (const mode of ['content-boundary', 'texel-center'] as const) {
    const geometry = remapUVToAtlas(blade(), atlas, 'species_1', {
      inputOrigin: 'top-left',
      mode,
      axes: 'u-only',
    });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: atlas })));
    const inspection = inspectAtlasScene(root);
    expect(inspection.findings.map((f) => f.code)).toEqual([]);
  }
});

test('atlas QA still rejects a V gradient that escapes an inset region', async () => {
  // The same pass-through V over a region that does not reach the sheet edges is
  // out of domain; u-only rejects that layout, so only a hand-built UV gets here.
  const inset = {
    ...columnSpec,
    regions: columnSpec.regions.map((r, i) => ({
      ...r,
      content: { ...r.content, y: 2, height: 28 },
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: 32,
          height: 28,
          operations: [
            {
              op: 'paint',
              shape: { kind: 'rectangle', x: 0, y: 0, width: 32, height: 28 },
              rgba: [10 * i, 255, 0, 255],
            },
          ],
        },
      },
    })),
  };
  const atlas = await textureAtlas(inset);
  const geometry = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'content-boundary',
  });
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: atlas })));
  expect(inspectAtlasScene(root).findings.map((f) => f.code)).toContain('ATLAS_UV_DOMAIN');
});

test('a u-only binding survives a GLB round trip with the gradient intact', async () => {
  // This fixture is one blade, not a qualifiable asset; the binding is the subject.
  process.env['KILN_QA_MODE'] = 'off';
  const atlas = await textureAtlas(columnSpec);
  const geometry = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'texel-center',
    axes: 'u-only',
  });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: atlas })));
  const exported = await renderSceneToGLB(root, { optimize: 'off' });
  const restored = await loadGlbReviewScene(exported.bytes);
  const meshes: THREE.Mesh[] = [];
  restored.root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  const reloaded = meshes[0]!.geometry;
  expect(reloaded.userData.kilnAtlasBinding).toEqual(geometry.userData.kilnAtlasBinding);
  expect(vs(reloaded)).toEqual([0, 0, 1, 1]);
});

test('the default axes value stays absent from the binding, so existing stamps are unchanged', async () => {
  const atlas = await textureAtlas(columnSpec);
  const output = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
  });
  const binding = output.userData.kilnAtlasBinding;
  expect('axes' in binding).toBe(false);

  const explicit = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
    axes: 'uv',
  });
  expect(explicit.userData.kilnAtlasBinding).toEqual(binding);
  expect(us(explicit)).toEqual(us(output));
  expect(vs(explicit)).toEqual(vs(output));
});

/**
 * Evidence for #293: what the default replacement does to a `uv-y` gradient.
 * The full-height column case happens to survive, which is exactly why the
 * blanket "UV0 is replaced" contract line misled an author into hand-rolling
 * atlas UVs — the working configuration is indistinguishable from the broken
 * ones without doing the arithmetic.
 */
test('default uv remapping destroys a uv-y gradient on a packed region', async () => {
  const atlas = await textureAtlas(packedSpec);
  const output = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'content-boundary',
  });
  const gradient = vs(output);
  expect(gradient[0]).toBeGreaterThan(0);
  // 32 content texels in a 1024 sheet: the sway range collapses to ~3%.
  expect(gradient[2]! - gradient[0]!).toBeCloseTo(32 / 1024, 6);
});

test('default uv remapping on a full-height column survives only by arithmetic', async () => {
  const atlas = await textureAtlas(columnSpec);
  const boundary = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'top-left',
    mode: 'content-boundary',
  });
  expect(vs(boundary)).toEqual([0, 0, 1, 1]);
  const flipped = remapUVToAtlas(blade(), atlas, 'species_1', {
    inputOrigin: 'bottom-left',
    mode: 'content-boundary',
  });
  expect(vs(flipped)).toEqual([1, 1, 0, 0]);
});
