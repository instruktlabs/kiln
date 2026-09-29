import { readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import { basename, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localAssetLibrary, collectionConfigPath } from './assets-node';
import { ASSET_LIMIT, assetIdSchema, decodeAssetBundle, encodeAssetBundle } from './assets';
import { localProgramStore } from './program-store-node';
import { programRefPattern, retainProgram } from './program-store';
import { createKilnProgramToolRegistry } from './tools/registry';
import { prepareDestination, writeNewDestinationsAtomic } from './cli-output';
import { exportAssetGlb } from './asset-export';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { startAssetViewer } from './asset-viewer';
import { assetViewerHref } from './viewer/deep-link';
import { CATEGORY_MIGRATION_MESSAGE, readHostRequirementsFile } from './requirements-file';

export const ASSET_USAGE = `
ASSETS & VIEWER
  kiln save <source.js|programRef> --name <name> [--collection project]
       [--asset <id> --parent <revision>] [--description <text>] [--tag <tag>]
       [--backdrop neutral|dark|light]   preview backdrop; the one the reviewed sheet used
  kiln collections                        list configured collection names
  kiln collections add <name> <directory>  remember another collection root
  --requirements <host-binding.json>      optional host policy for save or asset --restore
  kiln assets [--collection project]      list saved revisions (JSON)
  kiln asset <id> <revision> [--collection project] [--restore]
  kiln export <id> <revision> --out asset.zip [--format bundle|glb|source]
       [--profile editable|runtime]   runtime writes GLB + sibling metadata JSON
  kiln import <asset.zip|asset.glb> [--collection project] [--name <name>]
  kiln view [collection-directory|asset.glb|asset.zip] [--port 4318]
       [--collection project --asset <id> --revision <revision>]

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
  const allowed = new Set([
    'collection',
    'name',
    'asset',
    'parent',
    'revision',
    'description',
    'brief',
    'tag',
    'out',
    'format',
    'profile',
    'port',
    'render',
    'backdrop',
    'requirements',
  ]);
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(ASSET_USAGE);
      return 0;
    }
    if (arg === '--category' || arg.startsWith('--category='))
      throw new Error(CATEGORY_MIGRATION_MESSAGE);
    if (arg === '--restore') {
      flags.restore = 'true';
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
  if (flags.requirements && command !== 'save' && !(command === 'asset' && flags.restore))
    throw new Error('--requirements is supported by save and asset --restore only.');
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
  } else if (command === 'assets')
    console.log(JSON.stringify({ assets: await library.list(collection) }, null, 2));
  else if (command === 'save') {
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
          tags,
          backdrop: flags.backdrop,
        }),
        null,
        2,
      ),
    );
  } else if (command === 'asset' || command === 'export') {
    const [assetId, revisionId] = positional;
    if (!assetId || !revisionId) throw new Error(`${command} requires asset ID and revision ID`);
    const record = await library.read(collection, assetId, revisionId);
    if (command === 'asset') {
      if (flags.restore) {
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
          ? encodeAssetBundle([record])
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
    const viewer = await startAssetViewer(target, { port, standalone });
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
