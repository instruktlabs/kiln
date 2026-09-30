import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { BRIDGE_CAPTURES, BRIDGE_REVIEW_SHEET, bridgeCaptureFile, bridgeRevisionDir, bridgeTierFiles } from './bridge-captures.mjs';
import { inspectGlb } from './generate-commons.mjs';
import { readJson, writeJson } from './media-pins.mjs';
import { ASSET_BASE, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';

/**
 * Stage an accepted Golden Gate Bridge delivery as a mirror revision directory, ready for
 * `generate-commons.mjs --only-bridge`:
 *
 *   node scripts/stage-bridge-revision.mjs --outputs DIR --library DIR --mirror DIR --manifest-out FILE
 *
 * Every input is verified against the accepted pins in `src/data/standalone/golden-gate-tiers.json` before it is
 * copied, and every relationship the page states is checked against the author's own library: the revision's
 * parent, its sealed files, the export's metadata sidecar, and the run that saved each revision (its creation
 * time falls inside the run recorded in `bridge-requests.json`). The three editable archives are built from the
 * library's revision folders: the four members of a saved revision, stored uncompressed with the revision's own
 * creation time, so the same inputs always give the same bytes. The rig views (`rig-posters.mjs bridge`) must
 * already sit in the revision's `captures/` folder. Nothing is uploaded.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(SITE, 'src/data');
const WINDOW_SLACK_MS = 2 * 60 * 1000;
const tag = (value) => `sha256:${value}`;

/** One tier's inputs, verified; returns the bytes the mirror directory will hold. */
export async function verifyTier({ tier, assetId, outputs, library }) {
  const name = tier.tier;
  const glb = await readFile(join(outputs, tier.glb.file));
  verifyBytes(glb, tier.glb, `${name} export ${tier.glb.file}`);
  const triangles = inspectGlb(glb).triangles;
  if (triangles !== tier.glb.triangles) throw new Error(`${name}: ${triangles} triangles measured, ${tier.glb.triangles} pinned`);
  const metadataBytes = await readFile(join(outputs, tier.metadata));
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  if (metadata.version !== 'kiln.runtime-metadata.v1' || metadata.source?.assetId !== assetId || metadata.source?.revisionId !== tier.revision) {
    throw new Error(`${name}: the export metadata names ${metadata.source?.revisionId}, not ${tier.revision}`);
  }
  const dir = join(library, tier.revision);
  const manifestBytes = await readFile(join(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.assetId !== assetId || manifest.revisionId !== tier.revision || manifest.parentRevision !== tier.parent) {
    throw new Error(`${name}: the saved revision is ${manifest.revisionId} (parent ${manifest.parentRevision}), not ${tier.revision} (parent ${tier.parent})`);
  }
  const members = { 'manifest.json': manifestBytes };
  for (const [member, record] of Object.entries(manifest.files)) {
    members[member] = verifyBytes(await readFile(join(dir, member)), record, `${name} ${member}`);
  }
  for (const member of ['asset.glb', 'source.kiln.js', 'preview.png']) if (!members[member]) throw new Error(`${name}: the saved revision does not seal ${member}`);
  if (metadata.source.glbSha256 !== tag(hashBytes(members['asset.glb'])) || metadata.source.sourceSha256 !== tag(hashBytes(members['source.kiln.js']))) {
    throw new Error(`${name}: the export metadata does not describe the saved revision's GLB and source`);
  }
  // Only the four Kiln members go in: the archive verifier refuses a member the manifest does not seal.
  const prefix = `${assetId}/${tier.revision}/`;
  const mtime = new Date(manifest.createdAt);
  const zipInput = Object.fromEntries(Object.entries(members).map(([member, bytes]) => [`${prefix}${member}`, [bytes, { level: 0, mtime }]]));
  const zip = Buffer.from(zipSync(zipInput));
  const archive = verifyArchive(zip, 'editable');
  if (archive.manifest.revisionId !== tier.revision) throw new Error(`${name}: the built archive holds ${archive.manifest.revisionId}`);
  return { tier: name, glb, metadataBytes, zip, preview: members['preview.png'], manifest, triangles };
}

/** The lineage file against the author library and the recorded runs. Returns one line per checked revision. */
export async function verifyLineage({ lineage, tiers, requests, library }) {
  const runs = new Map(requests.map((request) => [request.stage, request]));
  const lines = [];
  const check = async (chainName, list, endsAt) => {
    if (list.at(-1).revisionId !== endsAt) throw new Error(`${chainName} chain ends at ${list.at(-1).revisionId}, not ${endsAt}`);
    for (const [index, entry] of list.entries()) {
      const manifest = JSON.parse(await readFile(join(library, entry.revisionId, 'manifest.json'), 'utf8'));
      if (manifest.revisionId !== entry.revisionId) throw new Error(`${entry.revisionId}: the library holds ${manifest.revisionId} there`);
      if ((manifest.parentRevision ?? null) !== entry.parentRevisionId) throw new Error(`${entry.revisionId}: parent ${manifest.parentRevision} in the library, ${entry.parentRevisionId} in the lineage`);
      if (index > 0 && entry.parentRevisionId !== list[index - 1].revisionId) throw new Error(`${chainName}: ${entry.revisionId} does not follow ${list[index - 1].revisionId}`);
      const run = runs.get(entry.request);
      if (!run) throw new Error(`${entry.revisionId}: no recorded run ${entry.request}`);
      const created = Date.parse(manifest.createdAt);
      if (created < Date.parse(run.startedAt) - WINDOW_SLACK_MS || created > Date.parse(run.endedAt) + WINDOW_SLACK_MS) {
        throw new Error(`${entry.revisionId} was saved at ${manifest.createdAt}, outside run ${entry.request} (${run.startedAt} to ${run.endedAt})`);
      }
      lines.push(`${chainName.padEnd(5)} ${entry.revisionId.slice(0, 12)} saved ${manifest.createdAt.slice(0, 16)} inside run ${entry.request}`);
    }
  };
  const byTier = new Map(tiers.tiers.map((tier) => [tier.tier, tier]));
  await check('full', lineage.full, byTier.get('full').revision);
  for (const name of ['web', 'far']) {
    const list = lineage.tiers[name];
    await check(name, list, byTier.get(name).revision);
    const branch = list[0].parentRevisionId;
    if (!lineage.full.some((entry) => entry.revisionId === branch)) throw new Error(`${name} branches from ${branch}, which the full chain does not contain`);
  }
  return lines;
}

/** Files under a directory, as mirror-relative pins. */
export async function pinDirectory(mirror, dir) {
  const pins = [];
  const walk = async (folder) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const bytes = await readFile(path);
        pins.push({ path: relative(mirror, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: hashBytes(bytes) });
      }
    }
  };
  await walk(join(mirror, dir));
  return pins.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function stageBridgeRevision({ outputs, library, mirror, manifestOut, data = DATA, log = console.log }) {
  const tiers = await readJson(join(data, 'standalone/golden-gate-tiers.json'));
  const lineage = await readJson(join(data, 'standalone/golden-gate-lineage.json'));
  const requests = await readJson(join(data, 'bridge-requests.json'));
  const full = tiers.tiers.find((tier) => tier.tier === 'full');
  const licence = await readFile(join(outputs, tiers.licence.file));
  verifyBytes(licence, tiers.licence, tiers.licence.file);
  log(`licence ${tiers.licence.file}: ${licence.length} B sha256 ${hashBytes(licence).slice(0, 12)} matches the pin`);
  const staged = [];
  for (const tier of tiers.tiers) {
    const result = await verifyTier({ tier, assetId: tiers.assetId, outputs, library });
    staged.push(result);
    log(`${tier.tier.padEnd(4)} ${tier.revision.slice(0, 12)} GLB ${result.glb.length} B sha256 ${tier.glb.sha256.slice(0, 12)} ${result.triangles} triangles; sealed files, metadata and parent ${tier.parent.slice(0, 12)} agree`);
  }
  for (const line of await verifyLineage({ lineage, tiers, requests, library })) log(line);

  const dir = bridgeRevisionDir(full.revision);
  const target = join(mirror, dir);
  await mkdir(join(target, 'captures'), { recursive: true });
  await writeFile(join(target, tiers.licence.file), licence);
  for (const result of staged) {
    const files = bridgeTierFiles(result.tier);
    await writeFile(join(target, files.glb), result.glb);
    await writeFile(join(target, files.metadata), result.metadataBytes);
    await writeFile(join(target, files.zip), result.zip);
  }
  // The full tier's saved preview keeps its own name: the revision's review sheet, as the author's engine drew it.
  const fullResult = staged.find((entry) => entry.tier === 'full');
  const sheet = await sharp(fullResult.preview).metadata();
  if (sheet.format !== 'png') throw new Error('The full tier preview is not a PNG');
  await writeFile(join(target, 'captures', bridgeCaptureFile(BRIDGE_REVIEW_SHEET)), fullResult.preview);
  for (const capture of BRIDGE_CAPTURES) {
    const file = join(target, 'captures', bridgeCaptureFile(capture.name));
    if (!(await stat(file).catch(() => undefined))?.isFile()) throw new Error(`Missing rig view ${capture.name}: run scripts/rig-posters.mjs bridge first`);
  }
  const files = await pinDirectory(mirror, dir);
  if (manifestOut) await writeJson(resolve(manifestOut), { base: ASSET_BASE, files });
  log(`Staged ${files.length} files under ${dir} (${files.reduce((sum, file) => sum + file.bytes, 0)} B).`);
  return { dir, files, tiers: tiers.tiers.map((tier) => tier.tier) };
}

async function main(argv = process.argv.slice(2)) {
  const option = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const [outputs, library, mirror, manifestOut] = ['--outputs', '--library', '--mirror', '--manifest-out'].map(option);
  if (!outputs || !library || !mirror) throw new Error('Usage: node scripts/stage-bridge-revision.mjs --outputs DIR --library DIR --mirror DIR [--manifest-out FILE]');
  await stageBridgeRevision({ outputs: resolve(outputs), library: resolve(library), mirror: resolve(mirror), manifestOut });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
