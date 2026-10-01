/**
 * The shape `scripts/build-assets.mjs` writes. Every number in it came out of
 * the engine's own integration manifest while the GLB beside it was being made,
 * so nothing on the page is a figure somebody typed.
 */
export interface Specimen {
  name: string;
  file: string;
  thumb: string;
  bytes: number;
  runtime: {
    file: string;
    bytes: number;
    sha256: string;
    metadata: { file: string; bytes: number; sha256: string };
  };
  animations?: number;
  authoredDate?: string;
  /** The item page's hero, and its pixel size as the build wrote it. */
  poster: string;
  posterWidth: number;
  posterHeight: number;
  heroPoster?: Record<string, unknown>;
  source?: string;
  sourceHash?: string;
  artifactHash?: string;
  history?: {
    brief: { kind: 'recorded' | 'summary'; text: string };
    revisions: {
      title: string;
      description: string;
      source: string;
      sourceHash: string;
      current: boolean;
    }[];
  };
  provenance?: {
    attribution: string;
    sourceAccess: string;
    inheritedContext?: string;
    startingExample: string;
    humanIntervention: string;
    reviewFidelity: string;
    poster: string;
    posterReceipt?: Record<string, unknown>;
  };
  category: string;
  caption: string;
  /** The model that wrote the program, named the way prose names it. */
  model: string;
  /** The agent harness it wrote through. */
  harness: string;
  tris: number;
  drawCalls: number;
  materials: number;
  textures: number;
  /** Metres, on the engine's axes: +X forward, +Y up, +Z right. */
  size: [number, number, number];
  grounded: boolean;
  warnings: number;
}
