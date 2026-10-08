/** Structural corpus gate. Run with Bun; no image renderer or live provider is invoked. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { exampleArchivePath } from './example-archive.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rounded = (values) => Array.from(values, (value) => Math.round(value * 1e6) / 1e6);

export async function signature(document) {
  const root = document.getRoot();
  const paths = new Map();
  const nodes = [];
  const visit = (node, prefix, index) => {
    const nodePath = `${prefix}/${index}:${node.getName()}`;
    paths.set(node, nodePath);
    nodes.push(node);
    node.listChildren().forEach((child, childIndex) => {
      visit(child, nodePath, childIndex);
    });
  };
  root.listScenes().forEach((scene, sceneIndex) => {
    scene.listChildren().forEach((node, index) => {
      visit(node, `scene:${sceneIndex}`, index);
    });
  });
  const textures = new Map();
  for (const texture of root.listTextures()) {
    const bytes = texture.getImage();
    if (!bytes) continue;
    // Compare decoded pixels rather than PNG/JPEG container metadata or encoder choices.
    const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(texture, {
      width: decoded.info.width,
      height: decoded.info.height,
      pixels: digest(decoded.data),
    });
  }
  const material = (mat) =>
    mat && {
      name: mat.getName(),
      baseColor: rounded(mat.getBaseColorFactor()),
      metallic: mat.getMetallicFactor(),
      roughness: mat.getRoughnessFactor(),
      emissive: rounded(mat.getEmissiveFactor()),
      doubleSided: mat.getDoubleSided(),
      alphaMode: mat.getAlphaMode(),
      alphaCutoff: mat.getAlphaCutoff(),
      normalScale: mat.getNormalScale(),
      occlusionStrength: mat.getOcclusionStrength(),
      textures: [
        mat.getBaseColorTexture(),
        mat.getMetallicRoughnessTexture(),
        mat.getNormalTexture(),
        mat.getOcclusionTexture(),
        mat.getEmissiveTexture(),
      ].map((texture) => textures.get(texture) ?? null),
      extensions: mat
        .listExtensions()
        .map((extension) => extension.extensionName)
        .sort(),
    };
  return {
    extensions: root
      .listExtensionsUsed()
      .map((extension) => extension.extensionName)
      .sort(),
    nodes: nodes.map((node) => {
      const matrix = node.getWorldMatrix();
      const primitives =
        node
          .getMesh()
          ?.listPrimitives()
          .map((primitive) => {
            const position = primitive.getAttribute('POSITION');
            const low = [Infinity, Infinity, Infinity];
            const high = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; position && i < position.getCount(); i++) {
              const [x, y, z] = position.getElement(i, []);
              for (let axis = 0; axis < 3; axis++) {
                const coordinate =
                  matrix[axis] * x +
                  matrix[4 + axis] * y +
                  matrix[8 + axis] * z +
                  matrix[12 + axis];
                low[axis] = Math.min(low[axis], coordinate);
                high[axis] = Math.max(high[axis], coordinate);
              }
            }
            return {
              mode: primitive.getMode(),
              material: material(primitive.getMaterial()),
              worldBounds: position ? [rounded(low), rounded(high)] : null,
              attributes: Object.fromEntries(
                primitive
                  .listSemantics()
                  .sort()
                  .map((semantic) => {
                    const accessor = primitive.getAttribute(semantic);
                    return [
                      semantic,
                      {
                        count: accessor.getCount(),
                        type: accessor.getType(),
                        normalized: accessor.getNormalized(),
                        values: digest(JSON.stringify(rounded(accessor.getArray()))),
                      },
                    ];
                  }),
              ),
              indices: primitive.getIndices()
                ? digest(JSON.stringify(Array.from(primitive.getIndices().getArray())))
                : null,
              morphTargets: primitive.listTargets().map((target) =>
                Object.fromEntries(
                  target
                    .listSemantics()
                    .sort()
                    .map((semantic) => [
                      semantic,
                      digest(JSON.stringify(rounded(target.getAttribute(semantic).getArray()))),
                    ]),
                ),
              ),
            };
          }) ?? [];
      return {
        path: paths.get(node),
        matrix: rounded(matrix),
        localMatrix: rounded(node.getMatrix()),
        extras: node.getExtras(),
        weights: node.getWeights(),
        primitives,
        skin: node.getSkin()
          ? {
              joints: node
                .getSkin()
                .listJoints()
                .map((joint) => paths.get(joint)),
              inverseBindMatrices: rounded(
                node.getSkin().getInverseBindMatrices()?.getArray() ?? [],
              ),
            }
          : null,
      };
    }),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation
        .listChannels()
        .map((channel) => ({
          target: paths.get(channel.getTargetNode()),
          path: channel.getTargetPath(),
          interpolation: channel.getSampler().getInterpolation(),
          input: rounded(channel.getSampler().getInput().getArray()),
          output: rounded(channel.getSampler().getOutput().getArray()),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })),
  };
}

export function differences(a, b, prefix = '$') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return [prefix];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .flatMap((key) => differences(a[key], b[key], `${prefix}.${key}`));
}

async function selfTest() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const mat = doc.createMaterial().setRoughnessFactor(0.3);
  const mesh = doc
    .createMesh()
    .addPrimitive(doc.createPrimitive().setAttribute('POSITION', positions).setMaterial(mat));
  const pivot = doc.createNode('Joint_Test').setTranslation([3, 0, 0]);
  pivot.addChild(doc.createNode('Mesh_Test').setMesh(mesh));
  doc.createScene().addChild(pivot);
  const baseline = await signature(doc);
  assert.deepEqual(baseline.nodes[1].primitives[0].worldBounds, [
    [3, 0, 0],
    [4, 1, 0],
  ]);
  assert.deepEqual(
    differences(baseline, await signature(await io.readBinary(await io.writeBinary(doc)))),
    [],
  );
  mat.setRoughnessFactor(0.8);
  assert(differences(baseline, await signature(doc)).some((item) => item.endsWith('.roughness')));
  mat.setRoughnessFactor(0.3);
  pivot.setTranslation([4, 0, 0]);
  assert(differences(baseline, await signature(doc)).some((item) => item.includes('.worldBounds')));
  pivot.setTranslation([3, 0, 0]);
  positions.setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]));
  assert(
    differences(baseline, await signature(doc)).some((item) => item.endsWith('.POSITION.values')),
  );
  console.log(
    'Signature self-test passed: serialization invariant; transform, material, and same-bounds vertex changes detected.',
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const option = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const input = path.resolve(option('--input', null) ?? exampleArchivePath());
  const output = path.resolve(option('--out', 'tmp/exporter-corpus/current'));
  const compare = option('--compare', null);
  const filter = option('--filter', '');
  const limit = Number(option('--limit', '0'));
  const { renderGLB } = await import('../src/render.ts');
  const { createAssetIntentV1 } = await import('../src/contracts/index.ts');
  await mkdir(output, { recursive: true });
  let files = (await readdir(input))
    .filter((file) => file.endsWith('.kiln.js') && file.includes(filter))
    .sort();
  if (limit) files = files.slice(0, limit);
  if (!files.length) throw new Error(`No .kiln.js fixtures matched ${input}`);
  const results = [];
  for (const file of files) {
    try {
      const source = await readFile(path.join(input, file), 'utf8');
      const opts = { intent: createAssetIntentV1({ category: 'prop' }), optimize: 'off' };
      const first = await renderGLB(source, opts);
      const second = await renderGLB(source, opts);
      const current = await signature(await io.readBinary(first.glb));
      const name = file.replace('.kiln.js', '');
      const signatureName = `${name}.signature.json`;
      await writeFile(path.join(output, `${name}.glb`), first.glb);
      await writeFile(path.join(output, signatureName), `${JSON.stringify(current, null, 2)}\n`);
      const changes = compare
        ? differences(
            JSON.parse(await readFile(path.join(compare, signatureName), 'utf8')),
            current,
          )
        : [];
      const deterministic = digest(first.glb) === digest(second.glb);
      results.push({
        file,
        sourceSha256: digest(source),
        glbSha256: digest(first.glb),
        bytes: first.glb.length,
        deterministic,
        changes,
      });
      console.log(
        `${file}: ${deterministic ? 'repeatable' : 'NONDETERMINISTIC'}, ${changes.length} signature differences`,
      );
    } catch (error) {
      results.push({ file, error: String(error) });
      console.error(`${file}: ${error}`);
    }
    await writeFile(
      path.join(output, 'results.json'),
      `${JSON.stringify({ exporter: process.env.KILN_GLTF_EXPORTER ?? 'default', results }, null, 2)}\n`,
    );
  }
  if (results.some((result) => result.error || !result.deterministic || result.changes.length))
    process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
