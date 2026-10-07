#!/usr/bin/env node
// One-shot fixed probe, never an HTTP evaluation service. Run inside the target image.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  captureCgroupSnapshot,
  qualifyNativeRuntime,
  qualifyNestedEvaluator,
  qualifyUnsupportedEvaluator,
} from './native-qualification.mjs';

const [installationArg, outputArg, archiveArg, mode] = process.argv.slice(2);
assert(
  installationArg &&
    outputArg &&
    archiveArg &&
    (process.argv.length === 5 ||
      (process.argv.length === 6 &&
        ['--isolation-only', '--expect-unsupported-isolation'].includes(mode))),
  'Usage: run-native-qualification.mjs INSTALLED_PACKAGE NEW_OUTPUT_DIRECTORY EXACT_ARCHIVE [--isolation-only | --expect-unsupported-isolation]',
);
const isolationOnly = mode === '--isolation-only';
const expectUnsupported = mode === '--expect-unsupported-isolation';
const qualificationVersion = expectUnsupported
  ? 'kiln.unsupported-evaluator-rejection.v1'
  : isolationOnly
    ? 'kiln.nested-evaluator-qualification.v1'
    : 'kiln.host-native-qualification.v1';
const installation = await realpath(resolve(installationArg));
const output = resolve(outputArg);
const parent = await realpath(resolve(output, '..'));
assert(
  parent !== installation && !parent.startsWith(installation + sep),
  'Output must be outside the installed engine',
);
// Do not replace receipts, arbitrary files, or a redirected output directory.
await mkdir(output);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  uid: process.getuid?.() ?? null,
  provider: 'unverified',
  processMeasurements: { scope: 'probe parent process only; excludes evaluator/renderer children' },
};
const cgroupSnapshot = () => captureCgroupSnapshot(readFile);
try {
  const pkg = JSON.parse(await readFile(join(installation, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@instruktlabs/kiln');
  const archive = await readFile(resolve(archiveArg));
  record.candidate = { name: pkg.name, version: pkg.version, archiveSha256: sha(archive) };
  record.files = {};
  for (const file of [
    'lib/evaluator/isolation.js',
    'lib/evaluator/worker.js',
    'lib/evaluator/probe-worker.js',
    'dist/cli.mjs',
  ]) {
    record.files[file] = sha(await readFile(join(installation, file)));
  }
  record.dependencyLockSha256 = sha(
    await readFile(join(installation, '../../..', 'package-lock.json')),
  );
  const module = (path) => import(pathToFileURL(join(installation, path)).href);
  const evaluator = await module('lib/evaluator/index.js');
  const host = isolationOnly
    ? { bwrapPath: '/usr/local/bin/kiln-probe-bwrap', nodePath: process.execPath }
    : { bwrapPath: '/usr/bin/bwrap' };
  const require = createRequire(pathToFileURL(join(installation, 'package.json')));
  const { PNG } = require('pngjs');
  record.cgroupBefore = await cgroupSnapshot();
  const qualify = expectUnsupported
    ? qualifyUnsupportedEvaluator
    : isolationOnly
      ? qualifyNestedEvaluator
      : qualifyNativeRuntime;
  const result = await qualify({
    platform: process.platform,
    uid: record.uid,
    ready: () => evaluator.assertIsolatedEvaluatorReady(host),
    readinessCode: evaluator.isolationReadinessFailureCode,
    namespaceDenied: async () => {
      const probe = spawnSync('/usr/bin/unshare', ['--user', '--map-root-user', '/usr/bin/true'], {
        env: { LC_ALL: 'C' },
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 4096,
      });
      const denied =
        probe.status === 1 &&
        probe.signal === null &&
        !probe.error &&
        /^unshare: unshare failed: (Operation not permitted|Permission denied)\s*$/.test(
          probe.stderr,
        );
      record.namespaceProbe = {
        status: probe.status,
        signal: probe.signal,
        error: probe.error?.code ?? null,
        permissionDenied: denied,
      };
      return denied;
    },
    render: (source, controls) =>
      evaluator.renderGLBViaIsolatedEvaluator(source, {}, { ...controls, host }),
    cpu: async (glb) => {
      const views = await module('lib/views/index.js');
      return views.renderGlbViewCell(
        glb,
        { name: 'qualification', dir: [1, 0.4, 1] },
        { size: 128 },
      );
    },
    inspectPng: (bytes) => {
      const image = PNG.sync.read(Buffer.from(bytes));
      const pixels = new Set();
      for (let index = 0; index < image.data.length; index += 4)
        pixels.add(image.data.readUInt32BE(index));
      return { width: image.width, height: image.height, distinctPixels: pixels.size };
    },
    artifact: (name, bytes) => writeFile(join(output, name), bytes, { flag: 'wx' }),
    software: async () => {
      const rendererOutput = join(output, 'software-vulkan');
      // This separate existing smoke renders a fixed trusted material fixture. It
      // does not accept source and is not evidence of source-evaluator isolation.
      const env = evaluator.sanitizedEvaluatorEnv();
      env.KILN_RENDER = 'cpu';
      if (process.env.VK_ICD_FILENAMES) env.VK_ICD_FILENAMES = process.env.VK_ICD_FILENAMES;
      const child = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../smoke-renderer.mjs', import.meta.url)),
          installation,
          rendererOutput,
          'software',
        ],
        {
          env,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
      assert.equal(child.status, 0, 'Software-renderer qualification process failed');
      return JSON.parse(await readFile(join(rendererOutput, 'receipt.json'), 'utf8'));
    },
  });
  Object.assign(record, result);
} catch {
  Object.assign(record, {
    version: qualificationVersion,
    status: 'failed',
    checks: [],
    artifacts: [],
    failure: { phase: 'setup', code: 'SETUP_FAILED' },
  });
}
record.processMeasurements.usage = process.resourceUsage();
record.cgroupAfter = await cgroupSnapshot();
await writeFile(join(output, 'receipt.json'), `${JSON.stringify(record, null, 2)}\n`, {
  flag: 'wx',
});
console.log(JSON.stringify(record));
process.exitCode = record.status === 'passed' ? 0 : 1;
