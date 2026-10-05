// Accept a real ECMAScript parser, rather than matching strings/comments. Keep
// each source module's URL when bundling relocates its executable code.
export function preserveSourceModuleUrl(source,path,parse){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='MemberExpression'&&node.object?.type==='MetaProperty'&&node.object.meta?.name==='import'&&node.object.property?.name==='meta'&&(node.computed?node.property?.type==='Literal'&&node.property.value==='url':node.property?.name==='url'))edits.push([node.start,node.end]);for(const [key,value]of Object.entries(node)){if(['start','end'].includes(key))continue;if(Array.isArray(value))for(const item of value)visit(item);else if(value&&typeof value==='object')visit(value);}}
 visit(tree);let result=source;for(const [start,end]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+`new URL(${JSON.stringify(path)}, document.baseURI).href`+result.slice(end);return result;
}
