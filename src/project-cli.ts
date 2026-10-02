/** Project and material commands use the same immutable services as MCP and the local dashboard. */
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { MAX_PROJECT_BYTES } from './projects';
import { createKilnProjectDef } from './tools/projects';
import { createKilnMaterialDef } from './tools/materials';
import {
  MATERIAL_LIBRARY_LIMITS,
  materialLibraryPortableSpec,
  proceduralMaterialDraftSchema,
} from './material-library';
import {
  createMaterialRecordV1,
  createMaterialLibraryPayload,
  decodeMaterialLibraryPayload,
} from './material-library-node';
import { writeNewDestinationsAtomic } from './cli-output';
import { localAssetLibrary } from './assets-node';
import { exportWorkspaceProjectBundle, importWorkspaceProjectBundle } from './project-bundle-node';
import { PROJECT_BUNDLE_LIMITS } from './project-bundle';

export const PROJECT_USAGE = `
PROJECTS
  kiln project list
  kiln project get <id> [--revision <revision>]
  kiln project create --name <name> [--id <id>]
  kiln project create --file <project-draft.json>
  kiln project update <id> --expected <revision> --file <project-patch.json>
  kiln project export <id> --out <project.zip> [--revision <revision>] [--profile editable|runtime]
  kiln project import <project.zip> --id <new-project-id> --collection <collection> [--name <name>]

MATERIALS
  kiln material presets [--tag <tag>]
  kiln material create-preset --file <preset-options.json>
  kiln material list
  kiln material get <id> <sha256:revision>
  kiln material procedural --file <procedural-material-draft.json>
  kiln material import --file <portable-material-payload.json>
  kiln material export <id> <sha256:revision> --out <portable-material-payload.json>

Project changes create immutable revisions. Updates require the current expected
revision; supplied top-level fields replace their previous values.
Material imports verify embedded map bytes and provenance. Procedural creation
uses a JSON recipe with explicit creator/license records. These commands do not
fetch source URLs or read paths from imported JSON.
Project and material storage is under <workspace>/.kiln. KILN_WORKSPACE selects the
workspace. KILN_PROGRAM_STORE overrides only the source store when both are set.
Without KILN_WORKSPACE, its grandparent remains the workspace root for compatibility.
Projects are optional. Authoring stays standalone unless --project or KILN_PROJECT
selects a project; --no-project overrides that configured default. Use --materials
with an array of exact resourceId/revisionId/sha256 pins for standalone materials.
All commands return JSON; export refuses to overwrite an existing destination.
`;

/** Read only the file the operator explicitly named, with a hard allocation bound. */
async function inputFile(path: string, limit: number): Promise<Buffer> {
  const file = await open(resolve(path), 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Expected a regular file');
    if (stat.size > limit) throw new Error(`File exceeds ${limit} bytes`);
    // A bounded read also protects against a file that grows after stat.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size || offset > limit) throw new Error('File changed while reading');
    return buffer.subarray(0, offset);
  } finally {
    await file.close();
  }
}
async function jsonFile(path: string, limit: number): Promise<unknown> {
  return JSON.parse((await inputFile(path, limit)).toString('utf8').replace(/^\uFEFF/, ''));
}

export async function projectMain(argv: readonly string[]): Promise<number> {
  const [family, action] = argv;
  if (argv.some((value) => value === '--help' || value === '-h')) {
    console.log(PROJECT_USAGE);
    return 0;
  }
  if (family !== 'project' && family !== 'material')
    throw new Error('Expected project or material command');
  const supported =
    family === 'project'
      ? ['list', 'get', 'create', 'update', 'export', 'import']
      : ['list', 'get', 'procedural', 'import', 'export', 'presets', 'create-preset'];
  if (!action || !supported.includes(action))
    throw new Error(`Unknown ${family} action. Run kiln ${family} --help.`);
  const allowed: Record<string, string[]> = {
    'project:list': [],
    'project:get': ['revision'],
    'project:create': ['file', 'name', 'id'],
    'project:update': ['file', 'expected'],
    'project:export': ['out', 'revision', 'profile'],
    'project:import': ['id', 'collection', 'name'],
    'material:list': [],
    'material:presets': ['tag'],
    'material:create-preset': ['file'],
    'material:get': [],
    'material:procedural': ['file'],
    'material:import': ['file'],
    'material:export': ['out'],
  };
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]!;
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (!allowed[`${family}:${action}`]!.includes(key))
      throw new Error(`Unsupported option ${value} for ${family} ${action}`);
    if (Object.hasOwn(flags, key)) throw new Error(`Duplicate option ${value}`);
    const next = argv[++index];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for ${value}`);
    flags[key] = next;
  }
  const expectedArgs =
    action === 'get' || action === 'export'
      ? family === 'project'
        ? 1
        : 2
      : action === 'update' || (action === 'import' && family === 'project')
        ? 1
        : 0;
  if (positional.length !== expectedArgs)
    throw new Error(
      `${family} ${action} requires ${expectedArgs} positional argument${expectedArgs === 1 ? '' : 's'}`,
    );
  const workspace = new FileWorkspace(localWorkspaceRoot());
  const store = workspace.projects;
  if (family === 'project') {
    if (action === 'export') {
      if (!flags.out) throw new Error('project export requires --out');
      const profile = flags.profile ?? 'editable';
      if (profile !== 'editable' && profile !== 'runtime')
        throw new Error('Project profile must be editable or runtime');
      const bytes = await exportWorkspaceProjectBundle(
        workspace,
        localAssetLibrary(),
        positional[0]!,
        { revisionId: flags.revision, profile },
      );
      const path = resolve(flags.out);
      await writeNewDestinationsAtomic([{ path, data: bytes }]);
      console.log(JSON.stringify({ ok: true, profile, path, bytes: bytes.length }));
      return 0;
    }
    if (action === 'import') {
      if (!flags.id || !flags.collection)
        throw new Error('project import requires a new --id and explicit --collection');
      const project = await importWorkspaceProjectBundle(
        workspace,
        localAssetLibrary(),
        await inputFile(positional[0]!, PROJECT_BUNDLE_LIMITS.maxArchiveBytes),
        { projectId: flags.id, collectionId: flags.collection, name: flags.name },
      );
      console.log(JSON.stringify({ ok: true, project }, null, 2));
      return 0;
    }
    const tool = createKilnProjectDef(store);
    let input: unknown;
    if (action === 'list') input = { action: 'list' };
    else if (action === 'get')
      input = {
        action: 'get',
        projectId: positional[0],
        ...(flags.revision ? { revisionId: flags.revision } : {}),
      };
    else if (action === 'create') {
      if (flags.file && (flags.name || flags.id))
        throw new Error('Use --file or --name with optional --id, not both');
      if (!flags.file && !flags.name) throw new Error('project create requires --file or --name');
      input = {
        action: 'create',
        draft: flags.file
          ? await jsonFile(flags.file, MAX_PROJECT_BYTES)
          : { name: flags.name, ...(flags.id ? { projectId: flags.id } : {}) },
      };
    } else {
      if (!flags.file || !flags.expected)
        throw new Error('project update requires --expected and --file');
      input = {
        action: 'update',
        projectId: positional[0],
        expectedRevision: flags.expected,
        patch: await jsonFile(flags.file, MAX_PROJECT_BYTES),
      };
    }
    console.log(JSON.stringify(await tool.run(input), null, 2));
    return 0;
  }
  const materials = workspace.materials;
  let output: unknown;
  if (action === 'presets')
    output = await createKilnMaterialDef(materials).run({
      action: 'presets',
      ...(flags.tag ? { tag: flags.tag } : {}),
    });
  else if (action === 'create-preset') {
    if (!flags.file) throw new Error('material create-preset requires --file');
    const input = await jsonFile(flags.file, MATERIAL_LIBRARY_LIMITS.maxManifestBytes);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Preset options must be a JSON object');
    output = await createKilnMaterialDef(materials).run({ ...input, action: 'create-preset' });
  } else if (action === 'list')
    output = await createKilnMaterialDef(materials).run({ action: 'list' });
  else if (action === 'get' || action === 'export') {
    const record = await materials.read(positional[0]!, positional[1]!);
    if (action === 'get')
      output = {
        manifest: record.manifest,
        portableSpec: materialLibraryPortableSpec(record.manifest),
      };
    else {
      if (!flags.out) throw new Error('material export requires --out');
      const payload = await createMaterialLibraryPayload([record]);
      const path = resolve(flags.out);
      await writeNewDestinationsAtomic([{ path, data: JSON.stringify(payload, null, 2) }]);
      output = {
        file: path,
        materialId: record.manifest.materialId,
        revisionId: record.manifest.revisionId,
      };
    }
  } else {
    if (!flags.file) throw new Error(`material ${action} requires --file`);
    const input = await jsonFile(
      flags.file,
      action === 'procedural' ? MATERIAL_LIBRARY_LIMITS.maxManifestBytes : 24 * 1024 * 1024,
    );
    const records =
      action === 'procedural'
        ? [await createMaterialRecordV1(proceduralMaterialDraftSchema.parse(input))]
        : await decodeMaterialLibraryPayload(input);
    output = { materials: await materials.import(records) };
  }
  console.log(JSON.stringify(output, null, 2));
  return 0;
}
