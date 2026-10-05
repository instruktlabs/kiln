// Reuse only the four scene-qualified donor routes. IDs are consumer-owned;
// immutable clips stay keyed to the original early actors and source hashes.
export function createLateMotionBindings(units){
 const recipes=new Map([['ship-0-0',['ship-2-0',-120]],['ship-0-1',['ship-1-0',-120]],['ship-0-2',['ship-2-3',120]],['ship-0-3',['ship-1-3',120]]]);
 if(units.length!==4||new Set(units.map(u=>u.id)).size!==4)throw Error('Invalid late motion units');
 const bindings=units.flatMap(u=>{const recipe=recipes.get(u.id),d=u.derivation;
  if(!recipe||u.sourceUnitId!==recipe[0]||d?.kind!=='world-x-translation-on-qualified-beach'||d.sourceUnitId!==recipe[0]||JSON.stringify(d.worldTranslation)!==JSON.stringify([recipe[1],0,0])||u.routes.length!==28||u.routes.some(r=>r.planId!==recipe[0]+'/'+r.id))throw Error('Invalid late motion derivation');
  return u.routes.map(r=>({id:u.id+'/'+r.id,sourceId:recipe[0]+'/'+r.id,worldTranslation:[recipe[1],0,0]}));
 });
 if(new Set(bindings.map(b=>b.id)).size!==112||new Set(bindings.map(b=>b.sourceId)).size!==112)throw Error('Invalid late motion actor mapping');
 return bindings;
}
