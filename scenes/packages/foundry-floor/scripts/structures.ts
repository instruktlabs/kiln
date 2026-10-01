// SPDX-License-Identifier: MIT
// The campus structures (FF-C1): the twelve accepted S1 to S5 exports the campus places (structures contract,
// pack2-research/terafab/briefs/structures-contract.md). Each is pinned here by its author workspace, file, Kiln
// asset and revision, bytes and SHA-256, and verified three ways: the delivered file matches the pins, the pinned
// revision is the newest revision of its asset in the author's Kiln library (manifest createdAt), and that revision's
// asset.glb and manifest record the same bytes and hash. Measured facts (triangles, meshes, materials as exported,
// bounds, locators, top-level parts, scales) are read from the GLB with scripts/glb.ts. Pure Node: no three or DOM.
// Used by scripts/inspect-assets.ts (the asset map's `structures` section), scripts/build-campus.ts and
// scripts/stage-campus.ts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { det3, emptyBox, growBox, meshTriangles, parseGlb, sceneTree, transformPoint, triangleCount, worldMatrices } from './glb';
import type { Box, GlbFile, SceneTree } from './glb';

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORS_ROOT = resolve(PACKAGE, '../../../showcase/authors');

export type Piece = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
export type StructureKind = 'head' | 'hall' | 'link' | 'canopy' | 'bridge';
export interface StructureSpec {
  piece: Piece; kind: StructureKind; hand: 'W' | 'E' | null; tier: 'full' | 'far';
  /** The other tier of the same structure (full <-> far), or null when the asset has one export (S3, S4). */
  pair: string | null;
  author: string; file: string; asset: string; revision: string; bytes: number; sha256: string;
  /** The coordinator's acceptance record. */
  review: string;
  /** Triangle budget from the contract's exports table (S5: its brief, revision 3). */
  budget: number;
}

const S1_REVIEW = 'OVERNIGHT.md 2026-09-29 15:00 (opus-ff-head review 1, accepted as delivered; S1+S2 seam check 16:09)';
const S2_REVIEW = 'OVERNIGHT.md 2026-09-29 16:20 (S2 and S3 accepted after review 2)';
const S5_REVIEW = 'OVERNIGHT.md 2026-09-29 17:24 (S5 accepted at the first pass)';
/** Pack model ids are the export names (the files' stems). */
export const STRUCTURES: Record<string, StructureSpec> = {
  's1-head-W': { piece: 'S1', kind: 'head', hand: 'W', tier: 'full', pair: 's1-head-W-far', author: 'opus-ff-head', file: 's1-head-W.glb', asset: 'a_99c239a460b54a6db070df7d28338c63', revision: 'r_c2d99522b58344b69dca0ad1ce41928a', bytes: 794948, sha256: '12be5743a5e422416602ce42ad36b8143ad203e2672a2c00043e1410564e78cf', review: S1_REVIEW, budget: 40000 },
  's1-head-E': { piece: 'S1', kind: 'head', hand: 'E', tier: 'full', pair: 's1-head-E-far', author: 'opus-ff-head', file: 's1-head-E.glb', asset: 'a_a56d232bf5674ad78607864566f2e4e0', revision: 'r_df7dae73a55c46f1853280912ac1d593', bytes: 794948, sha256: '694ef50d50de5f4f28be10a0b087b9493e19ad3d7083bc95c717c37a292114c0', review: S1_REVIEW, budget: 40000 },
  's1-head-W-far': { piece: 'S1', kind: 'head', hand: 'W', tier: 'far', pair: 's1-head-W', author: 'opus-ff-head', file: 's1-head-W-far.glb', asset: 'a_eb6754b1b7fe4c7a8560895c763cb48c', revision: 'r_e8204a9885e14c2c9d09a22f755a80da', bytes: 32280, sha256: '0bcce2163fbbfaa787628efffc8362405ed3b42a7614d3161e6bb33e790f83ea', review: S1_REVIEW, budget: 2000 },
  's1-head-E-far': { piece: 'S1', kind: 'head', hand: 'E', tier: 'far', pair: 's1-head-E', author: 'opus-ff-head', file: 's1-head-E-far.glb', asset: 'a_7d13f66d7d7b45a98136055b3a759856', revision: 'r_2e4899a609764cf6a993093253b75fd8', bytes: 32280, sha256: '6d5a620ef1a11c1964797663d0465ce48170049440e1b1df80b6eeb22374cdcb', review: S1_REVIEW, budget: 2000 },
  's4-canopy': { piece: 'S4', kind: 'canopy', hand: null, tier: 'full', pair: null, author: 'opus-ff-head', file: 's4-canopy.glb', asset: 'a_ac56fc354640463fabb09a9d9b1a3879', revision: 'r_e6e9b7f634014bc6ab698dcbb0df91a5', bytes: 40252, sha256: '5a847c587b59fa62b4c6e4113a605eae1ec4a8f760d99d5817b8fd7c0b68f0c7', review: S1_REVIEW, budget: 10000 },
  's2-hall-W': { piece: 'S2', kind: 'hall', hand: 'W', tier: 'full', pair: 's2-hall-W-far', author: 'sonnet-ff-hall', file: 's2-hall-W.glb', asset: 'a_700fda75271246d686ed6ecbd9c02520', revision: 'r_360a18d9520a47ba8f74803411d880d7', bytes: 641092, sha256: '7b0346a7c31c8f76cdf5689089ba2c130ebf160b5df74c78b0f6a49514c0a41b', review: S2_REVIEW, budget: 60000 },
  's2-hall-E': { piece: 'S2', kind: 'hall', hand: 'E', tier: 'full', pair: 's2-hall-E-far', author: 'sonnet-ff-hall', file: 's2-hall-E.glb', asset: 'a_20881fa191c9400e8253ee566f285583', revision: 'r_9240eafbf13942e4a6263b1012889b2d', bytes: 641092, sha256: '567561f70e74675a89185701468ef9ffa995cb3307b3661130ae2b6cd00b26c7', review: S2_REVIEW, budget: 60000 },
  's2-hall-W-far': { piece: 'S2', kind: 'hall', hand: 'W', tier: 'far', pair: 's2-hall-W', author: 'sonnet-ff-hall', file: 's2-hall-W-far.glb', asset: 'a_c6f2f32770a741e88e2adbd699c717bb', revision: 'r_47f890f3d7314130ade16990037c4519', bytes: 57480, sha256: '7eef9f8b6ffbba459d96bd5f3e6c1efc05425ad4148d68717ab26c198cf2ad35', review: S2_REVIEW, budget: 2000 },
  's2-hall-E-far': { piece: 'S2', kind: 'hall', hand: 'E', tier: 'far', pair: 's2-hall-E', author: 'sonnet-ff-hall', file: 's2-hall-E-far.glb', asset: 'a_3446d4140fb441929bafb1858ddfbc56', revision: 'r_d946a31fc6c041a8b3d6ca0e6006fb36', bytes: 57476, sha256: 'eeb5315c3d1806c3baf31fc7bb960dde0a0b3e13d8a17d123152ac73c5e8365f', review: S2_REVIEW, budget: 2000 },
  's3-link': { piece: 'S3', kind: 'link', hand: null, tier: 'full', pair: null, author: 'sonnet-ff-hall', file: 's3-link.glb', asset: 'a_f5fc41aa4c354116908f4b2cd26c4958', revision: 'r_b2f1a7eab1cc48fb8d2561914e8888d3', bytes: 72040, sha256: '246bbf1956c794d55720ff0ba53bd817e6cac3962dad44a3c7973bd470382a3c', review: S2_REVIEW, budget: 6000 },
  's5-split-bridge': { piece: 'S5', kind: 'bridge', hand: null, tier: 'full', pair: 's5-split-bridge-far', author: 'sonnet-ff-bridge', file: 's5-split-bridge.glb', asset: 's5-split-bridge', revision: 'r_8bbd9104498f4aad974d4f3cb29e810e', bytes: 356080, sha256: '1086e13f6306afe7b19fe1c520360cd37e80eda61894602060ff3a29b56a7083', review: S5_REVIEW, budget: 8000 },
  's5-split-bridge-far': { piece: 'S5', kind: 'bridge', hand: null, tier: 'far', pair: 's5-split-bridge', author: 'sonnet-ff-bridge', file: 's5-split-bridge-far.glb', asset: 's5-split-bridge-far', revision: 'r_51b50c962e754a098db9b438367ed1b1', bytes: 61004, sha256: '380887f36e9cde62d202b24244162186f35f74f71e1f99be39e809191dc81e30', review: S5_REVIEW, budget: 2000 },
};

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function structureSource(s: Pick<StructureSpec, 'author' | 'file'>): string { return resolve(AUTHORS_ROOT, s.author, 'outputs', s.file); }
export function structureLibrary(s: Pick<StructureSpec, 'author' | 'asset'>): string { return resolve(AUTHORS_ROOT, s.author, 'assets/kiln', s.asset); }

interface RevisionManifest { assetId?: string; revisionId: string; parentRevision?: string | null; name?: string; createdAt: string; files: Record<string, { sha256: string; bytes: number }> }
export interface Verified { bytes: Uint8Array; revision: string; parentRevision: string | null; createdAt: string; libraryName: string; revisions: number }

/** Verifies one structure (pins, newest revision, library bytes and manifest) and returns its bytes. Throws with the
 *  measured values on any difference, so a newer author revision is never staged unreviewed. */
export function verifyStructure(id: string, spec: StructureSpec = STRUCTURES[id]!): Verified {
  const path = structureSource(spec);
  if (!existsSync(path)) throw new Error(`${id}: ${path} is missing`);
  const bytes = new Uint8Array(readFileSync(path)), hash = sha256(bytes);
  if (bytes.length !== spec.bytes || hash !== spec.sha256) throw new Error(`${id}: ${path} is ${bytes.length} B, SHA-256 ${hash}; pinned ${spec.bytes} B, ${spec.sha256 || '(unset)'}`);
  const library = resolve(structureLibrary(spec), 'revisions');
  const manifests = readdirSync(library).map(r => JSON.parse(readFileSync(resolve(library, r, 'manifest.json'), 'utf8')) as RevisionManifest);
  const newest = [...manifests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0]!;
  if (newest.revisionId !== spec.revision) throw new Error(`${id}: the newest library revision is ${newest.revisionId} (${newest.createdAt}); pinned ${spec.revision}`);
  const glb = new Uint8Array(readFileSync(resolve(library, spec.revision, 'asset.glb'))), recorded = newest.files['asset.glb'];
  if (glb.length !== spec.bytes || sha256(glb) !== spec.sha256) throw new Error(`${id}: library ${spec.revision}/asset.glb is ${glb.length} B, ${sha256(glb)}; pinned ${spec.bytes} B, ${spec.sha256}`);
  if (!recorded || recorded.bytes !== spec.bytes || recorded.sha256 !== `sha256:${spec.sha256}`) throw new Error(`${id}: manifest ${spec.revision} records ${recorded?.bytes} B, ${recorded?.sha256}`);
  return { bytes, revision: newest.revisionId, parentRevision: newest.parentRevision ?? null, createdAt: newest.createdAt, libraryName: newest.name ?? '', revisions: manifests.length };
}

const r4 = (v: number) => { const x = Math.round(v * 10000) / 10000; return Object.is(x, -0) ? 0 : x; };
export const boxJson = (b: Box) => ({ min: b.min.map(r4), max: b.max.map(r4) });
const hex = (c: readonly number[] | undefined) => (c ? `#${c.slice(0, 3).map(v => Math.round(Math.min(1, Math.max(0, v)) ** (1 / 2.2) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}` : null);

export interface StructureMeasure {
  root: string; nodes: number; meshes: number; primitives: number; triangles: number;
  bounds: { min: number[]; max: number[] };
  /** Top-level parts (children of the root), in file order. */
  parts: string[];
  /** Leaf nodes without a mesh: name to position in the asset frame (the S2 bay locators are summarised in bayLocators). */
  locators: Record<string, number[]>;
  /** S2's `bay<nn>L<l>` locators against the contract's formula (36 + 72 (nn - 1), 8 or 30, 0): count and the largest deviation. */
  bayLocators?: { count: number; maxDeviationM: number; formula: string };
  /** Materials as exported: name, base colour (linear factors and an approximate sRGB hex), roughness, metalness,
   *  emissive factor. The scene uses the loaded materials unchanged. */
  materials: { name: string; baseColorFactor: number[]; approxHex: string | null; roughness: number; metalness: number; emissiveFactor: number[] }[];
  negativeScaleNodes: number; mirroredWorldNodes: number; textures: number; images: number; extensionsRequired: string[];
}

/** Facts read from one structure GLB. */
export function measureStructure(file: GlbFile, tree: SceneTree = sceneTree(file)): StructureMeasure {
  const world = worldMatrices(tree), box = emptyBox();
  let meshes = 0, primitives = 0, triangles = 0, negativeScaleNodes = 0, mirroredWorldNodes = 0;
  const locators: Record<string, number[]> = {};
  for (const n of tree.nodes) {
    if (n.s.some(v => v < 0)) negativeScaleNodes++;
    const m = world[n.index];
    if (m && det3(m) < 0) mirroredWorldNodes++;
    if (n.mesh !== null) {
      meshes++; primitives += file.json.meshes?.[n.mesh]?.primitives.length ?? 0; triangles += triangleCount(file, n.mesh);
      if (m) for (const tri of meshTriangles(file, n.mesh)) for (let v = 0; v < tri.count * 3; v++) growBox(box, transformPoint(m, tri.positions[v * 3]!, tri.positions[v * 3 + 1]!, tri.positions[v * 3 + 2]!));
    } else if (n.children.length === 0 && m) locators[n.name] = [r4(m[12]!), r4(m[13]!), r4(m[14]!)];
  }
  const bays = Object.keys(locators).filter(name => /^bay[0-9]{2}L[12]$/.test(name));
  let bayLocators: StructureMeasure['bayLocators'];
  if (bays.length) {
    let worst = 0;
    for (const name of bays) {
      const nn = Number(name.slice(3, 5)), level = Number(name.slice(6)), p = locators[name]!;
      worst = Math.max(worst, Math.hypot(p[0]! - (36 + 72 * (nn - 1)), p[1]! - (level === 1 ? 8 : 30), p[2]!));
      delete locators[name];
    }
    bayLocators = { count: bays.length, maxDeviationM: r4(worst), formula: 'bay<nn>L<l> at (36 + 72 (nn - 1), 8 or 30, 0) (contract, Interior locators)' };
  }
  const root = tree.nodes[tree.roots[0]!]!;
  return {
    root: root.name, nodes: tree.nodes.length, meshes, primitives, triangles, bounds: boxJson(box),
    parts: root.children.map(c => tree.nodes[c]!).filter(n => n.mesh !== null || n.children.length > 0).map(n => n.name),
    locators, ...(bayLocators ? { bayLocators } : {}),
    materials: (file.json.materials ?? []).map(m => ({
      name: m.name ?? '', baseColorFactor: (m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]).map(r4), approxHex: hex(m.pbrMetallicRoughness?.baseColorFactor),
      roughness: r4(m.pbrMetallicRoughness?.roughnessFactor ?? 1), metalness: r4(m.pbrMetallicRoughness?.metallicFactor ?? 1), emissiveFactor: (m.emissiveFactor ?? [0, 0, 0]).map(r4),
    })),
    negativeScaleNodes, mirroredWorldNodes,
    textures: ((file.json as { textures?: unknown[] }).textures ?? []).length, images: ((file.json as { images?: unknown[] }).images ?? []).length,
    extensionsRequired: file.json.extensionsRequired ?? [],
  };
}

/** Reads, verifies and parses one structure. */
export function loadStructure(id: string): { spec: StructureSpec; verified: Verified; file: GlbFile; tree: SceneTree } {
  const spec = STRUCTURES[id];
  if (!spec) throw new Error(`Unknown structure ${id}`);
  const verified = verifyStructure(id, spec), file = parseGlb(verified.bytes);
  return { spec, verified, file, tree: sceneTree(file) };
}

/** The asset map's `structures` section: every structure with its source, pins and measured facts. */
export function structuresSection(problems: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, spec] of Object.entries(STRUCTURES)) {
    let loaded: ReturnType<typeof loadStructure>;
    try { loaded = loadStructure(id); } catch (error) { problems.push(String(error)); continue; }
    const measured = measureStructure(loaded.file, loaded.tree);
    if (measured.triangles > spec.budget) problems.push(`${id}: ${measured.triangles} triangles exceed the contract budget ${spec.budget}`);
    if (measured.negativeScaleNodes || measured.mirroredWorldNodes) problems.push(`${id}: ${measured.negativeScaleNodes} negative scales, ${measured.mirroredWorldNodes} mirrored world matrices`);
    if (measured.textures || measured.images) problems.push(`${id}: carries ${measured.textures} textures and ${measured.images} images`);
    if (measured.extensionsRequired.length) problems.push(`${id}: requires ${measured.extensionsRequired.join(', ')}`);
    out[id] = {
      piece: spec.piece, kind: spec.kind, hand: spec.hand, tier: spec.tier, pair: spec.pair,
      glb: `models/structures/${spec.file}`,
      source: { author: spec.author, file: `outputs/${spec.file}`, asset: spec.asset, revision: spec.revision, parentRevision: loaded.verified.parentRevision, createdAt: loaded.verified.createdAt, libraryRevisions: loaded.verified.revisions, review: spec.review, hashFrom: 'the newest revision in the author\'s Kiln library (assets/kiln/<asset>/revisions/<revision>/asset.glb and its manifest), equal to the delivered output file' },
      pins: { bytes: spec.bytes, sha256: spec.sha256 }, budget: spec.budget,
      measured,
    };
  }
  return out;
}
