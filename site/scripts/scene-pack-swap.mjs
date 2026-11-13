// Build a new sealed scene pack from an existing one by swapping named model members for new bytes.
//
// The input is data: a swap list (schema kiln.scene-pack-swap/1) naming, for each model, its pack member, the file
// holding its new bytes (optionally passed through a named derivation), its new revision and SHA-256, and the revision
// and SHA-256 it replaces. The tool checks every pin, swaps the bytes, lets the scene's adapter regenerate the pack
// members that name those models (asset maps, licence texts, evidence; scene-specific, kept in the scene package),
// recomputes pack.json `files` and SHA256SUMS, names the new release, and refuses the result while any pack text
// member still names a replaced revision or hash that the adapter has not declared history. Members it was not told
// to change stay byte for byte; files outside the pack (a standalone build's code) are carried and reported.
// Nothing is uploaded and no tracked file is written.
//
// Run from site/ (bun, because a scene adapter may be TypeScript):
//   bun scripts/scene-pack-swap.mjs --swaps LIST.json --inputs DIR --source STANDALONE --out DIR [--zip FILE]
// --inputs is the directory the list's `file` and `manifest` paths are relative to; --source is the extracted sealed
// standalone (scenes/.cache/site-inputs/<id>/standalone by default); --out receives the new standalone; --zip writes
// the deterministic archive of it. Then, once any code is rebuilt against the new pack:
//   bun scripts/scene-pack-swap.mjs --seal STANDALONE --mirror DIR --label LABEL
// writes DIR/scene-inputs/LABEL/<id>.zip and prints its scene-inputs.json record.
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deterministicZip } from './asset-delivery.mjs';
import { assetPath, hashBytes } from './mirror-core.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';
import { PACK_SCHEMA, parseSums } from './scene-pack.mjs';

const SITE = resolve(import.meta.dirname, '..');
export const SWAP_SCHEMA = 'kiln.scene-pack-swap/1';
export const PACK_ROOT = 'assets';
const REVISION = /^r_[0-9a-f]{32}$/;
const SHA = /^[0-9a-f]{64}$/;
const RELEASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT = /\.(?:json|txt|md|js|mjs|css|html)$|(?:^|\/)SHA256SUMS$/;

/**
 * Named derivations a swap may apply to its file before swapping (the result is what `sha256` pins). Each receives the
 * saved bytes and { entry, manifest, directory } (the saved revision directory beside `file`); it returns the new bytes,
 * or { glb, runtimeMetadata } when the form has a sidecar, which the swap carries for the scene adapter to place.
 */
export const DERIVATIONS = {
  /** The vehicle runtime form: optional MSFT_lod wheel culling added to the saved GLB's JSON (site/scripts/vehicle-glb.mjs). */
  'vehicle-wheel-lod': async (bytes) => (await import('./vehicle-glb.mjs')).ensureVehicleWheelLod(bytes),
  /**
   * The Kiln runtime profile of the saved revision, as `kiln export <asset> <revision> --profile runtime --out <name>.glb`
   * writes it: the saved GLB's binary chunk, its JSON plus a kilnProvenanceV1 naming the sidecar `<name>.kiln-metadata.json`
   * (`runtimeMetadata` on the entry, by default the member's own name). Every file the manifest lists is read and checked.
   */
  'kiln-runtime': async (bytes, { entry, manifest, directory }) => {
    if (!manifest) fail(`${entry.member}: kiln-runtime needs the saved revision manifest`);
    const files = {};
    for (const name of Object.keys(manifest.files ?? {})) files[name] = name === 'asset.glb' ? bytes : await readFile(join(directory, assetPath(name)));
    const name = entry.runtimeMetadata ?? `${basename(entry.member, '.glb')}.kiln-metadata.json`;
    const { exportAssetGlb } = await import('../../src/asset-export');
    const output = await exportAssetGlb({ manifest, files }, { profile: 'runtime', metadataFileName: name });
    return { glb: output.glb, runtimeMetadata: { name: output.metadata.name, bytes: Buffer.from(output.metadata.bytes) } };
  },
};

/** Scene adapters: each regenerates the members of its own pack that name the swapped models. */
export const ADAPTERS = {
  'foundry-floor': () => import(pathToFileURL(resolve(SITE, '../scenes/packages/foundry-floor/scripts/pack-swap-adapter.ts')).href),
  'golden-gate': () => import(pathToFileURL(resolve(SITE, '../scenes/packages/golden-gate/scripts/pack-swap-adapter.ts')).href),
};

const fail = (message) => { throw new Error(message); };
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/**
 * Validate a swap list and load each swap's new bytes: read `file` (relative to `inputs`), apply `derive`, and check
 * the result against the declared `sha256` and `bytes`. A `manifest` (a saved Kiln revision manifest) must name the
 * declared revision and parent and pin the file it was read beside.
 */
export async function parseSwapList(list, { inputs }) {
  if (list?.schema !== SWAP_SCHEMA) fail(`The swap list schema must be ${SWAP_SCHEMA}`);
  if (typeof list.scene !== 'string' || !RELEASE.test(list.scene)) fail('The swap list names no scene');
  if (!RELEASE.test(list.release ?? '')) fail(`Invalid new release id: ${list.release}`);
  if (!list.from || !RELEASE.test(list.from.release ?? '')) fail('The swap list names no source release');
  if (!Array.isArray(list.swaps) || !list.swaps.length) fail('The swap list names no swaps');
  const swaps = [];
  for (const entry of list.swaps) {
    const label = entry?.member ?? '(no member)';
    assetPath(entry.member);
    assetPath(entry.file);
    if (!REVISION.test(entry.revision ?? '') || !SHA.test(entry.sha256 ?? '') || !Number.isInteger(entry.bytes)) fail(`${label}: the swap needs a revision, sha256 and bytes`);
    if (!REVISION.test(entry.previous?.revision ?? '') || !SHA.test(entry.previous?.sha256 ?? '')) fail(`${label}: the swap needs the previous revision and sha256`);
    if (entry.derive !== undefined && !Object.hasOwn(DERIVATIONS, entry.derive)) fail(`${label}: unknown derivation ${entry.derive}`);
    const saved = await readFile(join(inputs, entry.file));
    let manifest = null;
    if (entry.manifest !== undefined) {
      manifest = JSON.parse(await readFile(join(inputs, assetPath(entry.manifest)), 'utf8'));
      const pin = manifest.files?.['asset.glb'];
      if (manifest.revisionId !== entry.revision || (entry.parentRevision !== undefined && manifest.parentRevision !== entry.parentRevision)) fail(`${label}: the manifest names revision ${manifest.revisionId} (parent ${manifest.parentRevision})`);
      if (!pin || pin.sha256.replace(/^sha256:/, '') !== hashBytes(saved) || pin.bytes !== saved.length) fail(`${label}: the saved GLB differs from its manifest`);
    }
    const derived = entry.derive ? await DERIVATIONS[entry.derive](saved, { entry, manifest, directory: dirname(join(inputs, entry.file)) }) : saved;
    const { glb, runtimeMetadata } = derived instanceof Uint8Array ? { glb: derived } : derived;
    const bytes = Buffer.from(glb);
    if (hashBytes(bytes) !== entry.sha256 || bytes.length !== entry.bytes) fail(`${label}: the new bytes (${bytes.length} B, ${hashBytes(bytes)}) are not the declared SHA-256 and size`);
    swaps.push({ ...entry, bytes, saved, manifest, ...(runtimeMetadata ? { runtimeMetadata } : {}) });
  }
  return { ...list, swaps };
}

/** The pack's manifest and seals, each sealed member checked against both. */
function readPack(files) {
  const manifestBytes = files.get(`${PACK_ROOT}/pack.json`) ?? fail('The source has no assets/pack.json');
  const sums = parseSums((files.get(`${PACK_ROOT}/SHA256SUMS`) ?? fail('The source has no assets/SHA256SUMS')).toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== PACK_SCHEMA || !Array.isArray(manifest.files)) fail(`pack.json is not a ${PACK_SCHEMA} manifest`);
  if (manifest.files.length !== sums.size) fail('pack.json and SHA256SUMS seal different files');
  for (const file of manifest.files) {
    const bytes = files.get(`${PACK_ROOT}/${assetPath(file.path)}`) ?? fail(`Sealed pack member is missing: ${file.path}`);
    if (sums.get(file.path) !== file.sha256 || hashBytes(bytes) !== file.sha256 || bytes.length !== file.bytes) fail(`Sealed pack member differs from its seal: ${file.path}`);
  }
  return manifest;
}

const isText = (path) => TEXT.test(path);
const namesOf = (text, swaps) => [...new Set(swaps.flatMap((s) => [s.previous.revision, s.previous.sha256]).filter((needle) => text.includes(needle)))];

/**
 * Swap pack members. `files` maps every standalone path (the pack under assets/, anything else beside it) to its bytes;
 * `swaps` carry `member` (pack-relative), `bytes`, `revision`, `sha256` and `previous` { revision, sha256 }.
 * `regenerate` is the scene adapter: given the swapped files it returns `members` (pack path to new bytes), optional
 * `packJson` (a function rewriting the manifest's descriptive fields) and `history` (pack path to the reason the
 * member may keep naming a replaced revision). `usedReleases` lists release ids that may not be reused.
 */
export function swapPack({ files, swaps, release, usedReleases = [], regenerate }) {
  const manifest = readPack(files);
  if (!RELEASE.test(release ?? '')) fail(`Invalid new release id: ${release}`);
  if (release === manifest.release || usedReleases.includes(release)) fail(`Release ${release} already exists; an immutable release id is never reused for changed bytes`);
  const sealed = new Map(manifest.files.map((file) => [file.path, file]));
  const seen = new Set();
  for (const swap of swaps) {
    const file = sealed.get(swap.member);
    if (!file || !swap.member.endsWith('.glb')) fail(`${swap.member}: not a sealed member model of ${manifest.id}/${manifest.release}`);
    if (seen.has(swap.member)) fail(`${swap.member}: swapped twice`);
    seen.add(swap.member);
    if (file.sha256 !== swap.previous.sha256) fail(`${swap.member}: the pack holds ${file.sha256}, not its previous pin ${swap.previous.sha256}`);
    if (hashBytes(swap.bytes) !== swap.sha256) fail(`${swap.member}: the new bytes are not the declared SHA-256`);
    if (swap.sha256 === file.sha256) fail(`${swap.member}: the swap changes nothing`);
  }
  const next = new Map(files);
  for (const swap of swaps) next.set(`${PACK_ROOT}/${swap.member}`, Buffer.from(swap.bytes));
  const adapted = regenerate ? regenerate({ files: next, manifest: structuredClone(manifest), swaps, release, previousRelease: manifest.release }) : {};
  const regenerated = [];
  for (const [path, bytes] of Object.entries(adapted.members ?? {})) {
    if (!sealed.has(path) || path.endsWith('.glb') || seen.has(path)) fail(`${path}: an adapter may rewrite only existing sealed data members`);
    const before = next.get(`${PACK_ROOT}/${path}`);
    if (before.equals(bytes)) continue;
    next.set(`${PACK_ROOT}/${path}`, Buffer.from(bytes));
    regenerated.push({ path, before: { bytes: before.length, sha256: hashBytes(before) }, after: { bytes: bytes.length, sha256: hashBytes(bytes) } });
  }
  const history = Object.entries(adapted.history ?? {}).map(([path, reason]) => {
    if (!sealed.has(path) || typeof reason !== 'string' || !reason) fail(`${path}: history needs a sealed member and a reason`);
    return { path, reason };
  });
  const rewritten = structuredClone(adapted.packJson ? adapted.packJson(structuredClone(manifest)) : manifest);
  if (rewritten.id !== manifest.id || JSON.stringify(rewritten.files.map((f) => f.path)) !== JSON.stringify(manifest.files.map((f) => f.path))) fail('An adapter may not change the pack id or its file list');
  rewritten.release = release;
  rewritten.files = manifest.files.map(({ path }) => {
    const bytes = next.get(`${PACK_ROOT}/${path}`);
    return { path, bytes: bytes.length, sha256: hashBytes(bytes) };
  });
  next.set(`${PACK_ROOT}/pack.json`, encode(rewritten));
  next.set(`${PACK_ROOT}/SHA256SUMS`, Buffer.from(rewritten.files.map((f) => `${f.sha256}  ${f.path}\n`).join('')));
  // Every pack text member, pack.json included, is audited for the replaced revisions and hashes.
  const allowed = new Set(history.map((h) => h.path));
  const stale = [];
  for (const path of ['pack.json', ...manifest.files.map((f) => f.path)]) {
    if (!isText(path) || allowed.has(path)) continue;
    const names = namesOf(next.get(`${PACK_ROOT}/${path}`).toString('utf8'), swaps);
    if (names.length) stale.push(`${path} still names ${names.join(', ')}`);
  }
  if (stale.length) fail(`The swapped pack still names replaced models (regenerate these members or declare them history):\n${stale.join('\n')}`);
  const packPaths = new Set([`${PACK_ROOT}/pack.json`, `${PACK_ROOT}/SHA256SUMS`, ...manifest.files.map((f) => `${PACK_ROOT}/${f.path}`)]);
  const staleOutsidePack = [...next.keys()].filter((path) => !packPaths.has(path) && isText(path)).sort()
    .map((path) => ({ path, names: namesOf(next.get(path).toString('utf8'), swaps) })).filter((entry) => entry.names.length);
  const changed = new Set([...swaps.map((s) => `${PACK_ROOT}/${s.member}`), ...regenerated.map((r) => `${PACK_ROOT}/${r.path}`), `${PACK_ROOT}/pack.json`, `${PACK_ROOT}/SHA256SUMS`]);
  for (const [path, bytes] of files) if (!changed.has(path) && !next.get(path).equals(bytes)) fail(`${path}: changed without being named`);
  return {
    files: next,
    report: {
      id: manifest.id, release, previousRelease: manifest.release,
      swapped: swaps.map((s) => ({ member: s.member, previous: { revision: s.previous.revision, bytes: sealed.get(s.member).bytes, sha256: s.previous.sha256 }, next: { revision: s.revision, bytes: s.bytes.length, sha256: s.sha256 } })),
      regenerated, history,
      unchanged: [...files.keys()].filter((path) => !changed.has(path)).length,
      staleOutsidePack,
      packJsonSha256: hashBytes(next.get(`${PACK_ROOT}/pack.json`)),
      sha256sumsSha256: hashBytes(next.get(`${PACK_ROOT}/SHA256SUMS`)),
    },
  };
}

/** The deterministic archive of a standalone (sorted members, fixed timestamps; scripts/asset-delivery.mjs). */
export function sealArchive(files) {
  return deterministicZip(Object.fromEntries([...files].map(([path, bytes]) => [assetPath(path), new Uint8Array(bytes)])));
}

/** Every file under `directory`, keyed by its slash-separated relative path. */
export async function readStandalone(directory, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const [inner, bytes] of await readStandalone(directory, path)) files.set(inner, bytes);
    else if (entry.isFile()) files.set(path, await readFile(join(directory, path)));
    else fail(`Unsupported entry: ${path}`);
  }
  return files;
}

/** Release ids the site already pins for any scene (scene inputs and scene packs). */
export async function usedReleaseIds(site = SITE) {
  const inputs = JSON.parse(await readFile(join(site, 'src/data/scene-inputs.json'), 'utf8'));
  const packs = JSON.parse(await readFile(join(site, 'src/data/scene-packs.json'), 'utf8'));
  return [...new Set([...inputs.files.map((f) => f.release), ...Object.values(packs).map((p) => p.release)])];
}

/**
 * Seal a finished standalone (for a frame scene, the code rebuilt against the swapped pack) as a scene input archive:
 * the pack verified in place, every text file scanned for private data, the deterministic ZIP written once and its
 * scene-inputs.json record returned (`path` is `scene-inputs/<label>/<id>.zip`).
 */
export async function sealSceneInput({ standalone, mirror, label }) {
  const { verifyPack } = await import('./scene-pack.mjs');
  const { checkedSceneArchive } = await import('./scene-inputs.mjs');
  const inventory = await verifyPack(join(standalone, PACK_ROOT), join(standalone, 'THIRD-PARTY-NOTICES.txt'));
  const files = await readStandalone(standalone);
  const scan = await scanFiles(standalone, { files: [...files.keys()].filter(isText) });
  if (scan.findings.length) fail(`The standalone carries private data:\n${scan.findings.slice(0, 12).map(describeFinding).join('\n')}`);
  if (!RELEASE.test(label ?? '')) fail('--label must be a lower-case archive directory name');
  const bytes = sealArchive(files);
  const record = { id: inventory.id, release: inventory.release, path: `scene-inputs/${label}/${inventory.id}.zip`, bytes: bytes.length, sha256: hashBytes(bytes), packJsonSha256: inventory.packJsonSha256 };
  checkedSceneArchive(bytes, record);
  const target = join(mirror, record.path);
  if (existsSync(target) && hashBytes(await readFile(target)) !== record.sha256) fail(`${target} exists with other bytes; a sealed archive is never replaced`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { target, record };
}

export async function main(argv = process.argv.slice(2)) {
  const option = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--seal')) {
    const sealed = await sealSceneInput({ standalone: resolve(option('--seal')), mirror: resolve(option('--mirror') ?? fail('--mirror DIR is required')), label: option('--label') });
    console.log(JSON.stringify(sealed, null, 2));
    return sealed;
  }
  const listPath = option('--swaps') ?? fail('--swaps LIST.json is required');
  const inputs = resolve(option('--inputs') ?? fail('--inputs DIR is required'));
  const out = resolve(option('--out') ?? fail('--out DIR is required'));
  const list = await parseSwapList(JSON.parse(await readFile(listPath, 'utf8')), { inputs });
  const source = resolve(option('--source') ?? resolve(SITE, '../scenes/.cache/site-inputs', list.scene, 'standalone'));
  if (out === source || out.startsWith(`${source}/`) || out.startsWith(`${source}\\`)) fail('--out must not be inside --source');
  const files = await readStandalone(source);
  const pack = readPack(files);
  if (pack.id !== list.scene || pack.release !== list.from.release) fail(`The source is ${pack.id}/${pack.release}, not ${list.scene}/${list.from.release}`);
  if (list.from.packJsonSha256 && hashBytes(files.get(`${PACK_ROOT}/pack.json`)) !== list.from.packJsonSha256) fail('The source pack.json is not the one the swap list names');
  const adapter = ADAPTERS[list.scene] ? await ADAPTERS[list.scene]() : null;
  const { files: swapped, report } = swapPack({ files, swaps: list.swaps, release: list.release, usedReleases: await usedReleaseIds(), regenerate: adapter ? (context) => adapter.regenerate({ ...context, list }) : undefined });
  await rm(out, { recursive: true, force: true });
  for (const [path, bytes] of swapped) { await mkdir(dirname(join(out, path)), { recursive: true }); await writeFile(join(out, path), bytes); }
  const scan = await scanFiles(out, { files: [...swapped.keys()].filter(isText) });
  if (scan.findings.length) fail(`The swapped standalone carries private data:\n${scan.findings.slice(0, 12).map(describeFinding).join('\n')}`);
  const zip = option('--zip');
  if (zip) {
    const bytes = sealArchive(swapped);
    if (existsSync(zip) && hashBytes(await readFile(zip)) !== hashBytes(bytes)) fail(`${zip} exists with other bytes; a sealed archive is never replaced`);
    await mkdir(dirname(resolve(zip)), { recursive: true });
    await writeFile(zip, bytes);
    report.archive = { bytes: bytes.length, sha256: hashBytes(bytes) };
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
