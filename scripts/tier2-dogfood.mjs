#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  archiveSavedAssets,
  defaultDogfoodGalleryRoot,
  discoverSavedAssets,
} from './dogfood-gallery.mjs';
import { parseDuration, quoteArg, resolveBin } from './harness.mjs';

export const PUBLIC_REPOSITORY = 'https://github.com/instruktlabs/kiln';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPORTED_HARNESSES = ['agy', 'claude', 'codex', 'hermes', 'opencode'];
const ARTIFACT_EXCLUDED_SEGMENTS = new Set([
  '.agents',
  '.claude',
  '.git',
  '.kiln',
  'dist',
  'examples',
  'node_modules',
  'site',
  'skills',
]);

const usage = `Usage:
  node scripts/tier2-dogfood.mjs --harness agy|claude|codex|hermes|opencode --goal "ASSET" [--goal "ASSET"]

Defaults to a no-call dry run. Live runs additionally require:
  --run-live --authorization PATH_OR_NOTE

Options:
  --runs N                 Repeat one goal N times (default: number of goals)
  --repository URL_OR_PATH Repository the agent clones (default: the public repository);
                           a local mirror lets a blind run test an unpushed branch
  --model ID               Override the outer harness model
  --provider ID            Provider override where the harness supports one (Hermes)
  --reasoning LEVEL        Per-run reasoning/variant override
  --allow-data-training-tier
                           Acknowledge a contributor model in an isolated Hermes home
  --hermes-home PATH       Operator-prepared isolated Hermes home for an authenticated route
  --agy-home PATH          Operator-prepared clean Agy home retaining only required auth
  --allow-env NAME         Explicitly pass one environment variable (repeatable; secrets may reach the provider)
  --timeout 45m            Per-run wall deadline
  --compact-tokens N       Supported per-run compaction threshold (for example 333000)
  --out PATH               Raw evidence directory (default: ignored .dogfood/tier2/...)
  --workspace-root PATH    Persistent workspace root (default: OS temp directory)
  --gallery-root PATH      User library root (default: XDG user data directory)
  --no-local-gallery       Do not import saved assets from this run
  --dry-run                Print the exact plan without launching a harness
  --run-live               Launch model-backed agents; spends subscription/API quota
  --authorization VALUE    Recorded operator authorization path or identifier
`;

export function parseArgs(argv) {
  const opts = {
    harness: null,
    goals: [],
    repository: PUBLIC_REPOSITORY,
    model: null,
    provider: null,
    reasoning: null,
    allowDataTrainingTier: false,
    hermesHome: null,
    agyHome: null,
    allowedEnvironmentNames: [],
    timeoutMs: parseDuration('45m'),
    compactTokens: null,
    outDir: null,
    workspaceRoot: null,
    galleryRoot: null,
    localGallery: true,
    requestedRuns: null,
    runs: 0,
    dryRun: true,
    live: false,
    authorization: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith('--')) throw new Error(`${arg} needs a value.`);
      return next;
    };
    if (arg === '--harness') opts.harness = value();
    else if (arg === '--goal') opts.goals.push(value());
    else if (arg === '--repository') opts.repository = value();
    else if (arg === '--model') opts.model = value();
    else if (arg === '--provider') opts.provider = value();
    else if (arg === '--reasoning') opts.reasoning = value();
    else if (arg === '--allow-data-training-tier') opts.allowDataTrainingTier = true;
    else if (arg === '--hermes-home') opts.hermesHome = resolve(value());
    else if (arg === '--agy-home') opts.agyHome = resolve(value());
    else if (arg === '--allow-env') opts.allowedEnvironmentNames.push(value());
    else if (arg === '--timeout') {
      const duration = parseDuration(value());
      if (!duration) throw new Error('--timeout must be a positive duration such as 45m.');
      opts.timeoutMs = duration;
    } else if (arg === '--compact-tokens') opts.compactTokens = Number(value());
    else if (arg === '--out') opts.outDir = resolve(value());
    else if (arg === '--workspace-root') opts.workspaceRoot = resolve(value());
    else if (arg === '--gallery-root') opts.galleryRoot = resolve(value());
    else if (arg === '--no-local-gallery') opts.localGallery = false;
    else if (arg === '--runs') opts.requestedRuns = Number(value());
    else if (arg === '--authorization') opts.authorization = value();
    else if (arg === '--run-live') {
      opts.live = true;
      opts.dryRun = false;
    } else if (arg === '--dry-run') {
      opts.live = false;
      opts.dryRun = true;
    } else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (opts.help) return opts;
  if (!SUPPORTED_HARNESSES.includes(opts.harness))
    throw new Error(`--harness must be one of: ${SUPPORTED_HARNESSES.join(', ')}.`);
  if (opts.goals.length === 0) throw new Error('Supply at least one --goal.');
  if (opts.goals.some((goal) => !goal.trim())) throw new Error('--goal cannot be empty.');
  // The value becomes one line of the prompt, so it must be a single clonable token.
  if (/\s/u.test(opts.repository))
    throw new Error('--repository must be one URL or path without whitespace.');
  if (opts.requestedRuns !== null) {
    if (!Number.isInteger(opts.requestedRuns) || opts.requestedRuns < 1)
      throw new Error('--runs must be a positive integer.');
    if (opts.goals.length !== 1)
      throw new Error('--runs can repeat one --goal; with multiple goals, omit --runs.');
    opts.goals = Array.from({ length: opts.requestedRuns }, () => opts.goals[0]);
  }
  opts.runs = opts.goals.length;
  if (
    opts.compactTokens !== null &&
    (!Number.isInteger(opts.compactTokens) || opts.compactTokens < 1)
  )
    throw new Error('--compact-tokens must be a positive integer.');
  if (opts.harness === 'claude' && opts.compactTokens !== null && opts.compactTokens < 100_000)
    throw new Error('Claude --autocompact accepts 100000 through 1000000 tokens.');
  if (opts.harness === 'claude' && opts.compactTokens > 1_000_000)
    throw new Error('Claude --autocompact accepts 100000 through 1000000 tokens.');
  if (opts.compactTokens !== null && !['claude', 'codex'].includes(opts.harness))
    throw new Error(`${opts.harness} has no per-run absolute compaction control.`);
  if (opts.provider && opts.harness !== 'hermes')
    throw new Error('--provider is currently supported only for Hermes.');
  if (opts.allowDataTrainingTier && opts.harness !== 'hermes')
    throw new Error('--allow-data-training-tier is supported only for Hermes.');
  if (opts.hermesHome && opts.harness !== 'hermes')
    throw new Error('--hermes-home is supported only for Hermes.');
  if (opts.hermesHome && opts.allowDataTrainingTier)
    throw new Error(
      '--allow-data-training-tier always uses a run-local Hermes home; do not combine it with --hermes-home.',
    );
  if (opts.agyHome && opts.harness !== 'agy')
    throw new Error('--agy-home is supported only for Agy.');
  if (opts.harness === 'agy' && !opts.agyHome)
    throw new Error('Agy blind runs require an operator-prepared --agy-home.');
  if (opts.allowedEnvironmentNames.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)))
    throw new Error('--allow-env requires an environment variable name.');
  if (opts.live && !opts.authorization)
    throw new Error('--run-live requires --authorization pointing to the recorded approval.');
  return opts;
}

/** Keep the experimental prompt from teaching the setup path it is meant to test. */
export function composeBlindPrompt(goal, repository = PUBLIC_REPOSITORY) {
  return [
    `Repository: ${repository}`,
    `Goal: Create a visually distinctive, production-worthy 3D asset: ${goal.trim()}.`,
    'Start from a fresh clone, set up Kiln from its public documentation in a separate asset workspace inside your current run directory, then launch your own headless coding agent to author, render, visually review, revise, and export the asset. Continue until the source and GLB are saved.',
  ].join('\n');
}

const compactLabel = (tokens) => (tokens % 1000 === 0 ? `${tokens / 1000}k` : String(tokens));

function yamlIdentifier(value, option) {
  if (!/^[A-Za-z0-9._/@:+-]+$/u.test(value))
    throw new Error(`${option} contains characters that cannot be written to an isolated route.`);
  return value;
}

export function hermesRunConfig({ model, provider, allowDataTrainingTier }) {
  const lines = [];
  if (model || provider) {
    lines.push('model:');
    if (model) lines.push(`  default: ${yamlIdentifier(model, '--model')}`);
    if (provider) lines.push(`  provider: ${yamlIdentifier(provider, '--provider')}`);
  }
  if (allowDataTrainingTier) {
    lines.push('security:');
    lines.push('  allow_data_training_tiers_noninteractive: true');
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export function buildInvocation({
  harness,
  model,
  prompt,
  workspace,
  emptyMcpConfig,
  compactTokens,
  provider = null,
  reasoning = null,
  allowDataTrainingTier = false,
  hermesHome: requestedHermesHome = null,
  agyHome = null,
  timeoutMs = parseDuration('45m'),
}) {
  if (harness === 'agy') {
    const args = [
      '--new-project',
      '--disable-slash-commands',
      '--dangerously-skip-permissions',
      '--print-timeout',
      `${Math.ceil(timeoutMs / 1000)}s`,
      '--add-dir',
      workspace,
      '--log-file',
      join(workspace, '.outer-agy.log'),
      '--output-format',
      'stream-json',
    ];
    if (model) args.push('--model', model);
    if (reasoning) args.push('--effort', reasoning);
    args.push(`--print=${prompt}`);
    return {
      bin: 'agy',
      args,
      env: agyIsolationEnv(agyHome),
      isolation: [
        'operator-prepared clean Agy home suppresses user MCP servers and plugins',
        'only authentication/runtime links explicitly placed in that home are inherited',
        'new project and disabled slash-command expansion isolate the outer prompt',
      ],
    };
  }
  if (harness === 'codex') {
    const args = [
      'exec',
      '--ignore-user-config',
      '--ignore-rules',
      '--ephemeral',
      '--json',
      '--color',
      'never',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--cd',
      workspace,
    ];
    if (model) args.push('--model', model);
    if (reasoning) args.push('-c', `model_reasoning_effort="${reasoning}"`);
    if (compactTokens !== null)
      args.push(
        '-c',
        `model_auto_compact_token_limit=${compactTokens}`,
        '-c',
        'model_auto_compact_token_limit_scope="total"',
      );
    return {
      bin: 'codex',
      args,
      stdin: prompt,
      isolation: [
        'user config ignored; CODEX_HOME retained for authentication',
        'user/project execution rules ignored',
        'ephemeral outer session',
        'no outer MCP server configured',
      ],
    };
  }
  if (harness === 'claude') {
    const args = [
      '-p',
      prompt,
      '--safe-mode',
      '--strict-mcp-config',
      '--mcp-config',
      emptyMcpConfig,
      '--dangerously-skip-permissions',
      '--permission-prompts',
      'none',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
    ];
    if (model) args.push('--model', model);
    if (reasoning) args.push('--effort', reasoning);
    if (compactTokens !== null) args.push('--autocompact', compactLabel(compactTokens));
    return {
      bin: 'claude',
      args,
      isolation: [
        'safe mode disables user/project customizations while retaining normal auth',
        'strict empty MCP config suppresses inherited MCP servers',
        'outer session persistence disabled',
      ],
    };
  }
  if (harness === 'opencode') {
    if (reasoning && !model) throw new Error('OpenCode reasoning requires an explicit --model.');
    const args = ['run', '--standalone', '--auto', '--format', 'json'];
    if (model) args.push('--model', reasoning ? `${model.split('#')[0]}#${reasoning}` : model);
    args.push(prompt);
    return {
      bin: 'opencode',
      args,
      env: { XDG_CONFIG_HOME: join(workspace, '.outer-opencode-config') },
      isolation: [
        'fresh XDG configuration suppresses user-level MCP servers',
        'private V2 server avoids inherited background-service configuration',
        'provider authentication remains in the normal data home',
        'home-level skills and instructions may remain; inspect the actual session loadout',
      ],
    };
  }
  if (harness === 'hermes') {
    const hermesHome = requestedHermesHome ?? join(workspace, '.outer-hermes-home');
    const args = allowDataTrainingTier
      ? ['--yolo', '--in', workspace]
      : ['--safe-mode', '--yolo', '--in', workspace];
    if (model) args.push('--model', model);
    if (provider) args.push('--provider', provider);
    if (reasoning) args.push('--reasoning', reasoning);
    args.push('-z', prompt);
    return {
      bin: 'hermes',
      args,
      env: { HERMES_HOME: hermesHome },
      isolation: allowDataTrainingTier
        ? [
            'isolated Hermes home contains only the selected route and explicit contributor-tier acknowledgement',
            'user rules, skills, plugins, MCP servers, and credentials are not inherited',
            'outer run changes into the fresh workspace before starting',
          ]
        : [
            'safe mode suppresses user rules, skills, plugins, and MCP servers',
            'the isolated home may expose only authentication explicitly prepared for this run',
            'outer run changes into the fresh workspace before starting',
          ],
    };
  }
  throw new Error(`Unsupported harness: ${harness}`);
}

export function agyIsolationEnv(agyHome, platform = process.platform) {
  const env = { HOME: agyHome };
  if (platform !== 'win32') return env;

  env.USERPROFILE = agyHome;
  const windowsHome = /^([A-Za-z]:)([\\/].*)$/u.exec(agyHome);
  if (windowsHome) {
    env.HOMEDRIVE = windowsHome[1];
    env.HOMEPATH = windowsHome[2].replaceAll('/', '\\');
  }
  return env;
}

function appendErrorText(value, found) {
  if (typeof value === 'string') found.push(value);
  else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:error|message|reason|detail|description)$/iu.test(key))
        appendErrorText(nested, found);
    }
  }
}

function structuredErrorMessages(event) {
  if (!event || typeof event !== 'object') return [];
  const found = [];
  const explicitlyFailed =
    event.is_error === true ||
    /(?:^|[_.-])(?:error|failed|failure)(?:$|[_.-])/iu.test(String(event.type ?? '')) ||
    /^(?:error|failed|failure|fatal)$/iu.test(String(event.status ?? '')) ||
    /^(?:error|fatal)$/iu.test(String(event.level ?? ''));
  if (explicitlyFailed) appendErrorText(event, found);
  // JSON-RPC and provider envelopes often carry an `error` without a type.
  if (Object.hasOwn(event, 'error')) appendErrorText(event.error, found);
  return found;
}

const QUOTA_FAILURE =
  /\b429\b|RESOURCE_EXHAUSTED|rate_limit_error|hit (?:your |the )?(?:rate|usage|session|spending|credit|quota) limit|(?:rate|usage|session|spending|credit|quota) limit (?:has been )?(?:reached|exceeded)|(?:quota|credits?) (?:has been )?(?:exhausted|exceeded)|(?:insufficient|no) (?:quota|credits?)|credit balance (?:is )?(?:too low|depleted)/iu;
const AUTH_FAILURE =
  /\b401\b|authentication (?:failed|required)|unauthorized|invalid (?:api[ _-]?key|oauth token|access token)|(?:oauth|access) token (?:has )?expired|(?:not logged in|login required|sign[ -]?in required)|missing (?:api[ _-]?key|credentials)/iu;
const HARNESS_STDOUT_FAILURE = /^API call failed after \d+ retries?:/iu;
const BENIGN_STDERR_NOTICE =
  /^(?:root agent idle; waiting for \d+ background task\(s\)(?: \(bounded by --print-timeout\))?|Reading (?:additional input|prompt) from stdin\.\.\.)$/iu;

function classifyMessage(message) {
  if (QUOTA_FAILURE.test(message)) return 'provider-quota';
  if (AUTH_FAILURE.test(message)) return 'authentication';
  return 'harness-error';
}

export function evidenceFromTrace(stdout, stderr) {
  const messages = [];
  for (const line of String(stdout).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      messages.push(...structuredErrorMessages(JSON.parse(line)));
    } catch {
      // Ordinary stdout prose is model output. Keep only a narrow harness-owned
      // failure sentinel observed from Hermes; broad scanning creates false
      // quota failures when a model merely discusses a 429.
      if (HARNESS_STDOUT_FAILURE.test(line.trim())) messages.push(line.trim());
    }
  }
  for (const line of String(stderr).split(/\r?\n/u)) {
    if (line.trim() && !BENIGN_STDERR_NOTICE.test(line.trim())) messages.push(line.trim());
  }
  return messages.map((message) => ({ class: classifyMessage(message), message }));
}

async function evidenceFromFiles(stdoutPath, stderrPath) {
  const evidence = [];
  const stdout = createInterface({ input: createReadStream(stdoutPath), crlfDelay: Infinity });
  for await (const line of stdout) {
    try {
      for (const message of structuredErrorMessages(JSON.parse(line)))
        evidence.push({ class: classifyMessage(message), message });
    } catch {
      if (HARNESS_STDOUT_FAILURE.test(line.trim()))
        evidence.push({ class: classifyMessage(line.trim()), message: line.trim() });
    }
  }
  const stderr = createInterface({ input: createReadStream(stderrPath), crlfDelay: Infinity });
  for await (const line of stderr)
    if (line.trim() && !BENIGN_STDERR_NOTICE.test(line.trim()))
      evidence.push({ class: classifyMessage(line.trim()), message: line.trim() });
  return evidence;
}

/**
 * The workspace MCP tools by their unprefixed names, read from the packaged manifest so a
 * tool added to the registry counts the day it ships; a harness adds its own prefix. The
 * hand-kept list this replaced lacked five tools, so a session that only discovered and
 * configured a project read as `not-exercised`. Longest names first, so `renderer` is not
 * cut short by `render`.
 */
const KILN_MCP_TOOL = new RegExp(
  `kiln_(?:${JSON.parse(readFileSync(join(REPO, 'src/generated/mcp-manifest.json'), 'utf8'))
    .tools.map((tool) => tool.name.replace(/^kiln_/u, ''))
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'u',
);

/**
 * Every tool call in a trace, counted by name, and whether any of them reached the
 * workspace MCP server. The receipt needs this because a run can succeed without
 * it: an outer agent that dispatches an in-session subagent never loads the
 * workspace's MCP configuration, and the child then works through the CLI alone.
 * That is a finding about the MCP path, not a failure, and it was invisible until
 * someone read the trace by hand.
 *
 * Shapes recognised: OpenCode (`{type:'tool_use', part:{tool}}`), Claude stream
 * JSON (`{type:'tool_use', name}` inside message content), Codex JSONL
 * (`{type:'mcp_tool_call', server, tool}` and `command_execution` items), Agy stream
 * JSON (`{event:'step_update', step_update:{step_index, tool_name}}`, emitted when a
 * tool step starts and again when it ends, so one step index is one call). OpenCode
 * code-mode metadata records nested calls; count those alongside the execute wrapper,
 * never infer execution from source or returned text. Agy's generic MCP dispatcher
 * identifies the server and tool in its step parameters. Anything
 * else counts as no tool calls, which the receipt reports as `unknown` rather than
 * as `not-exercised`.
 */
export function toolUsageFromEvents(events) {
  const calls = {};
  const agySteps = new Map();
  const record = (name) => {
    if (typeof name !== 'string' || !name) return;
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.event === 'step_update' && node.step_update && typeof node.step_update === 'object') {
      const step = node.step_update;
      if (typeof step.tool_name === 'string') {
        const key = `${step.conversation_id ?? ''}:${step.step_index}`;
        const previous = agySteps.get(key);
        agySteps.set(key, {
          ...previous,
          ...step,
          tool_info: step.tool_info ?? previous?.tool_info,
        });
      }
      return;
    }
    if (node.type === 'tool_use') {
      record(node.name ?? node.tool ?? node.part?.tool);
      if (node.part?.tool === 'execute') {
        const nested = node.part.state?.metadata?.metadata?.toolCalls;
        if (Array.isArray(nested)) for (const call of nested) record(call?.tool);
      }
      return;
    }
    if (node.type === 'mcp_tool_call') {
      record(`${node.server ?? 'mcp'}__${node.tool ?? 'unknown'}`);
      return;
    }
    if (node.type === 'command_execution') {
      record('command_execution');
      return;
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value);
  };
  for (const event of events) visit(event);
  for (const step of agySteps.values()) {
    const params = step.tool_info?.parameters;
    record(
      step.tool_name === 'call_mcp_tool' &&
        typeof params?.ServerName === 'string' &&
        typeof params?.ToolName === 'string'
        ? `${params.ServerName}__${params.ToolName}`
        : step.tool_name,
    );
  }
  const total = Object.values(calls).reduce((sum, count) => sum + count, 0);
  const mcpCalls = Object.entries(calls)
    .filter(([name]) => KILN_MCP_TOOL.test(name))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    calls,
    total,
    mcpCalls,
    workspaceMcp: total === 0 ? 'unknown' : mcpCalls > 0 ? 'exercised' : 'not-exercised',
  };
}

async function toolUsageFromFile(stdoutPath) {
  const events = [];
  const stdout = createInterface({ input: createReadStream(stdoutPath), crlfDelay: Infinity });
  for await (const line of stdout) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Prose, not an event.
    }
  }
  return toolUsageFromEvents(events);
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

/** Spawn one process-group leader; deadlines signal exactly that group and no name-based reaper. */
export function runProcess(
  bin,
  args,
  { cwd, env, stdin = null, stdoutPath, stderrPath, timeoutMs, killGraceMs = 5_000, signal = null },
) {
  return new Promise((resolveRun) => {
    const stdout = createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
    const stderr = createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });
    // Register before the process can exit. Attaching these listeners from
    // `finish` loses the event when a very short command closes the streams in
    // the same tick, leaving the driver waiting forever after the child is gone.
    const stdoutClosed = new Promise((done) => stdout.once('close', done));
    const stderrClosed = new Promise((done) => stderr.once('close', done));
    const resolved = resolveBin(bin);
    const spawnOptions = {
      cwd,
      env,
      detached: process.platform !== 'win32',
      shell: resolved.shell,
      stdio: [stdin === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    };
    const child = resolved.shell
      ? spawn(quoteArg(resolved.cmd), args.map(quoteArg), spawnOptions)
      : spawn(resolved.cmd, args, spawnOptions);
    if (stdin !== null) child.stdin.end(stdin);
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    const started = Date.now();
    let timedOut = false;
    let interrupted = false;
    let settled = false;
    let forceTimer = null;
    const stop = (reason) => {
      if (settled) return;
      if (reason === 'deadline') timedOut = true;
      else interrupted = true;
      const note = reason === 'deadline' ? 'deadline exceeded' : 'operator interruption requested';
      stderr.write(`\n[tier2-driver] ${note}; terminating process group ${child.pid}\n`);
      killProcessTree(child, 'SIGTERM');
      forceTimer = setTimeout(() => killProcessTree(child, 'SIGKILL'), killGraceMs);
    };
    const timer = setTimeout(() => stop('deadline'), timeoutMs);
    const abort = () => stop('operator interruption');
    signal?.addEventListener('abort', abort, { once: true });
    const finish = (exitCode, spawnError = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      if (spawnError) stderr.write(`\n[tier2-driver] spawn failed: ${spawnError.message}\n`);
      stdout.end();
      stderr.end();
      Promise.all([stdoutClosed, stderrClosed]).then(() =>
        resolveRun({
          exitCode: exitCode ?? -1,
          timedOut,
          interrupted,
          seconds: (Date.now() - started) / 1000,
          spawnError: spawnError?.message ?? null,
        }),
      );
    };
    child.once('error', (error) => finish(-1, error));
    child.once('close', (code) => finish(code));
  });
}

export function discoverArtifacts(root) {
  const artifacts = [];
  const visit = (directory, relativeDirectory = '') => {
    // The public clone contains ready-made sources and GLBs and a README smoke
    // can add another. None is evidence that the nested author made an asset.
    // The required asset workspace is separate, so a Git checkout is an
    // evidence boundary rather than a candidate.
    if (relativeDirectory && existsSync(join(directory, '.git'))) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = join(relativeDirectory, entry.name);
      const segments = relativePath.split(sep);
      if (entry.isDirectory()) {
        if (!ARTIFACT_EXCLUDED_SEGMENTS.has(entry.name))
          visit(join(directory, entry.name), relativePath);
        continue;
      }
      const kind = entry.name.endsWith('.kiln.js')
        ? 'source'
        : entry.name.toLowerCase().endsWith('.glb')
          ? 'glb'
          : null;
      if (!kind || segments.some((segment) => ARTIFACT_EXCLUDED_SEGMENTS.has(segment))) continue;
      const path = join(directory, entry.name);
      const bytes = readFileSync(path);
      artifacts.push({
        kind,
        path: relativePath.split(sep).join('/'),
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  };
  visit(root);
  return artifacts;
}

export function classifyOutcome({ exitCode, timedOut, interrupted = false, evidence, artifacts }) {
  if (evidence.some((item) => item.class === 'provider-quota')) return 'provider-quota';
  if (evidence.some((item) => item.class === 'authentication')) return 'authentication';
  if (interrupted) return 'interrupted';
  if (timedOut) return 'timed-out';
  if (exitCode !== 0) return 'harness-error';
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  if (kinds.has('source') && kinds.has('glb')) return 'completed-pending-review';
  if (kinds.size > 0) return 'partial-asset';
  return 'asset-failure';
}

export function sanitizeReceipt(value, replacements = []) {
  const ordered = [...replacements]
    .filter(([needle]) => needle)
    .sort(([left], [right]) => right.length - left.length);
  const sanitizeString = (input) => {
    let output = input;
    for (const [needle, replacement] of ordered) output = output.replaceAll(needle, replacement);
    return output
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
      .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]');
  };
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeReceipt(item, ordered));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        /^(?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|password)$/iu.test(
          key,
        )
          ? '[REDACTED]'
          : sanitizeReceipt(nested, ordered),
      ]),
    );
  return value;
}

export function receiptPathReplacements({
  workspace = null,
  workspaceRoot,
  outDir,
  agyHome = null,
  hermesHome = null,
  home = homedir(),
}) {
  return [
    [workspace, '$WORKSPACE'],
    [workspaceRoot, '$WORKSPACE_ROOT'],
    [outDir, '$EVIDENCE_ROOT'],
    [agyHome, '$AGY_HOME'],
    [hermesHome, '$HERMES_HOME'],
    [home, '$HOME'],
  ];
}

function assertEvidencePath(outDir) {
  const inside = relative(REPO, outDir);
  if (!inside.startsWith('..') && !isAbsolute(inside)) {
    const first = inside.split(sep)[0];
    if (first !== '.dogfood')
      throw new Error(
        'Evidence inside the checkout must be under the ignored .dogfood/ directory.',
      );
  }
}

function assertWorkspacePath(workspaceRoot) {
  const inside = relative(REPO, workspaceRoot);
  if (!inside.startsWith('..') && !isAbsolute(inside))
    throw new Error('Tier 2 workspaces must be outside the engine checkout.');
}

function executableVersion(bin) {
  const resolved = resolveBin(bin);
  const result = resolved.shell
    ? spawnSync(quoteArg(resolved.cmd), ['--version'].map(quoteArg), {
        encoding: 'utf8',
        shell: true,
      })
    : spawnSync(resolved.cmd, ['--version'], { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/u)[0] || 'unknown';
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function sensitiveEnvironmentNames(env) {
  return Object.keys(env)
    .filter((name) => /(?:AUTH|TOKEN|SECRET|PASSWORD|API_KEY|BASE_URL|AWS_|AZURE_)/iu.test(name))
    .sort();
}

const CHILD_ENVIRONMENT_NAMES = new Set([
  'ALLUSERSPROFILE',
  'APPDATA',
  'CODEX_HOME',
  'CommonProgramFiles',
  'CommonProgramFiles(x86)',
  'CommonProgramW6432',
  'ComSpec',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'LANG',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
  'PATH',
  'PATHEXT',
  'PROGRAMDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'PSModulePath',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
]);

export function childEnvironment(base, overrides = {}, allowedNames = []) {
  const allowed = new Set(allowedNames);
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    if (
      value !== undefined &&
      (CHILD_ENVIRONMENT_NAMES.has(name) || name.startsWith('LC_') || allowed.has(name))
    )
      env[name] = value;
  }
  return { ...env, ...overrides };
}

const savedAssetKey = (asset) => asset.manifestPath ?? `${asset.sourcePath}\0${asset.glbPath}`;

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(usage);
    return 0;
  }
  const batchId = `${new Date().toISOString().replaceAll(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`;
  const outDir = opts.outDir ?? join(REPO, '.dogfood', 'tier2', batchId);
  const workspaceRoot = opts.workspaceRoot ?? join(tmpdir(), 'kiln-tier2-workspaces', batchId);
  const galleryRoot = opts.galleryRoot ?? defaultDogfoodGalleryRoot();
  assertEvidencePath(outDir);
  assertWorkspacePath(workspaceRoot);
  const emptyMcpConfig = join(workspaceRoot, 'empty-mcp.json');
  const planned = opts.goals.map((goal, index) => {
    const runId = `run-${String(index + 1).padStart(2, '0')}`;
    const workspace = join(workspaceRoot, runId);
    return {
      runId,
      goal,
      workspace,
      invocation: buildInvocation({
        harness: opts.harness,
        model: opts.model,
        prompt: composeBlindPrompt(goal, opts.repository),
        workspace,
        emptyMcpConfig,
        compactTokens: opts.compactTokens,
        provider: opts.provider,
        reasoning: opts.reasoning,
        allowDataTrainingTier: opts.allowDataTrainingTier,
        hermesHome: opts.hermesHome,
        agyHome: opts.agyHome,
        timeoutMs: opts.timeoutMs,
      }),
    };
  });
  if (opts.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        sanitizeReceipt(
          {
            mode: 'dry-run',
            repository: opts.repository,
            harness: opts.harness,
            model: opts.model ?? 'harness default',
            provider: opts.provider ?? 'harness default',
            reasoning: opts.reasoning ?? 'harness default',
            allowDataTrainingTier: opts.allowDataTrainingTier,
            hermesHome: opts.hermesHome,
            agyHome: opts.agyHome,
            timeoutSeconds: opts.timeoutMs / 1000,
            compactTokens: opts.compactTokens,
            outDir,
            workspaceRoot,
            localGallery: opts.localGallery,
            galleryRoot: opts.localGallery ? galleryRoot : null,
            runs: planned,
          },
          receiptPathReplacements({
            workspaceRoot,
            outDir,
            agyHome: opts.agyHome,
            hermesHome: opts.hermesHome,
          }),
        ),
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
  writeFileSync(emptyMcpConfig, '{"mcpServers":{}}\n', { mode: 0o600 });
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const batch = {
    schema: 'kiln.tier2-dogfood.v1',
    batchId,
    startedAt: new Date().toISOString(),
    harness: opts.harness,
    harnessVersion: executableVersion(planned[0].invocation.bin),
    requestedModel: opts.model,
    requestedProvider: opts.provider,
    requestedReasoning: opts.reasoning,
    allowDataTrainingTier: opts.allowDataTrainingTier,
    hermesHome: opts.hermesHome,
    agyHome: opts.agyHome,
    authorization: opts.authorization,
    publicRepository: PUBLIC_REPOSITORY,
    repository: opts.repository,
    timeoutSeconds: opts.timeoutMs / 1000,
    compactTokens: opts.compactTokens,
    rawEvidence: outDir,
    workspaceRoot,
    localGallery: opts.localGallery,
    localGalleryRoot: opts.localGallery ? galleryRoot : null,
    ambientSensitiveEnvironmentNames: sensitiveEnvironmentNames(process.env),
    explicitlyAllowedEnvironmentNames: opts.allowedEnvironmentNames,
    requestedRunCount: planned.length,
    plannedRuns: planned.map(({ runId, goal }) => ({ runId, goal })),
    runs: [],
  };
  try {
    for (const plan of planned) {
      if (abort.signal.aborted) break;
      const rawDir = join(outDir, 'raw', plan.runId);
      mkdirSync(rawDir, { recursive: true, mode: 0o700 });
      mkdirSync(plan.workspace, { recursive: true, mode: 0o700 });
      if (opts.harness === 'hermes') {
        const hermesHome = plan.invocation.env.HERMES_HOME;
        mkdirSync(hermesHome, { recursive: true, mode: 0o700 });
        if (!opts.hermesHome) {
          const config = hermesRunConfig({
            model: opts.model,
            provider: opts.provider,
            allowDataTrainingTier: opts.allowDataTrainingTier,
          });
          if (config) writeFileSync(join(hermesHome, 'config.yaml'), config, { mode: 0o600 });
        }
      }
      const invocationPath = join(rawDir, 'invocation.json');
      const stdoutPath = join(rawDir, 'stdout.jsonl');
      const stderrPath = join(rawDir, 'stderr.log');
      const artifactsBefore = new Set(
        discoverArtifacts(workspaceRoot).map(
          (artifact) => `${artifact.kind}\0${artifact.path}\0${artifact.sha256}`,
        ),
      );
      const savedBefore = new Set(discoverSavedAssets([workspaceRoot]).map(savedAssetKey));
      const runEnvironment = childEnvironment(
        process.env,
        plan.invocation.env,
        opts.allowedEnvironmentNames,
      );
      writeJsonAtomic(invocationPath, {
        command: plan.invocation.bin,
        args: plan.invocation.args,
        cwd: plan.workspace,
        isolation: plan.invocation.isolation,
        inheritedEnvironmentNames: Object.keys(runEnvironment).sort(),
      });
      process.stdout.write(`[${plan.runId}] starting ${opts.harness} in ${plan.workspace}\n`);
      const processResult = await runProcess(plan.invocation.bin, plan.invocation.args, {
        cwd: plan.workspace,
        env: runEnvironment,
        stdin: plan.invocation.stdin ?? null,
        stdoutPath,
        stderrPath,
        timeoutMs: opts.timeoutMs,
        signal: abort.signal,
      });
      const evidence = await evidenceFromFiles(stdoutPath, stderrPath);
      const toolUsage = await toolUsageFromFile(stdoutPath);
      const artifacts = discoverArtifacts(workspaceRoot).filter(
        (artifact) =>
          !artifactsBefore.has(`${artifact.kind}\0${artifact.path}\0${artifact.sha256}`),
      );
      const savedAssets = discoverSavedAssets([workspaceRoot]).filter(
        (asset) => !savedBefore.has(savedAssetKey(asset)),
      );
      const galleryCapture = opts.localGallery
        ? archiveSavedAssets({
            assets: savedAssets,
            galleryRoot,
            provenance: {
              kind: 'tier2-dogfood',
              batchId,
              runId: plan.runId,
              harness: opts.harness,
              model: opts.model ?? 'harness default',
              provider: opts.provider ?? 'harness default',
              reasoning: opts.reasoning ?? 'harness default',
              goal: plan.goal,
            },
          })
        : null;
      const status = classifyOutcome({ ...processResult, evidence, artifacts });
      const receipt = sanitizeReceipt(
        {
          runId: plan.runId,
          goal: plan.goal,
          status,
          exitCode: processResult.exitCode,
          timedOut: processResult.timedOut,
          interrupted: processResult.interrupted,
          seconds: processResult.seconds,
          workspace: plan.workspace,
          rawTraceDirectory: rawDir,
          isolation: plan.invocation.isolation,
          failureEvidence: evidence.slice(0, 20),
          toolUsage,
          artifactCandidates: artifacts,
          localGallery: galleryCapture
            ? {
                root: galleryCapture.galleryRoot,
                entries: galleryCapture.entries.map(({ entryId, name }) => ({ entryId, name })),
              }
            : { disabled: true },
          qualityReview: status === 'completed-pending-review' ? 'required' : 'not-applicable',
        },
        receiptPathReplacements({
          workspace: plan.workspace,
          workspaceRoot,
          outDir,
          agyHome: opts.agyHome,
          hermesHome: opts.hermesHome,
        }),
      );
      batch.runs.push(receipt);
      writeJsonAtomic(join(rawDir, 'receipt.json'), receipt);
      writeJsonAtomic(
        join(outDir, 'receipt.json'),
        sanitizeReceipt(
          batch,
          receiptPathReplacements({
            workspaceRoot,
            outDir,
            agyHome: opts.agyHome,
            hermesHome: opts.hermesHome,
          }),
        ),
      );
      process.stdout.write(`[${plan.runId}] ${status}\n`);
      if (status === 'provider-quota' || status === 'authentication') {
        process.stdout.write(`[${plan.runId}] stopping batch after provider-level failure\n`);
        break;
      }
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  batch.finishedAt = new Date().toISOString();
  batch.completedRunCount = batch.runs.length;
  batch.unstartedRuns = planned
    .slice(batch.runs.length)
    .map(({ runId, goal }) => ({ runId, goal, status: 'not-started' }));
  const publicReceipt = sanitizeReceipt(
    batch,
    receiptPathReplacements({
      workspaceRoot,
      outDir,
      agyHome: opts.agyHome,
      hermesHome: opts.hermesHome,
    }),
  );
  writeJsonAtomic(join(outDir, 'receipt.json'), publicReceipt);
  process.stdout.write(`${JSON.stringify(publicReceipt, null, 2)}\n`);
  return batch.runs.length === planned.length &&
    batch.runs.every((run) => run.status === 'completed-pending-review')
    ? 0
    : 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage}`);
    process.exitCode = 2;
  }
}
