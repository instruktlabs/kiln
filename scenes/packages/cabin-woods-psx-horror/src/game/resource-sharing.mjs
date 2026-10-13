// Runtime-only sharing. Canonical files and per-instance material ownership stay intact.
const references=new WeakMap();let serial=0;
function reference(value){if(!references.has(value))references.set(value,++serial);return references.get(value);}
function state(value){
 if(value===null||typeof value!=='object')return typeof value==='function'?['ref',reference(value)]:value;
 if(value.isTexture||value.isNode)return ['ref',reference(value)];
 if(value.toArray)return [value.constructor.name,...value.toArray()];
 if(ArrayBuffer.isView(value))return [value.constructor.name,...value];
 if(Array.isArray(value))return value.map(state);
 if(Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(k=>[k,state(value[k])]));
 return ['ref',reference(value)];
}
export function createTexturePool(){
 const textures=new Map();
 return {intern(texture,contentHash){
  if(!contentHash||texture.constructor.name!=='Texture'||texture.onUpdate||texture.isRenderTargetTexture)return texture;
  const omit=new Set(['id','uuid','name','userData','source','version','_listeners']);
  const key=JSON.stringify([contentHash,Object.fromEntries(Object.keys(texture).sort().filter(k=>!omit.has(k)).map(k=>[k,state(texture[k])]))]);
  const existing=textures.get(key);if(existing)return existing;textures.set(key,texture);return texture;
 }};
}
export function renderMaterialKey(material){
 const omit=new Set(['id','uuid','name','userData','version','_listeners']);
 return JSON.stringify(Object.fromEntries(Object.keys(material).sort().filter(k=>!omit.has(k)).map(k=>[k,state(material[k])])));
}
export async function embeddedImageHashes(buffer){
 const view=new DataView(buffer),jsonLength=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength))),binOffset=20+jsonLength+8;
 return Promise.all((json.images??[]).map(async image=>{
  const bytes=json.bufferViews?.[image.bufferView];if(!bytes||bytes.buffer!==0)return null;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(buffer,binOffset+(bytes.byteOffset??0),bytes.byteLength))),v=>v.toString(16).padStart(2,'0')).join('');
 }));
}
export function shareGltfTextures(gltf,imageHashes,pool){
 const replaced=new Set(),retained=new Set();
 gltf.scene.traverse(node=>{for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){
  for(const [slot,texture] of Object.entries(material))if(texture?.isTexture){
   const association=gltf.parser.associations.get(texture),definition=gltf.parser.json.textures?.[association?.textures];
   const shared=pool.intern(texture,imageHashes[definition?.source]);material[slot]=shared;retained.add(shared);if(shared!==texture)replaced.add(texture);
  }
 }});
 for(const texture of replaced)if(!retained.has(texture))texture.dispose();
}
