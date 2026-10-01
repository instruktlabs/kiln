import ts from 'typescript';
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const fileOf = name => {
  if (!/^assets\/[A-Za-z0-9_-]+\.js$/.test(name)) throw new Error('Unsafe runtime receipt chunk name');
  return name.slice(7);
};
function importsOf(file, code) {
  const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(source.parseDiagnostics.length) throw new Error(`Cannot parse runtime imports: ${file}`);
  const fixed=new Set(),dynamic=new Set();
  const add=(node,set)=>{
    if (!node || !ts.isStringLiteralLike(node)) return;
    if (!/^\.\/[A-Za-z0-9_-]+\.js$/.test(node.text)) throw new Error(`Unexpected runtime import ${node.text}`);
    set.add(node.text.slice(2));
  };
  const walk=node=>{
    if(ts.isImportDeclaration(node) || ts.isExportDeclaration(node))add(node.moduleSpecifier,fixed);
    if(ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword)add(node.arguments[0],dynamic);
    ts.forEachChild(node,walk);
  };
  walk(source); return {fixed:[...fixed],dynamic:[...dynamic]};
}
/** Verify FF3's explicit initial campus closure against every delivered chunk and its actual import statements. */
export async function measureInitialLoad({receipt,chunks,code,packRelease=receipt.release}) {
  if(receipt.mode!=='public' || !['ff3','ff3-review2'].includes(receipt.release) || !Array.isArray(receipt.chunks) || !Array.isArray(receipt.initialChunks))throw new Error('Expected a public FF3 initial-load receipt');
  if(receipt.release!==packRelease)throw new Error('Initial-load receipt names a different scene pack release');
  const records=receipt.chunks.map(record=>({...record,file:fileOf(record.name)}));
  if(new Set(records.map(c=>c.file)).size!==records.length || !same(records.map(c=>c.file),chunks.map(c=>c.file)))throw new Error('Initial-load chunk inventory differs from delivered files');
  const parsed=new Map();
  for(const record of records){
    const actual=chunks.find(chunk=>chunk.file===record.file);
    if(['bytes','gzipBytes','sha256'].some(key=>actual[key]!==record[key]))throw new Error(`Initial-load pin differs: ${record.file}`);
    if(!['startup','exterior','interior'].includes(record.role) || !['entry','dynamic entry','shared'].includes(record.kind))throw new Error('Unknown initial-load chunk role');
    const imports=importsOf(record.file,code[record.file]);parsed.set(record.file,imports);
    if(!Array.isArray(record.imports) || !same(record.imports.map(fileOf),imports.fixed))throw new Error(`Recorded static imports differ: ${record.file}`);
    if([...imports.fixed,...imports.dynamic].some(file=>!records.some(c=>c.file===file)))throw new Error('Runtime imports an unrecorded chunk');
  }
  const startup=records.filter(c=>c.kind==='entry');
  if(startup.length!==1 || startup[0].role!=='startup' || !startup[0].file.startsWith('index-'))throw new Error('Expected one startup entry');
  const closure=new Set();
  const add=file=>{if(closure.has(file))return;closure.add(file);for(const dependency of parsed.get(file).fixed)add(dependency);};
  for(const record of records.filter(c=>c.role==='startup'||c.role==='exterior'))add(record.file);
  if(!same([...closure],receipt.initialChunks.map(fileOf)) || records.some(c=>c.role==='interior' && closure.has(c.file)))throw new Error('Initial campus static closure differs');
  const deferred=records.filter(c=>!closure.has(c.file));
  if(!deferred.length || deferred.some(c=>c.role!=='interior'||c.kind!=='dynamic entry'||![...closure].some(file=>parsed.get(file).dynamic.includes(c.file))))throw new Error('Expected an explicitly dynamic interior boundary');
  for(const record of records.filter(c=>c.role==='exterior' && c.kind==='dynamic entry'))if(!parsed.get(startup[0].file).dynamic.includes(record.file))throw new Error('Exterior is not loaded by startup');
  const initial=chunks.filter(c=>closure.has(c.file));
  const result={files:[...closure].sort(),bytes:initial.reduce((n,c)=>n+c.bytes,0),gzipBytes:initial.reduce((n,c)=>n+c.gzipBytes,0),deferredFiles:deferred.map(c=>c.file).sort()};
  if(receipt.initialCode?.bytes!==result.bytes || receipt.initialCode?.gzipBytes!==result.gzipBytes)throw new Error('Initial-load measured totals differ');
  return result;
}
/** Recheck a public manifest's subset without losing verification of all delivered chunks. */
export function verifyInitialLoad(runtime) {
  const initial=runtime.initialLoad;
  if(!initial)return;
  const chunks=runtime.chunks??[runtime];
  if(!Array.isArray(initial.files)||new Set(initial.files).size!==initial.files.length||!initial.files.includes(runtime.file))throw new Error('Invalid initial-load manifest');
  const selected=chunks.filter(c=>initial.files.includes(c.file));
  if(selected.length!==initial.files.length || selected.reduce((n,c)=>n+c.bytes,0)!==initial.bytes || selected.reduce((n,c)=>n+c.gzipBytes,0)!==initial.gzipBytes || !same(chunks.filter(c=>!initial.files.includes(c.file)).map(c=>c.file),initial.deferredFiles??[]))throw new Error('Initial-load manifest aggregate differs');
}
