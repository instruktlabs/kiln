export function legacyDestination(hash: string, known: readonly string[]) {
  if (!hash.startsWith('#/')) return null;
  const slug = hash.slice(2).replace(/\/$/, '');
  return known.includes(slug) ? `/gallery/archive/${slug}/` : '/gallery/archive/';
}
export function matchesAsset(
  asset: { pack: string | null; packs?: readonly string[]; category: string },
  pack: string,
  category: string,
) {
  return (
    (pack === 'all' || (asset.packs ?? [asset.pack ?? 'standalone']).includes(pack)) &&
    (category === 'all' || asset.category === category)
  );
}
