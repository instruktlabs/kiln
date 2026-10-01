// SPDX-License-Identifier: MIT
// Bake options from the asset map (D-21): which nodes the scene poses or switches, which variants become forms and
// which clips it samples. The rules are the entity's data; this module only reads them, so a new accepted asset (the
// FF3 humanoid, a section module) needs its asset-map entry and a driver, never a change here.
import type { AssetClip, AssetEntity, AssetMap, ClipPlay } from '../assets/asset-map';
import { swapLook } from './bake';
import type { BakeOptions, FormSpec, MaterialLook } from './bake';

/** Clips the scene never samples: review-only cycles and floor moves the FF2 twin does not make. */
const UNPLAYED: readonly ClipPlay[] = ['not-played', 'floor-move'];

export interface EntityBake {
  options: BakeOptions;
  /** Variant name to form index (variants with the same drawing share one form). */
  variantForm: Record<string, number>;
  /** The clips the scene samples, by name. */
  played: Record<string, AssetClip>;
}

/** The node a clip target such as `serviceLid.rotation` moves. */
export const targetNode = (target: string): string => target.slice(0, target.lastIndexOf('.'));

/**
 * The bake options of one entity. Anchors are the model root plus the nodes of the clips the scene plays, the
 * hidden-by-default names, the extra hideables the scene toggles and the nodes it translates directly. Show variants
 * hide the switchable names (every name any variant shows) that they do not show; root variants draw one subtree;
 * material variants swap palette looks.
 */
export function entityBake(map: AssetMap, id: string, extra: { anchors?: readonly string[]; driven?: readonly string[]; floorMoves?: boolean } = {}): EntityBake {
  const e: AssetEntity | undefined = map.entities[id];
  if (!e) throw new Error(`The asset map has no entity ${id}`);
  const played: Record<string, AssetClip> = {};
  const anchors = new Set<string>();
  for (const clip of e.clips ?? []) {
    if (UNPLAYED.includes(clip.play) && !(extra.floorMoves && clip.play === 'floor-move')) continue;
    played[clip.name] = clip;
    for (const target of clip.targets) anchors.add(targetNode(target));
  }
  for (const name of [...(e.hideByDefault ?? []), ...(extra.anchors ?? []), ...(extra.driven ?? [])]) anchors.add(name);

  const variants = Object.entries(e.variants ?? {});
  const switchable = [...new Set(variants.flatMap(([, v]) => v.show ?? []))].sort();
  const forms: FormSpec[] = [], keys: string[] = [], variantForm: Record<string, number> = {};
  for (const [name, v] of variants) {
    const show = v.show ?? switchable;
    const hide = switchable.filter(n => !show.includes(n));
    const swaps: Record<string, MaterialLook> = {};
    for (const [from, to] of Object.entries(v.materials ?? {})) {
      const look = map.palette.swaps[to];
      if (!look) throw new Error(`${id}: variant ${name} swaps to ${to}, which the palette does not define`);
      swaps[from] = swapLook(to, look);
    }
    const key = JSON.stringify([v.root ?? null, hide, Object.entries(v.materials ?? {}).sort()]);
    let form = keys.indexOf(key);
    if (form < 0) {
      form = keys.length;
      keys.push(key);
      forms.push({ name, ...(v.root ? { root: v.root } : {}), hide, swaps });
    }
    variantForm[name] = form;
  }
  const sweeps = Object.values(played).flatMap(c => (c.sweep ? [c.sweep] : []));
  return {
    options: {
      anchors: [...anchors], forms, tintMaterial: e.tint?.material ?? null, clips: Object.keys(played),
      ...(extra.driven ? { driven: extra.driven } : {}), ...(sweeps.length ? { sweeps } : {}),
    },
    variantForm, played,
  };
}
