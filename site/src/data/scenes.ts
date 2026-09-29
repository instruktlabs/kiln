import farm from './packs/farm.json';

/** The generated pack record owns availability, delivery paths and scene metadata. */
export const farmScene = {
  available: farm.scene.available,
  name: farm.name,
  href: '/scenes/farm/',
  assetBase: farm.scene.assetBase,
  poster: farm.scene.poster.src,
  posterImage: farm.scene.poster,
  posterWidth: farm.scene.poster.width,
  posterHeight: farm.scene.poster.height,
  description: `A farm arranged from ${farm.assetCount} Kiln assets, with fields, a stream and woodland.`,
  desktop: `The desktop scene download includes ${farm.scene.desktop.map((capability) => capability.charAt(0).toLowerCase() + capability.slice(1)).join(', ')}.`,
  mobile: `Mobile supports ${farm.scene.mobile.join(', ').toLowerCase()} only.`,
  exclusions: `${farm.scene.excluded.join(', ').replace(', Mobile', ', mobile').replace(', General', ', general')} are not included.`,
} as const;
