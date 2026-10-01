import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three/webgpu';
import { DisposeRegistry, disposeObject3D, createSceneClock, advanceSceneClock, createSystemLoop, shouldPauseScene } from '../../src/lifecycle/core';
import { SceneError, createReadyGate } from '../../src/contract/core';
import { createTimeNode } from '../../src/lifecycle/time';

describe('contract and lifecycle cores', () => {
  test('an offscreen scene can produce its ready frame before visibility suspends rendering', () => {
    expect(shouldPauseScene({ outside: true, ready: false, documentHidden: false, pageHidden: false })).toBe(false);
    expect(shouldPauseScene({ outside: true, ready: true, documentHidden: false, pageHidden: false })).toBe(true);
    expect(shouldPauseScene({ outside: false, ready: true, documentHidden: false, pageHidden: false })).toBe(false);
    expect(shouldPauseScene({ outside: false, ready: false, documentHidden: true, pageHidden: false })).toBe(true);
    expect(shouldPauseScene({ outside: false, ready: true, documentHidden: false, pageHidden: true })).toBe(true);
  });
  test('U-26: render-group time uniforms wrap the chosen clock and observe explicit setTime', () => {
    const clock=createSceneClock();clock.time=21;clock.ambient=7;
    const node=createTimeNode(clock,'time',10),ambient=createTimeNode(clock,'ambient',5);
    node.update({} as any);ambient.update({} as any);expect(node.value).toBe(1);expect(ambient.value).toBe(2);
    clock.time=38;node.update({} as any);expect(node.value).toBe(8);expect(node.updateType).toBe('render');
  });
  test('registry is terminal, idempotent, deduplicated, and continues after cleanup failure', () => {
    const registry = new DisposeRegistry(); const calls: string[] = [];
    const shared = { dispose() { calls.push('shared'); } };
    registry.add(shared); registry.add(shared);
    registry.add(() => { calls.push('bad'); throw new Error('expected cleanup fixture'); });
    registry.disposeAll(); registry.disposeAll();
    registry.add(() => calls.push('late'));
    expect(calls).toEqual(['bad', 'shared', 'late']); expect(registry.size).toBe(0); expect(registry.errors).toHaveLength(1);
  });
  test('shared geometry/material/texture disposed once and exclusions preserved', () => {
    const root = new Group(); const g = new BoxGeometry(), t = new Texture(), m = new MeshStandardMaterial({ map: t });
    const counts = [0, 0, 0]; [g,m,t].forEach((x,i) => x.addEventListener('dispose', () => counts[i]++));
    root.add(new Mesh(g,m), new Mesh(g,m));
    disposeObject3D(root, { skipShared: new Set([t]) }); expect(counts).toEqual([1,1,0]);
  });
  test('U-26: scale, clamp, ambient freeze and paused clock', () => {
    const c = createSceneClock(); c.timeScale = 2;
    advanceSceneClock(c, .5, { paused: false, reduced: false }); expect(c.time).toBe(.2); expect(c.ambient).toBe(.2); expect(c.delta).toBe(.2);
    advanceSceneClock(c, .05, { paused: false, reduced: true }); expect(c.time).toBeCloseTo(.3); expect(c.ambient).toBe(.2);
    advanceSceneClock(c, 1, { paused: true, reduced: false }); expect(c.frame).toBe(2); expect(c.delta).toBe(0);
    c.timeScale = 0; advanceSceneClock(c, .05, { paused: false, reduced: false }); expect(c.time).toBeCloseTo(.3);
  });
  test('ordered systems get unscaled capped dt, errors stop the loop', () => {
    const c = createSceneClock(), seen: string[] = [], errors: unknown[] = [];
    const loop = createSystemLoop(c, errors.push.bind(errors));
    loop.add('later', 500, (dt) => seen.push('later:' + dt)); loop.add('input',100,()=>seen.push('input'));
    c.timeScale = 0; loop.step(.5, {} as any, false, false); expect(seen).toEqual(['input','later:0.1']); expect(c.time).toBe(0);
    loop.add('bad',200,()=>{ throw new Error('fixture'); }); loop.step(.05, {} as any,false,false); expect(errors).toHaveLength(1); expect(seen.slice(2)).toEqual(['input']);
  });
  test('ready once only after complete frame; error or dispose cancels queued callback', () => {
    let queued: (()=>void)[] = []; const callbacks: string[] = [];
    const gate = createReadyGate({ ready:()=>callbacks.push('ready'), error:e=>callbacks.push((e as SceneError).code), schedule:fn=>{ queued.push(fn); return queued.length; }, cancel:()=>{} });
    gate.frame(false); expect(queued).toHaveLength(0); gate.frame(true); gate.frame(true); expect(queued).toHaveLength(1);
    gate.fail(new SceneError('asset-hash','fixture')); queued[0](); gate.fail(new Error('again')); expect(callbacks).toEqual(['asset-hash']);
    const gate2 = createReadyGate({ ready:()=>callbacks.push('ready'), error:()=>{}, schedule:fn=>{queued.push(fn);return queued.length;}, cancel:()=>{} });
    gate2.frame(true); gate2.dispose(); queued.at(-1)!(); expect(callbacks).toEqual(['asset-hash']);
    const gate3 = createReadyGate({ ready:()=>callbacks.push('ready'), error:()=>{}, schedule:fn=>{queued.push(fn);return queued.length;}, cancel:()=>{} });
    gate3.frame(true); queued.at(-1)!(); gate3.frame(true); expect(callbacks).toEqual(['asset-hash','ready']);
  });
});
