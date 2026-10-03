import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  buildCompatibility,
  compatibilityFingerprint,
  RENDER_SERVICE_DEPENDENCIES,
  resolvedRendererDependencies,
} from '../src/build-identity.mjs';

import { buildHealthDocument } from '../src/health-contract.mjs';
import {
  describeInstance,
  fingerprintSourceDir,
  parseOwnerPid,
  processIsAlive,
  serviceLifecycleOptions,
} from '../src/instance.mjs';

// Pure, like every other test in this directory: no GPU, no socket, no Dawn.

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'kiln-instance-'));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  return dir;
}

test('the source fingerprint is stable, and changes with content, name and length', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'server.mjs'), 'one');
    writeFileSync(join(dir, 'nested', 'a.mjs'), 'aa');
    const first = fingerprintSourceDir(dir);
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
    assert.equal(fingerprintSourceDir(dir), first);

    writeFileSync(join(dir, 'server.mjs'), 'two');
    const edited = fingerprintSourceDir(dir);
    assert.notEqual(edited, first);

    // Installed packages are not source: a `node_modules` under the tree is
    // ignored, so `npm install` does not read as an edit.
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), 'ignored');
    assert.equal(fingerprintSourceDir(dir), edited);

    writeFileSync(join(dir, 'nested', 'b.mjs'), 'aa');
    assert.notEqual(fingerprintSourceDir(dir), edited, 'a new file changes it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an owner pid is a positive integer or nothing', () => {
  assert.equal(parseOwnerPid('4242'), 4242);
  assert.equal(parseOwnerPid(undefined), undefined);
  assert.equal(parseOwnerPid(''), undefined);
  assert.equal(parseOwnerPid('0'), undefined);
  assert.equal(parseOwnerPid('-3'), undefined);
  assert.equal(parseOwnerPid('abc'), undefined);
});

test('compatibility binds source and all expected dependency versions without loading native code', () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, 'server.mjs'), 'source');
    const first = buildCompatibility({ sourceDir: dir, dependencies: RENDER_SERVICE_DEPENDENCIES });
    assert.equal(first.fingerprint, compatibilityFingerprint(first));
    const dependencies = { ...RENDER_SERVICE_DEPENDENCIES, webgpu: '0.0.0' };
    assert.notEqual(first.fingerprint, compatibilityFingerprint({ ...first, dependencies }));
    assert.throws(
      () => compatibilityFingerprint({ ...first, dependencies: {} }),
      /Missing.*dependency/,
    );
    writeFileSync(join(dir, 'server.mjs'), 'changed');
    assert.notEqual(
      first.fingerprint,
      buildCompatibility({ sourceDir: dir, dependencies: RENDER_SERVICE_DEPENDENCIES }).fingerprint,
    );
    for (const [name, version] of Object.entries(RENDER_SERVICE_DEPENDENCIES)) {
      const packageDir = join(dir, 'node_modules', name);
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({ name, version, main: 'index.js' }),
      );
      writeFileSync(
        join(packageDir, 'index.js'),
        "throw new Error('must not execute native entry');",
      );
    }
    const anchor = pathToFileURL(join(dir, 'server.mjs'));
    assert.deepEqual(resolvedRendererDependencies(anchor), RENDER_SERVICE_DEPENDENCIES);
    writeFileSync(
      join(dir, 'node_modules', 'webgpu', 'package.json'),
      JSON.stringify({ name: 'webgpu', version: '0.4.0', main: 'index.js' }),
    );
    assert.throws(
      () => resolvedRendererDependencies(anchor),
      /webgpu version conflict.*0.6.2.*0.4.0/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('this process is alive; a pid nothing has is not', () => {
  assert.equal(processIsAlive(process.pid), true);
  // The largest pid Windows or Linux will hand out is far below this.
  assert.equal(processIsAlive(2 ** 22 + 12345), false);
});

test('managed lifecycle derives from explicit mode or owner provenance, with bounded idle', () => {
  assert.deepEqual(serviceLifecycleOptions({ RENDER_SERVICE_OWNER_PID: '77' }), {
    mode: 'managed',
    idleTimeoutMs: 300000,
  });
  assert.deepEqual(serviceLifecycleOptions({}), { mode: 'manual', idleTimeoutMs: 300000 });
  assert.equal(
    serviceLifecycleOptions({ RENDER_SERVICE_OWNER_PID: '77', RENDER_SERVICE_MODE: 'manual' }).mode,
    'manual',
  );
  assert.throws(() => serviceLifecycleOptions({ RENDER_SERVICE_MODE: 'unknown' }), /MODE/);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1.5', '3600001']) {
    assert.throws(() => serviceLifecycleOptions({ RENDER_SERVICE_IDLE_MS: value }), /IDLE/);
  }
});

test('the health document carries the instance block when one is given', () => {
  const gpuState = {
    rendererId: 'dawn-test:gpu:1',
    backend: 'test',
    summary: { device: 'test' },
  };
  const instance = describeInstance({
    pid: 123,
    ownerPid: undefined,
    startedAt: '2026-09-16T00:00:00.000Z',
    sourceDir: '/srv/render-service',
    sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  });
  assert.deepEqual(buildHealthDocument(gpuState, false, instance).instance, {
    version: 'kiln.render-service-instance.v2',
    pid: 123,
    ownerPid: null,
    mode: 'manual',
    idleTimeoutMs: null,
    startedAt: '2026-09-16T00:00:00.000Z',
    sourceDir: '/srv/render-service',
    sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  });
  // Without one the document is exactly what it was.
  assert.equal('instance' in buildHealthDocument(gpuState, false), false);
});
