import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { posterBytes } from './posters.mjs';
import { verifyRecordedPoster } from './provenance.mjs';
import { exampleArchivePath } from '../../scripts/example-archive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const hash = (value) => createHash('sha256').update(value).digest('hex');

const rows = JSON.parse(await readFile(join(root, 'assets/index.json'), 'utf8'));
for (const row of rows) {
  for (const [file, digest] of [
    [row.source, row.sourceHash],
    [row.file, row.artifactHash],
  ]) {
    if (
      !file ||
      !digest ||
      (!resolve(root, file).startsWith(`${root}\\`) && !resolve(root, file).startsWith(`${root}/`))
    )
      throw new Error(`Invalid asset path: ${row.name}`);
    if (hash(await readFile(join(root, file))) !== digest)
      throw new Error(`Asset hash mismatch: ${file}`);
  }
  await readFile(join(root, row.thumb));
  // Every item page declares its hero at the size the build recorded (engineering review, finding 17).
  if (!row.poster) throw new Error(`No item poster recorded: ${row.name}`);
  const poster = await sharp(join(root, row.poster)).metadata();
  if (poster.width !== row.posterWidth || poster.height !== row.posterHeight)
    throw new Error(`Poster size differs from its record: ${row.poster} is ${poster.width}x${poster.height}, recorded ${row.posterWidth}x${row.posterHeight}`);
  const source = await readFile(join(root, row.source));
  const canonical = await readFile(join(root, row.file));
  const runtime = row.runtime;
  for (const file of [runtime, runtime?.metadata]) {
    if (!file || !/^assets\/[a-z0-9-]+\.runtime\.(glb|kiln-metadata\.json)$/.test(file.file))
      throw new Error(`Invalid runtime download path: ${row.name}`);
    const bytes = await readFile(join(root, file.file));
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256)
      throw new Error(`Runtime download mismatch: ${file.file}`);
  }
  const runtimeBytes = await readFile(join(root, runtime.file));
  const metadataBytes = await readFile(join(root, runtime.metadata.file));
  const metadata = JSON.parse(metadataBytes);
  const glbJson = (bytes) => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const derived = glbJson(runtimeBytes);
  const pointer = derived.asset.extras.kilnProvenanceV1;
  if (pointer.metadata.uri !== runtime.metadata.file.split('/').at(-1) ||
      pointer.metadata.sha256 !== `sha256:${hash(metadataBytes)}` ||
      metadata.source.glbSha256 !== `sha256:${row.artifactHash}` ||
      metadata.source.sourceSha256 !== `sha256:${row.sourceHash}`)
    throw new Error(`Runtime provenance mismatch: ${row.name}`);
  delete derived.asset.extras.kilnProvenanceV1;
  const original = glbJson(canonical);
  original.asset.extras ??= {};
  const reviewScenes = [];
  for (const [index, scene] of (original.scenes ?? []).entries()) {
    if (scene.extras?.kilnReviewClipsV1) {
      reviewScenes.push({ index, kilnReviewClipsV1: scene.extras.kilnReviewClipsV1 });
      delete scene.extras.kilnReviewClipsV1;
    }
  }
  if (JSON.stringify(metadata.scenes) !== JSON.stringify(reviewScenes) ||
      JSON.stringify(derived) !== JSON.stringify(original) ||
      !runtimeBytes.subarray(20 + runtimeBytes.readUInt32LE(12)).equals(canonical.subarray(20 + canonical.readUInt32LE(12))))
    throw new Error(`Runtime changed content outside review data: ${row.name}`);
  if (row.history) {
    if (row.history.revisions.filter((revision) => revision.current && revision.sourceHash === row.sourceHash).length !== 1)
      throw new Error(`History has no unique displayed source: ${row.name}`);
    for (const revision of row.history.revisions) {
      const path = resolve(root, revision.source);
      if (!path.startsWith(resolve(root, 'assets/history', row.name) + '/') && !path.startsWith(resolve(root, 'assets/history', row.name) + '\\'))
        throw new Error(`Invalid history download path: ${row.name}`);
      if (hash(await readFile(path)) !== revision.sourceHash)
        throw new Error(`History snapshot mismatch: ${revision.source}`);
    }
  }
  if (row.provenance?.posterReceipt) {
    verifyRecordedPoster(row.provenance.posterReceipt, source, await posterBytes(row.name));
    const publicReceipt = JSON.parse(await readFile(join(root, 'assets', `${row.name}.poster.json`), 'utf8'));
    // `sourceHash` only. The published record is a verbatim copy of the recorded
    // receipt, so comparing its `artifactHash` to this run's `row.artifactHash`
    // was the same cross-platform byte claim `verifyRecordedPoster` just dropped,
    // re-imposed one line later.
    if (publicReceipt.sourceHash !== row.sourceHash) throw new Error(`Public poster record mismatch: ${row.name}`);
  }
  if (row.heroPoster) verifyRecordedPoster(row.heroPoster, source, await readFile(exampleArchivePath(`site/examples/${row.name}.poster.png`)));
}
const build = JSON.parse(await readFile(join(root, 'assets/build.json'), 'utf8'));
if (build.indexHash !== hash(await readFile(join(root, 'assets/index.json')))) throw new Error('Gallery index differs from its build receipt');
console.log(
  `Verified ${rows.length} source/GLB pairs, their posters at the recorded sizes, and the gallery build receipt.`,
);
