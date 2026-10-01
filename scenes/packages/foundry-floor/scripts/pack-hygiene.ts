// SPDX-License-Identifier: MIT
// FF3 pack hygiene (TASK-FF3, coordinator 2026-09-30): the ff3 pack ships no repository paths or working names. Its
// licence text, pack.json sources and the asset map's review fields name each model's Kiln asset, its saved revision and
// its author in the site's standard wording (scripts/attribution.ts: the model and harness, then the requested effort,
// from the author records), never an author workspace folder or a review file.
//   - packDataText: a staged data file's text with its documentation strings in pack wording (scripts/pack-text.ts,
//     exact whole-string replacements; the file's formatting and every other byte kept);
//   - packAssetMap: the asset map for the pack: those strings, and each model's `source` as its Kiln asset, revision and
//     author (the package map names the author workspace and output file, which staging reads);
//   - scanPack: every text file of a staged pack and the JSON chunk of every GLB, against the patterns below, with the
//     pack's own file paths allowed. The accepted GLBs are pinned bytes the scene never patches: text inside one is a
//     finding unless it is a known model text (KNOWN_MODEL_TEXT), reported beside the hits.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attributionOf, authorLine, effortLine } from './attribution';
import type { Attribution } from './attribution';
import { PACK_TEXT } from './pack-text';
import { PACKAGE_ROOT } from './stage';

const SHOWCASE = resolve(PACKAGE_ROOT, '../../../showcase');

/** The author workspace names (the folders of the showcase author and run records), matched as whole words. */
export function authorWorkspaceNames(): string[] {
  const names = new Set<string>();
  for (const dir of ['authors', 'runs']) {
    const path = resolve(SHOWCASE, dir);
    if (existsSync(path)) for (const entry of readdirSync(path, { withFileTypes: true })) if (entry.isDirectory()) names.add(entry.name);
  }
  return [...names].sort();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the pack must not name. Each pattern is global; the pack's own file paths are removed before matching. */
export function hygienePatterns(): { rule: string; rx: RegExp }[] {
  const names = authorWorkspaceNames();
  if (!names.length) throw new Error('No author workspace names found (the showcase author records are missing)');
  return [
    { rule: 'author workspace', rx: new RegExp(`(?<![\\w-])(?:${names.map(escape).join('|')})(?![\\w-])`, 'g') },
    { rule: 'showcase folder', rx: /showcase/gi },
    // Review file names (the run stages the site shows, review-1 and so on, are not files).
    { rule: 'review record', rx: /COORDINATOR-REVIEW|FEEDBACK-review|\bREVIEW-\d/g },
    { rule: 'coordination file', rx: /\b(?:DECISIONS|PROGRESS|REPORT|OVERNIGHT|KIT-REQUESTS|KILN-ISSUES|TASK(?:-[\w-]+)?)\b/g },
    { rule: 'working name', rx: /pack2-research|terafab|engine-work|site-workbench|kiln-commons|kiln-oss/gi },
    { rule: 'author output', rx: /(?<![\w-])outputs\//g },
    { rule: 'Kiln workspace', rx: /\.kiln\b|assets\/kiln/g },
    { rule: 'absolute path', rx: /(?<![A-Za-z])[A-Za-z]:[\\/]|[\\/]Users[\\/]|Mattm/g },
    { rule: 'repository directory', rx: /(?<![\w.-])(?:packages|scripts|src|tests|evidence|staged|dist|briefs|node_modules|review)\//g },
    { rule: 'source file', rx: /\b[\w.-]+\.(?:ts|tsx|mts|mjs|cjs|md|py|ps1|svg|sh)\b/g },
    { rule: 'repository file', rx: /(?<![\w/.-])[\w/.-]+\.json\b/g },
  ];
}

export interface HygieneHit { file: string; line: number; rule: string; match: string; text: string }

/** The hits of `text` (reported as `file`), after removing every allowed pack path. */
export function scanText(file: string, text: string, allowed: readonly string[], patterns = hygienePatterns()): HygieneHit[] {
  const hits: HygieneHit[] = [];
  const sorted = [...allowed].sort((a, b) => b.length - a.length);
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw;
    for (const path of sorted) line = line.split(path).join(' ');
    for (const { rule, rx } of patterns) {
      rx.lastIndex = 0;
      for (const m of line.matchAll(rx)) hits.push({ file, line: index + 1, rule, match: m[0], text: raw.trim().slice(0, 240) });
    }
  });
  return hits;
}

/** Text inside pinned model bytes that the pack cannot change (the scene never patches an accepted GLB). */
export const KNOWN_MODEL_TEXT: readonly { files: readonly string[]; field: string; value: string; why: string }[] = [{
  files: ['sedan', 'hatchback', 'suv', 'pickup', 'box-truck', 'transit-bus'].map(t => `models/vehicles/${t}.glb`),
  field: 'asset.extras.kilnCommonsLod',
  value: 'MSFT_lod written by showcase/review/vehicles/msft-lod.mjs from the named-group export',
  why: 'the six approved vehicle GLBs (the bytes Golden Gate stages as g7) record the script that wrote their MSFT_lod extension; the pins fix those bytes, so only a re-export by the vehicles owner can remove it',
}];

function glbJsonText(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  return new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)));
}

export interface PackScan { files: number; glbs: number; hits: HygieneHit[]; known: { file: string; field: string; value: string; why: string }[] }

/** Scans a staged pack: pack.json, SHA256SUMS, every listed text file and every GLB's JSON chunk. */
export function scanPack(dir: string): PackScan {
  const manifest = JSON.parse(readFileSync(resolve(dir, 'pack.json'), 'utf8')) as { files: { path: string }[] };
  const allowed = ['pack.json', 'SHA256SUMS', ...manifest.files.map(f => f.path)], patterns = hygienePatterns();
  const hits: HygieneHit[] = [], known: PackScan['known'] = [];
  let glbs = 0;
  for (const path of allowed) {
    if (path.endsWith('.glb')) {
      glbs++;
      const json = glbJsonText(new Uint8Array(readFileSync(resolve(dir, path))));
      let rest = json;
      for (const k of KNOWN_MODEL_TEXT) {
        if (!k.files.includes(path)) continue;
        const literal = JSON.stringify(k.value);
        if (rest.includes(literal)) { known.push({ file: path, field: k.field, value: k.value, why: k.why }); rest = rest.split(literal).join('""'); }
      }
      hits.push(...scanText(path, rest, allowed, patterns));
    } else hits.push(...scanText(path, readFileSync(resolve(dir, path), 'utf8'), allowed, patterns));
  }
  return { files: allowed.length, glbs, hits, known };
}

/** Counts each string value of `value` (object keys excluded). */
function stringCounts(value: unknown, counts = new Map<string, number>()): Map<string, number> {
  if (typeof value === 'string') counts.set(value, (counts.get(value) ?? 0) + 1);
  else if (Array.isArray(value)) for (const v of value) stringCounts(v, counts);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringCounts(v, counts);
  return counts;
}

/** The pack-wording entries for `packPath` whose package string `data` no longer holds (a stale table). */
export function staleEntries(packPath: string, data: unknown): string[] {
  const counts = stringCounts(data);
  return Object.keys(PACK_TEXT[packPath] ?? {}).filter(k => !counts.get(k));
}

/** `value` with every string listed for `packPath` in scripts/pack-text.ts replaced by its pack wording. */
export function rewriteStrings<T>(packPath: string, value: T): T {
  const table = PACK_TEXT[packPath] ?? {};
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return table[v] ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** The pack text of a data file: each listed string replaced where it stands, so the file keeps its formatting and every
 *  other byte. Every table entry must occur, and the result must parse to the rewritten data. */
export function packDataText(packPath: string, text: string): { text: string; replaced: number } {
  const table = PACK_TEXT[packPath] ?? {}, data = JSON.parse(text) as unknown, counts = stringCounts(data);
  let out = text, replaced = 0;
  for (const [from, to] of Object.entries(table)) {
    const n = counts.get(from) ?? 0, literal = JSON.stringify(from), occurrences = out.split(literal).length - 1;
    if (!n) throw new Error(`${packPath}: the pack wording lists a string the data no longer holds: ${from.slice(0, 120)}`);
    if (occurrences !== n) throw new Error(`${packPath}: ${n} values but ${occurrences} literal occurrences of ${from.slice(0, 120)}`);
    out = out.split(literal).join(JSON.stringify(to));
    replaced += n;
  }
  if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(rewriteStrings(packPath, data))) throw new Error(`${packPath}: the textual rewrite differs from the parsed one`);
  return { text: out, replaced };
}

/** The coordinator's acceptance of each structure delivery, in pack wording (the package map cites the coordinator log). */
const STRUCTURE_ACCEPTANCE: Readonly<Record<string, string>> = {
  'OVERNIGHT.md 2026-09-29 15:00 (opus-ff-head review 1, accepted as delivered; S1+S2 seam check 16:09)': 'Accepted by the coordinator 2026-09-29 15:00 at review 1, as delivered; S1 and S2 seam check 16:09.',
  'OVERNIGHT.md 2026-09-29 16:20 (S2 and S3 accepted after review 2)': 'Accepted by the coordinator 2026-09-29 16:20, after review 2.',
  'OVERNIGHT.md 2026-09-29 17:24 (S5 accepted at the first pass)': 'Accepted by the coordinator 2026-09-29 17:24, at the first pass.',
};
const ENTITY_ACCEPTANCE = 'Accepted at the coordinator\'s review.';

/** "Kiln asset foup, revision r_…. Claude Sonnet 5.5 · claude 2.1.280. Requested effort: max. Independently confirmed:
 *  not recorded.": the asset, the revision and the author in the site's wording. */
export const modelCredit = (a: Attribution) => `Kiln asset ${a.asset}, revision ${a.revision}. ${authorLine(a)}. ${effortLine(a)}`;

interface PackSource { author: string; asset: string; file: string; revision: string; requestedEffort: string | null; confirmedEffort: null; stage: string; review: string }
function packSource(id: string, source: { author: string; file: string; revision: string; asset?: string }, expectedAsset: string, acceptance: string): PackSource {
  const a = attributionOf(source.author, source.revision);
  if (a.asset !== expectedAsset) throw new Error(`${id}: the revision's manifest names asset ${a.asset}, the asset map ${expectedAsset}`);
  const file = source.file.split('/').pop()!;
  return { author: authorLine(a), asset: a.asset, file, revision: a.revision, requestedEffort: a.requestedEffort, confirmedEffort: null, stage: a.stage, review: `${modelCredit(a)} ${acceptance}` };
}

type MapSource = { author: string; file: string; revision: string; review: string; asset?: string; parentRevision?: string | null; createdAt?: string; libraryRevisions?: number };
interface MapShape { entities: Record<string, { asset: string; status?:string; source?: MapSource }>; structures?: Record<string, { source: MapSource & { asset: string } }> }

/** The asset map as the pack ships it: its documentation strings in pack wording and each model's source as its Kiln
 *  asset, revision and author (file is the delivered file's name; structures keep their parent revision, save time and
 *  library revision count). Everything else is the package map unchanged. */
export function packAssetMap<T extends MapShape>(map: T): T {
  const out = rewriteStrings('data/assets.json', structuredClone(map)) as T;
  for (const [id, e] of Object.entries(out.entities)) {
    const s = map.entities[id]!.source;
    if (s) e.source = packSource(id, s, e.asset, e.status==='review-candidate'?'Qualified technical local review candidate; owner visual review pending.':ENTITY_ACCEPTANCE) as unknown as MapSource;
  }
  for (const [id, e] of Object.entries(out.structures ?? {})) {
    const s = map.structures![id]!.source, acceptance = STRUCTURE_ACCEPTANCE[s.review];
    if (!acceptance) throw new Error(`${id}: no pack wording for the acceptance "${s.review}" (add it to STRUCTURE_ACCEPTANCE)`);
    const p = packSource(id, s, s.asset, acceptance);
    e.source = { author: p.author, asset: p.asset, file: p.file, revision: p.revision, parentRevision: s.parentRevision ?? null, createdAt: s.createdAt!, libraryRevisions: s.libraryRevisions!, requestedEffort: p.requestedEffort, confirmedEffort: null, stage: p.stage, review: p.review } as unknown as MapSource & { asset: string };
  }
  return out;
}
