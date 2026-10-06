import { expect, test } from 'bun:test';
import { assertControlBackend, assertPanelObservation, assertPositionMotion, movingFreightKinds, freightScanPlan, visibleFreightKinds, assertFreightScanCamera, assertReadableControlText, collectReadableControlText } from './scene-controls-proof.mjs';

test('rendered control proof rejects damaged visible text and accessibility labels while retaining legitimate international copy',()=>{
 const good={text:'Troy · Loading... café 日本語',labels:[{attribute:'aria-label',value:'± m² Ελληνικά'}]};const before=JSON.stringify(good);expect(()=>assertReadableControlText(good,'troy/webgpu')).not.toThrow();expect(JSON.stringify(good)).toBe(before);
 for(const damaged of [
  {...good,text:'Loading \u00e2\u20ac\u00a6'},
  {...good,labels:[{attribute:'aria-label',value:'caf\u00c3\u00a9'}]},
  {...good,labels:[{attribute:'title',value:'\ufffd'}]},
 ])expect(()=>assertReadableControlText(damaged,'troy/webgl2')).toThrow(/troy\/webgl2.*(?:text|aria-label|title)/);
 for(const missing of [null,{labels:[]},{text:'Ready'},{text:'Ready',labels:[{attribute:'title'}]}])expect(()=>assertReadableControlText(missing)).toThrow();
});
test('serialized rendered-text collection reads only visible labels without changing document or observer state',()=>{
 const checks:unknown[]=[];const element=(attributes:Record<string,string>,visible=true)=>({tagName:'BUTTON',id:'more',checkVisibility:(options:unknown)=>{checks.push(options);return visible;},getAttribute:(name:string)=>attributes[name]??null});
 const visible=element({'aria-label':'More controls',title:'café'}),hidden=element({'aria-label':'hidden \ufffd'},false);
 const scope:any={document:{body:{innerText:'Farm · Ready'},querySelectorAll:()=>[visible,hidden]}};const prior=scope.document.body.innerText;
 const serialized=new Function(`return (${collectReadableControlText.toString()})`)();const result=serialized(scope);
 expect(result).toEqual({text:'Farm · Ready',labels:[{element:'button#more',attribute:'aria-label',value:'More controls'},{element:'button#more',attribute:'title',value:'café'}]});expect(scope.document.body.innerText).toBe(prior);expect(()=>assertReadableControlText(result)).not.toThrow();
 expect(checks).toEqual([{visibilityProperty:true,opacityProperty:true},{visibilityProperty:true,opacityProperty:true}]);
});

test('movement evidence requires finite positions of the same observed subject and meaningful horizontal travel', () => {
  const before = { subject: 'farmer-yard-0', position: [0, 1, 0] };
  expect(() => assertPositionMotion(before, { ...before, position: [0.3, 1, 0] })).not.toThrow();
  for (const after of [before, null, { ...before, position: [0, 2, 0] }, { ...before, position: [NaN, 1, 0] }, { subject: 'camera', position: [3, 1, 0] }]) {
    expect(() => assertPositionMotion(before, after)).toThrow();
  }
});

test('panel evidence rejects clipped, obscured, unscrollable-overflow and missing observations', () => {
  const panel = { rect: { left: 12, top: 70, right: 372, bottom: 600 }, root: { left: 0, top: 0, right: 390, bottom: 650 }, hitWithin: true, scrollHeight: 800, clientHeight: 530, scrollBefore: 0, scrollAfter: 80 };
  expect(() => assertPanelObservation(panel)).not.toThrow();
  for (const value of [null, { ...panel, hitWithin: false }, { ...panel, scrollAfter: 0 }, { ...panel, rect: { ...panel.rect, right: 420 } }, { ...panel, clientHeight: NaN }]) {
    expect(() => assertPanelObservation(value)).toThrow();
  }
});

test('control qualification needs headed actual backend and the bound renderer hardware, not a separate adapter probe', () => {
  const observed = { backend: 'webgpu', gpu: { status: 'bound', adapter: { description: 'NVIDIA RTX' }, errors: [] } };
  expect(() => assertControlBackend('webgpu', observed, true)).not.toThrow();
  for (const value of [null, { ...observed, backend: 'webgl2' }, { ...observed, gpu: { status: 'unbound', adapter: observed.gpu.adapter, errors: [] } }, { ...observed, gpu: { ...observed.gpu, adapter: { description: 'SwiftShader' } } }, { ...observed, gpu: { ...observed.gpu, adapter: {} } }]) {
    expect(() => assertControlBackend('webgpu', value, true)).toThrow();
  }
  expect(() => assertControlBackend('webgpu', observed, false)).toThrow();
  expect(() => assertControlBackend('webgl2', { backend: 'webgl2', glRenderer: 'ANGLE (NVIDIA)' }, true)).not.toThrow();
  expect(() => assertControlBackend('webgl2', { backend: 'webgl2', glRenderer: 'llvmpipe' }, true)).toThrow();
});

test('freight proof distinguishes advancing tractor and trailer buffers from static or unrelated traffic', () => {
  const row = (name: string, x: number) => ({ name, positions: [[x, 0, 1, 0]] });
  const before = [row('traffic-truck-tractor-lod0', 1), row('traffic-trailer-dryvan-lod0', 2), row('traffic-sedan-lod0', 3)];
  const after = [row('traffic-truck-tractor-lod0', 2), row('traffic-trailer-dryvan-lod0', 3), row('traffic-sedan-lod0', 4)];
  expect(movingFreightKinds(before, after)).toEqual(['tractor', 'trailer']);
  expect(movingFreightKinds(before, before)).toEqual([]);
  expect(movingFreightKinds(before, [after[0]])).toEqual(['tractor']);
  expect(movingFreightKinds(before, [row('traffic-trailer-dryvan-lod1', 3)])).toEqual([]);
  expect(movingFreightKinds(before, [row('traffic-truck-tractor-lod0', NaN)])).toEqual([]);
});

const splitCamera = { subject: 'camera', position: [-3917.012466228799, 142.57870284779813, 0], fov: 50,
  forward: [0.9974949866040544, -0.0707372016677029, 0] };

test('public freight sweep covers the sealed road with overlapping views and scales real gestures with canvas height', () => {
  const plan = freightScanPlan({ width: 390, height: 791 }, splitCamera);
  expect(plan.rotatePixels).toBeCloseTo(791 / 4, 8);
  expect(plan.rotateYPixels).toBeCloseTo(791 / 100, 8);
  expect(plan.panWestPixels).toBeCloseTo(-1003.848136120502, 8);
  expect(plan.wheelDelta).toBeCloseTo(-2168.7011295566035, 8);
  expect(plan.startPosition[0]).toBe(-4200);
  // The road sweep passes narrow 70m grounded front fins; six metres of clearance
  // must not change the camera on intermediate pointermove frames.
  expect(plan.startPosition[1]).toBeGreaterThan(76);
  expect(plan.startPosition[1]).toBeCloseTo(35 + 500 * Math.cos(1.5 - Math.PI / 50), 8);
  expect(plan.startPosition[2]).toBeCloseTo(-500 * Math.sin(1.5 - Math.PI / 50), 8);
  expect(plan.maxPositions).toBe(55);
  expect(plan.startPosition[0] + (plan.maxPositions - 1) * plan.stepMetres).toBeGreaterThanOrEqual(4300);
  // Projected road width is wider than the stride, so the fixed camera sweep has no gaps.
  expect(plan.stepMetres).toBeLessThan(2 * 500 * Math.tan(25 * Math.PI / 180) * 390 / 791);
  const resized = freightScanPlan({ width: 780, height: 1582 }, splitCamera);
  expect(resized.rotatePixels).toBe(plan.rotatePixels * 2);
  expect(resized.rotateYPixels).toBe(plan.rotateYPixels * 2);
  expect(resized.panWestPixels).toBe(plan.panWestPixels * 2);
  expect(resized.scanPanPixels).toBe(plan.scanPanPixels * 2);
  expect(resized.wheelDelta).toBe(plan.wheelDelta);
  for (const [canvas, camera] of [
    [{ width: 0, height: 791 }, splitCamera], [{ width: 390, height: NaN }, splitCamera],
    [{ width: 100, height: 791 }, splitCamera], [{ width: 390, height: 791 }, { ...splitCamera, fov: 40 }],
    [{ width: 390, height: 791 }, { ...splitCamera, position: [-4460, 45, -250] }],
    [{ width: 390, height: 791 }, { ...splitCamera, forward: [-1, 0, 0] }],
  ]) expect(() => freightScanPlan(canvas, camera)).toThrow();
});

test('freight scan needs both finite visible kinds and camera readback matching the requested corridor step', () => {
  const row = (name: string, positions: number[][]) => ({ name, positions });
  const tractor = row('traffic-truck-tractor-lod2', [[0, 1, 2, 0]]);
  const trailer = row('traffic-trailer-dryvan-lod2', [[2, 1, 2, 0]]);
  expect(visibleFreightKinds([tractor, trailer])).toEqual(['tractor', 'trailer']);
  expect(visibleFreightKinds([tractor, tractor])).toEqual(['tractor']);
  expect(visibleFreightKinds([row('traffic-sedan-lod0', [[1, 2, 3, 0]]), row('traffic-trailer-tanker-lod1', [[NaN, 0, 0, 0]])])).toEqual([]);
  const plan = freightScanPlan({ width: 390, height: 791 }, splitCamera);
  const observed = { subject: 'camera', position: [...plan.startPosition], forward: [0, -Math.cos(1.5 - Math.PI / 50), Math.sin(1.5 - Math.PI / 50)], fov: 50 };
  expect(() => assertFreightScanCamera(observed, plan, 0)).not.toThrow();
  expect(() => assertFreightScanCamera({ ...observed, position: [observed.position[0] + plan.stepMetres, ...observed.position.slice(1)] }, plan, 1)).not.toThrow();
  expect(() => assertFreightScanCamera(observed, plan, 1)).toThrow();
  expect(() => assertFreightScanCamera({ ...observed, forward: [1, 0, 0] }, plan, 0)).toThrow();
});
