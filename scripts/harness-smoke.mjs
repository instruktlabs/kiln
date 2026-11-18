#!/usr/bin/env node
// Prove that a harness can actually reach Kiln's tools, before trusting it with
// real work.
//
//   node scripts/harness-smoke.mjs                  # every CLI on PATH
//   node scripts/harness-smoke.mjs --harness agy    # just one
//
// This exists because every wiring failure so far has been silent. A harness
// that cannot see the MCP server does not say so: `agy plugin validate` reports
// the server as processed while `agy mcp list` shows none, and the agent simply
// answers as if the tools were never mentioned. A harness that can see the
// tools but will not grant them behaves the same way -- three runs in one batch
// came back exit 0, having written a polite note about permissions instead of a
// program. Both look exactly like a model that was not up to the task.
//
// So this asks for the cheapest thing that cannot be faked: call one tool that
// only the server can answer, then write a four-line program and validate it.
// The parent then runs the engine over what came back, because the child's own
// report of success is the one piece of evidence that proves nothing.
//
// It costs one short model turn per harness. It is not part of `bun run test`
// and never should be -- it spends provider quota and needs CLIs that CI does
// not have.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HARNESSES, REPO, makeSandbox, parseDuration, run } from './harness.mjs';

// One line, because a shell-shimmed CLI on Windows carries the whole prompt as
// a single command-line string and a newline in it ends the command.
export const BRIEF = (file) =>
  [
    // Tool names are not portable. Copilot namespaces every MCP tool as
    // `<server>-<tool>`, so an unprefixed tool lookup can fail even when
    // the server is connected. `copilot -p` listed the tools as
    // `kiln_workspace-kiln_*`. Naming a tool in a prompt is a harness dependency,
    // so say the prefix may exist rather than assuming one spelling.
    'You have the Kiln MCP tools. Their names may carry a server prefix such as',
    '`kiln_workspace-kiln_render`; match on the part after any prefix.',
    'Do exactly this, in order, and nothing else.',
    // The wiring probe needs complete contracts in one deterministic call.
    // Ordinary authoring uses overview/search and discovers only what it needs.
    '1) Call kiln_discover with {"ids":["createRoot","createPart","boxGeo","gameMaterial"]}',
    'and use exactly the signatures it returns.',
    `2) Write ${file} containing a Kiln program: a bare "const meta = { name: 'Smoke' };"`,
    'then "function build() {" which calls createRoot(), makes one 1m box part with boxGeo and gameMaterial(0x808080),',
    'and returns the root. No imports and no exports.',
    '3) Call kiln_validate with code set to the exact source you wrote.',
    'Then reply with the validator verdict in one line.',
  ].join(' ');

function parseArgs(argv) {
  const opts = { harness: null, model: null, timeout: '5m' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--harness') opts.harness = argv[++i];
    else if (argv[i] === '--model') opts.model = argv[++i];
    else if (argv[i] === '--timeout') opts.timeout = argv[++i];
  }
  return opts;
}

/**
 * Is this CLI installed at all? A missing binary is a skip, not a failure --
 * nobody has all four, and a report that fails you for not having Codex is a
 * report you stop reading.
 */
function installed(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  // No shell: both probes are real executables, and asking for one only buys
  // a deprecation warning printed across the progress line.
  return spawnSync(probe, [bin], { stdio: 'ignore', shell: false }).status === 0;
}

async function smoke(name, harness, opts) {
  // May be null: a harness with no default uses whatever its own config says.
  const model = opts.model ?? harness.defaultModel;
  const sandbox = await makeSandbox(`smoke-${name}`, { harness: name });
  const file = join(sandbox, 'smoke.kiln.js');
  const logFile = join(sandbox, 'agent.log');
  const prompt = BRIEF(file);

  const started = Date.now();
  const r = await run(
    harness.runBin ?? harness.bin,
    harness.argv({ model, prompt, timeout: opts.timeout, logFile, sandbox }),
    {
      cwd: sandbox,
      logFile: harness.needsLogFile ? logFile : null,
      timeoutMs: parseDuration(opts.timeout),
      env: harness.env?.({ model }) ?? null,
    },
  );
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  // What ran, not what was asked for. The two have agreed on every run measured,
  // but a report that names the model you requested is telling you your own
  // input back, and this script exists to stop doing that.
  const ran = harness.actualModel?.(r.out) ?? null;
  const used =
    ran &&
    ran !==
      String(model ?? '')
        .split('/')
        .pop()
      ? `${ran} (asked for ${model})`
      : model;

  if (!existsSync(file)) {
    // The distinction that matters for a wiring bug: a child that never saw the
    // tools usually says so in as many words, and that reads very differently
    // from a model that tried and produced nothing.
    const said = /no such tool|not available|don't have|do not have|unable to|no tools/i.test(
      r.out,
    );
    return {
      name,
      model: used,
      secs,
      ok: false,
      why: said
        ? 'agent reported the Kiln tools were unavailable'
        : `no program written (exit ${r.code})`,
      out: r.out,
    };
  }

  // The engine has the final word. `kiln render` runs the build, the QA gates
  // and the rasterizer, so a file that satisfies it is a file the harness
  // really did produce through a working tool surface.
  const glb = join(sandbox, 'smoke.glb');
  const check = await run('bun', ['src/cli.ts', 'render', file, '--out', glb], { cwd: REPO });
  const tris = /(\d+) tris/.exec(check.out)?.[1] ?? null;
  return {
    name,
    model: used,
    secs,
    ok: check.code === 0,
    why: check.code === 0 ? `built ${tris} tris` : 'program written but the engine rejected it',
    out: check.out,
    program: readFileSync(file, 'utf8'),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const wanted = opts.harness ? [opts.harness] : Object.keys(HARNESSES);
  for (const name of wanted) {
    if (!HARNESSES[name]) {
      console.error(`unknown harness "${name}" -- have ${Object.keys(HARNESSES).join(', ')}`);
      process.exit(2);
    }
  }

  const results = [];
  for (const name of wanted) {
    const harness = HARNESSES[name];
    if (!installed(harness.bin)) {
      console.log(`${name.padEnd(9)} skipped -- ${harness.bin} is not on PATH`);
      continue;
    }
    process.stdout.write(`${name.padEnd(9)} running...`);
    const r = await smoke(name, harness, opts);
    results.push(r);
    console.log(
      `\r${name.padEnd(9)} ${r.ok ? 'ok  ' : 'FAIL'} ${`${r.secs}s`.padStart(5)}  ${r.model ?? '(configured default)'}  ${r.why}`,
    );
    // On a failure the sandbox is the only copy of the evidence -- the brief the
    // child was given, its log, and whatever it did or did not write. It stays
    // on disk; `makeSandbox` clears it at the start of the next run anyway.
    if (!r.ok) {
      console.log(
        r.out
          .trim()
          .split('\n')
          .slice(-12)
          .map((l) => `           ${l}`)
          .join('\n'),
      );
      console.log(`           sandbox: ${join(tmpdir(), 'kiln-dispatch', `smoke-${name}`)}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (results.length === 0) {
    console.log('\nno harness CLIs installed; nothing was verified');
    process.exit(2);
  }
  console.log(
    `\n${results.length - failed.length}/${results.length} harnesses reached the Kiln tools`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
