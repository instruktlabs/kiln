import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materialDependenciesSchema } from './projects';
import { workspaceSelectionSchema, type WorkspaceSelection } from './workspace';

/** All authoring CLI entrypoints share the same explicit selection contract. */
export function cliWorkspaceSelection(
  projectId?: string | null,
  projectRevision?: string,
  noProject = false,
): WorkspaceSelection {
  if (noProject && (projectId !== undefined || projectRevision !== undefined))
    throw new Error('--no-project cannot be combined with --project or --project-revision.');
  return workspaceSelectionSchema.parse({
    projectId: noProject ? null : projectId,
    projectRevision,
  });
}

export async function readMaterialDependencies(path: string) {
  const file = await open(resolve(path), 'r');
  try {
    const limit = 1024 * 1024;
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('--materials requires a JSON file no larger than 1 MiB.');
    const bytes = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < bytes.length) {
      const read = await file.read(bytes, total, bytes.length - total, null);
      if (!read.bytesRead) break;
      total += read.bytesRead;
    }
    if (total > limit) throw new Error('--materials JSON exceeds 1 MiB.');
    return materialDependenciesSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total))),
    );
  } finally {
    await file.close();
  }
}
