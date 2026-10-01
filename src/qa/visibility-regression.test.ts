import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createAssetIntentV1, stampSemanticMetadataV1 } from '../contracts';
import { evaluatePropArticulationQa } from './prop';
import { inspectSceneStructure } from '../render';

test('structural advisories exclude hidden meshes, ancestors and descendants from visible bounds', () => {
  for (const nesting of ['sibling', 'group', 'child'] as const) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.8));
    body.name = 'Body';
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    hidden.name = 'Hidden';
    hidden.position.z = 100;
    root.add(body);
    if (nesting === 'group') {
      const ancestor = new THREE.Group();
      ancestor.visible = false;
      ancestor.add(hidden);
      root.add(ancestor);
    } else {
      hidden.visible = false;
      (nesting === 'child' ? body : root).add(hidden);
    }
    expect(inspectSceneStructure(root, { category: 'vehicle' })).toEqual([]);
  }
});

test('hidden blockers and hidden ancestors do not occupy articulation clearance', () => {
  for (const hiddenAncestor of [false, true]) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.8));
    body.name = 'Body';
    body.position.set(-1.2, 0.4, 0);
    const pivot = new THREE.Group();
    pivot.name = 'Joint_Lid';
    stampSemanticMetadataV1(pivot, {
      roles: ['prop.pivot.hinge.lid'],
      frames: [{ id: 'axis.+x', translation: [0, 0, 0], rotation: [0, 0, 0, 1] }],
    });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.5));
    lid.name = 'Lid';
    lid.position.y = 0.2;
    stampSemanticMetadataV1(lid, { roles: ['prop.motion.hinge.lid'] });
    pivot.add(lid);
    const clearance = new THREE.Group();
    clearance.name = 'LidSweep';
    clearance.position.y = 0.6;
    stampSemanticMetadataV1(clearance, { roles: ['prop.clearance.hinge.lid'] });
    root.add(body, pivot, clearance);
    const filler = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3));
    filler.name = 'HiddenFiller';
    filler.position.y = 0.6;
    const hidden = hiddenAncestor ? new THREE.Group() : filler;
    if (hiddenAncestor) hidden.add(filler);
    hidden.visible = false;
    root.add(hidden);
    const context = {
      scene: root,
      clips: [],
      intent: createAssetIntentV1({ category: 'prop', capabilities: ['articulated'] }),
    };
    expect(evaluatePropArticulationQa(context)).toEqual([]);
    hidden.visible = true;
    expect(evaluatePropArticulationQa(context).map((f) => f.code)).toContain(
      'PROP_ARTICULATION_CLEARANCE_BLOCKED',
    );
  }
});
