import { discoveryInputSchema } from './discovery';
import type { DiscoveryResponse } from './discovery';
import { discoverySelectorMigration } from './discovery/query-schema';
import { createKilnDiscoveryDef } from './tools/discovery';
import { createPackagedLocalToolContext } from './local-runtime';
import { createRenderCapabilitiesReader } from './render-capabilities';
import { resolveRenderMode } from './cli-render-mode';

export const DISCOVERY_USAGE = `
DISCOVERY
  kiln discover                         compact overview and starting signatures
  kiln discover --query "curved tube"    ranked operation/assembly/recipe summaries
  kiln discover --id sweepProfile       complete exact contract (repeat --id, max 6)
  kiln discover --capabilities          current host capabilities
  --family <name> --kind <operation|assembly|recipe> --tag <name>  search/browse filters
  --offset <n> --limit <1..12>           search/browse pagination, default limit 6
  --json                               structured output; exact errors also use JSON

Search works offline without a model or GPU. Use ordinary modeling language, then
fetch exact contracts before calling unfamiliar helpers. Recipes are optional guidance.
`;

function parse(argv: readonly string[]) {
  const input: Record<string, unknown> = {};
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    const migration = flag.startsWith('--')
      ? discoverySelectorMigration([flag.slice(2).split('=')[0]!])
      : undefined;
    if (migration) throw new Error(migration);
    if (flag === '--json') {
      json = true;
      continue;
    }
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    const key = flag.slice(2);
    if (
      !flag.startsWith('--') ||
      ![
        'query',
        'id',
        'family',
        'kind',
        'tag',
        'offset',
        'limit',
        'overview',
        'capabilities',
      ].includes(key)
    )
      throw new Error(`Unknown discovery option: ${flag}. Use kiln discover --help.`);
    if (key !== 'id' && key !== 'tag' && key in input)
      throw new Error(`Repeated discovery selector: ${flag}.`);
    if (key === 'overview' || key === 'capabilities') {
      input[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    if (key === 'id' || key === 'tag') {
      const arrayKey = key === 'id' ? 'ids' : 'tags';
      input[arrayKey] ??= [];
      (input[arrayKey] as string[]).push(value);
    } else input[key] = key === 'offset' || key === 'limit' ? Number(value) : value;
  }
  return { input: discoveryInputSchema.parse(input), json, help };
}

export async function discoveryMain(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (parsed.help) {
    console.log(DISCOVERY_USAGE);
    return 0;
  }
  try {
    // Ordinary catalog reads do not initialize a host, store, renderer or evaluator.
    // Capabilities describe the host the MCP server builds: the same collections and
    // program store, read without creating either.
    const context = parsed.input.capabilities
      ? {
          ...(await createPackagedLocalToolContext({
            renderCapabilities: createRenderCapabilitiesReader(resolveRenderMode()),
            assetLibrary: (await import('./assets-node')).localAssetLibrary(),
          })),
          programStore: (await import('./program-store-node')).localProgramStore(),
        }
      : {};
    const result = (await createKilnDiscoveryDef(context).run(parsed.input)) as DiscoveryResponse;
    console.log(parsed.json ? JSON.stringify(result) : result.text);
    return result.error ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
