import { parseCatalog, type DiscoveryEntry } from './catalog-schema';
import { parseDiscoveryRequest } from './query-schema';

export interface DiscoverySearchEvidence {
  matchedTerms: string[];
  unmatchedTerms: string[];
  fields: string[];
  expandedTerms: string[];
  contextOnly: boolean;
}
export interface DiscoveryHit {
  id: string;
  score: number;
  evidence?: DiscoverySearchEvidence;
}
export interface DiscoveryIndex {
  /** Return ranked candidates; the service owns filtering, exact lookup and paging. */
  search(query: string): Promise<DiscoveryHit[]>;
}
type Summary = Pick<
  DiscoveryEntry,
  'id' | 'kind' | 'name' | 'summary' | 'family' | 'tags' | 'stability' | 'limitations'
> & {
  execution?: 'sync' | 'async';
  match?: {
    basis: 'name' | 'query' | 'related';
    via?: string;
    relation?: string;
    evidence?: DiscoverySearchEvidence;
  };
};
export interface DiscoveryResponse {
  version: 'kiln.discovery.v1';
  mode: 'overview' | 'search' | 'detail' | 'capabilities';
  entries: Array<Summary | DiscoveryEntry>;
  total: number;
  nextOffset: number | null;
  text: string;
  textTruncated?: boolean;
  /** Exact ids requested but not returned because the page was full; fetch them with another call. */
  omittedIds?: string[];
  error?: { code: string; message: string };
  suggestions?: string[];
  capabilities?: unknown;
  orientation?: {
    start: Array<{ id: string; signature: string; returns: string }>;
    families: string[];
    tags: string[];
    guidance: string[];
  };
}

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 16 * 1024;
/** Rule 7: a detail page of exact contracts stays inside MAX_TEXT_CHARS with room for its notice. */
const DETAIL_RESULT_BUDGET = 15_000;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function createDiscoveryService(
  source: unknown,
  index: DiscoveryIndex,
  capabilities: () => Promise<unknown>,
  retirements: Readonly<Record<string, string>> = {},
  /** Host notes for the overview, such as the project an omitted `projectId` selects. */
  notes: () => Promise<string[]> = async () => [],
  /** Host-selected capability entrypoint, never a model-provided instruction. */
  capabilitiesCall = 'capabilities:true',
): (input: unknown) => Promise<DiscoveryResponse> {
  const entries = parseCatalog(source);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byName = new Map(
    entries.filter((entry) => entry.kind !== 'recipe').map((entry) => [entry.name, entry]),
  );
  // An id without its kind prefix (material-wood-v1) also selects the entry, when only
  // one kind uses that slug; canonical ids and search output stay unchanged.
  const slugOf = (entry: DiscoveryEntry) => entry.id.slice(entry.id.indexOf(':') + 1);
  const slugUses = new Map<string, number>();
  for (const entry of entries) slugUses.set(slugOf(entry), (slugUses.get(slugOf(entry)) ?? 0) + 1);
  const bySlug = new Map(
    entries.filter((entry) => slugUses.get(slugOf(entry)) === 1).map((e) => [slugOf(e), e]),
  );
  const select = (selector: string) =>
    byId.get(selector) ?? byName.get(selector) ?? bySlug.get(selector);
  const families = new Set(entries.map((entry) => entry.family));
  const tags = new Set(entries.flatMap((entry) => entry.tags));
  const orientation: NonNullable<DiscoveryResponse['orientation']> = {
    start: ['createRoot', 'createPart'].flatMap((name) => {
      const entry = byName.get(name);
      return entry && 'contract' in entry
        ? [{ id: entry.id, signature: entry.contract.signature, returns: entry.contract.returns }]
        : [];
    }),
    families: [...families].sort(compare),
    tags: [...tags].sort(compare),
    guidance: [
      'Parts auto-add to opts.parent; do not wrap createPart in parent.add. Part rotation uses degrees.',
      'Custom THREE.BufferGeometry and ordinary JavaScript functions remain available. Recipes offer guidance and never restrict modeling.',
      'Send source once and reuse programRef for reads, edits, inspection and rendering. Review geometry, materials and destination constraints separately.',
      `Search for the operation you need in ordinary language, then fetch exact contracts with ids. Use ${capabilitiesCall} for the current host.`,
    ],
  };
  const error = (
    mode: DiscoveryResponse['mode'],
    code: string,
    message: string,
  ): DiscoveryResponse => ({
    version: 'kiln.discovery.v1',
    mode,
    entries: [],
    total: 0,
    nextOffset: null,
    error: { code, message },
    text: message,
  });
  const finish = (response: DiscoveryResponse): DiscoveryResponse => {
    if (response.text.length > MAX_TEXT_CHARS) {
      const notice = '\nText truncated; structured entries are complete.';
      response.text = `${response.text.slice(0, MAX_TEXT_CHARS - notice.length)}${notice}`;
      response.textTruncated = true;
    }
    if (new TextEncoder().encode(JSON.stringify(response)).length > MAX_RESPONSE_BYTES) {
      return error(
        response.mode,
        'RESPONSE_TOO_LARGE',
        'Discovery response exceeds 64 KiB. Request fewer IDs or a smaller page; no partial detail was returned.',
      );
    }
    return structuredClone(response);
  };
  const ranked = async (query: string) => {
    const hits = await index.search(query);
    const unique = new Map<string, DiscoveryHit>();
    for (const hit of hits) {
      if (!byId.has(hit.id) || !Number.isFinite(hit.score))
        throw new Error('Discovery index returned an unknown ID or invalid score.');
      if (!unique.has(hit.id) || unique.get(hit.id)!.score < hit.score) unique.set(hit.id, hit);
    }
    return [...unique]
      .sort((a, b) => b[1].score - a[1].score || compare(a[0], b[0]))
      .map(([id, hit]) => ({ entry: byId.get(id)!, evidence: hit.evidence }));
  };
  const summary = (entry: DiscoveryEntry, match?: Summary['match']): Summary => ({
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    summary: entry.summary,
    family: entry.family,
    tags: entry.tags,
    stability: entry.stability,
    limitations: entry.limitations,
    ...(entry.kind === 'operation' || entry.kind === 'assembly'
      ? { execution: entry.contract.execution }
      : {}),
    ...(match ? { match } : {}),
  });
  return async (value) => {
    const input = parseDiscoveryRequest(value);
    if (input.mode === 'capabilities') {
      const current = await capabilities();
      return finish({
        version: 'kiln.discovery.v1',
        mode: input.mode,
        entries: [],
        total: 0,
        nextOffset: null,
        capabilities: current,
        text: `Current host capabilities.\n${JSON.stringify(current)}`,
      });
    }
    if (input.mode === 'detail') {
      const selected = input.ids.map(select);
      const unknown = input.ids.filter((_, offset) => !selected[offset]);
      if (unknown.length) {
        const removed = unknown.flatMap((id) => {
          const name = id.startsWith('operation:') ? id.slice('operation:'.length) : id;
          return Object.hasOwn(retirements, name) ? [`${id}: ${retirements[name]}`] : [];
        });
        if (removed.length)
          return finish(
            error(
              input.mode,
              'REMOVED_ID',
              `Removed Discovery helpers. Migrate source explicitly; no callable aliases or partial batch results were returned.\n${removed.join('\n')}`,
            ),
          );
        const suggestions = (await ranked(unknown[0]!)).slice(0, 3).map(({ entry }) => entry.id);
        return finish({
          ...error(
            input.mode,
            'UNKNOWN_ID',
            `Unknown exact Discovery IDs: ${unknown.join(', ')}. Use query for suggestions; no substitutions were made.`,
          ),
          suggestions,
        });
      }
      const requested = selected as DiscoveryEntry[];
      if (new Set(requested.map((entry) => entry.id)).size !== requested.length) {
        return error(
          input.mode,
          'DUPLICATE_ID',
          'Each exact selector must identify a different catalog entry. A name or unprefixed slug and its canonical ID refer to the same entry.',
        );
      }
      // Rule 7: a detail page stays inside the default result size. Six full
      // tool-input shapes run to 35,000 characters, so the entries that do not
      // fit are named for a second call rather than cut mid-contract.
      const details: DiscoveryEntry[] = [];
      let characters = 2;
      for (const entry of requested) {
        const cost = JSON.stringify(entry).length + 1;
        if (details.length && characters + cost > DETAIL_RESULT_BUDGET) break;
        details.push(entry);
        characters += cost;
      }
      const omitted = requested.slice(details.length).map((entry) => entry.id);
      return finish({
        version: 'kiln.discovery.v1',
        mode: input.mode,
        entries: details,
        total: requested.length,
        nextOffset: null,
        ...(omitted.length ? { omittedIds: omitted } : {}),
        // One JSON line: a contract is read whole, and one-line JSON costs
        // about a quarter fewer tokens than the indented form.
        text:
          JSON.stringify(details) +
          (omitted.length
            ? `\nNot returned, over the result size: ${omitted.join(', ')}. Fetch them with another kiln_discover ids call.`
            : ''),
      });
    }
    if (
      (input.family && !families.has(input.family)) ||
      input.tags?.some((tag) => !tags.has(tag))
    ) {
      return error(
        input.mode,
        'UNKNOWN_FILTER',
        'Unknown family or tag. Browse the overview for current catalog labels.',
      );
    }
    const matchFilter = (entry: DiscoveryEntry) =>
      (!input.family || entry.family === input.family) &&
      (!input.kind || entry.kind === input.kind) &&
      (!input.tags || input.tags.every((tag) => entry.tags.includes(tag)));
    let matches: Summary[];
    if (input.query) {
      const exact = select(input.query);
      const ordered = await ranked(input.query);
      const candidates = exact
        ? [
            { entry: exact, evidence: ordered.find((row) => row.entry.id === exact.id)?.evidence },
            ...ordered.filter(({ entry }) => entry.id !== exact.id),
          ]
        : ordered;
      matches = candidates
        .filter(({ entry }) => matchFilter(entry))
        .map(({ entry, evidence }) =>
          summary(entry, {
            basis: entry === exact ? 'name' : 'query',
            ...(evidence ? { evidence } : {}),
          }),
        );
      const seen = new Set(matches.map((entry) => entry.id));
      let relatedCount = 0;
      for (const { entry } of candidates.filter(({ entry }) => matchFilter(entry)).slice(0, 3)) {
        for (const related of entry.related) {
          const companion = byId.get(related.id)!;
          if (relatedCount >= 3 || seen.has(companion.id) || !matchFilter(companion)) continue;
          matches.push(
            summary(companion, { basis: 'related', via: entry.id, relation: related.relation }),
          );
          seen.add(companion.id);
          relatedCount++;
        }
      }
    } else {
      matches = entries
        .filter(matchFilter)
        .sort((a, b) => compare(a.id, b.id))
        .map((entry) => summary(entry));
    }
    const page = matches.slice(input.offset, input.offset + input.limit);
    const nextOffset =
      input.offset + page.length < matches.length ? input.offset + page.length : null;
    const guidance = [...orientation.guidance, ...(input.mode === 'overview' ? await notes() : [])];
    return finish({
      version: 'kiln.discovery.v1',
      mode: input.mode,
      entries: page,
      total: matches.length,
      nextOffset,
      ...(input.mode === 'overview' ? { orientation: { ...orientation, guidance } } : {}),
      text: [
        input.query
          ? 'Potential helpers and related guidance. Fetch selected contracts with ids before calling unfamiliar helpers. Search relevance does not certify support for the entire requested asset.'
          : 'Kiln catalog overview. Fetch exact contracts with ids before calling unfamiliar helpers.',
        ...(input.mode === 'overview'
          ? [
              ...orientation.start.map((entry) => `${entry.signature} -> ${entry.returns}`),
              ...guidance,
              `Families: ${orientation.families.join(', ')}. Tags: ${orientation.tags.join(', ')}.`,
            ]
          : []),
        ...page.map(
          (entry) =>
            `${entry.id} [${entry.stability}]${entry.execution ? ` (${entry.execution === 'async' ? 'async; await the result' : 'sync'})` : ''}: ${entry.summary}${entry.limitations.length ? ` Limits: ${entry.limitations.join(' ')}` : ''}${formatMatch(entry.match)}`,
        ),
        ...(input.query && !page.length
          ? [
              'No lexical matches on this page. Try a narrower modeling operation, browse the overview for families/tags, or use custom geometry. This is not proof that the asset is impossible.',
            ]
          : []),
        ...(nextOffset === null ? [] : [`More results: offset ${nextOffset}.`]),
      ].join('\n\n'),
    });
  };
}

function formatMatch(match: Summary['match']): string {
  if (!match) return '';
  if (match.basis === 'related')
    return ` Related ${match.relation} via ${match.via}; not a direct query match.`;
  if (!match.evidence) return match.basis === 'name' ? ' Exact name.' : '';
  const e = match.evidence;
  return (
    ` ${e.contextOnly ? 'Context wording only; check the limitations.' : 'Lexical match.'} Matched: ${e.matchedTerms.join(', ')}.` +
    (e.unmatchedTerms.length ? ` Unmatched: ${e.unmatchedTerms.join(', ')}.` : '') +
    (e.expandedTerms.length ? ` Expanded to: ${e.expandedTerms.join(', ')}.` : '')
  );
}
