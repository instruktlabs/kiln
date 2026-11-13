// SPDX-License-Identifier: MIT
// Golden Gate's adapter for the scene pack swap tool (site/scripts/scene-pack-swap.mjs). Given a sealed pack whose bridge
// tiers (the kiln-runtime derivation of a saved child) or vehicles (vehicle-wheel-lod) were swapped, it regenerates the
// pack members that name those models:
//   bridge/<tier>.kiln-metadata.json   the runtime export's own sidecar
//   data/scene.json                    bridge tier revision, parent, lineage, bytes and triangles; vehicle revisions
//   credits.json, pack.json            the bridge credit names, the file list revisions and the bridge source pins
//   licenses/vehicles/<type>.ASSET-LICENSE.txt   as the Foundry Floor adapter writes the same vehicles' declarations
// and keeps the two checks scripts/stage.ts ran before sealing: every staged bridge tier descends, within eight
// generations, from the revision the bridge licence's "Fix-up 1" section names with its parent and file (stage.ts
// revisionLineage and checkBridge), and the lane polylines and approach starts in data/layout.json still lie on the web
// tier's Roadway (stage.ts: 2 mm drift; approach start elevation 2 mm and grade 2e-4).
import { swapVehicleLicence } from '../../foundry-floor/scripts/pack-swap-adapter';
import { deckEnds } from './approaches';
import { laneDrift, roadGridFromBridge } from './layout';
import { BRIDGE_LICENCE, BRIDGE_PINS } from './release';
import type { SceneLayout } from '../src/data';

type Json = Record<string, any>;
interface SavedManifest { assetId: string; revisionId: string; parentRevision: string }
export interface Swap { member: string; revision: string; sha256: string; bytes: Uint8Array; saved?: Uint8Array; manifest: SavedManifest | null; previous: { revision: string; sha256: string }; runtimeMetadata?: { name: string; bytes: Uint8Array } }

export const bridgeTier = (member: string) => /^bridge\/golden-gate-(web|far)\.glb$/.exec(member)?.[1] as 'web' | 'far' | undefined;
export const vehicleType = (member: string) => /^vehicles\/([a-z-]+)\.glb$/.exec(member)?.[1];
const manifestOf = (s: Swap) => s.manifest ?? (() => { throw new Error(`${s.member}: the swap list names no saved manifest`); })();
const childOf = (s: Swap) => {
  const m = manifestOf(s);
  if (m.revisionId !== s.revision || m.parentRevision !== s.previous.revision) throw new Error(`${s.member}: ${m.revisionId} is not a saved child of the sealed revision ${s.previous.revision} (its parent is ${m.parentRevision})`);
  return m;
};

/** Triangles drawn by the scene graph (each mesh once per node that draws it), as data/scene.json records them. */
export function bridgeTriangles(glb: Uint8Array): number {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength), length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))) as { scene?: number; scenes: { nodes: number[] }[]; nodes: { mesh?: number; children?: number[] }[]; meshes: { primitives: { indices?: number; attributes: { POSITION: number } }[] }[]; accessors: { count: number }[] };
  const mesh = (i: number) => json.meshes[i]!.primitives.reduce((n, p) => n + json.accessors[p.indices ?? p.attributes.POSITION]!.count / 3, 0);
  let triangles = 0;
  const queue = [...json.scenes[json.scene ?? 0]!.nodes];
  while (queue.length) { const node = json.nodes[queue.pop()!]!; if (node.mesh !== undefined) triangles += mesh(node.mesh); queue.push(...(node.children ?? [])); }
  return triangles;
}

/**
 * stage.ts's licence rule (checkBridge with revisionLineage): the lineage reaches the licensed revision within eight
 * generations, and the licence's "Fix-up 1" section names it on one line with its parent and the tier's file.
 */
export function checkLicensedLineage(licence: string, file: string, lineage: readonly string[], licensed: { revision: string; parent: string }): void {
  if (lineage.at(-1) !== licensed.revision) throw new Error(`${file}: the lineage ${lineage.join(' < ')} does not reach the licensed revision ${licensed.revision}`);
  if (lineage.length > 9) throw new Error(`${file}: ${lineage[0]} does not descend from ${licensed.revision} within eight generations`);
  const at = licence.indexOf(BRIDGE_LICENCE.section);
  const named = at < 0 ? undefined : licence.slice(at).split('\n').find(line => line.includes(licensed.revision));
  if (!named?.includes(licensed.parent) || !named.includes(file)) throw new Error(`${file}: the licence's ${BRIDGE_LICENCE.section} section does not name ${licensed.revision} (parent ${licensed.parent}, ${file})`);
}

/** stage.ts's roadway checks on the web tier: the lane drift (returned) and the approach starts. */
export function checkRoadway(web: Uint8Array, layout: SceneLayout): { laneDrift: number; approaches: Record<'south' | 'north', { elevation: number; grade: number }> } {
  const drift = laneDrift(layout, roadGridFromBridge(web));
  if (!(drift <= .002)) throw new Error(`data/layout.json lane polylines are ${drift} m off the swapped web bridge's roadway`);
  const ends = deckEnds(web, layout.bridge.roadEndZ), approaches = {} as Record<'south' | 'north', { elevation: number; grade: number }>;
  for (const name of ['south', 'north'] as const) {
    const start = layout.approaches[name].start, end = ends[name];
    approaches[name] = { elevation: Math.abs(start.elevation - end.elevation), grade: Math.abs(start.grade - end.grade) };
    if (approaches[name].elevation > .002 || approaches[name].grade > 2e-4) throw new Error(`data/layout.json approaches.${name}.start does not match the swapped roadway end`);
  }
  return { laneDrift: drift, approaches };
}

/** data/scene.json: each swapped bridge tier names its child, the child's lineage, bytes and triangles; each vehicle its child. */
export function swapSceneIndex(index: Json, swaps: readonly Swap[]): Json {
  const out = structuredClone(index);
  for (const s of swaps) {
    const tier = bridgeTier(s.member), type = vehicleType(s.member), m = childOf(s);
    if (tier) {
      const entry = out.bridge?.[tier];
      if (!entry || entry.path !== s.member || entry.revision !== s.previous.revision || entry.lineage?.[0] !== s.previous.revision) throw new Error(`data/scene.json: bridge.${tier} is not the sealed revision ${s.previous.revision}`);
      out.bridge[tier] = { ...entry, revision: s.revision, parentRevision: m.parentRevision, lineage: [s.revision, ...entry.lineage], bytes: s.bytes.length, triangles: bridgeTriangles(s.bytes) };
    } else if (type) {
      const entry = out.vehicles?.[type];
      if (!entry || entry.revision !== s.previous.revision) throw new Error(`data/scene.json: vehicles.${type} is not the sealed revision ${s.previous.revision}`);
      out.vehicles[type] = { ...entry, revision: s.revision };
    } else throw new Error(`${s.member}: not a Golden Gate bridge tier or vehicle`);
  }
  return out;
}

/** Credit entries: each swapped bridge tier's credit names its new revision. */
export function swapCredits(credits: Json[], swaps: readonly Swap[]): Json[] {
  const out = structuredClone(credits);
  for (const s of swaps) {
    const tier = bridgeTier(s.member);
    if (!tier) continue;
    const credit = out.find(c => typeof c.name === 'string' && c.name.startsWith(`Golden Gate Bridge model (${tier} runtime, Kiln revision ${s.previous.revision},`));
    if (!credit) throw new Error(`No credit names the ${tier} bridge at ${s.previous.revision}`);
    credit.name = credit.name.replace(s.previous.revision, s.revision);
  }
  return out;
}

/** credits.json: credit names and the per-file revisions. */
export function swapCreditsFile(file: Json, swaps: readonly Swap[]): Json {
  const out: Json = { ...structuredClone(file), credits: swapCredits(file.credits, swaps) };
  for (const s of swaps) {
    const entry = out.files.find((f: Json) => f.path === s.member);
    if (!entry || entry.revision !== s.previous.revision) throw new Error(`credits.json: ${s.member} is not listed at ${s.previous.revision}`);
    entry.revision = s.revision;
  }
  return out;
}

/** pack.json: the credits and the bridge source pins. */
export function swapPackJson(pack: Json, swaps: readonly Swap[]): Json {
  pack.credits = swapCredits(pack.credits, swaps);
  for (const s of swaps) {
    const tier = bridgeTier(s.member);
    if (!tier) continue;
    if (pack.source?.bridge?.[tier] !== s.previous.revision) throw new Error(`pack.json: source.bridge.${tier} is not ${s.previous.revision}`);
    pack.source.bridge[tier] = s.revision;
  }
  return pack;
}

/** The swap tool's adapter hook. */
export function regenerate({ files, swaps }: { files: Map<string, Uint8Array>; swaps: Swap[] }) {
  const read = (path: string) => files.get(`assets/${path}`) ?? (() => { throw new Error(`pack member missing: ${path}`); })();
  const text = (path: string) => new TextDecoder().decode(read(path));
  const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const members: Record<string, Uint8Array> = {};
  const history: Record<string, string> = { 'data/scene.json': 'each swapped bridge tier keeps its replaced revision as the parent at the head of its lineage' };
  const index = swapSceneIndex(JSON.parse(text('data/scene.json')), swaps);
  members['data/scene.json'] = json(index);
  members['credits.json'] = json(swapCreditsFile(JSON.parse(text('credits.json')), swaps));
  const licence = text(BRIDGE_LICENCE.staged);
  for (const s of swaps) {
    const tier = bridgeTier(s.member), type = vehicleType(s.member);
    if (tier) {
      const sidecar = s.runtimeMetadata ?? (() => { throw new Error(`${s.member}: the swap carries no runtime metadata (derive kiln-runtime)`); })();
      if (sidecar.name !== `golden-gate-${tier}.kiln-metadata.json`) throw new Error(`${s.member}: the sidecar is ${sidecar.name}`);
      members[`bridge/${sidecar.name}`] = sidecar.bytes;
      checkLicensedLineage(licence, s.member.slice('bridge/'.length), index.bridge[tier].lineage, BRIDGE_PINS[tier].licensed);
      if (tier === 'web') checkRoadway(s.bytes, JSON.parse(text('data/layout.json')) as SceneLayout);
    } else if (type) {
      const path = `licenses/vehicles/${type}.ASSET-LICENSE.txt`;
      members[path] = Buffer.from(swapVehicleLicence(text(path), { ...s, manifest: manifestOf(s) } as never));
      history[path] = 'the declaration names the replaced revision as the new revision\'s immediate saved parent';
    }
  }
  return { members, history, packJson: (pack: Json) => swapPackJson(pack, swaps) };
}
