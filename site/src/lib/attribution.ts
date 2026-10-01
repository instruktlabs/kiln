/**
 * One display form per model and per harness, whatever form the record holds (a model id from a receipt, a product
 * name from the archive, a command id from an invocation). Records keep their raw values; pages print these.
 */
const MODEL_NAMES: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'gpt-6-astra': 'GPT-6 Astra',
  'gemini-3.8-flash-high': 'Gemini 3.8 Flash High',
};

const HARNESS_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  'claude code': 'Claude Code',
  codex: 'Codex',
  agy: 'Antigravity CLI (agy)',
  antigravity: 'Antigravity CLI (agy)',
  'antigravity cli': 'Antigravity CLI (agy)',
  opencode: 'OpenCode',
};

/** A model as the site names it: a known id or name in its display form, anything else as recorded. */
export const modelName = (value: string): string => MODEL_NAMES[value] ?? value;

/** Display-only prose formatting; saved briefs and downloaded sources retain their exact bytes. */
export const revisionBriefForDisplay = (value: string): string =>
  value.replace(/\b(candidate)(\d+)\b/g, '$1 $2');

/** A harness as the site names it: "Claude Code", "Codex", "Antigravity CLI (agy)", "OpenCode". */
export const harnessName = (value: string): string =>
  HARNESS_NAMES[value.trim().toLowerCase()] ?? value;

/** "Claude Code 2.1.280", or the name alone when no version is recorded. */
export const harnessWithVersion = (value: string, version?: string | null): string =>
  version ? `${harnessName(value)} ${version}` : harnessName(value);

type AssetAttribution = {
  author: string;
  attribution?: { author: string; requestedEffort: string | null; note?: string };
};

/** Keep an asset's provenance qualification attached to that exact set of assets. */
export function groupAssetAttribution<T extends AssetAttribution>(assets: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const asset of assets) {
    const key = JSON.stringify([
      asset.author,
      asset.attribution?.author,
      asset.attribution?.requestedEffort,
      asset.attribution?.note ?? null,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return [...groups.values()];
}

/** How a recorded run ended, in words: a harness stop code never reaches the page. */
export const runOutcome = (status: string, stop?: string | null): string => {
  if (stop === 'error_max_budget_usd') return 'stopped at its spending limit';
  if (status === 'completed') return 'completed';
  return stop ? `${status} (${stop.replaceAll('_', ' ')})` : status;
};
