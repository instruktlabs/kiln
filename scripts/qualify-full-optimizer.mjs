/** Offline full-mode corpus gate. Run with Bun; never modifies source assets. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { unpartition } from '@gltf-transform/functions';
import { createGltfIO, MSFT_LOD } from '../src/gltf-io.ts';
import { findRigidBoundaries } from '../src/rigid-merge.ts';
import { optimizeGlbBytes, renderGLBInProcess } from '../src/render.ts';
import { runtimeBuildIdentity } from './build-runtime.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const rounded = (values) => Array.from(values, (value) => Math.round(value * 1e10) / 1e10);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The released terrain uses gltfpack/meshopt, while the core optimizer has no
 * injected decoder. Exercise a decoded in-memory derivative and identify it in
 * the receipt; this does not imply direct compressed-input support in the engine.
 */
export async function prepareCorpusInput(bytes) {
  const io = createGltfIO();
  const json = (await io.binaryToJSON(bytes)).json;
  const compressed = ['EXT_meshopt_compression', 'KHR_meshopt_compression'];
  if (!json.extensionsUsed?.some((name) => compressed.includes(name))) return bytes;
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.readBinary(bytes);
  for (const extension of document.getRoot().listExtensionsUsed())
    if (compressed.includes(extension.extensionName)) extension.dispose();
  await document.transform(unpartition());
  return io.writeBinary(document);
}

function pathsOf(doc) {
  const paths = new Map();
  const visit = (node, path) => {
    if (paths.has(node)) return;
    paths.set(node, path);
    node.listChildren().forEach((child, index) => {
      visit(child, `${path}/${index}:${child.getName()}`);
    });
  };
  doc
    .getRoot()
    .listScenes()
    .forEach((scene, si) => {
      scene.listChildren().forEach((node, ni) => {
        visit(node, `scene:${si}/${ni}:${node.getName()}`);
      });
    });
  // Lower LOD levels are deliberately off-scene, but must still be checked.
  for (const node of doc.getRoot().listNodes()) {
    if (paths.has(node) || node.getParentNode()) continue;
    visit(node, `off:${paths.size}:${node.getName()}`);
  }
  return paths;
}

function materialEvidence(material) {
  if (!material) return null;
  const slots = ['BaseColor', 'MetallicRoughness', 'Normal', 'Occlusion', 'Emissive'];
  return {
    name: material.getName(),
    extras: material.getExtras(),
    baseColor: material.getBaseColorFactor(),
    metallic: material.getMetallicFactor(),
    roughness: material.getRoughnessFactor(),
    emissive: material.getEmissiveFactor(),
    normalScale: material.getNormalScale(),
    occlusionStrength: material.getOcclusionStrength(),
    alphaMode: material.getAlphaMode(),
    alphaCutoff: material.getAlphaCutoff(),
    doubleSided: material.getDoubleSided(),
    extensions: material
      .listExtensions()
      .map((extension) => extension.extensionName)
      .sort(),
    textures: slots.map((slot) => {
      const texture = material[`get${slot}Texture`]();
      const info = material[`get${slot}TextureInfo`]();
      if (!texture) return null;
      const transform = info.getExtension('KHR_texture_transform');
      return {
        bytes: hash(texture.getImage() ?? new Uint8Array()),
        mime: texture.getMimeType(),
        texCoord: info.getTexCoord(),
        mag: info.getMagFilter(),
        min: info.getMinFilter(),
        s: info.getWrapS(),
        t: info.getWrapT(),
        transform: transform
          ? [
              transform.getOffset(),
              transform.getScale(),
              transform.getRotation(),
              transform.getTexCoord(),
            ]
          : null,
      };
    }),
  };
}

/** Aggregate world-space evidence, independent of merged topology and vertex indexing.
 * Includes off-scene LODs, named hierarchy, animation channels and material bindings.
 * This is a structural regression gate, not a pixel or destination-appearance test.
 */
export function optimizerEvidence(doc) {
  const root = doc.getRoot();
  const paths = pathsOf(doc);
  const boundaries = findRigidBoundaries(doc, new Set());
  const geometry = {};
  const materials = new Set();
  for (const node of root.listNodes()) {
    let anchor = node;
    while (!boundaries.has(anchor) && anchor.getParentNode()) anchor = anchor.getParentNode();
    const group = `${paths.get(anchor)}:${boundaries.has(node) ? 'own' : 'descendants'}`;
    const world = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const linear = new THREE.Matrix3().setFromMatrix4(world);
    const facing = Math.sign(world.determinant());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute('POSITION');
      if (!position) throw new Error(`No POSITION: ${paths.get(node)}`);
      const material = JSON.stringify(materialEvidence(primitive.getMaterial()));
      materials.add(material);
      const semantics = primitive.listSemantics().sort();
      const key = `${group}|${hash(material)}|${primitive.getMode()}|${semantics.join(',')}`;
      geometry[key] ??= {
        elements: 0,
        low: [Infinity, Infinity, Infinity],
        high: [-Infinity, -Infinity, -Infinity],
        moments: [],
        absolute: [],
        face: [0, 0, 0, 0, 0, 0],
        faceAbsolute: [0, 0, 0, 0, 0, 0],
      };
      const record = geometry[key];
      const indices = primitive.getIndices();
      const count = indices?.getCount() ?? position.getCount();
      const at = (i) => indices?.getScalar(i) ?? i;
      const point = (i) =>
        new THREE.Vector3().fromArray(position.getElement(i, [])).applyMatrix4(world);
      for (let i = 0; i < count; i++) {
        const index = at(i);
        const p = point(index);
        [p.x, p.y, p.z].forEach((value, axis) => {
          record.low[axis] = Math.min(record.low[axis], value);
          record.high[axis] = Math.max(record.high[axis], value);
        });
        const values = [];
        for (const semantic of semantics) {
          const value = primitive.getAttribute(semantic).getElement(index, []);
          if (semantic === 'POSITION') p.toArray(value);
          if (semantic === 'NORMAL')
            new THREE.Vector3()
              .fromArray(value)
              .applyMatrix3(normalMatrix)
              .normalize()
              .toArray(value);
          if (semantic === 'TANGENT')
            new THREE.Vector3().fromArray(value).applyMatrix3(linear).normalize().toArray(value);
          values.push(...value);
        }
        for (const [vi, value] of values.entries()) {
          if (!Number.isFinite(value)) throw new Error(`Non-finite attribute: ${paths.get(node)}`);
          // First, second and third moments catch same-bounds edits and attribute changes.
          for (let power = 1; power <= 3; power++) {
            const mi = vi * 3 + power - 1;
            const term = value ** power;
            record.moments[mi] = (record.moments[mi] ?? 0) + term;
            record.absolute[mi] = (record.absolute[mi] ?? 0) + Math.abs(term);
          }
        }
      }
      record.elements += count;
      if (primitive.getMode() === 4) {
        for (let i = 0; i + 2 < count; i += 3) {
          const [a, b, c] = [point(at(i)), point(at(i + 1)), point(at(i + 2))];
          const face = b.clone().sub(a).cross(c.clone().sub(a)).multiplyScalar(facing);
          const area = face.length() / 2;
          const center = a.clone().add(b).add(c).divideScalar(3);
          const normal = primitive.getAttribute('NORMAL');
          // Weight orientation by area: zero-area pole triangles can gain a tiny
          // signed cross product after Float32 baking without changing a surface.
          const agreement =
            normal && area > 0
              ? area *
                face
                  .clone()
                  .normalize()
                  .dot(
                    new THREE.Vector3()
                      .fromArray(normal.getElement(at(i), []))
                      .applyMatrix3(normalMatrix)
                      .normalize(),
                  )
              : 0;
          const values = [
            area,
            area * center.x,
            area * center.y,
            area * center.z,
            (facing * a.dot(b.clone().cross(c))) / 6,
            agreement,
          ];
          values.forEach((value, j) => {
            record.face[j] += value;
            record.faceAbsolute[j] += Math.abs(value);
          });
        }
      }
    }
  }
  return {
    nodes: [...paths]
      .map(([node, path]) => ({
        path,
        matrix: rounded(node.getMatrix()),
        extras: node.getExtras(),
        weights: node.getWeights(),
        extensions: node
          .listExtensions()
          .map((extension) => extension.extensionName)
          .sort(),
        lod:
          node
            .getExtension(MSFT_LOD)
            ?.listLevels()
            .map((level) => paths.get(level) ?? `material:${level.getName()}`) ?? [],
        visibility: node.getExtension('KHR_node_visibility')?.getVisible() ?? true,
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
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation.listChannels().map((channel) => ({
        target: paths.get(channel.getTargetNode()),
        path: channel.getTargetPath(),
        interpolation: channel.getSampler().getInterpolation(),
        input: rounded(channel.getSampler().getInput().getArray()),
        output: rounded(channel.getSampler().getOutput().getArray()),
      })),
    })),
    materials: [...materials].sort(),
    geometry,
  };
}

export function compareOptimizerEvidence(before, after) {
  const issues = [];
  for (const field of ['nodes', 'animations', 'materials'])
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) issues.push(field);
  const keys = Object.keys(before.geometry).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(after.geometry).sort()))
    issues.push('geometry.groups');
  for (const key of keys) {
    const a = before.geometry[key];
    const b = after.geometry[key];
    if (!b) continue;
    if (a.elements !== b.elements) issues.push(`geometry.elements:${key}`);
    for (const field of ['low', 'high', 'moments', 'face']) {
      const scale =
        field === 'moments'
          ? a.absolute
          : field === 'face'
            ? a.faceAbsolute
            : a.high.map((v, i) => Math.max(Math.abs(v), Math.abs(a.low[i]), v - a.low[i]));
      if (
        a[field].length !== b[field].length ||
        a[field].some(
          (v, i) =>
            !Number.isFinite(b[field][i]) ||
            Math.abs(v - b[field][i]) > 1e-5 * Math.max(1, scale[i]),
        )
      )
        issues.push(`geometry.${field}:${key}`);
    }
  }
  return issues;
}

async function filesUnder(directory, suffix) {
  const output = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(path, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) output.push(path);
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const troy = value('--troy', null);
  const output = resolve(value('--out', 'tmp/full-optimizer-corpus/results.json'));
  const inputs = [
    ...(await filesUnder(join(repo, 'examples'), '.kiln.js')),
    ...(await filesUnder(join(repo, 'scenes/.cache/site-inputs'), '.glb')),
    ...(troy ? await filesUnder(resolve(troy), 'asset.glb') : []),
  ].filter((file) => file.includes(value('--filter', '')));
  const limit = Number(value('--limit', '0'));
  if (limit > 0) inputs.splice(limit);
  if (!inputs.length) throw new Error('No corpus inputs found');
  const io = createGltfIO();
  const results = [];
  const identity = await runtimeBuildIdentity(repo);
  await mkdir(dirname(output), { recursive: true });
  for (const file of inputs) {
    const result = { file: relative(repo, file) };
    try {
      const source = await readFile(file);
      result.sourceSha256 = hash(source);
      const original = file.endsWith('.kiln.js')
        ? (await renderGLBInProcess(source.toString(), { optimize: 'off', instance: 'off' })).glb
        : source;
      const prepared = await prepareCorpusInput(original);
      result.inputPreparation = prepared === original ? 'none' : 'meshopt-decoded-derivative';
      result.preparedInputSha256 = hash(prepared);
      const baseline = await optimizeGlbBytes(prepared, { mode: 'palette', instance: 'off' });
      const full = await optimizeGlbBytes(prepared, { mode: 'full', instance: 'off' });
      const repeat = await optimizeGlbBytes(prepared, { mode: 'full', instance: 'off' });
      if (!baseline || !full || !repeat)
        throw new Error('An optimization pass returned no artifact');
      const changes = compareOptimizerEvidence(
        optimizerEvidence(await io.readBinary(baseline.bytes)),
        optimizerEvidence(await io.readBinary(full.bytes)),
      );
      Object.assign(result, {
        bytesBefore: original.length,
        bytesAfter: full.bytes.length,
        artifactSha256: hash(full.bytes),
        deterministic: hash(full.bytes) === hash(repeat.bytes),
        changes,
        validationErrors: full.gltfValidation.issues.numErrors,
        summary: full.summary,
        warnings: full.warnings,
      });
      if (changes.length || !result.deterministic || result.validationErrors)
        result.error = 'Corpus invariant failed';
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
    console.log(
      `${result.error ? 'FAIL' : 'PASS'} ${result.file}${result.error ? `: ${result.error}` : ''}`,
    );
    await writeFile(
      output,
      `${JSON.stringify({ schemaVersion: 1, identity, scope: 'Palette versus full: world geometry aggregates, hierarchy, animation, LOD, material bindings, deterministic bytes and Khronos errors. No saved asset mutation or GPU/appearance acceptance.', troyIncluded: Boolean(troy), expectedInputs: inputs.length, completed: results.length, failures: results.filter((row) => row.error).length, results }, null, 2)}\n`,
    );
  }
  const finalIdentity = await runtimeBuildIdentity(repo);
  const stable = finalIdentity.identity === identity.identity;
  const report = JSON.parse(await readFile(output, 'utf8'));
  Object.assign(report, {
    finalIdentity,
    sourceStable: stable,
    gateSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  if (!stable) {
    console.error(
      'Runtime source/dependencies changed during qualification; rerun on a stable tree.',
    );
    process.exitCode = 1;
  }
  if (results.some((result) => result.error)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
