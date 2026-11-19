/**
 * Corpus gate (issue #417): rebuild every saved pack revision, and optionally the pinned
 * example archive, on one machine and compare GLB bytes with a baseline built on the same
 * machine. GLB bytes differ between Linux and Windows (see `glb-chunk-hashes.mjs`), so a
 * baseline is only meaningful against a candidate from the same platform.
 *
 *   bun scripts/corpus-gate.ts list [selection]
 *   bun scripts/corpus-gate.ts build --out tmp/corpus-gate/main.jsonl [selection] [run options]
 *   bun scripts/corpus-gate.ts compare BASELINE.jsonl CANDIDATE.jsonl [expectations] [--json FILE]
 *   bun scripts/corpus-gate.ts build --out CANDIDATE.jsonl --compare BASELINE.jsonl [...]
 *
 * Selection: --pack NAME (repeatable), --key PREFIX (repeatable), --no-archive.
 * Run options: --resume (skip keys already in --out), --jobs N (default 1),
 *   --deadline-ms N (default 120000, the evaluator maximum), --heap-mb N (default 4096).
 * Expectations: --expect PREFIX (repeatable) and --expect-file FILE (one prefix per line,
 *   `#` starts a comment). A change under an expected prefix is reported, not failed.
 *
 * Each pack revision is rebuilt as `kiln asset <id> <revision> --rebuild` would: its saved
 * exporter options (`savedRebuildRenderOptions`), its saved requirements and its locked
 * material closure, through the packaged Node evaluator worker (`dist/evaluator-worker.mjs`)
 * in a child process of its own. The repository does not hold material map PNGs, so maps are
 * regenerated from their saved procedural or atlas recipes and must reproduce the recorded
 * sha256 exactly; a map without a recipe makes that revision `materials-unavailable`.
 *
 * Output is JSON Lines: a header naming the platform, toolchain and engine build, then one
 * line per corpus entry, appended as each finishes, so an interrupted run resumes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CORPUS_GATE_VERSION = 'kiln.corpus-gate.v1';
/** CLI host defaults (`createLocalToolContext` with an empty environment) for programs without saved options. */
export const ARCHIVE_BUILD_OPTIONS = {
  indexPolicy: 'indexed',
  gltfExporter: 'legacy',
  optimize: 'off',
  instance: 'auto',
  geometryPolicy: 'warn',
} as const;

export type EntryKind = 'pack-revision' | 'pack-snapshot' | 'archive';
export interface CorpusEntry {
  key: string;
  pack: string;
  kind: EntryKind;
  sourcePath: string;
  manifestPath?: string;
  /** Saved embedded material payload beside a pack snapshot (`*.materials.kiln.json`). */
  materialsPath?: string;
}
export interface Selection {
  packs?: string[];
  keys?: string[];
  archive?: boolean;
}
export interface GlbSummary {
  sha256: string;
  bytes: number;
  json: { sha256: string; bytes: number; sections: Record<string, string> };
  bin: { sha256: string; bytes: number; parts: Record<string, string> } | null;
}
export interface EntryResult {
  key: string;
  pack: string;
  kind: EntryKind;
  name?: string;
  assetId?: string;
  revisionId?: string;
  sourceSha256: string;
  status: 'built' | 'failed';
  error?: { code: string; message: string };
  glb?: GlbSummary;
  tris?: number;
  drawCalls?: number;
  materials?: number;
  textures?: number;
  bounds?: { min: number[]; max: number[] };
  manifestGlbSha256?: string;
  matchesManifest?: boolean;
  ms: number;
  workerMaxRssKb?: number;
}
export interface RunHeader {
  kind: typeof CORPUS_GATE_VERSION;
  platform: string;
  arch: string;
  cpu: string;
  bun: string;
  node: string;
  sharp: string;
  engine: { commit: string; dirty: boolean; identity: string };
  selection: Selection;
  controls: { deadlineMs: number; heapMb: number };
  startedAt: string;
}

const sha256 = (bytes: Uint8Array | string) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const round = (values: readonly number[]) => values.map((v) => Math.round(v * 1e6) / 1e6);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}
const posix = (path: string) => path.split(sep).join('/');

export function selected(key: string, pack: string, selection: Selection): boolean {
  if (selection.packs?.length && !selection.packs.includes(pack)) return false;
  if (selection.keys?.length && !selection.keys.some((prefix) => key.startsWith(prefix)))
    return false;
  return true;
}

/**
 * Every saved pack source: `packs/<pack>/sources/<collection>/<asset>/<revision>/source.kiln.js`
 * with its manifest, plus flat pack snapshots (`packs/<pack>/assets/<slug>.kiln.js` beside a
 * `.manifest.json`), plus, when `archiveRoot` is given, the archive's `examples/` and
 * `site/examples/` programs (its `history/` included). Order is stable: by key.
 */
export function listCorpus(
  root: string,
  selection: Selection = {},
  archiveRoot?: string,
): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const packsDir = join(root, 'packs');
  const packs = existsSync(packsDir)
    ? readdirSync(packsDir).filter((name) => statSync(join(packsDir, name)).isDirectory())
    : [];
  for (const pack of packs.sort()) {
    for (const file of walk(join(packsDir, pack, 'sources'))) {
      if (!file.endsWith(`${sep}source.kiln.js`)) continue;
      const manifestPath = join(dirname(file), 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      const rel = posix(relative(join(packsDir, pack, 'sources'), dirname(file)));
      entries.push({
        key: `${pack}/${rel}`,
        pack,
        kind: 'pack-revision',
        sourcePath: file,
        manifestPath,
      });
    }
    const assetsDir = join(packsDir, pack, 'assets');
    for (const file of walk(assetsDir)) {
      if (!file.endsWith('.kiln.js') || dirname(file) !== assetsDir) continue;
      const stem = file.slice(0, -'.kiln.js'.length);
      const manifestPath = `${stem}.manifest.json`;
      if (!existsSync(manifestPath)) continue;
      const materialsPath = `${stem}.materials.kiln.json`;
      entries.push({
        key: `${pack}/assets/${posix(relative(assetsDir, stem))}`,
        pack,
        kind: 'pack-snapshot',
        sourcePath: file,
        manifestPath,
        ...(existsSync(materialsPath) ? { materialsPath } : {}),
      });
    }
  }
  if (archiveRoot && selection.archive !== false) {
    for (const [dir, prefix] of [
      [join(archiveRoot, 'examples'), 'archive/examples'],
      [join(archiveRoot, 'site', 'examples'), 'archive/site'],
    ] as const)
      for (const file of walk(dir))
        if (file.endsWith('.kiln.js'))
          entries.push({
            key: `${prefix}/${posix(relative(dir, file)).slice(0, -'.kiln.js'.length)}`,
            pack: 'archive',
            kind: 'archive',
            sourcePath: file,
          });
  }
  return entries
    .filter((entry) => selected(entry.key, entry.pack, selection))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The GLB's bytes split the way a change needs explaining: the JSON chunk by top-level glTF
 * section, and the BIN chunk into image bytes and everything else (geometry and animation).
 */
export function summarizeGlb(glb: Uint8Array): GlbSummary {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (glb.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB');
  let offset = 12;
  let json: Uint8Array | undefined;
  let bin: Uint8Array | undefined;
  while (offset + 8 <= glb.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const bytes = glb.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json ??= bytes;
    else if (type === 0x004e4942) bin ??= bytes;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  const document = JSON.parse(new TextDecoder().decode(json)) as Record<string, unknown>;
  const sections: Record<string, string> = {};
  for (const name of Object.keys(document).sort())
    sections[name] = sha256(JSON.stringify(document[name]));
  let binSummary: GlbSummary['bin'] = null;
  if (bin) {
    const views = (document.bufferViews ?? []) as { byteOffset?: number; byteLength: number }[];
    const imageViews = new Set(
      ((document.images ?? []) as { bufferView?: number }[])
        .map((image) => image.bufferView)
        .filter((index): index is number => index !== undefined),
    );
    const hashers = { images: createHash('sha256'), geometry: createHash('sha256') };
    views.forEach((bufferView, index) => {
      const start = bufferView.byteOffset ?? 0;
      (imageViews.has(index) ? hashers.images : hashers.geometry).update(
        bin.subarray(start, start + bufferView.byteLength),
      );
    });
    binSummary = {
      sha256: sha256(bin),
      bytes: bin.byteLength,
      parts: {
        geometry: `sha256:${hashers.geometry.digest('hex')}`,
        images: `sha256:${hashers.images.digest('hex')}`,
      },
    };
  }
  return {
    sha256: sha256(glb),
    bytes: glb.byteLength,
    json: { sha256: sha256(json), bytes: json.byteLength, sections },
    bin: binSummary,
  };
}

// ---------------------------------------------------------------------------------------------
// Materials: the locked closure, with map bytes regenerated from their saved recipes.

type Json = Record<string, unknown>;
type MaterialManifestJson = Json & {
  materialId: string;
  revisionId: string;
  schemaVersion: number;
  maps: Json[];
  dependencies?: { resourceId: string; revisionId: string }[];
};

/** Every material manifest under `packs/*\/materials`, by identity. Identities are content hashes. */
export function indexPackMaterials(root: string): Map<string, MaterialManifestJson> {
  const index = new Map<string, MaterialManifestJson>();
  const packsDir = join(root, 'packs');
  if (!existsSync(packsDir)) return index;
  for (const pack of readdirSync(packsDir))
    for (const file of walk(join(packsDir, pack, 'materials')))
      if (file.endsWith(`${sep}manifest.json`)) {
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as MaterialManifestJson;
        index.set(`${manifest.materialId}/${manifest.revisionId}`, manifest);
      }
  return index;
}

/** The draft that `createMaterialRecordV1/V2` turns back into this manifest's map files. */
export function materialDraftFromManifest(manifest: MaterialManifestJson): Json {
  const optional = (key: string) => (manifest[key] !== undefined ? { [key]: manifest[key] } : {});
  const common = (map: Json) => ({
    slot: map.slot,
    sourceId: map.sourceId,
    transforms: map.transforms,
    ...(map.normalConvention !== undefined ? { normalConvention: map.normalConvention } : {}),
    ...(map.channelPacking !== undefined ? { channelPacking: map.channelPacking } : {}),
  });
  const unavailable = (map: Json) =>
    new MaterialsUnavailableError(
      `Material ${manifest.materialId} map ${String(map.slot)} has no saved recipe; its PNG is not in the repository.`,
    );
  const base = {
    materialId: manifest.materialId,
    ...optional('parentRevision'),
    name: manifest.name,
    tags: manifest.tags,
    tileable: manifest.tileable,
    ...optional('physicalSizeMeters'),
    parameters: manifest.parameters,
    sources: manifest.sources,
  };
  if (manifest.schemaVersion === 1)
    return {
      ...base,
      maps: manifest.maps.map((map) => {
        const procedural = map.procedural as { spec: unknown; derive?: unknown } | undefined;
        if (!procedural) throw unavailable(map);
        return {
          ...common(map),
          procedural: procedural.spec,
          ...(procedural.derive ? { derive: procedural.derive } : {}),
        };
      }),
    };
  return {
    schemaVersion: 2,
    ...base,
    maps: manifest.maps.map((map) => {
      const recipe = map.recipe as { kind: string; spec: unknown; derive?: unknown } | undefined;
      if (recipe?.kind === 'procedural')
        return {
          ...common(map),
          sampler: map.sampler,
          procedural: recipe.spec,
          ...(recipe.derive ? { derive: recipe.derive } : {}),
        };
      if (recipe?.kind === 'atlas')
        return { ...common(map), sampler: map.sampler, atlas: recipe.spec };
      throw unavailable(map);
    }),
  };
}

export class MaterialsUnavailableError extends Error {
  readonly code = 'MATERIALS_UNAVAILABLE';
}

type MaterialRecordLike = { manifest: MaterialManifestJson; files: Record<string, Uint8Array> };

/**
 * A read-only material library over the pack material index that regenerates each record's map
 * bytes from its recipe, accepting them only when every map reproduces its recorded sha256.
 * Regenerated records are cached for the run: identities are content hashes.
 */
export function createRegeneratingMaterialLibrary(
  index: Map<string, MaterialManifestJson>,
  engine: {
    createMaterialRecordV1(draft: never): Promise<{ files: Record<string, Uint8Array> }>;
    createMaterialRecordV2(
      draft: unknown,
      options?: { materials?: readonly never[] },
    ): Promise<{ files: Record<string, Uint8Array> }>;
  },
) {
  const records = new Map<string, Promise<MaterialRecordLike>>();
  const known = new Map(index);
  const regenerate = (manifest: MaterialManifestJson): Promise<MaterialRecordLike> => {
    const id = `${manifest.materialId}/${manifest.revisionId}`;
    known.set(id, manifest);
    let pending = records.get(id);
    if (!pending) {
      pending = (async () => {
        const closure: MaterialRecordLike[] = [];
        for (const pin of manifest.dependencies ?? []) {
          const dependency = known.get(`${pin.resourceId}/${pin.revisionId}`);
          if (!dependency)
            throw new MaterialsUnavailableError(
              `Material ${manifest.materialId} depends on ${pin.resourceId} at ${pin.revisionId}, which no pack holds.`,
            );
          closure.push(await regenerate(dependency));
        }
        const draft = materialDraftFromManifest(manifest);
        const made =
          manifest.schemaVersion === 1
            ? await engine.createMaterialRecordV1(draft as never)
            : await engine.createMaterialRecordV2(draft, { materials: closure as never[] });
        for (const map of manifest.maps) {
          const bytes = made.files[String(map.file)];
          if (!bytes || sha256(bytes) !== map.sha256)
            throw new MaterialsUnavailableError(
              `Material ${manifest.materialId} map ${String(map.slot)} does not regenerate to its recorded bytes.`,
            );
        }
        return { manifest, files: made.files };
      })();
      records.set(id, pending);
    }
    return pending;
  };
  const manifestOf = (materialId: string, revisionId: string) => {
    const manifest = known.get(`${materialId}/${revisionId}`);
    if (!manifest)
      throw new MaterialsUnavailableError(`Material ${materialId} at ${revisionId} is in no pack.`);
    return manifest;
  };
  return {
    /** Roots come from the asset manifest; register them so their pins resolve. */
    remember(manifests: readonly MaterialManifestJson[]) {
      for (const manifest of manifests)
        known.set(`${manifest.materialId}/${manifest.revisionId}`, manifest);
    },
    list: async () => [...known.values()],
    readManifest: async (materialId: string, revisionId: string) =>
      manifestOf(materialId, revisionId),
    readRecordFiles: (materialId: string, revisionId: string) =>
      regenerate(manifestOf(materialId, revisionId)),
    read: (materialId: string, revisionId: string) =>
      regenerate(manifestOf(materialId, revisionId)),
    import: async () => {
      throw new Error('The corpus gate material library is read-only.');
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Building one entry.

export interface BuildControls {
  deadlineMs: number;
  heapMb: number;
}

export async function engineModules() {
  const [subprocess, protocol, rebuild, assets, materials, materialsNode, requirements] =
    await Promise.all([
      import('../src/evaluator/subprocess'),
      import('../src/evaluator/protocol'),
      import('../src/rebuild-options'),
      import('../src/assets'),
      import('../src/asset-materials-node'),
      import('../src/material-library-node'),
      import('../src/requirements-assets'),
    ]);
  return { subprocess, protocol, rebuild, assets, materials, materialsNode, requirements };
}
type Engine = Awaited<ReturnType<typeof engineModules>>;

function errorOf(error: unknown): { code: string; message: string } {
  const code =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'ERROR';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message: message.split(REPO).join('<repo>') };
}

export async function buildEntry(
  entry: CorpusEntry,
  context: {
    engine: Engine;
    library: ReturnType<typeof createRegeneratingMaterialLibrary>;
    payloads: Map<string, Promise<unknown>>;
    controls: BuildControls;
    scratch: string;
  },
): Promise<EntryResult> {
  const { engine, library, payloads, controls, scratch } = context;
  const started = performance.now();
  const sourceBytes = await readFile(entry.sourcePath);
  const base = {
    key: entry.key,
    pack: entry.pack,
    kind: entry.kind,
    sourceSha256: sha256(sourceBytes),
  };
  const manifest = entry.manifestPath
    ? (JSON.parse(await readFile(entry.manifestPath, 'utf8')) as Json & {
        name?: string;
        assetId?: string;
        revisionId?: string;
        files?: Record<string, { sha256: string }>;
        build?: { options?: unknown };
      })
    : undefined;
  const identity = manifest
    ? {
        name: manifest.name,
        assetId: manifest.assetId,
        revisionId: manifest.revisionId,
        manifestGlbSha256: manifest.files?.['asset.glb']?.sha256,
      }
    : {};
  const rssFile = join(scratch, `${createHash('sha256').update(entry.key).digest('hex')}.rss`);
  try {
    const code = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes);
    let options: Record<string, unknown> = { ...ARCHIVE_BUILD_OPTIONS };
    if (manifest) {
      if (manifest.files?.['source.kiln.js']?.sha256 !== base.sourceSha256)
        throw Object.assign(new Error('Saved source does not match its manifest hash.'), {
          code: 'SOURCE_MISMATCH',
        });
      const record = {
        manifest: manifest as never,
        files: {},
        ...(entry.materialsPath
          ? { materialResources: JSON.parse(await readFile(entry.materialsPath, 'utf8')) }
          : {}),
      };
      const roots = engine.assets.assetMaterialRootManifests(record);
      library.remember(roots as unknown as MaterialManifestJson[]);
      let materialResources: unknown;
      if (roots.length || entry.materialsPath) {
        const cacheKey = entry.materialsPath
          ? `payload:${sha256(await readFile(entry.materialsPath))}`
          : roots
              .map((root) => `${root.materialId}/${root.revisionId}`)
              .sort()
              .join('|');
        let pending = payloads.get(cacheKey);
        if (!pending) {
          pending = engine.materials
            .resolveSavedAssetMaterials(record, library as never)
            .then((records) => engine.materialsNode.createMaterialLibraryPayload(records));
          payloads.set(cacheKey, pending);
        }
        try {
          materialResources = await pending;
        } catch (error) {
          if (error instanceof MaterialsUnavailableError) throw error;
          const cause = (error as { cause?: unknown }).cause;
          if (cause instanceof MaterialsUnavailableError) throw cause;
          throw error;
        }
      }
      // A neutral receipt is the default context; a bound one is supplied as the host binding,
      // as `kiln asset --rebuild --requirements` would with the saved binding.
      const { binding } = engine.requirements.savedRequirements(manifest as never);
      options = {
        indexPolicy: ARCHIVE_BUILD_OPTIONS.indexPolicy,
        ...engine.rebuild.savedRebuildRenderOptions(manifest.build?.options),
        ...(materialResources ? { materialResources } : {}),
        ...(binding ? { requirements: binding } : {}),
      };
    }
    const worker = join(REPO, 'dist', 'evaluator-worker.mjs');
    const rendered = await engine.subprocess.renderGLBViaProcessLaunch(
      code,
      options as never,
      {
        deadlineMs: controls.deadlineMs,
        maxGlbBytes: engine.protocol.MAX_EVALUATOR_GLB_BYTES,
        maxResponseBytes: engine.protocol.MAX_EVALUATOR_RESPONSE_BYTES,
      },
      {
        command: process.env.KILN_CORPUS_GATE_NODE ?? 'node',
        args: [
          `--max-old-space-size=${controls.heapMb}`,
          '--require',
          join(REPO, 'scripts', 'corpus-gate-rss.cjs'),
          worker,
        ],
        env: {
          ...engine.subprocess.sanitizedEvaluatorEnv(),
          KILN_RENDER: 'cpu',
          KILN_CORPUS_GATE_RSS_FILE: rssFile,
        },
        workerFile: worker,
      },
    );
    const glb = new Uint8Array(
      rendered.glb.buffer,
      rendered.glb.byteOffset,
      rendered.glb.byteLength,
    );
    const summary = summarizeGlb(glb);
    const integration = rendered.integrationManifest;
    return {
      ...base,
      ...identity,
      status: 'built',
      glb: summary,
      tris: rendered.tris,
      drawCalls: integration?.renderMetrics?.drawCalls,
      materials: integration?.renderMetrics?.uniqueMaterials,
      textures: integration?.renderMetrics?.textureCount,
      ...(integration?.bounds
        ? { bounds: { min: round(integration.bounds.min), max: round(integration.bounds.max) } }
        : {}),
      ...(identity.manifestGlbSha256
        ? { matchesManifest: identity.manifestGlbSha256 === summary.sha256 }
        : {}),
      ms: Math.round(performance.now() - started),
      ...(await workerRss(rssFile)),
    };
  } catch (error) {
    return {
      ...base,
      ...identity,
      status: 'failed',
      error: errorOf(error),
      ms: Math.round(performance.now() - started),
      ...(await workerRss(rssFile)),
    };
  }
}

async function workerRss(file: string): Promise<{ workerMaxRssKb?: number }> {
  try {
    const value = Number(await readFile(file, 'utf8'));
    await rm(file, { force: true });
    return Number.isFinite(value) && value > 0 ? { workerMaxRssKb: value } : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------------------------
// Run files and comparison.

export function readRun(text: string): { header: RunHeader; results: Map<string, EntryResult> } {
  const lines = text.split('\n').filter((line) => line.trim());
  const header = JSON.parse(lines[0] ?? 'null') as RunHeader | null;
  if (header?.kind !== CORPUS_GATE_VERSION) throw new Error('Not a corpus gate run file.');
  const results = new Map<string, EntryResult>();
  for (const line of lines.slice(1)) {
    const result = JSON.parse(line) as EntryResult;
    results.set(result.key, result); // A rerun key replaces the earlier line.
  }
  return { header, results };
}

export function expectationMatcher(prefixes: readonly string[]) {
  return (key: string) => prefixes.some((prefix) => key === prefix || key.startsWith(prefix));
}

export function parseExpectFile(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
}

export interface Change {
  key: string;
  pack: string;
  expected: boolean;
  kind: 'output' | 'failure' | 'built-now' | 'fails-now' | 'missing';
  json?: string[];
  bin?: string[];
  bytes?: [number | undefined, number | undefined];
  tris?: [number | undefined, number | undefined];
  bounds?: { baseline?: EntryResult['bounds']; candidate?: EntryResult['bounds'] };
  errors?: [EntryResult['error'], EntryResult['error']];
}
export interface Comparison {
  /**
   * Run environment that differs, such as `node v22.23.4 vs v24.20.0`. Bytes are comparable only
   * when this is empty: the platform, the architecture and the evaluator's Node each move GLB
   * bytes on their own (three.js converts every material colour with `Math.pow`).
   */
  mismatch: string[];
  compared: number;
  identical: number;
  identicalFailures: number;
  changes: Change[];
  unexpected: number;
  expectedUnchanged: string[];
  added: string[];
}

function sameFailure(a: EntryResult, b: EntryResult) {
  return a.error?.code === b.error?.code && a.error?.message === b.error?.message;
}
function sameBounds(a?: EntryResult['bounds'], b?: EntryResult['bounds']) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Exact comparison: an entry is unchanged when both runs built it to the same sha256, or both
 * failed with the same code and message. Only entries the candidate's selection covers are
 * compared; a baseline entry missing from that scope is a change.
 */
export function compareRuns(
  baseline: { header: RunHeader; results: Map<string, EntryResult> },
  candidate: { header: RunHeader; results: Map<string, EntryResult> },
  expectedPrefixes: readonly string[] = [],
): Comparison {
  const isExpected = expectationMatcher(expectedPrefixes);
  const changes: Change[] = [];
  let identical = 0;
  let identicalFailures = 0;
  const expectedUnchanged: string[] = [];
  const scope = candidate.header.selection;
  for (const [key, before] of [...baseline.results].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!selected(key, before.pack, scope)) continue;
    if (before.kind === 'archive' && scope.archive === false) continue;
    const after = candidate.results.get(key);
    const expected = isExpected(key);
    const change = (fields: Omit<Change, 'key' | 'pack' | 'expected'>) =>
      changes.push({ key, pack: before.pack, expected, ...fields });
    if (!after) {
      change({ kind: 'missing' });
      continue;
    }
    if (before.status === 'built' && after.status === 'built') {
      if (before.glb?.sha256 === after.glb?.sha256) {
        identical++;
        if (expected) expectedUnchanged.push(key);
        continue;
      }
      const a = before.glb!;
      const b = after.glb!;
      const json = [...new Set([...Object.keys(a.json.sections), ...Object.keys(b.json.sections)])]
        .sort()
        .filter((name) => a.json.sections[name] !== b.json.sections[name]);
      const bin =
        a.bin?.sha256 === b.bin?.sha256
          ? []
          : ['geometry', 'images'].filter((part) => a.bin?.parts[part] !== b.bin?.parts[part]);
      change({
        kind: 'output',
        json,
        bin,
        bytes: [a.bytes, b.bytes],
        tris: [before.tris, after.tris],
        ...(sameBounds(before.bounds, after.bounds)
          ? {}
          : { bounds: { baseline: before.bounds, candidate: after.bounds } }),
      });
    } else if (before.status === 'failed' && after.status === 'failed') {
      if (sameFailure(before, after)) {
        identicalFailures++;
        if (expected) expectedUnchanged.push(key);
      } else change({ kind: 'failure', errors: [before.error, after.error] });
    } else if (before.status === 'failed')
      change({
        kind: 'built-now',
        errors: [before.error, undefined],
        tris: [undefined, after.tris],
      });
    else
      change({
        kind: 'fails-now',
        errors: [undefined, after.error],
        tris: [before.tris, undefined],
      });
  }
  const added = [...candidate.results.keys()].filter((key) => !baseline.results.has(key)).sort();
  return {
    mismatch: (['platform', 'arch', 'node'] as const)
      .filter((field) => baseline.header[field] !== candidate.header[field])
      .map((field) => `${field} ${baseline.header[field]} vs ${candidate.header[field]}`),
    compared: identical + identicalFailures + changes.length,
    identical,
    identicalFailures,
    changes,
    unexpected: changes.filter((change) => !change.expected).length,
    expectedUnchanged,
    added,
  };
}

function describe(change: Change): string {
  const parts: string[] = [];
  if (change.kind === 'output') {
    if (change.json?.length) parts.push(`JSON ${change.json.join(', ')}`);
    if (change.bin?.length) parts.push(`BIN ${change.bin.join(', ')}`);
    parts.push(`bytes ${change.bytes?.[0]} -> ${change.bytes?.[1]}`);
    parts.push(
      change.tris?.[0] === change.tris?.[1]
        ? `tris ${change.tris?.[0]}`
        : `tris ${change.tris?.[0]} -> ${change.tris?.[1]}`,
    );
    if (change.bounds)
      parts.push(
        `bounds ${JSON.stringify(change.bounds.baseline)} -> ${JSON.stringify(change.bounds.candidate)}`,
      );
  } else if (change.kind === 'missing') parts.push('not built by the candidate');
  else if (change.kind === 'built-now') parts.push(`now builds (was ${change.errors?.[0]?.code})`);
  else if (change.kind === 'fails-now')
    parts.push(`now fails: ${change.errors?.[1]?.code} ${change.errors?.[1]?.message}`);
  else
    parts.push(
      `failure changed: ${change.errors?.[0]?.code} -> ${change.errors?.[1]?.code} ${change.errors?.[1]?.message}`,
    );
  return `${change.kind}: ${parts.join('; ')}`;
}

export function formatComparison(comparison: Comparison): string {
  const lines: string[] = [];
  if (comparison.mismatch.length)
    lines.push(
      `Baseline and candidate ran in different environments (${comparison.mismatch.join(', ')}): bytes are not comparable.`,
    );
  lines.push(
    `${comparison.compared} compared: ${comparison.identical} identical, ${comparison.identicalFailures} identical failures, ${comparison.changes.length} changed (${comparison.unexpected} unexpected).`,
  );
  const byPack = new Map<string, Change[]>();
  for (const change of comparison.changes)
    byPack.set(change.pack, [...(byPack.get(change.pack) ?? []), change]);
  for (const [pack, changes] of [...byPack].sort(([a], [b]) => (a < b ? -1 : 1))) {
    lines.push('', `${pack} (${changes.length})`);
    for (const change of changes)
      lines.push(
        `  ${change.expected ? 'expected  ' : 'UNEXPECTED'} ${change.key}`,
        `    ${describe(change)}`,
      );
  }
  if (comparison.expectedUnchanged.length)
    lines.push('', `Expected to change but identical: ${comparison.expectedUnchanged.join(', ')}`);
  if (comparison.added.length)
    lines.push(
      '',
      `Not in the baseline (${comparison.added.length}): ${comparison.added.join(', ')}`,
    );
  return lines.join('\n');
}

export function summarizeRun(results: Iterable<EntryResult>) {
  const all = [...results];
  const failures = new Map<string, number>();
  for (const result of all)
    if (result.status === 'failed')
      failures.set(result.error!.code, (failures.get(result.error!.code) ?? 0) + 1);
  const withManifest = all.filter((result) => result.matchesManifest !== undefined);
  return {
    entries: all.length,
    built: all.filter((result) => result.status === 'built').length,
    failed: all.filter((result) => result.status === 'failed').length,
    failures: Object.fromEntries([...failures].sort()),
    matchesManifest: withManifest.filter((result) => result.matchesManifest).length,
    withManifestHash: withManifest.length,
    buildMs: all.reduce((sum, result) => sum + result.ms, 0),
    workerMaxRssMb: Math.round(
      Math.max(0, ...all.map((result) => result.workerMaxRssKb ?? 0)) / 1024,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Command line.

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', windowsHide: true }).trim();
}

/**
 * A build on another Node than `toolchain.json` pins still measures a change, but only against
 * runs on that same Node; say so, so a baseline is not shared by mistake.
 */
export function nodePinNote(evaluatorNode: string, pinnedNode: string): string | undefined {
  if (evaluatorNode === `v${pinnedNode}`) return undefined;
  return `The evaluator runs Node ${evaluatorNode}, not the toolchain pin ${pinnedNode}: this run compares only with runs on Node ${evaluatorNode}. Set KILN_CORPUS_GATE_NODE to a Node ${pinnedNode} executable to match other maintainers' runs.`;
}

async function header(selection: Selection, controls: BuildControls): Promise<RunHeader> {
  const { runtimeBuildProblem } = await import('./check-runtime-build.mjs');
  const problem = await runtimeBuildProblem(REPO);
  if (problem) throw new Error(`${problem} Run: bun run build:runtime`);
  const { runtimeBuildIdentity } = await import('./build-runtime.mjs');
  const node = (process.env.KILN_CORPUS_GATE_NODE ?? 'node') as string;
  const sharp = (await import('sharp')).default;
  return {
    kind: CORPUS_GATE_VERSION,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model.trim() ?? 'unknown',
    bun: process.versions.bun ?? 'none',
    node: execFileSync(node, ['--version'], { encoding: 'utf8', windowsHide: true }).trim(),
    sharp: sharp.versions.sharp ?? 'unknown',
    engine: {
      commit: git('rev-parse', 'HEAD'),
      dirty:
        git(
          'status',
          '--porcelain',
          '--untracked-files=no',
          '--',
          'src',
          'bun.lock',
          'package.json',
        ) !== '',
      identity: (await runtimeBuildIdentity(REPO)).identity,
    },
    selection,
    controls,
    // Run metadata only; never an input to a build or a comparison.
    startedAt: new Date().toISOString(),
  };
}

function archiveRoot(): string | undefined {
  const root = join(REPO, '.cache', 'example-archive');
  if (!existsSync(root)) return undefined;
  const revisions = readdirSync(root).filter((name) => /^[a-f0-9]{40}$/.test(name));
  return revisions.length === 1 ? join(root, revisions[0]!) : undefined;
}

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string[]>;
}
function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const boolean = new Set(['--resume', '--no-archive']);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith('--')) positional.push(arg);
    else if (boolean.has(arg)) flags.set(arg, ['true']);
    else {
      const value = rest[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      flags.set(arg, [...(flags.get(arg) ?? []), value]);
    }
  }
  return { command, positional, flags };
}
const one = (args: Args, name: string) => args.flags.get(name)?.at(-1);
const integerFlag = (args: Args, name: string, fallback: number, min: number, max: number) => {
  const raw = one(args, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
};
function selectionOf(args: Args): Selection {
  return {
    ...(args.flags.get('--pack') ? { packs: args.flags.get('--pack') } : {}),
    ...(args.flags.get('--key') ? { keys: args.flags.get('--key') } : {}),
    ...(args.flags.has('--no-archive') ? { archive: false } : {}),
  };
}
async function expectations(args: Args): Promise<string[]> {
  const prefixes = [...(args.flags.get('--expect') ?? [])];
  for (const file of args.flags.get('--expect-file') ?? [])
    prefixes.push(...parseExpectFile(await readFile(file, 'utf8')));
  return prefixes;
}

async function runCompare(baselinePath: string, candidatePath: string, args: Args) {
  const baseline = readRun(await readFile(baselinePath, 'utf8'));
  const candidate = readRun(await readFile(candidatePath, 'utf8'));
  const comparison = compareRuns(baseline, candidate, await expectations(args));
  console.log(
    `baseline  ${baseline.header.engine.commit.slice(0, 12)} ${baseline.header.engine.identity.slice(0, 19)} ${baseline.header.platform}`,
  );
  console.log(
    `candidate ${candidate.header.engine.commit.slice(0, 12)} ${candidate.header.engine.identity.slice(0, 19)} ${candidate.header.platform}`,
  );
  console.log(formatComparison(comparison));
  const json = one(args, '--json');
  if (json) await writeFile(json, `${JSON.stringify(comparison, null, 2)}\n`);
  if (comparison.mismatch.length) return 2;
  return comparison.unexpected ? 1 : 0;
}

async function runBuild(args: Args): Promise<number> {
  const out = one(args, '--out');
  if (!out) throw new Error('build needs --out FILE');
  const selection = selectionOf(args);
  const controls = {
    deadlineMs: integerFlag(args, '--deadline-ms', 120_000, 1, 120_000),
    heapMb: integerFlag(args, '--heap-mb', 4096, 64, 16_384),
  };
  const jobs = integerFlag(args, '--jobs', 1, 1, 32);
  const head = await header(selection, controls);
  const pinned = JSON.parse(await readFile(join(REPO, 'toolchain.json'), 'utf8')).node as string;
  const note = nodePinNote(head.node, pinned);
  if (note) console.warn(note);
  const archive = archiveRoot();
  if (selection.archive !== false && !archive)
    console.warn(
      'Example archive not prepared (node scripts/example-archive.mjs --fetch); building packs only.',
    );
  const entries = listCorpus(REPO, selection, archive);
  let done = new Map<string, EntryResult>();
  if (existsSync(out)) {
    if (!args.flags.has('--resume'))
      throw new Error(`${out} exists; pass --resume to continue it or choose another --out.`);
    const previous = readRun(await readFile(out, 'utf8'));
    for (const field of ['platform', 'arch', 'node'] as const)
      if (previous.header[field] !== head[field])
        throw new Error(`Cannot resume: ${field} differs from the run being resumed.`);
    if (previous.header.engine.identity !== head.engine.identity)
      throw new Error('Cannot resume: the engine build differs from the run being resumed.');
    if (JSON.stringify(previous.header.controls) !== JSON.stringify(head.controls))
      throw new Error(
        'Cannot resume: --deadline-ms or --heap-mb differs from the run being resumed.',
      );
    done = previous.results;
  } else {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(out, `${JSON.stringify(head)}\n`);
  }
  const todo = entries.filter((entry) => !done.has(entry.key));
  console.log(
    `${entries.length} entries selected, ${entries.length - todo.length} already in ${out}, ${todo.length} to build (${jobs} at a time).`,
  );
  const engine = await engineModules();
  const library = createRegeneratingMaterialLibrary(indexPackMaterials(REPO), engine.materialsNode);
  const payloads = new Map<string, Promise<unknown>>();
  const scratch = await mkdtemp(join(tmpdir(), 'kiln-corpus-gate-'));
  const started = performance.now();
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < todo.length) {
      const entry = todo[next++]!;
      const result = await buildEntry(entry, { engine, library, payloads, controls, scratch });
      done.set(entry.key, result);
      await appendFile(out, `${JSON.stringify(result)}\n`);
      finished++;
      const status =
        result.status === 'built'
          ? `${result.tris} tris${result.matchesManifest === false ? ', differs from manifest' : ''}`
          : `FAILED ${result.error?.code}: ${result.error?.message.slice(0, 160)}`;
      console.log(`[${finished}/${todo.length}] ${entry.key} ${result.ms} ms, ${status}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const summary = summarizeRun(entries.map((entry) => done.get(entry.key)!).filter(Boolean));
  const usage = process.resourceUsage?.();
  console.log(
    JSON.stringify(
      {
        ...summary,
        wallMs: Math.round(performance.now() - started),
        hostMaxRssMb: usage ? Math.round(usage.maxRSS / 1024) : undefined,
      },
      null,
      2,
    ),
  );
  const baseline = one(args, '--compare');
  return baseline ? runCompare(baseline, out, args) : 0;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === 'list') {
    const selection = selectionOf(args);
    const entries = listCorpus(REPO, selection, archiveRoot());
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.pack, (counts.get(entry.pack) ?? 0) + 1);
    for (const [pack, count] of [...counts].sort()) console.log(`${pack.padEnd(24)} ${count}`);
    console.log(`${'total'.padEnd(24)} ${entries.length}`);
    return 0;
  }
  if (args.command === 'build') return runBuild(args);
  if (args.command === 'compare') {
    const [baseline, candidate] = args.positional;
    if (!baseline || !candidate) throw new Error('compare needs BASELINE and CANDIDATE files');
    return runCompare(baseline, candidate, args);
  }
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  return args.command === 'help' ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
