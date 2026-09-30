/** Workspace-local immutable projects. Exclusive publication is the cross-process CAS. */
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { localWorkspaceRoot } from './workspace-location';
import {
  MAX_PROJECT_BYTES,
  MAX_PROJECT_REVISIONS,
  ProjectConflictError,
  ProjectExistsError,
  ProjectNotFoundError,
  projectDraftSchema,
  projectIdSchema,
  projectPatchSchema,
  projectRevisionIdSchema,
  projectRevisionSchema,
  type ProjectDraft,
  type ProjectPatch,
  type ProjectRevision,
  type ProjectStore,
} from './projects';

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const exists = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST';
const filename = (sequence: number) => `${String(sequence).padStart(10, '0')}.json`;
function sequenceOf(revisionId: string): number {
  projectRevisionIdSchema.parse(revisionId);
  const sequence = Number(revisionId.slice(2, 12));
  if (sequence < 1 || sequence > MAX_PROJECT_REVISIONS)
    throw new Error('Invalid project revision sequence');
  return sequence;
}
function digest(record: ProjectRevision): string {
  const { revisionId: _, ...payload } = record;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export class FileProjectStore implements ProjectStore {
  readonly workspace: string;
  readonly directory: string;
  constructor(workspace: string) {
    if (!workspace.trim()) throw new Error('A workspace directory is required');
    this.workspace = resolve(workspace);
    this.directory = join(this.workspace, '.kiln', 'projects');
  }

  /** Reject links below the explicitly selected workspace, including .kiln itself. */
  private async path(projectId?: string, create = false): Promise<string> {
    if (projectId !== undefined) projectIdSchema.parse(projectId);
    if (create) await mkdir(this.workspace, { recursive: true });
    const canonical = await realpath(this.workspace);
    let path = this.workspace;
    for (const part of ['.kiln', 'projects', ...(projectId ? [projectId, 'revisions'] : [])]) {
      path = join(path, part);
      if (create)
        await mkdir(path).catch((error: unknown) => {
          if (!exists(error)) throw error;
        });
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('Project symlinks are not supported');
      if (!info.isDirectory()) throw new Error('Invalid project directory');
      const rel = relative(canonical, await realpath(path));
      if (rel === '..' || rel.startsWith(`..${sep}`))
        throw new Error('Project path escapes workspace');
    }
    return path;
  }

  private async latestSequence(directory: string): Promise<number> {
    let latest = 0;
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (!/^[0-9]{10}\.json$/.test(item.name)) continue;
      if (!item.isFile()) throw new Error('Invalid project revision file');
      const sequence = Number(item.name.slice(0, 10));
      if (sequence < 1 || sequence > MAX_PROJECT_REVISIONS)
        throw new Error('Invalid project revision sequence');
      latest = Math.max(latest, sequence);
    }
    return latest;
  }

  private async load(
    projectId: string,
    directory: string,
    sequence: number,
  ): Promise<ProjectRevision> {
    const path = join(directory, filename(sequence));
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PROJECT_BYTES)
      throw new Error('Invalid or oversized project revision file');
    const handle = await open(path, 'r');
    let bytes: Uint8Array;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.size > MAX_PROJECT_BYTES ||
        opened.ino !== info.ino ||
        opened.dev !== info.dev
      )
        throw new Error('Project revision changed while opening');
      bytes = new Uint8Array(opened.size);
      let read = 0;
      while (read < bytes.length) {
        const result = await handle.read(bytes, read, bytes.length - read, read);
        if (!result.bytesRead) throw new Error('Incomplete project revision file');
        read += result.bytesRead;
      }
      if ((await handle.stat()).size !== bytes.length)
        throw new Error('Project revision changed while reading');
    } finally {
      await handle.close();
    }
    const record = projectRevisionSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (
      record.projectId !== projectId ||
      sequenceOf(record.revisionId) !== sequence ||
      record.revisionId.slice(13) !== digest(record)
    )
      throw new Error('Project revision integrity failure');
    if (
      (sequence === 1 && record.parentRevision !== undefined) ||
      (sequence > 1 &&
        (!record.parentRevision || sequenceOf(record.parentRevision) !== sequence - 1))
    )
      throw new Error('Project revision parent integrity failure');
    return record;
  }

  async list(): Promise<ProjectRevision[]> {
    let directory: string;
    try {
      directory = await this.path();
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const records: ProjectRevision[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!projectIdSchema.safeParse(entry.name).success) continue;
      if (entry.isSymbolicLink()) throw new Error('Project symlinks are not supported');
      if (!entry.isDirectory()) continue;
      try {
        records.push(await this.read(entry.name));
      } catch (error) {
        if (!(error instanceof ProjectNotFoundError)) throw error;
      }
    }
    return records.sort((a, b) => a.projectId.localeCompare(b.projectId));
  }

  async read(projectId: string, revisionId?: string): Promise<ProjectRevision> {
    projectIdSchema.parse(projectId);
    if (revisionId !== undefined) sequenceOf(revisionId);
    try {
      const directory = await this.path(projectId);
      const sequence = revisionId ? sequenceOf(revisionId) : await this.latestSequence(directory);
      if (!sequence) throw new ProjectNotFoundError(projectId, revisionId);
      const record = await this.load(projectId, directory, sequence);
      if (revisionId && record.revisionId !== revisionId)
        throw new ProjectNotFoundError(projectId, revisionId);
      return record;
    } catch (error) {
      if (missing(error)) throw new ProjectNotFoundError(projectId, revisionId);
      throw error;
    }
  }

  private async publish(
    record: ProjectRevision,
    expectedRevision?: string,
  ): Promise<ProjectRevision> {
    const bytes = new TextEncoder().encode(`${JSON.stringify(record, null, 2)}\n`);
    if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Project revision exceeds 1 MiB');
    // Validate review context before publishing anything. Asset references are annotations;
    // asset existence and acceptance still belong to the library/host, not this store.
    for (const revision of new Set(record.reviews.map((review) => review.projectRevisionId)))
      await this.read(record.projectId, revision);
    const directory = await this.path(record.projectId, true);
    const temporary = join(directory, `.write-${randomUUID()}`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        // Publishing a complete file to a sequence slot cannot replace an existing winner.
        // Interrupted writers leave only ignored staging files, never a stale lock/head.
        await link(temporary, join(directory, filename(sequenceOf(record.revisionId))));
      } catch (error) {
        if (!exists(error)) throw error;
        if (!expectedRevision) throw new ProjectExistsError(record.projectId);
        const current = await this.read(record.projectId);
        throw new ProjectConflictError(record.projectId, expectedRevision, current.revisionId);
      }
    } finally {
      await unlink(temporary);
    }
    return record;
  }

  private record(
    projectId: string,
    sequence: number,
    data: unknown,
    parentRevision?: string,
  ): ProjectRevision {
    if (sequence > MAX_PROJECT_REVISIONS) throw new Error('Project revision limit reached');
    const prefix = `r_${String(sequence).padStart(10, '0')}_`;
    const record = projectRevisionSchema.parse({
      ...(data as object),
      version: 'kiln.project.v1',
      projectId,
      revisionId: `${prefix}${'0'.repeat(64)}`,
      parentRevision,
      createdAt: new Date().toISOString(),
    });
    record.revisionId = `${prefix}${digest(record)}`;
    return record;
  }

  async create(draft: ProjectDraft): Promise<ProjectRevision> {
    const { projectId = `p_${randomUUID().replaceAll('-', '')}`, ...data } =
      projectDraftSchema.parse(draft);
    return this.publish(this.record(projectId, 1, data));
  }

  async update(
    projectId: string,
    expectedRevision: string,
    patch: ProjectPatch,
  ): Promise<ProjectRevision> {
    projectIdSchema.parse(projectId);
    sequenceOf(expectedRevision);
    const parsed = Object.fromEntries(
      Object.entries(projectPatchSchema.parse(patch)).filter(([, value]) => value !== undefined),
    );
    const previous = await this.read(projectId);
    if (previous.revisionId !== expectedRevision)
      throw new ProjectConflictError(projectId, expectedRevision, previous.revisionId);
    const {
      version: _,
      projectId: __,
      revisionId: ___,
      parentRevision: ____,
      createdAt: _____,
      ...data
    } = previous;
    return this.publish(
      this.record(
        projectId,
        sequenceOf(expectedRevision) + 1,
        { ...data, ...parsed },
        expectedRevision,
      ),
      expectedRevision,
    );
  }
}

export function localProjectStore(
  env: Record<string, string | undefined> = process.env,
): FileProjectStore {
  return new FileProjectStore(localWorkspaceRoot(env));
}
