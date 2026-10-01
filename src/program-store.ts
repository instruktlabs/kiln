/** Immutable source snapshots. Storage is a host concern, separate from evaluation. */
export interface ProgramStore {
  put(code: string): Promise<string>;
  get(programRef: string): Promise<string>;
  shortRef?(programRef: string): Promise<string>;
  stats?(): Promise<ProgramStoreStats>;
  /** How long a returned reference stays resolvable, worded for the tool descriptions. */
  retention?: string;
}

/** Point-in-time accounting; file counts do not imply an integrity scan. */
export interface ProgramStoreStats {
  entries: number;
  bytes: number;
  maxSourceBytes: number;
  maxBytes?: number;
  eviction: 'none';
}

export const MAX_PROGRAM_BYTES = 1024 * 1024;
export const canonicalProgramRefPattern = /^sha256:[a-f0-9]{64}(?![\s\S])/;
export const programRefPattern =
  /^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\s\S])/;

export function assertProgramRef(ref: string): void {
  if (typeof ref !== 'string' || !programRefPattern.test(ref))
    throw new Error(
      'Invalid program reference; use a p_ handle or full sha256 reference returned by Kiln.',
    );
}

/**
 * An unknown reference is answered with the next call and no local path (v1 contract rule
 * 10). `where` says what this store knows, so a reader sees why the handle is unknown here.
 */
export function programNotFound(ref: string, where: string): Error {
  return new Error(
    `Program not found: ${ref}. ${where} Send the source again with kiln_validate or kiln_render ({ code }) and continue with the programRef that result returns.`,
  );
}

/** Prefer the store's immutable handle without changing the canonical put contract. */
export async function retainProgram(store: ProgramStore, code: string): Promise<string> {
  const canonical = await store.put(code);
  return store.shortRef ? store.shortRef(canonical) : canonical;
}

/** Bounded deterministic candidates. These are not resolvable until registered. */
export function* shortProgramRefCandidates(canonical: string): Generator<string> {
  if (!canonicalProgramRefPattern.test(canonical) || canonical.length !== 71)
    throw new Error('Invalid canonical program reference.');
  for (let length = 12; length <= 64; length += 4) yield `p_${canonical.slice(7, 7 + length)}`;
}

export async function programReference(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  if (bytes.length > MAX_PROGRAM_BYTES) throw new Error('Program exceeds the 1 MiB source limit.');
  // Reject strings that would change when persisted as UTF-8 (unpaired surrogates).
  if (new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) !== code)
    throw new Error('Program must be valid Unicode.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export class MemoryProgramStore implements ProgramStore {
  private readonly programs = new Map<string, string>();
  private readonly handles = new Map<string, string>();
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  private bytes = 0;
  readonly retention = 'kept in this process until it ends';

  async put(code: string): Promise<string> {
    const ref = await programReference(code);
    if (!this.programs.has(ref)) {
      const size = new TextEncoder().encode(code).length;
      if (this.bytes + size > this.maxBytes)
        throw new Error('Program store is full; export your work and start a new store.');
      this.programs.set(ref, code);
      this.bytes += size;
    }
    return ref;
  }

  async stats(): Promise<ProgramStoreStats> {
    return {
      entries: this.programs.size,
      bytes: this.bytes,
      maxSourceBytes: MAX_PROGRAM_BYTES,
      maxBytes: this.maxBytes,
      eviction: 'none',
    };
  }

  async get(ref: string): Promise<string> {
    assertProgramRef(ref);
    const canonical = ref.startsWith('p_') ? this.handles.get(ref) : ref;
    const code = canonical === undefined ? undefined : this.programs.get(canonical);
    if (code === undefined)
      throw programNotFound(ref, 'This in-memory store has no such reference.');
    return code;
  }

  async shortRef(ref: string): Promise<string> {
    await this.get(ref);
    if (ref.startsWith('p_')) return ref;
    for (const handle of shortProgramRefCandidates(ref)) {
      const owner = this.handles.get(handle);
      if (owner === ref) return handle;
      if (owner === undefined) {
        this.handles.set(handle, ref);
        return handle;
      }
    }
    throw new Error('Unable to register an immutable program handle.');
  }
}
