import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REVISION } from 'three/webgpu';

// The private three r186 contract src/shadows/{cache,once,threshold}.ts rely on, pinned as source snippets and their order
// in the builds `three/webgpu` and `three/tsl` resolve to (not three/src). An upgrade that moves any of them fails here
// before a cached map can bind a destroyed texture, share a light or render twice. Line numbers are deliberately not pinned.
const BUILD = Bun.resolveSync('three/webgpu', import.meta.dir), TSL_BUILD = Bun.resolveSync('three/tsl', import.meta.dir);
const SOURCE = readFileSync(BUILD, 'utf8'), CORE = readFileSync(join(dirname(BUILD), 'three.core.js'), 'utf8'), TSL = readFileSync(TSL_BUILD, 'utf8');
const VERSION = JSON.parse(readFileSync(join(dirname(BUILD), '..', 'package.json'), 'utf8')).version as string;

/** One class member, from its one-tab-indented signature to its closing brace, searched after `anchor`. */
function member(src: string, anchor: string, signature: string): string {
  const from = src.indexOf(anchor); if (from < 0) return '';
  const start = src.indexOf(`\n\t${signature}`, from); if (start < 0) return '';
  const end = src.indexOf('\n\t}\n', start); return end < 0 ? '' : src.slice(start, end);
}
/** Snippets absent from `body` or out of the given order. */
function unordered(body: string, snippets: string[]): string[] {
  const bad: string[] = []; let at = -1;
  for (const snippet of snippets) { const i = body.indexOf(snippet, at + 1); if (i < 0) bad.push(snippet); else at = i; }
  return bad;
}
const count = (src: string, s: string) => src.split(s).length - 1;
const SHADOW_NODE = 'class ShadowNode extends ShadowBaseNode {', LIGHT_NODE = 'class AnalyticLightNode extends LightingNode {', OBSERVER = 'class NodeMaterialObserver {';

function pinFailures(src: string, core: string, tsl: string): Record<string, string[]> {
  const pins: Record<string, string[]> = {
    // A shadow camera mask with no bit at layer 1 or above is swapped for the viewing camera's for the render.
    maskFallback: unordered(member(src, SHADOW_NODE, 'updateShadow( frame ) {'), [
      'const depthVersion = shadowMap.depthTexture.version;',
      'this._depthVersionCached = depthVersion;',
      'const _shadowCameraLayer = shadow.camera.layers.mask;',
      'if ( ( shadow.camera.layers.mask & 0xFFFFFFFE ) === 0 ) {',
      'shadow.camera.layers.mask = camera.layers.mask;',
      'scene.overrideMaterial = this.getShadowMaterial();',
      'this.renderShadow( frame );',
      'shadow.camera.layers.mask = _shadowCameraLayer;',
    ]),
    // Never during pre-compile; once per (camera, frameId) while armed; the flag clears only when the depth version held.
    updateBefore: [
      ...unordered(member(src, SHADOW_NODE, 'updateBefore( frame ) {'), [
        'if ( frame.renderer._isPreCompiling === true ) return;',
        'let needsUpdate = shadow.needsUpdate || shadow.autoUpdate;',
        'if ( needsUpdate ) {',
        'if ( this._cameraFrameId.get( frame.camera ) === frame.frameId ) {',
        'needsUpdate = false;',
        'this._cameraFrameId.set( frame.camera, frame.frameId );',
        'this.updateShadow( frame );',
        'if ( this.shadowMap.depthTexture.version === this._depthVersionCached ) {',
        'shadow.needsUpdate = false;',
      ]),
      ...(count(member(src, SHADOW_NODE, 'updateBefore( frame ) {'), 'needsUpdate = ') === 3 ? [] : ['another needsUpdate write']),
    ],
    // Each render projects with the node's own shadow and light (the placeholder) and names the pass after it.
    renderShadow: unordered(member(src, SHADOW_NODE, 'renderShadow( frame ) {'), [
      'const { shadow, shadowMap, light } = this;',
      'shadow.updateMatrices( light );',
      'shadowMap.setSize( shadow.mapSize.width, shadow.mapSize.height, shadowMap.depth );',
      "scene.name = `Shadow Map [ ${ light.name || 'ID: ' + light.id } ]`;",
      'renderer.render( scene, shadow.camera );',
    ]),
    // shadow(light, S) samples S through its own node; dispose frees the node's map and the per-light material.
    shadowNode: [
      ...unordered(src, ['this.shadow = shadow || light.shadow;', 'const shadow = ( light, shadow ) => new ShadowNode( light, shadow );']),
      ...unordered(member(src, SHADOW_NODE, 'setupShadow( builder ) {'), ['shadow.camera.coordinateSystem = camera.coordinateSystem;', 'shadow.camera.updateProjectionMatrix();', 'this.shadow.map = shadowMap;']),
      ...unordered(member(src, SHADOW_NODE, '_reset() {'), ['this.disposeShadowMaterial();', 'this.shadowMap.dispose();', 'this.shadowMap = null;']),
      ...unordered(src, ['const _getShadowMaterial = ( light ) => {', 'let material = _shadowMaterialLib.get( light );']),
      ...unordered(src, ['if ( object.castShadow === true || ( object.receiveShadow && shadowType === VSMShadowMap ) ) {']),
    ],
    // light.shadow.shadowNode is read once per light node (its only reader); castShadow off disposes the node it built.
    customShadowNode: [
      ...unordered(member(src, LIGHT_NODE, 'setupShadow( builder ) {'), [
        'let shadowColorNode = this.shadowColorNode;',
        'if ( shadowColorNode === null ) {',
        'const customShadowNode = this.light.shadow.shadowNode;',
        'if ( customShadowNode !== undefined ) {',
        'shadowNode = nodeObject( customShadowNode );',
        'this.shadowColorNode = shadowColorNode = this.colorNode.mul( shadowNode );',
      ]),
      ...unordered(member(src, LIGHT_NODE, 'setup( builder ) {'), ['if ( this.light.castShadow ) {', '} else if ( this.shadowNode !== null ) {', 'this.shadowNode.dispose();']),
      ...(count(src, 'shadow.shadowNode') === 1 ? [] : ['another shadowNode reader']),
    ],
    // Receivers rebind on a shadow map resize only through the scene light's mapSize (the kit's sentinel).
    observerSentinel: [
      ...unordered(member(src, OBSERVER, 'getLightsData( materialLights, lights ) {'), [
        'if ( light.castShadow === true && light.shadow !== undefined ) {',
        'data.shadowMapWidth = light.shadow.mapSize.width;',
        'data.shadowMapHeight = light.shadow.mapSize.height;',
      ]),
      ...unordered(member(src, OBSERVER, 'equals( renderObject, lightsData, renderId ) {'), ['lightData.shadowMapWidth !== currentLightData.shadowMapWidth || lightData.shadowMapHeight !== currentLightData.shadowMapHeight']),
      ...unordered(src, ['this.getLightsData( lightsNode.getBuiltinLights(), cached.lightsData );']),
    ],
    // A casting light's shadow matrix is whatever its last shadow render left (a cached map keeps its own frame).
    shadowMatrix: unordered(src.slice(src.indexOf('function lightShadowMatrix( light ) {')), [
      'if ( light.castShadow !== true || frame.renderer.shadowMap.enabled === false ) {',
      'light.shadow.updateMatrices( light );',
      'return light.shadow.matrix;',
    ]),
    // Visibility is inherited, layers are tested per object, children are always visited.
    projectObject: unordered(member(src, 'class Renderer {', '_projectObject( object, camera, groupOrder, renderList, clippingContext ) {'), [
      'if ( object.visible === false ) return;',
      'const visible = object.layers.test( camera.layers );',
      'const children = object.children;',
      'this._projectObject( children[ i ], camera, groupOrder, renderList, clippingContext );',
    ]),
    // Clones get their own camera (and mask); matrices come from the light's and target's world matrices, and the
    // projection is not recomputed there, so synced extents need updateProjectionMatrix.
    lightShadow: [
      ...unordered(member(core, 'class LightShadow {', 'copy( source ) {'), ['this.camera = source.camera.clone();', 'this.mapSize.copy( source.mapSize );']),
      ...unordered(member(core, 'class LightShadow {', 'clone() {'), ['return new this.constructor().copy( this );']),
      ...unordered(member(core, 'class LightShadow {', 'updateMatrices( light ) {'), ['_lightPositionWorld.setFromMatrixPosition( light.matrixWorld );', '_lookTarget.setFromMatrixPosition( light.target.matrixWorld );', 'shadowCamera.updateMatrixWorld();']),
      ...(member(core, 'class LightShadow {', 'updateMatrices( light ) {').includes('updateProjectionMatrix') ? ['updateMatrices recomputes the projection'] : []),
    ],
    layers: unordered(core.slice(core.indexOf('class Layers {')), ['this.mask |= 1 << layer | 0;', 'return ( this.mask & layers.mask ) !== 0;']),
    tsl: unordered(tsl, ['const min = TSL.min;', 'const shadow = TSL.shadow;']),
  };
  return pins;
}
const clean = (pins: Record<string, string[]>) => Object.fromEntries(Object.entries(pins).filter(([, bad]) => bad.length));

describe('three r186 contract for the cached sun shadow, once-per-frame and threshold', () => {
  test('the builds three/webgpu and three/tsl resolve to are 0.186.0', () => {
    expect(BUILD.replaceAll('\\', '/')).toEndWith('three/build/three.webgpu.js');
    expect(TSL_BUILD.replaceAll('\\', '/')).toEndWith('three/build/three.tsl.js');
    expect(VERSION).toBe('0.186.0'); expect(REVISION).toBe('186');
  });
  test('every pinned snippet is present and in order', () => {
    expect(clean(pinFailures(SOURCE, CORE, TSL))).toEqual({});
  });
  test('the pins notice a dropped mask fallback, pre-compile guard, frame dedupe, sentinel, second reader or projection change', () => {
    const fails = (src: string, core = CORE) => Object.keys(clean(pinFailures(src, core, TSL)));
    expect(fails(SOURCE.replace('if ( ( shadow.camera.layers.mask & 0xFFFFFFFE ) === 0 ) {', 'if ( shadow.camera.layers.mask === 0 ) {'))).toEqual(['maskFallback']);
    expect(fails(SOURCE.replace('if ( frame.renderer._isPreCompiling === true ) return;', ''))).toEqual(['updateBefore']);
    expect(fails(SOURCE.replace('if ( this._cameraFrameId.get( frame.camera ) === frame.frameId ) {', 'if ( false ) {'))).toEqual(['updateBefore']);
    const before = member(SOURCE, SHADOW_NODE, 'updateBefore( frame ) {');
    expect(fails(SOURCE.replace(before, before.replace('this.updateShadow( frame );', 'this.updateShadow( frame ); shadow.needsUpdate = false;')))).toEqual(['updateBefore']);
    expect(fails(SOURCE.replace('data.shadowMapWidth = light.shadow.mapSize.width;', 'data.shadowMapWidth = light.shadow.map?.width;'))).toEqual(['observerSentinel']);
    expect(fails(SOURCE.replace('class Renderer {', 'class Renderer {\n\tx( l ) { return l.shadow.shadowNode; }'))).toEqual(['customShadowNode']);
    const update = member(CORE, 'class LightShadow {', 'updateMatrices( light ) {');
    expect(fails(SOURCE, CORE.replace(update, update.replace('shadowCamera.updateMatrixWorld();', 'shadowCamera.updateProjectionMatrix(); shadowCamera.updateMatrixWorld();')))).toEqual(['lightShadow']);
  });
});
