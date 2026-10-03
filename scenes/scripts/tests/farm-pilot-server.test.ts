import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveSealedPilot } from '../capture-farm-parity';

test('sealed pilot advances past Bun busy-port diagnostics without probing or changing the pilot server', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kiln-pilot-busy-'));
  const root = join(workspace, '.tmp/pilot-r34/scene');
  await mkdir(root, { recursive: true });
  // The unchanged pilot logs error.message, which Bun spells without an EADDRINUSE code.
  await writeFile(join(root, 'serve.mjs'), `const port=Number(process.argv[2]); if(port===4400){console.error('Failed to start server. Is port 4400 in use?');process.exit(1);} console.log('Farm review: http://127.0.0.1:'+port+'/');setInterval(()=>{},1000);`);
  let hosted: Awaited<ReturnType<typeof serveSealedPilot>> | undefined;
  try {
    hosted = await serveSealedPilot(workspace, 'r34');
    expect(hosted.port).toBe(4401);
    expect(hosted.log).toHaveLength(2);
    expect(hosted.log[0]?.exit).toBe(1);
    await hosted.close();
    expect(hosted.closed).toBe(true);
    await hosted.close();
  } finally { await hosted?.close(); await rm(workspace, { recursive: true, force: true }); }
});

test('sealed pilot treats an integrity failure as an error, never as a busy port', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kiln-pilot-invalid-'));
  const root = join(workspace, '.tmp/pilot-r34/scene');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'serve.mjs'), `console.error('Scene content differs from delivery: index.html');process.exit(1);`);
  try { await expect(serveSealedPilot(workspace, 'r34')).rejects.toThrow('Scene content differs'); }
  finally { await rm(workspace, { recursive: true, force: true }); }
});
