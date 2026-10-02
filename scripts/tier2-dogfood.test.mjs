import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  agyIsolationEnv,
  buildInvocation,
  childEnvironment,
  classifyOutcome,
  composeBlindPrompt,
  discoverArtifacts,
  evidenceFromTrace,
  hermesRunConfig,
  PUBLIC_REPOSITORY,
  parseArgs,
  receiptPathReplacements,
  runProcess,
  sanitizeReceipt,
  toolUsageFromEvents,
} from './tier2-dogfood.mjs';

const roots = [];
afterEach(() => {
  // A root can still be the working directory of a process tree the driver just
  // killed; Windows reports that as EBUSY for a few hundred milliseconds after
  // taskkill returns, so the removal retries instead of failing the test.
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('Tier 2 blind dogfood driver', () => {
  test('a native executable receives the full multiline brief without shell interpretation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln argv roundtrip '));
    roots.push(root);
    const echo = join(root, 'echo.mjs');
    writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const brief =
      'Use the workspace skills.\n\nBuild a "curved leaf" & preserve 30% width.\r\nSave the final artifact.';
    const args = [echo, brief, 'literal %PATH% & ^ | < >'];
    const stdoutPath = join(root, 'stdout.json');
    const result = await runProcess(process.execPath.replaceAll('\\', '/'), args, {
      cwd: root,
      env: process.env,
      stdoutPath,
      stderrPath: join(root, 'stderr.log'),
      timeoutMs: 10000,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(stdoutPath, 'utf8'))).toEqual(args.slice(1));
  });

  test('the prompt contains only the public repository and outcome-shaped asset goal', () => {
    const prompt = composeBlindPrompt('a tide-powered cliffside signal station');

    expect(prompt).toContain('https://github.com/matthew-kissinger/kiln');
    expect(prompt).toContain('a tide-powered cliffside signal station');
    expect(prompt).toContain('launch your own headless coding agent');
    expect(prompt).toContain('inside your current run directory');
    expect(prompt).not.toContain('kiln_render');
    expect(prompt).not.toContain('create-workspace.mjs');
    expect(prompt).not.toContain('AGENTS.md');
  });

  test('a blind run can name another repository, such as a local mirror of an unpushed branch', () => {
    const base = ['--harness', 'codex', '--goal', 'an intricate walking crane'];
    expect(parseArgs(base).repository).toBe(PUBLIC_REPOSITORY);
    const parsed = parseArgs([...base, '--repository', 'C:/mirrors/kiln.git']);
    expect(parsed.repository).toBe('C:/mirrors/kiln.git');

    const prompt = composeBlindPrompt('an intricate walking crane', parsed.repository);
    expect(prompt.split('\n')[0]).toBe('Repository: C:/mirrors/kiln.git');
    expect(prompt).not.toContain(PUBLIC_REPOSITORY);
    expect(() => parseArgs([...base, '--repository'])).toThrow(/needs a value/);
    expect(() => parseArgs([...base, '--repository', 'two words'])).toThrow(/--repository/);
  });

  test('dry-run is the default and live execution needs an authorization record', () => {
    expect(parseArgs(['--harness', 'codex', '--goal', 'an intricate walking crane'])).toMatchObject(
      {
        dryRun: true,
        live: false,
        runs: 1,
      },
    );
    expect(() =>
      parseArgs(['--harness', 'codex', '--goal', 'an intricate walking crane', '--run-live']),
    ).toThrow(/authorization/i);
  });

  test('live child environments exclude ambient secrets unless explicitly allowed', () => {
    const base = {
      PATH: '/bin',
      HOME: '/home/tester',
      CLOUDFLARE_TOKEN: 'must-not-pass',
      OPENAI_API_KEY: 'explicit-provider-key',
      LC_ALL: 'C',
    };
    expect(childEnvironment(base, { HOME: '/isolated' })).toEqual({
      PATH: '/bin',
      HOME: '/isolated',
      LC_ALL: 'C',
    });
    expect(childEnvironment(base, {}, ['OPENAI_API_KEY'])).toEqual({
      PATH: '/bin',
      HOME: '/home/tester',
      OPENAI_API_KEY: 'explicit-provider-key',
      LC_ALL: 'C',
    });
    expect(
      parseArgs(['--harness', 'codex', '--goal', 'a crane', '--allow-env', 'OPENAI_API_KEY'])
        .allowedEnvironmentNames,
    ).toEqual(['OPENAI_API_KEY']);
  });

  test('user-library capture is default-on and can be explicitly redirected or disabled', () => {
    expect(parseArgs(['--harness', 'codex', '--goal', 'an intricate walking crane'])).toMatchObject(
      { localGallery: true, galleryRoot: null },
    );
    expect(
      parseArgs([
        '--harness',
        'codex',
        '--goal',
        'an intricate walking crane',
        '--gallery-root',
        '/tmp/private-gallery',
      ]),
    ).toMatchObject({ localGallery: true, galleryRoot: resolve('/tmp/private-gallery') });
    expect(
      parseArgs([
        '--harness',
        'codex',
        '--goal',
        'an intricate walking crane',
        '--no-local-gallery',
      ]),
    ).toMatchObject({ localGallery: false });
  });

  test('Codex and Claude invocations suppress inherited customization but retain auth', () => {
    const codex = buildInvocation({
      harness: 'codex',
      model: null,
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: 333000,
    });
    expect(codex.args).toContain('--ignore-user-config');
    expect(codex.args).toContain('--ignore-rules');
    expect(codex.args).toContain('--ephemeral');
    expect(codex.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(codex.args).toContain('model_auto_compact_token_limit=333000');
    expect(codex.args).not.toContain('brief');
    expect(codex.stdin).toBe('brief');

    const claude = buildInvocation({
      harness: 'claude',
      model: 'sonnet',
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: 333000,
    });
    expect(claude.args).toContain('--safe-mode');
    expect(claude.args).toContain('--strict-mcp-config');
    expect(claude.args).toContain('/tmp/empty.json');
    expect(claude.args).toContain('333k');
  });

  test('OpenCode and Hermes outer runs suppress inherited Kiln configuration', () => {
    const opencode = buildInvocation({
      harness: 'opencode',
      model: 'opencode/muse-spark-1.3-contributor-free',
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: null,
      provider: null,
      reasoning: null,
    });
    expect(opencode.args).toContain('--standalone');
    expect(opencode.args).not.toContain('--pure');
    expect(opencode.args).not.toContain('--dir');
    expect(opencode.args).toContain('--auto');
    expect(opencode.env).toEqual({ XDG_CONFIG_HOME: join('/tmp/run', '.outer-opencode-config') });

    const hermes = buildInvocation({
      harness: 'hermes',
      model: 'gpt-5.6-luna',
      provider: 'openai-codex',
      reasoning: 'xhigh',
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: null,
    });
    expect(hermes.args).toContain('--safe-mode');
    expect(hermes.args).toContain('--yolo');
    expect(hermes.args).toContain('openai-codex');
    expect(hermes.args).toContain('xhigh');
    expect(hermes.env).toEqual({ HERMES_HOME: join('/tmp/run', '.outer-hermes-home') });
  });

  test('only harnesses with per-run absolute controls accept compact tokens', () => {
    expect(() =>
      parseArgs([
        '--harness',
        'opencode',
        '--goal',
        'an intricate walking crane',
        '--compact-tokens',
        '333000',
      ]),
    ).toThrow(/per-run absolute compaction/i);
  });

  test('Hermes contributor tiers require an explicit isolated-home acknowledgement', () => {
    const parsed = parseArgs([
      '--harness',
      'hermes',
      '--goal',
      'an intricate walking crane',
      '--allow-data-training-tier',
    ]);
    const invocation = buildInvocation({
      harness: 'hermes',
      model: 'muse-spark-1.3-contributor-free',
      provider: 'opencode-free',
      reasoning: null,
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: null,
      allowDataTrainingTier: parsed.allowDataTrainingTier,
    });

    expect(invocation.args).not.toContain('--safe-mode');
    expect(invocation.env).toEqual({ HERMES_HOME: join('/tmp/run', '.outer-hermes-home') });
  });

  test('an isolated Hermes home preserves the selected free route for nested agents', () => {
    expect(
      hermesRunConfig({
        model: 'nemotron-3.5-lightning-free',
        provider: 'opencode-free',
        allowDataTrainingTier: false,
      }),
    ).toBe('model:\n  default: nemotron-3.5-lightning-free\n  provider: opencode-free\n');
    expect(
      hermesRunConfig({
        model: 'muse-spark-1.3-contributor-free',
        provider: 'opencode-free',
        allowDataTrainingTier: true,
      }),
    ).toContain('allow_data_training_tiers_noninteractive: true');
  });

  test('Hermes can use an operator-prepared isolated OAuth home', () => {
    const parsed = parseArgs([
      '--harness',
      'hermes',
      '--goal',
      'an intricate walking crane',
      '--hermes-home',
      '/tmp/hermes-home',
    ]);
    const invocation = buildInvocation({
      harness: 'hermes',
      model: 'gpt-5.6-luna',
      provider: 'openai-codex',
      reasoning: 'xhigh',
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: null,
      hermesHome: parsed.hermesHome,
    });

    expect(invocation.env).toEqual({ HERMES_HOME: resolve('/tmp/hermes-home') });
  });

  test('Agy requires an operator-prepared clean auth home and attaches its print prompt', () => {
    const parsed = parseArgs([
      '--harness',
      'agy',
      '--goal',
      'an intricate walking crane',
      '--agy-home',
      '/tmp/agy-home',
    ]);
    const invocation = buildInvocation({
      harness: 'agy',
      model: 'gemini-3.8-flash-high',
      provider: null,
      reasoning: 'high',
      prompt: 'brief',
      workspace: '/tmp/run',
      emptyMcpConfig: '/tmp/empty.json',
      compactTokens: null,
      timeoutMs: 60_000,
      agyHome: parsed.agyHome,
    });

    expect(invocation.args).toContain('--print=brief');
    expect(invocation.args).toContain('--new-project');
    expect(invocation.env).toEqual(agyIsolationEnv(resolve('/tmp/agy-home')));
  });

  test('Agy isolates the Windows profile variables used by its config resolver', () => {
    expect(agyIsolationEnv('C:\\isolated\\agy-home', 'win32')).toEqual({
      HOME: 'C:\\isolated\\agy-home',
      USERPROFILE: 'C:\\isolated\\agy-home',
      HOMEDRIVE: 'C:',
      HOMEPATH: '\\isolated\\agy-home',
    });
  });

  test('Agy keeps the conventional isolated HOME on Linux and macOS', () => {
    for (const platform of ['linux', 'darwin']) {
      expect(agyIsolationEnv('/tmp/isolated-agy-home', platform)).toEqual({
        HOME: '/tmp/isolated-agy-home',
      });
    }
  });

  test('telemetry field names do not masquerade as a quota failure', () => {
    const trace = [
      JSON.stringify({
        type: 'result',
        usage: { rateLimitType: 'five_hour', tokens: 123 },
        message: 'Finished normally',
      }),
    ].join('\n');
    expect(evidenceFromTrace(trace, '')).toEqual([]);
    expect(classifyOutcome({ exitCode: 0, timedOut: false, evidence: [], artifacts: [] })).toBe(
      'asset-failure',
    );
  });

  test('quota and authentication failures require explicit error evidence', () => {
    const quota = evidenceFromTrace(
      `${JSON.stringify({ type: 'error', message: 'Usage limit reached for this account' })}\n`,
      '',
    );
    expect(quota[0]).toMatchObject({ class: 'provider-quota' });
    expect(classifyOutcome({ exitCode: 1, timedOut: false, evidence: quota, artifacts: [] })).toBe(
      'provider-quota',
    );

    const auth = evidenceFromTrace('', 'Error: OAuth token expired; please login again');
    expect(auth[0]).toMatchObject({ class: 'authentication' });

    const hermesQuota = evidenceFromTrace(
      'API call failed after 3 retries: HTTP 429: Rate limit exceeded.\n',
      '',
    );
    expect(hermesQuota[0]).toMatchObject({ class: 'provider-quota' });

    const codexQuota = evidenceFromTrace(
      '',
      "You've hit your usage limit. Upgrade to Pro or try again later.",
    );
    expect(codexQuota[0]).toMatchObject({ class: 'provider-quota' });
  });

  test('known Agy coordination notices are not failure evidence', () => {
    const evidence = evidenceFromTrace(
      '',
      'root agent idle; waiting for 1 background task(s) (bounded by --print-timeout)\nError: child process failed',
    );

    expect(evidence).toEqual([{ class: 'harness-error', message: 'Error: child process failed' }]);
  });

  test('Codex stdin progress notices are not failure evidence', () => {
    expect(evidenceFromTrace('', 'Reading prompt from stdin...\n')).toEqual([]);
    expect(evidenceFromTrace('', 'Reading additional input from stdin...\n')).toEqual([]);
  });

  test('the receipt says whether the workspace MCP server was exercised at all', () => {
    // The blind OpenCode run of 2026-09-16 completed through the CLI alone: the
    // outer agent dispatched an in-session subagent that never saw the
    // workspace's MCP server. Nothing in the receipt said so.
    const opencode = [
      { type: 'tool_use', part: { type: 'tool', tool: 'bash', state: { status: 'completed' } } },
      { type: 'tool_use', part: { type: 'tool', tool: 'read' } },
      { type: 'tool_use', part: { type: 'tool', tool: 'bash' } },
      { type: 'text', part: { text: 'kiln_render is a tool name in prose, not a call' } },
    ];
    expect(toolUsageFromEvents(opencode)).toEqual({
      calls: { bash: 2, read: 1 },
      total: 3,
      mcpCalls: 0,
      workspaceMcp: 'not-exercised',
    });

    const claude = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'rendering' },
            { type: 'tool_use', name: 'mcp__kiln_workspace__kiln_render', input: {} },
            { type: 'tool_use', name: 'Read', input: {} },
          ],
        },
      },
      { type: 'tool_use', part: { tool: 'kiln_workspace_kiln_save' } },
    ];
    expect(toolUsageFromEvents(claude)).toMatchObject({
      total: 3,
      mcpCalls: 2,
      workspaceMcp: 'exercised',
    });

    const codex = [
      { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } },
      {
        type: 'item.completed',
        item: { type: 'mcp_tool_call', server: 'kiln_workspace', tool: 'kiln_render' },
      },
    ];
    expect(toolUsageFromEvents(codex)).toMatchObject({
      calls: { command_execution: 1, kiln_workspace__kiln_render: 1 },
      workspaceMcp: 'exercised',
    });

    // The tool names come from the packaged manifest, not a list kept by hand: the
    // hand-written one lacked `kiln_discover`, `kiln_renderer`, `kiln_project`,
    // `kiln_material` and `kiln_review`, so a Codex session that only discovered
    // and configured a project read as `not-exercised`.
    for (const tool of [
      'kiln_discover',
      'kiln_renderer',
      'kiln_project',
      'kiln_material',
      'kiln_review',
    ]) {
      const only = [
        { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'kiln_workspace', tool } },
      ];
      expect(toolUsageFromEvents(only)).toMatchObject({ mcpCalls: 1, workspaceMcp: 'exercised' });
    }
    expect(
      toolUsageFromEvents([{ type: 'tool_use', name: 'mcp__kiln_workspace__kiln_render_later' }])
        .mcpCalls,
    ).toBe(0);

    expect(toolUsageFromEvents([{ type: 'text' }]).workspaceMcp).toBe('unknown');
  });

  test('a source and GLB are necessary but remain pending human quality review', () => {
    expect(
      classifyOutcome({
        exitCode: 0,
        timedOut: false,
        evidence: [],
        artifacts: [{ kind: 'source' }, { kind: 'glb' }],
      }),
    ).toBe('completed-pending-review');
    expect(
      classifyOutcome({
        exitCode: 0,
        timedOut: false,
        evidence: [],
        artifacts: [{ kind: 'source' }],
      }),
    ).toBe('partial-asset');
  });

  test('artifact discovery excludes installed skill samples and cloned examples', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-tier2-artifact-test-'));
    roots.push(root);
    for (const relative of [
      'workspace/skills/author/references/sample.kiln.js',
      'workspace/.agents/skills/author/references/sample.kiln.js',
      'clone/examples/finished.kiln.js',
      'workspace/final.kiln.js',
      'workspace/final.glb',
    ]) {
      const path = join(root, relative);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, relative);
    }
    mkdirSync(join(root, 'clone', '.git'));

    expect(discoverArtifacts(root).map(({ path }) => path)).toEqual([
      'workspace/final.glb',
      'workspace/final.kiln.js',
    ]);
  });

  test('the deadline reports itself and ends the process', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-tier2-timeout-test-'));
    roots.push(root);
    const stdoutPath = join(root, 'stdout.jsonl');
    const stderrPath = join(root, 'stderr.log');
    const result = await runProcess('node', ['-e', 'setInterval(()=>{},1000)'], {
      cwd: root,
      env: process.env,
      stdoutPath,
      stderrPath,
      timeoutMs: 50,
      killGraceMs: 50,
    });

    expect(result.timedOut).toBe(true);
    expect(result.interrupted).toBe(false);
    expect(readFileSync(stderrPath, 'utf8')).toContain('deadline exceeded');
  }, 30_000);

  test('stopping the run kills the descendants the process had spawned', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-tier2-timeout-test-'));
    roots.push(root);
    const spawned = join(root, 'descendant-spawned');
    const marker = join(root, 'descendant-survived');
    const stdoutPath = join(root, 'stdout.jsonl');
    const stderrPath = join(root, 'stderr.log');
    // The child announces its descendant only once it exists. Stopping the run
    // on a fixed timer instead raced node start-up on a loaded runner: the child
    // was killed before it had spawned anything, and the orphan it spawned
    // afterwards survived, which is not what the driver is asked to prevent.
    const childScript = [
      "const {spawn}=require('node:child_process')",
      `spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),1500)`)}],{stdio:'ignore'})`,
      `require('node:fs').writeFileSync(${JSON.stringify(spawned)},'ok')`,
      'setInterval(()=>{},1000)',
    ].join(';');
    const controller = new AbortController();
    const run = runProcess('node', ['-e', childScript], {
      cwd: root,
      env: process.env,
      stdoutPath,
      stderrPath,
      timeoutMs: 20_000,
      killGraceMs: 50,
      signal: controller.signal,
    });
    while (!existsSync(spawned)) await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const result = await run;
    // Outlive the descendant's own timer so a survivor would have written.
    await new Promise((resolve) => setTimeout(resolve, 1700));

    expect(result.interrupted).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(stderrPath, 'utf8')).toContain('terminating process group');
  }, 30_000);

  test('a harness prompt can be delivered through stdin without becoming a shell argument', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-tier2-stdin-test-'));
    roots.push(root);
    const stdoutPath = join(root, 'stdout.jsonl');
    const stderrPath = join(root, 'stderr.log');
    const result = await runProcess(
      'node',
      [
        '-e',
        "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(s))",
      ],
      {
        cwd: root,
        env: process.env,
        stdin: 'line one\nline two',
        stdoutPath,
        stderrPath,
        timeoutMs: 1_000,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(readFileSync(stdoutPath, 'utf8')).toBe('line one\nline two');
  });

  test('sanitized receipts redact credentials and machine paths', () => {
    const sanitized = sanitizeReceipt(
      {
        workspace: '/home/operator/private/run',
        note: 'Authorization: Bearer secret-token and api_key=sk-test-secret',
      },
      [
        ['/home/operator/private/run', '$WORKSPACE'],
        ['/home/operator', '$HOME'],
      ],
    );
    expect(JSON.stringify(sanitized)).toBe(
      '{"workspace":"$WORKSPACE","note":"Authorization: Bearer [REDACTED] and api_key=[REDACTED]"}',
    );
  });

  test('sanitized receipts replace operator-prepared authentication home paths', () => {
    const replacements = receiptPathReplacements({
      workspace: '/tmp/workspaces/run-01',
      workspaceRoot: '/tmp/workspaces',
      outDir: '/tmp/evidence',
      agyHome: '/tmp/private-agy-auth-home',
      hermesHome: '/tmp/private-hermes-auth-home',
      home: '/home/operator',
    });
    const sanitized = sanitizeReceipt(
      {
        agyHome: '/tmp/private-agy-auth-home',
        hermesHome: '/tmp/private-hermes-auth-home',
        details: ['HOME=/tmp/private-agy-auth-home', 'HERMES_HOME=/tmp/private-hermes-auth-home'],
      },
      replacements,
    );

    expect(sanitized).toEqual({
      agyHome: '$AGY_HOME',
      hermesHome: '$HERMES_HOME',
      details: ['HOME=$AGY_HOME', 'HERMES_HOME=$HERMES_HOME'],
    });
  });
});
