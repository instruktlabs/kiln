import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { createPublicTools, HOSTED_TOOL_SURFACE } from '../src/public-tools.ts';

const repo = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://kiln.instruktlabs.com';

function noPrivateConfiguration(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(?:apps|hooks|headers|env|password|credentials|reviewer_credentials|client_secret|access_token|refresh_token|authorization)$/i.test(
        key,
      )
    )
      throw new Error('Public metadata contains private configuration or an unsupported component');
    noPrivateConfiguration(child);
  }
}

export function validatePublicMetadata(manifest, mcp, cases, toolNames) {
  noPrivateConfiguration(manifest);
  noPrivateConfiguration(mcp);
  noPrivateConfiguration(cases);
  const allowed = new Set([
    '$schema',
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
    'extensions',
  ]);
  assert(
    Object.keys(manifest).every((key) => allowed.has(key)),
    'Unsupported public manifest component',
  );
  assert.deepEqual(Object.keys(manifest.extensions), ['com.openai']);
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'kiln-engine');
  assert.equal(manifest.author.name, 'Instrukt Labs');
  assert.equal(manifest.license, 'MIT');
  const metadata = manifest.extensions['com.openai'];
  assert(
    Object.keys(metadata).every((key) =>
      ['interface', 'onboardingSkill', 'publication'].includes(key),
    ),
    'Unsupported public extension field',
  );
  const display = metadata.interface;
  assert(display.displayName.length > 0 && display.displayName.length <= 30);
  assert(display.shortDescription.length > 0 && display.shortDescription.length <= 30);
  assert(display.longDescription.length > 0 && display.longDescription.length <= 4000);
  assert.equal(display.category, 'Developer Tools');
  assert.equal(display.websiteURL, origin);
  assert.equal(display.supportURL, `${origin}/support`);
  assert.equal(display.privacyPolicyURL, `${origin}/privacy`);
  assert.equal(display.termsOfServiceURL, `${origin}/terms`);
  assert.equal(metadata.onboardingSkill, './skills/kiln-hosted/SKILL.md');
  assert.equal(display.composerIcon, './assets/icon.svg');
  assert.equal(display.logo, './assets/icon.svg');
  assert(display.defaultPrompt.length > 0 && display.defaultPrompt.length <= 3);
  for (const prompt of display.defaultPrompt)
    assert(typeof prompt === 'string' && prompt.length <= 128);
  assert.deepEqual(mcp, {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { kiln: { type: 'streamable-http', url: `${origin}/mcp` } },
  });
  assert.equal(cases.positive.length, 5);
  assert.equal(cases.negative.length, 3);
  for (const item of [...cases.positive, ...cases.negative]) {
    for (const key of ['description', 'prompt', 'expected_behavior'])
      assert(typeof item[key] === 'string' && item[key].trim());
    assert.equal(typeof item.tools_triggered, 'string');
    for (const name of item.tools_triggered
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean))
      assert(toolNames.has(name), `Review case names an unadvertised operation: ${name}`);
  }
  for (const item of cases.positive) assert(item.tools_triggered.trim());
}

/** Offline draft only: packaging neither validates a live endpoint nor submits it. */
export async function packagePublicPlugin(destination) {
  const output = resolve(destination);
  try {
    await lstat(output);
    throw new Error('Public plugin output already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const sources = {};
  async function source(name, limit = 262144) {
    const path = resolve(repo, name);
    assert.equal(await realpath(path), path, 'Plugin inputs must not traverse symlinks');
    const stat = await lstat(path);
    assert(stat.isFile() && stat.size <= limit, 'Unexpected plugin source file');
    const bytes = await readFile(path);
    sources[name] = hash(bytes);
    return bytes;
  }
  const sourceJson = async (name) => JSON.parse(await source(name));
  const pkg = await sourceJson('package.json');
  const manifest = await sourceJson('hosting/plugin/plugin.json');
  const mcp = await sourceJson('hosting/plugin/mcp.json');
  const cases = await sourceJson('hosting/plugin/review-cases.json');
  assert.equal(pkg.name, '@instruktlabs/kiln');
  assert.equal(manifest.version, pkg.version, 'Review plugin version against the pinned engine');
  // This metadata snapshot is larger than plugin inputs and is never copied into
  // the ZIP. The build's existing regeneration check qualifies it separately.
  const native = JSON.parse(
    await source('hosting/src/generated/edge-manifest.json', 2 * 1024 * 1024),
  );
  await source('hosting/src/public-tools.ts');
  const toolNames = new Set(createPublicTools(native.tools).tools.map((tool) => tool.name));
  validatePublicMetadata(manifest, mcp, cases, toolNames);
  manifest.extensions['com.openai'].review = {
    test_cases: cases,
    commerce: false,
    commerce_description:
      'Kiln does not sell products or process payments through this integration.',
  };

  const files = new Map([
    ['plugin.json', json(manifest)],
    ['mcp.json', json(mcp)],
    ['README.md', await source('hosting/plugin/README.md')],
    ['LICENSE', await source('LICENSE')],
    ['skills/kiln-hosted/SKILL.md', await source('hosting/plugin/skills/kiln-hosted/SKILL.md')],
  ]);
  for (const name of [
    'program-contract.md',
    'geometry-recipes.md',
    'camera-recipes.md',
    'reusable-frame.kiln.js',
  ])
    files.set(
      `skills/kiln-hosted/references/${name}`,
      await source(`skills/kiln-author-asset/references/${name}`),
    );
  const favicon = (await source('site/public/favicon.svg')).toString('utf8');
  assert.match(favicon, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 32 32">/);
  assert.doesNotMatch(favicon, /<\s*(?:script|foreignObject|image|use)\b|href\s*=|\bon\w+\s*=/i);
  const inner = favicon.replace(/^<svg[^>]+>\s*/, '').replace(/\s*<\/svg>\s*$/, '');
  files.set(
    'assets/icon.svg',
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">\n<g transform="scale(2)">\n${inner}\n</g>\n</svg>\n`,
    ),
  );
  files.set(
    'package-provenance.json',
    json({
      kind: 'kiln.public-plugin.v1',
      engineVersion: pkg.version,
      hostedToolSurface: HOSTED_TOOL_SURFACE,
      sources,
      files: Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])),
    }),
  );
  const ordered = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const archive = Buffer.from(
    zipSync(Object.fromEntries(ordered), { level: 6, mtime: new Date(1980, 0, 1) }),
  );
  const receipt = {
    kind: 'kiln.public-plugin.draft.v1',
    submissionReady: false,
    engineVersion: pkg.version,
    hostedToolSurface: HOSTED_TOOL_SURFACE,
    remaining: [
      'live-endpoint-and-terms',
      'live-client-review-cases',
      'demo-recording',
      'review-account-access',
      'publisher-and-domain-verification',
      'portal-validation-and-submission',
    ],
    sources,
    files: Object.fromEntries(ordered.map(([name, bytes]) => [name, hash(bytes)])),
    archive: { name: 'kiln-engine-draft.zip', bytes: archive.length, sha256: hash(archive) },
  };
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Refuse an output created concurrently after validation.
  for (const [name, bytes] of ordered) {
    const path = join(output, 'plugin', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
  await writeFile(join(output, receipt.archive.name), archive, { flag: 'wx' });
  await writeFile(join(output, 'receipt.json'), json(receipt), { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [destination, ...extra] = process.argv.slice(2);
  if (!destination || extra.length)
    throw new Error('Usage: node hosting/scripts/package-public-plugin.mjs FRESH_OUTPUT_DIRECTORY');
  const receipt = await packagePublicPlugin(destination);
  console.log(
    JSON.stringify(
      {
        ...receipt.archive,
        submissionReady: receipt.submissionReady,
        remaining: receipt.remaining,
      },
      null,
      2,
    ),
  );
}
