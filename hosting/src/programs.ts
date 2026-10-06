import {
  assertProgramRef,
  MAX_PROGRAM_BYTES,
  programNotFound,
  programReference,
  type ProgramStore,
  type ProgramStoreStats,
} from '../../src/program-store';
import type { ArtifactStore } from './artifact-store';
import { HttpFailure, readBounded } from './http';

const SOURCE_NAME = 'source.kiln.js';
const SOURCE_MEDIA = 'application/javascript';

export function decodeProgram(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new HttpFailure(400, 'Program must be valid UTF-8');
  }
}

/** A host adapter for the existing engine contract, scoped to one tenant store. */
export class HostedProgramStore implements ProgramStore {
  private readonly pending = new Map<string, Promise<string>>();
  readonly retention =
    'unsaved source is kept for seven days after upload; saved source is retained until its last saved revision is deleted, within tenant quotas';

  constructor(private readonly artifacts: ArtifactStore) {}

  private canonical(ref: string): string {
    try {
      assertProgramRef(ref);
    } catch {
      throw new HttpFailure(400, 'Invalid program reference');
    }
    if (ref.startsWith('sha256:')) return ref;
    // Full-digest p_ handles are a supported engine shape. They are immutable
    // without an ever-growing alias table or reassigning an expired short prefix.
    if (ref.length === 66) return `sha256:${ref.slice(2)}`;
    throw this.notFound(ref);
  }

  private notFound(ref: string) {
    return new HttpFailure(
      404,
      programNotFound(
        ref,
        'This account has no retained source for that reference; unsaved source expires after seven days.',
      ).message,
    );
  }

  artifact(ref: string) {
    const canonical = this.canonical(ref);
    const record = this.artifacts.findContent(canonical.slice(7), SOURCE_NAME, SOURCE_MEDIA);
    if (!record) throw this.notFound(ref);
    return record;
  }

  async get(ref: string): Promise<string> {
    const record = this.artifact(ref);
    const response = await this.artifacts.download(record.id);
    try {
      const code = decodeProgram(await readBounded(response.body, MAX_PROGRAM_BYTES));
      if ((await programReference(code)) !== this.canonical(ref))
        throw new Error('Source digest mismatch');
      return code;
    } catch {
      throw new HttpFailure(502, 'Stored program integrity check failed');
    }
  }

  async put(code: string): Promise<string> {
    let ref: string;
    try {
      ref = await programReference(code);
    } catch {
      throw new HttpFailure(400, 'Program must be valid Unicode within the 1 MiB source limit');
    }
    const existing = this.pending.get(ref);
    if (existing) return existing;
    const storing = this.store(ref, code);
    this.pending.set(ref, storing);
    try {
      return await storing;
    } finally {
      this.pending.delete(ref);
    }
  }

  private async store(ref: string, code: string): Promise<string> {
    if (this.artifacts.findContent(ref.slice(7), SOURCE_NAME, SOURCE_MEDIA)) {
      await this.get(ref);
      return ref;
    }
    const bytes = new TextEncoder().encode(code);
    await this.artifacts.upload(
      new Request('https://tenant.internal/internal/artifacts', {
        method: 'POST',
        body: bytes,
        headers: {
          'content-type': SOURCE_MEDIA,
          'content-length': String(bytes.byteLength),
          'x-artifact-name': SOURCE_NAME,
          'x-artifact-sha256': ref.slice(7),
        },
      }),
    );
    return ref;
  }

  async shortRef(ref: string): Promise<string> {
    await this.get(ref);
    return `p_${this.canonical(ref).slice(7)}`;
  }

  async stats(): Promise<ProgramStoreStats> {
    return {
      ...this.artifacts.contentStats(SOURCE_NAME, SOURCE_MEDIA),
      maxSourceBytes: MAX_PROGRAM_BYTES,
      eviction: 'none',
    };
  }
}
