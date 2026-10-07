import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { packagePublicPlugin, validatePublicMetadata } from '../scripts/package-public-plugin.mjs';
import { createPublicTools } from '../src/public-tools.ts';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'kiln-public-plugin-')));
after(async () => {
  const parent = await realpath(tmpdir());
  assert.ok(temporary.startsWith(parent + sep));
  await rm(temporary, { recursive: true, force: true });
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('public draft ZIP has one hosted MCP, complete referenced assets and no local connector dependencies', async () => {
  const output = join(temporary, 'first');
  const receipt = await packagePublicPlugin(output);
  assert.equal(receipt.submissionReady, false);
  assert.ok(receipt.remaining.includes('live-client-review-cases'));
  assert.ok(receipt.remaining.includes('review-account-access'));
  const zip = await readFile(join(output, 'kiln-engine-draft.zip'));
  assert.equal(hash(zip), receipt.archive.sha256);
  const files = unzipSync(zip);
  const manifest = JSON.parse(Buffer.from(files['plugin.json']));
  assert.equal(manifest.name, 'kiln-engine');
  assert.equal(manifest.version, '1.0.0');
  const metadata = manifest.extensions['com.openai'];
  assert.ok(metadata.interface.shortDescription.length <= 30);
  assert.equal(metadata.interface.termsOfServiceURL, 'https://kiln.instruktlabs.com/terms');
  assert.equal(metadata.review.test_cases.positive.length, 5);
  assert.equal(metadata.review.test_cases.negative.length, 3);
  assert.equal(metadata.review.demo_recording_url, undefined, 'do not fabricate a demo URL');
  const mcp = JSON.parse(Buffer.from(files['mcp.json']));
  assert.deepEqual(mcp.mcpServers, {
    kiln: { type: 'streamable-http', url: 'https://kiln.instruktlabs.com/mcp' },
  });
  for (const path of [
    metadata.onboardingSkill,
    metadata.interface.logo,
    metadata.interface.composerIcon,
  ])
    assert.ok(files[path.slice(2)], path);
  const icon = Buffer.from(files['assets/icon.svg']).toString();
  assert.match(icon, /viewBox="0 0 64 64"/);
  assert.match(icon, /scale\(2\)/);
  assert.doesNotMatch(icon, /<script|<foreignObject|href=/);
  assert.ok(files.LICENSE);
  assert.ok(Buffer.from(files['README.md']).toString().includes('not a launched or approved'));
  for (const name of Object.keys(files)) {
    assert.ok(!name.startsWith('/') && !name.includes('..') && !name.includes('\\'));
    assert.ok(
      !/^(?:\.app|\.codex-plugin|\.claude-plugin|hooks|node_modules|src|dist|\.env)/.test(name),
      name,
    );
    assert.ok(!name.endsWith('.exe') && !name.includes('setup-workspace'));
    const bytes = Buffer.from(files[name]);
    assert.deepEqual(bytes, await readFile(join(output, 'plugin', name)));
    assert.equal(hash(bytes), receipt.files[name]);
  }
  assert.deepEqual(await json(join(output, 'receipt.json')), receipt);
});

test('shared references and recipe bytes are retained exactly and archive output is reproducible', async () => {
  const first = await packagePublicPlugin(join(temporary, 'second'));
  const second = await packagePublicPlugin(join(temporary, 'third'));
  assert.equal(first.archive.sha256, second.archive.sha256);
  for (const name of [
    'program-contract.md',
    'geometry-recipes.md',
    'camera-recipes.md',
    'reusable-frame.kiln.js',
  ]) {
    const original = await readFile(join(repo, 'skills/kiln-author-asset/references', name));
    const bundled = await readFile(
      join(temporary, 'second/plugin/skills/kiln-hosted/references', name),
    );
    assert.deepEqual(bundled, original, name);
    assert.equal(first.sources[`skills/kiln-author-asset/references/${name}`], hash(original));
  }
  const allowed = new Set(['plugin', 'kiln-engine-draft.zip', 'receipt.json']);
  assert.deepEqual(new Set(await readdir(join(temporary, 'second'))), allowed);
});

test('packaging refuses existing output before modifying its files', async () => {
  const output = join(temporary, 'existing');
  await mkdir(output);
  const sentinel = join(output, 'owner.txt');
  await writeFile(sentinel, 'preserve');
  await assert.rejects(packagePublicPlugin(output), /exists/i);
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve');
  assert.deepEqual(await readdir(output), ['owner.txt']);
});

test('public metadata refuses private connectors, credential headers, hidden components and unadvertised review operations', async () => {
  const manifest = await json(join(repo, 'hosting/plugin/plugin.json'));
  const mcp = await json(join(repo, 'hosting/plugin/mcp.json'));
  const cases = await json(join(repo, 'hosting/plugin/review-cases.json'));
  const native = await json(join(repo, 'hosting/src/generated/edge-manifest.json'));
  const names = new Set(createPublicTools(native.tools).tools.map((tool) => tool.name));
  validatePublicMetadata(manifest, mcp, cases, names);
  for (const mutation of [
    (m) => {
      m.apps = './.app.json';
    },
    (m) => {
      m.hooks = './hooks.json';
    },
    (m) => {
      m.mcpServers = { extra: { command: 'npx', args: ['unreviewed'] } };
    },
    (m) => {
      m.extensions['com.openai'].reviewer_credentials = { password: 'fixture-only' };
    },
    (m) => {
      m.extensions['com.openai'].interface.logo = '../outside.svg';
    },
  ]) {
    const changed = structuredClone(manifest);
    mutation(changed);
    assert.throws(() => validatePublicMetadata(changed, mcp, cases, names));
  }
  const tokenHeader = structuredClone(mcp);
  tokenHeader.mcpServers.kiln.headers = { Authorization: 'Bearer fixture-only' };
  assert.throws(
    () => validatePublicMetadata(manifest, tokenHeader, cases, names),
    /private configuration/,
  );
  const unknown = structuredClone(cases);
  unknown.positive[0].tools_triggered = 'kiln_assets';
  assert.throws(
    () => validatePublicMetadata(manifest, mcp, unknown, names),
    /unadvertised operation/,
  );
});
