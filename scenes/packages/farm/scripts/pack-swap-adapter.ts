// SPDX-License-Identifier: MIT
// Farm's adapter for the scene pack swap tool (site/scripts/scene-pack-swap.mjs). No sealed Farm member names a model
// revision; pack.json's source records the release a pack derives from and each replaced model, in the shape
// scripts/stage-review2.ts wrote: parent release and pack.json hash, the pack's own acceptance (unchanged), and one
// replacement per swapped model naming its parent revision, delivered and saved hashes and the change it carries.
import { createHash } from 'node:crypto';

type Json = Record<string, any>;
interface SavedManifest { assetId: string; revisionId: string; parentRevision: string; description?: string }
export interface Swap { id: string; member: string; revision: string; sha256: string; bytes: Uint8Array; saved?: Uint8Array; manifest: SavedManifest | null; previous: { revision: string; sha256: string } }

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** The child's change as its saved description states it (the text after "Flush-face fix:"). */
const changeOf = (m: SavedManifest) => {
  const text = /Flush-face fix:\s*(.+)$/s.exec(m.description ?? '')?.[1]?.trim().replace(/[\s.,;:…]+$/u, '');
  if (!text) throw new Error(`${m.revisionId}: the saved description states no flush-face fix`);
  return text;
};

/** pack.json `source` of a pack made by swapping models into the sealed `parent` release. */
export function swapFarmSource(source: Json, swaps: readonly Swap[], parent: { release: string; packJsonSha256: string }): Json {
  const replacements = swaps.map(s => {
    const m = s.manifest;
    if (!m || m.revisionId !== s.revision || m.parentRevision !== s.previous.revision) throw new Error(`${s.member}: ${s.revision} is not a saved child of the sealed revision ${s.previous.revision}`);
    return { id: s.id, assetId: m.assetId, parentRevision: m.parentRevision, revision: s.revision, sha256: s.sha256, exportProfile: 'runtime',
      canonicalSha256: sha256(s.saved ?? s.bytes), scope: `Flush-face fix: ${changeOf(m)}` };
  });
  return { parentRelease: parent.release, parentPackSha256: parent.packJsonSha256, ownerAccepted: source.ownerAccepted, replacements };
}

/** The swap tool's adapter hook. */
export function regenerate({ files, swaps, previousRelease }: { files: Map<string, Uint8Array>; manifest: Json; swaps: Swap[]; previousRelease: string }) {
  const sealed = files.get('assets/pack.json') ?? (() => { throw new Error('pack member missing: pack.json'); })();
  const parent = { release: previousRelease, packJsonSha256: sha256(sealed) };
  return {
    members: {},
    history: { 'pack.json': 'source.replacements names each replaced revision as the parent of its replacement' },
    packJson: (pack: Json) => ({ ...pack, source: swapFarmSource(pack.source, swaps, parent) }),
  };
}
