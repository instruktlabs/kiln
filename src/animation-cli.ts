import { open, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { createKilnProgramToolRegistry } from './tools/registry';
import type { KilnScreenshotAnimationResult } from './tools/registry';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { programRefPattern } from './program-store';
import { readHostRequirementsFile } from './requirements-file';
import { writeDestinationAtomic } from './cli-output';
import { cliWorkspaceSelection, readMaterialDependencies } from './workspace-cli';

export const ANIMATION_USAGE = `
ANIMATION REVIEW
  kiln animation <program.js|ref> --clip <name> --views <motion.png> [options]
  --phases <0,0.25,0.5,1>  ordered phase fractions, not seconds (1–9 entries)
  --frames <2..6>          evenly spaced phases (default 6; excludes --phases)
  --camera <name>          right (default), front, back, left, top, three-quarter
  --shot <file.json>       one shared camera shot, including subject and camera
  --measure-parts <json>   file containing 1..16 {name} or {path} selectors
  --framing <mode>         locked (default) or follow
  --size <128..1024>       frame size in px (default 256)
  --per-frame             write motion.frame-01.png, motion.frame-02.png, ...
  --render <mode>          auto | cpu | gpu; gpu requires material-faithful frames
  --render-port <url>      select a remote renderer
  --requirements <json>    optional host requirement binding
  --project <id>           explicit workspace project (otherwise KILN_PROJECT or standalone)
  --project-revision <id>  exact historical design/resource context
  --no-project            standalone authoring, overriding KILN_PROJECT
  --materials <json>      exact material dependency pins
  --json                  phases, posed bounds, image paths and fidelity receipts
  --detail <level>        lean | compact | full QA detail in --json (default: compact)

Reviews the actual exported clip through the shared animation tool. Keeps source
unchanged; writes PNGs, not posed source or replacement GLBs. Inspect intermediate
phases and attachments. poseBounds reports world-space scene and selected-subject
geometry before camera isolation; --measure-parts adds each part's bounds and world
origin, so locators are measured too. Samples do not establish continuous collision safety.
`;

async function readReviewJson(path: string, option: string): Promise<unknown> {
  const file = await open(resolve(path), 'r');
  try {
    const limit = 1024 * 1024;
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error(`${option} requires a JSON file no larger than 1 MiB.`);
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error(`${option} JSON exceeds 1 MiB.`);
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await file.close();
  }
}

function parse(argv: readonly string[]) {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const key = arg === '-h' ? '--help' : arg;
    if (flags.has(key)) throw new Error(`Repeated animation option: ${key}.`);
    if (['--help', '--per-frame', '--json', '--no-project'].includes(key)) {
      flags.set(key, true);
      continue;
    }
    if (
      ![
        '--clip',
        '--views',
        '--phases',
        '--frames',
        '--camera',
        '--shot',
        '--measure-parts',
        '--framing',
        '--size',
        '--render',
        '--render-port',
        '--requirements',
        '--project',
        '--project-revision',
        '--materials',
        '--detail',
      ].includes(key)
    )
      throw new Error(`Unknown animation option: ${key}. Use kiln animation --help.`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    flags.set(key, value);
  }
  const value = (key: string) => flags.get(key) as string | undefined;
  if (flags.has('--help')) return { help: true as const };
  if (positional.length !== 1 || !value('--views'))
    throw new Error('animation requires one program path or reference and --views <motion.png>.');
  const phases = value('--phases')
    ?.split(',')
    .map((s) => {
      if (!s.trim())
        throw new Error(
          '--phases requires comma-separated phase fractions, without empty entries.',
        );
      return Number(s);
    });
  if (phases && flags.has('--frames'))
    throw new Error('--phases and --frames are mutually exclusive.');
  const detail = value('--detail') ?? 'compact';
  if (detail !== 'lean' && detail !== 'compact' && detail !== 'full')
    throw new Error(`--detail must be lean, compact or full (got ${detail}).`);
  const selection = cliWorkspaceSelection(
    value('--project'),
    value('--project-revision'),
    flags.has('--no-project'),
  );
  return {
    help: false as const,
    source: positional[0]!,
    views: value('--views')!,
    json: flags.has('--json'),
    detail,
    shot: value('--shot'),
    measureParts: value('--measure-parts'),
    requirements: value('--requirements'),
    materials: value('--materials'),
    render: resolveRenderMode(value('--render')),
    renderPort: value('--render-port'),
    input: {
      ...selection,
      clip: value('--clip'),
      ...(phases ? { frameTimes: phases } : {}),
      ...(flags.has('--frames') ? { frames: Number(value('--frames')) } : {}),
      ...(flags.has('--camera') ? { camera: value('--camera') } : {}),
      ...(flags.has('--framing') ? { framing: value('--framing') } : {}),
      ...(flags.has('--size') ? { size: Number(value('--size')) } : {}),
      ...(flags.has('--per-frame') ? { perFrame: true } : {}),
    },
  };
}

export async function animationMain(argv: readonly string[]): Promise<number> {
  let args: ReturnType<typeof parse>;
  let input: Record<string, unknown>;
  try {
    args = parse(argv);
    if (args.help) {
      console.log(ANIMATION_USAGE);
      return 0;
    }
    input = {
      ...args.input,
      ...(args.materials
        ? { materialDependencies: await readMaterialDependencies(args.materials) }
        : {}),
      ...(args.shot ? { shot: await readReviewJson(args.shot, '--shot') } : {}),
      ...(args.measureParts
        ? { measureParts: await readReviewJson(args.measureParts, '--measure-parts') }
        : {}),
    };
    // Validate the shared schema before initializing an evaluator or renderer.
    createKilnProgramToolRegistry()
      .find((t) => t.name === 'kiln_screenshot_animation')!
      .inputSchema.parse({ code: '', ...input });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  try {
    const requirements = args.requirements
      ? await readHostRequirementsFile(args.requirements)
      : undefined;
    const context = await createPackagedLocalToolContext({
      ...(await buildRenderPort(args.render, args.renderPort)),
      requirements,
    });
    const source = programRefPattern.test(args.source)
      ? { programRef: args.source }
      : { code: await readFile(resolve(args.source), 'utf8') };
    const tool = createKilnProgramToolRegistry(context).find(
      (t) => t.name === 'kiln_screenshot_animation',
    )!;
    let output: KilnScreenshotAnimationResult & {
      programRef?: string;
    };
    try {
      // The receipt reaches a model's context like a tool result: compact by default.
      output = (await tool.run({ ...source, ...input, detail: args.detail })) as typeof output;
    } finally {
      await context.liveReview?.flush?.();
    }
    if (!output.ok) {
      if (args.json) console.log(JSON.stringify(output));
      else {
        console.error(output.error ?? 'Animation review failed.');
        if (output.availableClips)
          console.error(`Available clips: ${output.availableClips.join(', ') || '(none)'}`);
      }
      return 1;
    }
    const grid = tool.media?.(output);
    const separate = tool.mediaMulti?.(output);
    const pngs = separate?.pngs ?? (grid ? [grid.png] : []);
    if (!pngs.length) throw new Error('Animation review returned no images.');
    const suffix = extname(args.views);
    const stem = suffix ? args.views.slice(0, -suffix.length) : args.views;
    const images = pngs.map((_, i) => ({
      path: resolve(separate ? `${stem}.frame-${String(i + 1).padStart(2, '0')}.png` : args.views),
      ...(separate ? { phase: output.frameTimes?.[i] } : {}),
    }));
    const inputPaths = [
      args.source,
      args.shot,
      args.measureParts,
      args.requirements,
      args.materials,
    ]
      .filter((p): p is string => p !== undefined)
      .map((p) => resolve(p));
    const samePath = (a: string, b: string) =>
      process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (images.some((image) => inputPaths.some((path) => samePath(path, image.path))))
      throw new Error('Animation image destinations must differ from the input files.');
    for (let i = 0; i < pngs.length; i++) await writeDestinationAtomic(images[i]!.path, pngs[i]!);
    const receipt = { ...((separate?.json ?? grid!.json) as object), images };
    if (args.json) console.log(JSON.stringify(receipt));
    else {
      if (output.programRef) console.log(`programRef ${output.programRef}`);
      console.log(
        `${output.clip}: ${output.frames} frames, ${output.duration}s; phases ${(output.frameTimes ?? []).join(', ')}`,
      );
      console.log(
        `  ${output.viewFidelity?.delivered ?? 'unspecified fidelity'}; ${output.viewFidelity?.materialFaithful ? 'material-faithful' : 'geometry evidence only'}`,
      );
      for (const image of images) console.log(`  ${image.path}`);
      if (output.loopClosure)
        console.log(
          `  endpoint continuity: ${output.loopClosure.status}; ${output.loopClosure.mismatchCount} mismatched tracks; loop intent ${output.loopClosure.loopIntent} (velocity continuity not assessed)`,
        );
      for (const warning of output.warnings) console.log(`  warning: ${warning}`);
      if (output.unresolvedTracks?.length)
        console.log(`  unresolved tracks: ${output.unresolvedTracks.join(', ')}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
