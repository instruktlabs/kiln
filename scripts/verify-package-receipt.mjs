/**
 * Check one platform's package-smoke receipt against what the release claims.
 *
 * This lived as a ~400 character `node -e` one-liner inside the macOS job, which was
 * tolerable at one platform and is not at four: the expected platform differs per job,
 * so triplicating it means three chances to assert `darwin` on a Linux runner and have
 * the receipt pass anyway. A receipt that cannot fail is not evidence.
 *
 * Exact qualification versions default to toolchain.json. Consumer matrix jobs
 * explicitly select --node and --npm; these are exact versions, independently of the
 * consumer-compatible engines range. `engineVersion` is checked
 * against `package.json` for the same reason a release attaches these files at all --
 * a receipt that does not name the version it exercised cannot be matched to a tarball.
 *
 * Usage:
 *   node scripts/verify-package-receipt.mjs --platform linux --arch x64
 *   node scripts/verify-package-receipt.mjs --platform win32 --arch x64 --receipt r.json
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Checks the smoke run must report, named individually so a silent drop is a failure. */
const REQUIRED_CHECKS = [
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
];

const PLATFORMS = new Set(['darwin', 'linux', 'win32']);

function option(argv, name) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

export function receiptProblems(receipt, { platform, arch, manifest, toolchain, node, npm }) {
  const problems = [];
  const mustBe = (actual, wanted, label) => {
    if (actual !== wanted) problems.push(`${label}: expected ${wanted}, receipt says ${actual}`);
  };

  mustBe(receipt.status, 'passed', 'status');
  mustBe(receipt.platform, platform, 'platform');
  mustBe(receipt.arch, arch, 'arch');
  // A merely compatible version never substitutes for the selected qualification runtime.
  mustBe(receipt.node, `v${node ?? toolchain.node}`, 'node');
  mustBe(receipt.npm, npm ?? toolchain.npm, 'npm');
  mustBe(receipt.engineVersion, manifest.version, 'engineVersion');
  mustBe(receipt.engineName, manifest.name, 'engineName');

  for (const check of REQUIRED_CHECKS) {
    if (!receipt.checks?.includes(check)) problems.push(`missing check: ${check}`);
  }
  if (manifest.files?.includes('scripts/workspace-project.mjs')) {
    const check = 'installed-project-adoption-and-cross-client-storage';
    if (!receipt.checks?.includes(check)) problems.push(`missing check: ${check}`);
    mustBe(receipt.projectAdoption?.status, 'passed', 'projectAdoption.status');
  }
  return problems;
}

export async function verifyReceipt(argv, root) {
  const platform = option(argv, 'platform');
  const arch = option(argv, 'arch');
  if (!PLATFORMS.has(platform)) {
    throw new Error(`--platform must be one of ${[...PLATFORMS].join(', ')}; got ${platform}`);
  }
  if (!arch) throw new Error('--arch is required');
  const node = option(argv, 'node');
  const npm = option(argv, 'npm');
  for (const [name, value] of [
    ['node', node],
    ['npm', npm],
  ])
    if (value !== undefined && !/^\d+\.\d+\.\d+$/.test(value))
      throw new Error(`--${name} requires an exact numeric major.minor.patch version`);

  // `--receipt` is resolved against the working directory, not `root`. Those are the same
  // directory in the CI step, which is why the original resolved it against `root` and the
  // tests still passed -- and different everywhere else. Assembling a release from
  // downloaded artifacts is the case that found it: the receipts sit in a staging
  // directory while `root` is the repository, and every path silently became
  // `<repo>/linux-package.json`. A path a person types on a command line belongs to where
  // they typed it. `root` locates package metadata and the maintainer toolchain.
  const receiptPath = option(argv, 'receipt') ?? 'package-smoke.json';
  const receipt = JSON.parse(await readFile(resolve(receiptPath), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const toolchain = JSON.parse(await readFile(join(root, 'toolchain.json'), 'utf8'));

  const problems = receiptProblems(receipt, { platform, arch, manifest, toolchain, node, npm });

  // Hashed last: it is the only check that reads a second file, and a receipt naming a
  // tarball that is gone should say so rather than crash before the cheap checks run.
  //
  // `--tarball` overrides the path the receipt recorded, which is what makes this usable
  // twice. In the job, the receipt names a tarball sitting right there and the default is
  // right. At release-assembly time the receipts are downloaded artifacts whose recorded
  // absolute paths belong to a runner that no longer exists -- but their `tarballSha256`
  // is exactly what has to be checked against the file about to be published.
  const tarball = option(argv, 'tarball') ?? receipt.tarball;
  if (typeof receipt.tarballSha256 !== 'string' || receipt.tarballSha256.length === 0) {
    problems.push('tarballSha256: missing');
  } else {
    try {
      const actual = createHash('sha256')
        .update(await readFile(tarball))
        .digest('hex');
      if (actual !== receipt.tarballSha256) {
        problems.push(
          `tarballSha256: ${tarball} hashes to ${actual}, receipt says ${receipt.tarballSha256}`,
        );
      }
    } catch (error) {
      problems.push(`tarball: ${tarball} unreadable (${error.code ?? error.message})`);
    }
  }
  return problems;
}

const direct =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (direct) {
  const root =
    option(process.argv, 'root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = await verifyReceipt(process.argv, root);
  if (problems.length > 0) {
    console.error(`Package receipt rejected:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `Package receipt accepted: ${option(process.argv, 'platform')} ${option(process.argv, 'arch')}`,
  );
}
