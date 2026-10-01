import { expect, test } from 'bun:test';
import { defineDevParams, readDevParams, FrameTimeRecorder } from '../../src/testing/core';
import { parseDevParams } from '../../src/testing/params';
test('U-27: valid typed params only; public ignores all flags',()=>{
 const defs=defineDevParams({n:{kind:'number'},b:{kind:'boolean'},s:{kind:'string'},e:{kind:'enum',values:['one','two']}} as const);
 expect(parseDevParams(defs,'?n=3&b=1&s=hello&e=one&unknown=1')).toEqual({n:3,b:true,s:'hello',e:'one'});
 expect(parseDevParams(defs,'?n=NaN&b=maybe&e=three')).toEqual({});
 expect(readDevParams(defs,'?n=3')).toEqual({});
});
test('recorder disabled by default and deterministic enabled summaries',()=>{
 const r=new FrameTimeRecorder(4); r.push(10);expect(r.values()).toEqual([]);
 r.enabled=true;[10,20,30,40,50].forEach(x=>r.push(x));expect(r.values()).toEqual([20,30,40,50]);expect(r.summary()).toEqual({frames:4,medianMs:35,p95Ms:50,p99Ms:50});
});
