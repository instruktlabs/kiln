import { readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import { basename, resolve, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { assertCollectionRoot, localAssetLibrary, collectionConfigPath } from './assets-node';
import { listAssetCatalog } from './asset-catalog';
import { ASSET_LIMIT, assetIdSchema, decodeAssetBundle } from './assets';
import { localProgramStore } from './program-store-node';
import { programRefPattern, retainProgram } from './program-store';
import { createKilnProgramToolRegistry, newestRevision } from './tools/registry';
import { writeNewDestinationsAtomic } from './cli-output';
import { exportAssetGlb } from './asset-export';
import { inspectDrawDiagnostics } from './draw-diagnostics';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { startAssetViewer } from './asset-viewer';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { resolveAssetMaterialPayload } from './project-bundle-node';
import { FULL_OPTIMIZATION_PIPELINE, rebuildOptionsSchema } from './rebuild-options';
import { assertSavedRequirementsAuthorized } from './requirements-assets';
import { resolveRequirementsContext } from './requirements-context';
import { assetViewerHref } from './viewer/deep-link';
import { CATEGORY_MIGRATION_MESSAGE, readHostRequirementsFile } from './requirements-file';
import { observeLiveReview } from './tools/workspace';
import { cliWorkspaceSelection, readMaterialDependencies } from './workspace-cli';

const SAVE_LINES = `  kiln save <source.js|programRef> --name <name> [--collection project]
       [--asset <id> --parent <revision>] [--description <text>] [--tag <tag>]
       [--model <model>] [--harness <harness>] [--author <author>]  declared attribution
       [--backdrop neutral|dark|light]   preview backdrop; the one the reviewed sheet used
       [--project <id> | --no-project] [--project-revision <r>] [--materials <json>]`;
/** What `kiln save --help` prints: the one command (a blind run read 16,077 characters of global usage for it). */
export const SAVE_USAGE = `
SAVE
${SAVE_LINES}
       [--render auto|cpu|gpu]           views for the preview and its review (default: auto)
       [--requirements <host-binding.json>]   optional host policy
  Prints the saved revision as JSON: assetId, revisionId and the review. A later revision
  of the same asset names it with --asset and --parent. kiln --help lists every command.
`;
export const ASSET_USAGE = `
ASSETS & VIEWER
${SAVE_LINES}
  kiln collections                        list configured collections and their directories
  kiln collections add <name> <directory>  remember another collection root
  --requirements <host-binding.json>      optional host policy for save or asset --restore
  kiln assets [--collection project]      list saved revisions (JSON)
  kiln assets --all                       Library across all registered collections
  kiln asset <id> [<revision>] [--collection project] [--restore]   newest revision by default
  kiln asset <id> [<revision>] --rebuild --out rebuilt.glb [--requirements file]
  kiln export <id> <revision> --out asset.zip [--format bundle|glb|source]
       [--profile editable|runtime]   runtime writes GLB + sibling metadata JSON
       [--json]   receipt naming each file with its bytes and sha256
       export never replaces an existing file: an export hands off one exact
       saved revision, while render --out replaces its own working output
  kiln import <asset.zip|asset.glb> [--collection project] [--name <name>]
                                          prints the directory of each imported revision
  kiln view [collection-directory|asset.glb|asset.zip] [--port 4318]
       [--collection project --asset <id> --revision <revision>]
       [--observe-workspace <directory>]   repeat to review other explicit workspaces

KILN_COLLECTIONS is an optional JSON map of collection names to absolute folders.
On Windows these name a drive or share, such as C:/Users/you/kiln-assets; a Git Bash
path such as /c/Users/you/kiln-assets is refused rather than read as C:\\c\\Users\\...
Defaults: project -> <workspace>/assets/kiln; library -> your OS user-data directory.
An explicit map replaces both defaults. Existing source/render commands still work.
View prints a local browser URL and remains running until interrupted.
`;
export async function assetMain(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const tags: string[] = [];
  const observeWorkspaces: string[] = [];
  const allowed = new Set([
    'collection',
    'name',
    'asset',
    'parent',
    'revision',
    'description',
    'brief',
    'model',
    'harness',
    'author',
    'tag',
    'out',
    'format',
    'profile',
    'port',
    'render',
    'backdrop',
    'requirements',
    'project',
    'project-revision',
    'materials',
  ]);
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--observe-workspace') {
      const path = argv[++i];
      if (command !== 'view' || !path || path.startsWith('--') || observeWorkspaces.length >= 32)
        throw new Error('view accepts up to 32 --observe-workspace directories');
      observeWorkspaces.push(resolve(path));
      continue;
    }
    if (arg === '--all') {
      if (command !== 'assets' || flags.all)
        throw new Error('--all is supported once by assets only');
      flags.all = 'true';
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(command === 'save' ? SAVE_USAGE : ASSET_USAGE);
      return 0;
    }
    if (arg === '--category' || arg.startsWith('--category='))
      throw new Error(CATEGORY_MIGRATION_MESSAGE);
    // The CLI's --json rule (cli-json.ts) leaves the switch only on export's receipt.
    if (arg === '--json' && command === 'export') {
      flags.json = 'true';
      continue;
    }
    if (arg === '--restore' || arg === '--rebuild' || arg === '--no-project') {
      flags[arg.slice(2)] = 'true';
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (!allowed.has(key) || value === undefined) throw new Error(`Invalid option ${arg}`);
      if (key === 'tag') tags.push(value);
      else flags[key] = value;
    } else positional.push(arg);
  }
  if (command !== 'save' && ['model', 'harness', 'author'].some((key) => flags[key] !== undefined))
    throw new Error('--model, --harness and --author are supported by save only.');
  if (
    flags.rebuild &&
    (command !== 'asset' ||
      flags.restore ||
      !flags.out ||
      flags.project ||
      flags['project-revision'] ||
      flags['no-project'] ||
      flags.materials)
  )
    throw new Error(
      '--rebuild requires asset and --out; it uses saved dependencies and cannot combine with --restore or project overrides.',
    );
  if (
    command !== 'save' &&
    ['project', 'project-revision', 'no-project', 'materials'].some((key) =>
      Object.hasOwn(flags, key),
    )
  )
    throw new Error(
      '--project, --project-revision, --no-project and --materials are supported by save only.',
    );
  if (
    flags.requirements &&
    command !== 'save' &&
    !(command === 'asset' && (flags.restore || flags.rebuild))
  )
    throw new Error(
      '--requirements is supported by save, asset --restore and asset --rebuild only.',
    );
  const requirements = flags.requirements
    ? await readHostRequirementsFile(flags.requirements)
    : undefined;
  const library = localAssetLibrary();
  const collection = flags.collection ?? 'project';
  const fileBytes = async (path: string) => {
    if ((await stat(path)).size > ASSET_LIMIT) throw new Error('File exceeds 64 MiB');
    return new Uint8Array(await readFile(path));
  };
  if (command === 'collections') {
    if (positional[0] === 'add') {
      if (process.env.KILN_COLLECTIONS)
        throw new Error(
          'KILN_COLLECTIONS overrides saved configuration. Unset it before changing workspace collections.',
        );
      const [, name, directory] = positional;
      if (!name || !directory) throw new Error('collections add requires name and directory');
      assetIdSchema.parse(name);
      // A relative directory resolves against the working directory, as typed. A rooted
      // one must name a drive on Windows, where /c/Users/x would land in C:\c\Users\x.
      assertCollectionRoot(name, isAbsolute(directory) ? directory : resolve(directory));
      const roots = Object.fromEntries(
        library.collections().map((c) => [c.id, library.directory(c.id)]),
      );
      if (roots[name] && roots[name] !== resolve(directory))
        throw new Error('Collection name already points to another directory');
      roots[name] = resolve(directory);
      const path = collectionConfigPath();
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(roots, null, 2), { flag: 'wx' });
      await rename(temporary, path);
      console.log(
        `Collection ${name}: ${roots[name]}. Restart running MCP/viewer processes to load it.`,
      );
    } else {
      // The CLI names each root so a misconfigured one is visible; the shared
      // collections() list feeding MCP and the viewer stays name-only.
      const collections = library
        .collections()
        .map((entry) => ({ ...entry, directory: library.directory(entry.id) }));
      console.log(JSON.stringify({ collections }, null, 2));
    }
  } else if (command === 'assets') {
    if (flags.all && flags.collection) throw new Error('Use --all or --collection, not both');
    console.log(
      JSON.stringify(
        flags.all ? await listAssetCatalog(library) : { assets: await library.list(collection) },
        null,
        2,
      ),
    );
  } else if (command === 'save') {
    const selection = cliWorkspaceSelection(
      flags.project,
      flags['project-revision'],
      flags['no-project'] === 'true',
    );
    const materialDependencies = flags.materials
      ? await readMaterialDependencies(flags.materials)
      : undefined;
    const input = positional[0];
    if (!input || !flags.name) throw new Error('save requires source/ref and --name');
    const store = localProgramStore();
    const programRef = programRefPattern.test(input)
      ? input
      : await retainProgram(store, new TextDecoder().decode(await fileBytes(input)));
    const context = await createPackagedLocalToolContext(
      await buildRenderPort(resolveRenderMode(flags.render), undefined),
    );
    const def = createKilnProgramToolRegistry({
      ...context,
      requirements,
      assetLibrary: library,
      programStore: store,
    }).find((d) => d.name === 'kiln_save')!;
    try {
      console.log(
        JSON.stringify(
          await def.run({
            collection,
            programRef,
            name: flags.name,
            assetId: flags.asset,
            parentRevision: flags.parent,
            description: flags.description,
            brief: flags.brief,
            attribution:
              flags.model !== undefined || flags.harness !== undefined || flags.author !== undefined
                ? { model: flags.model, harness: flags.harness, author: flags.author }
                : undefined,
            tags,
            backdrop: flags.backdrop,
            ...selection,
            ...(materialDependencies ? { materialDependencies } : {}),
          }),
          null,
          2,
        ),
      );
    } finally {
      try {
        await context.liveReview?.flush?.();
      } catch {
        /* Optional observation. */
      }
    }
  } else if (command === 'asset' || command === 'export') {
    const [assetId, named] = positional;
    if (!assetId || (command === 'export' && !named))
      throw new Error(`${command} requires asset ID and revision ID`);
    // `asset` without a revision reads the newest one, as kiln_assets get does (decision
    // 28 of 2 October 2026); export hands off one exact revision and still names it.
    const revisionId = named ?? (await newestRevision(library, collection, assetId));
    const record = await library.read(collection, assetId, revisionId);
    if (command === 'asset') {
      if (flags.rebuild) {
        const context = await createPackagedLocalToolContext({ requirements });
        const execute = async () => {
          const source = record.files['source.kiln.js'];
          if (!source) throw new Error('Editable source unavailable');
          assertSavedRequirementsAuthorized(
            record.manifest,
            resolveRequirementsContext(requirements),
          );
          const parsed = rebuildOptionsSchema.safeParse(record.manifest.build?.options);
          if (!parsed.success)
            throw new Error(
              'Saved exporter settings are incomplete; use an explicit new authoring run instead of an exact rebuild.',
            );
          if (
            parsed.data.optimize === 'full' &&
            parsed.data.optimizationPipeline !== FULL_OPTIMIZATION_PIPELINE
          )
            throw new Error(
              'Saved revision uses an unversioned full optimization pipeline; rebuild with its original pinned engine, or explicitly author and save a new child revision to migrate.',
            );
          // The pipeline version is replay metadata, not an evaluator input option.
          const { optimizationPipeline: _pipeline, ...renderOptions } = parsed.data;
          const materialResources = await resolveAssetMaterialPayload(
            new FileWorkspace(localWorkspaceRoot()),
            record,
          );
          const code = new TextDecoder().decode(source);
          const rendered = await context.evaluatorPort!.render(code, {
            ...renderOptions,
            materialResources,
            requirements,
          });
          try {
            context.liveReview?.artifact(code, rendered);
          } catch {
            /* Optional observation. */
          }
          await writeNewDestinationsAtomic([{ path: resolve(flags.out!), data: rendered.glb }]);
          return {
            ok: true,
            file: resolve(flags.out!),
            artifactGlbSha256: rendered.artifactGlbSha256,
            savedArtifactGlbSha256: record.manifest.files['asset.glb']!.sha256,
            matchesSavedArtifact:
              rendered.artifactGlbSha256 === record.manifest.files['asset.glb']!.sha256,
            rebuildOptions: rendered.rebuildOptions,
            tris: rendered.tris,
            warnings: rendered.warnings,
          };
        };
        try {
          const result = await observeLiveReview(
            context.liveReview,
            'kiln_asset_rebuild',
            { runtimeIdentity: context.localExecution.runtimeIdentity },
            execute,
          );
          console.log(JSON.stringify(result, null, 2));
        } finally {
          try {
            await context.liveReview?.flush?.();
          } catch {
            /* Optional observation. */
          }
        }
      } else if (flags.restore) {
        const restore = createKilnProgramToolRegistry({
          assetLibrary: library,
          programStore: localProgramStore(),
          requirements,
        }).find((def) => def.name === 'kiln_assets')!;
        console.log(
          JSON.stringify(
            await restore.run({
              action: 'restore',
              collection,
              assetId,
              revisionId,
            }),
            null,
            2,
          ),
        );
      } else console.log(JSON.stringify(record.manifest, null, 2));
    } else {
      if (!flags.out) throw new Error('export requires --out');
      const profile = flags.profile ?? 'editable';
      if (profile !== 'editable' && profile !== 'runtime')
        throw new Error('Unknown export profile');
      const format = flags.format ?? (profile === 'runtime' ? 'glb' : 'bundle');
      if (!['bundle', 'glb', 'source'].includes(format)) throw new Error('Unknown export format');
      const written: { kind: string; path: string; data: Uint8Array }[] = [];
      if (profile === 'runtime') {
        if (format !== 'glb')
          throw new Error('Runtime profile requires GLB format; use editable for source or bundle');
        const destination = resolve(flags.out);
        if (!destination.toLowerCase().endsWith('.glb'))
          throw new Error('Runtime output must end in .glb');
        const metadataFileName = `${basename(destination).slice(0, -4)}.kiln-metadata.json`;
        const output = await exportAssetGlb(record, { profile, metadataFileName });
        if (output.profile !== 'runtime') throw new Error('Expected runtime export');
        const metadataPath = resolve(dirname(destination), output.metadata.name);
        await writeNewDestinationsAtomic([
          { path: metadataPath, data: output.metadata.bytes },
          { path: destination, data: output.glb },
        ]);
        written.push(
          { kind: 'glb', path: destination, data: output.glb },
          { kind: 'metadata', path: metadataPath, data: output.metadata.bytes },
        );
      } else {
        const bytes =
          format === 'bundle'
            ? await library.exportBundle([record])
            : record.files[format === 'glb' ? 'asset.glb' : 'source.kiln.js'];
        if (!bytes) throw new Error('Source unavailable');
        const destination = resolve(flags.out);
        await writeNewDestinationsAtomic([{ path: destination, data: bytes }]);
        written.push({ kind: format, path: destination, data: bytes });
      }
      if (!flags.json) console.log(written.map(({ path }) => `Saved ${path}`).join('\n'));
      else
        console.log(
          JSON.stringify(
            {
              ok: true,
              collection,
              assetId,
              revisionId,
              profile,
              format,
              ...(format !== 'source'
                ? {
                    drawDiagnostics: await inspectDrawDiagnostics(
                      written.find(({ kind }) => kind === 'glb')?.data ??
                        record.files['asset.glb']!,
                    ),
                  }
                : {}),
              files: written.map(({ kind, path, data }) => ({
                kind,
                path,
                bytes: data.byteLength,
                sha256: `sha256:${createHash('sha256').update(data).digest('hex')}`,
              })),
            },
            null,
            2,
          ),
        );
    }
  } else if (command === 'import') {
    const file = positional[0];
    if (!file) throw new Error('import requires a ZIP or GLB file');
    const bytes = await fileBytes(file);
    const assets = file.toLowerCase().endsWith('.glb')
      ? [await library.save(collection, { name: flags.name ?? basename(file, '.glb'), glb: bytes })]
      : await library.import(collection, decodeAssetBundle(bytes));
    const directory = library.directory(collection);
    console.log(
      JSON.stringify(
        {
          collection,
          directory,
          assets: assets.map((manifest) => ({
            ...manifest,
            path: library.revisionDirectory(collection, manifest.assetId, manifest.revisionId),
          })),
        },
        null,
        2,
      ),
    );
  } else if (command === 'view') {
    let target = library;
    let standalone: { name: string; bytes: Uint8Array } | undefined;
    const file = positional[0];
    if (file) {
      if ((await stat(file)).isDirectory()) {
        const { FileAssetLibrary } = await import('./assets-node');
        target = new FileAssetLibrary({ project: resolve(file) });
      } else standalone = { name: basename(file), bytes: await fileBytes(file) };
    }
    const port = flags.port === undefined ? 4318 : Number(flags.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    if ((flags.asset && !flags.revision) || (!flags.asset && flags.revision))
      throw new Error('view requires --asset and --revision together');
    const root = localWorkspaceRoot();
    const reviewSources: NonNullable<Parameters<typeof startAssetViewer>[1]>['reviewSources'] = {};
    const { realpath } = await import('node:fs/promises');
    const currentRoot = await realpath(root);
    for (const path of observeWorkspaces) {
      if (!(await stat(path)).isDirectory())
        throw new Error('Observation source must be a directory');
      const canonical = await realpath(path);
      if (canonical === currentRoot) continue;
      const id = `w_${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
      reviewSources[id] = { label: basename(canonical), review: new FileLiveReview(canonical) };
    }
    const viewer = await startAssetViewer(target, {
      port,
      standalone,
      workspace: new FileWorkspace(root),
      liveReview: new FileLiveReview(root),
      reviewSources,
    });
    const viewerUrl = standalone
      ? `${viewer.url}?open=standalone`
      : flags.asset && flags.revision
        ? assetViewerHref(viewer.url, {
            collection,
            assetId: flags.asset,
            revisionId: flags.revision,
          })
        : viewer.url;
    console.log(viewerUrl);
    console.log('Kiln viewer · local files · Ctrl+C to stop');
  }
  return 0;
}
