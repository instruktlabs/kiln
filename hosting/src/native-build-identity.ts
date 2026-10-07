import { createHash } from 'node:crypto';
import type { AssetDraft } from '@instruktlabs/kiln/assets';

const unavailable = () => new Error('Saved asset has no matching verified evaluation');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function key(code: string | undefined, glb: Uint8Array): string {
  if (
    typeof code !== 'string' ||
    Buffer.byteLength(code) > 1024 * 1024 ||
    !(glb instanceof Uint8Array) ||
    glb.byteLength === 0 ||
    glb.byteLength > 4 * 1024 * 1024
  )
    throw unavailable();
  return `${hash(code)}:${hash(glb)}`;
}

/** One admitted request's accepted evaluations; never persisted or supplied by authored source. */
export class NativeBuildIdentities {
  private readonly records = new Map<string, string>();
  record(code: string, glb: Uint8Array, image: string | undefined): void {
    if (typeof image !== 'string' || !/^sha256:[a-f0-9]{64}(?![\s\S])/.test(image))
      throw unavailable();
    const id = key(code, glb),
      value = `cloudflare-container:${image}`;
    const prior = this.records.get(id);
    if ((prior && prior !== value) || (!prior && this.records.size >= 16)) throw unavailable();
    this.records.set(id, value);
  }
  forDraft(draft: Pick<AssetDraft, 'code' | 'glb'>): string {
    const value = this.records.get(key(draft.code, draft.glb));
    if (!value) throw unavailable();
    return value;
  }
}
