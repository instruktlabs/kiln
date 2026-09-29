import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { fetchPinnedFile, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { MEDIA_WIDTHS } from './media-variants.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, bytes) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };

export async function buildCommons({ mirror = process.env.KILN_ASSET_MIRROR, cache = join(SITE, '.cache/commons'), publicDir = join(SITE, 'public'), dataDir = join(SITE, 'src/data'), enabled = !['0', 'false'].includes(process.env.KILN_SITE_PACKS ?? '1') } = {}) {
  if (!enabled) {
    // These directories belong exclusively to this generator. Resolve and check
    // every target before recursive removal, including Windows absolute paths.
    for (const directory of ['models', 'sources', 'media/farm', 'standalone/golden-gate-bridge']) {
      const target = resolve(publicDir, directory);
      const rel = relative(resolve(publicDir), target);
      if (!rel || rel.startsWith('..') || resolve(publicDir) === target) throw new Error(`Unsafe generated directory: ${target}`);
      await rm(target, { recursive: true, force: true });
    }
    console.log('Commons assets disabled (KILN_SITE_PACKS=0); no mirror or R2 access required.');
    return;
  }
  const manifest = await readJson(join(dataDir, 'mirror-manifest.json'));
  const plan = await readJson(join(dataDir, 'commons-build.json'));
  const records = new Map(manifest.files.map((record) => [record.path, record]));
  const pinnedFile = async (path) => {
    const record = records.get(path);
    if (!record) throw new Error(`Missing checked-in SHA-256 pin: ${path}`);
    return fetchPinnedFile(record, { mirror, cache: join(cache, 'mirror'), base: manifest.base });
  };
  const archives = new Map();
  for (const path of plan.archives) {
    const file = await pinnedFile(path);
    archives.set(path, verifyArchive(await readFile(file), path.startsWith('standalone/') ? 'editable' : 'delivery'));
  }
  for (const model of plan.models) {
    const bytes = model.archive ? archives.get(model.archive).files[model.member] : await readFile(await pinnedFile(model.path));
    verifyBytes(bytes, model, model.output);
    await write(join(publicDir, model.output), bytes);
  }
  for (const source of plan.sources) {
    const bytes = archives.get(source.archive).files[source.member];
    verifyBytes(bytes, source, source.output);
    await write(join(publicDir, source.output), bytes);
  }
  await mkdir(join(publicDir, 'sources/golden-gate-bridge'), { recursive: true });
  await copyFile(join(dataDir, 'standalone/golden-gate-reference.md'), join(publicDir, 'sources/golden-gate-bridge/REFERENCE.md'));
  // These are byte-identical extracted GLBs for the owner's future R2 upload.
  const uploads = await readJson(join(dataDir, 'upload-manifest.json'));
  for (const record of uploads.files) {
    const bytes = archives.get(record.archive).files[record.member];
    verifyBytes(bytes, record, record.path);
    await write(join(cache, 'upload', record.path), bytes);
  }
  const receipts = [];
  for (const image of plan.images) {
    const file = await pinnedFile(image.inputPath);
    const original = await readFile(file);
    const size = await sharp(original).metadata();
    if (size.width !== image.width || size.height !== image.height) throw new Error(`Image dimensions differ from manifest data: ${image.inputPath}`);
    const stem = image.inputPath.replace(/\.[^.]+$/, '');
    const target = join(publicDir, `${stem}.webp`);
    await mkdir(dirname(target), { recursive: true });
    if (image.inputPath.endsWith('.webp')) await copyFile(file, target);
    else await sharp(original).webp({ quality: 85 }).toFile(target);
    for (const width of MEDIA_WIDTHS.filter((value) => value <= image.width)) {
      const cacheKey = `${records.get(image.inputPath).sha256}-${width}-q62-e3`;
      for (const format of ['avif', 'webp']) {
        const cached = join(cache, 'images', `${cacheKey}.${format}`);
        let bytes;
        try { bytes = await readFile(cached); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          bytes = await sharp(original).resize({ width }).toFormat(format, format === 'avif' ? { quality: 62, effort: 3 } : { quality: 82 }).toBuffer();
          await write(cached, bytes);
        }
        await write(join(publicDir, `${stem}-${width}.${format}`), bytes);
        receipts.push({ path: `${stem}-${width}.${format}`, bytes: bytes.length, sha256: hashBytes(bytes), source: image.inputPath, sourceSha256: records.get(image.inputPath).sha256 });
      }
    }
  }
  await write(join(cache, 'build-receipt.json'), `${JSON.stringify({ models: plan.models.length, sources: plan.sources.length, verifiedArchives: plan.archives, images: receipts }, null, 2)}\n`);
  console.log(`Commons: verified ${archives.size} archives; prepared ${plan.models.length} models, ${plan.sources.length} sources and ${receipts.length} responsive images.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildCommons();
