/** Farm values copied from INVENTORY appendix A; source data remains sealed. */
export const FARMER_NAME = 'Rowan';
export const FARM_LOOK = {
  background: 0xc0d6d4, fogNear: 120, fogFar: 220, exposure: .95,
  environmentBlur: .04, environmentIntensity: .65,
  hemisphereSky: 0xffffff, hemisphereGround: 0x747b67, hemisphereIntensity: 1.4,
  sunColor: 0xffffff, sunIntensity: 2.7, sunPosition: [25, 42, 20] as [number, number, number],
  shadowExtent: 44, shadowNear: 1, shadowFar: 115, shadowNormalBias: .018,
  pathColor: 0xe3c6a0,
};
export const FARM_CAMERA = {
  fov: 40, near: .02, far: 250, maxDistance: 160, maxPolar: .495 * Math.PI,
  /** O7 overview zoom floor (the pilot used 0); named review views relax it to their own distance. */
  minDistance: 3, interiorMaxPolar: Math.PI - .02,
  playFov: 58, playMaxPolar: .54 * Math.PI, playOffsetLength: 4.8,
  walkingHeight: .6, drivingHeight: 2.6, walkingTargetHeight: 1.9, drivingTargetHeight: 1.6,
  playMinDistance: 1.6, playMaxDistance: 10,
  /** play.mjs updateCamera: max(.22, hit - .14); Rowan hidden unless the raw hit is beyond 1.25 m. */
  playPad: .14, playMinPull: .22, playHideRay: 1.25,
};
export const FARM_WALK = { radius: .30, height: 1.90, pace: 1.05, runPace: 1.8, gravity: 18, terminal: -10, step: 1 / 120, accumulatorCap: .1, bound: 34.8,
  stepUp: .22, stepProbe: .25, bridgeInset: .3, doorClearance: .01, walkClipPace: .6, walkClipMax: 3, clipSpeedFloor: .05 };
export const FARM_TRACTOR = { topSpeed: 4, reverseSpeed: 1.8, steerMax: .45, wheelbase: 1.75, bound: 33, riverMargin: 1.3, bridgeInset: .92, probeX: .8 };
export const FARM_DOORS = { damp: 7, radius: 2.6, tractorRadius: 2.5 };
export const FARM_GRASS = {
  tufts: 14000, groups: 16, tuftsPerGroup: 875, cellSize: 18, sphereGrowth: 1,
  palette: { dark: '#405f37', light: '#819c58', surround: '#768751', wornEarth: '#b99b72', sunGlow: '#c6b96a' },
  tipGold: .06, windReach: .18,
};
export const FARM_HERD = {
  cow: { period: 30, walk: 9, radius: .85, speed: .20 },
  sheep: { period: 22, walk: 11, radius: .65, speed: .20 },
  chicken: { period: 8, walk: 3.5, radius: .35, speed: .24 },
};
export const FARM_DESTINATIONS = {
  yard: { position: [4.7, 0, -7], yaw: Math.PI * .22 },
  house: { position: [12.0, .4, -14], yaw: Math.PI },
  barn: { position: [-6.435, 0, -11], yaw: Math.PI / 2 },
  mill: { position: [29, -.25, -29], yaw: Math.PI },
  tractor: { position: [-3, 0, -5.4], yaw: Math.PI / 2 },
  paddocks: { position: [9.7, 0, 1.1], yaw: -Math.PI / 2 },
  bridge: { position: [19, 0, -22.7], yaw: Math.PI / 2 },
} as const;
export const FARM_STRUCTURE = { batchingCell: 96, batchingOffset: 48, woodlandTrees: 843, woodlandCell: 64, woodlandSourceMeshes: 4, bvhLeafSize: 10, resolvePasses: 3, floorDrop: .35, porchFloorDrop: .25, routeSeconds: 30 };
