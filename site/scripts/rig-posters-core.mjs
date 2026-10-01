import { BRIDGE_CAPTURES, bridgeCaptureKey } from './bridge-captures.mjs';
import { imageSrcsets } from './media-variants.mjs';
import { RIG_ID } from './rig-render.mjs';

/**
 * The record of posters rendered under the review rig lives in `src/data/rig-posters.json`. The catalog files
 * (`packs/farm.json`, `standalone/golden-gate-bridge.json`, `packs/vehicles.json`) take their `poster` from it,
 * so regenerating a catalog from a delivery cannot silently bring back an image made under an older rig.
 */

/** Where a rig poster is pinned in the asset mirror (and, later, in R2): the rig id is part of the path. */
export const rigPosterPath = (pack, release, id) => `media/rig/${RIG_ID}/${pack}/${release}/${id}.png`;

/** `pack:id` keys keep the three catalogs in one file. */
export const rigPosterKey = (pack, id) => `${pack}:${id}`;

/** The catalog image record for a recorded poster. */
export function rigPosterImage(record, alt) {
  return {
    src: `/${record.path.replace(/\.[^.]+$/, '')}.webp`,
    width: record.width,
    height: record.height,
    alt,
    ...imageSrcsets(record.path, record.width),
    inputPath: record.path,
    sourceRevisionId: record.revisionId,
    exactRevision: true,
    rig: RIG_ID,
  };
}

/**
 * Replace an asset's `poster` with the recorded rig poster. The recorded poster was rendered from the exact
 * revision's sealed GLB, so any earlier "exterior view from the parent revision" qualification is dropped;
 * an asset whose revision differs from the record is refused instead of silently mislabelled.
 */
export function applyRigPoster(asset, record) {
  if (!record) return asset;
  if (record.revisionId !== asset.revisionId) {
    throw new Error(`Rig poster for ${asset.slug} was rendered from ${record.revisionId}, but the catalog revision is ${asset.revisionId}; render its poster again with scripts/rig-posters.mjs`);
  }
  const previous = asset.poster ?? {};
  return { ...asset, poster: rigPosterImage(record, previous.alt || asset.description) };
}

/** Apply the record to a list of assets belonging to one pack (`farm`, `vehicles`) or to a standalone asset. */
export function applyRigPosters(assets, pack, recorded) {
  return assets.map((asset) => applyRigPoster(asset, recorded?.posters?.[rigPosterKey(pack, asset.slug)]));
}

/**
 * The bridge's poster and detail views from the record. A recorded view must belong to the catalog's own revision
 * (a view of an older one is refused, not shown); the saved review sheet is not a rig view and is left alone.
 */
export function applyRigBridge(bridge, recorded) {
  if (!recorded?.posters) return bridge;
  const poster = BRIDGE_CAPTURES.find((capture) => capture.poster);
  const next = applyRigPoster(bridge, recorded.posters[bridgeCaptureKey(poster)]);
  const byPath = new Map(Object.values(recorded.posters).filter((record) => record.capture).map((record) => [record.path, record]));
  const captures = next.captures.map((image) => {
    const record = byPath.get(image.inputPath);
    if (!record) return image;
    if (record.revisionId !== next.revisionId) {
      throw new Error(`Rig view ${record.capture} was rendered from ${record.revisionId}, but the catalog revision is ${next.revisionId}; render the bridge views again with scripts/rig-posters.mjs bridge`);
    }
    return rigPosterImage(record, image.alt);
  });
  return { ...next, captures };
}
