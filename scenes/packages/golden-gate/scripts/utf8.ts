import {readFileSync} from 'node:fs';
export function decodeUtf8(bytes:Uint8Array,context:string):string{
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch(error){throw new Error(`${context}: invalid UTF-8`,{cause:error});}
}
export function readUtf8(path:string):string{return decodeUtf8(readFileSync(path),path);}
