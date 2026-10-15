/**
 * Game-delivery roles (delivery contract item 1).
 *
 * Collider proxies, anchors, kit modules and ports travel as plain glTF: semantic roles in
 * node extras, hidden proxy nodes through KHR_node_visibility, and the kit spec as engine
 * extras. The integration manifest lists each with its transform relative to the asset root,
 * and advisory diagnostics name a proxy that draws, leaves the bounds or touches nothing.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  KILN_SEMANTIC_ROLES,
  KILN_SEMANTIC_ROLES_REVISION,
  readSemanticMetadataV1,
} from '../contracts';
import {
  anchor,
  colliderBox,
  colliderCapsule,
  colliderHull,
  defineModule,
  KILN_KIT_KEY,
  port,
} from '../delivery';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import { defineLod } from '../lod';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess } from '../render';

const program = (extra = '') => `const meta={name:'Bunker Frame'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#777777');
  const frame=createPart('Frame',boxGeo(2,3,0.4),m,{parent:root,position:[0,1.5,0]});
  defineModule(root,{footprint:[2,0.4],height:3,snapAxis:'x',origin:'center'});
  port('west',{parent:root,position:[-1,0,0],rotation:[0,180,0]});
  port('east',{parent:root,position:[1,0,0]});
  colliderBox([2,3,0.4],{id:'frame',parent:root,position:[0,1.5,0]});
  colliderBox([0.25,0.25,0.25],{id:'latch',parent:root,position:[0,3,0],rotation:[0,30,0]});
  colliderCapsule(0.15,0.8,{id:'post',parent:root,position:[0.6,2.7,0]});
  colliderHull(frame,{id:'hull'});
  anchor('door','main',{parent:root,position:[0,1,0.25]});
  anchor('light','top',{parent:root,position:[0,2.9,0]});
  const tiers=['Tile_LOD0','Tile_LOD1'].map((name)=>{const g=new THREE.Group();g.name=name;root.add(g);return g;});
  createPart('Tile',boxGeo(0.2,0.2,0.2),m,{parent:tiers[0],position:[0,3.1,0]});
  createPart('Card',planeGeo(0.2,0.2),m,{parent:tiers[1],position:[0,3.1,0]});
  defineLod(tiers,{screenCoverage:[0.2,0],impostor:true});
  ${extra}
  return root;
}`;

const close = (actual: readonly number[], expected: readonly number[], digits = 5) => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, digits);
  });
};

describe('delivery role vocabulary', () => {
  test('adds the delivery roles as revision 2 of the vocabulary', () => {
    expect(KILN_SEMANTIC_ROLES_REVISION).toBe(2);
    expect(KILN_SEMANTIC_ROLES.colliderBox).toBe('collider.box');
    expect(KILN_SEMANTIC_ROLES.colliderCapsule).toBe('collider.capsule');
    expect(KILN_SEMANTIC_ROLES.colliderHull).toBe('collider.hull');
    expect(KILN_SEMANTIC_ROLES.anchor).toBe('anchor');
    expect(KILN_SEMANTIC_ROLES.kitModule).toBe('kit.module');
    expect(KILN_SEMANTIC_ROLES.kitPort).toBe('kit.port');
    expect(KILN_SEMANTIC_ROLES.lodImpostor).toBe('lod.impostor');
  });
});

describe('delivery helpers', () => {
  test('colliderBox is a hidden unit box whose node scale is the size', () => {
    const root = new THREE.Group();
    const box = colliderBox([2, 3, 0.5], { id: 'door', parent: root, position: [1, 2, 3] });
    expect(box.parent).toBe(root);
    expect(box.visible).toBe(false);
    expect(box.name).toBe('Collider_box_door');
    close(box.scale.toArray(), [2, 3, 0.5]);
    close(box.position.toArray(), [1, 2, 3]);
    const geometry = (box as THREE.Mesh).geometry;
    geometry.computeBoundingBox();
    close(geometry.boundingBox!.min.toArray(), [-0.5, -0.5, -0.5]);
    close(geometry.boundingBox!.max.toArray(), [0.5, 0.5, 0.5]);
    expect(readSemanticMetadataV1(box)?.roles).toEqual(['collider.box.door']);
    expect(colliderBox(1, { id: 'cube' }).scale.toArray()).toEqual([1, 1, 1]);
  });

  test('colliderCapsule is a hidden unit capsule scaled to [2r, height, 2r]', () => {
    const capsule = colliderCapsule(0.25, 2, { id: 'pole' }) as THREE.Mesh;
    expect(capsule.visible).toBe(false);
    close(capsule.scale.toArray(), [0.5, 2, 0.5]);
    capsule.geometry.computeBoundingBox();
    close(capsule.geometry.boundingBox!.min.toArray(), [-0.5, -0.5, -0.5]);
    close(capsule.geometry.boundingBox!.max.toArray(), [0.5, 0.5, 0.5]);
    expect(readSemanticMetadataV1(capsule)?.roles).toEqual(['collider.capsule.pole']);
    expect(() => colliderCapsule(1, 1, { id: 'flat' })).toThrow(AuthoringDiagnosticError);
  });

  test('colliderHull wraps a mesh in its convex hull beside it', () => {
    const root = new THREE.Group();
    const part = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 16));
    part.position.set(0, 2, 0);
    root.add(part);
    const hull = colliderHull(part, { id: 'ring' }) as THREE.Mesh;
    expect(hull.parent).toBe(root);
    expect(hull.visible).toBe(false);
    close(hull.position.toArray(), [0, 2, 0]);
    hull.geometry.computeBoundingBox();
    close(hull.geometry.boundingBox!.max.toArray(), [1.2, 1.2, 0.2], 3);
    expect(readSemanticMetadataV1(hull)?.roles).toEqual(['collider.hull.ring']);
  });

  test('anchors and ports are empty named nodes; anchors are hidden', () => {
    const root = new THREE.Group();
    const door = anchor('door', 'main', { parent: root, position: [0, 1, 0] });
    expect(door.name).toBe('Anchor_door_main');
    expect(door.visible).toBe(false);
    expect(door.children).toEqual([]);
    expect(readSemanticMetadataV1(door)?.roles).toEqual(['anchor.door.main']);
    const west = port('west', { parent: root, rotation: [0, 90, 0] });
    expect(west.name).toBe('Port_west');
    expect(west.visible).toBe(true);
    expect(readSemanticMetadataV1(west)?.roles).toEqual(['kit.port.west']);
    expect(() => anchor('door.frame', 'main')).toThrow(AuthoringDiagnosticError);
    expect(() => port('')).toThrow(AuthoringDiagnosticError);
  });

  test('defineModule stamps the role and validated kit extras without losing roles', () => {
    const root = new THREE.Group();
    colliderBox(1, { id: 'a', parent: root });
    expect(
      defineModule(root, { footprint: [4, 2], height: 3, snapAxis: 'x', origin: 'corner' }),
    ).toBe(root);
    expect(KILN_KIT_KEY).toBe('kilnKit');
    expect(root.userData.kilnKit).toEqual({
      schemaVersion: 1,
      footprint: [4, 2],
      height: 3,
      snapAxis: 'x',
      origin: 'corner',
    });
    expect(readSemanticMetadataV1(root)?.roles).toEqual(['kit.module']);
    expect(() =>
      defineModule(root, {
        footprint: [4, 0],
        height: 3,
        snapAxis: 'x',
        origin: 'corner',
      }),
    ).toThrow(AuthoringDiagnosticError);
  });

  test('defineLod({ impostor: true }) gives the last tier the impostor role', () => {
    const tiers = ['A_LOD0', 'A_LOD1', 'A_LOD2'].map((name) => {
      const group = new THREE.Group();
      group.name = name;
      return group;
    });
    defineLod(tiers, { screenCoverage: [0.3, 0.1, 0], impostor: true });
    expect(readSemanticMetadataV1(tiers[2]!)?.roles).toEqual(['lod.impostor']);
    expect(readSemanticMetadataV1(tiers[1]!)).toBeUndefined();
  });

  test('every helper is a sandbox global', () => {
    const globals = buildSandboxGlobals();
    for (const name of [
      'colliderBox',
      'colliderCapsule',
      'colliderHull',
      'anchor',
      'defineModule',
      'port',
    ])
      expect(typeof globals[name]).toBe('function');
  });
});

describe('delivery in the integration manifest', () => {
  for (const gltfExporter of ['legacy', 'three'] as const)
    test(`lists colliders, anchors, the kit and its ports (${gltfExporter})`, async () => {
      const result = await renderGLBInProcess(program(), { gltfExporter });
      const manifest = result.integrationManifest;
      expect(manifest.deliveryDiagnostics).toBeUndefined();
      // Proxies are hidden: the headline counts the frame and the LOD0 tile only.
      expect(manifest.bounds.size[0]).toBeCloseTo(2, 5);
      expect(manifest.colliders?.map((collider) => collider.role)).toEqual([
        'collider.box.frame',
        'collider.box.latch',
        'collider.capsule.post',
        'collider.hull.hull',
      ]);
      const [box, latch, capsule, hull] = manifest.colliders!;
      expect(box!.shape.kind).toBe('box');
      close((box!.shape as { size: number[] }).size, [2, 3, 0.4]);
      close(box!.transform.translation, [0, 1.5, 0]);
      const yaw = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(...latch!.transform.rotation),
      );
      expect(THREE.MathUtils.radToDeg(yaw.y)).toBeCloseTo(30, 4);
      expect(capsule!.shape.kind).toBe('capsule');
      const { radius, height } = capsule!.shape as { radius: number; height: number };
      expect(radius).toBeCloseTo(0.15, 6);
      expect(height).toBeCloseTo(0.8, 6);
      expect(hull!.shape.kind).toBe('hull');
      expect(box!.path).toBe('/Bunker%20Frame[0]/Root[0]/Collider_box_frame[0]');
      expect(manifest.anchors?.map((item) => [item.kind, item.id])).toEqual([
        ['door', 'main'],
        ['light', 'top'],
      ]);
      close(manifest.anchors![0]!.transform.translation, [0, 1, 0.25]);
      expect(manifest.kit).toMatchObject({
        role: 'kit.module',
        path: '/Bunker%20Frame[0]/Root[0]',
        footprint: [2, 0.4],
        height: 3,
        snapAxis: 'x',
        origin: 'center',
      });
      expect(manifest.ports?.map((item) => item.id)).toEqual(['west', 'east']);
      expect(manifest.ports![0]!.module).toBe('/Bunker%20Frame[0]/Root[0]');
      close(manifest.ports![1]!.transform.translation, [1, 0, 0]);
      const chain = manifest.levelsOfDetail![0]!;
      expect(chain.levels.map((level) => level.impostor)).toEqual([undefined, true]);
      // Hidden collider and anchor nodes stay listed with the hidden nodes.
      expect(manifest.hiddenNodes?.map((node) => node.name)).toContain('Collider_box_frame');
      expect(manifest.hiddenNodes?.map((node) => node.name)).toContain('Anchor_door_main');
    });

  test('advisory diagnostics name a drawn proxy, an escaped one, a stray port and a parent anchor', async () => {
    const result = await renderGLBInProcess(
      program(`
  const shown=colliderBox(0.5,{id:'shown',parent:root,position:[0,1.5,0]});
  shown.visible=true;
  colliderBox(0.5,{id:'far',parent:root,position:[9,9,9]});
  colliderBox(0.1,{id:'empty',parent:root,position:[0.8,3.1,0]});
  port('stray',{parent:root,position:[5,0,0]});
  const parentAnchor=anchor('spawn','one',{parent:root});
  parentAnchor.add(new THREE.Object3D());`),
    );
    const codes = (result.integrationManifest.deliveryDiagnostics ?? []).map(
      (finding) => `${finding.code} ${finding.path.split('/').pop()}`,
    );
    expect(codes).toEqual([
      'DELIVERY_COLLIDER_NOT_HIDDEN Collider_box_shown[0]',
      'DELIVERY_COLLIDER_OUTSIDE_BOUNDS Collider_box_far[0]',
      'DELIVERY_COLLIDER_NO_OVERLAP Collider_box_far[0]',
      'DELIVERY_COLLIDER_NO_OVERLAP Collider_box_empty[0]',
      'DELIVERY_PORT_OUTSIDE_FOOTPRINT Port_stray[0]',
      'DELIVERY_ANCHOR_NOT_LEAF Anchor_spawn_one[0]',
    ]);
    // Advisory: the build succeeds, and each finding is also a build warning.
    for (const code of codes) {
      const [name] = code.split(' ');
      expect(result.warnings.some((warning) => warning.startsWith(name!))).toBe(true);
    }
  });
});
