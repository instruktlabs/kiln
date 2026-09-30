/**
 * The Golden Gate Bridge images the site builds under the review rig: which views, in which order, where they
 * live in a revision's mirror directory and how the author's capture files become renderer cameras.
 */

export const BRIDGE_ID = 'golden-gate-bridge';

/**
 * `poster` is the hero image; the rest are the detail views below the review sheet. Each name is also the
 * author's capture file (`cameras/<name>.json`, one explicit `kiln.capture.v1` shot).
 */
export const BRIDGE_CAPTURES = [
  { name: 'classic', poster: true, alt: 'Golden Gate Bridge seen obliquely from above: both towers, the main cables and the suspended roadway on a neutral grey backdrop.' },
  { name: 'water-level', alt: 'Golden Gate Bridge from near water level, looking up at the south tower and the roadway.' },
  { name: 'deck', alt: 'Golden Gate Bridge from the roadway, looking along the lanes toward the towers ahead.' },
  { name: 'tower-top', alt: 'Golden Gate Bridge from beside the top of the south tower, with the main cables and the roadway below.' },
  { name: 'elevation', alt: 'Golden Gate Bridge in side elevation, the full span between both anchorages.' },
];

/** The saved revision's own six-view review sheet keeps this name in the mirror (`captures/review-sheet-neutral.png`). */
export const BRIDGE_REVIEW_SHEET = 'review-sheet';

export const bridgeCaptureFile = (name) => `${name}-neutral.png`;
export const bridgeRevisionDir = (revision) => `standalone/${BRIDGE_ID}/${revision}/`;

/** The mirror file names of a tier: its runtime GLB with the export's metadata sidecar, and its editable archive. */
export const bridgeTierFiles = (tier) => {
  const stem = tier === 'full' ? 'golden-gate' : `golden-gate-${tier}`;
  return { glb: `${stem}-runtime.glb`, metadata: `${stem}-runtime.kiln-metadata.json`, zip: `${stem}-editable.zip` };
};
export const bridgeCapturePath = (revision, name) => `${bridgeRevisionDir(revision)}captures/${bridgeCaptureFile(name)}`;

/** Key of a capture in `rig-posters.json`: the poster is the asset's own key, every other view adds its name. */
export const bridgeCaptureKey = (capture) => (capture.poster ? `bridge:${BRIDGE_ID}` : `bridge:${BRIDGE_ID}#${capture.name}`);

/**
 * A renderer camera from an author's capture file. Only what maps one to one is accepted: a single explicit
 * world-space shot with its own clip planes, so the resolved camera is exactly what the author framed.
 */
export function cameraFromCaptureFile(spec) {
  if (spec?.version !== 'kiln.capture.v1' || !Array.isArray(spec.shots) || spec.shots.length !== 1) throw new Error('A capture file must hold exactly one kiln.capture.v1 shot');
  const shot = spec.shots[0];
  const c = shot.camera;
  if (c?.type !== 'explicit') throw new Error(`Capture ${shot.name}: only an explicit camera maps to a renderer camera`);
  if ((c.relativeTo && c.relativeTo !== 'world') || c.frame || c.targetOffset || (c.framing && c.framing !== 'explicit')) throw new Error(`Capture ${shot.name}: only a world-space explicit camera is supported`);
  if (!Number.isFinite(c.near) || !Number.isFinite(c.far)) throw new Error(`Capture ${shot.name}: near and far are required`);
  if (!Number.isInteger(spec.size) || spec.size <= 0) throw new Error(`Capture ${shot.name}: size must be a positive integer`);
  const camera = {
    version: 'kiln.camera.v1',
    projection: c.projection,
    position: [...c.position],
    target: [...(c.target ?? [0, 0, 0])],
    up: [...(c.up ?? [0, 1, 0])],
    aspect: 1,
    near: c.near,
    far: c.far,
  };
  if (c.projection === 'orthographic') camera.halfHeight = c.halfHeight;
  else camera.fovDeg = c.fovDeg;
  return { camera, size: spec.size, name: shot.name };
}
