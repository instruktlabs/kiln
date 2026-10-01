import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { createAssetIntentV1, stampSemanticMetadataV1 } from '../contracts';
import { createClip, rotationTrack, scaleTrack } from '../primitives';
import { renderSceneToGLB } from '../render';
import { bindLegacyFixtureRequirements } from '../__tests__/helpers/requirements-fixture';
import {
  analyzeAssetScopeObservationV1,
  analyzeModularEvidenceV1,
  analyzeVfxArtifactEvidenceV1,
} from './breadth-evidence';
import { analyzeFinalVfxGlbBytesV1 } from './breadth-final';
import { AssetQaBlockedError, DETERMINISTIC_QA_REGISTRY, runDeterministicSceneQa } from './run';

function vfxScene(material: THREE.Material, actualCameraFacing = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'SmokeBillboard';
  const card = actualCameraFacing
    ? new THREE.Sprite(material as THREE.SpriteMaterial)
    : new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  card.name = 'SmokeCard';
  stampSemanticMetadataV1(card, {
    roles: ['vfx.effect.surface.card', 'vfx.facing.camera-y-axis', 'vfx.normal.+x'],
  });
  root.add(card);
  // A self-report must never override analyzed materials/clips.
  root.userData.kilnVfxEvidence = {
    schemaVersion: 1,
    materials: [{ id: 'forged', alphaMode: 'opaque', alphaData: false }],
  };
  return root;
}

function loopClip(end = 0): THREE.AnimationClip {
  return new THREE.AnimationClip('SmokeLoop', 1, [
    new THREE.NumberKeyframeTrack('SmokeCard.scale[x]', [0, 0.5, 1], [0, 1, end]),
  ]);
}

function exportableLoopClip(): THREE.AnimationClip {
  return new THREE.AnimationClip('SmokeLoop', 1, [
    new THREE.VectorKeyframeTrack(
      'SmokeCard.scale',
      [0, 0.5, 1],
      [1, 1, 1, 1.25, 1.25, 1.25, 1, 1, 1],
    ),
  ]);
}

function addOpaqueEmitterSupport(root: THREE.Group): void {
  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: '#333333' }),
  );
  support.name = 'EmitterSupport';
  support.material.name = 'OpaqueEmitter';
  stampSemanticMetadataV1(support, { roles: ['vfx.support.emitter'] });
  root.add(support);
}

function vfxIntent() {
  return createAssetIntentV1({
    category: 'vfx',
    subtype: 'billboard',
    vfx: {
      transparency: 'blend',
      doubleSided: true,
      facing: { source: 'explicit', mode: 'camera-spherical', normalAxis: '+X' },
      animation: {
        playback: 'loop',
        durationSeconds: 1,
        endpointBehavior: 'matchStart',
        driver: 'clip',
        clipName: 'SmokeLoop',
      },
    },
  });
}

function modularScene(offset = 0): THREE.Group {
  const root = new THREE.Group();
  root.name = 'WallKit';
  root.userData.kilnModularGrid = [99, 99, 99];
  const material = new THREE.MeshStandardMaterial({ color: '#888888' });
  const pieceA = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), material);
  pieceA.name = 'WallA';
  stampSemanticMetadataV1(pieceA, {
    roles: ['modular.piece.a'],
    frames: [{ id: 'socket.east', translation: [1, 0, 0], rotation: [0, 0, 0, 1] }],
    sockets: [
      {
        id: 'wall-a.east',
        type: 'wall.edge.east',
        frame: 'socket.east',
        compatibleTypes: ['wall.edge.west'],
        allowedRotationsDegrees: [0, 90, 180, 270],
      },
    ],
  });
  const pieceB = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), material);
  pieceB.name = 'WallB';
  pieceB.position.x = 2 + offset;
  stampSemanticMetadataV1(pieceB, {
    roles: ['modular.piece.b'],
    frames: [{ id: 'socket.west', translation: [-1, 0, 0], rotation: [0, 1, 0, 0] }],
    sockets: [
      {
        id: 'wall-b.west',
        type: 'wall.edge.west',
        frame: 'socket.west',
        compatibleTypes: ['wall.edge.east'],
        allowedRotationsDegrees: [0, 90, 180, 270],
      },
    ],
  });
  root.add(pieceA, pieceB);
  return root;
}

describe('W7 engine-derived QA evidence', () => {
  test('VFX exact evidence comes from actual materials and clips, never scene self-report', () => {
    const material = new THREE.SpriteMaterial({
      color: '#aabbcc',
      transparent: true,
      opacity: 0.5,
    });
    material.side = THREE.DoubleSide;
    material.name = 'SmokeBlend';
    const root = vfxScene(material);
    const clip = loopClip();
    const evidence = analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, root, [clip]);
    expect(evidence.materials).toEqual([
      expect.objectContaining({
        id: 'SmokeBlend',
        alphaMode: 'blend',
        alphaData: true,
        doubleSided: true,
      }),
    ]);
    expect(evidence.clips).toEqual([{ name: 'SmokeLoop', durationSeconds: 1 }]);
    expect(evidence.animation).toMatchObject({
      playback: 'loop',
      driver: 'clip',
      endpointMatches: true,
    });
    const report = runDeterministicSceneQa({ intent: vfxIntent(), scene: root, clips: [clip] });
    expect(report.disposition).not.toBe('block');
    expect(
      Object.values(report.dimensions)
        .flatMap((dimension) => dimension.findings)
        .map((finding) => finding.code),
    ).not.toContain('VFX_TRANSPARENCY_MODE_MISMATCH');
  });

  test('actual opaque material and non-loop clip block despite forged passing metadata', () => {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      side: THREE.FrontSide,
    });
    const report = runDeterministicSceneQa({
      intent: vfxIntent(),
      scene: vfxScene(material, false),
      clips: [loopClip(2)],
    });
    const codes = Object.values(report.dimensions)
      .flatMap((dimension) => dimension.findings)
      .map((finding) => finding.code);
    expect(report.disposition).toBe('block');
    expect(codes).toEqual(
      expect.arrayContaining([
        'VFX_TRANSPARENCY_MODE_MISMATCH',
        'VFX_ALPHA_DATA_MISSING',
        'VFX_SIDEDNESS_MISMATCH',
        'VFX_ANIMATION_POLICY_MISMATCH',
        'VFX_LOOP_ENDPOINT_MISMATCH',
      ]),
    );
  });

  test('scope observation is derived from real members and dressing nodes', () => {
    const root = modularScene();
    const dressing = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.1, 4),
      new THREE.MeshStandardMaterial(),
    );
    dressing.name = 'DioramaDisplayPlate';
    root.add(dressing);
    expect(analyzeAssetScopeObservationV1(root)).toEqual({
      topLevelAssetRoots: 2,
      reusableMemberCount: 2,
      sceneDressingRoles: ['name:DioramaDisplayPlate'],
    });
    const report = runDeterministicSceneQa({
      intent: createAssetIntentV1({
        category: 'prop',
        scope: { scope: 'single', explicit: true },
      }),
      scene: root,
    });
    const finding = report.dimensions.promptAlignment.findings.find((value) =>
      value.code.startsWith('ASSET_SCOPE_'),
    );
    expect(finding).toMatchObject({
      code: 'ASSET_SCOPE_EXPLICIT_SINGLE_CLUSTER',
      disposition: 'observe',
    });
  });

  test('MOD-001 consumes actual semantic socket/grid measurements in the production registry', () => {
    const intent = createAssetIntentV1({
      category: 'environment',
      subtype: 'modular-wall',
      scope: { scope: 'modularSet', explicit: true },
    });
    const analyzed = analyzeModularEvidenceV1(modularScene(), intent.modular!.grid);
    expect(analyzed.kit).toMatchObject({ schemaVersion: 1, units: 'm', grid: [1, 1, 1] });
    expect(analyzed.join).toMatchObject({
      aSocketId: 'wall-a.east',
      bSocketId: 'wall-b.west',
      aWorldPosition: [1, 0, 0],
      bWorldPosition: [1, 0, 0],
    });
    expect(runDeterministicSceneQa({ intent, scene: modularScene() }).disposition).not.toBe(
      'block',
    );
    const failed = runDeterministicSceneQa({ intent, scene: modularScene(0.1) });
    const codes = Object.values(failed.dimensions)
      .flatMap((dimension) => dimension.findings)
      .map((finding) => finding.code);
    expect(failed.disposition).toBe('block');
    expect(codes).toEqual(expect.arrayContaining(['MOD_GRID_MISALIGNED', 'MOD_JOIN_SEAM']));
  });

  test('fake sidecar/userData and semantic facing roles cannot satisfy exact VFX evidence', () => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { kilnTimeSeconds: { value: 0 } },
    });
    material.opacity = 0.5;
    material.userData.kilnVfxSidecar = {
      kind: 'tsl',
      id: 'kiln.vfx.runtime-shader.tsl.v1',
      version: '1.0.0',
    };
    material.userData.kilnVfxDurationSeconds = 1;
    material.userData.kilnVfxEndpointMatches = true;
    const root = vfxScene(material, false);
    root.userData.kilnVfxSidecar = material.userData.kilnVfxSidecar;
    const intent = createAssetIntentV1({ category: 'vfx', subtype: 'runtimeShader' });
    const evidence = analyzeVfxArtifactEvidenceV1(intent.vfx!, root, []);
    expect(evidence.sidecar).toBeUndefined();
    expect(evidence.facing.mode).toBe('fixed');
    expect(evidence.animation).toMatchObject({ durationSeconds: 0, endpointMatches: false });
    const report = runDeterministicSceneQa({ intent, scene: root });
    const codes = Object.values(report.dimensions)
      .flatMap((dimension) => dimension.findings)
      .map((finding) => finding.code);
    expect(codes).toContain('VFX_SIDECAR_IDENTITY_MISMATCH');
  });

  test('an eased loop matches its start on key values, whatever its end tangents', () => {
    const material = new THREE.SpriteMaterial({ transparent: true, opacity: 0.5 });
    const pulse = (end: number) =>
      createClip('SmokeLoop', 1, [
        scaleTrack(
          'SmokeCard',
          [
            { time: 0, scale: [1, 1, 1] },
            { time: 0.5, scale: [1.25, 1.25, 1.25] },
            { time: 1, scale: [end, end, end] },
          ],
          'EASE_IN',
        ),
      ]);
    const playback = (end: number) =>
      analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, vfxScene(material), [pulse(end)]).animation;
    expect(playback(1)).toMatchObject({ playback: 'loop', endpointMatches: true });
    expect(playback(1.5)).toMatchObject({ playback: 'oneShot', endpointMatches: false });
  });

  test('hidden subtrees do not alter VFX material or facing evidence', () => {
    const root = vfxScene(new THREE.SpriteMaterial({ transparent: true, opacity: 0.5 }));
    const before = analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, root, [loopClip()]);
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial()));
    root.add(hidden);
    expect(analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, root, [loopClip()])).toEqual(before);
  });

  test('quaternion loop endpoints compare orientations including q and minus q', () => {
    const material = new THREE.SpriteMaterial({ transparent: true, opacity: 0.5 });
    for (const interpolation of ['LINEAR', 'EASE_IN_OUT', 'CUBICSPLINE'] as const) {
      for (const end of [360, 300]) {
        const clip = createClip('Spin', 3, [
          rotationTrack(
            'SmokeCard',
            [0, 120, 240, end].map((degrees, time) => ({
              time,
              rotation: [0, degrees, 0] as [number, number, number],
            })),
            interpolation,
          ),
        ]);
        const evidence = analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, vfxScene(material), [clip]);
        expect(evidence.animation).toMatchObject({
          endpointMatches: end === 360,
          playback: end === 360 ? 'loop' : 'oneShot',
        });
      }
    }
  });

  test('dedicated alphaMap is actual alpha evidence even without raw RGBA pixels', () => {
    const material = new THREE.SpriteMaterial({ transparent: true, opacity: 1 });
    material.side = THREE.DoubleSide;
    material.alphaMap = new THREE.Texture({ width: 2, height: 2 });
    const evidence = analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, vfxScene(material), [
      loopClip(),
    ]);
    expect(evidence.materials[0]).toMatchObject({ alphaMode: 'blend', alphaData: true });
  });

  test('render path exports Sprite as a semantic quad and re-proves exact final-byte parity', async () => {
    const material = new THREE.SpriteMaterial({
      color: '#aabbcc',
      transparent: true,
      opacity: 0.5,
    });
    material.side = THREE.DoubleSide;
    material.name = 'SmokeBlend';
    const clip = exportableLoopClip();
    const root = vfxScene(material);
    addOpaqueEmitterSupport(root);
    const sceneEvidence = analyzeVfxArtifactEvidenceV1(vfxIntent().vfx!, root, [clip]);
    expect(sceneEvidence.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'SmokeBlend', effectSurface: true, alphaMode: 'blend' }),
        expect.objectContaining({ id: 'OpaqueEmitter', effectSurface: false, alphaMode: 'opaque' }),
      ]),
    );
    expect(
      runDeterministicSceneQa({ intent: vfxIntent(), scene: root, clips: [clip] }).disposition,
    ).not.toBe('block');
    const rendered = await renderSceneToGLB(root, {
      requirements: bindLegacyFixtureRequirements(vfxIntent()),
      clips: [clip],
    });
    const finalEvidence = await analyzeFinalVfxGlbBytesV1(rendered.bytes);
    expect(rendered.tris).toBe(finalEvidence.triangleCount);
    expect(finalEvidence).toMatchObject({
      facingSemantics: ['camera-spherical'],
      clips: [{ name: 'SmokeLoop', durationSeconds: 1 }],
    });
    expect(finalEvidence.meshCount).toBe(2);
    expect(finalEvidence.primitiveCount).toBe(2);
    expect(finalEvidence.triangleCount).toBeGreaterThan(2);
    expect(finalEvidence.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SmokeBlend',
          effectSurface: true,
          alphaMode: 'blend',
          alphaData: true,
          doubleSided: true,
        }),
        expect.objectContaining({
          id: 'OpaqueEmitter',
          effectSurface: false,
          alphaMode: 'opaque',
        }),
      ]),
    );
    expect(rendered.qaReport.dimensions.exportIntegrity.metrics).toMatchObject({
      finalVfxTriangles: finalEvidence.triangleCount,
      finalVfxFacingSemantics: 'camera-spherical',
      finalVfxClipCount: 1,
      finalVfxEffectMaterialCount: 1,
    });
  });

  test('final-byte QA blocks a standalone alphaMap that the GLB bridge cannot pack', async () => {
    const material = new THREE.SpriteMaterial({ transparent: true, opacity: 1 });
    material.side = THREE.DoubleSide;
    material.alphaMap = new THREE.Texture({ width: 2, height: 2 });
    try {
      await renderSceneToGLB(vfxScene(material), {
        requirements: bindLegacyFixtureRequirements(vfxIntent()),
        clips: [exportableLoopClip()],
      });
      throw new Error('expected final-byte VFX QA to block');
    } catch (error) {
      expect(error).toBeInstanceOf(AssetQaBlockedError);
      expect((error as AssetQaBlockedError).stage).toBe('final-glb');
      const codes = Object.values((error as AssetQaBlockedError).report.dimensions)
        .flatMap((dimension) => dimension.findings)
        .map((finding) => finding.code);
      expect(codes).toContain('VFX_GLTF_ALPHA_DATA_MISSING');
    }
  });

  test('final-byte VFX-003 remeasures an explicit beam normal and direction', async () => {
    const material = new THREE.MeshStandardMaterial({
      color: '#66ccff',
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    material.name = 'BeamBlend';
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), material);
    beam.name = 'BeamSurface';
    stampSemanticMetadataV1(beam, { roles: ['vfx.effect.surface.beam'] });
    const root = new THREE.Group();
    root.name = 'BeamRoot';
    root.add(beam);
    const intent = createAssetIntentV1({
      category: 'vfx',
      subtype: 'beam',
      vfx: {
        facing: {
          source: 'explicit',
          mode: 'fixed',
          normalAxis: '+Y',
          directionAxis: '+X',
        },
      },
    });
    const rendered = await renderSceneToGLB(root, {
      requirements: bindLegacyFixtureRequirements(intent),
    });
    const evidence = await analyzeFinalVfxGlbBytesV1(rendered.bytes);
    expect(evidence).toMatchObject({ normalAxis: '+Y', directionAxis: '+X' });
    expect(rendered.qaReport.disposition).not.toBe('block');
    expect(rendered.qaReport.dimensions.exportIntegrity.metrics).toMatchObject({
      finalVfxNormalAxis: '+Y',
      finalVfxDirectionAxis: '+X',
    });
  });

  test('inferred modular scope never enables exact MOD blockers', () => {
    const intent = createAssetIntentV1({ category: 'environment', subtype: 'modular-wall' });
    expect(intent.scope).toEqual({ schemaVersion: 1, scope: 'modularSet', explicit: false });
    const report = runDeterministicSceneQa({ intent, scene: modularScene(0.1) });
    const modularFindings = Object.values(report.dimensions)
      .flatMap((dimension) => dimension.findings)
      .filter((finding) => finding.code.startsWith('MOD_'));
    expect(modularFindings).toEqual([]);
  });

  test('registers prop, environment, VFX, modular, and scope production rules', () => {
    expect(DETERMINISTIC_QA_REGISTRY.list().map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        'PROP_CAPABILITY_EXACT_PROFILE',
        'PROP_ADVISORY_PROFILE',
        'ENVIRONMENT_EXACT_PROFILE',
        'ENVIRONMENT_ADVISORY_PROFILE',
        'VFX_EXACT_PROFILE',
        'VFX_ADVISORY_PROFILE',
        'MODULAR_JOIN_PROFILE',
        'ASSET_SCOPE_PROFILE',
      ]),
    );
    // T4.3 added the first REF_* rule. This assertion used to say no such rule
    // existed; it is kept as a positive statement of the same fact rather than
    // deleted, so the registry's contents stay accounted for.
    const reference = DETERMINISTIC_QA_REGISTRY.list().filter((rule) => rule.id.startsWith('REF_'));
    expect(reference.map((rule) => rule.id)).toEqual(['REF_COMPARISON']);
    expect(reference[0]?.defaultMode).toBe('observe');
  });
});
