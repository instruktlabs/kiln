// SPDX-License-Identifier: MIT
// The twin's truth is data (owner direction D-21): layout, rail graph, route, tools and the sim config live in
// data/*.json with their basis labels and are staged beside the scene so another engine can read the same
// files. This module types them and reads them for Node tools and tests (FAB_DATA); the page takes the same files
// from the pack (config.ts, fabDataFromPack) and never references FAB_DATA, so the bundle carries only sim-config.
import layoutJson from '../../data/layout.json';
import railGraphJson from '../../data/rail-graph.json';
import routeJson from '../../data/route.json';
import toolsJson from '../../data/tools.json';
import { SIM_CONFIG } from './config';
import type { FloorConfig } from './floor-transport';

export type Vec3 = [number, number, number];

export interface GraphNodeData { id: string; kind: string; position: Vec3 }
export interface LineGeometry { type: 'line'; from: Vec3; to: Vec3 }
export interface ArcGeometry { type: 'arc'; center: Vec3; radius: number; startDeg: number; sweepDeg: number }
export type EdgeKind = 'straight' | 'curve' | 'switch-main' | 'switch-branch';
export interface GraphEdgeData {
  id: string; from: string; to: string; length: number; speed: number; kind: EdgeKind; piece: string;
  switch?: string; spine: boolean; geometry: LineGeometry | ArcGeometry;
}
export type PlaceKind = 'load' | 'stocker' | 'uts';
export interface GraphPortData { id: string; kind: PlaceKind; owner: string; node: string; seat: Vec3; hoistM: number; side: string; heading: Vec3 }
export interface RailPieceData { id: string; type: 'straight' | 'curve' | 'switch'; position: Vec3; yaw: number; length?: number; scaleX?: number; reversed?: boolean; use?: string; hide?: string[] }
export interface RailGraphData {
  schema: string; datumY: number;
  nodes: GraphNodeData[]; edges: GraphEdgeData[]; ports: GraphPortData[]; pieces: RailPieceData[];
}

export interface Reliability { mtbfH: number; mttrH: number; pmEveryH: number; pmLengthH: number }
export interface GroupData {
  label: string; routeFamilies: string[]; toolType: string; installed: number; accent: string; batch?: boolean;
  processMinPerLot: number; processMsPerLot: number; reliability: Reliability;
}
export interface ToolData { id: string; type: string; group: string; bay: string; side: string; position: Vec3; yaw: number; ports: string[]; scheduled: boolean; cell?: string }
export interface CellData { id: string; group: string; track: string; scanner: string }
export interface StockerData { id: string; position: Vec3; yaw: number; ports: string[]; manualPort: string; slots: number; usableSlots: number }
export interface UtsData { id: string; rail: string; position: Vec3; seats: string[] }
export interface FurnaceBatchData { maxLots: number; minLots: number; oldestWaitH: number; cycleH: number; handlingMin: number; internalBuffer: number; portTransferS: number }
export interface ToolsData {
  wafersPerLot: number;
  groups: Record<string, GroupData>;
  familyToGroup: Record<string, string>;
  furnaceBatch: FurnaceBatchData;
  engineering: { afterPmQualificationMin: number };
  tools: ToolData[]; cells: CellData[]; stockers: StockerData[]; uts: UtsData[];
}

export type RouteStep = [family: string, module: number, loop: number];
export interface RouteModule { index: number; name: string; loops: number; families: string[]; steps: number }
export interface RouteData { steps: number; route: RouteStep[]; rawProcessHours: number; passes: Record<string, number>; modules: RouteModule[] }

export interface LayoutPort { id: string; locator: string; mount?: Vec3; seat: Vec3; innerSeat?: Vec3; facing?: Vec3 }
export interface Box3Data { min: Vec3; max: Vec3 }
export interface KeepOutData extends Box3Data { why: string }
export interface LayoutTool {
  id: string; type: string; entity: string; group: string; bay: string; side: string; position: Vec3; yaw: number; size: Vec3;
  /** Measured local bounds (data/assets.json), the world box of the body and the world keep-outs (clip sweeps, review clearances). */
  bounds: Box3Data; footprint: Box3Data; keepOut: KeepOutData[];
  ports: LayoutPort[]; signalTowerMount: Vec3; accent: string; scheduled: boolean; cell?: string; variant?: string; interface?: { name: string; position: Vec3 };
}
export interface LayoutStocker { id: string; entity: string; position: Vec3; yaw: number; size: Vec3; footprint: Box3Data; facing: Vec3; ports: LayoutPort[]; manualPort: LayoutPort; signalTowerMount: Vec3 }
export interface LayoutUts { id: string; entity: string; rail: string; position: Vec3; yaw: number; size: Vec3; seats: LayoutPort[] }
export interface CameraPose { position: Vec3; target: Vec3; fov: number; label?: string; note?: string }
export interface Placement { id: string; position: Vec3; yaw: number }
export type WallVariant = 'solid' | 'glazed' | 'glazedAmber' | 'door';
export interface WalkData {
  eyeY: number; speed: number; runSpeed: number; radius: number;
  areas: { id: string; x: [number, number]; z: [number, number] }[];
  edges: { id: string; from: [number, number]; to: [number, number]; note?: string }[];
  start: { position: Vec3; yawDeg: number };
  walker: { widthM: number; note: string };
  paths: { id: string; from: [number, number]; to: [number, number] }[];
}
export interface RobotPlacement { id: string; position: Vec3; yaw: number; footprint: Box3Data; station: string; port: string }
export interface FloorRobotsData {
  stations: { id: string; port: string; tool: string; arm: Omit<RobotPlacement, 'station' | 'port'>; amr: Omit<RobotPlacement, 'station' | 'port'>;
    handoff: { seat: Vec3; deckPose: Vec3; foupFlangeAtDeckUp: Vec3; errorM: number } }[];
  arms: RobotPlacement[]; amrs: RobotPlacement[];
}
export interface ServicePointData { at: Vec3; yaw: number; path: [number, number][]; lengthM: number; via?: string }
export interface PeopleData { door: { panel: string; position: Vec3; inside: Vec3 }; spineZ: number; serviceOutM: number; targets: Record<string, ServicePointData> }
export const VIEW_NAMES = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const;
export type NamedView = typeof VIEW_NAMES[number];
export interface LayoutData {
  scene: { x: [number, number]; z: [number, number] };
  cleanroom: { x: [number, number]; z: [number, number]; moduleSize: number; grid: [number, number] };
  heights: Record<string, number>;
  floorModules: { x: [number, number]; z: [number, number]; moduleSize: number; grid: [number, number] };
  ceilingModules: { x: [number, number]; z: [number, number]; moduleSize: number; grid: [number, number]; ffuFaceY: number };
  lithoZone: { amberCeiling: { x: [number, number]; z: [number, number] }; partitions: { x: number; z: [number, number]; panels: number }[] };
  walls: {
    panelWidth: number; height: number; thickness: number; north: { z: number; x: [number, number] }; west: { x: number; z: [number, number] }; south: { z: number; x: [number, number] };
    door: { openingWidth: number }; panels: (Placement & { run: string; variant: WallVariant; scale?: Vec3 })[]; posts: { id: string; position: Vec3 }[];
  };
  installZone: { bay: string; x: [number, number]; z: [number, number] };
  gallery: {
    x: [number, number]; z: [number, number]; segments: number; segmentWidth: number; yaw: number; handrailY: number; top: number; drop: number;
    segmentPlacements: Placement[]; landing: { x: [number, number]; z: [number, number]; handrailY: number };
  };
  sectionCut: {
    x: number; moduleOriginX: number; modules: number; moduleWidth: number; centresZ: number[];
    /** One per module; `variant` is the asset map's withShaft or withoutShaft (where the spine's east U-turn needs the space). */
    modulePlacements: (Placement & { variant: string; note?: string })[];
    /** Section-module parts standing in the clean room (the return-air shafts), world boxes: tool rows and the walker keep clear. */
    obstacles: (Box3Data & { id: string })[];
    /** Boxes closing the open row ends below the clean-room floor and above the FFU face. */
    endWalls: (Box3Data & { id: string })[];
    /** The kit zone of D-42 (module frame): the module's own zone enlarged in the layout to take the accepted subfab kit
     *  as built, the kit's pose in every module, and how far the kit reaches past the section plane. */
    kitZone: {
      decision: string; zone: Box3Data; moduleZone: Box3Data | null; mount: Vec3; pose: { x: number; z: number; yaw: number; frame: string };
      kitSize: Vec3; kitBox: Box3Data; fits: boolean; pastSectionPlaneM: number; clearanceM: number; note: string;
    };
    /** One kit per section module, at the kitZone pose. */
    subfabKits: (Placement & { module: string; footprint: Box3Data; toolAbove: { point: Vec3; tool: string | null; distanceM: number | null } })[];
  };
  floorRobots: FloorRobotsData;
  people: PeopleData;
  levels: Record<string, [number, number]>;
  loadPort: { entity: string; bounds: Box3Data; seat: Vec3 };
  bays: { id: string; x: [number, number]; z: [number, number]; xc: number; loop: boolean; contents: string }[];
  tools: LayoutTool[]; stockers: LayoutStocker[]; uts: LayoutUts[];
  stockerSlots: { rackX: [number, number]; z0: number; dz: number; columns: number; y0: number; dy: number; levels: number; innerSeatX: number; innerSeatY: number; passThroughM: number };
  cameras: Record<NamedView, CameraPose> & { walk: WalkData; tour: TourData };
}
/** What a tour stop shows: the fab at a glance, the vehicle fleet, one tool or stocker's panel, the fab's output, or the
 *  tools by E10 state. Every line is derived from the twin's state. */
export type TourLines = 'fab' | 'fleet' | 'tool' | 'stocker' | 'outputs' | 'tools';
export interface TourLegData { from: NamedView; to: NamedView; kind: 'cut' | 'fly'; via?: Vec3[]; note?: string }
export interface TourFeatureData { subject: string; lines: TourLines; anchor: Vec3; note?: string }
export interface TourData {
  stops: NamedView[]; legSeconds: number; holdSeconds: number;
  /** A cut fades to black, jumps and fades back in over this time. */
  cutSeconds: number;
  /** Average speed along a fly leg; a leg lasts at least legSeconds. */
  flySpeedMps: number;
  /** Corners of a fly path round off over this distance. */
  filletM: number;
  /** The tour widens the vertical field of view on narrow screens so the horizontal one stays at least this. */
  minHorizontalFovDeg: number;
  legs: TourLegData[];
  features: Record<string, TourFeatureData>;
}

type Labelled = { value: number; basis: string };
export interface SimConfig {
  floorTransport?: FloorConfig;
  clock: { hashIntervalMs: number };
  starts: { waferStartsPerMonth: Labelled & { sourced?: Labelled }; wafersPerLot: number; monthDays: number; releaseHours: number[]; conwipCap: number; lotClasses: { hot: number; engineering: number } };
  shipping: { dwellMs: number };
  modes: {
    default: string;
    pilot: { label: string; vehicles: number };
    megafab: { label: string; vehicles: number; synthetic: number; syntheticCap: number; maxVehicles: number; foupInstances: number; syntheticLabel: string };
  };
  scales: { values: number[]; labels: string[]; wallDeltaCapMs: number; oneShotMinWallMs: number; loopWallSpeed: number; pulseFromScale: number };
  vehicle: {
    straightMps: Labelled; curveMps: number; switchMps: number; idleSpineMps: number; accel: number; decel: number; lengthM: number; gapM: number;
    authorityChunkM: number; idleAuthorityChunkM: number; followLookaheadM: number;
    handoff: HandoffTiming; utsHandoff: HandoffTiming;
  };
  dispatch: { utsUpstreamSlackS: number; switchPenaltyS: number; rules: string[]; criticalRatioDueDays: number };
  ports: { dockMs: number; openMs: number; closeMs: number; undockMs: number };
  stocker: { passThroughMs: number; passThroughM: number; craneTravelMps: number; craneLiftMps: number; forkMs: number; usableSlots: number };
  seeds: { default: number; snapshots: number[] };
  warmup: { days: number; budgetMs: number };
  tuning: { nonScheduled: string[]; mttrScale: number };
  movers: { classes: MoverClassConfig[] };
}
/** A mover class the scene draws from twin state (sim-config movers): its asset-map entity, the twin source of its
 *  poses, what it carries and on which locator, and the clip names its driver uses. */
export interface MoverClassConfig {
  id: string; kind?: 'people' | 'floor-robot'; entity: string; source: string; carries?: string; carryLocator?: string; carryLocators?: string[];
  /** People classes: the service-visit kinds (sim/service.ts) this class draws; none means it draws no visits. */
  visits?: ('repair' | 'pm' | 'qualification')[];
  targets?: string; walkSpeedMps?: number; walkDesignSpeedMps?: number; clips: Record<string, string>; note?: string;
}
export interface HandoffTiming { e84Ms: number; hoistDownMs: number; gripMs: number; hoistUpMs: number; e84DoneMs: number; totalMs: number }

export interface FabData { layout: LayoutData; graph: RailGraphData; route: RouteData; tools: ToolsData; config: SimConfig }

export const FAB_DATA: FabData = {
  layout: layoutJson as unknown as LayoutData,
  graph: railGraphJson as unknown as RailGraphData,
  route: routeJson as unknown as RouteData,
  tools: toolsJson as unknown as ToolsData,
  config: SIM_CONFIG,
};

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
