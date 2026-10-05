// Acquisition ownership for scene startup and teardown. Synchronous disposers run
// immediately in reverse order; asynchronous releases are all awaited by close().
export function createResourceScope(){
 const tasks=[],owned=new Set(),errors=[];let closed=false,started=0,completed=0,result=null;
 function defer(cleanup,label='resource'){if(closed)throw Error('Resource scope closed');if(typeof cleanup!=='function')throw Error('Cleanup callback required');tasks.push({cleanup,label});return cleanup;}
 function own(value,cleanup,label='resource'){if(!value)throw Error('Resource required');if(closed)throw Error('Resource scope closed');if(!owned.has(value)){owned.add(value);defer(cleanup,label);}return value;}
 function use(value,label='resource'){if(!value||typeof value.dispose!=='function')throw Error('Disposable resource required');return own(value,()=>value.dispose(),label);}
 function close(){if(result)return result;closed=true;const pending=[];for(const task of tasks.splice(0).reverse()){started++;try{const value=task.cleanup();if(value&&typeof value.then==='function')pending.push(Promise.resolve(value).then(()=>{completed++;},error=>{completed++;errors.push({label:task.label,error});}));else completed++;}catch(error){completed++;errors.push({label:task.label,error});}}
  owned.clear();result=Promise.all(pending).then(()=>{if(errors.length)throw new AggregateError(errors.map(v=>v.error),'Resource cleanup failed: '+errors.map(v=>v.label).join(', '));});return result;}
 async function fail(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],String(error.message||error),{cause:error});}throw error;}
 return {defer,use,own,close,fail,stats:()=>({closed,registered:started+tasks.length,started,completed,errors:errors.map(v=>({label:v.label,message:String(v.error.message||v.error)}))})};
}
export function ownObjectResources(scope,root,label='model'){
 root.traverse(n=>{if(n.geometry)scope.use(n.geometry,label+' geometry');for(const material of Array.isArray(n.material)?n.material:n.material?[n.material]:[]){scope.use(material,label+' material');for(const value of Object.values(material))if(value?.isTexture){scope.use(value,label+' texture');const image=value.source?.data;if(image&&typeof image.close==='function')scope.own(image,()=>image.close(),label+' image');}}});return root;
}
