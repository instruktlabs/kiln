/** Gallery curation is independent of the downloadable collection inventory. */
export function isTroyGalleryAsset(asset) {
  return asset.slug !== 'battle-scene-reference';
}
