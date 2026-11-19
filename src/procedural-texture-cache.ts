/**
 * Compiled procedural pixels for ONE build, keyed by full recipe identity.
 *
 * A program (or a texture atlas) may compile the same recipe more than once in a build; a
 * compile is a pure function of the canonical recipe, so the second compile can copy the
 * first one's pixels. The cache belongs to one sandbox and dies with it: nothing is shared
 * between builds. Callers always receive a private buffer, so a program that edits a
 * texture's pixels can never change what a later compile of the same recipe returns.
 */
export class ProceduralPixelCache {
  private readonly entries = new Map<string, Uint8Array>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;

  /** @param budgetBytes Pixels kept for reuse; a compile that would exceed it is not kept. */
  constructor(private readonly budgetBytes = 64 * 1024 * 1024) {}

  /**
   * The pixels for `key`, compiling them on the first request. `key` must name the full
   * recipe identity (compiler and canonical recipe JSON).
   */
  pixels(key: string, compile: () => Uint8Array): Uint8Array {
    const kept = this.entries.get(key);
    if (kept) {
      this.hits++;
      return kept.slice();
    }
    this.misses++;
    const pixels = compile();
    if (this.bytes + pixels.byteLength <= this.budgetBytes) {
      this.entries.set(key, pixels.slice());
      this.bytes += pixels.byteLength;
    }
    return pixels;
  }

  stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}

export interface ProceduralCompileOptions {
  /** The build's pixel cache; omit to compile without reuse. */
  cache?: ProceduralPixelCache;
}
