import { describe, expect, test } from 'bun:test';
import { WebIO, type Node as GltfNode } from '@gltf-transform/core';
import * as THREE from 'three';

import { readSemanticMetadataV1FromExtras, stampSemanticMetadataV1 } from '../../contracts';
import { renderSceneToGLB } from '../../render';
import { hideArchitectureRoofInScene, selectArchitectureRoofNodes } from '../architecture';

const semantic = (node: THREE.Object3D, role: string): THREE.Object3D =>
  stampSemanticMetadataV1(node, { roles: [role] });

describe('semantic architecture roof selection', () => {
  test('lifts every semantic roof subtree and no non-roof sibling', () => {
    const root = new THREE.Group();
    const roof = semantic(new THREE.Group(), 'roof.assembly');
    roof.name = 'CopperCap';
    const slope = semantic(new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2)), 'roof.slope.positive');
    slope.name = 'SlopeWithoutLegacyName';
    roof.add(slope);
    const wall = semantic(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1)), 'wall.front');
    wall.name = 'RoofDecoration';
    root.add(roof, wall);

    const selection = hideArchitectureRoofInScene(root);
    expect(selection.mode).toBe('semantic');
    expect(selection.nodes).toEqual([roof]);
    expect(roof.visible).toBe(false);
    expect(slope.visible).toBe(false);
    expect(wall.visible).toBe(true);
  });

  test('uses narrow legacy names only when semantic roles are absent', () => {
    const root = new THREE.Group();
    const roof = new THREE.Group();
    roof.name = 'Roof';
    roof.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1)));
    const rooftopGarden = new THREE.Group();
    rooftopGarden.name = 'RooftopGarden';
    root.add(roof, rooftopGarden);

    const selection = selectArchitectureRoofNodes(root);
    expect(selection.mode).toBe('legacy-name');
    expect(selection.nodes).toEqual([roof]);
  });

  test('semantic roles suppress legacy fallback so unrelated named nodes remain', () => {
    const root = new THREE.Group();
    const semanticSlope = semantic(new THREE.Group(), 'roof.slope.negative');
    semanticSlope.name = 'CapB';
    const legacy = new THREE.Group();
    legacy.name = 'Roof_OldCopy';
    root.add(semanticSlope, legacy);

    const selection = selectArchitectureRoofNodes(root);
    expect(selection.mode).toBe('semantic');
    expect(selection.nodes).toEqual([semanticSlope]);
  });

  test('selects and lifts the semantic roof after final GLB export and reload', async () => {
    const source = new THREE.Group();
    source.name = 'ExportedShell';
    const roof = semantic(new THREE.Group(), 'roof.assembly');
    roof.name = 'CopperCap';
    const slope = semantic(
      new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 2), new THREE.MeshStandardMaterial()),
      'roof.slope.positive',
    );
    slope.name = 'SlopePositive';
    roof.add(slope);
    const wall = semantic(
      new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.1), new THREE.MeshStandardMaterial()),
      'wall.front',
    );
    wall.name = 'WallFront';
    const opening = semantic(new THREE.Object3D(), 'opening.front.door');
    opening.name = 'Opening_front_door';
    opening.position.set(1.5, 1, 0);
    opening.scale.set(0.15, 2, 1);
    source.add(roof, wall, opening);

    const rendered = await renderSceneToGLB(source, { optimize: 'full' });
    expect(rendered.optimize?.mode).toBe('full');
    const document = await new WebIO().readBinary(rendered.bytes);
    const reloadedOpening = document
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === 'Opening_front_door');
    expect(readSemanticMetadataV1FromExtras(reloadedOpening!.getExtras())?.roles).toEqual([
      'opening.front.door',
    ]);
    expect(reloadedOpening?.getTranslation()).toEqual([1.5, 1, 0]);
    expect(reloadedOpening?.getScale()).toEqual([0.15, 2, 1]);
    const adapt = (node: GltfNode): Record<string, unknown> => ({
      name: node.getName(),
      visible: true,
      userData: node.getExtras(),
      children: node.listChildren().map(adapt),
    });
    const reloaded = {
      name: 'ReloadedScene',
      visible: true,
      userData: {},
      children: document.getRoot().listScenes()[0]!.listChildren().map(adapt),
    };
    const selection = hideArchitectureRoofInScene(reloaded);
    expect(selection.mode).toBe('semantic');
    expect(selection.nodes.map((node) => node.name)).toEqual(['CopperCap']);
    expect(selection.nodes[0]?.visible).toBe(false);
    const reloadedWall = (reloaded.children as Array<Record<string, unknown>>)
      .flatMap(function flatten(node): Array<Record<string, unknown>> {
        return [
          node,
          ...((node.children as Array<Record<string, unknown>> | undefined)?.flatMap(flatten) ??
            []),
        ];
      })
      .find((node) => node.name === 'WallFront');
    expect(reloadedWall?.visible).toBe(true);
  });
});
