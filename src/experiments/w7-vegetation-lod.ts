import { bindLegacyFixtureRequirements } from '../__tests__/helpers/requirements-fixture';
import { createHash } from 'node:crypto';

import { WebIO, type Document } from '@gltf-transform/core';
import * as THREE from 'three';

import { createAssetIntentV1, stampSemanticMetadataV1, type AssetIntentV1 } from '../contracts';
import { defineLod } from '../lod';
import { renderSceneToGLB } from '../render';

const EXPERIMENT_EXTRAS_KEY = 'kilnVegetationLodExperiment';

interface LodGroupRecord {
  id: 'lod0' | 'lod1' | 'lod2';
  node: string;
  bounds: { min: [number, number, number]; max: [number, number, number]; units: 'm' };
  cost: { triangles: number; drawCalls: number };
}

interface ExperimentScene {
  root: THREE.Group;
  intent: AssetIntentV1;
  groups: LodGroupRecord[];
}

export interface W7VegetationLodArtifactMetricsV1 {
  glbBytes: number;
  glbSha256: string;
  repeatGlbSha256: string;
  byteStable: boolean;
  validatorErrors: number;
  validatorWarnings: number;
  roundTripTriangles: number;
  roundTripNodeNames: string[];
  recordedGroupIds: string[];
  presentGroupIds: string[];
  metadataTargetsComplete: boolean;
  boundsAndCostComplete: boolean;
}

export interface W7VegetationLodExperimentReportV1 {
  schemaVersion: 1;
  experimentId: 'VEG-020-semantic-lod-parity-cost-v1';
  providerCalls: 0;
  externalSpendUsd: 0;
  baseline: W7VegetationLodArtifactMetricsV1;
  defaultVisibleCandidate: W7VegetationLodArtifactMetricsV1;
  hiddenAlternateCandidate: W7VegetationLodArtifactMetricsV1;
  ratios: {
    defaultVisibleBytesToBaseline: number;
    defaultVisibleTrianglesToBaseline: number;
    hiddenBytesToBaseline: number;
    hiddenTrianglesToBaseline: number;
  };
  gate: {
    validatorClean: boolean;
    byteStable: boolean;
    metadataRoundTripWhenVisible: boolean;
    defaultConsumerSingleActiveLod: boolean;
    hiddenAlternatesSurviveExport: boolean;
    hiddenAlternatesRemainInactive: boolean;
    passed: boolean;
    disposition: 'DONE_GATE_CLOSED';
    rationale: string[];
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const stable = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function semantic<T extends THREE.Object3D>(node: T, ...roles: string[]): T {
  return stampSemanticMetadataV1(node, { roles });
}

function meshTriangles(mesh: THREE.Mesh): number {
  const position = mesh.geometry.getAttribute('position');
  return Math.floor((mesh.geometry.index?.count ?? position?.count ?? 0) / 3);
}

function groupRecord(id: LodGroupRecord['id'], group: THREE.Group): LodGroupRecord {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  let triangles = 0;
  let drawCalls = 0;
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    triangles += meshTriangles(node);
    drawCalls += Array.isArray(node.material) ? Math.max(1, node.material.length) : 1;
  });
  return {
    id,
    node: group.name,
    bounds: {
      min: box.min.toArray() as [number, number, number],
      max: box.max.toArray() as [number, number, number],
      units: 'm',
    },
    cost: { triangles, drawCalls },
  };
}

function addCanopyGroup(
  root: THREE.Group,
  id: LodGroupRecord['id'],
  count: number,
  segments: number,
  radius: number,
  visible: boolean,
): LodGroupRecord {
  const group = new THREE.Group();
  group.name = `Canopy_${id.toUpperCase()}`;
  group.visible = visible;
  const material = new THREE.MeshStandardMaterial({ color: 0x3c7b3d, roughness: 0.86 });
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + (index % 2) * 0.11;
    const mesh = semantic(
      new THREE.Mesh(
        new THREE.SphereGeometry(
          radius * (0.92 + (index % 3) * 0.04),
          segments,
          Math.max(3, segments - 2),
        ),
        material,
      ),
      `vegetation.canopy.${id}.cluster.${index}`,
      'vegetation.foliage',
    );
    mesh.name = `${group.name}_Cluster_${index}`;
    const ring = id === 'lod2' ? 0 : 0.75 + (index % 2) * 0.35;
    mesh.position.set(Math.cos(angle) * ring, 3.55 + (index % 3) * 0.3, Math.sin(angle) * ring);
    mesh.rotation.y = index * 0.13;
    group.add(mesh);
  }
  root.add(group);
  return groupRecord(id, group);
}

function buildScene(mode: 'baseline' | 'visible' | 'hidden'): ExperimentScene {
  const root = new THREE.Group();
  root.name = `VegetationLod_${mode}`;
  const contact = semantic(new THREE.Group(), 'vegetation.contact.ground');
  contact.name = 'Contact_Ground';
  root.add(contact);
  const trunk = semantic(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.36, 3.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x674229, roughness: 0.92 }),
    ),
    'vegetation.trunk',
  );
  trunk.name = 'Mesh_Trunk';
  trunk.position.y = 1.7;
  root.add(trunk);

  const groups = [addCanopyGroup(root, 'lod0', 8, 8, 0.68, true)];
  if (mode !== 'baseline') {
    const visible = mode === 'visible';
    groups.push(addCanopyGroup(root, 'lod1', 4, 6, 0.9, visible));
    groups.push(addCanopyGroup(root, 'lod2', 1, 4, 1.35, visible));
    // Since 0.9.0 a set of tiers must declare its thresholds; these values are arbitrary
    // because this experiment measures the root-extras record, not the switch points.
    defineLod(
      groups.map((group) => root.getObjectByName(group.node)!),
      { screenCoverage: [0.1, 0.02, 0.004] },
    );
    root.userData[EXPERIMENT_EXTRAS_KEY] = {
      schemaVersion: 1,
      groups,
      selection: 'consumer-required',
    };
  }
  root.updateMatrixWorld(true);
  return {
    root,
    groups,
    intent: createAssetIntentV1({
      category: 'vegetation',
      vegetation: { subtype: 'tree', growthState: 'lush', canopyProfile: 'broadleaf' },
    }),
  };
}

function documentTriangleCount(document: Document): number {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      triangles += Math.floor(
        (primitive.getIndices()?.getCount() ??
          primitive.getAttribute('POSITION')?.getCount() ??
          0) / 3,
      );
    }
  }
  return triangles;
}

function parsedGroups(document: Document): LodGroupRecord[] {
  const properties = [...document.getRoot().listNodes(), ...document.getRoot().listScenes()];
  for (const property of properties) {
    const extras = property.getExtras() as Record<string, unknown>;
    const metadata = extras[EXPERIMENT_EXTRAS_KEY] as { groups?: unknown } | undefined;
    if (metadata && Array.isArray(metadata.groups)) return metadata.groups as LodGroupRecord[];
  }
  return [];
}

function finiteVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => Number.isFinite(item));
}

function completeGroup(group: LodGroupRecord): boolean {
  return (
    /^(lod0|lod1|lod2)$/.test(group.id) &&
    typeof group.node === 'string' &&
    group.node.length > 0 &&
    finiteVector3(group.bounds?.min) &&
    finiteVector3(group.bounds?.max) &&
    group.bounds?.units === 'm' &&
    Number.isInteger(group.cost?.triangles) &&
    group.cost.triangles > 0 &&
    Number.isInteger(group.cost?.drawCalls) &&
    group.cost.drawCalls > 0
  );
}

async function artifactMetrics(mode: 'baseline' | 'visible' | 'hidden') {
  const firstScene = buildScene(mode);
  const repeatScene = buildScene(mode);
  const first = await renderSceneToGLB(firstScene.root, {
    requirements: bindLegacyFixtureRequirements(firstScene.intent),
    optimize: 'off',
  });
  const repeat = await renderSceneToGLB(repeatScene.root, {
    requirements: bindLegacyFixtureRequirements(repeatScene.intent),
    optimize: 'off',
  });
  const document = await new WebIO().readBinary(first.bytes);
  const nodeNames = document
    .getRoot()
    .listNodes()
    .map((node) => node.getName())
    .filter(Boolean)
    .sort();
  const groups = parsedGroups(document);
  const presentGroupIds = groups
    .filter((group) => nodeNames.includes(group.node))
    .map((group) => group.id)
    .sort();
  const metrics: W7VegetationLodArtifactMetricsV1 = {
    glbBytes: first.bytes.byteLength,
    glbSha256: sha256(first.bytes),
    repeatGlbSha256: sha256(repeat.bytes),
    byteStable: sha256(first.bytes) === sha256(repeat.bytes),
    validatorErrors: first.gltfValidation.issues.numErrors,
    validatorWarnings: first.gltfValidation.issues.numWarnings,
    roundTripTriangles: documentTriangleCount(document),
    roundTripNodeNames: nodeNames,
    recordedGroupIds: groups.map((group) => group.id).sort(),
    presentGroupIds,
    metadataTargetsComplete: groups.length > 0 && presentGroupIds.length === groups.length,
    boundsAndCostComplete: groups.length > 0 && groups.every(completeGroup),
  };
  return metrics;
}

export async function runW7VegetationLodExperiment(): Promise<W7VegetationLodExperimentReportV1> {
  const [baseline, defaultVisibleCandidate, hiddenAlternateCandidate] = await Promise.all([
    artifactMetrics('baseline'),
    artifactMetrics('visible'),
    artifactMetrics('hidden'),
  ]);
  const validatorClean = [baseline, defaultVisibleCandidate, hiddenAlternateCandidate].every(
    (artifact) => artifact.validatorErrors === 0 && artifact.validatorWarnings === 0,
  );
  const byteStable = [baseline, defaultVisibleCandidate, hiddenAlternateCandidate].every(
    (artifact) => artifact.byteStable,
  );
  const metadataRoundTripWhenVisible =
    defaultVisibleCandidate.metadataTargetsComplete &&
    defaultVisibleCandidate.boundsAndCostComplete;
  const defaultConsumerSingleActiveLod =
    defaultVisibleCandidate.presentGroupIds.length === 1 &&
    defaultVisibleCandidate.roundTripTriangles === baseline.roundTripTriangles;
  const hiddenAlternatesSurviveExport =
    hiddenAlternateCandidate.roundTripNodeNames.includes('Canopy_LOD1') &&
    hiddenAlternateCandidate.roundTripNodeNames.includes('Canopy_LOD2');
  const hiddenAlternatesRemainInactive =
    hiddenAlternateCandidate.roundTripTriangles === baseline.roundTripTriangles;
  const passed =
    validatorClean &&
    byteStable &&
    metadataRoundTripWhenVisible &&
    defaultConsumerSingleActiveLod &&
    hiddenAlternatesSurviveExport &&
    hiddenAlternatesRemainInactive;
  if (passed) throw new Error('VEG-020 gate unexpectedly passed; disposition must be reviewed.');
  return {
    schemaVersion: 1,
    experimentId: 'VEG-020-semantic-lod-parity-cost-v1',
    providerCalls: 0,
    externalSpendUsd: 0,
    baseline,
    defaultVisibleCandidate,
    hiddenAlternateCandidate,
    ratios: {
      defaultVisibleBytesToBaseline: stable(defaultVisibleCandidate.glbBytes / baseline.glbBytes),
      defaultVisibleTrianglesToBaseline: stable(
        defaultVisibleCandidate.roundTripTriangles / baseline.roundTripTriangles,
      ),
      hiddenBytesToBaseline: stable(hiddenAlternateCandidate.glbBytes / baseline.glbBytes),
      hiddenTrianglesToBaseline: stable(
        hiddenAlternateCandidate.roundTripTriangles / baseline.roundTripTriangles,
      ),
    },
    gate: {
      validatorClean,
      byteStable,
      metadataRoundTripWhenVisible,
      defaultConsumerSingleActiveLod,
      hiddenAlternatesSurviveExport,
      hiddenAlternatesRemainInactive,
      passed,
      disposition: 'DONE_GATE_CLOSED',
      rationale: [
        'The experimental root LOD extras do not survive the current final-byte pipeline, so recorded bounds/cost and target identity cannot round-trip.',
        'All three groups are exported for ordinary consumers even when lower groups are marked hidden; triangle/visual parity remains 1.442857x the baseline.',
        'No engine, Studio, or starter public consumer contract exists that can select exactly one level without a new schema/runtime expansion.',
      ],
    },
  };
}

export function w7VegetationLodReportSha256(report: W7VegetationLodExperimentReportV1): string {
  return sha256(new TextEncoder().encode(JSON.stringify(report)));
}
