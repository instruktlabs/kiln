import { readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import { basename, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { localAssetLibrary, collectionConfigPath } from './assets-node';
import { listAssetCatalog } from './asset-catalog';
import { ASSET_LIMIT, assetIdSchema, decodeAssetBundle } from './assets';
import { localProgramStore } from './program-store-node';
import { programRefPattern, retainProgram } from './program-store';
import { createKilnProgramToolRegistry } from './tools/registry';
import { prepareDestination, writeNewDestinationsAtomic } from './cli-output';
import { exportAssetGlb } from './asset-export';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { startAssetViewer } from './asset-viewer';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { resolveAssetMaterialPayload } from './project-bundle-node';
import { rebuildOptionsSchema } from './rebuild-options';
import { assertSavedRequirementsAuthorized } from './requirements-assets';
import { resolveRequirementsContext } from './requirements-context';
import { assetViewerHref } from './viewer/deep-link';
import { CATEGORY_MIGRATION_MESSAGE, readHostRequirementsFile } from './requirements-file';
import { observeLiveReview } from './tools/workspace';
import { cliWorkspaceSelection, readMaterialDependencies } from './workspace-cli';

export const ASSET_USAGE = `
ASSETS & VIEWER
  kiln save <source.js|programRef> --name <name> [--collection project]
       [--asset <id> --parent <revision>] [--description <text>] [--tag <tag>]
       [--model <model>] [--harness <harness>] [--author <author>]  declared attribution
       [--backdrop neutral|dark|light]   preview backdrop; the one the reviewed sheet used
       [--project <id> | --no-project] [--project-revision <r>] [--materials <json>]
  kiln collections                        list configured collection names
  kiln collections add <name> <directory>  remember another collection root
  --requirements <host-binding.json>      optional host policy for save or asset --restore
  kiln assets [--collection project]      list saved revisions (JSON)
  kiln assets --all                       Library across all registered collections
  kiln asset <id> <revision> [--collection project] [--restore]
  kiln asset <id> <revision> --rebuild --out rebuilt.glb [--requirements file]
  kiln export <id> <revision> --out asset.zip [--format bundle|glb|source]
       [--profile editable|runtime]   runtime writes GLB + sibling metadata JSON
  kiln import <asset.zip|asset.glb> [--collection project] [--name <name>]
  kiln view [collection-directory|asset.glb|asset.zip] [--port 4318]
       [--collection project --asset <id> --revision <revision>]
       [--observe-workspace <directory>]   repeat to review other explicit workspaces

KILN_COLLECTIONS is an optional JSON map of collection names to absolute folders.
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
      console.log(ASSET_USAGE);
      return 0;
    }
    if (arg === '--category' || arg.startsWith('--category='))
      throw new Error(CATEGORY_MIGRATION_MESSAGE);
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
    } else console.log(JSON.stringify({ collections: library.collections() }, null, 2));
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
      await buildRenderPort(resolveRenderMode(flags.render ?? 'auto'), undefined),
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
    const [assetId, revisionId] = positional;
    if (!assetId || !revisionId) throw new Error(`${command} requires asset ID and revision ID`);
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
          const materialResources = await resolveAssetMaterialPayload(
            new FileWorkspace(localWorkspaceRoot()),
            record,
          );
          const code = new TextDecoder().decode(source);
          const rendered = await context.evaluatorPort!.render(code, {
            ...parsed.data,
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
        console.log(`Saved ${destination}\nSaved ${metadataPath}`);
        return 0;
      }
      const bytes =
        format === 'bundle'
          ? await library.exportBundle([record])
          : record.files[format === 'glb' ? 'asset.glb' : 'source.kiln.js'];
      if (!bytes) throw new Error('Source unavailable');
      await writeFile(await prepareDestination(resolve(flags.out)), bytes, { flag: 'wx' });
      console.log(`Saved ${resolve(flags.out)}`);
    }
  } else if (command === 'import') {
    const file = positional[0];
    if (!file) throw new Error('import requires a ZIP or GLB file');
    const bytes = await fileBytes(file);
    const assets = file.toLowerCase().endsWith('.glb')
      ? [await library.save(collection, { name: flags.name ?? basename(file, '.glb'), glb: bytes })]
      : await library.import(collection, decodeAssetBundle(bytes));
    console.log(JSON.stringify({ collection, assets }, null, 2));
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
