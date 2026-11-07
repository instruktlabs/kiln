import type { SavedView } from '../components/viewer-framing';
import type { CatalogImage } from './catalog';

export interface TextTo3dStep {
  id: string;
  prompt: string;
  sourceHref: string;
  sourceLines: number;
  /** On a revision the page gives numbers for: its parent's meshes that kept their shape, matched by vertex positions and place. */
  geometry?: { parent: number; inPlace: number; moved: number };
}
export interface TextTo3dSubject {
  id: string;
  name: string;
  glbHref: string;
  glbBytes: number;
  triangles: number;
  steps: TextTo3dStep[];
  diff?: string;
  images: Record<string, CatalogImage & { caption?: string }>;
}

/** A real slice of the saved program, from one piece of text to the end of another. It fails the build if the program no longer holds them. */
export function sourceExcerpt(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`The program has no "${from}"`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`The program has no "${to}" after "${from}"`);
  return source.slice(start, end + to.length);
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).length;

/** Stands where the nave still was taken. The viewer's lens is narrower, so it aims lower to keep the floor light in frame. */
export const LOOK_INSIDE: SavedView = {
  label: 'Look inside',
  position: [46, 2, 0],
  target: [-40, 12, 0],
};

export const megabytes = (value: number): string => (value / 1_000_000).toFixed(1);
