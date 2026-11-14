/**
 * Seed Town keeps its town in the page address (`?seed=amberbridge&hour=dusk`), so a town can be
 * linked and reloaded. Pure: no DOM, no scene code. The scene cleans a seed again on its own side.
 */
export const MAX_SEED_LENGTH = 40;

export interface TownAddress {
  /** Undefined when the address names no usable seed: the scene then stands its default town. */
  seed: string | undefined;
  dusk: boolean;
}

/** Trimmed, control characters and runs of whitespace folded to one space, at most MAX_SEED_LENGTH units, never half a surrogate pair. */
function cleanSeed(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let seed = raw
    .slice(0, 1024)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEED_LENGTH);
  if (/[\ud800-\udbff]$/.test(seed)) seed = seed.slice(0, -1);
  seed = seed.trim();
  return seed || undefined;
}

const params = (search: unknown) => new URLSearchParams(typeof search === 'string' ? search : '');

export function readTownAddress(search: string): TownAddress {
  const query = params(search);
  return {
    seed: cleanSeed(query.get('seed')),
    dusk: query.get('hour')?.trim().toLowerCase() === 'dusk',
  };
}

/** The search part (with `?`, or empty) for a town, keeping the address's other parameters. */
export function townSearch(search: string, town: { seed: string; dusk: boolean }): string {
  const query = params(search);
  const seed = cleanSeed(town.seed);
  if (seed) query.set('seed', seed);
  else query.delete('seed');
  if (town.dusk) query.set('hour', 'dusk');
  else query.delete('hour');
  const text = query.toString();
  return text ? `?${text}` : '';
}
