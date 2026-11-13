// SPDX-License-Identifier: MIT
// Foundry Floor's adapter for the scene pack swap tool (site/scripts/scene-pack-swap.mjs). Given a sealed pack whose
// model members were swapped for saved child revisions, it regenerates the pack members that name those models:
//   data/assets.json             status, pins, source and every measured field, measured from the new bytes with
//                                inspect-assets.ts's own measure() (which reproduces the sealed values from the old bytes)
//   data/sim-config.json         the humanoid mover note that names its staged revision
//   evidence/sim/ff3-warm-pins.json   the sim-config input pins (a documentation string changed; the warm state is
//                                re-verified against the stored hashes from the new data)
//   evidence/asset-replacements.json  each interior swap recorded with its parent in the lineage
//   licenses/ASSET-LICENSE.txt and licenses/vehicles/<type>.ASSET-LICENSE.txt
//   pack.json                    credits and source.models (the tool rewrites files and release)
// A new revision is never given a review status: interior entities become `review-candidate` and every text says owner
// review is pending. `--tracked` applies the same changes to the package's tracked data/assets.json, data/sim-config.json
// and the replacement ledger, so tests and the code build read the swapped models.
//   bun packages/foundry-floor/scripts/pack-swap-adapter.ts --tracked --swaps scripts/flush-fix-swaps.json --inputs DIR
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CURATED, measure } from './inspect-assets';
import { parseGlb } from './glb';
import { modelName } from './attribution';
import { createFab, DAY_MS, type FabData } from '../src/sim/index';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pin = (path: string, b: Uint8Array) => ({ path, bytes: b.length, sha256: sha256(b) });

interface SavedManifest { assetId: string; revisionId: string; parentRevision: string; description?: string; attribution?: { model?: string; harness?: string }; files: Record<string, { bytes: number; sha256: string }> }
export interface Swap { id: string; asset: string; member: string; revision: string; parentRevision?: string; sha256: string; bytes: Uint8Array; saved?: Uint8Array; manifest: SavedManifest | null; previous: { revision: string; bytes?: number; sha256: string } }
type Json = Record<string, any>;

/** The child's change as its saved description states it (the text after "Flush-face fix:"). */
export function changeOf(m: SavedManifest): string {
  const text = /Flush-face fix:\s*(.+)$/s.exec(m.description ?? '')?.[1]?.trim().replace(/[\s.,;:…]+$/u, '');
  if (!text) throw new Error(`${m.assetId} ${m.revisionId}: the saved description states no flush-face fix`);
  return text;
}
/** The saving model and harness as the manifest records them; versions and effort are not recorded for these saves. */
export function childAuthor(m: SavedManifest) {
  const model = m.attribution?.model, harness = m.attribution?.harness;
  if (!model || !harness) throw new Error(`${m.revisionId}: the saved manifest records no model and harness`);
  const name = modelName(model);
  return { model, harness, line: `${name} · ${harness} (version not recorded)`, note: `Flush-face fix: ${changeOf(m)}. Saved with ${name} in ${harness}; harness version and requested effort not recorded. Owner review is pending.` };
}
const effort = 'Requested effort: not recorded. Independently confirmed: not recorded.';
const manifestOf = (s: Swap) => s.manifest ?? (() => { throw new Error(`${s.member}: the swap list names no saved manifest`); })();
const vehicleType = (s: Swap) => /^models\/vehicles\/([a-z-]+)\.glb$/.exec(s.member)?.[1] ?? null;

/** An asset map entity with the swapped model's pins, measured fields and source; status left for owner review. */
export function swappedEntity(id: string, entity: Json, s: Swap, source: Json): Json {
  const curated = CURATED[id];
  if (!curated || entity.glb !== s.member) throw new Error(`${id}: not an asset map entity for ${s.member}`);
  const measured = measure(id, curated, parseGlb(new Uint8Array(s.bytes)));
  return { ...entity, status: 'review-candidate', source, pins: { bytes: s.bytes.length, sha256: s.sha256 }, ...measured };
}
const packSource = (s: Swap) => {
  const m = manifestOf(s), a = childAuthor(m);
  return { author: a.line, asset: m.assetId, file: basename(s.member), revision: s.revision, requestedEffort: null, confirmedEffort: null, stage: 'flush-face-fix',
    review: `Kiln asset ${m.assetId}, revision ${s.revision}. ${a.line}. ${effort} Flush-face fix child; owner visual review pending.` };
};
const trackedSource = (s: Swap) => ({ author: 'flush-fix-children', file: `${s.asset}/${s.revision}/asset.glb`, revision: s.revision,
  review: 'not reviewed: flush-face fix child; owner visual review pending', hashFrom: 'the saved child revision manifest and its asset.glb' });

/** Apply the swaps to an asset map (pack or package form). */
export function swapAssetMap(map: Json, swaps: readonly Swap[], form: 'pack' | 'tracked'): Json {
  const out = structuredClone(map);
  for (const s of swaps) {
    if (!(s.id in out.entities)) continue;
    out.entities[s.id] = swappedEntity(s.id, out.entities[s.id], s, form === 'pack' ? packSource(s) : trackedSource(s));
  }
  return out;
}
/** The humanoid mover note names its staged revision: name the child, without a review status. */
export function swapSimConfigText(text: string, swaps: readonly Swap[]): string {
  let out = text;
  for (const s of swaps) out = out.split(`accepted and staged (${s.previous.revision})`).join(`review candidate, staged (${s.revision})`);
  return out;
}
/** Replacement records (the ledger or its public evidence): the parent joins the lineage, the child is next. */
export function swapReplacements(entries: Json[], swaps: readonly Swap[], models: Json, form: 'pack' | 'tracked'): Json[] {
  const out = structuredClone(entries);
  for (const s of swaps) {
    if (vehicleType(s)) continue; // the vehicles' own licence texts carry their lineage
    const m = manifestOf(s), parent = models[s.id] ?? {};
    const parentPin = { asset: m.assetId, revision: s.previous.revision, bytes: s.previous.bytes, sha256: s.previous.sha256 };
    const next = { asset: m.assetId, revision: s.revision, bytes: s.bytes.length, sha256: s.sha256, ...(form === 'tracked' ? { author: trackedSource(s).author, file: trackedSource(s).file } : {}) };
    const why = `Flush-face fix child: ${changeOf(m)}.`;
    const existing = out.find(e => e.id === s.id);
    if (existing) {
      if (existing.next.revision !== s.previous.revision || existing.next.sha256 !== s.previous.sha256) throw new Error(`${s.id}: the replacement record's next is not the swapped parent`);
      existing.lineage = [...(existing.lineage ?? []), { ...parentPin, model: parent.requestedModel ?? 'not recorded', harness: String(parent.author ?? '').split(' · ')[1] ?? 'not recorded', role: 'Flush-face fix parent' }];
      existing.next = next;
      existing.reason = `${existing.reason} ${why}`;
    } else out.push({ id: s.id, path: s.member, previous: parentPin, next, reason: `${why} Owner visual review pending.` });
  }
  return out;
}

const replaceLine = (text: string, prefix: string, line: string, file: string) => {
  const lines = text.split('\n'), at = lines.flatMap((l, i) => (l.startsWith(prefix) ? [i] : []));
  if (at.length !== 1) throw new Error(`${file}: expected one line starting "${prefix}", found ${at.length}`);
  lines[at[0]!] = line;
  return lines.join('\n');
};
/** The pack licence: the release line and each swapped model's entry (file, asset, revision, SHA-256, author). */
export function swapLicenceText(text: string, swaps: readonly Swap[], release: string): string {
  let lines = replaceLine(text, 'Release: ', `Release: ${release}`, 'ASSET-LICENSE.txt').split('\n');
  for (const s of swaps) {
    const start = lines.findIndex(l => l.startsWith(`${s.member}  Kiln asset `));
    if (start < 0 || !lines[start]!.endsWith(`, revision ${s.previous.revision}  SHA-256 ${s.previous.sha256}`)) throw new Error(`ASSET-LICENSE.txt: no entry for ${s.member} at its previous pin`);
    let end = start + 1;
    while (lines[end]?.startsWith('    ')) end++;
    const m = manifestOf(s), a = childAuthor(m);
    lines = [...lines.slice(0, start), `${s.member}  Kiln asset ${m.assetId}, revision ${s.revision}  SHA-256 ${s.sha256}`, `    ${a.line}. ${effort}`, `    ${a.note}`, ...lines.slice(end)];
  }
  return lines.join('\n');
}
/** A vehicle's own declaration: saved and delivered pins, canonical saved GLB and parent, and the change. */
export function swapVehicleLicence(text: string, s: Swap): string {
  const m = manifestOf(s), file = `${vehicleType(s)}.ASSET-LICENSE.txt`;
  const delivered = new RegExp(`^Delivered GLB SHA-256: ${s.previous.sha256}( .*)?$`, 'm').exec(text);
  if (!delivered || !text.includes(`Saved revision: ${s.previous.revision}\n`)) throw new Error(`${file}: does not declare the previous pins`);
  let out = replaceLine(text, 'Saved revision: ', `Saved revision: ${s.revision}`, file);
  out = replaceLine(out, 'Delivered GLB SHA-256: ', `Delivered GLB SHA-256: ${s.sha256}${delivered[1] ?? ''}`, file);
  out = replaceLine(out, 'Canonical saved GLB SHA-256: ', `Canonical saved GLB SHA-256: ${sha256(s.saved ?? s.bytes)}`, file);
  out = replaceLine(out, 'Immediate saved parent: ', `Immediate saved parent: ${m.parentRevision}`, file);
  return `${out.replace(/\n*$/, '\n')}Flush-face fix: ${changeOf(m)}; owner review of this revision is pending.\n`;
}
/** pack.json credits and source records of the swapped models, and the asset map hash. */
export function swapPackJson(pack: Json, swaps: readonly Swap[], assetMapBytes: Uint8Array): Json {
  for (const s of swaps) {
    const m = manifestOf(s), a = childAuthor(m), old = pack.source.models[s.id];
    if (!old || old.revision !== s.previous.revision || old.sha256 !== s.previous.sha256) throw new Error(`pack.json: source.models.${s.id} is not the previous pin`);
    pack.source.models[s.id] = { ...old, asset: m.assetId, revision: s.revision, bytes: s.bytes.length, sha256: s.sha256, author: a.line, requestedEffort: null, confirmedEffort: null,
      stage: 'flush-face-fix', requestedModel: a.model, recordedModel: a.model, attributionNote: a.note };
    const credit = pack.credits.find((c: Json) => c.source.startsWith(`Kiln asset ${old.asset}, revision ${s.previous.revision}.`));
    if (!credit) throw new Error(`pack.json: no credit for ${s.id}`);
    const declaration = old.attributionNote && credit.note.endsWith(` ${old.attributionNote}`) ? credit.note.slice(0, -old.attributionNote.length - 1) : credit.note;
    credit.source = `Kiln asset ${m.assetId}, revision ${s.revision}. ${a.line}. ${effort}`;
    credit.note = `${declaration} ${a.note}`;
  }
  pack.source.assetMap = sha256(assetMapBytes);
  return pack;
}

/** The stored warm start still reproduces its hashes from the swapped data (the fab reads no documentation string). */
export function verifyWarm(read: (path: string) => Uint8Array, receipt: Json): void {
  const json = (p: string) => JSON.parse(new TextDecoder().decode(read(p)));
  const data = { layout: json('data/layout.json'), graph: json('data/rail-graph.json'), route: json('data/route.json'), tools: json('data/tools.json'), config: json('data/sim-config.json') } as FabData;
  const fab = createFab({ seed: receipt.seed, data, snapshot: new TextDecoder().decode(read(receipt.warm.path)) });
  const hashes = json(receipt.hashes.path) as { hashes: string[]; day30Hash: string };
  if (fab.sim.S.t !== 30 * DAY_MS || fab.hash() !== receipt.day30Hash || JSON.stringify(fab.hourlyHashes()) !== JSON.stringify(hashes.hashes)) throw new Error('The warm start does not reproduce its hashes from the swapped data');
}

const W = 'evidence/sim/ff3-warm-pins.json';
/** The swap tool's adapter hook. */
export function regenerate({ files, manifest, swaps, release }: { files: Map<string, Uint8Array>; manifest: Json; swaps: Swap[]; release: string }) {
  const read = (path: string) => files.get(`assets/${path}`) ?? (() => { throw new Error(`pack member missing: ${path}`); })();
  const text = (path: string) => new TextDecoder().decode(read(path));
  const encode = (s: string) => Buffer.from(s);
  const members: Record<string, Uint8Array> = {};
  const assetMap = encode(`${JSON.stringify(swapAssetMap(JSON.parse(text('data/assets.json')), swaps, 'pack'), null, 1)}\n`);
  members['data/assets.json'] = assetMap;
  const simConfig = encode(swapSimConfigText(text('data/sim-config.json'), swaps));
  members['data/sim-config.json'] = simConfig;
  const trackedConfig = readFileSync(resolve(PACKAGE_ROOT, 'data/sim-config.json'));
  if (!new TextDecoder().decode(trackedConfig).includes(swapSimConfigText(`accepted and staged (${swaps.find(s => s.id === 'humanoidWorkRobot')?.previous.revision})`, swaps)))
    throw new Error('Update the tracked data/sim-config.json first (pack-swap-adapter.ts --tracked)');
  const warm = JSON.parse(text(W));
  const setPin = (list: Json[], bytes: Uint8Array) => list.map(p => (p.path === 'data/sim-config.json' ? pin(p.path, bytes) : p));
  warm.inputs = setPin(warm.inputs, simConfig);
  warm.sourceInputs = setPin(warm.sourceInputs, trackedConfig);
  members[W] = encode(`${JSON.stringify(warm, null, 2)}\n`);
  verifyWarm(path => (path === 'data/sim-config.json' ? simConfig : read(path)), warm);
  const evidence = JSON.parse(text('evidence/asset-replacements.json'));
  evidence.entries = swapReplacements(evidence.entries, swaps, manifest.source.models, 'pack');
  members['evidence/asset-replacements.json'] = encode(`${JSON.stringify(evidence, null, 2)}\n`);
  members['licenses/ASSET-LICENSE.txt'] = encode(swapLicenceText(text('licenses/ASSET-LICENSE.txt'), swaps, release));
  const history: Record<string, string> = { 'evidence/asset-replacements.json': 'each replaced revision stays in its record as the previous pin or a lineage parent' };
  for (const s of swaps) {
    const type = vehicleType(s);
    if (!type) continue;
    const path = `licenses/vehicles/${type}.ASSET-LICENSE.txt`;
    members[path] = encode(swapVehicleLicence(text(path), s));
    history[path] = 'the declaration names the replaced revision as the new revision\'s immediate saved parent';
  }
  return { members, history, packJson: (pack: Json) => swapPackJson(pack, swaps, assetMap) };
}

/** Apply the same changes to the package's tracked files. */
export function updateTracked(swaps: Swap[], root = PACKAGE_ROOT): string[] {
  const written: string[] = [];
  const write = (path: string, value: string) => { const full = resolve(root, path); if (readFileSync(full, 'utf8') !== value) { writeFileSync(full, value); written.push(path); } };
  const mapText = readFileSync(resolve(root, 'data/assets.json'), 'utf8'), map = JSON.parse(mapText);
  if (`${JSON.stringify(map, null, 1)}\n` !== mapText) throw new Error('data/assets.json is not in its generator form');
  write('data/assets.json', `${JSON.stringify(swapAssetMap(map, swaps, 'tracked'), null, 1)}\n`);
  write('data/sim-config.json', swapSimConfigText(readFileSync(resolve(root, 'data/sim-config.json'), 'utf8'), swaps));
  const ledgerText = readFileSync(resolve(root, 'scripts/ff3-model-replacements.json'), 'utf8'), ledger = JSON.parse(ledgerText);
  const pack = JSON.parse(readFileSync(resolve(root, '../../.cache/site-inputs/foundry-floor/standalone/assets/pack.json'), 'utf8'));
  ledger.entries = swapReplacements(ledger.entries, swaps, pack.source.models, 'tracked');
  write('scripts/ff3-model-replacements.json', `${JSON.stringify(ledger, null, 2)}\n`);
  return written;
}

if (import.meta.main && process.argv.includes('--tracked')) {
  const option = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
  const tool = pathToFileURL(resolve(PACKAGE_ROOT, '../../../site/scripts/scene-pack-swap.mjs')).href;
  const { parseSwapList } = await import(tool) as { parseSwapList(list: unknown, options: { inputs: string }): Promise<{ swaps: Swap[] }> };
  const listPath = resolve(option('--swaps') ?? resolve(PACKAGE_ROOT, 'scripts/flush-fix-swaps.json'));
  const list = await parseSwapList(JSON.parse(readFileSync(listPath, 'utf8')), { inputs: resolve(option('--inputs') ?? '') });
  console.log(JSON.stringify({ written: updateTracked(list.swaps) }));
}
