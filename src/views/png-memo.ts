import { createHash } from 'node:crypto';
import * as png from './png';
import type { DecodedPng } from './png';

/**
 * One frame passes three readers on its way to a model: the capture cache's check, the port's
 * trust check and the annotator. Each holds its own copy of the same bytes, so a decode keyed by
 * those bytes' SHA-256 lets the first reader decode and the others reuse it. Decoding is a pure
 * function of the bytes; every caller gets its own pixel buffer, because annotation draws on it.
 * A frame that fails to decode is never stored, so it fails for every reader.
 */
export function createPngDecodeMemo(
  maxBytes = 64 * 1024 * 1024,
): (bytes: Uint8Array) => DecodedPng {
  const entries = new Map<string, DecodedPng>();
  let held = 0;
  return (bytes) => {
    const key = createHash('sha256').update(bytes).digest('hex');
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key);
      entries.set(key, hit);
      return { ...hit, rgb: Uint8Array.from(hit.rgb) };
    }
    const decoded = png.decodePng(bytes);
    const size = decoded.rgb.byteLength;
    if (size <= maxBytes) {
      while (held + size > maxBytes) {
        const [oldest, value] = entries.entries().next().value!;
        entries.delete(oldest);
        held -= value.rgb.byteLength;
      }
      entries.set(key, { ...decoded, rgb: Uint8Array.from(decoded.rgb) });
      held += size;
    }
    return decoded;
  };
}

/** The host's shared frame decoder. */
export const decodePngShared = createPngDecodeMemo();
