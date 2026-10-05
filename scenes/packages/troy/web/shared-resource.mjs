// The owner closes the pool; each consumer independently releases its lease.
export function createSharedResource(factory,dispose){
 let resource=null,references=0,closed=false,allocations=0,disposals=0;
 const collect=()=>{if(closed&&references===0&&resource!==null){const value=resource;resource=null;dispose(value);disposals++;}};
 return {acquire(){if(closed)throw Error('Resource pool closed');if(resource===null){resource=factory();if(resource==null)throw Error('Resource factory returned nothing');allocations++;}references++;let released=false;return {resource,release(){if(released)return;released=true;references--;collect();}};},close(){closed=true;collect();},stats:()=>({references,closed,allocations,disposals,live:resource!==null})};
}
