import {expect,test} from 'bun:test';
import {createTroySceneSession} from '../src/components/troy-scene-session';

function fixture(){
 const states:string[]=[],progress:string[]=[],frames:any[]=[],listeners=new Set<(e:any)=>void>();let release:()=>void=()=>{};
 const session=createTroySceneSession({origin:'https://review.test',createFrame:()=>{const frame={src:'',removed:false,remove(){this.removed=true;},contentWindow:{troy:{ready:true,dispose:()=>new Promise<void>(r=>{release=r;}),stats:()=>({poseTextures:{references:0},lifecycle:{registered:2,completed:2}})},focus(){}}};frames.push(frame);return frame as any;},mount:()=>{},subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},onState:s=>states.push(s),onProgress:text=>progress.push(text),onExit:()=>{},clock:{set:()=>1,clear:()=>{}}});
 return{session,states,progress,frames,listeners,release:()=>release(),message(source:any,origin='https://review.test',state='ready'){for(const listener of listeners)listener({origin,source,data:{source:'kiln-scene',state}} as any);}};
}
test('Troy review ignores foreign and obsolete frames and waits for resource teardown before removal',async()=>{
 const f=fixture();f.session.start('/scene-packs/troy/candidate/web/');const frame=f.frames[0];f.message(frame.contentWindow,'https://foreign.test');f.message({});expect(f.states).toEqual(['loading']);f.message(frame.contentWindow);expect(f.states.at(-1)).toBe('ready');
 const closed=f.session.stop();expect(frame.removed).toBe(false);expect(f.states.at(-1)).toBe('closing');f.session.start('/scene-packs/troy/other/web/');expect(f.frames.length).toBe(1);f.release();await closed;expect(frame.removed).toBe(true);expect(f.listeners.size).toBe(0);expect(f.session.released()).toMatchObject({poseTextures:{references:0}});
 f.session.start('/scene-packs/troy/next/web/');f.message(frame.contentWindow);expect(f.states.at(-1)).toBe('loading');const closedAgain=f.session.stop();f.release();await closedAgain;
});
test('Troy review only admits its same-origin staged entry',()=>{
 const f=fixture();expect(()=>f.session.start('https://foreign.test/scene-packs/troy/a/web/')).toThrow();expect(()=>f.session.start('/unrelated/')).toThrow();expect(f.frames.length).toBe(0);
});

test('Troy progress fallback displays readable loading text',()=>{
 const f=fixture();f.session.start('/scene-packs/troy/candidate/web/');f.message(f.frames[0].contentWindow,'https://review.test','progress');expect(f.progress).toEqual(['Loading the scene...']);
});
