import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  RELEASE_ARTIFACTS,
  RELEASE_JOBS,
  RELEASE_RECEIPTS,
  releaseMetadataProblems,
  verifyReleaseArtifacts,
} from './prepare-npm-release.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const commit = 'a'.repeat(40);
const target = { runId: '42', commit, digest: 'b'.repeat(64), mode: 'stage' };
function metadata() {
  return {
    run: {
      id: 42,
      path: '.github/workflows/ci.yml',
      head_sha: commit,
      head_branch: 'main',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      repository: { id: 1278326592, full_name: 'instruktlabs/kiln' },
      head_repository: { id: 1278326592, full_name: 'instruktlabs/kiln' },
    },
    jobs: RELEASE_JOBS.map((name) => ({ name, status: 'completed', conclusion: 'success' })),
    artifacts: RELEASE_ARTIFACTS.map((name, id) => ({
      id: id + 1,
      name,
      expired: false,
      workflow_run: {
        id: 42,
        head_sha: commit,
        repository_id: 1278326592,
        head_repository_id: 1278326592,
      },
    })),
    environment: {
      name: 'npm-release',
      can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
      protection_rules: [
        {
          type: 'required_reviewers',
          reviewers: [{ type: 'User', reviewer: { login: 'matthew-kissinger' } }],
        },
      ],
    },
  };
}

test('a successful main push and protected stage environment are eligible', () => {
  expect(releaseMetadataProblems(metadata(), target)).toEqual([]);
});

test.each([
  [
    'PR event',
    (data) => {
      data.run.event = 'pull_request';
    },
  ],
  [
    'other branch',
    (data) => {
      data.run.head_branch = 'codex/work';
    },
  ],
  [
    'different commit',
    (data) => {
      data.run.head_sha = 'c'.repeat(40);
    },
  ],
  [
    'different run',
    (data) => {
      data.run.id = 43;
    },
  ],
  [
    'other workflow',
    (data) => {
      data.run.path = '.github/workflows/pages.yml';
    },
  ],
  [
    'fork identity',
    (data) => {
      data.run.head_repository.id = 999;
    },
  ],
  [
    'unfinished run',
    (data) => {
      data.run.status = 'in_progress';
    },
  ],
  [
    'failed run',
    (data) => {
      data.run.conclusion = 'failure';
    },
  ],
  [
    'missing platform job',
    (data) => {
      data.jobs.pop();
    },
  ],
  [
    'skipped platform job',
    (data) => {
      data.jobs[0].conclusion = 'skipped';
    },
  ],
  [
    'duplicate job',
    (data) => {
      data.jobs.push(data.jobs[0]);
    },
  ],
  [
    'missing artifact',
    (data) => {
      data.artifacts.pop();
    },
  ],
  [
    'expired artifact',
    (data) => {
      data.artifacts[0].expired = true;
    },
  ],
  [
    'foreign artifact commit',
    (data) => {
      data.artifacts[0].workflow_run.head_sha = 'c'.repeat(40);
    },
  ],
  [
    'duplicate artifact',
    (data) => {
      data.artifacts.push(data.artifacts[0]);
    },
  ],
  [
    'missing release environment',
    (data) => {
      data.environment = undefined;
    },
  ],
  [
    'no owner reviewer',
    (data) => {
      data.environment.protection_rules = [];
    },
  ],
  [
    'admin bypass',
    (data) => {
      data.environment.can_admins_bypass = true;
    },
  ],
  [
    'unrestricted branches',
    (data) => {
      data.environment.deployment_branch_policy = null;
    },
  ],
])('release preparation rejects %s', (_name, corrupt) => {
  const data = metadata();
  corrupt(data);
  expect(releaseMetadataProblems(data, target).length).toBeGreaterThan(0);
});

test('verification does not require publishing access, but an unknown mode is refused', () => {
  const data = metadata();
  delete data.environment;
  expect(releaseMetadataProblems(data, { ...target, mode: 'verify' })).toEqual([]);
  expect(releaseMetadataProblems(data, { ...target, mode: 'publish' }).length).toBeGreaterThan(0);
  expect(
    releaseMetadataProblems(data, { ...target, runId: '../43', mode: 'verify' }).length,
  ).toBeGreaterThan(0);
});

test('release workflow defaults to read-only verification and only stages after owner approval', async () => {
  const workflow = Bun.YAML.parse(
    await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
  );
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  expect(workflow.on.workflow_dispatch.inputs.mode).toMatchObject({
    default: 'verify',
    options: ['verify', 'stage'],
  });
  expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' });
  expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  const { verify, stage } = workflow.jobs;
  const toolchain = JSON.parse(
    await readFile(new URL('../toolchain.json', import.meta.url), 'utf8'),
  );
  expect(verify.if).toContain("github.ref == 'refs/heads/main'");
  expect(verify.if).toContain("github.repository == 'instruktlabs/kiln'");
  expect(stage.needs).toBe('verify');
  expect(stage.if).toContain("inputs.mode == 'stage'");
  expect(stage.environment).toBe('npm-release');
  expect(stage.permissions).toEqual({ contents: 'read', actions: 'read', 'id-token': 'write' });
  for (const job of [verify, stage]) {
    expect(job.steps.some((step) => step.run === 'node scripts/prepare-npm-release.mjs')).toBe(
      true,
    );
    for (const step of job.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      if (step.uses?.startsWith('actions/checkout@'))
        expect(step.with['persist-credentials']).toBe(false);
      if (step.uses?.startsWith('actions/setup-node@'))
        expect(step.with['node-version']).toBe(toolchain.node);
      expect(step.run ?? '').not.toMatch(/npm (publish|stage approve)|npm (ci|pack)/);
      expect(step.run ?? '').not.toContain('${{ inputs.');
    }
  }
  expect(verify.steps.some((step) => /npm stage/.test(step.run ?? ''))).toBe(false);
  expect(
    stage.steps.some(
      (step) => step.run === `npm install --global npm@${toolchain.npm} --ignore-scripts`,
    ),
  ).toBe(true);
  const publish = stage.steps.find((step) => /npm stage publish/.test(step.run ?? ''));
  expect(publish.run).toContain('npm stage publish "$TARBALL"');
  expect(publish.run).toContain('--ignore-scripts --access public --provenance --tag "$TAG"');
  expect(publish.env.TARBALL).toBe(`\${{ steps.prepare.outputs.tarball }}`);
  expect(publish.env.TAG).toBe(`\${{ steps.prepare.outputs.tag }}`);
  expect(JSON.stringify(workflow)).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test('release receipt requirements stay aligned with the CI platform matrix', async () => {
  const ci = Bun.YAML.parse(
    await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  const names = Object.values(ci.jobs).flatMap((job) => {
    const matrix = job.strategy?.matrix;
    if (!matrix) return [job.name];
    if (matrix.include)
      return matrix.include.map((item) => job.name.replace(/\$\{\{ matrix\.arch \}\}/, item.arch));
    return matrix.node.map((node) => job.name.replace(/\$\{\{ matrix\.node \}\}/, node));
  });
  expect([...RELEASE_JOBS].sort()).toEqual(names.sort());
});

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Invalid test root');
    await rm(root, { recursive: true, force: true });
  }
});

const checks = [
  'installed-consumer-documents',
  'plain-node-sdk-exports',
  'sdk-subprocess-render',
  'compiled-evaluator-worker',
  'npm-mcp-entry',
  'packaged-node-worker',
  'community-exporter-textured-subprocess',
  'source-reference-edit-images',
  'server-restart-persistence',
  'exact-source-export',
];
async function fixture(version = '1.0.0-rc.1') {
  const root = await mkdtemp(join(tmpdir(), 'kiln-release-café-'));
  roots.push(root);
  const manifest = {
    name: '@instruktlabs/kiln',
    version,
    type: 'module',
    exports: { '.': { types: './lib/index.d.ts', import: './lib/index.js' } },
    repository: { type: 'git', url: 'git+https://github.com/instruktlabs/kiln.git' },
    publishConfig: { access: 'public', provenance: true },
  };
  const toolchain = { bun: '1.4.2', node: '22.23.3', npm: '12.2.0' };
  await mkdir(join(root, 'package'));
  await writeFile(join(root, 'package/package.json'), JSON.stringify(manifest));
  const candidate = join(root, 'node-package-candidate');
  await mkdir(candidate);
  const tarball = join(candidate, `instruktlabs-kiln-${version}.tgz`);
  execFileSync('tar', ['-czf', tarball, '-C', root, 'package/package.json'], { windowsHide: true });
  const digest = sha(await readFile(tarball));
  for (const item of RELEASE_RECEIPTS) {
    await mkdir(join(root, item.artifact), { recursive: true });
    await writeFile(
      join(root, item.artifact, item.file ?? 'package-smoke.json'),
      JSON.stringify({
        platform: item.platform,
        arch: item.arch,
        node: `v${item.node ?? toolchain.node}`,
        npm: item.npm ?? toolchain.npm,
        engineName: manifest.name,
        engineVersion: version,
        status: 'passed',
        tarballSha256: digest,
        checks: [...checks, ...(item.types ? ['sdk-consumer-types-without-optional-peers'] : [])],
        sdk: { imports: 1, renderBytes: 64 },
        compiledWorker: { renderBytes: 64 },
        sdkTypes: { package: manifest.name, entries: 1, status: 'passed' },
      }),
    );
  }
  const renderer = join(root, 'linux-software-vulkan/renderer-receipt');
  await mkdir(renderer, { recursive: true });
  const views = [];
  for (const backdrop of ['neutral', 'dark', 'light'])
    for (const n of [0, 1]) {
      const name = `${backdrop}-${n}.png`;
      const bytes = Buffer.from(`fixture ${name}`);
      await writeFile(join(renderer, name), bytes);
      views.push({ name, sha256: sha(bytes), red: 30, green: 30 });
    }
  await writeFile(
    join(renderer, 'receipt.json'),
    JSON.stringify({
      version: 'kiln.renderer-qualification.v1',
      status: 'passed',
      expected: 'software',
      software: true,
      backend: 'vulkan',
      platform: 'linux',
      arch: 'x64',
      node: `v${toolchain.node}`,
      views,
    }),
  );
  await writeFile(
    join(root, 'linux-software-vulkan/candidate-sha256.txt'),
    `${digest}  /runner/candidate/${manifest.name.slice(1).replace('/', '-')}-${version}.tgz\n`,
  );
  return { root, tarball, target: { ...target, digest, manifest, toolchain } };
}

test('release verification accepts one exact RC archive and every platform receipt', async () => {
  const data = await fixture();
  const result = await verifyReleaseArtifacts(data.root, data.target);
  expect(result).toMatchObject({
    name: '@instruktlabs/kiln',
    version: '1.0.0-rc.1',
    digest: data.target.digest,
    tag: 'next',
  });
  expect(result.tarball).toBe(data.tarball);
});

test('stable v1 uses latest; unpublished development builds cannot be staged', async () => {
  const stable = await fixture('1.0.0');
  expect((await verifyReleaseArtifacts(stable.root, stable.target)).tag).toBe('latest');
  const dev = await fixture('1.0.0-dev.0');
  await expect(verifyReleaseArtifacts(dev.root, dev.target)).rejects.toThrow('release version');
});

test.each(['digest', 'version', 'receipt', 'missing', 'types', 'image'])(
  'rejects %s evidence drift',
  async (kind) => {
    const data = await fixture();
    if (kind === 'digest') data.target.digest = 'f'.repeat(64);
    if (kind === 'version') data.target.manifest.version = '1.0.0-rc.2';
    if (kind === 'receipt' || kind === 'missing') {
      const path = join(data.root, 'windows-package/package-smoke.json');
      if (kind === 'missing') await rm(path);
      else {
        const receipt = JSON.parse(await readFile(path, 'utf8'));
        receipt.tarballSha256 = 'f'.repeat(64);
        await writeFile(path, JSON.stringify(receipt));
      }
    }
    if (kind === 'types') {
      const path = join(data.root, 'node-package-candidate/candidate-sdk-receipt.json');
      const receipt = JSON.parse(await readFile(path, 'utf8'));
      receipt.checks = receipt.checks.filter(
        (name) => name !== 'sdk-consumer-types-without-optional-peers',
      );
      await writeFile(path, JSON.stringify(receipt));
    }
    if (kind === 'image')
      await writeFile(
        join(data.root, 'linux-software-vulkan/renderer-receipt/neutral-0.png'),
        'tampered',
      );
    await expect(verifyReleaseArtifacts(data.root, data.target)).rejects.toThrow();
  },
);
