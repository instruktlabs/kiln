const allowed=new Set(['KeyW','KeyA','KeyS','KeyD','Space']);
export function createFightInput(){const keyboard=new Set(),pointers=new Map();let generation=0;const held=key=>keyboard.has(key)||[...pointers.values()].some(p=>p.key===key);return{
 key(code,down){if(!allowed.has(code))return;if(typeof down!=='boolean')throw Error('Boolean key state required');if(down)keyboard.add(code);else keyboard.delete(code);},
 pointer(id,key){if(!allowed.has(key))throw Error('Unsupported held combat action');const token=++generation;pointers.set(id,{key,token});return token;},
 release(id,token){if(pointers.get(id)?.token===token)pointers.delete(id);},
 value:()=>({forward:Number(held('KeyW'))-Number(held('KeyS')),right:Number(held('KeyD'))-Number(held('KeyA')),block:held('Space')}),
 clear(){keyboard.clear();pointers.clear();},stats:()=>({keyboard:[...keyboard],pointerOwners:pointers.size})};}
