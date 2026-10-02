import { listHelperSpecs } from './helper-specs';
import { parseCatalog, type DiscoveryEntry } from './catalog-schema';
import { helperContracts } from './helper-contracts';
import { discoveryIntents } from './intents';
import { REMOVED_AUTHORING_HELPERS } from '../geometry-catalog';
import { discoveryRecipes } from './recipes';
import { discoveryShapes } from './shapes';

/** Migration data only. These names must never reappear as executable Discovery entries. */
export const DISCOVERY_HELPER_RETIREMENTS = [
  ...(['boxUnwrap', 'cylinderUnwrap', 'planeUnwrap'] as const).map((name) => ({
    name,
    reason: 'Replaced ambiguous preservation/projection wrappers with explicit UV operations.',
    migration: REMOVED_AUTHORING_HELPERS[name]!,
  })),
  {
    name: 'cloneGeometry',
    reason: 'The deprecated clone name returns the original geometry reference.',
    migration: REMOVED_AUTHORING_HELPERS.cloneGeometry!,
  },
  {
    name: 'cloneMaterial',
    reason: 'The deprecated clone name returns the original material reference.',
    migration: REMOVED_AUTHORING_HELPERS.cloneMaterial!,
  },
  {
    name: 'panelRemapV',
    reason:
      'The name obscures that both U and V are remapped, and its default V scale is nonidentity.',
    migration: REMOVED_AUTHORING_HELPERS.panelRemapV!,
  },
  {
    name: 'validateAsset',
    reason: 'This category-based material advisory does not establish asset validity.',
    migration: REMOVED_AUTHORING_HELPERS.validateAsset!,
  },
] as const;

const retired = new Set<string>(DISCOVERY_HELPER_RETIREMENTS.map((entry) => entry.name));
const specs = listHelperSpecs().filter((entry) => !retired.has(entry.name));
const byName = new Map(specs.map((entry) => [entry.name, entry]));
const executableId = (name: string): string => {
  const facts = helperContracts[name];
  if (!facts || !byName.has(name))
    throw new Error(`Missing executable Discovery contract: ${name}`);
  return `${facts.kind}:${name}`;
};

// Signatures/examples remain a single source during the old tool's removal. This
// data dependency does not register or expose the retired list-primitives tool.
const catalog = parseCatalog([
  ...specs.map((spec): DiscoveryEntry => {
    const facts = helperContracts[spec.name];
    if (!facts) throw new Error(`Missing Discovery helper facts: ${spec.name}`);
    return {
      version: 'kiln.catalog-entry.v1',
      id: executableId(spec.name),
      kind: facts.kind,
      name: spec.name,
      summary: facts.summary ?? spec.description,
      family: spec.category,
      tags: [...new Set([spec.category, ...facts.tags])],
      aliases: [...facts.aliases],
      intents: [...new Set([...facts.intents, ...(discoveryIntents[spec.name] ?? [])])],
      stability: facts.stability,
      related: (facts.related ?? []).map((related) => ({
        id: executableId(related.name),
        relation: related.relation,
      })),
      references: [...facts.references],
      limitations: [...facts.limitations],
      contract: {
        ...facts.contract,
        signature: spec.signature,
        returns: spec.returns,
        example: spec.example,
        parameters: [...facts.contract.parameters, ...(spec.promptNotes ? [spec.promptNotes] : [])],
      },
    };
  }),
  ...discoveryRecipes,
  ...discoveryShapes,
]);

/** Catalog reads cannot mutate shared definitions or another consumer's response. */
export function listDiscoveryEntries(): DiscoveryEntry[] {
  return structuredClone(catalog);
}
