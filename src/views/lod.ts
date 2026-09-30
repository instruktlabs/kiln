/**
 * Levels of detail in a review scene loaded from GLB bytes.
 *
 * The review scene holds what a loader without `MSFT_lod` draws: each chain's LOD0 and the
 * parts outside every chain. The lower levels are built beside it, detached, and registered
 * here against the review root in the order `listLodChainNodes` walks the bytes, which is
 * the order of `levelsOfDetail` in every result. A shot whose subject names a lower level, or
 * a node only a lower level holds, draws that level in its LOD0's place, at the same child
 * index, and the scene is restored afterwards. Review producers read one scene, so the CPU
 * raster and a GPU derivative draw the same level.
 */
import type { Object3D } from 'three';
import { type CameraSubjectV1, listCameraSubjects } from './camera';

export interface ReviewLodChain {
  /** The LOD0 node in the review scene. */
  base: Object3D;
  /** Lower levels in order, detached until a shot draws one. Empty when the bytes also place a
   *  level in the scene, which a loader would draw twice; such a chain never swaps. */
  levels: Object3D[];
}

const CHAINS = new WeakMap<object, readonly ReviewLodChain[]>();

export function registerReviewLodChains(root: Object3D, chains: readonly ReviewLodChain[]): void {
  if (chains.length > 0) CHAINS.set(root, chains);
}

export function reviewLodChains(root: unknown): readonly ReviewLodChain[] {
  return typeof root === 'object' && root !== null ? (CHAINS.get(root) ?? []) : [];
}

/** The level each chain has in the scene now, 0 for LOD0, in `levelsOfDetail` order. */
export function drawnLevels(root: unknown): number[] {
  return reviewLodChains(root).map((chain) => {
    const drawn = chain.levels.findIndex((level) => level.parent !== null);
    return drawn < 0 ? 0 : drawn + 1;
  });
}

function swap(out: Object3D, into: Object3D): void {
  const parent = out.parent!;
  parent.children[parent.children.indexOf(out)] = into;
  into.parent = parent;
  out.parent = null;
}

interface LevelMatch {
  chain: ReviewLodChain;
  level: number;
  path: string;
}

/** The detached level holding the node a subject names, when the scene as it stands lacks it.
 *  Paths match exactly, as the level's nodes would stand at LOD0's index. */
function levelForSubject(
  root: Object3D,
  subject: CameraSubjectV1 | undefined,
): LevelMatch | undefined {
  const chains = reviewLodChains(root);
  if (chains.length === 0 || typeof subject !== 'object' || subject === null) return undefined;
  const byPath = typeof subject.path === 'string';
  if (!byPath && typeof subject.name !== 'string') return undefined;
  const subjects = listCameraSubjects(root);
  if (
    subjects.some((entry) => (byPath ? entry.path === subject.path : entry.name === subject.name))
  )
    return undefined;
  const paths = new Map(subjects.map((entry) => [entry.node, entry.path]));
  const matches: LevelMatch[] = [];
  for (const chain of chains) {
    const parent = chain.base.parent;
    const parentPath = parent ? paths.get(parent) : undefined;
    if (!parent || parentPath === undefined) continue;
    const before = parent.children.slice(0, parent.children.indexOf(chain.base));
    chain.levels.forEach((level, index) => {
      // The paths the level's nodes take once it stands at LOD0's index.
      const occurrence = before.filter((sibling) => sibling.name === level.name).length;
      const own = `/${encodeURIComponent(level.name)}[0]`;
      const at = `${parentPath}/${encodeURIComponent(level.name)}[${occurrence}]`;
      for (const entry of listCameraSubjects(level)) {
        const path = at + entry.path.slice(own.length);
        if (byPath ? path === subject.path : entry.name === subject.name)
          matches.push({ chain, level: index + 1, path });
      }
    });
  }
  if (matches.length > 1)
    throw new Error(
      `ambiguous camera subject: ${matches.length} nodes in lower levels of detail match ${JSON.stringify(subject.path ?? subject.name)}; choose one path: ${matches.map((match) => match.path).join(', ')}`,
    );
  return matches[0];
}

/**
 * Run `run` with the lower level holding `subject` drawn in its LOD0's place, then restore
 * the scene even when `run` fails. A subject the scene already has, or one outside every chain,
 * changes nothing. `run` receives the level each chain draws meanwhile.
 */
export async function withSubjectLevel<T>(
  root: unknown,
  subject: CameraSubjectV1 | undefined,
  run: (levels: number[]) => Promise<T>,
): Promise<T> {
  const scene = root as Object3D;
  const match = levelForSubject(scene, subject);
  if (!match) return run(drawnLevels(root));
  const level = match.chain.levels[match.level - 1]!;
  swap(match.chain.base, level);
  scene.updateMatrixWorld(true);
  try {
    return await run(drawnLevels(root));
  } finally {
    swap(level, match.chain.base);
    scene.updateMatrixWorld(true);
  }
}
