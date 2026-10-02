// The parts of a headless dispatch that are not about authoring an asset.
//
// Two callers need the same machinery for different reasons:
// `dispatch-asset.mjs` sends an agent to write a program, and
// `harness-smoke.mjs` sends one to prove the tools are reachable at all. What
// they share is everything below -- the harness table, spawning a CLI on
// Windows without losing the prompt to a shell, enforcing a deadline on a
// process tree, and building the clean room the child runs in.
//
// It lives in its own file because the alternative was a second copy, and the
// comments here are the record of failures that took hours to diagnose. A
// duplicate of that record is a duplicate that goes stale, and the half that
// goes stale is the half nobody was reading when it mattered.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `--model X`, or nothing at all when the harness should use its own default. */
const modelFlag = (model) => (model ? ['--model', model] : []);

/**
 * A model's published output-token limit, from OpenCode's own catalog.
 *
 * Read from the cache it already maintains rather than hardcoded, so a new model
 * gets its real ceiling the day it appears and a lowered one is respected.
 * Returns null when the catalog is missing or says nothing, which leaves the
 * harness default alone.
 */
function declaredOutputLimit(model) {
  const id = String(model ?? '');
  const slash = id.indexOf('/');
  if (slash < 0) return null;
  try {
    const cache = join(homedir(), '.cache', 'opencode', 'models.json');
    if (!existsSync(cache)) return null;
    const catalog = JSON.parse(readFileSync(cache, 'utf8'));
    const entry = catalog?.[id.slice(0, slash)]?.models?.[id.slice(slash + 1)];
    const out = entry?.limit?.output;
    return Number.isInteger(out) && out > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Colour codes are noise when you are trying to read a model name out of a log. */
// The rule is for control characters that arrived by accident. Stripping ANSI
// means matching ESC, so here it is the point of the expression.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC is deliberate
const stripAnsi = (s) => String(s).replaceAll(/\u001B\[[0-9;]*m|\[0m/gu, '');

// One entry per harness. `argv` is a function so a harness that needs the
// prompt attached to a flag (agy) and one that takes it positionally (claude,
// codex) can share the same call site.
export const HARNESSES = {
  agy: {
    bin: 'agy',
    defaultModel: 'gemini-3.8-flash-high',
    // --print takes its prompt ATTACHED. Passed separately, Go's flag package
    // reads the next flag as the prompt and silently ignores what you typed.
    // Print mode does not run unattended by itself. Its own log says what happens
    // instead: `Print mode: soft-denying tool confirmation "CallMcpTool" at step
    // 10`, then the turn ends exit 0 with no program -- the same silent shape the
    // Claude and Codex notes describe. A smoke run reached step 10 and died there.
    argv: ({ model, prompt, timeout, logFile, sandbox }) => [
      '--dangerously-skip-permissions',
      '--model',
      model,
      '--print-timeout',
      timeout,
      '--add-dir',
      sandbox,
      '--log-file',
      logFile,
      `--print=${prompt}`,
    ],
    // agy prints "Agent execution terminated due to error." to stdout and puts
    // the actual cause only in --log-file. Without reading that file back a
    // quota failure is indistinguishable from a bad prompt, and the fallback
    // ladder below never fires -- which is exactly how a ten-asset batch came
    // back empty in forty seconds with no usable diagnosis.
    needsLogFile: true,
    probe: (model) => [
      '--dangerously-skip-permissions',
      '--model',
      model,
      '--print=reply with the single word OK',
    ],
    // Antigravity rate-limits per model id, and a 429 on one variant does not
    // mean the account is out of quota -- so fall back down the ladder rather
    // than failing the batch.
    fallbackModels: ['gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-3.1-pro-low'],
  },
  claude: {
    bin: 'claude',
    probe: (model) => ['-p', 'reply with the single word OK', '--model', model],
    defaultModel: 'sonnet',
    // `--allowedTools` and not only the sandbox's settings file: project
    // settings are applied once a directory is trusted, and a dispatch sandbox
    // is a directory the CLI has never seen. In a non-interactive run there is
    // nobody to trust it, so the allow-list written into `.claude/settings.json`
    // was honoured on some runs and silently ignored on others -- the same batch
    // produced a finished 22,000-triangle ship and two runs that could not call
    // the catalog discovery tool at all. A CLI flag is not subject to that, so the
    // grant is passed on the invocation and the settings file stays as the
    // belt-and-braces copy other harnesses can read. Both server names appear
    // because the tool prefix depends on how Kiln was installed.
    argv: ({ model, prompt, sandbox }) => [
      '-p',
      prompt,
      '--model',
      model,
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'mcp__kiln_workspace mcp__plugin_kiln_kiln mcp__kiln Read Write Edit Glob Grep',
      '--add-dir',
      sandbox,
    ],
    fallbackModels: [],
  },
  // Three things here were wrong for as long as this table existed, and every
  // one of them failed before the model saw the brief -- which is why nothing in
  // the gallery came from Codex. `--full-auto` is deprecated in favour of an
  // explicit `--sandbox`. A clean room is a bare temp directory, so Codex
  // refuses it as "not inside a trusted directory" unless the git check is
  // waived. And the sandbox was never passed at all: without `--cd` the child
  // ran in this repository with every finished example in reach, which is the
  // exact contamination `makeSandbox` exists to prevent.
  codex: {
    bin: 'codex',
    probe: (model) => [
      'exec',
      ...modelFlag(model),
      '--skip-git-repo-check',
      'reply with the single word OK',
    ],
    // No default model, deliberately. Codex rejects a model its account is not
    // entitled to -- `gpt-5.1-codex` came back "not supported when using Codex
    // with a ChatGPT account" -- and which ids an account can reach is not
    // something this repository can know. Omitting the flag uses whatever the
    // operator configured in `~/.codex/config.toml`, which is right by
    // construction. `--model` still overrides it.
    defaultModel: null,
    // `--approve-for-me` and not `--sandbox workspace-write`, which is what this
    // used to pass. `codex exec` runs with the approval policy pinned to
    // `never`, and under that policy an MCP tool call is not asked about, it is
    // refused: four dispatches came back inside a minute having written nothing
    // but a note that catalog discovery was blocked. The two flags are
    // mutually exclusive on the command line, and `--approve-for-me` is the one
    // that does both jobs -- it selects the same workspace-write sandbox and
    // moves approval to `on-request`, routed through automatic review, which is
    // what an unattended run needs. It is the Codex spelling of OpenCode's
    // `--auto` and of the Claude allow-list above, and like both of those it
    // governs one throwaway temp directory holding a brief and a copy of the
    // skills.
    argv: ({ model, prompt, sandbox }) => [
      'exec',
      ...modelFlag(model),
      '--approve-for-me',
      '--skip-git-repo-check',
      '--cd',
      sandbox,
      prompt,
    ],
    fallbackModels: [],
  },
  // OpenCode is the widest model surface of the four: one subscription reaches
  // a dozen vendors' models behind `provider/model` ids, which is what makes a
  // gallery with more than one author's handwriting in it possible at all.
  // `--auto` is what lets it run unattended; without it the child stops at the
  // first tool-permission prompt and the run times out having written nothing.
  opencode: {
    bin: 'opencode',
    probe: (model) => ['run', '--auto', '-m', model, 'reply with the single word OK'],
    // The -flash variant and not plain glm-5.3, which is text only. A default
    // that cannot see images is the worst kind of wrong here: the run succeeds,
    // the program builds, and the asset is quietly worse because the model wrote
    // it blind and nothing in the output says so. scripts/check-vision.mjs is how
    // this pair was found and is worth running before trusting any new id.
    defaultModel: 'opencode-go/glm-5.3-flash',
    // Callers already set cwd to the workspace. V2 removed --dir; a private
    // server also prevents an older shared service from retaining another loadout.
    argv: ({ model, prompt }) => ['run', '--standalone', '--auto', '-m', model, prompt],
    // The model that answered, read back rather than assumed. `-m` has been
    // honoured on every run measured so far, but the gallery's whole claim is
    // that a named model wrote a particular program, and "we asked for it" is a
    // weaker thing to be able to say than "it said so". OpenCode announces its
    // choice as `> <agent> · <model>`, so the dispatcher takes it from there and
    // reports any disagreement instead of quietly preferring its own request.
    // OpenCode caps a single assistant step at 32,000 output tokens regardless of
    // what the model can actually do. Measured across every step in its session
    // store, nothing ever exceeded that number -- not once, not by one token --
    // while the models involved declare limits of 80,000 to 943,718. Runs died
    // there mid-sentence with no file written and no error.
    //
    // `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` is the knob for it. This raises it
    // to the model's OWN published limit rather than to a number picked here, so
    // the ceiling is the one the provider set and never higher.
    env: ({ model }) => {
      const out = declaredOutputLimit(model);
      return out ? { OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: String(out) } : {};
    },
    actualModel: (out) => /^>\s*\S+\s+·\s+(\S+)\s*$/m.exec(stripAnsi(out))?.[1] ?? null,
    // Model ids here name one vendor's model each, so there is no ladder of
    // variants to walk: a 429 on `glm-5.3` says nothing about `kimi-k3`. The
    // batch script picks the next model instead.
    fallbackModels: [],
  },
  // Copilot earns its place here for the failure it reported rather than for any
  // authoring strength. A user hit `mcp_kiln_kiln_edit: tool parameters array
  // type must have items` from the VS Code extension, which shares this CLI's
  // schema validator: it reads `items` as a plain object and a JSON Schema
  // 2020-12 tuple gives it `prefixItems` plus `items: false`, so five of
  // thirteen tools were rejected before the model ever saw them. Nothing else in
  // this table noticed -- Claude Code, OpenCode and this CLI all loaded 13 of 13.
  // A dispatch adapter is the cheap standing reproduction for that whole class of
  // breakage, and it does not need an editor open to run.
  copilot: {
    bin: 'copilot',
    // `copilot mcp --help` states the load order: user `~/.copilot/mcp-config.json`,
    // then workspace `.mcp.json` or `.github/mcp.json`. The workspace spelling is
    // the same file Claude Code reads, so one `.mcp.json` serves both and there is
    // no Copilot-only config format to keep in sync as the server changes.
    defaultModel: null,
    // `--allow-all-tools` is not optional hardening: the CLI's own help says it is
    // required for non-interactive mode. A `-p` run without it has no terminal to
    // prompt on, which is the same exit-0-wrote-nothing shape the Claude and Codex
    // notes above describe.
    //
    // `--disable-builtin-mcps` drops the bundled github-mcp-server. A clean room
    // is meant to hold the brief, the skills and Kiln; a second server's worth of
    // tool descriptions is context no other harness here carries, and it makes any
    // comparison of tool counts or context cost meaningless.
    probe: (model) => [
      ...modelFlag(model),
      '--allow-all-tools',
      '--disable-builtin-mcps',
      '--no-color',
      '-p',
      'reply with the single word OK',
    ],
    argv: ({ model, prompt, sandbox }) => [
      ...modelFlag(model),
      '--allow-all-tools',
      '--disable-builtin-mcps',
      '--no-color',
      '-C',
      sandbox,
      '--add-dir',
      sandbox,
      '-p',
      prompt,
    ],
    fallbackModels: [],
  },
  // Cursor's CLI needs three separate grants where the others need one, and each
  // covers a different refusal: `--force` allows the tool calls, `--approve-mcps`
  // approves the MCP server itself, and `--trust` accepts the workspace. An MCP
  // server this CLI has never seen is gated independently of tool permission, so
  // `--force` alone leaves the Kiln tools unreachable.
  //
  // Its MCP config is `.cursor/mcp.json` in the workspace or `~/.cursor/mcp.json`,
  // and the risk there is specific: a user-level entry named `kiln` may point at a
  // different installation entirely. One on this machine pointed at an extracted
  // 0.6.0 package while the checkout was 0.7.0, which is the silent-wrong-engine
  // case `kiln_discover({ capabilities: true })` is meant to expose.
  'cursor-agent': {
    bin: 'cursor-agent',
    // `-p` is a boolean here and the prompt is positional, unlike Claude's
    // `-p <prompt>`. Passing it as a flag value drops the prompt.
    defaultModel: null,
    probe: (model) => [
      ...modelFlag(model),
      '-p',
      '--force',
      '--approve-mcps',
      '--trust',
      'reply with the single word OK',
    ],
    argv: ({ model, prompt, sandbox }) => [
      ...modelFlag(model),
      '-p',
      '--force',
      '--approve-mcps',
      '--trust',
      '--workspace',
      sandbox,
      prompt,
    ],
    fallbackModels: [],
  },
  // Hermes is the odd one out, and the reason this table earns its keep: a
  // Python agent with its own skill store, its own config file and its own
  // provider routing, nothing like the six CLIs above. It takes the
  // same MCP server and the same brief anyway, which is the portability claim
  // this repository actually makes -- Kiln is not a Claude Code plugin that
  // happens to run elsewhere.
  //
  // `-z` is its headless mode: one prompt in, the final response text out, no
  // banner and no approval prompts. It has no working-directory flag, so the
  // sandbox is simply the CWD `run()` spawns it in -- which is also where it
  // reads AGENTS.md from, so the clean room holds.
  hermes: {
    bin: 'hermes',
    // No default model: Hermes routes through whichever provider the operator
    // configured, and a model id hardcoded here would override a working setup
    // with a guess. Same reasoning as Codex.
    defaultModel: null,
    // `-z` is the whole harness contract here: Hermes documents it as the mode
    // for scripts and pipes, and it already resolves tool prompts on its own,
    // so no additional flag is needed to make a dispatch run unattended.
    probe: (model) => [...modelFlag(model), '-z', 'reply with the single word OK'],
    argv: ({ model, prompt }) => [...modelFlag(model), '-z', prompt],
    fallbackModels: [],
  },
};

// Windows: resolve in PATH order and use a shell only for command shims.
// Native executables receive argv directly; shim arguments need quoteArg below.
const binCache = new Map();

/**
 * Find the real executable behind a CLI name on Windows.
 *
 * `where` returns every match, and the extension decides how the thing can be
 * launched. A `.exe` takes a real argv array through CreateProcess untouched. A
 * `.cmd` shim -- which is what npm-installed CLIs are, `opencode.cmd` among them
 * -- cannot be spawned without a shell at all.
 *
 * The previous version accepted only `.exe` and silently fell through to the
 * bare name for everything else, which is how a dispatch to OpenCode hung for
 * thirty-five minutes having never created a session: with `shell: true` Node
 * concatenates argv into one command line and quotes nothing, so a prompt with
 * spaces in it arrived as a dozen separate arguments.
 */
export function resolveBin(bin) {
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  // An explicit path needs no PATH lookup. where.exe rejects forward-slash
  // paths; falling back to cmd.exe then silently drops multiline asset briefs.
  if (isAbsolute(bin)) return { cmd: resolve(bin), shell: /\.(cmd|bat)$/i.test(bin) };
  if (!binCache.has(bin)) {
    const r = spawnSync('where.exe', [bin], { encoding: 'utf8', windowsHide: true });
    const lines = (r.stdout ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Preserve PATH precedence. Preferring any .exe over every .cmd selected an
    // obsolete Scoop OpenCode even when the terminal resolved the current npm CLI.
    const command = lines.find((line) => /\.(exe|com|cmd|bat)$/i.test(line));
    binCache.set(bin, {
      cmd: command ?? bin,
      shell: command ? /\.(cmd|bat)$/i.test(command) : true,
    });
  }
  return binCache.get(bin);
}

/**
 * Quote one argument for cmd.exe.
 *
 * Only needed on the shim path: `shell: true` hands the joined string to
 * cmd.exe, and Node does no quoting of its own. Without this every argument
 * containing a space -- a prompt, a Windows path under `Program Files` -- is
 * split at the space by the shell.
 */
export const quoteArg = (a) =>
  /[\s"^&|<>]/.test(a) ? `"${String(a).replaceAll('"', '""')}"` : String(a);

/** '25m' / '90s' / '3600' -> milliseconds. */
export function parseDuration(v) {
  const m = /^(\d+)\s*([smh]?)$/.exec(String(v).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000 }[m[2]] ?? 1000);
}

/**
 * End a spawned CLI and everything it started.
 *
 * `child.kill()` signals the direct child and nothing below it. That is enough
 * on the no-shell path and useless on the one that matters: an npm-installed
 * CLI on Windows is a `.cmd` shim, so the direct child is `cmd.exe` and the
 * agent itself is a grandchild. Killing the shim leaves the agent running and
 * holding the stdout pipe open, which means `close` never fires and a job that
 * has already been declared timed out goes on running until someone kills it by
 * hand. Measured: three jobs sat between 14 and 38 minutes past a 24m deadline.
 *
 * So kill the tree. `taskkill /T` walks the child list on Windows; elsewhere the
 * child leads its own process group and the group takes the signal.
 */
export function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch {
      // fall through to the plain kill below
    }
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

/**
 * `agy` enforces the deadline itself via --print-timeout. `claude`, `codex` and
 * `opencode` have no such flag, so a child that wedges -- waiting on a tool that
 * never returns, or a model that will not stop -- hangs the whole batch with no
 * output and no error. This kills it and reports the timeout as a normal failure
 * so the caller can move to the next model.
 */
export function run(
  bin,
  args,
  { cwd = REPO, capture = true, logFile = null, timeoutMs = null, env = null } = {},
) {
  if (logFile) rmSync(logFile, { force: true });
  return new Promise((res) => {
    const resolved = resolveBin(bin);
    // A .cmd shim (npm-installed CLIs on Windows) cannot be spawned without a
    // shell, and a shell carries one flat string -- so on that path every
    // argument is quoted here, and the prompt stays one line long so no shell
    // has to carry a newline.
    // stdin is closed, not piped. A dispatched agent is given its whole brief
    // on the command line and has nothing to read, but OpenCode keeps its
    // process alive as long as stdin is an open pipe: it answers the prompt,
    // writes its files, and then sits there. Measured against the same command
    // four ways, the only variable that mattered was this one -- an open pipe
    // ran until the 75s kill, a closed one exited in 6s. The other CLIs never
    // read stdin either, so closing it costs nothing and removes a hang that
    // looks exactly like a slow model.
    const stdio = ['ignore', 'pipe', 'pipe'];
    // Off Windows the child is made its own process-group leader, which is what
    // lets `killTree` signal the group rather than just the shell in front of it.
    // Windows has no process groups to lead; `taskkill /T` covers it there.
    const detached = process.platform !== 'win32';
    const childEnv = env ? { ...process.env, ...env } : process.env;
    const child = resolved.shell
      ? spawn(quoteArg(resolved.cmd), args.map(quoteArg), {
          cwd,
          shell: true,
          stdio,
          detached,
          env: childEnv,
        })
      : spawn(resolved.cmd, args, { cwd, shell: false, stdio, detached, env: childEnv });
    let out = '';
    if (capture) {
      child.stdout.on('data', (d) => {
        out += d;
      });
      child.stderr.on('data', (d) => {
        out += d;
      });
    }
    let settled = false;
    let grace = null;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (grace) clearTimeout(grace);
      // Fold the harness's own log into the captured output, so the caller
      // sees the real cause rather than the one-line summary on stdout.
      if (logFile && existsSync(logFile)) {
        try {
          out += readFileSync(logFile, 'utf8');
        } catch {}
      }
      res({ code, out });
    };

    const timer = timeoutMs
      ? setTimeout(() => {
          out += `\ntimed out after ${(timeoutMs / 60_000).toFixed(0)}m; killed`;
          killTree(child);
          // Killing the tree should end the pipes and fire `close` on its own.
          // If it does not -- a descendant that ignores the signal, or a handle
          // held open somewhere unreachable -- the batch still has to advance,
          // so the deadline is enforced here rather than merely requested.
          grace = setTimeout(() => finish(-1), 15_000);
        }, timeoutMs)
      : null;
    child.on('error', (e) => {
      out += `\nspawn failed: ${e.message}`;
      finish(-1);
    });
    child.on('close', (code) => {
      finish(code);
    });
  });
}

/**
 * A clean room for one dispatch.
 *
 * Dispatches used to run with the harness pointed at this repository, which
 * quietly invalidated the thing they were supposed to be evidence for: a child
 * agent sitting in the repo can open `examples/cathedral.kiln.js` and copy an
 * API it never had to learn. "The tools teach the API" is not demonstrated by
 * an agent that read thirteen finished programs first.
 *
 * So each run gets its own directory containing exactly two things: the brief
 * and the Kiln skills, and nothing else. The harness's write grant is
 * scoped to it, and its working directory is it. The model arrives knowing only
 * what the skills say and what the MCP tools answer.
 *
 * The skills go in `.claude/skills/`, which Claude Code reads natively. OpenCode
 * 2.0.14 names no skill directory in its binary, only the `skills.paths` config
 * key, so the sandbox also writes an `opencode.json` pointing that key at the same
 * copy. Antigravity loads them from its installed plugin copy instead, so for
 * `agy` this directory is belt and braces rather than the delivery mechanism.
 *
 * What this does NOT isolate, and it is worth being exact: skills and MCP
 * servers the operator has installed at USER scope are still in scope, because
 * no harness here exposes a per-run flag to suppress them. What it removes is
 * the repository -- the examples, the engine source, and `AGENTS.md`.
 */
// The sandbox lives outside the repository, in the OS temp directory.
//
// The first version of this put it under `.dogfood/`, which looked isolated and
// was not: every coding CLI finds the project it is working in by walking up
// from the working directory to the nearest `.git`, so a sandbox nested inside
// the repo resolved back to the repo. The child could still reach every
// finished example, which is the exact contamination the sandbox exists to
// prevent. OpenCode additionally hung during bootstrap on such a directory --
// three concurrent runs reached `init` and never started -- so the honest fix
// and the working fix turned out to be the same one.
export function makeSandbox(name) {
  const sandbox = join(tmpdir(), 'kiln-dispatch', name);
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  const skillsSrc = join(REPO, 'skills');
  if (existsSync(skillsSrc)) {
    cpSync(skillsSrc, join(sandbox, '.claude', 'skills'), { recursive: true });
    writeFileSync(
      join(sandbox, 'opencode.json'),
      `${JSON.stringify({ $schema: 'https://opencode.ai/config.json', skills: { paths: [join(sandbox, '.claude', 'skills')] } }, null, 2)}\n`,
    );
  }

  // Pre-approve the tools the brief asks the child to use.
  //
  // `--permission-mode acceptEdits` covers writes and nothing else, so a child
  // that reached for `kiln_render` stopped and asked -- with no terminal
  // attached to ask. Three of four runs in one batch came back after a minute
  // having written nothing but a polite explanation of which permissions they
  // would need, which is the worst possible failure for an unattended path:
  // exit 0, no program, no error. The MCP server name depends on how Kiln was
  // installed (as a plugin it is `plugin_kiln_kiln`), so allow every spelling.
  // `kiln_workspace` is the third and it is the one `create-workspace.mjs` and a
  // user-level registration both use: a smoke run with only the other two listed
  // stopped and asked for the catalog discovery tool by name, exit 0, no program.
  //
  // Scoped deliberately rather than reached for with
  // `--dangerously-skip-permissions`: this settings file governs one throwaway
  // temp directory that contains a brief and a copy of the skills, and the
  // allow-list names the Kiln tools plus the file tools the child needs to
  // write its program. Nothing here grants the child the shell.
  const settings = {
    permissions: {
      allow: [
        'mcp__kiln_workspace',
        'mcp__kiln',
        'mcp__plugin_kiln_kiln',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
      ],
    },
  };
  mkdirSync(join(sandbox, '.claude'), { recursive: true });
  writeFileSync(
    join(sandbox, '.claude', 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  return sandbox;
}
