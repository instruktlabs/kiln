// SPDX-License-Identifier: MIT
// The campus driving data (FF-C1 item 5, D-21): the types of data/driving.json (`foundry-floor.campus-driving/1`), read
// by the exterior as pack data `driving` and by the drive check (scripts/drive-check.ts) from disk. Pure: no three,
// React or DOM. The values follow the Golden Gate driving model's (packages/golden-gate/data/driving.json and
// traffic.json); the file's conventions say where the campus differs and why.
export const DRIVING_SCHEMA = 'foundry-floor.campus-driving/1';
/** The pack data entry holding data/driving.json. */
export const DRIVING_DATA_ID = 'driving';
export const VEHICLE_TYPES = ['sedan', 'hatchback', 'suv', 'pickup', 'box-truck', 'transit-bus'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];
/** The pack model id of a vehicle (scripts/stage-campus.ts). */
export const vehicleModelId = (type: VehicleType) => `vehicle-${type}`;

export type Pair = [number, number];
export interface PaintEntry { name: string; weight: number; srgb: [number, number, number] }
export type LampKind = 'head' | 'tail' | 'brake';
export interface DrivingControls { throttle: string[]; reverse: string[]; left: string[]; right: string[]; brake: string[]; handbrake: string[]; turnAround: string[]; enterOrLeave: string[]; leave: string[]; boost?:string[] }
export interface ChaseData { distance: number; height: number; targetHeight: number; lookAhead: number; fov: number; fovAtTopSpeed: number; positionLag: number; yawLag: number; zoom: Pair; zoomRate: number; near: number }
export interface FlowData {
  seed: number; random: 'mulberry32'; stepsPerSecond: number;
  /** Lateral acceleration traffic holds on the fillets and the ring (m/s^2), and the deceleration it plans with. */
  lateralAccel: number; planDecel: number;
  vehicles: Record<VehicleType, { weight: number; lanes: number[] }>;
  /** Optional articulated/rigid freight classes; geometry and coupling dimensions come from their GLBs. */
  freight?: { name: string; tractor: string; trailer?: string; weight: number; lanes: number[] }[];
  palette: PaintEntry[];
  paint: { material: string; untinted: string[]; brightnessJitter: number; avoidRadius: number; attempts: number };
  minHeadway: number;
  /** Vehicles fade in and out over this length at the lane ends (inside roads.split.dissolve). */
  fade: number;
  speed: { personal: number; oscillation: number; oscillationPeriod: Pair };
  idm: { accel: number; brake: number; headway: number; gap: number; emergency: number };
  brakeLights: { decel: number; rate: number };
  /** Peak opacity of the soft contact shadow under each vehicle at LOD0 and LOD1 (the exterior has no shadow map). */
  contactShadow: number;
}
export interface LampData { materials: Record<string, LampKind>; gain: Record<LampKind, Pair>; brakeOff: number; taillightPeak: number; day: number }
export interface DrivingData {
  schema: typeof DRIVING_SCHEMA;
  conventions: Record<string, string>;
  vehicle: VehicleType; paint: string;
  /** A lane id of data/campus.json, the preferred u, the window searched for a free spot, and the rolling speed. */
  start: { lane: string; u: number; window: Pair; speed: number };
  topSpeed: number; accel: number;
  /** Optional driver boost; traffic and the fab twin retain their original parameters. */
  boost?: { topSpeedMultiplier: number; accelMultiplier: number };
  reverse: { accel: number; maxSpeed: number; afterStopSeconds: number };
  brake: number; handbrake: number;
  coast: { constant: number; quadratic: number };
  steer: { wheelDeg: Pair; lateralAccel: number; rateDegPerSecond: number };
  curb: { clearance: number; speedKept: number; cooldown: number; bumpDeg: number };
  traffic: { minGap: number; followGain: number; lateralMargin: number; longitudinalMargin: number; range: number };
  roadEnd: { promptDistance: number; stopDistance: number; fadeSeconds: number; holdSeconds: number };
  controls: DrivingControls;
  chase: ChaseData;
  flow: FlowData;
  /** Parked freight footprint centres in campus x/z metres, heading radians; apron length/width in metres. */
  freightParking?: { name: string; x: number; z: number; heading: number; apron:[number,number] }[];
  lamps: LampData;
}

export function parseDriving(input: ArrayBuffer | Uint8Array | string): DrivingData {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const data = JSON.parse(text) as DrivingData;
  const fail = (why: string) => { throw new Error(`driving data: ${why}`); };
  if (data.schema !== DRIVING_SCHEMA) fail(`schema ${String(data.schema)}, expected ${DRIVING_SCHEMA}`);
  if (data.boost && (![data.boost.topSpeedMultiplier,data.boost.accelMultiplier].every(n=>Number.isFinite(n)&&n>=1&&n<=2))) fail('boost multipliers must be finite and between 1 and 2');
  if (!VEHICLE_TYPES.includes(data.vehicle)) fail(`vehicle ${String(data.vehicle)} is not one of ${VEHICLE_TYPES.join(', ')}`);
  if (!data.flow.palette.some(p => p.name === data.paint)) fail(`paint ${data.paint} is not a palette colour`);
  for (const type of VEHICLE_TYPES) {
    const row = data.flow.vehicles[type];
    if (!row || !(row.weight >= 0) || !row.lanes.length) fail(`flow.vehicles.${type} needs a weight and at least one lane`);
  }
  const freightNames = new Set<string>();
  for (const row of data.flow.freight ?? []) {
    if (!row.name || freightNames.has(row.name) || !(row.weight > 0) || !row.tractor || !row.lanes.length || row.lanes.some(n => !Number.isInteger(n) || n < 0 || n > 3)) fail('flow.freight needs unique names, positive weights, models and lane indices 0..3');
    freightNames.add(row.name);
  }
  for (const row of data.freightParking ?? []) if (!freightNames.has(row.name) || ![row.x,row.z,row.heading].every(Number.isFinite)||!Array.isArray(row.apron)||row.apron.length!==2||!row.apron.every(n=>Number.isFinite(n)&&n>0)) fail('freightParking needs a declared freight class, finite pose and positive apron dimensions');
  if (!(data.flow.fade > 0)) fail('flow.fade must be positive');
  if (!(data.start.window[0] <= data.start.u && data.start.u <= data.start.window[1])) fail('start.u must lie inside start.window');
  if (!(data.steer.wheelDeg[0] > 0 && data.steer.lateralAccel > 0)) fail('steer needs a wheel angle and a lateral acceleration');
  return data;
}

/** sRGB byte to linear. */
export function srgbByteToLinear(c: number): number { const v = c / 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
/** Linear paint of a palette entry by name (the driven car's colour). */
export function paintLinear(data: DrivingData, name: string): [number, number, number] {
  const entry = data.flow.palette.find(p => p.name === name) ?? data.flow.palette[0]!;
  return [srgbByteToLinear(entry.srgb[0]), srgbByteToLinear(entry.srgb[1]), srgbByteToLinear(entry.srgb[2])];
}
/** Mulberry32, the seeded generator Golden Gate's traffic uses (same seed, same sequence). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
