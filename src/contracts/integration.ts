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

/** A chain in a review result: the level it drew in each view. */
export interface ReviewedLevelOfDetailChainV1 extends LevelOfDetailChainV1 {
  /** One entry per view, in view order: 0 when the view drew LOD0, otherwise the lower level
   *  a shot subject named. */
  drawn: number[];
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
  structuralQa: {
    hasDefaultScene: boolean;
    finiteBounds: boolean;
    validatorErrors: number;
    validatorWarnings: number;
  };
  /** Visual composition/usability is deliberately assessed by browser QA, not inferred here. */
  visualQa: 'not_assessed';
}
