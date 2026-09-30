import { link, lstat, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { localProgramStoreDirectory } from './workspace-location';
import {
  assertProgramRef,
  canonicalProgramRefPattern,
  MAX_PROGRAM_BYTES,
  programReference,
  shortProgramRefCandidates,
  type ProgramStore,
  type ProgramStoreStats,
} from './program-store';

/** Project-local, append-only snapshots. No eviction: a returned reference stays valid. */
export class FileProgramStore implements ProgramStore {
  constructor(readonly directory: string) {}

  async stats(): Promise<ProgramStoreStats> {
    let entries = 0;
    let bytes = 0;
    try {
      for (const entry of await readdir(this.directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{64}\.js$/.test(entry.name)) continue;
        try {
          bytes += (await stat(join(this.directory, entry.name))).size;
          entries++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return { entries, bytes, maxSourceBytes: MAX_PROGRAM_BYTES, eviction: 'none' };
  }

  async get(ref: string): Promise<string> {
    assertProgramRef(ref);
    const canonical = ref.startsWith('p_') ? await this.readHandle(ref) : ref;
    if (canonical === undefined) throw this.notFound(ref);
    const path = join(this.directory, `${canonical.slice(7)}.js`);
    let code: string;
    try {
      if ((await stat(path)).size > MAX_PROGRAM_BYTES)
        throw new Error('Stored program exceeds the 1 MiB source limit.');
      code = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw this.notFound(ref);
      throw error;
    }
    if ((await programReference(code)) !== canonical)
      throw new Error(`Program integrity check failed: ${ref}`);
    return code;
  }

  private notFound(ref: string): Error {
    return new Error(
      `Program not found: ${ref}. Use the same KILN_PROGRAM_STORE or import the source again.`,
    );
  }

  private async readHandle(handle: string): Promise<string | undefined> {
    const path = join(this.directory, 'refs', `${handle}.ref`);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.size !== 71)
        throw new Error(`Program handle integrity check failed: ${handle}`);
      const canonical = await readFile(path, 'utf8');
      if (
        !canonicalProgramRefPattern.test(canonical) ||
        !canonical.slice(7).startsWith(handle.slice(2))
      )
        throw new Error(`Program handle integrity check failed: ${handle}`);
      return canonical;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async shortRef(ref: string): Promise<string> {
    // Verify the source before publishing any mapping, including legacy snapshots.
    await this.get(ref);
    if (ref.startsWith('p_')) return ref;
    const directory = join(this.directory, 'refs');
    await mkdir(directory, { recursive: true });
    for (const handle of shortProgramRefCandidates(ref)) {
      const owner = await this.readHandle(handle);
      if (owner === ref) return handle;
      if (owner !== undefined) continue;
      const temporary = join(directory, `.write-${randomUUID()}`);
      await writeFile(temporary, ref, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      try {
        try {
          // Publish complete mappings atomically without replacing another owner.
          await link(temporary, join(directory, `${handle}.ref`));
          return handle;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          if ((await this.readHandle(handle)) === ref) return handle;
        }
      } finally {
        await unlink(temporary);
      }
    }
    throw new Error('Unable to register an immutable program handle.');
  }

  async put(code: string): Promise<string> {
    const ref = await programReference(code);
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${ref.slice(7)}.js`);
    const temporary = join(this.directory, `.write-${randomUUID()}`);
    await writeFile(temporary, code, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    try {
      // Linking publishes complete bytes atomically and cannot replace an existing revision.
      try {
        await link(temporary, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await this.get(ref);
      }
    } finally {
      await unlink(temporary);
    }
    return ref;
  }
}

export function localProgramStore(
  env: Record<string, string | undefined> = process.env,
): FileProgramStore {
  return new FileProgramStore(localProgramStoreDirectory(env));
}
