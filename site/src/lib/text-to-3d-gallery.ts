import listing from '../data/text-to-3d-gallery.json';
import record from '../data/text-to-3d.json';
import { PACKS_ENABLED } from './config';
import type { TextTo3dSubject } from './text-to-3d';

export const TEXT_TO_3D_PACK = 'text-to-3d';
export const textTo3dAssetHref = (slug: string) => `/gallery/text-to-3d/${slug}/`;

/**
 * The Text-to-3D subjects that have a gallery page, in launch mode only like the rest of the gallery. Each is the file the
 * Text-to-3D page already serves, with its picture and final program; nothing is exported or rendered again for the gallery.
 */
export function textTo3dGalleryAssets(packsEnabled = PACKS_ENABLED) {
  if (!packsEnabled) return [];
  const subjects = record.subjects as unknown as TextTo3dSubject[];
  return listing.assets.map((entry) => {
    const subject = subjects.find((candidate) => candidate.id === entry.subject);
    const poster = subject?.images.final;
    const source = subject?.steps.at(-1);
    if (!subject || !poster || !source)
      throw new Error(`The gallery lists a Text-to-3D subject the record lacks: ${entry.subject}`);
    return {
      slug: entry.slug,
      name: subject.name,
      description: entry.summary,
      revisionId: entry.revisionId,
      runtimeDownload: { url: subject.glbHref, bytes: subject.glbBytes, sha256: entry.sha256 },
      poster,
      metrics: {
        triangles: subject.triangles,
        materials: entry.materials,
        bounds: entry.bounds,
        clips: entry.clips,
      },
      source,
      madeHref: `/text-to-3d/#${subject.id}`,
    };
  });
}
export type TextTo3dGalleryAsset = ReturnType<typeof textTo3dGalleryAssets>[number];
