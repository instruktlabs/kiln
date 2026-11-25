// Offline homepage film, rendered from the same GLBs and placements as the walkable town.
import {
  BoxGeometry, BufferAttribute, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGPURenderer,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCountry } from '../src/country.ts';
import { GROUND } from '../src/ground.ts';
import { shows } from '../src/kit-spec.ts';
import { townFrame } from '../src/layout.ts';
import { planOutskirts } from '../src/outskirts.ts';
import { planTown } from '../src/plan/town-plan.js';
import { createTownView, KIT_IDS, placementMatrix, readKit } from '../src/town.ts';
import { assemblySchedule, ease, leadBay, shots } from './workflow-sequence.mjs';

const WIDTH = 1280, HEIGHT = 720;
const START = [-5.85, 5.3, 6.4];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const progress = (t, from, to) => ease((t - from) / (to - from));

// Fill the runtime instance buffers once in entrance order. Options, colours
// and morph targets stay on their original instances as the matrices move.
function prepareAssembly(kits, plan, entries) {
  const view = createTownView(kits);
  view.apply({...plan, placements: entries.map(e => e.place)});
  const batches = [];
  for (const [id, kit] of kits) {
    const matching = entries.filter(e => e.place.kit === id);
    for (const part of kit.parts) {
      const mesh = view.root.getObjectByName(id + ':' + part.spec.name);
      const members = matching.filter(e => shows(part.spec, kit.declaration, e.place.values));
      if (members.length) batches.push({mesh, members});
    }
  }

  // The standalone shopfronts contain recessed glazing and open-backed
  // joinery. A dark interior behind each non-passage bay blocks sightlines
  // through those reveals to the bright studio, even before its neighbours arrive.
  const fronts = entries.filter(e => e.place.kit === 'ground-bay' && e.place.values.front !== 'passage');
  const interior = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({color: 0x352e28, roughness: 1}), fronts.length);
  interior.name = 'Shop and house interiors';
  interior.frustumCulled = false;
  const returns = fronts.map(({place}) => new Matrix4()
    .makeTranslation(-.235, place.values.shopHeight / 2, place.values.bayWidth / 2)
    .scale(new Vector3(.055, place.values.shopHeight - .012, place.values.bayWidth - .012)));
  view.root.add(interior);
  batches.push({mesh: interior, members: fronts, returns});
  const growth = new Vector3(), hidden = new Matrix4().makeScale(0,0,0), behind = new Matrix4();
  for (const entry of entries) {
    entry.rest = placementMatrix(entry.place, new Matrix4());
    entry.matrix = new Matrix4();
  }

  function stand(time) {
    for (const entry of entries) {
      if (time < entry.start) break;
      const t = time >= entry.end ? 1 : progress(time, entry.start, entry.end);
      const m = entry.matrix.copy(entry.rest);
      if (t === 1) continue;
      if (entry.place.kit === 'tree') {
        m.scale(growth.setScalar(t));
      } else {
        const wide = 1 - (1 - t) ** 3;
        m.scale(growth.set(wide, entry.place.kit === 'paving' ? wide : t, wide));
        m.elements[13] += (1 - t) * (entry.place.kit === 'roof' ? 2.4 : .55);
      }
    }
    for (const batch of batches) {
      let count = 0;
      for (const member of batch.members) {
        if (member.start > time) break;
        const m = batch.returns ? behind.multiplyMatrices(member.matrix, batch.returns[count]) : member.matrix;
        batch.mesh.setMatrixAt(count++, m);
      }
      // Three's instanced morph path requires two slots. Keep the pad invisible.
      if (count === 1 && batch.mesh.morphTexture) batch.mesh.setMatrixAt(1, hidden);
      batch.mesh.count = count === 1 && batch.mesh.morphTexture ? 2 : count;
      batch.mesh.visible = count > 0;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return {root: view.root, stand};
}

export async function prepareFilm() {
  const renderer = new WebGPURenderer({antialias: true, alpha: false, preserveDrawingBuffer: true});
  await renderer.init();
  renderer.setPixelRatio(1.5);
  renderer.setSize(WIDTH, HEIGHT);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const scene = new Scene(), studio = new Color(0xe7e2d8), sky = new Color(0xa9c8db);
  scene.background = studio.clone();
  const camera = new PerspectiveCamera(32, WIDTH / HEIGHT, .18, 1700);
  scene.add(new HemisphereLight(0xfff5de, 0xc4beb7, 1.65));
  const sun = new DirectionalLight(0xffedce, 2.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = .012;
  sun.shadow.bias = -.00010;
  scene.add(sun, sun.target);
  const stageColour = new Color(0xe4dfd3), earth = new Color(0x756f4c);
  const ground = new Mesh(new PlaneGeometry(3200, 3200), new MeshStandardMaterial({color: stageColour, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const loader = new GLTFLoader();
  const declarations = (await (await fetch('/kits.json')).json()).kits;
  const kits = new Map(await Promise.all(KIT_IDS.map(async id => [
    id, readKit(id, await loader.loadAsync('/models/' + id + '.glb'), declarations[id]),
  ])));
  for (const kit of kits.values()) for (const part of kit.parts) {
    for (const map of [part.material.map, part.material.normalMap, part.material.roughnessMap]) {
      if (map) map.anisotropy = 8;
    }
    if (part.shadows) part.material.shadowSide = DoubleSide;
    if (kit.id === 'tree') part.casts = part.shadows;
  }
  const plan = planTown('2026'), outskirts = planOutskirts(plan);
  const bay = plan.placements.find(p => p.id === leadBay);
  const variants = ['stucco', 'timber'].map(finish => plan.placements.find(
    p => p.kit === bay.kit && p.values.finish === finish));
  const building = plan.placements.filter(p => p.id.startsWith('aW1-'));
  const entries = assemblySchedule(plan, outskirts.trees);
  const assembly = prepareAssembly(kits, plan, entries), samples = createTownView(kits);
  scene.add(assembly.root, samples.root);

  const field = new Group(), layout = townFrame(plan);
  const paving = kits.get('paving').parts;
  const mapOf = name => paving.find(p => p.material.name === name)?.material.map ?? null;
  const country = createCountry(field, {sett: mapOf('sett'), stone: mapOf('kerb')});
  // Use the released meadow and roads. The animated trees cast their own shadows.
  country.fit(layout, {...outskirts, litter: [], trees: []});
  country.light([.45,.8,.39], 0);
  // The play scene leaves the built footprint open under its paving. Continue
  // its meadow beneath the unfinished lots, low enough to clear every gutter.
  // Overlap the higher meadow at the perimeter, including from low shop-level angles.
  const turf = new PlaneGeometry(2 * layout.halfX + 80, 2 * layout.halfZ + 80);
  turf.rotateX(-Math.PI / 2);
  const verts = turf.getAttribute('position'), uv = turf.getAttribute('uv');
  const grass = [];
  for (let i = 0; i < verts.count; i++) {
    uv.setXY(i, verts.getX(i) / GROUND.tile, verts.getZ(i) / GROUND.tile);
    grass.push(...GROUND.grass);
  }
  turf.setAttribute('color', new BufferAttribute(new Float32Array(grass), 3));
  const meadow = new Mesh(turf, field.getObjectByName('Meadow').material);
  meadow.position.y = -.3;
  meadow.receiveShadow = true;
  field.add(meadow);
  field.position.set(-layout.offset[0], 0, -layout.offset[2]);
  scene.add(field);

  const overlay = document.createElement('canvas');
  overlay.width = WIDTH * 1.5; overlay.height = HEIGHT * 1.5;
  const ink = overlay.getContext('2d');
  ink.scale(1.5, 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.imageSmoothingQuality = 'high';
  await Promise.all([document.fonts.load('500 38px Archivo'), document.fonts.load('400 25px Archivo')]);
  const labels = [
    ['One window bay', 'The brick and shutter settings used on this shop.'],
    ['Three finishes, one model', 'Stucco, brick and timber from the same town.'],
    ['Assemble the shop', 'Shopfront, upper floors, roof and hanging sign.'],
    ['Along the street', 'The neighboring shops go up one bay at a time.'],
    ['Build the town', 'New rows join the streets around the market square.'],
    ['Plant the outskirts', 'Autumn trees and hedgerows line the roads into town.'],
  ];
  const shopEye = [24, 11.0, 7.4], shopAt = [-6.9,6.3,7.4];
  const rowEye = [27,17,-4], rowAt = [-8.5,5.5,19.5];
  const townEye = [93,76,-55], townAt = [28,2.5,28.5];
  const aim = new Vector3();
  function frame(time, caption = true) {
    const stage = shots.findLastIndex(s => time >= s.start);
    const assemble = progress(time, 5.2, 8.7), street = progress(time, 10, 15.8);
    const town = progress(time, 15.2, 21.8), plant = progress(time, 22.5, 25.0);
    const samplesOn = time < 5.83;
    samples.root.visible = samplesOn;
    assembly.root.visible = !samplesOn;
    field.visible = time >= 5.2;
    if (samplesOn) {
      const spread = progress(time, 2.2, 3) * (1 - progress(time, 5.2, 5.83));
      const placements = [bay];
      if (spread > 0) variants.forEach((p, i) => placements.push({...p, pos: [
        bay.pos[0] - .18 * (1 - spread), bay.pos[1], bay.pos[2] + spread * (i ? -2.65 : 2.65),
      ]}));
      samples.apply({...plan, placements});
    } else assembly.stand(time);

    let eye = mix([.8,6.25,8.8], [1,6.2,8], progress(time, 0, 2.2));
    eye = mix(eye, [3.6,6.5,7.95], progress(time,2.2,3));
    eye = mix(mix(mix(eye, shopEye, assemble), rowEye, street), townEye, town);
    eye = mix(eye, [98,81,-63], plant);
    const target = mix(mix(mix(START, shopAt, assemble), rowAt, street), townAt, town);
    camera.fov = 32 + 8 * street + 2 * town;
    camera.updateProjectionMatrix();
    camera.position.set(...eye); camera.lookAt(aim.set(...target));
    const unveil = progress(time,5.2,7.2);
    ground.position.y = 3.79 * (1 - unveil) - .42 * unveil;
    ground.material.color.copy(stageColour).lerp(earth, unveil);
    scene.background.copy(studio).lerp(sky, unveil);

    const lightFocus = mix([-6,0,9], [28,0,29], town);
    sun.target.position.set(...lightFocus);
    sun.position.copy(sun.target.position).add(aim.set(48,78,45));
    const reach = 20 + 12 * street + 85 * town;
    Object.assign(sun.shadow.camera, {left: -reach, right: reach, top: reach, bottom: -reach, near: .5, far: 280});
    sun.shadow.camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, 0, 0, WIDTH, HEIGHT);
    if (caption) {
      ink.clearRect(0, 0, WIDTH, HEIGHT);
      const shade = ink.createLinearGradient(0, 556, 0, HEIGHT);
      shade.addColorStop(0, 'rgba(15,20,24,0)');
      shade.addColorStop(1, 'rgba(15,20,24,.88)');
      ink.fillStyle = shade;
      ink.fillRect(0, 556, WIDTH, HEIGHT - 556);
      ink.fillStyle = 'white'; ink.font = '500 38px Archivo'; ink.fillText(labels[stage][0], 42, 653);
      ink.fillStyle = '#f6f4ee'; ink.font = '400 25px Archivo'; ink.fillText(labels[stage][1], 43, 687);
      ctx.drawImage(overlay, 0, 0, WIDTH, HEIGHT);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }
  return {
    frame, backend, placement: bay.id, instances: plan.placements.filter(p => p.kit === bay.kit).length,
    variants: variants.map(p => p.id), buildingPlacements: building.map(p => p.id),
    buildings: plan.town.buildings, placements: plan.placements.length, plantedTrees: outskirts.trees.length,
  };
}
