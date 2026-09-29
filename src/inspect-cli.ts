import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createKilnProgramToolRegistry,
  inspectBufferInput,
  type KilnInspectResult,
} from './tools/registry';
import { createPackagedLocalToolContext } from './local-runtime';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { programRefPattern } from './program-store';
import { readHostRequirementsFile } from './requirements-file';
import { writeDestinationAtomic } from './cli-output';

export const INSPECT_USAGE = `
PART INSPECTION
  kiln inspect <program.js|ref> [--request controls.json] [--views close.png] [--json]
  --request <json>        shared kiln_inspect controls: shot or part/view/orbit;
                         listParts, measure, surfacePairs, compare.programRef/paths, image
  --views <png>           save the close-up image (optional)
  --render <mode>         auto | cpu | gpu
  --render-port <url>     optional remote renderer
  --requirements <json>   optional host requirement binding
  --json                 structured receipt without embedded image bytes

measure.mode=surface compares exported rest-pose triangle surfaces; omit points.
Check measurement.status and bounds. Zero can mean intersection; positive distance
does not exclude containment. This is not a solid-clearance or attachment certificate.
Omit mode for straight-line anchor distance between origins or subject-local points.
compare reports exported static geometry/material/transform/bounds changes against
an earlier programRef using current host settings. Follow comparison.nextOffset.
compare.paths adds complete subtree summaries independent of that page.
surfacePairs takes up to 12 [fromPath,toPath] pairs; check every result/status.
listParts lists all exported-scene paths: optional query filters names/paths,
offset/limit paginate (default 80, max 100). Follow partListing.nextOffset on the
same programRef and query. Render's parts field is only a bounded preview.
image:false skips rendering for listings and numeric checks. Omit camera controls and --views.
`;

async function readControls(path: string) {
  const file = await open(resolve(path), 'r');
  try {
    const limit = 1024 * 1024;
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('--request requires a JSON file no larger than 1 MiB.');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('--request exceeds 1 MiB.');
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead)),
    );
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
    if (flags.has(key)) throw new Error(`Repeated inspection option: ${key}.`);
    if (key === '--help' || key === '--json') {
      flags.set(key, true);
      continue;
    }
    if (!['--request', '--views', '--render', '--render-port', '--requirements'].includes(key))
      throw new Error(`Unknown inspection option: ${key}. Use kiln inspect --help.`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    flags.set(key, value);
  }
  if (flags.has('--help')) return { help: true as const };
  if (positional.length !== 1) throw new Error('inspect requires one program path or reference.');
  const value = (key: string) => flags.get(key) as string | undefined;
  return {
    help: false as const,
    source: positional[0]!,
    request: value('--request'),
    views: value('--views'),
    json: flags.has('--json'),
    render: resolveRenderMode(value('--render')),
    renderPort: value('--render-port'),
    requirements: value('--requirements'),
  };
}

export async function inspectMain(argv: readonly string[]): Promise<number> {
  let args: ReturnType<typeof parse>;
  let controls: ReturnType<typeof inspectBufferInput.parse>;
  try {
    args = parse(argv);
    if (args.help) {
      console.log(INSPECT_USAGE);
      return 0;
    }
    controls = inspectBufferInput
      .strict()
      .parse(args.request ? await readControls(args.request) : {});
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  try {
    if (controls.image === false && args.views)
      throw new Error('--views cannot be combined with image:false.');
    if (args.views) {
      const normalize = (path: string) =>
        process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
      if (
        [args.source, args.request, args.requirements].some(
          (path) => path && normalize(path) === normalize(args.views!),
        )
      )
        throw new Error('Inspection image destination must differ from the input files.');
    }
    const requirements = args.requirements
      ? await readHostRequirementsFile(args.requirements)
      : undefined;
    const context = await createPackagedLocalToolContext({
      ...(controls.image === false ? {} : await buildRenderPort(args.render, args.renderPort)),
      requirements,
    });
    const source = programRefPattern.test(args.source)
      ? { programRef: args.source }
      : { code: await readFile(resolve(args.source), 'utf8') };
    const tool = createKilnProgramToolRegistry(context).find((t) => t.name === 'kiln_inspect')!;
    const output = (await tool.run({ ...source, ...controls })) as KilnInspectResult & {
      programRef?: string;
    };
    if (!output.ok) {
      if (args.json) console.log(JSON.stringify(output));
      else console.error(output.error ?? 'Inspection failed.');
      return 1;
    }
    const media = tool.media?.(output);
    if (!media && controls.image !== false) throw new Error('Inspection returned no image.');
    const images = args.views ? [{ path: resolve(args.views) }] : [];
    if (args.views) await writeDestinationAtomic(args.views, media!.png);
    if (args.json) console.log(JSON.stringify({ ...((media?.json ?? output) as object), images }));
    else {
      if (output.programRef) console.log(`programRef ${output.programRef}`);
      console.log(output.framed ?? 'Inspection complete.');
      if (output.partListing) console.log(JSON.stringify(output.partListing));
      if (output.measurement) console.log(JSON.stringify(output.measurement));
      if (output.surfaceMeasurements) console.log(JSON.stringify(output.surfaceMeasurements));
      if (output.comparison) console.log(JSON.stringify(output.comparison));
      for (const image of images) console.log(image.path);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    return 1;
  }
}
