import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { inspectGlb } from './generate-commons.mjs';
import { ASSET_BASE } from './mirror-core.mjs';

/**
 * Stage the saved revisions behind /text-to-3d/. The record this writes holds what that page shows and nothing else, so what
 * the page says about the models and can't show is checked here instead, against the saved GLBs and programs. Nothing here
 * renders, edits or invents an output.
 *
 *   node scripts/stage-text-to-3d.mjs <directory>
 *
 * <directory>/tools.json names the tools. <directory>/<subject>/ is a workspace holding `assets/`, `run/` with the prompts and
 * `steps.json`, which lists each step's prompt and saved revision, and `renders/manifest.json` from
 * scripts/render-text-to-3d.mjs.
 *
 * Images and programs are committed under public/text-to-3d/. The two GLBs go to the asset host, the way Golden Gate's do:
 * each is named by its own hash, pinned in the mirror manifest and copied to .localdata/asset-delivery with an upload list
 * for scripts/publish-assets.mjs. A new revision of a model gets a new path, and staging again is all it takes.
 */
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECTS = ['mech', 'cathedral'];
const WIDTHS = [480, 768, 1024, 1440];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') || !text ? 1 : 0);

/** A GLB's JSON chunk, and a reader for the float accessors its animation samplers point at. */
export function openGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw Error('Not a GLB');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(20 + jsonLength + 8);
  const floats = (index) => {
    const accessor = gltf.accessors[index];
    if (accessor.componentType !== 5126) throw Error(`Accessor ${index} is not float data`);
    const start = (gltf.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const length = accessor.count * { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
    return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + length * 4));
  };
  return { gltf, floats };
}

/**
 * Two saved GLBs as one scene, for a picture of both at their true sizes. Every mesh, material and texture stays as saved:
 * the only new thing is one node that places the second model. Its clips are dropped, because the picture is a still.
 */
export function mergeGlbs(first, second, { name, translation = [0, 0, 0], rotation = [0, 0, 0, 1] }) {
  const a = openGlb(first).gltf;
  const b = openGlb(second).gltf;
  const binary = (bytes) => bytes.subarray(20 + bytes.readUInt32LE(12) + 8);
  const start = Math.ceil(binary(first).length / 4) * 4;
  const count = (key) => a[key]?.length ?? 0;
  const list = (key, shift) => [...(a[key] ?? []), ...(b[key] ?? []).map(shift)];
  const shifted = (value, by) => (value === undefined ? {} : { [by[0]]: value + by[1] });
  const offsetTextures = (value) => {
    for (const [key, inner] of Object.entries(value)) {
      if (!inner || typeof inner !== 'object') continue;
      if (key.endsWith('Texture')) inner.index += count('textures');
      offsetTextures(inner);
    }
    return value;
  };
  const scene = a.scenes[a.scene ?? 0].nodes;
  const nodes = list('nodes', (node) => ({ ...node, ...shifted(node.mesh, ['mesh', count('meshes')]), ...(node.children ? { children: node.children.map((child) => child + count('nodes')) } : {}) }));
  nodes.push({ name, translation, rotation, children: b.scenes[b.scene ?? 0].nodes.map((index) => index + count('nodes')) });
  const gltf = {
    ...a,
    accessors: list('accessors', (accessor) => ({ ...accessor, bufferView: accessor.bufferView + count('bufferViews') })),
    bufferViews: list('bufferViews', (view) => ({ ...view, byteOffset: (view.byteOffset ?? 0) + start })),
    samplers: list('samplers', (sampler) => sampler),
    images: list('images', (image) => ({ ...image, ...shifted(image.bufferView, ['bufferView', count('bufferViews')]) })),
    textures: list('textures', (texture) => ({ ...texture, ...shifted(texture.source, ['source', count('images')]), ...shifted(texture.sampler, ['sampler', count('samplers')]) })),
    materials: list('materials', (material) => offsetTextures(structuredClone(material))),
    meshes: list('meshes', (mesh) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive) => ({
        ...primitive,
        attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([key, accessor]) => [key, accessor + count('accessors')])),
        ...shifted(primitive.indices, ['indices', count('accessors')]),
        ...shifted(primitive.material, ['material', count('materials')]),
      })),
    })),
    nodes,
    scenes: [{ nodes: [...scene, nodes.length - 1] }],
    scene: 0,
    buffers: [{ byteLength: start + binary(second).length }],
    extensionsUsed: [...new Set([...(a.extensionsUsed ?? []), ...(b.extensionsUsed ?? [])])],
  };
  const chunk = (bytes, type, fill) => {
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4, fill);
    bytes.copy(padded);
    const head = Buffer.alloc(8);
    head.writeUInt32LE(padded.length, 0);
    head.write(type, 4);
    return Buffer.concat([head, padded]);
  };
  const bin = Buffer.alloc(start + binary(second).length);
  binary(first).copy(bin);
  binary(second).copy(bin, start);
  const chunks = [chunk(Buffer.from(JSON.stringify(gltf)), 'JSON', 0x20), chunk(bin, 'BIN\0', 0)];
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + chunks[0].length + chunks[1].length, 8);
  return Buffer.concat([header, ...chunks]);
}

/** Each clip in a GLB by name, with a digest of its targets and keyframes. */
export function clipDigests(bytes) {
  const { gltf, floats } = openGlb(bytes);
  const digest = (clip) => {
    const sum = createHash('sha256');
    for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler];
      sum.update(`${gltf.nodes[channel.target.node].name}/${channel.target.path}/${sampler.interpolation}`);
      sum.update(new Uint8Array(floats(sampler.input).buffer));
      sum.update(new Uint8Array(floats(sampler.output).buffer));
    }
    return sum.digest('hex');
  };
  return new Map((gltf.animations ?? []).map((clip) => [clip.name, digest(clip)]));
}

/** Every mesh node in a GLB by name, with where it sits in the world and a digest of its vertex positions alone: baked colours may share the buffer. */
function placedMeshes(bytes) {
  const { gltf } = openGlb(bytes);
  const bin = bytes.subarray(20 + bytes.readUInt32LE(12) + 8);
  const meshes = new Map();
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const sum = createHash('sha256');
      const bounds = new Box3();
      const materials = [];
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const position = gltf.accessors[primitive.attributes.POSITION];
        const view = gltf.bufferViews[position.bufferView];
        const stride = view.byteStride ?? 12;
        const start = (view.byteOffset ?? 0) + (position.byteOffset ?? 0);
        for (let vertex = 0; vertex < position.count; vertex++) sum.update(bin.subarray(start + vertex * stride, start + vertex * stride + 12));
        for (let corner = 0; corner < 8; corner++) bounds.expandByPoint(new Vector3(...[0, 1, 2].map((axis) => ((corner >> axis) & 1 ? position.max[axis] : position.min[axis]))).applyMatrix4(world));
        materials.push(gltf.materials?.[primitive.material]?.name);
      }
      const seen = [...meshes.keys()].filter((key) => key === node.name || key.startsWith(`${node.name}#`)).length;
      meshes.set(seen ? `${node.name}#${seen + 1}` : node.name, { name: node.name, at: world.elements.slice(12, 15), digest: sum.digest('hex'), bounds, materials });
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, new Matrix4());
  return meshes;
}

/**
 * What a revision did to its parent, from the two saved GLBs alone. Kiln's own comparison refuses a model past 2,000,000
 * placed vertices.
 */
export function comparePlacement(before, after) {
  const a = placedMeshes(before);
  const b = placedMeshes(after);
  const round = (value) => Number(value.toFixed(3)) + 0;
  let unmoved = 0, moved = 0, reshaped = 0;
  const offsets = new Map();
  for (const [key, mesh] of a) {
    const other = b.get(key);
    if (!other) continue;
    if (mesh.digest !== other.digest) { reshaped += 1; continue; }
    const by = other.at.map((value, axis) => round(value - mesh.at[axis]));
    if (by.every((value) => value === 0)) { unmoved += 1; continue; }
    moved += 1;
    offsets.set(by.join(), (offsets.get(by.join()) ?? 0) + 1);
  }
  const [offset, count] = [...offsets].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
  // Names can't say what stayed on their own: a revision that renumbers the statues renames stone that never moved.
  const centre = ({ bounds }) => bounds.getCenter(new Vector3());
  const byShape = new Map();
  for (const mesh of b.values()) byShape.set(mesh.digest, [...(byShape.get(mesh.digest) ?? []), centre(mesh)]);
  const shift = new Vector3(...(offset ? offset.split(',').map(Number) : [0, 0, 0]));
  const standsAt = (point, places) => places.some((place) => [0, 1, 2].every((axis) => Math.abs(place.getComponent(axis) - point.getComponent(axis)) < 0.05));
  const geometry = { parent: a.size, inPlace: 0, moved: 0, other: [] };
  for (const mesh of a.values()) {
    const places = byShape.get(mesh.digest) ?? [];
    if (standsAt(centre(mesh), places)) geometry.inPlace += 1;
    else if (standsAt(centre(mesh).add(shift), places)) geometry.moved += 1;
    else geometry.other.push(mesh.name);
  }
  const extent = (meshes) => {
    const box = new Box3();
    for (const { name, bounds } of meshes.values()) if (!/ground/i.test(name)) box.union(bounds);
    return { min: box.min.toArray().map(round), max: box.max.toArray().map(round) };
  };
  const materials = (meshes) => [...new Set([...meshes.values()].flatMap((mesh) => mesh.materials))].sort().join();
  return {
    unmoved,
    moved,
    movedTogether: offset ? { by: offset.split(',').map(Number), count } : null,
    geometry,
    reshaped,
    gone: [...a.keys()].filter((key) => !b.has(key)).length,
    added: [...b.keys()].filter((key) => !a.has(key)).length,
    extent: { before: extent(a), after: extent(b) },
    materialsSame: materials(a) === materials(b),
  };
}

async function unifiedDiff(from, to, labelFrom, labelTo) {
  const directory = join(site, '.cache/text-to-3d');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'a.js'), from);
  await writeFile(join(directory, 'b.js'), to);
  const result = spawnSync('diff', ['-u', '--label', labelFrom, '--label', labelTo, join(directory, 'a.js'), join(directory, 'b.js')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 1) throw Error(result.stderr || 'Expected the revision sources to differ');
  return result.stdout;
}

/**
 * What the page says about a model and can't show, against its saved revisions. It fails rather than writes a record the page
 * would then be wrong about.
 */
function checkClaims(subject, { plan, glbs, sources, placementOf, renders }) {
  const claim = (holds, what) => { if (!holds) throw Error(`${subject}: ${what}`); };
  const at = (id) => plan.steps.findIndex((step) => step.id === id);
  const nodes = (glb) => openGlb(glb).gltf.nodes.map(({ name }) => name);
  for (const { name, revisionId } of renders) if (['hero', 'final', 'nave'].includes(name)) claim(revisionId === plan.steps.at(-1).revision, `the ${name} picture isn't of the final revision`);
  if (subject === 'mech') {
    const walk = glbs.map((glb) => clipDigests(glb).get('Walk'));
    claim(walk[0] && new Set(walk).size === 1, 'the Walk clip changed between revisions');
    const pivots = (glb) => nodes(glb).filter((name) => /hip|knee|ankle|toe|waist|shoulder|elbow/i.test(name));
    for (const joint of [/hip/i, /knee/i, /ankle/i, /toe/i, /waist/i, /shoulder/i, /elbow/i]) claim(pivots(glbs.at(-1)).some((name) => joint.test(name)), `the mech has no ${joint.source} joint`);
    const kept = new Set(pivots(glbs.at(-1)));
    for (const name of pivots(glbs.at(-2))) if (!/claw/i.test(name)) claim(kept.has(name), `the last revision lost ${name}`);
  }
  if (subject === 'cathedral') {
    const revise = at('revise');
    claim(/naveBays: 9\b/.test(sources[revise - 1]) && /naveBays: 11\b/.test(sources[revise]), 'the revision is not two more bays');
    const { movedTogether, extent, materialsSame } = placementOf('revise');
    claim(movedTogether.by.join() === '-13.2,0,0', 'the moved meshes did not move east together'); // The program's +X is west.
    claim(materialsSame, 'the revision changed the materials');
    claim(Math.abs(extent.after.max[1] - 100) < 0.5, 'the spire is not 100 m');
    for (const id of ['light', 'sun', 'daylight']) {
      const { geometry } = placementOf(id);
      claim(geometry.moved === 0 && geometry.other.every((name) => /StainedLight/.test(name)), `the ${id} revision changed more than the light`);
    }
    const { min, max } = placementOf('daylight').extent.after;
    claim(Math.round(max[0] - min[0]) === 144, 'the building is not 144 m long');
    claim(/sun: \[0\.11, 0\.79, -0\.61\]/.test(sources.at(-1)), 'the final program bakes another sun');
    claim(!nodes(glbs[at('direct')]).includes('Ground') && nodes(glbs[at('direct-2')]).includes('Ground') && nodes(glbs.at(-1)).includes('Ground'), 'the ground is not its own part');
  }
}

/** Read one subject's plan and return its record plus the files to publish under its name. */
async function stageSubject(run, subject) {
  const directory = join(run, subject);
  const assets = join(directory, 'assets/kiln');
  const [assetId] = await readdir(assets);
  const plan = await json(join(directory, 'run/steps.json'));
  const steps = [], sources = [], glbs = [];
  const placements = new Map();
  const placementOf = (id) => {
    if (!placements.has(id)) {
      const index = plan.steps.findIndex((step) => step.id === id);
      placements.set(id, comparePlacement(glbs[index - 1], glbs[index]));
    }
    return placements.get(id);
  };
  for (const step of plan.steps) {
    const revision = join(assets, assetId, 'revisions', step.revision);
    const manifest = await json(join(revision, 'manifest.json'));
    const glb = await readFile(join(revision, 'asset.glb'));
    const source = await readFile(join(revision, 'source.kiln.js'));
    if (`sha256:${hash(glb)}` !== manifest.files['asset.glb'].sha256 || `sha256:${hash(source)}` !== manifest.files['source.kiln.js'].sha256) throw Error(`${subject}/${step.id}: saved files differ from their manifest`);
    const parent = plan.steps[steps.length - 1];
    if (parent && manifest.parentRevision !== parent.revision) throw Error(`${subject}/${step.id}: its parent is ${manifest.parentRevision}, not the previous step's ${parent.revision}`);
    sources.push(source.toString('utf8'));
    glbs.push(glb);
    steps.push({
      id: step.id,
      prompt: (await readFile(join(directory, 'run', step.prompt), 'utf8')).trim(),
      sourceFile: `${subject}-${steps.length + 1}.kiln.js`,
      sourceLines: lineCount(sources.at(-1)),
    });
    if (step.geometry) {
      const { parent: count, inPlace, moved } = placementOf(step.id).geometry;
      steps.at(-1).geometry = { parent: count, inPlace, moved };
    }
  }
  const files = steps.map(({ sourceFile }, index) => ({ name: sourceFile, bytes: Buffer.from(sources[index]) }));
  const { images: renders } = await json(join(directory, 'renders/manifest.json'));
  checkClaims(subject, { plan, glbs, sources, placementOf, renders });
  const images = {};
  for (const render of renders) {
    const png = await readFile(join(directory, 'renders', render.file));
    const meta = await sharp(png).metadata();
    const name = `${subject}-${render.name}`;
    const variants = { webp: [], avif: [] };
    for (const width of WIDTHS.filter((value) => value < meta.width).concat(meta.width <= 1440 ? [meta.width] : [1440])) {
      const resized = sharp(png).resize({ width });
      files.push({ name: `${name}-${width}.webp`, bytes: await resized.clone().webp({ quality: 86 }).toBuffer() });
      files.push({ name: `${name}-${width}.avif`, bytes: await resized.clone().avif({ quality: 58 }).toBuffer() });
      variants.webp.push([`${name}-${width}.webp`, width]);
      variants.avif.push([`${name}-${width}.avif`, width]);
    }
    files.push({ name: `${name}.webp`, bytes: await sharp(png).resize({ width: Math.min(meta.width, 1440) }).webp({ quality: 88 }).toBuffer() });
    images[render.name] = { name, width: meta.width, height: meta.height, alt: render.alt, ...(render.caption ? { caption: render.caption } : {}), variants };
  }
  const diffAt = plan.steps.findIndex((step) => step.id === plan.diffStep);
  const { triangles } = inspectGlb(glbs.at(-1));
  return {
    record: {
      id: subject,
      name: plan.name,
      glbBytes: glbs.at(-1).length,
      triangles,
      steps,
      ...(plan.diffStep ? { diff: await unifiedDiff(sources[diffAt - 1], sources[diffAt], steps[diffAt - 1].sourceFile, steps[diffAt].sourceFile) } : {}),
      images,
    },
    files,
    model: glbs.at(-1),
    hero: renders.find(({ name }) => name === 'hero'),
    finalRevision: plan.steps.at(-1).revision,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] && resolve(process.argv[2]);
  if (!run) throw Error('Usage: node scripts/stage-text-to-3d.mjs <directory>');
  const staged = await Promise.all(SUBJECTS.map((subject) => stageSubject(run, subject)));
  const { hero } = staged.find(({ record }) => record.id === 'cathedral');
  if (hero.with?.revisionId !== staged.find(({ record }) => record.id === 'mech').finalRevision) throw Error('The hero does not place the final mech');
  const files = staged.flatMap((subject) => subject.files);
  const digest = hash(Buffer.concat(files.flatMap(({ name, bytes }) => [Buffer.from(name), bytes]))).slice(0, 16);
  const base = `/text-to-3d/${digest}/`;
  const publicRoot = join(site, 'public/text-to-3d');
  if (existsSync(publicRoot)) await rm(publicRoot, { recursive: true });
  await mkdir(join(site, 'public', base), { recursive: true });
  for (const { name, bytes } of files) await writeFile(join(site, 'public', base, name), bytes);
  const models = new Map(staged.map(({ record, model }) => [record.id, { path: `text-to-3d/${hash(model).slice(0, 16)}/${record.id}.glb`, bytes: model.length, sha256: hash(model), model }]));
  const delivery = join(site, '.localdata/asset-delivery');
  for (const { path, model } of models.values()) {
    await mkdir(dirname(join(delivery, path)), { recursive: true });
    await writeFile(join(delivery, path), model);
  }
  const modelPins = [...models.values()].map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  await writeFile(join(delivery, 'text-to-3d-upload.json'), `${JSON.stringify(modelPins, null, 2)}\n`);
  const writeData = (file, value) => writeFile(join(site, 'src/data', file), `${JSON.stringify(value, null, 2)}\n`);
  const isOurs = (path) => path.startsWith('text-to-3d/');
  const pins = await json(join(site, 'src/data/mirror-manifest.json'));
  await writeData('mirror-manifest.json', { ...pins, files: [...pins.files.filter(({ path }) => !isOurs(path)), ...modelPins] });
  const plan = await json(join(site, 'src/data/commons-build.json'));
  await writeData('commons-build.json', { ...plan, viewerModels: [...plan.viewerModels.filter((path) => !isOurs(path)), ...modelPins.map(({ path }) => path)] });
  const srcset = (list) => list.map(([name, width]) => `${base}${name} ${width}w`).join(', ');
  const subjects = staged.map(({ record }) => ({
    ...record,
    glbHref: `${ASSET_BASE}${models.get(record.id).path}`,
    steps: record.steps.map(({ sourceFile, ...step }) => ({ ...step, sourceHref: `${base}${sourceFile}` })),
    images: Object.fromEntries(Object.entries(record.images).map(([key, { name, variants, ...image }]) => [key, {
      ...image,
      src: `${base}${name}.webp`,
      srcsetWebp: srcset(variants.webp),
      srcsetAvif: srcset(variants.avif),
    }])),
  }));
  const lock = await json(join(run, 'kiln-install/package-lock.json'));
  const record = { tools: { kiln: lock.packages['node_modules/@instruktlabs/kiln'].version, ...(await json(join(run, 'tools.json'))) }, subjects };
  await writeFile(join(site, 'src/data/text-to-3d.json'), `${JSON.stringify(record, null, 2)}\n`);
  // Every page's layout reads the share card, so its picture gets a record far smaller than the page's.
  const card = subjects.find(({ id }) => id === 'cathedral').images.hero;
  await writeFile(join(site, 'src/data/text-to-3d-card.json'), `${JSON.stringify({ src: card.src, alt: card.alt }, null, 2)}\n`);
  console.log(`Staged ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes.length, 0)} bytes, at ${base}`);
}
