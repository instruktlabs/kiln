import farm from './packs/farm.json';
import sceneMedia from './scene-media.json';
import scenePacks from './scene-packs.json';

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
 * What the Farm scene page says about phones and tablets (D-11). It is written from the scene's own records: the
 * mobile-play check passes all 16 of its steps on each graphics backend, the tablet's frame-time target holds on a
 * Galaxy Tab S9 FE at the minimal tier, and the tier table starts a phone of the Galaxy S24+ class on high (a mobile
 * browser on WebGL2 starts on minimal, D-03). It names those devices and uses that number and no other; it says plainly
 * that nothing else was measured and promises nothing for it (scripts/scene-copy.test.ts holds it to that).
 */
export const farmTouchCopy = {
  heading: 'Play with touch.',
  intro: 'The controls are made for touch, not drawn as a pad of buttons.',
  controls: [
    'Move with the joystick. When you drive the tractor, push it forward to accelerate and pull it back to brake and, once stopped, to reverse. Push it left or right to steer.',
    'Drag one finger to look around.',
    'Pinch to zoom in and out.',
    'One tap target appears when there is something to do: open a door or gate, drive the tractor or leave it.',
    'You play in third person: the camera follows Rowan on foot and the tractor when you drive it.',
  ],
  qualityHeading: 'Quality follows the device.',
  quality: [
    'The scene chooses a quality tier when it opens. A phone of the Galaxy S24+ class starts on the high tier when its browser uses WebGPU, and on the minimal tier when it falls back to WebGL2. A tablet of the Galaxy Tab S9 FE class starts on the minimal tier on either graphics backend.',
    'The scripted mobile-play check passes all 16 of its steps on each graphics backend, WebGPU and WebGL2, with touch emulation, and the controls were also tried with real touch on a Galaxy Tab S9 FE. On a Galaxy Tab S9 FE, at the minimal tier, the scene meets its frame-time target.',
    'No other phone or tablet has been measured, so nothing is promised for other devices.',
  ],
} as const;

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
  posterWidth: farm.scene.poster.width,
  posterHeight: farm.scene.poster.height,
  posterAlt: 'The Farm scene with barn, farmhouse, fields, animals, woodland and stream',
  description: `A farm arranged from ${farm.assetCount} Kiln assets, with fields, a stream and woodland.`,
  desktop: `The desktop scene download includes ${farm.scene.desktop.map((capability) => capability.charAt(0).toLowerCase() + capability.slice(1)).join(', ')}.`,
  mobile: `In the download, mobile supports ${farm.scene.mobile.join(', ').toLowerCase()} only.`,
  touch: farmTouchCopy,
  exclusions: `${farm.scene.excluded.join(', ').replace(', Mobile', ', mobile').replace(', General', ', general')} are not included.`,
  links: [
    { label: 'Software notices', path: 'THIRD-PARTY-NOTICES.txt' },
    { label: 'Asset licence', path: 'licenses/ASSET-LICENSE.txt' },
  ] satisfies SceneLink[],
  copy: {
    available: 'Explore the Farm in your browser.',
    preview:
      'Explore opens a preview of the rebuilt Farm. It is still being qualified; the scene download remains the current runnable version.',
    unavailable:
      'The browser scene is being rebuilt. Explore opens its current in-production status.',
    devices:
      'Desktop and touch play; the devices measured are listed below. Loads only when you choose Explore.',
    unavailableTitle: 'The interactive Farm is being rebuilt.',
    unavailableBody:
      'This scene is in production. The Farm scene download contains the current runnable scene.',
    errorText:
      'The scene could not load. Check your connection and try Explore again. The Farm downloads remain available.',
  } satisfies SceneCopy,
  fallback: { href: '/packs/farm/', label: 'View the Farm downloads' },
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
    preview:
      'Explore opens a preview of the driving and traffic demonstration. It is still being qualified.',
    unavailable: 'The browser scene is not part of this build. Explore opens its status.',
    devices: 'Load only when you choose Explore.',
    unavailableTitle: 'The interactive bridge scene is not part of this build.',
    unavailableBody: 'The bridge itself is a Kiln-authored asset with its own page and downloads.',
    errorText:
      'The scene could not load. Check your connection and try Explore again. The bridge asset and its downloads remain available.',
  } satisfies SceneCopy,
  fallback: { href: '/gallery/golden-gate-bridge/', label: 'View the bridge asset' },
} as const;

export const scenes = { farm: farmScene, 'golden-gate': goldenGateScene } as const;
export type SceneId = keyof typeof scenes;
