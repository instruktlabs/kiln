import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const image = process.argv[2];
if (!image || !/^[a-zA-Z0-9._:/@-]+$/.test(image))
  throw new Error('Supply the built image reference');
const output = resolve(process.argv[3] ?? join(root, '.cache/software-render-entry/qualification'));
if (!output.startsWith(join(root, '.cache') + sep))
  throw new Error('Receipt must be in the checkout cache');
await mkdir(output, { recursive: true });
const name = `kiln-render-qualification-${randomUUID()}`;
const published = JSON.parse(
  await readFile(join(root, '.github/published-candidate.json'), 'utf8'),
);
const receipt = {
  image,
  container: name,
  engine: published,
  status: 'running',
  cloudflareQualified: false,
  hostileSourceQualified: false,
};
async function docker(args, input) {
  return new Promise((done, fail) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const stdout = [],
      stderr = [];
    let bytes = 0,
      excessive = false;
    for (const [stream, chunks] of [
      [child.stdout, stdout],
      [child.stderr, stderr],
    ])
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 20 * 1024 * 1024) {
          excessive = true;
          child.kill();
        } else chunks.push(chunk);
      });
    child.stdin.on('error', () => {});
    child.once('error', fail);
    child.once('close', (code) =>
      code === 0 && !excessive
        ? done(Buffer.concat(stdout).toString('utf8'))
        : fail(new Error(`Docker ${args[0]} failed: ${Buffer.concat(stderr).toString('utf8')}`)),
    );
    child.stdin.end(input);
  });
}
try {
  receipt.imageIdentity = JSON.parse(
    await docker([
      'image',
      'inspect',
      image,
      '--format',
      '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"user":{{json .Config.User}}}',
    ]),
  );
  assert.equal(receipt.imageIdentity.os, 'linux');
  assert.equal(receipt.imageIdentity.architecture, 'amd64');
  assert.equal(receipt.imageIdentity.user, 'node');
  await docker([
    'create',
    '--interactive',
    '--name',
    name,
    '--network',
    'none',
    '--cpus',
    '2',
    '--memory',
    '4g',
    '--memory-swap',
    '4g',
    '--pids-limit',
    '128',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    image,
    'node',
    '--input-type=module',
  ]);
  assert.equal(
    (await docker(['inspect', name, '--format', '{{.Image}}'])).trim(),
    receipt.imageIdentity.id,
  );
  const fixture = await readFile(new URL('./software-render-fixture.mjs', import.meta.url));
  receipt.fixtureSha256 = createHash('sha256').update(fixture).digest('hex');
  receipt.result = JSON.parse(await docker(['start', '--attach', '--interactive', name], fixture));
  assert.equal(receipt.result.version, published.version);
  assert.equal(receipt.result.archiveSha256, published.sha256);
  assert.equal(receipt.result.images.length, 8);
  for (const item of receipt.result.images) {
    assert.match(item.name, /^[a-z0-9-]+\.png$/);
    const bytes = Buffer.from(item.base64, 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    await writeFile(join(output, item.name), bytes);
    delete item.base64;
  }
  for (const file of ['package-lock.json', 'os-packages.txt', 'node-version.txt'])
    await docker(['cp', `${name}:/opt/kiln/${file}`, join(output, file)]);
  receipt.lockSha256 = createHash('sha256')
    .update(await readFile(join(output, 'package-lock.json')))
    .digest('hex');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    await docker(['rm', '--force', name]);
    assert.equal(
      (await docker(['ps', '--all', '--quiet', '--filter', `name=^/${name}$`])).trim(),
      '',
    );
    receipt.removed = true;
  } catch (error) {
    receipt.cleanupError = error.message;
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(JSON.stringify(receipt, null, 2));
