#!/usr/bin/env node
// Dispatch a headless CLI agent to author one Kiln asset, then verify the
// result with the engine itself.
//
// This is the "agent spawns an agent" path. The parent process here is dumb on
// purpose: it composes a prompt, shells out to whichever coding CLI you have
// installed, and then runs `kiln render` on whatever file came back. The child
// agent does the actual work through the Kiln MCP tools -- it writes the
// program, renders it, looks at its own six-view contact sheet, and revises.
//
//   node scripts/dispatch-asset.mjs --name espresso-machine \
//     "a commercial three-group lever espresso machine"
//
//   node scripts/dispatch-asset.mjs --harness claude --model sonnet \
//     --name anglerfish "a deep-sea anglerfish with a lit lure"
//
// The harness must already have Kiln attached. See docs/install.md; the whole
// point of this script is that once the MCP server and the skills are wired up,
// dispatching is the same three lines for every harness.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The harness table, the Windows-safe spawn, the deadline that kills a process
// tree, and the clean-room sandbox all live next door: `harness-smoke.mjs`
// needs every one of them to prove a harness is wired up, and this script needs
// them to send that same harness after an asset.
import { HARNESSES, REPO, makeSandbox, parseDuration, run } from './harness.mjs';

export function parseArgs(argv) {
  const opts = {
    harness: 'agy',
    model: null,
    name: null,
    outDir: join(REPO, '.dogfood'),
    timeout: '25m',
    tris: '4,000-12,000',
    // Antigravity's Gemini quota exhausts account-wide for a window rather than
    // per model, so a fallback ladder alone is not enough for a batch: --wait
    // rides it out instead of failing ten assets in forty seconds.
    waitMinutes: 0,
    // Motion is not a decoration on some subjects, it is the subject: a
    // locomotive without its rods moving is a shed on wheels. --animate adds
    // the rig requirements to the brief and makes the child prove the loop.
    animate: false,
    subject: '',
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--harness') opts.harness = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--name') opts.name = argv[++i];
    else if (a === '--out') opts.outDir = resolve(argv[++i]);
    else if (a === '--timeout') opts.timeout = argv[++i];
    else if (a === '--tris') opts.tris = argv[++i];
    else if (a === '--wait') opts.waitMinutes = Number(argv[++i]);
    else if (a === '--animate') opts.animate = true;
    else if (a === '--category' || a.startsWith('--category=')) {
      throw new Error(
        '--category was removed. Describe the intended asset in the brief; discover optional recipes as needed.',
      );
    } else rest.push(a);
  }
  opts.subject = rest.join(' ').trim();
  return opts;
}

/**
 * The prompt. Three things in here are load-bearing and are the difference
 * between a usable asset and a pile of boxes:
 *
 *   1. ABSOLUTE paths. Every CLI resolves relative paths against something --
 *      `agy` against the installed plugin copy, not your working tree -- so a
 *      prompt that says `examples/foo.js` writes to a file you will never find.
 *   2. Discovery contracts before unfamiliar calls, so authoring follows the
 *      installed API while leaving the choice of modeling approach open.
 *   3. An explicit instruction to LOOK at the render and revise. A model that
 *      is not told to look will write one pass, declare success, and stop --
 *      and the whole argument for this tool is the loop, not the codegen.
 */
export function composePrompt({ name, subject, file, tris, animate }) {
  const motion = animate
    ? [
        '- THIS ASSET MUST MOVE. Hang every moving part off a pivot: pass',
        '  `pivot: [x, y, z]` to createPart and name the part `Joint_<Thing>`, then',
        '  parent the geometry that turns with it to that joint.',
        '- Export `function animate()` returning',
        "  [createClip(name, duration, [rotationTrack('Joint_X', keys), ...])].",
        '  Keyframes are `{ time, rotation: [x, y, z] }` in DEGREES, or',
        '  `{ time, position: [x, y, z] }` for a track that slides.',
        '- The clip must LOOP: the pose at t = duration must equal the pose at t = 0,',
        '  or the asset visibly jumps every cycle.',
        '- Call kiln_screenshot_animation, LOOK at the frames, and fix the motion you',
        '  actually see. A column of angles cannot tell you whether a linkage binds.',
      ]
    : [];
  return [
    `Author a Kiln 3D asset: ${subject}.`,
    '',
    'You have the Kiln MCP tools (kiln_discover, kiln_render, kiln_inspect,',
    'kiln_validate, kiln_view_interior, kiln_screenshot_animation) and the',
    'kiln-author-asset skill. Use them.',
    '',
    'Rules:',
    `- Write the program to the ABSOLUTE path ${file.replaceAll('\\', '/')}`,
    '- Use kiln_discover for a compact overview and natural-language modeling',
    '  queries. Fetch exact ids for unfamiliar helper contracts; recipes are',
    '  optional guidance and do not restrict the asset or require a category.',
    `- Start the file with: const meta = { name: '${toPascal(name)}' };`,
    '- Coordinates are +X forward, +Y up, +Z right, and the asset sits on Y=0.',
    '- Write a ROUGH version of the file EARLY, before you have the details',
    '  worked out, then improve it. Do NOT solve the geometry analytically',
    '  first: models have spent their entire output budget hand-computing pin',
    '  positions in prose, been cut off mid-calculation, and left no file at all.',
    '- Render with kiln_render, LOOK at the six-view contact sheet it returns,',
    '  and fix what you actually see wrong. Do at least two revision passes.',
    `- Target ${tris} triangles.`,
    ...motion,
    '- Finish by reporting the triangle count and the bounds.',
  ].join('\n');
}

const toPascal = (s) =>
  s
    .split(/[-_\s]+/)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

/**
 * Record the author in the file itself.
 *
 * The `.result.json` manifest beside it already carries this, but manifests do
 * not survive being copied into `examples/`, and the gallery makes a claim
 * about provenance that has to travel with the program it describes.
 */
function stampAuthor(file, model, harness, { cleanRoom = true, interrupted = false } = {}) {
  let body = readFileSync(file, 'utf8');
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1); // strip BOM before prepending
  if (/^\/\/ Authored by:/m.test(body)) return;
  // The clean-room sentence is a factual claim about how the run was set up, so
  // it is only written when the run actually had one. Assets authored before
  // sandboxing existed get the same attribution without it rather than a
  // provenance claim nobody can support.
  const header = [
    `// Authored by: ${model}, via ${harness}.`,
    '//',
    ...(interrupted
      ? [
          '// Written by the model itself through the Kiln MCP tools, and cut off',
          '// mid-run rather than finished -- by a provider limit, or by the',
          '// dispatch deadline. The program below is what was on disk when the',
          '// session ended; how many times it had looked at its own contact sheet',
          '// by then is not recorded, so this one does not make the claim the',
          '// others do.',
        ]
      : [
          '// Written by the model itself through the Kiln MCP tools: it wrote the',
          '// program, rendered it, looked at its own six-view contact sheet, and',
          '// revised. Not a line of it is hand-authored.',
        ]),
    ...(cleanRoom
      ? [
          '//',
          '// Dispatched into a clean directory containing only the brief and the Kiln',
          '// skills, with no access to this repository or to any finished example.',
        ]
      : []),
    '',
  ].join('\n');
  writeFileSync(file, `${header}\n${body}`);
}

// `session limit` is Claude Code's wording and matches none of the others, so a
// batch that hit one used to report three flat failures in a row and give up
// instead of falling back or waiting out the window.
const RATE_LIMITED = /RESOURCE_EXHAUSTED|429|rate.?limit|quota|exhausted|(session|usage) limit/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the harness for one word before committing to a twenty-minute run.
 * Returns 'ok', 'limited', or 'error'. A probe costs a few tokens; discovering
 * a quota wall after the child has been building for ten minutes does not.
 */
async function probeQuota(harness, model, logFile) {
  if (!harness.probe) return 'ok';
  const r = await run(harness.bin, harness.probe(model), { logFile, timeoutMs: 120_000 });
  if (r.code === 0 && r.out.toUpperCase().includes('OK')) return 'ok';
  return RATE_LIMITED.test(r.out) ? 'limited' : 'error';
}

/**
 * Who actually wrote this, as opposed to who was asked to.
 *
 * A harness may quietly run a different model than the one requested -- OpenCode
 * substitutes when a model is busy, with no error and no note. Everywhere else
 * that would be a curiosity; here it is the difference between a gallery that
 * documents its provenance and one that misattributes it, so the requested id is
 * treated as a request and the harness's own report as the fact.
 *
 * Harnesses print the bare model name where the request carried a provider
 * prefix (`omen-alpha` for `opencode-go/omen-alpha`), so the comparison is on the
 * last segment and the prefix is carried back onto a substitute.
 */
function reconcileModel(requested, actual, name) {
  if (!actual) return requested;
  const bare = String(requested).split('/').pop();
  if (actual === bare) return requested;
  const prefix = String(requested).includes('/')
    ? `${String(requested).slice(0, String(requested).lastIndexOf('/'))}/`
    : '';
  const ran = `${prefix}${actual}`;
  console.log(`[${name}] asked for ${requested} but the harness ran ${ran}; recording ${ran}`);
  return ran;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const harness = HARNESSES[opts.harness];
  if (!harness) {
    console.error(`unknown harness "${opts.harness}" (have: ${Object.keys(HARNESSES).join(', ')})`);
    process.exit(2);
  }
  if (!opts.subject) {
    // Built from the table rather than typed out: the list drifted once
    // already, and omitted the harness that had written six of the gallery.
    const names = Object.keys(HARNESSES).join('|');
    console.error(
      `usage: dispatch-asset.mjs [--harness ${names}] [--model M] --name <slug> "<subject>"`,
    );
    process.exit(2);
  }
  opts.name ??= opts.subject
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .slice(0, 40);

  const models = [
    opts.model ?? harness.defaultModel,
    ...(opts.model ? [] : harness.fallbackModels),
  ];
  // Checked before anything is created on disk. A harness with no default model
  // (Codex, whose entitlements this repository cannot know) must be told one:
  // this path stamps the author into the program and writes it into the
  // gallery's provenance note, and an asset whose author cannot be named is one
  // that already shipped once reading "Authored by: null".
  if (models[0] == null) {
    console.error(
      `--model is required for the ${opts.harness} harness: it has no default, and the author has to be recorded`,
    );
    process.exit(2);
  }

  mkdirSync(opts.outDir, { recursive: true });
  // The child works in a clean room and writes there; the result is copied out
  // afterwards. Nothing the agent produces lands in the repository directly.
  const sandbox = await makeSandbox(opts.name, { harness: opts.harness });
  const sandboxFile = join(sandbox, `${opts.name}.kiln.js`);
  const file = join(opts.outDir, `${opts.name}.kiln.js`);
  const briefPath = join(sandbox, `${opts.name}.prompt.txt`);
  writeFileSync(briefPath, composePrompt({ ...opts, file: sandboxFile }));
  // The brief goes in a file and the command line carries a pointer to it.
  // Every CLI here quotes its arguments differently and two of them mangle a
  // multi-line one; a one-line prompt is the only shape that survives all of
  // them, and it leaves the exact brief on disk next to the result.
  const prompt = `Read ${briefPath.replaceAll('\\', '/')} and carry out the instructions in it exactly.`;

  const logFile = harness.needsLogFile ? join(opts.outDir, `${opts.name}.harness.log`) : null;
  const deadline = Date.now() + opts.waitMinutes * 60_000;
  let result = null;
  let authoredBy = null;
  let interrupted = false;

  outer: for (;;) {
    for (const model of models) {
      if ((await probeQuota(harness, model, logFile)) === 'limited') {
        console.log(`[${opts.name}] ${model}: rate limited`);
        continue;
      }
      process.stdout.write(`[${opts.name}] ${opts.harness} / ${model} ... `);
      const started = Date.now();
      result = await run(
        harness.runBin ?? harness.bin,
        harness.argv({ model, prompt, timeout: opts.timeout, logFile, sandbox }),
        {
          logFile,
          cwd: sandbox,
          timeoutMs: parseDuration(opts.timeout),
          env: harness.env?.({ model }) ?? null,
        },
      );
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (result.code === 0 && existsSync(sandboxFile)) {
        console.log(`wrote ${opts.name}.kiln.js in ${secs}s`);
        authoredBy = reconcileModel(model, harness.actualModel?.(result.out), opts.name);
        break outer;
      }
      // A bad ending with a program already on disk is not the same event as a
      // bad ending with nothing. The run is over either way, but the work
      // survives and the model that did it is known -- so this is checked before
      // the failure is classified, and it covers every way a run can be cut
      // short rather than only the one that was noticed first. Both of the ways
      // seen so far fire long after the program is written: a provider session
      // limit, and the dispatcher's own 25 minute deadline. Discarding the
      // attribution in either case is how a finished asset ends up stamped
      // `Authored by: null`, which is worse than an interrupted claim because it
      // is not a claim at all.
      if (existsSync(sandboxFile)) {
        console.log(`cut off after ${secs}s (exit ${result.code}), keeping its program`);
        authoredBy = reconcileModel(model, harness.actualModel?.(result.out), opts.name);
        interrupted = true;
        break outer;
      }
      if (RATE_LIMITED.test(result.out)) {
        console.log(`rate limited after ${secs}s, falling back`);
        continue;
      }
      // Exit 0 with nothing on disk is its own diagnosis and deserves its own
      // sentence: the CLI ran, the model answered, and it simply never wrote the
      // file. Reporting that as "failed (exit 0)" reads like a contradiction and
      // sends you looking at the harness, which is the one thing that did work.
      if (result.code === 0) {
        console.log(`ran ${secs}s and answered without writing a program`);
      } else {
        console.log(`failed (exit ${result.code}) after ${secs}s`);
      }
      break outer;
    }
    if (Date.now() >= deadline) break;
    console.log(
      `[${opts.name}] all models rate limited; waiting 10 min (giving up at ${new Date(deadline).toLocaleTimeString()})`,
    );
    await sleep(10 * 60_000);
  }
  writeFileSync(join(opts.outDir, `${opts.name}.log`), result?.out ?? '');

  if (!existsSync(sandboxFile)) {
    console.error(`[${opts.name}] no program produced; see ${opts.name}.log`);
    process.exit(1);
  }
  // Out of the clean room, stamped with who wrote it.
  copyFileSync(sandboxFile, file);
  stampAuthor(file, authoredBy, opts.harness, { interrupted });

  // Verify with the engine, not with the agent's own claim about it. This is
  // the only part of the pipeline that is allowed to say the asset is fine.
  const glb = join(opts.outDir, `${opts.name}.glb`);
  const sheet = join(opts.outDir, `${opts.name}.png`);
  const check = await run('bun', ['src/cli.ts', 'render', file, '--out', glb, '--views', sheet]);
  console.log(check.out.trim());
  // A manifest per asset. With a fallback ladder in play, "which model made
  // this" is not something you can reconstruct later from the file itself.
  writeFileSync(
    join(opts.outDir, `${opts.name}.result.json`),
    `${JSON.stringify(
      {
        name: opts.name,
        subject: opts.subject,
        harness: opts.harness,
        model: authoredBy,
        // Recorded rather than assumed: the gallery's provenance note is written
        // from this field, and assets predating the sandbox must not inherit a
        // claim about isolation they never had.
        cleanRoom: true,
        // Set when a provider limit ended the session with a program already
        // written. `promote-asset.mjs` reads it, because an asset whose authoring
        // loop was cut short must not carry a header claiming the loop ran.
        interrupted,
        at: new Date().toISOString(),
        tris: /(\d+) tris/.exec(check.out)?.[1] ?? null,
        bounds: /bounds\s+(.+)/.exec(check.out)?.[1]?.trim() ?? null,
        rendered: check.code === 0,
      },
      null,
      2,
    )}
`,
  );
  process.exit(check.code === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
