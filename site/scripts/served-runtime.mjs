import { createHash } from 'node:crypto';
import { verifyInitialLoad } from './initial-runtime.mjs';
import { gzipMeasure } from './scene-runtime.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function verifyRuntimePayload(runtime, get) {
  let bytes = 0;
  let gzipBytes = 0;
  const chunks = runtime.chunks ?? [runtime];
  const names = new Set();
  for (const chunk of chunks) {
    if (!/^[A-Za-z0-9_-]+\.js$/.test(chunk.file) || names.has(chunk.file)) throw new Error('Invalid served chunk list');
    names.add(chunk.file);
    const content = await get(`/scene-runtime/${runtime.id}/${chunk.file}`);
    const gzip = gzipMeasure(content).bytes;
    if (content.length !== chunk.bytes || sha(content) !== chunk.sha256 || gzip !== chunk.gzipBytes) throw new Error(`Served chunk does not match its record: ${chunk.file}`);
    bytes += content.length;
    gzipBytes += gzip;
  }
  if (bytes !== runtime.bytes || gzipBytes !== runtime.gzipBytes || !chunks.some((chunk) => chunk.file === runtime.file && chunk.sha256 === runtime.sha256)) throw new Error('Served runtime aggregate does not match its record');
  verifyInitialLoad(runtime);
  if (runtime.kind === 'frame' && sha(await get(runtime.url)) !== runtime.frameSha256) throw new Error('Served frame does not match its record');
  return { files: chunks.length, bytes, gzipBytes };
}
