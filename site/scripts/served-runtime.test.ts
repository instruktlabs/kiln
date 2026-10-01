import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { verifyRuntimePayload } from './served-runtime.mjs';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
test('served split chunks are fetched and individually verified before aggregate size acceptance', async () => {
  const bytes = [Buffer.from('import "./renderer-abc.js"'), Buffer.from('export const value = 1')];
  const chunks = bytes.map((buffer, index) => ({ file: index ? 'renderer-abc.js' : 'index-def.js', bytes: buffer.length, gzipBytes: gzipSync(buffer).length, sha256: sha(buffer) }));
  const manifest = { id: 'foundry-floor', file: chunks[0]!.file, sha256: chunks[0]!.sha256, chunks, bytes: bytes.reduce((sum, part) => sum + part.length, 0), gzipBytes: chunks.reduce((sum, part) => sum + part.gzipBytes, 0) };
  const get = async (path: string) => bytes[path.endsWith('renderer-abc.js') ? 1 : 0]!;
  expect(await verifyRuntimePayload(manifest, get)).toEqual({ files: 2, bytes: manifest.bytes, gzipBytes: manifest.gzipBytes });
  bytes[1] = Buffer.from('corrupted');
  await expect(verifyRuntimePayload(manifest, get)).rejects.toThrow('renderer-abc.js');
});
