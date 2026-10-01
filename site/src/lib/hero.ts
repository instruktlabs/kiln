import heroData from '../data/hero.json';
import { farm, bridge, number } from './catalog';
import { harnessWithVersion, modelName } from './attribution';
import { metres } from './hero-drawing.mjs';

/**
 * The home hero is one data file, `src/data/hero.json`, written by `scripts/build-hero.mjs` from sealed records.
 * The drawing is computed from it (`hero-drawing.mjs`) and the title block's facts come from the catalog entry it
 * names, so replacing the file replaces the whole figure.
 */
export type HeroData = typeof heroData;
export const hero = heroData;
/** The drawing's rendered width: the sheet width less the container gutters on phones, 40rem until the two-column
 * hero at 1280, then 5 of 12 columns (440 px at 1280, 507 px from 1440). Shared by the image and its preload. */
export const HERO_IMAGE_SIZES =
  '(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) 40rem, 32rem';

interface HistoryEntry {
  revisionId: string;
  model: string;
  modelId?: string;
  requestedEffort?: string | null;
  confirmedEffort?: string | null;
  harness?: string;
  harnessVersion?: string | null;
}

/** The catalog asset, the history entry of the drawn revision and the facts the title block prints. */
export function heroFacts(data: Pick<HeroData, 'subject' | 'bounds' | 'sources'> = hero) {
  const { subject } = data;
  const asset =
    subject.collection === 'standalone' && subject.slug === bridge.slug
      ? bridge
      : subject.collection === 'farm'
        ? farm.assets.find((candidate) => candidate.slug === subject.slug)
        : undefined;
  if (!asset)
    throw new Error(
      `The hero names ${subject.collection}/${subject.slug}, which is not in the catalog`,
    );
  const provenance = asset.provenance as {
    history: HistoryEntry[];
    tierHistory?: Record<string, HistoryEntry[]>;
  };
  const history = subject.tier ? provenance.tierHistory?.[subject.tier] : provenance.history;
  const entry = history?.find((candidate) => candidate.revisionId === subject.revisionId);
  if (!entry)
    throw new Error(`The hero revision ${subject.revisionId} has no history entry in the catalog`);
  const tier =
    subject.tier && 'tiers' in asset
      ? asset.tiers.find((candidate) => candidate.tier === subject.tier)
      : undefined;
  const sourceBytes = tier ? tier.editable.sourceBytes : undefined;
  return {
    name: asset.name,
    href: `/gallery/${asset.slug}/`,
    dimensions: `${data.bounds.size.map((value) => metres(value).replace(/ m$/, '')).join(' × ')} m`,
    tier: subject.tier
      ? `${subject.tier[0]!.toUpperCase()}${subject.tier.slice(1)} tier`
      : undefined,
    revisionId: subject.revisionId,
    model: modelName(entry.modelId ?? entry.model),
    harness: entry.harness ? harnessWithVersion(entry.harness, entry.harnessVersion) : undefined,
    requestedEffort: entry.requestedEffort ?? 'not recorded',
    confirmedEffort: entry.confirmedEffort ?? 'not recorded',
    namedParts: data.sources.glb.namedParts,
    source: sourceBytes ? `${number(sourceBytes)} bytes of JavaScript source` : undefined,
  };
}
