export interface DevParamDef { kind: 'string' | 'number' | 'boolean' | 'enum'; values?: readonly string[] }
export type DevParamValues<D extends Record<string,DevParamDef>> = { [K in keyof D]: D[K]['kind'] extends 'number' ? number : D[K]['kind'] extends 'boolean' ? boolean : string };
/** Pure parser kept separate from the compile-time public-build gate. */
export function parseDevParams<D extends Record<string,DevParamDef>>(defs:D,search:string):Partial<DevParamValues<D>> {
  const params=new URLSearchParams(search),result:Record<string,unknown>={};
  for(const [key,def]of Object.entries(defs)){const value=params.get(key);if(value===null)continue;
    if(def.kind==='number'){if(value.trim()&&Number.isFinite(Number(value)))result[key]=Number(value);}
    else if(def.kind==='boolean'){if(value==='1'||value==='true')result[key]=true;else if(value==='0'||value==='false')result[key]=false;}
    else if(def.kind==='enum'){if(def.values?.includes(value))result[key]=value;}
    else result[key]=value;
  }return result as Partial<DevParamValues<D>>;
}
