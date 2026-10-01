import farm from './packs/farm.json';
import foundryFloor from './foundry-floor.json';
import foundryFloorPack from './packs/foundry-floor.json';
import sceneMedia from './scene-media.json';
import scenePacks from './scene-packs.json';
import { listOf } from '../lib/catalog';
import { foundryPresentation } from '../lib/foundry-presentation';

/** A link shown while a scene runs, relative to the scene's staged pack. */
interface SceneLink {
  label: string;
  path: string;
}

interface SceneCopy {
  /** Shown above Explore, by state: the scene is qualified, a staged preview, or not in this build. */
  available: string;
  preview: string;
  unavailable: string;
  /** One short line under it about devices and loading. */
  devices: string;
  /** What the status panel says when this build carries no scene runtime. */
  unavailableTitle: string;
  unavailableBody: string;
  /** What the error surface says; the last sentence names what remains available. */
  errorText: string;
}

/**
 * Current Farm controls and qualification scope. Device tiers remain configured
 * behavior; the earlier tablet measurements do not qualify the new scene bytes.
 */
export const farmTouchCopy = {
  heading: 'Play with touch.',
  intro: 'The controls are made for touch, not drawn as a pad of buttons.',
  controls: [
    'Move with the joystick. When you drive the tractor, push it forward to accelerate and pull it back to brake and, once stopped, to reverse. Push it left or right to steer.',
    'Drag one finger to look around.',
    'Pinch to zoom on foot, while driving the tractor or in the overview.',
    'One tap target appears when there is something to do: open a door or gate, drive the tractor or leave it.',
    'Walking is in third person: the camera follows Rowan on foot and the tractor when you drive it.',
  ],
  qualityHeading: 'Quality follows the device.',
  quality: [
    'The scene chooses a quality tier when it opens. A phone of the Galaxy S24+ class starts on the high tier when its browser uses WebGPU, and on the minimal tier when it falls back to WebGL2. A tablet of the Galaxy Tab S9 FE class starts on the minimal tier on either graphics backend.',
  ],
} as const;

/**
 * The one scene link every build has. A pre-upload build (KILN_SITE_PACKS=0) has no Commons pack or asset pages, so a
 * scene whose fallback is one of them points here instead and names no download (engineering review, finding 2).
 */
const allScenes = { href: '/scenes/', label: 'View all scenes' } as const;
const noDownloadsError = 'The scene could not load. Check your connection and try Explore again.';

const farmPack = scenePacks.farm;
const goldenGatePack = scenePacks['golden-gate'];
const goldenGatePoster = sceneMedia['golden-gate'].poster;

/**
 * Scene pages read their delivery paths from the generated pack records (scene-packs.json, written by
 * scripts/scene-pack.mjs) and their copy from here. `assetBase` is the staged, verified pack the
 * browser scene loads; the Farm's `farm.scene.assetBase` stays the R2 base of the download archives.
 */
export const farmScene = {
  id: 'farm',
  available: farm.scene.available,
  name: farm.name,
  href: '/scenes/farm/',
  assetBase: farmPack.base,
  pack: farmPack,
  poster: farm.scene.poster.src,
  posterImage: farm.scene.poster,
  /** A wide view, then a closer one, stacked wherever the scene is pictured. */
  posterImages: [farm.scene.poster, sceneMedia.farm.captures.walk.poster],
  posterWidth: farm.scene.poster.width,
  posterHeight: farm.scene.poster.height,
  posterAlt: 'The Farm scene with barn, farmhouse, fields, animals, woodland and stream',
  description: `A farm arranged from ${farm.assetCount} Kiln assets, with fields, a stream and woodland.`,
  desktop: `The desktop scene download includes ${listOf(farm.scene.desktop.map((capability) => capability.charAt(0).toLowerCase() + capability.slice(1)))}.`,
  mobile: `The download includes touch controls for ${listOf(farm.scene.mobile.map((capability) => capability.charAt(0).toLowerCase() + capability.slice(1)))}.`,
  touch: farmTouchCopy,
  exclusions: 'Trailer towing and general vehicle physics are not included in the scene download.',
  links: [
    { label: 'Software notices', path: 'THIRD-PARTY-NOTICES.txt' },
    { label: 'Asset licence', path: 'licenses/ASSET-LICENSE.txt' },
  ] satisfies SceneLink[],
  copy: {
    available: 'Explore the Farm in your browser.',
    preview:
      'Explore opens the current Farm. The scene download is an earlier build with the same assets; it walks in first person.',
    unavailable:
      'The browser scene is not included in this build. Explore opens its current status and downloads.',
    devices: 'Desktop and touch play. Loads only when you choose Explore.',
    unavailableTitle: 'The interactive Farm is not included in this build.',
    unavailableBody: 'The Farm scene download contains the current runnable scene.',
    errorText:
      'The scene could not load. Check your connection and try Explore again. The Farm downloads remain available.',
  } satisfies SceneCopy,
  fallback: { href: '/packs/farm/', label: 'View the Farm downloads' },
  preUpload: {
    fallback: allScenes,
    unavailableBody: 'This scene is not part of this build.',
    errorText: noDownloadsError,
  },
} as const;

/**
 * The Golden Gate scene: the Kiln-authored bridge in a driving and traffic demonstration. The bridge
 * and the six vehicles are Kiln-authored models; terrain, water and ground imagery are built from US
 * federal data (the pack's credits.json and licenses/ hold the record).
 */
export const goldenGateScene = {
  id: 'golden-gate',
  available: false,
  name: 'Golden Gate Bridge',
  href: '/scenes/golden-gate/',
  assetBase: goldenGatePack.base,
  pack: goldenGatePack,
  poster: goldenGatePoster.src,
  posterImage: goldenGatePoster,
  posterImages: [sceneMedia['golden-gate'].captures.day.poster, goldenGatePoster],
  posterWidth: goldenGatePoster.width,
  posterHeight: goldenGatePoster.height,
  posterAlt: goldenGatePoster.alt,
  description:
    'A Kiln-authored suspension bridge in a driving and traffic demonstration: drive a sedan across the deck, watch traffic pass, and view the span by day, at golden hour or in fog.',
  links: [
    { label: 'Software notices', path: 'THIRD-PARTY-NOTICES.txt' },
    { label: 'Data notices', path: 'licenses/FEDERAL-DATA.txt' },
    { label: 'Trademark notice', path: 'licenses/TRADEMARK-NOTICE.txt' },
  ] satisfies SceneLink[],
  copy: {
    available: 'Explore the bridge in your browser.',
    preview: 'Explore opens the driving and traffic demonstration.',
    unavailable: 'The browser scene is not part of this build. Explore opens its status.',
    devices: 'Loads only when you choose Explore.',
    unavailableTitle: 'The interactive bridge scene is not part of this build.',
    unavailableBody: 'The bridge itself is a Kiln-authored asset with its own page and downloads.',
    errorText:
      'The scene could not load. Check your connection and try Explore again. The bridge asset and its downloads remain available.',
  } satisfies SceneCopy,
  fallback: { href: '/gallery/golden-gate-bridge/', label: 'View the bridge asset' },
  preUpload: {
    fallback: allScenes,
    unavailableBody: 'The bridge scene is not part of this build.',
    errorText: noDownloadsError,
  },
} as const;

const foundryFloorScenePack = scenePacks['foundry-floor'];
const foundryFloorCaptures = sceneMedia['foundry-floor'].captures;
const foundryFloorPoster = foundryFloorCaptures.campus.poster;
const foundryFloorPresentation = foundryPresentation(
  foundryFloorPack,
  foundryFloorScenePack.release,
);

/**
 * Foundry Floor stays out of search results (D-33/S-2). Its copy follows the
 * staged catalogue: older interior builds cannot promise a campus. No device claims are made. The scene is
 * pictured by two captures of its staged runtime, the campus outside and the fab floor inside, shown together.
 */
export const foundryFloorScene = {
  id: 'foundry-floor',
  available: false,
  name: foundryFloor.name,
  href: foundryFloor.sceneRoute,
  assetBase: foundryFloorScenePack.base,
  pack: foundryFloorScenePack,
  poster: foundryFloorPoster.src,
  posterImage: foundryFloorPoster,
  posterWidth: foundryFloorPoster.width,
  posterHeight: foundryFloorPoster.height,
  posterAlt: foundryFloorPoster.alt,
  posterImages: [foundryFloorPoster, foundryFloorCaptures.interior.poster],
  description: foundryFloorPresentation.description,
  links: [
    { label: 'Software notices', path: 'THIRD-PARTY-NOTICES.txt' },
    { label: 'Asset licence', path: 'licenses/ASSET-LICENSE.txt' },
  ] satisfies SceneLink[],
  copy: {
    available: 'Explore the Foundry Floor in your browser.',
    preview: 'Explore opens the Foundry Floor scene.',
    unavailable: 'The browser scene is not part of this build. Explore opens its status.',
    devices: foundryFloorPresentation.loading,
    unavailableTitle: 'The Foundry Floor scene is not part of this build.',
    unavailableBody: 'Its pack page lists the models the scene is built from.',
    errorText:
      'The scene could not load. Check your connection and try Explore again. The Foundry Floor pack page remains available.',
  } satisfies SceneCopy,
  fallback: { href: foundryFloor.packRoute, label: 'View the Foundry Floor pack' },
} as const;

export const scenes = {
  farm: farmScene,
  'golden-gate': goldenGateScene,
  'foundry-floor': foundryFloorScene,
} as const;
export type SceneId = keyof typeof scenes;

/** The status panel's link and copy and the error surface's text for a build mode (KILN_SITE_PACKS). */
export function sceneInMode(id: SceneId, packsEnabled: boolean) {
  const scene = scenes[id];
  const preUpload = !packsEnabled && 'preUpload' in scene ? scene.preUpload : undefined;
  return {
    fallback: preUpload?.fallback ?? scene.fallback,
    unavailableBody: preUpload?.unavailableBody ?? scene.copy.unavailableBody,
    errorText: preUpload?.errorText ?? scene.copy.errorText,
  };
}
