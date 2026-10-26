/**
 * Levels of detail in the written GLB.
 *
 * Each declared set of tiers (see `lod.ts`) becomes one `MSFT_lod` chain in the shape other
 * tools write and read: the LOD0 node stays in the scene and lists the lower levels, highest
 * detail first, in `extensions.MSFT_lod.ids`; the lower levels leave the scene and keep their
 * own transforms, so a loader places each one under LOD0's parent in its stead; and LOD0's
 * `extras.MSFT_screencoverage` holds one threshold per level. Materials are left alone. A
 * loader without the extension draws LOD0 and everything outside the sets, which is the
 * intended degrade, and so does every metric that walks the scene.
 */
import { type Document, type Node as GltfNode, PropertyType } from '@gltf-transform/core';
import type * as THREE from 'three';
import type { LevelOfDetailChainV1 } from './contracts/integration';
import { KILN_SEMANTIC_ROLES, readSemanticMetadataV1FromExtras } from './contracts/semantic';
import { type Lod, MSFT_LOD, MSFTLod } from './gltf-io';
import type { LodSet } from './lod';
import { drawnNodeTriangles } from './metrics';
import { writtenNodeResolver } from './written-nodes';

/** The node extras key other tools read a chain's switch thresholds from. */
export const MSFT_SCREENCOVERAGE = 'MSFT_screencoverage';

/**
 * Turn each set into one `MSFT_lod` chain on the document an exporter just wrote from `root`.
 *
 * A tier is found through {@link writtenNodeResolver}. Call before any pass that merges, moves
 * or prunes nodes; those passes then see the chain and keep it.
 */
export function applyLodChains(root: THREE.Object3D, sets: readonly LodSet[], doc: Document): void {
  if (sets.length === 0) return;
  const exported = writtenNodeResolver(root, doc, 'LOD export');
  // Resolve every node before moving any: a level leaving the scene shifts its later siblings.
  const chains = sets.map((set) => ({
    set,
    parent: exported(set.parent),
    levels: set.levels.map(exported),
  }));
  const extension = doc.createExtension(MSFTLod);
  for (const { set, parent, levels } of chains) {
    const [base, ...lower] = levels as [GltfNode, ...GltfNode[]];
    const lod = extension.createLod();
    for (const level of lower) {
      parent.removeChild(level);
      lod.addLevel(level);
    }
    base.setExtension(MSFT_LOD, lod);
    base.setExtras({ ...base.getExtras(), [MSFT_SCREENCOVERAGE]: [...set.screenCoverage] });
  }
}

const segment = (name: string, occurrence: number): string =>
  `/${encodeURIComponent(name)}[${occurrence}]`;

/** How many of `siblings` before `index` are named `name`: a path's occurrence number. */
function occurrence(siblings: readonly GltfNode[], index: number, name: string): number {
  let count = 0;
  for (let i = 0; i < index; i++) if (siblings[i]!.getName() === name) count++;
  return count;
}

function screenCoverageOf(node: GltfNode): number[] | undefined {
  const value = (node.getExtras() as Record<string, unknown>)[MSFT_SCREENCOVERAGE];
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? [...(value as number[])]
    : undefined;
}

/** One node `MSFT_lod` chain in the default scene, with the inspection path of each level. */
export interface LodChainNodes {
  /** LOD0 first, then the lower levels in order. */
  levels: GltfNode[];
  /** A lower level's path is the one it takes in LOD0's place under the same parent. */
  paths: string[];
}

/**
 * Every node `MSFT_lod` chain reachable from the default scene, Kiln-written or imported, in
 * scene order (depth first, a node before its children). Chains inside a lower level are not
 * reached: a loader only meets them once that level draws.
 */
export function listLodChainNodes(doc: Document): LodChainNodes[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return [];
  const chains: LodChainNodes[] = [];
  const visit = (siblings: readonly GltfNode[], parentPath: string): void => {
    siblings.forEach((node, index) => {
      const at = (name: string) =>
        `${parentPath}${segment(name, occurrence(siblings, index, name))}`;
      const path = at(node.getName());
      const lower = (node.getExtension<Lod>(MSFT_LOD)?.listLevels() ?? []).filter(
        (level): level is GltfNode => level.propertyType === PropertyType.NODE,
      );
      if (lower.length > 0)
        chains.push({
          levels: [node, ...lower],
          paths: [path, ...lower.map((level) => at(level.getName()))],
        });
      visit(node.listChildren(), path);
    });
  };
  visit(scene.listChildren(), segment(scene.getName() || 'Scene', 0));
  return chains;
}

/** Whether a level carries the `lod.impostor` role that `defineLod({ impostor: true })` stamps. */
function isImpostorLevel(node: GltfNode): boolean {
  const roles = readSemanticMetadataV1FromExtras(node.getExtras())?.roles ?? [];
  return roles.includes(KILN_SEMANTIC_ROLES.lodImpostor);
}

/** Each chain in {@link listLodChainNodes} order with its thresholds and per-level triangles. */
export function summarizeLodChains(doc: Document): LevelOfDetailChainV1[] {
  return listLodChainNodes(doc).map(({ levels, paths }) => {
    const screenCoverage = screenCoverageOf(levels[0]!);
    return {
      path: paths[0]!,
      ...(screenCoverage ? { screenCoverage } : {}),
      levels: levels.map((level, number) => ({
        level: number,
        name: level.getName(),
        path: paths[number]!,
        triangles: drawnNodeTriangles(level),
        ...(number > 0 && isImpostorLevel(level) ? { impostor: true as const } : {}),
      })),
    };
  });
}

/** What {@link trimLodChains} kept and dropped in one chain. */
export interface TrimmedLodChain {
  /** The chain's LOD0 path. */
  path: string;
  /** Levels left, LOD0 included. */
  levels: number;
  /** Names of the dropped levels, highest detail first. */
  dropped: string[];
}

/**
 * Keep LOD0..LOD`maxLod` of every chain in {@link listLodChainNodes} and delete the rest (#196).
 * Thresholds are cut to the kept levels; a chain left with LOD0 alone loses `MSFT_lod` and its
 * thresholds. Dropped subtrees are disposed; the caller prunes what they alone used. A dropped
 * level that an animation targets is refused rather than leaving the clip a dangling channel.
 */
export function trimLodChains(doc: Document, maxLod: number): TrimmedLodChain[] {
  const chains = listLodChainNodes(doc);
  const doomed = new Set<GltfNode>();
  for (const { levels } of chains)
    for (const level of levels.slice(maxLod + 1))
      level.traverse((node) => {
        doomed.add(node);
      });
  for (const animation of doc.getRoot().listAnimations())
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode();
      if (target && doomed.has(target))
        throw new Error(
          `maxLod ${maxLod} would drop ${target.getName() || 'a node'}, which animation ${JSON.stringify(animation.getName())} targets; keep that level.`,
        );
    }
  const trimmed = chains.map(({ levels, paths }) => {
    const [base, ...lower] = levels as [GltfNode, ...GltfNode[]];
    const dropped = lower.slice(maxLod);
    if (dropped.length > 0) {
      const lod = base.getExtension<Lod>(MSFT_LOD)!;
      for (const level of dropped) lod.removeLevel(level);
      const extras = { ...(base.getExtras() as Record<string, unknown>) };
      const coverage = screenCoverageOf(base);
      if (maxLod === 0) {
        base.setExtension(MSFT_LOD, null);
        lod.dispose();
        delete extras[MSFT_SCREENCOVERAGE];
      } else if (coverage) extras[MSFT_SCREENCOVERAGE] = coverage.slice(0, maxLod + 1);
      base.setExtras(extras);
      for (const level of dropped) {
        const subtree: GltfNode[] = [];
        level.traverse((node) => {
          subtree.push(node);
        });
        for (const node of subtree.reverse()) node.dispose();
      }
    }
    return {
      path: paths[0]!,
      levels: levels.length - dropped.length,
      dropped: dropped.map((level) => level.getName()),
    };
  });
  // With no chain left, the extension would still be declared as used.
  const root = doc.getRoot();
  if (!root.listNodes().some((node) => node.getExtension(MSFT_LOD)))
    root
      .listExtensionsUsed()
      .find((extension) => extension.extensionName === MSFT_LOD)
      ?.dispose();
  return trimmed;
}
