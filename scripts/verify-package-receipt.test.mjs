import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiptProblems, verifyReceipt } from './verify-package-receipt.mjs';

const manifest = {
  name: '@instruktlabs/kiln',
  version: '0.7.0',
  engines: { node: '^20.15.0 || >=22.2.0' },
};
const toolchain = { bun: '1.4.2', node: '22.23.2', npm: '12.0.2' };

/** A receipt that must pass, so every case below differs from it by exactly one field. */
const good = () => ({
  status: 'passed',
  platform: 'linux',
  arch: 'x64',
  node: 'v22.23.2',
  npm: '12.0.2',
  engineVersion: '0.7.0',
  engineName: '@instruktlabs/kiln',
  tarballSha256: 'unchecked-here',
  tarball: '/nonexistent.tgz',
  checks: [
    'installed-consumer-documents',
    'plain-node-sdk-exports',
    'sdk-subprocess-render',
    'compiled-evaluator-worker',
    'discovery-stability-labels',
    'local-plugin-bundle',
    'npm-mcp-entry',
    'packaged-node-worker',
    'community-exporter-textured-subprocess',
    'source-reference-edit-images',
    'server-restart-persistence',
    'exact-source-export',
    'csg-wasm',
  ],
});

const target = { platform: 'linux', arch: 'x64', manifest, toolchain };

describe('package receipt verification', () => {
  test('a receipt matching the release is accepted', () => {
    expect(receiptProblems(good(), target)).toEqual([]);
  });

  test.each(['1.2.0', '1.2.0-rc.1', '1.10.0', '2.0.0'])(
    '%s requires the installed named operation check',
    (version) => {
      const candidate = { ...target, manifest: { ...manifest, version } };
      const receipt = { ...good(), engineVersion: version };
      expect(receiptProblems(receipt, candidate)).toEqual([
        'missing check: installed-named-operation-contract',
      ]);
      receipt.checks.push('installed-named-operation-contract');
      expect(receiptProblems(receipt, candidate)).toEqual([]);
    },
  );

  test('published 1.1 does not claim a future operation API', () => {
    expect(
      receiptProblems(
        { ...good(), engineVersion: '1.1.0' },
        {
          ...target,
          manifest: { ...manifest, version: '1.1.0' },
        },
      ),
    ).toEqual([]);
  });

  test('consumer qualification requires the exact explicitly selected Node and npm', () => {
    const consumer = { ...good(), node: 'v20.15.0', npm: '10.7.0' };
    const selected = { ...target, node: '20.15.0', npm: '10.7.0' };
    expect(receiptProblems(consumer, selected)).toEqual([]);
    expect(receiptProblems({ ...consumer, node: 'v20.16.0' }, selected)).toEqual([
      'node: expected v20.15.0, receipt says v20.16.0',
    ]);
    expect(receiptProblems(consumer, target)).toHaveLength(2);
  });

  // One case per field, because the whole reason this left the workflow as a one-liner
  // is that a per-platform copy can assert the wrong platform and still pass.
  test.each([
    ['status', { status: 'failed' }, 'status'],
    ['platform', { platform: 'darwin' }, 'platform'],
    ['arch', { arch: 'arm64' }, 'arch'],
    ['node', { node: 'v22.22.0' }, 'node'],
    ['npm', { npm: '11.0.0' }, 'npm'],
    ['engineVersion', { engineVersion: '0.6.0' }, 'engineVersion'],
    ['engineName', { engineName: '@kiln/engine' }, 'engineName'],
  ])('a receipt disagreeing about %s is rejected', (_label, patch, named) => {
    const problems = receiptProblems({ ...good(), ...patch }, target);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(named);
  });

  test('a dropped check is named individually', () => {
    const receipt = good();
    receipt.checks = receipt.checks.filter((c) => c !== 'server-restart-persistence');
    expect(receiptProblems(receipt, target)).toEqual(['missing check: server-restart-persistence']);
  });

  test('a receipt with no checks at all reports every one of them', () => {
    expect(receiptProblems({ ...good(), checks: undefined }, target)).toHaveLength(12);
  });

  test('a package shipping project adoption requires its installed storage-reuse proof', () => {
    const candidate = {
      ...target,
      manifest: { ...manifest, files: ['scripts/workspace-project.mjs'] },
    };
    expect(receiptProblems(good(), candidate)).toContain(
      'missing check: installed-project-adoption-and-cross-client-storage',
    );
    const receipt = good();
    receipt.checks.push('installed-project-adoption-and-cross-client-storage');
    expect(
      receiptProblems(
        { ...receipt, projectAdoption: { status: 'not-supported-by-this-release' } },
        candidate,
      ),
    ).toContain(
      'projectAdoption.status: expected passed, receipt says not-supported-by-this-release',
    );
    expect(
      receiptProblems({ ...receipt, projectAdoption: { status: 'passed' } }, candidate),
    ).toEqual([]);
    expect(receiptProblems(good(), target)).toEqual([]);
  });

  test.each([
    'installed-consumer-documents',
    'plain-node-sdk-exports',
    'sdk-subprocess-render',
    'compiled-evaluator-worker',
    'discovery-stability-labels',
    'local-plugin-bundle',
    'npm-mcp-entry',
  ])('cannot claim v1 package qualification without %s', (check) => {
    const receipt = good();
    receipt.checks = receipt.checks.filter((item) => item !== check);
    expect(receiptProblems(receipt, target)).toEqual([`missing check: ${check}`]);
  });

  test('a package missing candidate texture coverage is rejected', () => {
    const receipt = good();
    receipt.checks = receipt.checks.filter((c) => c !== 'community-exporter-textured-subprocess');
    expect(receiptProblems(receipt, target)).toEqual([
      'missing check: community-exporter-textured-subprocess',
    ]);
  });

  // The end-to-end path, including the hash the release actually depends on.
  test('the tarball hash is checked against the file, and --tarball overrides the path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-receipt-'));
    const tarball = join(dir, 'kiln-engine-0.7.0.tgz');
    const bytes = Buffer.from('not really a tarball');
    await writeFile(tarball, bytes);

    const receipt = {
      ...good(),
      tarballSha256: createHash('sha256').update(bytes).digest('hex'),
      // A path belonging to a runner that no longer exists, which is what a downloaded
      // receipt always carries.
      tarball: '/runner/work/kiln/candidate/kiln-engine-0.7.0.tgz',
    };
    await writeFile(join(dir, 'package-smoke.json'), JSON.stringify(receipt));
    await writeFile(join(dir, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(dir, 'toolchain.json'), JSON.stringify(toolchain));

    // The receipt is addressed explicitly, because `--receipt` is relative to the working
    // directory and this fixture lives in a temp directory. The original version resolved
    // it against `root` instead, and this test passed anyway -- `root` and the receipt's
    // directory were the same here, exactly as they are in the CI step. Keeping them
    // different is what makes the assertion mean something.
    const argv = [
      '--platform',
      'linux',
      '--arch',
      'x64',
      '--receipt',
      join(dir, 'package-smoke.json'),
    ];
    // Without the override it reports the unreadable path rather than crashing.
    const unresolvable = await verifyReceipt(argv, dir);
    expect(unresolvable).toHaveLength(1);
    expect(unresolvable[0]).toContain('unreadable');

    expect(await verifyReceipt([...argv, '--tarball', tarball], dir)).toEqual([]);

    // And a tarball that is present but wrong is rejected, not waved through.
    await writeFile(tarball, Buffer.from('tampered'));
    const tampered = await verifyReceipt([...argv, '--tarball', tarball], dir);
    expect(tampered).toHaveLength(1);
    expect(tampered[0]).toContain('tarballSha256');
  });

  test('--receipt is relative to the working directory, not to root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-receipt-cwd-'));
    await writeFile(join(dir, 'package-smoke.json'), JSON.stringify(good()));
    // `root` is a DIFFERENT directory that has the manifest but no receipt. If the receipt
    // were resolved against it, this would throw ENOENT instead of reporting problems.
    const manifestRoot = await mkdtemp(join(tmpdir(), 'kiln-receipt-root-'));
    await writeFile(join(manifestRoot, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(manifestRoot, 'toolchain.json'), JSON.stringify(toolchain));

    const problems = await verifyReceipt(
      ['--platform', 'linux', '--arch', 'x64', '--receipt', join(dir, 'package-smoke.json')],
      manifestRoot,
    );
    // Only the tarball is unreadable; every field check found the receipt and passed.
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('unreadable');
  });

  test('an unknown platform is refused before anything is read', async () => {
    await expect(verifyReceipt(['--platform', 'solaris', '--arch', 'x64'], '.')).rejects.toThrow(
      'must be one of',
    );
    await expect(verifyReceipt(['--platform', 'linux'], '.')).rejects.toThrow('--arch is required');
  });
});
