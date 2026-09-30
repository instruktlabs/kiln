/** Explicit host policy replacement for legacy revisions; never a normal-runtime fallback. */
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { assetIdSchema } from './assets';
import { localAssetLibrary, verifyAssetRecord } from './assets-node';
import { migrateAssetManifestV1ToRequirements } from './contracts/requirements-migration';
import { readHostRequirementsFile } from './requirements-file';
import { resolveRequirementsContext } from './requirements-context';
import { buildProgramAssetDraft, type KilnToolContext } from './tools/registry';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';

const USAGE = `kiln migrate rebuild <asset-id> <revision-id> --requirements <host-binding.json>
  [--collection project] [--source <updated-source.js>] [--render auto|cpu|gpu]
  [--legacy-intent <reconstructed-intent.json>]  only when no persisted intent exists

Explicitly replace historical policy with a reviewed current host binding whose
latest authority source is "migration" and lineageId is the legacy asset ID.
Rebuild an immutable child; keep the original source, GLB, policy and QA unchanged.
Unmapped data or unmatched build options stop before source execution.
Exit codes: 0 rebuilt/help; 1 invalid input/build failure; 2 usage; 3 unresolved review.
`;

function parse(argv: readonly string[]) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]!)) return { help: true } as const;
  const [assetId, revisionId, ...flags] = argv;
  if (!assetId || !revisionId) throw new Error(USAGE);
  assetIdSchema.parse(assetId);
  assetIdSchema.parse(revisionId);
  const options: Record<string, string> = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (
      !['--requirements', '--collection', '--source', '--render', '--legacy-intent'].includes(
        flag,
      ) ||
      options[flag] !== undefined
    )
      throw new Error(`Unknown or repeated migration option: ${flag}`);
    const value = flags[++i];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[flag] = value;
  }
  if (!options['--requirements'])
    throw new Error('--requirements is required for explicit policy replacement.');
  return { help: false, assetId, revisionId, options } as const;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string | undefined =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : isRecord(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);
interface PolicyChange {
  path: string;
  before: { present: boolean; value?: unknown };
  after: { present: boolean; value?: unknown };
}
function policyChanges(before: unknown, after: unknown, path = ''): PolicyChange[] {
  if (canonical(before) === canonical(after)) return [];
  if (isRecord(before) && isRecord(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) => policyChanges(before[key], after[key], path ? `${path}.${key}` : key));
  return [
    {
      path,
      before: { present: before !== undefined, ...(before === undefined ? {} : { value: before }) },
      after: { present: after !== undefined, ...(after === undefined ? {} : { value: after }) },
    },
  ];
}

/** No source execution or collection mutation until all unrepresentable data is resolved. */
export async function rebuildLegacyAsset(
  context: KilnToolContext,
  input: {
    collection: string;
    assetId: string;
    revisionId: string;
    source?: string;
    legacyIntent?: unknown;
  },
) {
  if (!context.assetLibrary) throw new Error('Explicit migration requires an asset library.');
  const library = context.assetLibrary;
  const active = resolveRequirementsContext(context.requirements);
  input = structuredClone(input);
  context = {
    ...context,
    requirements: active.binding,
    assetBuildOptions: structuredClone(context.assetBuildOptions),
  };
  assetIdSchema.parse(input.assetId);
  assetIdSchema.parse(input.revisionId);
  assetIdSchema.parse(input.collection);
  const authority = active.binding?.history.at(-1);
  if (!active.binding || authority?.source !== 'migration')
    throw new Error(
      'Rebuild requires an explicit current host binding with latest authority source "migration".',
    );
  if (active.binding.lineageId !== input.assetId)
    throw new Error('Migration binding lineageId must match the legacy asset ID.');
  const currentContext = { ...context, requirements: active.binding };
  const record = await library.read(input.collection, input.assetId, input.revisionId);
  await verifyAssetRecord(record);
  const conversion = migrateAssetManifestV1ToRequirements(
    record.manifest,
    input.legacyIntent === undefined ? undefined : { legacyIntent: input.legacyIntent },
  );
  const buildOptions: Record<string, unknown> = {
    ...context.assetBuildOptions,
    optimize: 'off',
    instance: context.assetBuildOptions?.instance ?? 'unspecified-by-host',
    geometryPolicy: context.geometryPolicy ?? 'warn',
  };
  const knownBuildOptions = new Set([
    'optimize',
    'instance',
    'geometryPolicy',
    'gltfExporter',
    'qaMode',
    'evaluatorMode',
  ]);
  const resolved = conversion.unresolved.filter(
    (issue) =>
      issue.code === 'RULE_MIGRATION_UNQUALIFIED' ||
      (issue.code === 'LEGACY_BUILD_OPTION_REVIEW' &&
        knownBuildOptions.has(issue.path.slice('build.options.'.length)) &&
        canonical(
          conversion.proposal?.retainedBuildOptions[issue.path.slice('build.options.'.length)],
        ) === canonical(buildOptions[issue.path.slice('build.options.'.length)])),
  );
  const unresolved = conversion.unresolved.filter((issue) => !resolved.includes(issue));
  if (!conversion.proposal || conversion.status === 'invalid' || unresolved.length)
    return { ok: false as const, status: 'review-required' as const, conversion, unresolved };

  const originalCode = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    record.files['source.kiln.js']!,
  );
  const code = input.source ?? originalCode;
  if (Buffer.byteLength(code, 'utf8') > 1024 * 1024)
    throw new Error('Migration source exceeds 1 MiB.');
  const changes = policyChanges(conversion.proposal.requirements, active.requirements);
  const migration = {
    kind: 'kiln.asset-migration',
    schemaVersion: 1,
    policyDisposition: 'explicit-replacement',
    authority,
    original: structuredClone(record.manifest),
    ...(conversion.recoveredIntent ? { recoveredIntent: conversion.recoveredIntent } : {}),
    originalManifestCanonicalSha256: `sha256:${createHash('sha256').update(canonical(record.manifest)!).digest('hex')}`,
    proposedRequirements: conversion.proposal.requirements,
    policyChanges: changes,
    ruleDispositions: resolved
      .filter((issue) => issue.code === 'RULE_MIGRATION_UNQUALIFIED')
      .map((issue) => ({
        ...issue,
        disposition: 'replaced-by-current-host-requirements',
        equivalenceEstablished: false,
      })),
    retainedBuildOptions: conversion.proposal.retainedBuildOptions,
    sourceChanged: code !== originalCode,
    rebuiltSourceSha256: `sha256:${createHash('sha256').update(code, 'utf8').digest('hex')}`,
  };
  const draft = await buildProgramAssetDraft(
    code,
    currentContext,
    record.manifest.preview?.backdrop,
  );
  const asset = await library.save(input.collection, {
    name: record.manifest.name,
    tags: record.manifest.tags,
    description: record.manifest.description,
    brief: record.manifest.brief,
    attribution: record.manifest.attribution,
    assetId: input.assetId,
    parentRevision: input.revisionId,
    ...draft,
    build: { ...draft.build!, options: { ...draft.build!.options, migration } },
  });
  return {
    ok: true as const,
    status: 'rebuilt' as const,
    collection: input.collection,
    asset,
    policyDisposition: migration.policyDisposition,
    policyChanges: changes,
    ruleDispositions: migration.ruleDispositions,
    acceptance:
      (draft.build?.qa as { acceptance?: string } | undefined)?.acceptance ?? 'incomplete',
  };
}

async function readMigrationText(path: string, option: string): Promise<string> {
  const file = await open(resolve(path), 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024)
      throw new Error(`${option} requires a regular UTF-8 file no larger than 1 MiB.`);
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let total = 0;
    while (total < bytes.length) {
      const chunk = await file.read(bytes, total, bytes.length - total, null);
      if (!chunk.bytesRead) break;
      total += chunk.bytesRead;
    }
    if (total > 1024 * 1024) throw new Error(`${option} exceeds 1 MiB.`);
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, total),
    );
  } finally {
    await file.close();
  }
}

export async function migrationRebuildMain(argv: readonly string[]): Promise<number> {
  let args: ReturnType<typeof parse>;
  try {
    args = parse(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const requirements = await readHostRequirementsFile(args.options['--requirements']!);
    if (requirements.history.at(-1)?.source !== 'migration')
      throw new Error('Rebuild requires a host binding with latest authority source "migration".');
    const source = args.options['--source']
      ? await readMigrationText(args.options['--source'], '--source')
      : undefined;
    const legacyIntent = args.options['--legacy-intent']
      ? JSON.parse(await readMigrationText(args.options['--legacy-intent'], '--legacy-intent'))
      : undefined;
    const context = await createPackagedLocalToolContext({
      ...(await buildRenderPort(resolveRenderMode(args.options['--render']), undefined)),
      requirements,
      assetLibrary: localAssetLibrary(),
    });
    const result = await rebuildLegacyAsset(context, {
      collection: args.options['--collection'] ?? 'project',
      assetId: args.assetId,
      revisionId: args.revisionId,
      source,
      legacyIntent,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) console.error('Migration unresolved; no revision was written.');
    return result.ok ? 0 : 3;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
