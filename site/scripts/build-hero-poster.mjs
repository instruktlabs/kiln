// Optional local GPU step. Does not author or alter the source program.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import sharp from 'sharp';
import { heroCamera } from '../src/hero-camera';
import { makeRemoteRenderPort, probeCaptureIdentity } from '../../src/cli-render-mode';

const name = process.argv[2] ?? 'orbital-station';
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Expected a gallery name');
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const glb = await readFile(join(site, `public/assets/${name}.glb`));
const source = await readFile(join(site, `public/assets/${name}.kiln.js`));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const loaded = await new GLTFLoader().parseAsync(
  glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
  '',
);
const camera = heroCamera(loaded.scene);
const captureIdentity = await probeCaptureIdentity('http://127.0.0.1:8000');
if (!captureIdentity) throw new Error('Renderer did not provide an exact build identity');
const rendered = await makeRemoteRenderPort(
  'http://127.0.0.1:8000',
  process.env.RENDER_SERVICE_TOKEN,
)({ glb, cameras: [camera], width: 1024, height: 768, lightingPresetId: 'neutral-studio-v1' });
if (
  !rendered.ok ||
  !rendered.viewsPng?.length ||
  !rendered.derivativeFidelity?.materialFaithful ||
  !isDeepStrictEqual(rendered.cameras?.[0], camera)
)
  throw new Error(
    `GPU poster did not attest requested camera/fidelity: ${JSON.stringify({ requested: camera, returned: rendered.cameras, rendererId: rendered.rendererId, fidelity: rendered.derivativeFidelity })}`,
  );
if ((await probeCaptureIdentity('http://127.0.0.1:8000')) !== captureIdentity)
  throw new Error('Renderer changed during poster generation');
const png = rendered.viewsPng[0];
const receipt = {
  captureIdentity: JSON.parse(captureIdentity),
  sourceHash: hash(source),
  artifactHash: hash(glb),
  imageHash: hash(png),
  cameraRecipeHash: hash(await readFile(join(site, 'src/hero-camera.ts'))),
  width: 1024,
  height: 768,
  camera,
  rendererId: rendered.rendererId,
  materialFaithful: true,
  lightingPresetId: 'neutral-studio-v1',
  note: 'Exact GLB and camera; browser preview has its own local room lighting.',
};
await writeFile(join(site, `examples/${name}.poster.png`), png);
await writeFile(
  join(site, `examples/${name}.poster.json`),
  JSON.stringify(receipt, null, 2) + '\n',
);
await writeFile(
  join(site, `public/assets/${name}.hero-poster.json`),
  JSON.stringify(receipt, null, 2) + '\n',
);
const hero = await sharp(png)
  .webp({ quality: 90 })
  .toFile(join(site, `public/thumbs/${name}-hero.webp`));
const indexPath = join(site, 'public/assets/index.json');
const rows = JSON.parse(await readFile(indexPath, 'utf8'));
const row = rows.find((entry) => entry.name === name);
if (!row) throw new Error('Hero is not in the generated gallery index');
row.poster = `thumbs/${name}-hero.webp`;
row.posterWidth = hero.width;
row.posterHeight = hero.height;
row.heroPoster = receipt;
await writeFile(indexPath, JSON.stringify(rows, null, 2) + '\n');
const buildPath = join(site, 'public/assets/build.json');
const build = JSON.parse(await readFile(buildPath, 'utf8'));
build.indexHash = hash(await readFile(indexPath));
build.metadataNote = 'Poster records updated after GLB generation; source and artifact hashes unchanged.';
await writeFile(buildPath, JSON.stringify(build, null, 2) + '\n');
console.log(JSON.stringify(receipt));
