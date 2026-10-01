import {expect,test} from 'bun:test';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three/webgpu';
import type {LoadedPack,PackReader} from '@kiln-scenes/scene-kit';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {campusStartupModel,loadInteriorModels} from '../../src/campus/loading';
function fixture(){
 const disposed:string[]=[];
 const model=(id:string)=>{const scene=new Group(),g=new BoxGeometry(),m=new MeshStandardMaterial();g.addEventListener('dispose',()=>disposed.push(id));scene.add(new Mesh(g,m));return {scene,scenes:[scene]} as unknown as GLTF;};
 const models=[{id:'head',path:'models/structures/head.glb'},...Array.from({length:6},(_,i)=>({id:`inside-${i}`,path:`models/inside-${i}.glb`}))];
 const pack={manifest:{models},models:new Map([['head',model('head')]])} as unknown as LoadedPack;
 return {pack,model,disposed};
}
test('entry attaches the complete verified interior and exit releases only its owned models once',async()=>{
 const {pack,model,disposed}=fixture(),requests:string[]=[];
 const reader={loadGlb:async(path:string)=>{requests.push(path);return model(path);}} as PackReader;
 expect(pack.manifest.models.filter(campusStartupModel).map(m=>m.id)).toEqual(['head']);
 const release=await loadInteriorModels(pack,reader,new AbortController().signal);
 expect(pack.models.size).toBe(7);expect(requests).toHaveLength(6);expect(requests.every(p=>!p.includes('/structures/'))).toBe(true);
 release();release();expect([...pack.models.keys()]).toEqual(['head']);expect(disposed).toHaveLength(6);expect(disposed).not.toContain('head');
});
test('cancel during parallel entry releases completed parses and exposes no partial interior',async()=>{
 const {pack,model,disposed}=fixture(),controller=new AbortController();let started=0;
 const reader={loadGlb:async(path:string)=>{started++;await Promise.resolve();controller.abort(new Error('left during load'));return model(path);}} as PackReader;
 await expect(loadInteriorModels(pack,reader,controller.signal)).rejects.toThrow('left during load');
 expect(started).toBe(4);expect(disposed).toHaveLength(4);expect([...pack.models.keys()]).toEqual(['head']);
});
