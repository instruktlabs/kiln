import curation from '../data/site-curation.json';

export const galleryCategories = [
  'Vegetation',
  'Architecture & Buildings',
  'Furniture & Interiors',
  'Rocks & Landscape',
  'Vehicles',
  'Characters & Animals',
  'Machinery & Equipment',
  'Props & Decoration',
] as const;

export interface BrowseAsset {
  href: string;
  name: string;
  category: string;
  tags: readonly string[];
  packs: readonly string[];
  addedOn: string;
}
export interface GalleryFilters {
  query?: string;
  category?: string;
  pack?: string;
  sort?: 'featured' | 'newest' | 'az';
}

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const featured = new Map(curation.featuredAssets.map((href, index) => [href, index]));
const alphabetical = (a: BrowseAsset, b: BrowseAsset) =>
  a.name.localeCompare(b.name, 'en') || a.href.localeCompare(b.href, 'en');

/** Shared by static output and the interactive gallery. Never mutates source records. */
export function browseGallery<T extends BrowseAsset>(
  assets: readonly T[],
  filters: GalleryFilters = {},
): T[] {
  const words = normalize(filters.query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return assets
    .filter((asset) => {
      const text = normalize([asset.name, asset.category, ...asset.tags, ...asset.packs].join(' '));
      return (
        (!filters.category || filters.category === 'all' || asset.category === filters.category) &&
        (!filters.pack || filters.pack === 'all' || asset.packs.includes(filters.pack)) &&
        words.every((word) => text.includes(word))
      );
    })
    .sort((a, b) => {
      if (filters.sort === 'az') return alphabetical(a, b);
      if (!filters.sort || filters.sort === 'featured') {
        const rank = (featured.get(a.href) ?? Infinity) - (featured.get(b.href) ?? Infinity);
        if (rank && !Number.isNaN(rank)) return rank;
      }
      return b.addedOn.localeCompare(a.addedOn) || alphabetical(a, b);
    });
}
