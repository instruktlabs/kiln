#!/usr/bin/env node
// Release preparation is read-only against GitHub/npm. Only release.yml stages bytes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { receiptProblems } from './verify-package-receipt.mjs';

export const RELEASE_REPOSITORY = 'instruktlabs/kiln';
export const RELEASE_REPOSITORY_ID = 1278326592;
export const RELEASE_JOBS = [
  'typecheck · lint · test',
  'typecheck · lint · test (Windows)',
  'render service tests',
  'build portable Node package',
  'Node package · macOS arm64',
  'Node package · macOS x64',
  'Node package · Windows',
  'Node package · Linux 20.15.0',
  'Node package · Linux 22.2.0',
  'Node package · Linux 24.20.0',
  'Node package · Linux',
  'Installed renderer · Linux software Vulkan',
];
export const RELEASE_RECEIPTS = [
  {
    artifact: 'node-package-candidate',
    file: 'candidate-sdk-receipt.json',
    platform: 'linux',
    arch: 'x64',
    types: true,
  },
  { artifact: 'windows-package', platform: 'win32', arch: 'x64' },
  { artifact: 'macos-package-arm64', platform: 'darwin', arch: 'arm64' },
  { artifact: 'macos-package-x64', platform: 'darwin', arch: 'x64' },
  {
    artifact: 'linux-package-20.15.0',
    platform: 'linux',
    arch: 'x64',
    node: '20.15.0',
    npm: '10.7.0',
  },
  {
    artifact: 'linux-package-22.2.0',
    platform: 'linux',
    arch: 'x64',
    node: '22.2.0',
    npm: '10.7.0',
  },
  {
    artifact: 'linux-package-24.20.0',
    platform: 'linux',
    arch: 'x64',
    node: '24.20.0',
    npm: '11.19.0',
  },
];
export const RELEASE_ARTIFACTS = [
  ...RELEASE_RECEIPTS.map((item) => item.artifact),
  'linux-software-vulkan',
];

export function releaseMetadataProblems(metadata, target) {
  const problems = [];
  const require = (condition, message) => {
    if (!condition) problems.push(message);
  };
  require(/^[1-9]\d*$/.test(target.runId), 'Invalid CI run ID');
  require(/^[a-f0-9]{40}$/.test(target.commit), 'Invalid commit SHA');
  require(/^[a-f0-9]{64}$/.test(target.digest), 'Invalid archive SHA-256');
  require(['verify', 'stage'].includes(target.mode), 'Mode must be verify or stage');
  const { run = {}, jobs = [], artifacts = [], environment } = metadata;
  require(String(run.id) === target.runId, 'CI run ID mismatch');
  require(run.path === '.github/workflows/ci.yml', 'Source must be the CI workflow');
  require(run.event === 'push' && run.head_branch === 'main', 'Source must be a main push');
  require(run.head_sha === target.commit, 'CI commit differs from the release checkout');
  require(run.status === 'completed' &&
    run.conclusion === 'success', 'CI must finish successfully');
  for (const field of ['repository', 'head_repository'])
    require(run[field]?.id === RELEASE_REPOSITORY_ID &&
      run[field]?.full_name === RELEASE_REPOSITORY, 'CI repository identity mismatch');
  for (const name of RELEASE_JOBS) {
    const matching = jobs.filter((job) => job.name === name);
    require(matching.length === 1, `Missing or duplicate CI job: ${name}`);
  }
  require(jobs.every(
    (job) => job.status === 'completed' && job.conclusion === 'success',
  ), 'Every CI job must pass; skipped jobs are not qualification');
  for (const name of RELEASE_ARTIFACTS) {
    const matching = artifacts.filter((artifact) => artifact.name === name);
    require(matching.length === 1, `Missing or duplicate artifact: ${name}`);
    const artifact = matching[0];
    require(artifact?.expired === false, `Artifact is expired: ${name}`);
    const source = artifact?.workflow_run;
    require(String(source?.id) === target.runId &&
      source?.head_sha === target.commit &&
      source?.repository_id === RELEASE_REPOSITORY_ID &&
      source?.head_repository_id === RELEASE_REPOSITORY_ID, `Artifact source mismatch: ${name}`);
  }
  if (target.mode === 'stage') {
    require(environment?.name === 'npm-release', 'Configure npm-release before staging');
    require(environment?.can_admins_bypass ===
      false, 'Release approval must not allow admin bypass');
    require(environment?.deployment_branch_policy?.protected_branches === true &&
      environment?.deployment_branch_policy?.custom_branch_policies ===
        false, 'Release environment must restrict deployment to protected branches');
    const reviewers = environment?.protection_rules?.find(
      (rule) => rule.type === 'required_reviewers',
    )?.reviewers;
    require(reviewers?.length === 1 &&
      reviewers[0]?.type === 'User' &&
      reviewers[0]?.reviewer?.login ===
        'matthew-kissinger', 'Release environment requires the owner reviewer');
  }
  return problems;
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function verifyReleaseArtifacts(directory, { manifest, toolchain, digest }) {
  assert.equal(manifest.name, '@instruktlabs/kiln', 'Wrong release package');
  assert.match(
    manifest.version,
    /^1\.0\.0(?:-rc\.(?:0|[1-9]\d*))?$/,
    'Expected a v1 release version',
  );
  assert.notEqual(manifest.private, true, 'Private packages cannot be staged');
  assert.deepEqual(manifest.publishConfig, { access: 'public', provenance: true });
  assert.equal(manifest.repository?.url, 'git+https://github.com/instruktlabs/kiln.git');
  assert.match(digest, /^[a-f0-9]{64}$/, 'Expected archive SHA-256');
  const candidate = join(directory, 'node-package-candidate');
  const archives = (await readdir(candidate)).filter((file) => file.endsWith('.tgz'));
  assert.deepEqual(
    archives,
    [`instruktlabs-kiln-${manifest.version}.tgz`],
    'Expected exactly one versioned archive',
  );
  const tarball = join(candidate, archives[0]);
  assert.equal(sha(await readFile(tarball)), digest, 'Candidate archive digest mismatch');
  // Read one member without extracting or executing anything from the archive.
  const packedManifest = JSON.parse(
    execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    }),
  );
  assert.deepEqual(packedManifest, manifest, 'Packed manifest differs from the release checkout');
  const coreExports = Object.keys(manifest.exports).filter(
    (name) => !['./agent', './composer/agent'].includes(name),
  ).length;
  const receipts = [];
  for (const item of RELEASE_RECEIPTS) {
    const path = join(directory, item.artifact, item.file ?? 'package-smoke.json');
    const receipt = await json(path);
    const problems = receiptProblems(receipt, { ...item, manifest, toolchain });
    assert.equal(problems.length, 0, `${item.artifact}: ${problems.join('; ')}`);
    assert.equal(receipt.tarballSha256, digest, `${item.artifact}: archive digest mismatch`);
    assert.equal(receipt.sdk?.imports, coreExports, `${item.artifact}: SDK import coverage`);
    assert(
      receipt.sdk?.renderBytes > 0 && receipt.compiledWorker?.renderBytes > 0,
      `${item.artifact}: missing worker result`,
    );
    if (item.types) {
      assert(
        receipt.checks.includes('sdk-consumer-types-without-optional-peers'),
        'Missing consumer types check',
      );
      assert.deepEqual(receipt.sdkTypes, {
        package: manifest.name,
        entries: coreExports,
        status: 'passed',
      });
    }
    receipts.push({ artifact: item.artifact, sha256: sha(await readFile(path)) });
  }
  const rendererRoot = join(directory, 'linux-software-vulkan');
  const checksum = (await readFile(join(rendererRoot, 'candidate-sha256.txt'), 'utf8')).trim();
  assert.match(
    checksum,
    new RegExp(`^${digest} [ *][^\\r\\n]+$`),
    'Renderer archive digest mismatch',
  );
  const renderer = await json(join(rendererRoot, 'renderer-receipt/receipt.json'));
  assert.equal(renderer.version, 'kiln.renderer-qualification.v1');
  assert.equal(renderer.status, 'passed');
  assert.equal(renderer.expected, 'software');
  assert.equal(renderer.software, true);
  assert.equal(renderer.backend, 'vulkan');
  assert.equal(renderer.platform, 'linux');
  assert.equal(renderer.arch, 'x64');
  assert.equal(renderer.node, `v${toolchain.node}`);
  const names = ['neutral', 'dark', 'light'].flatMap((backdrop) =>
    [0, 1].map((n) => `${backdrop}-${n}.png`),
  );
  assert.deepEqual(
    renderer.views.map((view) => view.name).sort(),
    names.sort(),
    'Missing renderer views',
  );
  for (const view of renderer.views) {
    assert(view.red > 20 && view.green > 20, 'Missing textured-view evidence');
    assert.equal(
      sha(await readFile(join(rendererRoot, 'renderer-receipt', view.name))),
      view.sha256,
      'Renderer image digest mismatch',
    );
  }
  receipts.push({
    artifact: 'linux-software-vulkan',
    sha256: sha(await readFile(join(rendererRoot, 'renderer-receipt/receipt.json'))),
  });
  return {
    name: manifest.name,
    version: manifest.version,
    digest,
    tarball,
    tag: manifest.version.includes('-rc.') ? 'next' : 'latest',
    receipts,
  };
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const target = {
    runId: process.env.CI_RUN_ID,
    commit: process.env.GITHUB_SHA,
    digest: process.env.CANDIDATE_SHA256,
    mode: process.env.RELEASE_MODE ?? 'verify',
  };
  assert.match(target.runId ?? '', /^[1-9]\d*$/, 'CI_RUN_ID must be numeric');
  assert.match(target.commit ?? '', /^[a-f0-9]{40}$/, 'GITHUB_SHA must be a commit SHA');
  assert.match(target.digest ?? '', /^[a-f0-9]{64}$/, 'CANDIDATE_SHA256 must be an exact digest');
  assert(['verify', 'stage'].includes(target.mode), 'Invalid release mode');
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    RELEASE_REPOSITORY,
    'Release must run in Instrukt Labs',
  );
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Release must run from main');
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    target.commit,
    'Checkout commit mismatch',
  );
  const route = `repos/${RELEASE_REPOSITORY}/actions/runs/${target.runId}`;
  const pages = (path, key) =>
    JSON.parse(gh(['api', '--paginate', '--slurp', `${path}?per_page=100`])).flatMap(
      (page) => page[key],
    );
  const metadata = {
    run: JSON.parse(gh(['api', route])),
    jobs: pages(`${route}/jobs`, 'jobs'),
    artifacts: pages(`${route}/artifacts`, 'artifacts'),
    ...(target.mode === 'stage'
      ? {
          environment: JSON.parse(
            gh(['api', `repos/${RELEASE_REPOSITORY}/environments/npm-release`]),
          ),
        }
      : {}),
  };
  const problems = releaseMetadataProblems(metadata, target);
  assert.equal(problems.length, 0, problems.join('\n'));
  const cache = join(root, '.cache');
  await mkdir(cache, { recursive: true });
  const output = await mkdtemp(join(cache, 'npm-release-'));
  const directory = join(output, 'artifacts');
  gh([
    'run',
    'download',
    target.runId,
    '--repo',
    RELEASE_REPOSITORY,
    '--dir',
    directory,
    ...RELEASE_ARTIFACTS.flatMap((name) => ['--name', name]),
  ]);
  const result = await verifyReleaseArtifacts(directory, {
    ...target,
    manifest: await json(join(root, 'package.json')),
    toolchain: await json(join(root, 'toolchain.json')),
  });
  const report = join(output, 'review.json');
  await writeFile(
    report,
    `${JSON.stringify({ status: 'verified', ...target, ...result, artifactIds: metadata.artifacts.filter((artifact) => RELEASE_ARTIFACTS.includes(artifact.name)).map(({ name, id }) => ({ name, id })) }, null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `directory=${output}\ntarball=${result.tarball}\ntag=${result.tag}\nreport=${report}\n`,
    );
  console.log(
    JSON.stringify({
      status: 'verified',
      ...target,
      name: result.name,
      version: result.version,
      report,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
