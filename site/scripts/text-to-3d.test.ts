import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LOOK_INSIDE, sourceExcerpt, wordCount } from '../src/lib/text-to-3d';
import * as THREE from 'three';
import { socialCards } from '../src/lib/social-cards.mjs';
import { openGlb } from './stage-text-to-3d.mjs';

const site = resolve(import.meta.dir, '..');
const record = JSON.parse(await readFile(resolve(site, 'src/data/text-to-3d.json'), 'utf8'));
const page = await readFile(resolve(site, 'src/pages/text-to-3d.astro'), 'utf8');
const component = await readFile(resolve(site, 'src/components/TextTo3dRun.astro'), 'utf8');
const served = (href: string) => readFile(resolve(site, `public${href}`));
const subject = (id: string) => record.subjects.find((candidate: { id: string }) => candidate.id === id);
const stepOf = (id: string, step: string) => subject(id).steps.find((candidate: { id: string }) => candidate.id === step);
const pins = JSON.parse(await readFile(resolve(site, 'src/data/mirror-manifest.json'), 'utf8'));
const plan = JSON.parse(await readFile(resolve(site, 'src/data/commons-build.json'), 'utf8'));
const modelPath = ({ glbHref }: { glbHref: string }) => new URL(glbHref).pathname.slice(1);
/** The GLBs are on the asset host. A packs build keeps them in its verified mirror, and staging keeps its own copy; CI has neither. */
const localModel = (candidate: { glbHref: string }) => ['.cache/commons/mirror', '.localdata/asset-delivery'].map((directory) => resolve(site, directory, modelPath(candidate))).find((file) => existsSync(file));
const stagedFiles = () => readdirSync(resolve(site, 'public/text-to-3d'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => resolve(entry.parentPath, entry.name));

test('the record holds what the page shows and nothing else', () => {
  expect(Object.keys(record).sort()).toEqual(['subjects', 'tools']);
  expect(Object.keys(record.tools).sort()).toEqual(['effort', 'harness', 'harnessVersion', 'kiln', 'model']);
  for (const { images, steps, ...rest } of record.subjects) {
    for (const key of Object.keys(rest)) expect(['id', 'name', 'glbHref', 'glbBytes', 'triangles', 'diff']).toContain(key);
    for (const step of steps) for (const key of Object.keys(step)) expect(['id', 'prompt', 'followUps', 'sourceHref', 'sourceLines', 'geometry']).toContain(key);
    for (const image of Object.values(images) as object[]) for (const key of Object.keys(image)) expect(['width', 'height', 'alt', 'caption', 'src', 'srcsetWebp', 'srcsetAvif']).toContain(key);
  }
});

test('the page says nothing about what the models took to make', () => {
  for (const text of [page, component]) {
    expect(text).not.toMatch(/\$\d|\b\d+(\.\d+)? ?(min|minutes?|hours?)\b/i);
    // A reader's "Can I" is fine; the page itself has no unnamed author.
    expect(text.replaceAll('Can I ', '')).not.toMatch(/\bI\b|\bmy\s/);
  }
});

test('every staged file is one the page uses, and everything it uses is there', () => {
  const used = new Set<string>();
  for (const { steps, images } of record.subjects) {
    for (const { sourceHref } of steps) used.add(sourceHref);
    for (const image of Object.values(images) as { src: string; srcsetWebp: string; srcsetAvif: string }[]) {
      used.add(image.src);
      for (const list of [image.srcsetWebp, image.srcsetAvif]) for (const candidate of list.split(', ')) used.add(candidate.split(' ')[0]!);
    }
  }
  const staged = stagedFiles();
  expect(staged.sort()).toEqual([...used].map((href) => resolve(site, `public${href}`)).sort());
});

test('the viewer and the download use the pinned GLB, on the asset host under a name from its own hash', async () => {
  for (const candidate of record.subjects) {
    const path = modelPath(candidate);
    const pin = pins.files.find((file: { path: string }) => file.path === path);
    expect(candidate.glbHref).toBe(`https://assets.kilnstudio.tools/${path}`);
    expect(path).toBe(`text-to-3d/${pin.sha256.slice(0, 16)}/${candidate.id}.glb`);
    expect(pin.bytes).toBe(candidate.glbBytes);
    expect(plan.viewerModels).toContain(path);
    expect(candidate.glbBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    const local = localModel(candidate);
    if (local) expect(createHash('sha256').update(await readFile(local)).digest('hex')).toBe(pin.sha256);
  }
});

test('only the page\'s two final models are pinned, and neither is in the repository', () => {
  const ours = pins.files.filter(({ path }: { path: string }) => path.startsWith('text-to-3d/')).map(({ path }: { path: string }) => path).sort();
  expect(ours).toEqual(record.subjects.map(modelPath).sort());
  expect(stagedFiles().some((file) => file.endsWith('.glb'))).toBe(false);
});

test('the shown diff is two more bays and a spire, between the two saved programs', async () => {
  const { diff, steps } = subject('cathedral');
  const at = steps.findIndex((step: { id: string }) => step.id === 'revise');
  const before = (await served(steps[at - 1].sourceHref)).toString('utf8');
  const after = (await served(steps[at].sourceHref)).toString('utf8');
  const lines: string[] = diff.split('\n');
  const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1));
  expect(added.length).toBeGreaterThan(0);
  for (const line of added) expect(after).toContain(line);
  for (const line of removed) expect(before).toContain(line);
  expect(diff).toContain('+  naveBays: 11');
});

test.skipIf(!localModel(subject('mech')))('the shipped mech has the named joints and the Walk clip the page offers', async () => {
  const { gltf } = openGlb(await readFile(localModel(subject('mech'))!));
  const names = gltf.nodes.map((node: { name: string }) => node.name).join(' ');
  for (const joint of [/hip/i, /knee/i, /ankle/i, /toe/i, /waist/i, /shoulder/i, /elbow/i]) expect(names).toMatch(joint);
  expect(gltf.animations.map((clip: { name: string }) => clip.name)).toContain('Walk');
});

test.skipIf(!localModel(subject('mech')))('played through a plain three.js mixer, the shipped mech keeps a planted foot where it was put', async () => {
  const { gltf, floats } = openGlb(await readFile(localModel(subject('mech'))!));
  const objects = gltf.nodes.map((node: { name: string; translation?: number[]; rotation?: number[] }) => {
    const object = new THREE.Object3D();
    object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    return object;
  });
  gltf.nodes.forEach((node: { children?: number[] }, index: number) => (node.children ?? []).forEach((child) => objects[index].add(objects[child])));
  const walk = gltf.animations.find((clip: { name: string }) => clip.name === 'Walk');
  const tracks = walk.channels.map((channel: { sampler: number; target: { node: number; path: string } }) => {
    const sampler = walk.samplers[channel.sampler];
    const rotation = channel.target.path === 'rotation';
    const Track = rotation ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new Track(`${gltf.nodes[channel.target.node].name}.${rotation ? 'quaternion' : 'position'}`, floats(sampler.input), floats(sampler.output));
  });
  const rootIndex = gltf.scenes[0].nodes[0];
  const root = objects[rootIndex];
  const clip = new THREE.AnimationClip('Walk', -1, tracks);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const speed = gltf.nodes[rootIndex].extras.rig.walkSpeedMps;
  const samples = 1200;
  for (const side of ['L', 'R']) {
    const toe = root.getObjectByName(`Joint_Toe_${side}`)!;
    const poses = Array.from({ length: samples }, (_, index) => {
      const time = (clip.duration * index) / samples;
      mixer.setTime(time);
      root.updateMatrixWorld(true);
      const { x, y, z } = toe.getWorldPosition(new THREE.Vector3());
      // The clip walks in place, so a foot on the ground is fixed once the body's own travel is added back.
      return { x: x + speed * time, y, z };
    });
    const ground = Math.min(...poses.map(({ y }) => y));
    let planted: typeof poses = [];
    let run: typeof poses = [];
    for (const pose of poses) {
      if (pose.y < ground + 0.0005) run.push(pose);
      else run = [];
      if (run.length > planted.length) planted = [...run];
    }
    const spread = (axis: 'x' | 'z') => Math.max(...planted.map((pose) => pose[axis])) - Math.min(...planted.map((pose) => pose[axis]));
    expect(planted.length / samples).toBeGreaterThan(0.45);
    expect(spread('x')).toBeLessThan(0.0005);
    expect(spread('z')).toBeLessThan(0.0005);
  }
});

test('the cathedral stays within its budget', () => {
  expect(subject('cathedral').glbBytes).toBeLessThanOrEqual(16_000_000);
});

test.skipIf(!localModel(subject('cathedral')))('the cathedral carries real textures and its ground is a part of its own', async () => {
  const { gltf } = openGlb(await readFile(localModel(subject('cathedral'))!));
  expect(gltf.images.length).toBeGreaterThan(0);
  expect(gltf.nodes.map((node: { name: string }) => node.name)).toContain('Ground');
});

test('a prompt\'s word count is what the card says', () => {
  expect(wordCount('one two\n\n three ')).toBe(3);
});

test('a source excerpt is a real slice of the program, and a missing one fails the build', () => {
  expect(sourceExcerpt('const a = 1;\nconst b = 2;\nconst c = 3;', 'const b', '= 2;')).toBe('const b = 2;');
  expect(() => sourceExcerpt('const a = 1;', 'const b', ';')).toThrow();
});

test('nothing published names a path on the machine that made it', async () => {
  const private_ = /\/home\/|\/tmp\//;
  expect(JSON.stringify(record)).not.toMatch(private_);
  for (const file of stagedFiles()) if (/\.(js|json)$/.test(file)) expect(await readFile(file, 'utf8')).not.toMatch(private_);
});

test('the numbers the revision cards give are the measured ones', () => {
  expect(stepOf('cathedral', 'revise').geometry).toEqual({ parent: 1621, inPlace: 971, moved: 639 });
  expect(stepOf('cathedral', 'light').geometry).toEqual({ parent: 1715, inPlace: 1705, moved: 0 });
  expect(page).toContain('kept their exact shape');
  expect(page).toContain('moved east together');
});

test('the final program bakes the sun the page describes', async () => {
  const final = (await served(subject('cathedral').steps.at(-1).sourceHref)).toString('utf8');
  expect(final).toContain('sun: [0.11, 0.79, -0.61]');
});

test('line counts are what wc -l says', async () => {
  for (const { steps } of record.subjects) for (const step of steps) expect(step.sourceLines).toBe((await served(step.sourceHref)).toString('utf8').trimEnd().split('\n').length);
});

test('the Look inside view starts inside the building, within the viewer\'s orbit limits', () => {
  // The final GLB's bounds with its ground, then the building alone, as staging measures them.
  const radius = Math.hypot(224, 100, 144) / 2;
  const building = { min: [-77.304, 0, -30.509], max: [66.578, 100, 30.509] };
  const distance = Math.hypot(...LOOK_INSIDE.position.map((value, axis) => value - LOOK_INSIDE.target[axis]!));
  expect(distance).toBeGreaterThan(radius * 0.3);
  expect(distance).toBeLessThan(radius * 14);
  for (const point of [LOOK_INSIDE.position, LOOK_INSIDE.target]) for (const axis of [0, 1, 2]) {
    expect(point[axis]).toBeGreaterThanOrEqual(building.min[axis]!);
    expect(point[axis]).toBeLessThanOrEqual(building.max[axis]!);
  }
});

test('the page takes its numbers and prompts from the record and has no leftover draft copy', () => {
  expect(page).not.toContain('RUN-COPY');
  expect(page).not.toContain('PREVIEW');
  expect(page).toContain("from \"../data/text-to-3d.json\"");
  for (const { steps } of record.subjects) for (const step of steps) expect(page).not.toContain(step.prompt);
});

test('the share card pictures the page hero, from a record small enough for every page to import', async () => {
  const { hero } = subject('cathedral').images;
  const small = JSON.parse(await readFile(resolve(site, 'src/data/text-to-3d-card.json'), 'utf8'));
  expect(small).toEqual({ src: hero.src, alt: hero.alt });
  const data = { packsEnabled: false, release: { version: '1.6.0' }, farm: {}, vehicles: {}, bridge: {}, hero: {}, foundryFloor: {} };
  const card = socialCards({ ...data, textTo3d: small }).find((candidate: { slug: string }) => candidate.slug === 'text-to-3d');
  expect(card?.poster?.src).toBe(hero.src);
  expect(page).toContain('cathedral.images.hero!');
  expect(socialCards(data).some((candidate: { slug: string }) => candidate.slug === 'text-to-3d')).toBe(false);
});

test('the guardrails hold: home keeps its title and description, and links to this page', async () => {
  const home = await readFile(resolve(site, 'src/pages/index.astro'), 'utf8');
  expect(home).toContain('title="Kiln | build and revise 3D assets with your coding agent"');
  expect(home).toContain('description="Your coding agent writes JavaScript. Kiln renders views, checks geometry and saves editable 3D assets as GLBs with their source. Runs locally; MIT licensed."');
  expect(home).toContain('href="/text-to-3d/"');
});
