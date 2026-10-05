// Anatomy-specific adapter for the separately authored articulated crew variant.
export function setHandClosure(root,amount){
 if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('Invalid hand closure');
 if(!root.getObjectByName('Joint_finger_right_0_0')){if(amount!==1)throw Error('Fixed grip mesh cannot release');return false;}
 for(const side of ['right','left']){
  for(let f=0;f<4;f++)for(let j=0;j<3;j++){const node=root.getObjectByName(`Joint_finger_${side}_${f}_${j}`);if(!node)throw Error('Incomplete finger rig');node.rotation.y=([0,8,10][j]+([65,35,50][j]-[0,8,10][j])*amount)*Math.PI/180;}
  for(let j=0;j<2;j++){const node=root.getObjectByName(`Joint_thumb_${side}_${j}`);if(!node)throw Error('Incomplete thumb rig');node.rotation.y=([15,-15][j]+([-70,-25][j]-[15,-15][j])*amount)*Math.PI/180;}
 }
 return true;
}
