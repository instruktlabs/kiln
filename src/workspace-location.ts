/** Host-only path policy shared by CLI, MCP, stores and the local dashboard. */
import { dirname, join, resolve } from 'node:path';

type WorkspaceEnvironment = Readonly<Record<string, string | undefined>>;

/** An explicit workspace owns its resources; the legacy source path can imply a workspace. */
export function localWorkspaceRoot(env: WorkspaceEnvironment = process.env): string {
  return env.KILN_WORKSPACE
    ? resolve(env.KILN_WORKSPACE)
    : env.KILN_PROGRAM_STORE
      ? dirname(dirname(resolve(env.KILN_PROGRAM_STORE)))
      : process.cwd();
}

/** An explicit source-store path overrides sources only, including with KILN_WORKSPACE set. */
export function localProgramStoreDirectory(env: WorkspaceEnvironment = process.env): string {
  return env.KILN_PROGRAM_STORE
    ? resolve(env.KILN_PROGRAM_STORE)
    : join(localWorkspaceRoot(env), '.kiln', 'programs');
}
