/** Host-only path policy shared by CLI, MCP, stores and the local dashboard. */
import * as nativePath from 'node:path';
import { dirname, join, resolve } from 'node:path';

type WorkspaceEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Which setting chose the workspace root: KILN_WORKSPACE, the folder above the
 * `.kiln` of KILN_PROGRAM_STORE, or the host process's working directory.
 */
export type WorkspaceRootSource = 'KILN_WORKSPACE' | 'KILN_PROGRAM_STORE' | 'cwd';

export interface WorkspaceLocation {
  root: string;
  selectedBy: WorkspaceRootSource;
}

/** An explicit workspace owns its resources; the legacy source path can imply a workspace. */
export function localWorkspaceLocation(env: WorkspaceEnvironment = process.env): WorkspaceLocation {
  return env.KILN_WORKSPACE
    ? { root: resolve(env.KILN_WORKSPACE), selectedBy: 'KILN_WORKSPACE' }
    : env.KILN_PROGRAM_STORE
      ? {
          root: dirname(dirname(resolve(env.KILN_PROGRAM_STORE))),
          selectedBy: 'KILN_PROGRAM_STORE',
        }
      : { root: process.cwd(), selectedBy: 'cwd' };
}

export function localWorkspaceRoot(env: WorkspaceEnvironment = process.env): string {
  return localWorkspaceLocation(env).root;
}

/** An explicit source-store path overrides sources only, including with KILN_WORKSPACE set. */
export function localProgramStoreDirectory(env: WorkspaceEnvironment = process.env): string {
  return env.KILN_PROGRAM_STORE
    ? resolve(env.KILN_PROGRAM_STORE)
    : join(localWorkspaceRoot(env), '.kiln', 'programs');
}

/**
 * A refused or missing workspace `file`. Its message names the workspace root, the one
 * local path an MCP host keeps in an error: the agent needs it to put the file where
 * Kiln reads, and Discovery capabilities report the same root (#423).
 */
export class WorkspaceFileError extends Error {
  constructor(
    message: string,
    readonly workspaceRoot: string,
  ) {
    super(message);
    this.name = 'WorkspaceFileError';
  }
}

type PathApi = Pick<typeof nativePath, 'isAbsolute' | 'relative' | 'resolve' | 'sep'>;

/**
 * The path of `target` relative to `root` when `target` lies strictly below it, else
 * undefined. Both are resolved first, so `..` cannot climb out, and the platform's own
 * comparison applies: on Windows drive letters and names compare without case and
 * another drive or share is never inside.
 */
export function pathInsideRoot(
  root: string,
  target: string,
  path: PathApi = nativePath,
): string | undefined {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return undefined;
  return relative;
}
