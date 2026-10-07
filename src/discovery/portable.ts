/** Search a host-supplied catalog without importing Node's catalog construction. */
export { createDiscoveryService } from './service';
export type { DiscoveryIndex, DiscoveryResponse, DiscoverySearchEvidence } from './service';
export { createLexicalDiscoveryIndex, DISCOVERY_INDEX_VERSION } from './lexical-index';
export { discoveryEntrySchema, parseCatalog } from './catalog-schema';
export type { DiscoveryEntry, OperationContract } from './catalog-schema';
export { discoveryInputSchema, parseDiscoveryRequest } from './query-schema';
export type { DiscoveryRequest } from './query-schema';
export { REMOVED_AUTHORING_HELPERS } from '../geometry-catalog';
