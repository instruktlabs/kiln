import { listDiscoveryEntries } from './catalog';
import { createLexicalDiscoveryIndex } from './lexical-index';
import { createDiscoveryService, type DiscoveryIndex } from './service';
import type { DiscoveryEntry } from './catalog-schema';
import { REMOVED_AUTHORING_HELPERS } from '../geometry-catalog';

export { listDiscoveryEntries } from './catalog';
export { discoveryEntrySchema, parseCatalog } from './catalog-schema';
export type { DiscoveryEntry, OperationContract } from './catalog-schema';
export { discoveryInputSchema, parseDiscoveryRequest } from './query-schema';
export type { DiscoveryRequest } from './query-schema';
export { createDiscoveryService } from './service';
export type { DiscoveryIndex, DiscoveryResponse } from './service';

let snapshot: { entries: DiscoveryEntry[]; index: DiscoveryIndex } | undefined;

/** Share one immutable catalog/index per process; host capabilities stay live. */
export function createDiscovery(
  capabilities: () => Promise<unknown> = async () => ({
    host: 'No host capability provider was supplied.',
    discovery: { mode: 'lexical', offline: true, requiresModel: false },
  }),
  notes: () => Promise<string[]> = async () => [],
) {
  snapshot ??= (() => {
    const entries = listDiscoveryEntries();
    return { entries, index: createLexicalDiscoveryIndex(entries) };
  })();
  return createDiscoveryService(
    snapshot.entries,
    snapshot.index,
    capabilities,
    REMOVED_AUTHORING_HELPERS,
    notes,
  );
}
