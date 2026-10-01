// Build GLBs, exact source copies and attribution records for the static site.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { posterBytes, posterFile } from './posters.mjs';
import { exampleProvenance, recordedExampleCredit, verifyRecordedPoster } from './provenance.mjs';
import { isPublicExample } from './collection.mjs';
import { buildExampleHistory } from './history.mjs';
import { runtimeBuildIdentity } from '../../scripts/build-runtime.mjs';
import { galleryRuntimeDownload } from './runtime-downloads.mjs';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

import { readAuthorship, readCategory } from '../../scripts/authorship';
import { resolveEvaluatorPortV2 } from '../../src/evaluator/protocol';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SITE, '..');
const EXAMPLES = join(REPO, 'examples');
const OUT = join(SITE, 'public', 'assets');
const THUMBS = join(SITE, 'public', 'thumbs');
const buildInputs = await runtimeBuildIdentity(REPO);


/** The one-line caption the README gives each asset, so both read alike. */
function captions(readme) {
  const out = new Map();
  // Posters are linked absolutely from R2 now, so key on the file name rather
  // than a repository-relative path.
  const cell = /<a href="[^"]*renders\/([a-z0-9-]+)\.png">.*?<br><sub>([^<]*)<\/sub>/gs;
  for (const m of readme.matchAll(cell)) if (!out.has(m[1])) out.set(m[1], m[2].trim());
  return out;
}

const readme = await readFile(join(REPO, 'docs/examples.md'), 'utf8');
const caption = captions(readme);

const names = (await readdir(EXAMPLES))
  .filter((f) => f.endsWith('.kiln.js'))
  .map((f) => basename(f, '.kiln.js'))
  .filter(isPublicExample)
  .sort();

await rm(OUT, { recursive: true, force: true });
await rm(THUMBS, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(THUMBS, { recursive: true });

const evaluator = resolveEvaluatorPortV2(undefined, 'trusted-local');
const manifest = [];
let bytes = 0;

for (const name of names) {
  const src = await readFile(join(EXAMPLES, `${name}.kiln.js`), 'utf8');
  const author = readAuthorship(src);
  let record;
  try {
    record = JSON.parse(await readFile(join(EXAMPLES, `${name}.provenance.json`), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const credit = recordedExampleCredit(src, record);
  const r = await evaluator.render(src);
  if (record?.provenance?.posterReceipt)
    verifyRecordedPoster(record.provenance.posterReceipt, src, await posterBytes(name));
  if (record?.provenance?.posterReceipt)
    await writeFile(
      join(OUT, `${name}.poster.json`),
      JSON.stringify(record.provenance.posterReceipt, null, 2) + '\n',
    );
  await writeFile(join(OUT, `${name}.glb`), r.glb);
  await writeFile(join(OUT, `${name}.kiln.js`), src);
  const runtime = await galleryRuntimeDownload(name, src, r.glb);
  await writeFile(join(SITE, 'public', runtime.index.file), runtime.glb);
  await writeFile(join(SITE, 'public', runtime.index.metadata.file), runtime.metadata);
  bytes += r.glb.byteLength;

  const im = r.integrationManifest;
  manifest.push({
    name,
    file: `assets/${name}.glb`,
    thumb: `thumbs/${name}.webp`,
    bytes: r.glb.byteLength,
    runtime: runtime.index,
    animations:
      JSON.parse(
        Buffer.from(r.glb)
          .subarray(20, 20 + Buffer.from(r.glb).readUInt32LE(12))
          .toString('utf8'),
      ).animations?.length ?? 0,
    authoredDate: credit?.authoredDate ?? src.match(/Run date: (\d{4}-\d{2}-\d{2})/)?.[1],
    source: `assets/${name}.kiln.js`,
    sourceHash: sha256(src),
    artifactHash: sha256(r.glb),
    provenance: credit?.provenance ?? exampleProvenance(src),
    history: await buildExampleHistory(name, src, join(SITE, 'examples', 'history', name), OUT),
    ...(['orbital-station', 'abyssal-surveyor'].includes(name)
      ? { poster: `thumbs/${name}-hero.webp` }
      : {}),
    // The category the program declares, not the one on the render result: that
    // field carries whatever the request asked for, and nothing asked here.
    category: readCategory(src),
    caption: caption.get(name) ?? '',
    model: credit?.model ?? author.display ?? author.model ?? 'Unknown model',
    harness: credit?.harness ?? author.harness,
    tris: im.renderMetrics.triangles,
    drawCalls: im.renderMetrics.drawCalls,
    materials: im.renderMetrics.uniqueMaterials,
    textures: im.renderMetrics.textureCount,
    size: im.bounds.size.map((v) => Number(v.toFixed(2))),
    grounded: im.ground.grounded,
    // Loud rather than quiet: a program that starts warning is one the gallery
    // should stop flattering, and the number is on the card.
    warnings: r.warnings.length,
  });

  // The index shows the checked-in hero render and the stage shows the live
  // GLB, so the grid stays cheap: fifty 1000px PNGs is 3.6 MB of first paint,
  // and the same fifty at 560px of webp is a fifth of that.
  await sharp(await posterFile(name))
    .resize(560, 560, { fit: 'inside' })
    .webp({ quality: 82 })
    .toFile(join(THUMBS, `${name}.webp`));

  // The item page's hero is drawn up to 480 CSS px wide, so the 560 px thumbnail
  // was soft on a 2x phone (engineering review, finding 17). It gets the source
  // render at up to 1024 px instead, never enlarged: every source measured
  // 1024x1024 on 2026-09-30, and a smaller one is declared at its own size.
  if (!manifest.at(-1).poster) {
    const poster = await sharp(await posterFile(name))
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(join(THUMBS, `${name}-poster.webp`));
    Object.assign(manifest.at(-1), { poster: `thumbs/${name}-poster.webp`, posterWidth: poster.width, posterHeight: poster.height });
  }

  if (['orbital-station', 'abyssal-surveyor'].includes(name)) {
    let posterPath = await posterFile(name);
    try {
      const record = JSON.parse(await readFile(join(SITE, `examples/${name}.poster.json`), 'utf8'));
      const image = await readFile(join(SITE, `examples/${name}.poster.png`));
      if (
        record.sourceHash === sha256(src) &&
        record.artifactHash === sha256(r.glb) &&
        record.imageHash === sha256(image) &&
        record.cameraRecipeHash === sha256(await readFile(join(SITE, 'src/hero-camera.ts')))
      ) {
        posterPath = join(SITE, `examples/${name}.poster.png`);
        manifest.at(-1).heroPoster = record;
        await writeFile(join(OUT, `${name}.hero-poster.json`), JSON.stringify(record, null, 2) + '\n');
      }
    } catch {}
    const hero = await sharp(posterPath)
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(join(THUMBS, `${name}-hero.webp`));
    Object.assign(manifest.at(-1), { posterWidth: hero.width, posterHeight: hero.height });
  }

  const w = r.warnings.length ? `  ${r.warnings.length} warnings` : '';
  console.log(`  ${name.padEnd(24)} ${String(im.renderMetrics.triangles).padStart(7)} tris${w}`);
}

await writeFile(join(OUT, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const total = manifest.reduce((a, m) => a + m.tris, 0);
console.log(
  `\n${manifest.length} assets, ${total.toLocaleString('en-US')} triangles, ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB of GLB`,
);

try {
  await cp(join(REPO, 'assets', 'video'), join(OUT, 'video'), { recursive: true });
} catch {}
const finalInputs = await runtimeBuildIdentity(REPO);
if (buildInputs.identity !== finalInputs.identity)
  throw new Error('Engine source changed during the site asset build. Rebuild from a stable tree.');
await writeFile(
  join(OUT, 'build.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      command: 'bun run --cwd site assets',
      engineVersion: buildInputs.engineVersion,
      engineSourceHash: buildInputs.sourceHash,
      dependencyLockHash: buildInputs.dependencyHash,
      runtime: { bun: process.versions.bun, node: process.versions.node, platform: process.platform, arch: process.arch },
      evaluator: 'trusted-local',
      indexHash: sha256(await readFile(join(OUT, 'index.json'))),
      note: 'Source and GLB hashes bind each downloadable pair. Poster receipts separately record the image, camera and renderer. The lock hash records dependency intent, not the installed dependency closure.',
    },
    null,
    2,
  )}\n`,
);
