import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltf = await new GLTFLoader().loadAsync('mech.glb');
scene.add(gltf.scene);

const mech = gltf.scene.getObjectByName('HeavyWalkerMech');
const mixer = new THREE.AnimationMixer(mech);
mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Walk')).play();

const { walkSpeedMps } = mech.userData.rig;
const waist = mech.getObjectByName('Joint_Waist');
const barrels = mech.getObjectByName('Joint_CannonSpin_R');
const coils = new Set();
mech.traverse((node) => {
  if (node.material?.name === 'Glow_RailCoil') coils.add(node.material);
});

// Once a frame. Walk plays in place, so your game moves the body.
function update(dt, { aim = 0, spin = 0, charge = 2.2 } = {}) {
  mixer.update(dt);
  waist.rotateY(aim); // Walk sets the waist, so add your aim after the mixer.
  barrels.rotateX(spin * dt); // Walk leaves the barrels, wrist and hatches to you.
  for (const coil of coils) coil.emissiveIntensity = charge;
  gltf.scene.translateX(walkSpeedMps * dt); // +X is forward.
}

// Pose the legs yourself and the pistons need aiming again.
// Each one stores what it follows.
const pistons = [];
mech.traverse((node) => {
  if (node.userData.aimAt) pistons.push(node);
});
function aimPistons() {
  mech.updateMatrixWorld(true);
  for (const piston of pistons) {
    const target = mech.getObjectByName(piston.userData.aimAt).getWorldPosition(new THREE.Vector3());
    const direction = piston.parent.worldToLocal(target).sub(piston.position).normalize();
    piston.quaternion.setFromUnitVectors(new THREE.Vector3().fromArray(piston.userData.aimRestDir), direction);
  }
}
