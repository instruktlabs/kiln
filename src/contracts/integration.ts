/** Browser-safe sidecar contract for placing and validating a finished Kiln GLB. */

export const INTEGRATION_ASSET_ROLES = [
  'ground',
  'building',
  'wonder',
  'poi',
  'prop',
  'fill',
  'vehicle',
] as const;

export type IntegrationAssetRole = (typeof INTEGRATION_ASSET_ROLES)[number];

export interface IntegrationBoundsV1 {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
}

/** One level of an `MSFT_lod` chain in the written GLB. */
export interface LevelOfDetailLevelV1 {
  /** 0 is LOD0, the node in the scene; higher numbers are the chain's lower levels in order. */
  level: number;
  name: string;
  /** Inspection path of the level: a shot subject that draws this level in LOD0's place. */
  path: string;
  /** Placed triangles in the level's subtree. */
  triangles: number;
  /** Present on the last level when `defineLod` declared it a card or billboard tier
   *  (`lod.impostor` role on that node). */
  impostor?: true;
}

/** One node `MSFT_lod` chain: LOD0 in the scene and the lower levels it lists. */
export interface LevelOfDetailChainV1 {
  /** Inspection path of the LOD0 node. */
  path: string;
  /** `extras.MSFT_screencoverage` on LOD0, when it is a list of numbers. */
  screenCoverage?: number[];
  /** LOD0 first. */
  levels: LevelOfDetailLevelV1[];
}

/** An outermost node that does not draw (`KHR_node_visibility` `visible: false`). */
export interface HiddenNodeV1 {
  /** Inspection path, as `kiln_inspect` `listParts` lists it. */
  path: string;
  name: string;
  /** Placed triangles in the hidden subtree; not in the headline. */
  triangles: number;
}

/** A chain in a review result: the level it drew in each view. */
export interface ReviewedLevelOfDetailChainV1 extends LevelOfDetailChainV1 {
  /** One entry per view, in view order: 0 when the view drew LOD0, otherwise the lower level
   *  a shot subject named. */
  drawn: number[];
}

/** A node transform relative to the asset root (the default scene), decomposed as glTF TRS. */
export interface DeliveryTransformV1 {
  translation: [number, number, number];
  /** Unit quaternion [x, y, z, w]. A consumer that collides with yaw only reads yaw from it. */
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

/** The resolved shape of a collider proxy, in metres, measured from its transform. */
export type DeliveryColliderShapeV1 =
  | { kind: 'box'; size: [number, number, number] }
  /** `height` is the total end-to-end height along the node's local +Y, caps included. */
  | { kind: 'capsule'; radius: number; height: number }
  | { kind: 'hull'; vertices: number };

/** A hidden collider proxy node (`collider.<shape>.<id>` role). */
export interface DeliveryColliderV1 {
  role: string;
  id: string;
  /** Inspection path, as `kiln_inspect` `listParts` lists it. */
  path: string;
  name: string;
  transform: DeliveryTransformV1;
  shape: DeliveryColliderShapeV1;
}

/** A named point (`anchor.<kind>.<id>` role). */
export interface DeliveryAnchorV1 {
  role: string;
  kind: string;
  id: string;
  path: string;
  name: string;
  transform: DeliveryTransformV1;
}

/** `kilnKit` node extras on a `kit.module` root. Footprint is width along X, depth along Z. */
export interface KitModuleSpecV1 {
  footprint: [number, number];
  height: number;
  snapAxis: 'x' | 'y' | 'z';
  origin: 'corner' | 'center';
}

/** The kit module this GLB delivers (`kit.module` role). */
export interface DeliveryKitModuleV1 extends KitModuleSpecV1 {
  role: string;
  path: string;
  name: string;
  transform: DeliveryTransformV1;
}

/** A snap point (`kit.port.<id>` role). */
export interface DeliveryPortV1 {
  role: string;
  id: string;
  path: string;
  name: string;
  /** Inspection path of the kit module the port belongs to, when it is under one. */
  module?: string;
  transform: DeliveryTransformV1;
}

/** One custom vertex attribute in the written GLB and the meshes that carry it. */
export interface DeliveryVertexAttributeV1 {
  /** glTF attribute name, such as `_EDGE`; three's GLTFLoader lowercases it (`_edge`). */
  name: string;
  /** Inspection paths of the nodes whose mesh carries the attribute with these parameters. */
  meshes: string[];
  /** The bake parameters recorded in mesh extras `kilnSurfaceBakeV1`, when Kiln baked it. */
  params?: Record<string, number>;
}

/** One tier of a declared budget measured against the written GLB. */
export interface BudgetTierV1 {
  /** `LOD0`, `LOD1`, ...: tier n draws level min(n, last) of every chain. */
  tier: string;
  declared: { triangles?: number; draws?: number };
  measured: { triangles: number; draws?: number };
  status: 'pass' | 'fail';
}

/** A `defineBudget` declaration against the bytes. Advisory: never QA acceptance. */
export interface BudgetReportV1 {
  /** `none` when no budget was declared; `fail` when any tier fails. */
  status: 'pass' | 'fail' | 'none';
  tiers: BudgetTierV1[];
}

/** An advisory delivery finding. Never QA acceptance. */
export interface DeliveryDiagnosticV1 {
  code: string;
  path: string;
  message: string;
}

export interface IntegrationManifestV1 {
  schemaVersion: 'kiln.integration-manifest.v1';
  analyzerVersion: 1;
  artifactSha256: string;
  units: 'm';
  axes: { forward: '+X'; up: '+Y'; right: '+Z' };
  bounds: IntegrationBoundsV1;
  pivot: { convention: 'author-origin'; position: [0, 0, 0] };
  ground: {
    groundY: 0;
    contactTolerance: 0.02;
    minY: number;
    offsetToGround: number;
    grounded: boolean;
  };
  defaultScene: { index: number; name: string };
  requestedRole?: IntegrationAssetRole;
  assessedRole?: IntegrationAssetRole;
  renderMetrics: {
    triangles: number;
    drawCalls: number;
    uniqueGeometries: number;
    uniqueMaterials: number;
    textureCount: number;
    transparentMaterials: number;
    skinned: boolean;
  };
  /** Node `MSFT_lod` chains in scene order, when the GLB has any. The bounds and render
   *  metrics above count LOD0 only, which is what a loader without the extension draws. */
  levelsOfDetail?: LevelOfDetailChainV1[];
  /** Outermost hidden nodes in scene order, when the GLB has any. The bounds and render
   *  metrics above count what draws; these triangles are not in them. */
  hiddenNodes?: HiddenNodeV1[];
  /** Collider proxies in scene order, when the GLB has any (additive in analyzer v1). */
  colliders?: DeliveryColliderV1[];
  /** Anchors in scene order, when the GLB has any. */
  anchors?: DeliveryAnchorV1[];
  /** The first kit module, when the GLB has one. */
  kit?: DeliveryKitModuleV1;
  /** Kit ports in scene order, when the GLB has any. */
  ports?: DeliveryPortV1[];
  /** The declared budget measured against these bytes, when source declared one. */
  budget?: BudgetReportV1;
  /** Custom vertex attributes (`_EDGE`, `_CAVITY`) grouped by name and parameters. */
  vertexAttributes?: DeliveryVertexAttributeV1[];
  /** Advisory delivery findings (colliders, anchors, ports), when there are any. */
  deliveryDiagnostics?: DeliveryDiagnosticV1[];
  structuralQa: {
    hasDefaultScene: boolean;
    finiteBounds: boolean;
    validatorErrors: number;
    validatorWarnings: number;
  };
  /** Visual composition/usability is deliberately assessed by browser QA, not inferred here. */
  visualQa: 'not_assessed';
}
