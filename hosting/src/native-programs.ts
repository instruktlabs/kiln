import {
  assertProgramRef,
  MAX_PROGRAM_BYTES,
  programNotFound,
  programReference,
  type ProgramStore,
  type ProgramStoreStats,
} from '../../src/program-store';
import { HOSTED_PROGRAM_RETENTION } from './program-contract';

import { NativeHttpClient, StorageFailure, type NativeStorageOptions } from './native-http';

const malformed = () => new StorageFailure(502, 'Invalid source storage response');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Native host adapter only. No tenant selector, cloud credential or arbitrary URL is accepted. */
export class NativeProgramStore implements ProgramStore {
  readonly retention = HOSTED_PROGRAM_RETENTION;
  private readonly storage: NativeHttpClient;
  constructor(options: NativeStorageOptions = {}) {
    this.storage = new NativeHttpClient(options, 'Source storage');
  }

  private canonical(ref: string): string {
    assertProgramRef(ref);
    if (ref.startsWith('sha256:')) return ref;
    if (ref.length === 66) return `sha256:${ref.slice(2)}`;
    throw this.notFound(ref);
  }

  private notFound(ref: string): Error {
    return programNotFound(ref, 'This account has no retained source for that reference.');
  }

  private async json(body?: Uint8Array<ArrayBuffer>): Promise<Record<string, unknown>> {
    const bytes = await this.storage.bytes('/internal/programs', {
      limit: 2048,
      body,
      method: body === undefined ? 'GET' : 'POST',
      statuses: body === undefined ? [200] : [201],
      headers: body === undefined ? undefined : { 'content-type': 'application/javascript' },
    });
    try {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!record(value)) throw malformed();
      return value;
    } catch {
      throw malformed();
    }
  }

  async put(code: string): Promise<string> {
    const ref = await programReference(code);
    const response = await this.json(new TextEncoder().encode(code));
    if (
      response.programRef !== ref ||
      response.shortRef !== `p_${ref.slice(7)}` ||
      typeof response.artifactId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(response.artifactId)
    )
      throw malformed();
    return ref;
  }

  async get(ref: string): Promise<string> {
    const canonical = this.canonical(ref);
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.bytes(`/internal/programs/${encodeURIComponent(ref)}`, {
        limit: MAX_PROGRAM_BYTES,
      });
    } catch (error) {
      if (error instanceof StorageFailure && error.status === 404) throw this.notFound(ref);
      throw error;
    }
    try {
      const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if ((await programReference(source)) !== canonical) throw malformed();
      return source;
    } catch {
      throw new StorageFailure(502, 'Stored program integrity check failed');
    }
  }

  async shortRef(ref: string): Promise<string> {
    await this.get(ref);
    return `p_${this.canonical(ref).slice(7)}`;
  }

  async stats(): Promise<ProgramStoreStats> {
    const value = await this.json();
    if (
      !count(value.entries) ||
      !count(value.bytes) ||
      (value.maxBytes !== undefined && !count(value.maxBytes)) ||
      value.maxSourceBytes !== MAX_PROGRAM_BYTES ||
      value.eviction !== 'none'
    )
      throw malformed();
    return {
      entries: value.entries,
      bytes: value.bytes,
      ...(value.maxBytes === undefined ? {} : { maxBytes: value.maxBytes }),
      maxSourceBytes: MAX_PROGRAM_BYTES,
      eviction: 'none',
    };
  }
}
