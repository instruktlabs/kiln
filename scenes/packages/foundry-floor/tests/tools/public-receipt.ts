import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Keep the intake receipt beside the standalone entry and identical to its evidence copy.
 * Counts include the receipt itself. Only the decimal byte-count width can change while
 * serializing it, so stabilize that width before writing either copy. No chunk bytes change. */
export function writePublicReceipt<T extends { mode: string; outputFiles: number; outputBytes: number }>(output: string, evidence: string, measured: T): T {
  if (measured.mode !== 'public') throw new Error('Expected a public build receipt');
  const adjacent = resolve(output, 'bundle-public.json');
  if (existsSync(adjacent)) throw new Error(`Public receipt already exists: ${adjacent}`);
  const baseBytes = measured.outputBytes;
  const record = { ...measured, outputFiles: measured.outputFiles + 1 };
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    const total = baseBytes + bytes.length;
    if (record.outputBytes === total) {
      mkdirSync(dirname(evidence), { recursive: true });
      writeFileSync(adjacent, bytes);
      writeFileSync(evidence, bytes);
      return record;
    }
    record.outputBytes = total;
  }
  throw new Error('Public receipt byte count did not stabilize');
}
