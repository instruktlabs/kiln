import {parse,parseFragment} from 'parse5';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),astroRequire=createRequire(require.resolve('astro/package.json'));
const {parse:parseAstro}=await import(pathToFileURL(astroRequire.resolve('@astrojs/compiler-rs')).href);

export function decodeUtf8(bytes,context='text'){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch(error){throw new Error(`${context}: invalid UTF-8`,{cause:error});}
}
// Recognizable UTF-8 bytes saved after Latin-1/Windows-1252 decoding. Single
// accented letters are valid; these multi-character byte sequences are damaged.
export function textProblems(text){
 const problems=[];
 const continuation='[\\u0080-\\u00bf\\u20ac\\u201a\\u0192\\u201e\\u2026\\u2020\\u2021\\u02c6\\u2030\\u0160\\u2039\\u0152\\u017d\\u2018\\u2019\\u201c\\u201d\\u2022\\u2013\\u2014\\u02dc\\u2122\\u0161\\u203a\\u0153\\u017e\\u0178]';
 const pattern=new RegExp('\\ufffd|\\u00c3'+continuation+'|\\u00c2'+continuation+'|\\u00e2'+continuation+continuation+'|\\u00ef\\u00bb\\u00bf|\\u00f0(?:\\u0178|\\u009f)','gu');
 for(const match of text.matchAll(pattern)){problems.push({offset:match.index,value:match[0]});if(problems.length===100)break;}
 return problems;
}
export function inspectPublicText(bytes,name){
 const problems=[];let source;
 try{source=decodeUtf8(bytes,name);}catch(error){return [{kind:'utf8',context:name,message:error.message}];}
 const check=(text,context)=>{
  const inspect=value=>{for(const hit of textProblems(value))problems.push({kind:'mojibake',context,offset:hit.offset,value:hit.value,message:'Damaged text '+JSON.stringify(hit.value)});};inspect(text);
  if(/&(?:#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/i.test(text)){function visit(node){if(node.nodeName==='#text')inspect(node.value);for(const attr of node.attrs??[])inspect(attr.value);for(const child of node.childNodes??[])visit(child);}visit(parseFragment(text));}
 };
 const syntax=(context,error)=>problems.push({kind:'syntax',context,message:String(error.message??error)});
 check(source,'raw source');
 const javascript=(text,context,kind=ts.ScriptKind.JS)=>{
  const tree=ts.createSourceFile(context,text,ts.ScriptTarget.Latest,true,kind);
  for(const diagnostic of tree.parseDiagnostics)syntax(context,ts.flattenDiagnosticMessageText(diagnostic.messageText,' '));
  function visit(node){if(ts.isStringLiteralLike(node)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(node.kind))check(node.text,context+' literal');ts.forEachChild(node,visit);}visit(tree);
 };
 const json=(text,context)=>{try{const value=JSON.parse(text);function visit(value){if(typeof value==='string')check(value,context+' string');else if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value)){check(key,context+' key');visit(child);}}}visit(value);}catch(error){syntax(context,error);}};
 if(/\.(?:[cm]?js|jsx|ts|tsx)$/.test(name))javascript(source,name,/\.tsx$/.test(name)?ts.ScriptKind.TSX:/\.jsx$/.test(name)?ts.ScriptKind.JSX:/\.ts$/.test(name)?ts.ScriptKind.TS:ts.ScriptKind.JS);
 else if(/\.(?:json|map)$/.test(name))json(source,name);
 else if(/\.astro$/.test(name)){
  try{const result=parseAstro(source);for(const diagnostic of result.diagnostics??[])if(diagnostic.severity===1||diagnostic.severity==='error')syntax(name,diagnostic.message??diagnostic.text??'Astro parse error');function visit(node){if(!node||typeof node!=='object')return;if((node.type==='Literal'||node.type==='JSXText')&&typeof node.value==='string')check(node.value,name+' '+node.type);if(node.type==='TemplateElement'&&typeof node.value?.cooked==='string')check(node.value.cooked,name+' template');for(const value of Object.values(node)){if(Array.isArray(value))for(const child of value)visit(child);else if(value&&typeof value==='object')visit(value);}}visit(result.ast);}catch(error){syntax(name,error);}
 }
 else if(/\.(?:html|svg|xml)$/.test(name)){
  const document=parse(source);function visit(node){if(node.nodeName==='#text')check(node.value,'HTML text');for(const attr of node.attrs??[]){check(attr.value,'HTML '+attr.name);if(/^on/.test(attr.name))javascript(attr.value,name+' '+attr.name);}if(node.tagName==='script'){const text=(node.childNodes??[]).map(child=>child.value??'').join(''),type=node.attrs?.find(attr=>attr.name==='type')?.value??'';if(['application/json','application/ld+json','importmap'].includes(type))json(text,name+' script');else if(!type||type==='module'||/javascript|typescript/.test(type))javascript(text,name+' script',ts.ScriptKind.TS);}else for(const child of node.childNodes??[])visit(child);if(node.content)visit(node.content);}visit(document);
 }
 return problems;
}
