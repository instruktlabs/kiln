import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, SphereGeometry, Vector3 } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';

/** Source plan: nave piers at x=48-k*6.6, z=±6.5; 3.6m pews face the sanctuary (-X). */
export const PEW_PLACEMENTS = Array.from({ length: 11 }, (_, bay) => {
  const middle = 48 - (bay + .5) * 6.6;
  return [-.9, .9].flatMap(offset => [-1, 1].map(side => ({
    x: middle + offset, y: .06, z: side * 3.3, rotation: Math.PI,
  })));
}).flat();

/** A suspended rood above the altar, facing the congregation along +X. */
export function buildCrucifixPlacements(asset: Object3D, cathedral: Object3D): Group {
  const root = new Group(); root.name = 'SanctuaryCrucifixAndWallCrosses';
  const principal = asset.clone(true);
  principal.name = 'PrincipalCrucifix';
  // The standing base is a runtime derivative only. The suppedaneum supports the
  // corpus's feet and belongs to the crucifix, so it stays with the original mesh.
  principal.getObjectByName('Mesh_Cross_BaseMoulding')?.removeFromParent();
  principal.position.set(-56.4, 5.3, 0);
  principal.scale.setScalar(1.6);
  root.add(principal);
  root.add(buildCrucifixSuspension(principal, cathedral));
  for (const side of [-1, 1]) {
    const wall = new Group(); wall.name = side > 0 ? 'NorthWallCross' : 'SouthWallCross';
    // Reuse the authored post/beam alone, preserving their complete source transform.
    const copy = asset.clone(true);
    copy.traverse(node => {
      if ('isMesh' in node && node.isMesh) node.visible = node.name === 'Mesh_Cross_Post' || node.name === 'Mesh_Cross_Beam';
    });
    // Prune the hidden corpus, halo, nails and footrest from this runtime derivative.
    const remove: Object3D[] = [];
    copy.traverse(node => { if ('isMesh' in node && node.isMesh && !node.visible) remove.push(node); });
    remove.forEach(node => node.removeFromParent());
    wall.add(copy);
    // The post's authored back is x=-.105. At .6 scale it meets the z=±13.1 inner wall.
    // The inter-window stone strip clears both glazing and the lower blind arcade.
    wall.position.set(21.6, 5.2, side * 13.038);
    wall.rotation.y = side * Math.PI / 2;
    wall.scale.setScalar(.6);
    root.add(wall);
  }
  return root;
}

/** Resolve both ends against the actual timber and vault triangles once at setup. */
function buildCrucifixSuspension(principal: Object3D, cathedral: Object3D): Group {
  const root = new Group(); root.name = 'CrucifixSuspension';
  principal.updateWorldMatrix(true, true);
  cathedral.updateWorldMatrix(true, true);
  const beam = principal.getObjectByName('Mesh_Cross_Beam') as Mesh | undefined;
  if (!beam?.isMesh) throw new Error('Suspended crucifix requires its authored cross beam.');
  const vaults: Mesh[] = [];
  cathedral.traverse(node => {
    if ((node as Mesh).isMesh && /^Mesh_ChoirVault\d+_Stone$/.test(node.name)) vaults.push(node as Mesh);
  });
  const bounds = new Box3().setFromObject(beam, true), center = bounds.getCenter(new Vector3());
  const up = new Vector3(0, 1, 0), down = new Vector3(0, -1, 0);
  const attachments = [-1, 1].map(side => {
    const z = center.z + side * (bounds.max.z - bounds.min.z) * .37;
    const lower = new Raycaster(new Vector3(center.x, bounds.max.y + .1, z), down, 0, .5)
      .intersectObject(beam, false)[0];
    if (!lower) throw new Error('Crucifix suspension could not contact the cross beam.');
    const upper = new Raycaster(lower.point.clone().addScaledVector(up, .1), up, 0, 60)
      .intersectObjects(vaults, false)[0];
    if (!upper) throw new Error('Crucifix suspension could not contact a choir vault.');
    return { side, lower: lower.point, upper: upper.point, upperPart: upper.object.name };
  });
  const owned = (name: string, geometry: BufferGeometry, position: Vector3) => {
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0x34332f, metalness: .7, roughness: .55 }));
    mesh.name = name; mesh.position.copy(position);
    // Each support owns its geometry/material; buildSquare releases them after
    // restoring the static merge. Borrowed GLB meshes keep their existing owner.
    mesh.userData.squareOwned = true;
    root.add(mesh);
    return mesh;
  };
  for (const { side, lower, upper, upperPart } of attachments) {
    const name = `CrucifixSuspension_${side > 0 ? 'N' : 'S'}`;
    const delta = upper.clone().sub(lower), length = delta.length();
    const cable = owned(`${name}_Cable`, new CylinderGeometry(.009, .009, length, 6), lower.clone().lerp(upper, .5));
    cable.quaternion.setFromUnitVectors(up, delta.normalize());
    cable.userData.suspension = { lower: lower.toArray(), upper: upper.toArray(), lowerPart: beam.name, upperPart };
    // Small metal fixing heads straddle the measured contact surfaces so the
    // cable is visibly joined to the beam and socketed into the masonry above.
    owned(`${name}_BeamFixing`, new SphereGeometry(.034, 10, 6), lower);
    owned(`${name}_VaultFixing`, new SphereGeometry(.065, 10, 6), upper);
  }
  return root;
}

export function buildPewPlacements(asset: Object3D): Group {
  const root = new Group(); root.name = 'NaveSeating';
  PEW_PLACEMENTS.forEach((place, i) => {
    const pew = asset.clone(true); pew.name = `NavePew_${i + 1}`;
    pew.position.set(place.x, place.y, place.z);
    pew.rotation.y = place.rotation;
    root.add(pew);
  });
  return root;
}
