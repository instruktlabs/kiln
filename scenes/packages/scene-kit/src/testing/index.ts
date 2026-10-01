import { useEffect } from 'react';
import { useRuntime, type SceneRuntime } from '../internal/runtime';
import { rendererProgramCounts } from './counts';
import { KIT_DEV_PARAMS, readDevParams, FrameTimeRecorder } from './core';
import type { DeviceProbe } from '../quality/core';
export * from './core';
const live=new Set<SceneRuntime>();
const context=(runtime?:SceneRuntime)=>runtime??Array.from(live).at(-1);
export function registerTestHooks(hooks:Record<string,(...args:any[])=>unknown>,runtime?:SceneRuntime):()=>void{
  if(!(import.meta.env.KILN_TEST||import.meta.env.KILN_DEV))return()=>{};
  const rt=context(runtime);if(!rt)return()=>{};Object.assign(rt.testHooks,hooks);
  return()=>{for(const [name,fn]of Object.entries(hooks))if(rt.testHooks[name]===fn)delete rt.testHooks[name];};
}
export function useRegisterTestHooks(hooks:Record<string,(...args:any[])=>unknown>):void{const rt=useRuntime();useEffect(()=>registerTestHooks(hooks,rt),[rt,hooks]);}
export function registerWorkload(name:string,fn:(phase:number)=>void,runtime?:SceneRuntime):()=>void{
  if(!(import.meta.env.KILN_TEST||import.meta.env.KILN_DEV))return()=>{};
  const rt=context(runtime);rt?.workloads.set(name,fn);return()=>{if(rt?.workloads.get(name)===fn)rt.workloads.delete(name);};
}
/**
 * B-10 hook (SPEC 18): Chrome cannot emulate GPU adapter strings, so a test or dev page may set
 * `window.__kilnProbeOverride` (a partial DeviceProbe) before mounting. The kit merges it over the measured
 * probe before classification; an `adapter` in the override replaces the measured adapter strings entirely.
 * Public builds never read it (the call site is behind the test/dev flags).
 */
export function applyProbeOverride(probe:DeviceProbe):DeviceProbe{
  if(!(import.meta.env.KILN_TEST||import.meta.env.KILN_DEV))return probe;
  const override=(window as unknown as {__kilnProbeOverride?:Partial<DeviceProbe>}).__kilnProbeOverride;
  if(!override||typeof override!=='object')return probe;
  return {...probe,...override,adapter:override.adapter?{vendor:'',architecture:'',device:'',description:'',...(override.adapter as Partial<NonNullable<DeviceProbe['adapter']>>)}:probe.adapter};
}
export function installTestHooks(runtime:SceneRuntime) {
  if(!(import.meta.env.KILN_TEST||import.meta.env.KILN_DEV))return()=>{};
  live.add(runtime);const recorder=new FrameTimeRecorder(),cpuRecorder=new FrameTimeRecorder(),events:unknown[]=[];let waitSerial=0;
  const pending=new Set<(error:Error)=>void>();let observer:PerformanceObserver|null=null;
  const measurement=(on:boolean)=>{
    recorder.enabled=cpuRecorder.enabled=on;runtime.data.set('measure',on);
    if(on){recorder.clear();cpuRecorder.clear();runtime.data.set('longTasks',0);
      if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask')){
        observer?.disconnect();observer=new PerformanceObserver(list=>runtime.data.set('longTasks',Number(runtime.data.get('longTasks')??0)+list.getEntries().length));observer.observe({type:'longtask'});
      }
    }else{observer?.disconnect();observer=null;}
  };
  runtime.data.set('cpuRecorder',cpuRecorder);
  runtime.data.set('recorder',recorder);runtime.data.set('events',events);
  runtime.devParams=readDevParams(KIT_DEV_PARAMS);
  if(typeof runtime.devParams.time==='number'){runtime.clock.time=runtime.clock.ambient=runtime.devParams.time;runtime.clock.timeScale=0;}
  if(runtime.devParams.freeze)runtime.clock.timeScale=0;
  if((window as unknown as {__kilnMeasureRequested?:boolean}).__kilnMeasureRequested){runtime.data.set('startupAt',performance.now());measurement(true);}
  const api={
    whenReady:()=>runtime.ready?Promise.resolve():new Promise<void>((accept,reject)=>{
      if(runtime.failed||runtime.disposed){reject(new Error('Scene did not become ready'));return;}
      const stop=runtime.subscribe(()=>{if(runtime.ready){stop();pending.delete(fail);accept();}else if(runtime.failed||runtime.disposed)fail(new Error('Scene did not become ready'));});
      const fail=(error:Error)=>{stop();pending.delete(fail);reject(error);};pending.add(fail);
    }),
    waitFrames:(n:number)=>new Promise<void>((accept,reject)=>{
      if(runtime.disposed){reject(new Error('Scene disposed'));return;}if(n<=0){accept();return;}
      const target=runtime.clock.frame+n;const stop=runtime.systems.add('wait-'+(++waitSerial),10000,()=>{if(runtime.clock.frame>=target){stop();pending.delete(fail);accept();}});
      const fail=(error:Error)=>{stop();pending.delete(fail);reject(error);};pending.add(fail);
    }),
    stats:()=>{const info=runtime.renderer?.info;return{frame:info?.frame??0,render:info?{calls:info.render.calls,frame:info.frame,drawCalls:info.render.drawCalls,triangles:info.render.triangles}:null,memory:info?{...info.memory}:null,...rendererProgramCounts(runtime.renderer as any),resources:runtime.registry.size,cpuRenderMedianMs:cpuRecorder.values().length?cpuRecorder.summary().medianMs:null,longTasks:runtime.data.get('longTasks')??null,readyMs:runtime.data.get('readyMs')??null,...Object.fromEntries(Object.entries(runtime.testHooks).filter(([name])=>name==='counts').map(([name,fn])=>[name,fn()]))};},
    frameTimes:()=>recorder.values(),cpuRenderTimes:()=>cpuRecorder.values(),recordFrames:measurement,beginMeasurement:()=>measurement(true),
    feedFrameTimes:(trace:number[])=>{runtime.data.set('syntheticGovernor',true);const changes=[];for(const dt of trace){const result=runtime.quality?.step(dt,{paused:false,hidden:false});if(result)changes.push(result);}return changes;},
    tierState:()=>runtime.quality?{tier:runtime.quality.tier,level:runtime.quality.level,live:{...runtime.quality.live},device:runtime.quality.device,knobs:runtime.quality.knobs,probe:runtime.data.get('probe')??null,locked:runtime.quality.governor.locked}:null,
    motionPolicy:()=>({...runtime.motion,paused:runtime.paused,time:runtime.clock.time,ambient:runtime.clock.ambient}),
    setTime:(time:number)=>{runtime.clock.time=runtime.clock.ambient=time;},
    setTimeScale:(scale:number)=>{runtime.clock.timeScale=scale;},
    setPlaying:runtime.setPlaying,
    setDpr:(dpr:number)=>runtime.state?.setDpr(dpr),
    runWorkload:(name:string)=>{runtime.data.set('workload',name);},
    events,
    invoke:(name:string,...args:unknown[])=>runtime.testHooks[name]?.(...args),
    get disposed(){return runtime.disposed;},
  };
  const proxy=new Proxy(api,{get(target,key,receiver){if(typeof key==='string'&&runtime.testHooks[key])return runtime.testHooks[key];return Reflect.get(target,key,receiver);}});
  const win=window as unknown as {__kilnScene?:typeof proxy};win.__kilnScene=proxy;
  return()=>{for(const fail of pending)fail(new Error('Scene disposed'));pending.clear();observer?.disconnect();live.delete(runtime);runtime.testHooks={};runtime.workloads.clear();recorder.clear();cpuRecorder.clear();runtime.data.delete('recorder');runtime.data.delete('cpuRecorder');if(win.__kilnScene===proxy)delete win.__kilnScene;};
}
export function fakeMatchMedia(matches:Record<string,boolean>={}) {
  const entries=new Map<string,{matches:boolean;listeners:Set<(event:{matches:boolean;media:string})=>void>}>();
  const matchMedia=(media:string)=>{let entry=entries.get(media);if(!entry){entry={matches:matches[media]??false,listeners:new Set()};entries.set(media,entry);}return{media,get matches(){return entry!.matches;},onchange:null,addEventListener:(_type:string,fn:any)=>entry!.listeners.add(fn),removeEventListener:(_type:string,fn:any)=>entry!.listeners.delete(fn),addListener:(fn:any)=>entry!.listeners.add(fn),removeListener:(fn:any)=>entry!.listeners.delete(fn),dispatchEvent:()=>true} as MediaQueryList;};
  return{matchMedia,set(media:string,value:boolean){matchMedia(media);const entry=entries.get(media)!;entry.matches=value;for(const fn of entry.listeners)fn({media,matches:value});}};
}
