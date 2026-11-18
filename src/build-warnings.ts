/**
 * Warnings about what a program did while it built, gathered per sandbox from the helpers the
 * author called directly. They are advisory: a build that earns one still succeeds.
 */
import type * as THREE from 'three';

/** Names shown before a warning counts the rest. */
const LISTED = 5;
/** Longest array of arguments searched for a part handed to a helper as an operand. */
const OPERAND_LIST = 64;

/** What one sandbox saw its author's `createPart` and `createPivot` calls do. */
export interface BuildTracker {
  /** Each node `createPart` returned to the author, in call order. */
  parts: Array<{ name: string; node: THREE.Object3D; hadParent: boolean }>;
  /** Parts later handed to another helper, which may consume them (a Boolean operand, a merge). */
  consumed: WeakSet<object>;
  /** Names that already start with the prefix their helper adds, by helper and prefix. */
  prefixed: Map<string, { helper: string; prefix: string; names: string[] }>;
}

export function createBuildTracker(): BuildTracker {
  return { parts: [], consumed: new WeakSet(), prefixed: new Map() };
}

/** Records a helper call whose name already starts with the prefix the helper adds. */
export function noteDoubledPrefix(
  tracker: BuildTracker,
  helper: 'createPivot' | 'createPart',
  name: unknown,
  prefix: 'Joint_' | 'Mesh_',
): void {
  if (typeof name !== 'string' || !name.startsWith(prefix)) return;
  const key = `${helper}:${prefix}`;
  const entry = tracker.prefixed.get(key) ?? { helper, prefix, names: [] };
  tracker.prefixed.set(key, entry);
  if (!entry.names.includes(name)) entry.names.push(name);
}

/**
 * Marks every created part among a helper's arguments, one array deep, as handed on. A part
 * built only to be a Boolean operand or a merge input is meant to stay out of the scene.
 */
export function noteOperands(tracker: BuildTracker, args: readonly unknown[]): void {
  if (tracker.parts.length === 0) return;
  const mark = (value: unknown): void => {
    if (typeof value === 'object' && value !== null) tracker.consumed.add(value);
  };
  for (const arg of args) {
    if (Array.isArray(arg)) arg.slice(0, OPERAND_LIST).forEach(mark);
    else mark(arg);
  }
}

function reachesRoot(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = node; at; at = at.parent) if (at === root) return true;
  return false;
}

const quoted = (names: readonly string[]): string => {
  const shown = names.slice(0, LISTED).map((name) => `"${name}"`);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
};

/**
 * The warnings for one finished build. A part counts as left out when the author gave it no
 * `parent`, it is not under the root now, and no helper took it as an argument; a part that had a
 * parent and was later removed, or was consumed by a Boolean or merge, was left out on purpose.
 */
export function buildWarnings(tracker: BuildTracker, root: THREE.Object3D): string[] {
  const warnings: string[] = [];
  const orphans = tracker.parts.filter(
    ({ node, hadParent }) => !hadParent && !tracker.consumed.has(node) && !reachesRoot(node, root),
  );
  if (orphans.length > 0) {
    const names = orphans.map(({ name }) => name);
    warnings.push(
      `PART_NOT_IN_ASSET: ${orphans.length} ${orphans.length === 1 ? 'part' : 'parts'} built ` +
        `with createPart never join the asset, so the GLB leaves ${orphans.length === 1 ? 'it' : 'them'} out: ` +
        `${quoted(names)}. createPart attaches a part only when its options carry { parent }; ` +
        'pass { parent: root } (or the group it belongs to), or call parent.add(part).',
    );
  }
  for (const { helper, prefix, names } of tracker.prefixed.values()) {
    const sample = names[0] as string;
    warnings.push(
      `NAME_PREFIX_DOUBLED: ${helper} adds the ${prefix} prefix itself, but ` +
        `${names.length === 1 ? '1 name already starts' : `${names.length} names already start`} ` +
        `with it, so ${names.length === 1 ? 'the node reads' : 'nodes read'} "${prefix}${sample}": ` +
        `${quoted(names)}. Pass the name without ${prefix}, "${sample.slice(prefix.length)}" for the first.`,
    );
  }
  return warnings;
}
