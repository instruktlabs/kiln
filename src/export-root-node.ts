/**
 * The Node writer behind `kiln_export_to` (#207). The host configures one export
 * root (`KILN_EXPORT_ROOT`), checked once at start; the model names files
 * relative to it. Writes go through the CLI's never-replace writer, and every
 * message names root-relative paths only, because it is returned to the agent.
 */
import type { Stats } from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { platform } from 'node:os';

import { writeNewDestinationsAtomic } from './cli-output';
import { rootRelativeSegments, type ExportRootWriter } from './export-root';

const windowsDrivePath = /^[A-Za-z]:[\\/]/;
const windowsSharePath = /^[\\/]{2}[^\\/]+[\\/][^\\/]+/;
const RESTART = 'Correct KILN_EXPORT_ROOT and restart the MCP session.';

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(path);
    throw error;
  }
}

export interface ExportRootOptions {
  /** Every configured collection directory; saved revisions never change. */
  collectionRoots: readonly string[];
  /** The workspace whose `.kiln/` holds program, review and material state. */
  workspaceRoot?: string;
  operatingSystem?: NodeJS.Platform;
}

/**
 * Check a configured export root and return its real path. It must be an
 * absolute existing directory (on Windows a drive or UNC path; Git Bash `/c/...`
 * would resolve against the current drive), and must neither contain nor sit
 * inside a collection root or the workspace's `.kiln/`.
 */
export async function resolveExportRoot(
  value: string,
  options: ExportRootOptions,
): Promise<string> {
  const operatingSystem = options.operatingSystem ?? platform();
  if (
    operatingSystem === 'win32' &&
    !windowsDrivePath.test(value) &&
    !windowsSharePath.test(value)
  ) {
    const gitBash = /^\/([A-Za-z])(?:\/|$)/.exec(value);
    if (gitBash)
      throw new Error(
        `KILN_EXPORT_ROOT is a Git Bash path (/${gitBash[1]}/...); Windows would resolve it against the current drive. Write it as ${gitBash[1]!.toUpperCase()}:/... or a UNC share. ${RESTART}`,
      );
    throw new Error(
      `KILN_EXPORT_ROOT must be an absolute directory: a Windows drive (C:/...) or UNC share. ${RESTART}`,
    );
  }
  if (!isAbsolute(value))
    throw new Error(`KILN_EXPORT_ROOT must be an absolute directory. ${RESTART}`);
  let entry: Stats;
  try {
    entry = await stat(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(
        `KILN_EXPORT_ROOT does not exist; create the directory or ${RESTART[0]!.toLowerCase()}${RESTART.slice(1)}`,
      );
    throw new Error(
      `KILN_EXPORT_ROOT could not be read (${(error as NodeJS.ErrnoException).code ?? 'error'}). ${RESTART}`,
    );
  }
  if (!entry.isDirectory()) throw new Error(`KILN_EXPORT_ROOT is not a directory. ${RESTART}`);
  const root = await realpath(value);
  for (const collection of options.collectionRoots) {
    const directory = await canonical(collection);
    if (inside(directory, root) || inside(root, directory))
      throw new Error(
        `KILN_EXPORT_ROOT overlaps a collection directory; saved revisions never change. Choose a directory outside every collection and .kiln/. ${RESTART}`,
      );
  }
  if (options.workspaceRoot !== undefined) {
    const state = await canonical(join(options.workspaceRoot, '.kiln'));
    if (inside(state, root) || inside(root, state))
      throw new Error(
        `KILN_EXPORT_ROOT overlaps the workspace .kiln/ directory. Choose a directory outside every collection and .kiln/. ${RESTART}`,
      );
  }
  return root;
}

/**
 * A writer confined to `root`, which must already be a real path (from
 * {@link resolveExportRoot}). Each path is checked again here; existing
 * ancestors may not be links (symlinks or junctions), and the deepest existing
 * one must resolve inside the root. Missing directories are created by the
 * writer; a link planted at the final name is refused because publishing never
 * replaces.
 */
export function createExportRootWriter(root: string): ExportRootWriter {
  return {
    async writeNew(files) {
      const targets = files.map(({ path, data }) => ({
        path,
        segments: rootRelativeSegments(path),
        absolute: join(root, ...rootRelativeSegments(path)),
        data,
      }));
      for (const target of targets) {
        let deepest = root;
        for (const [index, segment] of target.segments.slice(0, -1).entries()) {
          const next = join(deepest, segment);
          let entry: Stats;
          try {
            entry = await lstat(next);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
            throw error;
          }
          const shown = target.segments.slice(0, index + 1).join('/');
          if (entry.isSymbolicLink())
            throw new Error(
              `${shown} in the export root is a symlink or junction; links are not followed. Choose a path through ordinary directories.`,
            );
          if (!entry.isDirectory())
            throw new Error(`${shown} in the export root is a file, not a directory.`);
          deepest = next;
        }
        if (!inside(root, await realpath(deepest)))
          throw new Error(`${target.path} resolves outside the export root.`);
      }
      try {
        await writeNewDestinationsAtomic(
          targets.map(({ absolute, data }) => ({ path: absolute, data })),
        );
      } catch (error) {
        const failure = error as NodeJS.ErrnoException;
        if (failure.code === 'EEXIST') {
          const existing = targets.find(({ absolute }) => failure.message.startsWith(absolute));
          throw new Error(
            `${existing?.path ?? 'An export file'} already exists in the export root and is never replaced; choose a new path or remove the file.`,
          );
        }
        throw new Error(
          `Could not write ${targets.map(({ path }) => path).join(' and ')} in the export root (${failure.code ?? failure.message.split(root).join('<export root>')}).`,
        );
      }
    },
  };
}

/**
 * The packaged host's export root: absent without `KILN_EXPORT_ROOT` (the entry
 * then does not advertise `kiln_export_to`), otherwise checked here, once, at host start.
 */
export async function exportRootWriterFromEnv(
  env: Record<string, string | undefined>,
  options: ExportRootOptions,
): Promise<ExportRootWriter | undefined> {
  const value = env['KILN_EXPORT_ROOT'];
  if (!value) return undefined;
  return createExportRootWriter(await resolveExportRoot(value, options));
}
