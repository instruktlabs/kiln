/**
 * Where a GLB's bytes actually differ, split by chunk.
 *
 * Ledger 6.1 asked whether the Linux/Windows divergence in exported GLBs is float
 * formatting, buffer padding, or accessor min/max precision, and closed without an
 * answer because comparing needed two machines. This is the instrument for that
 * comparison: run it on each platform and diff the output.
 *
 * The distinction it draws is the one that matters. A difference confined to the
 * JSON chunk is the container describing the same geometry differently, and can be
 * canonicalized away -- that is exactly what `asset.generator` turned out to be,
 * where the serializer wrote its own version number into every artifact. A
 * difference in the BIN chunk is different geometry: float math that came out
 * differently, most likely a transcendental that IEEE-754 does not bit-specify
 * across libm implementations. No canonicalization fixes that one, and knowing
 * which it is decides whether a content hash can ever be platform-stable.
 *
 *   bun scripts/glb-chunk-hashes.mjs [name ...]
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exampleArchivePath } from './example-archive.mjs';

import { resolveEvaluatorPortV2 } from '../src/evaluator/protocol';

const EXAMPLES = exampleArchivePath();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * A fixed sample rather than all 86, because this runs inside the gallery job and
 * the point is a cross-platform diff, not coverage. Chosen to span the generators
 * most likely to diverge: curved hulls, lathed and swept surfaces, radial arrays,
 * animation samplers and baked procedural textures.
 */
const SAMPLE = [
  'abyssal-surveyor',
  'arcade-cabinet',
  'brass-tellurion',
  'carousel',
  'cathedral',
  'penny-farthing',
  'robot-arm',
  'windmill',
];

/** Split a GLB container into its declared chunks without parsing the JSON. */
function chunks(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const out = [];
  let offset = 12;
  while (offset + 8 <= glb.byteLength) {
    const length = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true) === 0x4e4f534a ? 'json' : 'bin';
    out.push({ kind, bytes: glb.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  return out;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLE;
const evaluator = resolveEvaluatorPortV2(undefined, 'trusted-local');
const rows = [];
for (const name of names) {
  const source = await readFile(join(EXAMPLES, `${name}.kiln.js`), 'utf8');
  const { glb } = await evaluator.render(source);
  const bytes = glb instanceof Uint8Array ? glb : new Uint8Array(glb);
  const parts = chunks(bytes);
  const json = parts.find((part) => part.kind === 'json');
  const bin = parts.find((part) => part.kind === 'bin');
  rows.push({
    name,
    total: bytes.byteLength,
    artifact: sha(bytes),
    json: json ? sha(json.bytes) : null,
    jsonBytes: json?.bytes.byteLength ?? 0,
    bin: bin ? sha(bin.bytes) : null,
    binBytes: bin?.bytes.byteLength ?? 0,
  });
}

console.log(`platform=${process.platform} arch=${process.arch} node=${process.version}`);
console.log('name                  total     artifact          json              bin');
for (const row of rows)
  console.log(
    `${row.name.padEnd(21)} ${String(row.total).padStart(8)}  ${row.artifact}  ${row.json}  ${row.bin}`,
  );
console.log(`\nJSON+BIN digest: ${sha(rows.map((r) => `${r.name}:${r.json}:${r.bin}`).join('|'))}`);
