import {heroShieldPose} from './hero-shield.mjs';
// Consumer carry targets use the existing hand and shield mounting frames.
// Keep the blade low and angled away from the legs, not pointed into the ground.
export function heroExplorationPose(T,actor){
 const up=new T.Vector3(0,1,0);
 return {sword:{w:new T.Vector3(-.36,.92,.10),q:new T.Quaternion().setFromUnitVectors(up,new T.Vector3(-.30,-.58,.76).normalize())},shield:heroShieldPose(T,actor,false)};
}
