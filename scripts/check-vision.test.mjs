/**
 * The vision gate's own test.
 *
 * `check-vision.mjs` reads model capabilities from the installed OpenCode. OpenCode 2.x
 * serves the catalogue at `GET /api/model` and rejects the 1.x
 * `opencode models <provider> --verbose`. 2.x is the primary path; 1.x is kept for older
 * installs. A gate that can no longer read capabilities reports every model as
 * unverified, so both shapes are pinned here with a fake runner. Nothing spawns
 * OpenCode or touches the network.
 */
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCapabilities, seesImages } from './check-vision.mjs';

const script = fileURLToPath(new URL('./check-vision.mjs', import.meta.url));

/** Trimmed from a real OpenCode 2.2.0 `opencode api --standalone GET /api/model` reply. */
const CATALOGUE_V2 = JSON.stringify({
  location: { directory: 'C:\\work' },
  data: [
    {
      id: 'glm-5.3-flash',
      modelID: 'glm-5.3-flash',
      providerID: 'opencode-go',
      capabilities: { tools: true, input: ['text', 'image', 'video'], output: ['text'] },
    },
    {
      id: 'glm-5.3',
      modelID: 'glm-5.3',
      providerID: 'opencode-go',
      capabilities: { tools: true, input: ['text'], output: ['text'] },
    },
    {
      id: 'liquid/lfm-3-1.7b',
      modelID: 'liquid/lfm-3-1.7b',
      providerID: 'openrouter',
      capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
    },
  ],
});

/** The 1.x `--verbose` shape: an id line, then a pretty-printed JSON block per model. */
const VERBOSE_V1 = `opencode-go/kimi-k3
{
  "id": "kimi-k3",
  "providerID": "opencode-go",
  "capabilities": { "attachment": true, "toolcall": true }
}
opencode-go/glm-5.3
{
  "id": "glm-5.3",
  "providerID": "opencode-go",
  "capabilities": { "attachment": false, "toolcall": true }
}
`;

const V2 = { status: 0, stdout: 'opencode v2.2.0\n', stderr: '' };
const V1 = { status: 0, stdout: '1.18.30\n', stderr: '' };

function fakeRunner(replies) {
  const calls = [];
  const run = (args) => {
    calls.push(args.join(' '));
    const reply = replies[args.join(' ')];
    return reply ?? { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
  return { run, calls };
}

test('OpenCode 2.x: reads the /api/model catalogue once and never tries --verbose', () => {
  const { run, calls } = fakeRunner({
    '--version': V2,
    'api --standalone GET /api/model': { status: 0, stdout: CATALOGUE_V2, stderr: '' },
  });
  const caps = loadCapabilities(['opencode-go', 'openrouter'], run);

  expect(seesImages(caps.get('opencode-go').get('glm-5.3-flash'))).toBe(true);
  expect(seesImages(caps.get('opencode-go').get('glm-5.3'))).toBe(false);
  expect(caps.get('opencode-go').has('kimi-k3')).toBe(false);
  // A model id containing a slash stays whole under its provider.
  expect(seesImages(caps.get('openrouter').get('liquid/lfm-3-1.7b'))).toBe(true);
  expect(calls).toEqual(['--version', 'api --standalone GET /api/model']);
});

test('OpenCode 1.x: reads --verbose per provider and never calls the 2.x API', () => {
  const { run, calls } = fakeRunner({
    '--version': V1,
    'models opencode-go --verbose': { status: 0, stdout: VERBOSE_V1, stderr: '' },
  });
  const caps = loadCapabilities(['opencode-go'], run);

  expect(seesImages(caps.get('opencode-go').get('kimi-k3'))).toBe(true);
  expect(seesImages(caps.get('opencode-go').get('glm-5.3'))).toBe(false);
  expect(calls).toEqual(['--version', 'models opencode-go --verbose']);
});

test('an unreadable catalogue leaves models unlisted rather than throwing', () => {
  const { run } = fakeRunner({
    '--version': V2,
    'api --standalone GET /api/model': { status: 1, stdout: '', stderr: 'boom' },
  });
  expect(loadCapabilities(['opencode-go'], run).get('opencode-go').size).toBe(0);
});

test('a missing opencode leaves models unlisted rather than throwing', () => {
  const { run } = fakeRunner({});
  expect(loadCapabilities(['opencode-go'], run).get('opencode-go').size).toBe(0);
});

test('seesImages reads both capability shapes', () => {
  expect(seesImages({ input: ['text', 'image'] })).toBe(true);
  expect(seesImages({ input: ['text', 'pdf'] })).toBe(false);
  expect(seesImages({ attachment: true })).toBe(true);
  expect(seesImages({ attachment: false })).toBe(false);
  expect(seesImages({ attachment: true, input: { image: false, pdf: true } })).toBe(false);
  expect(seesImages(undefined)).toBe(false);
});

test('the CLI still prints its usage without arguments', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('usage: check-vision.mjs');
});
