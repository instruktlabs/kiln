#!/usr/bin/env node
/**
 * Human and script entry point: render programs, import/export source revisions,
 * or run the optional model-driven generation loop. Rendering a GLB and its views
 * shares one evaluation through the program-aware registry.
 */
import { open, readFile, writeFile } from 'node:fs/promises';
import { resolve as resolvePath, extname } from 'node:path';

import { prepareDestination, writeDestinationAtomic } from './cli-output';
import { isDirectEntry } from './direct-entry';
import { createPackagedLocalToolContext } from './local-runtime';
import { createKilnProgramToolRegistry, type KilnToolContext } from './tools/registry';
import { BACKDROP_IDS, isBackdropId, type BackdropId } from './views/background';
import { resolveRenderMode, buildRenderPort, describeDrawnBy } from './cli-render-mode';
import type { RenderMode } from './cli-render-mode';
import { localProgramStore } from './program-store-node';
import { retainProgram, programRefPattern } from './program-store';
import { observeWorkspaceOperation } from './tools/workspace';
import { cliWorkspaceSelection, readMaterialDependencies } from './workspace-cli';
import type { WorkspaceSelection } from './workspace';
import { ASSET_USAGE } from './asset-cli';
import { PROJECT_USAGE } from './project-cli';
import { REVIEW_USAGE } from './review-cli';
import { SERVICE_USAGE } from './service-cli';
import { DISCOVERY_USAGE } from './discovery-cli';
import { ANIMATION_USAGE } from './animation-cli';
import { EDIT_USAGE } from './edit-cli';
import { INSPECT_USAGE } from './inspect-cli';
import { CATEGORY_MIGRATION_MESSAGE, readHostRequirementsFile } from './requirements-file';
import type { RequirementsBinding } from './requirements-store';
import type { RenderResult } from './render';
import { createGenerationCallBudget } from './agent/call-budget';
import { assertNodeRuntime } from './runtime-support.mjs';

const USAGE = `kiln — vision-in-the-loop 3D asset generation

USAGE
  kiln render <program.js|ref> [options]     execute a Kiln program (offline, no key)
  kiln generate "<prompt>"  [options]    author a program with a model, then render
  kiln source <file.js>                 save a source snapshot and print its programRef
  kiln source <programRef> --out file.js export a revision without model transcription
  kiln edit <programRef> --edits <json>  anchored source edits; returns a new revision
  kiln discover [options]               ranked helpers, recipes and host capabilities
  kiln migrate intent|manifest <file>   explicit legacy conversion review (see --help)
  kiln animation <program.js|ref> [options]  review sampled motion of an exported clip
  kiln inspect <program.js|ref> [options]    close-up views and surface/anchor measurements
  kiln service status|stop|reprobe        the shared GPU render service (see below)

OPTIONS
  --out <path>            GLB output path            (default: out.glb)
  --views <path>          contact sheet PNG path     (default: none)
  --capture <file.json>  camera recipe for --views  (grid output; max 1 MiB)
  --backdrop <id>         neutral | dark | light     (default: neutral)
  --render <mode>         auto | cpu | gpu           (default: auto)
  --render-port <url>     remote GPU render service
  --model <id>            model id for generate      (default: env KILN_MODEL)
  --max-steps <n>         agent step cap, 0 = off    (default: 0)
  --requirements <json>  explicit host binding (optional; default neutral)
  --project <id>         project configuration and pinned material dependencies
  --project-revision <r> exact project revision (default: current)
  --no-project          standalone authoring, overriding KILN_PROJECT
  --materials <json>    exact material dependency pins, with or without a project
  --json                 render: one JSON receipt, no embedded image or GLB bytes
  -h, --help              this message

EXAMPLES
  kiln render examples/crate.kiln.js --out crate.glb --views sheet.png
  kiln generate "a weathered wooden crate" --out crate.glb --views sheet.png
  kiln render examples/crate.kiln.js --render cpu --views sheet.png
  kiln render p_RETURNED_HANDLE --capture cameras.json --views chosen.png
  kiln render examples/crate.kiln.js --views sheet.png --backdrop light
`;

interface Args extends WorkspaceSelection {
  command: string | undefined;
  positional: string[];
  out: string | undefined;
  views: string | undefined;
  capture: string | undefined;
  captureRecipe?: unknown;
  backdrop: BackdropId | undefined;
  render: RenderMode;
  renderPort: string | undefined;
  model: string | undefined;
  maxSteps: number;
  requirementsFile?: string;
  requirements?: RequirementsBinding;
  noProject?: boolean;
  materialsFile?: string;
  help: boolean;
  json: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  let renderOption: RenderMode | undefined;
  const args: Args = {
    command: undefined,
    positional: [],
    out: undefined,
    views: undefined,
    capture: undefined,
    backdrop: undefined,
    render: 'auto',
    renderPort: undefined,
    model: process.env['KILN_MODEL'],
    maxSteps: 0,
    help: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '--out':
        args.out = next();
        break;
      case '--json':
        args.json = true;
        break;
      case '--views':
        args.views = next();
        break;
      case '--capture':
        args.capture = next();
        break;
      case '--backdrop': {
        const id = next();
        if (!isBackdropId(id))
          throw new Error(`--backdrop must be one of ${BACKDROP_IDS.join(', ')} (got ${id})`);
        args.backdrop = id;
        break;
      }
      case '--render':
        renderOption = resolveRenderMode(next());
        break;
      case '--render-port':
        args.renderPort = next();
        break;
      case '--model':
        args.model = next();
        break;
      case '--category':
        throw new Error(CATEGORY_MIGRATION_MESSAGE);
      case '--requirements':
        args.requirementsFile = next();
        break;
      case '--project':
        args.projectId = next();
        break;
      case '--project-revision':
        args.projectRevision = next();
        break;
      case '--no-project':
        args.noProject = true;
        break;
      case '--materials':
        args.materialsFile = next();
        break;
      case '--max-steps': {
        const n = Number(next());
        // Zero is the documented "no cap" value, so it has to be accepted here
        // as well as being the default -- rejecting it would leave a user who
        // read the help text unable to type what it told them.
        if (!Number.isInteger(n) || n < 0)
          throw new Error('--max-steps must be a non-negative integer (0 = no cap)');
        args.maxSteps = n;
        break;
      }
      default:
        if (a.startsWith('--category=')) throw new Error(CATEGORY_MIGRATION_MESSAGE);
        if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
        if (args.command === undefined) args.command = a;
        else args.positional.push(a);
    }
  }
  args.render = resolveRenderMode(renderOption);
  Object.assign(args, cliWorkspaceSelection(args.projectId, args.projectRevision, args.noProject));
  return args;
}

/** Read a bounded recipe and validate the same capture schema used by MCP. */
async function readCaptureRecipe(args: Args): Promise<unknown> {
  if (!args.views) throw new Error('--capture requires --views <output.png>.');
  if (args.command !== 'render' && args.command !== 'generate')
    throw new Error('--capture is supported by render and generate only.');
  const limit = 1024 * 1024;
  const file = await open(resolvePath(args.capture!), 'r');
  let capture: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('--capture requires a JSON file no larger than 1 MiB.');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('--capture JSON exceeds 1 MiB.');
    try {
      capture = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    } catch {
      throw new Error('--capture requires valid JSON.');
    }
  } finally {
    await file.close();
  }
  const def = createKilnProgramToolRegistry().find((d) => d.name === 'kiln_render');
  if (!def) throw new Error('kiln_render is missing from the MCP tool surface');
  // Schema validation needs a selector but does not resolve or write this placeholder.
  def.inputSchema.parse({ programRef: `sha256:${'0'.repeat(64)}`, capture });
  if ((capture as { output?: unknown } | null)?.output === 'separate')
    throw new Error('--capture supports grid output only for one --views PNG. Set output to grid.');
  return capture;
}

/**
 * `--backdrop` is the one capture field worth a flag of its own: it is the
 * question "same sheet, other backdrop", which should not require writing a
 * recipe file. It rides in the same `capture` object every surface takes, so
 * the CLI, MCP and API resolve it through one path, and it overrides a recipe's
 * own `backdrop` so a shared recipe can be re-run on another backdrop unedited.
 */
function applyBackdrop(args: Args): unknown {
  if (args.backdrop === undefined) return args.captureRecipe;
  if (!args.views) throw new Error('--backdrop requires --views <output.png>.');
  if (args.command !== 'render' && args.command !== 'generate')
    throw new Error('--backdrop is supported by render and generate only.');
  const recipe = (args.captureRecipe ?? {}) as Record<string, unknown>;
  return { ...recipe, backdrop: args.backdrop };
}

/**
 * Render one program to GLB bytes plus, optionally, the contact sheet.
 * Shared by both commands so `generate` and `render` cannot diverge in output.
 */
interface RenderCliReceipt extends Record<string, unknown> {
  programRef?: string;
  files: { kind: 'glb' | 'image'; path: string; bytes: number }[];
}

function jsonRenderFailure(error: unknown, receipt: RenderCliReceipt = { files: [] }): void {
  console.log(
    JSON.stringify({
      ...receipt,
      ok: false,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2048),
    }),
  );
}

async function emit(
  code: string,
  args: Args,
  context: KilnToolContext,
  reviewed?: RenderResult,
  receipt: RenderCliReceipt = { files: [] },
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  const log = (message: string) => {
    if (!args.json) console.log(message);
  };
  context.programStore ??= localProgramStore();
  const programRef = await retainProgram(context.programStore, code);
  receipt.programRef = programRef;
  log(`  programRef ${programRef}`);
  const result =
    reviewed ??
    (await context.evaluatorPort!.render(code, {
      optimize: 'off',
      requirements: context.requirements,
    }));
  try {
    context.liveReview?.artifact(code, result);
  } catch {
    /* Optional observation. */
  }
  const project = context.workspace?.current()?.project;
  Object.assign(receipt, {
    ...(project ? { projectId: project.projectId, projectRevision: project.revisionId } : {}),
    requirements: result.requirements,
    ...(result.buildCache ? { buildCache: result.buildCache } : {}),
    tris: result.tris,
    bounds: result.integrationManifest.bounds,
    artifactGlbSha256: result.artifactGlbSha256,
    glbBytes: result.glb.length,
    warnings: result.warnings,
    qaReport: result.meta.qaReport,
  });
  log(
    `  requirements ${result.requirements.policyHash}${result.requirements.binding ? ` (${result.requirements.binding.taskId}/${result.requirements.binding.lineageId}, revision ${result.requirements.binding.revision})` : ' (neutral)'}`,
  );
  const qa = result.meta.qaReport;
  if (qa && typeof qa === 'object' && 'acceptance' in qa) log(`  QA ${qa.acceptance}`);
  if (result.buildCache)
    log(`  build ${result.buildCache.hit ? 'reused' : 'created'} ${result.buildCache.key}`);
  // Only write a GLB when one was asked for, or when it is the sole output —
  // `--views sheet.png` alone should not litter the working directory.
  const out = args.out ?? (args.views ? undefined : 'out.glb');
  if (out) {
    await writeDestinationAtomic(resolvePath(out), result.glb);
    receipt.files.push({ kind: 'glb', path: resolvePath(out), bytes: result.glb.length });
    log(`  ${out}  ${result.tris} tris  ${(result.glb.length / 1024).toFixed(1)} KB`);
  } else {
    log(`  ${result.tris} tris  ${(result.glb.length / 1024).toFixed(1)} KB`);
  }
  const bounds = result.integrationManifest.bounds;
  if (bounds) {
    const size = bounds.size ?? bounds.max;
    if (Array.isArray(size)) {
      log(`  bounds  ${size.map((n) => Number(n).toFixed(2)).join(' x ')} m`);
    }
  }
  for (const w of result.warnings) log(`  warning: ${w}`);

  if (args.views) {
    // The SAME def the MCP surface serves, so the CLI cannot render views through
    // a path the agent never takes, and `--render-port` fires exactly as it does
    // for a host agent.
    // This call already built the exact source above. Review the same artifact.
    const def = createKilnProgramToolRegistry({
      ...context,
      evaluatorPort: { render: async () => result },
    }).find((d) => d.name === 'kiln_render');
    if (!def) throw new Error('kiln_render is missing from the MCP tool surface');
    const output = await def.run({
      programRef,
      ...(args.captureRecipe === undefined ? {} : { capture: args.captureRecipe }),
    });
    captured = output as Record<string, unknown>;
    const failure = output as { ok?: unknown; error?: unknown } | null;
    if (failure?.ok === false && typeof failure.error === 'string' && failure.error.trim()) {
      throw new Error(failure.error.slice(0, 2048));
    }
    const media = def.media?.(output);
    if (!media) throw new Error('kiln_render returned no image');
    await writeDestinationAtomic(resolvePath(args.views), media.png);
    Object.assign(receipt, media.json);
    receipt.files.push({ kind: 'image', path: resolvePath(args.views), bytes: media.png.length });
    // Report what actually drew the pixels, not what was configured. The engine
    // routes to the port only when the scene needs PBR shading, so a GPU that was
    // available and correctly skipped must not be reported as if it had drawn.
    log(`  ${args.views}  (${describeDrawnBy(output, context)})`);
  }
  if (args.json) console.log(JSON.stringify({ ...receipt, ok: true }));
  return { ...captured, ...receipt, ok: true };
}

async function cmdRender(args: Args): Promise<number> {
  const file = args.positional[0] ?? undefined;
  if (!file) {
    if (args.json) jsonRenderFailure('render requires a program path or reference');
    else {
      console.error('render requires a program path\n');
      console.error(USAGE);
    }
    return 2;
  }
  const receipt: RenderCliReceipt = { files: [] };
  let context: KilnToolContext | undefined;
  try {
    const code =
      file.startsWith('sha256:') || programRefPattern.test(file)
        ? await localProgramStore().get(file)
        : await readFile(resolvePath(file), 'utf8');
    context = await createPackagedLocalToolContext({
      ...(await buildRenderPort(args.render, args.renderPort)),
      requirements: args.requirements,
    });
    if (!args.json) console.log(`rendering ${file}`);
    const callContext = context;
    await observeWorkspaceOperation(
      callContext,
      'kiln_render',
      {
        code,
        projectId: args.projectId,
        projectRevision: args.projectRevision,
        materialDependencies: args.materialDependencies,
      },
      () => emit(code, args, callContext, undefined, receipt),
    );
    return 0;
  } catch (error) {
    if (!args.json) throw error;
    jsonRenderFailure(error, receipt);
    return 1;
  } finally {
    try {
      await context?.liveReview?.flush?.();
    } catch {
      /* Observation cannot fail a build. */
    }
  }
}

async function cmdGenerate(args: Args): Promise<number> {
  assertNodeRuntime('agent');
  const prompt = args.positional.join(' ').trim();
  if (!prompt) {
    console.error('generate requires a prompt\n');
    console.error(USAGE);
    return 2;
  }
  if (!args.model) {
    console.error('no model selected: pass --model <id> or set KILN_MODEL');
    return 2;
  }

  // Imported lazily so `kiln render` never pulls the agent stack (an optional
  // peer) into the process. A missing @strands-agents/sdk must not break the
  // offline path, which is the one the quickstart promises works everywhere.
  // Nonliteral imports keep optional model SDKs outside the offline Node bundle.
  const modules = import.meta.url.endsWith('.ts')
    ? ['./agent/run.ts', './agent/providers.ts']
    : ['./agent-run.mjs', './agent-providers.mjs'];
  let generation: [typeof import('./agent/run'), typeof import('./agent/providers')];
  try {
    generation = await Promise.all([import(modules[0]!), import(modules[1]!)]);
  } catch (error) {
    throw new Error(
      'The optional generation adapter could not load. Use your connected agent with MCP, or install the agent/provider dependencies for kiln generate.',
      { cause: error },
    );
  }
  const [{ runKilnAgent }, { makeKilnModel, resolveKilnAgentModel }] = generation;

  const context = await createPackagedLocalToolContext({
    ...(await buildRenderPort(args.render, args.renderPort)),
    requirements: args.requirements,
  });
  const modelId = args.model;
  const generate = async () => {
    const descriptor = resolveKilnAgentModel(modelId);
    const model = await makeKilnModel(descriptor);

    console.log(`generating "${prompt}"`);
    console.log(`  model ${args.model}  max-steps ${args.maxSteps}  render ${args.render}`);

    const run = await runKilnAgent({
      model,
      prompt,
      ...context,
      generationCallBudget: createGenerationCallBudget(args.maxSteps),
    });

    if (!run.code || !run.artifact) {
      console.error(run.error ?? 'the agent stopped without a reviewed artifact');
      if (run.lastText) console.error(`  last message: ${run.lastText.slice(0, 400)}`);
      return 1;
    }
    console.log(`  ${run.steps} steps, ${run.toolCalls.length} tool calls`);
    // `generate` always writes the GLB: producing an asset is the point of the
    // command, unlike `render`, where `--views` alone is a legitimate request.
    const requestedPath = args.out ?? 'out.glb';
    const partial = run.completion !== 'finished';
    const outPath = partial ? requestedPath.replace(/(?:\.glb)?$/i, '.partial.glb') : requestedPath;
    if (partial) console.error(`partial result: ${run.error ?? 'kiln_finish was not called'}`);
    const views =
      partial && args.views
        ? args.views.slice(0, args.views.length - extname(args.views).length) +
          '.partial' +
          (extname(args.views) || '.png')
        : args.views;
    await emit(run.code, { ...args, out: outPath, views }, context, run.artifact.rendered);

    const source = /\.glb$/i.test(outPath)
      ? outPath.replace(/\.glb$/i, '.kiln.js')
      : `${outPath}.kiln.js`;
    await writeDestinationAtomic(resolvePath(source), run.code);
    console.log(`  ${source}  (the program — edit and re-render it)`);
    return partial ? 2 : 0;
  };
  try {
    return context.workspace
      ? await context.workspace.run(
          {
            projectId: args.projectId,
            projectRevision: args.projectRevision,
            materialDependencies: args.materialDependencies,
          },
          generate,
        )
      : await generate();
  } finally {
    try {
      await context.liveReview?.flush?.();
    } catch {
      /* Optional observation. */
    }
  }
}

async function cmdSource(args: Args): Promise<number> {
  const input = args.positional[0];
  if (!input || args.positional.length !== 1)
    throw new Error('source requires one file path or programRef.');
  const store = localProgramStore();
  if (input.startsWith('sha256:') || programRefPattern.test(input)) {
    const code = await store.get(input);
    if (args.out) {
      await writeFile(await prepareDestination(resolvePath(args.out)), code, {
        encoding: 'utf8',
        flag: 'wx',
      });
      console.log(`Saved ${input} to ${args.out}`);
    } else process.stdout.write(code);
  } else {
    if (args.out)
      throw new Error('Use source <programRef> --out <new-file.js> to export a saved revision.');
    console.log(await retainProgram(store, await readFile(resolvePath(input), 'utf8')));
  }
  return 0;
}

/**
 * Hold the process open until `run()` settles.
 *
 * Every CLI entry awaits `main()` and then sets `process.exitCode`, which assumes
 * the runtime keeps the process alive while that promise is pending. It does not.
 * The loop can go idle while the command is still running: `beforeExit` fires and
 * the process exits 0 having written nothing. Bun reaches that state under load --
 * concurrent `kiln save` runs exit 0 with empty stdout, no stderr and no
 * rejection, which is why it read as a flaky test rather than a broken command. A
 * ref'd timer far in the future costs no wakeups and closes the hole for every
 * runtime and every entry, the generated workspace launcher included, because it
 * wraps `main` itself rather than one call site.
 */
export async function withProcessAlive<T>(run: () => Promise<T>): Promise<T> {
  const held = setInterval(() => undefined, 1 << 30);
  try {
    return await run();
  } finally {
    clearInterval(held);
  }
}

/** Managed renderer processes have their own idle lifetime and detached handles. */
export function main(argv: readonly string[]): Promise<number> {
  return withProcessAlive(() => runMain(argv));
}

async function runMain(argv: readonly string[]): Promise<number> {
  try {
    assertNodeRuntime();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (argv[0] === 'edit') return (await import('./edit-cli')).editMain(argv.slice(1));
  if (argv[0] === 'migrate') return (await import('./migration-cli')).migrationMain(argv.slice(1));
  if (argv[0] === 'animation')
    return (await import('./animation-cli')).animationMain(argv.slice(1));
  if (argv[0] === 'inspect') return (await import('./inspect-cli')).inspectMain(argv.slice(1));
  if (argv[0] === 'discover') return (await import('./discovery-cli')).discoveryMain(argv.slice(1));
  if (argv[0] === 'service') return (await import('./service-cli')).serviceMain(argv.slice(1));
  if (argv[0] === 'review') {
    try {
      return await (await import('./review-cli')).reviewMain(argv.slice(1));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  if (argv[0] === 'project' || argv[0] === 'material') {
    try {
      return await (await import('./project-cli')).projectMain(argv);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  if (
    ['save', 'collections', 'assets', 'asset', 'export', 'import', 'view'].includes(argv[0] ?? '')
  ) {
    try {
      return await (await import('./asset-cli')).assetMain(argv);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (argv[0] === 'render' && argv.includes('--json')) jsonRenderFailure(err);
    else console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  if (args.help || !args.command) {
    console.log(
      USAGE +
        DISCOVERY_USAGE +
        EDIT_USAGE +
        ANIMATION_USAGE +
        INSPECT_USAGE +
        ASSET_USAGE +
        PROJECT_USAGE +
        REVIEW_USAGE +
        SERVICE_USAGE,
    );
    return args.help ? 0 : 2;
  }
  try {
    if (
      (args.projectId !== undefined ||
        args.projectRevision !== undefined ||
        args.noProject ||
        args.materialsFile !== undefined) &&
      args.command !== 'render' &&
      args.command !== 'generate'
    )
      throw new Error(
        '--project, --project-revision, --no-project and --materials are supported by render and generate only.',
      );
    if (args.json && args.command !== 'render')
      throw new Error(
        "--json is supported by render here; use each other command's documented output options.",
      );
    if (args.requirementsFile !== undefined) {
      if (args.command !== 'render' && args.command !== 'generate')
        throw new Error('--requirements is supported by render and generate only.');
      args.requirements = await readHostRequirementsFile(args.requirementsFile);
    }
    if (args.capture !== undefined) args.captureRecipe = await readCaptureRecipe(args);
    if (args.materialsFile !== undefined) {
      if (args.command !== 'render' && args.command !== 'generate')
        throw new Error('--materials is supported by render and generate only.');
      args.materialDependencies = await readMaterialDependencies(args.materialsFile);
    }
    args.captureRecipe = applyBackdrop(args);
    switch (args.command) {
      case 'source':
        return await cmdSource(args);
      case 'render':
        return await cmdRender(args);
      case 'generate':
        return await cmdGenerate(args);
      default:
        console.error(`unknown command: ${args.command}\n`);
        console.error(USAGE);
        return 2;
    }
  } catch (err) {
    if (args.json && args.command === 'render') {
      jsonRenderFailure(err);
      return 1;
    }
    // Expected operator errors — an unreachable GPU, an unreadable program — are
    // messages, not stack traces. KILN_DEBUG=1 restores the trace for real bugs.
    if (process.env['KILN_DEBUG'] && err instanceof Error && err.stack) {
      console.error(err.stack);
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    return 1;
  }
}

if (isDirectEntry(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exitCode = 1;
    });
}
