// Existing scene placement rule, shared by rendering and traversal fixtures.
// Foundation material is borrowed; callers own the returned mesh/geometry.
export function createStructureFoundations(T,{buildings,inputs,groundHeight,material}){
 const foundations=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,buildings.length),transform=new T.Object3D();
 for(const [index,p]of buildings.entries()){
  const input=inputs.assets.find(a=>a.slug===p.asset),[w,,d]=input.bounds.size.map(v=>v*p.scale),[x,,z]=p.position;
  const heights=[groundHeight(x-w/2,z-d/2),groundHeight(x+w/2,z-d/2),groundHeight(x-w/2,z+d/2),groundHeight(x+w/2,z+d/2)],top=Math.max(...heights),bottom=Math.min(...heights)-.15;p.position[1]=top;
  transform.position.set(x,(top+bottom)/2,z);transform.scale.set(w,top-bottom,d);transform.updateMatrix();foundations.setMatrixAt(index,transform.matrix);
 }
 foundations.computeBoundingSphere();return foundations;
}
