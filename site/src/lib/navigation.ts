export function legacyDestination(hash: string, known: readonly string[]) {
  if (!hash.startsWith('#/')) return null;
  const slug = hash.slice(2).replace(/\/$/, '');
  return known.includes(slug) ? `/gallery/archive/${slug}/` : '/gallery/archive/';
}
export function matchesAsset(
  asset: { pack: string | null; category: string },
  pack: string,
  category: string,
) {
  return (
    (pack === 'all' || (asset.pack ?? 'standalone') === pack) &&
    (category === 'all' || asset.category === category)
  );
}
